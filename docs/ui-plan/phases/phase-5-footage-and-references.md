# Phase 5 — Footage & References

**Goal.** Footage-led video types and "make something like this" work end to end from the browser. Users upload or link their source material, and the agent finds it in a predictable place.

**Use cases served:** UC4 (upload), UC5.

## Scope

1. **Uploads**
   - **`POST /api/v1/projects/{id}/uploads`**: streamed or chunked upload into `projects/<id>/inputs/<safe-name>`.
     - Size cap, set by `STUDIO_MAX_UPLOAD_MB` with a generous default.
     - Extension and MIME allowlist: video, audio, image, subtitle.
     - The path is resolved and checked with `relative_to(project_dir)`, the same guard as `/media`.
     - Duplicate names get a suffix.
   - After an upload completes, the server runs `ffprobe` (via the existing `audio_probe`/`video_analyzer` helpers where they fit) to record duration, resolution and codec.
   - Every upload is indexed in `studio/inputs.json`: `{files:[{path, kind, size, duration_s, width, height, uploaded_at}], references:[...]}`.
   - **`DELETE /api/v1/projects/{id}/uploads/{name}`**: allowed only while the first checkpoint does not exist yet.
2. **References**
   - **`POST /api/v1/projects/{id}/references`**: `{url, notes}`, appended to `studio/inputs.json`.
   - The URL is validated as http(s) only. The server does **not** fetch it; the agent's reference-analysis flow (`skills/meta/video-reference-analyst.md`) does.
   - A reference *file* is an upload with `kind: "reference"`.
3. **Wizard changes**
   - Footage goals (hybrid, talking-head, clip-factory, podcast-repurpose, localization-dub) insert an **"Add your footage"** step after the goal step.
   - That step has drag-and-drop, per-file progress, a preview player and duration/size checks. A goal can declare a minimum or maximum, e.g. clip-factory expects a long source.
   - localization-dub asks for target languages.
   - screen-demo offers "Upload a recording" or "Let the agent create a synthetic terminal demo", which maps to its `production_modes`.
4. **Music library**
   - A picker that lists the files in `music_library/` (created on demand).
   - Users can upload tracks there.
   - A choice feeds the proposal review's "Music: library" option.
5. **Agent contract, part 3**
   - `AGENT_GUIDE.md` "Studio intents" gains: *source media for this project is listed in `studio/inputs.json` and stored under `inputs/`; reference entries trigger the reference-analysis flow before pipeline selection is confirmed.*

## Localization (en, vi)

- All new strings go into both `studio/src/i18n/en.ts` and `vi.ts` (see `03-architecture.md` §8). The catalog parity test must pass, and at least one Vitest page test runs in Vietnamese.
- **Upload UI:** drop zone, progress, per-file states, the reference-link form and music picker labels.
- **Upload errors** (too large, unsupported type, path rejected) come back with a `code` and are translated in the UI; the size limit is formatted for the locale.
- File names, track titles and analysis output are data and are shown as-is.

## Files

- **New:** `backlot/studio_uploads.py`, `studio/src/features/uploads/**`, `studio/src/features/music/**`, tests
- **Modified:** `backlot/studio_api.py`, `studio/src/routes/new/**`, `studio/src/content/goals.ts` (footage requirements), `AGENT_GUIDE.md`

## Acceptance criteria

- A 1 GB video uploads with visible progress and without loading the whole file into server memory.
- Path-traversal names (`../x`, absolute paths, NUL bytes) are rejected. Disallowed types return 415.
- A real `talking-head` or `clip-factory` run started from Studio uses the uploaded file, with no manual file moves.
- A "make something like this" project shows, at its first review point, what the agent learned from the reference.

## Test plan

- **pytest:**
  - Streamed upload of a large synthetic file, with a memory ceiling.
  - Traversal and type rejections.
  - The ffprobe metadata path, using a small fixture clip.
  - `inputs.json` updates.
- **Playwright:** drag-drop upload, progress, preview, delete before kickoff.
- **Manual:** a real footage-led run.

## Implementation notes

- **Upload transport.** Each file is the raw request body of `POST /api/v1/projects/{id}/uploads?name=<file>&kind=footage|reference`. There is no multipart parsing, and `python-multipart` is not installed.
  - The server streams the body to a hidden `.partial-*` file in 1 MB writes, then renames it, so the agent never sees half a file.
  - The size cap is checked against `Content-Length` and again while counting bytes.
  - Error responses are `{detail, code}`. Codes: `bad_name` (400), `empty_file` (400), `too_large` (413), `unsupported_type` (415), `already_started` (409), `unknown_file` (404).
- **More endpoints:**
  - `GET /api/v1/uploads/limits`
  - `GET /api/v1/projects/{id}/inputs` (returns the index plus `started`)
  - `DELETE /api/v1/projects/{id}/references/{ref_id}`
  - `GET/POST /api/v1/music`
  - `GET /api/v1/music/tracks/{name}` (preview). The music folder is resolved like `tools/audio/music_library.py`: `MUSIC_LIBRARY_DIR`, otherwise `music_library/`.
- **Index entries.** `studio/inputs.json` file entries also carry `name`, `media` (`video`/`audio`/`image`/`subtitle`) and `codec`. References carry `id` and `source` (`wizard` | `studio`).
- **Wizard reference.** A link given in the wizard ("make something like this") is copied into `inputs.json` when the project is created.
- **The wizard uploads after creation.** The project folder only exists once the project is created, so:
  - The footage step checks each file on the client (type, size, and duration read by the browser against the goal's `min_s`) and previews it from a blob.
  - On create, the files go into an app-level upload queue (`features/uploads/uploadStore.ts`, one file at a time per target), and Studio navigates to the project.
  - The project page's "Footage & links" panel shows the same progress. While uploads run, a banner says to start the agent afterwards.
  - Refreshing the tab mid-upload drops the rest of the queue. The panel shows what arrived, and the user can add the rest again.
- **Footage needs** live in `studio/src/content/goals.ts` (`footage: {accept, min_s, optional, target_languages}`). clip-factory and podcast-repurpose need a 5-minute source. screen-demo's choice ("Upload a recording" / "Animated terminal") sets `production_mode`, so the brief step no longer shows that choice for it.
- **New intake fields:** `brief.target_languages` and `music_track`. **New proposal pick:** `music_track`, shown when "Music library" is picked at the proposal review point.
- **Reference results.** The board now loads `artifacts/video_analysis_brief.json` (`backlot/state.py` `ARTIFACT_FILES`). At the research/idea/proposal review points, the review panel shows "What the agent learned from your reference": summary, scenes and pacing, tone, closest style, what it plans to keep, and ideas for your own take.
- **Localized sizes.** `fmtBytes` now follows the UI language's number format.
