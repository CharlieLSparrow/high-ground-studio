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
