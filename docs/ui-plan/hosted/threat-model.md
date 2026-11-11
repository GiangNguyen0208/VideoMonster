# Hosted Studio — Threat Model

**Status:** design review input (Phase 7). It covers hosted, multi-user Studio as described in `design.md` and `sync-protocol.md`, and notes what local Studio already does.

**Owner phase** is either the phase that shipped a control (Phases 0–6), or a hosted migration step from `design.md` §9:
- **H1:** configurable hosts and session-bound CSRF
- **H2:** sign-in
- **H3:** roles
- **H4:** object store and database
- **H5:** signed media
- **H6:** connector
- **H7:** settings, setup and music through the connector

## 1. What we protect

| Asset | Why it matters |
|---|---|
| Provider API keys (`.env`) | Direct financial loss; abuse under the user's identity. |
| Project media and briefs | Unreleased creative work; possibly personal footage. |
| Review decisions | They make the agent spend money and publish; a forged approval is a spend authorization. |
| Budget settings | Raising a cap removes a spending guard. |
| Accounts, sessions, device tokens | Access to all of the above. |
| Service availability and storage | Shared by all tenants. |

## 2. Actors and boundaries

- **Actors:**
  - signed-in owners;
  - invited viewers;
  - other tenants;
  - anonymous internet users;
  - a malicious web page open in the same browser;
  - a stolen or compromised device (connector token);
  - content inside reference videos, uploads and agent artifacts (untrusted data).
- **Trust boundaries:**
  1. browser ↔ hosted API;
  2. connector ↔ hosted API;
  3. hosted API ↔ object storage and DB;
  4. Studio-written files ↔ the agent on the user's machine.

## 3. Risks and mitigations

| # | Risk | Mitigation | Local today | Owner phase |
|---|---|---|---|---|
| T1 | **Cross-tenant access**: reading or changing another tenant's projects by guessing ids or paths | Every project route goes through `project_access` → `authorize(user, project_id, access)` (contract-tested). Tenant id is part of every DB key and object key (`t/<tenant>/p/<id>/…`). Forbidden looks identical to unknown (404, same body), so ids don't leak. Store queries are always scoped by `tenant_id`; no route takes a tenant id from the client. The contract test also rejects `from os import …`-style imports and aliased filesystem modules, and exempts store handles only where they are typed as such, so the seam cannot be bypassed quietly. | Seam in place and tested (`tests/contracts/test_studio_store_contract.py`); single user | H3, H4 |
| T2 | **Viewer escalation**: a viewer answering review points or uploading | `edit` access required for intake edits, decisions, uploads, references (route table in `design.md` §2.3). | Seam in place | H3 |
| T3 | **Upload abuse**: huge files, disk exhaustion, executable or HTML payloads served back | Size cap per file (`STUDIO_MAX_UPLOAD_MB`) checked on `Content-Length` and while streaming; extension and MIME allowlist (video/audio/image/subtitle, 415 otherwise); plain file names only; partial files never visible. Hosted: per-tenant quota (`quota_exceeded`), media served from a separate storage domain via signed URLs with `Content-Disposition` and `X-Content-Type-Options: nosniff`, never inline HTML. | Cap, allowlist, name rules, streaming (Phase 5) | Phase 5; quota H4; serving H5 |
| T4 | **SSRF**: making the server fetch internal URLs through reference links | The server **never fetches** reference URLs. It stores them after an http(s)-only check. Fetching happens only in the agent's reference-analysis flow, on the user's machine. No other route takes a URL to fetch. | Implemented (Phase 5) | Phase 5 |
| T5 | **Secret exposure**: provider keys on the server, in logs or in responses | Keys never leave the machine: the hosted Setup shows status from the connector report; `PUT /setup/env` does not exist in hosted mode. Locally, values are write-only (masked hint), `.env` is written `0600`, and never logged or returned. Logs never include bodies. | Implemented locally (Phase 2) | H7 |
| T6 | **Decision forgery**: an approval the user didn't give (spending authorization) | Decisions are created only by `POST …/decisions` with `edit` access, a session-bound CSRF token and a same-site Origin. The server signs each decision (HMAC over id, project, stage, checkpoint timestamp, action, user). The connector refuses unsigned or invalid ones. `user` is recorded in the decision and `decision_log`. | Token + Origin + validation (Phase 4); local files are user-controlled by design | H1, H6 |
| T7 | **Replay / stale approval**: re-using an old "approve" for a new version of a step | Each decision is bound to `stage` + `checkpoint_timestamp`. One pending decision per review; immutable ids. The agent applies only a decision matching the current `awaiting_human` checkpoint (`await-decision` filters); stale ones are reported and ignored. Consumption is final. | Implemented and tested (Phase 4) | Phase 4 |
| T8 | **CSRF from other sites** | Non-GET `/api/v1` requires `X-Studio-Token` and a same-site Origin. Hosted: session cookie `SameSite=Lax`, `__Host-` prefix, token derived per session. | Implemented (Phase 0) | Phase 0; H1 |
| T9 | **Host-header / DNS-rebinding attacks** on the local server | `TrustedHostMiddleware` with `127.0.0.1`/`localhost`, bound to loopback. Hosted: explicit `STUDIO_ALLOWED_HOSTS`, refuse to start without it. | Implemented (Phase 0) | H1 |
| T10 | **Path traversal** in project ids, uploads, downloads, exports, music | Project ids validated (ids starting with `_` or `.`, hidden from listings, are not addressable); every project path goes through `ProjectFiles` (resolved, must stay inside the project; listings skip files reached through symlinked folders; renames never overwrite); upload names must be plain names; `export_path` and agent-recorded paths are honoured only inside the project, and never as the project folder itself; music names are confined to the library. The connector repeats the checks before writing pulled files. | Implemented and tested (Phases 0, 5, 6, 7.1) | Phases 0–7.1; H6 |
| T11 | **Zip abuse** in export bundles (zip-slip, symlink escape, zip bombs) | Studio only *creates* zips; it never extracts them. Symlinks and entries outside the export folder are skipped; entries use relative names. Hosted: zip streamed from objects with a size ceiling equal to the tenant quota. | Implemented (Phase 6) | Phase 6; H4 |
| T12 | **Prompt injection through Studio text**: intake topics, review notes or reference notes steering the agent | These fields are the user's own words to their own agent, the same trust as chat. Viewers can't write them (T2). AGENT_GUIDE treats intake and notes as the brief, not as instructions to change tools, keys or budgets. Budget changes require the Settings page and are visible in `config.yaml`. Reference *content* (third-party videos) is analysed as data by the reference-analysis flow. | Same trust as chat | Phases 3–5; H3 |
| T13 | **XSS from agent or third-party content** (scripts, titles, analysis text, file names) | React escapes all text; no `dangerouslySetInnerHTML`. Media from a separate storage origin in hosted mode. Reference links open with `rel="noreferrer noopener"`. | Implemented | Phases 1–6; H5 |
| T14 | **Session or device-token theft** | Session: `HttpOnly`, `Secure`, rotation at sign-in, revocation. Device tokens: 256-bit, stored hashed, per-device, revocable in Account → Devices, auto-revoked on repeated validation failures, 180-day idle expiry. Tokens kept in the OS keychain. | n/a (local) | H2, H6 |
| T15 | **Malicious or compromised connector** pushing crafted files | Server validates paths, hashes and sizes on commit. JSON is parsed as data and never executed. The board code already tolerates malformed artifacts (Phase 1 fallbacks). Pushes are limited to the device user's tenant. | Board tolerance implemented | H6 |
| T16 | **Denial of service**: many uploads, long-polls or SSE connections | Per-user and per-device rate limits; connection caps per user for SSE and long-poll; upload concurrency limits; quotas (T3). No server-side render or generation jobs (`design.md` §6). | Local only | H4, H6 |
| T17 | **Settings tampering**: raising a budget cap silently | `PUT /settings` requires an editor session + CSRF; values validated (field-level 422); only allowlisted keys; hosted changes are audited (`user_id`, old → new). `STUDIO_READONLY_CONFIG=1` locks it on shared machines. | Implemented (Phase 6) | Phase 6; H7 |
| T18 | **Information leaks through logs and errors** | Errors return `{detail, code}` without stack traces or paths outside the project. Logs carry ids only, never bodies, notes or secrets. | Implemented locally | All; H4 |

## 4. Residual risks and assumptions

- **The user's machine is trusted.** Anyone who controls it can already spend with the user's keys. Local files written by hand are honoured locally by design (`sync-protocol.md` §3.3).
- **Pricing is approximate.** A provider's real price can differ from the estimate in `cost_log.json`. Budget caps limit exposure, but are not provider-side limits.
- **Shared viewing reveals content.** Viewers see everything in a project, so sharing is per project with a clear notice.

## 5. Review checklist (before H1 starts)

- [ ] A maintainer has signed off this document and `design.md` / `sync-protocol.md`.
- [ ] Every risk above has an owner and a test plan in its hosted step.
- [ ] The contract test still passes, with the hosted store and auth swapped in.
