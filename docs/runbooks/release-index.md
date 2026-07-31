# Release runbook index

Retained product-operation and test-data policy:

- [`quipsly-retained-dogfood.md`](./quipsly-retained-dogfood.md) defines how
  useful QA users and artifacts remain available for longitudinal web,
  TestFlight, and physical-device acceptance without leaking secrets or
  implying external side effects.

Use the runbook for the surface being delivered. A green pull request is not a
release receipt.

Every supported app has a validated
[release manifest](../../release/manifests/README.md). Run
`pnpm release:manifests:audit` before release work. The manifest defines source
scope and required proof levels; this index explains how to obtain the proofs.

## Nest

- Local operation: [Quipsly Nest local](quipsly-nest-local.md)
- Identity repair:
  [Quipsly identity reconciliation](quipsly-identity-reconciliation.md)
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
being integrated. Schema-owned releases require explicit approval and use
`scripts/release/quipsly-schema-release.sh`. The guarded lane first proves the
entire migration chain and zero schema diff in a disposable database, pins one
exact schema-image digest, creates and independently reads back a successful
on-demand Cloud SQL backup, applies `prisma migrate deploy`, then requires both
an up-to-date migration ledger and zero production schema diff. It produces a
mode-0600 receipt and never invokes the legacy targeted syncs. Run it without
`--apply` for a non-mutating plan; apply requires the exact `PROJECT/INSTANCE`
confirmation printed by that plan.

The older `quipsly-schema-sync.sh` bridge uses Prisma
`db push --accept-data-loss`; it is fail-closed, is not part of the workflow,
and must not be enabled merely to make a deploy proceed. The targeted schema
job modes remain recovery tools only and are not a release stage.

Generated reviewer entry points:

```bash
pnpm quipsly:cloudrun:smoke-generated-reviewer
pnpm quipsly:cloudrun:promote-generated-reviewer
```

The first command creates a tightly named temporary owner, exercises the real
production auth, Home Nest, Session, writing, editor, recorder, research, and
publishing contracts, and removes its Firebase and database artifacts without
changing traffic. The second resolves the exact zero-traffic preview and then
delegates immutable source binding, the same signed-in journey, revision-bound
receipt, promotion, production readback, and automatic rollback to the
canonical promotion script. Both commands read secrets without printing them,
own the authenticated Cloud SQL proxy lifecycle, and fail closed when cleanup,
preview identity, or runtime proof is incomplete.

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
pnpm quipsly:mobile:dogfood-task-edit
pnpm quipsly:mobile:dogfood-goal-edit
scripts/release/quipsly-capture-release-from-commit.sh candidate --revision <commit-sha>
scripts/release/quipsly-capture-screenshots-from-commit.sh --revision <commit-sha>
scripts/deploy-testflight.sh
```

The first six commands never upload. The task-edit and goal-edit dogfood
commands are current-source acceptance lanes, not release lanes: each starts
local Nest, creates a disposable real Firebase identity and canonical database
records, drives the compiled iPhone Simulator through one exact edit and
restoration, proves database and Firebase cleanup, and owns its local server
and Cloud SQL proxy. They require authorized Google Cloud access and
intentionally perform short-lived writes against the configured canonical
database.

The candidate command resolves one
exact commit into a disposable detached worktree, runs the deterministic UI
suite, then signs and verifies the archive and IPA. The lower-level `release`
lane is archive-only diagnosis and is not a fully qualified candidate. The
screenshot command applies the same committed-source boundary to DEBUG-only
composition evidence and keeps it ineligible for submission. The final command
uses the same isolation boundary and locked `beta` lane and requires
`APP_STORE_CONNECT_API_KEY_PATH`; do not place that credential in the repository.

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
