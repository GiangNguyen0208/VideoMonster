"""Review decisions made in Studio (docs/ui-plan/phases/phase-4-review-and-approve.md).

Studio never approves a checkpoint itself. It writes a decision *intent* to
``projects/<id>/studio/decisions/<id>.json``; the agent, waiting at the gate
(``python -m backlot await-decision``), applies it exactly like a chat reply,
logs it, and marks it consumed (``python -m backlot consume-decision``).

A decision is tied to the exact ``awaiting_human`` checkpoint the user saw
through ``checkpoint_timestamp``. If the checkpoint has since changed, the
decision is *stale*: the agent ignores it and Studio asks for a new review.
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from backlot.project_store import MissingSource, ProjectFiles, TargetExists

DECISIONS_DIR = "studio/decisions"
SCHEMA = "studio.decision/1"
CONSUMED_SUFFIX = ".consumed.json"
DECISION_ID_RE = re.compile(r"^\d{8}T\d{6}Z-[a-z0-9_]+-[0-9a-f]{6}$")
RUNTIMES = ("remotion", "hyperframes", "ffmpeg")


class ProposalPicks(BaseModel):
    """Choices made at the proposal review point. All ids/enums, never prose."""

    selected_concept_id: Optional[str] = Field(default=None, max_length=128)
    approved_budget_usd: Optional[float] = Field(default=None, ge=0, le=10000)
    render_runtime: Optional[Literal["remotion", "hyperframes", "ffmpeg"]] = None
    composition_mode: Optional[Literal["templated", "atelier"]] = None
    music_source: Optional[Literal["user_library", "ai_generated", "bring_your_own", "none"]] = None
    # With music_source "user_library": the track from music_library/ to use.
    music_track: Optional[str] = Field(default=None, max_length=255)
    voice: Optional[str] = Field(default=None, max_length=200)


class DecisionIn(BaseModel):
    stage: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")
    checkpoint_timestamp: str = Field(min_length=1, max_length=64)
    action: Literal["approve", "revise", "abort"]
    # The user's words, stored exactly as typed (any language).
    notes: str = Field(default="", max_length=20000)
    proposal: Optional[ProposalPicks] = None


class DecisionError(Exception):
    """Rejected decision. ``code`` is stable so the UI can translate it."""

    def __init__(self, status: int, code: str, detail: str) -> None:
        super().__init__(detail)
        self.status, self.code, self.detail = status, code, detail


# ---- reading state --------------------------------------------------------------


def current_checkpoint(files: ProjectFiles, stage: str) -> Optional[dict[str, Any]]:
    return files.read_json(f"checkpoint_{stage}.json")


def awaiting_checkpoints(files: ProjectFiles) -> list[dict[str, Any]]:
    out = []
    for info in files.list("", "checkpoint_*.json"):
        cp = files.read_json(info.path)
        if cp and cp.get("status") == "awaiting_human" and cp.get("stage"):
            out.append(cp)
    return out


def _decision_state(decision: dict[str, Any], consumed: bool, files: ProjectFiles) -> str:
    if consumed:
        return "consumed"
    cp = current_checkpoint(files, str(decision.get("stage", "")))
    if (
        cp
        and cp.get("status") == "awaiting_human"
        and cp.get("timestamp") == decision.get("checkpoint_timestamp")
    ):
        return "pending"
    # The checkpoint moved on (approved in chat, revised, or rewritten):
    # the agent will ignore this file, so it counts as retracted.
    return "stale"


def list_decisions(files: ProjectFiles) -> list[dict[str, Any]]:
    out = []
    for info in files.list(DECISIONS_DIR, "*.json"):
        consumed = info.name.endswith(CONSUMED_SUFFIX)
        data = files.read_json(info.path)
        if not data or data.get("schema") != SCHEMA:
            continue
        out.append({**data, "state": _decision_state(data, consumed, files)})
    out.sort(key=lambda d: str(d.get("created_at", "")), reverse=True)
    return out


def pending_for(files: ProjectFiles, stage: Optional[str] = None) -> Optional[dict[str, Any]]:
    """Oldest pending decision matching a current ``awaiting_human`` checkpoint
    (for ``stage`` if given). This is what the agent should apply next."""
    pending = [
        d
        for d in list_decisions(files)
        if d["state"] == "pending" and (stage is None or d.get("stage") == stage)
    ]
    if not pending:
        return None
    pending.sort(key=lambda d: str(d.get("created_at", "")))
    decision = pending[0]
    rel = _decision_rel(decision["id"])
    return {**decision, "file": str(files.local_file(rel))}


# ---- validation + write ---------------------------------------------------------


def _proposal_packet(files: ProjectFiles) -> Optional[dict[str, Any]]:
    try:
        artifacts = files.board_state().get("artifacts") or {}
    except Exception:
        return None
    packet = artifacts.get("proposal_packet")
    return packet if isinstance(packet, dict) else None


def validate(
    files: ProjectFiles,
    body: DecisionIn,
    runtimes: Optional[dict[str, bool]] = None,
) -> dict[str, Any]:
    """Raise ``DecisionError`` unless ``body`` may be recorded; returns the checkpoint."""
    cp = current_checkpoint(files, body.stage)
    if not cp or cp.get("status") != "awaiting_human":
        raise DecisionError(409, "not_awaiting", "this step is not waiting for review")
    if cp.get("timestamp") != body.checkpoint_timestamp:
        raise DecisionError(409, "stale_checkpoint", "this step changed — review the new version")
    if body.action == "revise" and not body.notes.strip():
        raise DecisionError(422, "notes_required", "say what should change")
    if any(
        d["state"] == "pending"
        and d.get("stage") == body.stage
        and d.get("checkpoint_timestamp") == body.checkpoint_timestamp
        for d in list_decisions(files)
    ):
        raise DecisionError(409, "already_decided", "a decision for this review is already waiting")

    picks = body.proposal
    if picks and body.action == "approve":
        if picks.selected_concept_id is not None:
            packet = _proposal_packet(files) or {}
            ids = {
                str(c.get("id"))
                for c in packet.get("concept_options") or []
                if isinstance(c, dict) and c.get("id") is not None
            }
            if picks.selected_concept_id not in ids:
                raise DecisionError(422, "unknown_concept", "that concept is not in the proposal")
        if picks.render_runtime and runtimes is not None and not runtimes.get(picks.render_runtime):
            raise DecisionError(
                422, "runtime_unavailable", f"{picks.render_runtime} is not available on this machine"
            )
    return cp


def record(
    files: ProjectFiles,
    body: DecisionIn,
    *,
    user_id: str,
    runtimes: Optional[dict[str, bool]] = None,
) -> dict[str, Any]:
    validate(files, body, runtimes)
    now = datetime.now(timezone.utc)
    decision_id = f"{now.strftime('%Y%m%dT%H%M%SZ')}-{body.stage}-{secrets.token_hex(3)}"
    decision = {
        "schema": SCHEMA,
        "id": decision_id,
        "created_at": now.isoformat(),
        "stage": body.stage,
        "checkpoint_timestamp": body.checkpoint_timestamp,
        "action": body.action,
        "notes": body.notes,
        "proposal": body.proposal.model_dump() if body.proposal else None,
        "source": "studio",
        "user": user_id,
    }
    files.write_json(_decision_rel(decision_id), decision)
    return {**decision, "state": "pending"}


def _decision_rel(decision_id: str, consumed: bool = False) -> str:
    if not DECISION_ID_RE.match(decision_id):
        raise DecisionError(404, "unknown_decision", "no such decision")
    return f"{DECISIONS_DIR}/{decision_id}{CONSUMED_SUFFIX if consumed else '.json'}"


def retract(files: ProjectFiles, decision_id: str) -> None:
    rel = _decision_rel(decision_id)
    if files.stat(rel) is None:
        if files.stat(_decision_rel(decision_id, consumed=True)) is not None:
            raise DecisionError(409, "already_consumed", "the agent already applied this decision")
        raise DecisionError(404, "unknown_decision", "no such decision")
    files.delete(rel)


def consume(files: ProjectFiles, decision_id: str) -> str:
    """Agent side: mark a decision applied (rename to ``<id>.consumed.json``).
    Returns the new file name."""
    rel = _decision_rel(decision_id)
    target = _decision_rel(decision_id, consumed=True)
    if files.stat(target) is not None:
        return target.rsplit("/", 1)[-1]
    if files.stat(rel) is None:
        raise DecisionError(404, "unknown_decision", "no such decision")
    try:
        files.rename(rel, target)
    except TargetExists:
        pass  # consumed concurrently — same outcome
    except MissingSource:
        # Retracted (or consumed and moved) between the check and the rename.
        if files.stat(target) is None:
            raise DecisionError(404, "unknown_decision", "no such decision") from None
    return target.rsplit("/", 1)[-1]
