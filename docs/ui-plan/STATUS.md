# Studio UI — Phase Status

**Agents: read this file before working on Studio.** Pick up the first phase that is not `done`,
then read its spec in `phases/`. Update this file whenever you change a phase's state, finish a
checklist item, or leave work half-done: future sessions rely on it to resume.

Status values: `not started` · `in progress` · `blocked` · `done`

| Phase | Name | Status | Last update |
|---|---|---|---|
| 0 | [Foundation](phases/phase-0-foundation.md) | done | 2026-11-10 |
| 1 | [Read-only parity](phases/phase-1-read-only-parity.md) | done | 2026-11-10 |
| 2 | [Setup center](phases/phase-2-setup-center.md) | done | 2026-11-10 |
| 3 | [New video wizard](phases/phase-3-new-video-wizard.md) | done | 2026-11-10 |
| L10n | Localization: Vietnamese (`vi`) for phases 0–3, plus the i18n rule for 4–7 | done | 2026-11-10 |
| 4 | [Review & approve](phases/phase-4-review-and-approve.md) | done | 2026-11-10 |
| 5 | [Footage & references](phases/phase-5-footage-and-references.md) | done | 2026-11-10 |
| 6 | [Results & cost](phases/phase-6-results-and-cost.md) | done | 2026-11-11 |
| 7 | [Hosted readiness](phases/phase-7-hosted-readiness.md) | done | 2026-11-11 |
| 7.1 | [Review hardening](#phase-71--review-hardening--done) (follow-up to the Phase 7 code review) | done | 2026-11-11 |
| D | [Design refresh via Stitch](#phase-d--design-refresh-via-google-stitch--done) | done (D.1–D.11; backend placeholders E-1…E-27 open) | 2026-11-11 |

## Resume here — snapshot 2026-11-11

**Where things stand**
- **Done:** every planned phase (0–7) and cross-cutting Localization (en + vi). Each phase section below has its checklist, deviations and verification notes.
- **Also done: Phase 7.1 — Review hardening** (section at the end of this file): fixes from the Phase 7 code review (store path safety, consume race, API robustness, stricter contract scanner).
- **Done: Phase D** (design refresh via Google Stitch, section at the end of this file). Plan: `design/ui-refresh.md`. Open: the backlog E-1…E-27 (placeholders awaiting a backend phase E, start only on request) and nothing is committed yet.
  - The local Studio is complete.
  - Hosted Studio is designed in `hosted/` (`design.md`, `sync-protocol.md`, `threat-model.md`). It needs a maintainer review (checklist in `hosted/threat-model.md` §5) before migration step H1 (`hosted/design.md` §9) starts.
  - Do not start hosted work, or any new phase, unless the user asks. Add a new row to the table above first.
- **Git:** Phases 0–7.1 are committed on the current feature branch (`git branch --show-current`), not on `main`; the latest is `a29e00f feat(studio): add results, cost, settings, and hosted-readiness work`. The user commits only on request, so don't commit unprompted. `config.yaml` is *not* modified; real-server checks back it up and restore it after saving settings.
- **Docs:** `04-ui-flows.md` (added 2026-11-11) describes the as-built UI. It covers 17 use cases with their API calls and errors, plus sequence diagrams, flowcharts and state diagrams; all 18 Mermaid blocks render. Update it when a screen, route or error code changes.

**Rules every phase follows**
1. **Studio is a companion to the agent CLI.** It writes *intent* files under `projects/<id>/studio/` and media under `projects/<id>/inputs/`. It never writes checkpoints or agent artifacts (`03-architecture.md` §1, §3.4).
2. **Every UI string exists in both `studio/src/i18n/en.ts` and `vi.ts`.** The parity test enforces it. At least one Vitest test per phase runs in Vietnamese. Engine data (titles, scripts, file names) is shown as-is.
3. **API errors the UI explains** come back as `{detail, code}`, and the UI translates `code`.
4. **Each `/api/v1` write needs `X-Studio-Token`.** The client (`services/http.ts`, `sendFile` in `services/uploads.ts`) adds it.
5. **No direct filesystem access in v1 modules.**
   - Project files go through `ProjectStore` / `ProjectFiles` (`backlot/project_store.py`).
   - Machine files go through `backlot/machine_store.py`.
   - Project routes get their `ProjectFiles` from `project_access("view"|"edit")`.
   - `tests/contracts/test_studio_store_contract.py` fails otherwise.
6. **When agent behaviour changes,** update `AGENT_GUIDE.md` "Projects Created in Studio" and add or extend a test in `tests/contracts/test_studio_wizard_contract.py`.
7. **Docs are in English.** Update this file and the phase spec's "Implementation notes" before reporting a phase done.

**Code map**

| Area | Where |
|---|---|
| Server entry, read API, SSE, `/media`, `/studio` static | `backlot/server.py`, `backlot/state.py` (board state; `ARTIFACT_FILES` lists the artifacts Studio sees) |
| Write API router (all `/api/v1` routes, feature flags) | `backlot/studio_api.py` |
| Storage seams (Phase 7) | `backlot/project_store.py` (`ProjectStore`, `ProjectFiles`, `DiskProjectStore`, `ObjectProjectStore` stub, shared atomic/stream helpers); `backlot/machine_store.py` (`config.yaml`, `.env`, `music_library/`, demos, ffprobe) |
| Auth seams (Phase 7) | `current_user`, `authorize`, `project_access` in `backlot/studio_api.py` |
| Hosted design (Phase 7) | `docs/ui-plan/hosted/design.md`, `docs/ui-plan/hosted/sync-protocol.md`, `docs/ui-plan/hosted/threat-model.md` |
| Setup center (Phase 2) | `backlot/setup_probe.py`, `backlot/studio_setup.py`, `backlot/studio_jobs.py` |
| Catalog, intake, kickoff, demos (Phase 3) | `backlot/studio_catalog.py` |
| Review decisions (Phase 4) | `backlot/studio_decisions.py`; agent CLI `await-decision` / `consume-decision` in `backlot/__main__.py` |
| Uploads, references, music library (Phase 5) | `backlot/studio_uploads.py` |
| Results and export, cost, settings (Phase 6) | `backlot/studio_results.py`, `backlot/studio_cost.py`, `backlot/studio_settings.py`; `?download=1` on `/media` in `backlot/server.py` |
| Frontend API layer | `studio/src/services/` (HTTP + `endpoints.ts`), `studio/src/hooks/api/` (React Query hooks, `queryKeys.ts`, `useSSE`), `studio/src/types/api/` (wire types) — since D.5.1 |
| Pages | `studio/src/routes/` (`home`, `library`, `project`, `setup`, `settings`, `new/` wizard) |
| Features | `studio/src/features/{library,project,setup,demos,review,uploads,music,result,cost,settings}` |
| Formatting (locale-aware money, sizes, times) | `studio/src/lib/format.ts` (+ `format.test.ts`) |
| Goals → pipelines, footage needs | `studio/src/content/goals.ts`; labels in `content/labels.ts` |
| i18n | `studio/src/i18n/` (`en.ts` source, `vi.ts`, `index.ts` store and hooks) |
| UI primitives | `studio/src/components/ui/` |
| Agent instructions | `AGENT_GUIDE.md` "Projects Created in Studio", `skills/meta/checkpoint-protocol.md` Step 5.7, `.claude/commands/reel.md` step 0, `.claude/commands/studio-continue.md` |
| Python tests | `tests/backlot/test_studio_{api,setup,catalog,decisions,uploads,results_cost}.py`, `tests/backlot/test_project_store.py`, `tests/contracts/test_studio_wizard_contract.py`, `tests/contracts/test_studio_store_contract.py` |
| UI tests | `studio/src/**/*.test.ts(x)`; helpers in `studio/src/test/` (`setup.ts` resets locale, session and the upload queue) |

**Studio ↔ agent files** (schemas in `03-architecture.md` §3)

| File | Written by | Read by | Since |
|---|---|---|---|
| `projects/<id>/studio/intake.json` (`studio.intake/1`) | wizard; editable until the first checkpoint | agent at kickoff | Phase 3 |
| `projects/<id>/studio/decisions/<id>.json` (`studio.decision/1`); renamed `<id>.consumed.json` | review panel | agent at each gate (`await-decision`, then `consume-decision`) | Phase 4 |
| `projects/<id>/studio/inputs.json` (`studio.inputs/1`) + `projects/<id>/inputs/*` | uploads and reference links | agent at kickoff (source media, reference analysis) | Phase 5 |
| `music_library/*` (or `MUSIC_LIBRARY_DIR`) | music picker uploads | agent music step (`tools/audio/music_library.py`) | Phase 5 |
| `projects/<id>/artifacts/video_analysis_brief.json` | agent | review panel ("What the agent learned") | Phase 5 |
| `config.yaml` (allowlisted keys only) | Settings page | agent at the start of each production (`OpenMontageConfig.load()`) | Phase 6 |
| `projects/<id>/cost_log.json`, `renders/`, `artifacts/{render_report,publish_log}.json` | agent | cost panel, results panel, export download (read-only) | Phase 6 |

**Open items**
- **Not yet verified with a live agent.** Each needs a real agent session; the API side of each is covered by tests and real-server checks.
  - Phase 3: a kickoff run where the brief is not re-asked
  - Phase 4: a full run approved only from Studio, and a mixed chat/Studio run
  - Phase 5: a footage-led run using the uploaded file, and a "make something like this" run showing the analysis
  - Phase 6: an agent run that picks up changed settings and writes a real `cost_log.json`, `render_report` and export
  - Phase 7: maintainer review of the hosted design docs (required before any hosted code)
- **Backlog / known gaps:**
  - No edit-brief screen (`PATCH /intake` exists).
  - No voice picker at the proposal review.
  - Wizard uploads queued in the tab are lost if it is closed mid-upload.
  - The JS bundle is ~650 kB (Vite warns above 500 kB); lazy-load routes in a later phase.
  - Cost stage attribution is inferred from checkpoint times, because `cost_log.json` has no stage field. A `stage` field in `tools/cost_tracker.py` entries would make it exact.
  - The classic board is not localized.

**Environment quirks (this machine)**
- **Python:** there is no `python` binary. Use `.venv/bin/python` or `make` targets.
- **Restarting the server:**
  1. Find the process: `lsof -tiTCP:4750 -sTCP:LISTEN`.
  2. Kill that PID. `pkill -f "backlot serve"` does not always match it.
  3. Start it again: `.venv/bin/python -m backlot serve`, or `make studio-open`.
  4. Run `make studio-build` first so `/studio` serves the latest UI.
- **Playwright:** use the cached Chromium at `~/Library/Caches/ms-playwright/chromium-1228/…`. A scratch install with past check scripts lives in `/tmp/pwshot` (`p5.mjs` and `p6.mjs` are the Phase 5 and 6 runs; `p6-fixture.sh` builds the project `p6.mjs` expects, then delete `projects/studio-p6-e2e`; back up `config.yaml` before `p6.mjs`, because it saves settings).
- **Test output:** the `rtk` wrapper rewrites test output. Use `rtk proxy npx vitest run` for raw Vitest output. `studio/.vitest/` is ignored.
- **Secrets:** do not read `.env` or `.env.example` values.

## How to verify (any phase)

```bash
.venv/bin/python -m pytest tests/backlot tests/contracts -q        # Python (1763 passed, 10 skipped at Phase 7)
make studio-check                                                 # UI: lint, typecheck, format, unit tests (97), build
make studio-build && make studio-open                             # manual check at http://127.0.0.1:4750/studio
```

---

## Phase 0 — Foundation · done

- [x] `studio/` scaffold: Vite 8, React 19, TypeScript, Tailwind v4, React Router, TanStack Query, RHF + Zod, ESLint, Prettier, Vitest
- [x] Design tokens from `backlot/ui/board.css` in `studio/src/index.css` (`@theme`), light/dark synced through `localStorage["backlot.theme"]`
- [x] UI primitives in `studio/src/components/ui/` (Button, Card, Badge, Banner, Dialog/Drawer, Tabs, EmptyState, Spinner, StepStatus)
- [x] App shell, router, error boundary, 404, placeholder pages
- [x] Backlot serves `studio/dist` at `/studio` with SPA fallback; 503 page when not built (`backlot/server.py`)
- [x] `backlot/studio_api.py`: `/api/v1/session`, CSRF guard (`X-Studio-Token` + local Origin) on all non-GET `/api/v1/*`, `current_user` seam
- [x] `backlot/project_store.py`: `ProjectStore` protocol + `DiskProjectStore` (atomic JSON writes, path-escape guard)
- [x] `studio/src/lib/api`: token-aware client, `useSSE` hook
- [x] `python -m backlot open --studio`; Makefile `studio-*` targets; CI job "Validate Studio UI"
- [x] Tests: `tests/backlot/test_studio_api.py`, Vitest suites under `studio/src/**`

Notes and deviations:
- Uses React 19 and Tailwind v4 (latest at implementation time); the docs were updated to match.
- Tailwind tokens are defined in CSS (`@theme inline`), so there is no `tailwind.config.ts`.

## Phase 1 — Read-only parity · done

- [x] Typed models (`studio/src/lib/api/types.ts`) and live queries `useProjects` / `useProject` (`queries.ts`, SSE-invalidated)
- [x] Adapters in `studio/src/features/project/adapters.ts`: status derivation (waiting / failed / stalled / working / paused / done / empty), progress, decision-log collapse, activity lines
- [x] Plain-language labels in `studio/src/content/labels.ts` (step names, video-type names)
- [x] Home: "Waiting for you" banner + sections Waiting / Needs attention / In progress / Recent results, first-run empty state
- [x] Library: cards (poster, type, status, progress, cost, live), search, status filter, type filter, series grouping; filters stored in the URL
- [x] Project page: header, status banner, step timeline with review-point markers, result player, tabs (Research/Brief, Concept & plan, Script, Storyboard, Decisions, Activity); opens the tab of the step under review; read-only "reply in your agent chat" notice
- [x] Live updates over library and project SSE
- [x] Classic board ↔ Studio links (`backlot/ui/board.js`, `backlot/ui/index.html`)
- [x] Tests: adapters, filters, page tests on a fixture captured from `scripts/backlot_simulate_run.py`, live-update tests; Python tests for the new summary fields

Notes:
- `summarize_project` (`backlot/state.py`) gained additive fields `stalled`, `failed`, `latest_render`, `cost_usd`, also present in the unreadable-project fallbacks.
- Fixtures `studio/src/test/fixtures/*.json` come from the simulate-run project. Regenerate them if the board-state shape changes.
- Verified against the real server with Playwright, using the cached Chromium in `~/Library/Caches/ms-playwright/chromium-1228`:
  - pages render with no errors;
  - there is no horizontal overflow at 375 px;
  - the Library goes live through working → waiting → paused → video ready during a simulated run.
- Known, pre-existing: the classic board requests `/favicon.ico`, which returns 404. It is harmless and not caused by Studio.

## Phase 2 — Setup center · done

- [x] `backlot/setup_probe.py`: a subprocess capability probe that prints JSON (provider summary, per-tool facts, per-video-type coverage)
- [x] `backlot/studio_setup.py`:
  - tier computation (onboarding tiers)
  - video-type states `ready` / `limited` / `locked`
  - unlock offers grouped per env var, ranked by video types unlocked, then improved
  - masked key status
  - atomic `.env` writer that preserves comments, order and other keys, writes mode 600, and removes a key when given an empty value
- [x] `backlot/studio_jobs.py`: in-process job table (dedupes running jobs of the same kind); `GET /api/v1/jobs/{id}`
- [x] API routes:
  - `GET /api/v1/setup` returns 202 with a job while the first check runs
  - `POST /api/v1/setup/recheck`
  - `PUT /api/v1/setup/env`: allowlisted keys, values never echoed, 403 with `STUDIO_READONLY_ENV=1`, 409 before the first check
- [x] Setup page:
  - tier card
  - verbatim warnings
  - works-now list (headline capabilities first)
  - video-type list with an Unlock anchor
  - top-3 unlock cards (plain-language title, unlock/improve chips, sign-up link, masked "Save and check" form)
  - "All providers" and "Hardware unlocks" drawers
- [x] Home "You're on free, local tools — Unlock more" nudge for zero-key machines (dismissible)
- [x] Tests: `tests/backlot/test_studio_setup.py` (26), Vitest `routes/setup.test.tsx` and `features/setup/UnlockCard.test.tsx`

Notes and deviations:
- **Key allowlist.** The spec said "keys listed in `.env.example`". The implementation instead allowlists every `env:` dependency declared by a registered tool, which is derived from the registry and so can't drift from the tools. It also avoids reading example env files.
- **Probe PATH fix.** The probe prepends `dirname(sys.executable)` to PATH. When the server runs as `.venv/bin/python` without an activated venv, `piper` and other console scripts are otherwise invisible, and Voice-over wrongly showed as unavailable (tts 0/19).
  - The same gap affects agents that run tools without activating the venv. The tools themselves were left unchanged.
- **Video-type states.** "Locked" means a required tool's capability is missing. "Limited" means a headline optional capability is missing (images, video, voice, music, avatar, sound effects). Other optional gaps, such as 3D, are not shown.
- **Verification.** The real server (Playwright, no real key entered) reports tier Zero-key with Voice-over (Piper) listed. "Explain a topic" is locked (needs AI images); the other 11 types work, and clip-factory is fully ready. There is no overflow at 375 px and no console errors. The probe takes about 6–10 s.

## Phase 3 — New video wizard · done

- [x] 3.1 Catalog APIs in `backlot/studio_catalog.py`:
  - `GET /api/v1/pipelines`: 12 user-facing manifests with stages and review flags, reference support, playbooks, production modes and default budget, merged with the Setup lock state (`availability`, `checked`). The first call starts the capability check.
  - `GET /api/v1/styles`: presets and custom playbooks, with palette swatches.
- [x] 3.2 `studio/src/content/goals.ts`: 12 goals, each with a preset and example topics from `PROMPT_GALLERY.md`, plus the `like-this` entry.
- [x] 3.3 Wizard `/studio/new` (`studio/src/routes/new/`), 4 steps; step held in `?step=`; RHF + Zod (`wizard.ts`):
  1. Goal cards with Ready / Works now / Locked badges. Locked cards link to Setup.
  2. Brief, adapted per goal: example chips, platform (sets aspect), length, tone, and production mode for screen-demo. *Advanced:* must include, avoid, language.
  3. Style cards filtered by `compatible_playbooks`. Budget shows "Free — runs locally" on Zero-key. *Advanced:* runtime preference, look, review points.
  4. Review with a "Change" link per row and an editable title.
- [x] 3.4 Project and intake endpoints:
  - `POST /api/v1/projects` validates (Pydantic `IntakeIn` plus catalog checks), picks a unique id (word-boundary slug plus 4 hex characters), runs `init_project`, and writes `studio/intake.json`. It never writes checkpoints. Returns 409 for locked types and 422 for an unknown type, style or mode.
  - `GET/PATCH /api/v1/projects/{id}/intake`: editable until the first checkpoint exists; the type is fixed.
- [x] 3.5 `GET /api/v1/projects/{id}/kickoff`. The project page shows "Waiting for the agent to start…" and the *Start your agent* panel (`features/project/KickoffPanel.tsx`) until the agent writes something.
- [x] 3.6 Agent contract part 1:
  - `AGENT_GUIDE.md` gained the "Projects Created in Studio" section.
  - Step 0 in `.claude/commands/reel.md`.
  - One line each in `CODEX.md`, `CURSOR.md`, `COPILOT.md`, `AGENTS.md` and `.windsurfrules`.
- [x] 3.7 Demos:
  - `GET /api/v1/demos` and `POST /api/v1/demos/{name}/render`. The job reports progress parsed from Remotion output; `progress` and `output` were added to `Job`.
  - Home "Try a demo" cards (`features/demos/DemoCards.tsx`) with progress bar and player.
- [x] Tests:
  - `tests/backlot/test_studio_catalog.py` (35)
  - `tests/contracts/test_studio_wizard_contract.py`: catalog, goals and agent entry points stay in sync
  - Vitest: `routes/new/new.test.tsx`, `routes/new/wizard.test.ts`, `features/demos/DemoCards.test.tsx` (64 total)

Notes and deviations:
- **Wizard flow.** Kickoff is shown on the project page rather than on a separate wizard screen, so "start your agent" and "watch it here" are the same page. See "Implementation notes" in the phase spec.
- **Intake shape.** It gained `title`, `updated_at`, `advanced.checkpoint_policy` and `advanced.production_mode`. `platform` values are `youtube` / `shorts` / `linkedin` / `other`. `03-architecture.md` §3.1 is updated.
- **No intake edit UI yet.** `PATCH` exists; an "edit brief" screen is still in the backlog.
- **Superseded by Phase 5:** the wizard now has a dynamic step list (`stepsFor()` in `wizard.ts`). Footage goals get an "Add your footage" step after the goal. `?step=` holds the step key (`goal|footage|brief|look|review`), not a number. screen-demo's production mode moved from the brief step to the footage step.
- **Bundle size.** The production bundle was about 550 kB at Phase 3 and ~630 kB at Phase 5 (Vite warns at 500 kB). Lazy-load routes if it grows.
- **`.vitest/`** (JSON reports written by the `rtk` wrapper) is git- and prettier-ignored.
- **Verification on the real server (Playwright):**
  - Goal → Create took about 18 s, with no console errors and no overflow at 375 px. "Explain a topic" is shown as locked on this Zero-key machine.
  - The test project was deleted afterwards.
  - A real demo render (`animated-reel-20s`) from the browser took about 185 s; progress went 0→96 % and the video plays.
- **Not yet verified:** a manual end-to-end agent run from the kickoff command (acceptance: the brief is not re-asked, on `animated-explainer` and `screen-demo`). It needs a real agent session. `animated-explainer` is locked here without an image key.

## Localization (vi) — cross-cutting · done

Requested before Phase 4: Studio UI in English and Vietnamese for everything shipped in Phases 0–3, and every later phase spec must include localization. The rules are in `03-architecture.md` §8.

- [x] **i18n core** (`studio/src/i18n/`), no new dependency:
  - typed catalogs: `en.ts` is the source; `vi.ts` is typed as `Messages`
  - locale store: `localStorage["studio.locale"]`, browser-language default, `<html lang>`, cross-tab sync
  - `useT()` for components, `msg()` for helpers
- [x] **Language picker** (`app/LanguageSelect.tsx`) in the header (EN/VI) and on Settings. Settings is now a real page; its other sections arrive in Phase 6.
- [x] **Phase 0 strings:** shell, nav, theme toggle, skip link, error boundary, 404, placeholder, server-down, spinner and dialog defaults.
- [x] **Phase 1 strings:**
  - Home, Library (filters now ids plus catalog labels), project card, Project page, banners
  - step and status labels (`stepLabels.ts` → `STEP_TONES` + `stepLabel()`), activity lines, decisions
  - brief, concept, script, storyboard and result views; relative time (`fmtAgo`, `fmtClock`)
- [x] **Phase 2 strings:**
  - Setup page; tiers are translated on the client by tier id, falling back to the server label
  - capability and video-type names, video-type states, unlock cards, key form, Home nudge
- [x] **Phase 3 strings:**
  - goal titles, promises and examples moved from `goals.ts` into the catalogs (`goalText()`)
  - tone ids (`toneLabel()`); platform names; wizard steps
  - Zod error keys (`errorText()`); review rows; kickoff panel (notes by agent id); demo cards
- [x] **Tests:**
  - `src/i18n/i18n.test.tsx`: key parity incl. label maps, no empty strings, locale store, browser detection, header switch, full wizard in Vietnamese, cross-tab change
  - existing suites run in `en` (`test/setup.ts` resets the locale)
  - 72 Vitest tests
- [x] **Docs:** `03-architecture.md` §8 Localization, plus a Localization section in each Phase 4–7 spec (4.5 in Phase 4).

Notes and decisions:
- **Agent-facing data stays neutral.**
  - `intake.json` gets English tone labels whatever the UI language (`toneForIntake`).
  - `language` (narration) defaults to the UI locale (`vi` → `vi`).
  - The kickoff command stays English. The user's free text is stored as typed.
- **Not translated (data):** project content, registry install hints and runtime warnings, playbook descriptions, demo titles, API `detail` strings. The exception is 409 on create, which maps to `wizard.lockedError`.
- **Verified on the real server** with Playwright in a `vi-VN` browser:
  - every page renders in Vietnamese with `lang=vi`
  - no overflow at 375 px
  - the only console errors are the expected `/kickoff` 404s on a project not created in Studio (pre-existing, handled)
- The classic Backlot board (`backlot/ui/`) was not localized; it is outside Studio.

## Phase 4 — Review & approve · done

- [x] 4.1 Decision API (`backlot/studio_decisions.py`):
  - `POST`, `GET` and `DELETE /api/v1/projects/{id}/decisions`
  - validation: the checkpoint must be `awaiting_human` with a matching timestamp; revise needs notes; the concept must exist; the runtime must be available; one decision per review
  - errors are returned as `{detail, code}`
- [x] 4.2 Review panel (`studio/src/features/review/`):
  - shown on the project page when a step is waiting
  - shows the agent's self-review and the cost so far
  - proposal picker: concept, budget, Remotion and HyperFrames side by side with the agent's rationale and machine availability, look, music
  - script: per-section comments
  - actions: approve, request changes (notes required), stop (confirmation)
  - states: sent (with Retract and a `/studio-continue` fallback command) → applying → next step, live over SSE
  - opt-in browser notification
- [x] 4.3 Agent contract part 2:
  - `AGENT_GUIDE.md` "Review points answered in Studio"
  - `skills/meta/checkpoint-protocol.md` Step 5.7
  - `python -m backlot await-decision` / `consume-decision`
  - `.claude/commands/studio-continue.md`
- [x] 4.4 Chat approvals: a pending decision whose checkpoint moved on is reported `stale` and ignored by the agent; the panel says when the step changed since the last answer
- [x] 4.5 Localization: all review strings in `en` + `vi`, error codes translated, notes stored verbatim
- [x] Tests:
  - `tests/backlot/test_studio_decisions.py` (17): validation matrix, lifecycle, chat or revise makes a decision stale, CLI wait/timeout/late arrival/consume, decision log with `source: "studio"`
  - contract test for the agent instructions
  - Vitest `features/review/ReviewPanel.test.tsx` (10, incl. Vietnamese); 82 total

Notes and deviations:
- **New CLI `consume-decision`.** It was added so the agent marks a decision applied with one command instead of renaming files.
- **Schema change:** `schemas/artifacts/decision_log.schema.json` gained an optional `source` (`agent` | `chat` | `studio`). `additionalProperties: false` previously rejected the `source: "studio"` the spec requires.
- **Panel scope.**
  - For scene_plan, assets, character_design, edit and publish, the panel shows the actions and points at the tab that already renders the step (storyboard/filmstrip, result player). It does not duplicate those views.
  - There is no voice picker yet; voice stays with the agent's proposal.
- **Docs fix.** `phases/phase-7-hosted-readiness.md` no longer cites not-yet-existing `docs/ui-plan/hosted/*.md` as backticked paths; `tests/contracts/test_skill_reference_paths.py` flagged it.
- **Verified on the real server** with Playwright and the CLI as the "agent":
  - Proposal approved in Studio wrote exactly one file; `await-decision` returned it.
  - After `consume-decision`, the page showed "applying" live, then the script review appeared.
  - A revise request in Vietnamese reached the agent verbatim.
  - The rewritten checkpoint showed the "step changed" notice; `history/` kept old versions; `decision_log` got `source: "studio"`.
  - No console errors, no overflow at 375 px. The test project was deleted.
- **Not yet verified:** a full real-agent run (proposal → publish approved only from Studio) and a mixed chat/Studio run. Both need a live agent session.

## Phase 5 — Footage & references · done

- [x] 5.1 Uploads:
  - `backlot/studio_uploads.py` + routes in `studio_api.py`; `FEATURES.uploads = True`
  - raw-body streaming into `inputs/` with a partial file then rename; `STUDIO_MAX_UPLOAD_MB` (default 8192)
  - extension/MIME allowlist (415); traversal names rejected (`bad_name`); duplicate names get `-2`, `-3`
  - ffprobe metadata (duration, resolution, codec) indexed in `studio/inputs.json`
  - delete allowed only before the first checkpoint (`already_started`)
- [x] 5.2 References: `POST/DELETE /projects/{id}/references`, http(s) only, never fetched; the wizard link is copied in; reference *files* are uploads with `kind: "reference"`
- [x] 5.3 Wizard:
  - "Add your footage" step for footage goals: drag-drop, client checks (type, size, minimum length), blob preview
  - screen-demo upload vs animated terminal sets `production_mode`; localization-dub asks for target languages
  - files upload after create through an app-level queue; the project page shows progress
- [x] 5.4 Project page "Footage & links" panel: files with metadata, preview from `/media`, delete before start, upload more, reference links and reference-video upload, "still uploading" banner
- [x] 5.5 Music library:
  - `GET/POST /api/v1/music` and `/music/tracks/{name}`
  - `MusicPicker` (preview, upload) on the Look step (`intake.music_track`) and on the proposal review when "Music library" is picked (`proposal.music_track`)
- [x] 5.6 Agent contract part 3: `AGENT_GUIDE.md` "Projects Created in Studio" item 4 (inputs, references → `video_analysis_brief.json`, target languages, music track); `/reel` step 0; proposal picks list `music_track`
- [x] 5.7 Reference results: board loads `video_analysis_brief`; review panel shows "What the agent learned from your reference" at research/idea/proposal
- [x] 5.8 Localization: `uploads`, `music`, `wizard.footage`, `review.reference` in `en` + `vi`; upload error codes translated; `fmtBytes` follows the locale
- [x] Tests:
  - `tests/backlot/test_studio_uploads.py` (26): streaming (256 MB through `stream_to_folder`, peak < 8 MB), traversal/type/size/empty rejections, duplicate names, delete rules, ffprobe on a generated clip, references, wizard seeding, intake fields, music library
  - contract tests for agent instructions and footage-goal production modes
  - Vitest `features/uploads/uploads.test.tsx` (5, incl. Vietnamese) + 1 review-panel test; 88 total
  - pytest `tests/backlot` + `tests/contracts`: 1727 passed, 10 skipped

Notes and deviations:
- **Raw body, not multipart.** `python-multipart` isn't installed. A raw body is also simpler to stream and lets XHR report upload progress.
- **Upload timing.** Uploads happen *after* the project is created; the spec implied during the wizard, but a project folder is needed first. Queued files are lost if the tab is closed mid-upload; the panel shows what arrived.
- **TestClient limits.** TestClient buffers request bodies on the client, so the memory-ceiling test measures `stream_to_folder` directly. The real-server run below covers the HTTP path.
- **Verified on the real server** (Playwright, Chromium):
  - Wizard (Polish my talking video): the browser read the 6 s duration; blob preview played; after create, the file uploaded on the project page and showed `640×360`.
  - Drag-drop of a second file worked; the server preview played; delete worked.
  - **1 GB upload:** 6.2 s, progress 0 → 100 % in ~20 steps. Server RSS went from 43 MB to a 55 MB peak.
  - No console errors; no overflow at 375 px. The test project was deleted.
- **Not yet verified:**
  - a real `talking-head` / `clip-factory` agent run using the uploaded file
  - a real "make something like this" run showing the analysis at the first review point

Both need a live agent session.

## Phase 6 — Results & cost · done

- [x] 6.1 Results:
  - `backlot/studio_results.py`; `GET /projects/{id}/results`, `GET /projects/{id}/export` (zip of an export folder or the exported file)
  - `/media/...?download=1` sends an attachment
  - `features/result/ResultPanel.tsx`: player, Download, versions with label, resolution, duration, fps and size, copy-ready title, description and hashtags, export card or "ask the agent to export"
  - Home "Recent results" has Download and Open under each card (one click from Home)
- [x] 6.2 Cost:
  - `backlot/studio_cost.py`; `GET /projects/{id}/cost` (snapshot from `CostTracker`, by tool, by step, by status, entries) and `GET /cost/summary?since=`
  - `features/cost/CostPanel.tsx`: spent / reserved / remaining bar against the budget, over-budget alert, budget mode in plain words, by-tool table with "Free (local)", by-step table, status counts
  - Library header shows this month's spend
- [x] 6.3 Settings:
  - `backlot/studio_settings.py`; `GET/PUT /api/v1/settings` with an allowlist, Pydantic validation (field-level 422), in-place line edits that keep comments, round-trip check, atomic write
  - `features/settings/SettingsForm.tsx` on `/settings`: Spending (mode, budget per video, single-action limit, new paid tool) and Defaults (review points, video size, frame rate, with the engine key in a tooltip)
- [x] 6.4 Agent contract: `AGENT_GUIDE.md` infrastructure files tell the agent to build `CostTracker` from `config.yaml` and use the checkpoint and output defaults. Contract test `test_agent_instructions_read_studio_settings`.
- [x] 6.5 Localization: `result`, `cost`, `settings`, `library.monthSpend` in `en` + `vi`. `fmtMoney` uses `Intl` (`1.234,50 US$` in vi). Config values stay engine ids.
- [x] Tests:
  - `tests/backlot/test_studio_results_cost.py` (17):
    - ledger totals equal `CostTracker` for every status, plus stage attribution and broken ledgers
    - month-to-date spend
    - settings round-trip (comments kept, `OpenMontageConfig` reads it), field-level 422, missing keys and sections, token and lock
    - download header and path guard
    - results with report labels and publish text
    - export zip and outside paths ignored
    - ffprobe facts
  - Vitest `lib/format.test.ts` (2, en + vi), `features/result/results.test.tsx` (7, incl. Vietnamese); 97 total
  - pytest `tests/backlot` + `tests/contracts`: 1746 passed, 10 skipped

Notes and deviations:
- **Phase 1 component replaced.** `ResultView` was removed; `ResultPanel` replaces it.
- **Settings keys.** They are `output.default_resolution` / `output.default_fps` (the real `config.yaml` keys), with fixed choices.
- **No ruamel.** `ruamel.yaml` is not installed, so the documented line-edit fallback is used. It touches only the changed lines.
- **Stage costs are inferred** from checkpoint times; see the backlog item in "Resume here".
- **Verified on the real server** (Playwright) with a fixture project: two renders, a render report, a publish log with an export folder, and a cost ledger with every status.
  - **Home → Download** saved the latest video in one click.
  - **Versions:** listed with the TikTok label and ffprobe facts; the bundle downloaded as `<id>-export.zip` with 2 files; the player loads.
  - **Cost:** the panel showed $0.35 spent, $0.40 reserved and $1.25 remaining, equal to `CostTracker.cost_snapshot()`.
  - **Library:** showed "Spent this month: $0.35 across 1 video".
  - **Settings:** the empty amount was blocked on the client. Saving changed exactly 3 lines of `config.yaml`, and `OpenMontageConfig.load()` read the new values; the file was restored afterwards.
  - **Vietnamese:** the cost panel reads `0,35 US$ trên ngân sách 2,00 US$`.
  - No console errors; no overflow at 375 px. The fixture project was deleted.
  - **Found and fixed during this run:** a refunded paid tool was labelled "Free (local)". The API now returns an explicit `free` flag.
- **Not yet verified:** a live agent run that reads changed settings and produces a real ledger and export.

## Phase 7 — Hosted readiness · done

- [x] 7.1 Store abstraction:
  - `backlot/project_store.py` final protocol: `ProjectStore` plus the per-project `ProjectFiles` handle (JSON, stat/list, delete/rename, streamed writes, safe agent paths, local file, zip, board state); `DiskProjectStore`; `ObjectProjectStore` stub (`NotImplementedError`)
  - `backlot/machine_store.py` for machine-local resources
  - every v1 module refactored onto the two stores (decisions, uploads, results, cost, catalog, settings, setup, API, CLI); no behaviour change
- [x] 7.2 Auth seam:
  - `current_user` on the router (every route), `authorize(user, project_id, access)` + `project_access("view"|"edit")` on every project route; forbidden = unknown (404)
  - OIDC, sessions, tenancy, roles, session-bound CSRF, configurable hosts specified in `hosted/design.md` §2
- [x] 7.3 Sync connector spec: `hosted/sync-protocol.md`
  - 18 file classes with owner, direction and conflict rule, reviewed against `03-architecture.md` §3
  - pairing, change feed, resumable content-addressed pushes, decision signing/stale/retract/consume, ordering, lifecycle, offline, capability report, channel security
- [x] 7.4 Threat model: `hosted/threat-model.md`. 18 risks (incl. every risk named in the spec), each with a mitigation, its status today and an owner (shipped phase or hosted step H1–H7); residual risks; review checklist.
- [x] 7.5 Operational notes: `hosted/design.md` §6 (no server jobs) and §7 (quotas, retention, observability, backups)
- [x] 7.6 Localization (design): per-user locale on the profile, hosted error codes, new screens in both catalogs, server-side e-mail catalog (`hosted/design.md` §8). No UI strings changed this phase.
- [x] Tests:
  - `tests/contracts/test_studio_store_contract.py` (17): AST scan of 9 v1 modules plus a scanner self-test; `current_user` on every v1 route; `project_access` on every project route; forbidden projects hidden; protocol conformance; stub raises
  - pytest `tests/backlot` + `tests/contracts`: 1763 passed, 10 skipped; Vitest unchanged (97)

Notes and deviations:
- **Second seam: `machine_store.py`.** The spec named only `ProjectStore`, but `config.yaml`, `.env` and the music library are not project data, and hosted mode keeps them off the server.
- **CLI output.** `consume-decision` now prints the consumed file name, as before, but `studio_decisions.consume` returns a name instead of a `Path`.
- **Verified on the real server after the refactor:**
  - Phase 5 browser run: wizard upload, drag-drop, preview, delete. The 1 GB upload took 7.2 s with server RSS at most 56 MB.
  - Decision lifecycle via the API and CLI: record, `await-decision`, `consume-decision`, state `consumed`; deleting an upload after the agent started → 409 `already_started`.
  - Phase 6 browser run (results, export zip, cost numbers, settings save, Vietnamese). `config.yaml` was restored.
  - Test projects were deleted.
- **Flaky Phase 5 test fixed.** `features/uploads/uploads.test.tsx` failed about one run in three under `make studio-check`.
  - Cause: every wizard step has a Next button, so a second click could land on the previous step's button before the step changed.
  - Fix: the test now waits for each step's heading before clicking again. Six consecutive full runs passed.
  - Pattern for future wizard tests: wait for the next heading before pressing Next again.
- **Not done (by design):** any hosted implementation (auth, DB/object store, signed media, connector). The docs need maintainer review first.

## Phase 7.1 — Review hardening · done

Follow-up to the code review of Phase 7 (store and auth seams). Fixes one bug, four risks, three nits and one open question. No UI strings change. Plan: one step per row below; tick a step only after its tests pass, with a one-line note.

- [x] 7.1.1 `ProjectFiles` path safety (`backlot/project_store.py`). Done; tests: `tests/backlot/test_project_store.py` (new, 15), `test_export_path_naming_the_project_itself_is_ignored` in `tests/backlot/test_studio_results_cost.py`:
  - **bug:** `safe_rel` returned `"."` for the project folder itself, so `export_path: "."` made `/export` answer 500 → must return `None` (404)
  - **risk:** `list` checked containment only for symlinked files, not for files under a symlinked folder → always check, like `zip_dir`
  - **risk:** `rename` checked the target and then called `os.replace`, which can overwrite under a race → `os.link` + `unlink` (no overwrite), `MissingSource` for a vanished source
  - **question, decided:** ids starting with `_` or `.` (hidden by `list_ids`, e.g. the hosted `_trash`) are rejected by `validate_project_id`
- [x] 7.1.2 Decision consume race (`backlot/studio_decisions.py`). Done; test `test_consume_after_a_concurrent_retract_is_unknown` in `tests/backlot/test_studio_decisions.py`. Detail: a decision retracted between `stat` and `rename` → `unknown_decision`, not an uncaught `FileNotFoundError`
- [x] 7.1.3 API robustness (`backlot/studio_api.py`, `backlot/studio_catalog.py`). Done; test `test_music_upload_answers_404_when_the_saved_track_is_not_listed` in `tests/backlot/test_studio_uploads.py`, existing API tests unchanged:
  - `upload_music` no longer raises `StopIteration` (500) when the saved track is not listed → 404 `unknown_track`
  - store calls in async routes (`intake`, `kickoff`, `inputs`, upload/reference deletes) run in `asyncio.to_thread`, ready for a network-backed store
  - unused `import importlib.util` removed from the catalog
- [x] 7.1.4 Contract scanner hardening (`tests/contracts/test_studio_store_contract.py`). Done; the scanner is now an `ast.NodeVisitor` with per-function exemptions; new self-tests `test_the_scanner_catches_hidden_imports_and_self`, `test_the_scanner_allows_annotated_store_handles`; all 9 v1 modules still scan clean (no code changes needed). Also flags `import shutil as sh`-style aliases:
  - `from os import remove`-style imports of filesystem modules are flagged
  - `self` is no longer an exempt receiver; `files` / `store` are exempt only as parameters annotated `ProjectFiles` / `ProjectStore`
- [x] 7.1.5 Docs and close-out: `hosted/threat-model.md` (T1, T10), `hosted/sync-protocol.md` §4.3, test counts, snapshot above
- [x] Tests: pytest `tests/backlot` + `tests/contracts` 1791 passed, 10 skipped (was 1769; +22). `make studio-check` green, Vitest unchanged (97).

Notes and deviations:
- **Scanner also flags `import <fs module> as <alias>`**, beyond the plan, since an alias hides the module name the same way a `from` import does.
- **`rename` fallback.** On file systems without hard links (`os.link` raises another `OSError`), `rename` falls back to check-then-`os.replace`; the race remains there only.
- **`server._safe_project_dir` unchanged.** The legacy read-only board still accepts `_`/`.` ids; only the Studio store refuses them.
- **Verified on the real server** (`/tmp/pwshot/p71-smoke.sh`, recreate it from this note if missing): `export_path: "."` → `/export` 404 and `results.export` null; `/api/v1/projects/_trash/inputs` → 404; decision record → `await-decision` → `consume-decision` → state `consumed`; retract after consume → 409; consuming twice is idempotent. Test project deleted.


---

## Phase D — Design refresh via Google Stitch · done

Requested 2026-11-11: design Studio in Google Stitch, then apply the designs to `studio/`.
- **Setup and prompts:** [`design/stitch.md`](design/stitch.md).
- **Approved plan (D.4–D.11):** [`design/ui-refresh.md`](design/ui-refresh.md). Part A is the old-vs-new review per screen. Part B covers architecture, folders, services and hooks, primitives, classes and utils. Part C is the steps below.
- **Rules:** tick each step only after `make studio-check` is green, with a one-line note (what changed and which tests).

- [x] **D.1 Connect.** Stitch MCP registered (`claude mcp list` shows `stitch` connected; key only in `~/.claude.json`).
- [x] **D.2 Seed** *(done by the user)*. The user created the Stitch project `5417492826832667065`.
- [x] **D.3 Refine** *(user)*. 13 screens designed, plus the specs in `docs/update-ui-friendly/`. Reviewed 2026-11-11 (`design/ui-refresh.md` Part A).

**D.4 Reference and foundation**
- [x] D.4.1 Stitch references saved to `design/stitch/` (13 JPEG at 1280 px + HTML, 4.9 MB); screen-id map in `stitch.md` §2.4; backlog E-1…E-27 listed below.
- [x] D.4.2 Added deps `lucide-react` ^1.72, `tailwind-merge` ^3.7 and `class-variance-authority` ^0.7. `cn` now merges conflicting classes, and knows the custom `rounded-card/control`, `shadow-glow` and `font-screenplay` scales (`lib/cn.test.ts`). `components/icons.ts` is the single icon import point. The npm audit shows 10 moderate issues, all from existing eslint/minimatch dev deps; none from the new packages.
- [x] D.4.3 `index.css` tokens: dark surface `#131315`; new `surface-{dim,bright,lowest,low,high,highest}`, `border-subtle`, `accent-hover/active`, `warning(-dim)`, `shadow-elev-{sm,md,lg}`, `shadow-glow`. Light-theme equivalents added; light `--text-3` darkened to `#8f7d5d` (contrast 2.9 → 3.8). All old names kept; `board.css` untouched. `studio-check` green (99 tests).

**D.5 Code organisation (no visual change)**
- [x] D.5.1 Split `lib/api` into three layers:
  - `services/`: pure HTTP. `http.ts` has `api`, `ApiError`, session, and shared `parseBody`/`toApiError`, which `sendFile` now reuses. `endpoints.ts` holds every URL, including `mediaURL`, `thumbURL` and `downloadURL`. There is one file per domain.
  - `hooks/api/`: React Query hooks per domain, all keys in `queryKeys.ts`, and `useSSE`. New: `useRecheck` (split out of `useSetup`) and `useSession`.
  - `types/api/`: wire types per domain. `StepState` now lives here, so the UI depends on the types and no longer the other way round.
  - `lib/api` is a re-export shim, and `lib/format` / `result/links` re-export the URL builders.
  - Deviations: no `services/sse.ts`, since `useSSE` stays a hook. The intake service functions exist, but no hooks until a screen uses them.
  - `studio-check` green (99 tests).
- [x] D.5.2 New `utils/` folder:
  - `cn` and `format` moved here.
  - New helpers: `fmtResolution`, `fmtFacts`, `fmtLength` (moved from `media.ts`); `routes.ts` (`projectPath`, `newVideoPath`, `classicBoardPath`); `errors.ts` (`errorText` with optional code→text map, and `fieldErrors` moved from `features/settings`); `clipboard.ts` (`copyText`, `useCopied`).
  - Replaced the duplicate sites:
    - 4 inline project links;
    - 4 "ApiError → text" blocks;
    - 3 resolution formats;
    - the hand-built `$` in `adapters.ts`, now `fmtMoney`;
    - 2 clipboard timers;
    - the second `RUNTIME_LABELS`;
    - the duplicate music list (`MUSIC_SOURCES`/`RUNTIMES` exported from `review.ts`, next to their types).
  - Deviation: the 1-decimal "s" in `ReferenceInsights` stays, since it is a different format from `fmtLength`.
  - `utils/utils.test.ts` added. `studio-check` green (105 tests).
- [x] D.5.3 `features/uploads/uploadQueue.ts`:
  - `UploadQueue` class (state, per-target pump, cancel, dismiss, reset) with an injected `Sender`.
  - `uploadStore.ts` is now a thin facade: a singleton bound to `sendFile`, the same function exports, and `useUploadsSync(target)`. The hook replaces the duplicate refresh-then-dismiss effects in `InputsPanel` and `MusicPicker`.
  - `uploadQueue.test.ts` covers ordering, URLs, the error code and cancel.
  - `studio-check` green (107 tests).
- [x] D.5.4 Wizard moved to `features/wizard/`:
  - `WizardPage` renders only. `useWizard.ts` holds the form, the URL step, goal switching and create. The step components moved to `steps/`; `fields.tsx`, `wizard.ts` and the tests moved with them.
  - `routes/new.tsx` is a thin page.
  - `ServerDown` moved to `components/layout/`.
  - Pages are `React.lazy` (`app/pages.tsx`), with `Suspense` around the `Outlet` so the shell paints at once. The main chunk dropped from 681 kB to 435 kB and the size warning is gone.
  - 6 tests now await lazily loaded page content (`findBy`).
  - `studio-check` green (107 tests, lint clean).
- [x] D.5.5 Every `@/lib/api` import rewritten to `@/hooks/api`, `@/services` or `@/types/api` (46 files, scripted).
  - Removed: the shim, the URL re-exports in `utils/format` and `result/links.ts`, and the unused `PagePlaceholder.tsx`.
  - Docs updated: `03-architecture.md` §6 layout and the STATUS code map / rule 4.
  - `studio-check` green (107 tests).
  - Real-server smoke (`/tmp/pwshot/d5-smoke.mjs`): all 7 routes render with no page errors. The only 404 is the expected `/kickoff` for a non-Studio project.

**D.6 Primitives and shell**
- [x] D.6.1 Existing primitives restyled; API compatible, so no caller changed:
  - `Button`: cva in `buttonVariants.ts`; `sm/md/lg`; `loading`, `leftIcon`, `rightIcon`; `forwardRef`. New `ButtonLink` (router) and `ButtonAnchor` (`<a>`) share the look.
  - `Badge`: `size`, `dot`, `pulse`, passes through native props.
  - `Banner`: amber gradient + glow for `accent`; `icon`; `className`.
  - `Card`: variants `default/interactive/active/dashed` and `padding`; `CardHeader`, `CardTitle`, `CardDescription`, `CardFooter`.
  - `Tabs`: optional count `badge`.
  - `ChipGroup`, `EmptyState` (`icon`) and `Dialog` (shadow, backdrop blur) restyled.
  - Deviation: no `CardContent`, since a plain `div` does the job.
  - `studio-check` green (107 tests); home screenshot checked.
- [x] D.6.2 New primitives in `components/ui`:
  - **Forms:** `Field` + `ErrorText`; `Input`, `Textarea`, `Select` and `MoneyInput` (`controlClass`); `SelectableCard` + `SegmentedControl` (aria-pressed, `selectableClass`).
  - **Progress:** `ProgressBar` (role=progressbar); `ProgressSteps` (8-node timeline, state also as sr-only text); `Stepper` (wizard, aria-current=step).
  - **Layout:** `Section` (aria-labelledby); `ListBox`, `InfoBox`, `Collapsible`, `StatCard`, `KeyValueList`, `Screenplay` (cream, Courier Prime); `Breadcrumb`.
  - **Actions:** `CopyButton` + `CodeBox`.
  - **Placeholders:** `ComingSoon` (inert, aria-disabled, "Coming soon"/"Sắp có").
  - `components/layout/PageHeader` and `StickyActionBar`.
  - New i18n keys `app.breadcrumb` and `common.comingSoon` (en + vi).
  - Deviation: the timeline primitive is named `ProgressSteps`, because `features/project/StepTimeline` already exists.
  - `primitives.test.tsx` has 7 tests, one in `vi`. `studio-check` green (114 tests).
- [x] D.6.3 Duplicated markup replaced by primitives (no layout change):
  - 9 error paragraphs → `ErrorText`;
  - the wizard `Field`/`inputClass` and the settings `Labeled` → shared `Field` + `controlClass` (12 inline control class strings gone);
  - `Advanced` → `Collapsible`;
  - Kickoff `CommandBox` → `CodeBox`; the result-panel copy button → `CopyButton`;
  - 3 links styled by hand → `ButtonAnchor`/`ButtonLink`;
  - 2 progress bars → `ProgressBar`.
  - Deliberately left for the screen phases D.7–D.10, which restructure that markup anyway: `Section`, `PageHeader`, `ListBox` and `InfoBox`. The cost bar stays custom (it is a stacked spent/reserved bar).
  - `studio-check` green (114 tests).
- [x] D.6.4 One header for every screen (`components/layout/Header.tsx`):
  - amber clapper logo and nav with an amber active state;
  - `ConnectionPill` ("Connected"/"Server offline", from `useSession`; xl+);
  - `SpendPill` (month spend from `useMonthSpend`; 2xl+; no invented monthly cap);
  - Classic board, language, an icon theme toggle (same accessible name), and `NotifyToggle` (bell asks for notification permission);
  - the account menu as `ComingSoon` (E-1);
  - the `+ New video` CTA, named "Create a new video" so it differs from the nav link.
  - `Footer`: version from the session, a local-files note, keyboard shortcuts as `ComingSoon` (E-2).
  - `AppShell` is now just header, Suspense outlet and footer; width `max-w-7xl`.
  - 12 new strings in en and vi; 2 new tests (one in `vi`).
  - Checked at 1440 and 1024 px in dark/light and en/vi. `studio-check` green (116 tests).
  - Deviation: the plan's "Live" pill shows the honest server connection; Studio cannot know whether the agent is live.

**D.7 Wizard**
- [x] D.7.1 Goal step:
  - category chips with counts (`category` added to every goal in `content/goals.ts`, `GOAL_CATEGORIES`);
  - cards with gradient art and the goal icon, state badge (works now / limited / locked), beta tag, duration and platform·aspect chips, lock reason + "Unlock in Setup", "Choose this"/"Selected";
  - dashed "Make something like this" card;
  - "Script structure preview" as `ComingSoon` (E-5) with skeleton lines only.
  - Behaviour unchanged: clicking a goal still advances. New i18n keys en + vi. `studio-check` green (116).
- [x] D.7.2 Footage step:
  - two columns. Left: mode `SelectableCard`s, a "Your footage" `Section` with a file-count/size badge, a restyled `DropZone` (upload icon tile) and `FileRow`s (media icon, mono facts, trash icon) in a `ListBox`, plus a CLI `InfoBox`.
  - Right: Style reference with Analyse (E-8) and Director's notes (E-7) as `ComingSoon`, plus the privacy note.
  - Deviation: no A-roll/B-roll tags (E-6); the rows show real facts only.
  - en + vi strings. `studio-check` green.
- [x] D.7.3 Brief step:
  - a "Chosen goal" bar (icon, title, preset length, "Change goal" link to `/new`);
  - numbered field cards (topic + example chips, mode, audience, platform, length, tone) and the Advanced `Collapsible`;
  - right column: AI script assistant (E-9) and live draft (E-10) as `ComingSoon`.
  - Platform, length and tone stay `ChipGroup`s, so names and tests are unchanged. en + vi. `studio-check` green.
- [x] D.7.4 Look step:
  - two columns: numbered cards for style (palette swatches, `selectableClass`), music (`MusicPicker` plus a `ComingSoon` balance/AI-music block, E-12/E-13) and budget (free-tier note or cap, plus a safety `InfoBox`); Advanced unchanged;
  - right: director's screen preview as `ComingSoon` (E-11) and a live Style recipe `KeyValueList` built from the form values;
  - `NumberedCard` shared with the brief step. en + vi. `studio-check` green.
- [x] D.7.5 Review step: summary rows kept (same "Change" links); right column has a Cost estimate card (free local tools or the cap), Review policy card and an agent-kickoff `InfoBox`. No fake kickoff command (E-5 preview omitted). en + vi. `studio-check` green; visual check done.
- [x] D.7.6 Stepper + sticky action bar (verified on all steps). The frame is already in place since D.7.1: `Stepper` cards (done/now/next), `PageHeader` eyebrow "New video · Step n of N", and a sticky Back · Save draft (`ComingSoon`) · "Next up" · Next bar. Final check after D.7.5.

**D.8 Project page**
- [x] D.8.1 Project frame: `Breadcrumb`, `PageHeader` (live pill, style, spend, updated), banner, the 8-node `ProgressSteps` timeline (state also as visible text; the list keeps its "Steps" name), and a main + side column layout (kickoff/review/result/tabs left; inputs and cost right). Deviation: no section table; the status-driven sections stay conditional JSX.
  - Test stability: `testTimeout` 15 s and `asyncUtilTimeout` 5 s, because lazy pages made `findBy` flaky under parallel load (this also explains the earlier "known flake"). Three consecutive full gates green (116).
- [x] D.8.2 Kickoff: active-variant card, terminal icon, a pulsing "Listening for your agent" pill (honest: the page does update by SSE), agent tabs restyled (still `role=tab`). The open-folder button is not built (E-14).
- [x] D.8.3 Running: `RunningPanel` shows the real agent log (`ActivityView`) in a card, plus the render monitor with Pause / CLI live / Cancel as `ComingSoon` (E-15, E-16). No fake frame/FPS/RAM numbers; no invented `watch-render` command.
- [x] D.8.4 Review/Sent: behaviour unchanged. The Sent card uses the active card and the shared `CodeBox` with a copy button. Self-review card, Approve / Request changes / Stop and tabs keep their names. Per-scene edit/add/re-pace (E-17) not built. Checked in light theme.
- [x] D.8.5 Done: `ResultPanel` on `Card`/`ListBox`/`ButtonAnchor`/`CopyButton`; Share and Clone prompt as `ComingSoon` (E-18, E-19). Player, renders, publish text, export bundle and the cost panel in the side column are unchanged. Checked in dark.
- [x] D.8.6 Artifact views: `ScriptView` now uses `Screenplay`; `Tabs` has the amber underline from D.6.1. Storyboard/Concept/Decisions/Activity keep their markup (already on tokens). `studio-check` green (116).

**D.9:** [x] D.9.1 Home (WaitingHero, status-chip grid, shortcut cards; voice preview ComingSoon E-3; project id shown in place of E-4) · [x] D.9.2 Library (stat cards, review-now cards, toolbar with counts; E-20/21/22 ComingSoon, E-24 rendered time "—")

**D.10:** [x] D.10.1 Setup (tier hero, capability cards, InfoBox warnings, Collapsible; diagnostics E-25 ComingSoon; CLI card E-26 not built) · [x] D.10.2 Settings (radio cards, MoneyInput, sticky save bar with Discard; restore defaults E-27 ComingSoon)

**D.11:** [x] Verify and close. `make studio-check` green (116 tests, build 486 kB main chunk). Real-server Playwright shots of Home, Library, Setup and Settings in dark and light (en) saved to `design/after/`; the wizard and project states were checked in D.7/D.8. Deviations: Vietnamese is covered by the parity test and `vi` tests, not by screenshots; keyboard and contrast were checked through role/name tests and the token review, not an axe run. `pytest tests/backlot tests/contracts`: 1793 passed, 10 skipped, 1 flaky (`test_pipelines_merge_lock_state_once_checked` failed once in the full run and passes alone; backend untouched, so unrelated to Phase D).

**Backlog for Phase E (placeholders shown as "Coming soon"; backend data needed):**
- **Shell:** E-1 account/avatar menu · E-2 keyboard shortcuts
- **Home:** E-3 voice preview · E-4 workflow id
- **Wizard:**
  - E-5 screenplay structure preview before the script exists
  - E-6 A-roll/B-roll tagging
  - E-7 director's log
  - E-8 reference "analyse" in Studio
  - E-9 AI script assistant and live draft
  - E-10 AI topic suggestions
  - E-11 live 9:16 preview
  - E-12 voice/music balance
  - E-13 AI-generated music
- **Project:**
  - E-14 open project folder
  - E-15 render monitor (frame/FPS/RAM/ETA)
  - E-16 pause/cancel the agent, CLI live
  - E-17 per-scene listen/edit, add scene, AI re-pace
  - E-18 share
  - E-19 clone prompt
- **Library:**
  - E-20 export cost report
  - E-21 clean temp files
  - E-22 list view
  - E-23 card menu
  - E-24 total rendered minutes
- **Setup:** E-25 diagnostics JSON · E-26 setup CLI JSON command
- **Settings:** E-27 restore factory defaults

**Resume note:** Phase D complete (D.1–D.11). Next: review the diff and commit when the user asks; Phase E (backend for the E-n placeholders) only on request.

