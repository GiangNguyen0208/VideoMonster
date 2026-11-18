"""Worker executor + verifier with fake tools (no network, no media)."""

from __future__ import annotations

import ast
import copy
from pathlib import Path

import pytest

from lib import production_spec as ps
from lib.spec_executor import REPORT_REL, run_spec
from lib.spec_verifier import VerifyResult, Verifier, aspect_matches, check_probe, wer
from tests.lib.test_production_spec import TEXT, good_spec
from tools.base_tool import ToolResult
from tools.cost_tracker import CostTracker


class FakeTool:
    def __init__(self, name, *, fail_times=0, cost=0.05, data=None):
        self.name, self.provider = name, "google"
        self.fail_times, self.cost, self.data = fail_times, cost, data or {}
        self.calls: list[dict] = []

    def estimate_cost(self, params):
        return self.cost

    def execute(self, params):
        self.calls.append(dict(params))
        if len(self.calls) <= self.fail_times:
            return ToolResult(success=False, error="boom", data=dict(self.data))
        Path(params["output_path"]).write_bytes(b"x")
        return ToolResult(success=True, cost_usd=self.cost, model="m", data={"output": params["output_path"]})


class FakeRegistry:
    def __init__(self, *tools):
        self.tools = {t.name: t for t in tools}

    def get(self, name):
        return self.tools.get(name)


class FakeVerifier:
    """Fails a job's first N checks; records what it saw."""

    def __init__(self, fail=None):
        self.fail = dict(fail or {})
        self.seen: list[str] = []

    def check(self, job, path, spec):
        self.seen.append(job["job_id"])
        if self.fail.get(job["job_id"], 0) > 0:
            self.fail[job["job_id"]] -= 1
            return VerifyResult(False, reasons=["vision 0.00 < 1.0"])
        return VerifyResult(True, scores={"duration": 4.0, "vision_ratio": 1.0})


def sealed(**mut):
    spec = good_spec()
    for fn in mut.values():
        fn(spec)
    return ps.seal(spec)


def two_step_spec():
    """tts + image -> video chain + music."""
    spec = good_spec()
    spec["jobs"][1]["kind"] = "video"
    spec["jobs"].insert(1, {
        "job_id": "img_s1", "scene_id": "s1", "kind": "image", "tool": "google_imagen",
        "params": {"prompt": "a bee", "model": "gemini-nano-banana-2.1"},
        "output_path": "assets/images/s1.png",
        "acceptance": {"must_show": ["Is a bee visible?"]},
    })
    vid = next(j for j in spec["jobs"] if j["job_id"] == "vid_s1")
    vid["depends_on"] = ["img_s1"]
    vid["input_from"] = {"reference_image_path": "img_s1"}
    spec["jobs"].append({
        "job_id": "music", "kind": "music", "tool": "google_music",
        "params": {"prompt": "calm", "duration_seconds": 6}, "output_path": "assets/music/bg.mp3",
        "acceptance": {"duration_seconds": 6},
    })
    return ps.seal(spec)


def tools():
    return [FakeTool("gemini_tts"), FakeTool("google_imagen"), FakeTool("gemini_omni_video"), FakeTool("google_music")]


def test_runs_in_dependency_order_and_injects_input(tmp_path):
    spec = two_step_spec()
    reg = FakeRegistry(*tools())
    events = []
    report = run_spec(tmp_path, spec, registry=reg, verifier=FakeVerifier(), on_progress=events.append)
    assert report["status"] == "complete"
    vid_call = reg.tools["gemini_omni_video"].calls[0]
    assert vid_call["reference_image_path"] == str(tmp_path / "assets/images/s1.png")
    assert vid_call["output_path"] == str(tmp_path / "assets/video/s1.mp4")
    order = [e["job_id"] for e in events if e["status"] == "passed"]
    assert order.index("img_s1") < order.index("vid_s1")
    assert (tmp_path / REPORT_REL).exists()
    manifest = (tmp_path / "artifacts/asset_manifest.json").read_text()
    assert "narration" in manifest and "_project" in manifest


def test_tampered_spec_refused(tmp_path):
    spec = two_step_spec()
    spec["jobs"][0]["params"]["voice_id"] = "Puck"
    with pytest.raises(ps.SpecTampered):
        run_spec(tmp_path, spec, registry=FakeRegistry(*tools()), verifier=FakeVerifier())


def test_retry_ladder_applied_in_order(tmp_path):
    spec = two_step_spec()
    reg = FakeRegistry(*tools())
    report = run_spec(tmp_path, spec, registry=reg, verifier=FakeVerifier(fail={"vid_s1": 1}))
    calls = reg.tools["gemini_omni_video"].calls
    assert [c["prompt"] for c in calls] == ["macro shot of a bee on a flower", "a bee on a flower"]
    job = next(j for j in report["jobs"] if j["job_id"] == "vid_s1")
    assert job["status"] == "passed" and [a["label"] for a in job["attempts"]] == ["original", "ladder-1"]


def test_exhausted_ladder_needs_replan_and_skips_dependents(tmp_path):
    spec = copy.deepcopy(two_step_spec())
    spec["jobs"].append({
        "job_id": "after", "scene_id": "s1", "kind": "image", "tool": "google_imagen",
        "params": {"prompt": "x", "model": "gemini-nano-banana-2.1"}, "output_path": "assets/images/after.png",
        "acceptance": {"must_show": ["?"]}, "depends_on": ["vid_s1"],
    })
    spec = ps.seal(spec)
    report = run_spec(tmp_path, spec, registry=FakeRegistry(*tools()), verifier=FakeVerifier(fail={"vid_s1": 9}))
    by = {j["job_id"]: j["status"] for j in report["jobs"]}
    assert by["vid_s1"] == "needs_replan" and by["after"] == "skipped_dependency"
    assert report["needs_replan"] == ["vid_s1"] and report["status"] == "partial"


def test_fallback_tool_used_after_ladder(tmp_path):
    spec = two_step_spec()
    vid = next(j for j in spec["jobs"] if j["job_id"] == "vid_s1")
    vid["fallback_tool"] = {"tool": "google_imagen", "params": {"prompt": "still", "model": "gemini-nano-banana-2.1"}}
    spec = ps.seal(spec)
    reg = FakeRegistry(*tools())
    report = run_spec(tmp_path, spec, registry=reg, verifier=FakeVerifier(fail={"vid_s1": 2}))
    job = next(j for j in report["jobs"] if j["job_id"] == "vid_s1")
    assert job["status"] == "passed" and job["attempts"][-1]["label"] == "fallback"


def test_tool_failure_then_success_counts_cost_once(tmp_path):
    spec = two_step_spec()
    reg = FakeRegistry(FakeTool("gemini_tts"), FakeTool("google_imagen"),
                       FakeTool("gemini_omni_video", fail_times=1), FakeTool("google_music"))
    report = run_spec(tmp_path, spec, registry=reg, verifier=FakeVerifier())
    assert report["status"] == "complete"
    assert report["total_cost_usd"] == pytest.approx(0.20)  # 4 jobs x 0.05; failed attempt is free


def test_unknown_outcome_is_not_retried_and_cost_counted(tmp_path):
    spec = two_step_spec()
    bad = FakeTool("gemini_omni_video", fail_times=9, data={"submission_outcome": "unknown", "retry_safe": False})
    report = run_spec(tmp_path, spec, registry=FakeRegistry(FakeTool("gemini_tts"), FakeTool("google_imagen"),
                                                            bad, FakeTool("google_music")), verifier=FakeVerifier())
    assert len(bad.calls) == 1
    assert next(j for j in report["jobs"] if j["job_id"] == "vid_s1")["status"] == "needs_replan"


def test_budget_stop_blocks_job_and_halts(tmp_path):
    spec = two_step_spec()
    tracker = CostTracker(budget_total_usd=10, single_action_approval_usd=0.01,
                          require_approval_for_new_paid_tool=False)
    reg = FakeRegistry(*tools())
    report = run_spec(tmp_path, spec, registry=reg, verifier=FakeVerifier(), cost_tracker=tracker, max_parallel=1)
    statuses = {j["status"] for j in report["jobs"]}
    assert "blocked_budget" in statuses and report["status"] != "complete"
    assert all(not t.calls for t in reg.tools.values())


def test_resume_skips_passed_jobs(tmp_path):
    spec = two_step_spec()
    reg = FakeRegistry(*tools())
    run_spec(tmp_path, spec, registry=reg, verifier=FakeVerifier())
    before = {n: len(t.calls) for n, t in reg.tools.items()}
    report = run_spec(tmp_path, spec, registry=reg, verifier=FakeVerifier())
    assert {n: len(t.calls) for n, t in reg.tools.items()} == before
    assert report["status"] == "complete"


def test_only_jobs_reruns_selected(tmp_path):
    spec = two_step_spec()
    reg = FakeRegistry(*tools())
    verifier = FakeVerifier()
    run_spec(tmp_path, spec, registry=reg, verifier=verifier)
    (tmp_path / "assets/audio/s1.wav").unlink()
    run_spec(tmp_path, spec, registry=reg, verifier=verifier, only_jobs={"tts_s1"})
    assert len(reg.tools["gemini_tts"].calls) == 2 and len(reg.tools["google_music"].calls) == 1


# ----------------------------------------------------------------- verifier

def test_wer_and_normalisation():
    assert wer("Bees pollinate food.", "bees pollinate FOOD") == 0
    assert wer("a b c d", "a b x d") == pytest.approx(0.25)
    assert wer("xin chào các bạn", "xin chào các bạn") == 0


def test_probe_checks():
    acc = {"min_width": 1280, "expect_audio": True}
    probe = {"width": 640, "height": 360, "has_audio": False, "duration": 5}
    reasons = check_probe("video", probe, acc, "9:16")
    assert len(reasons) == 3  # width, aspect, audio
    assert aspect_matches(1920, 1080, "16:9") and not aspect_matches(1080, 1920, "16:9")
    assert check_probe("music", {"has_audio": True, "duration": 3}, {"duration_seconds": 10}, None)


def test_verifier_vision_ratio_and_stt(tmp_path):
    f = tmp_path / "a.mp4"
    f.write_bytes(b"x")
    probe = lambda p: {"width": 1920, "height": 1080, "has_audio": True, "duration": 4.0}
    frames = lambda p, n, d, out: [f]
    job = {"job_id": "v", "kind": "video", "acceptance": {"must_show": ["a?", "b?"], "must_not_show": ["c?"]}}
    spec = {"aspect_ratio": "16:9"}
    v = Verifier(judge=lambda fr, q: {"a?": True, "b?": True, "c?": False}, probe=probe, frames=frames)
    assert v.check(job, f, spec).passed
    v = Verifier(judge=lambda fr, q: {"a?": True, "b?": False, "c?": True}, probe=probe, frames=frames)
    res = v.check(job, f, spec)
    assert not res.passed and res.scores["vision_ratio"] == pytest.approx(1 / 3)

    wav = tmp_path / "a.wav"
    wav.write_bytes(b"x")
    tts = {"job_id": "t", "kind": "tts", "acceptance": {"expected_text": TEXT, "duration_seconds": 5}}
    ok = Verifier(stt=lambda p: TEXT, probe=probe)
    assert ok.check(tts, wav, spec).passed
    bad = Verifier(stt=lambda p: "completely different words here", probe=probe)
    assert not bad.check(tts, wav, spec).passed
    none = Verifier(stt=lambda p: None, probe=probe).check(tts, wav, spec)
    assert none.passed and none.warnings


def test_worker_modules_never_import_anthropic():
    for name in ("lib/spec_executor.py", "lib/spec_verifier.py"):
        tree = ast.parse((Path(__file__).resolve().parents[2] / name).read_text())
        mods = {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
        mods |= {n.module or "" for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
        assert not any(m.split(".")[0] == "anthropic" for m in mods), name
