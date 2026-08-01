# Reviewed transcript packet snapshots — 2026-08-01

## Outcome

Quipsly's automated coaching and podcast packets now read the canonical
transcript review projection rather than blindly reading raw provider text.
Accepted corrections flow into summaries, highlights, goal candidates, task
candidates, speaker labels, and review lanes. A confirmed-as-is segment carries
human-reviewed status while retaining the provider words unchanged.

Every packet v3 build is pinned to a cryptographic transcript-review snapshot.
If a person later corrects or confirms any segment, the old packet remains
inspectable but cannot approve a lane or materialize a goal or task. Nest marks
it `TRANSCRIPT_REVIEW_CHANGED` and offers an append-only rebuild.

## Canonical projection

- Provider text, speaker, timing, and SHA-256 remain immutable evidence.
- The newest accepted correction is applied only when its provider hash and
  speaker expectation still match the segment.
- A current confirmed-as-is receipt advances review status without changing
  text or speaker.
- Packet snapshot v1 hashes ordered segment identity, provider and resolved
  text hashes, resolved speaker, timing, review status, accepted review ID, and
  optional correction ID.
- Packet source evidence records aggregate human-reviewed/provider-only counts
  without claiming that provider-only segments were reviewed.
- Accepted task and goal review receipts retain the packet transcript snapshot
  hash. Goal receipts also retain the accepted review/correction identities.

## Concurrency and stale-review boundary

Accepted transcript correction, accepted AI proposal, confirmed-as-is review,
packet build, packet lane review, action-candidate review, and goal-candidate
review share a PostgreSQL advisory lock for the transcript job. Segment review
writers additionally retain their segment lock. Lock order is job then segment
or packet row, preventing a correction from racing a packet build or canonical
work decision.

Packet builds are append-only versions. An identical no-force replay returns
the existing packet. A changed transcript-review snapshot creates a new packet
without requiring a misleading force flag. Legacy packets without a snapshot
are treated as stale at the decision boundary and can be rebuilt safely.

## UX

Session Transcript mode now reports transcript review coverage and packet
staleness. A stale packet shows its saved contents, hides lane/task/goal
decision controls, explains why those decisions are locked, and exposes
**Build current packet**. The rebuild creates internal review artifacts only;
it does not create work, assign anyone, send a follow-up, mutate a calendar, or
publish content.

## Automated evidence

- Focused packet, correction, and Session UI coverage: 6 suites / 63 tests.
- Full Nest Jest suite: 205 suites and 1,047 tests pass; 34 suites and 100 tests
  remain intentionally skipped by their existing gates.
- Quipsly TypeScript and the optimized Next production build pass; 152 static
  pages are generated.
- The mobile Capture contract smoke passes, including packet-v3 review
  projection and snapshot invariants.

## Real local operation

The retained signed-in High Ground Odyssey Session
`local-transcript-dogfood-episode-4` first read as
`TRANSCRIPT_REVIEW_CHANGED`: its saved packet predated snapshot v1. The first
build attempt exposed a real authorization mismatch. Packet GET honored the
operator's active Nest project grant, while packet POST checked only room,
participant, and booking ownership and returned HTTP 404. Build authorization
now reuses the same email-normalized project-grant predicate as packet read.

After the supported local Nest restart, the same retained account built packet
`a5ca88af-81bd-4749-9758-1c355ac9b824`. Readback reported:

- template `quipsly-session-packet-v3`;
- snapshot schema `quipsly-transcript-packet-snapshot-v1`;
- snapshot SHA-256
  `4fe2cb95937443aea6f35ad0b837a7ad035ecae156ae643dd9c23b5f057c643d`;
- five transcript segments, zero human-reviewed, five provider-only;
- `READY_FOR_REVIEW` and `packetStale=false`;
- snapshot hash equal between build response and packet source.

An immediate no-force replay returned the same packet and snapshot with
`reusedExistingPacket=true`. No human transcript decision, goal, task,
assignment, delivery, calendar event, message, or publication was created.

## Remaining gate

A person must still listen to the retained source, confirm or correct real
segments, and then rebuild. The next acceptance should prove the old packet
locks, packet v3 versions once, corrected text/speaker appear only in the new
packet, reviewed-as-is text remains unchanged, and explicit goal/task decisions
retain the new snapshot and review identities.
