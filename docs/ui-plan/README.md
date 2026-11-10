# OpenMontage Studio — UI Plan

This folder plans **Studio**, a browser UI that makes OpenMontage easy to pick up for people who have never used it.

Studio is a **companion** to the agent chat, not a replacement for it. The coding agent (Claude Code, Codex, Cursor, …) still does all the creative work: research, scripting, generation and rendering. Studio takes over the parts that are hard for a newcomer in a terminal:

- understanding what their machine and API keys can do
- choosing the right kind of video
- writing a brief
- reviewing and approving each step
- following progress and cost
- finding the finished video

**Progress tracking:** [`STATUS.md`](STATUS.md) records which phases are done or in progress. Its "Resume here" section summarizes the current state, the rules every phase follows, a code map, the Studio ↔ agent files and open items. Each phase section has its checklist, deviations and verification notes. Read it first and update it whenever you work on Studio.

## Locked decisions

| Topic | Decision |
|---|---|
| Who drives production | The agent CLI, unchanged. Studio writes *intents* to disk; the agent reads and applies them. |
| Deployment | Local single-user first (localhost, like Backlot). Hosted multi-user is a later phase, so APIs and storage are designed to move. |
| Frontend | New React + Vite + TailwindCSS app in `studio/`, served by the existing Backlot FastAPI server. |
| Backend | Extend `backlot/` with a versioned write API (`/api/v1`). The read-only board contract stays as it is. |

## Reading order

1. [`01-current-system.md`](01-current-system.md): how OpenMontage works today. This is the verified as-is workflow and the gaps a UI must fill.
2. [`02-use-cases.md`](02-use-cases.md): who the users are, what they want to do, the goal→pipeline map and the UX principles.
3. [`03-architecture.md`](03-architecture.md): the companion model, the disk contract between UI and agent, the API additions, security, and the hosted path.
4. [`phases/`](phases/): the implementation phases. Each one can ship on its own.

| Phase | Name | Ships |
|---|---|---|
| 0 | [Foundation](phases/phase-0-foundation.md) | `studio/` scaffold, design tokens, `/studio` mount, `/api/v1` skeleton, CI |
| 1 | [Read-only parity](phases/phase-1-read-only-parity.md) | Library + project page in React on the existing Backlot API |
| 2 | [Setup center](phases/phase-2-setup-center.md) | "What works now", unlock cards, API-key entry |
| 3 | [New video wizard](phases/phase-3-new-video-wizard.md) | Goal-first project creation, brief intake, kickoff command, one-click demos |
| 4 | [Review & approve](phases/phase-4-review-and-approve.md) | Approve or revise each step from the browser; agent-side contract |
| 5 | [Footage & references](phases/phase-5-footage-and-references.md) | Uploads, reference links, music library |
| 6 | [Results & cost](phases/phase-6-results-and-cost.md) | Player, downloads, export bundle, cost dashboard, budget settings |
| 7 | [Hosted readiness](phases/phase-7-hosted-readiness.md) | Storage abstraction, auth hooks, sync connector design |

**MVP for newcomers = Phases 0–4.** At that point a new user can set up, create a video, approve every step and watch the result without reading any repo docs.

## Glossary

The UI shows newcomers the words in the right-hand column.

| Engine term | Meaning | Studio wording |
|---|---|---|
| Pipeline | A production recipe in `pipeline_defs/*.yaml` (e.g. `animated-explainer`) | **Video type** |
| Stage | One step of a pipeline (research, proposal, script, …) | **Step** |
| Gate | A stage with `human_approval_default: true`; the agent must stop for approval | **Review point** |
| Checkpoint | `projects/<id>/checkpoint_<stage>.json`, the state of a step on disk | (hidden) |
| Artifact | A step's output document (`script`, `scene_plan`, …) under `artifacts/` | Shown as content (script, storyboard, …) |
| Render runtime | Composition engine: Remotion, HyperFrames, or FFmpeg | **Rendering engine** (Advanced) |
| Composition mode | Templated vs atelier (hand-authored) | **Look: Standard / Custom** (Advanced) |
| Style playbook | A visual style in `styles/*.yaml` | **Style** |
| Decision log | `decision_log.json`, the append-only record of creative choices | **Decisions** |
