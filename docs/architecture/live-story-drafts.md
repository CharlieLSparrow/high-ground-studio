# Live Story Drafts

## Purpose

Live Story Drafts are the first safe app-backed writing layer for Story Candidates.

They let Homer and Chuck write inside the deployed app without directly changing canonical manuscript files, arrangement YAML, production YAML, or public publish files.

The goal is not to replace the living manuscript. The goal is to create a durable reviewable draft layer between non-canonical Story Candidate planning cards and future promoted `ManuscriptBlock` entries.

## Why Database-Backed

Local-only Playground state is useful for arranging, but it is not enough for real writing.

Live drafts should be database-backed because:

- Homer needs to write in the deployed app, not in a local browser session.
- Drafts need to survive deploys, browser changes, and handoffs.
- Team members need auth-aware access to the same current draft.
- Draft state needs ownership, review status, timestamps, and eventual audit history.
- The app already uses Prisma/Postgres for durable operational state.

## Why Not Edit Canonical MDX First

`learning-to-lead.living.mdx` is canonical manuscript truth.

Directly writing it from the live app would create immediate risks:

- file writes in deployed environments are brittle and may not survive deploys
- canonical prose changes need human review and source-preservation checks
- arrangement YAML can only reference real block IDs after promotion
- public pages must not accidentally consume unreviewed draft material
- git history should remain the promotion boundary for manuscript truth

The safer first slice is database drafts now, controlled promotion later.

## Proposed Data Model

Do not implement this schema until the implementation pass is explicitly approved.

```prisma
enum StoryDraftStatus {
  ROUGH
  NEEDS_HOMER_REVIEW
  NEEDS_CHUCK_REVIEW
  APPROVED_FOR_PROMOTION
  PROMOTED
  PARKED
}

model StoryDraft {
  id                  String           @id @default(cuid())
  storyCandidateId    String
  storyCandidateTitle String?
  sourceBlockId       String
  episodeKey          String?
  episodeNumber       Int?
  arrangementKey      String?
  title               String
  body                String
  notes               String?
  supportNotes        String?
  status              StoryDraftStatus @default(ROUGH)
  createdByUserId     String
  updatedByUserId     String?
  reviewedByUserId    String?
  approvedAt          DateTime?
  promotedAt          DateTime?
  promotedBlockId     String?
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  createdBy           User             @relation("StoryDraftCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict)
  updatedBy           User?            @relation("StoryDraftUpdatedBy", fields: [updatedByUserId], references: [id], onDelete: SetNull)
  reviewedBy          User?            @relation("StoryDraftReviewedBy", fields: [reviewedByUserId], references: [id], onDelete: SetNull)

  @@index([storyCandidateId, status])
  @@index([sourceBlockId, status])
  @@index([episodeKey, status])
  @@index([createdByUserId, createdAt])
}
```

Optional later revision model:

```prisma
model StoryDraftRevision {
  id              String           @id @default(cuid())
  storyDraftId    String
  title           String
  body            String
  notes           String?
  supportNotes    String?
  status          StoryDraftStatus
  changeSummary   String?
  createdByUserId String
  createdAt       DateTime         @default(now())

  storyDraft      StoryDraft       @relation(fields: [storyDraftId], references: [id], onDelete: Cascade)
  createdBy       User             @relation(fields: [createdByUserId], references: [id], onDelete: Restrict)

  @@index([storyDraftId, createdAt])
}
```

If revisions are deferred in Phase 1, `StoryDraft` still needs creator/updater metadata so the first implementation is not anonymous.

## Relationship To Story Candidates

A Story Candidate is planning-only.

A `StoryDraft` attaches to a Story Candidate through `storyCandidateId`, `sourceBlockId`, and optional episode metadata.

The database draft should store enough source context to remain meaningful even if the planning file changes later:

- Story Candidate ID
- Story Candidate title
- source Homer block ID
- episode key / episode number when known
- arrangement key when known

The Story Candidate remains the planning card. The Story Draft is the live written attempt attached to that card.

## Relationship To Source Homer Blocks

`sourceBlockId` should be required.

That keeps every live draft anchored to Homer book text. The draft may contain new Homer revision language, Chuck support material, or notes, but it should never float away from the source manuscript block that prompted it.

## Relationship To Episode Production State

Episode production state remains file-backed for now.

Story Drafts can be displayed on Episode and Story Map views, but they do not change lifecycle status, arrangements, or public publishing state.

Future production state could reference promoted `ManuscriptBlock` IDs after review. It should not reference draft database IDs as public episode truth.

## Relationship To Future Promoted Manuscript Blocks

Promotion should be explicit and controlled.

When a draft is approved, the app should generate a promotion packet first:

- proposed `ManuscriptBlock` ID
- title
- type
- voice
- chapter
- tags
- source provenance
- draft body
- paired source block
- validation checklist

Only a later controlled workflow should turn that packet into canonical MDX.

## Role And Access Rules

Phase 1 should reuse existing internal access patterns before creating a new permission system.

Recommended first gate:

- `OWNER`: create, update, review, approve, park
- `TEAM_SCHEDULER`: create, update, review, approve, park
- `COACH`: create and update if Homer/Chuck accounts are granted this role for writing access
- `CLIENT`: no access

If Homer should write without receiving broad team powers, the next schema/auth pass should consider a new role such as `CONTRIBUTOR` or `EDITOR`. Do not introduce that role casually; it changes access assumptions across the app.

## Draft Lifecycle

### Rough

The draft is being written and is not ready for review.

### Needs Homer Review

Chuck or Codex has prepared material that Homer should read for accuracy, voice, or story truth.

### Needs Chuck Review

Homer has written or revised material that Chuck should shape, support, or place.

### Approved For Promotion

The draft is approved as source material for a future canonical manuscript edit.

This is not the same as promoted.

### Promoted

The draft has been converted into canonical manuscript truth and linked to the resulting `promotedBlockId`.

### Parked

The draft should remain saved but not active.

Use this for fragments, sensitive material, unresolved rights/citation issues, or ideas that do not fit the current episode.

## Revision Options

Phase 1 can save only the latest draft row if speed matters.

The safer long-term option is append-only revisions:

- every save can create a `StoryDraftRevision`
- the latest draft row remains easy to query
- prior versions remain recoverable
- review decisions can reference exact text

If Phase 1 skips revision history, the implementation should be honest about that limitation in the UI.

## Story Map Display

Story Map should show draft state directly on Story Candidate cards:

- draft count
- latest draft status
- latest draft title
- updated timestamp
- author or updater
- short body preview
- review-needed badge

Selecting a Story Candidate should open a read/write draft panel for authorized users.

The panel should make the boundary plain:

- Story Candidate is planning state.
- Story Draft is live saved writing.
- Neither is canonical manuscript truth yet.

## Export And Promotion

Phase 1 should not promote automatically.

Recommended export path:

1. Generate a promotion packet from an approved draft.
2. Include proposed `ManuscriptBlock` metadata.
3. Include source links and review notes.
4. Validate that the source block still exists.
5. Create a follow-up Codex/manual manuscript edit from the packet.

Promotion should be a separate commit with manuscript validation.

## Risks And Guardrails

- Do not write canonical MDX from the deployed app in Phase 1.
- Do not use draft database IDs in arrangement YAML.
- Do not publish directly from Story Drafts.
- Require `sourceBlockId` for every draft.
- Store creator/updater IDs for accountability.
- Keep draft rendering plain and safe; do not render unsafe HTML.
- Revalidate only the internal Story Map route after draft saves.
- Keep the first editor boring: title, body, status, notes.
- Document every promotion as a session note.

## Recommended First Implementation Slice

Add the Prisma draft model, a narrow server-action save path, and a read/write draft panel on Story Map cards.

Keep promotion, revisions, public publishing, and canonical manuscript edits out of the first implementation.
