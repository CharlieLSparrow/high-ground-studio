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

There is also an operator-assisted browser smoke:

```bash
pnpm studio:hgo:browser-smoke
```

It writes:

```text
artifacts/agentic-browser-smoke/studio-hgo-browser-smoke-report.json
```

If private Studio auth state is missing, the browser smoke writes a `blocked`
report and exits without opening a browser or writing server data.

For a no-auth browser smoke of the HGO import/render path, run:

```bash
pnpm hgo:projection:browser-smoke
```

It writes:

```text
artifacts/agentic-browser-smoke/hgo-projection-browser-smoke-report.json
```

This command does not open Studio, does not require auth state, and does not
write to a server. If `HGO_BASE_URL` is not provided, it starts the web app on
an available local test port, waits for `/projection-preview/import`, runs the
synthetic import/render smoke plus staged review surfaces, and shuts the dev
server down.

For a no-auth visual artifact pass across the HGO projection preview surfaces,
run:

```bash
pnpm hgo:projection:visual-smoke
```

It writes a route-matrix JSON report to:

```text
artifacts/agentic-browser-smoke/hgo-projection-visual-smoke-report.json
```

It writes latest screenshots to:

```text
artifacts/playwright/hgo-projection-visual-smoke/
```

This command does not open Studio, does not require auth state, and does not
write to a server. If `HGO_BASE_URL` is not provided, it starts the web app on
an available local test port, captures synthetic projection preview screenshots,
and shuts the dev server down.

For focused pure tests of the staged artifact contract, run:

```bash
pnpm hgo:artifact:test
```

This command does not open a browser and does not write to a server. It creates
synthetic artifacts in memory and verifies the contract validator, parser,
summary, file-name helper, safety flags, review-gate matching, and
credential-marker rejection.

For focused pure tests of the session-only staged artifact Store Lab, run:

```bash
pnpm hgo:store-lab:test
```

This command does not open a browser and does not write to a server. It creates
synthetic staged artifacts in memory, imports them into the pure Store Lab
state, verifies safety flags remain `persisted: false` and `published: false`,
checks duplicate/import/archive/review behavior, and confirms simulated
promotion candidates do not publish.

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

The helper harness does not currently automate:

- Google OAuth / NextAuth sign-in
- authenticated Studio browser clicks
- real server snapshot writes
- browser replacement prompts
- downloaded files

The browser harness can automate the synthetic workflow only when an operator
has supplied a private storage-state file. Do not add OAuth workarounds. Use
`docs/runbooks/agentic-browser-auth-state.md` to create or refresh private auth
state.

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

For browser smoke reports:

- `blocked` means private auth state is missing and no browser/server write ran.
- `passed` means the browser used supplied auth state and may have created
  synthetic-only manuscript/snapshot records.
- `failed` means the browser run started but an auth, selector, server, render,
  or content-safety expectation failed.

For HGO no-auth browser reports:

- `passed` means synthetic projection JSON was pasted into
  `/projection-preview/import`, validation warnings appeared, the projection
  renderer mounted, `/projection-stage` loaded, `/projection-stage/review`
  showed blocked/needs-review/live-safe group text and blocker copy,
  `/projection-stage/import` accepted pasted synthetic JSON, showed the staged
  review gate and no-publish/no-persistence boundary, generated staged artifact
  JSON containing `artifactVersion`, the projection slug, `reviewGate`, and
  `persisted: false` / `published: false`, `/projection-stage/artifact`
  accepted the staged artifact JSON, validated it, showed the embedded review
  gate, showed persisted/published false safety state, rendered the embedded
  projection, `/projection-stage/store-lab` imported the generated artifact into
  browser session state only, marked review lifecycle states, attempted a
  simulated promotion candidate, archived the record, showed no-persistence and
  no-publish copy, a staged detail route rendered through the shared projection
  component, staged/readiness warnings appeared, known real-content markers were
  absent, and no server write happened.
  The report also records `artifactRoundtrip`, `artifactVersion`,
  `artifactStatus`, `recommendedNextAction`, `artifactContainsRealContent`, and
  `artifactJsonBytes`, plus Store Lab fields such as `storeLabRoundtrip`,
  `importedRecordCount`, `finalArchivedCount`, `simulatedPromotionCandidate`,
  and `noPersistence`.
- `blocked` means the browser or HGO route could not be made available safely,
  for example missing Chromium.
- `failed` means the browser run started but route, validation, render, or
  content-safety expectations failed.

For HGO visual smoke reports:

- `passed` means the projection preview map, empty import route, rendered import
  route, empty staged import review route, rendered staged import review route,
  staged artifact JSON route state, empty staged artifact inspection route,
  rendered staged artifact inspection route, Store Lab empty, imported,
  reviewed, and archived states, and discovered synthetic detail routes captured
  screenshots while known real-content markers stayed absent.
- `blocked` means Chromium or the HGO server path could not be made available
  safely.
- `failed` means a route, selector, render, screenshot, or content-safety
  expectation failed.
- `routes[]` records the path, status, screenshot path, page title, heading, and
  notes for each captured surface.

For artifact helper tests:

- `passed` means synthetic artifact creation, parsing, validation failure modes,
  summary fields, and safe file naming behaved as expected.
- `failed` means the in-memory contract changed and should be reconciled before
  trusting browser artifact roundtrips.

For Store Lab helper tests:

- `passed` means the session-only lifecycle model imports valid artifacts,
  rejects invalid/persisted/published artifacts, handles duplicate active
  artifact ids explicitly, marks review states, blocks or creates simulated
  promotion candidates correctly, archives records, and preserves event logs.
- `failed` means the future private-store model changed and should be resolved
  before using the browser Store Lab as design evidence.

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

The HGO no-auth smoke does not replace the Studio browser smoke. It covers only
the projection import, no-persistence staged import review, staged artifact
inspection, session-only Store Lab, staged review gate, staged surface, and
renderer paths.

The HGO visual smoke also does not replace authenticated Studio browser smoke.
It is a screenshot/report artifact pass for later human review of synthetic HGO
projection direction.

## Safety Boundary

This harness must not mutate Cloud SQL, Cloud Run, DNS, OAuth, billing, secrets,
IAM, public content, canonical manuscript files, or real HGO content.
