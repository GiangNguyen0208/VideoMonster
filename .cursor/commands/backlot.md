# /backlot — open Studio

Open Studio (browser app showing pipeline stages, script, scene plan, and generated assets live) at the requested project:

```bash
python -m backlot open <project-id>
```

- No project id → open Studio's home: `python -m backlot open`
- Idempotent: starts the Backlot server if needed, then opens the browser at the project in Studio.
- If it fails, report and continue — Studio is an observer, never a blocker.
- Studio derives all state from `projects/<id>/` on disk; never update the UI manually. Keep checkpoints and artifacts honest per `skills/meta/checkpoint-protocol.md`.
