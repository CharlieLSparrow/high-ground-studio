# Transcript packet candidate to canonical Session note — operated checkpoint

Date: 2026-08-02

Status: implemented and operated locally; intentionally not deployed

## Outcome

Reviewed transcript packet language can now become one durable Session note in
both Nest and Quipsly Capture without silently becoming work, scheduling,
delivery, or publication.

The reviewer must deliberately inspect or edit:

- the final title and body;
- the note's purpose, including Session note, decision, observation, resource,
  or production note; and
- its audience: only me, Session participants, client-safe, or the production
  team when the current role permits that scope.

The candidate stays a source-linked projection until **Save source-linked
note** is pressed. The resulting record is a canonical `CoachingNote` with its
first append-only revision, not a second packet-only note model. Nest and
Capture subsequently read the same note identity and source anchor.

## Source, permission, and replay contract

The write runs as one Serializable transaction and rechecks:

- current Session mutation authority;
- production/team visibility policy for the current actor;
- the exact current packet summary, build, lane, and candidate;
- the packet's transcript-review snapshot;
- completed and released recording-backed transcript evidence;
- the provider segment digest and accepted correction overlay; and
- the exact retained playback source.

The source ledger stores packet, lane, transcript job, recording asset,
segment, provider digest, accepted correction, playback, actor, original
purpose, and original audience identities. An exact retry recovers the one
canonical note. Reusing the same request identity with changed evidence or
content fails closed instead of rewriting history.

Visibility is enforced in projections. The local operation first exposed a
client-safe note to an authorized Viewer, then appended an edit revision that
made it author-private and proved that the Viewer could no longer read it.

Creating this note creates no task, goal, reminder, calendar event, message,
client delivery, Studio edit, or publication. Those remain separate explicit
decisions against the canonical note and source evidence.

## UX and operated acceptance

Nest places the note review beside the source-backed packet lanes and preserves
exact-source playback before the final form. Capture provides the same fields,
audience explanation, and side-effect boundary. A persistent transcript-review
jump menu keeps Notes, Tasks, Goals, and source truth reachable in a long
packet.

The iPhone app also exposes a real review-only Library route for operating the
shipping note card without fabricating a server mutation. The iPhone 17 Pro
simulator journey opened exact-source playback, reviewed title/body, changed
purpose and audience controls, confirmed the private-audience explanation,
confirmed the final network save stayed disabled, and passed the accessibility
audit. The named screenshot was visually inspected from the retained XCTest
evidence.

The disposable local dogfood used Firebase-emulator identities, Nest HTTP,
PostgreSQL persistence, and canonical mobile projections. It proved:

- packet GET projected the exact uncommitted note candidate;
- an Editor materialized exactly one canonical revisioned note;
- the transaction rechecked packet and transcript snapshots;
- refreshed packet state returned the same committed note ID;
- exact replay was idempotent and changed intent conflicted;
- a Viewer could not materialize the candidate;
- the source-linked note and playback anchor returned to iPhone Session state;
- a later privacy change removed the note from the Viewer projection; and
- cleanup left zero disposable rooms, projects, workspaces, users, receipts,
  assets, sources, notes, tasks, tags, or links.

## Verification

- focused packet, goal, note, and Session Review Jest: 6 suites / 73 tests,
  pass;
- strict Quipsly and shared-domain TypeScript: pass;
- optimized Next.js production build: pass, 158 pages generated;
- packet policy gate and mobile Capture source contract: pass;
- operated iPhone 17 Pro note-review journey and accessibility audit: pass;
- operated iPhone 17 Pro full transcript truth-boundary journey: pass; and
- disposable HTTP/PostgreSQL persistence operation: pass with zero residue.

No Cloud Build, Cloud Run deployment, Google Calendar write, TestFlight upload,
App Store mutation, external delivery, or publication occurred. This change is
held for a deliberately bundled release candidate.
