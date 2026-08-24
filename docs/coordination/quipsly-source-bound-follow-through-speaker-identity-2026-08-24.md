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

The Nest Session follow-through cards expose that distinction in plain
language. A compact badge says whether the name was reviewed, matched to a
participant voice, inherited from the participant's isolated recording,
supplied automatically, or remains unresolved. The separate prompt to play and
check provider words remains visible even when the participant recording makes
speaker ownership exact.

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

## Mutation boundary

Packet outputs remain candidates that require explicit human review. This
change does not automatically assign a task, change a goal, schedule an event,
message a client, share a follow-up, publish content, or alter recording media.

## Evidence

- Quipsly TypeScript typecheck passes.
- The focused packet, note, task, goal, review-model, and review-surface suites
  pass, including 132 packet and Session-review tests.
- The mobile Capture source-contract smoke passes, including the new v2
  source-bound speaker provenance assertion.

This checkpoint is local source and automated evidence only. It does not claim
a live deployment, TestFlight release, physical-device readback, or a two-person
human acceptance session.
