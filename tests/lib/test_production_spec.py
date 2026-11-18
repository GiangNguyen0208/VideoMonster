"""production_spec contract + planner (fake Claude client, no network)."""

from __future__ import annotations


import pytest

from lib import production_spec as ps

TEXT = "Bees pollinate a third of our food."


def good_spec() -> dict:
    return {
        "version": "1.0",
        "project_id": "demo",
        "language": "en",
        "duration_seconds": 6,
        "aspect_ratio": "16:9",
        "script": {"sections": [{"id": "a", "text": TEXT}]},
        "scenes": [
            {"id": "s1", "start_seconds": 0, "end_seconds": 6, "script_section_id": "a", "description": "bee"}
        ],
        "jobs": [
            {
                "job_id": "tts_s1", "scene_id": "s1", "kind": "tts", "tool": "gemini_tts",
                "params": {"text": TEXT, "voice_id": "Kore"},
                "output_path": "assets/audio/s1.wav",
                "acceptance": {"expected_text": TEXT, "duration_seconds": 3},
            },
            {
                "job_id": "vid_s1", "scene_id": "s1", "kind": "video", "tool": "gemini_omni_video",
                "params": {"prompt": "macro shot of a bee on a flower", "aspect_ratio": "16:9"},
                "output_path": "assets/video/s1.mp4",
                "acceptance": {"must_show": ["Is a bee visible?"]},
                "retry_ladder": [{"params_patch": {"prompt": "a bee on a flower"}}],
            },
        ],
    }


def test_valid_spec_seals_and_verifies():
    spec = ps.seal(good_spec())
    assert ps.validate(spec) == []
    ps.verify_seal(spec)


def test_tamper_detected():
    spec = ps.seal(good_spec())
    spec["jobs"][1]["params"]["prompt"] = "something else"
    with pytest.raises(ps.SpecTampered):
        ps.verify_seal(spec)


@pytest.mark.parametrize(
    "mutate, needle",
    [
        (lambda s: s["jobs"][0]["params"].update(text="different words"), "verbatim"),
        (lambda s: s["jobs"][1].update(tool="veo_video"), "not a Gemini worker tool"),
        (lambda s: s["jobs"][1]["params"].update(output_path="x.mp4"), "output_path"),
        (lambda s: s["jobs"][0].update(output_path="assets/audio/s1.mp3"), ".wav"),
        (lambda s: s["jobs"][1]["acceptance"].clear(), "must_show"),
        (lambda s: s["scenes"][0].update(end_seconds=3), "duration_seconds"),
        (lambda s: s["jobs"].pop(0), "no tts job"),
        (lambda s: s["jobs"][1].update(depends_on=["vid_s1"]), "cycle"),
    ],
)
def test_lint_rejects(mutate, needle):
    spec = good_spec()
    mutate(spec)
    assert any(needle in e for e in ps.validate(spec)), ps.validate(spec)


def test_unavailable_tool_flagged():
    errs = ps.validate(good_spec(), tool_available={"gemini_tts"})
    assert any("unavailable" in e for e in errs)
