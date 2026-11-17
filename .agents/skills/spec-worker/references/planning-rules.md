# Planning rules (S2)

## Order of work

1. Read the approved brief (`artifacts/requirements_brief.json`, `approval.answers` and `selected_improvements` included).
2. Script first: write the narration, then cut it into sections, then scenes, then jobs. Never design shots before the words exist.
3. Tick the checklist at the bottom before running `spec check`.

## Script

- Language = brief language. Natural spoken sentences; no stage directions inside `text` (TTS would read them).
- Words per second: English ≈ 2.6, Vietnamese ≈ 3.0. Section words ÷ rate must be ≤ the scene window (the check allows 35 % slack; aim for ~85–90 % of the window so there are natural pauses).
- Hook in the first 3 seconds when the scenarios say sound-off/feed viewing; the first scene must read well as subtitles alone.
- Include every `must_include` phrase as whole words; never use an `avoid` phrase; respect every non-goal.
- Numbers, names and claims come only from the request or from facts you are certain of; otherwise leave them out (non-goals usually cover this).

## Scenes

- One idea per scene; one script section per scene; contiguous; total = `duration_seconds`.
- Typical window 3–8 s. Gemini clips are 3–10 s and model-chosen, so windows above ~8 s risk a held last frame — split them.
- Mark which goals each scene serves; a goal served only by a throwaway scene is a smell — strengthen it.
- Transitions: `cut` by default; `fade` after a time/place jump; `dip_to_black` only at a chapter break.

## Jobs per scene

Always, per scene: one `tts` job + one visual (`video`, or `image` when the brief tolerates stills). Plus at most one `music` job for the whole video, only if the brief/improvements want music.

Optional chain for consistency: `image` job (keyframe) → `video` job with `operation: image_to_video`, `depends_on` + `input_from: {"reference_image_path": "<image job id>"}`. Costs an extra job that can fail; use it only when the user picked such an improvement or a character/product must look identical across shots.

### Creator inputs in the plan

Read the approved answers (`approval.answers` in the brief) before writing jobs. Voice: Gemini voice → `gemini_tts` with `voice_id`/`style` from the answers; creator recording → `provided_audio`. A recording is one file and you cannot listen to it, so it cannot be split across scenes: plan **a single scene** (one section, one tts job) and say so at Gate 2, or, if the creator gave one file per scene, one `provided_audio` job per scene. Character image → pass `reference_image_path: "inputs/…"` with `operation: image_to_video` in the video job(s) (and describe the same person in `style_summary`); if the improvement "reference image first" was picked and the creator also gave a character image, the creator's image **is** the reference (skip the generated one). Music → `provided_music` / `google_music` / none per the answers. Logo → `brand_overlay`. Language → write the script in it.

### Prompts (visual)

- Self-contained: subject, setting, action, camera, light, mood, "no text, no people" when relevant. Include the `style_summary` essentials and any recurring character/place description **in every prompt** — there is no shared memory between jobs.
- One continuous shot per clip; say so. Describe motion that fits the window.
- Read `.agents/skills/gemini-omni/SKILL.md` before writing video prompts (reference tags, timecodes, what the model does well).
- Never rely on rendered text in the frame; subtitles are added later from the script.

## Gemini limits that shape the plan (current)

| Tool | Facts |
|---|---|
| `gemini_omni_video` | 720p; 16:9 or 9:16; clip length 3–10 s chosen by the model (the `duration` param is only a hint — don't use it as a promise); native synthesized audio (set `expect_audio` only if you need it); image input param is `reference_image_path`; operations `text_to_video`, `image_to_video`, `reference_to_video`; ≈ $0.10 per output second; no retries on an ambiguous transport failure |
| `google_imagen` | `params.model` ∈ {`gemini-nano-banana-2.1`, `gemini-3.1-flash-image`, `gemini-3-pro-image`, `gemini-2.5-flash-image`}; `aspect_ratio` 1:1, 3:4, 4:3, 9:16, 16:9 (Imagen proper needs Vertex — not available) |
| `gemini_tts` | `voice_id` (default `Kore`), `style` (delivery direction), `model_id` `gemini-3.8-flash-tts` or `…-lite-tts`; WAV output |
| `google_music` | `model` `lyria-3.5`; `duration_seconds` 5–184; instrumental prompts work best; output mp3 |

If a tool is unavailable at preflight or the plan needs something outside this table, do **not** substitute another vendor — tell the user what is blocked and what the options are.

## Cost

Sum `estimated_cost_usd` into `estimated_total_cost_usd`; it must stay ≤ the brief's `budget_cap_usd`. Quote video from clip count × ~6 s × $0.10 (the worker may spend on retries; keep ≥ 25 % headroom when possible). If the cap cannot fit the brief, say so at Gate 2 and offer cuts (shorter, fewer shots, stills for non-hero scenes) instead of silently shrinking the video.

## Checklist before `spec check`

- [ ] Every sentence of the script is in a section; every section in exactly one scene.
- [ ] Scenes contiguous to the duration; narration fits each window.
- [ ] Every goal in some `serves`; `applied_improvements` = the user's picks; nothing else slipped in.
- [ ] Every `must_include` present, every `avoid` absent, non-goals respected.
- [ ] Every scene has tts + visual; tts text identical to the section text.
- [ ] Every visual prompt is self-contained and carries the style essentials.
- [ ] Every visual job has 2–4 yes/no checks and a retry ladder; paths unique and project-relative.
- [ ] Cost total ≤ cap with headroom.
- [ ] Every creator input answer is honoured (language, voice, dialogue, character image, music, subtitles, logo).
