# Phase 7 — Hosted Readiness (design + interfaces)

**Goal.** Prepare Studio to run as a hosted multi-user service later, without rewriting phases 0–6. This phase delivers **interfaces, a design doc and a threat model**. It deliberately does not deploy anything.

## Starting point (already in place from Phase 0)

- **`ProjectStore` protocol** with `DiskProjectStore`. All `/api/v1` code goes through it.
- **`current_user` dependency** on every v1 route. In v1 it always returns the local user.
- **The disk contract** (`03-architecture.md` §3) is the only channel between Studio and the agent.

## Scope

1. **Store abstraction hardening**
   - Audit all v1 modules for direct `Path` use outside `DiskProjectStore`, and remove any found.
   - Define `ObjectProjectStore` (interface plus stub): object storage for media, a metadata DB for project index, decisions and intake.
   - Signed URLs for `/media` and `/thumb` in hosted mode.
2. **Auth seam**
   - Spec for OIDC/session auth.
   - Spec for tenant namespacing: `projects/<tenant>/<id>`, or a DB key.
   - Per-route authorization rules: owner, shared-viewer.
   - `TrustedHostMiddleware` becomes configurable, and the CSRF token becomes session-bound.
3. **Sync connector spec (`openmontage sync`)**
   - Runs on the user's machine next to the agent. Authenticates with a per-device token.
   - **Push:** changes under `projects/<id>/`: checkpoints, artifacts, `decision_log`, `events.jsonl`, `cost_log.json`, media (chunked, resumable, content-hashed).
   - **Pull:** `studio/intake.json`, `studio/decisions/*` and uploads into local `inputs/`.
   - **Capability push:** sends the local `provider_menu_summary()` so the hosted Setup center can show it. API keys never leave the machine.
   - **Conflict rules:**
     - the agent-owned files (checkpoints, artifacts) are authoritative locally;
     - Studio-owned files (`studio/*`) are authoritative on the server;
     - decisions are immutable once written.
4. **Threat model**
   - Covers: multi-tenant isolation, upload abuse, SSRF (the server never fetches reference URLs), secret handling (no provider keys on the server), decision forgery (signed decisions bound to user and checkpoint), and replay (decision id plus checkpoint timestamp).
5. **Operational notes**
   - Job execution in hosted mode: only demo renders run on the server, or none at all.
   - Storage quotas, retention, and an observability plan.

## Localization (en, vi)

- **Per-user locale.** Store the locale on the user profile; on first visit fall back to `Accept-Language`, then `en`. The local `studio.locale` key becomes a cache of the profile value.
- **API errors** across the hosted API carry stable `code`s; the UI translates them.
- Sign-in, invite and account screens are added to both catalogs, with the same parity test.
- **Server-rendered text** (e-mails, invites) needs its own catalog on the server, with `en` and `vi` from the start.

## Deliverables

- New files under docs/ui-plan/hosted/: `design.md`, `threat-model.md`, `sync-protocol.md`
- `backlot/project_store.py`: final protocol plus `ObjectProjectStore` stub (raises `NotImplementedError`)
- A contract test proving every v1 module touches the filesystem only through `ProjectStore`

## Acceptance criteria

- The contract test passes: no direct filesystem access in v1 API modules outside the store.
- The sync protocol doc defines every file class, its owner, its direction and its conflict rule. It is reviewed against the disk contract in `03-architecture.md`.
- The threat model lists a mitigation for each risk above, with an owner phase.

## Test plan

- **pytest:** the store contract test (AST or import scan); `current_user` is required on every v1 route (route introspection).
- **Review:** design docs reviewed by a maintainer before any hosted implementation starts.
