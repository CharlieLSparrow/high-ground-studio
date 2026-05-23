# Agent Board

Last updated: 2026-05-23

Use this board as the async coordination surface for concurrent Codex work.
Keep entries short and current.

This board should prevent collisions, not slow down creative work. Agents can
keep moving on owned branches when paths do not overlap and protected zones are
not involved.

For a single readable progress stream, append updates to:

```text
docs/coordination/progress-thread.md
```

For reboot/crash recovery and copy/paste worker packets, use:

```text
docs/agents/restart-playbook.md
```

## Current Snapshot

Verified after `git fetch --all --prune` on 2026-05-23.

| Branch | Head | Worktree | Lane | Notes |
| --- | --- | --- | --- | --- |
| `main` | `d9c9337` | `/Users/wall-e/Dev/high-ground-studio` before this branch | Trunk / integration runway | Clean and aligned with `origin/main` when inspected. The older `b0ee6c8` dirty-main report is stale for this checkout. |
| `codex/content-studio-command-001` | based on `d9c9337` | `/Users/wall-e/Dev/high-ground-studio` | Content Studio first usable command surface | Current focused branch. No product work directly on `main`. |
| `project/worldhub` | `fb7bfaa` | `/Users/wall-e/Dev/hgs-worldhub-project` | WorldHub integration candidate | Behind current `main`; update from `main` before merging WorldHub foundation. |
| `codex/worldhub-001-foundation` | `484988d` | `/Users/wall-e/Dev/hgs-worldhub-codex` | WorldHub / Content Studio foundation | Contains useful docs/domain/route work, but is based before latest Studio collaboration commits. Do not merge blindly. |
| `codex/studio-cut-001-web-shell` | `46031ff` | `/Users/wall-e/Dev/high-ground-studio-codex-studio-cut-001` | Studio Cut / media tooling | Keep separate until media deploy/auth blockers are intentionally scheduled. |

## Active Lanes

### Integration / Release Captain

- owner: Codex in this thread until reassigned
- branch: `codex/content-studio-command-001` for this docs/product slice
- owns:
  - lane visibility
  - merge order recommendations
  - dirty worktree warnings
  - validation and rollback notes for integration points
- does not own:
  - every product decision
  - every branch commit
  - day-to-day feature velocity when file ownership is clear
- no-touch without explicit approval:
  - production DB/schema without explicit approval
  - Cloud Run, Cloud SQL, DNS, OAuth, billing, secrets, IAM, Firebase config
    without explicit approval
  - real manuscript text or real HGO content

### Studio / Content Management Studio

- owner: Codex in this thread for current slice
- branch: `codex/content-studio-command-001`
- owns for this slice:
  - `apps/studio/src/app/content-studio/*`
  - `apps/studio/src/app/studio-nav.tsx`
  - `scripts/studio-cloud-run-deploy.mjs`
  - `cloudbuild.studio.deploy.yaml`
  - Content Studio docs under `docs/architecture`, `docs/plans`, and
    `docs/project-context`
- goal:
  - create a private, local-first command surface for podcast production,
    book writing/publishing, and HGO episode-page work
- current guardrails:
  - browser-local state only
  - no Prisma writes
  - no provider calls
  - no public publishing
  - no real manuscript/content material
  - local-first is a first slice, not a promise to avoid DB/API/service work
- deploy posture:
  - deploy coherent Studio slices to the existing private Cloud Run service
    after validation
  - record live URL, smoke result, and rollback command in the progress thread

### Manuscript Collaboration

- owner: unassigned
- likely branch: `codex/studio-collab-*` or a dedicated manuscript branch
- owns:
  - `apps/studio/src/app/manuscript/collaboration-lab/*`
  - collaboration lab tests and runbooks
- current status:
  - latest collaboration work is already on `main` at `d9c9337`
  - no dirty main work observed in this checkout
- next packet:
  - continue from current `main` on a new focused branch
  - preserve synthetic-only boundaries
  - keep production `/manuscript` save/load, localStorage, snapshots, DB schema,
    and real simultaneous editing out of scope unless explicitly approved

### WorldHub / Business Infrastructure

- owner: unassigned for next integration pass
- branch: `codex/worldhub-001-foundation` and/or `project/worldhub`
- owns:
  - `packages/worldhub-domain`
  - `/team/worldhub`
  - provider-neutral business infrastructure docs
  - future offers, entitlements, merch, Patreon, coaching-package follow-through
- current warning:
  - `codex/worldhub-001-foundation` contains useful work but also diverges from
    the latest `main`; integration must preserve the current Studio
    collaboration lab state
- next packet:
  - update `project/worldhub` from current `main`
  - replay or merge WorldHub foundation intentionally
  - resolve `package.json`, `pnpm-lock.yaml`, `apps/studio`, `apps/web`, and
    top-level docs with current trunk as the baseline
  - run at least package/domain tests, Studio typecheck, web build, and
    `git diff --check` before promotion

### Studio Cut / Media Tooling

- owner: separate worktree/agent
- branch: `codex/studio-cut-001-web-shell`
- owns:
  - Studio Cut editor/media workflow
  - rescue sync and generated package tooling
- current status:
  - clean and pushed at `46031ff` when inspected
- no-touch without handoff:
  - main `apps/studio` routes
  - WorldHub provider/domain packages
  - Content Studio command surface

## File Ownership Rules

| Path | Current owner | Notes |
| --- | --- | --- |
| `apps/studio/src/app/content-studio/*` | Content Studio lane | Private browser-local command surface. |
| `apps/studio/src/app/manuscript/*` | Manuscript lane | Do not mix collaboration lab changes into Content Studio slices. |
| `apps/studio/src/app/studio-nav.tsx` | Shared Studio navigation | Declare before editing. |
| `apps/web/src/app/team/worldhub/*` | WorldHub lane | Keep provider-neutral until business model is stable. |
| `packages/*` | Shared | Coordinate package creation and lockfile changes. |
| `prisma/schema.prisma` | Protected | No schema work without explicit migration/rollback plan. |
| `apps/web/content/publish`, `_staging`, `_inbox` | Protected content | Do not use real manuscript/HGO content without explicit approval. |
| deployment/cloud config | Protected | No deploy/config mutation from coordination or prototype slices. |

## Dirty Worktree Warnings

- Do not start feature work if `git status --short --branch` shows unrelated
  dirty files.
- If dirty files belong to another lane, stop and record the collision here.
- If dirty files are yours and coherent, validate, commit, and push them before
  another lane starts from the same branch.
- The old report that `main` was dirty at `b0ee6c8` did not match this
  checkout after fetch. Current observed `main` is `d9c9337` and clean.

## Recommended Merge Order

1. Keep `main` clean; no feature work directly on `main`.
2. Land the focused Content Studio command-surface branch after validation.
3. Update `project/worldhub` from current `main`.
4. Integrate `codex/worldhub-001-foundation` into `project/worldhub` without
   deleting current Studio collaboration work.
5. Keep `codex/studio-cut-001-web-shell` separate until a media/hosting/auth
   integration pass is scheduled.
6. Promote `project/worldhub` to `main` only after broad validation and rollback
   notes are recorded.

## Broad Validation Matrix

| Scope | Commands |
| --- | --- |
| Docs-only | `git diff --check` |
| Studio route/UI | `pnpm --filter studio typecheck`, `pnpm --filter studio build`, `git diff --check` |
| Studio collaboration | `pnpm studio:collab:test`, relevant `studio:collab:*` tests, `pnpm --filter studio typecheck` |
| Web/HGO route work | `pnpm --filter web build`, `pnpm --filter web exec next build --webpack`, relevant HGO smoke/test command |
| Packages/domain helpers | package typecheck/build if available, focused node tests |
| Prisma/schema | `pnpm db:generate`; never `pnpm db:push` unless DB target is confirmed safe |
| Content publish/discovery | `node scripts/verify-published-discovery.mjs` |

## Rollback Commands

Record exact commit SHAs before merging. Typical local rollback commands:

```bash
git switch main
git revert <merge-or-feature-commit-sha>
```

For pushed feature branches that should be abandoned instead of merged:

```bash
git switch main
git branch -D <local-branch>
```

Do not use destructive reset commands unless Chuck explicitly asks for that
operation.

## Fast-Approval Zones

These are not off-limits. They require explicit scope and approval before
mutation, then the agent should keep moving.

- Production database mutation
- Prisma schema migration or `db:push`
- Cloud Run, Cloud SQL, DNS, OAuth, billing, secrets, IAM, Firebase config
- Live Stripe, Patreon, POD, merch, social, publishing, or analytics providers
- Real manuscript text or real HGO source content in tests/prototypes
- Public exposure of private Studio material
- Generated/private artifacts that should remain ignored

## Open Questions

- Should `project/worldhub` stay the single integration branch after the current
  Content Studio branch lands, or should Content Studio get a dedicated
  `project/content-studio` integration lane?
- Should the next persisted Content Studio state be browser-local only,
  Studio-manual-snapshot-backed, or a new Prisma model after the workflow is
  proven?
- Which podcast workflow matters first: show-prep packet, edit checklist,
  publish package, or episode-page projection?
