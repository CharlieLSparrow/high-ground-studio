# Live Story Drafts Implementation Plan

## Purpose

This plan turns Story Candidates into live app writing surfaces without changing canonical manuscript truth.

It is intentionally phased. Phase 1 should make saved drafts real and useful. Later phases can add history, review detail, and controlled manuscript promotion.

## Current Repo Patterns To Reuse

The app already has the pieces needed for a small first implementation:

- Prisma/Postgres is used for durable operational state.
- `User`, `UserRole`, and `AppRole` already provide app identity and role grants.
- Team actions use `"use server"`, `auth()`, role helpers, Prisma mutations, `revalidatePath`, and redirect or page-refresh feedback.
- `apps/web/src/lib/authz.ts` centralizes simple role decisions.
- Story Map already reads manuscript blocks, episode production state, arrangements, and Story Candidate planning state server-side.

Do not introduce a new dependency or state framework for Phase 1.

## Proposed Phase 1: Durable Live Drafts

### Schema

Add:

- `StoryDraftStatus` enum
- `StoryDraft` model

Recommended required fields:

- `storyCandidateId`
- `sourceBlockId`
- `title`
- `body`
- `status`
- `createdByUserId`

Recommended optional fields:

- `storyCandidateTitle`
- `episodeKey`
- `episodeNumber`
- `arrangementKey`
- `notes`
- `supportNotes`
- `updatedByUserId`
- `reviewedByUserId`
- `approvedAt`
- `promotedAt`
- `promotedBlockId`

Add relations from `User` for creator/updater/reviewer roles.

### Migration

Create and apply a Prisma migration after the schema is approved.

Do not use `db:push` as the permanent production plan unless this project explicitly chooses that deployment path.

### Server Actions

Add focused server actions near the Learning to Lead team route, for example:

- `apps/web/src/app/team/books/learning-to-lead/actions.ts`

Initial actions:

- `createStoryDraftAction`
- `updateStoryDraftAction`
- `setStoryDraftStatusAction` if status updates should be separate

Action behavior:

- require authenticated user
- require internal content access or a dedicated future draft-edit permission helper
- validate `sourceBlockId`, title, and body
- verify the source manuscript block exists in the current parsed manuscript
- create or update `StoryDraft`
- set `createdByUserId` or `updatedByUserId`
- revalidate `/team/books/learning-to-lead`
- do not write files
- do not change arrangements
- do not change production YAML

### Story Map UI

Update the internal viewer to show Story Drafts on Story Candidate cards.

Minimum UI:

- draft status badge
- latest draft title
- latest draft body preview
- updated timestamp
- author/updater label when available
- open draft editor panel

Editor fields:

- title
- body
- status
- notes
- support notes

Keep the editor plain. A textarea is enough for the first slice.

### Data Loading

Load Story Drafts server-side on the Learning to Lead page.

Suggested query:

- fetch drafts for source block IDs and Story Candidate IDs present in the current Story Map
- sort by `updatedAt` descending
- pass only safe client fields to the client component

Do not expose unnecessary user profile data.

### Validation

Run after implementation:

- Prisma migration validation
- `pnpm db:generate`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web exec next build --webpack`
- manual save smoke test as authorized user
- manual access check as unauthorized user
- `git diff --check`
- confirm no canonical content files changed

## Proposed Phase 2: Draft History And Review Metadata

Add `StoryDraftRevision` after the core save loop proves useful.

History should capture:

- title
- body
- notes
- support notes
- status
- change summary
- creator
- timestamp

Also consider:

- reviewer assignment
- last reviewed timestamp
- status-change history
- filters by status, episode, source block, and reviewer

Do not add collaboration complexity before simple saving is trusted.

## Proposed Phase 3: Promotion Packet Generation

Add a read-only export action or copy helper for approved drafts.

The packet should include:

- proposed future `ManuscriptBlock` ID
- title
- type
- voice
- status
- chapter
- tags
- source
- `pairsWith`
- body
- review notes
- validation checklist

This phase still should not mutate `learning-to-lead.living.mdx`.

## Proposed Phase 4: Controlled Manuscript Promotion

After approval, add a controlled promotion workflow.

Possible approaches:

- generate a promotion packet and let Codex create the manuscript edit in git
- create an internal admin-only promotion screen that prepares a patch but requires review
- later create a PR-based promotion flow if the repo workflow supports it

Promotion must:

- preserve source provenance
- avoid overwriting Homer source blocks
- generate stable `ManuscriptBlock` IDs
- validate duplicate IDs
- validate arrangement references
- create a session note
- commit canonical manuscript changes separately from draft edits

## Recommended Data Flow

1. Story Candidate exists in file-backed planning data.
2. Homer or Chuck opens Story Map in the app.
3. Authorized user creates a `StoryDraft` attached to the Story Candidate.
4. Draft is saved in Postgres.
5. Story Map shows latest draft status and preview.
6. Review moves the draft through lifecycle states.
7. Approved draft generates a promotion packet.
8. Separate canonical manuscript pass promotes approved content.

## Access Strategy

Start with current team roles:

- `OWNER`
- `TEAM_SCHEDULER`
- `COACH`

Add a helper such as `canEditStoryDrafts()` instead of scattering role checks in actions.

If Homer needs writing access without broad internal access, decide whether to add a new role before implementation. Do not solve that by making draft routes public or client-accessible.

## Revalidation Strategy

Revalidate:

- `/team/books/learning-to-lead`

Do not revalidate public episode routes, public pages, or publish surfaces because Story Drafts are not public truth.

## Risks

- Treating a live draft as canonical manuscript too early.
- Letting Story Candidate IDs leak into arrangement YAML.
- Overbuilding editor UX before the save/review loop is proven.
- Skipping source-block validation and creating orphaned drafts.
- Giving Homer too much internal access if the current role set is reused without thought.
- Creating revision history too late if drafts become collaborative quickly.

## Guardrails

- No canonical file writes in Phase 1.
- No public rendering from Story Drafts.
- No Draft-to-Live workflow.
- Every draft requires `sourceBlockId`.
- Every mutation records the acting user.
- Draft statuses must be explicit and visible.
- Promotion requires a separate reviewed pass.

## Open Decisions Before Implementation

- Should Homer receive an existing team role for Phase 1, or should the schema add a new role such as `CONTRIBUTOR`?
- Should Phase 1 include append-only revisions immediately, or start with a latest-draft row only?
- Should drafts be one-per-Story-Candidate by convention, or should multiple competing drafts be allowed?
- Should Chuck support notes live in the same row or become a separate review/comment model later?

## Recommended Next Slice

Implement Phase 1 only: schema, migration, draft save actions, Story Map draft display/editor, and validation.
