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
- `/team/coaching-requests`
  - internal coaching request queue and request-to-appointment conversion surface
- `/team/*`
  - internal team console for clients, coaching requests, and appointments
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
- `src/app/team/coaching-requests/page.tsx`
- `src/app/team/coaching-requests/actions.ts`
- `src/app/team/appointments/page.tsx`
- `src/app/team/appointments/actions.ts`

This is currently a pragmatic internal-ops architecture:
- direct Prisma reads in page loaders
- form posts to server actions
- redirects with `success`/`error` query params
- `revalidatePath()` after mutations

It is simple, explicit, and easy for agents to trace.

## Coaching Workflow Architecture

The current coaching workflow is Prisma-backed and intentionally lightweight:
- `/coaching` is the public front door and sign-in handoff, not a checkout route.
- `/dashboard?intent=coaching` is the signed-in request form.
- `submitCoachingRequestAction()` creates/updates the client role/profile, creates a `CoachingRequest`, sends a best-effort internal Resend email after the transaction commits, revalidates team/dashboard routes, and redirects to the dashboard or public requested state.
- `/dashboard` shows the latest coaching request, recent request history, assigned coach, converted appointment summaries, generated Google Calendar links, and donation CTAs when configured.
- `/team/coaching-requests` is the internal queue for request status changes, coach assignment, internal notes, and conversion into appointments.
- `convertCoachingRequestToAppointmentAction()` creates an `Appointment`, marks the request `SCHEDULED`, assigns the coach, links `convertedAppointmentId`, and revalidates `/team/coaching-requests`, `/team/appointments`, and `/dashboard`.
- `/team/appointments` remains the general appointment creation/editing queue.

External integration posture:
- Donation/payment is an external pay-what-you-can link via `HGO_COACHING_DONATION_URL`.
- Google Calendar is event-template URL generation only.
- Resend email is wired for new internal coaching request notifications.
- SMS/Twilio is not called by the active coaching workflow.
- Full Stripe Checkout is not active.

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
