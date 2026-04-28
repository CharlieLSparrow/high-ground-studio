# Repo Analysis Workflow

Use this when a new agent needs to understand the repo before making changes.

## 1. Read Durable Context First

Start with:
- `AGENTS.md`
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/domain-model.md`
- `docs/runbooks/local-dev.md`

Then read relevant recent session notes in `docs/sessions/`.

## 2. Verify The Current Surface

Check:
- route tree under `apps/web/src/app`
- Prisma schema in `prisma/schema.prisma`
- auth wiring in `apps/web/src/auth.ts`
- current source loader state in `apps/web/src/lib/source.ts`

## 3. Verify Build And Runtime Assumptions

Run the default production build first:

```bash
pnpm --filter web build
```

Then verify the alternate builder:

```bash
pnpm --filter web exec next build --webpack
```

If either build fails, compare the failure against the relevant `docs/sessions/` notes before assuming a new regression.

## 4. Distinguish Stable Systems From Transitional Ones

Currently stable enough to build on:
- auth identity mapping
- Prisma schema core
- team client workflow
- team appointment workflow
- dashboard
- coaching front door

Currently transitional:
- episodes/Fumadocs loader path
- commercialization/Stripe

## 5. Record Findings Durably

If the analysis uncovers something likely to matter again:
- add or update a file under `docs/`
- do not leave important repo state only in chat
