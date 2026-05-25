# WorldHub Provider Adapter Rails Result

Date: 2026-05-24

## Scope

Added the first real adapter rails on top of the WorldHub integration workspace:
verified provider event intake for Stripe and Patreon, plus operator-triggered
Google Calendar appointment sync.

This is not checkout, entitlement automation, or merch fulfillment yet. It is
the part that lets external provider activity land in app-owned audit tables and
lets coaching appointments create provider calendar events once credentials are
configured.

## Result

New webhook routes:

```text
/api/worldhub/webhooks/stripe
/api/worldhub/webhooks/patreon
```

Stripe behavior:

- reads the raw request body
- verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`
- enforces a 5-minute timestamp tolerance
- writes a `WorldHubProviderEvent` row with event type, provider event id,
  idempotency key, payload hash, and a safe payload summary
- does not create orders, mutate memberships, grant access, or store card data

Patreon behavior:

- reads the raw request body
- verifies `X-Patreon-Signature` as a hex HMAC-MD5 digest with
  `PATREON_WEBHOOK_SECRET`
- reads `X-Patreon-Event` as the event type when present
- writes a `WorldHubProviderEvent` row with event type, member/resource id,
  idempotency key, payload hash, and a safe payload summary
- does not mutate memberships, grant entitlements, or call Patreon APIs

Google Calendar behavior:

- `/team/worldhub` now has a `Sync Next Google Calendar Jobs` action.
- The action finds the next unsynced future `Appointment` rows.
- If calendar env is missing, it creates queued `WorldHubProviderSyncJob` rows
  that show what is waiting on credentials.
- If dedicated `GOOGLE_CALENDAR_*` auth is present, it requests a Google access
  token, creates or updates a Google Calendar event, writes
  `Appointment.googleEventId`, and marks the sync job completed.
- Generated Google Calendar links remain the fallback.

## Safety Boundary

This slice still does not:

- store provider secret values
- store full webhook payloads or payment-card data
- create Stripe Checkout sessions
- reconcile Stripe payment state into orders or entitlements
- reconcile Patreon member/tier state into entitlements
- call merch storefront or fulfillment providers
- automatically sync appointment create/update/cancel actions
- publish public content

## Files

- `apps/web/src/app/api/worldhub/webhooks/stripe/route.ts`
- `apps/web/src/app/api/worldhub/webhooks/patreon/route.ts`
- `apps/web/src/app/team/worldhub/actions.ts`
- `apps/web/src/app/team/worldhub/page.tsx`
- `apps/web/src/lib/server/google-calendar-sync.ts`
- `apps/web/src/lib/server/worldhub-integrations.ts`
- `apps/web/src/lib/server/worldhub-provider-events.ts`
- `apps/web/src/lib/worldhub/google-calendar-events.ts`
- `apps/web/src/lib/worldhub/provider-definitions.ts`
- `apps/web/src/lib/worldhub/webhook-signatures.ts`
- `scripts/worldhub-calendar-events.test.mjs`
- `scripts/worldhub-webhook-signatures.test.mjs`
- `scripts/worldhub-provider-definitions.test.mjs`
- `.env.example`
- `docs/runbooks/local-dev.md`
- `docs/project-context/current-state.md`
- `docs/architecture/worldhub-current-workflow-map.md`

## Validation

Passed before commit:

```bash
pnpm worldhub:integrations:test
pnpm db:generate
pnpm worldhub:domain:typecheck
pnpm web:cloudrun:test
pnpm --filter web exec next build --webpack
git diff --check
```

The deploy helper also reran:

```bash
pnpm web:cloudrun:test
pnpm --filter web exec next build --webpack
```

## Deploy

The final deployed head was:

```text
cbd4f60 fix(web): mount only ready provider secrets
```

Web image:

```text
Cloud Build: e9974815-da48-4fec-ace6-65e53d7d4a07
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:cbd4f60
```

Live Cloud Run:

```text
service: web
revision: web-00065-89q
traffic: 100%
service URL: https://web-hm2odnvjga-uc.a.run.app
custom domain: https://app.highgroundodyssey.com
```

The provider-secret-aware deploy helper reported:

```text
optional provider secrets mounted: 0
```

No optional Stripe, Patreon, Google Calendar, merch, or Resend provider secrets
exist in Secret Manager yet. After one deploy briefly tried to default
`AUTH_URL` and `HGO_SITE_URL` to the generated Cloud Run URL, the live service
was immediately corrected, and the final deploy was routed to `web-00065-89q`
with:

```text
AUTH_URL=https://app.highgroundodyssey.com
HGO_SITE_URL=https://app.highgroundodyssey.com
```

Live smoke passed:

```text
https://web-hm2odnvjga-uc.a.run.app/api/health -> 200
https://web-hm2odnvjga-uc.a.run.app/ -> 200
https://web-hm2odnvjga-uc.a.run.app/projection-stage/import -> 200
https://web-hm2odnvjga-uc.a.run.app/team/progress -> 307 sign-in redirect
https://web-hm2odnvjga-uc.a.run.app/team/hgo-publish-queue -> 307 sign-in redirect
https://app.highgroundodyssey.com/api/health -> 200
https://app.highgroundodyssey.com/updates -> 200 and includes "WorldHub gets provider rails"
https://app.highgroundodyssey.com/team/worldhub -> 307 sign-in redirect
https://app.highgroundodyssey.com/api/auth/signin -> 200 and callback cookie uses https://app.highgroundodyssey.com
https://app.highgroundodyssey.com/api/worldhub/webhooks/stripe unsigned POST -> 503 until STRIPE_WEBHOOK_SECRET is mounted
https://app.highgroundodyssey.com/api/worldhub/webhooks/patreon unsigned POST -> 503 until PATREON_WEBHOOK_SECRET is mounted
```

Immediate Cloud Run rollback:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00062-bcw=100
```

## Operator Notes

Provider setup URLs for the live app:

```text
Stripe webhook: https://app.highgroundodyssey.com/api/worldhub/webhooks/stripe
Patreon webhook: https://app.highgroundodyssey.com/api/worldhub/webhooks/patreon
```

Google Calendar sync requires:

```text
GOOGLE_CALENDAR_ID
GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON
```

or:

```text
GOOGLE_CALENDAR_ID
GOOGLE_CALENDAR_REFRESH_TOKEN
GOOGLE_CALENDAR_SYNC_CLIENT_ID
GOOGLE_CALENDAR_SYNC_CLIENT_SECRET
```

`GOOGLE_CALENDAR_SEND_UPDATES` defaults to `none`. Use `externalOnly` or `all`
only when you intentionally want Google to email attendees.

The Cloud Run deploy helper now mounts optional WorldHub provider secrets when
the matching Secret Manager secret exists and has an enabled version. That keeps
provider admin work explicit while avoiding manual Cloud Run env drift on future
deploys.

## Next Provider Slices

Best order:

1. Add automatic Google Calendar sync enqueue from appointment create/update,
   cancel, and completion.
2. Add Stripe Checkout for one app-owned coaching/supporter offer.
3. Reconcile verified Stripe checkout/payment events into `WorldHubOrder`.
4. Reconcile Patreon member/tier events into a manual entitlement review lane.
5. Add merch catalog import, then order/fulfillment handoff.
