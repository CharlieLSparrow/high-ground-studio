# System Overview

## Monorepo Layout

- `apps/web`
  - Next.js App Router application
  - primary product surface
  - owns auth, Prisma-backed workflows, content UI, and public pages
- `apps/motion-lab`
  - Vite-based local playground
  - used to develop and preview motion scenes against the shared engine
- `packages/motion-engine`
  - reusable motion/scene engine
  - shared by motion-lab and potentially web-facing motion features later
- `prisma`
  - shared Prisma schema/config for app data

## Web App Structure

Main route areas in `apps/web/src/app`:
- `/`
  - hero, featured episode, episode feed
- `/library`
  - curated library index from local metadata arrays
- `/episodes/[[...slug]]`
  - dynamic content route
  - currently guarded around Fumadocs source loading
- `/coaching`
  - public offer/front-door page
- `/dashboard`
  - signed-in client dashboard
- `/team/*`
  - internal team console for clients and appointments
- `/api/auth/[...nextauth]`
  - NextAuth route handlers

## Data And Auth Flow

1. User signs in with Google through NextAuth.
2. `ensureAppUserFromGoogle()` resolves the user by primary email or alias email.
3. Bootstrap roles can be granted from env-driven email lists.
4. JWT/session callbacks attach app-specific identity fields:
   - `id`
   - `primaryEmail`
   - `roles`
   - `isStaff`
   - newsletter/announcement flags
5. App pages and server actions gate access from those roles and session fields.

## Team Workflow Architecture

Team workflows are server-rendered pages plus server actions:
- `src/app/team/clients/page.tsx`
- `src/app/team/clients/actions.ts`
- `src/app/team/appointments/page.tsx`
- `src/app/team/appointments/actions.ts`

This is currently a pragmatic internal-ops architecture:
- direct Prisma reads in page loaders
- form posts to server actions
- redirects with `success`/`error` query params
- `revalidatePath()` after mutations

It is simple, explicit, and easy for agents to trace.

## Content Architecture

There are currently two parallel content layers:

1. Stable metadata-driven discovery layer
- `src/lib/site.ts`
- `src/lib/reading.ts`
- used by `/library`, home feed/card components, and curated navigation

2. Guarded MDX/Fumadocs page-rendering layer
- `src/app/episodes/[[...slug]]/page.tsx`
- `src/lib/source.ts`
- `source.config.ts`
- `content/publish`

Current state:
- the route still exists
- the Fumadocs source import is guarded
- the published MDX set is small compared with `_staging` and `_inbox`

## Styling And Client Runtime

- Tailwind v4 via `@tailwindcss/postcss`
- app-wide CSS entry: `src/app/globals.css`
- session state via `SessionProvider`
- client cart state via a small localStorage-backed context

The cart is currently incidental and not part of the stabilized coaching flow.

## Motion Stack

- `packages/motion-engine` contains reusable scene/entity code
- `apps/motion-lab` is the active local test surface
- root script `pnpm motion` builds the engine and opens motion-lab

This is a separate subsystem from the Prisma/auth/coaching stack.
