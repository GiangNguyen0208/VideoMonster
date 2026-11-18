# Phase 4 — Agent workflow & gates

**Goal.** The whole feature is operable by an agent that reads **instructions, not code**, with two ordered user gates (requirements → spec), and a thin deterministic CLI for everything an agent must not do itself.

Full flow and diagrams: [`../workflow.md`](../workflow.md).

## Scope

### 1. Instructions (`.agents/skills/spec-worker/`)
- `SKILL.md`: trigger, hard rules (no source reading, no media viewing, no hand-written hashes, ordered approvals, no substitutions, one planning pass, no polling), steps S0–S5 with gates, presentation rules.
- `references/requirements-stage.md`: the requirements brief for **every** request (goals, non-goals, viewer scenarios, assumptions, open questions with defaults, improvements with cost/risk/recommendation), scaling table for tiny→large requests.
- `references/spec-format.md`, `planning-rules.md`, `acceptance-and-retry.md`, `recovery.md`, `cli.md`, `studio-contract.md`.
- Validated worked examples: `references/example-requirements-brief.json`, `example-production-spec.json` (kept valid by `tests/contracts/test_spec_worker_skill.py`).
- Entry points: `.claude/commands/spec-reel.md`; routing section "Spec Mode" in `AGENT_GUIDE.md`.

### 2. Requirements brief (contract + code)
- `schemas/artifacts/requirements_brief.schema.json`, `lib/requirements_brief.py`: `lint`, `approve` (picks + answers, defaults for unanswered), `brief_hash` (ignores the approval block), `is_approved`, `traceability_errors`.
- Traceability enforced when the spec is checked: spec carries `requirements_hash`; every goal served by a scene (`serves`); `applied_improvements` equals the user's picks; `must_include` present / `avoid` absent as whole words; duration ±15 %, aspect, language; cost within cap (cap 0 rejects any paid spec).

### 3. Gate CLI (`backlot/spec_cli.py`)
`requirements check|approve`, `spec check|approve|status`; `render` refuses (exit 7) unless the current `spec_hash` is approved. `spec check` fills hashes, seals, keeps history in `artifacts/production_spec.history/`, clears a stale approval, and never modifies the file on errors.

### 4. Reverted
`lib/planner.py`, `plan` CLI, `anthropic` requirement, planner tests.

## Acceptance
- `tests/lib/test_requirements_and_gates.py`: brief lint/approval/hash; each traceability failure; gate flow; failure leaves spec untouched; render refuses unapproved; status prints only problem jobs.
- `tests/contracts/test_spec_worker_skill.py`: skill files exist; examples validate against the real validators.
- Manual dry run (user): `/spec-reel` on the fixture intake reaches Gate 1 and Gate 2 with sensible presentations and produces a sealed spec that `spec check` accepts in ≤ 2 rounds.

## Notes
- Gate answers come from chat until Phase 5 adds Studio panels; the file contract is already shared (`references/studio-contract.md`).
- Tune the instructions from the dry-run: record spec-check error frequency (which lint rules agents trip most) and move guidance into `planning-rules.md` accordingly.
