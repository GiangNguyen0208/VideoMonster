# Phase 2 — Setup Center

**Goal.** Within 30 seconds, a newcomer knows what they can make on this machine right now, and which single step would unlock more.

**Use cases served:** UC1.

## Scope

1. **`GET /api/v1/setup`**
   - Wraps `registry.provider_menu_summary()` (`tools/tool_registry.py`).
   - Adds a computed **tier**: Zero-key / Starter / Standard / Full / Full+GPU, using the rules in `skills/meta/onboarding.md`.
   - Adds **unlocked video types**: pipelines whose required capabilities are covered, using `registry.uncovered_capabilities(...)` and the stage tools from `lib/pipeline_loader.get_stage_tools`.
   - Adds **locked video types**, each with the capability that blocks it.
   - Discovery is expensive, so the result is cached in-process and invalidated by `POST /api/v1/setup/recheck`.
2. **`PUT /api/v1/setup/env`**
   - Body: `{key, value}`.
   - The key must be an `env:` dependency declared by a registered tool. (Implemented this way instead of reading `.env.example`, so the allowlist cannot drift from the tools.)
   - Writes `.env` atomically (temp file + rename) and preserves comments and order.
   - Never returns values. `GET /setup` reports each key as `set` or `unset`, plus the last 4 characters.
   - Disabled when `STUDIO_READONLY_ENV=1`.
3. **`POST /api/v1/setup/recheck`**
   - Re-runs discovery so new keys are picked up.
   - Runs in a subprocess, because tool modules may cache environment state at import.
   - Returns a job id; the UI polls `GET /api/v1/jobs/{id}`.
4. **Setup page** (`/studio/setup`)
   - **Tier badge** with a one-sentence explanation.
   - **"Works now"**: friendly capability names, e.g. "Voice-over (free, local: Piper)" and "Rendering engines: FFmpeg ✓ Remotion ✓ HyperFrames ✓".
   - **Unlock cards** (at most 3 suggested): built from `setup_offers[]`.
     - Each card shows what it unlocks (video types), the cost guidance, a "Get a key" link from `install_instructions`, and a masked input + Save + Re-check.
     - Card text is taken from the registry's `install_instructions`. Nothing provider-specific is hard-coded, matching the AGENT_GUIDE rule.
   - **Warnings:** `runtime_warnings[]` shown verbatim in a callout.
   - **Hardware unlocks:** a collapsed section listing `runtime=local_gpu` tools with their install hints.
   - **"All providers"** (Advanced): the full `provider_menu()` view per capability.
5. **Home integration.** If the tier is Zero-key, Home shows a dismissible "Unlock more" card linking to Setup.

## Files

- **New:** `backlot/studio_setup.py` (tier and unlock computation, `.env` writer), `studio/src/routes/setup.tsx`, `studio/src/features/setup/**`, `tests/backlot/test_studio_setup.py`
- **Modified:** `backlot/studio_api.py` (routes)

## Acceptance criteria

- **Zero-key machine:** the tier shows Zero-key; works-now lists Piper TTS, FFmpeg, Remotion and HyperFrames when present; at least one unlock card is shown.
- **Saving a key:**
  - after re-check, the tier and works-now update without a server restart;
  - `.env` keeps its prior content;
  - the value never appears in API responses or logs.
- A key that is not in `.env.example` is rejected with 422.
- Every unlock card's text comes from the registry. A grep of `studio/src` finds no provider env-var names.

## Test plan

- **pytest:**
  - Tier computation, with `provider_menu_summary` monkeypatched to fixture outputs for each tier.
  - `.env` writer: preserves comments, does an atomic replace, rejects keys outside the allowlist, never echoes values.
  - The recheck job lifecycle.
- **Playwright:** zero-key fixture → enter a fake key → re-check (with the registry mocked) → the card moves to works-now.
