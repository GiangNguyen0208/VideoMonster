# S1 — Requirements stage

Goal: make the user's request explicit **before** any script exists, so the spec can be proven to answer it. Do this for **every** request, from "make a 10 s logo sting" to a 3-minute explainer. Depth scales; the sections never disappear.

Output: `projects/<id>/artifacts/requirements_brief.json`, `approval: {"status": "pending"}`. Worked example: `example-requirements-brief.json` (validated by a test; copy its shape).

## Field guide

| Field | Write |
|---|---|
| `request` | The user's words, verbatim (intake `brief.topic` + notes). Never paraphrase here |
| `summary` | 1–2 sentences: what will exist when this succeeds |
| `constraints` | From the intake/request: `duration_seconds`, `aspect_ratio`, `platform`, `tone`, `budget_cap_usd` (0 = the user wants nothing paid → say so at the gate), `must_include`, `avoid`. Do not invent constraints the user did not give; put guesses in `assumptions` |
| `goals` | What the video must achieve for the viewer. Each has a `success_check` a reviewer can verify from the finished video. 1 goal for a tiny request, 2–5 normally. Every goal will be tied to scenes by `serves` |
| `non_goals` | What this video deliberately will **not** do (scope fences: no extra statistics, no brand claims, no second language…). At least one. They protect the user from scope creep and you from guessing |
| `scenarios` | Viewer scenarios: *who* watches, *in what situation* (sound off? feed? classroom?), *outcome* afterwards. They decide subtitles, pacing and the hook. At least one |
| `assumptions` | Everything you decided without being told (voice, footage style, language variant). The user can veto each |
| `open_questions` | Only questions whose answer changes the video and that *you* could reasonably default. Each has a `default_answer` so the user can just accept. Prefer 0–3. Never ask what the intake already answers |
| `inputs` | What **only the creator can supply**: language, voice, their own recording, their own line, a character image, music, subtitles, a logo. Typed, required or optional (see "Creator inputs"). Answered at Gate 1 |
| `improvements` | Upgrades beyond the literal request (see below) |

## Creator inputs — ask for what only the creator has

`open_questions` are things you can default; `inputs` are things you must not guess (whose voice, whose logo). Each input: `id`, `label`, `help`, `kind` (`text` | `choice` | `file` | `boolean`), `required`, plus `options` (choice), `accept` (`image`|`audio`, file), `default_answer`, `required_if {input, equals}` and `binds`. **`binds` is what makes the answer binding**: `spec check` proves the spec honoured it.

Always propose these (drop the ones the request makes pointless; a tiny request may only need the first two):

| `binds` | kind | required | Spec must then… |
|---|---|---|---|
| `language` | choice | **required** (no default unless the request names one) | `spec.language` == answer; script and subtitles in it |
| `voice_source` (`gemini`/`upload`, default `gemini`) | choice | required (has default) | `gemini` → all tts jobs `gemini_tts`; `upload` → all tts jobs `provided_audio` |
| `voice_id` (default `Kore`) | choice | optional | tts `params.voice_id` == answer |
| `voice_style` | text | optional | tts `params.style` contains the note |
| `voice_file` | file/audio | `required_if voice_source = upload` | tts jobs: tool `provided_audio`, `params.source_path` == the path |
| `dialogue` | text | optional | the line appears verbatim in the script (otherwise you write it) |
| `character_ref` | file/image | optional | a visual job passes that path as `reference_image_path` (`operation: image_to_video`) |
| `character_notes` | text | optional | use it in the prompts (not machine-checked) |
| `music_source` (`none`/`file`/`generate`, default `none`) | choice | optional | `none` → no music job; `file` → `provided_music`; `generate` → `google_music` |
| `music_file` | file/audio (pick from the library or upload) | `required_if music_source = file` | `provided_music` `source_path` == the path |
| `subtitles` (default `true`) | boolean | optional | `false` → `audio_plan.burn_subtitles: false` |
| `logo_file`, `logo_position` | file/image, choice | optional | `brand_overlay.path` == the path (+ position) |

Rules: an input id must not repeat an open-question id; two inputs never bind the same field; a file input never has a default; never ask for a photo of a real person (characters are generated or creator-drawn, fictional adults). Required inputs block approval, in Studio and in `requirements approve` (`--answer in_lang=vi`). Where a sensible default exists, give it and make the input optional instead of blocking the user.

## Improvements — propose, recommend, let the user pick

Look for upgrades that make the video better for the *goals and scenarios* (not generic polish): background music, hook rewrite for sound-off viewing, a stronger closing call, consistent character/look across shots, an extra scene for a goal that is thinly served, a vertical cut, a second language. For each:

- `cost_delta_usd`: honest estimate (Gemini video ≈ $0.10 per output second, music/image/TTS cents; use the capability notes in `planning-rules.md`). Negative if it saves money.
- `risk`: `low` (extra independent job), `medium` (adds a dependent job or tighter timing), `high` (may fail verification or change the look).
- `recommended`: mark the ones **you** recommend (at least one if any improvements exist; zero improvements is allowed only when truly nothing helps — say so in `assumptions`). `rationale` says why in one sentence, tied to a goal/scenario id.
- Never bundle: one improvement = one decision.
- Never apply an improvement the user did not pick. Unpicked ideas are dropped, not "slipped in".

## Scaling to the request

| Request size | Minimum brief |
|---|---|
| Tiny ("5 s intro with our name") | 1 goal, 1 non-goal, 1 scenario, ≤1 question, 0–2 improvements — still written, still approved |
| Normal (30–60 s explainer) | 2–4 goals, 2–3 non-goals, 2 scenarios, 0–3 questions, 2–4 improvements |
| Large (multi-minute, multi-language) | As above, plus an explicit phasing note in `assumptions`; consider asking the user to split the request |

## Checking and presenting

`python -m backlot requirements check <id>` (schema, unique ids, at least one recommended improvement). Fix and re-run (max 2 rounds).

Present at **Gate 1** in the user's language, in this order: summary → goals → non-goals → viewer scenarios → assumptions → open questions with defaults → improvements (mark **Recommended**, show cost delta and risk). Then ask: "Correct anything? Answer the questions or accept the defaults? Which improvements do you want?" **End the turn.**

Apply the answer: `python -m backlot requirements approve <id> --improvements i1,i3 --answer q1="…"` (omitted questions get their defaults). If the user changes goals/non-goals/constraints, edit the brief, re-check, re-present **only the changes**, and approve again — any content change invalidates the previous approval.
