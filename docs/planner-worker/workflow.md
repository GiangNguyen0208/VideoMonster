# Spec-mode workflow (agent-driven)

**Status: implemented as instructions** in `.agents/skills/spec-worker/` (entry: `/spec-reel`, routing in `AGENT_GUIDE.md` "Spec Mode"). This page is the review copy: principle, flow diagrams, and the code/instruction split. The skill is the source of truth for agents; keep both in sync.

## Principle

OpenMontage rule (`AGENT_GUIDE.md`): *Python = tools + persistence; the agent is the intelligence; instructions live in skills.*

- **Workflow, creative rules, prompt-writing rules, gates, recovery → `.agents/skills/spec-worker/`.** The agent reads those, never source code.
- **Code only where an agent cannot do the job** without burning Claude tokens or losing determinism: running many Gemini calls, verifying media, assembling with ffmpeg, hashing/linting/approval-binding of artifacts.

Claude plans once (requirements, then spec) and stops spending tokens; the render is a background CLI with no LLM.

## Who does what

| Concern | Owner |
|---|---|
| Requirements brief: goals, non-goals, viewer scenarios, assumptions, questions, improvements + recommendation | **Agent** (every request, small or large) |
| Picking improvements, answering questions, approving each step | **User** (chat now; Studio panels in Phase 5) |
| Idea, script, scenes, shot prompts, acceptance questions, retry ladders | **Agent** |
| Schema, lint, traceability to the approved brief, hashing, approval binding | **Code** (`requirements check/approve`, `spec check/approve`) |
| Generate with Gemini, verify, retry, cost, assemble | **Code** (`render`) |
| Read failures, edit failed jobs, ask re-approval | **Agent** (`references/recovery.md`) |

## Flowchart

```mermaid
flowchart TD
    A[User request in Claude Code or Studio intake with execution_mode spec] --> B[Agent reads .agents/skills/spec-worker/SKILL.md. Never reads source code]
    B --> C[S0 Preflight: Gemini tools + ffmpeg available?]
    C -->|blocked| C1[Structured blocker to user. Stop]
    C -->|ok| D[S1 Agent writes requirements_brief.json:<br/>goals, non-goals, viewer scenarios, assumptions,<br/>open questions, improvements with Recommended]
    D --> E[backlot requirements check]
    E -->|errors, max 2 rounds| D
    E -->|valid| G1{{GATE 1<br/>User corrects, answers questions,<br/>picks improvements}}
    G1 -->|revise| D
    G1 -->|abort| Z[Stop]
    G1 -->|approve| H[backlot requirements approve<br/>stamps picks + brief hash]
    H --> I[S2 Agent writes production_spec.json:<br/>script, scenes serving goals, jobs, acceptance, retry ladders]
    I --> J[backlot spec check<br/>schema + lint + traceability to brief + seal]
    J -->|errors, max 2 rounds, file untouched| I
    J -->|sealed| G2{{GATE 2<br/>User reviews script, scenes, jobs,<br/>cost, goals served}}
    G2 -->|revise| I
    G2 -->|abort| Z
    G2 -->|approve| K[backlot spec approve<br/>binds approval to spec_hash]
    K --> L[S3 backlot render in background<br/>NO Claude calls]
    L --> M{Result}
    M -->|complete + final_check passed| N[S4 Deliver: path, duration, cost, warnings]
    M -->|failed jobs| R[S5 spec status: compact failures]
    M -->|budget or infra error| X[Escalate to user]
    R --> R1[Agent edits ONLY failed jobs.<br/>Script and scenes untouched]
    R1 --> J
    J -.->|after recovery edit| G2b{{GATE 2 prime<br/>user sees changed jobs only}}
    G2b -->|approve| K
```

## Sequence diagram

```mermaid
sequenceDiagram
    actor U as User
    participant UI as Studio UI
    participant A as Agent (Claude Code)
    participant K as spec-worker skill
    participant C as backlot CLI (code)
    participant G as Gemini tools + vision judge
    participant F as ffmpeg assembler

    U->>UI: New video (execution_mode = spec)
    UI-->>U: claude "/spec-reel Continue Studio project ID"
    U->>A: run command
    A->>K: read SKILL.md + references (no source code)
    A->>C: preflight (tools, ffmpeg)
    A->>A: write requirements_brief.json
    A->>C: requirements check
    C-->>A: ok / errors
    A-->>U: GATE 1: goals, non-goals, scenarios, questions, improvements (Recommended)
    U->>UI: corrections, answers, picks improvements
    UI-->>A: decision (requirements)
    A->>C: requirements approve --improvements ... --answer ...
    A->>A: write production_spec.json (one planning pass)
    A->>C: spec check
    C-->>A: sealed spec_hash or errors (file untouched)
    A-->>U: GATE 2: script, scenes, jobs, cost, goals served
    U->>UI: approve or revise
    UI-->>A: decision (spec)
    A->>C: spec approve
    A->>C: render (background)
    activate C
    loop each job in dependency order
        C->>G: tool.execute(params from spec)
        G-->>C: asset
        C->>G: vision judge and speech check (questions from spec)
        G-->>C: pass or fail
        Note over C: on fail apply retry_ladder then fallback_tool
    end
    C->>F: assemble if all jobs passed
    F-->>C: final.mp4, render_report, final_check
    deactivate C
    C-->>A: exit code (notification, no polling)
    alt complete
        A->>C: spec status
        A-->>U: result, cost, warnings
    else failed jobs
        A->>C: spec status (compact)
        A->>A: edit only failed jobs
        A->>C: spec check
        A-->>U: GATE 2 prime: changed jobs only
        U->>UI: approve
        A->>C: spec approve, then render (passed jobs skipped)
    end
```

## Goals / non-goals of this feature

**Goals**
1. Claude decides everything creative once; the worker executes it with no discretion.
2. Output cannot drift from the plan: sealed spec, verbatim narration, per-job acceptance checks, final check.
3. Every request, however small, is made explicit (goals, non-goals, scenarios) and proven to be answered (traceability lint).
4. The user steers at two ordered gates and picks improvements from recommended options.
5. Claude token use after approval is ~zero on the happy path.
6. Workflow, Studio UI and backend share one file contract (`references/studio-contract.md`).

**Non-goals**
- Replacing the 7-stage pipelines for projects that are not spec-mode.
- Remotion/HyperFrames/atelier compositions (spec-mode assembles with ffmpeg).
- Non-Gemini generation providers in the worker.
- Semantic video review by Claude (the judge is a Gemini vision model answering the spec's own questions).

## Code that exists and why an agent cannot replace it

| Code | Reason |
|---|---|
| `lib/production_spec.py`, `lib/requirements_brief.py` + schemas | Deterministic validation, hashing, traceability; an agent must not self-certify |
| `backlot/spec_cli.py` (`requirements`, `spec`) | Gate commands + compact status so the agent never reads big JSON |
| `lib/spec_executor.py`, `lib/spec_verifier.py` | Hundreds of mechanical generate/verify/retry steps; an agent loop would burn tokens |
| `lib/spec_to_edit.py`, `lib/spec_assembler.py` | Deterministic ffmpeg assembly |

## Reverted (no longer needed)

`lib/planner.py` (Anthropic API planner), the `plan` CLI, the `anthropic` dependency in `requirements.txt`, and the planner tests. The planner prompt rules now live in `.agents/skills/spec-worker/references/`. The Phase 5 "replan" code was never written; recovery is an agent procedure (`references/recovery.md`).
