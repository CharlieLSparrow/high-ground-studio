# Capture Source-to-Writing Checkpoint

Date: 2026-07-30
Branch: `codex/quipsly-product-20260724`
Feature commit: `804e42e2`

## Outcome

Quipsly Capture can now turn one reviewed source annotation into exactly one
private canonical Nest writing draft. The draft starts with the person's
working note, an immutable quote snapshot, and a durable citation back to the
canonical Research annotation.

The handoff remains an explicit human decision:

- looking at or resolving an annotation does not create writing;
- the iPhone protects the complete decision before network use;
- Nest creates only a private document and private opening block;
- the immutable source and annotation revision remain unchanged;
- no task, calendar event, message, provider request, delivery, or publication
  is created.

## Canonical architecture

- Capture Today projects permission-filtered `StudioSourceAnnotation` records
  and the current person's existing `StudioSourceAnnotationUse`, if one exists.
- `POST /api/mobile/capture/today` accepts `source-annotation-draft` only for an
  authenticated person with current `OWNER` or `EDITOR` access to the exact
  project.
- The request includes a stable UUID, exact annotation ID, project slug, and
  optimistic annotation revision.
- A serializable transaction creates one private `StudioDocument`, one private
  `StudioDocumentBlock`, one append-only evidence-use record, and one
  reversible human `StudioDocumentOperation`.
- The unique actor/request identity and bounded serialization retry converge
  racing or ambiguous requests on the same canonical document. Exact replay
  returns the existing document and block. Reusing the UUID for another
  annotation, project, or revision returns a conflict.
- The evidence-use receipt stores the exact quote snapshot, citation label,
  source fingerprint, source-unit ID, and annotation revision.

No schema migration was required. The slice uses the existing document kernel,
source annotation, evidence-use, and operation models rather than introducing
a second writing or citation system.

## Trustworthy iPhone edge

`SourceAnnotationDraftOutbox` stores the complete decision in a file-protected,
actor-partitioned ledger before sync. It retains one UUID across relaunch and
retry, distinguishes retryable transport failures from held permanent
conflicts, and removes a decision only after an exact server acknowledgement.

The acknowledgement must match:

- action, annotation ID, and client request UUID;
- non-empty document and block database plus stable IDs;
- the expected `/create` project and document;
- private-draft, no-source-mutation, and no-external-side-effect boundaries.

A corrupt primary ledger recovers its last-known-good account partition
read-only and refuses new writes. Switching Quipsly accounts hides another
person's decisions without deleting them.

## UX

Each eligible Today annotation now has one calm writing affordance:

- **Start private draft** protects and syncs the decision;
- **Private draft queued for Nest** remains visible offline;
- a permanent mismatch exposes **Retry draft** and **Discard** rather than
  silently inventing another decision;
- **Open private draft** appears only after canonical readback and survives
  relaunch.

Capture does not unexpectedly open Safari after creation. The explicit open
link is presented after Nest confirms the durable document identity.

## Operated evidence

The acceptance journey used:

- current local Nest source;
- a disposable real Firebase identity;
- loopback PostgreSQL;
- the compiled Quipsly Capture app on an iPhone 17 Pro Simulator.

The app opened Today, found the exact seeded annotation, tapped **Start private
draft**, received the canonical acknowledgement, replaced the start action
with **Open private draft**, terminated, relaunched, and projected the same
open link without offering a second accidental draft.

Independent API and database readback proved:

- exactly one active `StudioSourceAnnotationUse`;
- one private document and one private opening block;
- the exact working note, quote snapshot, citation, and annotation backlink;
- matching immutable-source SHA-256;
- unchanged annotation revision;
- exactly one reversible human operation;
- exact UUID replay returned the same document and block with `reused: true`;
- source mutation and external side effects remained false.

Cleanup deleted the generated evidence use, annotation, project, Home Nest,
grant, membership, database user, and Firebase user. Independent residue checks
reported:

- `databaseArtifactsAbsentAfterCleanup: true`
- `firebaseUserAbsentAfterCleanup: true`

## Verification

- Focused source service and Today route tests: 28/28
- Quipsly TypeScript 7 typecheck: pass
- Protected native outbox harness, including relaunch, account isolation,
  held retry, exact acknowledgement, and corrupt-ledger recovery: pass
- Mobile source-contract checks: pass
- App Store/static checks: 873/873
- iPhone 17 Pro Simulator build: pass
- Real generated Firebase/PostgreSQL/native annotation-writing journey: pass
- `git diff --check`: pass

## Delivery boundary

This feature is committed source, not a distributed rehearsal build. Quipsly
Capture 1.0 (14), exact source `a2d8835353`, and production Nest
`studio-00445-rij` remain untouched for Scott and Charlie's physical
rehearsal.

A later coordinated release must still:

1. deploy the exact committed Nest source as a zero-traffic preview;
2. pass authenticated preview smoke and immutable source/image readback;
3. qualify a new Capture build from the same committed source;
4. install and operate it on a physical iPhone;
5. prove offline/interruption recovery and same-ID production readback before
   this slice is described as distributed or physically proven.
