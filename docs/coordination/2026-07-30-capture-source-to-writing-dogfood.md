# Capture Source-to-Writing Ownership Checkpoint

Date: 2026-07-30
Branch: `codex/quipsly-product-20260724`
Feature commit: `aca8aa0a5c4f87e0f7425aaeceb34712be04bf59`

## Outcome

Quipsly now carries one explicit person-level ownership boundary through the
canonical Nest document kernel. A reviewed Research annotation becomes one
actor-owned writing document containing:

1. a pinned, immutable source-evidence block; and
2. a separate editable response block.

The source, citation, and response no longer share one editable text field.
The returned iPhone and Nest link targets and highlights the response block
without manufacturing focus or opening the keyboard unexpectedly.

The handoff remains one explicit human action:

- reading, annotating, or resolving a source does not create writing;
- Capture protects the complete decision before network use;
- Nest creates an actor-owned document only after current write authorization;
- source bytes, annotation text, and annotation revision remain unchanged;
- no task, goal, calendar event, notification, message, provider request,
  delivery, or publication is created.

## Canonical ownership model

`StudioDocument.personalOwnerUserId` is the single document-level rule:

- `NULL` means the document follows the existing Nest membership boundary;
- a user ID means only that actor can read or mutate the document, even when
  other editors belong to the same Nest.

This is not a second document store and does not overload the historical
`isPrivate` projection flag. The personal document still uses the same stable
document identity, blocks, revisions, tags, anchors, evidence uses, operations,
and portability substrate as shared writing.

`personal-writing-documents.ts` centralizes:

- primary-email and alias resolution to the canonical user ID;
- the shared-or-owned Prisma visibility predicate;
- indistinguishable not-found enforcement for direct reads and writes.

The boundary is applied across Create, Nest pages, notebooks, Library, mobile
Today and Work, native notes, transcript-derived drafts, source filing,
storyboards, canonical note editing, bidirectional sync, workspace search,
assistant context, research context packets, embedding/index maintenance,
portable export/restore, tags, and account deletion.

## Migrations and historical safety

`20260730110000_add_personal_writing_document_owner`:

- adds the nullable owner foreign key and index;
- backfills canonical native notes from `QuipslyNote.userId`;
- backfills Capture quick notes and transcript drafts from durable operation
  receipts;
- resolves older Nest quick-note actors through canonical primary or alias
  email without guessing.

`20260730121500_backfill_personal_evidence_draft_owner`:

- finds historical evidence-to-writing documents through
  `StudioSourceAnnotationUse`;
- assigns an owner only when exactly one distinct actor is present;
- leaves ambiguous history shared for deliberate human review.

The first migration has an operator-owned structural rollback. Because the
second migration is a safety backfill, there is no blind data rollback that
would erase legitimate current ownership. Application rollback is safe while
the additive column remains. Dropping the column requires first proving that no
document relies on personal ownership and accepting that the access evidence
will be removed.

Legacy portable bundles did not carry an explicit owner bit. A private note
from such a bundle now restores to the importing actor rather than silently
widening to every collaborator.

## Immutable evidence and editable response

One serializable source-to-writing transaction creates:

- the actor-owned `StudioDocument`;
- block 1, `annotation-evidence:*`, containing only the exact quote and
  citation snapshot;
- block 2, `annotation-response:*`, containing the person's editable thought;
- the append-only `StudioSourceAnnotationUse`;
- one reversible `StudioDocumentOperation`.

The evidence use records both block identities. An exact idempotent replay must
recover and match the response identity; an old or malformed partial receipt
fails closed instead of guessing which block should open.

The common immutable-source guard now protects both transcript evidence and
annotation evidence from edit, split, merge, delete, bulk structure operations,
and assistant mutations. The writing desk labels the evidence as read-only and
keeps the response editable.

## Retrieval, AI, and tagging policy

Shared Nest retrieval and AI indexing exclude every personal document.
Actor-partitioned model indexes do not exist yet, so omission is safer than
placing private writing in a shared vector or keyword corpus. Direct context
packets may include a personal document only after the actor-level document
predicate succeeds.

Embedding sync deletes stale personal-document embeddings and shared retrieval
queries independently re-check the backing document. This prevents a stale
index row from bypassing the current ownership boundary.

A project editor also cannot use tag-merge preview or apply to infer counts
from, expose, or rewrite another actor's private writing. Quipsly reports a
generic ownership conflict and leaves the private tag relationships unchanged
until each owner reconciles them intentionally.

## Trustworthy iPhone acknowledgement

The native response now requires:

- document database and stable IDs;
- immutable evidence-block database and stable IDs;
- editable response-block database and stable IDs;
- the exact project, document, and response block in the `/create` URL;
- private-writing, source-unchanged, and no-external-side-effect boundaries;
- an explicit replay result.

Capture holds a protected outbox decision for review if any identity or safety
field differs. The acknowledgement does not auto-open Safari; **Open private
draft** remains an explicit action after canonical readback.

## Operated local proof

The owner journey used the running local Nest, a disposable Firebase emulator
identity, and the persisted local PostgreSQL database:

- opened the exact actor-owned document;
- observed **Only you**, **Pinned source evidence**, and **Read-only source
  snapshot**;
- verified the evidence block was read-only and the response block editable;
- added a real design consequence to the response;
- observed **Saved**;
- reloaded and read the exact edited response back while the evidence remained
  byte-for-byte unchanged.

A second disposable identity was granted active `EDITOR` access to the same
Nest:

- signed in and opened the shared Nest normally;
- attempted the exact actor-owned document and response URL;
- received truthful “document is not available to this account” UX while Nest
  access remained visible;
- opened the normal writing desk and Library;
- found zero links to the private document ID on either surface.

The local Docker control plane and PostgreSQL handshake stalled during the
journey. Restarting Docker recovered the existing volume without data loss.
That real failure also produced two fixes:

- the Prisma adapter is now created only when the process creates the singleton
  client, avoiding discarded adapter/pool construction;
- transaction-pool exhaustion (`P2028`) waits through a bounded identity
  transaction window and returns service-unavailable instead of falsely
  accusing the person's credentials.

## Real-source dogfood

The current repository sources were used rather than synthetic prose:

- coaching weekly commitments;
- Episode 4 editing hardening;
- the coaching/Capture production spine;
- High Ground Odyssey TestFlight human gates.

All four persisted one actor-owned document with distinct immutable evidence
and editable response blocks. A repeated apply returned the same annotation,
document, evidence block, response block, and URL for every source with
`annotation: true` and `draft: true`; no duplicate writing or source mutation
occurred.

Portable export/restore also round-tripped an actor-owned evidence document,
both blocks, source label, source path, and owner boundary into a second Nest.
The restore remained idempotent and did not overwrite a destination edit,
reactivate reminders, schedule work, fetch providers, or create external
effects.

## Verification

- Complete Quipsly Jest run: **180 suites / 881 tests passed**; 28 suites / 84
  environment-gated tests skipped.
- Live local PostgreSQL matrix: **7 suites / 19 tests passed**.
- Quipsly TypeScript 7 typecheck: pass.
- Prisma: **31 migrations**, local schema up to date.
- Source-only mobile Capture contract: pass.
- Protected source-annotation outbox harness: pass.
- Capture Nest source-evidence contract: **10/10**.
- Capture App Store/static checks: **877/877**.
- Repeated four-source persisted dogfood: pass.
- Same-Nest rendered collaborator denial: pass.
- Focused immutable-source label UI: **4/4**.
- LiveKit dependency resolution and complete unsigned iOS Simulator build:
  **BUILD SUCCEEDED**.
- `git diff --check`: pass.

## Distribution boundary

The actor-private Nest slice is now qualified on a zero-traffic Cloud Run
preview. It is still not the production surface or a distributed Capture
build.

Before migration, on-demand Cloud SQL backup `1785413794634` completed
successfully with description
`quipsly-personal-writing-1627428e-pre-migration`. Exact-schema Cloud Build
`a969f3ac-e739-4db6-97b2-cf702ef630e6` produced the schema image from commit
`1627428e905d011642c92fcfa3807f5d7512ff6e`. Read-only status execution
`quipsly-schema-status-mhwjq` found exactly the two expected pending
migrations. Migration execution `quipsly-schema-migrate-lrms9` applied only:

- `20260730110000_add_personal_writing_document_owner`;
- `20260730121500_backfill_personal_evidence_draft_owner`.

Status execution `quipsly-schema-status-pnvgs` then reported all 31 migrations
up to date.

Exact-source Nest Cloud Build
`3adae171-0ea4-490d-9601-e9a068b7ea91` passed the strict production build,
TypeScript, all 150 page-generation routes, image publication, and required
route-bundle inspection. Its Artifact Registry manifest-list digest is
`sha256:2bcd687afb929299b0297c47a723fd5563ed747b2048fec7acb355ba06e01028`.

Cloud Run revision `studio-00447-jol` is ready at the `quipsly-preview` tag and
serves zero percent of default traffic. Runtime health independently reports:

- source SHA and image tag
  `1627428e905d011642c92fcfa3807f5d7512ff6e`;
- release channel `preview`;
- revision `studio-00447-jol`;
- resolved amd64 image manifest
  `sha256:eebccd541f5063a191b5667ad132a2fcda6f8a1b1eca216913b5e380bda99205`.

Preview operation proved:

- a generated owner completed Firebase login, session exchange, native session
  check, Home Nest, Sessions, writing, editor, recorder, Research, Publishing,
  logout, and bounded database/Firebase cleanup;
- the compiled Quipsly Capture app performed **Start private draft** against
  the preview and produced one actor-owned document, immutable evidence block,
  editable response block, response-focused handoff, exact replay, unchanged
  source and annotation revision, reversible human operation, and no external
  effect;
- the complete generated Capture network contract passed **149/149** checks,
  including 23 authenticated checks, provider join readiness without recording,
  Session context, canonical task/goal/note/tag persistence, and complete
  cleanup.

Quipsly Capture **1.0 (14)**, exact source
`a2d8835353c372e2cb528b661c28752b61cc492c`, production Nest
`studio-00445-rij`, and the public TestFlight handoff remain untouched for
Scott and Charlie's physical rehearsal. Production traffic remains 100% on
`studio-00445-rij`; the preview was deliberately not promoted during the
rehearsal. Apple's public handoff was reread after preview qualification and
still returned the exact open Quipsly Capture beta page and `itms-beta` link.

A later coordinated release must still:

1. repeat same-Nest collaborator denial against the deployed preview;
2. promote the exact image only after the physical rehearsal is no longer in
   flight and the promotion smoke creates a revision-bound receipt;
3. qualify and upload a new Capture build from the same committed source;
4. install and operate it on a physical iPhone;
5. repeat offline/interruption recovery, same-ID production readback, portable
   export/restore, and source/response editing before describing this slice as
   distributed or physically proven.

The deployed denial is now encoded as the reusable
`pnpm quipsly:cloudrun:privacy-preview` boundary harness. Its deterministic
helper coverage passes **4/4**, focused privacy coverage passes **12** tests
with 9 environment-gated integration cases skipped, and Quipsly TypeScript
passes. The first credentialed invocation stopped before reading the database
secret or creating any fixture because both the selected gcloud user credential
and ADC required interactive reauthentication. Loop back with
`gcloud auth login --update-adc --brief`, then run the harness with
`QUIPSLY_PERSONAL_WRITING_PRIVACY_EXPECTED_SOURCE_SHA` set to the exact preview
source above. Do not close item 1 until its redacted receipt reports both
database and Firebase residue absent.
