# Phase 3 — Assembly & End-to-End

**Goal.** Turn the worker's passed assets into `renders/final.mp4` deterministically (no LLM), and prove the whole chain on a 30 s sample.

## Decision: plain-ffmpeg assembler, not `VideoCompose.render`

Investigated 2026-11-17 (see STATUS notes). `VideoCompose.render` is unsuitable for spec-mode:
- its slideshow-risk gate can block a render and has no off switch;
- it does not mix narration/music/ducking from `edit_decisions` (only muxes one pre-mixed file);
- it does not hold/pad short clips (timeline drifts), rejects images under ffmpeg, ignores transitions, and burns subtitles only from a real SRT path.

So spec-mode uses its own small ffmpeg assembler. `edit_decisions.json` is still written (schema-valid, `render_runtime: "ffmpeg"`) as the record Studio and the agent can read, but it is an output of assembly, not the input to `VideoCompose`.

## Scope

### 1. `lib/spec_to_edit.py` (pure, no ffmpeg)

- `plan_timeline(spec, durations) -> Timeline`: per scene `{scene_id, start, end, narration_seconds, visual_job, narration_job, source_kind}`.
  - Window = spec window, **extended** when the measured narration is longer (`end = start + narration`); later scenes shift. Each change is recorded in `timing_adjustments`. The script is the authority; speech is never cut.
  - Visual = the scene's `video` job (preferred) else `image` job. Requires all of a scene's jobs `passed`.
- `build_srt(spec, timeline) -> (srt_text, cues)`: sentence split of the scene's script text; cue times proportional to character count inside `[scene.start, scene.start + narration_seconds]`. **Never from STT.**
- `build_edit_decisions(spec, timeline, output_rel) -> dict`: one cut per scene (`source` = project-relative asset path, `in_seconds: 0`, `out_seconds` = min(clip, window)), `audio.narration.segments`, `audio.music` (volume from dB, fade, ducking enabled), `subtitles` (`source`: sidecar SRT), `transitions`, `metadata{target_duration_seconds, timing_adjustments, compose_target}`. Validates against `edit_decisions.schema.json`.

### 2. `lib/spec_assembler.py` (ffmpeg only)

`assemble(project_dir, spec, report, *, ffmpeg_runner=None) -> AssemblyResult`:
- Target size from `spec.aspect_ratio`: 16:9 → 1280×720, 9:16 → 720×1280, 1:1 → 720×720; 30 fps; libx264 + aac.
- **Segment per scene** with exact window length: video clips scaled/padded to the target, trimmed to the window, **last frame held** (`tpad stop_mode=clone`) when shorter. Images become a fixed slow zoom (`zoompan`, deterministic). `transition_in` of `fade|crossfade|dip_to_black` renders as a fade-in/out inside the segment (no overlap, timeline length stays exact); `crossfade` is treated as `fade`.
- **Concat** segments (identical encode params → stream copy).
- **Audio:** each narration wav placed at its scene start (`adelay`), summed; music trimmed/looped to total length at `music_volume_db`, with a volume cut of `music_duck_db` only during narration windows (`volume=enable='between(t,s,e)'`), fade-in 0.5 s and fade-out 2 s.
- **Subtitles:** always write sidecar `renders/final.srt` and embed it as a soft `mov_text` track. Burn into the picture only when ffmpeg has the `subtitles` filter (libass); the dev machine's ffmpeg does not, so soft + sidecar is the guaranteed path and a warning is recorded when burn was requested but unavailable.
- Writes `artifacts/edit_decisions.json`, `renders/final.mp4`, `renders/final.srt`, `artifacts/render_report.json`.

### 3. Final checks (`lib/spec_verifier.final_check`)

- Output duration within ±1 s of the adjusted timeline length.
- Every scene has a visual and narration in the timeline.
- SRT text, concatenated and normalised, equals the concatenated script text of the scenes.
- Audio stream present; no silence longer than 1.5 s *inside* a narration window (`silencedetect`).
- Results stored in `render_report.verification_notes`; any failure sets `metadata.final_check = "failed"` and the CLI exits non-zero.

### 4. CLI

`python -m backlot render <id> [--only a,b] [--no-compose]`: after a `complete` worker run, assembles unless `--no-compose`. Partial runs never assemble (print which jobs need replan).

### 5. End-to-end sample

Fixture intake `tests/fixtures/planner_worker/intake_30s.json` and a documented manual run:

```
/spec-reel Continue Studio project <id>   # agent: requirements -> Gate 1 -> spec -> Gate 2
.venv/bin/python -m backlot render <id>    # Gemini only, then assembly (run by the agent after approval)
```

Record in STATUS.md: Claude tokens for the two planning passes, Gemini cost, retries needed, verifier false positives.

## Acceptance

- `spec_to_edit` unit tests: window extension + shifting, SRT == script text, music ducking windows, edit_decisions schema validity, determinism (same inputs → identical output).
- Assembler test with ffmpeg-generated fixtures (solid-colour clips, a still image, sine "narration") produces an mp4 passing `final_check`: clip shorter than window is held, image scene works, fade scene keeps length.
- Manual E2E completes; Claude calls during `render` == 0.

## Notes

- Env vars the user sets (never commit values): `GEMINI_API_KEY` or `GOOGLE_API_KEY` (worker + vision judge), optional `GEMINI_VISION_MODEL`. No Anthropic key: the agent is the planner.
- Remotion/HyperFrames paths are out of scope for spec-mode v1.
