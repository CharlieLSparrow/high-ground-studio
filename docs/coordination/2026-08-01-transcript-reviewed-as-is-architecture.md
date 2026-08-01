# Transcript reviewed-as-is architecture checkpoint — 2026-08-01

## Outcome

Quipsly can now record that a person listened to a transcript segment and found
the provider text correct. The result is an append-only, playback-bound
verification receipt rather than a fabricated text correction.

This fixes a canonical review defect: before this checkpoint, a segment could
become `human-reviewed` only when a reviewer changed its text. A fully correct
provider transcript could therefore never become fully reviewed honestly.

## Ownership and truth contract

- Provider transcript segments and words remain immutable evidence.
- A changed segment becomes reviewed through an accepted correction receipt.
- An unchanged segment becomes reviewed through a
  `TranscriptSegmentVerification` receipt.
- Both decisions require the protected source recording, the segment's exact
  current provider state, and playback at that segment's timestamp.
- Verification rows are append-only. They retain reviewer, room, asset, job,
  segment, provider text and speaker, playback position, request key, and
  creation time.
- PostgreSQL advisory transaction locks serialize accepted correction,
  accepted AI-proposal, and confirmed-as-is writers for the same segment. A
  concurrent retry reuses the current verification instead of producing a
  second receipt.
- Nest owns the canonical decision. The iPhone and web surfaces request it;
  Studio imports the resulting review identity and does not invent one.
- `acceptedReviewId` identifies either kind of accepted human decision.
  `acceptedCorrectionId` remains present only when text actually changed.
- A provider-only segment has neither identity. A human-reviewed segment must
  have a non-empty review identity.

## Product surfaces

- Nest Transcript mode shows playback-review progress and a discoverable
  **Confirm correct as heard** action next to the existing correction path.
- Quipsly Capture decodes the verification receipt, requires the local player
  to be at the exact segment, and exposes the same action and verified state.
- The canonical handoff advances to
  `quipsly-canonical-transcript-handoff-v2` while Studio continues to accept
  v1 handoffs by treating their correction ID as their review ID.
- Studio persists and independently reads back the accepted review identity.
  A reviewed-as-is segment is valid with a verification ID and no correction
  ID; a changed reviewed segment carries both.

## Migration evidence

The new migration was replayed against a disposable PostgreSQL database across
all 38 repository migrations. The first replay exposed PostgreSQL identifier
truncation on generated index names. Explicit short names were added, and the
second complete replay reported the schema current with no drift. The
disposable database was then dropped and independently confirmed absent. The
migration also applied cleanly to the retained local development database.

## Automated evidence

- Focused Nest server and web review coverage: 3 suites / 21 tests pass.
- Full Nest Jest suite: 205 suites and 1,041 tests pass; 34 suites and 100 tests
  remain intentionally skipped by their existing gates.
- Quipsly TypeScript and optimized Next production build pass; the build emits
  152 static pages.
- QuipslyVideoCore: 107 XCTest cases plus 4 Swift Testing cases pass.
- Quipsly Capture App Store static contract passes 946/946 checks, and the
  iPhone simulator build passes.
- Signed Quipsly macOS build and code-signature verification pass.

## Real fail-closed operation

The retained 60-second High Ground Odyssey transcript fixture was restored into
local PostgreSQL and served through local Nest with the retained test identity.
Authenticated readback returned five segments, twelve words, zero accepted
corrections, zero reviewed-as-is receipts, and the explicit
`confirmedAsIsRequiresPlaybackConfirmation` boundary.

A deliberately invalid confirmation for the first segment used playback
position zero. The API returned HTTP 409 `PLAYBACK_POSITION_MISMATCH`. The
canonical v2 handoff remained provider-only and database readback retained zero
verification rows. This proves the new route fails closed without manufacturing
a human decision.

The first rendered Transcript attempt exposed a stale generated Prisma client
inside the long-running local server. Restarting the supported Nest process
fixed the server boundary. Browser security policy then prevented a reload of
that local tab, so the final state was verified through the authenticated API
and PostgreSQL instead of bypassing the policy. Docker Desktop's CLI also
wedged during the umbrella launcher; PostgreSQL, Firebase Auth Emulator, and
Nest were restarted through their supported individual local modes.

## Remaining human gate

No segment was marked reviewed in this checkpoint. A person must still listen
to the retained source and either confirm or correct each segment. The first
accepted decision should then be imported into Studio twice to prove:

1. the persisted review ID and honest correction/null-correction mapping;
2. unchanged local segment, word, and transcript-job UUIDs;
3. exactly one reviewed-refresh receipt on the first import; and
4. a no-op second import.

Automation can enforce the boundary and preserve the receipt, but it cannot
substitute for the listening judgment.
