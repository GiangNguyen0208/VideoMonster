"""New-video wizard backend: pipeline/style catalogs, intake validation,
project creation, kickoff commands and zero-key demo renders.

Studio stays a companion to the agent (docs/ui-plan/03-architecture.md): it
creates the project workspace with ``lib.checkpoint.init_project`` and writes
``studio/intake.json``, but never writes a checkpoint. The agent reads the
intake at kickoff (AGENT_GUIDE.md "Projects created in Studio").
"""

from __future__ import annotations

import re
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Optional

import yaml
from pydantic import BaseModel, Field, field_validator

from backlot import machine_store
from backlot.project_store import ProjectFiles, ProjectStore
from backlot.state import REPO_ROOT
from backlot.studio_jobs import Job

INTAKE_PATH = "studio/intake.json"
INTAKE_SCHEMA = "studio.intake/1"
HIDDEN_PIPELINES = frozenset({"framework-smoke"})
CONFIG_PATH = REPO_ROOT / "config.yaml"
RENDER_DEMO_SCRIPT = REPO_ROOT / "render_demo.py"
DEMO_RENDER_TIMEOUT_SECONDS = 900
DEMO_PROJECT_ID = "demos"


# ---- catalogs -----------------------------------------------------------------


@lru_cache(maxsize=1)
def _pipeline_catalog() -> tuple[dict[str, Any], ...]:
    from lib.pipeline_loader import (
        get_stage_human_approval_default,
        get_stage_order,
        list_pipelines,
        load_pipeline_readonly,
        pipeline_supports_reference_input,
    )

    items = []
    for name in sorted(list_pipelines()):
        if name in HIDDEN_PIPELINES:
            continue
        manifest = load_pipeline_readonly(name)
        playbooks = manifest.get("compatible_playbooks") or {}
        items.append(
            {
                "name": name,
                "description": " ".join(str(manifest.get("description", "")).split()),
                "category": manifest.get("category"),
                "stability": manifest.get("stability"),
                "stages": [
                    {"name": s, "gated": bool(get_stage_human_approval_default(manifest, s))}
                    for s in get_stage_order(manifest)
                ],
                "reference_input": pipeline_supports_reference_input(manifest),
                "compatible_playbooks": {
                    "recommended": list(playbooks.get("recommended") or []),
                    "also_works": list(playbooks.get("also_works") or []),
                    "custom_allowed": bool(playbooks.get("custom_allowed", False)),
                },
                "production_modes": [
                    {"name": m.get("name"), "description": m.get("description", "")}
                    for m in manifest.get("production_modes") or []
                ],
                "budget_default_usd": (manifest.get("orchestration") or {}).get(
                    "budget_default_usd"
                ),
                "default_checkpoint_policy": manifest.get("default_checkpoint_policy"),
            }
        )
    return tuple(items)


def list_pipeline_catalog(probe: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    """Catalog merged with the Setup center's lock state (``None`` before the
    first capability check)."""
    from backlot.studio_setup import video_type_state

    coverage = {p["pipeline"]: p for p in (probe or {}).get("pipelines", [])}
    out = []
    for item in _pipeline_catalog():
        p = coverage.get(item["name"])
        out.append(
            {
                **item,
                "availability": (
                    {
                        "state": video_type_state(p),
                        "missing_required": p["missing_required"],
                        "missing_enhancements": p["missing_enhancements"],
                    }
                    if p
                    else None
                ),
            }
        )
    return out


def pipeline_names() -> set[str]:
    return {p["name"] for p in _pipeline_catalog()}


def list_styles() -> list[dict[str, Any]]:
    from styles.playbook_loader import list_playbooks, load_playbook

    styles = []
    for name in list_playbooks():
        try:
            playbook = load_playbook(name)
        except Exception:
            continue  # an invalid custom playbook must not break the wizard
        identity = playbook.get("identity") or {}
        palette = (playbook.get("visual_language") or {}).get("color_palette") or {}
        swatches: list[str] = []
        for key in ("background", "primary", "accent", "text"):
            value = palette.get(key)
            for color in value if isinstance(value, list) else [value]:
                if isinstance(color, str) and color.startswith("#") and color not in swatches:
                    swatches.append(color)
        styles.append(
            {
                "name": name,
                "title": identity.get("name") or name,
                "mood": identity.get("mood"),
                "best_for": identity.get("best_for"),
                "palette": swatches[:6],
                "custom": not machine_store.repo_file_exists(f"styles/{name}.yaml"),
            }
        )
    return styles


def budget_defaults() -> dict[str, Any]:
    try:
        config = yaml.safe_load(machine_store.read_text(CONFIG_PATH) or "") or {}
    except (OSError, yaml.YAMLError):
        config = {}
    budget = config.get("budget") or {}
    checkpoint = config.get("checkpoint") or {}
    return {
        "mode": budget.get("mode", "warn"),
        "total_usd": budget.get("total_usd"),
        "checkpoint_policy": checkpoint.get("policy", "guided"),
    }


# ---- intake --------------------------------------------------------------------

Platform = Literal["youtube", "shorts", "linkedin", "other"]
Aspect = Literal["16:9", "9:16", "1:1", "4:5"]
ShortText = Field(default="", max_length=300)


def _clean_list(values: list[str]) -> list[str]:
    return [v.strip() for v in values if v and v.strip()]


class Brief(BaseModel):
    topic: str = Field(min_length=3, max_length=2000)
    audience: str = ShortText
    platform: Platform = "youtube"
    aspect: Aspect = "16:9"
    duration_seconds: int = Field(default=60, ge=5, le=3600)
    tone: str = ShortText
    must_include: list[str] = Field(default_factory=list, max_length=20)
    avoid: list[str] = Field(default_factory=list, max_length=20)
    # localization-dub: languages to translate into (free text, e.g. "Vietnamese").
    target_languages: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("topic", "audience", "tone")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("must_include", "avoid", "target_languages")
    @classmethod
    def _items(cls, v: list[str]) -> list[str]:
        if any(len(item) > 300 for item in v):
            raise ValueError("items must be at most 300 characters")
        return _clean_list(v)


class Budget(BaseModel):
    cap_usd: float = Field(default=0, ge=0, le=1000)
    mode: Literal["observe", "warn", "cap"] = "cap"


class Reference(BaseModel):
    url: Optional[str] = Field(default=None, max_length=2000)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("url")
    @classmethod
    def _http_only(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip() or None
        if v and not re.match(r"^https?://\S+$", v):
            raise ValueError("reference link must be an http(s) URL")
        return v


class Advanced(BaseModel):
    render_runtime_preference: Optional[Literal["remotion", "hyperframes"]] = None
    composition_mode_preference: Optional[Literal["templated", "atelier"]] = None
    checkpoint_policy: Optional[Literal["guided", "manual_all"]] = None
    production_mode: Optional[str] = Field(default=None, max_length=64)


class IntakeIn(BaseModel):
    """Wizard payload. Mirrors ``studio.intake/1`` minus server-set fields."""

    title: str = Field(default="", max_length=120)
    goal: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
    pipeline_type: str = Field(min_length=1, max_length=64)
    brief: Brief
    style_playbook: Optional[str] = Field(default=None, max_length=64)
    budget: Budget = Field(default_factory=Budget)
    reference: Reference = Field(default_factory=Reference)
    advanced: Advanced = Field(default_factory=Advanced)
    # Track picked from music_library/ (name as listed by GET /api/v1/music).
    music_track: Optional[str] = Field(default=None, max_length=255)
    language: str = Field(default="en", min_length=2, max_length=20)


class CatalogError(ValueError):
    """Input names something the catalog does not have (API maps to 422)."""


def validate_choices(intake: IntakeIn) -> None:
    if intake.pipeline_type not in pipeline_names():
        raise CatalogError(f"unknown video type: {intake.pipeline_type}")
    if intake.style_playbook is not None:
        if intake.style_playbook not in {s["name"] for s in list_styles()}:
            raise CatalogError(f"unknown style: {intake.style_playbook}")
    mode = intake.advanced.production_mode
    if mode is not None:
        modes = next(
            p["production_modes"] for p in _pipeline_catalog() if p["name"] == intake.pipeline_type
        )
        if mode not in {m["name"] for m in modes}:
            raise CatalogError(f"unknown production mode: {mode}")


def intake_document(intake: IntakeIn, created_at: Optional[str] = None) -> dict[str, Any]:
    data = intake.model_dump()
    title = data.pop("title").strip() or derive_title(intake.brief.topic)
    return {
        "schema": INTAKE_SCHEMA,
        "created_at": created_at or datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "title": title,
        **data,
    }


def derive_title(topic: str) -> str:
    title = " ".join(topic.split())
    if len(title) > 80:
        title = title[:80].rsplit(" ", 1)[0] + "…"
    return title[:1].upper() + title[1:]


def slugify(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if len(slug) > max_len:
        cut = slug[: max_len + 1]
        # End on a whole word when there is one to end on.
        slug = cut.rsplit("-", 1)[0] if "-" in cut else slug[:max_len]
    return slug.strip("-") or "video"


def new_project_id(title: str, store: ProjectStore) -> str:
    base = slugify(title)
    for _ in range(20):
        candidate = f"{base}-{secrets.token_hex(2)}"
        if not store.exists(candidate):
            return candidate
    raise RuntimeError("could not find a free project id")


def has_checkpoint(files: ProjectFiles) -> bool:
    return bool(files.list("", "checkpoint_*.json"))


# ---- kickoff -------------------------------------------------------------------


def kickoff(project_id: str) -> dict[str, Any]:
    request = f"Continue Studio project {project_id}"
    return {
        "project_id": project_id,
        "request": request,
        "agents": [
            {
                "id": "claude",
                "label": "Claude Code",
                "command": f'claude "/reel {request}"',
                "note": "Run from the OpenMontage folder.",
            },
            {
                "id": "codex",
                "label": "Codex",
                "command": f'codex "{request}"',
                "note": "Codex reads CODEX.md, which points it at AGENT_GUIDE.md.",
            },
            {
                "id": "cursor",
                "label": "Cursor / Copilot / Windsurf",
                "command": request,
                "note": "Paste this into the agent chat with the OpenMontage folder open.",
            },
        ],
    }


# ---- demos ---------------------------------------------------------------------


@lru_cache(maxsize=1)
def _render_demo_module():
    return machine_store.load_repo_script(RENDER_DEMO_SCRIPT, "_om_render_demo")


def demo_output(name: str) -> Path:
    return Path(_render_demo_module().OUTPUT_DIR) / f"{name}.mp4"


def list_demos() -> list[dict[str, Any]]:
    module = _render_demo_module()
    out = []
    for name in module.discover_demos():
        video = demo_output(name)
        out.append(
            {
                "name": name,
                "title": name.replace("-", " ").capitalize(),
                "description": module.DEMO_DESCRIPTIONS.get(name, "Checked-in Remotion demo"),
                "rendered": machine_store.file_exists(video),
                "video_url": f"/media/{DEMO_PROJECT_ID}/renders/{name}.mp4"
                if machine_store.file_exists(video)
                else None,
            }
        )
    return out


# Remotion prints "Rendered 120/600" then "Encoded 120/600"; rendering is the
# long part, encoding trails it closely.
_PROGRESS_RE = re.compile(r"\b(Rendered|Encoded)\s+(\d+)\s*/\s*(\d+)")


def parse_progress(line: str) -> Optional[float]:
    match = _PROGRESS_RE.search(line)
    if not match:
        return None
    done, total = int(match.group(2)), int(match.group(3))
    if total <= 0:
        return None
    frac = min(done / total, 1.0)
    return round(0.95 * frac if match.group(1) == "Rendered" else 0.95 + 0.05 * frac, 3)


def render_demo_job(name: str, job: Job, command: Optional[list[str]] = None) -> dict[str, Any]:
    """Run ``render_demo.py <name>`` streaming its output into ``job.progress``."""
    from backlot.studio_setup import probe_env

    cmd = command or [sys.executable, str(RENDER_DEMO_SCRIPT), name]
    proc = subprocess.Popen(
        cmd,
        cwd=REPO_ROOT,
        env={**probe_env(), "PYTHONUNBUFFERED": "1"},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    tail: list[str] = []
    assert proc.stdout is not None
    buffer = ""
    while True:
        chunk = proc.stdout.read(256)
        if not chunk:
            break
        buffer += chunk
        *lines, buffer = re.split(r"[\r\n]", buffer)
        for line in lines:
            if not line.strip():
                continue
            tail = (tail + [line.strip()])[-5:]
            progress = parse_progress(line)
            if progress is not None:
                job.progress = max(job.progress or 0, progress)
    try:
        code = proc.wait(timeout=DEMO_RENDER_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise RuntimeError("demo render timed out") from None
    if code != 0:
        raise RuntimeError(tail[-1] if tail else f"render exited with code {code}")
    job.progress = 1.0
    video = demo_output(name)
    return {
        "video_url": f"/media/{DEMO_PROJECT_ID}/renders/{name}.mp4" if machine_store.file_exists(video) else None
    }
