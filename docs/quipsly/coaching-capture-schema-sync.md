# Quipsly coaching/capture schema sync

Last updated: 2026-07-18

## Purpose

This is the targeted production sync path for Homer-friendly coaching, billing,
scheduling, consent-aware capture, recording evidence, transcripts, notes, and
action items.

The sync also owns the append-only `CaptureRoomStateReceipt` ledger. Every
iPhone room-state mutation requires a UUID receipt, and the API applies the
receipt plus its `CallRoom` projection in one serializable transaction.

Use this instead of broad Prisma `db push` when the goal is only to make the
coaching/capture runtime tables available in the Nest database.

## User-facing product rule

The easy beta path is:

1. HighGroundOdyssey.com or Quipsly.com explains the offer.
2. The user signs in or creates a free Quipsly account.
3. Nest owns the operational truth: offering, hold, booking, payment evidence,
   calendar link, call room, consent, recording asset, transcript job, packet,
   notes, and follow-up actions.
4. Stripe and Calendar providers are evidence sources. They do not become the
   product source of truth.
5. A state is only called external/live when there is an actual receipt or URL.

## Files

- SQL: `ops/quipsly-coaching-capture-additive.sql`
- Runner: `scripts/quipsly-coaching-capture-schema-sync.mjs`
- Release wrapper: `scripts/release/quipsly-coaching-capture-schema-sync.sh`
- Verification smoke: `scripts/quipsly-coaching-public-handoff-smoke.mjs`
- Readiness audit: `scripts/quipsly-coaching-schema-readiness.mjs`
- Job image: `ops/prisma-migrate.Dockerfile`

## Production command

```bash
PROJECT_ID=high-ground-odyssey scripts/release/quipsly-coaching-capture-schema-sync.sh
```

Run this additive schema job before deploying a Nest revision that contains the
durable room-state route. The table is additive, old Nest revisions ignore it,
and the sync backfills valid historical receipt blobs from `CallRoom.metadataJson`.
That makes the safe rollout order: schema job, schema verification, app deploy,
then authenticated receipt replay proof. Do not use broad `prisma db push` for
this release lane.

Default target:

- Cloud Run Job: `quipsly-coaching-capture-schema-sync`
- Region: `us-central1`
- Cloud SQL instance: `high-ground-odyssey:us-central1:studio-postgres`
- Runtime service account: `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`
- Database secret: `studio-database-url:latest`

## 2026-07-07 proof

Cloud Run Job execution completed successfully:

- Execution: `quipsly-coaching-capture-schema-sync-4shpn`
- Verification line: `Coaching/capture schema ready: 19 tables verified.`

Live smokes passed after promotion to `studio-00344-hid`:

```bash
node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=https://nest.quipsly.com --json
node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=https://studio-hm2odnvjga-uc.a.run.app --json
```

Both returned `ok: true` with six passing checks and `offerings.source = quipsly-database`.

## Notes

The Cloud Build context for this job was still large, about 295 MB before
compression. That is safe but slow. Future deploy hygiene should keep shrinking
Cloud Build inputs so small operational jobs stop riding a woolly mammoth.
