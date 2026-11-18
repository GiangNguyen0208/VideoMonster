"""requirements_brief helpers: hash, approval, and spec traceability.

Pure functions, no IO. The brief is written by the agent for every request;
the user approves it (picking improvements) before the spec exists, and
`traceability_errors` makes the spec prove it answers exactly that brief.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

import jsonschema

from schemas.artifacts import load_schema

DURATION_TOLERANCE = 0.15


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text).lower()
    return " ".join(re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE).split())


def brief_hash(brief: dict[str, Any]) -> str:
    """sha256 of everything except the approval block."""
    body = {k: v for k, v in brief.items() if k != "approval"}
    blob = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def schema_errors(brief: dict[str, Any]) -> list[str]:
    validator = jsonschema.Draft202012Validator(load_schema("requirements_brief"))
    return [
        f"{'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}"
        for e in sorted(validator.iter_errors(brief), key=lambda e: list(e.absolute_path))
    ]


def _input_lint(brief: dict[str, Any]) -> list[str]:
    errs: list[str] = []
    inputs = brief.get("inputs", [])
    ids = [i["id"] for i in inputs]
    qids = {q["id"] for q in brief.get("open_questions", [])}
    for iid in ids:
        if iid in qids:
            errs.append(f"input id {iid} is also an open question id")
    binds = [i["binds"] for i in inputs if i.get("binds")]
    if len(set(binds)) != len(binds):
        errs.append("two inputs bind the same spec field")
    for i in inputs:
        if i["kind"] == "choice" and not i.get("options"):
            errs.append(f"input {i['id']}: choice needs options")
        if i["kind"] == "file" and not i.get("accept"):
            errs.append(f"input {i['id']}: file needs accept (image or audio)")
        if i["kind"] != "file" and i.get("accept"):
            errs.append(f"input {i['id']}: accept is only for file inputs")
        if i["kind"] != "choice" and i.get("options"):
            errs.append(f"input {i['id']}: options are only for choice inputs")
        if i["required"] and i.get("required_if"):
            errs.append(f"input {i['id']}: use either required or required_if, not both")
        cond = i.get("required_if")
        if cond and cond["input"] not in ids:
            errs.append(f"input {i['id']}: required_if refers to unknown input {cond['input']}")
        d = i.get("default_answer")
        if d is not None and i["kind"] == "choice" and d not in i.get("options", []):
            errs.append(f"input {i['id']}: default_answer is not one of the options")
        if d is not None and i["kind"] == "boolean" and d not in ("true", "false"):
            errs.append(f"input {i['id']}: boolean default must be 'true' or 'false'")
        if d is not None and i["kind"] == "file":
            errs.append(f"input {i['id']}: a file input cannot have a default")
    return errs


def lint(brief: dict[str, Any]) -> list[str]:
    """Checks a pending brief before it is shown to the user."""
    errs = schema_errors(brief)
    if errs:
        return errs
    for key in ("goals", "non_goals", "scenarios", "improvements", "open_questions"):
        ids = [x["id"] for x in brief.get(key, [])]
        if len(set(ids)) != len(ids):
            errs.append(f"duplicate ids in {key}")
    errs.extend(_input_lint(brief))
    if brief["improvements"] and not any(i["recommended"] for i in brief["improvements"]):
        errs.append("improvements are listed but none is marked recommended")
    return errs


def input_answer_errors(brief: dict[str, Any], answers: dict[str, str]) -> list[str]:
    """Why these answers cannot approve the brief's inputs (empty list = fine).

    Used by the CLI approval and by Studio before it records a decision.
    """
    errs: list[str] = []
    for i in brief.get("inputs", []):
        value = _effective(brief, answers, i["id"])
        cond = i.get("required_if")
        needed = i["required"] or bool(cond and _effective(brief, answers, cond["input"]) == cond["equals"])
        if not value:
            if needed:
                errs.append(f"input {i['id']} ({i['label']}) is required")
            continue
        if i["kind"] == "choice" and value not in i.get("options", []):
            errs.append(f"input {i['id']}: {value!r} is not one of {i.get('options')}")
        if i["kind"] == "boolean" and value not in ("true", "false"):
            errs.append(f"input {i['id']}: answer must be true or false")
        if i["kind"] == "file" and (value.startswith("/") or ".." in value.split("/")):
            errs.append(f"input {i['id']}: file must be a path inside the project")
    return errs


def _effective(brief: dict[str, Any], answers: dict[str, str], input_id: str) -> str:
    """The answer, or the input's default when it was left empty."""
    value = (answers.get(input_id) or "").strip()
    if value:
        return value
    return next((i.get("default_answer") or "" for i in brief.get("inputs", []) if i["id"] == input_id), "")


def approve(
    brief: dict[str, Any],
    selected_improvements: list[str],
    answers: dict[str, str] | None = None,
    *,
    now: str | None = None,
) -> dict[str, Any]:
    """Return a copy of the brief stamped approved with the user's picks."""
    errs = lint(brief)
    if errs:
        raise ValueError("; ".join(errs))
    known = {i["id"] for i in brief["improvements"]}
    unknown = [i for i in selected_improvements if i not in known]
    if unknown:
        raise ValueError(f"unknown improvement ids: {unknown}")
    qids = {q["id"] for q in brief.get("open_questions", [])}
    inputs = {i["id"]: i for i in brief.get("inputs", [])}
    given = {k: v.strip() for k, v in dict(answers or {}).items()}
    bad = [k for k in given if k not in qids and k not in inputs]
    if bad:
        raise ValueError(f"unknown question or input ids: {bad}")
    for q in brief.get("open_questions", []):
        given.setdefault(q["id"], q["default_answer"])
    errs = input_answer_errors(brief, given)
    if errs:
        raise ValueError("; ".join(errs))
    for i in inputs.values():
        if not given.get(i["id"]) and i.get("default_answer") is not None:
            given[i["id"]] = i["default_answer"]
    given = {k: v for k, v in given.items() if v != "" or k in qids}
    out = copy.deepcopy(brief)
    out["approval"] = {
        "status": "approved",
        "selected_improvements": list(dict.fromkeys(selected_improvements)),
        "answers": given,
        "approved_at": now or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "brief_hash": brief_hash(brief),
    }
    return out


def is_approved(brief: dict[str, Any]) -> bool:
    ap = brief.get("approval", {})
    return ap.get("status") == "approved" and ap.get("brief_hash") == brief_hash(brief)


def _mentions(value: Any, needle: str) -> bool:
    if isinstance(value, str):
        return value == needle
    if isinstance(value, dict):
        return any(_mentions(v, needle) for v in value.values())
    if isinstance(value, list):
        return any(_mentions(v, needle) for v in value)
    return False


def _binding_errors(spec: dict[str, Any], bound: dict[str, str]) -> list[str]:
    """The creator's answers must show up in the spec exactly where they bind."""
    errs: list[str] = []
    jobs = spec.get("jobs", [])
    tts = [j for j in jobs if j["kind"] == "tts"]
    music = [j for j in jobs if j["kind"] == "music"]

    source = bound.get("voice_source") or ("gemini" if "voice_id" in bound else "")
    if source == "gemini":
        for j in tts:
            if j["tool"] != "gemini_tts":
                errs.append(f"job {j['job_id']}: the creator chose a Gemini voice, so narration must use gemini_tts")
            elif bound.get("voice_id") and j["params"].get("voice_id") != bound["voice_id"]:
                errs.append(f"job {j['job_id']}: voice_id must be {bound['voice_id']!r} (the creator's choice)")
            elif bound.get("voice_style") and _norm(bound["voice_style"]) not in _norm(str(j["params"].get("style", ""))):
                errs.append(f"job {j['job_id']}: style must include the creator's note {bound['voice_style']!r}")
    elif source == "upload":
        want = bound.get("voice_file", "")
        for j in tts:
            if j["tool"] != "provided_audio" or j["params"].get("source_path") != want:
                errs.append(f"job {j['job_id']}: narration must be the creator's recording via provided_audio with source_path {want!r}")

    if bound.get("dialogue"):
        script = f" {_norm(' '.join(s['text'] for s in spec.get('script', {}).get('sections', [])))} "
        if f" {_norm(bound['dialogue'])} " not in script:
            errs.append("the creator's dialogue line must appear verbatim in the script")

    if bound.get("character_ref") and not _mentions(
        [j["params"] for j in jobs if j["kind"] in ("video", "image")], bound["character_ref"]
    ):
        errs.append(f"the creator's character image {bound['character_ref']!r} is not used by any visual job")

    msrc = bound.get("music_source")
    if msrc == "none" and music:
        errs.append("the creator chose no music, but the spec has a music job")
    elif msrc in ("file", "library", "upload"):
        want = bound.get("music_file", "")
        if not any(j["tool"] == "provided_music" and j["params"].get("source_path") == want for j in music):
            errs.append(f"music must be the creator's file {want!r} via provided_music")
    elif msrc == "generate" and not any(j["tool"] == "google_music" for j in music):
        errs.append("the creator asked for generated music, but the spec has no google_music job")

    if bound.get("subtitles") == "false" and spec.get("audio_plan", {}).get("burn_subtitles", True):
        errs.append("the creator turned subtitles off: audio_plan.burn_subtitles must be false")

    overlay = spec.get("brand_overlay")
    if bound.get("logo_file"):
        if not overlay or overlay.get("path") != bound["logo_file"]:
            errs.append(f"brand_overlay.path must be the creator's logo {bound['logo_file']!r}")
        elif bound.get("logo_position") and overlay.get("position", "bottom_right") != bound["logo_position"]:
            errs.append(f"brand_overlay.position must be {bound['logo_position']!r}")
    elif overlay:
        errs.append("brand_overlay is set but the creator gave no logo")
    return errs


def traceability_errors(spec: dict[str, Any], brief: dict[str, Any]) -> list[str]:
    """The spec must answer exactly the approved brief."""
    errs: list[str] = []
    if not is_approved(brief):
        return ["requirements_brief is not approved (or changed after approval)"]
    ap = brief["approval"]
    if spec.get("requirements_hash") != ap["brief_hash"]:
        errs.append("spec.requirements_hash does not match the approved requirements_brief")

    goal_ids = {g["id"] for g in brief["goals"]}
    served: set[str] = set()
    for scene in spec.get("scenes", []):
        for gid in scene.get("serves", []):
            if gid not in goal_ids:
                errs.append(f"scene {scene['id']}: serves unknown goal {gid}")
            served.add(gid)
    for gid in sorted(goal_ids - served):
        errs.append(f"goal {gid} is not served by any scene")

    if set(spec.get("applied_improvements", [])) != set(ap["selected_improvements"]):
        errs.append(
            f"applied_improvements {sorted(spec.get('applied_improvements', []))} "
            f"must equal the user's picks {sorted(ap['selected_improvements'])}"
        )

    c = brief["constraints"]
    want = c["duration_seconds"]
    if abs(spec.get("duration_seconds", 0) - want) > want * DURATION_TOLERANCE:
        errs.append(f"duration {spec.get('duration_seconds')}s is outside ±{int(DURATION_TOLERANCE * 100)}% of requested {want}s")
    if spec.get("aspect_ratio") != c["aspect_ratio"]:
        errs.append(f"aspect_ratio {spec.get('aspect_ratio')} != requested {c['aspect_ratio']}")
    bound = {i["binds"]: (ap.get("answers", {}).get(i["id"]) or "").strip()
             for i in brief.get("inputs", []) if i.get("binds")}
    want_lang = bound.get("language") or brief["language"]
    if spec.get("language") != want_lang:
        errs.append(f"language {spec.get('language')} != requested {want_lang}")
    errs.extend(_binding_errors(spec, bound))

    script = f" {_norm(' '.join(s['text'] for s in spec.get('script', {}).get('sections', [])))} "
    for phrase in c.get("must_include", []):
        if _norm(phrase) and f" {_norm(phrase)} " not in script:
            errs.append(f"script does not contain required phrase {phrase!r}")
    for phrase in c.get("avoid", []):
        if _norm(phrase) and f" {_norm(phrase)} " in script:
            errs.append(f"script contains avoided phrase {phrase!r}")

    cap = c.get("budget_cap_usd")
    est = spec.get("estimated_total_cost_usd")
    if cap is not None and est is not None:
        if cap == 0 and est > 0:
            errs.append("budget cap is 0 but the spec uses paid Gemini jobs — ask the user to raise the cap")
        elif cap > 0 and est > cap:
            errs.append(f"estimated cost ${est:.2f} exceeds budget cap ${cap:.2f}")
    return errs
