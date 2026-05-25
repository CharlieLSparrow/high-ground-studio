# Coaching Weekly Commitments Result

Date: 2026-05-25

## Scope

Implemented the first real client coaching tool data loop for the existing
manual coaching feature grant system. The slice is intentionally limited to
Weekly Commitments and does not touch Content Studio persistence, HGO publish
pipeline paths, provider calls, public publishing, secrets, cloud config, or
production database migration commands.

## What Changed

- Added a Prisma-backed `WeeklyCommitment` record with one client owner,
  one week/date key, one to three commitment fields, client support/progress
  notes, review status, coach notes, reviewer, and review timestamp.
- Added grant-gated client write behavior for the existing
  `weekly_commitments` coaching feature. Clients can save entries only when
  they have an enabled, client-visible, non-expired grant.
- Added a dashboard Weekly Commitments card that appears only for clients with
  that enabled grant.
- Added `/team/coaching-tools` for staff review of submitted weekly
  commitments, including active/reviewed/archived counts and coach notes.
- Added focused parser/date tests for the Weekly Commitments form contract.

## Validation

This pass ran:

```bash
pnpm db:generate                                                    # passed
pnpm coaching:weekly-commitments:test                          # passed, 5 tests
pnpm coaching:features:test                                         # passed, 2 tests
pnpm --filter web exec next build --webpack                         # passed
```

`pnpm --filter web build` was attempted twice. Both attempts stayed in
Turbopack's "Creating an optimized production build ..." phase for a long
silent interval and exited with status 143 without app diagnostics. The
webpack build completed successfully after the same code changes.

`pnpm db:push` and `pnpm db:migrate` were deliberately not run in this slice.

## Rollout

1. Apply the Prisma schema to the target database through the normal reviewed
   database rollout path.
2. Run `pnpm db:generate` in the deployment/build environment.
3. In `/team/clients`, sync the coaching tool catalog if needed.
4. Grant Weekly Commitments to a client as `enabled` and `client_and_coach`.
5. Confirm the client sees the dashboard card, saves an entry, and the team can
   review it at `/team/coaching-tools`.

## Rollback

Disable or pause the Weekly Commitments grant for affected clients from
`/team/clients` to hide the client-facing tool immediately. A code rollback can
remove the dashboard card and `/team/coaching-tools` route without affecting
the older coaching request, appointment, membership, or manual grant rails.
Database rollback should preserve submitted rows unless the team explicitly
decides to drop the new `WeeklyCommitment` table after export/review.

## Remaining Risks

- The new table requires an applied schema before the dashboard/team pages can
  query `weeklyCommitments` in an environment using the new code.
- The first slice uses one entry per client/date key, not a richer habit or task
  ledger. That is deliberate for the first durable loop.
- Session Prep remains a follow-up slice; this pass makes Weekly Commitments
  complete first.
