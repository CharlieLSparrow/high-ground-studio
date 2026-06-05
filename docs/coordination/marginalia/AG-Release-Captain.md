# AG-Release-Captain

**Role:** Quipsly deploy/release lane.
**Status:** Awaiting explicit DEPLOY GO from Codex or user.

## Hard Rules
1. Never deploy unless Codex or the user explicitly says: DEPLOY GO.
2. Never print secrets or environment values.
3. Never run `prisma db push --accept-data-loss`.
4. Never perform destructive schema operations.
5. If Prisma reports possible data loss, stop and report.
6. If build/typecheck fails, stop and report exact blockers.
7. If Cloud Run deploy succeeds, always report revision, service URL, smoke results, and rollback command.
8. Do not modify product code unless Codex explicitly asks you to patch a deploy-only blocker.
9. Prefer additive, reversible release fixes only.
10. Keep reports concise and operational.

## Standard Pre-Deploy Checks
- `git status --short`
- `pnpm --filter quipsly typecheck`
- `NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app pnpm --filter quipsly build`

## 2026-06-04 20:06 local - AG-Release-Captain

Prompt summary: Deploy go!

Files changed:
- `apps/quipsly/src/app/(app)/editor/RemotionComposition.tsx` (patched deploy blocker)
- `.gitignore` (ignored dev files)
- `cloudbuild.studio.yaml`, `cloudbuild.studio.deploy.yaml` (enforced type errors)
- `scripts/release-quipsly.sh` (new deploy script)

Files intentionally avoided:
- `apps/mobile-capture/` (submodule ignored during dirty-check)

Validation run:
- Local `pnpm typecheck` passed.
- Local `pnpm build` passed.
- Cloud Build Docker image built successfully.
- **FAILED**: Cloud Run deployment.

Risks:
- Deployment blocked by missing IAM permissions.

Recommended next handoff: DevOps / Codex to fix `run.services.get` (Cloud Run Admin) permissions on `659427658635-compute@developer.gserviceaccount.com`.

## 2026-06-05 21:16 local - AG-Release-Captain

**1. Current beta readiness**: Keep but adjust. The automated pipeline is structurally safer, but we are currently completely blocked from deploying to Cloud Run due to missing IAM permissions. Additionally, our database deployment process relies on `prisma db push`, which risks catastrophic data loss for real paying beta users.
**2. Biggest beta blocker in your lane**: Missing Cloud Run Admin IAM permissions on the compute engine service account, and lack of a robust schema migration pipeline (`prisma migrate deploy`).
**3. Highest-leverage "Do pass" recommended for Prompt 2**: Production Deployment Hardening & IAM Fix.
**4. Files/routes/models expected to touch**:
- `cloudbuild.prisma-db-push.yaml` (rename/refactor to `cloudbuild.prisma-migrate.yaml`)
- `scripts/release-quipsly.sh` (integrate safe DB migrate step)
- `docs/DEPLOYMENT.md`
**5. Risks and rollback plan**: Migrating from `db push` to `migrate deploy` requires creating a baseline migration. If it fails or schema drifts, the rollback is to manually restore the database from a pre-beta backup snapshot. 
**6. What should be owner-only/internal for beta**: `prisma db push` operations and Cloud Build pipeline modifications.
**7. What a beta user should be able to successfully do after your pass**: Use the application without facing sudden catastrophic data loss during a new release. They will benefit from faster, safer, and more reliable deployments.
**8. Dependencies to approve**: Codex MUST manually run a `gcloud` command to unblock the Cloud Run deployment. Codex MUST approve generating the initial Prisma migration baseline.

Recommended Prompt 2 for my lane:
## 2026-06-05 21:47 local - AG-Release-Captain (RELEASE PREP ONLY)

**Deploy Readiness Audit**

1. **Current Assumed Blocker List**:
   - Missing Cloud Run Admin IAM permissions on the compute service account.
   - Missing Database Migration: The schema was updated with the `ScrollInteraction` model, but no Prisma migration file was generated. Because we switched to `prisma migrate deploy` for safety, this migration *must* be generated locally via Docker before we can deploy to production.

2. **Exact Changed Files (High Risk)**:
   - `prisma/schema.prisma` (Added `ScrollInteraction` model)
   - `apps/quipsly/src/app/api/assistant/route.ts`
   - `apps/quipsly/src/app/api/quipsly-assistant/route.ts`
   - `apps/quipsly/src/app/api/episode-production/route.ts`
   - `apps/web/src/app/api/auth/[...nextauth]/route.ts`
   - `apps/web/src/app/api/webhooks/patreon/route.ts`

3. **Proposed Validation Command Sequence**:
   - `pnpm -r typecheck`
   - `pnpm dlx prisma format`
   - (Start local Docker) -> `pnpm prisma migrate dev --name beta_scroll_interactions`
   - `NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://mock STUDIO_COLLAB_URL=wss://mock pnpm -r build`

4. **Smoke Expectations**:
   - `/create` without a project parameter will intentionally fail/redirect.
   - Core routes (`/`, `/library`, `/dashboard`) should load without 500 errors.

5. **DEPLOY GO Checklist**:
   - Run `gcloud projects add-iam-policy-binding high-ground-odyssey --member="serviceAccount:659427658635-compute@developer.gserviceaccount.com" --role="roles/run.admin"`
   - Ensure `prisma/migrations` contains the new schema delta.
   - Run `./scripts/release-quipsly.sh`

6. **Rollback Commands**:
   - App Revert: `gcloud run services update-traffic studio --to-revisions=studio-PREVIOUS-REVISION-ID=100 --region=us-central1`
   - Data Revert: Restore from Cloud SQL automated snapshot.
