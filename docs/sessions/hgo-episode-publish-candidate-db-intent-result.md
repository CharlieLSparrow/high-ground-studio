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

Progress-story validation passed before deploy:

```bash
pnpm progress:story:test
pnpm --filter web exec next build --webpack
git diff --check
```

The deploy helper also reran:

```bash
pnpm web:cloudrun:test
pnpm --filter web exec next build --webpack
```

## Live Schema Sync

The live schema was synced before routing the runtime live, because deploying
this code before the live web database had the new table would break signed-in
access to `/team/hgo-publish-queue/[recordId]`.

Schema image:

```text
Cloud Build: 438935c4-c21c-4051-9164-2de33577e759
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:6416979
```

Schema job:

```text
job: web-cloudsql-db-push-6416979
execution: web-cloudsql-db-push-6416979-wjxmt
secret: web-cloudsql-database-url:latest
Cloud SQL attachment: high-ground-odyssey:us-central1:studio-postgres
service account: web-cloud-run@high-ground-odyssey.iam.gserviceaccount.com
result: succeeded
```

Logs reported:

```text
Your database is now in sync with your Prisma schema.
```

## Deploy

The deploy head was:

```text
6416979 docs: log HGO publish intent progress
```

Web image:

```text
Cloud Build: e42fae06-9711-4ceb-8c0d-02faaf4e4424
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:6416979
```

Live Cloud Run:

```text
service: web
revision: web-00055-b4r
traffic: 100%
service URL: https://web-hm2odnvjga-uc.a.run.app
custom domain: https://app.highgroundodyssey.com
```

Live smoke passed:

```text
https://web-hm2odnvjga-uc.a.run.app/api/health -> 200
https://web-hm2odnvjga-uc.a.run.app/ -> 200
https://web-hm2odnvjga-uc.a.run.app/projection-stage/import -> 200
https://web-hm2odnvjga-uc.a.run.app/team/progress -> 307 sign-in redirect
https://web-hm2odnvjga-uc.a.run.app/team/hgo-publish-queue -> 307 sign-in redirect
https://app.highgroundodyssey.com/api/health -> 200
https://app.highgroundodyssey.com/updates -> 200 and includes the publish-intent story
https://app.highgroundodyssey.com/team/hgo-publish-queue -> 307 sign-in redirect
https://app.highgroundodyssey.com/team/hgo-publish-queue/synthetic-record -> 307 sign-in redirect
```

## Rollback

Immediate Cloud Run rollback:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00053-2tv=100
```
