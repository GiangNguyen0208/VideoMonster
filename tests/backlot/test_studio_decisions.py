"""Review decisions from Studio (docs/ui-plan/phases/phase-4-review-and-approve.md).

Checkpoints are written with the real ``lib.checkpoint.write_checkpoint`` so
the gate rules the agent obeys are the ones exercised here.
"""

from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from backlot import __main__ as cli
from backlot import server as server_mod
from backlot import state as state_mod
from backlot import studio_decisions, studio_setup
from backlot.studio_api import TOKEN_HEADER
from lib.checkpoint import CANONICAL_STAGE_ARTIFACTS, init_project, write_checkpoint
from tests.contracts.test_phase0_contracts import sample_artifact

PID = "gate-demo"
PIPELINE = "animated-explainer"


@pytest.fixture
def root(tmp_path, monkeypatch):
    root = tmp_path / "projects"
    root.mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "_summary_cache", {})
    monkeypatch.setattr(studio_setup, "probe_cache", studio_setup.ProbeCache())
    init_project(PID, title="Gate demo", pipeline_type=PIPELINE, pipeline_dir=root)
    return root


@pytest.fixture
def client(root, monkeypatch):
    async def no_watch():
        return None

    monkeypatch.setattr(server_mod, "_watch_projects", no_watch)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as c:
        c.headers[TOKEN_HEADER] = c.get("/api/v1/session").json()["token"]
        yield c


def _checkpoint(root, stage: str, status: str = "awaiting_human", **kw) -> dict:
    artifact = CANONICAL_STAGE_ARTIFACTS[stage]
    path = write_checkpoint(
        root, PID, stage, status, {artifact: sample_artifact(artifact)}, pipeline_type=PIPELINE, **kw
    )
    return json.loads(path.read_text())


def _at_proposal(root) -> dict:
    _checkpoint(root, "research", "completed")
    return _checkpoint(root, "proposal")


def _body(cp: dict, **over) -> dict:
    data = {"stage": cp["stage"], "checkpoint_timestamp": cp["timestamp"], "action": "approve"}
    data.update(over)
    return data


def _files(root) -> list[str]:
    folder = root / PID / "studio" / "decisions"
    return sorted(p.name for p in folder.glob("*.json")) if folder.is_dir() else []


# ---- API ------------------------------------------------------------------------


def test_approve_writes_exactly_one_decision_file(client, root):
    cp = _at_proposal(root)
    picks = {
        "selected_concept_id": "c2",
        "approved_budget_usd": 1.5,
        "render_runtime": "hyperframes",
        "composition_mode": "templated",
        "music_source": "none",
    }
    res = client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp, proposal=picks))
    assert res.status_code == 201, res.text
    decision = res.json()
    assert decision["state"] == "pending" and decision["source"] == "studio"
    assert decision["proposal"]["selected_concept_id"] == "c2"
    files = _files(root)
    assert files == [f"{decision['id']}.json"]
    on_disk = json.loads((root / PID / "studio" / "decisions" / files[0]).read_text())
    assert on_disk["schema"] == "studio.decision/1"
    assert on_disk["checkpoint_timestamp"] == cp["timestamp"]
    # Studio never touches the checkpoint itself.
    assert json.loads((root / PID / "checkpoint_proposal.json").read_text())["status"] == "awaiting_human"

    # A second decision for the same review is refused.
    again = client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp))
    assert again.status_code == 409 and again.json()["code"] == "already_decided"
    assert len(_files(root)) == 1


@pytest.mark.parametrize(
    "setup,over,status,code",
    [
        ("stale", {}, 409, "stale_checkpoint"),
        ("completed", {}, 409, "not_awaiting"),
        ("proposal", {"action": "revise", "notes": "   "}, 422, "notes_required"),
        ("proposal", {"proposal": {"selected_concept_id": "c9"}}, 422, "unknown_concept"),
        ("proposal", {"proposal": {"render_runtime": "hyperframes"}}, 422, "runtime_unavailable"),
    ],
)
def test_decision_validation_matrix(client, root, setup, over, status, code):
    studio_setup.probe_cache.set(
        {"summary": {"composition_runtimes": {"remotion": True, "hyperframes": False}}}
    )
    if setup == "completed":
        cp = _checkpoint(root, "research", "completed")
    else:
        cp = _at_proposal(root)
    body = _body(cp, **over)
    if setup == "stale":
        body["checkpoint_timestamp"] = "2000-01-01T00:00:00+00:00"
    res = client.post(f"/api/v1/projects/{PID}/decisions", json=body)
    assert res.status_code == status, res.text
    assert res.json()["code"] == code
    assert _files(root) == []


def test_bad_bodies_and_projects(client, root):
    cp = _at_proposal(root)
    assert client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp, action="ship")).status_code == 422
    assert client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp, stage="../x")).status_code == 422
    assert client.post("/api/v1/projects/nope/decisions", json=_body(cp)).status_code == 404
    assert (
        client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp), headers={TOKEN_HEADER: "x"}).status_code
        == 403
    )


def test_revise_keeps_notes_verbatim(client, root):
    cp = _at_proposal(root)
    notes = "Ngắn hơn, bỏ cảnh 3.\nKeep the hook."
    res = client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp, action="revise", notes=notes))
    assert res.status_code == 201
    assert res.json()["notes"] == notes


def test_list_retract_and_consume_lifecycle(client, root):
    cp = _at_proposal(root)
    did = client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp)).json()["id"]
    listed = client.get(f"/api/v1/projects/{PID}/decisions").json()["decisions"]
    assert [(d["id"], d["state"]) for d in listed] == [(did, "pending")]

    assert client.delete(f"/api/v1/projects/{PID}/decisions/{did}").status_code == 204
    assert _files(root) == []
    assert client.delete(f"/api/v1/projects/{PID}/decisions/{did}").status_code == 404
    assert client.delete(f"/api/v1/projects/{PID}/decisions/..%2F..%2Fx").status_code == 404

    did = client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp)).json()["id"]
    studio_decisions.consume(root / PID, did)
    listed = client.get(f"/api/v1/projects/{PID}/decisions").json()["decisions"]
    assert listed[0]["state"] == "consumed"
    res = client.delete(f"/api/v1/projects/{PID}/decisions/{did}")
    assert res.status_code == 409 and res.json()["code"] == "already_consumed"


def test_approval_in_chat_makes_a_pending_decision_stale(client, root):
    cp = _at_proposal(root)
    client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp))
    # The user approved in chat instead; the agent completed the checkpoint.
    _checkpoint(root, "proposal", "completed", human_approved=True)
    listed = client.get(f"/api/v1/projects/{PID}/decisions").json()["decisions"]
    assert listed[0]["state"] == "stale"
    assert studio_decisions.pending_for(root / PID) is None


def test_revised_checkpoint_makes_old_decision_stale(client, root):
    cp = _at_proposal(root)
    client.post(f"/api/v1/projects/{PID}/decisions", json=_body(cp, action="revise", notes="shorter"))
    time.sleep(0.01)
    new_cp = _checkpoint(root, "proposal")  # agent wrote a revised version
    assert new_cp["timestamp"] != cp["timestamp"]
    assert client.get(f"/api/v1/projects/{PID}/decisions").json()["decisions"][0]["state"] == "stale"
    # ...and the new version can be reviewed.
    assert client.post(f"/api/v1/projects/{PID}/decisions", json=_body(new_cp)).status_code == 201


# ---- CLI (agent side) -------------------------------------------------------------


def test_await_decision_returns_a_matching_decision(root, capsys):
    cp = _at_proposal(root)
    decision = studio_decisions.record(
        root / PID, studio_decisions.DecisionIn(**_body(cp)), user_id="local"
    )
    assert cli.main(["await-decision", PID, "proposal", "--timeout", "0"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["id"] == decision["id"] and out["action"] == "approve"
    assert out["file"].endswith(f"{decision['id']}.json")
    # Read-only: the file is still pending until the agent consumes it.
    assert _files(root) == [f"{decision['id']}.json"]

    assert cli.main(["consume-decision", PID, decision["id"]]) == 0
    assert _files(root) == [f"{decision['id']}.consumed.json"]
    assert cli.main(["await-decision", PID, "--timeout", "0"]) == 2


def test_await_decision_ignores_stale_and_other_stages(root, capsys):
    cp = _at_proposal(root)
    studio_decisions.record(root / PID, studio_decisions.DecisionIn(**_body(cp)), user_id="local")
    assert cli.main(["await-decision", PID, "script", "--timeout", "0"]) == 2
    _checkpoint(root, "proposal")  # rewritten → decision is stale
    assert cli.main(["await-decision", PID, "proposal", "--timeout", "0"]) == 2
    assert "Ask the user" in capsys.readouterr().err


def test_await_decision_waits_then_times_out(root):
    _at_proposal(root)
    start = time.monotonic()
    assert cli.cmd_await_decision(PID, None, timeout=0.3, poll=0.05) == 2
    assert time.monotonic() - start >= 0.3


def test_await_decision_picks_up_a_late_decision(root, capsys):
    import threading

    cp = _at_proposal(root)

    def later():
        time.sleep(0.2)
        studio_decisions.record(root / PID, studio_decisions.DecisionIn(**_body(cp)), user_id="local")

    threading.Thread(target=later).start()
    assert cli.cmd_await_decision(PID, "proposal", timeout=5, poll=0.05) == 0
    assert json.loads(capsys.readouterr().out)["stage"] == "proposal"


def test_cli_rejects_unknown_projects_and_ids(root):
    assert cli.main(["await-decision", "../etc", "--timeout", "0"]) == 3
    assert cli.main(["await-decision", "missing", "--timeout", "0"]) == 3
    assert cli.main(["consume-decision", PID, "../../x"]) == 3


def test_decision_log_accepts_studio_source(root):
    """The agent logs applied Studio decisions with ``source: "studio"``."""
    _checkpoint(root, "research", "completed")
    log = {
        "version": "1.0",
        "project_id": PID,
        "decisions": [
            {
                "decision_id": "d1",
                "stage": "proposal",
                "category": "render_runtime_selection",
                "subject": "Render runtime",
                "options_considered": [
                    {"option_id": "remotion", "label": "Remotion", "score": 0.8, "reason": "scenes"},
                    {"option_id": "hyperframes", "label": "HyperFrames", "score": 0.7, "reason": "motion"},
                ],
                "selected": "hyperframes",
                "reason": "picked by the user in Studio",
                "source": "studio",
            }
        ],
    }
    packet = sample_artifact("proposal_packet")
    write_checkpoint(
        root, PID, "proposal", "completed", {"proposal_packet": packet, "decision_log": log},
        pipeline_type=PIPELINE, human_approved=True,
    )
    merged = json.loads((root / PID / "decision_log.json").read_text())
    assert merged["decisions"][-1]["source"] == "studio"
