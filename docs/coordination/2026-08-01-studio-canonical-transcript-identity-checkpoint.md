# Studio canonical transcript identity checkpoint — 2026-08-01

## Outcome

Quipsly Studio now treats Nest transcript segment and word identifiers as the
stable canonical anchors for every later correction, note, task, chapter,
quote, and edit decision. A provider transcript can be refreshed with accepted
human corrections without changing the Studio UUIDs already referenced by
local editorial work.

This closes the model and persistence defect that previously made a reviewed
transcript refresh look like an unrelated set of segments. It does not claim a
human review has occurred when no person has listened to and accepted a
correction.

## Ownership boundary

- Nest owns the canonical transcript job, provider segment and word IDs,
  provider evidence, review status, and accepted-correction IDs.
- Studio owns its local segment, word, and transcript-job UUIDs and preserves
  them while the same canonical entities evolve.
- Provider words remain immutable evidence. Corrected display text is an
  overlay linked to a non-empty accepted-correction ID.
- Provider rows must use review status `provider` and have no accepted
  correction. Reviewed rows must use `human-reviewed` and carry a non-empty
  accepted-correction ID.
- Import receipts contain identifiers and review state only. They do not copy
  transcript text or a signed handoff URL into the edit ledger.

## Implemented contract

- `TranscriptSegment` persists provider speaker and accepted-correction ID.
- `TranscriptWordTiming` persists raw provider word, speaker, channel, stable
  external word ID, and global provider word index.
- Canonical imports validate unique segment and word IDs, monotonically exact
  global word indexes, finite timing, job identity, and the review/correction
  contract.
- Imports reconcile by canonical external IDs and preserve local segment UUID,
  word UUID, creation timestamp, transcript-job UUID, and job timestamps.
- Semantically identical replay is a no-op.
- A legacy session containing the same canonical transcript but no receipt gets
  exactly one privacy-safe receipt; the next replay is a no-op.
- The macOS Capture handoff independently reads the saved session back and
  verifies the exact external-ID sets, correction map, transcript job, stable
  local UUIDs, and expected receipt-count change before reporting success.
- Legacy session JSON without the new optional fields continues to decode.

## Automated evidence

- QuipslyVideoCore full suite: 106 XCTest cases plus 4 Swift Testing cases,
  zero failures.
- Focused canonical import coverage proves provider import, reviewed refresh,
  stable local identities, provenance mapping, privacy-safe receipt content,
  idempotent replay, legacy receipt backfill, malformed-review rejection, and
  backward-compatible decoding.
- Nest mobile transcript-handoff route: 3/3 Jest tests pass.
- Local Quipsly doctor passes Nest health, signed-out shell, Firebase emulator,
  Docker, PostgreSQL, worktree, and retired-bypass checks.
- Clean signed Quipsly macOS build succeeds; `codesign --verify` passes for
  `com.highground.QuipslyMac`, Team ID `585GUXMY5M`.

## Real app-owned operation

A retained 60-second High Ground Odyssey provider corpus was rehydrated from
the preserved authorized audio and transcript evidence. It contains five
segments and twelve timed words; the first retained segment is
`Welcome, everybody.` at 3.66–4.84 seconds.

The shipping macOS app imported the transcript through its semantic AgentServer
control surface, saved it as `Provider Transcript QA 2026-08-01`, and loaded it
again. Independent file readback confirmed five segments, twelve words, the
same timing and text, and review status `asr-draft` in:

`~/Library/Application Support/Quipsly/MediaVault/sessions/Provider_Transcript_QA_2026-08-01.quipsly-session.json`

Retained SHA-256:

`ac8859723e94aec6693cbd001805d8c9c1b06735fc26aa764ef3d2d7bfa9fbbf`

The existing AI speaker proposal remains rejected. It was not relabeled as a
human review. Computer Use initially exposed the real app accessibility tree,
but its native control pipe disconnected during the Capture action; the
purpose-built app-owned AgentServer supplied the operation and state readback
instead. The app itself remained healthy.

The clean native rebuild was initially blocked by a full development volume.
Supported `xcodebuild clean` operations removed derived products only, freeing
enough space for the clean signed build. No source media, retained session, or
QA evidence was deleted.

## Remaining human gate

The next honest proof requires a person to listen to the retained audio in
Nest, accept at least one correction, and then import that reviewed canonical
handoff into Studio twice. The persisted session must show:

1. the accepted correction ID and `human-reviewed` status;
2. unchanged local segment, word, and transcript-job UUIDs;
3. exactly one new refresh receipt on the first import; and
4. no mutation and no new receipt on the second import.

That operation is deliberately still open. The automated contract is complete,
but automation cannot substitute for the human listening decision it is meant
to preserve.
