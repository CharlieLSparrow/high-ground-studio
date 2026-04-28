# Membership Plan Seeding Result

Date: 2026-04-28

What changed:
- added a canonical membership-plan catalog at `apps/web/src/lib/server/membership-plan-catalog.js`
- updated `seedMembershipPlansAction` in `apps/web/src/app/team/clients/actions.ts` to use upsert-based sync instead of create-only seeding
- updated the team clients plans panel copy in `apps/web/src/app/team/clients/page.tsx`
- added a local seed script at `scripts/seed-membership-plans.mjs`
- added a root package script:
  - `pnpm db:seed:membership-plans`

Current seeded catalog:
- `single-session`
  - `Single Session`
  - internal/manual-only
- `coaching-monthly-1`
  - `1 Session / Month`
  - public recurring offer
- `coaching-monthly-2`
  - `2 Sessions / Month`
  - public recurring offer

Behavior change:
- the internal team seed action now syncs the current catalog deterministically
- existing plans with those slugs are updated in place
- missing plans with those slugs are created
- the old monthly/quarterly assumptions are no longer the default seed target

What was intentionally not changed:
- no Stripe or billing logic
- no public checkout behavior
- no appointment or scheduling behavior
- no broader team workflow refactor

Verification:
- `pnpm --filter web build` passed
- `pnpm --filter web exec next build --webpack` passed
- `node --check scripts/seed-membership-plans.mjs` passed
- `node --check apps/web/src/lib/server/membership-plan-catalog.js` passed

Local command to run the seed:
- `pnpm db:seed:membership-plans`

Note:
- this pass did not execute the seed against the local database, to avoid mutating live local data during repo cleanup work
