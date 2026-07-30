# Capture File-and-Annotate Research Checkpoint

Date: 2026-07-30  
Branch: `codex/quipsly-product-20260724`  
Feature commit: `bb8d6a57`

## Outcome

Quipsly Capture can now turn one actor-owned private Inbox source into
canonical Nest Research evidence and, in the same protected decision, attach
one human-authored annotation using the destination Nest's existing canonical
tags.

The operation remains deliberately narrow:

- the private Snippet or Bookmark remains unchanged;
- the immutable Research source preserves the complete reviewed capture;
- the annotation anchors to that exact complete source;
- tags must already be active in the selected writable Nest;
- no task, calendar event, message, provider request, delivery, or publication
  is created.

## Architecture and safety boundary

- `POST /api/mobile/capture/inbox` accepts an optional annotation intent with
  its own UUID, purpose, visibility, body, and bounded canonical tag IDs.
- A new source, filing receipt, annotation, tag links, and first append-only
  annotation revision commit in one serializable transaction. An invalid
  annotation rolls back the new source and filing instead of leaving partial
  success.
- Existing filings can receive or reuse an annotation without copying source
  text or changing the private capture.
- Annotation idempotency now compares the full decision identity: Nest, source,
  purpose, visibility, body, exact selector, source fingerprint, and tag set.
  Reusing a UUID for different evidence returns a conflict.
- The iPhone stores the complete filing and annotation intent in the existing
  file-protected, actor-partitioned outbox. A server acknowledgement must match
  the exact annotation UUID, purpose, visibility, body, and tags before the
  decision leaves the protected ledger.
- The API returns only active tags belonging to writable destinations.
  Capture does not invent a second tag vocabulary.

## UX proof

The filing sheet exposes:

- a clear optional annotation section;
- purpose and audience choices;
- a multi-line explanation field;
- the selected Nest's reusable tags;
- explicit whole-source anchoring and no-side-effect copy;
- `File + annotate` only when annotation intent exists.

The compiled preview journey found and fixed a real accessibility-tree defect:
the section-level identifier masked its child input and tag identifiers.
Removing that container override restored access to the actual controls.
Both preview and runtime tests use the trailing switch affordance and wait for
its accessible selected state before continuing.

## Operated evidence

The real acceptance lane used:

- current local Nest source;
- a disposable real Firebase identity;
- loopback PostgreSQL;
- the compiled iPhone app on an iPhone 17 Pro Simulator.

The app selected the exact writable project, entered a project-visible
annotation, selected the existing `Episode workflow` tag, and committed the
decision. Independent API and database readback proved:

- the source left only the unfiled Inbox projection;
- the private capture and its revision remained unchanged;
- exactly one filing and immutable source existed;
- the annotation covered offsets `0...immutableText.length`;
- exact text and SHA-256 source fingerprint matched the preserved source;
- the canonical tag link and one `created` revision existed;
- exact replay returned the same filing, source, and annotation IDs;
- Research export contained the same source, annotation, tag, revision, and
  integrity boundary;
- `sourceMutated` and external side effects remained false.

Cleanup deleted the annotation, generated projects, room, grants, membership,
database user, and Firebase user. The harness independently reported
`databaseArtifactsAbsentAfterCleanup: true` and
`firebaseUserAbsentAfterCleanup: true`.

## Verification

- Quipsly TypeScript 7 typecheck: pass
- Inbox/annotation unit and route tests: 11/11
- Real PostgreSQL filing integration: 5/5
- Protected native filing outbox harness: pass
- Mobile source-contract checks: 74/74
- Authenticated generated mobile contract checks: 148/148, including 23
  authenticated checks
- App Store/static checks: 848/848
- Compiled preview filing UX: pass
- Real generated Firebase/PostgreSQL/native filing journey: pass
- `git diff --check`: pass

## Delivery boundary

Build 14 and production `studio-00445-rij` remain the stable rehearsal pair
from exact source `a2d8835353`. Commit `bb8d6a57` is not deployed,
distributed, or physically proven. A later coordinated release still requires
an exact-commit Nest preview, authenticated smoke, immutable readback, a new
qualified Capture build, and physical-iPhone same-ID operation.

