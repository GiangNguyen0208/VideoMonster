"""Setup center logic: capability probe, setup tier, unlock offers, `.env` writes.

Everything shown to the user is derived from the tool registry (via
``backlot/setup_probe.py``) — no provider names or env-var names are
hard-coded here, matching the AGENT_GUIDE rule that install hints come from
each tool's ``install_instructions``.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Optional

from backlot.state import REPO_ROOT

ENV_PATH = REPO_ROOT / ".env"
PROBE_TIMEOUT_SECONDS = 240
MAX_SUGGESTED_OFFERS = 3

ENV_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,63}$")
_URL_RE = re.compile(r"https?://[^\s)>\]\"']+")
_ENV_LINE_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")

TIERS = {
    "zero_key": {
        "label": "Zero-key",
        "explanation": "Free, local tools only: narration with Piper, rendering, editing and captions.",
    },
    "starter": {
        "label": "Starter",
        "explanation": "You can generate AI images for your videos.",
    },
    "standard": {
        "label": "Standard",
        "explanation": "AI images, voice-over and music are all set up.",
    },
    "full": {
        "label": "Full",
        "explanation": "AI video clips plus images, voice and music — every video type is open.",
    },
    "full_gpu": {
        "label": "Full + GPU",
        "explanation": "Everything, plus free local video generation on your GPU.",
    },
}


# ---- probe ------------------------------------------------------------------


def probe_env() -> dict[str, str]:
    """Environment for the probe subprocess.

    The server is often started as ``.venv/bin/python`` without activating the
    venv, so console scripts installed there (``piper`` …) are not on PATH and
    tools that look them up with ``shutil.which`` report UNAVAILABLE. Prepend
    the interpreter's bin dir so the probe sees what an activated shell sees.
    """
    env = dict(os.environ)
    bin_dir = str(Path(sys.executable).parent)
    parts = env.get("PATH", "").split(os.pathsep)
    if bin_dir not in parts:
        env["PATH"] = os.pathsep.join([bin_dir, *[p for p in parts if p]])
    return env


def run_probe() -> dict[str, Any]:
    proc = subprocess.run(
        [sys.executable, "-m", "backlot.setup_probe"],
        cwd=REPO_ROOT,
        env=probe_env(),
        capture_output=True,
        text=True,
        timeout=PROBE_TIMEOUT_SECONDS,
    )
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-1:] or ["unknown error"]
        raise RuntimeError(f"capability check failed: {tail[0]}")
    return json.loads(proc.stdout)


class ProbeCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.data: Optional[dict[str, Any]] = None
        self.at: Optional[float] = None

    def set(self, data: dict[str, Any]) -> None:
        with self._lock:
            self.data, self.at = data, time.time()

    def clear(self) -> None:
        with self._lock:
            self.data, self.at = None, None


probe_cache = ProbeCache()


# ---- derived view -------------------------------------------------------------


def _configured(summary: dict[str, Any], capability: str) -> int:
    for cap in summary.get("capabilities", []):
        if cap.get("capability") == capability:
            return int(cap.get("configured") or 0)
    return 0


def compute_tier(summary: dict[str, Any], tools: list[dict[str, Any]]) -> str:
    has = lambda cap: _configured(summary, cap) > 0  # noqa: E731
    gpu_video = any(
        t["available"] and t["capability"] == "video_generation" and t["runtime"] == "local_gpu"
        for t in tools
    )
    cloud_video = any(
        t["available"] and t["capability"] == "video_generation" and t["runtime"] != "local_gpu"
        for t in tools
    )
    full = (cloud_video or gpu_video) and has("image_generation") and has("tts") and has(
        "music_generation"
    )
    if full and gpu_video:
        return "full_gpu"
    if full:
        return "full"
    if has("image_generation") and has("tts") and has("music_generation"):
        return "standard"
    if has("image_generation"):
        return "starter"
    return "zero_key"


def video_type_state(p: dict[str, Any]) -> str:
    if p["missing_required"]:
        return "locked"
    if p["missing_enhancements"]:
        return "limited"
    return "ready"


def _first_url(text: str) -> Optional[str]:
    match = _URL_RE.search(text or "")
    return match.group(0).rstrip(".,;") if match else None


def unlock_offers(probe: dict[str, Any]) -> list[dict[str, Any]]:
    """One offer per env var that would make at least one unavailable tool work.

    Ranked by how many locked video types it unlocks, then how many limited
    ones it improves, then how many capabilities it touches.
    """
    tools = probe["tools"]
    available_caps = {t["capability"] for t in tools if t["available"]}
    by_key: dict[str, list[dict[str, Any]]] = {}
    for tool in tools:
        if tool["available"] or len(tool["env_vars"]) != 1:
            continue  # multi-key tools are not a "one-minute fix"
        by_key.setdefault(tool["env_vars"][0], []).append(tool)

    offers = []
    for key, key_tools in by_key.items():
        caps = sorted({t["capability"] for t in key_tools})
        new_caps = set(caps) - available_caps
        unlocks, improves = [], []
        for p in probe["pipelines"]:
            if p["missing_required"] and set(p["missing_required"]) <= new_caps:
                unlocks.append(p["pipeline"])
            elif not p["missing_required"] and new_caps & set(p["missing_enhancements"]):
                improves.append(p["pipeline"])
        instructions = next((t["install_instructions"] for t in key_tools if t["install_instructions"]), "")
        offers.append(
            {
                "env_var": key,
                "providers": sorted({t["provider"] for t in key_tools}),
                "capabilities": caps,
                "new_capabilities": sorted(new_caps),
                "tools": sorted(t["name"] for t in key_tools),
                "unlocks_video_types": sorted(unlocks),
                "improves_video_types": sorted(improves),
                "install_instructions": instructions,
                "signup_url": _first_url(instructions),
            }
        )
    offers.sort(
        key=lambda o: (
            -len(o["unlocks_video_types"]),
            -len(o["improves_video_types"]),
            -len(o["new_capabilities"]),
            o["env_var"],
        )
    )
    return offers


def allowed_env_keys(probe: Optional[dict[str, Any]]) -> set[str]:
    """Keys Studio may write: every ``env:`` dependency a registered tool declares."""
    if not probe:
        return set()
    return {k for t in probe["tools"] for k in t["env_vars"] if ENV_KEY_RE.match(k)}


def build_view(probe: dict[str, Any], env_path: Optional[Path] = None) -> dict[str, Any]:
    env_path = env_path or ENV_PATH
    summary = probe["summary"]
    tools = probe["tools"]
    tier = compute_tier(summary, tools)
    offers = unlock_offers(probe)
    keys = env_status(sorted(allowed_env_keys(probe)), env_path)

    works_now = [
        {
            "capability": c["capability"],
            "configured": c["configured"],
            "total": c["total"],
            "providers": c["available_providers"],
        }
        for c in summary.get("capabilities", [])
        if c.get("configured")
    ]
    hardware = [
        {
            "tool": t["name"],
            "capability": t["capability"],
            "provider": t["provider"],
            "install_instructions": t["install_instructions"],
        }
        for t in tools
        if not t["available"] and t["runtime"] == "local_gpu"
    ]
    return {
        "tier": tier,
        "tier_label": TIERS[tier]["label"],
        "tier_explanation": TIERS[tier]["explanation"],
        "runtimes": summary.get("composition_runtimes", {}),
        "works_now": works_now,
        "video_types": [
            {**p, "state": video_type_state(p)} for p in probe["pipelines"]
        ],
        "suggested_offers": offers[:MAX_SUGGESTED_OFFERS],
        "offers": offers,
        "hardware": hardware,
        "warnings": summary.get("runtime_warnings", []),
        "keys": keys,
        "checked_at": probe_cache.at,
    }


# ---- .env ------------------------------------------------------------------


def _unquote(raw: str) -> str:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1]
    return value.split(" #", 1)[0].strip()


def read_env_file(env_path: Optional[Path] = None) -> dict[str, str]:
    env_path = env_path or ENV_PATH
    values: dict[str, str] = {}
    if not env_path.is_file():
        return values
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.lstrip().startswith("#"):
            continue
        match = _ENV_LINE_RE.match(line)
        if match:
            values[match.group(1)] = _unquote(match.group(2))
    return values


def _hint(value: str) -> str:
    return f"••••{value[-4:]}" if len(value) >= 8 else "••••"


def env_status(keys: list[str], env_path: Optional[Path] = None) -> dict[str, dict[str, Any]]:
    """Set/unset per key from ``.env`` (falling back to the server environment).
    Never returns values — only a masked hint."""
    file_values = read_env_file(env_path or ENV_PATH)
    status = {}
    for key in keys:
        value = file_values.get(key) or os.environ.get(key) or ""
        status[key] = {
            "set": bool(value),
            "hint": _hint(value) if value else None,
            "source": "env_file" if file_values.get(key) else ("environment" if value else None),
        }
    return status


def _format_value(value: str) -> str:
    if re.search(r"[\s#'\"]", value):
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return value


def write_env_var(key: str, value: str, env_path: Optional[Path] = None) -> None:
    """Set (or with an empty value, remove) ``key`` in ``.env``.

    Comments, blank lines and the order of other keys are preserved. The
    file is replaced atomically and keeps owner-only permissions.
    """
    env_path = env_path or ENV_PATH
    if not ENV_KEY_RE.match(key):
        raise ValueError("invalid key name")
    if "\n" in value or "\r" in value or "\x00" in value:
        raise ValueError("value must be a single line")

    lines = (
        env_path.read_text(encoding="utf-8", errors="replace").splitlines()
        if env_path.is_file()
        else []
    )
    new_line = f"{key}={_format_value(value)}" if value else None
    out: list[str] = []
    replaced = False
    for line in lines:
        match = None if line.lstrip().startswith("#") else _ENV_LINE_RE.match(line)
        if match and match.group(1) == key:
            if not replaced and new_line is not None:
                out.append(new_line)
            replaced = True  # drop duplicates of the same key
            continue
        out.append(line)
    if not replaced and new_line is not None:
        if out and out[-1].strip():
            out.append("")
        out.append(new_line)

    env_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".env.", suffix=".tmp", dir=env_path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out) + ("\n" if out else ""))
        os.chmod(tmp, 0o600)
        os.replace(tmp, env_path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
