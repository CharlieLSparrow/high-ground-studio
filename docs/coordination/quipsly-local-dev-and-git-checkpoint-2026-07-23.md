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

## Remote safety and live-lane continuation

The local development branch and tracked-WIP preservation branch now both have
remote safety anchors:

- `codex/quipsly-local-dogfood-20260721` tracks
  `origin/codex/quipsly-local-dogfood-20260721`.
- `codex/preserved-tracked-wip-20260723` tracks
  `origin/codex/preserved-tracked-wip-20260723`.

Before publishing those refs, the committed trees were checked for private-key,
service-account, GitHub-token, cloud-access-key, and private API-key patterns.
No private credential material was found. The checked-in Firebase web
configuration is a public client configuration, not a Firebase Admin
credential.

The local lane was then rechecked from the visible signed-in product:

- the route and auth-boundary smoke passed;
- Projects rendered the QA Home Nest and real-work Nest;
- Today rendered the local dogfood goal and its canonical tag;
- Work rendered the local dogfood task, goal, shared tag, Nest identity, and
  `Contributes` relationship;
- global Search returned the task, goal, note, and tag;
- a full browser reload returned the same four records.

At this checkpoint the Mac had only about 5.2 GiB of free local disk. Do not
create another full worktree or reinstall the monorepo until media/cache cleanup
has restored comfortable headroom. Continue using explicit-path commits on the
active branch in the meantime. Production Google Cloud billing remains
independent of this local lane and does not block local Nest development.
