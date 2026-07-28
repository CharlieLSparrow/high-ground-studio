# Release runbook index

Use the runbook for the surface being delivered. A green pull request is not a
release receipt.

Every supported app has a validated
[release manifest](../../release/manifests/README.md). Run
`pnpm release:manifests:audit` before release work. The manifest defines source
scope and required proof levels; this index explains how to obtain the proofs.

## Nest

- Local operation: [Quipsly Nest local](quipsly-nest-local.md)
- Release boundary:
  [Repository and release boundaries](../architecture/repository-and-release-boundaries-2026-07-23.md)
- Pipeline recovery:
  [Repository and pipeline recovery](../plans/repository-pipeline-recovery-2026-07-23.md)

Required stages:

1. deterministic typecheck and production build;
2. exact committed release context;
3. preview deploy from the source SHA;
4. separate-account auth, persistence, and authorization smoke;
5. promotion and production revision readback;
6. rollback path retained.

The Cloud Run workflow is manual-only while the repository recovery branch is
being integrated. Schema-owned releases require explicit approval, then build
a 30 MiB-capped schema image from the selected committed SHA, apply committed
Prisma migrations, and run the targeted additive syncs. The older
`quipsly-schema-sync.sh` bridge still uses Prisma
`db push --accept-data-loss`; it is fail-closed, is not part of the workflow,
and must not be enabled merely to make a deploy proceed.

## Capture

- Architecture:
  [Capture architecture](../../apps/mobile-capture/HighGroundCapture/CAPTURE_ARCHITECTURE.md)
- Verification:
  [Capture verification](../../apps/mobile-capture/HighGroundCapture/CAPTURE_VERIFICATION.md)
- Latest Apple-distributed checkpoint:
  [Capture build 4](../coordination/2026-07-23-capture-build-4-release-checkpoint.md)
- Current signed local candidate:
  [Capture build 6](../coordination/2026-07-24-capture-build-6-release-checkpoint.md)
- Previous signed local candidate:
  [Capture build 5](../coordination/2026-07-24-capture-build-5-release-checkpoint.md)
- Canonical iOS release procedure:
  [Quipsly Capture release](../quipsly/ios-capture-release-runbook.md)

Required stages:

1. deterministic simulator suite;
2. exact-source archive and App Store export;
3. signing, entitlements, and privacy-string inspection;
4. physical-iPhone install and real workflow smoke;
5. TestFlight upload, processing, installation, and smoke;
6. App Store metadata, privacy, compliance, review, and release readback.

Pinned local entry points:

```bash
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh verify
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh ui_test
scripts/release/quipsly-capture-release-from-commit.sh candidate --revision <commit-sha>
scripts/deploy-testflight.sh
```

The first three commands never upload. The candidate command resolves one
exact commit into a disposable detached worktree, runs the deterministic UI
suite, then signs and verifies the archive and IPA. The lower-level `release`
lane is archive-only diagnosis and is not a fully qualified candidate. The
final command uses the same isolation boundary and locked `beta` lane and requires
`APP_STORE_CONNECT_API_KEY_PATH`; do not place that credential in the
repository.

## High Ground Odyssey web

- [Web Cloud Run](web-cloud-run.md)

The deploy helper materializes `release/manifests/hgo-web.json` from the
selected commit before installing, testing, building, or submitting source.
The `/api/health` readback must report that full source SHA.

## Quipsly Studio

Native Studio delivery remains an operator workflow. A release must preserve
source media, identify the exact editor source revision, prove Program playback
or output artifact behavior, and retain rollback evidence.

## Schema

- [Database migrations](../deploy/database-migrations.md)
- [Prisma migration baseline](prisma-migration-baseline.md)

Never run a migration against an inferred target.
