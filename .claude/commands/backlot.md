---
description: Open Studio at a project — the browser app that shows pipeline stages, script, scene plan, and generated assets live as a production runs.
argument-hint: [project-id (optional — defaults to the current/most recent project)]
---

Open Studio at the requested project:

```bash
python -m backlot open $ARGUMENTS
```

- No argument → open Studio's home: `python -m backlot open`
- The command is idempotent: it starts the Backlot server if it isn't running, then opens the browser at the project in Studio (`/studio/p/<id>`).
- If the command fails, report it and continue with whatever the user asked — Studio is an observer, never a blocker.
- Studio derives everything from disk (`projects/<id>/` checkpoints, artifacts, assets, events). You never update the UI manually; keep checkpoints and artifacts honest per `skills/meta/checkpoint-protocol.md` and Studio stays honest too.
