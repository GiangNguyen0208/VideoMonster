# Phase 4 — Review & Approve

**Goal.** Every review point can be handled in the browser: approve, request changes, or stop. The agent resumes on its own, and the gate guarantees in `lib/checkpoint.py` and `skills/meta/checkpoint-protocol.md` stay intact.

**Use cases served:** UC6. This phase completes the newcomer MVP.

## Scope

### 4.1 Decision API

**`POST /api/v1/projects/{id}/decisions`**

Body: `{stage, checkpoint_timestamp, action: approve|revise|abort, notes, proposal?}`.

The server checks four things:
1. `read_checkpoint(...)` for `stage` has `status == "awaiting_human"`.
2. Its `timestamp` equals `checkpoint_timestamp`. Otherwise it returns 409: "This step changed — review the new version".
3. `revise` requires non-empty `notes`.
4. For the proposal stage on approve, `proposal.selected_concept_id` must exist in `proposal_packet.concept_options`. `render_runtime` must be one of the runtimes available on the machine.

It then writes `projects/<id>/studio/decisions/<utc-ts>-<stage>.json` (`studio.decision/1`, `03-architecture.md` §3.2).

Related routes:
- `GET /api/v1/projects/{id}/decisions` lists decisions as pending, consumed or stale.
- `DELETE /api/v1/projects/{id}/decisions/{did}` retracts a decision while it is still pending.

### 4.2 Review panel on the project page

It appears when the latest checkpoint is `awaiting_human`. A top banner reads "Waiting for you: review the *script*", and the browser shows a notification if permission is granted.

**Content by stage:**

| Stage | What the review shows |
|---|---|
| proposal / idea | Concept cards (title, hook, approach, est. cost). Pick one. Budget slider, pre-filled from `cost_estimate`. **Rendering engine:** both Remotion and HyperFrames shown side by side with the proposal's rationale when both are available (hard rule); otherwise "Only X is available on this machine". Look: Standard/Custom. Music: library / generate / none. |
| script | Screenplay view; per-section comment boxes collected into `notes` |
| scene_plan | Storyboard grid of scenes with descriptions |
| assets | Filmstrip of per-scene assets and `snapshots/<scene_id>.png`, narration players, cost so far plus projected compose cost |
| character_design | Character sheets |
| edit (documentary-montage only) | Cut list |
| publish | Final player, metadata, export targets |

Every review panel also shows the agent's **self-review** summary from checkpoint `review` and the **cost so far**.

**Actions:**
- **Approve**: primary button.
- **Request changes**: opens notes. Notes are required; per-item comments are pre-filled.
- **Stop project**: shows a confirmation dialog.

**After submitting:**
- The panel shows "Sent — waiting for the agent to pick it up". A Retract link stays available while the decision is pending.
- Once the agent consumes the decision (the file rename arrives over SSE), the panel shows "Agent is applying your decision…" and then the next step's status.

### 4.3 Agent contract, part 2

**`AGENT_GUIDE.md` "Studio intents" section** — add the gate rule from `03-architecture.md` §3.3 (1):
- At a gate, look for an unconsumed decision that matches both the stage and the checkpoint timestamp.
- Apply it with exactly the same semantics as a chat reply.
- Log it to `decision_log` with `source: "studio"`. For the proposal, write one entry per pick: concept, budget, `render_runtime_selection` (the full runtime shortlist in `options_considered`), composition_mode and music.
- Rename the file to `.consumed.json`.
- Stale or unknown decisions are ignored and logged.

**`skills/meta/checkpoint-protocol.md` Step 5** — add a sub-step: *"If Studio is in use, after presenting the summary start the wait command in the background, then end your turn."* Also add *"A matching Studio decision is the user's reply."* The per-gate rule and the `approval_policy` rule are unchanged.

**`python -m backlot await-decision <id> <stage> [--timeout SECONDS]`** — added to `backlot/__main__.py`:
- Polls or watches `studio/decisions/` for a matching unconsumed file whose timestamp matches the current `awaiting_human` checkpoint.
- On success, prints the JSON and exits 0. On timeout (default 3600 s) it exits 2, and the agent tells the user to approve in Studio or chat.
- Never writes anything.

**`.claude/commands/studio-continue.md`** — `/studio-continue <id>`: "read pending Studio decisions for project `<id>` and continue." This is the fallback when the background wait wasn't running.

### 4.4 Chat still works

A user can still approve in chat. Studio then sees the checkpoint become `completed`, and any pending Studio decision for that checkpoint is shown as stale and retracted automatically.

### 4.5 Localization (en, vi)

- All new strings go into both `studio/src/i18n/en.ts` and `vi.ts` (see `03-architecture.md` §8). The catalog parity test must pass, and at least one Vitest page test runs in Vietnamese.
- **Review panel strings:** approve / request changes / abort, the notes prompt, the proposal picker (concept, budget, both runtimes, composition mode, music, voice), the decisions inbox, and "the step changed — review again".
- **Decision files stay language-neutral.** `action` and the proposal picks are English enums or ids. `notes` is stored exactly as the user typed it, in any language; the agent reads it as the user's reply.
- **`await-decision` CLI output** is for the agent and stays English.
- **Stale or invalid decisions:** the API returns a `code` (e.g. `stale_checkpoint`) so the panel can show a translated message.

## Implementation notes

- **Agent CLI.** Besides `await-decision <id> [stage] [--timeout S]` (exit 0 = decision JSON incl. `file`, 2 = timeout, 3 = bad project; `--timeout 0` checks once), there is `consume-decision <id> <decision-id>`, which renames the file to `.consumed.json`. The agent never has to move files by hand.
- **One decision per review.** A second POST for the same stage + checkpoint while one is pending returns 409 `already_decided`.
- **Error codes.** `not_awaiting`, `stale_checkpoint`, `notes_required`, `unknown_concept`, `runtime_unavailable`, `already_decided`, `already_consumed`, `unknown_decision`, returned as `{detail, code}`. The UI translates them.
- **Stale = retracted.** A pending decision whose checkpoint has moved on (approved in chat, or revised) is reported as `stale`. `await-decision` ignores it; nothing is deleted.
- **Schema.** `decision_log` entries gained an optional `source` (`agent` | `chat` | `studio`). It was needed because the schema forbids unknown keys.
- **Decision file.** It also records `source: "studio"` and `user` (the `current_user` id, for hosted mode).
- **Review panel.**
  - *Proposal:* the picker covers concept, budget, both engines with the agent's per-runtime rationale from the `render_runtime_selection` decision-log entry, look and music. There is no voice pick yet.
  - *Script:* per-section comments are folded into `notes` as `[Section] comment`.
  - *Other steps:* the panel points to the tab that already shows the step.
  - *Notifications:* browser notifications are opt-in ("Notify me…") and fire only while the tab is in the background.

## Files

- **New:**
  - `backlot/studio_decisions.py`
  - `studio/src/features/review/**`, with one renderer per stage
  - `.claude/commands/studio-continue.md`
  - `tests/backlot/test_studio_decisions.py`, `tests/backlot/test_await_decision.py`
- **Modified:** `backlot/studio_api.py`, `backlot/__main__.py`, `AGENT_GUIDE.md`, `skills/meta/checkpoint-protocol.md`

## Acceptance criteria

- On `backlot-demo-run` (simulate script) at a gate:
  - Approve writes exactly one decision file;
  - the `await-decision` command returns it;
  - a stale timestamp gets 409.
- **Real agent run (zero-key, `animated-explainer`):**
  - every review point from proposal to publish is approved from Studio with no chat typing;
  - `decision_log.json` contains a `source: "studio"` entry for each;
  - no GATE or PREREQUISITE VIOLATION occurs.
- **Revise path:** the notes reach the agent, the stage is redone, `history/` holds the old checkpoint, and the new version appears in the review panel.
- When both runtimes are available, the proposal review shows both. The resulting `render_runtime_selection` decision lists both in `options_considered`.
- `tests/backlot/test_gate_scenarios.py` and the contract tests still pass.

## Test plan

- **pytest:**
  - Decision validation matrix: wrong status, stale timestamp, unknown concept, unavailable runtime, empty revise notes, retract after consume.
  - `await-decision`: returns on a matching file, ignores consumed or stale files, exits on timeout.
- **Playwright:** a gate fixture for every canonical stage, reusing the per-stage gate matrix in `tests/backlot/test_ui_bug_bash.py`. Submit → see the pending state → simulate the agent consuming → see the applied state.
- **Manual:** the full real-agent run described above, plus a mixed run with one approval in chat and one in Studio.
