# Main Studio Cloud Run Deploy Result

Date: 2026-05-23

## Scope

Merged the integrated Content Studio and WorldHub foundation work into `main`,
then deployed the resulting Studio runtime to Cloud Run.

## Branch And Commit

- branch: `main`
- deployed runtime commit: `c32adb2`
- merge PR: `https://github.com/CharlieLSparrow/high-ground-studio/pull/4`
- superseded PR: `https://github.com/CharlieLSparrow/high-ground-studio/pull/3`
- image: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:c32adb2`
- Cloud Build: `ce548402-cc92-47e1-9cbb-be5a83dac156`
- image digest: `sha256:bae37d870de5f44077483b39e8b9b1e71d4323c54b089f4663f1701304aee7bb`

## Deployment Result

- service: `studio`
- project: `high-ground-odyssey`
- region: `us-central1`
- previous ready revision: `studio-00024-rr5`
- new revision: `studio-00025-shp`
- traffic: `studio-00025-shp` serving 100%
- live URL: `https://studio-hm2odnvjga-uc.a.run.app`
- Cloud Run service URL: `https://studio-659427658635.us-central1.run.app`

## Verification

Before the `project/worldhub` merge to `main`:

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

Main deployment:

- `pnpm --filter studio typecheck` passed
- `pnpm studio:cloudrun:test` passed
- Cloud Build completed successfully
- Docker build pushed image digest `sha256:bae37d870de5f44077483b39e8b9b1e71d4323c54b089f4663f1701304aee7bb`

Live smoke:

- `/api/health` passed
- `/content-studio` passed

## Rollback

```bash
gcloud run services update-traffic studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=studio-00024-rr5=100
```

## Boundaries Preserved

- No Prisma schema changes.
- No `db:push`.
- No real manuscript or HGO source content.
- No public publishing.
- No live Stripe, Patreon, POD, merch, social, publishing, or analytics provider integration.
- No DNS, OAuth, IAM, billing, or secret mutation.
