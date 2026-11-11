---
description: Continue a Studio project — apply the review decision the user made in the Studio browser UI.
argument-hint: <project-id>
---

Continue the OpenMontage project **$ARGUMENTS**, which is driven from Studio.

Follow "Projects Created in Studio" in `AGENT_GUIDE.md`:

1. Read `projects/$ARGUMENTS/project.json`, `projects/$ARGUMENTS/studio/intake.json` (if present) and the latest checkpoint.
2. Run `python -m backlot await-decision $ARGUMENTS --timeout 0`.
   - Exit 0: apply the printed decision exactly like a chat reply (approve / revise with its notes / abort), log it with `source: "studio"`, then run `python -m backlot consume-decision $ARGUMENTS <decision-id>`.
   - Exit 2: there is no pending Studio decision. Summarize where the project stands and ask the user to review in Studio or reply here.
3. Continue the pipeline stage by stage per `skills/meta/checkpoint-protocol.md`, waiting for Studio at each review point.

If no project id was given, list the projects under `projects/` that are waiting for review and ask which one to continue.
