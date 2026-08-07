# Quipsly Audio Flight Deck

Status: first production slice implemented on 2026-08-06

## Product outcome

The Audio Flight Deck is the creator-facing recording-health layer between capture and editing. It answers five questions without collapsing them into a mystery score:

1. Did every intended master actually appear?
2. Does Nest possess the exact immutable bytes?
3. Did the complete file decode into the expected media tracks?
4. Is useful audio signal present, and where does listening attention begin?
5. Are processing and transcription independently permitted?

The projection is read-only. It creates no workflow state, edits no source, releases no held media, and does not call a source proof-listened merely because automated evidence is green.

## Why a universal score is prohibited

A single “audio quality” number would flatten facts that require different owners and remedies. For example:

- a checksum mismatch is an integrity blocker;
- near-digital silence is a source-utility blocker for a required microphone master;
- a mouth click is a listening and treatment-review concern;
- a transcription hold may be a consent boundary rather than an audio defect;
- a picture-only camera master can be valid even though it has no audio track.

Quipsly therefore exposes six independent gates per source and derives only a coarse operational state: `READY`, `REVIEW`, `BLOCKED`, or `UNKNOWN`.

## Gate semantics

| Gate | Authority | Ready | Review | Blocked | Unknown |
| --- | --- | --- | --- | --- | --- |
| Source plan | `SessionExpectedSource` projection | exact capture/source identity is bound | candidate or unplanned retained source | missing or invalid required master | not used |
| Exact bytes | independent source-evidence projection | SHA-256, byte count, generation, and verification time are present | not used | drift, incomplete required identity, or absent required RecordingAsset | optional or observed evidence cannot be proven |
| Decoded media | complete media decode | audio track, decoded rate, and channels are measured | track/format needs interpretation | required audio master has no audio track | no complete decode result |
| Useful signal | complete decoded signal scan | useful signal is present | attention observations or optional/picture-only silence need listening | required audio master is near digital silence | no signal scan; transcript confidence is never substituted |
| Processing release | finalization policy | exact source is released | not used | source use remains held | no authoritative disposition |
| Transcript release | separate consent/release policy | transcription is released | transcription remains held | reserved for future integrity-specific transcript blocks | no authoritative disposition |

Overall state is the worst explicit gate with precedence `BLOCKED`, `REVIEW`, `UNKNOWN`, `READY`. A source is `READY` only when all six displayed gates are ready.

## Existing architecture reused

The implementation is a projection over existing canonical evidence:

- `SessionExpectedSource` and `SessionReadinessTopology` own intent, source roles, and missing-device visibility.
- `SessionSourceEvidence` owns independent comparison of finalization receipts, `RecordingAsset`, immutable cloud identity, Capture boundaries, runtime format, and complete decoded signal evidence.
- finalization dispositions keep media processing separate from transcription consent.
- the Source Journey continues to own historical plan → capture → retain → transcript → editor reconstruction.

No schema migration was required. The Flight Deck joins these projections by exact `recordingAssetId` or the existing capture binding and leaves unmatched evidence visible as unplanned.

## UX placement

The Flight Deck appears in the Session **Recordings** workspace after capture receipts and before the expert source ledger. This creates a deliberate disclosure ladder:

1. ranked finishing cockpit;
2. endpoint/source readiness topology;
3. capture/import receipts;
4. creator-facing Audio Flight Deck;
5. exact immutable source ledger.

Every non-ready source includes one evidence-specific next action. Desktop and 390-pixel phone-width rendered checks must remain free of horizontal overflow.

## Retained-data finding

The first read-only operation against the retained Capture-to-editor fixture exposed a real lineage gap instead of hiding it:

- two historical browser originals have independently verified exact bytes but are not bound to the current source plan;
- two editor-selected recovery-slot assets are bound to the plan and released for processing/transcription, but their own independent exact-byte and decoded-signal evidence is absent;
- the Flight Deck therefore reports `BLOCKED`, while preserving the green release facts and the historical originals.

This is not evidence that the originals are lost. It means editor materialization currently does not carry a sufficiently explicit, independently verifiable lineage projection from recovery slot back to immutable original. The correct repair is to model and verify that lineage, not to relabel the recovery slots as exact originals.

## Verification contract

The current slice is covered by:

- deterministic unit cases for fully ready, near-silent required audio, held processing, held transcription, absent scans, missing planned masters, and unplanned retained sources;
- component tests for the six visible gates, evidence action routing, blocked state, and fail-unknown empty state;
- the existing Session review suite to catch accessibility/query collisions;
- TypeScript 7-compatible application typecheck;
- a read-only local PostgreSQL operation over four retained sources;
- a signed-in rendered Chrome operation over 24 gates at desktop and 390-pixel phone width, with zero browser exceptions and no horizontal overflow.

## Next mature slices

1. **Verified recovery lineage** — bind derived/editor recovery assets to immutable source ancestors with explicit transformation receipts and independently checkable identity.
2. **Automatic decode coverage** — enqueue complete decode, waveform, broad-band frequency, and signal evidence immediately after exact-byte retention, with retry and failure visibility.
3. **Flight Deck listening navigator** — route every signal observation to the exact source clock, A/B treatment preview, and explicit reviewer disposition.
4. **Qualified treatment proposals** — de-click, de-plosive, de-noise, de-reverb, level, and loudness proposals must show the detected problem, selected range, parameters, before/after preview, and reversible decision receipt.
5. **Transcript evidence depth** — expose vocabulary/keyterm coverage, diarization uncertainty, source-clock alignment, and correction provenance without treating provider confidence as truth.
6. **Delivery conformance** — connect proof-listened masters to platform-specific loudness, peak, codec, channel, and publication packet checks without changing the immutable source.
