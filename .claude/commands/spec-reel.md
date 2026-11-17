---
description: Plan a video once (requirements → spec, both user-approved) and let the Gemini worker generate it with no further Claude calls.
argument-hint: <what you want made, or "Continue Studio project <id>">
---

Handle the following with the **spec-worker** workflow — do not run the 7-stage pipeline and do not read source code:

**Request:** $ARGUMENTS

1. Read `.agents/skills/spec-worker/SKILL.md` and follow it step by step (S0 preflight → S1 requirements → Gate 1 → S2 spec → Gate 2 → S3 render → S4 deliver).
2. If the request is "Continue Studio project <id>", the intake is the brief (AGENT_GUIDE "Projects Created in Studio"); resume at the first step whose artifact is missing or unapproved (`python -m backlot spec status <id>`).
3. If there is no project yet, create one with `init_project()` (AGENT_GUIDE "Project Directory Convention"), write the user's request into the requirements brief verbatim, and continue.

If no request text was given, ask the user what they want made.
3. Studio project: after each gate, wait for the user's browser decision with `await-decision` (SKILL.md "Waiting at a gate"); chat answers work too.
