"""Spec-mode (plan once, Gemini executes) for Studio.

Studio and the agent are two front ends over the same files
(``.agents/skills/spec-worker/references/studio-contract.md``). This module
*derives* the stepper state from those files, serves the artifacts for review,
and starts the render. It never writes the brief or the spec: the user's answers
at the two gates become decision files (``studio_decisions``) that the agent
applies with ``requirements approve`` / ``spec approve``.

Gate tokens are content hashes (brief hash, spec hash), so a decision recorded
against a version the agent has since changed is stale by construction.
"""

from __future__ import annotations

from typing import Any, Optional

from lib import production_spec as ps
from lib import requirements_brief as rb
from backlot.project_store import ProjectFiles
from backlot.studio_jobs import Job, jobs

BRIEF = "artifacts/requirements_brief.json"
SPEC = "artifacts/production_spec.json"
APPROVAL = "artifacts/spec_approval.json"
REPORT = "artifacts/worker_report.json"
RENDER_REPORT = "artifacts/render_report.json"
HISTORY = "artifacts/production_spec.history"
RUN_STATE = "studio/render_run.json"
SPEC_STAGES = ("requirements", "spec", "spec_recovery")
STEPS = ("requirements", "spec", "render", "result")
GEMINI_KEYS = ("GEMINI_API_KEY", "GOOGLE_API_KEY")


class SpecError(Exception):
    """Rejected spec-mode action. ``code`` is stable so the UI can translate it."""

    def __init__(self, status: int, code: str, detail: str) -> None:
        super().__init__(detail)
        self.status, self.code, self.detail = status, code, detail


# ---- file-derived state -----------------------------------------------------------


def _spec_sealed(spec: Optional[dict[str, Any]]) -> bool:
    if not spec or not spec.get("spec_hash"):
        return False
    try:
        ps.verify_seal(spec)
    except ps.SpecTampered:
        return False
    return True


def _spec_approved(files: ProjectFiles, spec: Optional[dict[str, Any]]) -> bool:
    approval = files.read_json(APPROVAL)
    return bool(spec and approval and approval.get("spec_hash") == spec.get("spec_hash"))


def requirements_state(brief: Optional[dict[str, Any]]) -> str:
    """missing | invalid | pending | approved"""
    if brief is None:
        return "missing"
    if rb.is_approved(brief):
        return "approved"
    return "invalid" if rb.lint(brief) else "pending"


def gate_checkpoint(files: ProjectFiles, stage: str) -> Optional[dict[str, Any]]:
    """A checkpoint-shaped record for a spec-mode review point, or ``None``
    when that gate is not open. Lets ``studio_decisions`` treat these stages
    like any other ``awaiting_human`` review."""
    if stage not in SPEC_STAGES:
        return None
    brief = files.read_json(BRIEF)
    token: Optional[str] = None
    if stage == "requirements":
        if requirements_state(brief) == "pending":
            token = rb.brief_hash(brief)  # type: ignore[arg-type]
    elif brief and rb.is_approved(brief):
        spec = files.read_json(SPEC)
        if _spec_sealed(spec) and not _spec_approved(files, spec):
            recovering = files.read_json(REPORT) is not None
            if recovering == (stage == "spec_recovery"):
                token = spec["spec_hash"]  # type: ignore[index]
    if token is None:
        return None
    return {"stage": stage, "status": "awaiting_human", "timestamp": token}


def open_gate(files: ProjectFiles) -> Optional[dict[str, Any]]:
    for stage in SPEC_STAGES:
        cp = gate_checkpoint(files, stage)
        if cp:
            return {"stage": stage, "token": cp["timestamp"]}
    return None


def has_gemini_key() -> bool:
    from backlot.studio_setup import env_status

    return any(s["set"] for s in env_status(list(GEMINI_KEYS)).values())


def _run_state(files: ProjectFiles) -> Optional[dict[str, Any]]:
    return files.read_json(RUN_STATE)


def _render_state(files: ProjectFiles, spec: Optional[dict[str, Any]], approved: bool) -> str:
    """locked | ready | running | partial | complete | failed"""
    if not approved or spec is None:
        return "locked"
    if jobs.running(_job_kind(files.project_id)):
        return "running"
    report = files.read_json(REPORT)
    if report and report.get("spec_hash") == spec.get("spec_hash"):
        if report.get("status") == "complete":
            return "complete"
        return "partial"
    run = _run_state(files)
    if run and run.get("spec_hash") == spec.get("spec_hash") and run.get("status") == "failed":
        return "failed"
    return "ready"


def flow_state(files: ProjectFiles) -> dict[str, Any]:
    brief = files.read_json(BRIEF)
    spec = files.read_json(SPEC)
    req = requirements_state(brief)
    if req != "approved":
        spec_state = "locked"
    elif spec is None:
        spec_state = "missing"
    elif not _spec_sealed(spec):
        spec_state = "drafted"
    elif _spec_approved(files, spec):
        spec_state = "approved"
    else:
        spec_state = "sealed"
    render = _render_state(files, spec, spec_state == "approved")
    final = (files.read_json(RENDER_REPORT) or {}).get("metadata", {}).get("final_check")
    result = "delivered" if render == "complete" and final == "passed" else (
        "failed" if render == "complete" and final == "failed" else "pending"
    )
    states = {"requirements": req, "spec": spec_state, "render": render, "result": result}
    current = next(
        (s for s, ok in (
            ("requirements", req != "approved"),
            ("spec", spec_state != "approved"),
            ("render", render != "complete"),
        ) if ok),
        "result",
    )
    return {
        "steps": [{"id": s, "state": states[s]} for s in STEPS],
        "current": current,
        "gate": open_gate(files),
        "gemini_key": has_gemini_key(),
        "spec_hash": spec.get("spec_hash") if spec else None,
        "estimated_cost_usd": spec.get("estimated_total_cost_usd") if spec else None,
    }


# ---- review payloads --------------------------------------------------------------


def requirements_view(files: ProjectFiles) -> dict[str, Any]:
    brief = files.read_json(BRIEF)
    if brief is None:
        raise SpecError(404, "requirements_missing", "the agent has not written the requirements yet")
    state = requirements_state(brief)
    return {
        "brief": brief,
        "state": state,
        "errors": rb.lint(brief) if state != "approved" else [],
        "token": rb.brief_hash(brief) if state != "invalid" else None,
    }


def _job_changes(files: ProjectFiles, spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Jobs whose params differ from the previous sealed version (recovery review)."""
    versions = sorted(files.list(HISTORY, "*.json"), key=lambda f: f.path)
    previous = files.read_json(versions[-1].path) if versions else None
    if not previous:
        return []
    old = {j["job_id"]: j for j in previous.get("jobs", [])}
    out = []
    for job in spec.get("jobs", []):
        before = old.get(job["job_id"])
        if before is None or before.get("params") != job.get("params") or before.get("tool") != job.get("tool"):
            out.append({
                "job_id": job["job_id"],
                "old": {"tool": before.get("tool"), "params": before.get("params")} if before else None,
                "new": {"tool": job.get("tool"), "params": job.get("params")},
                "old_cost_usd": before.get("estimated_cost_usd") if before else None,
                "new_cost_usd": job.get("estimated_cost_usd"),
            })
    return out


def spec_view(files: ProjectFiles) -> dict[str, Any]:
    spec = files.read_json(SPEC)
    brief = files.read_json(BRIEF)
    if spec is None:
        raise SpecError(404, "spec_missing", "the agent has not written the spec yet")
    sealed = _spec_sealed(spec)
    errors = [] if sealed else ps.validate(spec, requirements=brief) if brief else ["no requirements brief"]
    return {
        "spec": spec,
        "sealed": sealed,
        "approved": _spec_approved(files, spec),
        "errors": errors[:40],
        "token": spec.get("spec_hash") if sealed else None,
        "changes": _job_changes(files, spec) if files.read_json(REPORT) is not None else [],
    }


def render_view(files: ProjectFiles) -> dict[str, Any]:
    spec = files.read_json(SPEC)
    running = jobs.running(_job_kind(files.project_id))
    report = files.read_json(REPORT)
    if report and spec and report.get("spec_hash") != spec.get("spec_hash"):
        report = None  # a previous spec's run
    run = _run_state(files)
    if run and spec and run.get("spec_hash") != spec.get("spec_hash"):
        run = None
    return {
        "state": _render_state(files, spec, bool(spec) and _spec_approved(files, spec)),
        "job": running.public() if running else None,
        "report": report,
        "render_report": files.read_json(RENDER_REPORT) if report else None,
        "run": run,
    }


# ---- decisions --------------------------------------------------------------------


def check_picks(files: ProjectFiles, stage: str, improvements: list[str], answers: dict[str, str]) -> None:
    """Reject picks the agent could not apply (ids not in the brief, missing
    required creator inputs, files that were never uploaded)."""
    if stage != "requirements":
        return
    brief = files.read_json(BRIEF) or {}
    known = {i["id"] for i in brief.get("improvements", [])}
    if any(i not in known for i in improvements):
        raise SpecError(422, "unknown_improvement", "that improvement is not in the requirements")
    questions = {q["id"] for q in brief.get("open_questions", [])}
    inputs = {i["id"]: i for i in brief.get("inputs", [])}
    if any(k not in questions and k not in inputs for k in answers):
        raise SpecError(422, "unknown_question", "that question or input is not in the requirements")
    if any(len(v) > 2000 for v in answers.values()):
        raise SpecError(422, "answer_too_long", "an answer is too long")
    problems = rb.input_answer_errors(brief, answers)
    if problems:
        raise SpecError(422, "input_required", problems[0])
    for iid, spec_input in inputs.items():
        value = (answers.get(iid) or "").strip()
        if spec_input["kind"] == "file" and value and files.stat(value) is None:
            raise SpecError(422, "input_file_missing", f"{value} was not uploaded")


# ---- render job -------------------------------------------------------------------


def _job_kind(project_id: str) -> str:
    return f"spec_render:{project_id}"


def start_render(files: ProjectFiles) -> Job:
    """Start the worker for the approved spec as a background job."""
    spec = files.read_json(SPEC)
    if spec is None or not _spec_sealed(spec) or not _spec_approved(files, spec):
        raise SpecError(409, "spec_not_approved", "approve the spec before rendering")
    if not has_gemini_key():
        raise SpecError(409, "gemini_key_missing", "add GEMINI_API_KEY or GOOGLE_API_KEY in Setup")
    root = files.work_dir()
    spec_hash = spec["spec_hash"]

    def run(job: Job) -> dict[str, Any]:
        from lib.spec_render import OK, render_project

        seen: dict[str, str] = {}
        job.output = {"done": 0, "total": len(spec["jobs"]), "jobs": seen}

        def progress(event: dict[str, Any]) -> None:
            seen[event["job_id"]] = event["status"]
            job.output = {"done": event["done"], "total": event["total"], "jobs": dict(seen)}
            job.progress = event["done"] / max(event["total"], 1) * 0.9

        files.write_json(RUN_STATE, {"spec_hash": spec_hash, "status": "running"})
        try:
            result = render_project(root, spec, on_progress=progress)
        except Exception as exc:
            files.write_json(RUN_STATE, {"spec_hash": spec_hash, "status": "failed", "error": str(exc)[:500]})
            raise
        failed = result["code"] != OK
        files.write_json(RUN_STATE, {
            "spec_hash": spec_hash,
            "status": "failed" if failed and not result["report"] else "finished",
            "code": result["code"],
            "error": result["error"],
        })
        job.progress = 1.0
        if failed:
            raise RuntimeError(result["error"] or f"render exited with code {result['code']}")
        return {"code": result["code"]}

    return jobs.start(_job_kind(files.project_id), run, pass_job=True)

