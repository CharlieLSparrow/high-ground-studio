# Canonical Tag Focus

Last verified: 2026-07-30

## Product job

A Quipsly tag is a stable project-scoped identity, not a search phrase.

Opening a tag must answer:

> What accessible work and evidence is linked to this exact organizing idea in
> this exact Nest?

It must not combine another Nest's same-label vocabulary, depend on the tag's
current spelling, or lose the trail after a rename or merge.

## Routes and identity

Human text search remains:

```text
/find?q=<text>
```

Canonical tag focus is:

```text
/find?tag=<StudioTag.id>
```

Every canonical tag chip passes `StudioTag.id`. Label search remains only for
editor structure markers that do not yet carry a persisted project tag
identity.

The server:

1. derives the actor's visible Nest set;
2. resolves the requested ID only inside that set;
3. follows a preserved `mergedIntoTagId` redirect inside the same Nest;
4. queries record relations by the resolved tag ID;
5. reapplies each record family's normal access rule;
6. returns no identity when the requested tag is outside the visible set.

The URL remains valid through rename because the tag ID does not change. A
merged source ID remains a durable redirect and the UI names both the former
and canonical labels.

## Current exact-focus projection

The exact focus includes:

- actor-visible Tasks through `ActionItemTagLink`;
- actor-owned or actor-visible Goals through `GoalTagLink`;
- accessible Sessions through `CallRoomTagLink`;
- visibility-permitted Session notes through `CoachingNoteTagLink`;
- permission-filtered documents and writing notes through
  `StudioDocumentTagLink` or exact `StudioTaggedSpan`;
- active, visibility-permitted source annotations through
  `StudioSourceAnnotationTag`;
- source records only when one of those visible annotations carries the exact
  tag;
- media clips through `StudioMediaClipTag`, after independently rechecking
  access to the parent `StudioMediaAsset`.

Unreviewed transcript-inferred Tasks remain quarantined. Personal writing
ownership, Session participation, coaching-note audience, project grants, and
annotation visibility remain independent checks; possession of a tag ID never
broadens access.

For a media clip to appear, the exact tag's Nest must also be one of the parent
asset's direct, media-bin, or explicit attachment scopes. A globally readable
legacy asset may appear, but remains read-only. A clip carrying a malformed
cross-Nest tag link is excluded even when the actor can see both Nests.
Opening a result returns to the exact clip and preserves the exact tag-focus
back path.

Knowledge-node counts remain visible in audited vocabulary tools but do not
yet have a canonical return destination.

## Vocabulary-only authoring

An Owner or Editor can create reusable vocabulary directly in
`/work?manage=tags`, without inventing a Task, Goal, Note, document, Session,
or clip. The action:

1. names the exact destination Nest;
2. rechecks an active Owner/Editor grant inside the serializable transaction;
3. creates or reuses the canonical identity;
4. records append-only revision evidence for a newly created tag;
5. creates no assignment and no external side effect.

The UI states this boundary before and after creation. Exact-label retry reuses
the existing identity instead of creating a duplicate.

## iPhone behavior

iPhone Work already filters by canonical tag ID inside the selected Nest.
Selecting a tag now exposes an explicit:

```text
Showing #<label> in <Nest>
```

state, including a selected accessibility value. Task, Goal, and document-note
filters continue to use the same ID even when protected pending tag decisions
change the effective local projection.

Shared taxonomy creation, rename, archive, and restore remain live-only.
Record-level assignment can use the protected outbox. Merge impact and
rollback remain in Nest.

## Verification

The acceptance contract requires:

- two visible Nests with the same human tag label return only the requested
  canonical ID's records;
- an actor without that Nest in their visible set receives no tag or record
  identity;
- a merged source tag follows its preserved redirect;
- text search still finds aliases without becoming the identity contract;
- Work, Schedule, Session review, Session notes, Nest project tags, Search tag
  results, and project-backed writing tags all link by exact ID;
- media results recheck the parent asset, exclude a same-ID malformed
  cross-Nest clip link, and return to the exact highlighted clip;
- iPhone Work visibly and accessibly reports the selected exact tag focus;
- no record, assignment, message, calendar event, provider call, or
  publication is created by opening the focus.

Current evidence:

- focused media/access/action/rendered Jest: 47/47;
- focused Jest: 68/68;
- real PostgreSQL canonical tag and media-access suites: 16/16;
- retained durable QA:
  `Capture vocabulary dogfood` / `cms8666060000x6xlax1zfsxi` resolves at
  revision 1 with `exactTagFocus:true` and zero Task, Goal, Session, Note, or
  document assignments;
- operated local media QA retained a dedicated test account, Home Nest,
  canonical tag, parent asset, and 4.00s–12.00s clip. The actual UI created the
  tag without an assignment, applied it to the clip, returned the clip under
  exact tag focus, and reopened the exact logger row with `aria-current=true`;
- Quipsly TypeScript 7 typecheck passed;
- complete Quipsly Jest: 189 active suites / 937 tests;
- cross-surface release contracts: 168/168;
- Capture-to-Nest source-evidence contract: 10/10;
- optimized 150-route Nest production build passed;
- mobile source and production-boundary contract passed;
- App Store static contract passed 947/947;
- operated
  `testWorkKeepsProjectsTasksGoalsNotesAndTagsTogether` passed on iPhone 17 Pro
  / iOS 26.3.1 in 58.162 seconds.

These checks do not prove a physical TestFlight install. That remains a
separate release boundary.

## 2026-07-30 media-focus production continuation

Exact source `ed3b2dc6bc746d220459b3911a53b7cfc4db4a3d` is deployed as
`studio-00464-sig` at 100% traffic from immutable runtime image digest
`sha256:dc4bd769ef4c12240e0cd68048b368524855c0eb6a617e59ab37c6d1c24b0cca`.
The release used a zero-traffic preview, two generated-reviewer passes with
verified Firebase/database cleanup, exact source readback, guarded promotion,
and post-promotion production status. Build 18 remains the compatible
TestFlight binary because no native source changed.
