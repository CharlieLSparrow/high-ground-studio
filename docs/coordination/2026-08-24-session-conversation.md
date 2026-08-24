# Session conversation

Date: 2026-08-24

## Decision

Quipsly Sessions have a dedicated, room-bound conversation rather than
projecting the existing Nest/project chat into coaching, recording, interview,
or meeting rooms.

This is the conventional coordination layer around a Session:

- **Conversation** is chronological communication visible to Session
  participants.
- **Notes** remain deliberate records with private, Session, client-safe, and
  project-team audiences.
- **Goals and tasks** remain canonical commitments. A chat message never
  silently creates or changes one.
- **Transcript** remains source evidence. Chat is not recording evidence and is
  not included in transcript or coaching output automatically.

The dedicated model matters because a coaching Session may not belong to a
Nest/project. Reusing `StudioNestChatThread` would make project membership a
false prerequisite and could leak project-only assumptions into private client
work.

## Canonical records

`SessionConversationMessage` is the current room-scoped message. Its ID is
deterministic from actor plus client request ID so a lost response can be
retried without a duplicate. Replies can only target another message in the
same room.

`SessionConversationMessageRevision` is append-only evidence for create, edit,
and remove operations. An edit uses an expected revision and fails closed when
stale. Remove creates a visible tombstone; the audit row preserves what changed
without presenting the removed body in the ordinary thread.

`SessionConversationReadCursor` records each actor's last-read message and
that message's stable source time. Advancement compares `(createdAt, id)` and
never moves backward when an older tab reports later. This is personal
continuity state, not a delivery or attention claim.

## Access and privacy

Reads use the narrower Session conversation boundary: creator, registered
participant, booked coach/client, staff, or active project owner/editor.
Project viewers do not gain conversation access merely by seeing a Session
shell. Sends and message mutations use the canonical Session mutation boundary
and recheck it inside the write transaction.

The API never includes private notes and never sends email, push, SMS, or other
external delivery. Those capabilities require separate, explicit delivery
records later. The first client polls while visible and on focus; this is a
reliable baseline that can later consume realtime invalidations without
changing message authority or history.

## UX

Conversation is a first-class Session workspace destination. The live lobby
links directly to it instead of embedding another tall surface into device and
join setup. The thread uses familiar message bubbles, one composer, Enter to
send, Shift+Enter for a new line, replies, inline editing, explicit removal,
read continuity, and draft-preserving retry.

The empty state suggests sharing an agenda, link, or intended outcome. It does
not show access-policy prose, delivery internals, or administrative setup.

## Qualification boundary

Automated coverage proves signed-out and unauthorized denial, the narrow
project collaborator boundary, latest-page ordering, retry-safe creation,
cross-room reply rejection, read cursor updates, transactional access recheck,
revisioned tombstones, conventional reply composition, draft-preserving retry,
and exact-revision edits.

The full 124-migration chain also applies cleanly to fresh PostgreSQL through
this migration. The resulting database contains all three conversation tables,
the typed `CREATED`/`EDITED`/`DELETED` operation enum, and seven intended
foreign keys. The disposable qualification database was removed afterward.

It does not prove that two minimally instructed humans understand the
Conversation/Notes/Work separation or that message readback is satisfactory on
browser and iPhone. Those observations remain in the deferred validation
ledger.
