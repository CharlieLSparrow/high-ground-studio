# Agentic Workflow Test Harness Result

Date: 2026-05-22

## Scope

Added the first agent-friendly Studio/HGO smoke harness for synthetic workflow
verification. This pass did not add browser automation because the repo has no
committed Playwright setup and no safe pre-authenticated Studio browser state.

## Result

- Added `pnpm studio:hgo:agentic-smoke`.
- Added `scripts/agentic-studio-hgo-smoke.test.mjs`.
- Added ignored report output under `artifacts/agentic-smoke/`.
- Added stable `data-testid` hooks to Studio Manuscript Library, snapshot,
  Publish/HGO projection, HGO import, and rendered projection surfaces.
- Added architecture and runbook documentation for the agentic smoke strategy.

## Harness Behavior

The command creates a synthetic Studio smoke draft, simulates a local synthetic
metadata change, creates local-only manuscript-library and manual snapshot
payloads, generates HGO projection JSON, validates it with the HGO validator,
confirms raw draft internals are omitted, checks known real-content markers are
absent, and writes a JSON report.

The harness performs no server writes, no publish action, no OAuth automation,
and no cloud mutation.

## Validation

Run:

```bash
pnpm studio:hgo:agentic-smoke
```

Report:

```text
artifacts/agentic-smoke/studio-hgo-smoke-report.json
```

## Remaining Manual Work

Authenticated browser smoke remains manual until Studio has a safe local test
auth path or a private operator-generated browser storage state that is never
committed.
