"""Project storage seam for the Studio write API.

Every ``/api/v1`` module reads and writes project files through a
``ProjectStore`` — never through ``Path`` directly — so a hosted deployment can
later swap the disk for object storage without touching route code
(docs/ui-plan/phases/phase-7-hosted-readiness.md).

The read-only board (``backlot/state.py``) keeps its own direct disk access;
this seam only covers Studio-owned writes.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Optional, Protocol, runtime_checkable


class ProjectStoreError(Exception):
    """Base class for store failures surfaced to the API layer."""


class InvalidProjectId(ProjectStoreError):
    pass


class UnknownProject(ProjectStoreError):
    pass


class PathEscapesProject(ProjectStoreError):
    pass


@runtime_checkable
class ProjectStore(Protocol):
    # Local working copy. Project creation calls lib.checkpoint.init_project,
    # which needs a real directory; a hosted store syncs this root (Phase 7).
    root: Path

    def list_ids(self) -> list[str]: ...

    def project_dir(self, project_id: str) -> Path: ...

    def exists(self, project_id: str) -> bool: ...

    def read_json(self, project_id: str, rel_path: str) -> Optional[dict[str, Any]]: ...

    def write_json(self, project_id: str, rel_path: str, data: dict[str, Any]) -> None: ...


def validate_project_id(project_id: str) -> None:
    # Same rule as server._safe_project_dir: ':' rejects Windows drive-relative ids.
    if (
        not project_id
        or any(c in project_id for c in "/\\:\x00")
        or project_id in (".", "..")
    ):
        raise InvalidProjectId(project_id)


class DiskProjectStore:
    """``ProjectStore`` backed by ``projects/<id>/`` on the local filesystem."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def list_ids(self) -> list[str]:
        if not self.root.is_dir():
            return []
        return sorted(
            entry.name
            for entry in self.root.iterdir()
            if entry.is_dir() and not entry.name.startswith(("_", "."))
        )

    def exists(self, project_id: str) -> bool:
        validate_project_id(project_id)
        return (self.root / project_id).is_dir()

    def project_dir(self, project_id: str) -> Path:
        validate_project_id(project_id)
        project_dir = self.root / project_id
        if not project_dir.is_dir():
            raise UnknownProject(project_id)
        return project_dir

    def resolve(self, project_id: str, rel_path: str) -> Path:
        """Resolve ``rel_path`` inside the project, rejecting escapes."""
        project_dir = self.project_dir(project_id).resolve()
        if "\x00" in rel_path:
            raise PathEscapesProject(rel_path)
        target = (project_dir / rel_path).resolve()
        try:
            target.relative_to(project_dir)
        except ValueError:
            raise PathEscapesProject(rel_path) from None
        if target == project_dir:
            raise PathEscapesProject(rel_path)
        return target

    def read_json(self, project_id: str, rel_path: str) -> Optional[dict[str, Any]]:
        target = self.resolve(project_id, rel_path)
        if not target.is_file():
            return None
        return json.loads(target.read_text(encoding="utf-8"))

    def write_json(self, project_id: str, rel_path: str, data: dict[str, Any]) -> None:
        """Atomic write: temp file in the same directory, then replace.

        The board's watcher and the agent may read the file at any moment, so
        a reader must never observe a half-written document.
        """
        target = self.resolve(project_id, rel_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            os.replace(tmp, target)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
