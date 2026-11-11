"""Studio API v1 skeleton (docs/ui-plan/phases/phase-0-foundation.md).

Covers the session endpoint, the CSRF guard on non-GET /api/v1 requests, the
/studio SPA mount, and the DiskProjectStore path guard + atomic writes.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from backlot import server as server_mod
from backlot import state as state_mod
from backlot.project_store import (
    DiskProjectStore,
    InvalidProjectId,
    PathEscapesProject,
    ProjectStore,
    UnknownProject,
)
from backlot.studio_api import TOKEN_HEADER


@pytest.fixture
def projects_root(tmp_path, monkeypatch):
    root = tmp_path / "projects"
    root.mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "_summary_cache", {})
    return root


@pytest.fixture
def studio_dist(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root>studio-shell</div>", encoding="utf-8")
    (dist / "assets" / "app-abc123.js").write_text("console.log('studio')", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    monkeypatch.setattr(server_mod, "STUDIO_DIST_DIR", dist)
    return dist


@pytest.fixture
def client(projects_root, monkeypatch):
    async def no_watch():
        return None

    monkeypatch.setattr(server_mod, "_watch_projects", no_watch)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as c:
        yield c


def _token(client: TestClient) -> str:
    return client.get("/api/v1/session").json()["token"]


# ---- session ---------------------------------------------------------------


def test_session_returns_token_version_user_and_features(client):
    res = client.get("/api/v1/session")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["token"], str) and len(body["token"]) >= 32
    assert body["version"]
    assert body["user"] == {"id": "local", "display_name": "Local user"}
    assert set(body["features"]) >= {"setup", "wizard", "decisions", "uploads", "cost"}


def test_session_token_is_stable_per_app_and_unique_across_apps(client):
    assert _token(client) == _token(client)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as other:
        assert _token(other) != _token(client)


# ---- CSRF guard ------------------------------------------------------------


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_write_without_token_is_rejected_even_for_unknown_routes(client, method):
    res = getattr(client, method)("/api/v1/anything")
    assert res.status_code == 403
    assert "token" in res.json()["detail"]


def test_write_with_wrong_token_is_rejected(client):
    res = client.post("/api/v1/anything", headers={TOKEN_HEADER: "nope"})
    assert res.status_code == 403


def test_write_with_token_passes_guard(client):
    # Guard passes → routing decides (no POST routes exist yet in Phase 0).
    res = client.post("/api/v1/anything", headers={TOKEN_HEADER: _token(client)})
    assert res.status_code in (404, 405)


def test_cross_origin_write_is_rejected_even_with_token(client):
    res = client.post(
        "/api/v1/anything",
        headers={TOKEN_HEADER: _token(client), "Origin": "http://evil.example"},
    )
    assert res.status_code == 403
    assert "cross-origin" in res.json()["detail"]


@pytest.mark.parametrize("origin", ["http://127.0.0.1:4750", "http://localhost:5173"])
def test_local_origins_are_allowed(client, origin):
    res = client.post("/api/v1/anything", headers={TOKEN_HEADER: _token(client), "Origin": origin})
    assert res.status_code in (404, 405)


def test_guard_does_not_touch_read_only_board_routes(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/projects").status_code == 200


def test_untrusted_host_is_rejected_for_v1(projects_root, monkeypatch):
    async def no_watch():
        return None

    monkeypatch.setattr(server_mod, "_watch_projects", no_watch)
    with TestClient(server_mod.create_app(), base_url="http://evil.example") as c:
        assert c.get("/api/v1/session").status_code == 400


# ---- /studio SPA mount -----------------------------------------------------


def test_studio_not_built_returns_helpful_503(client, tmp_path, monkeypatch):
    monkeypatch.setattr(server_mod, "STUDIO_DIST_DIR", tmp_path / "missing")
    res = client.get("/studio")
    assert res.status_code == 503
    assert "make studio-build" in res.text


@pytest.mark.parametrize("path", ["/studio", "/studio/", "/studio/library", "/studio/p/some-project"])
def test_studio_deep_links_serve_the_shell(client, studio_dist, path):
    res = client.get(path)
    assert res.status_code == 200
    assert "studio-shell" in res.text
    assert res.headers["cache-control"] == "no-cache"


def test_studio_serves_real_files_and_caches_hashed_assets(client, studio_dist):
    asset = client.get("/studio/assets/app-abc123.js")
    assert asset.status_code == 200
    assert "console.log" in asset.text
    assert asset.headers.get("cache-control") != "no-cache"
    assert client.get("/studio/favicon.svg").text == "<svg/>"


def test_studio_missing_asset_is_404_not_shell(client, studio_dist):
    assert client.get("/studio/assets/gone-123.js").status_code == 404


def test_studio_path_escape_is_rejected(client, studio_dist):
    res = client.get("/studio/..%2F..%2Fsecret.txt")
    assert res.status_code in (403, 404)
    assert "studio-shell" not in res.text


# ---- DiskProjectStore ------------------------------------------------------


def test_disk_store_satisfies_protocol(tmp_path):
    assert isinstance(DiskProjectStore(tmp_path), ProjectStore)


def test_disk_store_lists_and_checks_projects(tmp_path):
    (tmp_path / "b-film").mkdir()
    (tmp_path / "a-film").mkdir()
    (tmp_path / "_hidden").mkdir()
    (tmp_path / "file.txt").write_text("x")
    store = DiskProjectStore(tmp_path)
    assert store.list_ids() == ["a-film", "b-film"]
    assert store.exists("a-film")
    assert not store.exists("nope")


def test_disk_store_round_trips_json_atomically(tmp_path):
    (tmp_path / "film").mkdir()
    store = DiskProjectStore(tmp_path)
    assert store.read_json("film", "studio/intake.json") is None
    store.write_json("film", "studio/intake.json", {"goal": "explain-topic", "topic": "Hố đen"})
    assert store.read_json("film", "studio/intake.json") == {"goal": "explain-topic", "topic": "Hố đen"}
    leftovers = [p.name for p in (tmp_path / "film" / "studio").iterdir()]
    assert leftovers == ["intake.json"]
    json.loads((tmp_path / "film" / "studio" / "intake.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("bad_id", ["", ".", "..", "a/b", "a\\b", "C:", "x\x00y"])
def test_disk_store_rejects_bad_project_ids(tmp_path, bad_id):
    with pytest.raises(InvalidProjectId):
        DiskProjectStore(tmp_path).exists(bad_id)


def test_disk_store_unknown_project(tmp_path):
    with pytest.raises(UnknownProject):
        DiskProjectStore(tmp_path).write_json("ghost", "studio/x.json", {})


@pytest.mark.parametrize("rel", ["../escape.json", "/etc/passwd", "studio/../../x.json", ".", "a\x00b"])
def test_disk_store_rejects_path_escapes(tmp_path, rel):
    (tmp_path / "film").mkdir()
    with pytest.raises(PathEscapesProject):
        DiskProjectStore(tmp_path).write_json("film", rel, {})
