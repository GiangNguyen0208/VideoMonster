# Studio UI refresh — "Cinematic Darkroom" (Phase D.4–D.11)

**Status:** approved plan, tracked in [`../STATUS.md`](../STATUS.md) (Phase D).

Inputs:
- the 13 Stitch screens in project `5417492826832667065`; references in [`stitch/`](stitch/);
- the user's specs in `docs/update-ui-friendly/`;
- the old UI described in [`../04-ui-flows.md`](../04-ui-flows.md).

Decisions taken with the user (2026-11-11):
- **Copy the Stitch screens exactly.** Elements with no real data are still built, but render inside one `ComingSoon` wrapper:
  - disabled, with a "Coming soon" badge;
  - "—" instead of any number;
  - never invented values, and never a CLI command that does not exist.
  - Each one is a backlog item `E-n` for a later backend phase (E).
- **New dependencies:** `lucide-react` (icons), `tailwind-merge` (class merging in `cn`) and `class-variance-authority` (variants).
- **Moderate refactor:**
  - `lib/api` is split into services, hooks and types;
  - the wizard moves to `features/wizard`;
  - routes become thin pages;
  - shared primitives are extracted and duplicated helpers merged.

Contrast rule (from D.4.3): `text-3` reaches about 3.1:1 (dark) and 3.8:1 (light). Use it only for decorative or large text (placeholders, meta, timestamps). Small text that carries meaning uses `text-2` or stronger.

Rules every step keeps:
- Studio writes intents only.
- No `/api/v1` behaviour change.
- Every string goes in en + vi.
- Raw token names stay, and `backlot/ui/board.css` is not touched.
- Named exports, strict TS, prettier with the tailwind plugin.
- Tests keep querying by role, name and text.
- No Stitch HTML or JS in the app.
- `make studio-check` must be green before a step is ticked.

## Part A — Review: old screens vs. Stitch

Legend: **Keep** = existing behaviour restyled · **New UI** = backed by data the API already has · **Placeholder** = built per "copy exactly", wrapped in `ComingSoon`, backlog id `E-n`.

**Shell (all screens).** The Stitch headers differ from screen to screen; the canonical one is below.
- Keep:
  - logo `OpenMontage Studio` and nav Home · New video · Library · Setup · Settings (amber underline on the active item);
  - Classic board ↗;
  - EN/VI;
  - theme toggle.
- New UI:
  - `+ New video` CTA on the right;
  - a "Live" pill (SSE connection state; `useSSE` gains a status);
  - a spend pill showing the month's spend (`useMonthSpend`) against the per-video default cap (`settings.budget.total_usd`), labelled honestly;
  - the bell becomes the browser-notification toggle (reuses `useReviewNotification`);
  - a footer with version (`/session.version`) and the engine/runtime summary.
- Placeholder:
  - the avatar/"Director" menu (E-1);
  - the keyboard-shortcuts link (E-2).

**Home** (`/`).
- Keep: waiting/in-progress/results/demos/shortcut sections.
- New UI:
  - greeting header;
  - a hero "Waiting for you" card: project, step, script excerpt in a screenplay box, self-review, Approve and Request changes buttons that open the project's review panel, so the decision is still made there;
  - project grid with filter chips (All, Waiting, Working, Done);
  - progress bar with step label and cost;
  - demo cards with duration;
  - 3 shortcut cards.
- Placeholder:
  - voice preview player (E-3);
  - "Workflow ID" (E-4, shows the project id instead).

**Wizard** (`/new`; steps goal → [footage] → brief → look → review).
- **Stepper:** numbered cards with done/current/next sub-labels.
- **Footer:** sticky Back · (Save draft) · Next.
- **Goal:**
  - New UI: category chips over the goal grid (a `category` field is added to `content/goals.ts`); card with art header, state badge, duration/platform chips, lock reason + "Unlock in Setup"; selected card ring; the "make something like this" link box (existing reference fields).
  - Placeholder: goal artwork, using generated gradient + icon art (no bitmap assets); "screenplay structure preview" (E-5).
- **Footage:**
  - New UI: two-column layout. The left column holds the drop zone with format/size chips from `useUploadLimits` and file rows (thumb, size, duration, resolution via `describeMedia`, preview/remove). The right column holds the reference link + note card. The CLI hint shows the real inputs path.
  - Placeholder: A-roll/B-roll tagging (E-6), director's log (E-7), "analyse" button (E-8).
- **Brief:**
  - New UI: numbered field cards (topic + example chips, audience, platform/aspect cards, duration segmented control, tone cards); goal summary bar with "change goal"; Advanced drawer.
  - Placeholder: AI script assistant panel and live draft (E-9), "AI suggest" (E-10).
- **Look:**
  - New UI: style playbook cards (`useStyles`), music list (`MusicPicker` restyled), budget/engine cards (free tier vs cap, runtime options), Advanced (review points, fps); style recipe summary on the right.
  - Placeholder: live 9:16 preview (E-11), voice/music balance slider (E-12), AI-generated music tab (E-13).
- **Review:**
  - New UI: title card and section cards (goal/format, brief, footage, look), each with "Edit"; cost estimate card (cap, free tools); review-policy cards; agent-kickoff hint (real command shown after create); "Create video" CTA.
  - Placeholder: screenplay preview of the not-yet-written script (E-5); the hard-coded `python -m backlot run …` from Stitch is not shown.

**Project** (`/p/:id`). One page with state-driven sections.
- **Kickoff (no checkpoint):**
  - New UI: hero banner "Project created — start your agent"; horizontal 8-step stepper; kickoff card with agent tabs (Claude Code / Codex / Cursor from `useKickoff`) + copy; "listening via SSE" pill; inputs side card (`InputsPanel`); cost & safety card (`useProjectCost`, cap); brief-handover card (`BriefView`).
  - Placeholder: "open project folder" (E-14).
- **Running:**
  - New UI: title + live status pill; stepper; vertical step list with states; activity feed ("Agent log", `activityLines`); current script section; "notify me" bar.
  - Placeholder: render monitor canvas with frame/FPS/RAM/ETA (E-15); Pause / CLI Live / Cancel buttons (E-16); `watch-render` command (not shown, does not exist).
- **Review (`awaiting_human`):**
  - New UI: waiting banner + notify; self-review card with Approve / Request changes / Stop (`ReviewPanel` logic unchanged, restyled); notes field; tabs Storyboard · Script · Decisions · Activity; scene cards (`StoryboardView`); screenplay box (`ScriptView`); production recipe (concept/proposal picks); real `await-decision` hint (already in `SentCard`).
  - Placeholder: per-scene "listen"/"edit scene", "add scene", "AI re-pace" (E-17); 9:16 live preview (E-11).
- **Sent / applying:** restyled `SentCard` / `ApplyingCard` (same states and retract).
- **Done:**
  - New UI: success banner; player (`ResultPanel`); facts strip (codec, size, fps from the render report); tabs Publish info (copy title/description/hashtags) · Renders · Bundle (export); scene strip; cost ledger (`CostPanel`).
  - Placeholder: Share (E-18), Clone prompt (E-19), CC/speed controls beyond the native `<video>` (native controls kept).

**Library** (`/library`).
- New UI:
  - header with count;
  - 4 stat cards (month spend, project counts by status, waiting count, live/engine), computed from `useProjects` + `useMonthSpend`;
  - "needs review now" cards;
  - search, type select, group-by-series toggle, status chips with counts;
  - series sections;
  - restyled `ProjectCard`;
  - demo strip;
  - shortcut cards.
- Placeholder: export cost report (E-20), clean temp files (E-21), grid/list toggle (list view, E-22), card "⋯" menu (E-23), total rendered minutes (E-24).

**Setup** (`/setup`).
- New UI:
  - header with "Check again";
  - tier hero card with hardware summary from `view.hardware` / runtimes;
  - warnings as info rows;
  - "Works now" capability cards;
  - video-type status rows (`VideoTypeList`);
  - unlock key cards (`UnlockCard`/`KeyForm`, `signup_url` link, masked hint);
  - collapsible providers and runtimes.
- Placeholder: "Diagnostics (probe JSON)" (E-25), `backlot setup --json` CLI card (E-26, does not exist; not shown as a command).

**Settings** (`/settings`).
- New UI:
  - three sectioned cards (Language; Spending with budget-mode radio cards and descriptions, budget and threshold money inputs, first-paid-use checkbox; Defaults with review-point radio cards, resolution and fps selects);
  - sticky save bar ("Discard changes" resets to the loaded values, plus Save);
  - read-only notice;
  - config key mapping line.
- Placeholder: "restore factory defaults" (E-27; the API has no defaults).

**Not found / server down:** restyled `EmptyState` / `Banner`.

---

## Part B — Target architecture

### B.1 Folder organisation (moderate)

```
studio/src/
  app/            main.tsx, router.tsx (lazy routes), queryClient.ts, ErrorBoundary.tsx, providers
  components/
    ui/           primitives (B.4), barrel index.ts
    layout/       AppShell, Header, NavLinks, LivePill, SpendPill, Footer, PageHeader, StickyActionBar
    icons.ts      lucide re-exports used by the app (one import point)
  features/
    home/         WaitingHero, ProjectGrid, ShortcutCards
    library/      ProjectCard, LibraryStats, LibraryToolbar, filters.ts
    wizard/       (moved from routes/new) WizardPage, Stepper, steps/{Goal,Footage,Brief,Look,Review}Step, wizard.ts, useWizard.ts
    project/      ProjectHeader, StatusBanner, KickoffPanel, StepTimeline, StepList, views/*, adapters.ts, tabs.ts
    review/       ReviewPanel, ReviewForm, SentCard, ApplyingCard, ProposalPicker, ReferenceInsights, review.ts, useReviewForm.ts
    result/       ResultPanel, PublishKit, RenderList, ExportBundle
    cost/         CostPanel, CostBar, cost.ts
    uploads/      DropZone, FileRow, InputsPanel, uploadQueue.ts (class), media.ts
    music/        MusicPicker
    setup/        TierHero, CapabilityGrid, VideoTypeList, UnlockCard, KeyForm, UnlockMoreCard
    settings/     SettingsForm, sections/*, errors.ts
    demos/        DemoCards
  routes/         thin pages only: home.tsx, library.tsx, project.tsx, setup.tsx, settings.tsx, new.tsx, not-found.tsx
  services/       pure HTTP per domain (no React): http.ts (api, ApiError, session), endpoints.ts, projects.ts,
                  catalog.ts, decisions.ts, setup.ts, uploads.ts, results.ts, settings.ts, demos.ts, sse.ts
  hooks/api/      React Query hooks per domain + queryKeys.ts + useSSE.ts; barrel index.ts (replaces lib/api)
  types/          api/*.ts (wire types per domain), artifacts.ts (typed brief/script/proposal readers' outputs)
  utils/          format.ts, media.ts, money.ts, routes.ts (projectPath), errors.ts (errorText), clipboard.ts, cn.ts
  content/        goals.ts (+ category), labels.ts (single RUNTIME_LABELS, MUSIC_SOURCES)
  i18n/           unchanged mechanics
```

Moves keep public names. `lib/api/index.ts` stays as a re-export shim for one phase, then is deleted once all imports have moved. `lib/format.ts` moves to `utils/`.

### B.2 Layers and dependency rule (pragmatic SOLID)

- `components/ui` → nothing app-specific. `features/*` → `components`, `hooks/api`, `utils`, `content`, `i18n`. `routes` → `features` + `components/layout`. `hooks/api` → `services`, `types`. `services` → `types` only.
- `types/api` no longer imports `StepState` from UI (that dependency is inverted today).
- **S (single responsibility):** split only the files that mix concerns today:
  - `ReviewPanel` (into form, cards and `useReviewForm`);
  - `routes/new/index` (into `useWizard`, `WizardPage` and `Stepper`);
  - `InputsPanel` (into `ServerFiles`, `References` and `useInputsSync`);
  - `SettingsForm` (into `sections/*` and `useSettingsForm`);
  - `routes/project` (into `StatusBanner`, `tabs.ts` and `ProjectHeader`).
- **O (open/closed):** variants via `cva` maps; the page sections of `project.tsx` come from a small `sections` table keyed by status kind, instead of growing if-chains.
- **D (dependency inversion):** only where tests already need a seam. `UploadQueue` takes an injected `send` function, and services take `fetch` through `http.ts`; tests keep stubbing global `fetch`.
- **Not applied:** no repository classes, DI containers or interface-per-component. Function modules stay the default.

### B.3 API services and hooks (every endpoint)

| Service fn (`services/*`) | Endpoint | Hook (`hooks/api/*`) | Type | Cache effect |
|---|---|---|---|---|
| `getSession` | GET `/api/v1/session` | `useSession` (new, version for the footer) | query | key `session`, staleTime ∞ |
| `listProjects` | GET `/api/projects` | `useProjects` + SSE `/api/library/events` | query | key `projects` |
| `getBoardState(id)` | GET `/api/project/:id/state` | `useProject(id)` + SSE `/api/project/:id/events` | query | invalidates project/decisions/inputs/results/cost |
| `getJob(id)` | GET `/jobs/:id` | `useJob(id)` (polls 1 s while running) | query | |
| `getSetup` | GET `/setup` | `useSetup` | query | follows job, then invalidates `setup` |
| `recheckSetup` | POST `/setup/recheck` | `useRecheck` (split from `useSetup`) | mutation | sets job and setup |
| `saveEnvKey` | PUT `/setup/env` | `useSaveKey` | mutation | patches `setup.keys` |
| `listPipelines` | GET `/pipelines` | `usePipelines` (polls while unchecked) | query | |
| `listStyles` | GET `/styles` | `useStyles` | query | |
| `createProject` | POST `/projects` | `useCreateProject` | mutation | sets kickoff, invalidates `projects` |
| `getIntake` / `patchIntake` | GET/PATCH `/projects/:id/intake` | `useIntake` / `useUpdateIntake` (typed now; edit-brief UI stays backlog) | query/mutation | |
| `getKickoff` | GET `/projects/:id/kickoff` | `useKickoff` (404 → null) | query | |
| `listDecisions` | GET `/projects/:id/decisions` | `useDecisions` | query | |
| `submitDecision` | POST `/projects/:id/decisions` | `useSubmitDecision` | mutation | invalidates `decisions(id)` |
| `retractDecision` | DELETE `/projects/:id/decisions/:did` | `useRetractDecision` | mutation | invalidates `decisions(id)` |
| `getUploadLimits` | GET `/uploads/limits` | `useUploadLimits` (key moves into `queryKeys`) | query | |
| `listInputs` | GET `/projects/:id/inputs` | `useInputs` | query | |
| `sendFile` (XHR) | POST `/projects/:id/uploads`, POST `/music` | used by `UploadQueue` | — | `useUploadsSync` invalidates `inputs` / `music` (shared; replaces the 2 duplicate effects) |
| `removeUpload` | DELETE `/projects/:id/uploads/:name` | `useRemoveUpload` | mutation | invalidates `inputs` |
| `addReference` / `removeReference` | POST / DELETE `/projects/:id/references[/:rid]` | `useAddReference` / `useRemoveReference` | mutation | invalidates `inputs` |
| `listMusic` | GET `/music` | `useMusic` | query | |
| `getResults` | GET `/projects/:id/results` | `useResults` | query | |
| `exportUrl` / `mediaUrl` / `thumbUrl` / `downloadUrl` / `musicTrackUrl` | GET `/projects/:id/export`, `/media`, `/thumb`, `/music/tracks` | URL builders in `services/endpoints.ts` | — | |
| `getProjectCost` | GET `/projects/:id/cost` | `useProjectCost` | query | |
| `getSpendSince` | GET `/cost/summary?since=` | `useMonthSpend` | query | key under `projects` |
| `getSettings` / `putSettings` | GET / PUT `/settings` | `useSettings` / `useSaveSettings` (move from `results.ts`) | query/mutation | writes the cache |
| `listDemos` / `renderDemo` | GET `/demos`, POST `/demos/:name/render` | `useDemos` / `useDemoRender` | query/mutation | polls job, invalidates `demos` |

- `services/http.ts` keeps today's `api()`, `ApiError`, token header and 403 refresh.
- `sendFile` reuses its `parseBody`/`toApiError` instead of a copy.
- All URL prefixes live in `endpoints.ts` (`v1.project(id).inputs`, …).

### B.4 UI primitives (`components/ui`) and interfaces

- **Restyled:** `Button`, `Badge`, `Banner`, `Card`, `Tabs`, `EmptyState`, `Spinner`, `Dialog/Drawer`, `ChipGroup`.
  - `Button`: cva variants `primary|secondary|danger|ghost`, sizes `sm|md|lg`; `loading`, `leftIcon`, `rightIcon`, `asChild`-style `ButtonLink` for links styled as buttons.
  - `Badge`: `tone` (amber/success/info/danger/neutral), `size`, `dot`, `pulse`.
  - `Banner`: `waiting|warning|info|success|danger`, `icon`, `action`. Roles stay alert/status.
  - `Card`: `default|interactive|active|dashed`, `padding`, plus `CardHeader/Title/Description/Content/Footer`.
  - `Tabs`: ARIA behaviour unchanged, with an optional count `badge`.
  - `EmptyState`, `Spinner`, `Dialog/Drawer`, `ChipGroup`: restyled only.
- **New** (each removes a listed duplicate):
  - `Field` (label, hint, error, render-prop ids; replaces 3 wrappers);
  - `Input`, `Textarea`, `Select`, `MoneyInput`;
  - `SelectableCard` (radio/checkbox card; 10 duplicates);
  - `SegmentedControl`;
  - `ProgressBar` (3 duplicates);
  - `Stepper` (wizard step cards) and `StepTimeline` (8-node horizontal; current `StepStatus` badge kept);
  - `Section` (heading + aria-labelledby; 19 duplicates);
  - `PageHeader` (6 duplicates);
  - `CopyButton` and `CodeBox` (2 + 2 duplicates);
  - `ListBox` (divided list container; 8 duplicates);
  - `InfoBox` (3 duplicates);
  - `Collapsible` (`<details>`; 2 duplicates);
  - `StatCard`;
  - `Screenplay` (cream document box used by script, review, home hero);
  - `KeyValueList`;
  - `Breadcrumb`;
  - `ErrorText` (`role=alert`; 11 duplicates);
  - `ComingSoon` (placeholder wrapper: disabled, badge, aria-disabled, i18n "Coming soon").
- **Prop conventions:** props extend native element attributes, `className` merged last via `cn` (now `twMerge(clsx)`), `forwardRef` where a ref is useful (inputs, buttons). Exported `XProps` interfaces.

### B.5 Classes (only where state plus lifecycle justify one)

- `ApiError` (exists).
- `UploadQueue`:
  - wraps today's `uploadStore` module state;
  - API: `enqueue`, `cancel`, `dismiss`, `subscribe`, `getSnapshot`; constructor takes `send`;
  - a singleton instance is exported plus a `useUploads` hook (`useSyncExternalStore`);
  - it keeps the `__testing.setSender` seam via the constructor.
- `ErrorBoundary` (React needs a class).
- Everything else stays functions and hooks.

### B.6 Utils (single home, deduplicated)

- `utils/format.ts`:
  - `fmtMoney` (also used by `adapters.ts:189`, which builds `$` by hand today);
  - `fmtDuration`, plus `fmtLength`, which moves here from `media.ts` (the `ReferenceInsights.tsx:12` inline seconds also uses it);
  - `fmtResolution(w,h|"WxH")` (replaces the 3 copies);
  - `fmtFacts([...])` (" · " join);
  - `fmtAgo`, `fmtClock`, `fmtBytes`.
- `utils/routes.ts`: `projectPath(id)` (4 inline copies) and `newVideoPath(step?)`.
- `utils/errors.ts`: `errorText(err)` (ApiError detail → message; 4 copies) and `fieldErrors` (moved).
- `utils/clipboard.ts`: `copyText` + `useCopied(timeout)` (used by `CopyButton`).
- `utils/cn.ts`: `twMerge(clsx(...))`.
- `content/labels.ts`: single `RUNTIME_LABELS`, `MUSIC_SOURCES`, `RUNTIMES` (removes the copies in `ConceptView.tsx:8`, `ProposalPicker.tsx:16`, `review.ts:79`).

### B.7 Screen → component map

| Screen | Route page | Feature components | Primitives | Hooks |
|---|---|---|---|---|
| Shell | `AppShell` | Header, NavLinks, LivePill, SpendPill, NotifyToggle, Footer | Button, Badge, Select | useSession, useMonthSpend, useSettings, useTheme, useLocale |
| Home | `routes/home` | WaitingHero, ProjectGrid, ProjectCard, DemoCards, ShortcutCards, UnlockMoreCard | PageHeader, Section, Card, Screenplay, ProgressBar, ChipGroup | useProjects, useProject (hero), useDemos, useDemoRender, useSetup |
| Wizard | `routes/new` | WizardPage, Stepper, GoalStep, FootageStep, BriefStep, LookStep, ReviewStep, MusicPicker, DropZone, FileRow | SelectableCard, SegmentedControl, Field, Input, Textarea, StickyActionBar, Collapsible, ComingSoon | usePipelines, useStyles, useSetup, useUploadLimits, useMusic, useCreateProject, useWizard |
| Project | `routes/project` | ProjectHeader, StatusBanner, StepTimeline, KickoffPanel, InputsPanel, ReviewPanel, SentCard, ApplyingCard, ProposalPicker, StepList, ActivityView, ScriptView, StoryboardView, DecisionsView, BriefView, ConceptView, ResultPanel, PublishKit, CostPanel | Breadcrumb, Banner, Tabs, Card, CodeBox, CopyButton, Screenplay, KeyValueList, ComingSoon | useProject, useKickoff, useDecisions, useSubmitDecision, useRetractDecision, useInputs, useResults, useProjectCost, useUploads |
| Library | `routes/library` | LibraryStats, LibraryToolbar, ReviewNowCards, ProjectCard, DemoCards | StatCard, Input, Select, ChipGroup, Section | useProjects, useMonthSpend |
| Setup | `routes/setup` | TierHero, CapabilityGrid, VideoTypeList, UnlockCard, KeyForm | Card, Badge, Collapsible, InfoBox | useSetup, useRecheck, useSaveKey |
| Settings | `routes/settings` | SettingsForm, LanguageSection, SpendingSection, DefaultsSection | SelectableCard, MoneyInput, Select, StickyActionBar | useSettings, useSaveSettings |

---

## Part C — Phases and steps (tracked in STATUS.md, Phase D)

Phase D in STATUS is rewritten into the steps below.
- D.1 (connect) is done.
- **D.2/D.3 are marked done**, because the user designed the screens in Stitch.
- After each step: `make studio-check` green → tick the box in STATUS with a one-line note (what changed and which tests) → update "Last update".
- A real-server Playwright check runs at the end of each screen phase.

**D.4 Reference and foundation**
- D.4.1 Save the Stitch references: `docs/ui-plan/design/stitch/<screen-id>.png` (downscaled) and `.html`. Map the 13 Stitch titles to the screen ids in `stitch.md` §2.2. Record the backlog E-1…E-27 in STATUS.
- D.4.2 Add the deps `lucide-react`, `tailwind-merge`, `class-variance-authority`. Change `cn` to `twMerge(clsx-like)`, keeping its signature. Add `components/icons.ts`.
- D.4.3 Tokens in `index.css`:
  - add the new tokens from `index.css_token_export.txt` (surface-container-*, accent-hover/active, shadow-glow, radius scale, text-muted);
  - derive light-theme equivalents;
  - map the old `surface-2`/`surface-3` utility names onto the new scale so nothing breaks;
  - leave `board.css` untouched;
  - contrast check in both themes.

**D.5 Code organisation (no visual change)**
- D.5.1 `services/` + `types/api/` + `hooks/api/` split, with `endpoints.ts` and `queryKeys.ts`. `lib/api` becomes a re-export shim. `sendFile` reuses the http error parsing. Settings hooks move to `settings.ts`. `useRecheck` and `useSession` are added.
- D.5.2 `utils/` consolidation (B.6) and single label tables. Tests for `fmtResolution`, `fmtFacts`, `projectPath`, `errorText`.
- D.5.3 `UploadQueue` class (same behaviour, with the injected sender) and the shared `useUploadsSync`.
- D.5.4 Move the wizard to `features/wizard` (with `useWizard` extracted); `routes/new.tsx` becomes a thin page. Lazy-load the routes in `router.tsx` (also fixes the 650 kB bundle warning).
- D.5.5 Remove the shim and the unused `PagePlaceholder.tsx`. All imports go through the new paths.

**D.6 Primitives and shell**
- D.6.1 Restyle the existing primitives (B.4) with cva.
- D.6.2 New primitives (B.4 list), with focused unit tests: `Field` ids/errors, `SelectableCard` radio semantics, `CopyButton`, `ComingSoon` aria-disabled.
- D.6.3 Replace the duplicated markup across features with the primitives, with no layout change yet. Existing tests stay green.
- D.6.4 Header/AppShell/Footer per the canonical shell (LivePill from the `useSSE` status, SpendPill, NotifyToggle, New video CTA, avatar `ComingSoon`). New i18n keys in en and vi.

**D.7 Wizard screens.** Steps D.7.1 Goal (with `category` in `goals.ts`), D.7.2 Footage, D.7.3 Brief, D.7.4 Look, D.7.5 Review, D.7.6 Stepper + sticky action bar + "Save draft" `ComingSoon`. Each: layout per Stitch, placeholders, en/vi, tests updated, one `vi` test.

**D.8 Project page**
- D.8.1 Header + StatusBanner + StepTimeline + the section table by status.
- D.8.2 Kickoff state.
- D.8.3 Running state (StepList, agent log, the E-15/E-16 placeholders).
- D.8.4 Review + Sent + Applying (split `ReviewPanel`; behaviour unchanged).
- D.8.5 Done state (ResultPanel tabs, PublishKit, facts, cost ledger).
- D.8.6 Tabs and artifact views restyle (Screenplay, scene cards).

**D.9 Home and Library**
- D.9.1 Home (WaitingHero, filter chips, grid, demos, shortcuts).
- D.9.2 Library (stats, review-now, toolbar, series sections, placeholders).

**D.10 Setup and Settings**
- D.10.1 Setup (tier hero, capability grid, video types, unlock cards, collapsibles).
- D.10.2 Settings (section cards, radio cards, sticky save bar, discard).

**D.11 Verify and close**
- `make studio-check`.
- Python `tests/backlot tests/contracts` (unchanged, sanity).
- Playwright on the real server: every route × dark/light × en/vi, plus the state fixtures (`/tmp/pwshot/stitch-fixture.py`, `p6-fixture.sh`). Compare against the Stitch PNGs and save shots to `docs/ui-plan/design/after/`.
- Keyboard pass and axe-style contrast spot checks.
- Update `04-ui-flows.md` (screen names and components), `stitch.md` §3 (as built), and STATUS (counts, deviations, "Resume here").
- Mark D done.

**Proposed Phase E (backlog, not started):** backend support for the placeholders (E-1…E-27), each listed in STATUS with the screen and the data it needs. Start only when the user asks.

