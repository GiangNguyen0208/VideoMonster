"""Studio wizard ↔ pipeline catalog ↔ agent instructions stay in sync
(docs/ui-plan/phases/phase-3-new-video-wizard.md)."""

import re
from pathlib import Path

from backlot.studio_catalog import list_pipeline_catalog
from lib.pipeline_loader import list_pipelines

REPO_ROOT = Path(__file__).resolve().parents[2]
GOALS_TS = REPO_ROOT / "studio" / "src" / "content" / "goals.ts"
USER_FACING = set(list_pipelines()) - {"framework-smoke"}


def test_every_user_facing_manifest_is_in_the_studio_catalog():
    assert {p["name"] for p in list_pipeline_catalog(None)} == USER_FACING


def test_every_user_facing_manifest_has_exactly_one_wizard_goal():
    types = re.findall(r'pipeline_type:\s*"([^"]+)"', GOALS_TS.read_text(encoding="utf-8"))
    assert sorted(types) == sorted(USER_FACING), "studio/src/content/goals.ts is out of sync"


def test_agent_entry_points_route_studio_projects_to_the_intake():
    guide = (REPO_ROOT / "AGENT_GUIDE.md").read_text(encoding="utf-8")
    assert "## Projects Created in Studio" in guide
    assert "studio/intake.json" in guide
    for path in (".claude/commands/reel.md", "CODEX.md", "CURSOR.md", "COPILOT.md", "AGENTS.md", ".windsurfrules"):
        text = (REPO_ROOT / path).read_text(encoding="utf-8")
        assert "Continue Studio project" in text, path


def test_agent_instructions_cover_studio_review_decisions():
    guide = (REPO_ROOT / "AGENT_GUIDE.md").read_text(encoding="utf-8")
    protocol = (REPO_ROOT / "skills/meta/checkpoint-protocol.md").read_text(encoding="utf-8")
    command = (REPO_ROOT / ".claude/commands/studio-continue.md").read_text(encoding="utf-8")
    for text in (guide, protocol, command):
        assert "python -m backlot await-decision" in text
    for text in (guide, command):
        assert "consume-decision" in text
    assert 'source: "studio"' in guide
    assert "A matching Studio decision is the user's reply" in protocol


def test_agent_instructions_cover_studio_inputs():
    guide = (REPO_ROOT / "AGENT_GUIDE.md").read_text(encoding="utf-8")
    for needle in ("studio/inputs.json", "inputs/", "video_analysis_brief.json", "music_track"):
        assert needle in guide, needle
    reel = (REPO_ROOT / ".claude" / "commands" / "reel.md").read_text(encoding="utf-8")
    assert "studio/inputs.json" in reel


def test_wizard_footage_goals_match_manifests():
    """Goals that ask for footage name production modes the manifest has."""
    import re

    from backlot.studio_catalog import list_pipeline_catalog

    goals = (REPO_ROOT / "studio" / "src" / "content" / "goals.ts").read_text(encoding="utf-8")
    modes = {p["name"]: {m["name"] for m in p["production_modes"]} for p in list_pipeline_catalog(None)}
    for pipeline, mode in re.findall(r'pipeline_type: "([a-z-]+)"[^}]*?upload_mode: "([a-z_]+)"', goals, re.S):
        assert mode in modes[pipeline], (pipeline, mode)
