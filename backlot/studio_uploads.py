"""Source media for Studio projects: uploads, reference links, music library.

Studio stays a companion to the agent (docs/ui-plan/03-architecture.md):
footage lands in ``projects/<id>/inputs/`` and is indexed in
``studio/inputs.json`` — the agent reads both at kickoff
(AGENT_GUIDE.md "Projects created in Studio"). Reference links are recorded,
never fetched here; the agent's reference-analysis flow does that.

Uploads are raw request bodies (one file per request, name in the query), so
the server streams them to disk in fixed-size chunks and never holds a whole
file in memory.
"""

from __future__ import annotations

import os
import re
import secrets
import threading
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from backlot import machine_store
from backlot.project_store import (
    EmptyWrite,
    FileInfo,
    PathEscapesProject,
    ProjectFiles,
    WriteTooLarge,
)

INPUTS_DIR = "inputs"
INDEX_PATH = "studio/inputs.json"
INDEX_SCHEMA = "studio.inputs/1"
DEFAULT_MAX_UPLOAD_MB = 8192
MAX_REFERENCES = 20

MEDIA_EXTENSIONS: dict[str, frozenset[str]] = {
    "video": frozenset({".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"}),
    "audio": frozenset({".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aiff", ".aif"}),
    "image": frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"}),
    "subtitle": frozenset({".srt", ".vtt", ".ass"}),
}
# Content types a browser may send for each media kind. Anything else (other
# than a generic octet-stream) contradicts the extension and is refused.
_GENERIC_TYPES = frozenset({"", "application/octet-stream", "binary/octet-stream"})
_SUBTITLE_TYPES = frozenset({"application/x-subrip", "text/plain", "text/vtt", "text/x-ssa"})

UploadKind = Literal["footage", "reference"]


class UploadError(Exception):
    """Rejected upload or input edit; the API returns ``{detail, code}``."""

    def __init__(self, status: int, code: str, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail


def max_upload_bytes() -> int:
    try:
        mb = int(os.environ.get("STUDIO_MAX_UPLOAD_MB", DEFAULT_MAX_UPLOAD_MB))
    except ValueError:
        mb = DEFAULT_MAX_UPLOAD_MB
    return max(mb, 1) * 1024 * 1024


def limits() -> dict[str, Any]:
    return {
        "max_bytes": max_upload_bytes(),
        "extensions": {kind: sorted(exts) for kind, exts in MEDIA_EXTENSIONS.items()},
    }


# ---- names and types ----------------------------------------------------------


def media_kind(name: str) -> Optional[str]:
    suffix = Path(name).suffix.lower()
    return next((kind for kind, exts in MEDIA_EXTENSIONS.items() if suffix in exts), None)


def safe_name(raw: str) -> str:
    """A plain file name, or ``bad_name``. Never strips a path to its last
    part: a name that tries to point anywhere else is refused outright."""
    if (
        not raw
        or "\x00" in raw
        or "/" in raw
        or "\\" in raw
        or raw in (".", "..")
        or re.match(r"^[A-Za-z]:", raw)
    ):
        raise UploadError(400, "bad_name", f"not a plain file name: {raw!r}")
    name = unicodedata.normalize("NFC", raw).strip()
    stem, suffix = os.path.splitext(name)
    stem = re.sub(r"[^\w\-. ()]+", "_", stem).strip(" .") or "file"
    suffix = re.sub(r"[^\w.]+", "", suffix).lower()
    return f"{stem[:120]}{suffix}"


def check_type(name: str, content_type: Optional[str]) -> str:
    """Media kind for an allowed name + content type, else 415."""
    kind = media_kind(name)
    if kind is None:
        raise UploadError(415, "unsupported_type", f"file type not allowed: {Path(name).suffix or name}")
    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype in _GENERIC_TYPES:
        return kind
    family = ctype.split("/")[0]
    ok = (
        family == kind
        or (kind == "subtitle" and ctype in _SUBTITLE_TYPES)
        # Some systems label .webm/.ogg audio as video and the reverse.
        or (kind in ("audio", "video") and family in ("audio", "video"))
    )
    if not ok:
        raise UploadError(415, "unsupported_type", f"{ctype} does not match {name}")
    return kind


async def save_upload(
    files: ProjectFiles,
    raw_name: str,
    content_type: Optional[str],
    chunks: AsyncIterator[bytes],
    declared_size: Optional[int] = None,
    rel_dir: str = INPUTS_DIR,
) -> tuple[FileInfo, str]:
    """Stream a request body into the project's ``inputs/`` under a safe,
    unique name. Returns (file, media kind)."""
    name = safe_name(raw_name)
    kind = check_type(name, content_type)
    return await _guarded(files.write_stream(rel_dir, name, chunks, _cap(declared_size))), kind


async def save_music(
    raw_name: str, content_type: Optional[str], chunks: AsyncIterator[bytes], declared_size: Optional[int]
) -> str:
    """Add a track to the shared music library; returns its listed name."""
    name = safe_name(raw_name)
    if media_kind(name) != "audio":
        raise UploadError(415, "unsupported_type", "only audio files go in the music library")
    check_type(name, content_type)
    path = await _guarded(machine_store.add_music(name, chunks, _cap(declared_size)))
    return path.name


def _cap(declared_size: Optional[int]) -> int:
    cap = max_upload_bytes()
    if declared_size is not None and declared_size > cap:
        raise UploadError(413, "too_large", f"file is larger than {cap} bytes")
    return cap


async def _guarded(write):
    try:
        return await write
    except WriteTooLarge:
        raise UploadError(413, "too_large", f"file is larger than {max_upload_bytes()} bytes") from None
    except EmptyWrite:
        raise UploadError(400, "empty_file", "the file is empty") from None
    except PathEscapesProject:
        raise UploadError(400, "bad_name", "path escapes the upload folder") from None


# ---- media metadata -------------------------------------------------------------

probe_media = machine_store.probe_media


# ---- inputs.json ----------------------------------------------------------------

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _index_lock(files: ProjectFiles) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(files.project_id, threading.Lock())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_index(files: ProjectFiles) -> dict[str, Any]:
    data = files.read_json(INDEX_PATH) or {}
    return {
        "schema": INDEX_SCHEMA,
        "files": [f for f in data.get("files") or [] if isinstance(f, dict)],
        "references": [r for r in data.get("references") or [] if isinstance(r, dict)],
    }


def _update_index(files: ProjectFiles, change) -> Any:
    with _index_lock(files):
        index = read_index(files)
        result = change(index)
        files.write_json(INDEX_PATH, {**index, "updated_at": _now()})
        return result


def list_inputs(files: ProjectFiles) -> dict[str, Any]:
    """Index entries, dropping files that no longer exist."""
    index = read_index(files)
    index["files"] = [f for f in index["files"] if files.stat(str(f.get("path", ""))) is not None]
    return index


def add_file(files: ProjectFiles, info: FileInfo, media: str, kind: UploadKind) -> dict[str, Any]:
    meta = probe_media(files.local_file(info.path)) if media in ("video", "audio", "image") else {}
    entry = {
        "path": info.path,
        "name": info.name,
        "kind": kind,
        "media": media,
        "size": info.size,
        "duration_s": meta.get("duration_s") if media != "image" else None,
        "width": meta.get("width"),
        "height": meta.get("height"),
        "codec": meta.get("codec"),
        "uploaded_at": _now(),
    }

    def change(index):
        index["files"] = [f for f in index["files"] if f.get("path") != entry["path"]] + [entry]
        return entry

    return _update_index(files, change)


def remove_file(files: ProjectFiles, name: str, started: bool) -> None:
    if started:
        raise UploadError(409, "already_started", "the agent has started; files can no longer be removed")
    try:
        ok = name == safe_name(name)
    except UploadError:
        ok = False
    rel = f"{INPUTS_DIR}/{name}"
    if not ok or files.stat(rel) is None:
        raise UploadError(404, "unknown_file", f"no such file: {name}")
    files.delete(rel)
    _update_index(files, lambda index: index.update(
        files=[f for f in index["files"] if f.get("path") != rel]
    ))


class ReferenceIn(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    notes: str = Field(default="", max_length=2000)

    @field_validator("url")
    @classmethod
    def _http_only(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^https?://[^\s/]+\S*$", v):
            raise ValueError("bad_url")
        return v

    @field_validator("notes")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


def add_reference(files: ProjectFiles, ref: ReferenceIn, source: str = "studio") -> dict[str, Any]:
    entry = {
        "id": secrets.token_hex(4),
        "url": ref.url,
        "notes": ref.notes or None,
        "added_at": _now(),
        "source": source,
    }

    def change(index):
        if any(r.get("url") == ref.url for r in index["references"]):
            raise UploadError(409, "duplicate_reference", "this link is already listed")
        if len(index["references"]) >= MAX_REFERENCES:
            raise UploadError(422, "too_many_references", f"at most {MAX_REFERENCES} links")
        index["references"].append(entry)
        return entry

    return _update_index(files, change)


def remove_reference(files: ProjectFiles, ref_id: str, started: bool) -> None:
    if started:
        raise UploadError(409, "already_started", "the agent has started; links can no longer be removed")

    def change(index):
        before = len(index["references"])
        index["references"] = [r for r in index["references"] if r.get("id") != ref_id]
        if len(index["references"]) == before:
            raise UploadError(404, "unknown_reference", f"no such link: {ref_id}")

    _update_index(files, change)


# ---- music library ----------------------------------------------------------------


def music_dir() -> Path:
    return machine_store.music_dir()


def list_music() -> list[dict[str, Any]]:
    return [
        {
            "name": name,
            "title": path.stem.replace("_", " ").replace("-", " ").strip() or path.name,
            "size": size,
            "duration_s": machine_store.probe_cached(path).get("duration_s"),
        }
        for name, path, size in machine_store.list_music_files()
    ]


def music_track(name: str) -> Path:
    """Library track by its listed name (may include sub-folders)."""
    path = machine_store.music_track(name)
    if path is None:
        raise UploadError(404, "unknown_track", "no such track")
    return path
