# Phase 2 — Worker & Verifier

**Goal.** Given an approved, sealed spec, run every job with Gemini tools and prove each output matches its `acceptance` block — with zero Claude calls.

## Scope

### 1. `lib/spec_executor.py`

```python
run_spec(project_dir: Path, spec: dict, *, registry=None, verifier=None,
         cost_tracker=None, max_parallel: int = 2,
         on_progress: Callable[[dict], None] | None = None,
         only_jobs: set[str] | None = None) -> WorkerReport
```

- `verify_seal(spec)` first; raise `SpecTampered`.
- Topological order from `depends_on`; independent jobs run in a thread pool (`max_parallel`).
- Per job:
  1. Build params = `job.params` + `output_path` (absolute, inside `project_dir`) + `input_from` injections (output path of the source job).
  2. `cost_tracker`: `estimate` → `reserve` → on success `reconcile`, on failure `refund`. `BudgetExceededError` / `ApprovalRequiredError` stop the run and mark the job `blocked_budget`; they are never swallowed.
  3. `registry.get(job.tool).execute(params)`; require `ToolResult.success` and the file on disk.
  4. `verifier.check(job, path, spec)`.
  5. On failure, attempt *n* applies `retry_ladder[n-1].params_patch` (shallow merge over the original params). After the ladder: `fallback_tool` once. Then status `needs_replan`.
- Job statuses: `pending`, `running`, `passed`, `failed`, `needs_replan`, `blocked_budget`, `skipped_dependency` (a dependency did not pass).
- Idempotent resume: a job already `passed` in `artifacts/worker_report.json` whose output file still exists and whose params hash is unchanged is skipped.
- Appends `asset_manifest` entries (`source_tool`, `scene_id`, `prompt`, `seed`, `model`, `cost_usd`, `provider`, `quality_score` = vision pass ratio) to `artifacts/asset_manifest.json`; validates against `asset_manifest.schema.json`.
- Progress: calls `on_progress({job_id, status, attempt, done, total})` and refreshes `metadata.partial_progress` on the `assets` checkpoint via `lib/checkpoint.py`.

### 2. `lib/spec_verifier.py`

`Verifier.check(job, path, spec) -> VerifyResult(passed, scores, reasons)`:

| Kind | Checks |
|---|---|
| video | ffprobe: has video stream, min width/height, aspect ratio, `expect_audio`. Frame sampling (reuse `lib/source_media_review._sample_timestamps` / ffmpeg extraction) → Gemini vision |
| image | dimensions, aspect ratio → Gemini vision |
| tts | duration > 0 and ≤ scene window + tolerance; `tools/analysis/transcriber` → WER vs `expected_text` ≤ `max_wer` (normalised: lowercase, strip punctuation, NFC) |
| music | duration ≥ spec duration − tolerance; loudness not silent (ffmpeg `volumedetect`, mean > −50 dB) |

- **Vision judge:** one batched Gemini call per job — sampled frames (3 for video, 1 for image) + the job's `must_show` / `must_not_show` questions → strict JSON `{question: bool}`. Pass when the ratio of satisfied checks ≥ `vision_pass_ratio`. Model from config `verifier.vision_model` (env `GEMINI_VISION_MODEL`), client via `google-genai` and the same key resolution as `tools/audio/gemini_tts.py`. Judge prompt is fixed text in the module; it never sees the generation prompt, only the questions.
- Deterministic parts are pure functions over ffprobe/transcript data so they unit-test without media or network.

### 3. `schemas/artifacts/worker_report.schema.json`

`{spec_hash, started_at, finished_at, status (complete|partial|failed), jobs[{job_id, status, attempts[{n, params_patch_applied, tool, passed, reasons, scores, cost_usd}], output_path}], total_cost_usd, needs_replan[job_id]}`. Register in `ARTIFACT_NAMES`.

### 4. CLI

`python -m backlot render <project-id> [--only job,job]` loads the spec, runs `run_spec`, prints a one-line-per-job summary, exits non-zero if any job is not `passed`.

## Acceptance

- Executor tests with a fake registry/tool + fake verifier: dependency order, `input_from` injection, retry ladder applied in order, fallback tool, budget stop, resume skips passed jobs, tampered spec refused, `skipped_dependency` propagation.
- Verifier unit tests: WER calc, duration/aspect checks, vision ratio logic with a fake judge; fixture media generated with ffmpeg (sine tone, solid colour clip) for ffprobe paths.
- No test imports `anthropic`. A grep test asserts `spec_executor.py` / `spec_verifier.py` do not import it.
- **Live check:** a 2-scene spec renders all jobs with real keys; `worker_report.json` validates; cost log shows Gemini spend only.

## Notes for the implementer

- Gemini tools write to the `output_path` param; confirm each tool's parameter name before wiring (`gemini_tts`, `google_music` use `output_path`; check `gemini_omni_video` and `google_imagen`).
- `gemini_omni_video` `image_to_video` needs the image path param — read the tool's schema and the `gemini-omni` skill when wiring `input_from`.
- Do not use `video_selector`/`image_selector`/`tts_selector`.
