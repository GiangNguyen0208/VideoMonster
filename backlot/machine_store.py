"""Machine-local resources for the Studio API: everything that is *not*
project data.

- ``config.yaml`` (Settings), ``.env`` (Setup keys)
- ``music_library/`` (shared across projects)
- checked-in catalogs and demo renders in the repository
- local binaries (ffprobe)

Like ``backlot/project_store.py`` for project files, this is the only place
v1 modules touch the filesystem for these (enforced by
``tests/contracts/test_studio_store_contract.py``). In hosted mode none of
these live on the server: settings become per-user records, and keys,
binaries and the music library stay on the user's machine, reported by the
sync connector (docs/ui-plan/hosted/design.md §5).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, AsyncIterator, Optional

from backlot.project_store import PathEscapesProject, atomic_write_text, contained, stream_into
from backlot.state import REPO_ROOT

AUDIO_EXTENSIONS = frozenset({".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aiff", ".aif"})


# ---- text files (config.yaml, .env) ---------------------------------------------


def read_text(path: Path) -> Optional[str]:
    """File contents, or ``None`` when it doesn't exist."""
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return None


def write_text(path: Path, text: str, mode: Optional[int] = None) -> None:
    """Atomic replace; ``mode`` sets permissions (e.g. 0o600 for ``.env``)."""
    atomic_write_text(path, text, mode)


def repo_file_exists(rel: str) -> bool:
    """A checked-in file such as ``styles/<name>.yaml``."""
    return (REPO_ROOT / rel).is_file()


def file_exists(path: Path) -> bool:
    return path.is_file()


def load_repo_script(path: Path, module_name: str):
    """Import a checked-in script (e.g. ``render_demo.py``) as a module."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---- music library -----------------------------------------------------------------


def music_dir() -> Path:
    """Same resolution as tools/audio/music_library.py, which the agent uses."""
    env_dir = os.environ.get("MUSIC_LIBRARY_DIR")
    return Path(env_dir).expanduser() if env_dir else REPO_ROOT / "music_library"


def list_music_files() -> list[tuple[str, Path, int]]:
    """(name relative to the library, path, size) for every audio file."""
    folder = music_dir()
    if not folder.is_dir():
        return []
    tracks = sorted(
        (p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS),
        key=lambda p: p.as_posix().lower(),
    )
    return [(p.relative_to(folder).as_posix(), p, p.stat().st_size) for p in tracks]


def music_track(name: str) -> Optional[Path]:
    """Library track by listed name (may include sub-folders), or ``None``."""
    folder = music_dir()
    if not name or "\x00" in name or "\\" in name or name.startswith("/"):
        return None
    try:
        target = contained(folder, folder / name)
    except PathEscapesProject:
        return None
    return target if target.is_file() and target.suffix.lower() in AUDIO_EXTENSIONS else None


async def add_music(name: str, chunks: AsyncIterator[bytes], max_bytes: int) -> Path:
    return await stream_into(music_dir(), name, chunks, max_bytes)


# ---- local binaries -------------------------------------------------------------------


def probe_env() -> dict[str, str]:
    from backlot.studio_setup import probe_env as env

    return env()


def probe_media(path: Path) -> dict[str, Any]:
    """Duration / resolution / codec via ffprobe; empty fields when it is
    missing or the file is not media it understands."""
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


_probe_cache: dict[tuple[str, float, int], dict[str, Any]] = {}


def probe_cached(path: Path) -> dict[str, Any]:
    """``probe_media`` remembered per (path, mtime, size)."""
    st = path.stat()
    key = (str(path), st.st_mtime, st.st_size)
    if key not in _probe_cache:
        _probe_cache[key] = probe_media(path)
    return _probe_cache[key]
