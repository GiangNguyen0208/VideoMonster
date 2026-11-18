"""Creator-supplied audio for spec mode.

The worker normally generates narration and music with Gemini. When the
creator brings their own recording or track, these passthrough tools bring the
file into the project exactly where the spec says (``output_path``), so the
executor, verifier and assembler treat it like any generated asset. They cost
nothing and never call a model.
"""

from __future__ import annotations

import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)

_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aiff", ".aif"}


def _source(inputs: dict[str, Any]) -> Path:
    raw = inputs.get("source_path")
    if not raw:
        raise ValueError("source_path is required")
    path = Path(raw)
    if not path.is_file():
        raise ValueError(f"source file not found: {raw}")
    if path.suffix.lower() not in _AUDIO_EXTENSIONS:
        raise ValueError(f"not an audio file: {path.name}")
    return path


def _ffmpeg_wav(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vn", "-ac", "1", "-ar", "24000", str(dst)],
        capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        raise ValueError(f"ffmpeg could not read the audio: {proc.stderr.strip()[-200:]}")


class ProvidedAudio(BaseTool):
    """The creator's own narration recording, normalised to mono 24 kHz WAV."""

    name = "provided_audio"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "creator_audio"
    provider = "creator"
    stability = ToolStability.PRODUCTION
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL
    dependencies = ["cmd:ffmpeg"]
    install_instructions = "Install ffmpeg."
    agent_skills = ["spec-worker"]
    capabilities = ["use_creator_narration"]
    supports = {"local_offline": True, "free": True}
    best_for = ["narration the creator recorded themselves"]
    not_good_for = ["generating speech (use gemini_tts)"]
    input_schema = {
        "type": "object",
        "required": ["source_path"],
        "properties": {
            "source_path": {"type": "string", "description": "Project-relative path of the uploaded recording, e.g. inputs/voice.mp3"},
            "output_path": {"type": "string", "description": "Set by the worker; must end in .wav"},
        },
    }
    output_schema = {"type": "object", "properties": {"output": {"type": "string"}}}
    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=128, vram_mb=0, disk_mb=50, network_required=False)
    side_effects = ["writes output_path"]
    user_visible_verification = ["Play the narration"]

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE if shutil.which("ffmpeg") else ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        return 2.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        start = time.time()
        try:
            dst = Path(inputs.get("output_path", "provided_audio.wav"))
            if dst.suffix.lower() != ".wav":
                raise ValueError("output_path must end in .wav")
            _ffmpeg_wav(_source(inputs), dst)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
        return ToolResult(
            success=True, data={"output": str(dst), "format": "wav"}, artifacts=[str(dst)],
            cost_usd=0.0, duration_seconds=round(time.time() - start, 2),
        )


class ProvidedMusic(BaseTool):
    """A track the creator picked (music library) or uploaded, copied into the project."""

    name = "provided_music"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "creator_music"
    provider = "creator"
    stability = ToolStability.PRODUCTION
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL
    dependencies = []
    install_instructions = "None."
    agent_skills = ["spec-worker"]
    capabilities = ["use_creator_music"]
    supports = {"local_offline": True, "free": True}
    best_for = ["a track the creator chose"]
    not_good_for = ["generating music (use google_music)"]
    input_schema = {
        "type": "object",
        "required": ["source_path"],
        "properties": {
            "source_path": {"type": "string", "description": "Project-relative path of the chosen track, e.g. inputs/track.mp3"},
            "output_path": {"type": "string", "description": "Set by the worker"},
        },
    }
    output_schema = {"type": "object", "properties": {"output": {"type": "string"}}}
    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=64, vram_mb=0, disk_mb=50, network_required=False)
    side_effects = ["writes output_path"]
    user_visible_verification = ["Play the music"]

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        return 1.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        start = time.time()
        try:
            src = _source(inputs)
            dst = Path(inputs.get("output_path", f"provided_music{src.suffix}"))
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
        return ToolResult(
            success=True, data={"output": str(dst)}, artifacts=[str(dst)],
            cost_usd=0.0, duration_seconds=round(time.time() - start, 2),
        )
