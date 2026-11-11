"""Tiny in-process job table for slow Studio actions (capability probes, and
in later phases demo renders). Jobs run on a worker thread; the UI polls
``GET /api/v1/jobs/{id}``. Local single-user scope: no persistence."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

MAX_FINISHED_JOBS = 50


@dataclass
class Job:
    id: str
    kind: str
    status: str = "running"  # running | succeeded | failed
    started_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None
    result: Any = None
    error: Optional[str] = None
    progress: Optional[float] = None  # 0..1 when the job reports it
    output: Optional[dict[str, Any]] = None  # small, UI-safe result (``result`` may be large)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "progress": self.progress,
            "output": self.output,
        }


class JobTable:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def running(self, kind: str) -> Optional[Job]:
        with self._lock:
            return next(
                (j for j in self._jobs.values() if j.kind == kind and j.status == "running"), None
            )

    def start(
        self,
        kind: str,
        fn: Callable[..., Any],
        on_success: Optional[Callable[[Any], None]] = None,
        *,
        dedupe: bool = True,
        pass_job: bool = False,
        public_output: bool = False,
    ) -> Job:
        """Run ``fn`` on a thread. With ``dedupe`` a running job of the same
        kind is returned instead of starting a second one. ``pass_job`` hands
        the job to ``fn`` so it can report ``progress``; ``public_output``
        exposes the (small, dict) result as ``output``."""
        with self._lock:
            if dedupe:
                existing = next(
                    (j for j in self._jobs.values() if j.kind == kind and j.status == "running"),
                    None,
                )
                if existing:
                    return existing
            job = Job(id=uuid.uuid4().hex[:12], kind=kind)
            self._jobs[job.id] = job
            self._prune()

        def run() -> None:
            try:
                result = fn(job) if pass_job else fn()
                if on_success:
                    on_success(result)
                if public_output:
                    job.output = result
                job.result, job.status = result, "succeeded"
            except Exception as exc:  # surfaced to the UI, never raised
                job.error, job.status = str(exc) or exc.__class__.__name__, "failed"
            finally:
                job.finished_at = time.time()

        threading.Thread(target=run, name=f"studio-job-{kind}", daemon=True).start()
        return job

    def _prune(self) -> None:
        finished = sorted(
            (j for j in self._jobs.values() if j.status != "running"),
            key=lambda j: j.finished_at or 0,
        )
        for job in finished[: max(0, len(finished) - MAX_FINISHED_JOBS)]:
            self._jobs.pop(job.id, None)


jobs = JobTable()
