"""Gate commands for spec-mode projects (the agent runs these; see
.agents/skills/spec-worker/SKILL.md).

    python -m backlot requirements check <id>
    python -m backlot requirements approve <id> [--improvements a,b] [--answer q=text ...]
    python -m backlot spec check <id>        validate + fill hashes + seal (agent never hand-writes hashes)
    python -m backlot spec approve <id>      bind the user's approval to spec_hash
    python -m backlot spec status <id>       compact view of spec + worker report

Exit codes: 0 ok, 1 validation errors, 3 missing project/file, 7 not approved.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from typing import Any

from lib import production_spec as ps
from lib import requirements_brief as rb

BRIEF = "artifacts/requirements_brief.json"
SPEC = "artifacts/production_spec.json"
APPROVAL = "artifacts/spec_approval.json"
REPORT = "artifacts/worker_report.json"
HISTORY = "artifacts/production_spec.history"
MAX_ERRORS = 40


def _files(project_id: str):
    from backlot.__main__ import _project_files

    files = _project_files(project_id)
    if files is None:
        print(f"unknown project {project_id!r}", file=sys.stderr)
    return files


def _errors(errs: list[str]) -> int:
    for line in errs[:MAX_ERRORS]:
        print(f"  - {line}", file=sys.stderr)
    if len(errs) > MAX_ERRORS:
        print(f"  ... and {len(errs) - MAX_ERRORS} more", file=sys.stderr)
    return 1


def _available_tools() -> set[str] | None:
    try:
        from tools.base_tool import ToolStatus
        from tools.tool_registry import registry

        registry.discover()
        return {n for n in ps.GEMINI_TOOLS
                if (t := registry.get(n)) is not None and t.get_status() == ToolStatus.AVAILABLE}
    except Exception:
        return None


# ---------------------------------------------------------------- requirements

def requirements_check(project_id: str) -> int:
    files = _files(project_id)
    if files is None:
        return 3
    brief = files.read_json(BRIEF)
    if brief is None:
        print(f"requirements: {BRIEF} missing", file=sys.stderr)
        return 3
    errs = rb.lint(brief)
    if errs:
        print("requirements: INVALID", file=sys.stderr)
        return _errors(errs)
    print(f"requirements: valid — {len(brief['goals'])} goals, {len(brief['non_goals'])} non-goals, "
          f"{len(brief['scenarios'])} scenarios, {len(brief['improvements'])} improvements, "
          f"{len(brief.get('open_questions', []))} open questions")
    return 0


def requirements_approve(project_id: str, improvements: str, answers: list[str]) -> int:
    files = _files(project_id)
    if files is None:
        return 3
    brief = files.read_json(BRIEF)
    if brief is None:
        print(f"requirements: {BRIEF} missing", file=sys.stderr)
        return 3
    picks = [i for i in improvements.split(",") if i]
    malformed = [a for a in answers if "=" not in a]
    if malformed:
        print(f"requirements: --answer needs id=value, got {malformed}", file=sys.stderr)
        return 1
    parsed = dict(a.split("=", 1) for a in answers)
    try:
        approved = rb.approve(brief, picks, parsed)
    except ValueError as exc:
        print(f"requirements: {exc}", file=sys.stderr)
        return 1
    files.write_json(BRIEF, approved)
    print(f"requirements: approved ({len(picks)} improvements) hash {approved['approval']['brief_hash'][:12]}")
    return 0


# ------------------------------------------------------------------------ spec

def _history(files: Any, old: dict[str, Any] | None, new_hash: str) -> None:
    if not old or old.get("spec_hash") in (None, new_hash):
        return
    n = len(files.list(HISTORY, "*.json")) + 1
    files.write_json(f"{HISTORY}/{n:03d}-{old['spec_hash'][:8]}.json", old)


def spec_check(project_id: str, offline: bool = False) -> int:
    files = _files(project_id)
    if files is None:
        return 3
    spec = files.read_json(SPEC)
    brief = files.read_json(BRIEF)
    if spec is None or brief is None:
        print(f"spec: need {SPEC} and {BRIEF}", file=sys.stderr)
        return 3
    if not rb.is_approved(brief):
        print("spec: requirements_brief is not approved yet — get the user's approval first", file=sys.stderr)
        return 7
    old = dict(spec) if spec.get("spec_hash") else None
    spec["version"] = "1.0"
    spec["project_id"] = project_id
    spec["requirements_hash"] = brief["approval"]["brief_hash"]
    spec.pop("spec_hash", None)
    errs = ps.validate(spec, tool_available=None if offline else _available_tools(), requirements=brief)
    if errs:
        print("spec: INVALID (file not changed)", file=sys.stderr)
        return _errors(errs)
    ps.seal(spec)
    _history(files, old, spec["spec_hash"])
    files.write_json(SPEC, spec)
    approval = files.read_json(APPROVAL)
    if approval and approval.get("spec_hash") != spec["spec_hash"]:
        files.delete(APPROVAL)
        print("spec: content changed — previous approval cleared, user must approve again")
    kinds: dict[str, int] = {}
    for j in spec["jobs"]:
        kinds[j["kind"]] = kinds.get(j["kind"], 0) + 1
    print(f"spec: valid and sealed — {len(spec['scenes'])} scenes, jobs {kinds}, "
          f"{spec['duration_seconds']}s {spec['aspect_ratio']}, est. ${spec.get('estimated_total_cost_usd', 0):.2f}")
    print(f"spec: spec_hash {spec['spec_hash']}")
    return 0


def spec_approve(project_id: str) -> int:
    files = _files(project_id)
    if files is None:
        return 3
    spec, brief = files.read_json(SPEC), files.read_json(BRIEF)
    if spec is None or brief is None:
        print(f"spec: need {SPEC} and {BRIEF}", file=sys.stderr)
        return 3
    try:
        ps.verify_seal(spec)
    except ps.SpecTampered as exc:
        print(f"spec: {exc} — run `spec check` first", file=sys.stderr)
        return 1
    errs = ps.validate(spec, requirements=brief)
    if errs:
        return _errors(errs)
    files.write_json(APPROVAL, {"spec_hash": spec["spec_hash"],
                                "approved_at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    print(f"spec: approved {spec['spec_hash'][:12]}")
    return 0


def is_spec_approved(files: Any, spec: dict[str, Any]) -> bool:
    approval = files.read_json(APPROVAL)
    return bool(approval) and approval.get("spec_hash") == spec.get("spec_hash")


def spec_status(project_id: str) -> int:
    files = _files(project_id)
    if files is None:
        return 3
    spec = files.read_json(SPEC)
    if spec is None:
        print("status: no production_spec yet")
        return 0
    approved = is_spec_approved(files, spec)
    print(f"spec {spec.get('spec_hash', 'UNSEALED')[:12]}  {'APPROVED' if approved else 'not approved'}  "
          f"{len(spec['scenes'])} scenes / {len(spec['jobs'])} jobs  est ${spec.get('estimated_total_cost_usd', 0):.2f}")
    report = files.read_json(REPORT)
    if report is None:
        print("worker: not run")
        return 0
    stale = " (STALE: spec changed since this run)" if report.get("spec_hash") != spec.get("spec_hash") else ""
    counts: dict[str, int] = {}
    for j in report["jobs"]:
        counts[j["status"]] = counts.get(j["status"], 0) + 1
    print(f"worker: {report['status']}{stale}  {counts}  cost ${report['total_cost_usd']:.4f}")
    for j in report["jobs"]:
        if j["status"] in ("needs_replan", "blocked_budget", "failed", "skipped_dependency"):
            why = (j.get("reasons") or ["?"])[0][:160]
            tried = ",".join(f"{a['label']}:{a['tool']}" for a in j["attempts"])
            print(f"  {j['job_id']}: {j['status']} — {why}  [tried {tried or 'nothing'}]")
    render = files.read_json("artifacts/render_report.json")
    if render:
        meta = render.get("metadata", {})
        out = render["outputs"][0]
        print(f"render: {out['path']} {out['resolution']} {out['duration_seconds']}s final_check={meta.get('final_check')}")
        for w in render.get("warnings", []):
            print(f"  warning: {w}")
    return 0
