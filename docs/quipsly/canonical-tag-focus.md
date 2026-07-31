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
  tag.

Unreviewed transcript-inferred Tasks remain quarantined. Personal writing
ownership, Session participation, coaching-note audience, project grants, and
annotation visibility remain independent checks; possession of a tag ID never
broadens access.

Media clips and knowledge-node counts remain visible in the audited vocabulary
merge tools, but exact-focus navigation does not yet link them. Media routes
need a separate permission audit before they become canonical return
destinations. This gap must not be hidden with a label search or an unscoped
media URL.

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
- iPhone Work visibly and accessibly reports the selected exact tag focus;
- no record, assignment, message, calendar event, provider call, or
  publication is created by opening the focus.

Current evidence:

- focused Jest: 68/68;
- real PostgreSQL canonical tag suite: 13/13;
- retained durable QA:
  `Capture vocabulary dogfood` / `cms8666060000x6xlax1zfsxi` resolves at
  revision 1 with `exactTagFocus:true` and zero Task, Goal, Session, Note, or
  document assignments;
- Quipsly TypeScript 7 typecheck passed;
- mobile source and production-boundary contract passed;
- App Store static contract passed 947/947;
- operated
  `testWorkKeepsProjectsTasksGoalsNotesAndTagsTogether` passed on iPhone 17 Pro
  / iOS 26.3.1 in 58.162 seconds.

These checks do not prove a physical TestFlight install. That remains a
separate release boundary.
