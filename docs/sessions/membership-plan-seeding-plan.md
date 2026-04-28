# Membership Plan Seeding Plan

Date: 2026-04-28

Scope:
- inspect the current `MembershipPlan` schema and any existing seed/setup path
- replace the current create-only default-plan action with a deterministic upsert-based catalog sync
- add the smallest sane local seed command if warranted

Current repo facts:
- `MembershipPlan` already exists in `prisma/schema.prisma`
- the only current seed path is `seedMembershipPlansAction` in `apps/web/src/app/team/clients/actions.ts`
- that action currently seeds outdated plans:
  - `coaching-monthly`
  - `coaching-quarterly`
- there is no dedicated membership-plan seed script yet
- team membership assignment already depends on plans existing

Target catalog:
- `single-session`
  - `Single Session`
  - internal/manual-only
- `coaching-monthly-1`
  - `1 Session / Month`
  - public recurring offer
- `coaching-monthly-2`
  - `2 Sessions / Month`
  - public recurring offer

Planned implementation:
- add a canonical membership-plan catalog module
- add an upsert-based sync helper
- update the team seed action to call that sync helper
- add a small root script to run the same sync locally
- add a package script if it makes the seed path more explicit

Constraints:
- no Stripe or billing behavior
- no public checkout changes
- no appointment/scheduling refactors
- no broad team UI redesign
