# Quipsly local development and Git checkpoint

Date: 2026-07-23

Active branch: `codex/quipsly-local-dogfood-20260721`

Verified HEAD before this checkpoint: `762e5b4`

## What was proved in the real local app

The local Nest lane was operated at `http://127.0.0.1:3012` with PostgreSQL in
`high-ground-db` and the Firebase Auth emulator on `127.0.0.1:9099`.

- Public route, health, auth-boundary, Firebase Admin preflight, and legacy auth
  quarantine smoke passed.
- A local Firebase user signed in through the visible email/password surface.
- Work created one Home Nest task and one Home Nest goal.
- Work created the reusable `Local development` Nest tag and applied it to both
  records.
- The task was connected to the goal with the `Contributes` relationship.
- Home Nest and global Search read both records back.
- Tag search returned both records after a full page reload.
- Library Quick note created a canonical document-kernel note, saved both
  blocks, and Library plus global Search read the note body back.

These are local dogfood receipts, not production deployment, physical-iPhone,
TestFlight, or App Store proof.

## UX findings from operation

1. Work repeats the complete Nest vocabulary editor inside every task and goal
   card. With a mature vocabulary this creates hundreds of controls and makes
   scanning, keyboard navigation, and browser automation unnecessarily heavy.
   The next UX slice should use one focused tag editor opened on demand.
2. Library Quick note opens the full writing/publishing workbench. Publisher,
   compilation, distribution, and assistant surfaces compete with two simple
   note blocks. Quick note needs a calm note-first mode with advanced tools
   collapsed.
3. Editing the first block changes the visible note text but leaves the
   canonical document title as `New Note`. Library can find the block text, but
   the result heading remains generic. The note title and canonical document
   title need one explicit, reliable relationship.

## Git preservation checkpoint

The worktree contained large overlapping work across Quipsly Nest,
QuipslyStudio, scripts, docs, HGO web, local engine, and iPhone Capture.
Nothing was reset, cleaned, stashed away, or broadly staged.

`codex/preserved-tracked-wip-20260723` points to
`add27403f0047c0e7914e0a7bf26b8cfb5f47c58`. That commit captures every tracked
modification present when the checkpoint was created while leaving the active
worktree untouched.

Important boundary: a `git stash create` snapshot does not include untracked
files. Untracked files remain in the active worktree and must be reviewed and
committed in coherent explicit-path slices. The preservation ref is a rollback
aid for tracked changes, not permission to delete or sweep the untracked set.

Use:

```bash
bash scripts/dev/quipsly-local-doctor.sh
```

before a development session, and commit only the paths belonging to the
verified product slice.
