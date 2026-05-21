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
- `STUDIO_AUTH_MODE`
- `STUDIO_ALLOWED_EMAILS`
- `HGO_OWNER_EMAILS`
- `HGO_TEAM_SCHEDULER_EMAILS`
- `HGO_COACH_EMAILS`
- `HGO_COACHING_DONATION_URL`
- `HGO_COMPANY_FAMILY_SUPPORT_URL`
- `RESEND_API_KEY`
- `HGO_EMAIL_FROM`
- `HGO_SITE_URL`
- `ENABLE_EPISODES_FUMADOCS`

Notes:
- use the checked-in `.env.example` as the starting point
- current code prefers `AUTH_SECRET`
- `NEXTAUTH_SECRET` is a legacy fallback and is only read when `AUTH_SECRET` is unset
- `STUDIO_AUTH_MODE=database` uses Prisma-backed Studio identity and role
  bootstrap; `STUDIO_AUTH_MODE=allowlist` is the temporary live MVP mode that
  skips Prisma provisioning and allows only verified Google emails listed in
  `STUDIO_ALLOWED_EMAILS`
- `HGO_COACHING_DONATION_URL` enables the external pay-what-you-can contribution CTA; it is not full Stripe Checkout
- `RESEND_API_KEY`, `HGO_EMAIL_FROM`, and `HGO_SITE_URL` enable best-effort internal coaching request email notifications
- `ENABLE_EPISODES_FUMADOCS` should default to unset unless you are explicitly testing the Fumadocs-backed episodes loader
- `apps/web/src/lib/server/sms.ts` reads Twilio env vars if called, but SMS/Twilio is not wired into the active coaching request flow and those vars are not required for local development today

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

## Run The Studio App

```bash
pnpm studio
```

The Studio persistence slice uses Prisma models for private authoring data. Run
these after schema changes when your database target is a safe local
development database:

```bash
pnpm db:generate
pnpm db:push
```

Do not run `pnpm db:push` against remote Neon or production data unless that
target has been explicitly confirmed safe. The Studio seed helper only creates
development fixture rows when `DATABASE_URL` points at a local database and
`NODE_ENV` is not `production`.

The Manuscript Desk can optionally save full-draft server snapshots through
`StudioManuscriptSnapshot`. That path is explicit, not autosave. It requires a
configured Studio database and an applied schema; otherwise `/manuscript`
continues to use browser-local storage and browser-generated backup downloads.

Local snapshot enablement sequence:

1. Start a safe local Studio database.
2. Run `pnpm db:generate`.
3. Run `pnpm db:push` only against that safe local database.
4. Start Studio with `DATABASE_URL` pointing at the local database.
5. Save and load snapshots with synthetic manuscript data first.

For the full local persistence workflow and smoke test, read:

- `docs/runbooks/studio-local-persistence.md`

Fast path with local Docker Postgres:

```bash
pnpm studio:local:bootstrap
pnpm studio:local
```

## Run Studio Cut

Studio Cut is a separate Vite app for the internal multicam podcast editor
shell. It edits semantic decision events over source time. It uses
`localStorage` by default in local dev and can enable Firebase Auth plus
Firestore-ready persistence from `VITE_FIREBASE_*` env vars in
`apps/studio-cut-web/.env.local`.

```bash
pnpm studio-cut
```

Verification:

```bash
pnpm studio-cut:typecheck
pnpm studio-cut:build
```

Read `docs/studio-cut.md` before deploying or adding cloud persistence.

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
- for live-MVP style Studio auth, verify `STUDIO_AUTH_MODE=allowlist` and
  `STUDIO_ALLOWED_EMAILS`

If Prisma is broken:
- verify `DATABASE_URL`
- run `pnpm db:generate`

If episodes/content behaves oddly:
- check whether `ENABLE_EPISODES_FUMADOCS` is set
- read `docs/sessions/episodes-build-investigation-result.md`
- read `docs/sessions/episodes-loader-guard-result.md`
