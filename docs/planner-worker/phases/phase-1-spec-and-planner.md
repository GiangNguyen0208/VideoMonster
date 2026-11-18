# Phase 1 — Spec contract

**Goal.** A single, machine-checkable contract (`production_spec`) between the planning agent and the Gemini worker: validated, lint-checked and sealed with a hash so the worker can refuse a modified plan.

## Scope

1. **Schema** `schemas/artifacts/production_spec.schema.json`, registered in `schemas/artifacts/__init__.py` (`ARTIFACT_NAMES`).
2. **`lib/production_spec.py`** — pure functions, no IO:
   - `canonical_hash`, `seal`, `verify_seal` (`SpecTampered`)
   - `schema_errors`, `lint`, `validate`
   - `GEMINI_TOOLS` (tool name → kind), `GEMINI_IMAGE_MODELS`
3. **Lint rules** (all produce a human-readable string):
   - scenes contiguous from 0, end == `duration_seconds` (±0.5 s), each maps to a script section
   - narration fits its scene window (words/WPS, 35 % slack)
   - every job tool ∈ `GEMINI_TOOLS`, kind matches tool, tool available when `tool_available` given
   - every scene has ≥ 1 `tts` job and ≥ 1 `video`/`image` job; only `music` may omit `scene_id`
   - tts `params.text` == script section == `acceptance.expected_text`
   - visual jobs carry `must_show` / `must_not_show`
   - `input_from` ⊆ `depends_on`; no cycles; no `params.output_path`; output path stays in project
   - `google_imagen` needs an explicit `gemini-*` model
   - tts `output_path` must end in `.wav` (`gemini_tts` refuses other suffixes)
4. **Planner — superseded.** An Anthropic-API planner (`lib/planner.py`, `plan` CLI, `anthropic` dependency) was built and tests passed with a fake client, then **reverted on 2026-11-17**: the agent plans by following `.agents/skills/spec-worker/` instead (see [`../workflow.md`](../workflow.md), Phase 4). Its prompt rules were moved into the skill's `references/`.

## Out of scope

Running any job, Studio routes/UI (Phase 4), writing canonical `brief`/`script`/`scene_plan` artifacts (Phase 4 derives them from the spec).

## Acceptance

- `tests/lib/test_production_spec.py`: valid spec seals + validates; tamper detected; each lint rule has a rejecting case.
- `tests/contracts` and `tests/backlot` still pass.

## Decisions & notes

- `project_id`, `requirements_hash`, `spec_hash` are never written by the agent; `spec check` fills them (Phase 4).
- tts output must be `.wav`; video clip length is model-chosen (invariant 7).
