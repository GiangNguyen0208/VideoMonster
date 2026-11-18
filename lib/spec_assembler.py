"""Deterministic ffmpeg assembly of a completed worker run into final.mp4.

Bypasses VideoCompose.render on purpose (its slideshow gate cannot be
disabled, it does not mix narration/music, and it does not hold short clips).
See docs/planner-worker/phases/phase-3-assembly-and-e2e.md.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from lib import production_spec as ps
from lib.spec_to_edit import (
    MUSIC_FADE_IN, MUSIC_FADE_OUT, AssemblyError, Timeline, build_cues, build_edit_decisions,
    build_srt, plan_timeline, target_size,
)
from lib.spec_verifier import final_check, ffprobe
from schemas.artifacts import validate_artifact

FPS = 30
FADE_SECONDS = 0.5
OUTPUT_REL = "renders/final.mp4"
SRT_REL = "renders/final.srt"
NARRATION_MIX_REL = "assets/audio/_narration_mix.wav"
EDIT_REL = "artifacts/edit_decisions.json"
RENDER_REPORT_REL = "artifacts/render_report.json"


def _ffmpeg(*args: str) -> None:
    res = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args],
                         capture_output=True, text=True, timeout=1800)
    if res.returncode != 0:
        raise AssemblyError(f"ffmpeg failed: {res.stderr.strip()[-400:]}")


def has_filter(name: str) -> bool:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return any(line.split()[1:2] == [name] for line in out.splitlines() if line.startswith((" T", " .", " S")))


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


# --------------------------------------------------------------------- video

def _scene_filter(kind: str, w: int, h: int, window: float, fade_in: bool, fade_out: bool) -> str:
    if kind == "image":
        chain = (
            f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
            f"zoompan=z='min(1+0.0006*on,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={w}x{h}:fps={FPS}"
        )
    else:
        chain = (
            f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,"
            f"fps={FPS},tpad=stop_mode=clone:stop_duration={window:.3f}"
        )
    chain += f",trim=duration={window:.3f},setpts=PTS-STARTPTS"
    if fade_in:
        chain += f",fade=t=in:st=0:d={FADE_SECONDS}"
    if fade_out:
        chain += f",fade=t=out:st={max(0.0, window - FADE_SECONDS):.3f}:d={FADE_SECONDS}"
    return chain + ",format=yuv420p"


_OVERLAY_XY = {
    "top_left": "{m}:{m}",
    "top_right": "W-w-{m}:{m}",
    "bottom_left": "{m}:H-h-{m}",
    "bottom_right": "W-w-{m}:H-h-{m}",
    "center": "(W-w)/2:(H-h)/2",
}


def _brand_overlay(project: Path, spec: dict[str, Any], width: int) -> tuple[Path, int, str] | None:
    """(logo file, scaled width, ffmpeg overlay x:y) when the spec asks for a logo."""
    cfg = spec.get("brand_overlay")
    if not cfg:
        return None
    path = project / cfg["path"]
    if not path.is_file():
        raise AssemblyError(f"brand overlay image missing: {cfg['path']}")
    margin = cfg.get("margin", 24)
    scale_w = max(2, int(width * cfg.get("scale", 0.2)) // 2 * 2)
    xy = _OVERLAY_XY[cfg.get("position", "bottom_right")].format(m=margin)
    return path, scale_w, xy


def _render_segments(project: Path, spec: dict[str, Any], tl: Timeline, tmp: Path) -> list[Path]:
    w, h = target_size(spec)
    jobs = {j["job_id"]: j for j in spec["jobs"]}
    segs: list[Path] = []
    for i, slot in enumerate(tl.scenes):
        src = project / jobs[slot.visual_job]["output_path"]
        nxt = tl.scenes[i + 1].transition_in if i + 1 < len(tl.scenes) else "cut"
        fade_in = slot.transition_in in ("fade", "crossfade", "dip_to_black")
        fade_out = nxt == "dip_to_black"
        vf = _scene_filter(slot.visual_kind, w, h, slot.window, fade_in, fade_out)
        out = tmp / f"seg_{i:03d}.mp4"
        pre = ["-loop", "1", "-framerate", str(FPS)] if slot.visual_kind == "image" else []
        logo = _brand_overlay(project, spec, w) if i == len(tl.scenes) - 1 else None
        enc = ["-t", f"{slot.window:.3f}", "-an", "-r", str(FPS),
               "-c:v", "libx264", "-preset", "medium", "-crf", "20", str(out)]
        if logo is None:
            _ffmpeg(*pre, "-i", str(src), "-vf", vf, *enc)
        else:
            path, scale_w, xy = logo
            graph = f"[0:v]{vf}[base];[1:v]scale={scale_w}:-1[lg];[base][lg]overlay={xy},format=yuv420p[v]"
            _ffmpeg(*pre, "-i", str(src), "-loop", "1", "-i", str(path),
                    "-filter_complex", graph, "-map", "[v]", *enc)
        segs.append(out)
    return segs


def _concat(segs: list[Path], out: Path, tmp: Path) -> None:
    lst = tmp / "concat.txt"
    _write(lst, "".join(f"file '{p}'\n" for p in segs))
    _ffmpeg("-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out))


# --------------------------------------------------------------------- audio

def _stereo(label_in: str, label_out: str, extra: str = "") -> str:
    base = f"[{label_in}]aresample=48000,aformat=channel_layouts=stereo"
    return f"{base}{',' + extra if extra else ''}[{label_out}]"


def _mix_narration(project: Path, spec: dict[str, Any], tl: Timeline, out: Path) -> None:
    jobs = {j["job_id"]: j for j in spec["jobs"]}
    args: list[str] = []
    parts: list[str] = []
    for i, slot in enumerate(tl.scenes):
        args += ["-i", str(project / jobs[slot.narration_job]["output_path"])]
        ms = int(round(slot.start * 1000))
        parts.append(_stereo(f"{i}:a", f"n{i}", f"adelay={ms}|{ms}"))
    labels = "".join(f"[n{i}]" for i in range(len(tl.scenes)))
    parts.append(f"{labels}amix=inputs={len(tl.scenes)}:normalize=0:duration=longest,"
                 f"apad=whole_dur={tl.total_seconds:.3f}[narr]")
    _ffmpeg(*args, "-filter_complex", ";".join(parts), "-map", "[narr]", "-t", f"{tl.total_seconds:.3f}", str(out))


def _mix_final_audio(project: Path, spec: dict[str, Any], tl: Timeline, narr: Path, out: Path) -> None:
    if not tl.music_job:
        _ffmpeg("-i", str(narr), "-t", f"{tl.total_seconds:.3f}", str(out))
        return
    plan = spec.get("audio_plan", {})
    music_db = plan.get("music_volume_db", -12)
    duck_db = plan.get("music_duck_db", -10)
    music = project / next(j["output_path"] for j in spec["jobs"] if j["job_id"] == tl.music_job)
    total = tl.total_seconds
    duck = "".join(
        f",volume={duck_db}dB:enable='between(t,{s.start:.3f},{s.start + s.narration_seconds:.3f})'"
        for s in tl.scenes
    )
    music_chain = (
        f"atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume={music_db}dB{duck},"
        f"afade=t=in:d={MUSIC_FADE_IN},afade=t=out:st={max(0.0, total - MUSIC_FADE_OUT):.3f}:d={MUSIC_FADE_OUT}"
    )
    graph = ";".join([
        _stereo("0:a", "narr"),
        _stereo("1:a", "m", music_chain),
        f"[narr][m]amix=inputs=2:normalize=0:duration=first[mix]",
    ])
    _ffmpeg("-i", str(narr), "-stream_loop", "-1", "-i", str(music), "-filter_complex", graph,
            "-map", "[mix]", "-t", f"{total:.3f}", str(out))


# ------------------------------------------------------------------- driver

def assemble(project_dir: Path, spec: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    """Build renders/final.mp4 + SRT + edit_decisions + render_report. Returns the render_report."""
    ps.verify_seal(spec)
    if report.get("spec_hash") != spec["spec_hash"]:
        raise AssemblyError("worker_report belongs to a different spec")
    if report.get("status") != "complete":
        raise AssemblyError(f"worker run is {report.get('status')}; replan or rerun failed jobs first "
                            f"({report.get('needs_replan')})")
    project = Path(project_dir)
    jobs = {j["job_id"]: j for j in spec["jobs"]}
    for j in spec["jobs"]:
        if not (project / j["output_path"]).exists():
            raise AssemblyError(f"missing output for job {j['job_id']}: {j['output_path']}")

    narration = {jid: ffprobe(project / j["output_path"])["duration"]
                 for jid, j in jobs.items() if j["kind"] == "tts"}
    clips = {jid: ffprobe(project / j["output_path"])["duration"]
             for jid, j in jobs.items() if j["kind"] == "video"}
    tl = plan_timeline(spec, narration)
    srt = build_srt(tl)
    _write(project / SRT_REL, srt)
    edit = build_edit_decisions(spec, tl, clip_seconds=clips, srt_rel=SRT_REL, output_rel=OUTPUT_REL)
    _write(project / EDIT_REL, json.dumps(edit, indent=2, ensure_ascii=False))

    warnings: list[str] = []
    out = project / OUTPUT_REL
    out.parent.mkdir(parents=True, exist_ok=True)
    narr_mix = project / NARRATION_MIX_REL
    with tempfile.TemporaryDirectory(prefix="spec-assemble-") as t:
        tmp = Path(t)
        video = tmp / "video.mp4"
        _concat(_render_segments(project, spec, tl, tmp), video, tmp)
        _mix_narration(project, spec, tl, narr_mix)
        audio = tmp / "audio.wav"
        _mix_final_audio(project, spec, tl, narr_mix, audio)

        want_burn = bool(spec.get("audio_plan", {}).get("burn_subtitles", True))
        burn = want_burn and has_filter("subtitles")
        if want_burn and not burn:
            warnings.append("ffmpeg has no 'subtitles' filter; subtitles are a soft track + renders/final.srt, not burned in")
        mux = ["-i", str(video), "-i", str(audio), "-i", str(project / SRT_REL)]
        if burn:
            escaped = str(project / SRT_REL).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
            vcodec = ["-vf", f"subtitles='{escaped}'", "-c:v", "libx264", "-preset", "medium", "-crf", "20"]
        else:
            vcodec = ["-c:v", "copy"]
        _ffmpeg(*mux, "-map", "0:v", "-map", "1:a", "-map", "2:0", *vcodec, "-c:a", "aac", "-b:a", "160k",
                "-c:s", "mov_text", "-t", f"{tl.total_seconds:.3f}", "-movflags", "+faststart", str(out))

    check = final_check(
        out,
        expected_seconds=tl.total_seconds,
        scene_ids=[s["id"] for s in spec["scenes"]],
        scenes_with_media={s.scene_id for s in tl.scenes},
        narration_windows=[(s.start, s.start + s.narration_seconds) for s in tl.scenes],
        subtitle_text=" ".join(c[2] for c in build_cues(tl)),
        script_text=" ".join(s.text for s in tl.scenes),
        narration_audio=narr_mix,
    )
    info = ffprobe(out)
    w, h = target_size(spec)
    notes = [f"final_check: {'passed' if check.passed else 'FAILED'}"] + check.reasons
    notes += [f"timing_adjustment: {a['scene_id']} {a['planned_seconds']:.1f}s -> {a['actual_seconds']:.1f}s"
              for a in tl.adjustments]
    render_report: dict[str, Any] = {
        "version": "1.0",
        "outputs": [{
            "path": OUTPUT_REL, "format": "mp4", "resolution": f"{w}x{h}",
            "duration_seconds": round(info["duration"], 3), "codec": "h264", "audio_codec": "aac", "fps": FPS,
            "file_size_bytes": out.stat().st_size,
        }],
        "warnings": warnings,
        "verification_notes": notes,
        "metadata": {"producer": "spec_assembler", "spec_hash": spec["spec_hash"],
                     "final_check": "passed" if check.passed else "failed",
                     "timing_adjustments": tl.adjustments},
    }
    validate_artifact("render_report", render_report)
    _write(project / RENDER_REPORT_REL, json.dumps(render_report, indent=2, ensure_ascii=False))
    return render_report
