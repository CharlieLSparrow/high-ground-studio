# Current State

Date: 2026-04-27

## What The Repo Is Right Now

High Ground Studio is a monorepo with:
- a primary Next.js app in `apps/web`
- a Vite motion playground in `apps/motion-lab`
- a shared motion engine package in `packages/motion-engine`
- a Prisma/Postgres data model for identity, clients, memberships, and appointments
- a large content tree spanning published MDX, staging content, and raw manuscript/research material

## What Is Real And Working

- Google sign-in is wired through NextAuth in `apps/web/src/auth.ts`.
- App users are persisted in Prisma and merged by primary/alias email in `apps/web/src/lib/server/user-identity.ts`.
- Role-aware gating exists for team/internal access in `apps/web/src/lib/authz.ts` and `apps/web/src/lib/content-access.ts`.
- `/dashboard` renders signed-in client membership and appointment data from Prisma.
- `/team/clients` supports:
  - pre-provisioning client users
  - alias email capture
  - promoting existing users to clients
  - seeding membership plans
  - granting/updating memberships
- `/team/appointments` supports:
  - creating appointments
  - updating appointments
  - marking appointments canceled/completed
- `/library` works as a curated index using hand-authored episode/reading metadata from `src/lib/site.ts` and `src/lib/reading.ts`.
- `/coaching` is a stable public front door for coaching offers and sign-in handoff.

## What Is Intentionally Not Finished

- Stripe checkout is not active.
- Stripe webhook/commercialization automation is not active.
- The floating cart UI exists in layout, but checkout is placeholder-only client code in `src/components/cart/Cart.tsx`.
- The episodes route is not on a fully settled content-loading architecture yet.

## Current Stabilization Decisions

- The earlier Stripe checkout attempt was rolled back to a non-broken state.
- The episodes route currently uses a guarded loader in `apps/web/src/lib/source.ts`.
- The Fumadocs source is only enabled when `ENABLE_EPISODES_FUMADOCS=1`.
- That guard is temporary and reversible.

## Build Reality

Verified locally in this Codex session:
- `pnpm --filter web build` passes.
- `pnpm --filter web exec next build --webpack` passes in the current environment.

Session evidence:
- `docs/sessions/episodes-loader-guard-result.md`

Interpretation:
- both production build paths are currently green
- the older Turbopack/PostCSS failure described in session notes is now historical stabilization context, not the current repo state

## Content Reality

- `apps/web/content/publish` is the current published MDX surface.
- `apps/web/content/_staging` is much larger and appears to be the working area for future content pipeline work.
- `apps/web/content/_inbox` contains raw source material and research, not just ready-to-publish content.

## Known Repo Friction

- No checked-in `.env.example`.
- The durable docs layer is new and should be kept current as repo memory evolves.
- There are backup/scratch artifacts in the repo, including:
  - `apps/web/src/app/schedule/page.backup.tsx`
  - `pnpm-workspace.yaml.save`
  - `prisma.config.ts.bak`
  - many `.DS_Store` files

These should be treated as cleanup candidates later, not as authoritative product code.
