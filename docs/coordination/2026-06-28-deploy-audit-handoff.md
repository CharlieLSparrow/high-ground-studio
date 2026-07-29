# Quipsly Deploy Audit Handoff - 2026-06-28

## Summary

Codex paused feature work for a deployment audit after Antigravity's first pass. The local Quipsly app build now completes, and a concrete build-context/tracing blocker was fixed before deploy.

## Fixes made

- `apps/quipsly/src/app/(app)/nests/[slug]/actions.ts`
  - Removed upward repo-root probing for HGO source import.
  - Replaced it with explicit `QUIPSLY_HGO_PODCAST_YEAR_ONE_SOURCE_ROOT` configuration and a safe default app-local data root.
  - Reason: the previous search caused Next/Turbopack standalone tracing to treat large repo/native app folders as runtime files.
- `.dockerignore`
  - Added generated/native/non-web workspace exclusions so GitHub Actions Docker builds do not send QuipslyStudio, Mac apps, DerivedData, docs, scratch, or heavy non-deploy app roots into the studio image context.

## Validation run

- `./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit` - pass
- `bash -n scripts/release/quipsly-deploy-preview.sh scripts/release/quipsly-smoke-preview.sh scripts/release/quipsly-promote-preview.sh scripts/release/quipsly-release-preflight.sh scripts/release/quipsly-schema-sync.sh` - pass
- `bash -n apps/QuipslyStudio/script/agentctl.sh` - pass
- `python3 -m py_compile` for release/photo-grove helper scripts - pass
- `node scripts/scan-beta-blockers.mjs` - pass
- `corepack pnpm --filter quipsly build` with production collab URLs - pass

## Build artifact observations

- Previous build failed with `ENOSPC` because standalone tracing tried to copy `apps/QuipslyStudio/DerivedData`.
- After the fix, standalone output is about `428M`.
- No `QuipslyStudio`, `DerivedData`, `quipsly-mac`, or `apps/mac` paths were present in the standalone output.
- A Turbopack NFT warning still appears for the HGO source action, but it no longer pulls native/generated folders into the standalone artifact.

## Local smoke

- Built standalone server starts at `http://127.0.0.1:3033`.
- Without env file, `/projects` fails because `DATABASE_URL` and auth secret are missing. This is expected for an unconfigured standalone run.
- With `apps/quipsly/.env.local`, `/projects` returns 200.
- Local `/api/production-core/readiness` reports schema missing in the local configured DB. This is a local DB/schema state, not a production live state.

## Live smoke before deploy

- `https://nest.quipsly.com/projects` - 200
- `https://nest.quipsly.com/notebooks` - 200
- `https://nest.quipsly.com/create?project=high-ground-odyssey-manuscript` - 200
- `https://nest.quipsly.com/api/beta-readiness` - production core ready, zero missing production-core tables
- Full release smoke currently fails at `/outputs` with 404, indicating live is behind the current local build surface.

## Deploy blocker

Local `gcloud` has no active account selected:

```text
No credentialed accounts.
You do not currently have an active account selected.
```

Because of that, Codex could not run Cloud Build, preview deploy, preview smoke, or promotion from this machine.

## Next deploy command after auth is restored

Use local preview deploy because the current local workspace contains the audited fixes:

```bash
SOURCE_SHA=local-20260628-deploy-audit \
REGION=us-central1 \
PROJECT_ID=high-ground-odyssey \
bash scripts/release/quipsly-deploy-preview.sh
```

Then resolve the preview URL, smoke it, and promote only after green smoke:

```bash
PREVIEW_URL=<preview-url> bash scripts/release/quipsly-smoke-preview.sh
REGION=us-central1 PROJECT_ID=high-ground-odyssey bash scripts/release/quipsly-promote-preview.sh
```

If using GitHub Actions instead, commit and push the audited changes, then manually run `Deploy Cloud Run` with target `studio` so the action uses its deployer service account and schema-sync lane.

## Remaining risks

- The local disk is still tight; generated `.next` output was cleaned once, but future builds may need space management.
- The local DB used by `.env.local` is missing production-core tables, so local full release smoke will keep failing until local schema is synced or the smoke is pointed at live/preview.
- Turbopack still reports a trace warning for the HGO source action. It no longer bloats standalone output, but it should be revisited if builds slow again.
