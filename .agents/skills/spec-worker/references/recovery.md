# S5 — Recovery

Trigger: `render` exited non-zero, or `python -m backlot spec status <id>` shows jobs that are not `passed`.

## Read the report the cheap way

`spec status` prints one line per problem job: status, first reason, and which attempts ran (`original:gemini_omni_video, ladder-1:…`). Do not open `worker_report.json` or any media unless the user asks.

## Decide per job

| Status / reason | Meaning | Action |
|---|---|---|
| `needs_replan`, vision/WER/duration reasons | Output kept failing its checks after the whole ladder | **Replan that job** (below) |
| `needs_replan`, "provider outcome unknown" | Gemini transport failure; the call may have been billed | Tell the user (cost may have been charged); then replan or re-run once if they agree |
| `needs_replan`, tool error text with auth / quota / 401 / 403 / 429 / network | Infrastructure, not creative | **Escalate** with the structured blocker; do not edit the spec |
| `blocked_budget` | Cost tracker refused (cap or per-action limit) | Escalate: show spend vs cap; offer raising the cap or cutting scope |
| `skipped_dependency` | A dependency failed | Fix the dependency; this job needs no edit |
| `pending` after a stop | Run halted early | Re-run `render`; it resumes |

## Replan a failed job

1. Look at `reasons` and the attempts. Decide *why* it failed: prompt too ambitious, ambiguous subject, check too strict, or model weakness.
2. Edit **only** that job in `production_spec.json`: new `params`/prompt, adjusted `acceptance` (loosen a check only if it was unreasonable — and say so), a fresh `retry_ladder`, possibly a different allowed tool or a still `fallback_tool` (needs the user's agreement if it changes the treatment).
3. **Never change** `script`, `scenes`, other jobs, `applied_improvements`, or the requirements link. If the fix needs different narration or scenes, stop: that is a user-requested revise (go back to S2/Gate 2 with the user), not a recovery.
4. `python -m backlot spec check <id>` — validates, reseals, keeps history, clears the old approval.
5. **Gate 2′:** show the user only the changed jobs: old vs new prompt/tool, why, added cost. Recommend one option. End the turn.
6. On approval: `spec approve`, then `render` again. Passed jobs (same params) are skipped, so only the changed jobs spend money.

## Limits

- At most **2 recovery rounds** per render. After that, report what still fails and what you recommend (simplify the scene, accept a still, drop the shot) and let the user choose.
- Never regenerate a passed job "to improve it" unless the user asks; that is a revise.
- Never lower `vision_pass_ratio` or drop all checks just to get a green run; if the checks are the problem, say so to the user.
- Keep the summary short: what failed, what you changed, cost impact, your recommendation.
