"""Gemini worker: executes a sealed production_spec mechanically.

No LLM decisions. The only variation between attempts is the spec's own
``retry_ladder`` and ``fallback_tool``. Tools are called directly from the
registry (no selectors), so nothing can route outside the Gemini family.
"""

from __future__ import annotations

import copy
import hashlib
import json
import threading
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from lib import production_spec as ps
from lib.spec_verifier import Verifier
from schemas.artifacts import validate_artifact

REPORT_REL = "artifacts/worker_report.json"
MANIFEST_REL = "artifacts/asset_manifest.json"
_ASSET_TYPE = {"video": "video", "image": "image", "tts": "narration", "music": "music"}

Progress = Callable[[dict[str, Any]], None]


def params_hash(job: dict[str, Any]) -> str:
    blob = json.dumps(
        {"tool": job["tool"], "params": job["params"], "out": job["output_path"],
         "retry": job.get("retry_ladder", []), "fallback": job.get("fallback_tool")},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _read_json(path: Path) -> Optional[dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _estimate(tool: Any, params: dict[str, Any], fallback: float) -> float:
    """Tool quote when it has one; the spec's estimate for unquoted tools."""
    try:
        quote = float(tool.estimate_cost(params))
    except Exception:  # PriceQuoteRequired and friends: tool cannot quote
        return fallback
    return quote if quote > 0 else fallback


class _Run:
    def __init__(self, project_dir: Path, spec: dict[str, Any], registry: Any, verifier: Verifier,
                 cost_tracker: Any, on_progress: Progress | None, prior: dict[str, Any] | None) -> None:
        self.dir = project_dir
        self.spec = spec
        self.registry = registry
        self.verifier = verifier
        self.cost = cost_tracker
        self.on_progress = on_progress
        self.jobs = {j["job_id"]: j for j in spec["jobs"]}
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.state: dict[str, dict[str, Any]] = {
            jid: {"job_id": jid, "status": "pending", "attempts": []} for jid in self.jobs
        }
        self.meta: dict[str, dict[str, Any]] = {}  # job_id -> manifest data from the passing attempt
        self.prior = {j["job_id"]: j for j in (prior or {}).get("jobs", [])} if prior else {}
        self.prior_manifest = {a["id"]: a for a in (_read_json(project_dir / MANIFEST_REL) or {}).get("assets", [])}

    # ----------------------------------------------------------- bookkeeping
    def emit(self, job_id: str, attempt: int = 0) -> None:
        if self.on_progress:
            done = sum(1 for s in self.state.values() if s["status"] not in ("pending", "running"))
            self.on_progress({"job_id": job_id, "status": self.state[job_id]["status"],
                              "attempt": attempt, "done": done, "total": len(self.state)})

    def set_status(self, job_id: str, status: str, attempt: int = 0) -> None:
        with self.lock:
            self.state[job_id]["status"] = status
        self.emit(job_id, attempt)

    def out_path(self, job_id: str) -> Path:
        return self.dir / self.jobs[job_id]["output_path"]

    # ---------------------------------------------------------------- resume
    def try_resume(self, job_id: str) -> bool:
        old = self.prior.get(job_id)
        job = self.jobs[job_id]
        if not old or old.get("status") != "passed" or old.get("params_hash") != params_hash(job):
            return False
        if not self.out_path(job_id).exists():
            return False
        with self.lock:
            self.state[job_id] = copy.deepcopy(old)
            if job_id in self.prior_manifest:
                self.meta[job_id] = self.prior_manifest[job_id]
        self.emit(job_id)
        return True

    # ------------------------------------------------------------------- job
    def attempts_for(self, job: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
        base = copy.deepcopy(job["params"])
        plan = [("original", job["tool"], base)]
        for i, step in enumerate(job.get("retry_ladder", []), 1):
            plan.append((f"ladder-{i}", job["tool"], {**base, **copy.deepcopy(step["params_patch"])}))
        fb = job.get("fallback_tool")
        if fb:
            plan.append(("fallback", fb["tool"], copy.deepcopy(fb["params"])))
        return plan

    def _resolve_paths(self, params: dict[str, Any]) -> dict[str, Any]:
        """Turn project-relative file params (``inputs/voice.mp3``) into absolute
        paths so tools do not depend on the worker's cwd. Only existing files."""
        def one(v: Any) -> Any:
            if isinstance(v, str) and v and not v.startswith("/") and (self.dir / v).is_file():
                return str(self.dir / v)
            return v

        out = dict(params)
        for k, v in params.items():
            if k.endswith("_path") and k != "output_path":
                out[k] = one(v)
            elif k.endswith("_paths") and isinstance(v, list):
                out[k] = [one(x) for x in v]
        return out

    def run_job(self, job_id: str) -> None:
        job = self.jobs[job_id]
        out = self.out_path(job_id)
        entry = self.state[job_id]
        entry["params_hash"] = params_hash(job)
        entry["output_path"] = job["output_path"]
        injected: dict[str, str] = {}
        for param, src in job.get("input_from", {}).items():
            injected[param] = str(self.out_path(src))
        self.set_status(job_id, "running")

        for n, (label, tool_name, params) in enumerate(self.attempts_for(job), 1):
            if self.stop.is_set():
                self.set_status(job_id, "pending", n)
                return
            params = {**self._resolve_paths(params), **injected, "output_path": str(out)}
            tool = self.registry.get(tool_name)
            rec: dict[str, Any] = {"n": n, "tool": tool_name, "label": label, "passed": False,
                                   "reasons": [], "warnings": [], "scores": {}, "cost_usd": 0.0}
            entry["attempts"].append(rec)
            if tool is None:
                rec["reasons"].append(f"tool {tool_name} not found in registry")
                continue
            out.parent.mkdir(parents=True, exist_ok=True)

            est = _estimate(tool, params, float(job.get("estimated_cost_usd", 0.0)))
            entry_id = None
            if self.cost is not None:
                with self.lock:
                    try:
                        entry_id = self.cost.estimate(tool_name, job["kind"], est)
                        self.cost.reserve(entry_id)
                    except Exception as exc:  # ApprovalRequiredError / BudgetExceededError
                        name = type(exc).__name__
                        if name not in ("ApprovalRequiredError", "BudgetExceededError"):
                            raise
                        rec["reasons"].append(f"{name}: {exc}")
                        self.stop.set()
                        self.set_status(job_id, "blocked_budget", n)
                        return

            try:
                res = tool.execute(params)
            except Exception as exc:
                self._settle(entry_id, 0.0, False, refund=True)
                rec["reasons"].append(f"tool raised {type(exc).__name__}: {exc}")
                continue
            spent = res.cost_usd if res.cost_usd is not None else est
            self._settle(entry_id, spent if res.success else (spent if res.data.get("submission_outcome") == "unknown" else 0.0),
                         res.success, refund=False)
            rec["cost_usd"] = float(spent if res.success else 0.0)
            if not res.success:
                rec["reasons"].append(res.error or "tool reported failure")
                if res.data.get("retry_safe") is False:
                    rec["reasons"].append("provider outcome unknown; not retrying")
                    break
                continue

            verdict = self.verifier.check(job, out, self.spec)
            rec.update(passed=verdict.passed, reasons=verdict.reasons, warnings=verdict.warnings,
                       scores=verdict.scores)
            self.emit(job_id, n)
            if verdict.passed:
                with self.lock:
                    self.meta[job_id] = self._manifest_item(job, tool, res, verdict, rec["cost_usd"])
                entry["status"] = "passed"
                entry["reasons"] = []
                self.set_status(job_id, "passed", n)
                return

        entry["reasons"] = (entry["attempts"][-1]["reasons"] if entry["attempts"] else ["no attempts"])
        self.set_status(job_id, "needs_replan", len(entry["attempts"]))

    def _settle(self, entry_id: Optional[str], actual: float, success: bool, *, refund: bool) -> None:
        if self.cost is None or entry_id is None:
            return
        with self.lock:
            if refund:
                self.cost.refund(entry_id)
            else:
                self.cost.reconcile(entry_id, actual, success=success)

    def _manifest_item(self, job: dict[str, Any], tool: Any, res: Any, verdict: Any, cost: float) -> dict[str, Any]:
        item: dict[str, Any] = {
            "id": job["job_id"],
            "type": _ASSET_TYPE[job["kind"]],
            "path": job["output_path"],
            "source_tool": job["tool"],
            "scene_id": job.get("scene_id") or "_project",
            "cost_usd": max(0.0, float(cost)),
        }
        prompt = job["params"].get("prompt") or job["params"].get("text")
        if prompt:
            item["prompt"] = prompt
        if res.model:
            item["model"] = res.model
        if isinstance(res.seed, int):
            item["seed"] = res.seed
        if getattr(tool, "provider", None):
            item["provider"] = tool.provider
        if verdict.scores.get("duration"):
            item["duration_seconds"] = float(verdict.scores["duration"])
        if "vision_ratio" in verdict.scores:
            item["quality_score"] = float(verdict.scores["vision_ratio"])
        return item

    # ------------------------------------------------------------ scheduling
    def execute(self, only: set[str] | None, max_parallel: int) -> None:
        todo = {jid for jid in self.jobs if only is None or jid in only}
        for jid in list(todo):
            if self.try_resume(jid):
                todo.discard(jid)
        done = {jid for jid, s in self.state.items() if s["status"] == "passed"}
        running: dict[Any, str] = {}
        with ThreadPoolExecutor(max_workers=max(1, max_parallel)) as pool:
            while todo or running:
                if not self.stop.is_set():
                    for jid in sorted(todo):
                        deps = self.jobs[jid].get("depends_on", [])
                        bad = [d for d in deps if self.state[d]["status"] not in ("pending", "running", "passed")]
                        if bad:
                            self.state[jid]["reasons"] = [f"dependency {bad[0]} did not pass"]
                            self.set_status(jid, "skipped_dependency")
                            todo.discard(jid)
                        elif all(d in done for d in deps) and len(running) < max_parallel:
                            todo.discard(jid)
                            running[pool.submit(self.run_job, jid)] = jid
                if not running:
                    break
                finished, _ = wait(running, return_when=FIRST_COMPLETED)
                for fut in finished:
                    jid = running.pop(fut)
                    fut.result()  # surface programming errors
                    if self.state[jid]["status"] == "passed":
                        done.add(jid)

    # ---------------------------------------------------------------- report
    def report(self, started: str) -> dict[str, Any]:
        jobs = [self.state[j["job_id"]] for j in self.spec["jobs"]]
        statuses = {j["status"] for j in jobs}
        if statuses == {"passed"}:
            status = "complete"
        elif "passed" in statuses:
            status = "partial"
        else:
            status = "failed"
        total = sum(a.get("cost_usd", 0.0) for j in jobs for a in j["attempts"])
        return {
            "version": "1.0",
            "spec_hash": self.spec["spec_hash"],
            "status": status,
            "started_at": started,
            "finished_at": _now(),
            "total_cost_usd": round(total, 6),
            "needs_replan": [j["job_id"] for j in jobs if j["status"] == "needs_replan"],
            "jobs": jobs,
        }


def run_spec(
    project_dir: Path,
    spec: dict[str, Any],
    *,
    registry: Any = None,
    verifier: Verifier | None = None,
    cost_tracker: Any = None,
    max_parallel: int = 2,
    on_progress: Progress | None = None,
    only_jobs: set[str] | None = None,
) -> dict[str, Any]:
    """Run the spec's jobs; return (and persist) the validated worker_report."""
    ps.verify_seal(spec)
    errs = ps.validate(spec)
    if errs:
        raise ValueError("spec failed validation: " + "; ".join(errs[:5]))
    if registry is None:
        from tools.tool_registry import registry as reg
        reg.discover()
        registry = reg
    project_dir = Path(project_dir)
    prior = _read_json(project_dir / REPORT_REL)
    if prior and prior.get("spec_hash") != spec["spec_hash"]:
        prior = None  # different spec: nothing to resume
    run = _Run(project_dir, spec, registry, verifier or Verifier(), cost_tracker, on_progress, prior)
    started = _now()
    run.execute(only_jobs, max_parallel)

    report = run.report(started)
    validate_artifact("worker_report", report)
    _write_json(project_dir / REPORT_REL, report)

    assets = [run.meta[j["job_id"]] for j in spec["jobs"] if j["job_id"] in run.meta]
    manifest = {"version": "1.0", "assets": assets,
                "total_cost_usd": round(sum(a["cost_usd"] for a in assets), 6)}
    validate_artifact("asset_manifest", manifest)
    _write_json(project_dir / MANIFEST_REL, manifest)
    return report
