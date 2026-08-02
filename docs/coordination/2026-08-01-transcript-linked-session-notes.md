# Transcript-linked Session notes checkpoint

Date: 2026-08-01

Branch: `codex/quipsly-product-20260724`

Scope: exact playback-backed transcript segment to a canonical, revisioned
Session note in Nest and Quipsly Capture

## Outcome

A person can now turn one exact reviewed transcript moment into a durable
Session note from either the Nest transcript desk or the iPhone transcript
review. This is an explicit human action, not an automatic transcription side
effect.

The author must deliberately choose:

- purpose: Session note, follow-up, decision, or production note;
- audience: only me, Session, client-safe, or project team;
- note text and optional title.

Production purpose and project-team audience are offered only to Nest owners,
editors, or authorized staff. The server rechecks that authority and the
Session mutation boundary inside the same serializable transaction as the
write.

## Canonical and provenance contract

The created row is a normal `CoachingNote`; it does not introduce a parallel
mobile or transcript-note model. Revision 1 uses the operation
`created-from-transcript`. Later Nest or iPhone edits append normal
`CoachingNoteRevision` records and preserve the original source object.

The source anchor records:

- Session, transcript-job, segment, and recording-asset identities;
- source-media identity and exact playback range;
- immutable provider text, speaker label, and provider-text SHA-256;
- effective reviewed text and speaker snapshots;
- accepted correction identity, when one exists;
- initial purpose, audience, title, and body;
- explicit human-action and no-AI provenance.

Nest and Capture project that anchor as a visible source snapshot with a link
back to the exact transcript segment. Opening the link focuses the segment but
does not claim that playback occurred; the person still presses Play.

## Side-effect boundary

Saving a transcript-linked note does not:

- rewrite provider transcript evidence or correction overlays;
- mutate recording media or timing;
- create a task, goal, reminder, or calendar event;
- assign work;
- send a message or client follow-up;
- deliver or publish anything.

`CLIENT_SAFE` means eligible for a separately reviewed client follow-up. It is
not a delivery receipt. `PROJECT_TEAM` is an internal Nest visibility choice,
not public visibility.

## Collaboration ownership repair

The iPhone Session list previously omitted project-grant access even though the
canonical Session and transcript mutation layers recognized active project
grants. A project editor could therefore create legitimate transcript work but
fail to see the containing Session in Capture.

`GET /api/mobile/capture/sessions` now includes active project grants in its
room boundary. Note visibility remains independently filtered:

- author-private stays author-only;
- Session and client-safe notes require Session access;
- project-team notes additionally require owner/editor/staff authority.

## Operated local proof

With local Nest, PostgreSQL, and the Firebase Auth emulator healthy:

```bash
QUIPSLY_LOCAL_COLLABORATION_DOGFOOD=1 \
  pnpm quipsly:local:session-collaboration-dogfood
```

The disposable runner performed authenticated HTTP requests through the live
local Next server and independent Prisma readback. It proved:

- a project viewer can read the Session projection but cannot create a
  transcript-linked note;
- a project editor created one client-safe decision from an exact released
  transcript segment;
- retrying the same request returned the same canonical note with one revision;
- the viewer's iPhone Session projection contained the client-safe note and its
  exact playback anchor;
- the editor revised the note to author-private, creating revision 2 without
  losing the source anchor;
- the private revision disappeared immediately from the viewer projection;
- role downgrade and revocation continued to fail closed;
- zero tasks or external side effects were created;
- cleanup left zero disposable rooms, projects, workspaces, users,
  finalization receipts, media assets, or source rows.

## Verification

- transcript-note route, Nest composer, and Nest source-return-link suites:
  3 suites / 19 tests pass;
- enabled PostgreSQL iPhone Session privacy integration: 1 suite / 4 tests
  pass;
- Quipsly domain and app strict TypeScript gates pass;
- Quipsly Capture iPhone 17 Pro simulator build succeeds;
- focused Capture transcript-review UI test succeeds, including purpose,
  audience, preview-write protection, source boundaries, and accessibility
  audit;
- `git diff --check` passes.

No cloud deployment, TestFlight build, App Store Connect mutation, real user
data mutation, or release-cost-bearing build occurred for this checkpoint.

