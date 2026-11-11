"""Hosted-readiness contract (docs/ui-plan/phases/phase-7-hosted-readiness.md).

1. Studio v1 modules never touch the filesystem directly. Project files go
   through ``backlot/project_store.py`` (``ProjectStore`` / ``ProjectFiles``),
   machine-local files through ``backlot/machine_store.py``. Swapping in a
   hosted store then needs no route changes.
2. Every v1 route depends on ``current_user``; every project route resolves
   its project through ``project_access`` (the authorization seam).
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# Modules behind /api/v1. The two store modules are the only allowed
# filesystem boundary; setup_probe.py is a separate subprocess program that
# only imports the tool registry.
V1_MODULES = [
    "studio_api",
    "studio_catalog",
    "studio_cost",
    "studio_decisions",
    "studio_jobs",
    "studio_results",
    "studio_settings",
    "studio_setup",
    "studio_uploads",
]
STORE_MODULES = ["project_store", "machine_store"]

# Path / file-object methods that read or change the filesystem.
FS_METHODS = {
    "read_text", "write_text", "read_bytes", "write_bytes", "iterdir", "glob", "rglob",
    "unlink", "mkdir", "rmdir", "touch", "chmod", "rename", "symlink_to", "exists",
    "is_file", "is_dir", "is_symlink", "stat", "open", "samefile", "expanduser",
}
# Module functions that do the same.
FS_MODULE_CALLS = {
    "os": {"replace", "remove", "unlink", "rename", "makedirs", "mkdir", "listdir", "scandir",
           "chmod", "fdopen", "walk", "stat", "rmdir", "open"},
    "shutil": None,  # every function
    "tempfile": None,
    "zipfile": None,
    "glob": None,
    "io": {"open"},
    "importlib": None,  # loading code from a path
}
# Names exempt as receivers: the module seam itself, and — inside a function
# only — parameters annotated with a store type (plus names assigned from
# ``<store>.files(...)`` / ``<store>.create_project(...)``).
STORE_MODULE_RECEIVERS = {"machine_store"}
STORE_TYPES = {"ProjectFiles", "ProjectStore", "DiskProjectFiles", "DiskProjectStore"}
STORE_FACTORIES = {"files", "create_project"}


def _root_name(node: ast.AST) -> str | None:
    while isinstance(node, (ast.Attribute, ast.Call, ast.Subscript)):
        node = node.func if isinstance(node, ast.Call) else node.value
    return node.id if isinstance(node, ast.Name) else None


def _is_fs_module(name: str) -> bool:
    return any(name == mod or name.startswith(mod + ".") for mod in FS_MODULE_CALLS)


def _store_params(func: ast.AST) -> set[str]:
    args = func.args  # type: ignore[attr-defined]
    names = set()
    for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs]:
        if arg.annotation is not None:
            if set(re.findall(r"\w+", ast.unparse(arg.annotation))) & STORE_TYPES:
                names.add(arg.arg)
    return names


class _Scanner(ast.NodeVisitor):
    def __init__(self) -> None:
        self.hits: list[tuple[int, int, str]] = []
        self.exempt: list[set[str]] = [set(STORE_MODULE_RECEIVERS)]

    def _function(self, node) -> None:
        # Nested functions see the enclosing exemptions (closures over ``files``).
        self.exempt.append(self.exempt[-1] | _store_params(node))
        self.generic_visit(node)
        self.exempt.pop()

    visit_FunctionDef = visit_AsyncFunctionDef = visit_Lambda = _function

    def visit_Assign(self, node: ast.Assign) -> None:
        value = node.value
        if (
            isinstance(value, ast.Call)
            and isinstance(value.func, ast.Attribute)
            and value.func.attr in STORE_FACTORIES
            and _root_name(value.func.value) in self.exempt[-1]
        ):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    self.exempt[-1].add(target.id)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        # ``from os import remove`` would hide the call from the checks below.
        if node.module and node.level == 0 and _is_fs_module(node.module):
            self.hits.append((node.lineno, node.col_offset, f"from {node.module} import"))

    def visit_Import(self, node: ast.Import) -> None:
        # ``import shutil as sh`` would hide the module name the same way.
        for alias in node.names:
            if alias.asname and _is_fs_module(alias.name):
                self.hits.append((node.lineno, node.col_offset, f"import {alias.name} as"))

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        if isinstance(func, ast.Name) and func.id == "open":
            self.hits.append((node.lineno, node.col_offset, "open()"))
        elif isinstance(func, ast.Attribute):
            root = _root_name(func.value)
            if isinstance(func.value, ast.Name) and func.value.id in FS_MODULE_CALLS:
                allowed = FS_MODULE_CALLS[func.value.id]
                if allowed is None or func.attr in allowed:
                    self.hits.append((node.lineno, node.col_offset, f"{func.value.id}.{func.attr}()"))
            elif (
                isinstance(func.value, ast.Attribute)
                and root in FS_MODULE_CALLS
                and FS_MODULE_CALLS[str(root)] is None
            ):
                self.hits.append((node.lineno, node.col_offset, f"{root}.….{func.attr}()"))
            elif func.attr in FS_METHODS and root not in self.exempt[-1]:
                self.hits.append((node.lineno, node.col_offset, f".{func.attr}()"))
        self.generic_visit(node)


def filesystem_calls(source: str) -> list[tuple[int, str]]:
    scanner = _Scanner()
    scanner.visit(ast.parse(source))
    return [(line, name) for line, _, name in sorted(scanner.hits)]


@pytest.mark.parametrize("module", V1_MODULES)
def test_v1_modules_reach_the_filesystem_only_through_the_stores(module):
    source = (REPO_ROOT / "backlot" / f"{module}.py").read_text(encoding="utf-8")
    assert filesystem_calls(source) == [], (
        f"backlot/{module}.py touches the filesystem directly; go through "
        "ProjectStore/ProjectFiles (project data) or machine_store (machine files)"
    )


def test_the_scanner_catches_direct_access():
    sample = (
        "import os, shutil, tempfile\n"
        "from pathlib import Path\n"
        "def f(p: Path, files, store):\n"
        "    p.read_text(); open(p); os.replace(p, p); shutil.copy(p, p)\n"
        "    tempfile.mkstemp(); (p / 'x').exists(); p.parent.mkdir()\n"
        "    files.stat('x'); store.exists('y'); 'a'.replace('a', 'b')\n"
    )
    found = [name for _, name in filesystem_calls(sample)]
    # Unannotated ``files`` / ``store`` are not the seams.
    assert found == [".read_text()", "open()", "os.replace()", "shutil.copy()",
                     "tempfile.mkstemp()", ".exists()", ".mkdir()", ".stat()", ".exists()"]


def test_the_scanner_catches_hidden_imports_and_self():
    sample = (
        "from os import remove\n"
        "from os.path import exists\n"
        "from shutil import copy\n"
        "import shutil as sh\n"
        "from pathlib import Path\n"
        "class Box:\n"
        "    def go(self):\n"
        "        remove(self.path); self.path.read_text()\n"
    )
    found = [name for _, name in filesystem_calls(sample)]
    assert found == ["from os import", "from os.path import", "from shutil import",
                     "import shutil as", ".read_text()"]


def test_the_scanner_allows_annotated_store_handles():
    sample = (
        "from backlot import machine_store\n"
        "def f(files: ProjectFiles, store: Optional[ProjectStore]):\n"
        "    files.stat('x'); store.exists('y'); machine_store.read_text(p)\n"
        "    def inner():\n"
        "        files.rename('a', 'b')\n"
        "    made = store.files('p'); made.stat('x')\n"
        "def g(files):\n"
        "    files.stat('x')\n"
    )
    assert filesystem_calls(sample) == [(8, ".stat()")]


@pytest.mark.parametrize("module", STORE_MODULES)
def test_store_modules_exist_and_do_the_io(module):
    source = (REPO_ROOT / "backlot" / f"{module}.py").read_text(encoding="utf-8")
    assert filesystem_calls(source), f"{module} is expected to be the filesystem boundary"


# ---- route seams ------------------------------------------------------------------


def _calls(dependant) -> list:
    out = []
    for dep in dependant.dependencies:
        out.append(dep.call)
        out.extend(_calls(dep))
    return out


def _v1_routes() -> list:
    from fastapi.routing import APIRoute

    from backlot.studio_api import _build_router

    # The router exactly as install_studio_api mounts it (router-level
    # dependencies are part of each route's dependant).
    return [r for r in _build_router().routes if isinstance(r, APIRoute)]


def test_every_v1_route_requires_current_user():
    from backlot.studio_api import current_user

    routes = _v1_routes()
    assert len(routes) > 25
    missing = [r.path for r in routes if current_user not in _calls(r.dependant)]
    assert missing == []


def test_every_project_route_goes_through_project_access():
    routes = [r for r in _v1_routes() if "{project_id}" in r.path]
    assert routes
    missing = [
        f"{sorted(r.methods)} {r.path}"
        for r in routes
        if not any("project_access" in getattr(c, "__qualname__", "") for c in _calls(r.dependant))
    ]
    assert missing == []


def test_project_access_hides_forbidden_projects(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from backlot import server as server_mod
    from backlot import state as state_mod
    from backlot import studio_api

    (tmp_path / "mine").mkdir()
    monkeypatch.setattr(state_mod, "PROJECTS_DIR", tmp_path)
    monkeypatch.setattr(server_mod, "PROJECTS_DIR", tmp_path)
    with TestClient(server_mod.create_app(), base_url="http://127.0.0.1:4750") as client:
        assert client.get("/api/v1/projects/mine/decisions").status_code == 200
        monkeypatch.setattr(studio_api, "authorize", lambda user, pid, access: access == "view")
        assert client.get("/api/v1/projects/mine/decisions").status_code == 200
        token = client.get("/api/v1/session").json()["token"]
        res = client.post(
            "/api/v1/projects/mine/references",
            json={"url": "https://example.com"},
            headers={studio_api.TOKEN_HEADER: token},
        )
        # Forbidden looks exactly like unknown: no project ids leak across tenants.
        assert res.status_code == 404
        assert res.json() == client.get("/api/v1/projects/ghost/inputs").json() | {
            "detail": "unknown project: mine"
        }


# ---- store protocol ---------------------------------------------------------------


def test_disk_store_satisfies_the_final_protocol(tmp_path):
    from backlot.project_store import DiskProjectStore, ProjectFiles, ProjectStore

    (tmp_path / "film").mkdir()
    store = DiskProjectStore(tmp_path)
    assert isinstance(store, ProjectStore)
    assert isinstance(store.files("film"), ProjectFiles)


def test_object_store_is_an_interface_stub():
    from backlot.project_store import ObjectProjectStore, ProjectStore

    store = ObjectProjectStore(tenant_id="t1", bucket="b", database_url="postgresql://x")
    assert isinstance(store, ProjectStore)
    assert store.root is None
    for call in (store.list_ids, lambda: store.files("p"), lambda: store.read_json("p", "x.json")):
        with pytest.raises(NotImplementedError):
            call()
