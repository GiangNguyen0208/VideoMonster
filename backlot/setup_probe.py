"""Capability probe for the Studio Setup center.

Run as ``python -m backlot.setup_probe``; prints one JSON document on stdout.

It runs in a fresh process on purpose: ``registry.discover()`` loads ``.env``
into the process environment and tool modules may cache state at import, so
only a new process reliably reflects a key the user just saved. The Backlot
server never imports the tool registry itself.
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
from typing import Any

# Capabilities whose absence changes what a video *looks or sounds like*.
# Missing optional tools outside this set (3D rendering, corpora, ...) are too
# niche to surface as "works better with ..." on a newcomer's setup page.
HEADLINE_CAPABILITIES = (
    "image_generation",
    "video_generation",
    "tts",
    "music_generation",
    "avatar",
    "sound_effects",
)

_OPTIONAL_FIELDS = ("optional_tools", "preferred_tools", "fallback_tools", "tools_available")


def _stage_tools(manifest: dict[str, Any]) -> tuple[set[str], set[str]]:
    required: set[str] = set()
    optional: set[str] = set()
    for stage in manifest.get("stages", []):
        for node in [stage, *stage.get("sub_stages", [])]:
            required.update(node.get("required_tools", []) or [])
            for field in _OPTIONAL_FIELDS:
                optional.update(node.get(field, []) or [])
    return required, optional - required


def _pipeline_coverage(registry) -> list[dict[str, Any]]:
    from lib.pipeline_loader import list_pipelines, load_pipeline

    result = []
    for name in list_pipelines():
        if name == "framework-smoke":  # test pipeline, never user-facing
            continue
        try:
            manifest = load_pipeline(name)
        except Exception:
            continue
        required, optional = _stage_tools(manifest)
        missing_required = registry.uncovered_capabilities(required)
        missing_optional = [
            cap
            for cap in registry.uncovered_capabilities(required | optional)
            if cap in HEADLINE_CAPABILITIES and cap not in missing_required
        ]
        result.append(
            {
                "pipeline": name,
                "stability": manifest.get("stability"),
                "missing_required": sorted(missing_required),
                "missing_enhancements": sorted(missing_optional),
            }
        )
    return result


def _tools(registry) -> list[dict[str, Any]]:
    """Compact per-tool facts: status, runtime, env vars it needs."""
    from tools.base_tool import ToolStatus

    out = []
    for name in registry.list_all():
        tool = registry.get(name)
        if tool is None or getattr(tool, "provider", None) == "selector":
            continue
        deps = list(getattr(tool, "dependencies", []) or [])
        out.append(
            {
                "name": tool.name,
                "capability": tool.capability,
                "provider": tool.provider,
                "runtime": tool.runtime.value,
                "available": tool.get_status() == ToolStatus.AVAILABLE,
                "env_vars": [d[4:] for d in deps if isinstance(d, str) and d.startswith("env:")],
                "install_instructions": getattr(tool, "install_instructions", "") or "",
            }
        )
    return out


def probe() -> dict[str, Any]:
    from tools.tool_registry import registry

    registry.discover()
    summary = registry.provider_menu_summary()
    return {
        "summary": summary,
        "pipelines": _pipeline_coverage(registry),
        "tools": _tools(registry),
    }


def main() -> int:
    # Tool modules may print during import/discovery; keep stdout pure JSON.
    noise = io.StringIO()
    with contextlib.redirect_stdout(noise):
        result = probe()
    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
