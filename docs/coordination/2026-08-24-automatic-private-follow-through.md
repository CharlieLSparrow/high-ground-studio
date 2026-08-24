# Automatic private follow-through preparation

Date: 2026-08-24

## Product outcome

Quipsly now reconciles completed transcript-worker evidence and prepares the
first deterministic coaching review packet from server Session boundaries. The
workflow no longer depends on a particular browser tab remaining open or on a
coach discovering **Build packet**.

This automation creates only reversible review material:

- an author-private Session summary;
- author-private source-timed highlights;
- candidate review lanes for insights, obstacles, goals/tasks, next-session
  preparation, client follow-up, or production notes as applicable; and
- candidate task/goal/note evidence that still requires explicit human review.

It does not create a canonical Task, Goal, shared Note, client delivery,
message, calendar event, edit, upload, publication, or billing action.

## Stable authorship and privacy

The packet author is selected from canonical authority in this order:

1. the booking's assigned coach for a booked coaching Session;
2. `TranscriptJob.requestedBy` for non-booked production/research Sessions; or
3. the room creator for legacy jobs.

It is never assigned to whichever account happened to poll the Session, and a
client upload cannot take ownership of the coach's private follow-through. New
Capture transcript jobs still retain the recording actor as `requestedBy` at
initial creation, held-state update, and retry so non-booked work has durable
authorship evidence.

The transcript packet route now applies the same Session-note visibility policy
as the iPhone Session projection. An authorized client can read their own
private notes and explicitly Session-shared/client-safe notes; Session access
alone cannot reveal another author's private packet. Project-team material
still requires an active owner/editor grant.

Packet reuse is keyed by both transcript and canonical author. A stale packet
owned by another account cannot suppress preparation of the rightful author's
private review material.

## Continuous reconciliation

- Opening an exact Session transcript reconciles its latest canonical job and
  prepares or reuses the current packet before returning the projection.
- Loading the Capture Session list performs a capped, latest-job-per-room sweep
  across accessible rooms. Provider or database failure is logged and remains
  retryable without failing the Session list.
- Packet creation is snapshot-bound and idempotent. A changed reviewed
  transcript gets a new packet build; an unchanged poll reuses the existing
  private packet.

## Evidence and limits

- 57 focused follow-through, packet, privacy, transcript, and visibility tests
  pass; the eight local-database integration cases were environment-skipped.
- Strict Quipsly TypeScript passes.
- Live evidence must still prove worker completion, automatic packet creation,
  coach readback, client negative visibility, and explicit candidate acceptance
  into canonical work across two real accounts.
