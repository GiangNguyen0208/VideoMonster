"""New video wizard (docs/ui-plan/phases/phase-3-new-video-wizard.md).

Pipelines and styles are read from the real ``pipeline_defs/`` and
``styles/``; the capability probe and demo renders are faked.
"""

from __future__ import annotations

import json
import sys
import time

import pytest
from fastapi.testclient import TestClient

from backlot import server as server_mod
from backlot import state as state_mod
from backlot import studio_catalog, studio_setup
from backlot.studio_api import TOKEN_HEADER
from backlot.studio_jobs import JobTable
from lib.pipeline_loader import list_pipelines


def _probe(locked=("animated-explainer",)) -> dict:
    return {
        "summary": {"capabilities": [], "composition_runtimes": {}},
        "tools": [],
        "pipelines": [
            {
                "pipeline": name,
                "stability": "production",
                "missing_required": ["image_generation"] if name in locked else [],
                "missing_enhancements": [],
            }
            for name in sorted(list_pipelines())
            if name != "framework-smoke"
        ],
    }


@pytest.fixture
def jobs():
    return JobTable()


@pytest.fixture
def client(tmp_path, monkeypatch, jobs):
    root = tmp_path / "projects"
    root.mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "_summary_cache", {})
    monkeypatch.setattr(studio_setup, "probe_cache", studio_setup.ProbeCache())
    monkeypatch.setattr(studio_setup, "run_probe", _probe)
    monkeypatch.setattr("backlot.studio_api.jobs", jobs)

    async def no_watch():
        return None

    monkeypatch.setattr(server_mod, "_watch_projects", no_watch)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as c:
        c.headers[TOKEN_HEADER] = c.get("/api/v1/session").json()["token"]
        c.root = root  # type: ignore[attr-defined]
        yield c


def _intake(**over) -> dict:
    data = {
        "goal": "screen-demo",
        "pipeline_type": "screen-demo",
        "brief": {
            "topic": "How to install our CLI in 30 seconds",
            "audience": "developers",
            "platform": "youtube",
            "aspect": "16:9",
            "duration_seconds": 30,
            "tone": "friendly",
            "must_include": ["  brew install  ", ""],
            "avoid": [],
        },
        "style_playbook": "clean-professional",
        "budget": {"cap_usd": 0, "mode": "cap"},
        "advanced": {"production_mode": "synthetic_terminal"},
    }
    data.update(over)
    return data


def _wait_job(client, job_id: str) -> dict:
    deadline = time.time() + 10
    while True:
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        if job["status"] != "running":
            return job
        assert time.time() < deadline
        time.sleep(0.02)


def _settle_probe(client, jobs) -> None:
    running = jobs.running("setup_probe")
    if running:
        _wait_job(client, running.id)


# ---- catalogs ------------------------------------------------------------------


def test_pipelines_cover_every_manifest_except_the_smoke_test(client):
    body = client.get("/api/v1/pipelines").json()
    names = {p["name"] for p in body["pipelines"]}
    assert names == set(list_pipelines()) - {"framework-smoke"}
    explainer = next(p for p in body["pipelines"] if p["name"] == "animated-explainer")
    assert explainer["reference_input"] is True
    assert {"name": "proposal", "gated": True} in explainer["stages"]
    assert "clean-professional" in explainer["compatible_playbooks"]["recommended"]
    demo = next(p for p in body["pipelines"] if p["name"] == "screen-demo")
    assert {m["name"] for m in demo["production_modes"]} >= {"real_capture", "synthetic_terminal"}
    assert body["defaults"]["checkpoint_policy"] in {"guided", "manual_all", "auto_noncreative"}


def test_pipelines_merge_lock_state_once_checked(client, jobs):
    first = client.get("/api/v1/pipelines").json()
    assert first["checked"] is False
    assert all(p["availability"] is None for p in first["pipelines"])
    _settle_probe(client, jobs)
    body = client.get("/api/v1/pipelines").json()
    assert body["checked"] is True
    states = {p["name"]: p["availability"]["state"] for p in body["pipelines"]}
    assert states["animated-explainer"] == "locked"
    assert states["screen-demo"] == "ready"


def test_styles_list_presets_with_palettes(client):
    styles = client.get("/api/v1/styles").json()["styles"]
    clean = next(s for s in styles if s["name"] == "clean-professional")
    assert clean["title"] == "Clean Professional"
    assert clean["palette"] and all(c.startswith("#") for c in clean["palette"])
    assert clean["custom"] is False


# ---- create --------------------------------------------------------------------


def test_create_project_writes_marker_and_intake(client):
    res = client.post("/api/v1/projects", json=_intake())
    assert res.status_code == 201, res.text
    body = res.json()
    pid = body["project_id"]
    assert pid.startswith("how-to-install-our-cli-in-30-seconds-")
    assert body["kickoff"]["agents"][0]["command"] == f'claude "/reel Continue Studio project {pid}"'

    project_dir = client.root / pid
    marker = json.loads((project_dir / "project.json").read_text())
    assert marker["pipeline_type"] == "screen-demo"
    assert marker["style_playbook"] == "clean-professional"
    assert marker["title"] == "How to install our CLI in 30 seconds"
    intake = json.loads((project_dir / "studio" / "intake.json").read_text())
    assert intake["schema"] == "studio.intake/1"
    assert intake["brief"]["must_include"] == ["brew install"]
    assert intake["advanced"]["production_mode"] == "synthetic_terminal"
    assert not list(project_dir.glob("checkpoint_*.json"))  # Studio never writes checkpoints

    # The board picks it up as a project with no checkpoint yet.
    projects = client.get("/api/projects").json()
    assert any(p["project_id"] == pid for p in projects)


def test_duplicate_titles_get_distinct_ids(client):
    a = client.post("/api/v1/projects", json=_intake()).json()["project_id"]
    b = client.post("/api/v1/projects", json=_intake()).json()["project_id"]
    assert a != b


@pytest.mark.parametrize(
    "over,detail",
    [
        ({"pipeline_type": "framework-smoke"}, "unknown video type"),
        ({"pipeline_type": "nope"}, "unknown video type"),
        ({"style_playbook": "../../etc/passwd"}, "unknown style"),
        ({"advanced": {"production_mode": "hologram"}}, "unknown production mode"),
    ],
)
def test_create_rejects_unknown_choices(client, over, detail):
    res = client.post("/api/v1/projects", json=_intake(**over))
    assert res.status_code == 422
    assert detail in res.json()["detail"]
    assert not any(client.root.iterdir())


@pytest.mark.parametrize(
    "over",
    [
        {"goal": "../x"},
        {"brief": {"topic": "hi"}},
        {"brief": {"topic": "A real topic", "duration_seconds": 2}},
        {"brief": {"topic": "A real topic", "platform": "myspace"}},
        {"reference": {"url": "javascript:alert(1)"}},
        {"budget": {"cap_usd": -1}},
    ],
)
def test_create_validates_intake_shape(client, over):
    assert client.post("/api/v1/projects", json=_intake(**over)).status_code == 422


def test_title_cannot_inject_paths(client):
    res = client.post(
        "/api/v1/projects", json=_intake(title="../../../evil/..\\name\x00 :C")
    )
    assert res.status_code == 201
    pid = res.json()["project_id"]
    assert "/" not in pid and "\\" not in pid and ".." not in pid and ":" not in pid
    assert (client.root / pid / "project.json").is_file()
    assert [p.name for p in client.root.iterdir()] == [pid]


def test_locked_video_type_cannot_be_created(client, jobs):
    client.get("/api/v1/setup")
    _settle_probe(client, jobs)
    res = client.post(
        "/api/v1/projects",
        json=_intake(goal="explain-topic", pipeline_type="animated-explainer", advanced={}),
    )
    assert res.status_code == 409
    assert "Setup" in res.json()["detail"]


def test_create_needs_the_studio_token(client):
    res = client.post("/api/v1/projects", json=_intake(), headers={TOKEN_HEADER: "wrong"})
    assert res.status_code == 403


# ---- intake edits and kickoff ---------------------------------------------------


def test_intake_is_editable_until_the_first_checkpoint(client):
    pid = client.post("/api/v1/projects", json=_intake()).json()["project_id"]
    got = client.get(f"/api/v1/projects/{pid}/intake").json()
    assert got["editable"] is True

    edited = _intake()
    edited["brief"]["duration_seconds"] = 45
    res = client.patch(f"/api/v1/projects/{pid}/intake", json=edited)
    assert res.status_code == 200
    assert res.json()["intake"]["brief"]["duration_seconds"] == 45
    assert res.json()["intake"]["created_at"] == got["intake"]["created_at"]

    changed_type = _intake(goal="animation", pipeline_type="animation", advanced={})
    assert client.patch(f"/api/v1/projects/{pid}/intake", json=changed_type).status_code == 422

    (client.root / pid / "checkpoint_research.json").write_text("{}")
    assert client.get(f"/api/v1/projects/{pid}/intake").json()["editable"] is False
    assert client.patch(f"/api/v1/projects/{pid}/intake", json=edited).status_code == 409
    assert client.get(f"/api/v1/projects/{pid}/kickoff").json()["started"] is True


def test_kickoff_and_intake_404_for_projects_not_made_in_studio(client):
    (client.root / "cli-made").mkdir()
    assert client.get("/api/v1/projects/cli-made/kickoff").status_code == 404
    assert client.get("/api/v1/projects/cli-made/intake").status_code == 404
    assert client.get("/api/v1/projects/missing/kickoff").status_code == 404
    assert client.get("/api/v1/projects/..%2F..%2Fetc/kickoff").status_code == 404


def test_kickoff_lists_each_agent(client):
    pid = client.post("/api/v1/projects", json=_intake()).json()["project_id"]
    body = client.get(f"/api/v1/projects/{pid}/kickoff").json()
    assert body["started"] is False
    assert [a["id"] for a in body["agents"]] == ["claude", "codex", "cursor"]
    assert all(pid in a["command"] for a in body["agents"])


# ---- helpers ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "title,slug",
    [
        ("How Black Holes Form!", "how-black-holes-form"),
        ("../../etc", "etc"),
        ("日本語", "video"),
        ("x" * 100, "x" * 40),
        ("install our cli and run the first command", "install-our-cli-and-run-the-first"),
    ],
)
def test_slugify(title, slug):
    assert studio_catalog.slugify(title) == slug


def test_derive_title_trims_long_topics():
    title = studio_catalog.derive_title("why " + "very " * 40 + "long")
    assert len(title) <= 81 and title.endswith("…") and title.startswith("Why")


@pytest.mark.parametrize(
    "line,progress",
    [
        ("Rendered 0/100", 0.0),
        ("Rendered 50/100, time remaining: 4s", 0.475),
        ("Encoded 100/100", 1.0),
        ("Bundling 40%", None),
    ],
)
def test_parse_progress(line, progress):
    assert studio_catalog.parse_progress(line) == progress


# ---- demos -----------------------------------------------------------------------


def test_demos_list_checked_in_props(client):
    demos = client.get("/api/v1/demos").json()["demos"]
    names = {d["name"] for d in demos}
    assert {"world-in-numbers", "code-to-screen"} <= names
    for demo in demos:
        assert demo["rendered"] == (demo["video_url"] is not None)


def test_unknown_demo_is_404(client):
    assert client.post("/api/v1/demos/nope/render").status_code == 404


def test_demo_render_job_reports_progress_and_output(client, monkeypatch):
    script = (
        "import sys\n"
        "for i in (25, 50, 100):\n"
        "    print(f'Rendered {i}/100', flush=True)\n"
        "print('Encoded 100/100', flush=True)\n"
    )
    real = studio_catalog.render_demo_job

    def fake(name, job, command=None):  # noqa: ARG001
        return real(name, job, command=[sys.executable, "-c", script])

    monkeypatch.setattr(studio_catalog, "render_demo_job", fake)
    res = client.post("/api/v1/demos/world-in-numbers/render")
    assert res.status_code == 202
    job = _wait_job(client, res.json()["job"]["id"])
    assert job["status"] == "succeeded", job
    assert job["progress"] == 1.0
    assert "video_url" in job["output"]


def test_failed_demo_render_surfaces_last_line():
    table = JobTable()
    job = table.start(
        "demo_render:x",
        lambda j: studio_catalog.render_demo_job(
            "x", j, command=[sys.executable, "-c", "print('Error: npx missing'); raise SystemExit(1)"]
        ),
        pass_job=True,
    )
    deadline = time.time() + 10
    while table.get(job.id).status == "running":
        assert time.time() < deadline
        time.sleep(0.02)
    assert table.get(job.id).status == "failed"
    assert "npx missing" in table.get(job.id).error
