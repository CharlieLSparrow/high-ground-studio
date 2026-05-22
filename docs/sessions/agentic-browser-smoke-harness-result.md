# Agentic Browser Smoke Harness Result

Date: 2026-05-22

## Scope

Added an operator-assisted Playwright browser smoke harness for the synthetic
Studio/HGO workflow. This pass did not add OAuth automation, committed auth
state, cloud changes, schema changes, deploys, autosave, or collaboration.

## Result

- Added `pnpm studio:hgo:browser-smoke`.
- Added `scripts/agentic-studio-hgo-browser-smoke.mjs`.
- Added `pnpm studio:hgo:capture-auth-state` for manual operator auth-state
  capture.
- Added private ignored output paths:
  - `artifacts/auth/`
  - `artifacts/playwright/`
  - `artifacts/agentic-browser-smoke/`
- Added `docs/runbooks/agentic-browser-auth-state.md`.
- Updated agentic harness docs and current-state notes.

## Behavior

If `artifacts/auth/studio-storage-state.json` is missing, the browser smoke
writes:

```text
artifacts/agentic-browser-smoke/studio-hgo-browser-smoke-report.json
```

with `status: blocked`, explains that private auth state is missing, and exits
without opening a browser or performing server writes.

When valid auth state is supplied, the harness opens Studio `/manuscript`, loads
the synthetic smoke draft, creates synthetic-only manuscript/snapshot records,
generates HGO projection JSON, imports it into HGO `/projection-preview/import`,
checks warnings and renderer visibility, checks known real-content markers, and
writes a JSON report.

## Operator Auth

Run:

```bash
pnpm studio:hgo:capture-auth-state
```

The helper opens a headed browser. The operator signs in manually, returns to
the terminal, and confirms storage-state capture. It does not automate OAuth or
capture passwords.

If Playwright browsers are missing, run:

```bash
pnpm exec playwright install chromium
```
