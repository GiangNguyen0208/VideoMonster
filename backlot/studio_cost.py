"""Cost view for Studio (docs/ui-plan/phases/phase-6-results-and-cost.md).

Reads ``projects/<id>/cost_log.json`` exactly as ``tools/cost_tracker.py``
writes it. Totals come from ``CostTracker`` itself so Studio and the agent
can never disagree about what was spent:

- spent    = ``actual_usd`` of completed + failed entries
- reserved = ``reserved_usd`` of reserved entries
- remaining = budget − spent − reserved
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Optional

from backlot.project_store import ProjectFiles, ProjectStore

COST_LOG = "cost_log.json"
STATUSES = ("estimated", "reserved", "completed", "failed", "refunded")
SPENT_STATUSES = frozenset({"completed", "failed"})


def _read_log(files: ProjectFiles) -> Optional[dict[str, Any]]:
    return files.read_json(COST_LOG)


def _num(value: Any) -> float:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0.0


def _parse_ts(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return ts if ts.tzinfo else None


def stage_for(ts: Optional[datetime], stage_marks: list[tuple[str, datetime]]) -> Optional[str]:
    """The stage an entry belongs to. ``cost_log.json`` has no stage field,
    so an entry is attributed to the first stage (in pipeline order) whose
    checkpoint was written at or after it; later entries go to the stage
    after the last checkpoint, if any."""
    if ts is None:
        return None
    for name, mark in stage_marks:
        if ts <= mark:
            return name
    return None


def _snapshot(entries: list[dict], budget_total: Optional[float]) -> dict[str, Any]:
    """``CostTracker.cost_snapshot()`` over these entries, so the numbers are
    the agent's own. Entries the tracker can't handle fall back to the same sums."""
    try:
        from tools.cost_tracker import CostTracker

        tracker = CostTracker(budget_total_usd=budget_total or 0.0)
        tracker.entries = entries
        snap = tracker.cost_snapshot()
        spent, reserved = snap["total_spent_usd"], snap["total_reserved_usd"]
    except (KeyError, TypeError, ValueError):
        spent = round(sum(_num(e.get("actual_usd")) for e in entries if e.get("status") in SPENT_STATUSES), 4)
        reserved = round(sum(_num(e.get("reserved_usd")) for e in entries if e.get("status") == "reserved"), 4)
    return {
        "total_spent_usd": spent,
        "total_reserved_usd": reserved,
        "budget_remaining_usd": round(budget_total - spent - reserved, 4) if budget_total is not None else None,
    }


def project_cost(
    files: ProjectFiles,
    stages: list[dict[str, Any]],
    budget_cap_usd: Optional[float] = None,
) -> dict[str, Any]:
    """Snapshot, breakdowns and entries for one project.

    ``stages`` is the board's stage list (name, status, timestamp) in order;
    it is only used to attribute entries to stages.
    """
    log = _read_log(files)
    if log is None:
        return {"has_log": False, "budget_total_usd": budget_cap_usd, "snapshot": None,
                "by_tool": [], "by_stage": [], "by_status": {}, "entries": []}

    raw_entries = [e for e in log.get("entries") or [] if isinstance(e, dict)]
    budget_total = _num(log["budget_total_usd"]) if "budget_total_usd" in log else budget_cap_usd
    snapshot = _snapshot(raw_entries, budget_total)

    marks = [
        (s["name"], ts)
        for s in stages
        if (ts := _parse_ts(s.get("timestamp"))) is not None
    ]
    marks.sort(key=lambda m: m[1])
    upcoming = next(
        (s["name"] for s in stages if s.get("status") not in ("completed", "skipped") and not _parse_ts(s.get("timestamp"))),
        None,
    )

    entries = []
    by_tool: dict[str, dict[str, float]] = defaultdict(lambda: {"spent_usd": 0.0, "reserved_usd": 0.0, "estimated_usd": 0.0, "count": 0})
    by_stage: dict[Optional[str], dict[str, float]] = defaultdict(lambda: {"spent_usd": 0.0, "reserved_usd": 0.0, "count": 0})
    by_status: dict[str, dict[str, float]] = {s: {"count": 0, "usd": 0.0} for s in STATUSES}

    for raw in raw_entries:
        status = raw.get("status")
        if status not in by_status:
            continue
        spent = _num(raw.get("actual_usd")) if status in SPENT_STATUSES else 0.0
        reserved = _num(raw.get("reserved_usd")) if status == "reserved" else 0.0
        ts = _parse_ts(raw.get("timestamp"))
        stage = stage_for(ts, marks) or (upcoming if ts else None)
        tool = str(raw.get("tool") or "unknown")
        entry = {
            "id": raw.get("id"),
            "tool": tool,
            "operation": raw.get("operation"),
            "status": status,
            "estimated_usd": _num(raw.get("estimated_usd")),
            "reserved_usd": _num(raw.get("reserved_usd")),
            "actual_usd": _num(raw.get("actual_usd")),
            "timestamp": raw.get("timestamp"),
            "stage": stage,
            "details": raw.get("details"),
        }
        entries.append(entry)
        for bucket in (by_tool[tool], by_stage[stage]):
            bucket["spent_usd"] += spent
            bucket["reserved_usd"] += reserved
            bucket["count"] += 1
        # Ever priced above $0 (even if refunded) → a paid tool, not a free one.
        by_tool[tool]["estimated_usd"] += _num(raw.get("estimated_usd"))
        by_status[status]["count"] += 1
        by_status[status]["usd"] += (
            spent if status in SPENT_STATUSES
            else reserved if status == "reserved"
            else _num(raw.get("estimated_usd"))
        )

    def rows(groups: dict, key: str) -> list[dict[str, Any]]:
        out = [
            {key: name, "spent_usd": round(v["spent_usd"], 4), "reserved_usd": round(v["reserved_usd"], 4),
             "count": int(v["count"])}
            | ({"free": v["spent_usd"] == 0 and v["reserved_usd"] == 0 and v["estimated_usd"] == 0}
               if key == "tool" else {})
            for name, v in groups.items()
        ]
        return sorted(out, key=lambda r: (-r["spent_usd"], -r["reserved_usd"], str(r[key])))

    order = {s["name"]: i for i, s in enumerate(stages)}
    return {
        "has_log": True,
        "budget_total_usd": budget_total,
        "snapshot": snapshot,
        "by_tool": rows(by_tool, "tool"),
        "by_stage": sorted(rows(by_stage, "stage"), key=lambda r: order.get(r["stage"], len(order))),
        "by_status": {k: {"count": int(v["count"]), "usd": round(v["usd"], 4)} for k, v in by_status.items()},
        "entries": sorted(entries, key=lambda e: str(e["timestamp"] or ""), reverse=True),
    }


def spent_since(store: ProjectStore, since: datetime) -> dict[str, Any]:
    """Money actually spent (completed + failed entries) since ``since``,
    across every project — the Library's month-to-date total."""
    total = 0.0
    projects = 0
    for project_id in store.list_ids():
        log = _read_log(store.files(project_id))
        if not log:
            continue
        spent = 0.0
        for e in log.get("entries") or []:
            if not isinstance(e, dict) or e.get("status") not in SPENT_STATUSES:
                continue
            ts = _parse_ts(e.get("timestamp"))
            if ts and ts >= since:
                spent += _num(e.get("actual_usd"))
        if spent:
            projects += 1
            total += spent
    return {"since": since.isoformat(), "spent_usd": round(total, 4), "projects": projects}
