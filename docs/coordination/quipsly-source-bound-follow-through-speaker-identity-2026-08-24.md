# Source-bound follow-through speaker identity

Date: 2026-08-24

## Outcome

Participant-isolated recordings now preserve the participant who owns the
physical source when Quipsly projects a completed transcript into coaching
notes, task candidates, goal candidates, highlights, and review lanes. Packet
generation no longer falls back to an unknown speaker merely because the ASR
provider correctly skipped diarization for a one-participant source.

This is a production integrity contract, not an inference heuristic:

- The transcript routing receipt must use
  `quipsly-transcript-routing-summary-v1`, declare
  `participant-isolated`, and declare `source-binding` speaker authority.
- The participant display snapshot comes from that routing receipt.
- The stable physical-owner identity comes from the transcript job's exact
  `RecordingAsset.participantId`.
- Group or mixed recordings still require provider diarization plus reviewed
  speaker attribution. Quipsly does not pretend those sources have isolated
  ownership.

## Precedence and review semantics

The effective display label follows this order:

1. an accepted human segment correction;
2. an active, playback-reviewed provider-cluster attribution;
3. the exact participant-isolated source binding;
4. the provider speaker label;
5. unresolved.

Source binding establishes who owns the recording, but does not establish that
the provider's words are correct. Word/text review remains `provider` until a
person explicitly corrects or confirms it. A corrected display label also does
not erase the stable source-bound participant ID retained in the packet
snapshot.

The Nest and Quipsly Capture Session follow-through cards expose that
distinction in plain language. A compact badge says whether the name was
reviewed, matched to a participant voice, inherited from the participant's
isolated recording, supplied automatically, or remains unresolved. The
separate prompt to play and check provider words remains visible even when the
participant recording makes speaker ownership exact.

## Version and stale-packet behavior

The transcript packet snapshot is now
`quipsly-transcript-packet-snapshot-v2`. Each segment review binds:

- the resolved speaker label;
- the authority used to resolve it;
- the stable source-bound participant ID, when present;
- provider and effective text hashes;
- accepted correction and attribution receipts;
- exact source time.

Version-one packet snapshots intentionally become stale. Quipsly rebuilds a
candidate packet against current transcript evidence instead of silently
reusing an older packet whose speaker provenance was incomplete. Existing
accepted tasks, goals, and notes remain canonical records; this change does not
rewrite them or create external side effects.

## Durable follow-through

When a person deliberately saves a transcript-backed note, task, goal, or
writing draft, the immutable source anchor now retains both the speaker-label
authority and the isolated source participant ID. The same fields survive when
reviewed packet evidence is appended to an existing note, task, or goal.
Legacy source anchors without these additive fields remain readable. A new
anchor that claims `source-binding` but omits the participant ID fails closed
instead of presenting a display label as physical-source proof.

The same evidence is now visible after a person leaves the Session review
surface. Saved Notes, Work tasks and goals, and Calendar focus plans share one
plain-language badge component. They distinguish a reviewed name, a
playback-reviewed voice match, participant-owned isolated recording,
automatic transcription label, and unresolved speaker. The stable participant
ID remains available for integrity checks but is intentionally not exposed as
user-facing copy. Legacy records that predate the additive authority field stay
calm and readable rather than inventing a provenance claim.

Quipsly Capture now decodes those additive authority and source-owner fields
on its canonical saved-work anchor as well. The shared native badge appears on
Today tasks and goals, Session notes, merged evidence, and released client
follow-up source links. The protected source-bound participant ID remains
decoded for integrity and future diagnostics but is not displayed to the
coach or client.

The web client-follow-up artifact now carries the same explanation on every
source-backed note, goal, and commitment visible to the client. Coaches see it
while selecting the eligible records, clients see it after release, and the
deterministic Markdown download records the plain-language authority label.
Older released revisions without the additive field remain readable and do not
receive an invented claim.

Next-Session continuity now preserves the same distinction. The current
Session's latest carried-forward task evidence and an explicitly saved private
brief from the prior Session each show their own speaker-evidence badge beside
the exact transcript return. Continuity therefore does not flatten a
participant-owned recording into a generic quotation or imply that an
automatic label was human reviewed.

The primary transcript correction surface now exposes this evidence directly
on every transcript turn in both Nest and Quipsly Capture. The server's
per-segment authority and stable source-owner ID are decoded instead of being
dropped at the client boundary; only the plain-language authority appears in
the UI. A reviewer can therefore see the difference before correcting words,
confirming a turn, or creating follow-through—not only after saving it.

## Mutation boundary

Packet outputs remain candidates that require explicit human review. This
change does not automatically assign a task, change a goal, schedule an event,
message a client, share a follow-up, publish content, or alter recording media.

## Evidence

- Quipsly TypeScript typecheck passes.
- The focused packet, note, task, goal, review-model, and review-surface suites
  pass, including 132 packet and Session-review tests.
- An additional 90 transcript correction, source-anchor, materialization, and
  packet mutation tests pass for durable follow-through provenance.
- Another 101 focused web component and interaction tests pass across Session
  review, Notes, Work, Calendar planning, and the shared speaker-evidence badge.
- An additional 54 focused follow-up and reusable-surface tests pass after
  carrying the evidence into released client artifacts and Markdown exports.
- Seventeen focused continuity, client-follow-up, and shared-badge tests pass
  after carrying the evidence into both current and prior Session continuity.
- Thirty-one focused transcript-desk and shared-badge tests pass with the
  per-turn evidence visible in the primary Nest correction workflow.
- The mobile Capture source-contract smoke passes, including the new v2
  source-bound speaker provenance assertion and a durable-work UI contract.
- A complete unsigned generic iOS Simulator build and all 1,143 App Store
  static checks pass with the iPhone speaker-evidence badges decoded and
  reachable from note, goal, and task candidates plus saved native
  follow-through.
- The unsigned Simulator `build-for-testing` also succeeds, compiling the UI
  assertions that reach participant-recording evidence on preview Today work
  and Session notes.

This checkpoint is local source and automated evidence only. It does not claim
a live deployment, TestFlight release, physical-device readback, or a two-person
human acceptance session.
