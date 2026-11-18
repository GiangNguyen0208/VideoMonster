"""One render entry point for the CLI (`python -m backlot render`) and Studio's
render job: the Gemini worker executes the sealed spec, then ffmpeg assembles.

No LLM is called here. Callers decide whether the user approved the spec.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Optional

# Process exit codes shared with the CLI.
OK, FAILED_JOBS, TAMPERED, ASSEMBLY_ERROR, FINAL_CHECK_FAILED = 0, 1, 4, 5, 6


def build_tracker(root: Path, spec: dict[str, Any]):
    """Cost tracker for an approved spec.

    The approval is the user's consent: lift the per-action prompt to the
    largest planned job and pre-approve the planned tools; the total cap
    still applies.
    """
    from lib.config_model import BudgetMode, OpenMontageConfig
    from tools.cost_tracker import CostTracker

    budget = OpenMontageConfig.load().budget
    biggest = max((j.get("estimated_cost_usd", 0.0) for j in spec["jobs"]), default=0.0)
    return CostTracker(
        budget_total_usd=budget.total_usd,
        reserve_pct=budget.reserve_pct,
        single_action_approval_usd=max(budget.single_action_approval_usd, biggest),
        require_approval_for_new_paid_tool=False,
        mode=BudgetMode(budget.mode),
        cost_log_path=Path(root) / "cost_log.json",
    )


def render_project(
    root: Path,
    spec: dict[str, Any],
    *,
    only_jobs: Optional[set[str]] = None,
    compose: bool = True,
    on_progress: Optional[Callable[[dict[str, Any]], None]] = None,
) -> dict[str, Any]:
    """Run worker then assembler. Returns ``{code, report, render_report, error}``.

    ``code`` is one of the module constants; ``error`` is a short reason when
    ``code`` is not ``OK``.
    """
    from lib.env_loader import load_env
    from lib.production_spec import SpecTampered
    from lib.spec_assembler import assemble
    from lib.spec_executor import run_spec
    from lib.spec_to_edit import AssemblyError

    load_env()
    root = Path(root)
    try:
        report = run_spec(
            root, spec, cost_tracker=build_tracker(root, spec),
            on_progress=on_progress, only_jobs=only_jobs,
        )
    except SpecTampered as exc:
        return {"code": TAMPERED, "report": None, "render_report": None, "error": str(exc)}
    if report["status"] != "complete":
        replan = ", ".join(report.get("needs_replan") or [])
        return {"code": FAILED_JOBS, "report": report, "render_report": None,
                "error": f"needs replan: {replan}" if replan else "some jobs did not pass"}
    if not compose:
        return {"code": OK, "report": report, "render_report": None, "error": None}
    try:
        rr = assemble(root, spec, report)
    except AssemblyError as exc:
        return {"code": ASSEMBLY_ERROR, "report": report, "render_report": None,
                "error": f"assembly failed: {exc}"}
    ok = rr["metadata"]["final_check"] == "passed"
    return {"code": OK if ok else FINAL_CHECK_FAILED, "report": report, "render_report": rr,
            "error": None if ok else "final check failed"}
