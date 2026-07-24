# Session Notes Architecture

Session Notes are deliberate, canonical records attached to a Quipsly Session.
They are not transcript candidates, copied tasks, delivery receipts, or a
parallel writing system.

## Data model

`CoachingNote` is the current read model. Purpose and audience are separate
decisions:

- `SESSION_NOTE`, `FOLLOW_UP`, `DECISION`, and `PRODUCTION` describe why a
  deliberate Session note exists. Quote and highlight records remain separate
  evidence projections rather than editable Session Notes.
- `AUTHOR_PRIVATE` is visible only to its author, including when the viewer is
  staff.
- `SESSION_SHARED` and `CLIENT_SAFE` require canonical access to the owning
  Session.
- `PROJECT_TEAM` also requires Owner or Editor access to the owning Nest;
  staff may use the same production/team lane.
- `CLIENT_SAFE` means ready for a reviewed follow-up. It is not evidence that
  the note was sent, published, notified, or received.

`CoachingNoteRevision` is the append-only change history. Every create or edit
records a monotonically increasing revision number, operation, actor, time,
and complete note snapshot. The current note row is updated transactionally
with its revision.

## Access invariants

Every cross-workspace query combines canonical Session access with note-level
audience policy:

1. Confirm the actor can access the Session as its creator, participant,
   booking client or coach, active Nest grantee, or authorized staff member.
2. Allow an author to read their own note.
3. Allow a Session member to read `SESSION_SHARED` and `CLIENT_SAFE`.
4. Allow `PROJECT_TEAM` only through the production-capable Nest role or staff
   boundary.
5. Never let staff status override another author's `AUTHOR_PRIVATE` note.

Search, Library, Find, and the direct Session workspace use these same rules.
Room access alone is never sufficient to return a private note.

Only the author edits a note. Writes recheck Session access inside a serializable
transaction, require the expected current timestamp, and append the revision in
that same transaction. Production purpose and project-team audience require a
Nest Owner or Editor role, or staff authority.

## Creation and migration

Web creation uses a stable UUID request identity and a deterministic canonical
note ID. An exact retry returns the existing note; reusing the same request
identity for different content fails with a conflict.

The visibility migration is deliberately conservative:

- existing notes become `AUTHOR_PRIVATE`;
- every existing note receives a baseline revision;
- no migration infers a broader audience from Session or project access.

This makes schema rollout fail closed and keeps later audience changes
inspectable.
