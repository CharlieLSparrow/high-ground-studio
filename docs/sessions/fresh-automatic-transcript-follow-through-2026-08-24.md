# Fresh automatic transcript follow-through — 2026-08-24

## Outcome

The retained local coaching Session now proves that a completed transcript can become a private, candidate-only coaching packet without an open browser and without duplicating work under concurrent reconciliation.

This is local automation evidence, not production or human acceptance evidence. It does not claim that a physical phone uploaded the source, that Cloud Scheduler ran in production, or that a coach approved the proposed notes.

## Exact evidence

- Tested committed source: `112fe969e62d85641535386e36350c67a34cfaf1`
- Session: `cmt85591s00c2nxxllzv8y81g`
- Transcript job: `cmt85729100dpnxxlixayoglq`
- Canonical coach/author: `cmt85564v00binxxlz9k2jble`
- Packet build: `126c3bfa-b9a8-42ba-8d2c-324de46d385f`
- Receipt: `artifacts/coaching-acceptance/8c3c105e/automatic-follow-through-receipt.json`
- Receipt mode: `0600`

The operation ran two follow-through reconciliations concurrently against retained PostgreSQL. Both converged on exactly one summary and four highlights. The canonical task, delivery, and calendar-link counts were unchanged. The completed transcript received a durable `followThrough.packetStatus = ready` marker and was excluded from the next maintenance scan.

## Concurrency repair

The first concurrent flight exposed Prisma `P2034`: a transaction that waited for the advisory lock retained an older serializable snapshot and conflicted when it later wrote. The reconciler now retries the entire serializable transaction up to three times. The second clean flight recovered from the same real contention and preserved the exactly-once result.

The retry is deliberately around the whole transaction. It does not reuse the stale transaction or weaken isolation.

## Product boundary

Automatic follow-through may:

- reconcile durable transcript-worker evidence;
- choose the booked coach as the canonical private author;
- prepare one private summary and candidate highlights;
- resume interrupted completed transcripts; and
- retry held or still-progressing transcript work in a bounded maintenance batch.

Automatic follow-through may not:

- assign a task;
- share notes with the client or another Nest member;
- send a delivery;
- change a calendar;
- publish anything; or
- substitute for the coach's review.

The maintenance worker reserves capacity for progressing, held, and interrupted-completed jobs so an old backlog in one state cannot indefinitely starve the others.

## Deployment path

Commit `41f2910f` adds an idempotent Cloud Scheduler setup command and release wiring for the worker identity and immutable Cloud Run audience. The scheduler calls `POST /api/cron/capture-transcript-follow-through` with a short-lived Google OIDC token. The endpoint verifies both the exact service-account email and audience; no long-lived bearer secret is embedded in the job.

The scheduler defaults to a two-minute cadence, a bounded batch of eight, a 60-second deadline, and three platform retries. The setup command reads the deployed job back and fails unless URI, method, audience, identity, and schedule match exactly.

Deployment remains a deliberate release-train action. Local proof does not assert that the scheduler has been created or invoked in production.

## Reproduce locally

With the retained local Nest, PostgreSQL, and Firebase emulator running from a clean tracked worktree:

```bash
pnpm quipsly:fresh:transcript-follow-through
```

Static scheduler and release checks:

```bash
pnpm quipsly:transcript-follow-through:scheduler:test
node --test scripts/release/quipsly-deploy-preview.test.mjs
bash -n scripts/release/quipsly-transcript-follow-through-scheduler.sh
pnpm --filter quipsly typecheck
```

## Remaining acceptance

- Deploy an exact-source Nest preview with transcript follow-through identity configuration.
- Create/read back the production scheduler only after that revision is qualified.
- Prove one production transcript becomes one private packet with no browser polling.
- Prove a client cannot read the coach-private packet by direct route or API.
- Have a coach review, edit, and explicitly create one canonical task from that packet.
