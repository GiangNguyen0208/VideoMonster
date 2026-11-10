# OpenMontage Studio

Browser UI for OpenMontage, served by the Backlot server at `http://127.0.0.1:4750/studio`.
Studio is a companion to the agent CLI — see [`docs/ui-plan/`](../docs/ui-plan/README.md).
Phase progress lives in [`docs/ui-plan/STATUS.md`](../docs/ui-plan/STATUS.md); update it as you work.

```bash
make studio-install                 # npm ci
make studio-build                   # build into studio/dist (served by Backlot)
make studio-open                    # start Backlot if needed and open Studio

# Live development (two terminals)
.venv/bin/python -m backlot serve   # API on :4750
make studio-dev                     # Vite on :5173, proxies /api, /media, /thumb

make studio-check                   # lint + typecheck + format + tests + build (same as CI)
```

Layout: `src/app` (shell, router, providers), `src/routes` (pages), `src/components/ui`
(design-system primitives), `src/lib/api` (typed client + `useSSE`), `src/content` (copy/config).
Design tokens live in `src/index.css` and mirror `backlot/ui/board.css`.
