# Quipsly media vault consolidation work order

Status: active and non-destructive
Owner: Quipsly product and media infrastructure
Last reviewed: 2026-07-27

## Purpose

Capture, Nest, Studio, local proxies, podcast recordings, and exported review
artifacts all touch the same media ecosystem. This work order prevents a loose
file or bucket prefix from being mistaken for identity, access, or episode
meaning.

The operating policy is
[`media-vault-policy.md`](./media-vault-policy.md). This document is the
execution order for inventory and consolidation.

## Approved destination

Use one primary product bucket by default:

- `gs://high-ground-odyssey-media`

Use the policy namespaces:

- `media-vault/raw/...`
- `media-vault/proxy/...`
- `media-vault/thumb/...`
- `media-vault/recordings/livekit/...`
- `media-vault/recordings/mobile/...`
- `media-vault/exports/...`
- `media-vault/packets/...`
- `media-vault/review/...`

Do not create another bucket merely because a prefix is empty or a workflow is
new.

## Safety boundary

Use `scripts/verify-cloud-bucket.sh` before any live media-vault work.

It should not be used as a migration script.

It does not move loose proxies, attach recordings, create `StudioMediaAsset` records, or decide episode roles.

This prevents the old anti-pattern: "the editor needs proxies, therefore create another bucket."

Default verification is read-only:

```bash
bash scripts/verify-cloud-bucket.sh
```

Any create, CORS, copy, registration, record update, or deletion is a separate
explicit action with its own authorization and readback.

## Evidence inventory

Start locally:

```bash
node scripts/quipsly-local-media-vault-inventory.mjs --proxies-only --summary-only --json
node scripts/quipsly-local-media-vault-inventory.mjs \
  --proxies-only \
  --project high-ground-odyssey-manuscript \
  --episode episode-4 \
  --limit 25 \
  --write
```

The known July 2026 inventory found a large derivative/export pile, including
173 local proxy files. That result was dry-run evidence only. Counts and paths
must be refreshed before action; they are not authorization to upload or
delete.

An inventory row is actionable only when it identifies:

- immutable raw `StudioMediaAsset`, verified `RecordingAsset`, or authorized
  episode source;
- exact local path or cloud generation;
- expected SHA-256 and byte count when available;
- owning actor/Nest/project/episode;
- intended derivative role and destination;
- collision/precondition result;
- rollback and retention disposition.

Unmapped files remain `held-unattached`.

## Proxy migration ladder

1. Inventory a small, reviewable batch.
2. Resolve the immutable raw parent in Quipsly.
3. Verify the local derivative is technically valid.
4. Compute the policy destination from server-authorized identities.
5. Upload create-only with an object-generation precondition.
6. Read back the destination generation, size, checksum, and media probe.
7. Register through `/api/media-vault/proxies/register`.
8. Confirm the authorized episode inventory and editor show the same raw parent,
   proxy, role, and readiness.
9. Preserve the local file and old cloud object until a separate retention
   decision.

If any step fails, keep the source and manifest intact. Do not improvise a new
bucket, rename the source, or mark the episode proxy-ready.

## Recording attachment ladder

1. Capture or provider egress creates evidence attached to a `CallRoom` or
   capture session.
2. Canonical finalization verifies one immutable object generation.
3. The app creates or reconciles the `RecordingAsset`.
4. Transcript work attaches to that recording identity.
5. Promotion creates or reuses `StudioMediaAsset` without mutating the source.
6. Episode attachment records spine, participant-camera, room-composite,
   reference, or b-roll meaning.
7. Video queues a proxy job; audio may be reviewed as a spine candidate without
   a video proxy.
8. Human-reviewed alignment creates reversible timeline metadata.

Provider receipt slots, held-consent recordings, and unverified uploads never
enter this ladder as playable media.

## Batch receipt

Every consolidation batch should produce a versioned, reviewable receipt:

```json
{
  "schema": "quipsly-media-vault-consolidation-v1",
  "sourceCommit": "<full git sha>",
  "createdAt": "<server or operator UTC time>",
  "operator": "<authenticated actor>",
  "dryRun": true,
  "entries": [],
  "mutatedOriginals": false,
  "deletionsPerformed": false
}
```

A mutation run must reference the approved dry-run receipt and record exact
source/destination generations plus registration/readback outcomes. Never
rewrite the dry-run receipt in place.

## Stop conditions

Stop and preserve evidence when:

- cloud auth, project, bucket, or actor scope is ambiguous;
- source generation or hash differs;
- destination already exists with different bytes;
- the raw parent or episode attachment cannot be proved;
- consent/release or retention state is held;
- a required proxy/transcript/edit record cannot be reconciled;
- the editor and database disagree after registration;
- cleanup would remove the last verified copy.

## Completion definition

A batch is complete only when Quipsly, independent storage readback, and the
authorized user-facing inventory agree on the same source, derivative,
attachment, and safe next action. Moving bytes alone is not completion, and
cleanup is never implied.
