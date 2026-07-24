# Repository hygiene audit — 2026-07-23

This is a preservation-first snapshot of the Quipsly / High Ground Studio
repository. It is an inventory and cleanup order, not permission to delete
branches, source files, evidence, or media.

## Current truth

- GitHub repository: `CharlieLSparrow/high-ground-studio`
- Visibility: public
- Default branch: `main`
- Open pull requests visible to the connected GitHub account: 0
- Current working branch: `codex/quipsly-local-dogfood-20260721`
- Current branch versus `origin/main`: 98 commits ahead, 0 behind
- Local `main` versus `origin/main`: 49 commits ahead, 0 behind
- Remote refs: 62 total, including 57 `codex/*` branches
- Local refs: 61
- Tracked working-tree changes at this snapshot: 232
- Untracked paths at this snapshot: 761
- Preservation ref:
  `codex/preserved-tracked-wip-20260723`

There is no nested Git repository under
`apps/mobile-capture/HighGroundCapture`; Capture is part of this monorepo.

The combination of a public repository, hundreds of unrelated working-tree
paths, and a branch already 98 commits ahead makes broad `git add`, cleanup,
or an immediate all-in pull request unsafe.

## Cleanup already completed

- Added reproducible local Nest `up`, `down`, and `doctor` commands.
- Added a read-only production recovery gate and connected it to release
  preflight.
- Removed the universal local owner override from runtime authorization.
- Added idle document autosave and an unload warning for unsaved work.
- Pushed those changes as three narrow commits on the current branch.
- Ignored `apps/QuipslyStudio/.transcript-smoke/`, removing roughly 417 MiB of
  generated PCM/WAV scratch data from untracked Git noise without deleting the
  files.

## Known unresolved artifacts

- The untracked root file `true` is approximately 1.1 MiB and contains an ASR
  transcript payload. Its provenance is not yet proven, so it must not be
  deleted or committed as-is.
- The remaining untracked paths are mostly source, tests, scripts, and
  coordination documents rather than large generated files. They need
  ownership and product-lane classification, not bulk deletion.
- The preservation ref protects tracked WIP but does not make every untracked
  file recoverable.

## Remote branches already reachable from `origin/main`

These are pruning candidates only. Confirm that no external deployment,
rollback, or human workflow still names them before deletion.

- `codex/content-studio-persistence-supervisor-001`
- `codex/manuscript-chapter-boundary-001`
- `codex/quipsly-romance-lab-001`
- `codex/team-progress-story-001`
- `codex/web-cloud-run-deploy-001`
- `codex/web-domain-mapping-001`
- `codex/worldhub-001-foundation`
- `project/worldhub`
- `repo-hygiene-checkpoint`

## Safe consolidation order

1. Keep the current branch as the active recovery and dogfood lane.
2. Classify remaining working-tree paths into Capture, Nest, Studio, HGO web,
   infrastructure, generated evidence, and unknown.
3. For each product lane, prove the visible runtime and create an explicit-path
   checkpoint before moving to the next lane.
4. Reconcile the 49 local-main commits and 98 current-branch commits into a
   deliberate integration branch; do not open a 98-commit catch-all pull
   request.
5. Open small pull requests from clean integration slices once their base diff
   is reviewable.
6. Delete merged remote branches only from the reviewed candidate list.
7. Add ignore rules only for reproducible generated outputs; never ignore
   unknown source or evidence merely to make status look clean.

## Repeatable checks

```bash
pnpm quipsly:local:doctor
pnpm quipsly:production:status
git status --short --branch
git diff --cached --check
git diff --cached
```

Every commit in this worktree should continue to use explicit paths and a
reviewed cached diff.
