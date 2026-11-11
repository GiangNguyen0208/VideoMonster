"""Finished videos for Studio: render variants with their facts, copy-ready
publish text, and the export bundle (docs/ui-plan/phases/phase-6-results-and-cost.md).

Read-only over what the agent wrote (``renders/``, ``render_report``,
``publish_log``); ffprobe fills in facts the report doesn't carry.
"""

from __future__ import annotations

from typing import Any, Optional

from backlot import machine_store
from backlot.project_store import ProjectFiles


def _artifact(files: ProjectFiles, name: str, state: dict[str, Any]) -> Optional[dict[str, Any]]:
    value = (state.get("artifacts") or {}).get(name)
    return value if isinstance(value, dict) else files.read_json(f"artifacts/{name}.json")


def list_results(files: ProjectFiles, state: dict[str, Any]) -> dict[str, Any]:
    report = _artifact(files, "render_report", state) or {}
    outputs = [o for o in report.get("outputs") or [] if isinstance(o, dict)]
    renders = []
    for r in (state.get("media") or {}).get("renders") or []:
        info = files.stat(r["path"])
        if info is None or info.is_dir:
            continue
        out = next((o for o in outputs if files.safe_rel(o.get("path")) == info.path), {})
        meta = machine_store.probe_cached(files.local_file(info.path))
        width, height = meta.get("width"), meta.get("height")
        renders.append(
            {
                "path": info.path,
                "name": info.name,
                "size": info.size,
                "mtime": info.mtime,
                "label": out.get("platform_target"),
                "resolution": out.get("resolution") or (f"{width}x{height}" if width and height else None),
                "duration_s": out.get("duration_seconds") or meta.get("duration_s"),
                "fps": out.get("fps"),
                "in_report": bool(out),
            }
        )
    return {"renders": renders, "publish": publish_text(files, state), "export": export_info(files, state)}


def publish_text(files: ProjectFiles, state: dict[str, Any]) -> dict[str, Any]:
    """Title, description and hashtags for copy buttons: the newest publish
    entry that has them, else the project title only."""
    log = _artifact(files, "publish_log", state) or {}
    entries = [e for e in log.get("entries") or [] if isinstance(e, dict)]
    for entry in sorted(entries, key=lambda e: str(e.get("timestamp") or ""), reverse=True):
        meta = entry.get("metadata_used")
        if isinstance(meta, dict) and (meta.get("title") or meta.get("description")):
            tags = [str(t) for t in meta.get("hashtags") or [] if t]
            return {
                "source": "publish_log",
                "platform": entry.get("platform"),
                "title": meta.get("title") or state.get("title"),
                "description": meta.get("description"),
                "hashtags": [t if t.startswith("#") else f"#{t}" for t in tags],
            }
    return {"source": "project", "platform": None, "title": state.get("title"), "description": None, "hashtags": []}


def _export_entry(files: ProjectFiles, state: dict[str, Any]) -> Optional[tuple[str, dict[str, Any]]]:
    """(relative path, entry) of the newest ``exported`` publish entry whose
    ``export_path`` exists inside the project."""
    log = _artifact(files, "publish_log", state) or {}
    entries = [e for e in log.get("entries") or [] if isinstance(e, dict) and e.get("status") == "exported"]
    for entry in sorted(entries, key=lambda e: str(e.get("timestamp") or ""), reverse=True):
        rel = files.safe_rel(entry.get("export_path"))
        if rel is not None:
            return rel, entry
    return None


def export_info(files: ProjectFiles, state: dict[str, Any]) -> Optional[dict[str, Any]]:
    found = _export_entry(files, state)
    if found is None:
        return None
    rel, entry = found
    info = files.stat(rel)
    if info is not None and not info.is_dir:
        return {"kind": "file", "name": info.name, "files": 1, "size": info.size, "platform": entry.get("platform")}
    inside = files.list(rel, recursive=True)
    return {
        "kind": "folder",
        "name": f"{files.project_id}-export.zip",
        "files": len(inside),
        "size": sum(f.size for f in inside),
        "platform": entry.get("platform"),
    }


def export_target(files: ProjectFiles, state: dict[str, Any]) -> Optional[tuple[str, bool]]:
    """(relative path, is a folder) to send for the export download."""
    found = _export_entry(files, state)
    if found is None:
        return None
    info = files.stat(found[0])
    return found[0], bool(info and info.is_dir)
