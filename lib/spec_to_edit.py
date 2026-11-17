"""Rule-based spec → timeline / subtitles / edit_decisions. No LLM, no ffmpeg.

The script is the authority: when measured narration is longer than a scene's
planned window the window grows (later scenes shift); speech is never cut.
Subtitles come from the script text, never from speech-to-text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from schemas.artifacts import validate_artifact

_SENTENCE_END = re.compile(r"(?<=[.!?…。！？])\s+")
_MIN_CUE_SECONDS = 0.6
_ASPECT_SIZE = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (720, 720)}
MUSIC_FADE_IN = 0.5
MUSIC_FADE_OUT = 2.0


class AssemblyError(Exception):
    pass


@dataclass
class SceneSlot:
    scene_id: str
    start: float
    end: float
    planned_start: float
    planned_end: float
    narration_seconds: float
    narration_job: str
    visual_job: str
    visual_kind: str  # "video" | "image"
    transition_in: str
    text: str

    @property
    def window(self) -> float:
        return self.end - self.start


@dataclass
class Timeline:
    scenes: list[SceneSlot]
    total_seconds: float
    adjustments: list[dict[str, Any]] = field(default_factory=list)
    music_job: str | None = None


def target_size(spec: dict[str, Any]) -> tuple[int, int]:
    return _ASPECT_SIZE.get(spec.get("aspect_ratio", "16:9"), (1280, 720))


def plan_timeline(spec: dict[str, Any], narration_seconds: dict[str, float]) -> Timeline:
    """Scene slots in order. ``narration_seconds`` maps tts job_id → measured seconds."""
    sections = {s["id"]: s["text"] for s in spec["script"]["sections"]}
    jobs = spec["jobs"]
    slots: list[SceneSlot] = []
    adjustments: list[dict[str, Any]] = []
    shift = 0.0
    for scene in spec["scenes"]:
        sid = scene["id"]
        tts = next((j for j in jobs if j.get("scene_id") == sid and j["kind"] == "tts"), None)
        visual = next((j for j in jobs if j.get("scene_id") == sid and j["kind"] == "video"), None) or next(
            (j for j in jobs if j.get("scene_id") == sid and j["kind"] == "image"), None
        )
        if tts is None or visual is None:
            raise AssemblyError(f"scene {sid}: missing narration or visual job")
        if tts["job_id"] not in narration_seconds:
            raise AssemblyError(f"scene {sid}: narration duration unknown")
        narr = float(narration_seconds[tts["job_id"]])
        start = scene["start_seconds"] + shift
        planned = scene["end_seconds"] - scene["start_seconds"]
        window = max(planned, narr)
        if window > planned + 1e-6:
            adjustments.append({"scene_id": sid, "planned_seconds": planned, "actual_seconds": round(window, 3),
                                "reason": "narration longer than planned window"})
            shift += window - planned
        slots.append(SceneSlot(
            scene_id=sid, start=start, end=start + window,
            planned_start=scene["start_seconds"], planned_end=scene["end_seconds"],
            narration_seconds=narr, narration_job=tts["job_id"], visual_job=visual["job_id"],
            visual_kind=visual["kind"], transition_in=scene.get("transition_in", "cut"),
            text=sections[scene["script_section_id"]],
        ))
    music = next((j["job_id"] for j in jobs if j["kind"] == "music"), None)
    return Timeline(slots, slots[-1].end if slots else 0.0, adjustments, music)


# ------------------------------------------------------------------ subtitles

def split_sentences(text: str) -> list[str]:
    parts = [p.strip() for p in _SENTENCE_END.split(text.strip()) if p.strip()]
    return parts or ([text.strip()] if text.strip() else [])


def build_cues(timeline: Timeline) -> list[tuple[float, float, str]]:
    """(start, end, text) cues, timed proportionally to characters inside each
    scene's narration span. Cue text is the script's own words, in order."""
    cues: list[tuple[float, float, str]] = []
    for slot in timeline.scenes:
        sentences = split_sentences(slot.text)
        total_chars = sum(len(s) for s in sentences) or 1
        span = max(slot.narration_seconds, _MIN_CUE_SECONDS * len(sentences))
        cursor = slot.start
        for i, sentence in enumerate(sentences):
            share = span * len(sentence) / total_chars
            end = slot.start + span if i == len(sentences) - 1 else cursor + share
            cues.append((round(cursor, 3), round(end, 3), sentence))
            cursor = end
    return cues


def _stamp(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(timeline: Timeline) -> str:
    lines: list[str] = []
    for i, (a, b, text) in enumerate(build_cues(timeline), 1):
        lines += [str(i), f"{_stamp(a)} --> {_stamp(b)}", text, ""]
    return "\n".join(lines)


# ------------------------------------------------------------- edit_decisions

def db_to_gain(db: float) -> float:
    return 10 ** (db / 20.0)


def build_edit_decisions(
    spec: dict[str, Any],
    timeline: Timeline,
    *,
    clip_seconds: dict[str, float],
    srt_rel: str,
    output_rel: str,
) -> dict[str, Any]:
    """Schema-valid record of what the assembler does (render_runtime=ffmpeg)."""
    jobs = {j["job_id"]: j for j in spec["jobs"]}
    audio_plan = spec.get("audio_plan", {})
    cuts, segments, transitions = [], [], []
    for slot in timeline.scenes:
        vis = jobs[slot.visual_job]
        out = slot.window if slot.visual_kind == "image" else min(clip_seconds.get(slot.visual_job, slot.window), slot.window)
        cut: dict[str, Any] = {"id": f"cut_{slot.scene_id}", "source": vis["output_path"],
                               "in_seconds": 0, "out_seconds": round(out, 3)}
        if slot.transition_in != "cut":
            cut["transition_in"] = slot.transition_in
            transitions.append({"type": slot.transition_in, "at_seconds": round(slot.start, 3), "duration_seconds": 0.5})
        cuts.append(cut)
        segments.append({"asset_id": slot.narration_job, "start_seconds": round(slot.start, 3),
                         "end_seconds": round(slot.start + slot.narration_seconds, 3)})
    audio: dict[str, Any] = {"narration": {"segments": segments}}
    if timeline.music_job:
        vol = round(db_to_gain(audio_plan.get("music_volume_db", -12)), 4)
        audio["music"] = {
            "asset_id": timeline.music_job, "volume": min(1.0, vol),
            "fade_in_seconds": MUSIC_FADE_IN, "fade_out_seconds": MUSIC_FADE_OUT,
            "ducking": {"enabled": True, "reduction_db": abs(audio_plan.get("music_duck_db", -10))},
        }
    w, h = target_size(spec)
    ed: dict[str, Any] = {
        "version": "1.0",
        "render_runtime": "ffmpeg",
        "cuts": cuts,
        "audio": audio,
        "subtitles": {"enabled": bool(audio_plan.get("burn_subtitles", True)), "source": srt_rel},
        "metadata": {
            "producer": "spec_worker",
            "spec_hash": spec["spec_hash"],
            "target_duration_seconds": round(timeline.total_seconds, 3),
            "timing_adjustments": timeline.adjustments,
            "compose_target": {"width": w, "height": h, "fit": "pad"},
            "output": output_rel,
        },
    }
    if transitions:
        ed["transitions"] = transitions
    validate_artifact("edit_decisions", ed)
    return ed
