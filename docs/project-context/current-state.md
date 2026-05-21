# Current State

Date: 2026-05-07

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
- `/dashboard` renders signed-in client membership, appointment, recent coaching request, and converted appointment data from Prisma.
- `/dashboard?intent=coaching` renders the signed-in coaching request form and posts to `submitCoachingRequestAction`.
- `/dashboard` shows recent coaching request status, assigned coach when present, converted appointment summaries, Google Calendar add links for converted appointments, and a pay-what-you-can contribution CTA when `HGO_COACHING_DONATION_URL` and appointment data are present.
- `/team/clients` supports:
  - pre-provisioning client users
  - alias email capture
  - promoting existing users to clients
  - seeding membership plans
  - granting/updating memberships
- `/team/coaching-requests` supports:
  - viewing the 50 most recent coaching requests
  - status counts for `NEW`, `CONTACTED`, `SCHEDULED`, `CLOSED`, and `DECLINED`
  - assigning a coach and saving internal notes
  - marking requests contacted, closed, or declined
  - converting eligible requests into appointments
- `/team/appointments` supports:
  - creating appointments
  - updating appointments
  - marking appointments canceled/completed
  - generated Google Calendar event-template links
  - a visible donation-link configured/missing indicator
- `/library` works as a curated index using hand-authored episode/reading metadata from `src/lib/site.ts` and `src/lib/reading.ts`.
- `/coaching` is a stable public front door for coaching offers and sign-in handoff.
- New coaching requests create/confirm the client role and client profile, store a `CoachingRequest`, and attempt a best-effort internal Resend email notification after the database transaction commits.
- Coaching request email notifications go to active users with `OWNER`, `TEAM_SCHEDULER`, or `COACH` roles and do not block the user success redirect if email fails.
- The internal Learning to Lead Story Map can save database-backed Live Story Drafts attached to Story Candidates and Homer source blocks. These drafts are live app state, not canonical manuscript truth.
- The private Studio `/manuscript` desk can save and load manual server snapshots through Cloud SQL-backed `StudioManuscriptSnapshot` rows. The browser-local draft remains the active working copy; server snapshots are cross-device checkpoints, not autosave, collaboration, or canonical manuscript truth.

## Current Coaching Workflow

- `/coaching` is the public coaching front door. Its `Book a Session` calls to action send signed-in users to `/dashboard?intent=coaching` and anonymous users through sign-in with that dashboard intent as the callback.
- `/dashboard?intent=coaching` is the active signed-in intake surface. The form captures preferred contact method, optional phone, optional note, and an SMS consent notice if the user selects text follow-up.
- Submitting a coaching request writes Prisma state first, then attempts internal email notification. The primary user path succeeds even if the email attempt returns a structured failure.
- `/dashboard` shows the latest coaching request plus recent older requests. Converted requests show appointment summaries and Google Calendar links.
- `/team/coaching-requests` is the internal request queue and appointment conversion screen. Conversion creates an `Appointment`, marks the request `SCHEDULED`, assigns the coach, links `convertedAppointmentId`, appends internal scheduling notes, and revalidates `/team/coaching-requests`, `/team/appointments`, and `/dashboard`.
- `/team/appointments` remains the general internal appointment scheduling and editing screen. It can create appointments directly or manage appointments produced from coaching request conversion.
- Donation support is currently an external pay-what-you-can link controlled by `HGO_COACHING_DONATION_URL`.
- Google Calendar support is link-generation only through `buildGoogleCalendarEventUrl()`. No Google Calendar OAuth, API event creation, event update, or cancellation sync exists.
- SMS/Twilio sending is not wired into the current coaching request flow. A server-only Twilio helper exists, but there are no active call sites from coaching actions.

## What Is Intentionally Not Finished

- Stripe checkout is not active.
- Stripe webhook/commercialization automation is not active.
- Full Stripe Checkout is not active for coaching. The current donation path is an external link, typically a Stripe Payment Link, not app-owned checkout/session/webhook state.
- The floating cart UI exists in layout, but checkout is placeholder-only client code in `src/components/cart/Cart.tsx`.
- The episodes route is not on a fully settled content-loading architecture yet.
- SMS/Twilio notification delivery is not active.
- Google Calendar API/OAuth synchronization is not active.
- Email notification delivery has no retry queue or persisted delivery status.
- Story Draft promotion into real `ManuscriptBlock` truth is not active.
- Story Draft revision history is not active.
- Studio Manuscript autosave is not active.
- Studio Manuscript simultaneous editing / Yjs collaboration is not active.

## Current Stabilization Decisions

- The earlier Stripe checkout attempt was rolled back to a non-broken state.
- The episodes route currently uses a guarded loader in `apps/web/src/lib/source.ts`.
- The Fumadocs source is only enabled when `ENABLE_EPISODES_FUMADOCS=1`.
- That guard is temporary and reversible.

## Build Reality

Recently verified in local Codex sessions:
- `pnpm --filter web build` passes.
- `pnpm --filter web exec next build --webpack` passes in the current environment.
- `pnpm --filter web exec tsc --noEmit` passed during the 2026-05-07 coaching current-state sync.
- `pnpm --filter web exec next build --webpack` passed during the 2026-05-07 coaching current-state sync.

Session evidence:
- `docs/sessions/episodes-loader-guard-result.md`

Interpretation:
- both production build paths are currently green
- the older Turbopack/PostCSS failure described in session notes is now historical stabilization context, not the current repo state

## Content Reality

- `apps/web/content/publish` is the current published MDX surface and the only content directory explicitly wired into `apps/web/source.config.ts`.
- `apps/web/content/_staging` is a structured working/staging area and is not currently consumed directly by the live app code.
- `apps/web/content/_inbox` contains raw source material and research, not just ready-to-publish content, and is not part of the live content source path.
- `/library` and other curated discovery surfaces currently depend on hand-maintained metadata in `src/lib/site.ts` and `src/lib/reading.ts`, not dynamic enumeration of the content tree.

## Known Repo Friction

- The durable docs layer is new and should be kept current as repo memory evolves.
- Published MDX page source and curated discovery metadata are split across different files and must currently be kept aligned by convention.
- There are backup/scratch artifacts in the repo, including:
  - `apps/web/src/app/schedule/page.backup.tsx`
  - `pnpm-workspace.yaml.save`
  - `prisma.config.ts.bak`
  - many `.DS_Store` files

These should be treated as cleanup candidates later, not as authoritative product code.
