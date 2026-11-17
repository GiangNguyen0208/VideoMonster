"""The spec-worker skill's worked examples must stay valid against the real
validators, so the instructions agents follow cannot drift from the gates."""

import json
from pathlib import Path

from lib import production_spec as ps
from lib import requirements_brief as rb

SKILL = Path(__file__).resolve().parents[2] / ".agents" / "skills" / "spec-worker"


def _load(name):
    return json.loads((SKILL / "references" / name).read_text(encoding="utf-8"))


def test_skill_files_exist():
    for name in ("SKILL.md", "references/requirements-stage.md", "references/spec-format.md",
                 "references/planning-rules.md", "references/acceptance-and-retry.md",
                 "references/recovery.md", "references/cli.md", "references/studio-contract.md"):
        assert (SKILL / name).is_file(), name
    assert SKILL.joinpath("SKILL.md").read_text().startswith("---\nname: spec-worker")


def test_example_brief_is_valid_and_example_spec_traces_to_it():
    brief = _load("example-requirements-brief.json")
    assert rb.lint(brief) == []
    approved = rb.approve(brief, ["i1"])
    spec = _load("example-production-spec.json")
    spec.update(version="1.0", project_id=approved["project_id"], requirements_hash=approved["approval"]["brief_hash"])
    assert ps.validate(spec, requirements=approved) == []
    ps.verify_seal(ps.seal(spec))
