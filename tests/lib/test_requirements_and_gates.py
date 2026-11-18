"""requirements_brief + spec gate CLI (spec check / approve / status / render guard)."""

from __future__ import annotations

import json

import pytest

from backlot import spec_cli
from lib import production_spec as ps
from lib import requirements_brief as rb
from tests.lib.test_production_spec import good_spec


def make_brief(**over) -> dict:
    brief = {
        "version": "1.0", "project_id": "demo", "request": "A short video about bees", "language": "en",
        "summary": "A 6 second explainer on why bees matter.",
        "constraints": {"duration_seconds": 6, "aspect_ratio": "16:9", "budget_cap_usd": 5,
                        "must_include": ["Bees"], "avoid": ["pesticide"]},
        "goals": [{"id": "g1", "text": "Viewer learns bees pollinate food", "success_check": "Narration says it"}],
        "non_goals": [{"id": "n1", "text": "No political stance on farming"}],
        "scenarios": [{"id": "sc1", "viewer": "curious adult", "situation": "scrolling", "outcome": "shares it"}],
        "open_questions": [{"id": "q1", "question": "Voice gender?", "default_answer": "neutral"}],
        "improvements": [
            {"id": "i1", "title": "Add background music", "benefit": "mood", "cost_delta_usd": 0.1,
             "risk": "low", "recommended": True, "rationale": "cheap, lifts tone"},
            {"id": "i2", "title": "Second language", "benefit": "reach", "cost_delta_usd": 1.0,
             "risk": "medium", "recommended": False, "rationale": "doubles cost"},
        ],
        "approval": {"status": "pending"},
    }
    brief.update(over)
    return brief


def traced_spec(brief: dict) -> dict:
    spec = good_spec()
    spec.pop("spec_hash", None)
    spec["scenes"][0]["serves"] = ["g1"]
    spec["applied_improvements"] = ["i1"]
    spec["requirements_hash"] = brief["approval"]["brief_hash"]
    spec["estimated_total_cost_usd"] = 1.0
    return spec


def approved(**over) -> dict:
    return rb.approve(make_brief(**over), ["i1"])


# ------------------------------------------------------------------- brief

def test_brief_valid_and_hash_ignores_approval():
    b = make_brief()
    assert rb.lint(b) == []
    h = rb.brief_hash(b)
    assert rb.approve(b, ["i1"])["approval"]["brief_hash"] == h


def test_approve_fills_default_answers_and_rejects_unknown_ids():
    ap = rb.approve(make_brief(), ["i1"])
    assert ap["approval"]["answers"] == {"q1": "neutral"} and rb.is_approved(ap)
    with pytest.raises(ValueError, match="unknown improvement"):
        rb.approve(make_brief(), ["nope"])
    with pytest.raises(ValueError, match="unknown question"):
        rb.approve(make_brief(), [], {"zzz": "x"})


def test_change_after_approval_invalidates():
    ap = approved()
    ap["goals"][0]["text"] = "changed"
    assert not rb.is_approved(ap)


def test_lint_requires_a_recommendation_and_unique_ids():
    b = make_brief()
    for i in b["improvements"]:
        i["recommended"] = False
    assert any("recommended" in e for e in rb.lint(b))
    b = make_brief()
    b["goals"].append(dict(b["goals"][0]))
    assert any("duplicate" in e for e in rb.lint(b))


# ------------------------------------------------------------ traceability

def test_traceable_spec_passes():
    brief = approved()
    assert ps.validate(traced_spec(brief), requirements=brief) == []


@pytest.mark.parametrize("mutate, needle", [
    (lambda s: s["scenes"][0].update(serves=[]), "not served"),
    (lambda s: s["scenes"][0].update(serves=["g1", "gX"]), "unknown goal"),
    (lambda s: s.update(applied_improvements=[]), "must equal the user's picks"),
    (lambda s: s.update(applied_improvements=["i1", "i2"]), "must equal the user's picks"),
    (lambda s: s.update(requirements_hash="0" * 64), "requirements_hash"),
    (lambda s: s.update(estimated_total_cost_usd=9), "exceeds budget"),
    (lambda s: s.update(aspect_ratio="9:16"), "aspect_ratio"),
    (lambda s: s.update(language="vi"), "language"),
])
def test_traceability_rejects(mutate, needle):
    brief = approved()
    spec = traced_spec(brief)
    mutate(spec)
    assert any(needle in e for e in ps.validate(spec, requirements=brief))


def test_required_and_avoided_phrases():
    brief = approved()
    spec = traced_spec(brief)
    spec["script"]["sections"][0]["text"] = "Honeybees help."          # whole-word match: 'Bees' is not in 'Honeybees'
    spec["jobs"][0]["params"]["text"] = spec["jobs"][0]["acceptance"]["expected_text"] = "Honeybees help."
    assert any("required phrase" in e for e in ps.validate(spec, requirements=brief))
    spec["script"]["sections"][0]["text"] = "Bees and pesticide."
    spec["jobs"][0]["params"]["text"] = spec["jobs"][0]["acceptance"]["expected_text"] = "Bees and pesticide."
    assert any("avoided phrase" in e for e in ps.validate(spec, requirements=brief))


def test_zero_budget_blocks_paid_spec_and_unapproved_brief_blocks():
    brief = rb.approve(make_brief(constraints={**make_brief()["constraints"], "budget_cap_usd": 0}), ["i1"])
    assert any("cap is 0" in e for e in ps.validate(traced_spec(brief), requirements=brief))
    pending = make_brief()
    assert any("not approved" in e for e in ps.validate(good_spec(), requirements=pending))


# --------------------------------------------------------------------- CLI

@pytest.fixture
def project(tmp_path, monkeypatch):
    import backlot.state as state

    monkeypatch.setattr(state, "PROJECTS_DIR", tmp_path)
    root = tmp_path / "demo"
    (root / "artifacts").mkdir(parents=True)
    (root / "project.json").write_text(json.dumps({"project_id": "demo", "title": "Demo", "pipeline_type": "animated-explainer"}))
    return root


def put(root, rel, data):
    (root / rel).write_text(json.dumps(data))


def get(root, rel):
    return json.loads((root / rel).read_text())


def test_gate_flow(project, capsys):
    put(project, spec_cli.BRIEF, make_brief())
    assert spec_cli.requirements_check("demo") == 0
    # spec check refuses before the brief is approved
    raw = traced_spec(approved())
    for k in ("requirements_hash", "spec_hash", "project_id"):
        raw.pop(k, None)
    put(project, spec_cli.SPEC, raw)
    assert spec_cli.spec_check("demo", offline=True) == 7

    assert spec_cli.requirements_approve("demo", "i1", ["q1=female"]) == 0
    assert get(project, spec_cli.BRIEF)["approval"]["answers"]["q1"] == "female"
    assert spec_cli.spec_check("demo", offline=True) == 0
    spec = get(project, spec_cli.SPEC)
    ps.verify_seal(spec)
    assert spec["requirements_hash"] == get(project, spec_cli.BRIEF)["approval"]["brief_hash"]

    assert spec_cli.spec_approve("demo") == 0
    out = capsys.readouterr().out
    assert "approved" in out

    # editing the spec and re-checking clears approval and keeps history
    spec["jobs"][1]["params"]["prompt"] = "a different bee"
    spec.pop("spec_hash")
    put(project, spec_cli.SPEC, {**spec, "spec_hash": "0" * 64})  # simulate edit of a sealed file
    assert spec_cli.spec_check("demo", offline=True) == 0
    assert not (project / spec_cli.APPROVAL).exists()
    assert list((project / spec_cli.HISTORY).glob("001-*.json"))

    assert spec_cli.spec_status("demo") == 0
    assert "not approved" in capsys.readouterr().out


def test_spec_check_failure_leaves_file_untouched(project):
    brief = approved()
    put(project, spec_cli.BRIEF, brief)
    bad = traced_spec(brief)
    bad["jobs"][0]["params"]["text"] = "wrong"
    put(project, spec_cli.SPEC, bad)
    before = (project / spec_cli.SPEC).read_text()
    assert spec_cli.spec_check("demo", offline=True) == 1
    assert (project / spec_cli.SPEC).read_text() == before


def test_render_refuses_unapproved_spec(project):
    from backlot.__main__ import cmd_render

    brief = approved()
    put(project, spec_cli.BRIEF, brief)
    put(project, spec_cli.SPEC, traced_spec(brief))
    assert spec_cli.spec_check("demo", offline=True) == 0
    assert cmd_render("demo", None) == 7


def test_status_reports_failed_jobs_compactly(project, capsys):
    brief = approved()
    put(project, spec_cli.BRIEF, brief)
    put(project, spec_cli.SPEC, traced_spec(brief))
    spec_cli.spec_check("demo", offline=True)
    spec = get(project, spec_cli.SPEC)
    put(project, spec_cli.REPORT, {
        "spec_hash": spec["spec_hash"], "status": "partial", "total_cost_usd": 0.1, "needs_replan": ["vid_s1"],
        "jobs": [{"job_id": "tts_s1", "status": "passed", "attempts": []},
                 {"job_id": "vid_s1", "status": "needs_replan", "reasons": ["vision 0.00 < 1.0"],
                  "attempts": [{"label": "original", "tool": "gemini_omni_video"}]}]})
    capsys.readouterr()
    spec_cli.spec_status("demo")
    out = capsys.readouterr().out
    assert "vid_s1: needs_replan" in out and "tts_s1" not in out
