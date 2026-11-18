"""spec_to_edit (pure) + spec_assembler on ffmpeg-generated media."""

from __future__ import annotations

import json
import shutil
import subprocess

import pytest

from lib import production_spec as ps
from lib.spec_assembler import assemble
from lib.spec_to_edit import AssemblyError, build_cues, build_edit_decisions, build_srt, plan_timeline
from lib.spec_verifier import ffprobe, normalize_text

T1 = "Bees pollinate a third of our food. They are tiny."
T2 = "Without them, supermarkets would look very empty."

needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg missing")


def make_spec() -> dict:
    def tts(n, text):
        return {"job_id": f"tts_{n}", "scene_id": f"s{n}", "kind": "tts", "tool": "gemini_tts",
                "params": {"text": text}, "output_path": f"assets/audio/s{n}.wav",
                "acceptance": {"expected_text": text}}
    spec = {
        "version": "1.0", "project_id": "p", "language": "en", "duration_seconds": 7, "aspect_ratio": "16:9",
        "script": {"sections": [{"id": "a", "text": T1}, {"id": "b", "text": T2}]},
        "scenes": [
            {"id": "s1", "start_seconds": 0, "end_seconds": 4, "script_section_id": "a", "description": "bee"},
            {"id": "s2", "start_seconds": 4, "end_seconds": 7, "script_section_id": "b",
             "description": "shelf", "transition_in": "fade"},
        ],
        "audio_plan": {"burn_subtitles": True},
        "jobs": [
            tts(1, T1), tts(2, T2),
            {"job_id": "vid_s1", "scene_id": "s1", "kind": "video", "tool": "gemini_omni_video",
             "params": {"prompt": "bee"}, "output_path": "assets/video/s1.mp4",
             "acceptance": {"must_show": ["bee?"]}},
            {"job_id": "img_s2", "scene_id": "s2", "kind": "image", "tool": "google_imagen",
             "params": {"prompt": "shelf", "model": "gemini-nano-banana-2.1"},
             "output_path": "assets/images/s2.png", "acceptance": {"must_show": ["shelf?"]}},
            {"job_id": "music", "kind": "music", "tool": "google_music", "params": {"prompt": "calm"},
             "output_path": "assets/music/bg.wav", "acceptance": {}},
        ],
    }
    return ps.seal(spec)


def test_timeline_extends_window_and_shifts():
    tl = plan_timeline(make_spec(), {"tts_1": 3.0, "tts_2": 4.5})
    s1, s2 = tl.scenes
    assert (s1.start, s1.end) == (0, 4)
    assert s2.start == 4 and s2.end == pytest.approx(8.5)  # narration 4.5 > planned 3
    assert tl.total_seconds == pytest.approx(8.5)
    assert tl.adjustments[0]["scene_id"] == "s2"
    assert tl.music_job == "music"


def test_timeline_prefers_video_and_requires_media():
    spec = make_spec()
    assert plan_timeline(spec, {"tts_1": 3, "tts_2": 3}).scenes[0].visual_kind == "video"
    with pytest.raises(AssemblyError):
        plan_timeline(spec, {"tts_1": 3})


def test_srt_is_script_text_and_deterministic():
    spec = make_spec()
    tl = plan_timeline(spec, {"tts_1": 3.0, "tts_2": 4.5})
    cues = build_cues(tl)
    assert normalize_text(" ".join(c[2] for c in cues)) == normalize_text(f"{T1} {T2}")
    assert all(a < b for a, b, _ in cues) and cues[0][0] == 0
    assert all(cues[i][1] <= cues[i + 1][0] + 1e-6 for i in range(len(cues) - 1))
    assert build_srt(tl) == build_srt(plan_timeline(spec, {"tts_1": 3.0, "tts_2": 4.5}))
    assert "00:00:00,000 -->" in build_srt(tl)


def test_edit_decisions_valid_and_deterministic():
    spec = make_spec()
    tl = plan_timeline(spec, {"tts_1": 3.0, "tts_2": 4.5})
    kw = dict(clip_seconds={"vid_s1": 2.0}, srt_rel="renders/final.srt", output_rel="renders/final.mp4")
    ed = build_edit_decisions(spec, tl, **kw)
    assert ed == build_edit_decisions(spec, tl, **kw)
    assert ed["render_runtime"] == "ffmpeg" and len(ed["cuts"]) == 2
    assert ed["cuts"][0]["out_seconds"] == 2.0          # clip shorter than window: not stretched in the record
    assert ed["cuts"][1]["out_seconds"] == pytest.approx(4.5)
    assert ed["cuts"][1]["transition_in"] == "fade"
    assert ed["audio"]["music"]["ducking"]["enabled"] and ed["metadata"]["spec_hash"] == spec["spec_hash"]


def _ff(*a):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)


@needs_ffmpeg
def test_assemble_end_to_end(tmp_path):
    spec = make_spec()
    p = tmp_path
    for d in ("video", "audio", "images", "music"):
        (p / "assets" / d).mkdir(parents=True)
    _ff("-f", "lavfi", "-i", "color=c=red:s=320x180:d=2:r=24", "-pix_fmt", "yuv420p", str(p / "assets/video/s1.mp4"))
    _ff("-f", "lavfi", "-i", "color=c=blue:s=200x200:d=1", "-frames:v", "1", str(p / "assets/images/s2.png"))
    _ff("-f", "lavfi", "-i", "sine=f=300:d=3", str(p / "assets/audio/s1.wav"))
    _ff("-f", "lavfi", "-i", "sine=f=500:d=4.5", str(p / "assets/audio/s2.wav"))
    _ff("-f", "lavfi", "-i", "sine=f=200:d=3", str(p / "assets/music/bg.wav"))   # shorter than video: must loop
    report = {"spec_hash": spec["spec_hash"], "status": "complete", "needs_replan": []}

    rr = assemble(p, spec, report)

    out = ffprobe(p / "renders/final.mp4")
    assert (out["width"], out["height"], out["has_audio"]) == (1280, 720, True)
    assert out["duration"] == pytest.approx(8.5, abs=0.3)          # s2 extended to its narration
    assert rr["metadata"]["final_check"] == "passed", rr["verification_notes"]
    assert (p / "renders/final.srt").exists()
    assert json.loads((p / "artifacts/edit_decisions.json").read_text())["render_runtime"] == "ffmpeg"
    streams = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "stream=codec_type", "-of", "csv=p=0",
                              str(p / "renders/final.mp4")], capture_output=True, text=True).stdout.split()
    assert "subtitle" in streams


@needs_ffmpeg
def test_assemble_refuses_incomplete_or_foreign_report(tmp_path):
    spec = make_spec()
    with pytest.raises(AssemblyError, match="partial"):
        assemble(tmp_path, spec, {"spec_hash": spec["spec_hash"], "status": "partial", "needs_replan": ["x"]})
    with pytest.raises(AssemblyError, match="different spec"):
        assemble(tmp_path, spec, {"spec_hash": "0" * 64, "status": "complete"})
