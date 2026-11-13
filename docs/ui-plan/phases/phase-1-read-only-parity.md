# Phase 1 — Read-only Parity

> **Note (Phase F, 2026-11-13):** the classic board (`backlot/ui/`) was removed. `/` and `/p/<id>` now redirect to Studio, and mentions of the classic board or `board.css` below describe the state at the time of writing. See [STATUS.md](../STATUS.md#phase-f--remove-the-classic-board--done).

**Goal.** Studio can show everything the vanilla Backlot board shows, in plain words, using only the existing read API. This is the first thing a user can actually use: a better viewer for productions started from chat.

**Use cases served:** UC7 (track progress), UC8 (library part).

## Scope

1. **Home** (`/studio`)
   - A **"Waiting for you"** list: projects whose latest checkpoint is `awaiting_human`.
   - **"In progress"**: projects that are live or stalled, using the `live`/`stalled` flags from `summarize_project`.
   - **"Recent results"**: the latest renders.
   - Empty state: "No videos yet", with a pointer to New video (enabled in Phase 3) and Demos.
2. **Library** (`/studio/library`)
   - Project cards: poster, title, video type (goal wording), step progress, status badge, cost.
   - Filters: status, video type, series.
   - Search by title.
   - Series grouping (same data as Backlot's `?view=series`).
3. **Project page** (`/studio/p/:id`)
   - **Step timeline:** each stage with plain-language status (Done / Working… / Waiting for you / Failed / Not started). Review points carry an icon.
   - **"What's happening"** banner: the current step plus the latest activity line. Shows "Stalled — check the agent window" when `stalled`.
   - **Content tabs, rendered from artifacts (never raw JSON):**
     - Brief/Research
     - Proposal (concept cards)
     - Script (screenplay layout)
     - Storyboard (scene × narration × assets filmstrip with thumbnails from `/thumb`)
     - Decisions (latest pick per subject; history expandable)
     - Activity (from `events.jsonl`)
   - **Result:** a `<video>` player for files in `renders/`.
   - **Review point (read-only in this phase):** shows what is awaiting review and the text "Reply in your agent chat to approve". Phase 4 replaces this with buttons.
4. **Live updates.** Project SSE (`/api/project/{id}/events`) and library SSE (`/api/library/events`) drive query invalidation.
5. **Link-outs.** "Open classic board" links to `/p/:id`, and the classic board gains a link back to Studio.

## Data sources

All existing — no new endpoints:
- `GET /api/projects` (backed by `state.list_projects` / `summarize_project`)
- `GET /api/project/{id}/state` (backed by `state.load_board_state`)
- SSE, `/media`, `/thumb`

Field mapping lives in `studio/src/features/project/adapters.ts`, so later changes to the state shape are contained.

## Files

- **New:** `studio/src/routes/{home,library,project}.tsx`, `studio/src/features/{library,project,storyboard,decisions,activity}/**`, `studio/src/content/labels.ts` (engine term → plain label)
- **Modified:** `backlot/ui/board.js` (one link to Studio)

## Acceptance criteria

- For every project produced by `scripts/backlot_simulate_run.py` (`backlot-demo-run`), Studio shows the same stages, statuses, artifacts, decisions, activity and renders as the classic board.
- A new checkpoint written on disk appears in Studio within 2 s without a reload.
- No raw JSON is visible in the default views.
- Pages are usable at 375 px width; keyboard-navigable; AA contrast in both themes.

## Test plan

- **Fixture:** run `scripts/backlot_simulate_run.py` to create the demo project.
- **Playwright:**
  - library lists the project;
  - the project page shows the timeline;
  - writing a checkpoint through the simulate script updates the page live;
  - mobile widths render correctly (same matrix as `tests/backlot/test_ui_bug_bash.py`).
- **Vitest:** adapters map every stage status and the empty/partial artifact cases.
