# Quipsly SaaS Cleanup Handoff

Date: 2026-06-07
Owner: Codex
Scope: Professional cleanup pass after Nest/chat/project/media/fiction/marine-biology starter changes.

## Validation Run

Command:

```bash
NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app \
STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app \
pnpm --filter quipsly build
```

Result: PASS.

Notes:

- Next.js compiled successfully.
- TypeScript completed successfully.
- Static generation completed successfully for 95 routes.
- Existing warning remains: Turbopack/NFT traces too broadly through `apps/quipsly/src/app/(app)/media-pipeline/actions.ts` from `next.config.mjs`. This is not new from this pass, but should be cleaned before beta hardening.

## Cloud Run Log Sweep

Service checked: `studio` in `us-central1`.

Commands used:

```bash
gcloud run services logs read studio --region us-central1 --limit 120

gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="studio" AND resource.labels.location="us-central1" AND severity>=ERROR' --freshness=6h --limit=80

gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="studio" AND resource.labels.location="us-central1" AND httpRequest.status>=500' --freshness=6h --limit=80
```

Findings:

- Recent request logs had many healthy `200`/`304` responses.
- Bot/probe traffic hit WordPress install paths and produced expected `404`s.
- Earlier logs showed repeated `500`s on `GET /api/nest-chat?projectSlug=high-ground-odyssey-manuscript`.
- The Nest Chat failure was Prisma `P2037 TooManyConnections` against `StudioNestChatMessage.findMany()`.
- Older auth routes also showed `500`s around `/api/auth/signin`, `/api/auth/providers`, and `/api/auth/error?error=Configuration`.
- Logs also contained `The table public.OrganizationMember does not exist in the current database`, indicating schema/runtime drift still exists in at least one deployed path.

## Fixed Now

### Nest Chat database pressure hardening

File:

- `apps/quipsly/src/app/api/nest-chat/route.ts`

Changes:

- Scoped Believe GIF seed-normalization to the current project instead of all chat messages on every thread load.
- Added detection for Prisma connection-pressure errors (`P2037`, `TooManyConnections`).
- Made `GET` and `POST` chat handlers degrade gracefully with a JSON `ok: false` response instead of throwing an unhandled 500 when the database is saturated.

Why this matters:

Nest Chat is now mounted across more project routes. A non-critical chat panel must not turn into page-hostile database pressure during beta testing.

## High-Risk Bugs / Follow-Ups

1. **Database connection pressure is real.**
   Nest Chat now degrades better, but the platform likely still needs connection pooling/concurrency cleanup. If Cloud Run scales or prefetches aggressively, Prisma can still exhaust DB connections from other routes.

2. **Schema drift remains.**
   `OrganizationMember` missing in production logs means at least one deployed path expects a table that production DB does not have. Run the approved Prisma push/migration path before calling beta stable.

3. **Auth configuration 500s appeared earlier.**
   These may already be fixed by later deploy/env changes, but logs showed auth-provider errors in the 6-hour window. Re-smoke sign-in before inviting outside testers.

4. **Turbopack/NFT broad trace warning remains.**
   `media-pipeline/actions.ts` likely has dynamic fs/path behavior causing excessive tracing. This is not blocking, but it can inflate deploy artifacts and create weird serverless packaging behavior.

5. **Local build is green, deployed service is not automatically updated.**
   This pass validated local build after the patch. Deploy captain still needs to deploy this exact tree before Cloud Run reflects the Nest Chat hardening.

## Suggested Next Smoke After Deploy

1. Open `/projects` signed in.
2. Open `high-ground-odyssey-manuscript` Nest.
3. Open `/create?project=high-ground-odyssey-manuscript`.
4. Confirm Nest Chat loads or shows graceful unavailable state, not a 500.
5. Open `/nests/marine-biology-research` and `/nests/charlie-melissa-fiction-lab` as an authorized user.
6. Confirm unauthorized user does not see private Fiction Lab.
7. Check Cloud Run logs for new `httpRequest.status>=500` after smoke.

## Current Status

Build: green.
Obvious blocker fixed: Nest Chat 500 under database connection pressure.
Deploy: not performed in this cleanup pass.
