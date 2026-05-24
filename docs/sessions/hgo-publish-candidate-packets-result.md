# HGO Publish Candidate Packets Result

Date: 2026-05-24

## Result

HGO saved staged artifacts now produce private episode-page publish-candidate
packets on `/team/hgo-staged-artifacts`.

The packet kind is:

```text
hgo-episode-publish-candidate-v1
```

It contains:

- source staged artifact record id, artifact id, artifact hash, and projection id
- proposed `/episodes/...` route
- current projection lifecycle/visibility
- blockers
- warnings
- required human review actions
- safety flags proving no public publish side effects
- rollback notes

## Safety Boundary

Generating the packet does not:

- create public route files
- mutate the database
- call providers
- certify public-safety review
- change the immutable staged artifact JSON
- publish or replace `/episodes`

This is a private handoff artifact only.

## Files

- `apps/web/src/lib/hgo/publish-candidate-packet.ts`
- `apps/web/src/app/team/hgo-staged-artifacts/page.tsx`
- `scripts/hgo-publish-candidate-packet.test.mjs`
- `apps/web/content/internal/progress-story.json`
- `docs/architecture/hgo-private-staged-artifact-store-plan.md`
- `package.json`

## Validation

Passed before merge:

```bash
pnpm hgo:publish-candidate:test
pnpm hgo:artifact:test
pnpm hgo:store-lab:test
pnpm web:cloudrun:test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack
git diff --check HEAD
```

## Merge And Deploy

```text
PR: #22
merge commit: aaf3568
Cloud Build: a47a0bcb-4388-4d3d-9ea9-99676036ac9d
web revision: web-00038-jxl
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:aaf3568
live URL: https://web-hm2odnvjga-uc.a.run.app
```

Live smoke passed:

```text
/api/health
/
/projection-stage/import
/team/progress unauthenticated redirect
```

`pnpm web:db:target:report` confirms the live web revision still mounts
`DATABASE_URL` from `web-cloudsql-database-url`.

## Rollback

Immediate Cloud Run rollback:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00036-rl9=100
```
