"""Real ffmpeg/ffprobe paths of the verifier, on tiny generated media."""

from __future__ import annotations

import shutil
import subprocess

import pytest

from lib.spec_verifier import extract_frames, ffprobe, mean_volume_db

pytestmark = pytest.mark.skipif(not (shutil.which("ffmpeg") and shutil.which("ffprobe")), reason="ffmpeg missing")


def _run(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def test_probe_frames_and_volume(tmp_path):
    clip = tmp_path / "c.mp4"
    _run("-f", "lavfi", "-i", "color=c=red:s=320x180:d=2", "-f", "lavfi", "-i", "sine=f=440:d=2",
         "-shortest", "-pix_fmt", "yuv420p", str(clip))
    p = ffprobe(clip)
    assert (p["width"], p["height"], p["has_audio"]) == (320, 180, True)
    assert p["duration"] == pytest.approx(2.0, abs=0.2)
    assert len(extract_frames(clip, 3, p["duration"], tmp_path / "f")) == 3
    assert mean_volume_db(clip) > -50

    quiet = tmp_path / "s.wav"
    _run("-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "1", str(quiet))
    assert mean_volume_db(quiet) < -50

    img = tmp_path / "i.png"
    _run("-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1", "-frames:v", "1", str(img))
    assert ffprobe(img)["width"] == 64
    assert len(extract_frames(img, 1, 0, tmp_path / "g")) == 1
