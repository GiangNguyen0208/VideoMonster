"""DiskProjectStore / DiskProjectFiles path safety (Phase 7.1, docs/ui-plan/STATUS.md)."""

from __future__ import annotations

import os

import pytest

from backlot.project_store import (
    DiskProjectStore,
    InvalidProjectId,
    MissingSource,
    PathEscapesProject,
    TargetExists,
)


@pytest.fixture
def store(tmp_path):
    root = tmp_path / "projects"
    (root / "film").mkdir(parents=True)
    return DiskProjectStore(root)


def test_safe_rel_rejects_the_project_folder_itself(store):
    files = store.files("film")
    (store.root / "film" / "renders").mkdir()
    assert files.safe_rel(".") is None
    assert files.safe_rel(str(store.root / "film")) is None
    assert files.safe_rel(str(store.root / "film") + "/") is None
    assert files.safe_rel("renders") == "renders"


@pytest.mark.skipif(not hasattr(os, "symlink"), reason="no symlinks")
def test_list_skips_files_under_a_symlinked_folder_outside(store, tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.mp4").write_bytes(b"x")
    project = store.root / "film"
    (project / "inputs").mkdir()
    (project / "inputs" / "clip.mp4").write_bytes(b"y")
    (project / "inputs" / "linked").symlink_to(outside, target_is_directory=True)
    found = [f.path for f in store.files("film").list("inputs", recursive=True)]
    assert found == ["inputs/clip.mp4"]


def test_rename_never_overwrites(store):
    files = store.files("film")
    files.write_json("a.json", {"n": 1})
    files.write_json("b.json", {"n": 2})
    with pytest.raises(TargetExists):
        files.rename("a.json", "b.json")
    assert files.read_json("a.json") == {"n": 1}
    assert files.read_json("b.json") == {"n": 2}
    files.rename("a.json", "c.json")
    assert files.stat("a.json") is None and files.read_json("c.json") == {"n": 1}


def test_rename_of_a_missing_source(store):
    with pytest.raises(MissingSource):
        store.files("film").rename("gone.json", "c.json")


def test_rename_falls_back_without_hard_links(store, monkeypatch):
    files = store.files("film")
    files.write_json("a.json", {"n": 1})
    files.write_json("b.json", {"n": 2})

    def no_links(*_):
        raise PermissionError("no hard links here")

    monkeypatch.setattr(os, "link", no_links)
    with pytest.raises(TargetExists):
        files.rename("a.json", "b.json")
    files.rename("a.json", "c.json")
    assert files.read_json("c.json") == {"n": 1}
    with pytest.raises(MissingSource):
        files.rename("a.json", "d.json")


@pytest.mark.parametrize("project_id", ["_trash", ".cache", "", ".", "..", "a/b", "c:x"])
def test_hidden_and_unsafe_ids_are_not_addressable(store, project_id):
    (store.root / "_trash").mkdir()
    with pytest.raises(InvalidProjectId):
        store.exists(project_id)
    with pytest.raises(InvalidProjectId):
        store.files(project_id)
    assert store.list_ids() == ["film"]


def test_paths_cannot_leave_the_project(store):
    files = store.files("film")
    with pytest.raises(PathEscapesProject):
        files.read_json("../other/project.json")
    assert files.stat("../../etc/passwd") is None


def test_api_answers_404_for_hidden_ids(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from backlot import server as server_mod
    from backlot import state as state_mod

    (tmp_path / "_trash").mkdir()
    (tmp_path / "_trash" / "studio").mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", tmp_path)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", tmp_path)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as client:
        res = client.get("/api/v1/projects/_trash/inputs")
        assert res.status_code == 404 and res.json()["detail"] == "unknown project: _trash"
