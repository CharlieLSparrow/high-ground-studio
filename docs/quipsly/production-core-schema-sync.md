# Quipsly Production Core Schema History

Originally recorded: 2026-06-07
Superseded: 2026-07-31

This document records the production-core models introduced in
`production-core-implementation-pass-1.md`. Its original targeted SQL job is
retained for incident archaeology only. It is not a supported release path.

## Why this exists

Quipsly is moving from route-local prototype JSON into first-class production concepts:

- Nest invites
- asset attachments
- asset variants
- asset processing jobs
- source units
- document operations
- production rooms
- timeline versions
- output packets
- publish attempts
- published artifacts
- workflow jobs

The repository now has a replayable, committed Prisma migration history.
Production schema changes use `scripts/release/quipsly-schema-release.sh`,
which proves the complete migration chain in a disposable database, pins one
immutable schema image, verifies an on-demand Cloud SQL backup, applies
`prisma migrate deploy`, and requires a current ledger plus zero live schema
diff. See `docs/runbooks/prisma-migration-baseline.md`.

## Files

- SQL patch: `ops/quipsly-production-core-additive.sql`
- Runner: `scripts/quipsly-production-core-schema-sync.mjs`
- Schema job image: `ops/prisma-migrate.Dockerfile`
- Runtime readiness endpoint: `/api/production-core/readiness`

## Supported apply pattern

Plan from the exact clean release commit:

```bash
release_sha=$(git rev-parse HEAD)
bash scripts/release/quipsly-schema-release.sh \
  --revision "$release_sha" \
  --confirm-target high-ground-odyssey/studio-postgres
```

After reviewing the plan receipt, apply from the unchanged commit:

```bash
bash scripts/release/quipsly-schema-release.sh \
  --revision "$release_sha" \
  --apply \
  --confirm-target high-ground-odyssey/studio-postgres
```

The historical `ops/quipsly-production-core-additive.sql` and
`scripts/quipsly-production-core-schema-sync.mjs` are recovery references, not
commands to run when readiness reports drift. A drift report blocks release
until it is represented by a reviewed forward migration.

## Verify

After deploying the app revision that contains the readiness endpoint:

```bash
curl -sS https://nest.quipsly.com/api/production-core/readiness
```

Expected:

```json
{
  "ok": true,
  "status": "ready"
}
```

If it reports `needs-schema-sync`, stop promotion. Diagnose the difference,
add or repair a committed forward migration, and use the guarded release lane.

## Product impact

Once synced, Quipsly can safely build on these production truths:

- Inviting an email to a Nest is represented as both access and an invite ledger.
- Media files can be attached to one or more Nests without pretending the Nest is a bucket.
- Document edits and tag changes can be audited and eventually rolled back.
- Episode/video work can move from `StudioEpisodeProduction` JSON toward durable production rooms and timeline versions.
- Publishing can move toward output packets and per-destination artifacts.
- Long-running media/AI/publishing work can land in workflow jobs instead of vanishing into UI state.
