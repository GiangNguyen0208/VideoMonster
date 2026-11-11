"""Project storage seam for the Studio write API.

Every ``/api/v1`` module reads and writes project files through a
``ProjectStore`` (and its per-project ``ProjectFiles`` handle) — never through
``Path``, ``open`` or ``os`` directly — so a hosted deployment can swap the
disk for object storage plus a metadata database without touching route code
(docs/ui-plan/hosted/design.md). ``tests/contracts/test_studio_store_contract.py``
enforces this.

Machine-local resources that are not project data (``config.yaml``, ``.env``,
``music_library/``, demo renders, local binaries) go through
``backlot/machine_store.py`` instead.

The read-only board (``backlot/state.py``) keeps its own direct disk access;
Studio reaches it through ``ProjectFiles.board_state()``.
"""

from __future__ import annotations

import fnmatch
import json
import os
import secrets
import tempfile
import threading
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Optional, Protocol, runtime_checkable


class ProjectStoreError(Exception):
    """Base class for store failures surfaced to the API layer."""


class InvalidProjectId(ProjectStoreError):
    pass


class UnknownProject(ProjectStoreError):
    pass


class PathEscapesProject(ProjectStoreError):
    pass


class WriteTooLarge(ProjectStoreError):
    """A streamed write went over its byte limit (nothing was kept)."""


class EmptyWrite(ProjectStoreError):
    """A streamed write had no bytes (nothing was kept)."""


class TargetExists(ProjectStoreError):
    pass


class MissingSource(ProjectStoreError):
    """A rename's source disappeared (e.g. deleted concurrently)."""


@dataclass(frozen=True)
class FileInfo:
    path: str  # project-relative, "/"-separated
    name: str
    size: int
    mtime: float
    is_dir: bool = False


@runtime_checkable
class ProjectFiles(Protocol):
    """One project's files. Paths are project-relative strings; anything that
    would resolve outside the project raises ``PathEscapesProject``."""

    project_id: str

    def read_json(self, rel: str) -> Optional[dict[str, Any]]:
        """Parsed object, or ``None`` when missing, unreadable or not an object."""
        ...

    def write_json(self, rel: str, data: dict[str, Any]) -> None:
        """Atomic: readers never see a half-written file."""
        ...

    def stat(self, rel: str) -> Optional[FileInfo]: ...

    def list(self, rel_dir: str = "", pattern: str = "*", recursive: bool = False) -> list[FileInfo]:
        """Files (not folders) in ``rel_dir`` whose name matches ``pattern``,
        sorted by path. Hidden names (``.``) are skipped."""
        ...

    def delete(self, rel: str) -> bool: ...

    def rename(self, src: str, dst: str) -> None:
        """Atomic rename inside the project; ``TargetExists`` if ``dst`` exists."""
        ...

    async def write_stream(
        self, rel_dir: str, name: str, chunks: AsyncIterator[bytes], max_bytes: int
    ) -> FileInfo:
        """Stream bytes into ``rel_dir`` under ``name`` (made unique with
        ``-2``, ``-3`` …). Nothing is visible until the write completes."""
        ...

    def safe_rel(self, raw: Any) -> Optional[str]:
        """A path the agent recorded (relative or absolute) as a relative
        path, if it exists inside the project."""
        ...

    def local_file(self, rel: str) -> Path:
        """A local path to read the file with (ffprobe, sending it). Disk:
        the file itself. Hosted: a cached download."""
        ...

    def zip_dir(self, rel_dir: str) -> tuple[Path, Callable[[], None]]:
        """Zip a folder into a temporary file; call the cleanup when sent."""
        ...

    def board_state(self) -> dict[str, Any]:
        """The read-only board view (``backlot.state.load_board_state``)."""
        ...


@runtime_checkable
class ProjectStore(Protocol):
    # Local working copy, if any. Disk: the projects folder. Hosted: None —
    # the agent's machine keeps the working copy and syncs it
    # (docs/ui-plan/hosted/sync-protocol.md).
    root: Optional[Path]

    def list_ids(self) -> list[str]: ...

    def exists(self, project_id: str) -> bool: ...

    def files(self, project_id: str) -> ProjectFiles:
        """Handle for an existing project (``UnknownProject`` otherwise)."""
        ...

    def create_project(
        self, project_id: str, *, title: str, pipeline_type: str, style_playbook: Optional[str]
    ) -> ProjectFiles: ...

    def read_json(self, project_id: str, rel_path: str) -> Optional[dict[str, Any]]: ...

    def write_json(self, project_id: str, rel_path: str, data: dict[str, Any]) -> None: ...


def validate_project_id(project_id: str) -> None:
    # Same rule as server._safe_project_dir (':' rejects Windows drive-relative
    # ids), plus: ids that list_ids hides ('_trash', '.cache', …) are not
    # addressable either.
    if (
        not project_id
        or any(c in project_id for c in "/\\:\x00")
        or project_id.startswith(("_", "."))
    ):
        raise InvalidProjectId(project_id)


# ---- shared disk helpers (also used by machine_store) --------------------------

WRITE_CHUNK = 1 << 20  # buffer this much before each disk write


def atomic_write_text(target: Path, text: str, mode: Optional[int] = None) -> None:
    """Temp file in the same folder, then replace. ``mode`` sets permissions
    (else an existing file's are kept)."""
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        if mode is not None:
            os.chmod(tmp, mode)
        elif target.exists():
            os.chmod(tmp, target.stat().st_mode & 0o777)
        os.replace(tmp, target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def read_json_file(path: Path) -> Optional[dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def unique_path(folder: Path, name: str) -> Path:
    target = folder / name
    stem, suffix = os.path.splitext(name)
    n = 2
    while target.exists():
        target = folder / f"{stem}-{n}{suffix}"
        n += 1
    return target


def contained(folder: Path, target: Path) -> Path:
    """``target`` resolved, or ``PathEscapesProject`` if it leaves ``folder``."""
    resolved = target.resolve()
    try:
        resolved.relative_to(folder.resolve())
    except ValueError:
        raise PathEscapesProject(str(target)) from None
    return resolved


async def stream_into(
    folder: Path, name: str, chunks: AsyncIterator[bytes], max_bytes: int
) -> Path:
    """Write ``chunks`` to a hidden partial file in ``folder`` (1 MB writes,
    never the whole body in memory), then rename it to a unique ``name``."""
    import asyncio

    if "/" in name or "\\" in name or "\x00" in name or name in ("", ".", ".."):
        raise PathEscapesProject(name)
    folder.mkdir(parents=True, exist_ok=True)
    partial = contained(folder, folder / f".partial-{secrets.token_hex(6)}")
    written = 0
    buffer = bytearray()
    try:
        with open(partial, "wb") as fh:
            async for chunk in chunks:
                written += len(chunk)
                if written > max_bytes:
                    raise WriteTooLarge(f"larger than {max_bytes} bytes")
                buffer += chunk
                if len(buffer) >= WRITE_CHUNK:
                    await asyncio.to_thread(fh.write, bytes(buffer))
                    buffer.clear()
            if buffer:
                await asyncio.to_thread(fh.write, bytes(buffer))
        if written == 0:
            raise EmptyWrite(name)
        with _name_lock(folder):
            target = contained(folder, unique_path(folder, name))
            os.replace(partial, target)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
    return target


_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def _name_lock(folder: Path) -> threading.Lock:
    key = str(folder.resolve())
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(key, threading.Lock())


def _info(root: Path, path: Path) -> FileInfo:
    st = path.stat()
    return FileInfo(
        path=path.relative_to(root).as_posix(),
        name=path.name,
        size=st.st_size,
        mtime=st.st_mtime,
        is_dir=path.is_dir(),
    )


# ---- disk implementation ----------------------------------------------------------


class DiskProjectFiles:
    """``ProjectFiles`` over ``projects/<id>/`` on the local filesystem."""

    def __init__(self, project_dir: Path, project_id: str) -> None:
        self.dir = project_dir
        self.project_id = project_id

    def _path(self, rel: str) -> Path:
        if "\x00" in rel:
            raise PathEscapesProject(rel)
        target = (self.dir / rel).resolve() if rel else self.dir.resolve()
        try:
            target.relative_to(self.dir.resolve())
        except ValueError:
            raise PathEscapesProject(rel) from None
        return target

    def resolve(self, rel: str) -> Path:
        target = self._path(rel)
        if target == self.dir.resolve():
            raise PathEscapesProject(rel)
        return target

    def read_json(self, rel: str) -> Optional[dict[str, Any]]:
        return read_json_file(self.resolve(rel))

    def write_json(self, rel: str, data: dict[str, Any]) -> None:
        atomic_write_text(self.resolve(rel), json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    def stat(self, rel: str) -> Optional[FileInfo]:
        try:
            path = self.resolve(rel)
        except PathEscapesProject:
            return None
        return _info(self.dir.resolve(), path) if path.exists() else None

    def list(self, rel_dir: str = "", pattern: str = "*", recursive: bool = False) -> list[FileInfo]:
        folder = self._path(rel_dir)
        if not folder.is_dir():
            return []
        root = self.dir.resolve()
        found = folder.rglob("*") if recursive else folder.iterdir()
        out = []
        for path in found:
            rel_parts = path.relative_to(folder).parts
            if any(part.startswith(".") for part in rel_parts) or not path.is_file():
                continue
            # Also covers files under a symlinked folder pointing elsewhere.
            if not _inside(root, path):
                continue
            if fnmatch.fnmatch(path.name, pattern):
                out.append(_info(root, path))
        return sorted(out, key=lambda f: f.path)

    def delete(self, rel: str) -> bool:
        path = self.resolve(rel)
        if not path.is_file():
            return False
        path.unlink()
        return True

    def rename(self, src: str, dst: str) -> None:
        source, target = self.resolve(src), self.resolve(dst)
        try:
            # link + unlink never overwrites an existing target, even under a race.
            os.link(source, target)
        except FileExistsError:
            raise TargetExists(dst) from None
        except FileNotFoundError:
            raise MissingSource(src) from None
        except OSError:
            # No hard links on this file system: best effort.
            if target.exists():
                raise TargetExists(dst) from None
            try:
                os.replace(source, target)
            except FileNotFoundError:
                raise MissingSource(src) from None
            return
        source.unlink(missing_ok=True)

    async def write_stream(
        self, rel_dir: str, name: str, chunks: AsyncIterator[bytes], max_bytes: int
    ) -> FileInfo:
        folder = self._path(rel_dir)
        path = await stream_into(folder, name, chunks, max_bytes)
        return _info(self.dir.resolve(), path)

    def safe_rel(self, raw: Any) -> Optional[str]:
        if not isinstance(raw, str) or not raw or "\x00" in raw:
            return None
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = self.dir / candidate
        root = self.dir.resolve()
        if not _inside(root, candidate) or not candidate.exists() or candidate.resolve() == root:
            return None
        return candidate.resolve().relative_to(root).as_posix()

    def is_dir(self, rel: str) -> bool:
        return self._path(rel).is_dir()

    def local_file(self, rel: str) -> Path:
        return self.resolve(rel)

    def zip_dir(self, rel_dir: str) -> tuple[Path, Callable[[], None]]:
        folder = self.resolve(rel_dir)
        fd, tmp = tempfile.mkstemp(prefix="studio-export-", suffix=".zip")
        os.close(fd)
        stored = {".mp4", ".mov", ".webm", ".mkv", ".mp3", ".m4a", ".aac", ".png", ".jpg", ".jpeg", ".webp", ".zip"}
        root = folder.resolve()
        with zipfile.ZipFile(tmp, "w") as zf:
            for path in sorted(folder.rglob("*")):
                if not path.is_file() or path.is_symlink() or not _inside(root, path):
                    continue
                mode = zipfile.ZIP_STORED if path.suffix.lower() in stored else zipfile.ZIP_DEFLATED
                zf.write(path, path.relative_to(folder).as_posix(), compress_type=mode)
        bundle = Path(tmp)
        return bundle, lambda: bundle.unlink(missing_ok=True)

    def board_state(self) -> dict[str, Any]:
        from backlot.state import load_board_state

        return load_board_state(self.dir)


def _inside(root: Path, path: Path) -> bool:
    try:
        path.resolve().relative_to(root)
    except (ValueError, OSError):
        return False
    return True


class DiskProjectStore:
    """``ProjectStore`` backed by ``projects/<id>/`` on the local filesystem."""

    def __init__(self, root: Path) -> None:
        self.root: Optional[Path] = Path(root)

    @property
    def _root(self) -> Path:
        assert self.root is not None
        return self.root

    def list_ids(self) -> list[str]:
        if not self._root.is_dir():
            return []
        return sorted(
            entry.name
            for entry in self._root.iterdir()
            if entry.is_dir() and not entry.name.startswith(("_", "."))
        )

    def exists(self, project_id: str) -> bool:
        validate_project_id(project_id)
        return (self._root / project_id).is_dir()

    def project_dir(self, project_id: str) -> Path:
        validate_project_id(project_id)
        project_dir = self._root / project_id
        if not project_dir.is_dir():
            raise UnknownProject(project_id)
        return project_dir

    def files(self, project_id: str) -> DiskProjectFiles:
        return DiskProjectFiles(self.project_dir(project_id), project_id)

    def create_project(
        self, project_id: str, *, title: str, pipeline_type: str, style_playbook: Optional[str]
    ) -> DiskProjectFiles:
        from lib.checkpoint import init_project

        validate_project_id(project_id)
        init_project(
            project_id,
            title=title,
            pipeline_type=pipeline_type,
            pipeline_dir=self._root,
            style_playbook=style_playbook,
        )
        return self.files(project_id)

    def resolve(self, project_id: str, rel_path: str) -> Path:
        """Resolve ``rel_path`` inside the project, rejecting escapes."""
        return self.files(project_id).resolve(rel_path)

    def read_json(self, project_id: str, rel_path: str) -> Optional[dict[str, Any]]:
        return self.files(project_id).read_json(rel_path)

    def write_json(self, project_id: str, rel_path: str, data: dict[str, Any]) -> None:
        self.files(project_id).write_json(rel_path, data)


# ---- hosted (interface only) ----------------------------------------------------


class ObjectProjectStore:
    """Hosted ``ProjectStore``: media in object storage (S3-compatible, keys
    ``<tenant>/<project>/<rel>``), project index, intake, inputs index and
    decisions in a metadata database, all scoped to one tenant.

    Interface stub only (Phase 7 ships design, not a hosted service). See
    docs/ui-plan/hosted/design.md §3 for the mapping of each method.
    """

    root: Optional[Path] = None

    def __init__(self, *, tenant_id: str, bucket: str, database_url: str) -> None:
        self.tenant_id = tenant_id
        self.bucket = bucket
        self.database_url = database_url

    def _todo(self, *_: Any, **__: Any) -> Any:
        raise NotImplementedError("hosted ProjectStore is designed but not implemented")

    list_ids = exists = files = create_project = read_json = write_json = _todo
