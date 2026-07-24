# Git Recovery Plan — 2026-07-21

## Snapshot

- Recovery branch: `codex/quipsly-local-dogfood-20260721`
- Starting commit: `22aa7a1`
- Starting relationship to `origin/main`: 49 commits ahead, 0 behind
- Dirty worktree at audit: about 1,100 changed paths across Quipsly Nest,
  iPhone Capture, QuipslyStudio, production media tooling, schema, scripts, and
  documentation
- Quipsly web subtree at audit: 614 tracked paths, 256 untracked paths, and 339
  changed paths

These changes represent multiple valuable workstreams. They must not be folded
into one mystery commit, reset, or cleaned as generated debris without review.

## Recovery rules

1. Keep `main` out of new work until the recovery branch is reviewable.
2. Do not use destructive reset, checkout, clean, or broad restore commands.
3. Stage explicit paths only; inspect every staged diff before committing.
4. Preserve source media and generated proof artifacts until their provenance
   and intended storage are known.
5. Separate product code, schema/migrations, tests, runbooks, and production
   evidence when they can be reviewed independently.
6. A commit may depend on an earlier recovery commit, but it must state that
   dependency and remain runnable at the point it lands.
7. Do not push or rewrite the remote branch history until the local sequence has
   passed tests and received an explicit publication decision.

## Proposed commit sequence

1. Local Nest development harness and repeatable smoke proof.
2. Replayable Prisma baseline and additive schema foundation for every later
   Quipsly slice.
3. Firebase identity and account-recovery cutover.
4. Canonical Nest work system: Today, Inbox, Work, goals, recurrence, tags, and
   search, including migrations and focused tests.
5. Notes, sources, annotations, research, and Studio handoff.
6. Coaching Session lifecycle, transcription, correction, packets, and calendar
   integration.
7. iPhone Capture product and App Store/TestFlight release surfaces.
8. QuipslyStudio editor and media-vault changes.
9. Episode 4 production tools and evidence, split from reusable product code.
10. Deployment and release runbooks after the code they describe.

Each slice should end with its focused automated checks plus a visible app or
artifact readback. After the sequence is coherent, compare it with
`origin/main`, decide whether to merge, rebase, or open pull requests, and only
then publish it.
