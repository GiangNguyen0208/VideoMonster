"""Creator inputs: typed `inputs` in the brief, binding of answers into the
spec, passthrough tools for the creator's own files, and the logo overlay."""

from __future__ import annotations

import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from lib import production_spec as ps
from lib import requirements_brief as rb
from lib.spec_assembler import assemble
from lib.spec_executor import _Run
from lib.spec_verifier import ffprobe
from tests.lib.test_spec_assembly import _ff, make_spec

SKILL = Path(__file__).resolve().parents[2] / ".agents" / "skills" / "spec-worker" / "references"
needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg missing")


def inputs():
    return [
        {"id": "in_lang", "label": "Language", "kind": "choice", "required": True, "options": ["en", "vi"], "binds": "language"},
        {"id": "in_vsrc", "label": "Voice source", "kind": "choice", "required": True, "options": ["gemini", "upload"],
         "default_answer": "gemini", "binds": "voice_source"},
        {"id": "in_voice", "label": "Voice", "kind": "choice", "required": False, "options": ["Kore", "Puck"],
         "default_answer": "Kore", "binds": "voice_id"},
        {"id": "in_vfile", "label": "Recording", "kind": "file", "accept": "audio", "required": False,
         "required_if": {"input": "in_vsrc", "equals": "upload"}, "binds": "voice_file"},
        {"id": "in_subs", "label": "Subtitles", "kind": "boolean", "required": False, "default_answer": "true", "binds": "subtitles"},
        {"id": "in_logo", "label": "Logo", "kind": "file", "accept": "image", "required": False, "binds": "logo_file"},
    ]


@pytest.fixture
def brief():
    b = json.loads((SKILL / "example-requirements-brief.json").read_text(encoding="utf-8"))
    b["inputs"] = inputs()
    return b


def test_brief_with_inputs_lints_and_old_briefs_still_do(brief):
    assert rb.lint(brief) == []
    old = copy.deepcopy(brief)
    del old["inputs"]
    assert rb.lint(old) == []


@pytest.mark.parametrize("mutate,fragment", [
    (lambda b: b["inputs"][0].pop("options"), "choice needs options"),
    (lambda b: b["inputs"][3].pop("accept"), "file needs accept"),
    (lambda b: b["inputs"][3].update(required_if={"input": "nope", "equals": "x"}), "unknown input"),
    (lambda b: b["inputs"][5].update(binds="language"), "bind the same"),
    (lambda b: b["inputs"][0].update(id="q1"), "also an open question"),
    (lambda b: b["inputs"][2].update(default_answer="Zed"), "not one of the options"),
])
def test_input_lint_rejects(brief, mutate, fragment):
    mutate(brief)
    assert any(fragment in e for e in rb.lint(brief)), rb.lint(brief)


def test_required_input_blocks_approval_and_defaults_fill(brief):
    with pytest.raises(ValueError, match="in_lang"):
        rb.approve(brief, ["i1"], {})
    ok = rb.approve(brief, ["i1"], {"in_lang": "vi"})
    answers = ok["approval"]["answers"]
    assert answers["in_lang"] == "vi" and answers["in_vsrc"] == "gemini" and answers["in_voice"] == "Kore"
    assert answers["in_subs"] == "true" and "in_vfile" not in answers and "in_logo" not in answers
    assert rb.is_approved(ok)


def test_required_if_and_choice_checks(brief):
    with pytest.raises(ValueError, match="in_vfile"):
        rb.approve(brief, ["i1"], {"in_lang": "en", "in_vsrc": "upload"})
    ok = rb.approve(brief, ["i1"], {"in_lang": "en", "in_vsrc": "upload", "in_vfile": "inputs/voice.mp3"})
    assert ok["approval"]["answers"]["in_vfile"] == "inputs/voice.mp3"
    with pytest.raises(ValueError, match="not one of"):
        rb.approve(brief, ["i1"], {"in_lang": "fr"})
    with pytest.raises(ValueError, match="inside the project"):
        rb.approve(brief, ["i1"], {"in_lang": "en", "in_logo": "../x.png"})
    with pytest.raises(ValueError, match="unknown question or input"):
        rb.approve(brief, ["i1"], {"in_lang": "en", "zzz": "1"})
    assert rb.input_answer_errors(brief, {}) == ["input in_lang (Language) is required"]


# ---------------------------------------------------------------- bindings

def bound(**kw):
    return kw


def test_gemini_voice_binding():
    spec = make_spec()
    spec["jobs"][0]["params"]["voice_id"] = "Kore"
    spec["jobs"][1]["params"]["voice_id"] = "Puck"
    errs = rb._binding_errors(spec, bound(voice_source="gemini", voice_id="Kore"))
    assert len(errs) == 1 and "tts_2" in errs[0]
    spec["jobs"][1]["params"]["voice_id"] = "Kore"
    assert rb._binding_errors(spec, bound(voice_source="gemini", voice_id="Kore")) == []


def test_uploaded_voice_binding():
    spec = make_spec()
    assert len(rb._binding_errors(spec, bound(voice_source="upload", voice_file="inputs/v.mp3"))) == 2
    for j in spec["jobs"]:
        if j["kind"] == "tts":
            j["tool"], j["params"] = "provided_audio", {"source_path": "inputs/v.mp3"}
    assert rb._binding_errors(spec, bound(voice_source="upload", voice_file="inputs/v.mp3")) == []


def test_dialogue_character_music_subtitle_logo_bindings():
    spec = make_spec()
    assert rb._binding_errors(spec, bound(dialogue="Bees pollinate a third of our food")) == []
    assert rb._binding_errors(spec, bound(dialogue="Push harder")) != []
    assert rb._binding_errors(spec, bound(character_ref="inputs/girl.png")) != []
    spec["jobs"][2]["params"]["reference_image_path"] = "inputs/girl.png"
    assert rb._binding_errors(spec, bound(character_ref="inputs/girl.png")) == []
    assert rb._binding_errors(spec, bound(music_source="none")) != []        # spec has a music job
    assert rb._binding_errors(spec, bound(music_source="generate")) == []
    assert rb._binding_errors(spec, bound(music_source="file", music_file="inputs/t.mp3")) != []
    assert rb._binding_errors(spec, bound(subtitles="false")) != []
    spec["audio_plan"]["burn_subtitles"] = False
    assert rb._binding_errors(spec, bound(subtitles="false")) == []
    assert rb._binding_errors(spec, bound(logo_file="inputs/logo.png")) != []
    spec["brand_overlay"] = {"path": "inputs/logo.png"}
    assert rb._binding_errors(spec, bound(logo_file="inputs/logo.png")) == []
    assert rb._binding_errors(spec, bound()) != []                            # logo without an answer


# ------------------------------------------------------------------- lint

def test_provided_tools_lint():
    spec = make_spec()
    for j in spec["jobs"]:
        if j["kind"] == "tts":
            j["tool"], j["params"], j["acceptance"] = "provided_audio", {"source_path": "inputs/v.mp3"}, {}
        if j["kind"] == "music":
            j["tool"], j["params"] = "provided_music", {"source_path": "inputs/t.mp3"}
    assert ps.lint(spec) == []
    spec["jobs"][0]["params"] = {}
    assert any("source_path" in e for e in ps.lint(spec))
    spec["jobs"][0]["params"] = {"source_path": "../etc/passwd"}
    assert any("source_path" in e for e in ps.lint(spec))
    spec["jobs"][0]["params"] = {"source_path": "inputs/v.mp3"}
    spec["jobs"][0]["output_path"] = "assets/audio/s1.mp3"
    assert any(".wav" in e for e in ps.lint(spec))


def test_brand_overlay_is_sealed_and_validated():
    spec = make_spec()
    before = spec["spec_hash"]
    spec["brand_overlay"] = {"path": "inputs/logo.png", "position": "top_left"}
    assert ps.schema_errors(spec) == []
    assert ps.canonical_hash(spec) != before
    spec["brand_overlay"]["position"] = "middle"
    assert ps.schema_errors(spec) != []


# ------------------------------------------------------------------ tools

@needs_ffmpeg
def test_passthrough_tools(tmp_path):
    from tools.audio.provided_audio import ProvidedAudio, ProvidedMusic

    src = tmp_path / "inputs" / "voice.mp3"
    src.parent.mkdir()
    _ff("-f", "lavfi", "-i", "sine=f=400:d=1.5", str(src))
    out = tmp_path / "assets" / "audio" / "s1.wav"
    res = ProvidedAudio().execute({"source_path": str(src), "output_path": str(out)})
    assert res.success and res.cost_usd == 0.0
    assert ffprobe(out)["duration"] == pytest.approx(1.5, abs=0.2)

    track = tmp_path / "assets" / "music" / "bg.mp3"
    res = ProvidedMusic().execute({"source_path": str(src), "output_path": str(track)})
    assert res.success and track.read_bytes() == src.read_bytes()

    assert not ProvidedAudio().execute({"source_path": str(tmp_path / "nope.mp3")}).success
    assert not ProvidedAudio().execute({"source_path": str(src), "output_path": str(tmp_path / "x.mp3")}).success
    txt = tmp_path / "notes.txt"
    txt.write_text("x")
    assert not ProvidedMusic().execute({"source_path": str(txt)}).success


def test_executor_resolves_project_relative_files(tmp_path):
    (tmp_path / "inputs").mkdir()
    (tmp_path / "inputs" / "girl.png").write_bytes(b"x")
    run = object.__new__(_Run)
    run.dir = tmp_path
    out = run._resolve_paths({
        "prompt": "inputs/girl.png",                       # not a *_path key: untouched
        "reference_image_path": "inputs/girl.png",
        "reference_image_paths": ["inputs/girl.png", "inputs/missing.png"],
        "source_path": "/abs/already.mp3",
    })
    assert out["prompt"] == "inputs/girl.png"
    assert out["reference_image_path"] == str(tmp_path / "inputs" / "girl.png")
    assert out["reference_image_paths"] == [str(tmp_path / "inputs" / "girl.png"), "inputs/missing.png"]
    assert out["source_path"] == "/abs/already.mp3"


# ---------------------------------------------------------------- overlay

@needs_ffmpeg
def test_logo_overlay_on_last_scene_only(tmp_path):
    spec = make_spec()
    spec["brand_overlay"] = {"path": "inputs/logo.png", "position": "bottom_right", "scale": 0.2, "margin": 24}
    ps.seal(spec)
    p = tmp_path
    for d in ("assets/video", "assets/audio", "assets/images", "assets/music", "inputs"):
        (p / d).mkdir(parents=True)
    _ff("-f", "lavfi", "-i", "color=c=red:s=320x180:d=2:r=24", "-pix_fmt", "yuv420p", str(p / "assets/video/s1.mp4"))
    _ff("-f", "lavfi", "-i", "color=c=blue:s=200x200:d=1", "-frames:v", "1", str(p / "assets/images/s2.png"))
    _ff("-f", "lavfi", "-i", "color=c=0x00ff00:s=200x200:d=1", "-frames:v", "1", str(p / "inputs/logo.png"))
    _ff("-f", "lavfi", "-i", "sine=f=300:d=3", str(p / "assets/audio/s1.wav"))
    _ff("-f", "lavfi", "-i", "sine=f=500:d=3", str(p / "assets/audio/s2.wav"))
    _ff("-f", "lavfi", "-i", "sine=f=200:d=3", str(p / "assets/music/bg.wav"))
    rr = assemble(p, spec, {"spec_hash": spec["spec_hash"], "status": "complete", "needs_replan": []})
    assert rr["metadata"]["final_check"] == "passed", rr["verification_notes"]

    def pixel(t: float, x: int, y: int) -> tuple[int, int, int]:
        raw = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-ss", str(t), "-i", str(p / "renders/final.mp4"), "-frames:v", "1",
             "-vf", f"format=rgb24,crop=2:2:{x}:{y}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            capture_output=True, check=True).stdout
        return raw[0], raw[1], raw[2]

    r, g, b = pixel(6.0, 1280 - 24 - 20, 720 - 24 - 20)       # inside the logo, last scene
    assert g > 200 and r < 60 and b < 60
    r, g, b = pixel(1.0, 1280 - 24 - 20, 720 - 24 - 20)       # first scene: no logo
    assert g < 60
    assert ffprobe(p / "renders/final.mp4")["height"] == 720


@needs_ffmpeg
def test_missing_logo_is_an_assembly_error(tmp_path):
    from lib.spec_to_edit import AssemblyError

    spec = make_spec()
    spec["brand_overlay"] = {"path": "inputs/logo.png"}
    ps.seal(spec)
    p = tmp_path
    for d in ("assets/video", "assets/audio", "assets/images", "assets/music"):
        (p / d).mkdir(parents=True)
    _ff("-f", "lavfi", "-i", "color=c=red:s=320x180:d=2:r=24", "-pix_fmt", "yuv420p", str(p / "assets/video/s1.mp4"))
    _ff("-f", "lavfi", "-i", "color=c=blue:s=200x200:d=1", "-frames:v", "1", str(p / "assets/images/s2.png"))
    _ff("-f", "lavfi", "-i", "sine=f=300:d=3", str(p / "assets/audio/s1.wav"))
    _ff("-f", "lavfi", "-i", "sine=f=500:d=3", str(p / "assets/audio/s2.wav"))
    _ff("-f", "lavfi", "-i", "sine=f=200:d=3", str(p / "assets/music/bg.wav"))
    with pytest.raises(AssemblyError, match="brand overlay"):
        assemble(p, spec, {"spec_hash": spec["spec_hash"], "status": "complete", "needs_replan": []})
