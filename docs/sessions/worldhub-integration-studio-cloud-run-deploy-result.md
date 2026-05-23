# WorldHub Integration Studio Cloud Run Deploy Result

Date: 2026-05-23

## Scope

Deployed the integrated `project/worldhub` branch after merging current `main`, the deployed Content Studio command surface, and the WorldHub foundation branch.

## Branch And Commit

- branch: `project/worldhub`
- deployed runtime commit: `beb86b7`
- image: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:beb86b7`
- Cloud Build: `521c9b31-1d49-4522-9e2d-88559b987e42`
- image digest: `sha256:e987a509e97122e5567244b1217b454b3197f59921fd4e2cd6bc626fce3931c8`

## Deployment Result

- service: `studio`
- project: `high-ground-odyssey`
- region: `us-central1`
- previous ready revision: `studio-00023-7c5`
- new revision: `studio-00024-rr5`
- traffic: `studio-00024-rr5` serving 100%
- live URL: `https://studio-hm2odnvjga-uc.a.run.app`

## Verification

Before deployment:

- `git diff --check` passed
- `pnpm install --frozen-lockfile` passed
- `pnpm content-studio:domain:typecheck` passed
- `pnpm worldhub:domain:typecheck` passed
- `pnpm content-studio:domain:build` passed
- `pnpm worldhub:domain:build` passed
- `pnpm --filter studio typecheck` passed
- `pnpm --filter studio build` passed
- `pnpm studio:cloudrun:test` passed
- `pnpm web:cloudrun:test` passed
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web build` passed
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack` passed with known Fumadocs cache warnings
- `pnpm studio:collab:agentic-smoke` passed

Cloud Build:

- `pnpm --filter studio build` passed inside Docker
- built and pushed image digest: `sha256:e987a509e97122e5567244b1217b454b3197f59921fd4e2cd6bc626fce3931c8`

Live smoke:

- `/api/health` passed
- `/content-studio` passed

## Rollback

```bash
gcloud run services update-traffic studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=studio-00023-7c5=100
```

## Boundaries Preserved

- No Prisma schema changes.
- No `db:push`.
- No real manuscript or HGO source content.
- No public publishing.
- No live Stripe, Patreon, POD, merch, social, publishing, or analytics provider integration.
- No DNS, OAuth, IAM, billing, or secret mutation.
