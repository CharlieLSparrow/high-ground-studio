# WorldHub Now / Next / Later

Date: 2026-05-22

## Now

Create the architecture foundation and first safe seams.

- Name WorldHub as the shared infrastructure hub for High Ground, HGO,
  QuipLore, Studio, and future sites.
- Add the first provider-neutral domain package scaffold.
- Add a minimal deployable admin shell when it can live behind an existing safe
  auth boundary.
- Preserve the existing `apps/web` public/operations boundary.
- Preserve the existing `apps/studio` private creative boundary.
- Treat current coaching, membership, appointment, and dashboard workflows as
  existing `apps/web` product reality.
- Treat provider systems as future adapters, not the core model.
- Do not change Prisma schema, provider calls, provider credentials, payment
  behavior, or deployment state without a safe existing path.

Current foundation docs:

- `docs/architecture/worldhub-foundation.md`
- `docs/plans/worldhub-now-next-later.md`
- `docs/agents/worldhub-codex-brief.md`
- `docs/architecture/platform-service-boundaries.md`
- `packages/worldhub-domain`
- `/team/worldhub`

## Next

Prepare the first implementable proposal without changing production data
behavior.

- Draft a provider-neutral WorldHub domain model proposal.
- Map current repo nouns to proposed WorldHub nouns:
  - `User` -> Person/User
  - `MembershipPlan` -> Product/Offer candidate
  - `Membership` -> EntitlementGrant candidate
  - `CoachingRequest` -> coaching intake workflow input
  - `Appointment` -> CoachingSession candidate
- Identify package seams before Prisma seams, starting with
  `packages/worldhub-domain`.
- Define provider adapter interfaces without installing provider SDKs.
- Define event and webhook contracts without adding webhook routes.
- Define the entitlement model.
- Define the offer/product/price model.
- Define the embed strategy for HGO, QuipLore, and future sites.
- Define the provider connection model and failure/retry posture.
- Decide which existing `apps/web` workflows remain local to `apps/web` and
  which future workflows should call into WorldHub modules.
- Update docs before opening any schema migration.

Stripe reintroduction waits until this foundation and build/deploy stability
are confirmed. The first Stripe pass should come only after the domain model,
package seams, idempotency posture, entitlement posture, and rollback plan have
been reviewed.

## Later

Build real WorldHub capabilities after the model earns implementation.

- Central admin app or admin route set.
- Embed SDK for HGO, QuipLore, book sites, course sites, campaign sites, and
  partner surfaces.
- Stripe adapter for checkout, subscriptions, billing portal handoff, and
  payment events.
- Patreon adapter for supporter tier and pledge state.
- POD adapters for Printful, Printify, Gelato, Fourthwall, or similar vendors.
- Webhook gateway for verified provider event intake.
- Fulfillment worker for order-to-provider orchestration and retry handling.
- Provider event intake with signature verification, idempotency, replay, and
  operator-visible failures.
- Entitlement reconciliation across orders, subscriptions, manual grants, and
  provider state.
- Admin workflows for provider connections, failed jobs, refunds, supporter
  access, merch orders, and coaching packages.

Do not promote any later item ahead of the foundation just because a provider
integration looks convenient.
