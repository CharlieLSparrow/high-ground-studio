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
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_COACHING_PRICE_ID`
- `STRIPE_SUPPORTER_PRICE_ID`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `PATREON_CLIENT_ID`
- `PATREON_CLIENT_SECRET`
- `PATREON_WEBHOOK_SECRET`
- `PATREON_CAMPAIGN_ID`
- `PATREON_CREATOR_ACCESS_TOKEN`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`
- `GOOGLE_CALENDAR_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_IMPERSONATION_EMAIL`
- `GOOGLE_CALENDAR_SYNC_CLIENT_ID`
- `GOOGLE_CALENDAR_SYNC_CLIENT_SECRET`
- `GOOGLE_CALENDAR_OAUTH_CLIENT_ID`
- `GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET`
- `GOOGLE_CALENDAR_OAUTH_STATE_SECRET`
- `GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT`
- `GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE`
- `GOOGLE_CALENDAR_SEND_UPDATES`
- `HGO_GA_MEASUREMENT_ID`
- `GOOGLE_ANALYTICS_PROPERTY_ID`
- `GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON`
- `GOOGLE_ANALYTICS_REFRESH_TOKEN`
- `GOOGLE_ANALYTICS_SYNC_CLIENT_ID`
- `GOOGLE_ANALYTICS_SYNC_CLIENT_SECRET`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`
- `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN`
- `GOOGLE_SEARCH_CONSOLE_SYNC_CLIENT_ID`
- `GOOGLE_SEARCH_CONSOLE_SYNC_CLIENT_SECRET`
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
- `HGO_MERCH_PROVIDER`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_STORE_DOMAIN`
- `FOURTHWALL_API_KEY`
- `FOURTHWALL_SHOP_URL`
- `PRINTFUL_API_KEY`
- `PRINTFUL_STORE_ID`
- `PRINTIFY_API_KEY`
- `PRINTIFY_SHOP_ID`
- `GELATO_API_KEY`
- `GELATO_STORE_ID`
- `RESEND_API_KEY`
- `HGO_EMAIL_FROM`
- `RESEND_WEBHOOK_SECRET`
- `HGO_SITE_URL`
- `QUIPSLY_SESSION_INVITATION_RESEND_API_KEY`
- `QUIPSLY_SESSION_INVITATION_EMAIL_FROM`
- `QUIPSLY_RESEND_WEBHOOK_SECRET`
- `QUIPSLY_SITE_URL`
- `QUIPSLY_COACHING_FORM_AUTOMATION_SECRET`
- `ENABLE_EPISODES_FUMADOCS`
- `QUIPSLY_LOCAL_MEDIA_UPLOADS`
- `QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT`
- `QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT`

Notes:

- use the checked-in `.env.example` as the starting point
- current code prefers `AUTH_SECRET`
- `NEXTAUTH_SECRET` is a legacy fallback and is only read when `AUTH_SECRET` is unset
- `STUDIO_AUTH_MODE=database` uses Prisma-backed Studio identity and role
  bootstrap; `STUDIO_AUTH_MODE=allowlist` is the temporary live MVP mode that
  skips Prisma provisioning and allows only verified Google emails listed in
  `STUDIO_ALLOWED_EMAILS`
- `HGO_COACHING_DONATION_URL` enables the external pay-what-you-can contribution CTA; it is not full Stripe Checkout
- `/team/clients` uses `CoachingFeature` and `CoachingFeatureGrant` for the
  manual coaching tool catalog and client-specific tool access. These grants
  are independent of subscription tiers.
- `RESEND_API_KEY`, `HGO_EMAIL_FROM`, and `HGO_SITE_URL` enable best-effort internal coaching request email notifications
- Quipsly Session invitation delivery prefers
  `QUIPSLY_SESSION_INVITATION_RESEND_API_KEY` and
  `QUIPSLY_SESSION_INVITATION_EMAIL_FROM`, then falls back to the generic
  Resend settings. `QUIPSLY_SITE_URL` is the trusted public origin placed in
  invitation mail. Local acceptance may continue with the rendered copy/share
  fallback; it must not report that as real mailbox delivery.
- Resend delivery events post to `/api/webhooks/resend`. Quipsly verifies the
  raw Svix signature with `QUIPSLY_RESEND_WEBHOOK_SECRET`, persists only
  delivery metadata and a body hash, and deliberately ignores open/click
  tracking events.
- `/api/cron/coaching-form-automation` reconciles explicit pre/post-Session
  form policies. It fails closed unless
  `QUIPSLY_COACHING_FORM_AUTOMATION_SECRET` is configured and the caller sends
  that exact value as a bearer token. Use a dedicated random value; do not
  reuse auth, invitation, calendar, or provider credentials. The reconciler
  assigns immutable form versions and writes exact-once receipts only. It does
  not send email, create work, or alter recordings.
- WorldHub provider env vars are optional readiness inputs for the internal
  `/team/worldhub` command center. The app stores only env names and provider
  connection status, not secret values.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are sign-in credentials.
  Calendar sync requires separate `GOOGLE_CALENDAR_*` credentials before the
  app should create or update calendar events server-side.
- `GOOGLE_CALENDAR_SEND_UPDATES` may be `none`, `externalOnly`, or `all`; it
  defaults to `none` so early sync tests do not surprise clients with calendar
  email.
- Google Calendar live alerts fail closed until the exact Scheduler service
  account and Cloud Run audience are configured. Local provider operation uses
  a mocked Google boundary and the real loopback PostgreSQL schema:

```bash
pnpm quipsly:local:google-calendar-push-dogfood
```

- `/team/growth` uses the `WorldHubSeoBrief`, `WorldHubAnalyticsSnapshot`,
  `WorldHubMonetizationPlacement`, and `WorldHubMonetizationResearchNote`
  tables for app-owned SEO briefs, manual analytics snapshots, ad slots,
  affiliate links, sponsor placements, and monetization research notes.
- `HGO_GA_MEASUREMENT_ID` enables the Google Analytics site tag.
- `GOOGLE_ADSENSE_CLIENT` plus `HGO_ADSENSE_AUTO_ADS_ENABLED=1` enables the
  AdSense Auto ads script. `/ads.txt` is generated from
  `GOOGLE_ADSENSE_ADS_TXT_*` values when configured.
- Affiliate and sponsor env vars are readiness metadata. Public affiliate links
  should still carry visible disclosure text near the link.
- `ENABLE_EPISODES_FUMADOCS` should default to unset unless you are explicitly testing the Fumadocs-backed episodes loader
- `scripts/dev/quipsly-local-up.sh` sets
  `QUIPSLY_LOCAL_MEDIA_UPLOADS=true` for the isolated local Nest so Episode
  Room media imports do not depend on a cloud bucket. The server rejects this
  mode in production, with a non-loopback PostgreSQL database, or when
  `QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT` escapes the operating-system temporary
  directory. Keep both variables false/unset in shared, preview, and
  production environments.
- Drive/Picker dogfood keeps all six provider values in Google Secret Manager.
  After the checked installer succeeds, the non-secret project selection is
  retained in the machine-wide Quipsly lifecycle directory, so ordinary
  `pnpm quipsly:local:up` restarts retrieve the values inside the durable Nest
  and media-worker children without placing secrets in Git, the environment
  file, lifecycle metadata, or launchd's submitted environment. Use:

```bash
pnpm quipsly:drive:oauth:install -- \
  --credentials /absolute/path/to/client_secret.json \
  --dry-run
pnpm quipsly:drive:oauth:install -- \
  --credentials /absolute/path/to/client_secret.json
pnpm quipsly:local:up
```

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
