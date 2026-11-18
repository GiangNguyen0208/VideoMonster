# Acceptance checks and retry ladders

The worker is a judge-and-retry loop with **your** rules. It cannot improvise: it checks each output against `acceptance`, and on failure applies the next step of `retry_ladder`, then `fallback_tool`, then marks the job `needs_replan`.

## acceptance by kind

| kind | Fields | How it is checked |
|---|---|---|
| `video` / `image` | `must_show[]`, `must_not_show[]`, `vision_pass_ratio` (default 1.0), `min_width`, `min_height`, `aspect_ratio`, `expect_audio` | ffprobe for size/aspect/audio; a Gemini vision judge answers each question per sampled frame set (3 frames for video, 1 for images) |
| `tts` | `expected_text`, `max_wer` (default 0.15), `duration_seconds` (the scene window), `duration_tolerance_seconds` | speech-to-text word error rate vs the text; length ≤ window + tolerance. If no speech-to-text is installed the text check is skipped with a warning |
| `music` | `duration_seconds`, `duration_tolerance_seconds` | length ≥ target − tolerance; not silent |

Do not put an exact `duration_seconds` on a **video** job — Gemini chooses clip length; the assembler trims or holds.

## Writing vision questions

- 2–4 per visual job; each a short **yes/no question about what is visible**, answerable from a still frame: "Is a bee clearly visible?" not "Does it feel warm?".
- `must_show`: the things that make the shot *this* shot (subject, key object, setting). `must_not_show`: recurring failure modes ("Is there any text or watermark?", "Is a person visible?" when none was asked for, "Are there extra limbs/distorted faces?").
- Keep them independent of one another and of camera motion (frames are sampled).
- `vision_pass_ratio`: 1.0 for hero shots; 0.75 for busy scenes where one question may fail on a sampled frame.
- Do not copy the generation prompt into the questions; they are the *test*, the prompt is the *attempt*.

## retry_ladder

Each step is `{"note": "...", "params_patch": {...}}` shallow-merged over the **original** `params` (not cumulative). Attempt 1 = original, attempt 2 = step 1, …

| Failure you expect | Ladder pattern |
|---|---|
| Subject missing/wrong in a video | Step 1: shorter, simpler prompt naming the subject first. Step 2: concrete single-action prompt, no camera move |
| Stray text/people/watermark | Step 1: add explicit "No text, no captions, no people, no logos" and drop any word that invites text |
| tts misreads words | Step 1: `style` → "calm, clear, steady pace"; optionally respell a hard word phonetically **in `style` only** (never change `text`) |
| Image off-style | Step 1: restate palette/lighting; step 2: a different `model` from the allowed list |
| Music too busy | Step 1: "very sparse, minimal, soft, instrumental" |

Rules: 1–2 steps per visual job, 1 per tts. A step may never change the story, the subject's identity, or `text` for tts. Each attempt costs money; do not add steps "just in case".

## fallback_tool

Optional, Gemini-family only (`{"tool": ..., "params": {...}}`). Use for a graceful degrade that **still satisfies the scene**, e.g. a hero `video` job falling back to a `google_imagen` still of the same prompt (the assembler gives stills a slow zoom). Only add it if the approved brief tolerates stills for that scene; otherwise leave it out and let the job go to `needs_replan` so the user decides. Remember a fallback that changes the treatment must be visible at Gate 2 — say so in the summary.
