# System Overview

## Monorepo Layout

- `apps/web`
  - Next.js App Router application
  - primary product surface
  - owns auth, Prisma-backed workflows, content UI, and public pages
- `apps/studio`
  - private Next.js Studio app
  - owns protected creative workflows, manuscript tooling, structure mode,
    writing/research surfaces, and the Content Management Studio spine
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
- `/team/growth`
  - internal SEO, analytics, ads, affiliate, and sponsor planning desk
- `/team/worldhub`
  - internal provider readiness, provider events, scheduling sync, cart/order,
    and fulfillment command center
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
- `/dashboard` shows the latest coaching request, recent request history, assigned coach, converted appointment summaries, manual client-visible coaching tools, generated Google Calendar links, and donation CTAs when configured.
- `/team/clients` can seed the coaching tool catalog and manually enable, pause, or disable specific coaching features for one client without changing subscription tiers.
- `/team/coaching-requests` is the internal queue for request status changes, coach assignment, internal notes, and conversion into appointments.
- `convertCoachingRequestToAppointmentAction()` creates an `Appointment`, marks the request `SCHEDULED`, assigns the coach, links `convertedAppointmentId`, and revalidates `/team/coaching-requests`, `/team/appointments`, and `/dashboard`.
- `/team/appointments` remains the general appointment creation/editing queue.

External integration posture:
- Donation/payment is an external pay-what-you-can link via `HGO_COACHING_DONATION_URL`.
- Google Calendar event-template links remain a fallback, and `/team/worldhub`
  can queue or run server-side calendar sync when dedicated
  `GOOGLE_CALENDAR_*` credentials are configured.
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

## Growth And Monetization Architecture

WorldHub Growth is an app-owned first slice for search, analytics, and
monetization work:

- `/team/growth` stores SEO briefs, analytics snapshots, monetization
  placements, and monetization research notes in Prisma.
- Google Analytics, Search Console, AdSense, affiliate, and sponsor providers
  are represented as provider readiness records before provider API sync is
  enabled.
- The root layout can load the Google Analytics tag when
  `HGO_GA_MEASUREMENT_ID` is present.
- The root layout can load AdSense Auto ads only when
  `GOOGLE_ADSENSE_CLIENT` and `HGO_ADSENSE_AUTO_ADS_ENABLED=1` are present.
- `/ads.txt` is generated from configured AdSense env values.
- Affiliate and sponsor placements stay private/reviewable before any public
  content page uses them.
- Research notes store source URLs, takeaways, risks, next actions, and
  confidence levels so options like Patreon, Stripe, podcast subscriptions,
  book affiliates, direct sponsorships, AdSense, Search Console, and merch can
  be compared before public activation.

## Motion Stack

- `packages/motion-engine` contains reusable scene/entity code
- `apps/motion-lab` is the active local test surface
- root script `pnpm motion` builds the engine and opens motion-lab

This is a separate subsystem from the Prisma/auth/coaching stack.

## Studio Product Direction

The Content Management Studio direction is documented in:

- `docs/architecture/content-management-studio.md`
- `docs/plans/content-studio-now-next-later.md`

The first runtime marker is the private Studio route `/content-studio`. It is a
static internal command surface for the broader creative operating system:
books, speeches, podcast/video production, travel video, social schedules,
analytics, SEO, marketing, Quipsly-assisted research, and WorldHub
follow-through. It does not persist data, call providers, publish content, or
expose private manuscript material.
