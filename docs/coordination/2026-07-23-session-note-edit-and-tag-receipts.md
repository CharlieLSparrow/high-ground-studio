# Session note edit and tag receipts

Date: 2026-07-23

## Outcome

An actor can now continue an iPhone quick Note inside its exact Session, edit
its title/body, replace its canonical Nest tags, or create and attach a new
reusable tag. Every operation mutates the original `CoachingNote`; no
`QuipslyNote`, document block, knowledge node, or copied note is created.

## Write contracts

### Note content

`PATCH /api/notes/{noteId}`

- requires the note author and current access to the owning Session;
- accepts the exact `expectedUpdatedAt` revision;
- returns `409 CONFLICT` instead of overwriting a newer note;
- retains the previous title/body in
  `sourceJson.lastEditReceipt.previous`;
- records the actor, receipt ID, and explicit no-external-side-effect boundary.

### Canonical tags

`POST /api/work/tags`

The shared entity contract now accepts `entityKind: "note"` for both complete
tag replacement and `CREATE_AND_ASSIGN`.

- the note author must own the note;
- the note must resolve through its Session to a Nest;
- the actor must have an active OWNER or EDITOR grant to that Nest;
- every selected tag must be active and belong to that same Nest;
- the write uses the note revision and fails on concurrent change;
- explicit `CoachingNoteTagLink` rows and a receipt are written
  transactionally.

## UX

The iPhone quick-capture card in Session now contains one collapsed
`Edit note and tags` surface. The ordinary reading view remains quiet. Editing
text, choosing vocabulary, and creating vocabulary are separate explicit
actions, each with a truthful completion message.

## Verification

- TypeScript passes.
- Session page and interaction tests pass, including the actual sequence:
  edit note -> receive new revision -> replace tags using that revision.
- Work-tag route tests pass for `entityKind: "note"`.
- PostgreSQL note-edit integration proves author update, previous-value
  receipt, Library readback, stale-revision rejection, and other-account
  rejection.
- PostgreSQL work-tag integration proves same-Nest note joins, reusable tag
  creation, ownership enforcement, and receipt persistence.

Visible authenticated browser proof remains pending because the current
in-app-browser binding cannot be safely navigated. The local server and
semantic UI/database paths remain available; no alternate browser was used to
bypass that boundary.
