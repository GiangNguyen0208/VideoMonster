"""Studio settings: the allowlisted parts of ``config.yaml``.

Only spending limits, the review policy and output defaults are editable.
Values are validated with Pydantic and the result must still load through
``lib.config_model.OpenMontageConfig``.

``ruamel.yaml`` is not a dependency, so writes edit the matching
``key: value`` lines in place. Comments, blank lines, key order and every
other setting stay exactly as they were. A missing key is added at the end
of its section, and a missing section is appended to the file.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Literal, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field

from backlot import machine_store
from backlot.state import REPO_ROOT

CONFIG_PATH = REPO_ROOT / "config.yaml"

RESOLUTIONS = ("1280x720", "1920x1080", "2560x1440", "3840x2160", "1080x1920", "1080x1080")
FPS = (24, 25, 30, 50, 60)

# (section, key) pairs Studio may change; everything else is read-only here.
EDITABLE: tuple[tuple[str, str], ...] = (
    ("budget", "mode"),
    ("budget", "total_usd"),
    ("budget", "single_action_approval_usd"),
    ("budget", "require_approval_for_new_paid_tool"),
    ("checkpoint", "policy"),
    ("output", "default_resolution"),
    ("output", "default_fps"),
)


class BudgetSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["observe", "warn", "cap"]
    total_usd: float = Field(ge=0, le=10000)
    single_action_approval_usd: float = Field(ge=0, le=10000)
    require_approval_for_new_paid_tool: bool


class CheckpointSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy: Literal["guided", "manual_all", "auto_noncreative"]


class OutputSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    default_resolution: Literal[RESOLUTIONS]  # type: ignore[valid-type]
    default_fps: Literal[FPS]  # type: ignore[valid-type]


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    budget: BudgetSettings
    checkpoint: CheckpointSettings
    output: OutputSettings


class SettingsError(Exception):
    pass


def read_settings(path: Optional[Path] = None) -> dict[str, Any]:
    """Current values (config defaults fill missing keys) plus the choices."""
    from lib.config_model import OpenMontageConfig

    text = machine_store.read_text(path or CONFIG_PATH)
    cfg = OpenMontageConfig.model_validate(yaml.safe_load(text or "") or {})
    return {
        "settings": {
            "budget": {
                "mode": cfg.budget.mode.value,
                "total_usd": cfg.budget.total_usd,
                "single_action_approval_usd": cfg.budget.single_action_approval_usd,
                "require_approval_for_new_paid_tool": cfg.budget.require_approval_for_new_paid_tool,
            },
            "checkpoint": {"policy": cfg.checkpoint.policy.value},
            "output": {
                "default_resolution": cfg.output.default_resolution,
                "default_fps": cfg.output.default_fps,
            },
        },
        "choices": {"resolutions": list(RESOLUTIONS), "fps": list(FPS)},
    }


def _scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        # Money reads like the shipped file (10.00); finer values keep every digit.
        return f"{value:.2f}" if round(value, 2) == value else repr(value)
    if isinstance(value, int):
        return str(value)
    text = str(value)
    # "1920x1080" is quoted in the shipped file; quote anything YAML could misread.
    return f'"{text}"' if re.fullmatch(r"\d+x\d+", text) or re.search(r"[:#'\"]", text) else text


_SECTION_RE = re.compile(r"^([A-Za-z_][\w-]*):\s*(#.*)?$")
_KEY_RE = re.compile(r"^(?P<indent>\s+)(?P<key>[A-Za-z_][\w-]*):(?P<gap>\s*)(?P<value>[^#\n]*?)(?P<comment>\s+#.*)?$")


def apply_to_text(text: str, updates: dict[str, dict[str, Any]]) -> str:
    """Rewrite only the given ``section.key`` values, keeping comments."""
    lines = text.splitlines()
    pending = {(sec, key): value for sec, keys in updates.items() for key, value in keys.items()}
    section: Optional[str] = None
    section_end: dict[str, int] = {}  # index after the last line of each section
    indent: dict[str, str] = {}

    for i, line in enumerate(lines):
        if m := _SECTION_RE.match(line):
            section = str(m.group(1))
            section_end[section] = i + 1
            continue
        if line and not line[0].isspace() and not line.lstrip().startswith("#"):
            section = None  # some other top-level construct
            continue
        if section is None:
            continue
        if line.strip():
            section_end[section] = i + 1
        m = _KEY_RE.match(line)
        if not m:
            continue
        indent.setdefault(section, m.group("indent"))
        target = (section, m.group("key"))
        if target in pending:
            head = f"{m.group('indent')}{m.group('key')}:{m.group('gap') or ' '}"
            new_line = head + _scalar(pending.pop(target))
            comment = m.group("comment")
            if comment:
                # Keep trailing comments in the column they were in.
                column = len(head) + len(m.group("value")) + len(comment) - len(comment.lstrip())
                new_line += " " * max(1, column - len(new_line)) + comment.lstrip()
            lines[i] = new_line

    # Keys the file doesn't have yet: insert at the end of their section,
    # bottom-up so earlier insertion points stay valid.
    missing: dict[str, list[tuple[str, Any]]] = {}
    for (sec, key), value in pending.items():
        missing.setdefault(sec, []).append((key, value))
    for sec in sorted((s for s in missing if s in section_end), key=lambda s: -section_end[s]):
        pad = indent.get(sec, "  ")
        new = [f"{pad}{key}: {_scalar(value)}" for key, value in missing[sec]]
        lines[section_end[sec]:section_end[sec]] = new
    for sec in (s for s in missing if s not in section_end):
        lines += ["", f"{sec}:"] + [f"  {key}: {_scalar(value)}" for key, value in missing[sec]]
    return "\n".join(lines) + ("\n" if text.endswith("\n") or not text else "")


def write_settings(body: SettingsIn, path: Optional[Path] = None) -> dict[str, Any]:
    from lib.config_model import OpenMontageConfig

    target = path or CONFIG_PATH
    text = machine_store.read_text(target) or ""
    updates = body.model_dump(mode="json")
    new_text = apply_to_text(text, updates)

    # The edit must round-trip: same values back, and a config the engine loads.
    raw = yaml.safe_load(new_text) or {}
    for section, keys in updates.items():
        for key, value in keys.items():
            if (raw.get(section) or {}).get(key) != value:
                raise SettingsError(f"could not write {section}.{key} safely")
    OpenMontageConfig.model_validate(raw)

    machine_store.write_text(target, new_text)
    return read_settings(target)
