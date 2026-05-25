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
```

Full runtime validation and live schema/deploy records should be appended after
the Cloud SQL schema sync and Cloud Run deploy complete.

## Next Provider Slices

Best order:

1. Google Calendar appointment sync job for existing `Appointment` rows, with
   generated calendar links preserved as fallback.
2. Stripe hosted checkout for one app-owned coaching/supporter offer and
   webhook capture into `WorldHubProviderEvent`.
3. Patreon member/tier webhook capture into `WorldHubProviderEvent` and manual
   entitlement reconciliation.
4. Merch storefront catalog import and order/fulfillment job handoff.
