# Protected-source automated edit proof

Date: 2026-08-04

## Outcome

Signal-bound automated-edit evidence can now be proof-listened only through the
protected media source named by the proposal set. The deterministic analysis
binds all of the following before rendering its player:

- RecordingAsset ID;
- immutable source SHA-256;
- storage generation;
- decoded signal-profile SHA-256; and
- promoted protected-playback source ID and exact `/api/ingest/media/:sourceId`
  route.

The edit evidence map renders native audio or video controls for that source.
Selecting a range seeks both the evidence map and the protected player. A
proof-listen receipt remains disabled until protected playback has actually
entered the exact evidence interval and the reviewer explicitly confirms the
listen. Program-monitor playback cannot satisfy this boundary.

The server independently rejects a forged protected source, RecordingAsset,
source hash, signal profile, missing playback receipt, non-finite time, or a
playback position outside the canonical proposal range. A valid receipt copies
the proposal set's immutable source and signal identities into append-only
review history.

## Operated real Episode 4 proof

The retained operation created/refreshed the local test production
`protected-edit-proof-episode-4-20260804`, attached the already promoted Episode
4 source without copying or changing it, and loaded its real transcript timing
in the editor.

The rendered product then:

- resolved RecordingAsset `local-transcript-asset-episode-4`;
- resolved protected source `local-transcript-source-episode-4`;
- served `episode-4-charlie-680-740.wav` through the authenticated media route;
- loaded the exact 60-second source with native media ready state 4;
- selected the measured-signal transcript gap beginning at 4.84 seconds;
- played the protected source into that range;
- explicitly confirmed the source-range listen;
- saved a `PROOF_LISTENED` receipt while leaving the proposal unapplied; and
- retained unchanged source media with no browser exception or overflow.

Independent PostgreSQL readback confirmed the latest receipt contains source
SHA-256 `5bc166248b5fb9da9a69ddee050ff43a1b4f8b59b878af4e7be6f141a8fee15d`,
signal profile `23cd7792219b5c7bdda3a00cc238f869f8b49bcb6f6142e8d7d351926c92df36`,
the same RecordingAsset and protected source IDs, and an in-range playback
position. The operation does not claim a subjective quality or speaker
judgment; it proves exact-source playback and review-receipt continuity.

## Verification

- protected-player UI, visualization contract, source resolver, edit API, and
  review ledger: 27 focused tests;
- retained protected-proof static contract: 2 tests;
- rendered real Episode 4 operation: passed;
- independent receipt readback: passed;
- strict Quipsly TypeScript: passed;
- isolated production build: passed all 166 routes; and
- local lifecycle doctor and strict repository health: passed.

## Next boundary

Project capture discontinuities and synchronization drift onto the same source
clock, then apply and undo one measured range decision against this protected
Episode 4 source. Camera-switch proof should use the exact aligned visual source
with the same identity discipline before automated multicamera editing is called
production-ready.
