# Durable episode edit-review ledger checkpoint

Date: 2026-08-03

## Outcome

Quipsly now preserves the complete history behind automated episode edits. A
proposal does not disappear when the browser reloads, and an Apply click no
longer masquerades as a shared save.

The canonical path is:

1. authorized analysis produces one source-bound proposal set;
2. Nest atomically stores the complete payload and a creation receipt;
3. proof, dismiss, apply, and restore append actor-bound receipts;
4. apply/restore remain explicitly local-draft effects; and
5. a successful episode timeline transaction appends a separate canonical-save
   receipt linking the draft actions it committed.

No receipt rewrites source media or an older receipt.

## Data model

`StudioEpisodeEditProposalSet` retains:

- episode and creator identity;
- proposal-set kind/version and provider/model;
- exact timeline and transcript SHA-256 bindings;
- transcript block count and millisecond bounds;
- recording asset, immutable source SHA, storage generation, and signal-profile
  SHA when decoded evidence exists;
- complete proposal JSON; and
- a canonical payload SHA-256.

`StudioEpisodeEditReviewReceipt` retains:

- actor snapshot and stable client request ID;
- action and effect scope;
- proposal/candidate/range/timeline subject;
- exact source interval in integer milliseconds;
- proposal-origin, local-before, and optional after timeline fingerprints;
- transcript/source/storage/signal identity;
- canonical request SHA and structured evidence; and
- occurred/server-created timestamps.

The actor-email/request ID is unique inside one episode. Exact replay returns
the existing row; changed reuse fails with a conflict.

## UX truth

The editor's Durable review history distinguishes:

- Review only;
- Local draft; and
- Canonical timeline.

Proof playback still runs when its receipt service is temporarily unavailable,
but the UI flags the missing durable evidence. Apply and restore fail closed
when a required draft-action receipt cannot be stored. Older saved ranges that
predate proposal-set identity remain restorable, but the UI explicitly labels
them as legacy rather than fabricating history.

## Save boundary

The web editor sends the pending local-draft receipt IDs and SHA-256 before and
after bindings with each timeline save. Nest independently hashes the raw
timeline fingerprints and writes the timeline plus `TIMELINE_SAVED` receipt in
one serializable transaction. A repeated save request can return the existing
receipt when the current timeline already equals the submitted timeline.

## Operated acceptance

The signed-in local synthetic QA episode
`deterministic-edit-evidence-20260803` was operated through the rendered editor:

1. an older range was restored and manually saved;
2. deterministic analysis resolved the released synthetic decoded source;
3. the proposal-set creation receipt survived reload;
4. proof-listen played untouched `00:02–00:08` context around the exact
   `00:04–00:07` range and appended `PROOF_LISTENED`;
5. Apply appended `APPLIED_TO_DRAFT` before creating the local range;
6. manual save appended `TIMELINE_SAVED` and linked the pending draft receipt;
7. reload restored the exact range and all six episode receipts;
8. proof-listening the persisted range appended a seventh receipt while
   preserving the proposal-origin fingerprint separately from the current
   saved-timeline fingerprint; and
9. PostgreSQL retained two proposal sets, seven distinct receipts, two proof
   receipts, one draft apply, and two canonical saves.

This fixture is explicitly synthetic. It proves persistence, identity,
idempotency, scope labeling, save linkage, and UI reload—not subjective audio
quality, genuine HGO content, physical-device capture, deployment, rendering,
or publishing.

## Verification

- Prisma client generation: passing;
- additive migration `20260803211500_add_episode_edit_review_ledger`: applied;
- local migration status: 50/50 current with zero schema diff;
- strict domain TypeScript: passing;
- strict Nest TypeScript: passing;
- six focused suites: 33/33 passing;
- signed-in rendered browser operation: passing;
- PostgreSQL proposal/receipt/source-boundary readback: passing; and
- local Nest, PostgreSQL, Firebase Auth emulator, transcript worker, and media
  worker health: passing.

## Next

Use this ledger for genuine podcast/coaching transcription evaluation and then
for speaker-to-camera mappings, reversible multicamera draft assembly, and
before/after render receipts. The next automation layers should reuse these
same effect scopes instead of inventing hidden apply or save semantics.
