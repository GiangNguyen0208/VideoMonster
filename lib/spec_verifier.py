"""Deterministic + vision verification of worker outputs against a spec job.

No Claude here. The vision judge is a fixed-prompt Gemini call that answers the
spec's own yes/no questions; it never decides anything creative. Deterministic
checks are pure functions over ffprobe / transcript data so they unit-test
without media or network.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

DEFAULT_VISION_MODEL = "gemini-2.5-flash"
SILENCE_FLOOR_DB = -50.0

# judge(frames: list[Path], questions: list[str]) -> {question: bool}
Judge = Callable[[list[Path], list[str]], dict[str, bool]]
# transcribe(path) -> text, or None when no STT is available on this machine
Transcribe = Callable[[Path], Optional[str]]


@dataclass
class VerifyResult:
    passed: bool
    scores: dict[str, Any] = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- pure helpers

def normalize_text(text: str) -> list[str]:
    text = unicodedata.normalize("NFC", text).lower()
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return text.split()


def wer(reference: str, hypothesis: str) -> float:
    """Word error rate via edit distance over normalised words."""
    ref, hyp = normalize_text(reference), normalize_text(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1] / len(ref)


def aspect_matches(width: int, height: int, expected: str, tol: float = 0.03) -> bool:
    try:
        a, b = (float(x) for x in expected.split(":"))
    except ValueError:
        return True
    return abs(width / height - a / b) <= tol * (a / b)


def check_probe(kind: str, probe: dict[str, Any], acc: dict[str, Any], spec_aspect: str | None = None) -> list[str]:
    """Deterministic acceptance checks over a probe dict. Returns failure reasons."""
    reasons: list[str] = []
    w, h = probe.get("width"), probe.get("height")
    if kind in ("video", "image"):
        if not w or not h:
            return ["no video/image stream"]
        if acc.get("min_width") and w < acc["min_width"]:
            reasons.append(f"width {w} < {acc['min_width']}")
        if acc.get("min_height") and h < acc["min_height"]:
            reasons.append(f"height {h} < {acc['min_height']}")
        want = acc.get("aspect_ratio") or spec_aspect
        if want and not aspect_matches(w, h, want):
            reasons.append(f"aspect {w}x{h} does not match {want}")
    if kind == "video":
        if not probe.get("duration") or probe["duration"] <= 0:
            reasons.append("zero duration")
        if acc.get("expect_audio") is True and not probe.get("has_audio"):
            reasons.append("expected audio track")
    if kind in ("tts", "music"):
        if not probe.get("has_audio"):
            reasons.append("no audio stream")
        dur = probe.get("duration") or 0
        if dur <= 0:
            reasons.append("zero duration")
        want = acc.get("duration_seconds")
        tol = acc.get("duration_tolerance_seconds", 1.0)
        if want and kind == "music" and dur < want - tol:
            reasons.append(f"music {dur:.1f}s shorter than {want}s")
        if want and kind == "tts" and dur > want + tol:
            reasons.append(f"narration {dur:.1f}s exceeds window {want}s")
    return reasons


# ------------------------------------------------------------------ media IO

def ffprobe(path: Path) -> dict[str, Any]:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    data = json.loads(out.stdout or "{}")
    streams = data.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    dur = data.get("format", {}).get("duration") or (v or a or {}).get("duration")
    return {
        "width": v.get("width") if v else None,
        "height": v.get("height") if v else None,
        "has_audio": a is not None,
        "duration": float(dur) if dur else 0.0,
    }


def mean_volume_db(path: Path) -> Optional[float]:
    res = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True, timeout=120,
    )
    m = re.search(r"mean_volume:\s*(-?[\d.]+) dB", res.stderr)
    return float(m.group(1)) if m else None


def extract_frames(path: Path, count: int, duration: float, out_dir: Path) -> list[Path]:
    """`count` evenly spaced JPEG frames (single frame for images)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    stamps = [0.0] if count <= 1 or duration <= 0 else [duration * (i + 0.5) / count for i in range(count)]
    frames: list[Path] = []
    for i, ts in enumerate(stamps):
        dest = out_dir / f"{path.stem}_f{i}.jpg"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{ts:.2f}", "-i", str(path),
             "-frames:v", "1", "-q:v", "3", str(dest)],
            capture_output=True, timeout=120,
        )
        if dest.exists():
            frames.append(dest)
    return frames


# ---------------------------------------------------------------- Gemini judge

_JUDGE_PROMPT = (
    "You are a strict visual checker. Look at the attached frames from one video shot. "
    "Answer each numbered question with true or false, judging only what is visible. "
    "Reply with JSON only: an object mapping the question number (string) to true or false.\n\n"
)


def gemini_judge(model: str | None = None) -> Judge:
    """Build a judge backed by google-genai. Raises RuntimeError without a key."""
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY / GOOGLE_API_KEY is not set")
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=key)
    model = model or os.getenv("GEMINI_VISION_MODEL") or DEFAULT_VISION_MODEL

    def judge(frames: list[Path], questions: list[str]) -> dict[str, bool]:
        numbered = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(questions))
        parts: list[Any] = [
            types.Part.from_bytes(data=f.read_bytes(), mime_type="image/jpeg") for f in frames
        ]
        parts.append(_JUDGE_PROMPT + numbered)
        resp = client.models.generate_content(
            model=model,
            contents=parts,
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0),
        )
        raw = json.loads(resp.text)
        return {q: bool(raw.get(str(i + 1), False)) for i, q in enumerate(questions)}

    return judge


def transcriber_stt(registry: Any = None, model_size: str = "base") -> Transcribe:
    """STT via the repo's `transcriber` tool; returns None-text when unavailable."""
    if registry is None:
        from tools.tool_registry import registry as reg
        reg.discover()
        registry = reg

    def run(path: Path) -> Optional[str]:
        tool = registry.get("transcriber")
        if tool is None or tool.get_status().value != "available":
            return None
        with tempfile.TemporaryDirectory() as tmp:
            res = tool.execute({"input_path": str(path), "model_size": model_size, "output_dir": tmp})
        if not res.success:
            return None
        return " ".join(s["text"] for s in res.data.get("segments", []))

    return run


# -------------------------------------------------------------------- verifier

class Verifier:
    """Checks one job output against its `acceptance` block."""

    def __init__(
        self,
        *,
        judge: Judge | None = None,
        stt: Transcribe | None = None,
        probe: Callable[[Path], dict[str, Any]] = ffprobe,
        frames: Callable[[Path, int, float, Path], list[Path]] = extract_frames,
        volume: Callable[[Path], Optional[float]] = mean_volume_db,
        default_max_wer: float = 0.15,
    ) -> None:
        self._judge = judge
        self._stt = stt
        self._probe = probe
        self._frames = frames
        self._volume = volume
        self._default_max_wer = default_max_wer

    def _get_judge(self) -> Judge:
        if self._judge is None:
            self._judge = gemini_judge()
        return self._judge

    def _get_stt(self) -> Transcribe:
        if self._stt is None:
            self._stt = transcriber_stt()
        return self._stt

    def check(self, job: dict[str, Any], path: Path, spec: dict[str, Any]) -> VerifyResult:
        kind, acc = job["kind"], job.get("acceptance", {})
        if not path.exists() or path.stat().st_size == 0:
            return VerifyResult(False, reasons=["output file missing or empty"])
        probe = self._probe(path)
        reasons = check_probe(kind, probe, acc, spec.get("aspect_ratio"))
        res = VerifyResult(not reasons, {"duration": probe.get("duration")}, reasons)

        if kind in ("video", "image") and (acc.get("must_show") or acc.get("must_not_show")):
            self._vision(job, path, probe, res)
        elif kind == "tts":
            self._speech(acc, path, res)
        elif kind == "music":
            vol = self._volume(path)
            res.scores["mean_volume_db"] = vol
            if vol is not None and vol < SILENCE_FLOOR_DB:
                res.reasons.append(f"music is silent ({vol:.0f} dB)")
        res.passed = not res.reasons
        return res

    def _vision(self, job: dict[str, Any], path: Path, probe: dict[str, Any], res: VerifyResult) -> None:
        acc = job["acceptance"]
        positives = acc.get("must_show", [])
        negatives = acc.get("must_not_show", [])
        questions = positives + negatives
        n = 1 if job["kind"] == "image" else 3
        with tempfile.TemporaryDirectory() as tmp:
            frames = self._frames(path, n, probe.get("duration") or 0.0, Path(tmp))
            if not frames:
                res.reasons.append("could not extract frames for vision check")
                return
            answers = self._get_judge()(frames, questions)
        ok = [bool(answers.get(q)) for q in positives] + [not answers.get(q, False) for q in negatives]
        ratio = sum(ok) / len(ok) if ok else 1.0
        res.scores["vision_ratio"] = ratio
        res.scores["vision_answers"] = answers
        need = acc.get("vision_pass_ratio", 1.0)
        if ratio < need:
            failed = [q for q, good in zip(questions, ok) if not good]
            res.reasons.append(f"vision {ratio:.2f} < {need}: failed {failed}")

    def _speech(self, acc: dict[str, Any], path: Path, res: VerifyResult) -> None:
        expected = acc.get("expected_text")
        if not expected:
            return
        text = self._get_stt()(path)
        if text is None:
            res.warnings.append("no speech-to-text available; narration text not verified")
            return
        score = wer(expected, text)
        res.scores["wer"] = score
        limit = acc.get("max_wer", self._default_max_wer)
        if score > limit:
            res.reasons.append(f"WER {score:.2f} > {limit} (heard: {text[:80]!r})")


# ------------------------------------------------------------------ final check

def silence_gaps(path: Path, noise_db: float = -45.0, min_seconds: float = 1.5) -> list[tuple[float, float]]:
    """(start, end) of silences at least ``min_seconds`` long."""
    res = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af",
         f"silencedetect=n={noise_db}dB:d={min_seconds}", "-f", "null", "-"],
        capture_output=True, text=True, timeout=300,
    )
    starts = [float(m) for m in re.findall(r"silence_start:\s*(-?[\d.]+)", res.stderr)]
    ends = [float(m) for m in re.findall(r"silence_end:\s*(-?[\d.]+)", res.stderr)]
    total = ffprobe(path)["duration"]
    if len(starts) > len(ends):
        ends.append(total)
    return list(zip(starts, ends))


def final_check(
    output: Path,
    *,
    expected_seconds: float,
    scene_ids: list[str],
    scenes_with_media: set[str],
    narration_windows: list[tuple[float, float]],
    subtitle_text: str,
    script_text: str,
    narration_audio: Path | None = None,
    probe: Callable[[Path], dict[str, Any]] = ffprobe,
    gaps: Callable[[Path], list[tuple[float, float]]] = silence_gaps,
) -> VerifyResult:
    """Whole-video checks against the sealed spec. Pure over its inputs."""
    reasons: list[str] = []
    info = probe(output)
    if not info.get("width"):
        reasons.append("final video has no video stream")
    if not info.get("has_audio"):
        reasons.append("final video has no audio stream")
    if abs(info.get("duration", 0.0) - expected_seconds) > 1.0:
        reasons.append(f"duration {info.get('duration', 0):.1f}s vs expected {expected_seconds:.1f}s")
    missing = [s for s in scene_ids if s not in scenes_with_media]
    if missing:
        reasons.append(f"scenes without visual+narration: {missing}")
    if normalize_text(subtitle_text) != normalize_text(script_text):
        reasons.append("subtitle text differs from script text")
    if narration_audio is not None:
        for a, b in gaps(narration_audio):
            for w0, w1 in narration_windows:
                if a >= w0 - 0.05 and b <= w1 + 0.05:
                    reasons.append(f"silence {a:.1f}-{b:.1f}s inside narration window {w0:.1f}-{w1:.1f}s")
    return VerifyResult(not reasons, {"duration": info.get("duration")}, reasons)
