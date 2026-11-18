---
name: spec-worker
description: |
  Plan-once, render-by-worker video production. The agent turns a request into an approved requirements brief and a sealed production spec; a deterministic Gemini worker then generates, verifies and assembles the video with no further LLM calls. Use when: (1) the Studio intake has `advanced.execution_mode: "spec"`, (2) the user asks for a video "planned by Claude, made by Gemini" or wants to minimise Claude token use, (3) `/spec-reel` is invoked, (4) continuing a project that already has `artifacts/requirements_brief.json` or `artifacts/production_spec.json`.
allowed-tools: Bash, Read, Write
metadata:
  openclaw:
    requires:
      env_any:
        - GEMINI_API_KEY
        - GOOGLE_API_KEY
---

# Spec worker — plan once, Gemini executes

You are the **only creative mind** in this run. Everything you decide is written down once, approved by the user, and executed 100% as written by a worker that has no judgement. If the spec is vague, the video is wrong. If the spec is precise, nobody needs you again until something fails.

## Hard rules

1. **Never read source code** (`lib/`, `backlot/`, `tools/`). Everything you need is in this skill and its `references/`. Reading code wastes the tokens this mode exists to save.
2. **Never open media files** (mp4, png, wav). Judge outcomes from `spec status` output only.
3. **Never write hashes.** `spec check` fills `requirements_hash` and `spec_hash`; `requirements approve` and `spec approve` stamp approvals. You only write content.
4. **Steps are approved in order, never skipped, never batched**: requirements → spec → render. A user's "go ahead" at one step does not cover the next.
5. **No substitutions.** Worker tools are exactly `gemini_omni_video`, `google_imagen`, `gemini_tts`, `google_music`, plus the two local passthroughs for the creator's own files: `provided_audio`, `provided_music`. If one is unavailable, escalate (AGENT_GUIDE "Escalate Blockers Explicitly"); do not plan around it with another vendor.
6. **One planning pass.** Write the requirements brief once and the spec once; iterate only on validator errors (max 2 rounds) or user feedback.
7. **Do not poll.** Run `render` in the background and end your turn; you are notified on exit.

## Workflow

```
S0 Preflight → S1 Requirements → [GATE 1] → S2 Spec → [GATE 2] → S3 Render (code) → S4 Deliver
                                                           ▲                          │ partial
                                                           └── S5 Recover [GATE 2'] ◄─┘
```

### S0 — Preflight (cheap)

1. Read `projects/<id>/project.json` and `projects/<id>/studio/intake.json` if present. The intake is the brief: do not re-ask what it answers (AGENT_GUIDE "Projects Created in Studio"). Do not edit `studio/*`.
2. Run the registry preflight from AGENT_GUIDE (`provider_menu_summary()`); confirm the four worker tools are available and `ffmpeg` exists. Missing key/tool → structured blocker, stop.
3. Tell the user which mode this is, in one sentence: "Spec mode: I plan everything once; Gemini executes it; you approve at two points."

### S1 — Requirements (every request, small or large)

Read `references/requirements-stage.md`. Write `projects/<id>/artifacts/requirements_brief.json` with: the request verbatim, summary, constraints, **goals** (with success checks), **non-goals**, **viewer scenarios**, assumptions, open questions (each with a default), **inputs** the creator must or may supply (language, voice, recording, line, character image, music, subtitles, logo — see `references/requirements-stage.md`), and **improvements** (each with cost delta, risk, and exactly one-or-more marked `recommended` with rationale). Depth scales with the request; the sections never disappear.

Run `python -m backlot requirements check <id>`; fix errors (max 2 rounds).

**GATE 1.** Studio project (has `studio/intake.json`): the browser already shows the brief with its questions and improvement checkboxes. Tell the user in one or two lines to review it in Studio (or reply here), then wait per "Waiting at a gate" below with stage `requirements`. Chat project: present, in the user's language and in this order: summary → goals → non-goals → scenarios → assumptions → open questions (with defaults) → improvements as a short list marked **Recommended** where applicable, with cost delta. Ask the user to (a) correct anything, (b) answer questions or accept defaults, (c) pick improvements. **End your turn.**

On approval (chat reply, or a Studio decision whose `spec.selected_improvements` / `spec.answers` carry the picks) run `python -m backlot requirements approve <id> --improvements i1,i3 --answer q1="…"`. On "revise", edit the brief (never the approval block), re-check, re-present only what changed.

### S2 — Spec

Read `references/spec-format.md`, `references/planning-rules.md`, `references/acceptance-and-retry.md` and, before writing any visual prompt, `.agents/skills/gemini-omni/SKILL.md`. Write `artifacts/production_spec.json` implementing the **approved** brief exactly: every goal served by at least one scene (`serves`), exactly the selected improvements in `applied_improvements`, `must_include` phrases present and `avoid` phrases absent in the script, duration/aspect/language/budget within the constraints, answers to open questions applied.

Run `python -m backlot spec check <id>`. It validates, fills hashes, seals and records history. On errors the file is left untouched: fix and rerun (max 2 rounds; then report the remaining errors to the user).

**GATE 2.** Studio project: tell the user to review the spec in Studio (or reply here) and wait with stage `spec` (`spec_recovery` when this is a recovery re-approval). Chat project: present a compact summary, never the raw JSON: script by scene with timing, per-scene shot idea, job counts by tool, estimated cost vs cap, which goals each scene serves, which improvements are applied, and any trade-off you made. List what the check enforced ("narration verbatim, subtitles from script, Gemini-only tools"). **End your turn.**

On approval run `python -m backlot spec approve <id>`. For a Studio project, stop there and tell the user to press **Render** in Studio (Studio starts the same worker; do not also run `render`, two runs would collide). For a chat project, continue to S3. On "revise": edit the spec, `spec check` again (this clears the old approval), present only the diff.

### S3 — Render (code, no Claude)

Run `python -m backlot render <id>` in the background and end your turn. It generates every job with Gemini, verifies each against the spec's acceptance checks, retries via the spec's own ladder, then assembles `renders/final.mp4`. Refused with exit 7 unless the current `spec_hash` is approved.

### S4 — Deliver

`python -m backlot spec status <id>`. Report: output path, duration, cost, any warnings (e.g. subtitles soft-embedded because ffmpeg lacks libass), anything adjusted (`timing_adjustments`). Keep it short.

### S5 — Recover

Only when `spec status` shows failed jobs or `render` exited non-zero. Read `references/recovery.md`. Never regenerate passed jobs; never change script or scenes without a user-requested revise; infrastructure/budget failures are escalated, not replanned. After editing the failed jobs, `spec check`, show the user the changed jobs only (**GATE 2'**), `spec approve`, then `render` again — passed jobs are skipped automatically.

## Waiting at a gate (Studio projects)

Studio writes the user's answer to `studio/decisions/*.json`. Run, in the background, `python -m backlot await-decision <id> <stage> --timeout 1800` (stage = `requirements`, `spec` or `spec_recovery`) and end your turn; you are re-invoked when it exits.

- Exit 0: it printed the decision. `action` = `approve` → run the approve command (picks come from `spec.selected_improvements` / `spec.answers`); `revise` → edit per `notes`, re-check, wait again; `abort` → stop and say so. Then `python -m backlot consume-decision <id> <decision id>`.
- Exit 2 (timeout): tell the user you are waiting in Studio or chat; do not poll.
- If the user answers in chat first, apply that and ignore the later decision (it goes stale on its own once the file changes).
- Never edit `studio/*`.

## Presenting at gates

- Plain language, user's language. Engine words (spec_hash, ladder) only in parentheses.
- Always show cost and what changes if they say no.
- Offer a recommendation; never leave the user with a bare list.
- Studio users answer in the browser; chat users answer here; apply either exactly the same way. See `references/studio-contract.md` for the file contract both channels share.

## References

| File | Read when |
|---|---|
| `references/requirements-stage.md` | S1 |
| `references/spec-format.md` | S2 (field meanings, example) |
| `references/planning-rules.md` | S2 (script, scenes, jobs, Gemini limits) |
| `references/acceptance-and-retry.md` | S2 (questions, ladders, fallbacks) |
| `references/recovery.md` | S5 |
| `references/cli.md` | any command or exit code |
| `references/studio-contract.md` | working with a Studio project |
