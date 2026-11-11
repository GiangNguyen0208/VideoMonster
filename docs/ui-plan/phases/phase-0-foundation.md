# Phase 0 — Foundation

**Goal.** An empty but production-shaped Studio app served by the Backlot server, with the API skeleton, the security plumbing and CI in place. No user-facing features yet.

**Use cases served:** none directly; every later phase depends on this one.

## Scope

1. **`studio/` scaffold**
   - Vite + React 19 + TypeScript + TailwindCSS v4.
   - Libraries: React Router, TanStack Query, React Hook Form + Zod.
   - ESLint + Prettier, Vitest + Testing Library.
   - `package.json` scripts: `dev`, `build`, `test`, `lint`, `typecheck`.
   - Node version follows the repo's `.node-version` (22.x).
2. **Design tokens**
   - Extract colours, radii, spacing and the type scale from `backlot/ui/board.css` into the Tailwind v4 `@theme` block in `studio/src/index.css`, covering both light and dark themes.
   - Base components in `studio/src/components/ui/`: Button, Card, Badge, Banner, Drawer, Dialog, Tabs, EmptyState, Spinner, StepStatus.
3. **App shell**
   - Top navigation: Home, New video, Library, Setup, Settings.
   - Theme toggle, kept in sync with Backlot's stored preference.
   - Error boundary and a 404 page.
4. **Serving**
   - Backlot mounts `studio/dist/` at `/studio`, with an SPA fallback to `index.html`.
   - Dev mode: Vite on `:5173` proxies `/api`, `/media` and `/thumb` to `127.0.0.1:4750`.
   - `python -m backlot open --studio` opens `/studio`.
5. **API skeleton**
   - New `backlot/studio_api.py`: an `APIRouter(prefix="/api/v1")` included by `create_app()` in `backlot/server.py`.
   - `GET /api/v1/session` returns `{token, version, features}`.
   - A CSRF dependency for non-GET requests: it checks the `X-Studio-Token` header and the same-origin `Origin`.
   - A `current_user` dependency that returns the local user. This is the seam for Phase 7.
   - A `ProjectStore` protocol with a `DiskProjectStore` implementation. All v1 write code goes through it.
6. **Client API layer**
   - `studio/src/lib/api/` holds a typed `fetch` wrapper that injects the token.
   - A `useSSE(url)` hook mirrors `subscribe` in `backlot/ui/lib.js` and invalidates queries on `change`.
7. **Build integration**
   - New Makefile targets: `studio-install`, `studio-dev`, `studio-build`.
   - `make setup` gains an optional Studio build step.
   - CI (`.github/workflows/ci.yml`) adds a Node job that runs lint, typecheck, test and build.

## Files

- **New:** `studio/**`, `backlot/studio_api.py`, `backlot/project_store.py`, `tests/backlot/test_studio_api.py`
- **Modified:** `backlot/server.py` (include router, mount `/studio`), `backlot/__main__.py` (`--studio`), `Makefile`, `.github/workflows/ci.yml`, `.gitignore` (`studio/node_modules`, `studio/dist`)

## Acceptance criteria

- `make studio-build && python -m backlot serve` serves the shell at `http://127.0.0.1:4750/studio`. Deep links such as `/studio/library` load directly.
- `GET /api/v1/session` returns a token. A `POST` to any v1 route without the token returns 403.
- All existing `tests/backlot/` tests still pass unchanged: the read-only contract is intact.
- CI is green for both the Python and Node jobs.

## Test plan

- **pytest:** session endpoint; CSRF rejection (missing token, wrong token, cross-origin `Origin`); `/studio` SPA fallback; host-header rejection, extending the `test_server.py` patterns.
- **Vitest:** API wrapper adds the header; the `useSSE` hook invalidates on `change`.
- **Manual:** dev proxy works; theme toggle persists.
