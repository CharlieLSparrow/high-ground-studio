# Progress Thread

Append short updates here so the project has one readable async thread across
agents and worktrees. Keep updates concrete: branch, action, files touched,
checks, blockers, and next handoff.

## 2026-05-23

### Codex / `codex/content-studio-command-001`

- Verified `main` is clean at `d9c9337` after fetch; the older dirty-main
  report at `b0ee6c8` is stale for this checkout.
- Created `codex/content-studio-command-001` from current `main` to avoid
  feature work directly on trunk.
- Adopted the existing board idea from `codex/worldhub-001-foundation` instead
  of creating a separate coordination system.
- Current slice: lightweight coordination docs plus a private, browser-local
  Content Studio command surface for podcast, book, and episode-page work.
- Guardrails for this slice: no Prisma/schema changes, no provider calls, no
  deploy, no real manuscript/HGO content, no public publishing.
- Coordination adjustment from Chuck: DB/API/deploy/service work should be
  treated as fast-approval work, not avoided. If it is the right smallest move,
  ask for the specific approval and proceed.
- Validation so far: `pnpm --filter studio typecheck` passed; sandboxed
  `pnpm --filter studio build` hit the known Turbopack port-bind restriction,
  rerun outside the sandbox and passed; `git diff --check` passed.
- Added `docs/agents/restart-playbook.md` so reboot/crash recovery has a
  one-minute captain prompt, one progress thread, and worker packets for
  Manuscript Collaboration, WorldHub Integration, Studio Cut, and Content
  Studio.
- Chuck updated deployment posture: prefer live Google Cloud deploys over local
  only, with fast approval and rollback. Added one-command Studio Cloud Run
  deploy helper and Cloud Build deploy config; live deploy is waiting on gcloud
  reauthentication.
- gcloud reauthenticated as `charlie@highgroundodyssey.com`.
- Deployed Studio image `studio:0e17203` to Cloud Run revision
  `studio-00023-7c5`, serving 100% traffic.
- Live URL: `https://studio-hm2odnvjga-uc.a.run.app`
- Smokes passed:
  - `https://studio-hm2odnvjga-uc.a.run.app/api/health`
  - `https://studio-hm2odnvjga-uc.a.run.app/content-studio`
- Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00022-fdg=100`
- Opened merge PR: `https://github.com/CharlieLSparrow/high-ground-studio/pull/3`
- Worktree check: `project/worldhub` and `codex/worldhub-001-foundation` are
  clean; Studio Cut has a dirty local edit in
  `tools/studio-cut-local/studio_cut_local.py`, so treat that lane as occupied.
- Added `docs/agents/codex-continuity.md` as a durable north-star and handoff
  note before closing this terminal.

### Codex / project/worldhub

- Merged current `main` into `project/worldhub`.
- Merged deployed Content Studio branch `codex/content-studio-command-001`.
- Merged WorldHub foundation branch `codex/worldhub-001-foundation` and resolved conflicts by preserving the deployed browser-local Content Studio board while folding in `packages/content-studio-domain`, `packages/worldhub-domain`, WorldHub docs, and Web Cloud Run deployment scaffolding.
- Validation passed: `git diff --check`, `pnpm install --frozen-lockfile`, `pnpm content-studio:domain:typecheck`, `pnpm worldhub:domain:typecheck`, `pnpm content-studio:domain:build`, `pnpm worldhub:domain:build`, `pnpm --filter studio typecheck`, `pnpm --filter studio build`, `pnpm studio:cloudrun:test`, `pnpm web:cloudrun:test`, `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web build`, `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`, and `pnpm studio:collab:agentic-smoke`.
- Web builds used a dummy local `DATABASE_URL` only for build-time env; no database mutation was run.

### Codex / project/worldhub deploy

- Deployed integrated `project/worldhub` runtime commit `beb86b7` to Studio Cloud Run.
- Cloud Build: `521c9b31-1d49-4522-9e2d-88559b987e42`.
- Image: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:beb86b7`.
- Image digest: `sha256:e987a509e97122e5567244b1217b454b3197f59921fd4e2cd6bc626fce3931c8`.
- New revision: `studio-00024-rr5`, serving 100% traffic.
- Live URL: `https://studio-hm2odnvjga-uc.a.run.app`.
- Smokes passed: `/api/health` and `/content-studio`.
- Rollback: `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00023-7c5=100`.

### Codex / main merge and deploy

- Merged PR #4, `project/worldhub` into `main`.
- Superseded and closed PR #3 because its Content Studio slice is included in PR #4.
- Main merge commit: `c32adb2` (`feat: integrate Content Studio and WorldHub foundation`).
- Primary checkout `/Users/wall-e/Dev/high-ground-studio` is now on `main` at `c32adb2`.
- Deployed main runtime commit `c32adb2` to Studio Cloud Run.
- Cloud Build: `ce548402-cc92-47e1-9cbb-be5a83dac156`.
- Image: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:c32adb2`.
- Image digest: `sha256:bae37d870de5f44077483b39e8b9b1e71d4323c54b089f4663f1701304aee7bb`.
- New revision: `studio-00025-shp`, serving 100% traffic.
- Live URL: `https://studio-hm2odnvjga-uc.a.run.app`.
- Smokes passed: `/api/health` and `/content-studio`.
- Rollback: `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00024-rr5=100`.
- Deployment changed Studio runtime only; no DB/schema, provider, DNS, OAuth, IAM, billing, or secret mutation was performed.

### Codex / closed-agent handoff sync

- Chuck closed all terminals except the video/Studio Cut agent.
- The closed Content Studio terminal pushed docs-only continuity commit `bfa9dc0`
  to `codex/content-studio-command-001` after PR #4 had already merged.
- Cherry-picked the continuity note into `main` instead of merging the stale
  feature branch.
- Preserved current `main` deploy history and added `docs/agents/codex-continuity.md`
  to the first-five-minutes handoff list.

### Codex / `codex/team-progress-story-001`

- Added a team-only web route at `/team/progress` for a readable internal
  progress story.
- Added checked-in story data at `apps/web/content/internal/progress-story.json`
  so the page can render in the web standalone container without `.git` or repo
  docs at runtime.
- Added the Progress link to the existing Team Console navigation.
- Validation passed: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`, `pnpm web:cloudrun:test`, `pnpm web:cloudrun:preflight`, and `git diff --check`.
- Default `pnpm --filter web build` was attempted, hit the known Turbopack
  optimized-build hang, and was stopped; webpack remains the documented passing
  web build path.
- Web Cloud Run preflight has no blocked repo items, but first live web deploy
  still needs cloud setup or confirmation of the current HighGroundOdyssey.com
  hosting target.

### Codex / `codex/web-cloud-run-deploy-001`

- Added `pnpm web:cloudrun:seed-secrets` and `pnpm web:cloudrun:deploy`.
- Seeded web Secret Manager versions from local env files without printing
  values.
- Ensured the web runtime service account can read web secrets and granted it
  `roles/cloudsql.client`.
- Created Cloud Run service `web`, attached Cloud SQL
  `high-ground-odyssey:us-central1:studio-postgres`, and deployed image
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:742690e`.
- Cloud Build: `dd3c4756-ea24-443c-8906-ac3b6726c4eb`.
- Latest ready revision after env update: `web-00002-vjt`, serving 100%.
- Live URL: `https://web-hm2odnvjga-uc.a.run.app`.
- Smokes passed after applying the same disabled invoker-IAM-check setting used
  by Studio: `/api/health`, `/`, and `/team/progress` unauthenticated redirect.
- DNS and Google OAuth callback mutation are still pending.
