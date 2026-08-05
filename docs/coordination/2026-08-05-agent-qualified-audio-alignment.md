# Agent-qualified exact-source audio alignment

Date: 2026-08-05

Status: implemented and operated locally; physical independent-device proof
remains open

## Decision

Quipsly alignment may be approved in either of two inspectable ways:

1. a named person listens to the opening event and a later event, records
   residual drift, and approves the reversible placement; or
2. a signed-in Quipsly staff member delegates one bounded placement to an
   identified software agent, which supplies exact-source deterministic
   correlation evidence at two separated moments.

The second path does not manufacture a human-listening claim. Its version-2
receipt records the agent, staff delegator, delegation scope, source SHA-256
bindings, analysis method, opening/later correlations, measured offset and
drift, thresholds, and the unchanged-source/non-sample-accuracy boundaries.
Non-staff users cannot delegate this authority. Ambiguous evidence cannot be
approved through the agent path.

## Audio analysis contract

The media processor now decodes bounded mono windows with FFmpeg and finds the
best normalized cross-correlation lag with an in-process FFT. It analyzes one
opening window and one later window, then reports:

- measured target-to-spine offset at each point;
- normalized best and second-best peaks plus ambiguity margin;
- observation interval, residual milliseconds, and observed parts per million;
- exact source identity, size, SHA-256, and generation; and
- whether the packet is strong enough to enter delegated review.

The analyzer never changes source bytes, applies a timeline placement, claims
sample accuracy, or makes delegation optional.

## Operated evidence

The retained Capture rendezvous episode used the preserved Episode 9 “Be
Curious” source and its separately encoded collaboration proxy. The operation:

- independently hashed both files and decoded six-second windows at 20 and 200
  seconds;
- measured opening correlation `0.998465` and later correlation `0.999379`;
- measured `0.000 ms` residual across `180 s` (`0.000 ppm`);
- saved an authorized-agent version-2 alignment receipt delegated by the
  retained staff operator, with `humanApprovalConfirmed:false`;
- rendered the agent, delegator, scope, method, and correlation evidence in
  Guided Sync;
- operated both real sync-preview media elements, then operated **Pause both**;
- persisted one video and one audio clip in the episode timeline; and
- operated decoded assembled playback, paused it, and read the two clips and
  protected receipt back from PostgreSQL.

Provider recording was off and unnecessary. No original, provider room,
external account, render, publication, or physical device was changed.

## Verification

- Synthetic shifted/transcoded FFmpeg alignment: 2/2 passed.
- Durable job/result and lease worker: 2/2 passed, including JSONB-style
  source-key reordering and exact-hash tamper rejection.
- GCS two-source manifest/queue worker fixture: 2/2 passed, including
  generation-bound materialization, evidence-only completion, queue removal,
  and terminal failure when one immutable generation is unavailable.
- A credentialed bucket fixture exposed and repaired a signed-offset boundary:
  sources that started before the spine now retain their negative measured
  relationship, preview from a normalized source seek, and become a
  nonnegative timeline clip with explicit leading-source trim. They are never
  silently clamped to zero.
- Reviewed-alignment and editor suites: 26 focused assertions passed before the
  retained operation, including agent source/drift tamper rejection.
- Media-processing, media-processor, and Quipsly TypeScript checks passed.
- Retained rendered operation: queued, leased, reconciled, and rendered the
  durable job evidence; passed with zero browser exceptions and no horizontal
  overflow.

## Remaining release proof

- Run the same analyzer against truly independent browser/MV7i and physical
  iPhone recordings from one Session.
- Confirm a visible/audible opening event and later event instead of a
  source/proxy identity pair.
- Inspect the proposed placement and assembled playback with Homer before final
  episode use.
- Deploy and repeat authenticated production readback after the build cadence
  opens.
- Deploy the GCS two-source control plane and repeat a credentialed fixture
  against the exact processor image before enabling production UI claims.
- Deploy the same processor revision's GCS audio-mastery lane and repeat its
  credentialed complete-decode, independent-verification, immutable-source,
  and unpromoted-preview fixture against the exact deployed image.
