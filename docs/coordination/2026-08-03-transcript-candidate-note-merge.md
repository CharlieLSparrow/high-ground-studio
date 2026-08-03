# Transcript candidate to existing note merge

Date: 2026-08-03

## Outcome

Quipsly can now merge one playback-reviewed transcript note candidate into one
explicitly selected existing Session note without creating a duplicate note.
The operation is available in both Nest and Quipsly Capture and uses the same
canonical API, revision ledger, source anchor, authorization boundary, and
idempotency contract.

This is a deliberate editorial operation, not automatic note generation. The
person reviewing the Session must:

1. listen to and confirm every segment in the candidate's immutable source
   span;
2. choose **Merge into existing note**;
3. choose one current, actor-owned editable note from the same Session;
4. review the complete proposed title, wording, purpose, and audience; and
5. confirm the merge.

The selected note keeps its identity. Quipsly appends one immutable revision
that retains the complete prior note and source metadata, updates the note with
optimistic concurrency, and binds the exact transcript evidence to the new
revision. It does not create a task, goal, calendar link, message, delivery,
output, Studio edit, or publication.

## Canonical architecture

The transcript candidate remains a projection over the current transcript
packet until a person accepts or merges it. The canonical mutation belongs to
`POST /api/mobile/capture/transcripts/notes`; Nest and Capture are clients of
that same boundary.

The merge request carries:

- the current Session, transcript job, recording asset, packet build, packet
  lane, candidate, and primary segment identities;
- the immutable provider-text hash and complete reviewed source span;
- the selected note identity and the exact `updatedAt` value reviewed by the
  person;
- the complete final title, body, note kind, and visibility; and
- a stable client request identity.

Inside one database transaction, the server:

- rechecks Session mutation access and project-team authority;
- locks and validates the current packet and completed recording-backed
  transcript;
- independently rechecks release/consent processing gates;
- requires current playback-verification evidence for every segment;
- locks and selects the target by `id + roomId + authorUserId + editable kind`;
- rejects a stale `updatedAt` value;
- updates the target note only if the optimistic predicate still matches;
- appends a `merged-transcript-candidate` `CoachingNoteRevision` containing the
  complete previous and next note snapshots;
- records the exact merge receipt on the packet summary; and
- reads the canonical note back before returning success.

The note's original `sourceJson` is preserved. Its newest merge is added as
`lastTranscriptCandidateMerge`, including the exact source segment IDs,
effective text snapshot, provider hash, playback source, recording asset,
transcript job, reviewer, candidate draft, reviewed final content, and prior
note snapshot. The shared domain parser projects that provenance back to both
surfaces.

## Idempotency and conflict behavior

An exact retry returns the already merged note and receipt with
`noteCreated=false` and `noteRevised=false`. It does not append another
revision. Reusing the candidate with another note, another final body, another
audience, or another optimistic timestamp fails closed as an idempotency
conflict.

If the target changed after it was selected, both the initial timestamp check
and conditional update reject the operation. The reviewer must reload the
current note and deliberately review a new complete merge rather than silently
overwriting someone else's work.

## Cross-surface UX

Nest and Capture now expose the same review vocabulary:

- **Accept as new note** creates one new canonical note after review;
- **Merge into existing note** updates one explicitly selected note and adds a
  revision;
- **Edit for later review**, **Defer**, and **Reject** remain noncanonical
  packet decisions.

The merge picker lists only notes the current actor can edit. The confirmation
surface shows the existing wording and proposed merged wording together, makes
the audience explicit, and discloses the no-side-effect boundary. After the
merge, the canonical note exposes a source action that returns to the exact
transcript boundary rather than merely opening the top of the Session.

## Retained compiled-iPhone operation

`pnpm quipsly:retained:native-packet-note-merge` is an explicitly authorized,
loopback-only operator. It uses the retained synthetic coach identity, a
checksum-verified local recording, local Firebase Authentication, local Nest,
and loopback PostgreSQL. It has no cleanup path.

The successful operation used:

- Session `qa-reviewed-packet-1785766018962-2cdf1009`;
- recording asset `qa-reviewed-packet-1785766018962-2cdf1009-asset`;
- transcript job `qa-reviewed-packet-1785766018962-2cdf1009-transcript`;
- source SHA-256
  `309adeddf1851bf9929718113c5bf058d4501c65f59187e14b39a8de792a90e0`;
- canonical note `session-note-608071b43930cbc3634ae795d2be4c75`; and
- immutable merge revision `bac228d0-5952-45ae-aa12-ad3f9617f313`.

The compiled iPhone 17 Pro simulator journey:

1. authenticated the retained coach;
2. installed and selected the checksum-backed Session recording;
3. played and confirmed all three source segments;
4. rebuilt the current packet;
5. selected the exact revision-one Session note;
6. reviewed and edited the complete merged title and body;
7. confirmed the merge;
8. terminated and relaunched Quipsly Capture;
9. read back the same canonical note identity and final content; and
10. followed the merged-source action back to the exact first transcript
    segment with the visible `Opened from linked work` boundary.

Independent packet and PostgreSQL readback proved exactly two note revisions:
the original `created` revision and one `merged-transcript-candidate` revision.
The original title, body, kind, visibility, and source remain recoverable in
the second revision. An exact POST replay was acknowledged without another
note update or revision.

The retained side-effect counts are:

- editable notes: 1;
- goals: 0;
- tasks: 0;
- calendar links: 0;
- outputs: 0; and
- deliveries: 0.

The create-only receipt is
`/private/tmp/quipsly-packet-note-merge-receipt-1785766235877-62187.json`.
The passing Xcode result bundle is
`/private/tmp/quipsly-packet-note-merge-1785766019672-62187.xcresult`.

## Verification and release boundary

The retained compiled-iPhone operation passed one selected UI test in 176.431
seconds with zero failures and zero unexpected runtime warnings. The known
SwiftUI `Invalid frame dimension (negative or non-finite)` warning remains and
is tracked separately from this data-integrity slice.

Final bounded-source verification passed:

- focused Nest review/API proof: 3 suites and 51 tests;
- full Nest Jest proof: 244 suites and 1,309 tests passed, with 37 suites and
  108 tests intentionally skipped;
- full repository Quipsly contracts: 258/258;
- Quipsly and shared-domain strict TypeScript: passed;
- retained operation source contract: 1/1;
- Capture cross-surface contract: passed; and
- iOS App Store static gate: 1,009/1,009.

The retained operation itself compiled and ran the changed native app, so the
selected runtime result is stronger than a source-only build for this slice.
It used the simulator and local services. It does not satisfy the
physical-iPhone, production Nest, TestFlight, production database, or
authorized-delivery gates in the unified product goal. No Cloud Build, cloud
deployment, provider mutation, TestFlight upload, invitation, external
message, or publication occurred.
