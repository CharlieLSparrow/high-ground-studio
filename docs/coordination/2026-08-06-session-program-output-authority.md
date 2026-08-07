# Session Program Output Authority

Date: 2026-08-06

Status: canonical read model implemented, tested, and operated in the authenticated local Nest

## Outcome

The Session versioned output graph now recognizes the promoted Episode-level
multitrack program as a different authority from a mastered source microphone.
This closes a dangerous finishing ambiguity: once Quipsly has reviewed and
promoted a two-person program, a beautiful Charlie-only or Homer-only master
must not silently become the episode merely because it already has an encoded
delivery artifact.

The graph projects one explicit chain:

1. exact immutable source tracks;
2. reviewed and promoted lossless program mix;
3. separately encoded delivery bytes;
4. encoded-byte proof-listen; and
5. reversible Episode packet selection.

This slice is deliberately read-only. It creates no mix, delivery, selection,
upload, or publication event.

## Canonical authority and integrity

The loader joins the latest `StudioEpisodeAudioMixPromotionReceipt` to its
exact `StudioAssetProcessingJob`, approved review receipt, and registered
`StudioMediaAsset`. The branch becomes active only when all of these identities
converge:

- Episode and Nest ownership;
- mix job and promotion receipt;
- program, proposal, baseline, and preview fingerprints;
- derivative asset ID and exact registered attachment source; and
- playback identity from the registered derivative.

A mismatch renders the program `HELD` and removes playback. A withdrawal stays
visible as withdrawn history. Missing data stays `NOT_OBSERVED`.

When an active program exists, source-master branches remain visible as
single-source alternates, but they are removed from aggregate packet
eligibility and their selection control is suppressed. A prior selection still
renders as historical evidence rather than disappearing.

## UX

Outputs now leads with an **Episode program authority** card. It exposes the
five-stage chain, exact short fingerprints, promotion receipt count, bounded
candidate playback, and a direct link to the exact mix review. The next action
truthfully says that the program still needs a separately verified delivery
encoding and proof-listen.

The Finishing Cockpit ranks this as high attention whenever an active program
stops before delivery encoding. It also explains that single-microphone
delivery artifacts are alternates rather than substitutes.

At 390 by 844 CSS pixels the operated card has no horizontal overflow and
retains its complete authority explanation and review action.

## Retained operation

`scripts/quipsly-retained-versioned-output-graph-operation.mjs` is loopback-only
and requires explicit activation. It binds a fixture-only two-track program to
the retained coaching Episode using an existing exact local WAV, computes the
real byte hash and size, and writes idempotent job, review, promotion, and
attachment receipts.

The operation then signs the retained coach into the Firebase emulator,
establishes the real first-party Quipsly session cookie, renders the Session
Outputs page, and asserts both the active program branch and the open delivery
boundary. It verifies that source bytes remain unchanged and that delivery,
packet selection, upload, and publication have not started.

## Verification

- Session directory: 27 suites passed, one skipped; 196 tests passed.
- Quipsly strict TypeScript and route generation pass.
- Isolated Next.js production build passes all 189 routes.
- Authenticated retained operation returns HTTP 200 and reads back the exact
  program and preview SHA-256 fingerprints.
- Desktop and 390 by 844 responsive browser operation pass.
- `git diff --check` passes.

## Next depth

Program delivery must not be faked through the existing asset-master delivery
foreign key. The next slice should introduce an explicit delivery authority
that can bind either an asset-master promotion or an Episode-program
promotion—never both—then reuse the encoding worker while preserving distinct
review, proof-listen, and packet receipts. Only after that adapter passes real
encoded-byte readback should the active program become packet-eligible.
