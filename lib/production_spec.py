"""Production spec helpers: canonical hash, tamper guard, and lint.

The spec is the contract between the planner (Claude) and the worker
(Gemini). Pure functions only — no filesystem, no network — so both sides and
the tests share one definition of "valid".
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import jsonschema

from schemas.artifacts import load_schema

# Tools the worker is allowed to call. Gemini-API-key family only: the worker
# never routes to another vendor, so the planner may only plan for these.
GEMINI_TOOLS: dict[str, str] = {
    "gemini_omni_video": "video",
    "google_imagen": "image",
    "gemini_tts": "tts",
    "google_music": "music",
    # Local passthroughs for files the creator brought (no model call, cost 0).
    "provided_audio": "tts",
    "provided_music": "music",
}

# Tools that copy a creator file instead of generating one.
PROVIDED_TOOLS = frozenset({"provided_audio", "provided_music"})

# Gemini image models usable with a plain API key (Imagen needs Vertex).
GEMINI_IMAGE_MODELS = {
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
    "gemini-3.1-flash-image",
    "gemini-nano-banana-2.1",
}

# Words per second for narration fit checks, by language. Conservative; used
# only to catch scripts that cannot fit their scene window.
_WPS = {"en": 2.6, "vi": 3.0}
_DEFAULT_WPS = 2.6
_FIT_SLACK = 1.35  # allow 35% over before flagging


class SpecTampered(Exception):
    """spec_hash does not match the content — the spec changed after planning."""


def canonical_hash(spec: dict[str, Any]) -> str:
    """sha256 over canonical JSON of the content the worker executes."""
    payload = {k: spec.get(k) for k in ("script", "scenes", "jobs", "audio_plan", "brand_overlay", "requirements_hash", "applied_improvements")}
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def seal(spec: dict[str, Any]) -> dict[str, Any]:
    """Stamp spec_hash. Call after validation, before saving."""
    spec["spec_hash"] = canonical_hash(spec)
    return spec


def verify_seal(spec: dict[str, Any]) -> None:
    """Raise SpecTampered unless the stored hash matches the content."""
    if spec.get("spec_hash") != canonical_hash(spec):
        raise SpecTampered("production_spec changed after it was sealed")


def schema_errors(spec: dict[str, Any]) -> list[str]:
    validator = jsonschema.Draft202012Validator(load_schema("production_spec"))
    return [
        f"{'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}"
        for e in sorted(validator.iter_errors(spec), key=lambda e: list(e.absolute_path))
    ]


def lint(
    spec: dict[str, Any],
    *,
    tool_available: set[str] | None = None,
    requirements: dict[str, Any] | None = None,
) -> list[str]:
    """Semantic checks beyond the schema. Empty list means the worker can run it.

    ``tool_available`` restricts to tools present on this machine; ``None``
    skips that check. ``requirements`` is the approved requirements_brief; when
    given, the spec must trace back to it (goals, improvements, constraints).
    """
    errs: list[str] = []
    if requirements is not None:
        from lib.requirements_brief import traceability_errors

        errs += traceability_errors(spec, requirements)
    scenes = spec.get("scenes", [])
    jobs = spec.get("jobs", [])
    sections = {s["id"]: s["text"] for s in spec.get("script", {}).get("sections", [])}
    scene_ids = {s["id"] for s in scenes}
    job_ids = [j["job_id"] for j in jobs]
    wps = _WPS.get(str(spec.get("language", "")).split("-")[0], _DEFAULT_WPS)

    if len(set(job_ids)) != len(job_ids):
        errs.append("duplicate job_id")
    if len(scene_ids) != len(scenes):
        errs.append("duplicate scene id")

    # Scenes: contiguous, ordered, sum to duration, each maps to a script section.
    cursor = 0.0
    for s in scenes:
        if abs(s["start_seconds"] - cursor) > 0.05:
            errs.append(f"scene {s['id']}: starts at {s['start_seconds']} but previous ended at {cursor}")
        if s["end_seconds"] <= s["start_seconds"]:
            errs.append(f"scene {s['id']}: end <= start")
        cursor = s["end_seconds"]
        if s["script_section_id"] not in sections:
            errs.append(f"scene {s['id']}: unknown script_section_id {s['script_section_id']}")
    total = spec.get("duration_seconds", 0)
    if scenes and abs(cursor - total) > 0.5:
        errs.append(f"scenes end at {cursor}s but duration_seconds is {total}")

    # Narration must fit its scene window.
    for s in scenes:
        text = sections.get(s["script_section_id"], "")
        window = s["end_seconds"] - s["start_seconds"]
        words = len(text.split())
        if words / wps > window * _FIT_SLACK:
            errs.append(
                f"scene {s['id']}: {words} words need ~{words / wps:.1f}s but window is {window:.1f}s"
            )

    by_id = {j["job_id"]: j for j in jobs}
    for j in jobs:
        jid = j["job_id"]
        tool = j["tool"]
        if tool not in GEMINI_TOOLS:
            errs.append(f"job {jid}: tool {tool} is not a Gemini worker tool")
        elif GEMINI_TOOLS[tool] != j["kind"]:
            errs.append(f"job {jid}: kind {j['kind']} does not match tool {tool}")
        if tool_available is not None and tool not in tool_available:
            errs.append(f"job {jid}: tool {tool} unavailable on this machine")
        if j.get("scene_id") and j["scene_id"] not in scene_ids:
            errs.append(f"job {jid}: unknown scene_id {j['scene_id']}")
        if j["kind"] != "music" and not j.get("scene_id"):
            errs.append(f"job {jid}: only music jobs may omit scene_id")
        for dep in j.get("depends_on", []):
            if dep not in by_id:
                errs.append(f"job {jid}: unknown dependency {dep}")
        for param, src in j.get("input_from", {}).items():
            if src not in by_id:
                errs.append(f"job {jid}: input_from {param} references unknown job {src}")
            elif src not in j.get("depends_on", []):
                errs.append(f"job {jid}: input_from {src} must also be in depends_on")
        if "output_path" in j["params"]:
            errs.append(f"job {jid}: params must not set output_path (use the job's output_path)")
        if j["output_path"].startswith("/") or ".." in j["output_path"].split("/"):
            errs.append(f"job {jid}: output_path must stay inside the project")
        if j["tool"] == "google_imagen" and j["params"].get("model") not in GEMINI_IMAGE_MODELS:
            errs.append(f"job {jid}: google_imagen needs an explicit gemini-* image model")
        if tool in PROVIDED_TOOLS:
            src = j["params"].get("source_path", "")
            if not src or src.startswith("/") or ".." in src.split("/"):
                errs.append(f"job {jid}: {tool} needs params.source_path inside the project (e.g. inputs/voice.mp3)")
        if j["kind"] == "tts":
            if not j["output_path"].endswith(".wav"):
                errs.append(f"job {jid}: tts output_path must end in .wav")
            if tool == "provided_audio":
                continue  # the creator's recording is not generated from the script text
            expected = j["acceptance"].get("expected_text", "")
            body = j["params"].get("text", "")
            sec = next((s for s in scenes if s["id"] == j.get("scene_id")), None)
            if sec and body.strip() != sections.get(sec["script_section_id"], "").strip():
                errs.append(f"job {jid}: tts text must equal its script section verbatim")
            if expected.strip() != body.strip():
                errs.append(f"job {jid}: acceptance.expected_text must equal params.text")
        if j["kind"] in ("video", "image") and not (
            j["acceptance"].get("must_show") or j["acceptance"].get("must_not_show")
        ):
            errs.append(f"job {jid}: visual jobs need must_show/must_not_show checks")

    # Every scene needs narration and visuals; dependency graph must be acyclic.
    for s in scenes:
        kinds = {j["kind"] for j in jobs if j.get("scene_id") == s["id"]}
        if "tts" not in kinds:
            errs.append(f"scene {s['id']}: no tts job")
        if not kinds & {"video", "image"}:
            errs.append(f"scene {s['id']}: no visual job")
    if _has_cycle(by_id):
        errs.append("job dependency cycle")
    return errs


def _has_cycle(by_id: dict[str, dict[str, Any]]) -> bool:
    state: dict[str, int] = {}

    def visit(n: str) -> bool:
        if state.get(n) == 1:
            return True
        if state.get(n) == 2 or n not in by_id:
            return False
        state[n] = 1
        if any(visit(d) for d in by_id[n].get("depends_on", [])):
            return True
        state[n] = 2
        return False

    return any(visit(n) for n in by_id)


def validate(
    spec: dict[str, Any],
    *,
    tool_available: set[str] | None = None,
    requirements: dict[str, Any] | None = None,
) -> list[str]:
    """Schema errors first; lint only runs on a structurally valid spec."""
    return schema_errors(spec) or lint(spec, tool_available=tool_available, requirements=requirements)
