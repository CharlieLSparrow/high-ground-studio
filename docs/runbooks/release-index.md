# Release runbook index

Use the runbook for the surface being delivered. A green pull request is not a
release receipt.

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

## Capture

- Architecture:
  [Capture architecture](../../apps/mobile-capture/HighGroundCapture/CAPTURE_ARCHITECTURE.md)
- Verification:
  [Capture verification](../../apps/mobile-capture/HighGroundCapture/CAPTURE_VERIFICATION.md)

Required stages:

1. deterministic simulator suite;
2. exact-source archive and App Store export;
3. signing, entitlements, and privacy-string inspection;
4. physical-iPhone install and real workflow smoke;
5. TestFlight upload, processing, installation, and smoke;
6. App Store metadata, privacy, compliance, review, and release readback.

## High Ground Odyssey web

- [Web Cloud Run](web-cloud-run.md)

## Quipsly Studio

Native Studio delivery remains an operator workflow. A release must preserve
source media, identify the exact editor source revision, prove Program playback
or output artifact behavior, and retain rollback evidence.

## Schema

- [Database migrations](../deploy/database-migrations.md)
- [Prisma migration baseline](prisma-migration-baseline.md)

Never run a migration against an inferred target.
