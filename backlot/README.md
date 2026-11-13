# Backlot — the local server behind Studio

Backlot is the small local server that serves **Studio**, the browser app that
shows a production happening: pipeline steps lighting up, the script as a
screenplay page, the storyboard filling in as assets generate, decisions,
spend, and activity. It is derived from what the pipeline already writes to
`projects/<id>/`. Studio also lets you start a video, review and approve at
each review point, and manage uploads and settings (see `docs/ui-plan/`).

```bash
python -m backlot open <project-id>   # start server if needed + open Studio at the project
python -m backlot open                # open Studio's home
python -m backlot serve --port 4750   # run the server in the foreground
```

Studio is served at `/studio` (build it with `make studio-build`; for live
development run `make studio-dev`). The old URLs `/` and `/p/<id>` redirect to
Studio.

Backlot binds to `127.0.0.1` and accepts HTTP requests only for `127.0.0.1`
or `localhost`, on the selected port. Other `Host` headers receive HTTP 400
to protect local project data from DNS rebinding.

## How it stays live

No agent involvement. A `watchfiles` watcher on `projects/` publishes change
notifications over SSE; Studio refetches project state. State sources:

| Studio element | Disk source |
|---|---|
| identity / step order | `project.json` + `pipeline_defs/<type>.yaml` |
| step states, gates, versions | `checkpoint_<stage>.json` + `history/` |
| script tab | `artifacts/script.json` |
| storyboard cards | `scene_plan × script × asset_manifest` join |
| "generating" overlay, activity | `events.jsonl` (written by `BaseTool` instrumentation) |
| cost | checkpoint `cost_snapshot` |
| renders | `renders/*.mp4` (+ root-level mp4 heuristic) |

Projects without checkpoints degrade gracefully to a "files found" view —
snapshots and renders.

**Replay**: any run with history can be scrubbed end-to-end (**Replay run** on
the project page), reconstructed from checkpoint history and event timestamps.

Try it without a real production:

```bash
python scripts/backlot_simulate_run.py          # live demo run (~1 min)
python -m backlot open backlot-demo-run
```

## Series

Several projects can be episodes of one show. Add an optional `series` label
to each episode's `project.json` (or pass `series=` to
`lib.checkpoint.init_project`). Folders stay flat in `projects/`; nothing moves.

```json
{ "title": "Episode 3: The Heist", "pipeline_type": "animation", "series": "my-show" }
```

- Studio's Library can group by series and filter to one
  (`/studio/library?series=my-show`).
- An episode's page shows its series name.

Projects without `series` (including older projects with no `project.json`)
show as loose cards, exactly as before.

Design doc: `internal/design/LIVING_STORYBOARD.md` (historical).
