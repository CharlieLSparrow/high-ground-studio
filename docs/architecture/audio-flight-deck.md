# Quipsly Audio Flight Deck

Status: Flight Deck and audited recovery-lineage slices implemented on 2026-08-06

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
- `verifyCaptureRecoveryLineage` owns the separate recovery-replica authority. It verifies the request hash, immutable original, plan expectation, imported source, durable replica, decision, and release receipt without borrowing the original's Capture boundaries.
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

### Protected source audition

The Flight Deck now includes a source-bound audition navigator instead of requiring creators to infer listenability from green gates. For every source with an authorized `/api/ingest/media/{sourceId}` route, it provides:

- explicit source selection by `recordingAssetId`;
- native audio or video controls over the protected route;
- the complete-decode duration and a shared source-clock slider;
- a bounded check of up to ten seconds from the selected time;
- a compact complete-decode waveform when signal evidence exists; and
- exact-time buttons for every signal observation.

The navigator never exposes the private storage locator. Changing source selection does not reuse a media element identity, and client playback remains navigation rather than a proof-listen or approval receipt. A failed or absent protected route stays visibly unavailable while health evidence remains inspectable.

The existing shared-clock attention navigator is also rendered in **Recordings**, not only **Transcript**. This makes transcript uncertainty, detector suggestions, repair candidates, mastering observations, and edit proposals discoverable beside source health while preserving their separate authorities.

### Listening decisions in shared context

The shared-clock navigator can now close one mature authority directly: an audible-event detector suggestion. The creator listens once through the clustered protected-source context, while the client records only contiguous source-clock second bins. A detector conclusion remains disabled until the exact server-required one-second pre-roll, event range, and one-second post-roll have all traversed the player.

Saving **audible event confirmed**, **detector false positive**, or **needs source comparison** calls the existing authorized review route. The server reloads the current immutable source and current detector receipt, rejects stale analysis or incomplete playback context, and appends an idempotent review receipt. False-positive and comparison decisions require a note. The Session refreshes from canonical state after the receipt is accepted.

This deliberately does not create a universal “reviewed” button. Transcript verification, dialogue-repair review, mastery approval, and edit proof-watch/listen continue to use their own evidence and authority contracts. A detector receipt authorizes no repair, edit, promotion, or publication, and browser playback tracking is disclosed as support for the person’s explicit conclusion rather than independent proof of audibility.

## Retained-data finding

The first read-only operation against the retained Capture-to-editor fixture exposed a reader/authority gap instead of hiding it:

- two historical browser originals have independently verified exact bytes but are not bound to the current source plan;
- two editor-selected recovery-slot assets are bound to the plan and released for processing/transcription, but the general evidence readers initially required native Capture boundaries they were never meant to own;
- the Flight Deck therefore initially reported `BLOCKED`, while preserving the green release facts and the historical originals.

The recovery route already persisted sufficient lineage. A shared verifier now recognizes it as a third explicit authority: `AUDITED_RECOVERY_REPLICA`. It independently compares the recovery request, request SHA-256, immutable original, expected-source identity, imported-source hash and generation, durable-replica hash, bytes, bucket, path and generation, decision reason/time, authority confirmation, and finalization release. It exposes no actor identity or private source locator.

After that repair, all four retained assets independently verify. Both selected recovery journeys are complete, and their Capture checkpoint is correctly **not applicable** rather than forged from the original.

The next retained operation proved that both recovery replicas already owned completed `audio-signal-profile` jobs. The visibility defect was in the Session read model: it read capture-time `reportedSourceProfile` fields but did not join the canonical Studio processing receipt created by recovery. The repaired projection now:

- resolves the promoted Studio media asset from the recovery manifest;
- selects its latest signal-profile job;
- validates the versioned job and completed result contracts;
- binds the job to the recovery replica by Studio asset ID, SHA-256, and exact byte count;
- keeps imported-source, durable-replica, and processing-source generations distinct rather than pretending they are the same object; and
- exposes derived decode/signal evidence without mutating the immutable Capture manifest.

The retained Episode 9 workspace now reports two selected recovery masters `READY`, two historical unplanned originals `REVIEW`, and zero blocked or unknown sources. Both selected masters completely decode as 48 kHz mono with signal present and no signal observations. The overall Session remains `REVIEW` because historical unplanned sources are intentionally visible.

## Verification contract

The current slice is covered by:

- deterministic unit cases for fully ready, near-silent required audio, held processing, held transcription, absent scans, missing planned masters, and unplanned retained sources;
- component tests for the six visible gates, evidence action routing, blocked state, and fail-unknown empty state;
- the existing Session review suite to catch accessibility/query collisions;
- TypeScript 7-compatible application typecheck;
- a read-only local PostgreSQL operation over four retained sources;
- a signed-in rendered Chrome operation over 24 gates at desktop and 390-pixel phone width, with zero browser exceptions and no horizontal overflow.
- retained assertions that both selected recovery masters render ready decode and signal gates while historical originals remain review-only.
- a retained browser operation that decodes the selected MV7i recovery master, seeks to two seconds, observes playback advance, switches to another `recordingAssetId`, renders the shared-clock navigator, and repeats responsive overflow checks.

## Next mature slices

1. **Automatic decode coverage for every retention path** — recovery already queues complete decode; native Capture finalization and external-import release must prove the same durable, retry-visible behavior.
2. **Listening decisions across remaining authorities** — detector dispositions now work in shared context; transcript verification, repair comparison, mastery judgment, and edit review should become equally calm without erasing their distinct contracts.
3. **Qualified treatment proposals** — de-click, de-plosive, de-noise, de-reverb, level, and loudness proposals must show the detected problem, selected range, parameters, before/after preview, and reversible decision receipt.
4. **Transcript evidence depth** — expose vocabulary/keyterm coverage, diarization uncertainty, source-clock alignment, and correction provenance without treating provider confidence as truth.
5. **Delivery conformance** — connect proof-listened masters to platform-specific loudness, peak, codec, channel, and publication packet checks without changing the immutable source.
