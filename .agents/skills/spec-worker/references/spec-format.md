# production_spec — field reference

File: `projects/<id>/artifacts/production_spec.json`. Schema: `schemas/artifacts/production_spec.schema.json` (do not read it; this page is the contract). Worked example: `example-production-spec.json` (validated by a test).

You write everything **except** `version`, `project_id`, `requirements_hash`, `spec_hash` — `spec check` fills those.

## Top level

| Field | Meaning |
|---|---|
| `language` | Narration language (`en`, `vi`, …); must equal the brief's |
| `duration_seconds` | Target length; within ±15 % of the brief's (the real length follows the narration) |
| `aspect_ratio` | `16:9` \| `9:16` \| `1:1`; must equal the brief's. Gemini video only does 16:9 and 9:16 |
| `style_summary` | One paragraph of visual/tonal direction. **Repeat its essentials in every visual prompt** — jobs share no memory |
| `applied_improvements` | Exactly the improvement ids the user picked |
| `brief` | Echo of topic/audience/tone/hook (informational) |
| `script.sections[]` | `{id, text}` — the **verbatim narration**. TTS reads it exactly; subtitles are built from it |
| `scenes[]` | Contiguous timeline from 0 to `duration_seconds`. `{id, start_seconds, end_seconds, script_section_id, description, serves[], transition_in}` |
| `brand_overlay` | Optional `{path, position, scale, margin}`: the creator's logo, overlaid on the last scene. `path` is a project-relative image (`inputs/logo.png`); part of the sealed content |
| `audio_plan` | `music_volume_db` (music level when nobody speaks, default −12), `music_duck_db` (extra cut under speech, default −10), `burn_subtitles` |
| `jobs[]` | One per asset; see below |
| `estimated_total_cost_usd` | Sum of the jobs' `estimated_cost_usd` |

### scenes

- One script section per scene (`script_section_id`). A section may be reused by no more than one scene.
- `serves`: goal ids from the approved brief. Every goal must appear in at least one scene.
- `transition_in`: `cut` (default), `fade`, `crossfade` (rendered as fade), `dip_to_black`.
- If real narration turns out longer than the window, the assembler extends the scene and shifts the rest; speech is never cut. Plan windows with the words-per-second rule in `planning-rules.md` so this stays rare.

## jobs

```json
{
  "job_id": "vid_s1",              // unique
  "scene_id": "s1",                // omit only for music
  "kind": "video",                 // video | image | tts | music
  "tool": "gemini_omni_video",     // must match kind (table below)
  "params": { ... },               // exact tool input — see planning-rules.md; NEVER include output_path
  "depends_on": ["img_s1"],        // optional; job ids that must pass first
  "input_from": {"reference_image_path": "img_s1"},  // optional; param name -> job whose output file is injected; the source must also be in depends_on
  "output_path": "assets/video/s1.mp4",   // project-relative, no "..", tts must end in .wav
  "acceptance": { ... },           // what "correct" means; see acceptance-and-retry.md
  "retry_ladder": [ {"note": "...", "params_patch": {"prompt": "..."}} ],  // applied in order on failed attempts (shallow merge over params)
  "fallback_tool": {"tool": "google_imagen", "params": { ... }},           // optional last resort, Gemini tools only
  "estimated_cost_usd": 0.6
}
```

| kind | tool | notes |
|---|---|---|
| `video` | `gemini_omni_video` | clip length is model-chosen (3–10 s); never assert exact duration |
| `image` | `google_imagen` | `params.model` **must** be one of the `gemini-*` image models |
| `tts` | `gemini_tts` | `params.text` == section text == `acceptance.expected_text`; output `.wav` |
| `music` | `google_music` | at most one; no `scene_id` |

## Creator-supplied files (local passthrough tools)

Two extra tools copy the creator's own files instead of generating (cost 0, no model call): `provided_audio` (kind `tts`; `params: {source_path}`; output must still be `.wav`; **no** script-text check and no `expected_text`; leave `acceptance.duration_seconds` unset so a longer recording stretches the scene) and `provided_music` (kind `music`; `params: {source_path}`). `source_path` is project-relative inside `inputs/` (what Studio stores). `reference_image_path`-style params may also be `inputs/...`; the worker resolves them. Script text for an uploaded voice must still be the words actually spoken, because subtitles come from it.

## What `spec check` enforces (so you know what will bounce)

Schema; unique ids; scenes contiguous and ending at the duration; every scene's section exists; narration fits its window; Gemini-only tools and matching kinds; tools available on this machine; per scene ≥1 `tts` and ≥1 `video`/`image` job; tts text verbatim; visual jobs have `must_show`/`must_not_show`; `input_from` ⊆ `depends_on`; no dependency cycles; no `params.output_path`; paths stay in the project; imagen model valid; and, against the approved brief: hash match, every goal served, applied improvements == picks, `must_include` present as whole words, `avoid` absent, duration/aspect/language, budget cap (a cap of 0 rejects any paid spec — ask the user to raise it); and the creator's input answers (language, voice source/id/style/file, dialogue verbatim, character image used, music source, subtitles, logo).

## Hashes and approval

`spec check` seals `spec_hash` over script, scenes, jobs, audio_plan, requirements link and applied improvements. Any later edit changes the hash, clears the approval, and the worker refuses an unapproved or modified spec. History is kept in `artifacts/production_spec.history/`.
