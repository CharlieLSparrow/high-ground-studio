# AGENTS.md

This repo is a real active monorepo for High Ground Studio / High Ground Odyssey.

Use this file as the top-level command deck before making changes.

## Start Here

Read these files first:
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/domain-model.md`
- `docs/runbooks/local-dev.md`
- `docs/agents/codex-handoff.md`

Recent stabilization history lives in:
- `docs/sessions/stripe-recovery-result.md`
- `docs/sessions/episodes-build-investigation-result.md`
- `docs/sessions/episodes-loader-guard-result.md`

## Repo Shape

- `apps/web`: main Next.js app
- `apps/motion-lab`: Vite playground for motion work
- `packages/motion-engine`: shared Three.js/GSAP engine package
- `prisma/schema.prisma`: canonical app data model
- `apps/web/content/publish`: current published MDX content set
- `apps/web/content/_staging`: large staging/content-prep area
- `apps/web/content/_inbox`: large raw manuscript/research inbox

## Current Product Reality

- Google/NextAuth sign-in is wired and promotes/updates app users in Prisma.
- Users support primary email, alias emails, roles, client profiles, memberships, manual coaching feature grants, and appointments.
- `/dashboard` is a working signed-in client dashboard backed by Prisma.
- `/dashboard?intent=coaching` lets signed-in users submit a coaching request.
- `/dashboard` shows recent coaching requests and converted appointment summaries.
- `/team/clients`, `/team/coaching-requests`, and `/team/appointments` are working internal operations screens backed by server actions.
- `/team/clients` can seed a manual coaching tool catalog and enable, pause, or disable client-specific coaching feature grants outside subscription tiers.
- `/dashboard` shows enabled client-visible coaching tools from manual grants.
- `/team/coaching-requests` is the internal queue for request management and request-to-appointment conversion.
- `/team/worldhub` is the internal provider readiness, provider event, cart/order, fulfillment, and calendar-sync command center.
- `/team/growth` is the internal SEO, analytics snapshot, ad slot, affiliate link, book recommendation, sponsor placement, and monetization research desk.
- `/coaching` is a public offer/front-door page and sign-in handoff, not a completed Stripe checkout flow.
- Coaching donation support is an external pay-what-you-can link via `HGO_COACHING_DONATION_URL`.
- Google Calendar event-template links remain the fallback. `/team/worldhub`
  can queue or run server-side calendar sync when dedicated
  `GOOGLE_CALENDAR_*` credentials are configured.
- New coaching request email notifications are best-effort Resend emails to active internal users with `OWNER`, `TEAM_SCHEDULER`, or `COACH`.
- SMS/Twilio notification sending is not wired into the current coaching request flow.
- Google Analytics and AdSense are runtime-gated by env values; `/ads.txt` is
  generated only when AdSense config is present.
- `/episodes/[[...slug]]` currently uses a guarded Fumadocs loader path.
- The repo currently builds under both:
  - `pnpm --filter web build`
  - `pnpm --filter web exec next build --webpack`

## Important Constraints

- Do not assume Stripe checkout is active. It was intentionally rolled back to a clean non-broken state.
- Do not remove the episodes loader guard casually. It exists because the Fumadocs collection import was implicated in earlier build instability.
- Treat the build-success state as current truth, and the earlier Turbopack/session instability as historical context documented under `docs/sessions/`.
- Treat `apps/web/src/app/schedule/page.backup.tsx`, `pnpm-workspace.yaml.save`, `prisma.config.ts.bak`, and scattered `.DS_Store` files as signs of a repo that needs careful reading before cleanup.
- The top-level docs under `docs/` are now the durable memory layer. Promote important chat/session conclusions into docs when they become stable.

## Standard Commands

Repo root:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web exec next build --webpack
pnpm motion
pnpm engine:build
pnpm db:generate
pnpm db:push
pnpm db:migrate
pnpm db:studio
```

## Expected Env Surface

Documented from source usage:
- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SECRET`
- `NEXTAUTH_SECRET`
- `HGO_OWNER_EMAILS`
- `HGO_TEAM_SCHEDULER_EMAILS`
- `HGO_COACH_EMAILS`
- `HGO_COACHING_DONATION_URL`
- `HGO_COMPANY_FAMILY_SUPPORT_URL`
- `RESEND_API_KEY`
- `HGO_EMAIL_FROM`
- `HGO_SITE_URL`
- `HGO_GA_MEASUREMENT_ID`
- `GOOGLE_ANALYTICS_PROPERTY_ID`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`
- `GOOGLE_ADSENSE_CLIENT`
- `GOOGLE_ADSENSE_ADS_TXT_ACCOUNT`
- `GOOGLE_ADSENSE_ADS_TXT_AUTHORITY`
- `GOOGLE_ADSENSE_ADS_TXT_RELATIONSHIP`
- `HGO_ADSENSE_AUTO_ADS_ENABLED`
- `AMAZON_ASSOCIATES_TAG`
- `BOOKSHOP_AFFILIATE_ID`
- `HGO_AFFILIATE_DISCLOSURE_TEXT`
- `HGO_SPONSOR_INQUIRY_URL`
- `HGO_SPONSOR_MEDIA_KIT_URL`
- `ENABLE_EPISODES_FUMADOCS`

Dormant/non-required for the current coaching flow:
- `apps/web/src/lib/server/sms.ts` still contains a Twilio REST helper, but no active coaching action imports or calls it.

Current auth-secret reality:
- the code prefers `AUTH_SECRET`
- `NEXTAUTH_SECRET` is only a fallback if `AUTH_SECRET` is unset

Checked-in setup example:
- `.env.example`

Keep `.env.example` synchronized with `docs/runbooks/local-dev.md` if env usage changes.

## Agent Working Style For This Repo

- Verify from files before asserting product state.
- Prefer narrow changes that preserve current working paths.
- For any meaningful task, leave a short durable note under `docs/` if the conclusion is likely to matter again.
- If a task touches auth, Prisma, content loading, or build behavior, update the relevant doc instead of leaving the knowledge only in chat.
