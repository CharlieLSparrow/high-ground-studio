# Agentic Studio/HGO Smoke Harness

Date: 2026-05-22

## Command

Run from the repo root:

```bash
pnpm studio:hgo:agentic-smoke
```

The command writes a JSON report to:

```text
artifacts/agentic-smoke/studio-hgo-smoke-report.json
```

The report is generated output and should not be committed.

## What It Tests

The current harness is a local API/helper-level smoke. It does not open a
browser and does not write to a server.

It verifies:

- synthetic Studio smoke draft creation
- synthetic-only draft recognition
- local-only manuscript-library payload shape
- local-only manual snapshot payload shape
- synthetic browser-local change handling
- HGO episode projection JSON generation
- raw draft internals are omitted from the projection
- known real-content markers are absent from the projection
- HGO projection validation accepts the draft
- staged-review, pull-quote, and unresolved-citation warnings are present

## What It Cannot Test Yet

The harness does not currently automate:

- Google OAuth / NextAuth sign-in
- authenticated Studio browser clicks
- real server snapshot writes
- browser replacement prompts
- downloaded files
- visual screenshots or traces

Do not add OAuth workarounds. A browser smoke should wait for either a deliberate
local test-auth mode or a private operator-generated Playwright storage-state
file that is never committed.

## Reading The Report

Important report fields:

- `status`: `passed`, `failed`, or future `blocked`
- `steps`: ordered machine-readable step results
- `warnings`: expected limitations, including browser-auth limitations
- `routesTested`: route surfaces represented by the helper smoke
- `validation`: HGO projection validation result
- `confirms.syntheticDataOnly`: should be `true`
- `confirms.noServerWrites`: should be `true`
- `confirms.noPublishAction`: should be `true`
- `confirms.noAutosave`: should be `true`

If `status` is `failed`, inspect `errors` and the failed step before rerunning.

## Manual Follow-Up

Use the normal browser smoke after the helper harness passes:

1. Open Studio `/manuscript`.
2. Load synthetic smoke draft.
3. Open `Backup`.
4. Create `Synthetic Agent Smoke Draft`.
5. Save a manual synthetic snapshot.
6. Load latest from the selected synthetic manuscript.
7. Open `Publish`.
8. Generate HGO projection JSON.
9. Open HGO `/projection-preview/import`.
10. Paste the projection JSON.
11. Confirm staged-review and citation warnings appear.
12. Confirm the projection renderer appears.
13. Confirm no real manuscript or real HGO content is used.
14. Confirm no autosave, publish, or collaboration action happens.

## Safety Boundary

This harness must not mutate Cloud SQL, Cloud Run, DNS, OAuth, billing, secrets,
IAM, public content, canonical manuscript files, or real HGO content.
