# Live Story Drafts Hardening Result

## Branch

- `main`

## Files Inspected

- `prisma/schema.prisma`
- `apps/web/src/app/team/books/learning-to-lead/actions.ts`
- `apps/web/src/lib/server/story-drafts.ts`
- `apps/web/src/lib/story-drafts.ts`
- `apps/web/src/lib/authz.ts`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/domain-model.md`
- `docs/runbooks/local-dev.md`
- `docs/agents/codex-handoff.md`
- `docs/architecture/live-story-drafts.md`
- `docs/architecture/story-map-and-story-candidates.md`
- `docs/analysis/live-story-drafts-implementation-plan.md`
- `docs/workflows/live-story-draft-workflow.md`
- `docs/sessions/live-story-drafts-phase-one-result.md`
- `docs/deploy/database-migrations.md`
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `apps/web/src/app/team/books/learning-to-lead/actions.ts`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `docs/workflows/live-story-drafts-quick-start.md`
- `docs/analysis/story-assignment-workflow-plan.md`
- `docs/architecture/live-story-drafts.md`
- `docs/architecture/story-map-and-story-candidates.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/live-story-drafts-hardening-result.md`

Generated validation output changed `apps/web/tsconfig.tsbuildinfo`; it was intentionally left unstaged.

## Hardening Summary

- Verified Live Story Drafts remain database-backed writing state, not canonical manuscript truth.
- Sanitized unexpected Story Draft action failures so Prisma/runtime internals are logged server-side instead of displayed in the editor.
- Kept expected validation and access failures visible so users know when they need to sign in, need a role, fill required fields, or avoid unsupported statuses.
- Added a small Story Map editor note explaining `Save Latest Draft` versus `Save As New Draft`.
- Adjusted the Story Map editor to render both save-result channels so a later `Save As New Draft` result is not hidden behind an older latest-draft message.
- Added a quick-start workflow for Homer, Chuck, and future Codex runs.
- Added a Story Assignment workflow plan without adding assignment schema.
- Updated architecture docs to separate writing drafts from story assignment and episode arrangements.

## PROMOTED Status Finding

The Phase 1 UI already filtered `PROMOTED` out of the editable status select.

The server action already rejected manual `PROMOTED` writes through shared status parsing. This pass kept that guard in place and documented it as the current hardened boundary.

`PROMOTED` remains in the enum as a future terminal status for a controlled manuscript promotion workflow.

## Auth / Access Finding

Story Draft edits require an authenticated app user with one of the current internal team roles:

- `OWNER`
- `TEAM_SCHEDULER`
- `COACH`

Unauthenticated users cannot save. `CLIENT` users cannot save through the current `canEditStoryDrafts()` gate.

Homer may need a narrower contributor/editor role later if he should write without broader internal team-console powers.

## Source Block Finding

Create and update actions validate `sourceBlockId` against the current parsed Learning to Lead living manuscript before saving.

This keeps each Live Story Draft anchored to Homer source text instead of becoming detached app prose.

## Canonical Safety Finding

Story Draft actions write Prisma rows only. They do not write files, split manuscript prose, modify arrangements, update virtual splits, touch production YAML, modify public publish files, or read/write raw `_inbox` material.

Story Draft content is loaded only for the internal Learning to Lead Story Map route.

## Database Smoke Test

A real mutation smoke test was skipped.

Reason: the local `.env` `DATABASE_URL` points at a remote Neon database, not a clearly disposable local development database. Creating and deleting test rows there would risk mutating production-like data.

No persistent test records were created.

## Validation Performed

- `pnpm exec prisma validate` passed.
- `pnpm db:generate` passed.
- `pnpm --filter web exec tsc --noEmit` passed.
- `pnpm --filter web exec next build --webpack` passed.
- `git diff --check` passed.

## Known Limitations

- No Story Draft revision history exists yet.
- `Save Latest Draft` overwrites the latest row; `Save As New Draft` is the current manual versioning path.
- Story Assignment persistence does not exist yet.
- Story Draft promotion is still copy-only and does not create real `ManuscriptBlock` entries.
- Homer access still depends on current role assignment until a narrower writing role decision is made.
- The repo has no checked-in Prisma migration history.
- Production database readiness still needs explicit verification for the `StoryDraft` table and `StoryDraftStatus` enum.

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
- research, clips, and production notes
- Episode 6 `Recorded` status and reconciliation-pending state

## Recommended Next Book & Episodes Action

Use the Story Map with Homer and Chuck to write one Episode 7 Live Story Draft, then separately capture the first Story Assignment decisions for where that story should live before any manuscript split or arrangement change.
