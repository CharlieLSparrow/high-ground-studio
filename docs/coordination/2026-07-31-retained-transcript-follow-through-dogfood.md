# Retained transcript-to-follow-through dogfood

Checkpoint: 2026-07-31 MDT

## Outcome

Quipsly now has a retained, source-grounded local acceptance corpus that starts
with immutable recording/transcript evidence and reaches transcript review,
source-linked work, source-linked goals, private writing, and exact-source
return on the iPhone app.

The corpus belongs to the reserved test identity
`quipsly-media-ms8ct81g@example.test`. It is intentionally retained for
longitudinal regression rather than removed as disposable test data.

## Immutable source and canonical identities

- Authorized source audio: 60-second, 16 kHz mono PCM WAV, 1,920,132 bytes
- Audio SHA-256:
  `5bc166248b5fb9da9a69ddee050ff43a1b4f8b59b878af4e7be6f141a8fee15d`
- Provider transcript SHA-256:
  `3302cb3e0d6bb0365bcc7a930453868cbfad31c7cc050f7010957cbe70a3c89a`
- Session: `local-transcript-dogfood-episode-4`
- Recording asset: `local-transcript-asset-episode-4`
- Transcript job: `local-transcript-job-episode-4`
- First exact segment: `local-transcript-segment-episode-4-1`
- Protected playback source:
  `/api/ingest/media/local-transcript-source-episode-4`
- Transcript evidence: 5 segments and 12 provider-timed words

The materializer accepts explicit authorized source paths, refuses non-local
database targets, reports missing source files during dry runs, and refuses to
rewrite an existing transcript identity with a different provider-transcript
hash.

## Product work performed

In the rendered signed-in web product, the QA operator:

1. Opened the exact transcript segment and played its protected source audio.
2. Rejected the filename/model-derived speaker proposal because the available
   evidence was insufficient to verify a human identity. The rejection and AI
   provenance remain in correction history.
3. Created retained task
   `transcript-task-f874d8605e8e94fdbfdfa3bb`,
   **QA Retained · Verify episode opening against transcript source**.
4. Created retained goal
   `transcript-goal-5e4c6fb62fc1d1636dfaabca`,
   **QA Retained · Keep episode work source-grounded**.
5. Created private retained document
   `cms8oj49k004qz3xlid6fs329`,
   **QA Retained · Episode 4 opening source note**, containing a pinned
   read-only transcript-evidence block and a separate editable writing block.

The task and goal preserve the same exact room, segment, 3.66–4.84 second
range, provider hash, recording asset, and playback source. Neither gained a
deadline, reminder, calendar event, delivery, completion, or progress claim.

## Defect corrected

The production transcript-correction gate loaded the current room only when no
normalized finalization receipt existed. A correctly finalized capture
therefore reached the real processing gate without the participant and consent
evidence required by that gate, making the strongest capture path impossible
to review.

The correction service now loads receipts and current room evidence together.
The real local-PostgreSQL privacy integration proves that a restored,
current-policy consent state releases the preserved transcript and allows the
correction desk to return the exact segment. No weaker authorization or
consent fallback was introduced.

## iPhone acceptance

The retained task and goal were exercised through the real local Firebase Auth
emulator and local Quipsly service on an iPhone 17 Pro simulator. The test:

- found the exact task and goal on Today;
- verified both source-return controls display the 0:03–0:04 range;
- returned from the task to protected Transcript Review;
- read back **Welcome, everybody.** from the exact immutable segment; and
- verified the phone remains review-only when it does not hold the source
  recording locally.

Selected XCTest:
`CaptureRoomRuntimeSmokeTests/testTranscriptFollowThroughReturnsToExactSourceOnIPhone`

Result bundle:
`/tmp/quipsly-capture-transcript-follow-through-20260731-v2.xcresult`

Result: 1 passed, 0 failed, 0 skipped.

## Verification

- Quipsly TypeScript typecheck: pass
- Transcript correction unit suite: 8/8
- Real local-PostgreSQL privacy/correction integration: 1/1
- Native and App Store static contracts: 955/955
- Transcript materializer dry-run with explicit sources: ready
- iPhone transcript-follow-through runtime acceptance: 1/1

## Truth boundary and next use

This checkpoint proves local rendered-product operation and iPhone simulator
source return. It does not claim a physical-device capture, a real
two-participant consent event, a newly recorded HGO episode or coaching
session, a human-verified speaker identity, production same-ID readback,
TestFlight execution of this source, or App Store submission.

The private source media remains outside version control. A future operator
must provide explicitly authorized local audio and transcript paths when
materializing the fixture in a fresh environment.
