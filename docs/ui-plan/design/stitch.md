# Designing Studio in Google Stitch

> **Note (Phase F, 2026-11-13):** the classic board (`backlot/ui/`) was removed. `/` and `/p/<id>` now redirect to Studio, and mentions of the classic board or `board.css` below describe the state at the time of writing. See [STATUS.md](../STATUS.md#phase-f--remove-the-classic-board--done).

**Status:** Phase D (design refresh). Studio has no designed mockups yet; its look comes from the tokens in `studio/src/index.css`, which mirror the classic board. This document covers three things:
- connecting the agent to Stitch;
- what to design there;
- how designs are applied to `studio/`.

Read it together with `../04-ui-flows.md`, which lists every screen and state.

## 1. Connect Stitch to the agent

Stitch is a remote MCP server at `https://stitch.googleapis.com/mcp`.

1. In the browser, open <https://stitch.withgoogle.com>. Then go to profile → **Stitch Settings** → **API keys** → **Create key**, and copy the key.
2. In a terminal, register the server for Claude Code:
   ```bash
   claude mcp add stitch --transport http https://stitch.googleapis.com/mcp \
     --header "X-Goog-Api-Key: <YOUR_STITCH_API_KEY>" -s user
   ```
   - `-s user` stores the key in `~/.claude.json`, outside the repo.
   - Never put the key in `.mcp.json`, `.env.example` or any committed file.
3. Restart the Claude Code session, run `/mcp`, and check that `stitch` is connected.
4. Optional: install the Stitch agent skills with `npx plugins add google-labs-code/stitch-skills --scope project --target claude-code`.

The built-in claude.ai Stitch connector may fail in the CLI with "does not support dynamic client registration". The API-key route above avoids that.

The Stitch MCP tools (reference: <https://stitch.withgoogle.com/docs/mcp/setup/>):
- **Projects:** `create_project`, `get_project`, `list_projects`.
- **Screens:** `list_screens`, `get_screen` (HTML and screenshot).
- **Generation:** `generate_screen_from_text`, `edit_screens`, `generate_variants`.
- **Design systems:** `create_design_system`, `update_design_system`, `list_design_systems`, `apply_design_system`.

## 2. What to design

Since there is no design yet, the agent seeds Stitch first and the user refines it in the browser:

1. **Seed (agent):**
   - `create_project` "OpenMontage Studio";
   - `create_design_system` from the current tokens (§3.2, dark and light);
   - `generate_screen_from_text` for each screen id below, using the context in §2.1 and the screen row as the prompt;
   - `apply_design_system` to all screens.
2. **Refine (user):** adjust screens on stitch.withgoogle.com, using its editor, `edit_screens` or variants, keeping the screen names.
3. **Apply (agent):** §3, when the user says a screen is ready.

Screen names must start with the ids below so the agent can map them to routes.

### 2.1 Product context (paste into Stitch first)

> OpenMontage Studio is a local web app that helps beginners make AI-produced videos together with a coding agent. The agent does the work; the app lets the user check their setup, pick a video goal, write a brief, approve each production step, follow progress and cost, and download the result. Tone: calm, cinematic, trustworthy, plain words, one clear next action per screen. Desktop first (1280–1440 px), usable down to 768 px. Dark theme by default with a warm light theme. Accent colour amber. Status colours: green done, amber waiting for you, red failed, blue in progress. Every status is shown as text as well as colour. Copy must fit both English and Vietnamese (Vietnamese runs about 20–30 % longer).

### 2.2 Screens and states

| Screen id | Route | Must show (see `04-ui-flows.md`) |
|---|---|---|
| `home-empty` | `/` | First run: what works now, a pointer to Setup, demo cards, **New video** CTA |
| `home` | `/` | "Waiting for you" banner, recent projects, demo cards with render progress |
| `new-goal` | `/new` | Goal cards (promise, needs footage, beta, locked with reason, typical cost), "Make something like this" |
| `new-footage` | `/new` | Drop zone, file rows with progress and errors, reference link and note |
| `new-brief` | `/new` | Topic, audience, platform/aspect, duration, tone; inline field errors |
| `new-look` | `/new` | Style cards, budget cap, music picker, Advanced drawer |
| `new-review` | `/new` | Summary, cost estimate, **Create** |
| `project-kickoff` | `/p/:id` | Kickoff commands with copy buttons, inputs panel |
| `project-running` | `/p/:id` | Step timeline, live activity, brief/script/storyboard, cost panel |
| `project-review` | `/p/:id` | Review panel: content, self-review, Approve / Request changes / Stop, proposal picks |
| `project-sent` | `/p/:id` | Decision sent, **Take back** |
| `project-done` | `/p/:id` | Player, downloads, export bundle, cost by step |
| `library` | `/library` | Search, status filter, series groups, spend this month |
| `setup` | `/setup` | Tier badge, works now, locked types, unlock cards with key entry, runtimes, warnings |
| `settings` | `/settings` | Budget, checkpoint policy, output defaults, read-only notice |

Design the dark theme first. Add light variants of `home` and `project-review` to settle the light palette.

### 2.3 Describing the current UI in Stitch web

Screenshots of the current UI (dark, English, 1440 px wide, taken 2026-11-11) are in [`current-ui/`](current-ui/).

For each screen:
1. Start a new **Web** design.
2. Attach the screenshot with the image button in the prompt box.
3. Paste the shared context (§2.1) once, then the screen prompt below.
4. Name the result with its screen id.

Use the same thread for later screens so the style stays consistent. Iterate with short edits ("make the step cards more compact", "stronger hierarchy on the review banner"), or select a screen and ask for variants.

**Shared header (add to every prompt):**
> Keep the top bar: logo "OpenMontage Studio", nav Home · New video · Library · Setup · Settings, then right-aligned "Classic board ↗", a language select (EN/VI) and a theme toggle. Dark background near-black (#0a0a0c), cards #101013 with 1px #232329 borders, text #ececef / #a0a0a9, amber accent #f0a83c, green #4fc283, red #e5544b, blue #6aa1ff. Rounded corners about 10–12 px, Inter-style sans font.

| Screen id | Screenshot | Prompt |
|---|---|---|
| `home` | `home.png` | Redesign this home page of a video-making companion app. Order: title "Make a video with OpenMontage" and one-line explanation; an amber "1 video is waiting for you" banner as the single main call to action; sections "Waiting for you", "In progress" and "Recent results", using project cards (thumbnail, title, video type, status pill, step progress bar "2/8 steps", time, cost, Download/Open links); "Try a demo" cards with a video player and "Render again"; three shortcut cards: New video, Library, Setup. Make it feel like a calm creative dashboard, not an admin panel. |
| `new-goal` | `new-goal.png` | Redesign step 1 of a 4-step wizard (What do you want to make? → Tell us about it → Look & budget → Review & create). Show a step indicator, then a grid of 12 goal cards. Each card has an icon, title, one-line promise, a state pill (Works now / Ready / Locked with "needs AI images" + "Unlock in Setup" link), an optional "beta" tag, "better with …" hints and "Uses your own video files" when footage is needed. Below the grid, a wide dashed card "Make something like this — paste a link to a video you like". Locked cards look dimmed but still readable. |
| `new-brief` | (none) | Step 2 of the same wizard: form with Topic (textarea), Audience, Platform (YouTube / Shorts / LinkedIn / Other as segmented buttons, showing aspect ratio), Duration (slider or chips), Tone (chips). Inline validation text under fields. Back and Next buttons at the bottom; Next is the amber primary. |
| `new-look` | (none) | Step 3: style cards with small previews, a budget cap input in USD with "$0 — runs locally" hint, a music picker (list of tracks with play buttons and "Upload track"), and a collapsed "Advanced" drawer. |
| `new-review` | (none) | Step 4: summary card of every choice with "Edit" links per section, estimated cost, and the primary "Create video" button. |
| `project-kickoff` | (none) | Project page right after creation: title, "Next: start your agent" panel with copy-able commands per CLI (Claude Code, Codex, Cursor), and an inputs panel with a drop zone, uploaded file rows (name, size, progress, remove) and reference links. |
| `project-review` | `project-review.png` | Redesign this project page while a step waits for the user. Top: breadcrumb, title, "Live" pill. Amber banner "Waiting for you: review the script" with "Notify me" action. Review card: agent's self-review, collapsible "Comment on sections", buttons Approve (amber primary), Request changes, and a quiet "Stop project". Then an 8-step timeline (Research, Concept & plan, Script, Storyboard, Visuals & audio, Edit, Render, Publish) with status Done / Waiting for you / Working / Not started / Failed, and tabs Research · Concept & plan · Script · Storyboard · Decisions · Activity. The script tab shows a screenplay-style cream page with monospace text and section timecodes. |
| `project-sent` | (none) | Same page after the user approved: the review card becomes "Sent — your agent will pick this up" with the decision summary and a "Take back" button; banner turns neutral. |
| `project-running` | (none) | Same page while the agent works: no banner, the current step shows "Working…" with a subtle animation, a live activity feed on the side, and a cost panel (spent, reserved, remaining of the budget cap). |
| `project-done` | `project-done.png` | Redesign this finished project page: a large video player for the final video, other renders as thumbnails with resolution/duration, Download MP4 and "Export bundle" buttons, publish metadata (title, description, hashtags), and a cost panel with spend by step and by tool. |
| `library` | `library.png` | Redesign this library: search box, status filter chips (All, Waiting for you, In progress, Needs attention, Done), "Spent this month" figure, projects grouped by series, grid of project cards like on Home. |
| `setup` | `setup.png` | Redesign this setup center: a tier badge (Zero-key / Starter / Standard / Full), "Works now" list of video types, locked types with the reason, unlock cards (each asks for one API key with a password-style input and Save, shows "set ••••abcd" after), runtimes (FFmpeg, Remotion, HyperFrames…) with status, and warnings. Also a "Checking your tools…" loading state. |
| `settings` | `settings.png` | Redesign this settings page with three cards. **Language** (select). **Spending**: "When a video would go over budget" segmented (Track only / Warn me / Hard limit) with a helper line, "Budget per video (USD)", "Ask me before any single action over $X", and a checkbox "Ask me before using a paid service for the first time". **Defaults**: review points (At key steps (recommended) / After every step / Only creative steps), video size select, frame rate select. Then a "Save settings" button with a note that it saves to config.yaml; show inline field errors and a read-only notice variant. |

Screens without a screenshot need a project in that state. Generate them from the prompt, or ask the agent to build a fixture and capture them (fixtures: `/tmp/pwshot/stitch-fixture.py`, `/tmp/pwshot/p6-fixture.sh`).

### 2.4 Designed screens (Stitch project `5417492826832667065`, 2026-11-11)

The references are saved in [`stitch/`](stitch/) as `<screen-id>.jpg` (1280 px wide) and `.html`. They are reference only and never shipped. The user's written specs are in `docs/update-ui-friendly/`; the approved apply plan is [`ui-refresh.md`](ui-refresh.md).

| Screen id | Stitch title | Stitch screen |
|---|---|---|
| `home` | Home Dashboard - Creator Friendly | `ace78aa3f92449149bbed3dc520b7675` |
| `new-goal` | New Video Wizard - Creator Friendly | `2f3d6be83155440392087b4d01abe26d` |
| `new-footage` | New Video Wizard - Add Footage & References | `60873441863545ada4a03b2114221ea5` |
| `new-brief` | New Video Wizard - Step 2: Kịch bản & Nội dung | `c4ac5abe1ad04e8cacde026015cac502` |
| `new-look` | New Video Wizard - Step 3: Phong cách & Âm thanh | `ea18a396d8a94c91b8db10f0361b4a3f` |
| `new-review` | New Video Wizard - Step 4: Kiểm tra & Khởi tạo | `1c5b2dbc4c4a4010bdbd17982814b873` |
| `project-kickoff` | Project Kickoff - Chờ khởi động Agent | `4362ff102bd04df6ad1e6b33cd60249d` |
| `project-running` | Live Production - Trợ lý AI đang Render video | `14bd151b2b86480c847e26583acb531e` |
| `project-review` | Review Gate - Duyệt kịch bản & phân cảnh | `4b867f9601c44d19b2d5f09bf8411fdf` |
| `project-done` | Project Result & Video Player | `ae5306cb72a54dbca13d7c26e2b36774` |
| `library` | Thư viện video (Library) | `c1f997c5af07406cafa41812299a1ebc` |
| `setup` | Setup Center | `32492c5984214735a9b5178d3a7daa14` |
| `settings` | Cài đặt hệ thống & Hạn mức chi tiêu (Settings) | `71aeb988e67d4e478dfdc9e990d2879e` |

`home-empty` and `project-sent` have no Stitch screen. They reuse the `home` and `project-review` styles.

### 2.5 Constraints for Stitch output

- Use Tailwind utility classes. They map onto Studio's tokens (§3.2).
- Avoid images of text. Real copy comes from `studio/src/i18n/{en,vi}.ts`.
- Keep the app shell (header with nav, language and theme switches) the same on every screen.

## 3. Applying a design

The agent does this once Stitch is connected and the user says which screens are ready.

1. **Fetch:** `get_screen` for each screen id, saving its HTML and screenshot under `docs/ui-plan/design/stitch/<screen-id>.{html,png}` as the reference. These are design references only; they are not shipped.
2. **Tokens first:** extract colours, radii, spacing, type scale and shadows, and update `studio/src/index.css` (`:root` dark, `[data-theme="light"]`, `@theme inline`).
   - Keep the token *names*, so components and the classic board keep working.
   - Changing board colours too needs `backlot/ui/board.css`; ask before touching it.
3. **Components:** restyle the existing React components in `studio/src/components`, `features/*` and `routes/*` to match. Do not paste Stitch HTML into the app.
   - Structure, data hooks, routes and API calls stay as they are.
   - Only markup and classes change, plus new presentational components where a design needs them.
4. **Text:** any new or changed string goes into both `en.ts` and `vi.ts`.
5. **Check:** run `make studio-check`, then take Playwright screenshots of each route in both themes and both languages and compare them with the Stitch screenshots.
6. **Track:** tick the screen in STATUS.md (Phase D).

### 3.1 Out of scope

- Behaviour changes, new routes or new API calls. If a design implies one, record it in STATUS as an open item and ask first.
- Stitch-generated JavaScript.

### 3.2 Token map

| Stitch / Tailwind intent | Studio class | CSS variable |
|---|---|---|
| page background | `bg-bg` | `--bg` |
| card / panel | `bg-surface`, `bg-surface-2`, `bg-surface-3` | `--surface*` |
| borders | `border-border`, `border-border-soft` | `--border*` |
| text, muted, faint | `text-text`, `text-text-2`, `text-text-3` | `--text*` |
| primary / accent | `bg-accent`, `text-on-accent`, `bg-accent-dim` | `--amber*`, `--on-accent` |
| success, danger, info | `*-success`, `*-danger`, `*-info` (+ `-dim`) | `--green*`, `--red*`, `--blue*` |

### 3.3 As built (2026-11-11)

All 13 designed screens are applied (D.7–D.10). Screenshots of the result: `design/after/`.
- Elements without backend data render through `ComingSoon` (disabled, badge, "—"); each has a backlog id `E-n` in STATUS.md.
- Deliberate differences from the Stitch mockups: no invented numbers (month cap, GPU/RAM, latency), no CLI commands that do not exist, no machine-spec card on Setup (the API has no such data), and a "Live" pill that shows the server connection, not the agent state.
