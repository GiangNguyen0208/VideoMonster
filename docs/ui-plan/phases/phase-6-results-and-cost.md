# Phase 6 — Results & Cost

**Goal.** Users can get their finished video out easily, and always understand and control what a production costs.

**Use cases served:** UC7 (cost part), UC8.

## Scope

### 1. Results

- The project **Result** section shows:
  - the final video player;
  - render variants (all files in `renders/`, with labels from `render_report.outputs`);
  - per-output resolution, duration and size.
- **Download:** `GET /media/{id}/{path}` with `Content-Disposition`, added as an explicit `?download=1` flag on the existing route, or as a v1 alias.
- **Export bundle:** if the publish stage produced an `export_bundle`, offer it as a zip download. Otherwise show "Ask the agent to export" with an explanation.
- **Copy-ready text:** title, description and hashtags from `publish_log` / brief, each with a copy button.
- **Home → "Recent results"** gains download and open actions.

### 2. Cost

- **`GET /api/v1/projects/{id}/cost`**
  - Reads `projects/<id>/cost_log.json` (`schemas/artifacts/cost_log.schema.json`), as written by `tools/cost_tracker.py`.
  - Returns:
    - a snapshot: `total_spent_usd`, `total_reserved_usd`, `budget_remaining_usd` (same fields as `CostTracker.cost_snapshot()`);
    - per-tool and per-stage breakdowns;
    - entries by status (estimated / reserved / completed / failed / refunded).
- **Project cost panel:**
  - a spent / reserved / remaining bar against the cap;
  - a breakdown table;
  - the budget mode (`observe` / `warn` / `cap`) with a plain explanation;
  - "Free (local)" labels for $0 tools.
- **Library:** cards show spent cost, and the library header shows the month-to-date total.

### 3. Settings (`/studio/settings`)

- **`GET/PUT /api/v1/settings`**: reads and writes the allowlisted parts of `config.yaml`, validated through `lib/config_model.py`:
  - `budget.mode`, `budget.total_usd`, `budget.single_action_approval_usd`, `budget.require_approval_for_new_paid_tool`
  - `checkpoint.policy`
  - `output.resolution`, `output.fps`
- Writes are atomic and keep comments where possible (`ruamel.yaml`, or a documented fallback).
- **UI:** a "Spending" section in plain language ("Ask me before any single action over $0.50") and a "Defaults" section for resolution, fps and review policy, with the engine term in a tooltip.

## Localization (en, vi)

- All new strings go into both `studio/src/i18n/en.ts` and `vi.ts` (see `03-architecture.md` §8). The catalog parity test must pass, and at least one Vitest page test runs in Vietnamese.
- **Formatting.** Money, numbers and dates use `Intl` with the current locale: `vi-VN` uses `.` for thousands and `,` for decimals; amounts stay in USD. Move `fmtMoney` / `fmtBytes` / `fmtClock` to locale-aware versions and test both locales.
- **Settings.** The new sections (spending limits, review policy, output defaults) sit next to the existing Language card; option labels are translated, while values written to `config.yaml` stay as engine ids.
- Export bundle file names and contents stay English (they are files, not UI).

## Files

- **New:** `backlot/studio_cost.py`, `backlot/studio_settings.py`, `studio/src/features/{result,cost,settings}/**`, `studio/src/routes/settings.tsx`, tests
- **Modified:** `backlot/server.py` (download flag on `/media`), `backlot/studio_api.py`

## Acceptance criteria

- The final video downloads from Studio in 2 clicks from Home.
- The cost panel totals match `cost_log.json` exactly on fixture ledgers, including refunded and failed entries.
- A settings change is reflected in `config.yaml`, validates, and is picked up by the next agent run.
- An invalid settings value returns 422 with a field-level message.

## Test plan

- **pytest:** cost aggregation over fixture ledgers (every status); settings round-trip and validation; download headers; path guard on download.
- **Playwright:** result player and download; cost panel numbers; settings form validation.

## Implementation notes

- **Results** (`backlot/studio_results.py`).
  - `GET /api/v1/projects/{id}/results` returns render variants (board renders joined with `render_report.outputs` by path), publish text and export info.
    - Label and facts come from the report; ffprobe fills resolution and duration when the report has none. Results are cached by path, mtime and size.
    - **Copy text** comes from the newest `publish_log` entry with `metadata_used`, falling back to the project title. Hashtags get a `#` prefix.
    - **Export** is the newest `exported` entry whose `export_path` resolves inside the project; paths outside it are ignored.
  - `GET /api/v1/projects/{id}/export` sends a file export as-is. A folder export is zipped into a temp file: media is stored, text is deflated, symlinks are skipped, and the temp file is deleted after sending.
  - **Download:** `/media/{id}/{path}?download=1` adds `Content-Disposition: attachment`; the path guard is unchanged.
  - **UI** (`features/result/ResultPanel.tsx`, which replaces Phase 1's `ResultView`): player, Download button, version list (label, facts, per-file download), "Ready to post" with copy buttons, export card.
  - **Home → Recent results:** each card has Download and Open links, so a finished video is one click from Home.
- **Cost** (`backlot/studio_cost.py`).
  - `GET /api/v1/projects/{id}/cost` takes its totals from `CostTracker.cost_snapshot()` itself, so they match the agent's numbers exactly. If the tracker can't load the log, the same sums are computed directly.
  - The budget is the log's `budget_total_usd`, else the Studio intake's `cap_usd`, else `config.yaml`.
  - **Stage attribution.** `cost_log.json` has no stage field, so an entry belongs to the first stage whose checkpoint timestamp is at or after it. Later entries go to the next stage without a checkpoint.
  - **"Free (local)"** means a tool never priced above $0. A refunded paid tool shows $0.00, not "free".
  - `GET /api/v1/cost/summary?since=<ISO with zone>` returns money spent (completed and failed entries) across projects. The Library uses the local month start.
- **Settings** (`backlot/studio_settings.py`).
  - `GET/PUT /api/v1/settings` covers `budget.{mode,total_usd,single_action_approval_usd,require_approval_for_new_paid_tool}`, `checkpoint.policy` and `output.{default_resolution,default_fps}`. The spec's `output.resolution` and `output.fps` are named `default_*` in `config.yaml`.
  - Validation is Pydantic with `extra="forbid"`. Resolutions and fps come from fixed lists (`choices` in the GET). A bad value is a 422 with `loc` = `body.section.key`, and the UI marks that field.
  - **No `ruamel.yaml`.** The fallback edits the matching `key: value` lines in place and keeps comments in their column. A missing key goes at the end of its section, and a missing section is appended. The result must round-trip through `yaml.safe_load` and `OpenMontageConfig`, and is written atomically. `STUDIO_READONLY_CONFIG=1` turns writing off (403).
- **"Picked up by the next agent run".** Before this phase nothing read `config.yaml` except the model class. `AGENT_GUIDE.md` (infrastructure files) now tells the agent to:
  - build `CostTracker` from `OpenMontageConfig.load().budget`;
  - use `checkpoint.policy` and the output defaults;
  - re-read the file at the start of each production.
- **Formatting.** `fmtMoney` uses `Intl` currency formatting: `$1,234.50` in en and `1.234,50 US$` in vi, with up to 4 decimals for sub-cent amounts. `fmtBytes` was already locale-aware (Phase 5).
