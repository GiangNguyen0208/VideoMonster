# Phase 3 — New Video Wizard

**Goal.** A newcomer can describe a video through guided choices instead of prompt-writing. Studio creates the project, and the agent starts it already knowing the brief. A one-click zero-key demo is also available.

**Use cases served:** UC2, UC3, UC4 (link only).

## Scope

### 3.1 Catalog APIs

**`GET /api/v1/pipelines`**
- For every manifest from `lib/pipeline_loader.list_pipelines()` except `framework-smoke`, returns:
  - `name`, `description`, `category`, `stability`
  - `stages[]` with a `gated` flag (`get_stage_human_approval_default`)
  - `reference_input.supported`
  - `compatible_playbooks`
  - `production_modes` (screen-demo)
- Merged with the Phase 2 lock status.

**`GET /api/v1/styles`**
- Lists `styles/*.yaml` with name, description and palette preview, via `styles/playbook_loader.py`.

### 3.2 Goal config

- `studio/src/content/goals.ts` holds the **goal → pipeline map** from `02-use-cases.md` §3.
- Each goal carries: plain title, one-line promise, icon, `pipeline_type`, `needs_footage`, a default brief preset (platform, duration, tone), and 1–2 example prompts taken from `PROMPT_GALLERY.md`.
- A Vitest check asserts that every non-test manifest has exactly one goal.

### 3.3 Wizard (`/studio/new`), 4 steps with at most 3 main choices each

1. **What do you want to make?**
   - Goal cards, showing lock state and a "beta" tag.
   - A separate **"Make something like this"** card asks for a reference link and a note on what to keep or change.
2. **Tell us about it**, fields adapted per goal:
   - **Topic / message** (required), with example chips from the goal config.
   - **Who is it for**.
   - **Where it will be posted**: YouTube, Shorts/Reels/TikTok, LinkedIn or Other. This sets the aspect ratio.
   - **Length**: 15 / 30 / 60 / 90 s / custom.
   - **Tone**: chips.
   - *Advanced:* must include, avoid, language.
3. **Look & budget**
   - **Style** cards (`/styles`, filtered by `compatible_playbooks`), with "Let the agent choose" as the default.
   - **Budget cap**, defaulting from `config.yaml` `budget`. It shows "Free — runs locally" when the tier is Zero-key.
   - *Advanced:*
     - Rendering-engine preference, labelled clearly as "a preference; the agent will show you both options at the proposal step".
     - Look (Standard/Custom = templated/atelier).
     - Review policy: checkpoint policy (`guided` / `manual_all`).
4. **Review & create**
   - A plain summary of every choice, then **Create**.

### 3.4 Create flow (`POST /api/v1/projects`)

- **Validates** the input against the `studio.intake/1` Zod/Pydantic schema (`03-architecture.md` §3.1).
- **Project id:** slugified from the title plus a short suffix, made unique against `projects/`.
- **Creates the project:** `init_project(project_id, title=..., pipeline_type=..., style_playbook=...)` from `lib/checkpoint.py`.
- **Writes** `projects/<id>/studio/intake.json`.
- **Returns** `{project_id, kickoff}`.
- `PATCH /api/v1/projects/{id}/intake` allows edits until the first checkpoint exists.

### 3.5 Kickoff screen

- **Step 1: "Start your agent".**
  - Shows a copyable command for each supported CLI, from `GET /api/v1/projects/{id}/kickoff`. For example: `claude "/reel Continue Studio project <id>"`.
  - Includes short notes for Codex and Cursor, using the existing `CODEX.md` / `CURSOR.md` conventions.
- **Step 2: "Watch it here".**
  - The project page opens and shows "Waiting for the agent to start…" until the first event or checkpoint arrives over SSE.

### 3.6 Agent contract, part 1

**`AGENT_GUIDE.md`** — add the "Studio intents → intake" rule from `03-architecture.md` §3.3 (1). When `studio/intake.json` exists, the agent must:
- use it as the brief;
- skip onboarding;
- not re-ask fields that were answered;
- still run preflight;
- still present runtimes at the proposal step;
- log the intake to `decision_log`.

**`.claude/commands/reel.md`** — make sure an argument like "Continue Studio project `<id>`" routes the agent to read the intake. Mirror the same instruction in the agent-specific stubs (`CODEX.md`, `CURSOR.md`, `COPILOT.md`, `.windsurfrules`) via a single sentence that points at AGENT_GUIDE.

### 3.7 Demos

- **`GET /api/v1/demos`**: the list from `render_demo.py --list`.
- **`POST /api/v1/demos/{name}/render`**: runs `render_demo.py <name>` as a subprocess job (`GET /api/v1/jobs/{id}`), with progress parsed from the "Encoded N/M" lines.
- **Home → Demos:** cards → Render → progress bar → player. The output stays in `projects/demos/renders/`.

## Implementation notes

- **Kickoff lives on the project page.** After **Create**, Studio opens `/studio/p/<id>`. While the project has a `studio/intake.json` and the agent has written nothing, the page shows "Waiting for the agent to start…" and the *Start your agent* panel (Claude Code / Codex / Cursor-Copilot-Windsurf). The panel disappears on its own as soon as SSE brings the first step.
- **`GET /api/v1/projects/{id}/intake`** was added next to `PATCH`, reporting `editable: false` once a checkpoint exists. There is no edit UI yet.
- **Locked goals** are also rejected by the server (`POST /projects` → 409) when the capability check says so.
- **Decision-log category.** The agent logs the intake under the existing `pipeline_selection` category; the decision-log schema was not extended.
- **Demos.** The job table gained `progress` and `output`, and can pass the job to its function (`pass_job=True`). Progress maps Remotion's `Rendered N/M` to 0–95 % and `Encoded N/M` to 95–100 %.

## Files

- **New:**
  - `backlot/studio_catalog.py`
  - `backlot/studio_jobs.py` (simple in-process job table plus subprocess runner)
  - `studio/src/routes/new/**`, `studio/src/content/goals.ts`, `studio/src/features/demos/**`
  - tests
- **Modified:** `backlot/studio_api.py`, `AGENT_GUIDE.md`, `.claude/commands/reel.md`

## Acceptance criteria

- A first-timer goes from Home to a created project in under 2 minutes without typing a free-form prompt, beyond the topic.
- Starting the agent with the kickoff command produces a first checkpoint whose brief matches `intake.json`. Topic, duration and platform are not asked again in chat. Verify on `animated-explainer` and `screen-demo`.
- Locked goals cannot be created; they link to Setup.
- A zero-key demo renders from the browser and plays.

## Test plan

- **pytest:**
  - Pipelines and styles endpoints over the real `pipeline_defs/` and `styles/`.
  - Create-project paths: success, duplicate id, invalid pipeline, invalid style, path-injection attempts in the title.
  - Job runner with a fake command.
- **Contract test:** extend `tests/contracts/` so every manifest except `framework-smoke` appears in `/pipelines`.
- **Playwright:** the wizard happy path, a locked-goal path and the demo render (mocked job).
- **Manual end-to-end:** a real agent run from the kickoff command on a zero-key machine.
