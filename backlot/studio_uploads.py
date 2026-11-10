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

import json
import os
import re
import secrets
import shutil
import subprocess
import threading
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from backlot.state import REPO_ROOT

INPUTS_DIR = "inputs"
INDEX_PATH = "studio/inputs.json"
INDEX_SCHEMA = "studio.inputs/1"
DEFAULT_MAX_UPLOAD_MB = 8192
MAX_REFERENCES = 20
WRITE_CHUNK = 1 << 20  # buffer this much before each disk write

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


def unique_path(folder: Path, name: str) -> Path:
    target = folder / name
    stem, suffix = os.path.splitext(name)
    n = 2
    while target.exists():
        target = folder / f"{stem}-{n}{suffix}"
        n += 1
    return target


def _inside(folder: Path, target: Path) -> Path:
    resolved = target.resolve()
    try:
        resolved.relative_to(folder.resolve())
    except ValueError:
        raise UploadError(400, "bad_name", "path escapes the upload folder") from None
    return resolved


async def stream_to_folder(
    folder: Path,
    raw_name: str,
    content_type: Optional[str],
    chunks: AsyncIterator[bytes],
    declared_size: Optional[int] = None,
) -> tuple[Path, str]:
    """Write a request body into ``folder`` under a safe, unique name.

    The body goes to a hidden partial file first and is renamed only when
    complete, so the agent never sees half a file. Returns (path, media kind).
    """
    import asyncio

    name = safe_name(raw_name)
    kind = check_type(name, content_type)
    cap = max_upload_bytes()
    if declared_size is not None and declared_size > cap:
        raise UploadError(413, "too_large", f"file is larger than {cap} bytes")
    folder.mkdir(parents=True, exist_ok=True)
    partial = _inside(folder, folder / f".partial-{secrets.token_hex(6)}")
    written = 0
    buffer = bytearray()
    try:
        with open(partial, "wb") as fh:
            async for chunk in chunks:
                written += len(chunk)
                if written > cap:
                    raise UploadError(413, "too_large", f"file is larger than {cap} bytes")
                buffer += chunk
                if len(buffer) >= WRITE_CHUNK:
                    await asyncio.to_thread(fh.write, bytes(buffer))
                    buffer.clear()
            if buffer:
                await asyncio.to_thread(fh.write, bytes(buffer))
        if written == 0:
            raise UploadError(400, "empty_file", "the file is empty")
        with _index_lock(folder):
            target = _inside(folder, unique_path(folder, name))
            os.replace(partial, target)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
    return target, kind


# ---- media metadata -------------------------------------------------------------


def probe_media(path: Path) -> dict[str, Any]:
    """Duration / resolution / codec via ffprobe; empty fields when it is
    missing or the file is not media it understands."""
    from backlot.studio_setup import probe_env

    meta: dict[str, Any] = {"duration_s": None, "width": None, "height": None, "codec": None}
    env = probe_env()
    ffprobe = shutil.which("ffprobe", path=env.get("PATH"))
    if not ffprobe:
        return meta
    try:
        out = subprocess.run(
            [ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=30, check=True, env=env,
        )
        data = json.loads(out.stdout or "{}")
    except (subprocess.SubprocessError, ValueError, OSError):
        return meta
    streams = data.get("streams") or []
    video = next(
        (
            s
            for s in streams
            # Cover art inside an audio file is a "video" stream too.
            if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")
        ),
        None,
    )
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    main = video or audio
    try:
        duration = float((data.get("format") or {}).get("duration") or 0) or None
    except ValueError:
        duration = None
    meta.update(
        duration_s=round(duration, 3) if duration else None,
        width=video.get("width") if video else None,
        height=video.get("height") if video else None,
        codec=main.get("codec_name") if main else None,
    )
    return meta


# ---- inputs.json ----------------------------------------------------------------

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _index_lock(path: Path) -> threading.Lock:
    key = str(path.resolve())
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _index_file(project_dir: Path) -> Path:
    return project_dir / INDEX_PATH


def read_index(project_dir: Path) -> dict[str, Any]:
    try:
        data = json.loads(_index_file(project_dir).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    return {
        "schema": INDEX_SCHEMA,
        "files": [f for f in data.get("files") or [] if isinstance(f, dict)],
        "references": [r for r in data.get("references") or [] if isinstance(r, dict)],
    }


def _write_index(project_dir: Path, index: dict[str, Any]) -> None:
    target = _index_file(project_dir)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(f".{target.name}.{secrets.token_hex(4)}.tmp")
    tmp.write_text(json.dumps({**index, "updated_at": _now()}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, target)


def _update_index(project_dir: Path, change) -> dict[str, Any]:
    with _index_lock(project_dir):
        index = read_index(project_dir)
        result = change(index)
        _write_index(project_dir, index)
        return result


def list_inputs(project_dir: Path) -> dict[str, Any]:
    """Index entries, dropping files that no longer exist on disk."""
    index = read_index(project_dir)
    index["files"] = [f for f in index["files"] if (project_dir / str(f.get("path", ""))).is_file()]
    return index


def add_file(project_dir: Path, path: Path, media: str, kind: UploadKind) -> dict[str, Any]:
    meta = probe_media(path) if media in ("video", "audio", "image") else {}
    entry = {
        "path": path.relative_to(project_dir).as_posix(),
        "name": path.name,
        "kind": kind,
        "media": media,
        "size": path.stat().st_size,
        "duration_s": meta.get("duration_s") if media != "image" else None,
        "width": meta.get("width"),
        "height": meta.get("height"),
        "codec": meta.get("codec"),
        "uploaded_at": _now(),
    }

    def change(index):
        index["files"] = [f for f in index["files"] if f.get("path") != entry["path"]] + [entry]
        return entry

    return _update_index(project_dir, change)


def remove_file(project_dir: Path, name: str, started: bool) -> None:
    if started:
        raise UploadError(409, "already_started", "the agent has started; files can no longer be removed")
    folder = project_dir / INPUTS_DIR
    if name != safe_name(name):
        raise UploadError(404, "unknown_file", f"no such file: {name}")
    target = _inside(folder, folder / name)
    if not target.is_file():
        raise UploadError(404, "unknown_file", f"no such file: {name}")
    target.unlink()
    rel = f"{INPUTS_DIR}/{name}"
    _update_index(project_dir, lambda index: index.update(
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


def add_reference(project_dir: Path, ref: ReferenceIn, source: str = "studio") -> dict[str, Any]:
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

    return _update_index(project_dir, change)


def remove_reference(project_dir: Path, ref_id: str, started: bool) -> None:
    if started:
        raise UploadError(409, "already_started", "the agent has started; links can no longer be removed")

    def change(index):
        before = len(index["references"])
        index["references"] = [r for r in index["references"] if r.get("id") != ref_id]
        if len(index["references"]) == before:
            raise UploadError(404, "unknown_reference", f"no such link: {ref_id}")

    _update_index(project_dir, change)


# ---- music library ----------------------------------------------------------------


def music_dir() -> Path:
    """Same resolution as tools/audio/music_library.py, which the agent uses."""
    env_dir = os.environ.get("MUSIC_LIBRARY_DIR")
    return Path(env_dir).expanduser() if env_dir else REPO_ROOT / "music_library"


def list_music() -> list[dict[str, Any]]:
    folder = music_dir()
    if not folder.is_dir():
        return []
    tracks = sorted(
        (p for p in folder.rglob("*") if p.is_file() and media_kind(p.name) == "audio"),
        key=lambda p: p.as_posix().lower(),
    )
    return [
        {
            "name": p.relative_to(folder).as_posix(),
            "title": p.stem.replace("_", " ").replace("-", " ").strip() or p.name,
            "size": p.stat().st_size,
            "duration_s": _cached_duration(p),
        }
        for p in tracks
    ]


_duration_cache: dict[tuple[str, float, int], Optional[float]] = {}


def _cached_duration(path: Path) -> Optional[float]:
    st = path.stat()
    key = (str(path), st.st_mtime, st.st_size)
    if key not in _duration_cache:
        _duration_cache[key] = probe_media(path).get("duration_s")
    return _duration_cache[key]


def music_track(name: str) -> Path:
    """Library track by its listed name (may include sub-folders)."""
    folder = music_dir()
    if not name or "\x00" in name or "\\" in name or name.startswith("/"):
        raise UploadError(404, "unknown_track", "no such track")
    target = (folder / name).resolve()
    try:
        target.relative_to(folder.resolve())
    except ValueError:
        raise UploadError(404, "unknown_track", "no such track") from None
    if not target.is_file() or media_kind(target.name) != "audio":
        raise UploadError(404, "unknown_track", "no such track")
    return target
