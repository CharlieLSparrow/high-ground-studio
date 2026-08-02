# Transcript candidate to canonical task — operated checkpoint

Date: 2026-08-02

Status: implemented and operated locally; intentionally not deployed

## Outcome

Session Review no longer turns an accepted transcript suggestion into a context-poor, unassigned row. A reviewer now opens one explicit creation sheet and can inspect or change:

- the final task title and detail;
- owner: the signed-in reviewer or deliberately unassigned;
- an optional due date; and
- active tags from the Session's canonical Nest project.

The action remains a proposal until the reviewer presses **Create task**. Editing, deferring, or rejecting a candidate still creates no work. Creating a task sends no message, changes no calendar, creates no reminder, performs no delivery, and publishes nothing.

Capture reads the same materialization packet. Its iPhone review form defaults to the current actor and the Session's existing project tags, exposes deliberate unassignment and an optional due date, and sends the same normalized intent as Nest. Preview can open and inspect the complete form while the final write remains disabled, so accessibility and layout can be operated without pretending a server decision occurred.

## Persistence and evidence contract

One Serializable transaction now rechecks:

- current OWNER or EDITOR Session authority;
- released recording and transcription evidence;
- the current packet build and transcript-review digest;
- the exact action candidate;
- the current provider segment and accepted correction overlay;
- protected playback promotion; and
- every selected tag's active, unmerged, same-project identity.

The canonical `ActionItem` stores the shared `quipsly-transcript-derived-task-v1` anchor. Today, Work, Schedule, Session continuity, Nest, and Capture can therefore recognize the same task and return to the exact transcript range. The anchor includes provider-text digest, provider and effective speaker/text snapshots, accepted correction identity, recording asset, and protected playback source.

The review receipt records the exact materialization intent: actor ownership, due date, and sorted tag identities. Replaying the same request recovers the one existing task. A replay with changed intent fails with `ACTION_CANDIDATE_IDEMPOTENCY_CONFLICT` and directs editing to the canonical task instead of rewriting review history.

## Operated acceptance

The disposable local operation used real Firebase-emulator identities, Nest HTTP routes, PostgreSQL persistence, and rendered Next.js pages. It proved:

- an Editor created exactly one self-owned, dated, tagged task;
- packet read returned the exact Session project, active tag vocabulary, actor-owned default, and Session-tag selection;
- the source anchor opened against protected playback identity;
- exact replay did not duplicate the task or receipt;
- changed owner intent was rejected;
- a project Viewer could read allowed Session context but could not review or materialize candidates;
- a downgraded or revoked collaborator lost mutation access immediately;
- the accepted task rendered in Session Review and the global Work Queue;
- the canonical tag rendered with the same task;
- desktop and 390-by-844 phone layouts had no horizontal overflow or client exception; and
- cleanup removed every disposable room, project, workspace, user, receipt, media asset, playback source, task, tag, task-tag link, and Session-tag link.

The current native app then compiled for both iOS Simulator architectures. An operated iPhone 17 Pro journey opened the packet task review form, read final title/detail, Me/Unassigned, due-date, and two selected project-tag controls, proved **Create task** remained disabled in Preview, and passed hit-region, element-description, and clipped-text accessibility audits. The retained result bundle is `/tmp/QuipslyTranscriptTaskMaterializationAccessibility-20260801.xcresult`; its named screenshot was visually reviewed from the form itself.

## Verification

- focused and adjacent Jest: 7 suites, 64 tests, pass;
- packet policy gate: pass;
- strict Quipsly TypeScript: pass;
- optimized Next.js production build: pass, 158 static pages generated;
- mobile Capture contract: 113 checks, pass;
- Capture/App Store static contract: 989 checks, pass;
- generic dual-architecture iOS Simulator build: pass;
- operated iPhone 17 Pro task-review journey and accessibility audit: 1 of 1 pass; and
- disposable real HTTP/PostgreSQL/rendered-browser operation: pass with zero residue.

No Cloud Run deployment, Google Calendar write, TestFlight upload, or App Store metadata mutation occurred. This slice is held for the next deliberately bundled candidate.
