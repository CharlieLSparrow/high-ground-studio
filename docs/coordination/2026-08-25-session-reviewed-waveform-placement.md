# Session reviewed waveform placement

Date: 2026-08-25

## Outcome

A qualified exact-source waveform result can now become the real Session
conversation clock through an explicit, reversible decision. Approval is no
longer UI-only: browser transcript review, protected passage playback, and the
coaching transcript report all consume the reviewed placement.

## Durable decision contract

- `SessionAudioAlignmentDecisionReceipt` is append-only. Every approval or
  revocation records a room, exact alignment job/result SHA-256, actor, stable
  request identity, request-payload SHA-256, expected/current revision, reason,
  normalized placement, and timestamp.
- Optimistic revision checks prevent two tabs from silently replacing each
  other. A request ID is replay-safe only for the byte-equivalent normalized
  operation; reuse with different intent is a conflict.
- Approval is accepted only for qualified correlation evidence while the
  current released SHA-256, byte count, storage generation, locator, and media
  type still match both immutable job bindings.
- Revocation requires a reason and appends a new receipt. It never deletes the
  evidence or prior approval.

## Consumer integrity

`readSessionReviewedSourcePlacements` reconstructs active decisions before any
consumer may use them. It re-parses the immutable job/result, recomputes the
result hash and normalized placement, and rebinds both current protected
sources. A stale active approval holds assembly; it does not silently fall back
while the UI continues to say the measured placement is active.

The program-clock assembler treats placements as a graph:

- a signed edge says `target time = spine time + measured offset`;
- connected participant/device sources receive one normalized nonnegative
  Session clock;
- negative offsets move the spine later instead of discarding the target's
  earlier source history;
- cycles that disagree by more than one millisecond fail closed; and
- a partial graph cannot claim reviewed authority for a larger source set.

The resulting authority is `reviewed-waveform-placement`. Waveform review is
complete for placement, but originals and provider transcript times remain
immutable, drift correction remains unapplied, and Quipsly still does not claim
sample-accurate sync.

## UX

The Recordings workspace exposes one conventional action after qualified
evidence: **Use measured placement**. Success says that the Session conversation
clock is active. The active card shows signed offset, normalized target start or
source trim, residual drift, and revision. **Revoke placement** asks for a short
reason and returns consumers to the visible capture-clock estimate.

Advanced evidence remains available without making ordinary call setup or
joining depend on understanding correlation, ppm, hashes, or storage
generations.

## Verification

- Prisma formats, generates, and validates with the append-only decision model.
- Exact-source approval loading accepts current bindings, rejects stale result
  hashes, and ignores revoked decisions.
- Program-clock tests cover positive and negative offsets plus inconsistent
  multi-source cycles.
- Correction-desk tests prove measured offsets change assembled passage time.
- Report, route, decision, and alignment regression tests pass.
- Strict Quipsly TypeScript and both Capture static release gates pass.

Real two-device protected listening and transcript readback remain deferred
evidence. They validate perception and physical-device behavior; they do not
block continued implementation or replace the automated integrity gates.
