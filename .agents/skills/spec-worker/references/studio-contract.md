# Studio contract — one workflow, one file contract

Studio (browser) and the agent (chat) are two front ends over the **same files**. Whatever one does, the other sees. This keeps the workflow, UI and backend consistent.

## Steps and their gates

| # | Step | Artifact | Gate | Who answers |
|---|---|---|---|---|
| 1 | Requirements | `artifacts/requirements_brief.json` | Gate 1: corrections, answers to questions, improvement picks | user (Studio panel or chat) |
| 2 | Spec | `artifacts/production_spec.json` | Gate 2: approve / revise with notes / abort | user |
| 3 | Render | `artifacts/worker_report.json`, `renders/final.mp4` | none (code; progress only) | — |
| 4 | Recovery | edited spec | Gate 2′ on the changed jobs | user |

Steps are approved strictly in order; Studio shows them as a stepper and must not offer a later step before the earlier one is approved. The state is derived from disk:

| State | Derived from |
|---|---|
| requirements pending / approved | `requirements_brief.approval.status` and `is_approved` (hash matches) |
| spec drafted / sealed | `production_spec.spec_hash` present and valid |
| spec approved | `spec_approval.spec_hash == production_spec.spec_hash` |
| rendering / partial / complete | `worker_report.status` and `.spec_hash` equal to the current spec |
| delivered | `render_report.metadata.final_check == "passed"` |

## What Studio shows per step

1. **Requirements:** summary, goals, non-goals, scenarios, assumptions, questions (editable answers, defaults prefilled), **"What we need from you"** (the brief's `inputs`: required first, then optional; text / choice / yes-no / file upload, music from the library; Approve stays disabled until required ones are filled), improvements as checkboxes with cost/risk and a **Recommended** badge, running cost total. File answers are project paths under `inputs/` (uploaded with kind `voice`, `character_ref`, `logo` or `music`).
2. **Spec:** script by scene with timings, per-scene shot idea and the goals it serves, job table (tool, prompt, acceptance questions, est. cost), total vs cap, applied improvements, what the check enforced.
3. **Render:** per-job status chips, attempts, vision scores, cost, thumbnails; final player.
4. **Recovery:** the changed jobs (old vs new), why, extra cost.

## Decisions

Studio writes decision files (`studio/decisions/<id>.json`, schema `studio.decision/1`); the agent applies them exactly like a chat reply. For this workflow the review points are `requirements`, `spec`, `spec_recovery`; the payload carries the user's notes and, for `requirements`, `selected_improvements` and `answers`. Applying one means running the matching CLI command (`requirements approve …`, `spec approve`) — Studio itself never edits the artifacts or runs the gates.

The gate token is a content hash (brief hash for `requirements`, `spec_hash` for the others), so Studio needs no gate file from the agent: a gate is open exactly when its artifact is valid and unapproved, and a decision recorded against an older hash is stale automatically. The agent waits with `await-decision <id> <stage>` (SKILL.md "Waiting at a gate"). Render is started from Studio's Render button for Studio projects; the agent then reads `spec status`.

## Agent ↔ Studio rules

- Do not edit `studio/intake.json` / `studio/inputs.json`.
- Re-log changed choices in `decision_log` per AGENT_GUIDE ("Re-log Changed Decisions") when you have one; spec mode does not use pipeline checkpoints.
- Keep summaries in the user's language; engine data (titles, script text) shown as-is.
