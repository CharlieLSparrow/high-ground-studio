# Coaching Request Database Readiness Result

## Files Inspected
- `package.json`
- `prisma/schema.prisma`
- `prisma.config.ts`
- `docs/runbooks/local-dev.md`
- `docs/sessions/welcome-onboarding-result.md`
- `docs/sessions/welcome-onboarding-plan.md`

## Findings
- Prisma client is generated from `prisma/schema.prisma`.
- Root scripts already support:
  - `pnpm db:generate`
  - `pnpm db:push`
  - `pnpm db:migrate`
- The repo does **not** currently have checked-in Prisma migration files under `prisma/migrations/`.
- Existing repo documentation already acknowledges this pattern and points to `db push` as the current schema-apply workflow.
- Therefore, the coaching request schema change should be treated as a documented production database apply step, not as a newly invented migration-file workflow.

## Files Created / Updated
- `docs/deploy/database-migrations.md`
- `docs/sessions/coaching-request-database-readiness-result.md`

## Exact Recommended Commands
Local verification:

```bash
pnpm db:generate
pnpm --filter web build
```

Local schema apply when needed:

```bash
pnpm db:push
```

Production/operator apply for the CoachingRequest rollout:

```bash
pnpm db:push
```

Run that only in the environment where `DATABASE_URL` targets the production database.

## Was A Migration File Created?
No.

Reason:
- the repo does not currently maintain checked-in Prisma migrations
- creating a one-off committed migration file here would introduce a second schema workflow instead of documenting the real one already in use

## What Still Needs Manual / Operator Action
- apply the schema change to the target production database with `pnpm db:push`
- verify the `CoachingRequest` table exists after apply
- then deploy or confirm the live app is running the code that expects the new table
