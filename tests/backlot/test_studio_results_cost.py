"""Results, cost and settings (docs/ui-plan/phases/phase-6-results-and-cost.md)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backlot import server as server_mod
from backlot import state as state_mod
from backlot import studio_cost, studio_settings, studio_setup
from backlot.studio_api import TOKEN_HEADER
from lib.checkpoint import CANONICAL_STAGE_ARTIFACTS, init_project, write_checkpoint
from lib.config_model import OpenMontageConfig
from tests.contracts.test_phase0_contracts import sample_artifact
from tools.cost_tracker import CostTracker

PID = "result-demo"
PIPELINE = "animated-explainer"
REPO_CONFIG = Path(__file__).resolve().parents[2] / "config.yaml"
has_ffmpeg = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@pytest.fixture
def root(tmp_path, monkeypatch):
    root = tmp_path / "projects"
    root.mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "_summary_cache", {})
    monkeypatch.setattr(server_mod, "_PROJECTS_ROOT_STR", os.path.normcase(str(root.resolve())))
    monkeypatch.setattr(studio_setup, "probe_cache", studio_setup.ProbeCache())
    config = tmp_path / "config.yaml"
    shutil.copy(REPO_CONFIG, config)
    monkeypatch.setattr(studio_settings, "CONFIG_PATH", config)
    init_project(PID, title="Result demo", pipeline_type=PIPELINE, pipeline_dir=root)
    return root


@pytest.fixture
def client(root, monkeypatch):
    async def no_watch():
        return None

    monkeypatch.setattr(server_mod, "_watch_projects", no_watch)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as c:
        c.headers[TOKEN_HEADER] = c.get("/api/v1/session").json()["token"]
        yield c


def _entry(i, tool, status, est=0.0, res=0.0, act=0.0, ts="2026-11-10T09:00:00+00:00"):
    return {"id": f"e{i}", "tool": tool, "operation": "generate", "status": status,
            "estimated_usd": est, "reserved_usd": res, "actual_usd": act, "timestamp": ts}


LEDGER = {
    "version": "1.0",
    "budget_total_usd": 5.0,
    "entries": [
        _entry(1, "flux_image", "completed", est=0.3, act=0.25, ts="2026-11-10T08:30:00+00:00"),
        _entry(2, "flux_image", "failed", est=0.3, act=0.1, ts="2026-11-10T08:40:00+00:00"),
        _entry(3, "elevenlabs_tts", "reserved", est=0.4, res=0.4, ts="2026-11-10T09:30:00+00:00"),
        _entry(4, "kling_video", "refunded", est=1.2, ts="2026-11-10T09:35:00+00:00"),
        _entry(5, "kling_video", "estimated", est=0.9, ts="2026-11-10T09:40:00+00:00"),
        _entry(6, "piper_tts", "completed", ts="2026-11-10T09:45:00+00:00"),
    ],
}


def _write_ledger(root, ledger=LEDGER):
    (root / PID / "cost_log.json").write_text(json.dumps(ledger))


# ---- cost ----------------------------------------------------------------------


def test_cost_totals_match_the_tracker_for_every_status(client, root):
    _write_ledger(root)
    data = client.get(f"/api/v1/projects/{PID}/cost").json()
    expected = CostTracker(cost_log_path=root / PID / "cost_log.json").cost_snapshot()
    assert data["snapshot"] == {**expected, "budget_remaining_usd": expected["budget_remaining_usd"]}
    assert data["snapshot"] == {"total_spent_usd": 0.35, "total_reserved_usd": 0.4, "budget_remaining_usd": 4.25}
    assert data["budget_total_usd"] == 5.0 and data["budget_mode"] == "warn"
    assert data["by_status"] == {
        "estimated": {"count": 1, "usd": 0.9},
        "reserved": {"count": 1, "usd": 0.4},
        "completed": {"count": 2, "usd": 0.25},
        "failed": {"count": 1, "usd": 0.1},
        "refunded": {"count": 1, "usd": 1.2},
    }
    tools = {r["tool"]: r for r in data["by_tool"]}
    assert tools["flux_image"] == {"tool": "flux_image", "spent_usd": 0.35, "reserved_usd": 0.0, "count": 2,
                                   "free": False}
    # Refunded paid work is not "free"; a $0 local tool is.
    assert tools["kling_video"]["free"] is False and tools["piper_tts"]["free"] is True
    assert tools["elevenlabs_tts"]["reserved_usd"] == 0.4
    assert tools["kling_video"]["spent_usd"] == 0.0 and tools["piper_tts"]["count"] == 1
    assert [e["id"] for e in data["entries"]][0] == "e6"  # newest first
    assert sum(r["spent_usd"] for r in data["by_tool"]) == pytest.approx(data["snapshot"]["total_spent_usd"])


def test_entries_are_attributed_to_stages_by_checkpoint_time():
    marks = [
        ("research", datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)),
        ("proposal", datetime(2026, 11, 10, 10, 0, tzinfo=timezone.utc)),
    ]
    at = lambda h, m: datetime(2026, 11, 10, h, m, tzinfo=timezone.utc)  # noqa: E731
    assert studio_cost.stage_for(at(8, 30), marks) == "research"
    assert studio_cost.stage_for(at(9, 0), marks) == "research"
    assert studio_cost.stage_for(at(9, 30), marks) == "proposal"
    assert studio_cost.stage_for(at(11, 0), marks) is None
    assert studio_cost.stage_for(None, marks) is None


def test_stage_breakdown_uses_real_checkpoints(client, root):
    artifact = CANONICAL_STAGE_ARTIFACTS["research"]
    write_checkpoint(root, PID, "research", "completed", {artifact: sample_artifact(artifact)}, pipeline_type=PIPELINE)
    cp = json.loads((root / PID / "checkpoint_research.json").read_text())
    ledger = {**LEDGER, "entries": [
        _entry(1, "a", "completed", act=0.5, ts="2000-01-01T00:00:00+00:00"),
        _entry(2, "b", "completed", act=0.25, ts="2999-01-01T00:00:00+00:00"),
    ]}
    _write_ledger(root, ledger)
    rows = client.get(f"/api/v1/projects/{PID}/cost").json()["by_stage"]
    assert cp["timestamp"]
    assert {r["stage"]: r["spent_usd"] for r in rows} == {"research": 0.5, "proposal": 0.25}


def test_no_ledger_and_broken_ledgers(client, root):
    data = client.get(f"/api/v1/projects/{PID}/cost").json()
    assert data["has_log"] is False and data["snapshot"] is None
    assert data["budget_total_usd"] == 10.0  # config default when no intake

    (root / PID / "cost_log.json").write_text("{not json")
    assert client.get(f"/api/v1/projects/{PID}/cost").json()["has_log"] is False
    # An entry the tracker can't load (no status) is skipped, not fatal.
    _write_ledger(root, {"version": "1.0", "entries": [{"id": "x", "tool": "t"},
                                                         _entry(2, "t", "completed", act=1.0)]})
    data = client.get(f"/api/v1/projects/{PID}/cost").json()
    assert data["snapshot"]["total_spent_usd"] == 1.0 and len(data["entries"]) == 1
    assert client.get("/api/v1/projects/missing/cost").status_code == 404


def test_month_to_date_spend_across_projects(client, root):
    _write_ledger(root)
    init_project("other", title="Other", pipeline_type=PIPELINE, pipeline_dir=root)
    (root / "other" / "cost_log.json").write_text(json.dumps({"version": "1.0", "entries": [
        _entry(1, "x", "completed", act=2.0, ts="2026-10-31T23:59:00+00:00"),
        _entry(2, "x", "completed", act=0.5, ts="2026-11-01T00:00:00+00:00"),
        _entry(3, "x", "reserved", res=9.0, ts="2026-11-02T00:00:00+00:00"),
    ]}))
    data = client.get("/api/v1/cost/summary", params={"since": "2026-11-01T00:00:00+00:00"}).json()
    assert data["spent_usd"] == pytest.approx(0.85) and data["projects"] == 2
    assert client.get("/api/v1/cost/summary", params={"since": "nope"}).status_code == 422
    assert client.get("/api/v1/cost/summary", params={"since": "2026-11-01T00:00:00"}).status_code == 422


# ---- settings ----------------------------------------------------------------------


SETTINGS = {
    "budget": {"mode": "cap", "total_usd": 25.5, "single_action_approval_usd": 1.0,
               "require_approval_for_new_paid_tool": False},
    "checkpoint": {"policy": "manual_all"},
    "output": {"default_resolution": "1080x1920", "default_fps": 60},
}


def test_settings_round_trip_keeps_comments_and_other_keys(client):
    before = studio_settings.CONFIG_PATH.read_text()
    assert client.get("/api/v1/settings").json()["settings"]["budget"]["mode"] == "warn"
    res = client.put("/api/v1/settings", json=SETTINGS)
    assert res.status_code == 200, res.text
    assert res.json()["settings"] == SETTINGS
    after = studio_settings.CONFIG_PATH.read_text()
    assert "  mode: cap                      # observe | warn | cap" in after
    assert '  default_resolution: "1080x1920"' in after
    # Everything else is byte-identical.
    changed = [(a, b) for a, b in zip(before.splitlines(), after.splitlines()) if a != b]
    assert len(changed) == 7 and len(before.splitlines()) == len(after.splitlines())
    cfg = OpenMontageConfig.load(studio_settings.CONFIG_PATH)  # what the next agent run reads
    assert cfg.budget.mode.value == "cap" and cfg.budget.total_usd == 25.5
    assert cfg.checkpoint.policy.value == "manual_all" and cfg.output.default_fps == 60
    assert cfg.budget.reserve_pct == 0.10 and cfg.llm.provider == "anthropic"


@pytest.mark.parametrize(
    "patch,loc",
    [
        ({"budget": {"mode": "spend"}}, ["body", "budget", "mode"]),
        ({"budget": {"total_usd": -1}}, ["body", "budget", "total_usd"]),
        ({"output": {"default_fps": 29}}, ["body", "output", "default_fps"]),
        ({"output": {"default_resolution": "1920*1080"}}, ["body", "output", "default_resolution"]),
        ({"checkpoint": {"storage_dir": "/tmp"}}, ["body", "checkpoint", "storage_dir"]),
    ],
)
def test_invalid_settings_are_422_with_the_field(client, patch, loc):
    body = json.loads(json.dumps(SETTINGS))
    for section, keys in patch.items():
        body[section].update(keys)
    before = studio_settings.CONFIG_PATH.read_text()
    res = client.put("/api/v1/settings", json=body)
    assert res.status_code == 422
    assert loc in [e["loc"] for e in res.json()["detail"]]
    assert studio_settings.CONFIG_PATH.read_text() == before


def test_settings_add_missing_keys_and_sections(tmp_path):
    cfg = tmp_path / "c.yaml"
    cfg.write_text("# mine\nbudget:\n  mode: warn\n\nllm:\n  provider: openai\n")
    studio_settings.write_settings(studio_settings.SettingsIn(**SETTINGS), cfg)
    text = cfg.read_text()
    assert text.startswith("# mine\nbudget:\n  mode: cap\n  total_usd: 25.50\n")
    assert "llm:\n  provider: openai" in text
    loaded = OpenMontageConfig.load(cfg)
    assert loaded.output.default_resolution == "1080x1920" and loaded.llm.provider == "openai"


def test_settings_need_the_token_and_can_be_locked(client, monkeypatch):
    assert client.put("/api/v1/settings", json=SETTINGS, headers={TOKEN_HEADER: "x"}).status_code == 403
    monkeypatch.setenv("STUDIO_READONLY_CONFIG", "1")
    assert client.put("/api/v1/settings", json=SETTINGS).status_code == 403


# ---- results & download -------------------------------------------------------------


def _render(root, name="final.mp4", data=b"video"):
    renders = root / PID / "renders"
    renders.mkdir(exist_ok=True)
    (renders / name).write_bytes(data)
    return renders / name


def test_download_flag_sets_attachment_and_keeps_the_guard(client, root):
    _render(root)
    plain = client.get(f"/media/{PID}/renders/final.mp4")
    assert "attachment" not in plain.headers.get("content-disposition", "")
    res = client.get(f"/media/{PID}/renders/final.mp4", params={"download": 1})
    assert res.status_code == 200 and res.content == b"video"
    assert res.headers["content-disposition"] == 'attachment; filename="final.mp4"'
    (root / "secret.txt").write_text("x")
    assert client.get(f"/media/{PID}/..%2Fsecret.txt", params={"download": 1}).status_code in (403, 404)
    assert client.get(f"/media/{PID}/renders/../../secret.txt", params={"download": 1}).status_code in (403, 404)


def test_results_list_variants_with_report_labels_and_publish_text(client, root):
    _render(root, "final.mp4")
    _render(root, "final_vertical.mp4")
    arts = root / PID / "artifacts"
    arts.mkdir(exist_ok=True)
    (arts / "render_report.json").write_text(json.dumps({"version": "1.0", "outputs": [
        {"path": "renders/final_vertical.mp4", "resolution": "1080x1920", "duration_seconds": 31.5,
         "fps": 30, "platform_target": "TikTok"},
    ]}))
    (arts / "publish_log.json").write_text(json.dumps({"version": "1.0", "entries": [
        {"platform": "youtube", "status": "draft", "timestamp": "2026-11-10T09:00:00Z",
         "metadata_used": {"title": "Old", "description": "old"}},
        {"platform": "tiktok", "status": "exported", "timestamp": "2026-11-10T10:00:00Z",
         "export_path": "renders/final_vertical.mp4",
         "metadata_used": {"title": "Rain in 30s", "description": "Why it rains.", "hashtags": ["weather", "#science"]}},
    ]}))
    data = client.get(f"/api/v1/projects/{PID}/results").json()
    by_name = {r["name"]: r for r in data["renders"]}
    assert by_name["final_vertical.mp4"]["label"] == "TikTok"
    assert by_name["final_vertical.mp4"]["resolution"] == "1080x1920"
    assert by_name["final_vertical.mp4"]["duration_s"] == 31.5 and by_name["final_vertical.mp4"]["in_report"]
    assert by_name["final.mp4"]["label"] is None and not by_name["final.mp4"]["in_report"]
    assert data["publish"] == {"source": "publish_log", "platform": "tiktok", "title": "Rain in 30s",
                               "description": "Why it rains.", "hashtags": ["#weather", "#science"]}
    assert data["export"]["kind"] == "file" and data["export"]["name"] == "final_vertical.mp4"
    res = client.get(f"/api/v1/projects/{PID}/export")
    assert res.status_code == 200 and 'filename="final_vertical.mp4"' in res.headers["content-disposition"]


def test_export_folder_is_zipped_and_outside_paths_are_ignored(client, root, tmp_path):
    assert client.get(f"/api/v1/projects/{PID}/export").status_code == 404
    assert client.get(f"/api/v1/projects/{PID}/results").json()["export"] is None
    bundle = root / PID / "export"
    (bundle / "captions").mkdir(parents=True)
    (bundle / "video.mp4").write_bytes(b"v" * 100)
    (bundle / "captions" / "en.srt").write_text("1\n00:00:00,000 --> 00:00:01,000\nHi\n")
    outside = tmp_path / "elsewhere"
    outside.mkdir()
    arts = root / PID / "artifacts"
    arts.mkdir(exist_ok=True)
    (arts / "publish_log.json").write_text(json.dumps({"version": "1.0", "entries": [
        {"platform": "x", "status": "exported", "timestamp": "2026-11-10T11:00:00Z", "export_path": str(outside)},
        {"platform": "youtube", "status": "exported", "timestamp": "2026-11-10T10:00:00Z", "export_path": "export"},
    ]}))
    info = client.get(f"/api/v1/projects/{PID}/results").json()["export"]
    assert info["kind"] == "folder" and info["files"] == 2 and info["platform"] == "youtube"
    res = client.get(f"/api/v1/projects/{PID}/export")
    assert res.headers["content-type"] == "application/zip"
    assert f'filename="{PID}-export.zip"' in res.headers["content-disposition"]
    names = zipfile.ZipFile(BytesIO(res.content)).namelist()
    assert sorted(names) == ["captions/en.srt", "video.mp4"]


@pytest.mark.parametrize("export_path", [".", "", "absolute-root"])
def test_export_path_naming_the_project_itself_is_ignored(client, root, export_path):
    if export_path == "absolute-root":
        export_path = str(root / PID)
    arts = root / PID / "artifacts"
    arts.mkdir(exist_ok=True)
    (arts / "publish_log.json").write_text(json.dumps({"version": "1.0", "entries": [
        {"platform": "x", "status": "exported", "timestamp": "2026-11-10T11:00:00Z", "export_path": export_path},
    ]}))
    assert client.get(f"/api/v1/projects/{PID}/results").json()["export"] is None
    assert client.get(f"/api/v1/projects/{PID}/export").status_code == 404


@pytest.mark.skipif(not has_ffmpeg, reason="ffmpeg/ffprobe not installed")
def test_results_probe_renders_without_a_report(client, root):
    clip = _render(root, "final.mp4", b"")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(clip)], check=True)
    r = client.get(f"/api/v1/projects/{PID}/results").json()["renders"][0]
    assert r["resolution"] == "320x240" and 0.8 < r["duration_s"] < 1.3
