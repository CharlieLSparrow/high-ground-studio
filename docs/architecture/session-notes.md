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

### iPhone capture and reconciliation

The iPhone is the protected offline edge; Nest remains the canonical Session
Notes system of record.

- The local quick-entry outbox persists the note body, Session identity,
  purpose, audience, request identity, and capture time before attempting a
  network write. Older ledger entries without purpose or audience decode
  conservatively as `SESSION_NOTE` and `AUTHOR_PRIVATE`.
- Purpose and audience controls appear only when a quick Note is attached to
  the current Session. Project-team audience and production purpose appear only
  when the signed-in Session projection says the actor is an Owner, Editor, or
  authorized staff member.
- The server never trusts that projection as authorization. It rechecks
  canonical Session and Nest access when the outbox entry reconciles, validates
  the purpose/audience combination, and writes the note plus revision 1 in one
  transaction.
- Retry identity covers Session, body, purpose, and audience. An exact replay
  converges on the original canonical note; changing any protected intent under
  the same request identity is a conflict.
- A successful quick-entry response returns the canonical note identity,
  purpose, audience, revision, and an explicit statement that no message,
  notification, task, calendar event, publication, or delivery occurred.
- The signed-in Session projection returns only policy-visible canonical notes,
  with author, ownership, tags, revision, origin, and timestamps. The iPhone
  renders those separately from still-pending protected outbox entries so local
  intent cannot masquerade as server persistence.

The Session Notes disclosure exposes stable accessibility identities for the
toggle, canonical rows, and the no-delivery boundary. These identities are part
of the UI automation contract, but visible copy remains the primary human trust
surface.

### iPhone editing and conflict recovery

An editable canonical note can be revised from the same Record surface without
turning the phone into a second source of truth:

- The phone journals the complete desired title, body, purpose, audience,
  complete canonical tag set, note and Session identities, expected Nest
  timestamp, actor partition, and one UUID before it attempts the PATCH.
- The outbox is atomically file-protected and keeps a last-known-good copy. It
  is visible only to the currently verified account. An ambiguous retry keeps
  the same UUID bound to the exact same intent.
- Nest derives the receipt and revision identity from actor plus request UUID,
  rechecks note authorship, Session access, current Nest role, and every changed
  tag inside one serializable transaction, then updates the note and complete
  tag set beside exactly one append-only revision.
- An exact retry returns the existing receipt. If a later Nest edit has already
  changed the current note again, the receipt still proves the protected phone
  request committed; the phone may clear that outbox entry and reload the newer
  canonical state instead of holding an already-satisfied request forever.
- Reusing a UUID for changed intent fails. A stale expected timestamp never
  overwrites the newer canonical note. The phone holds the complete draft,
  refreshes the Session projection, and shows the current Nest revision beside
  the protected draft before the author can deliberately create a rebased
  request with a new UUID.
- Held drafts are never blindly retried. They require the visible
  `Review protected draft` path or explicit discard. Discard removes only the
  phone draft and does not mutate Nest.
- Tags are editable only when the current projection offers production-capable
  Nest authority, but the server remains authoritative. A note author without
  that role may preserve an unchanged historical tag set while editing allowed
  content or audience.

The edit sheet keeps purpose, audience, and the no-message/no-work/no-calendar/
no-publication boundary beside the text, uses the same searchable Nest tag
vocabulary as the rest of Quipsly, and provides an explicit keyboard dismissal
so tag and save controls remain reachable. Success, pending, and held states use
different visual language, and feedback is scoped to the owning Session.

The visibility migration is deliberately conservative:

- existing notes become `AUTHOR_PRIVATE`;
- every existing note receives a baseline revision;
- no migration infers a broader audience from Session or project access.

This makes schema rollout fail closed and keeps later audience changes
inspectable.
