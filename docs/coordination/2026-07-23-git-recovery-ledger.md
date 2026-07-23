# High Ground Studio Git recovery ledger

Date: 2026-07-23

## Verified current state

- Repository: `/Users/wall-e/Dev/high-ground-studio`
- Active branch: `codex/quipsly-local-dogfood-20260721`
- Current recovery head: `1ae6db87b703`
- Upstream tracking branch: none
- Configured remote name: `origin`
- Active worktrees: one
- Local branches: 60
- Tracked files: 5,537
- Modified/staged paths outside the completed slices: 233
- Untracked paths: 721
- Ignored paths: 309

The Capture Xcode project currently resolves to the root repository. There is
no independent `.git` directory under
`apps/mobile-capture/HighGroundCapture`; treat it as ordinary root-repository
content unless that structure is deliberately changed later.

## Recovery branch ledger

The current branch now contains these coherent Quipsly slices:

1. `9aabba7` — author canonical tags from Capture
2. `06cf571` — preserve evolving tag vocabulary
3. `fa05e90` — merge canonical tag vocabulary safely
4. `fd2afa6` — roll back tag merges from exact receipts
5. `ac2f6d2` — review imported keywords before tagging
6. `337db0a` — prepare signed Capture build 2
7. `e294632` — carry iPhone notes into Library
8. `1ae6db8` — edit and tag captured notes

Each slice was staged by explicit path. No broad `git add`, reset, clean, or
checkout operation was used.

## Dirty-state concentration

The largest untracked groups are:

- `apps/QuipslyStudio`: 474
- `apps/quipsly`: 106
- `docs/quipsly`: 33
- `docs/coordination`: 13
- `scripts/release`: 6
- `apps/web`: 6

The largest modified groups are:

- `apps/quipsly`: 141
- `apps/QuipslyStudio`: 30
- `apps/web`: 13
- `docs/quipsly`: 7
- `docs/coordination`: 5
- `apps/local-engine`: 5

These counts are an inventory, not evidence that the files are disposable.
Most of this checkout predates the recovery branch and may contain valuable
user work.

## Safe path to a healthy repository

1. Keep shipping new work as explicit, reviewable subsystem slices.
2. Push the recovery branch only after the user chooses the remote visibility
   and branch destination; it currently has no upstream.
3. Inventory `apps/QuipslyStudio`, `apps/quipsly`, and `apps/web` separately.
   Classify each path as product source, generated output, local evidence,
   obsolete duplicate, or secret-bearing/private material.
4. Commit product source by coherent capability. Add ignore rules only for
   proven regenerated output. Move local evidence to an explicit ignored
   evidence root only after copy/hash/readback where material.
5. Reconcile the 60 local branches after comparing unique commits and active
   worktrees. Never delete a branch solely because its name looks old.
6. Once valuable state is committed or safely preserved, create a clean
   integration worktree and merge or cherry-pick reviewed slices there.

## Immediate Git gates

- Do not run `git add -A`, `git clean`, broad checkout, or reset in this
  checkout.
- Do not treat the large untracked `QuipslyStudio` set as build trash.
- Do not assume Capture is an independent nested repository.
- Before a remote push, inspect the exact commit range and choose whether this
  recovery history belongs on a private branch, a draft PR, or a new
  integration branch.
