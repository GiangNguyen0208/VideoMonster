"""Footage, reference links and the music library
(docs/ui-plan/phases/phase-5-footage-and-references.md)."""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import tracemalloc

import pytest
from fastapi.testclient import TestClient

from backlot import server as server_mod
from backlot import state as state_mod
from backlot import studio_setup, studio_uploads
from backlot.studio_api import TOKEN_HEADER
from lib.checkpoint import CANONICAL_STAGE_ARTIFACTS, init_project, write_checkpoint
from tests.contracts.test_phase0_contracts import sample_artifact

PID = "footage-demo"
PIPELINE = "talking-head"
has_ffmpeg = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@pytest.fixture
def root(tmp_path, monkeypatch):
    root = tmp_path / "projects"
    root.mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", root)
    monkeypatch.setattr(server_mod, "_summary_cache", {})
    monkeypatch.setattr(studio_setup, "probe_cache", studio_setup.ProbeCache())
    monkeypatch.setenv("MUSIC_LIBRARY_DIR", str(tmp_path / "music"))
    init_project(PID, title="Footage demo", pipeline_type=PIPELINE, pipeline_dir=root)
    return root


@pytest.fixture
def client(root, monkeypatch):
    async def no_watch():
        return None

    monkeypatch.setattr(server_mod, "_watch_projects", no_watch)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as c:
        c.headers[TOKEN_HEADER] = c.get("/api/v1/session").json()["token"]
        yield c


def _upload(client, name, content: object = b"x" * 1024, ctype="video/mp4", kind=None, pid=PID):
    params = {"name": name}
    if kind:
        params["kind"] = kind
    return client.post(
        f"/api/v1/projects/{pid}/uploads",
        params=params,
        content=content,
        headers={"Content-Type": ctype},
    )


def _index(root) -> dict:
    return json.loads((root / PID / "studio" / "inputs.json").read_text())


def _start(root) -> None:
    artifact = CANONICAL_STAGE_ARTIFACTS["idea"]
    write_checkpoint(
        root, PID, "idea", "awaiting_human", {artifact: sample_artifact(artifact)}, pipeline_type=PIPELINE
    )


# ---- uploads -----------------------------------------------------------------


def test_upload_lands_in_inputs_and_is_indexed(client, root):
    res = _upload(client, "My talk.mp4")
    assert res.status_code == 201, res.text
    entry = res.json()
    assert entry["path"] == "inputs/My talk.mp4"
    assert entry["kind"] == "footage" and entry["media"] == "video" and entry["size"] == 1024
    assert (root / PID / "inputs" / "My talk.mp4").read_bytes() == b"x" * 1024
    assert [f["path"] for f in _index(root)["files"]] == ["inputs/My talk.mp4"]
    # No partial files left behind.
    assert sorted(p.name for p in (root / PID / "inputs").iterdir()) == ["My talk.mp4"]

    listed = client.get(f"/api/v1/projects/{PID}/inputs").json()
    assert listed["started"] is False and listed["files"][0]["name"] == "My talk.mp4"


def test_duplicate_names_get_a_suffix(client, root):
    assert _upload(client, "clip.mp4").json()["name"] == "clip.mp4"
    assert _upload(client, "clip.mp4").json()["name"] == "clip-2.mp4"
    assert _upload(client, "clip.mp4").json()["name"] == "clip-3.mp4"
    assert len(_index(root)["files"]) == 3


@pytest.mark.parametrize("name", ["../x.mp4", "..", "/etc/passwd.mp4", "a/b.mp4", "a\\b.mp4", "C:x.mp4", "bad\x00.mp4"])
def test_traversal_names_are_rejected(client, root, name):
    res = _upload(client, name)
    assert res.status_code == 400, res.text
    assert res.json()["code"] == "bad_name"
    assert not (root / PID / "inputs").exists() or not any((root / PID / "inputs").iterdir())
    assert not (root / "x.mp4").exists()


@pytest.mark.parametrize(
    "name,ctype",
    [("run.exe", "application/octet-stream"), ("page.html", "text/html"), ("clip.mp4", "text/html"), ("x.png", "video/mp4")],
)
def test_disallowed_types_return_415(client, root, name, ctype):
    res = _upload(client, name, ctype=ctype)
    assert res.status_code == 415
    assert res.json()["code"] == "unsupported_type"


def test_allowed_media_kinds(client):
    assert _upload(client, "voice.m4a", ctype="audio/mp4").json()["media"] == "audio"
    assert _upload(client, "logo.PNG", ctype="image/png").json()["media"] == "image"
    assert _upload(client, "subs.srt", ctype="application/x-subrip").json()["media"] == "subtitle"
    assert _upload(client, "ref.webm", ctype="audio/webm", kind="reference").json()["kind"] == "reference"
    assert _upload(client, "odd.mov", ctype="").status_code == 201


def test_size_cap_and_empty_files(client, root, monkeypatch):
    monkeypatch.setenv("STUDIO_MAX_UPLOAD_MB", "1")
    res = _upload(client, "big.mp4", content=b"x" * (1024 * 1024 + 1))
    assert res.status_code == 413 and res.json()["code"] == "too_large"

    def chunks():  # no Content-Length: the server counts as it streams
        for _ in range(3):
            yield b"x" * (512 * 1024)

    res = _upload(client, "big.mp4", content=chunks())
    assert res.status_code == 413
    assert not any((root / PID / "inputs").iterdir())
    assert _upload(client, "empty.mp4", content=b"").json()["code"] == "empty_file"


def test_large_upload_streams_without_buffering(tmp_path):
    """256 MB written through the server's streaming path never sits in memory.

    Measured on ``stream_to_folder`` itself: TestClient buffers request bodies
    on the client side, which would hide what the server does.
    """
    size = 256 * 1024 * 1024
    block = b"\x00" * (64 * 1024)  # ASGI servers deliver bodies in ~64 KB chunks

    async def chunks():
        for _ in range(size // len(block)):
            yield block

    tracemalloc.start()
    try:
        path, kind = asyncio.run(
            studio_uploads.stream_to_folder(tmp_path / "inputs", "long.mp4", "video/mp4", chunks())
        )
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert kind == "video" and path.stat().st_size == size
    assert peak < 8 * 1024 * 1024, f"peak {peak / 1e6:.1f} MB"


def test_upload_through_the_api_without_content_length(client, root):
    def chunks():
        for _ in range(8):
            yield b"y" * (1024 * 1024)

    res = _upload(client, "long.mp4", content=chunks())
    assert res.status_code == 201, res.text
    assert (root / PID / "inputs" / "long.mp4").stat().st_size == 8 * 1024 * 1024


def test_delete_only_before_the_agent_starts(client, root):
    _upload(client, "a.mp4")
    assert client.delete(f"/api/v1/projects/{PID}/uploads/nope.mp4").json()["code"] == "unknown_file"
    assert client.delete(f"/api/v1/projects/{PID}/uploads/..%2Fx").status_code == 404
    assert client.delete(f"/api/v1/projects/{PID}/uploads/a.mp4").status_code == 204
    assert _index(root)["files"] == [] and not (root / PID / "inputs" / "a.mp4").exists()

    _upload(client, "b.mp4")
    _start(root)
    res = client.delete(f"/api/v1/projects/{PID}/uploads/b.mp4")
    assert res.status_code == 409 and res.json()["code"] == "already_started"
    # Adding footage later is still fine.
    assert _upload(client, "c.mp4").status_code == 201


def test_uploads_need_the_token_and_a_project(client):
    assert client.post(
        f"/api/v1/projects/{PID}/uploads", params={"name": "a.mp4"}, content=b"x", headers={TOKEN_HEADER: "no"}
    ).status_code == 403
    assert _upload(client, "a.mp4", pid="missing").status_code == 404
    assert _upload(client, "a.mp4", pid="..").status_code == 404


@pytest.mark.skipif(not has_ffmpeg, reason="ffmpeg/ffprobe not installed")
def test_ffprobe_metadata_is_recorded(client, tmp_path):
    clip = tmp_path / "clip.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=1.5",
         "-f", "lavfi", "-i", "sine=duration=1.5", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-c:a", "aac", str(clip)],
        check=True,
    )
    entry = _upload(client, "clip.mp4", content=clip.read_bytes()).json()
    assert entry["width"] == 320 and entry["height"] == 240
    assert entry["codec"] == "h264"
    assert 1.3 < entry["duration_s"] < 1.8


def test_probe_tolerates_non_media(tmp_path):
    junk = tmp_path / "junk.mp4"
    junk.write_bytes(b"not a video")
    assert studio_uploads.probe_media(junk) == {"duration_s": None, "width": None, "height": None, "codec": None}


# ---- references ----------------------------------------------------------------


def test_references_are_recorded_not_fetched(client, root):
    res = client.post(
        f"/api/v1/projects/{PID}/references", json={"url": " https://youtu.be/abc ", "notes": "the pacing"}
    )
    assert res.status_code == 201
    ref = res.json()
    assert ref["url"] == "https://youtu.be/abc" and ref["notes"] == "the pacing"
    dup = client.post(f"/api/v1/projects/{PID}/references", json={"url": "https://youtu.be/abc"})
    assert dup.status_code == 409 and dup.json()["code"] == "duplicate_reference"
    for bad in ["file:///etc/passwd", "javascript:alert(1)", "ftp://x", "https://"]:
        assert client.post(f"/api/v1/projects/{PID}/references", json={"url": bad}).status_code == 422
    assert [r["url"] for r in _index(root)["references"]] == ["https://youtu.be/abc"]

    assert client.delete(f"/api/v1/projects/{PID}/references/zzz").status_code == 404
    assert client.delete(f"/api/v1/projects/{PID}/references/{ref['id']}").status_code == 204
    assert _index(root)["references"] == []


def test_wizard_reference_is_seeded_into_inputs(client, root):
    body = {
        "goal": "like-this",
        "pipeline_type": "animated-explainer",
        "brief": {"topic": "Like this video please"},
        "reference": {"url": "https://example.com/v", "notes": "same energy"},
    }
    res = client.post("/api/v1/projects", json=body)
    assert res.status_code == 201, res.text
    pid = res.json()["project_id"]
    refs = client.get(f"/api/v1/projects/{pid}/inputs").json()["references"]
    assert [(r["url"], r["notes"], r["source"]) for r in refs] == [("https://example.com/v", "same energy", "wizard")]


def test_intake_keeps_target_languages_and_music_track(client):
    body = {
        "goal": "translate-dub",
        "pipeline_type": "localization-dub",
        "brief": {"topic": "Dub my launch video", "target_languages": ["Vietnamese", " ", "Spanish"]},
        "music_track": "calm.mp3",
    }
    pid = client.post("/api/v1/projects", json=body).json()["project_id"]
    intake = client.get(f"/api/v1/projects/{pid}/intake").json()["intake"]
    assert intake["brief"]["target_languages"] == ["Vietnamese", "Spanish"]
    assert intake["music_track"] == "calm.mp3"


# ---- music library ---------------------------------------------------------------


def test_music_library_list_upload_and_play(client, tmp_path):
    assert client.get("/api/v1/music").json() == {"tracks": []}
    res = client.post("/api/v1/music", params={"name": "calm_piano.mp3"}, content=b"ID3" + b"\x00" * 64,
                      headers={"Content-Type": "audio/mpeg"})
    assert res.status_code == 201, res.text
    assert res.json()["name"] == "calm_piano.mp3" and res.json()["title"] == "calm piano"
    assert (tmp_path / "music" / "calm_piano.mp3").is_file()
    assert [t["name"] for t in client.get("/api/v1/music").json()["tracks"]] == ["calm_piano.mp3"]
    assert client.get("/api/v1/music/tracks/calm_piano.mp3").status_code == 200

    video = client.post("/api/v1/music", params={"name": "clip.mp4"}, content=b"x", headers={"Content-Type": "video/mp4"})
    assert video.status_code == 415
    assert client.get("/api/v1/music/tracks/..%2F..%2Fsecret.mp3").status_code == 404
    assert client.get("/api/v1/music/tracks/missing.mp3").status_code == 404


def test_safe_name_keeps_unicode_and_cleans_symbols():
    assert studio_uploads.safe_name("Phỏng vấn #1.MP4") == "Phỏng vấn _1.mp4"
    assert studio_uploads.safe_name("  .hidden.mov") == "hidden.mov"
