# Local Dev

## Prerequisites

- Node and pnpm installed
- Postgres database available to Prisma
- Google OAuth credentials for NextAuth

Repo uses:
- pnpm workspaces
- Prisma 7
- Next.js App Router
- Tailwind v4 via PostCSS

## Expected Env Vars

Derived from source usage:

- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SECRET`
- `NEXTAUTH_SECRET`
- `HGO_OWNER_EMAILS`
- `HGO_TEAM_SCHEDULER_EMAILS`
- `HGO_COACH_EMAILS`
- `ENABLE_EPISODES_FUMADOCS`

Notes:
- use the checked-in `.env.example` as the starting point
- current code prefers `AUTH_SECRET`
- `NEXTAUTH_SECRET` is a legacy fallback and is only read when `AUTH_SECRET` is unset
- `ENABLE_EPISODES_FUMADOCS` should default to unset unless you are explicitly testing the Fumadocs-backed episodes loader

## Install

From repo root:

```bash
pnpm install
```

## Database Setup

From repo root:

```bash
pnpm db:generate
pnpm db:push
```

If using migrations instead of direct push:

```bash
pnpm db:migrate
```

Open Prisma Studio:

```bash
pnpm db:studio
```

## Run The Web App

```bash
pnpm --filter web dev
```

or:

```bash
pnpm web
```

## Run The Motion Playground

```bash
pnpm motion
```

That builds `packages/motion-engine` and starts `apps/motion-lab`.

## Build Verification

Default production build:

```bash
pnpm --filter web build
```

Webpack verification:

```bash
pnpm --filter web exec next build --webpack
```

Current state:
- both commands pass in the current repo state
- use the default build first for normal verification
- use the webpack build as a second confirmation path when investigating build-tool-specific behavior

Historical note:
- earlier session notes captured a temporary Turbopack/PostCSS worker failure during the episodes-loader stabilization pass
- keep those notes as historical context, not as the current default assumption

If you need the alternate builder explicitly:

```bash
pnpm --filter web exec next build --webpack
```

## Content Verification

Published/discovery alignment check from repo root:

```bash
node scripts/verify-published-discovery.mjs
```

What it checks:
- canonical published episode pages in `apps/web/content/publish`
- canonical published reading pages in `apps/web/content/publish/book`
- discovery hrefs in `apps/web/src/lib/site.ts`
- discovery hrefs in `apps/web/src/lib/reading.ts`

What it reports:
- published pages missing discovery entries
- discovery hrefs missing published pages
- pairingId mismatches
- additional published files that are outside the current canonical comparison set

Use it when changing:
- `content/publish`
- `src/lib/site.ts`
- `src/lib/reading.ts`

## High-Signal Files For Setup Problems

- `apps/web/src/auth.ts`
- `apps/web/src/lib/prisma.ts`
- `apps/web/src/lib/server/user-identity.ts`
- `prisma/schema.prisma`
- `apps/web/source.config.ts`
- `apps/web/src/lib/source.ts`

## Common First Checks

If auth is broken:
- verify Google OAuth env vars
- verify `AUTH_SECRET` / `NEXTAUTH_SECRET`

If Prisma is broken:
- verify `DATABASE_URL`
- run `pnpm db:generate`

If episodes/content behaves oddly:
- check whether `ENABLE_EPISODES_FUMADOCS` is set
- read `docs/sessions/episodes-build-investigation-result.md`
- read `docs/sessions/episodes-loader-guard-result.md`
