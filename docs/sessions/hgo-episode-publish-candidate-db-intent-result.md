# HGO Episode Publish Candidate DB Intent Result

Date: 2026-05-24

## Scope

Added the first durable private publish-intent slice for HGO episode pages.

This intentionally relaxes the old no-schema/no-write boundary in a narrow way:
a ready staged artifact can now become one private database row that records
publish intent.

## Result

New Prisma model:

```text
HgoEpisodePublishCandidate
```

New private operator behavior:

- `/team/hgo-publish-queue/[recordId]` now checks whether a durable publish
  intent already exists for the saved staged artifact.
- Ready packets expose an explicit `Save Publish Intent` action.
- Saving creates one private `HgoEpisodePublishCandidate` row linked to
  `HgoStagedProjectionArtifact`.
- The row stores the publish-candidate packet, review brief, draft packet,
  frontmatter, generated MDX draft, proposed route, readiness state, blocker
  counts, warning counts, and operator note.
- Re-saving the same staged artifact returns the existing candidate instead of
  duplicating it.

## Safety Boundary

Saving publish intent does not:

- create a public route
- write `apps/web/content/_staging`
- write `apps/web/content/publish`
- replace `/episodes`
- call providers
- publish a live page
- certify citation review
- certify public-safety review
- mutate the immutable staged artifact JSON
- store canonical manuscript source

This is private review persistence only.

## Files

- `prisma/schema.prisma`
- `apps/web/src/lib/hgo/publish-candidate-store-record.ts`
- `apps/web/src/lib/server/hgo-episode-publish-candidates.ts`
- `apps/web/src/app/team/hgo-publish-queue/[recordId]/actions.ts`
- `apps/web/src/app/team/hgo-publish-queue/[recordId]/page.tsx`
- `scripts/hgo-publish-candidate-packet.test.mjs`
- `docs/project-context/current-state.md`
- `docs/architecture/hgo-private-staged-artifact-store-plan.md`
- `docs/deploy/database-migrations.md`

## Validation

Passed before commit:

```bash
pnpm hgo:publish-candidate:test
pnpm db:generate
pnpm web:cloudrun:test
pnpm --filter web exec next build --webpack
git diff --check
```

## Live Schema Requirement

Deploying this code before the live web database has the new table would break
signed-in access to `/team/hgo-publish-queue/[recordId]`, because the page now
queries `HgoEpisodePublishCandidate`.

Before routing this runtime live, apply the schema with the existing one-off
Cloud Run Job pattern using an image built from this schema and
`DATABASE_URL=web-cloudsql-database-url:latest`.

Expected verification query:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'HgoEpisodePublishCandidate';
```

## Next Step

After schema sync and runtime deploy, record:

- Cloud Run Job name and execution id
- deploy commit
- web revision
- rollback revision
- smoke results
