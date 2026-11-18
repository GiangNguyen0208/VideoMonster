"""Spec mode in Studio: derived stepper state, gate decisions, ordering and
staleness codes, render refusal. The brief/spec are the skill's worked examples,
so the same validators the agent obeys are exercised here."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backlot import server as server_mod
from backlot import state as state_mod
from backlot import studio_decisions, studio_jobs, studio_setup, studio_spec
from backlot.project_store import DiskProjectStore
from backlot.studio_api import TOKEN_HEADER
from lib import production_spec as ps
from lib import requirements_brief as rb
from lib.checkpoint import init_project

PID = "spec-demo"
SKILL = Path(__file__).resolve().parents[2] / ".agents" / "skills" / "spec-worker" / "references"


def _example(name: str) -> dict:
    return json.loads((SKILL / name).read_text(encoding="utf-8"))


@pytest.fixture
def root(tmp_path, monkeypatch):
    root = tmp_path / "projects"
    root.mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "_summary_cache", {})
    monkeypatch.setattr(studio_setup, "probe_cache", studio_setup.ProbeCache())
    init_project(PID, title="Spec demo", pipeline_type="animated-explainer", pipeline_dir=root)
    return root


@pytest.fixture
def client(root, monkeypatch):
    async def no_watch():
        return None

    monkeypatch.setattr(server_mod, "_watch_projects", no_watch)
    monkeypatch.setattr(studio_spec, "has_gemini_key", lambda: True)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as c:
        c.headers[TOKEN_HEADER] = c.get("/api/v1/session").json()["token"]
        yield c


@pytest.fixture
def files(root):
    return DiskProjectStore(root).files(PID)


def _write_brief(files) -> dict:
    brief = _example("example-requirements-brief.json")
    brief["project_id"] = PID
    files.write_json(studio_spec.BRIEF, brief)
    return brief


def _approve_brief(files, picks=("i1",)) -> dict:
    approved = rb.approve(files.read_json(studio_spec.BRIEF), list(picks))
    files.write_json(studio_spec.BRIEF, approved)
    return approved


def _write_spec(files, approved) -> dict:
    spec = _example("example-production-spec.json")
    spec.update(version="1.0", project_id=PID, requirements_hash=approved["approval"]["brief_hash"])
    ps.seal(spec)
    files.write_json(studio_spec.SPEC, spec)
    return spec


def _states(client) -> dict:
    return {s["id"]: s["state"] for s in client.get(f"/api/v1/projects/{PID}/spec-flow").json()["steps"]}


def test_flow_follows_the_files(client, files):
    assert _states(client) == {"requirements": "missing", "spec": "locked", "render": "locked", "result": "pending"}
    _write_brief(files)
    assert _states(client)["requirements"] == "pending"
    approved = _approve_brief(files)
    assert _states(client)["spec"] == "missing"
    spec = _write_spec(files, approved)
    assert _states(client)["spec"] == "sealed"
    files.write_json(studio_spec.APPROVAL, {"spec_hash": spec["spec_hash"]})
    states = _states(client)
    assert states["spec"] == "approved" and states["render"] == "ready"
    assert client.get(f"/api/v1/projects/{PID}/spec-flow").json()["current"] == "render"


def test_requirements_decision_records_picks_and_is_agent_visible(client, files):
    brief = _write_brief(files)
    token = rb.brief_hash(brief)
    gate = client.get(f"/api/v1/projects/{PID}/spec-flow").json()["gate"]
    assert gate == {"stage": "requirements", "token": token}
    body = {"action": "approve", "token": token, "selected_improvements": ["i1"], "answers": {}}
    r = client.post(f"/api/v1/projects/{PID}/requirements/decision", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["spec"]["selected_improvements"] == ["i1"]
    assert studio_decisions.pending_for(files, "requirements")["id"] == r.json()["id"]
    again = client.post(f"/api/v1/projects/{PID}/requirements/decision", json=body)
    assert (again.status_code, again.json()["code"]) == (409, "already_decided")


def test_requirements_decision_rejects_unknown_ids_and_stale_token(client, files):
    brief = _write_brief(files)
    token = rb.brief_hash(brief)
    bad = client.post(
        f"/api/v1/projects/{PID}/requirements/decision",
        json={"action": "approve", "token": token, "selected_improvements": ["nope"]},
    )
    assert (bad.status_code, bad.json()["code"]) == (422, "unknown_improvement")
    stale = client.post(
        f"/api/v1/projects/{PID}/requirements/decision",
        json={"action": "approve", "token": "0" * 64},
    )
    assert (stale.status_code, stale.json()["code"]) == (409, "requirements_changed")


def test_spec_decision_needs_approved_requirements(client, files):
    _write_brief(files)
    r = client.post(f"/api/v1/projects/{PID}/spec/decision", json={"action": "approve", "token": "x"})
    assert (r.status_code, r.json()["code"]) == (409, "step_out_of_order")


def test_spec_decision_and_hash_change(client, files):
    spec = _write_spec(files, _write_and_approve(files))
    ok = client.post(
        f"/api/v1/projects/{PID}/spec/decision", json={"action": "approve", "token": spec["spec_hash"]}
    )
    assert ok.status_code == 201 and ok.json()["stage"] == "spec"
    stale = client.post(f"/api/v1/projects/{PID}/spec/decision", json={"action": "approve", "token": "f" * 64})
    assert stale.status_code == 409 and stale.json()["code"] in ("spec_changed", "already_decided")


def _write_and_approve(files) -> dict:
    _write_brief(files)
    return _approve_brief(files)


def test_decision_goes_stale_when_the_agent_reseals(client, files):
    approved = _write_and_approve(files)
    spec = _write_spec(files, approved)
    r = client.post(f"/api/v1/projects/{PID}/spec/decision", json={"action": "revise", "token": spec["spec_hash"], "notes": "shorter"})
    assert r.status_code == 201
    spec["duration_seconds"] = spec["duration_seconds"]  # agent edits and reseals
    spec["script"]["language"] = spec["script"].get("language", "en")
    spec["estimated_total_cost_usd"] = (spec.get("estimated_total_cost_usd") or 0) + 0.01
    spec.pop("spec_hash")
    ps.seal(spec)
    files.write_json(studio_spec.SPEC, spec)
    assert studio_decisions.pending_for(files, "spec") is None


def test_render_refused_until_approved_then_job_starts(client, files, monkeypatch):
    approved = _write_and_approve(files)
    spec = _write_spec(files, approved)
    r = client.post(f"/api/v1/projects/{PID}/render")
    assert (r.status_code, r.json()["code"]) == (409, "spec_not_approved")
    files.write_json(studio_spec.APPROVAL, {"spec_hash": spec["spec_hash"]})
    monkeypatch.setattr(studio_spec, "has_gemini_key", lambda: False)
    r = client.post(f"/api/v1/projects/{PID}/render")
    assert (r.status_code, r.json()["code"]) == (409, "gemini_key_missing")
    monkeypatch.setattr(studio_spec, "has_gemini_key", lambda: True)

    calls = []

    def fake_render(root, spec, *, on_progress=None, **kw):
        calls.append(spec["spec_hash"])
        on_progress({"done": 1, "total": len(spec["jobs"]), "job_id": spec["jobs"][0]["job_id"], "status": "passed"})
        return {"code": 0, "report": {"status": "complete"}, "render_report": None, "error": None}

    import lib.spec_render as spec_render

    monkeypatch.setattr(spec_render, "render_project", fake_render)
    r = client.post(f"/api/v1/projects/{PID}/render")
    assert r.status_code == 202
    job_id = r.json()["job"]["id"]
    for _ in range(100):
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        if job["status"] != "running":
            break
    assert job["status"] == "succeeded" and calls == [spec["spec_hash"]]
    assert files.read_json(studio_spec.RUN_STATE)["status"] == "finished"


def test_spec_view_lists_changed_jobs_after_a_run(client, files):
    approved = _write_and_approve(files)
    old = _write_spec(files, approved)
    files.write_json(f"{studio_spec.HISTORY}/001-old.json", old)
    files.write_json(studio_spec.REPORT, {"spec_hash": old["spec_hash"], "status": "partial", "jobs": []})
    new = json.loads(json.dumps(old))
    job = new["jobs"][0]
    job["params"] = {**job["params"], "prompt": job["params"].get("prompt", "") + " (calmer)"}
    new.pop("spec_hash")
    ps.seal(new)
    files.write_json(studio_spec.SPEC, new)
    view = client.get(f"/api/v1/projects/{PID}/spec").json()
    assert [c["job_id"] for c in view["changes"]] == [job["job_id"]]
    assert view["sealed"] is True and view["approved"] is False


def test_kickoff_names_spec_command(client, root):
    assert studio_jobs  # module import smoke
    r = client.get(f"/api/v1/projects/{PID}/kickoff")
    assert r.status_code == 404  # not a Studio project: no intake


# ---- creator inputs -------------------------------------------------------------


def _brief_with_inputs(files) -> dict:
    brief = _example("example-requirements-brief.json")
    brief["project_id"] = PID
    brief["inputs"] = [
        {"id": "in_lang", "label": "Language", "kind": "choice", "required": True, "options": ["en", "vi"], "binds": "language"},
        {"id": "in_logo", "label": "Logo", "kind": "file", "accept": "image", "required": False, "binds": "logo_file"},
    ]
    files.write_json(studio_spec.BRIEF, brief)
    return brief


def _post_req(client, token, **kw):
    body = {"action": "approve", "token": token, "selected_improvements": ["i1"], **kw}
    return client.post(f"/api/v1/projects/{PID}/requirements/decision", json=body)


def test_required_input_blocks_the_decision(client, files):
    token = rb.brief_hash(_brief_with_inputs(files))
    r = _post_req(client, token, answers={})
    assert (r.status_code, r.json()["code"]) == (422, "input_required")
    r = _post_req(client, token, answers={"in_lang": "fr"})
    assert (r.status_code, r.json()["code"]) == (422, "input_required")
    ok = _post_req(client, token, answers={"in_lang": "vi"})
    assert ok.status_code == 201 and ok.json()["spec"]["answers"] == {"in_lang": "vi"}


def test_file_input_must_be_uploaded(client, files):
    token = rb.brief_hash(_brief_with_inputs(files))
    r = _post_req(client, token, answers={"in_lang": "en", "in_logo": "inputs/logo.png"})
    assert (r.status_code, r.json()["code"]) == (422, "input_file_missing")
    up = client.post(f"/api/v1/projects/{PID}/uploads?name=logo.png&kind=logo", content=b"\x89PNG\r\n\x1a\n" + b"0" * 64,
                     headers={"content-type": "image/png"})
    assert up.status_code == 201 and up.json()["path"] == "inputs/logo.png" and up.json()["kind"] == "logo"
    ok = _post_req(client, token, answers={"in_lang": "en", "in_logo": "inputs/logo.png"})
    assert ok.status_code == 201


def test_creator_upload_kinds_check_the_media_type(client, files):
    base = f"/api/v1/projects/{PID}/uploads"
    bad = client.post(f"{base}?name=clip.mp4&kind=logo", content=b"x" * 32, headers={"content-type": "video/mp4"})
    assert (bad.status_code, bad.json()["code"]) == (415, "wrong_media")
    bad = client.post(f"{base}?name=pic.png&kind=voice", content=b"x" * 32, headers={"content-type": "image/png"})
    assert (bad.status_code, bad.json()["code"]) == (415, "wrong_media")


def test_library_track_is_copied_into_the_project(client, files, tmp_path, monkeypatch):
    lib = tmp_path / "music"
    lib.mkdir()
    (lib / "drive.mp3").write_bytes(b"ID3" + b"0" * 64)
    monkeypatch.setenv("MUSIC_LIBRARY_DIR", str(lib))
    r = client.post(f"/api/v1/projects/{PID}/inputs/music", json={"name": "drive.mp3"})
    assert r.status_code == 201, r.text
    assert r.json()["path"] == "inputs/drive.mp3" and r.json()["kind"] == "music"
    assert files.stat("inputs/drive.mp3") is not None
    missing = client.post(f"/api/v1/projects/{PID}/inputs/music", json={"name": "nope.mp3"})
    assert (missing.status_code, missing.json()["code"]) == (404, "unknown_track")
    escape = client.post(f"/api/v1/projects/{PID}/inputs/music", json={"name": "../secret.mp3"})
    assert escape.status_code == 404
