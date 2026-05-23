# Content Studio Cloud Run Deploy Result

Date: 2026-05-23

## Scope

Deployed the private Studio `/content-studio` command surface and the
one-command Studio Cloud Run deploy helper.

## Branch And Commit

- branch: `codex/content-studio-command-001`
- deployed commit: `0e17203`
- image:
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:0e17203`
- Cloud Build:
  `7489e73c-b4d2-4ea7-b4f6-519507df3483`

## Deployment Result

- service: `studio`
- project: `high-ground-odyssey`
- region: `us-central1`
- previous ready revision: `studio-00022-fdg`
- new revision: `studio-00023-7c5`
- traffic: `studio-00023-7c5` serving 100%
- live URL: `https://studio-hm2odnvjga-uc.a.run.app`

## Verification

Before deployment:

- `pnpm --filter studio typecheck` passed
- `pnpm studio:cloudrun:test` passed
- `node --check scripts/studio-cloud-run-deploy.mjs` passed
- `git diff --check` passed

Cloud Build:

- `pnpm --filter studio build` passed inside Docker
- built and pushed image digest:
  `sha256:99111255a353481306e885c99dec9ea7bb6cf7ecd63c997104cd961a681cd3c7`

Live smoke:

- `/api/health` passed
- `/content-studio` passed

## Rollback

```bash
gcloud run services update-traffic studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=studio-00022-fdg=100
```

## Boundaries Preserved

- No Prisma schema changes.
- No `db:push`.
- No real manuscript or HGO source content.
- No public publishing.
- No provider integration.
- No DNS, OAuth, IAM, billing, or secret mutation.
