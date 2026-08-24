# Session exact-source waveform alignment

Date: 2026-08-24

## Outcome

Coaching and call Sessions can now request the same production FFT waveform
alignment evidence previously available only after media entered an Episode.
The Session keeps its real room, take, and RecordingAsset identities throughout;
it never fabricates a Studio project, Episode, source, or asset merely to reach
the worker.

## Architecture

- `SessionAudioAlignmentJob` is the durable Session-scoped request/result row.
  It binds one room, one capture group, two exact RecordingAssets, the requester,
  status, immutable job envelope, result receipt, and failure state.
- `quipsly-session-audio-alignment-job-v1` is a first-class shared-package job
  envelope. The existing analyzer and GCS queue accept either the original
  Episode job or this Session job, while scope parsing remains explicit.
- The server reconstructs both sources through the canonical protected playback
  binding. A source must be released, server-verified, byte-count bound,
  SHA-256 bound, generation bound, media typed, and from the exact current take.
- A validated monotonic/server clock proposal provides the search estimate when
  both sources have it. Retained recording start times remain a visibly labelled
  fallback rather than being renamed capture-clock evidence.
- The planner computes a real overlap, two separated bounded decode windows,
  and a search radius derived from clock uncertainty. Insufficient overlap
  fails closed before queueing.
- The existing cloud worker materializes the two pinned GCS generations,
  verifies exact bytes before and after decode, runs normalized FFT
  cross-correlation, and reports opening/later offsets, correlation peaks,
  residual drift, and observed ppm.

## UX

The Session **Recordings** workspace now includes **Participant sync evidence**.
It:

1. lists only protected, verified sources from the same take;
2. asks for a timeline spine and source to place;
3. performs one explicit cost-bearing analysis action;
4. polls the retained job rather than asking the user to understand the worker;
5. presents opening/later offset, residual drift, ppm, correlations, peak
   margins, and qualification in plain language; and
6. repeatedly states the important boundary: originals remain truth, and the
   analyzer itself makes no edit, render, share, placement, or sample-accurate
   claim.

## Deliberate boundary

Qualified correlation is evidence for a reversible placement review, not an
automatic timeline mutation. The append-only approval/revocation and program
clock consumer were completed in
`docs/coordination/2026-08-25-session-reviewed-waveform-placement.md`.
Protected A/B listening on real participant devices remains evidence to collect.

## Verification

- Prisma schema formats, generates, and validates.
- Shared alignment job/result and FFT evidence tests pass.
- Cloud worker generation-mismatch and exact materialization tests pass.
- Session planning, exact take/release/byte binding, route authorization, and UI
  tests pass (10 focused tests).
- Strict TypeScript passes for Quipsly, the shared media-processing package, and
  the media processor.
- Both Capture release static gates pass.

Real two-device evidence remains in the deferred validation ledger. Automated
correlation cannot substitute for hearing the opening and late-take match on
the intended participants, but human availability does not stall continued
product work.
