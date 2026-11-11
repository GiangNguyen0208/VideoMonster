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

- New files: `docs/ui-plan/hosted/design.md`, `docs/ui-plan/hosted/threat-model.md`, `docs/ui-plan/hosted/sync-protocol.md`
- `backlot/project_store.py`: final protocol plus `ObjectProjectStore` stub (raises `NotImplementedError`)
- A contract test proving every v1 module touches the filesystem only through `ProjectStore`

## Acceptance criteria

- The contract test passes: no direct filesystem access in v1 API modules outside the store.
- The sync protocol doc defines every file class, its owner, its direction and its conflict rule. It is reviewed against the disk contract in `03-architecture.md`.
- The threat model lists a mitigation for each risk above, with an owner phase.

## Test plan

- **pytest:** the store contract test (AST or import scan); `current_user` is required on every v1 route (route introspection).
- **Review:** design docs reviewed by a maintainer before any hosted implementation starts.

## Implementation notes

- **Two seams, not one.** Project data goes through `backlot/project_store.py`; machine-local resources (`config.yaml`, `.env`, `music_library/`, demo renders, ffprobe, loading `render_demo.py`) go through the new `backlot/machine_store.py`. In hosted mode the machine resources never live on the server (`hosted/design.md` §5), so they need a separate boundary.
- **`ProjectStore` final protocol:**
  - `root` (`None` when hosted)
  - `list_ids`, `exists`
  - `files(id) → ProjectFiles`
  - `create_project(...)`
  - `read_json` / `write_json` (kept for compatibility)
- **`ProjectFiles` (per project):**
  - `read_json`, `write_json` (atomic), `stat`, `list(rel_dir, pattern, recursive)`, `delete`, `rename` (atomic, `TargetExists`)
  - `write_stream` (async, partial file + unique name, `WriteTooLarge` / `EmptyWrite`)
  - `safe_rel` (agent-recorded paths), `local_file`, `zip_dir`, `board_state`
- `ObjectProjectStore(tenant_id, bucket, database_url)` raises `NotImplementedError`; `hosted/design.md` §3 maps each method.
- **Refactor.** Every v1 module was moved onto the two stores:
  - `studio_decisions`, `studio_uploads`, `studio_results`, `studio_cost` and `studio_catalog` take a `ProjectFiles` (or the store);
  - `studio_settings` and `studio_setup` read and write through `machine_store`;
  - the `await-decision` / `consume-decision` CLI uses `DiskProjectStore(...).files(id)`, and `consume-decision` prints the new file name.
  - API behaviour is unchanged: the full Python suite, the Vitest suite and the Phase 5 and 6 browser runs pass unchanged.
- **Auth seams in code:**
  - `APIRouter(dependencies=[Depends(current_user)])`;
  - `project_access(access)` dependency on every `{project_id}` route, calling `authorize(user, project_id, access)` (local: always true; view vs edit per route in `hosted/design.md` §2.3);
  - a forbidden project answers exactly like an unknown one (404).
- **Contract test** `tests/contracts/test_studio_store_contract.py`:
  - AST scan of every v1 module for direct filesystem calls (`open`, Path I/O methods, `os`/`shutil`/`tempfile`/`zipfile`/`glob`/`importlib`), with a self-test of the scanner;
  - route introspection: `current_user` on every v1 route, `project_access` on every project route;
  - authorization hides forbidden projects;
  - the disk store satisfies the protocols; the object store is a stub.
- **Not changed (design only):**
  - OIDC sign-in, session-bound CSRF, configurable hosts, signed media URLs;
  - the connector program;
  - per-user locale on the profile;
  - hosted error codes and screens.

## Follow-up 7.1 — Review hardening

A code review of the Phase 7 changes found path-safety and robustness issues in the store seam, the API and the contract scanner. They are fixed in Phase 7.1; steps and progress are tracked in `docs/ui-plan/STATUS.md` (section "Phase 7.1 — Review hardening").

