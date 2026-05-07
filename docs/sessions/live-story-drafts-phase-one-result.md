# Live Story Drafts Phase One Result

## Branch

- `main`

## Files Inspected

- `package.json`
- `apps/web/package.json`
- `prisma/schema.prisma`
- `docs/deploy/database-migrations.md`
- `apps/web/src/app/team/appointments/actions.ts`
- `apps/web/src/app/team/coaching-requests/actions.ts`
- `apps/web/src/app/team/clients/actions.ts`
- `apps/web/src/app/team/kanban/actions.ts`
- `apps/web/src/lib/authz.ts`
- `apps/web/src/lib/content-access.ts`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `docs/architecture/live-story-drafts.md`
- `docs/analysis/live-story-drafts-implementation-plan.md`
- `docs/workflows/live-story-draft-workflow.md`
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `prisma/schema.prisma`
- `apps/web/src/lib/authz.ts`
- `apps/web/src/lib/story-drafts.ts`
- `apps/web/src/lib/server/story-drafts.ts`
- `apps/web/src/app/team/books/learning-to-lead/actions.ts`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `docs/architecture/live-story-drafts.md`
- `docs/workflows/live-story-draft-workflow.md`
- `docs/project-context/current-state.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/deploy/database-migrations.md`
- `docs/sessions/episode-06-recording-completion-checkpoint-result.md`
- `docs/sessions/live-story-drafts-phase-one-result.md`

## Schema / Database Summary

Added Phase 1 Prisma state:

- `StoryDraftStatus`
- `StoryDraft`
- `User` relations for created, updated, and reviewed Story Drafts

`pnpm db:migrate --name live_story_drafts` was attempted first, but Prisma detected drift because the existing database has tables while the repo has no checked-in migration history. Prisma asked to reset the public schema, so that path was not used.

The repo-documented current workflow is `pnpm db:push`; that command was run successfully, followed by `pnpm db:generate`.

## Server Action Summary

Added route-local server actions:

- `createStoryDraftAction`
- `updateStoryDraftAction`
- `setStoryDraftStatusAction`

The actions reuse existing repo patterns:

- `auth()` for session lookup
- `apps/web/src/lib/authz.ts` for role checks
- direct Prisma mutations
- source-block validation against the parsed living manuscript
- `revalidatePath("/team/books/learning-to-lead")`

The actions do not write files or modify canonical manuscript truth.

## UI Summary

Story Map now shows Live Story Draft state on Story Candidate cards:

- draft count
- latest draft title
- latest status
- body preview
- notes/support notes preview
- saved/update metadata
- clear `Live Story Draft`, `Saved in app`, and `Not manuscript truth` labels

Authorized users can create or update drafts from a plain textarea form.

Saved drafts can generate a copy-only promotion packet. The packet does not write files or create `ManuscriptBlock` entries.

## Access Model Summary

Phase 1 allows Story Draft editing for:

- `OWNER`
- `TEAM_SCHEDULER`
- `COACH`

`CLIENT` and public users cannot edit Story Drafts.

Homer may need an existing team role or a future narrower contributor/editor role if he should write without broad internal access.

## Episode 6 Checkpoint

Captured the latest Episode 6 recording reality:

- recording resumed after the camera-battery pause
- the session went well
- Episode 6 is now marked `Recorded`
- recorded-shape reconciliation is still pending
- no manuscript or arrangement normalization happened

## Validation Performed

- `pnpm exec prisma validate`
- `pnpm db:migrate --name live_story_drafts` attempted and stopped because Prisma required a schema reset
- `pnpm db:push`
- `pnpm db:generate`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web exec next build --webpack`
- `git diff --check`
- `git status --short --branch`

## Known Limitations

- No draft revision history exists yet.
- Multiple drafts are supported, but the UI emphasizes the latest draft first.
- Story Draft promotion is copy-only; it does not create real manuscript blocks.
- Homer access still depends on role assignment because no new contributor/editor role was added.
- The repo still has no checked-in Prisma migration history.
- Episode 6 needs a real recorded-shape reconciliation before normalization.

## Intentionally Unchanged

- `learning-to-lead.living.mdx`
- real `ManuscriptBlock` entries
- `podcast-season-1.yml`
- `virtual-splits.yml`
- public publish files
- episode packet files
- raw `_inbox` files
- Draft-to-Live behavior
- public Story Draft rendering
- research, clip, or production-note promotion

## Recommended Next Book & Episodes Action

Use the Story Map with Homer to write one Episode 7 Story Draft, then capture the Episode 6 recorded-shape summary before normalizing Episode 6.
