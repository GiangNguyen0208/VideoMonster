# Phase 5 — Studio integration

**Goal.** Studio shows the same ordered steps as the agent workflow and lets the user answer each gate in the browser. Studio never runs the gates or edits the artifacts; it reads disk, writes decision files, and (for render) starts the worker CLI as a job.

Read first: `.agents/skills/spec-worker/references/studio-contract.md` (the shared file contract), `docs/ui-plan/STATUS.md` (rules + code map), `docs/ui-plan/03-architecture.md`.

## Scope

### 1. Backend (`backlot/studio_spec.py`, new v1 module — add to `V1_MODULES` in the store contract test)

| Route | Behaviour |
|---|---|
| `GET /api/v1/projects/{id}/spec-flow` | Derived state of the stepper (requirements pending/approved, spec drafted/sealed/approved, render state, delivered) from the files in the contract; plus the three artifacts' summaries |
| `GET /api/v1/projects/{id}/requirements` | The brief (as stored) + lint result |
| `POST /api/v1/projects/{id}/requirements/decision` | Body `{action: approve|revise|abort, notes, selected_improvements[], answers{}}` → writes `studio/decisions/<id>.json` (`studio.decision/1`, stage `requirements`). Validates ids against the brief; 409 `step_out_of_order` if not the current step |
| `GET /api/v1/projects/{id}/spec` | Sealed spec rendered for review (scenes, jobs, cost, goals served) + `approved` flag |
| `POST /api/v1/projects/{id}/spec/decision` | Same shape, stage `spec` or `spec_recovery`; 409 `spec_changed` when the hash moved since the page loaded |
| `POST /api/v1/projects/{id}/render` | Starts a `render` job (`studio_jobs`) running the same code path as the CLI; 409 `spec_not_approved`; needs the Gemini key (`gemini_key_missing`) |
| `GET /api/v1/projects/{id}/render` | Live progress (job statuses, attempts, scores, cost) + final result |

- `backlot/studio_decisions.py` (`pending_for`, `await-decision`) learns the stages `requirements`, `spec`, `spec_recovery`; gates are derived from content hashes (no `gate.json`, no `spec gate` CLI): the gate token is the brief hash / `spec_hash`, so a decision against an older version is stale by construction.
- Wizard: `advanced.execution_mode: "spec"` accepted by the catalog validation; kickoff command becomes `claude "/spec-reel Continue Studio project <id>"`.
- Writes need `X-Studio-Token`; errors `{detail, code}`; `project_access("edit")`; no direct filesystem access in the module (store seam). Add a store method that returns the project root for the worker job (hosted store: working copy).
- Setup center / settings: probe the Gemini key; settings keys `worker.max_parallel`, `verifier.vision_model`, optional strict speech check.
- Never expose keys.

### 2. Frontend (`studio/src`)
- Project page stepper: **Requirements → Spec → Render → Result**; later steps disabled until the earlier one is approved.
- Requirements panel: summary, goals, non-goals, scenarios, assumptions, question inputs (defaults prefilled), improvement checkboxes with cost/risk/**Recommended**, running cost, Approve / Request changes / Stop.
- Spec panel: script by scene with timings, shot idea and goals served, job table (tool, prompt, acceptance questions, est. cost), total vs cap, applied improvements, Approve / Request changes.
- Render panel: per-job chips, attempts, vision scores, cost, thumbnails; recovery view shows changed jobs old vs new and asks re-approval.
- All strings in `en.ts` and `vi.ts`, parity test green, ≥ 1 Vitest in Vietnamese; error codes translated: `step_out_of_order`, `spec_changed`, `spec_not_approved`, `gemini_key_missing`, `budget_blocked`.

### 3. Docs
`AGENT_GUIDE.md` (Studio decisions for the new stages), `docs/ui-plan/03-architecture.md` (the render job is the one place Studio starts the worker; it still never writes agent artifacts), `04-ui-flows.md` (new use cases + sequence diagram), ui-plan `STATUS.md`.

## Acceptance
- API tests (TestClient): each route, auth, ordering (409s), decision file contents, render refusal when unapproved or hash changed.
- Contract tests: store seam, i18n parity; Vitest for the panels.
- Browser run (see memory notes on the cached Chromium path): wizard → agent writes brief (fixture) → approve picks → fixture spec → approve → stubbed worker renders → result player.

## Notes
- The stepper must read the *same* derived states the skill documents; if either changes, change both (and `studio-contract.md`).
