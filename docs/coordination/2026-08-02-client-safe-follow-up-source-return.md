# Client-safe follow-up exact-source return

Checkpoint: 2026-08-02 MDT

## Outcome

Quipsly now keeps the exact permitted transcript evidence behind every selected
source-backed record when a coach deliberately assembles a client follow-up.
The immutable private draft and released revision carry that source anchor to
Nest and Quipsly Capture, where an authorized coach or client can return to the
exact transcript segment without changing the snapshot or starting playback.

This closes the provenance seam between reviewed coaching evidence and the
client-safe follow-up. Previously the selected canonical note, task, or goal
could retain its source while the released follow-up copied only its display
text. The client received a stable revision but could not inspect the evidence
that justified an included item.

## Canonical contract

- Only canonical `CLIENT_SAFE` Session notes and client-owned goals or tasks
  remain eligible.
- Each eligible note, goal, and task is decoded through its existing typed
  transcript-derived source contract.
- A source anchor is projected only when its `roomId` equals the follow-up
  Session. A malformed or cross-Session anchor becomes `null` rather than
  crossing the boundary.
- The selected anchor is copied into both the immutable body snapshot and its
  source manifest. The existing content and manifest SHA-256 values therefore
  cover the exact room, transcript job, segment, time range, provider hash,
  correction snapshot, recording asset, and playback source.
- Later edits to the source note, goal, or task cannot rewrite an already saved
  or released follow-up revision.
- Release remains a separate, explicit action against the exact reviewed
  revision. It creates no email, text, calendar event, publication, completion,
  billing action, consent change, or source mutation.

## Authorization and privacy

The anchor is not a bearer capability. Nest and Capture navigate back through
the canonical Session transcript surface, which rechecks the current actor's
Session permission and transcript-processing gate. The follow-up does not
widen transcript access. If the Session or playback source is no longer
permitted, the destination shows that truthful held/unavailable state.

The coach selection UI announces the exact time range that will be included
before saving. Private, Session-shared, project-team, and unreviewed transcript
records remain ineligible. Capture Preview uses a deterministic source-backed
private draft but disables Save and Release, so UI acceptance cannot invent a
server revision or client delivery.

## Product surfaces

Nest renders **Exact source** links for released or private follow-up notes,
goals, and commitments. The link returns to the canonical Session transcript
with the exact segment fragment.

Quipsly Capture decodes the same anchor for every follow-up record and opens
the real `CaptureTranscriptReviewView` focused on that segment. The snapshot
revision accessibility identifier now belongs to its status row instead of
the whole container; this prevents it from overwriting descendant source-link
identifiers. Transcript AI proposal controls also adapt from a horizontal row
to a stacked layout and permit multiline labels, fixing the Dynamic Type
clipping found by the operated source-return audit.

## Operated acceptance

The deterministic iPhone 17 Pro simulator journey performed the user flow:

1. Opened the next coaching Session in Record.
2. Read back **Private revision 1** from the canonical follow-up workspace.
3. Found the source-backed **Opening question** and its 00:03–00:04 range.
4. Opened Transcript Review and focused `preview-segment`.
5. Passed hit-region, sufficient-description, and text-clipping accessibility
   audits on the destination.
6. Returned to Record.
7. Proved both Save and Release controls exist and are disabled in Preview.

Result:
`CaptureExperienceUITests/testCoachFollowUpPreservesExactSourceWithoutReleasingPreview`
passed, 1/1.

## Verification

- Operated iPhone exact-source and no-release journey: 1/1
- Mobile Capture source contracts: 83/83
- Capture/App Store static contracts: 996/996
- Focused Nest component, route, and mobile Session projections: 28/28
- Persisted PostgreSQL privacy/idempotency/concurrency operation: 1/1
- Strict Quipsly TypeScript: pass
- Exact-source body and manifest hashes plus post-source-edit immutability:
  asserted in the persisted integration operation

The concurrency operation deliberately produces one Prisma write-conflict log
for the losing transaction while the test verifies one immutable canonical
revision and correct idempotent recovery.

## Remaining real-world gate

This checkpoint proves local PostgreSQL persistence and operated simulator UX.
It does not claim a physical-iPhone coaching capture, a two-account production
release/open operation, or a real coaching transcript produced by the cloud
worker. Those remain required by the unified goal. No Cloud Build, Cloud Run,
TestFlight, email, calendar, provider, or production database mutation was
performed for this slice.
