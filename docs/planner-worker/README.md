# Claude Plans → Gemini Executes (spec mode)

**Agents: read [`STATUS.md`](STATUS.md) first**, then [`workflow.md`](workflow.md) (flowchart + sequence diagram). The instructions agents actually follow live in `.agents/skills/spec-worker/` — do not duplicate them here.

## Goal

The agent (Claude Code) plans a video **once**, from A to Z: it makes the request explicit (goals, non-goals, viewer scenarios, improvements the user picks), then writes the full script, scenes and every asset-generation call. Gemini (API key) then **executes that plan mechanically** — a worker with no creative freedom. Output must not drift from the plan. Claude is not used during the render except for recovery after unrecoverable failures.

Why: planning is the only part needing Claude's judgement; generation and verification are deterministic.

## Architecture

```
Studio intake / request
        │
  S1 requirements_brief.json  (agent)  ── Gate 1: corrections, answers, improvement picks
        │  requirements approve (CLI stamps hash)
  S2 production_spec.json     (agent)  ── spec check (CLI: lint, traceability, seal) ── Gate 2
        │  spec approve (CLI binds approval to spec_hash)
  S3 render (CLI, no LLM): lib/spec_executor.py → Gemini tools + lib/spec_verifier.py
        │      retry_ladder → fallback_tool → needs_replan
        └──── lib/spec_assembler.py → renders/final.mp4 + final_check
  S4 deliver / S5 recover (agent edits only failed jobs → Gate 2′)
```

## The contract: `production_spec`

Schema: `schemas/artifacts/production_spec.schema.json`. Helpers: `lib/production_spec.py` (`validate`, `lint`, `seal`, `verify_seal`). It traces to the approved `requirements_brief` (`lib/requirements_brief.py`).

Everything the worker needs is decided in the spec: script text (verbatim), scene timings, per-job `tool` + exact `params`, `depends_on` / `input_from`, `acceptance` checks, `retry_ladder`, optional `fallback_tool`, cost estimates. `spec_hash` = sha256 over `{script, scenes, jobs, audio_plan}`; the worker refuses a spec whose hash does not match.

## Invariants (every phase must preserve)

0. **Instructions in `.agents/`, code only for what an agent cannot do.** Agents never need to read source code to run this feature.
1. **Worker never calls an LLM to decide anything.** Its only variation is applying the spec's own `retry_ladder`. The vision grader is a *judge* with fixed yes/no questions from the spec, not a decider.
2. **Worker tools are Gemini-API-key tools only** (`lib/production_spec.GEMINI_TOOLS`) plus two local passthroughs for files the creator supplied (`provided_audio`, `provided_music`: no model, cost 0). No selector routing, no other vendor. `veo_video` needs Vertex credentials, so it is out.
3. **Narration is verbatim.** TTS text == script section text; subtitles come from the script, never from STT.
4. **Spec edits after approval invalidate the hash.** Revisions produce a new sealed spec and a new approval; never mutate in place.
5. **Claude token budget:** one planning pass per step (≤ 2 validator-fix rounds). Render = 0 Claude calls on the happy path. Recovery edits failed jobs only.
8. **Steps are approved in order** (requirements → spec → render); approval is bound to a content hash, any edit invalidates it.
6. **Studio rules still apply** (`docs/ui-plan/STATUS.md` "Rules every phase follows"): store seams, `X-Studio-Token`, `{detail, code}` errors, en + vi i18n parity, English docs.
7. **Gemini clip length is model-chosen** (`gemini_omni_video`). Specs never assert exact video duration; assembly trims/pads to the scene window.

## Phases

| # | Spec | Delivers |
|---|---|---|
| 1 | [phase-1-spec-and-planner.md](phases/phase-1-spec-and-planner.md) | Spec contract: schema, lint, seal |
| 2 | [phase-2-worker-and-verifier.md](phases/phase-2-worker-and-verifier.md) | Executor, verifier, cost, resume, `worker_report` |
| 3 | [phase-3-assembly-and-e2e.md](phases/phase-3-assembly-and-e2e.md) | ffmpeg assembly, final check, `render` CLI |
| 4 | [phase-4-agent-workflow.md](phases/phase-4-agent-workflow.md) | `.agents/skills/spec-worker/`, requirements stage, gate CLI |
| 5 | [phase-5-studio-integration.md](phases/phase-5-studio-integration.md) | Studio routes + stepper UI + i18n |

## Environment variables

Set in `.env` by the user (never commit values; agents must not read `.env`):

| Variable | Used by |
|---|---|
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | worker tools + vision judge (`.env.example` already documents `GOOGLE_API_KEY`) |
| `GEMINI_VISION_MODEL` (optional) | vision judge, default `gemini-2.5-flash` |

No Anthropic API key is needed: the planner is the Claude Code agent itself.

## Tracking rules

- STATUS.md has one row per phase and a checklist per phase. Tick an item **only when code and tests exist**; add the file paths.
- Record every deviation from the phase spec in that phase's "Implementation notes" in STATUS.md (what, why).
- When you leave work half-done, write exactly where you stopped in "Resume here".
- Commit only when the user asks.
- Run tests with `.venv/bin/python -m pytest` (no bare `python` on this machine).
