"""Setup center (docs/ui-plan/phases/phase-2-setup-center.md).

The capability probe itself is a subprocess over the real registry; here it
is replaced with fixtures so tier, unlock-offer and video-type logic, the
.env writer and the API contract are tested deterministically.
"""

from __future__ import annotations

import os
import stat
import sys
import time

import pytest
from fastapi.testclient import TestClient

from backlot import server as server_mod
from backlot import state as state_mod
from backlot import studio_setup
from backlot.studio_api import TOKEN_HEADER
from backlot.studio_jobs import JobTable

SECRET = "sk-test-0123456789abcdef"


def _tool(name, capability, *, available=False, env=(), runtime="api", provider=None, hint=""):
    return {
        "name": name,
        "capability": capability,
        "provider": provider or name.split("_")[0],
        "runtime": runtime,
        "available": available,
        "env_vars": list(env),
        "install_instructions": hint,
    }


def _summary(configured: dict[str, int]) -> dict:
    return {
        "composition_runtimes": {"ffmpeg": True, "remotion": True, "hyperframes": False},
        "capabilities": [
            {
                "capability": cap,
                "configured": n,
                "total": max(n, 1),
                "available_providers": ["local"] if n else [],
                "unavailable_providers": [],
            }
            for cap, n in configured.items()
        ],
        "setup_offers": [],
        "runtime_warnings": ["hyperframes: npx not found"],
    }


def zero_key_probe() -> dict:
    return {
        "summary": _summary({"tts": 1, "video_post": 3, "image_generation": 0}),
        "tools": [
            _tool("piper_tts", "tts", available=True, runtime="local", provider="piper"),
            _tool("video_compose", "video_post", available=True, runtime="local"),
            _tool(
                "fal_image", "image_generation", env=["FAL_KEY"], provider="fal",
                hint="Set FAL_KEY. Create a key at https://fal.ai/dashboard/keys.",
            ),
            _tool("fal_video", "video_generation", env=["FAL_KEY"], provider="fal"),
            _tool(
                "pexels_image", "image_generation", env=["PEXELS_API_KEY"], provider="pexels",
                hint="Free key at https://www.pexels.com/api/",
            ),
            _tool("suno_music", "music_generation", env=["SUNO_API_KEY"], provider="suno"),
            _tool("two_key_tool", "avatar", env=["A_KEY", "B_KEY"]),
            _tool("wan_local", "video_generation", runtime="local_gpu", hint="Needs a CUDA GPU"),
        ],
        "pipelines": [
            {"pipeline": "animated-explainer", "stability": "production",
             "missing_required": ["image_generation"], "missing_enhancements": ["music_generation"]},
            {"pipeline": "cinematic", "stability": "production",
             "missing_required": [], "missing_enhancements": ["video_generation"]},
            {"pipeline": "clip-factory", "stability": "beta",
             "missing_required": [], "missing_enhancements": []},
        ],
    }


# ---- tier ------------------------------------------------------------------


@pytest.mark.parametrize(
    "configured,tools,tier",
    [
        ({"tts": 1}, [], "zero_key"),
        ({"image_generation": 2}, [], "starter"),
        ({"image_generation": 1, "tts": 1, "music_generation": 1}, [], "standard"),
        (
            {"image_generation": 1, "tts": 1, "music_generation": 1},
            [_tool("kling", "video_generation", available=True)],
            "full",
        ),
        (
            {"image_generation": 1, "tts": 1, "music_generation": 1},
            [_tool("wan", "video_generation", available=True, runtime="local_gpu")],
            "full_gpu",
        ),
    ],
)
def test_compute_tier(configured, tools, tier):
    assert studio_setup.compute_tier(_summary(configured), tools) == tier


# ---- offers & view -----------------------------------------------------------


def test_offers_rank_keys_that_unlock_video_types_first():
    offers = studio_setup.unlock_offers(zero_key_probe())
    keys = [o["env_var"] for o in offers]
    # FAL_KEY unlocks animated-explainer AND improves cinematic; PEXELS only unlocks.
    assert keys[:2] == ["FAL_KEY", "PEXELS_API_KEY"]
    fal = offers[0]
    assert fal["unlocks_video_types"] == ["animated-explainer"]
    assert fal["improves_video_types"] == ["cinematic"]
    assert fal["new_capabilities"] == ["image_generation", "video_generation"]
    assert fal["signup_url"] == "https://fal.ai/dashboard/keys"
    # Tools needing two keys are not offered as one-minute fixes.
    assert "A_KEY" not in keys and "B_KEY" not in keys


def test_build_view(tmp_path):
    env = tmp_path / ".env"
    env.write_text(f"FAL_KEY={SECRET}\n", encoding="utf-8")
    view = studio_setup.build_view(zero_key_probe(), env_path=env)
    assert view["tier"] == "zero_key" and view["tier_label"] == "Zero-key"
    assert {w["capability"] for w in view["works_now"]} == {"tts", "video_post"}
    states = {v["pipeline"]: v["state"] for v in view["video_types"]}
    assert states == {"animated-explainer": "locked", "cinematic": "limited", "clip-factory": "ready"}
    assert len(view["suggested_offers"]) <= studio_setup.MAX_SUGGESTED_OFFERS
    assert [h["tool"] for h in view["hardware"]] == ["wan_local"]
    assert view["warnings"] == ["hyperframes: npx not found"]
    assert view["keys"]["FAL_KEY"] == {"set": True, "hint": "••••cdef", "source": "env_file"}
    assert view["keys"]["PEXELS_API_KEY"]["set"] is False
    assert SECRET not in str(view)


def test_allowed_keys_come_from_tool_dependencies():
    assert studio_setup.allowed_env_keys(zero_key_probe()) == {
        "FAL_KEY", "PEXELS_API_KEY", "SUNO_API_KEY", "A_KEY", "B_KEY",
    }
    assert studio_setup.allowed_env_keys(None) == set()


def test_probe_env_puts_interpreter_bin_first(monkeypatch):
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    path = studio_setup.probe_env()["PATH"].split(os.pathsep)
    assert path[0] == os.path.dirname(sys.executable)
    assert path[1:] == ["/usr/bin", "/bin"]


# ---- .env writer -------------------------------------------------------------


def test_write_env_preserves_comments_order_and_other_keys(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "# Provider keys\nOPENAI_API_KEY=abc\n\n# FAL_KEY=put-yours-here\nFAL_KEY=old\nZED=1\n",
        encoding="utf-8",
    )
    studio_setup.write_env_var("FAL_KEY", "new-value", env_path=env)
    assert env.read_text(encoding="utf-8") == (
        "# Provider keys\nOPENAI_API_KEY=abc\n\n# FAL_KEY=put-yours-here\nFAL_KEY=new-value\nZED=1\n"
    )


def test_write_env_appends_new_key_and_creates_file(tmp_path):
    env = tmp_path / ".env"
    studio_setup.write_env_var("PEXELS_API_KEY", "p1", env_path=env)
    studio_setup.write_env_var("FAL_KEY", "f1", env_path=env)
    assert studio_setup.read_env_file(env) == {"PEXELS_API_KEY": "p1", "FAL_KEY": "f1"}
    assert stat.S_IMODE(env.stat().st_mode) == 0o600
    assert [p.name for p in tmp_path.iterdir()] == [".env"]  # no temp files left


def test_write_env_empty_value_removes_key_and_duplicates(tmp_path):
    env = tmp_path / ".env"
    env.write_text("FAL_KEY=a\nKEEP=1\nexport FAL_KEY=b\n", encoding="utf-8")
    studio_setup.write_env_var("FAL_KEY", "", env_path=env)
    assert env.read_text(encoding="utf-8") == "KEEP=1\n"


def test_write_env_quotes_values_that_need_it(tmp_path):
    env = tmp_path / ".env"
    studio_setup.write_env_var("MAI_ENDPOINT", 'has space #hash "q"', env_path=env)
    assert studio_setup.read_env_file(env)["MAI_ENDPOINT"] == 'has space #hash "q"'
    assert env.read_text(encoding="utf-8").startswith('MAI_ENDPOINT="')


@pytest.mark.parametrize("key,value", [("lower", "x"), ("A", "x"), ("OK_KEY", "two\nlines"), ("OK_KEY", "nul\x00")])
def test_write_env_rejects_bad_input(tmp_path, key, value):
    with pytest.raises(ValueError):
        studio_setup.write_env_var(key, value, env_path=tmp_path / ".env")


def test_env_status_masks_short_values_and_reads_environment(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("SHORT=abc\n", encoding="utf-8")
    monkeypatch.setenv("FROM_ENV", "environment-value-1234")
    status = studio_setup.env_status(["SHORT", "FROM_ENV", "MISSING"], env_path=env)
    assert status["SHORT"] == {"set": True, "hint": "••••", "source": "env_file"}
    assert status["FROM_ENV"] == {"set": True, "hint": "••••1234", "source": "environment"}
    assert status["MISSING"] == {"set": False, "hint": None, "source": None}


# ---- jobs ----------------------------------------------------------------


def _wait(table: JobTable, job_id: str, timeout: float = 5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = table.get(job_id)
        if job and job.status != "running":
            return job
        time.sleep(0.01)
    raise AssertionError("job did not finish")


def test_job_table_success_failure_and_dedupe():
    table = JobTable()
    gate = __import__("threading").Event()
    seen = []
    slow = table.start("probe", lambda: gate.wait(2) and 42, on_success=seen.append)
    assert table.start("probe", lambda: 0).id == slow.id  # deduped while running
    gate.set()
    assert _wait(table, slow.id).result == 42 and seen == [42]

    failing = table.start("probe", lambda: 1 / 0)
    job = _wait(table, failing.id)
    assert job.status == "failed" and "division" in job.error


# ---- API -------------------------------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    root = tmp_path / "projects"
    root.mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "_summary_cache", {})
    monkeypatch.setattr(studio_setup, "ENV_PATH", tmp_path / ".env")
    monkeypatch.setattr(studio_setup, "probe_cache", studio_setup.ProbeCache())
    monkeypatch.setattr("backlot.studio_api.jobs", JobTable())
    monkeypatch.setattr(studio_setup, "run_probe", zero_key_probe)
    monkeypatch.delenv("STUDIO_READONLY_ENV", raising=False)

    async def no_watch():
        return None

    monkeypatch.setattr(server_mod, "_watch_projects", no_watch)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as c:
        c.headers[TOKEN_HEADER] = c.get("/api/v1/session").json()["token"]
        yield c


def _ready_view(client):
    first = client.get("/api/v1/setup")
    if first.status_code == 202:
        job_id = first.json()["job"]["id"]
        deadline = time.time() + 5
        while client.get(f"/api/v1/jobs/{job_id}").json()["status"] == "running":
            assert time.time() < deadline
            time.sleep(0.02)
        first = client.get("/api/v1/setup")
    assert first.status_code == 200
    return first.json()


def test_setup_checks_then_returns_view(client):
    first = client.get("/api/v1/setup")
    assert first.status_code == 202
    assert first.json()["status"] == "checking"
    view = _ready_view(client)
    assert view["tier"] == "zero_key"
    assert view["suggested_offers"][0]["env_var"] == "FAL_KEY"
    assert view["rechecking"] is None


def test_put_env_writes_key_without_echoing_value(client, tmp_path):
    _ready_view(client)
    res = client.put("/api/v1/setup/env", json={"key": "FAL_KEY", "value": f"  {SECRET}  "})
    assert res.status_code == 200
    assert res.json() == {"key": "FAL_KEY", "set": True, "hint": "••••cdef", "source": "env_file"}
    assert SECRET not in res.text
    assert studio_setup.read_env_file(tmp_path / ".env") == {"FAL_KEY": SECRET}
    assert client.get("/api/v1/setup").json()["keys"]["FAL_KEY"]["set"] is True

    cleared = client.put("/api/v1/setup/env", json={"key": "FAL_KEY", "value": ""})
    assert cleared.json()["set"] is False


def test_put_env_rejects_unknown_keys_and_bad_values(client):
    _ready_view(client)
    assert client.put("/api/v1/setup/env", json={"key": "PATH", "value": "/x"}).status_code == 422
    bad = client.put("/api/v1/setup/env", json={"key": "FAL_KEY", "value": "a\nb"})
    assert bad.status_code == 422


def test_put_env_needs_probe_token_and_writable_env(client, monkeypatch):
    assert client.put("/api/v1/setup/env", json={"key": "FAL_KEY", "value": "x"}).status_code == 409
    _ready_view(client)
    no_token = client.put(
        "/api/v1/setup/env", json={"key": "FAL_KEY", "value": "x"}, headers={TOKEN_HEADER: ""}
    )
    assert no_token.status_code == 403
    monkeypatch.setenv("STUDIO_READONLY_ENV", "1")
    assert client.put("/api/v1/setup/env", json={"key": "FAL_KEY", "value": "x"}).status_code == 403


def test_recheck_runs_a_new_probe(client, monkeypatch):
    _ready_view(client)
    probe = zero_key_probe()
    probe["summary"] = _summary({"tts": 1, "image_generation": 1})
    monkeypatch.setattr(studio_setup, "run_probe", lambda: probe)
    res = client.post("/api/v1/setup/recheck")
    assert res.status_code == 202
    job_id = res.json()["job"]["id"]
    deadline = time.time() + 5
    while client.get(f"/api/v1/jobs/{job_id}").json()["status"] == "running":
        assert time.time() < deadline
        time.sleep(0.02)
    assert client.get("/api/v1/setup").json()["tier"] == "starter"


def test_failed_probe_is_reported_on_the_job(client, monkeypatch):
    def boom():
        raise RuntimeError("capability check failed: boom")

    monkeypatch.setattr(studio_setup, "run_probe", boom)
    job_id = client.get("/api/v1/setup").json()["job"]["id"]
    deadline = time.time() + 5
    while (job := client.get(f"/api/v1/jobs/{job_id}").json())["status"] == "running":
        assert time.time() < deadline
        time.sleep(0.02)
    assert job["status"] == "failed" and "boom" in job["error"]


def test_unknown_job_is_404(client):
    assert client.get("/api/v1/jobs/nope").status_code == 404
