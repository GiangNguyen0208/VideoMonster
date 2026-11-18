# Planner → Worker — Phase Status

**Agents: read this file first.** Pick up the first phase that is not `done`, read its spec in `phases/`, and read [`README.md`](README.md) invariants. Update this file whenever you finish a checklist item, change a phase's state, deviate from a spec, or stop mid-phase.

Status values: `not started` · `in progress` · `blocked` · `done`

| Phase | Name | Status | Last update |
|---|---|---|---|
| 1 | [Spec contract](phases/phase-1-spec-and-planner.md) | done (API planner reverted) | 2026-11-17 |
| 2 | [Worker & verifier](phases/phase-2-worker-and-verifier.md) | in progress (offline done; live run + checkpoint progress pending) | 2026-11-17 |
| 3 | [Assembly & end-to-end](phases/phase-3-assembly-and-e2e.md) | in progress (offline done; manual E2E pending) | 2026-11-17 |
| 4 | [Agent workflow & gates](phases/phase-4-agent-workflow.md) | in progress (instructions, CLI, Studio-decision waiting done; user dry run pending) | 2026-11-17 |
| 6 | Creator inputs (required/optional) | in progress (code + tests done; project dry run pending) | 2026-11-17 |
| 5 | [Studio integration](phases/phase-5-studio-integration.md) | in progress (backend + UI + tests done; browser/live run + ui-plan docs pending) | 2026-11-17 |

## Resume here — snapshot 2026-11-17

- **Architecture changed 2026-11-17:** the user wants the workflow defined in `.agents/` (instructions), with code only where unavoidable. The Anthropic-API planner was reverted; the Claude Code agent plans by following `.agents/skills/spec-worker/`. A new first stage writes a **requirements brief** (goals, non-goals, viewer scenarios, assumptions, questions, improvements with recommendations) for every request; steps are approved in order. See [`workflow.md`](workflow.md).
- Done and tested offline: spec contract + lint + seal; requirements brief + traceability; gate CLI (`requirements`, `spec`); worker executor/verifier; ffmpeg assembler; the skill + `/spec-reel` + AGENT_GUIDE routing.
- Nothing is committed (user commits on request). Branch: `feat/migrate-old-ui-to-new-one`.
- **User to do:** set `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) in `.env`; run `/spec-reel` on a project (fixture: `tests/fixtures/planner_worker/intake_30s.json`) and report what the agent got wrong so the skill can be tuned. Agents must not read `.env`.
- Studio flow built (stepper Requirements → Plan → Make it → Result; gate decisions; render button). User creates the project in the wizard with "Plan once, Gemini makes it" (Look step → Advanced), runs the shown `claude "/spec-reel …"` once, then answers both gates and presses Render in the browser. Docker: rebuild the image (`docker compose up --build`) or use the dev overlay to see the new UI.
- Next: browser walkthrough with a stubbed worker, live key run (Phases 2–3), apply dry-run feedback to the skill, ui-plan docs.

## Decisions (user-confirmed 2026-11-17)

- ~~Planner runs in the Studio backend via the Anthropic API~~ → **replaced 2026-11-17:** the Claude Code agent is the planner, driven by `.agents/skills/spec-worker/`.
- Requirements stage for every request (goals, non-goals, scenarios, improvements with recommendation); steps approved sequentially; spec approved once as a whole, bound to `spec_hash`.
- Worker scope: video + image + TTS + music, Gemini API key only.
- Fidelity: deterministic checks + Gemini vision judge; no Claude in the render loop.
- Claude re-enters only for recovery (agent edits failed jobs) or a user revise.

## Code map

| Area | Where |
|---|---|
| Spec schema | `schemas/artifacts/production_spec.schema.json`, `worker_report.schema.json`, `requirements_brief.schema.json` |
| Agent instructions | `.agents/skills/spec-worker/` (SKILL.md + references + validated examples), `.claude/commands/spec-reel.md`, `AGENT_GUIDE.md` "Spec Mode" |
| Requirements + gates | `lib/requirements_brief.py`, `backlot/spec_cli.py`; tests `tests/lib/test_requirements_and_gates.py`, `tests/contracts/test_spec_worker_skill.py` |
| Hash / lint / validate | `lib/production_spec.py` |
| CLI | `backlot/__main__.py` (`render`, `requirements …`, `spec …`) |
| Assembly | `lib/spec_to_edit.py`, `lib/spec_assembler.py`; tests `tests/lib/test_spec_assembly.py` |
| Tests | `tests/lib/test_production_spec.py` |
| Worker | `lib/spec_executor.py`, `lib/spec_verifier.py`, `schemas/artifacts/worker_report.schema.json`; tests `tests/lib/test_spec_executor.py` |
| Worker tools (Gemini only) | `tools/video/gemini_omni_video.py`, `tools/graphics/google_imagen.py`, `tools/audio/gemini_tts.py`, `tools/audio/google_music.py` |
| Reused | `lib/checkpoint.py`, `tools/cost_tracker.py`, `lib/source_media_review.py`, `tools/analysis/transcriber.py`, `tools/video/video_compose.py`, `lib/shot_prompt_builder.py` (reference only) |

## Phase 1 — Spec contract

- [x] `schemas/artifacts/production_spec.schema.json`; registered in `schemas/artifacts/__init__.py`
- [x] `lib/production_spec.py`: `canonical_hash`, `seal`, `verify_seal`, `schema_errors`, `lint`, `validate`
- [x] Lint rules (scene contiguity, narration fit, Gemini-only tools, tts verbatim + `.wav`, per-scene tts + visual, vision checks, `input_from`⊆`depends_on`, cycles, output path safety, imagen model)
- [x] `tests/lib/test_production_spec.py` (11 tests)
- [x] ~~`lib/planner.py` Anthropic planner, `plan` CLI, `anthropic` dependency~~ — built, then **reverted** (agent plans via the skill)

**Implementation notes**
- `gemini_omni_video` clip length is model-chosen → specs never assert exact video duration.
- `veo_video` excluded: Google backend needs Vertex credentials.
- `canonical_hash` now also covers `requirements_hash` and `applied_improvements`.

## Phase 2 — Worker & verifier

- [x] `schemas/artifacts/worker_report.schema.json` + `ARTIFACT_NAMES`
- [x] `lib/spec_verifier.py`: ffprobe checks (`check_probe`), `wer`, music loudness, Gemini vision judge (`gemini_judge`), `transcriber_stt`, `Verifier` with injectable judge/stt/probe/frames/volume
- [x] `lib/spec_executor.py` `run_spec`: seal check, topo order, thread pool, param build + `input_from`
- [x] Cost tracker integration (estimate/reserve/reconcile/refund; budget/approval errors → `blocked_budget`, run stops)
- [x] Retry ladder → `fallback_tool` → `needs_replan`; `skipped_dependency` propagation
- [x] Resume / idempotency from `worker_report.json` (params hash + file exists); `only_jobs`
- [x] `asset_manifest.json` writing (validated)
- [ ] `assets` checkpoint `partial_progress` (deferred to Phase 4 — see notes)
- [x] CLI `python -m backlot render <id> [--only a,b]`
- [x] Tests: `tests/lib/test_spec_executor.py` (12 tests: order, injection, ladder, fallback, cost, unknown outcome, budget stop, resume, only_jobs, verifier helpers, no-`anthropic`-import). Full run: `tests/lib tests/contracts tests/backlot` 1907 passed, 9 skipped
- [x] ffmpeg-generated fixture media tests for `ffprobe` / `extract_frames` / `mean_volume_db`: `tests/lib/test_spec_verifier_media.py`
- [ ] Live 2-scene run with real `GEMINI_API_KEY` (also confirms the vision model name; default `gemini-2.5-flash`, override `GEMINI_VISION_MODEL`)

**Implementation notes / deviations**
- `gemini_tts` writes `.wav` only → lint now requires tts `output_path` to end in `.wav` (Phase 1 doc updated).
- Image input param for `gemini_omni_video` is `reference_image_path` (not `image_path`); planner capability text updated. Use `operation: image_to_video`.
- Most Gemini tools raise `PriceQuoteRequired` from `estimate_cost` (unquoted pricing). Executor uses the tool's quote when available, else the job's `estimated_cost_usd`; actual cost = `ToolResult.cost_usd` or that estimate when `None`.
- `CostTracker.reserve` can raise `ApprovalRequiredError` (per-action / new paid tool). The CLI treats the approved spec as consent: it lifts `single_action_approval_usd` to the largest planned job and turns off `require_approval_for_new_paid_tool`; the total cap still applies. The library keeps raising → `blocked_budget`.
- `gemini_omni_video` transport failure returns `retry_safe=False` / `submission_outcome="unknown"`: executor stops retrying that job, treats cost as spent, status `needs_replan`.
- Transcriber needs `faster_whisper`; when unavailable the verifier passes TTS with a warning ("narration text not verified") rather than failing. Consider making this strict in Phase 4 settings.
- Checkpoint progress deferred: `lib/checkpoint.write_checkpoint` enforces stage prerequisites on every write (incl. `in_progress`), so writing `assets` progress from the CLI would fail unless earlier stages' checkpoints exist. Phase 4 writes the derived checkpoints first, then wires `on_progress` to `partial_progress`.
- `ProjectFiles.local_file("")` raises `PathEscapesProject` (cannot get the project root). The CLI uses `DiskProjectStore.project_dir(id)`. Phase 4 needs a store method that returns the project root for the worker (hosted store: working copy).
- Executor lock is an `RLock` (status updates happen inside the cost-reservation critical section).

## Phase 3 — Assembly & end-to-end

- [x] `lib/spec_to_edit.py`: `plan_timeline` (window extension + shift, `timing_adjustments`), `build_cues` / `build_srt` (script text only), `build_edit_decisions` (schema-valid, `render_runtime: ffmpeg`)
- [x] `lib/spec_assembler.py` `assemble`: per-scene segments (video hold-last-frame, image zoompan, fades), concat, narration `adelay` mix, music loop + ducking windows + fades, soft `mov_text` subtitles (+ burn when ffmpeg has `subtitles`), writes `renders/final.mp4`, `renders/final.srt`, `artifacts/edit_decisions.json`, `artifacts/render_report.json`
- [x] `final_check` in `lib/spec_verifier.py` (duration, scene coverage, subtitle == script, audio stream, silence inside narration windows on the narration-only mix)
- [x] CLI `python -m backlot render <id> [--only] [--no-compose]` (assembles after a `complete` run; exit 5 assembly error, 6 final_check failed)
- [x] Sample intake `tests/fixtures/planner_worker/intake_30s.json`
- [x] Tests `tests/lib/test_spec_assembly.py` (6: timeline, srt determinism, edit_decisions validity/determinism, real-ffmpeg end-to-end, refusal on partial/foreign report). Full run `tests/lib tests/contracts tests/backlot`: 1914 passed, 9 skipped
- [ ] Manual 30 s E2E with real keys (record Claude calls/tokens, Gemini cost, retries, vision false positives in the verification log)

**Implementation notes / deviations**
- **Not `VideoCompose.render`.** Its slideshow-risk gate cannot be disabled; it ignores `audio.narration/music/ducking` (only muxes one pre-mixed file); no hold/pad of short clips; rejects images under ffmpeg; ignores transitions; burns subtitles only from a real SRT path. Spec-mode uses `lib/spec_assembler.py` (plain ffmpeg). `edit_decisions.json` is an *output* record.
- Dev machine ffmpeg (9.0.2) has **no** `subtitles`/`ass`/`drawtext` filters (no libass). Subtitles are therefore a soft `mov_text` track + sidecar SRT, with a warning in `render_report.warnings`. Burn-in happens automatically on ffmpeg builds with libass.
- `audio_plan` semantics fixed: `music_volume_db` (default now −12) = level when nobody speaks; `music_duck_db` (default now −10) = extra cut during narration (so −22 under speech). Schema defaults/description updated.
- `crossfade` renders as a fade-in inside the incoming segment (no overlap, so total length is exact); `dip_to_black` also fades out the previous segment.
- `edit_decisions.transitions[]` uses the schema's `{type, at_seconds, duration_seconds}`.
- Subtitle cue timing is proportional to characters inside each scene's narration span; the *words* are always the script's.
- Clip lengths: video shorter than the window → last frame held; longer → trimmed. Narration longer than the window → scene extends and later scenes shift (never cut speech).
- Fixture intake sets `advanced.execution_mode: "spec"`; Studio's catalog validation for that key is Phase 4.

## Phase 4 — Agent workflow & gates

- [x] `.agents/skills/spec-worker/SKILL.md` + `references/` (requirements-stage, spec-format, planning-rules, acceptance-and-retry, recovery, cli, studio-contract)
- [x] Validated examples `example-requirements-brief.json`, `example-production-spec.json`; `tests/contracts/test_spec_worker_skill.py`
- [x] `.claude/commands/spec-reel.md`; `AGENT_GUIDE.md` "Spec Mode" routing
- [x] `schemas/artifacts/requirements_brief.schema.json`, `lib/requirements_brief.py` (lint, approve, hash, traceability)
- [x] Spec traceability: `requirements_hash`, `scenes[].serves`, `applied_improvements`; must_include/avoid as whole words; duration ±15 %, aspect, language; budget cap (0 rejects paid specs)
- [x] `backlot/spec_cli.py`: `requirements check|approve`, `spec check|approve|status`; `render` refuses unapproved spec (exit 7); history kept; stale approval cleared
- [x] Reverted API planner (see Phase 1)
- [x] Tests: `tests/lib/test_requirements_and_gates.py` (brief, traceability, gate flow, render guard, status)
- [ ] User dry run of `/spec-reel` (Gate 1 + Gate 2 quality, spec-check rounds); tune the skill from findings
- [x] Studio gate wiring in the skill ("Waiting at a gate": `await-decision` per stage, apply, `consume-decision`). `spec gate` / `gate.json` dropped: gates derive from content hashes (`backlot/studio_spec.py`), stage `spec_recovery` (underscore)

**Implementation notes**
- Validation found a real inconsistency in the first draft of the worked example (missing a `must_include` phrase); the example test now guards against instruction drift.
- Gate answers come from chat until Phase 5; the file contract is shared (`studio-contract.md`).
- Pipeline checkpoints are not used in spec mode; state is derived from files.

## Phase 5 — Studio integration

- [x] `backlot/studio_spec.py` + routes in `studio_api.py` (spec-flow, requirements, requirements/decision, spec, spec/decision, render GET/POST); added to contract `V1_MODULES`; `FEATURES.spec_mode`
- [x] `studio_decisions`: stages `requirements`, `spec`, `spec_recovery` via derived gate tokens (brief hash / `spec_hash`), `SpecPicks` payload, ids validated against the brief; ordering `step_out_of_order`, staleness `spec_changed` / `requirements_changed`
- [x] Wizard `advanced.execution_mode: "spec"` (Look step → Advanced) + kickoff `/spec-reel`; `has_checkpoint` also true once the brief exists
- [x] `ProjectFiles.work_dir()` (store method for the render job) and `lib/spec_render.py` (shared by CLI and Studio render job)
- [ ] Settings/setup probe row for the Gemini key and `worker.max_parallel` / `verifier.vision_model` settings (render route already reports `gemini_key_missing`)
- [x] Frontend `studio/src/features/spec/` (stepper, requirements, spec, render panels), project page wiring, en + vi i18n, Vitest in Vietnamese
- [x] Render progress: job output (`done/total/jobs`) polled every 2 s; run state in `studio/render_run.json`
- [ ] ui-plan docs (`03-architecture.md`, `04-ui-flows.md`, `STATUS.md` code map)
- [ ] Browser verification (fixture brief/spec + stubbed worker) and live run

**Implementation notes / deviations**
- No `gate.json` / `spec gate` CLI: gate tokens are content hashes, so a gate is open exactly when its artifact is valid and unapproved.
- Studio starts the worker in-process (thread) from the server; keys come from the server environment (`.env` via docker `env_file`).
- For Studio projects the agent stops after `spec approve`; the user presses Render in Studio (avoids two concurrent runs).

## Phase 6 — Creator inputs

Why: the creator, not the agent, must supply language, voice (a Gemini voice or their own recording), their own line, a character image, music, subtitles on/off and a logo; the spec must provably use them.

- [x] Brief `inputs[]` (`schemas/artifacts/requirements_brief.schema.json`): kind text/choice/file/boolean, required, `required_if`, defaults, `binds`; lint; `approve` blocks on missing required answers (`lib/requirements_brief.py: input_answer_errors`)
- [x] Spec traceability of answers (`_binding_errors`): language, voice source/id/style/file, dialogue verbatim, character image used, music source, subtitles, logo
- [x] Passthrough tools `provided_audio`, `provided_music` (`tools/audio/provided_audio.py`; capabilities `creator_audio` / `creator_music` so selectors never route to them); `GEMINI_TOOLS`/`PROVIDED_TOOLS`; lint; executor resolves project-relative `*_path` params
- [x] `brand_overlay` in the spec schema (sealed) + assembler overlay on the last scene (`lib/spec_assembler.py`)
- [x] Studio: upload kinds `voice`/`character_ref`/`logo`/`music` with media checks, `POST /projects/{id}/inputs/music` (library copy), `check_picks` (`input_required`, `input_file_missing`), CLI rejects malformed `--answer`
- [x] UI: "What we need from you" in the requirements panel (`features/spec/CreatorInputs.tsx`), Approve disabled until required inputs are filled, en + vi
- [x] Skill/docs updated (requirements-stage catalog, spec-format, planning-rules, studio-contract, cli)
- [x] Tests: `tests/lib/test_creator_inputs.py`, `tests/backlot/test_studio_spec.py`, Vitest in Vietnamese
- [ ] Project `vn-gym-workout-a1`: add `inputs`, re-present Gate 1
- [ ] Live check: `provided_audio` + `reference_image_path` + overlay with real keys

**Deviations / limits**
- One uploaded recording cannot be split across scenes (the agent never opens media): plan one scene, or one file per scene.
- `character_notes` and `brand_text` are not machine-checked.

## Verification log

_(append: date, what was run, result, Claude calls/tokens, Gemini cost)_

- 2026-11-17 — Phase 5 offline: `tests/lib tests/contracts tests/backlot` 1941 passed, 9 skipped; studio Vitest 152 passed, eslint + tsc + prettier clean.
- 2026-11-17 — after reverting the API planner and adding requirements/gates/skill: `tests/lib tests/contracts` 1689 passed, 9 skipped.
- 2026-11-17 — offline Phase 3: `tests/lib tests/contracts tests/backlot` 1914 passed, 9 skipped (incl. real-ffmpeg assembly).
- 2026-11-17 — offline Phase 2: `tests/lib tests/contracts tests/backlot` 1907 passed, 9 skipped.
- 2026-11-17 — offline: `tests/lib/test_production_spec.py` 13 passed; `tests/contracts` + `tests/backlot` 1796 passed, 9 skipped.
