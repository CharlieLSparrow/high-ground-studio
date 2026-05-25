# WorldHub Provider Integration Workspace Result

Date: 2026-05-24

## Scope

Added the first app-owned integration workspace for revenue, supporter,
scheduling, cart, and merch infrastructure.

This is intentionally provider-ready without being provider-reckless. It gives
WorldHub durable records for connections, events, sync jobs, carts, orders, and
fulfillment before any Stripe, Patreon, Google Calendar, or merch provider call
is allowed to mutate app state.

## Result

New Prisma models:

```text
WorldHubProviderConnection
WorldHubProviderEvent
WorldHubProviderSyncJob
WorldHubCatalogItem
WorldHubOffer
WorldHubCart
WorldHubOrder
WorldHubFulfillmentJob
```

New team behavior:

- `/team/worldhub` is now a dynamic integration command center.
- The page shows provider readiness for:
  - Stripe
  - Patreon
  - Google Calendar
  - merch storefront
  - merch fulfillment
  - Resend
  - app-owned cart
- The `Initialize / Refresh Integrations` action upserts provider connection
  rows and records which expected env names are configured or missing.
- The page shows counts for active memberships, future appointments, unsynced
  future appointments, catalog items, offers, open carts, open orders, queued
  fulfillment jobs, queued sync jobs, and received provider events.

## Safety Boundary

This slice does not:

- store provider secret values
- store payment card data
- call Stripe
- call Patreon
- call Google Calendar
- call Shopify, Fourthwall, Printful, Printify, or Gelato
- create checkout sessions
- receive or process webhooks
- create, update, or cancel calendar events
- send merch fulfillment orders
- replace current coaching, appointment, membership, or dashboard workflows

The app now has places to record those operations when the adapters are added.

## Files

- `prisma/schema.prisma`
- `apps/web/src/app/team/worldhub/page.tsx`
- `apps/web/src/app/team/worldhub/actions.ts`
- `apps/web/src/lib/worldhub/provider-definitions.ts`
- `apps/web/src/lib/server/worldhub-integrations.ts`
- `scripts/worldhub-provider-definitions.test.mjs`
- `package.json`
- `.env.example`
- `docs/runbooks/local-dev.md`
- `docs/project-context/current-state.md`
- `docs/architecture/worldhub-current-workflow-map.md`
- `docs/deploy/database-migrations.md`

## Validation

Passed before commit:

```bash
pnpm worldhub:integrations:test
pnpm db:generate
pnpm web:cloudrun:test
pnpm --filter web exec next build --webpack
pnpm worldhub:domain:typecheck
git diff --check
```

Progress story validation passed:

```bash
pnpm progress:story:test
pnpm --filter web exec next build --webpack
git diff --check
```

The deploy helper also reran:

```bash
pnpm web:cloudrun:test
pnpm --filter web exec next build --webpack
```

## Live Schema Sync

Schema image:

```text
Cloud Build: ce91a3d8-7492-499b-818e-9a30f56a6f24
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:2d165a8
```

Schema job:

```text
job: web-cloudsql-db-push-2d165a8
execution: web-cloudsql-db-push-2d165a8-8zbxl
secret: web-cloudsql-database-url:latest
Cloud SQL attachment: high-ground-odyssey:us-central1:studio-postgres
service account: web-cloud-run@high-ground-odyssey.iam.gserviceaccount.com
result: succeeded
```

Logs reported:

```text
Your database is now in sync with your Prisma schema.
```

## Deploy

The deploy head was:

```text
2d165a8 docs: log WorldHub integration workspace
```

Web image:

```text
Cloud Build: fead82d5-7407-4b8e-a0f6-95733e809863
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:2d165a8
```

Live Cloud Run:

```text
service: web
revision: web-00057-tww
traffic: 100%
service URL: https://web-hm2odnvjga-uc.a.run.app
custom domain: https://app.highgroundodyssey.com
```

Live smoke passed:

```text
https://web-hm2odnvjga-uc.a.run.app/api/health -> 200
https://web-hm2odnvjga-uc.a.run.app/ -> 200
https://web-hm2odnvjga-uc.a.run.app/projection-stage/import -> 200
https://web-hm2odnvjga-uc.a.run.app/team/progress -> 307 sign-in redirect
https://web-hm2odnvjga-uc.a.run.app/team/hgo-publish-queue -> 307 sign-in redirect
https://app.highgroundodyssey.com/api/health -> 200
https://app.highgroundodyssey.com/updates -> 200 and includes the WorldHub integration story
https://app.highgroundodyssey.com/team/worldhub -> 307 sign-in redirect
```

## Rollback

Immediate Cloud Run rollback:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00055-b4r=100
```

## Next Provider Slices

Best order:

1. Google Calendar appointment sync job for existing `Appointment` rows, with
   generated calendar links preserved as fallback.
2. Stripe hosted checkout for one app-owned coaching/supporter offer and
   webhook capture into `WorldHubProviderEvent`.
3. Patreon member/tier webhook capture into `WorldHubProviderEvent` and manual
   entitlement reconciliation.
4. Merch storefront catalog import and order/fulfillment job handoff.
