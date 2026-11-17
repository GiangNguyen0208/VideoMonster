# CLI reference

All commands: `.venv/bin/python -m backlot …` (there is no bare `python` on the dev machine). `<id>` is the project id under `projects/`.

| Command | Does | Exit codes |
|---|---|---|
| `requirements check <id>` | Validates `artifacts/requirements_brief.json` | 0 ok · 1 errors · 3 missing |
| `requirements approve <id> [--improvements i1,i2] [--answer id=value …]` | Stamps the user's approval (+ brief hash) into the brief; unanswered questions and optional inputs get defaults; **required inputs missing → exit 1**; `--answer` needs `id=value` (file inputs: the `inputs/…` path) | 0 · 1 unknown ids/errors · 3 |
| `spec check <id> [--offline]` | Needs an approved brief. Fills `version`, `project_id`, `requirements_hash`; validates (schema, lint, traceability, tool availability); seals `spec_hash`; keeps history; clears a stale approval. On errors the file is **not** modified | 0 · 1 errors · 3 missing · 7 brief not approved |
| `spec approve <id>` | Records approval of the current `spec_hash` in `artifacts/spec_approval.json` | 0 · 1 invalid/unsealed · 3 |
| `spec status <id>` | One-screen summary: spec hash, approved?, job status counts, problem jobs with first reason, render result and warnings | 0 · 3 |
| `render <id> [--only a,b] [--no-compose]` | Worker run (Gemini) + assembly; resumes passed jobs | 0 done · 1 jobs failed · 3 missing · 4 spec tampered · 5 assembly error · 6 final check failed · 7 spec not approved |

## Files (all under `projects/<id>/`)

| File | Writer | Meaning |
|---|---|---|
| `studio/intake.json`, `studio/inputs.json` | Studio | The brief. Read only |
| `artifacts/requirements_brief.json` | agent (content), CLI (approval block) | Gate 1 |
| `artifacts/production_spec.json` | agent (content), CLI (hashes) | Gate 2 |
| `artifacts/production_spec.history/NNN-<hash8>.json` | CLI | Previous sealed specs |
| `artifacts/spec_approval.json` | CLI | `{spec_hash, approved_at}` |
| `artifacts/worker_report.json` | worker | Per-job status, attempts, costs |
| `artifacts/asset_manifest.json` | worker | Provenance of generated assets |
| `artifacts/edit_decisions.json`, `artifacts/render_report.json` | assembler | What was assembled, final check |
| `assets/…`, `renders/final.mp4`, `renders/final.srt` | worker / assembler | Media |
| `cost_log.json` | worker | Spend ledger |

Environment (set by the user in `.env`; never read `.env`): `GEMINI_API_KEY` or `GOOGLE_API_KEY` (generation + vision judge); optional `GEMINI_VISION_MODEL`.
