# iPhone note to Nest Library continuity

Date: 2026-07-23

## Product decision

An iPhone quick Note remains one actor-owned `CoachingNote` attached to its
owning Session. Nest Library indexes that same identity; it does not copy the
text into `QuipslyNote`, a document block, a knowledge node, or a new note
table.

The Library continuation URL points to the exact note card inside the Session:

`/sessions/{roomId}#quick-entry-{noteId}`

This keeps Session provenance, project identity, offline retry identity, and
canonical `StudioTag` links together.

## Visible behavior

- Library has a first-class **Notes** count and filter.
- Actor-authored Session notes are searchable by title, body, Session, Nest,
  tag label, and tag slug.
- iPhone quick captures are labeled `iPhone capture` and `Offline retry safe`.
- Canonical note tags are visible in both Library and Session readback.
- Notes from another account are excluded before the Library projection.
- The Library card continues to the exact Session note instead of opening a
  generic workspace or creating a second record.

## Boundaries

- Library remains a read-only index.
- Only `SESSION_NOTE` records authored by the signed-in actor and belonging to
  a Session that actor can still access are indexed.
- Tags are shown only when active and inside a Nest visible to the actor.
- Transcript summaries, AI candidates, follow-up packets, and another user's
  private notes are not presented as personal notes.
- No provider, calendar, message, publication, or external side effect occurs.

## Verification

- Library and Session component/model tests pass.
- Quipsly TypeScript check passes.
- PostgreSQL Library ownership integration passes.
- PostgreSQL iPhone quick-entry integration now proves:
  `POST /api/mobile/capture/quick-entry` -> canonical `CoachingNote` plus
  `CoachingNoteTagLink` -> the same `note:{id}` Library entry -> exact Session
  deep link.
- The production Next.js build passes. The pre-existing broad NFT trace warning
  remains unrelated to this slice.
- Local Nest restarted at `http://127.0.0.1:3012`; `/library` returns HTTP 200
  and correctly presents the sign-in boundary without an authenticated cookie.

## Next slice

Add an authenticated note editor/tag decision surface against this same
identity, with optimistic concurrency and explicit receipts. Do not introduce
another note model to gain editability.
