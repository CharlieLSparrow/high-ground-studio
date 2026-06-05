# Quipsly Support And Patreon Plan

Date: 2026-06-04

Purpose: keep the money path visible while preventing provider lock-in or unsafe entitlement drift.

## First pass

Use an external support link.

The assistant sidebar may show a temporary support CTA, but it should not create memberships, mutate billing state, or depend on Patreon API calls.

Configure the link with:

- `NEXT_PUBLIC_PATREON_URL`

If the env var is missing, the CTA can fall back to Patreon generally or stay informational.

## App-owned truth

Patreon should not become the source of truth for Quipsly access.

The app should own:

- user identity
- organization membership
- app roles
- project access
- membership plans
- membership grants
- subscription or entitlement status

Provider events can inform those records, but should not replace them.

## Existing useful rails

The Prisma schema already has app-owned business primitives:

- `MembershipPlan`
- `Membership`
- `Organization`
- `OrganizationMember`
- `SubscriptionPlan`
- `Subscription`

Existing WorldHub docs also define a provider-event inbox pattern for Patreon and Stripe. Quipsly should reuse that pattern instead of building a one-off Patreon shortcut inside the editor.

## Implementation-Ready Provider-Event Plan

This plan details how Patreon webhook events will be ingested and reconciled to app-owned entitlement records, following the "Patreon informs, App owns" core rule.

### 1. Webhook Ingestion & Verification
- **Endpoint:** Expose a secure endpoint (e.g., `POST /api/webhooks/patreon`).
- **Signature Verification:** All incoming requests MUST be verified using the `X-Patreon-Signature` header against the `PATREON_WEBHOOK_SECRET`. Unverified requests are rejected with a `401 Unauthorized` or `400 Bad Request`.
- **Event Inbox:** Verified payloads are immediately stored in an existing provider-event inbox table (as referenced in WorldHub docs) as raw JSON with a status of `pending`. This decouples ingestion from processing and provides an audit trail without modifying access directly.

### 2. Relevant Patreon Webhook Events (API v2)
We will configure our app in the Patreon Developer Portal to subscribe to the following core membership triggers:
- `members:create`: A new supporter pledges.
- `members:update`: A supporter changes their pledge tier or payment status.
- `members:delete`: A supporter cancels their pledge.

### 3. Event Processing & Reconciliation
A background worker or synchronous processor will consume the pending events from the inbox:
- **Identity Matching:** Match the payload against our app's `User` records. 
  - **Member ID:** `data.id`
  - **Email:** `data.attributes.email` (or via the `included` array by matching `data.relationships.user.data.id`).
- **Status & Tier Mapping:** 
  - **Status:** Read `data.attributes.patron_status` (expecting `"active_patron"`, `"declined_patron"`, or `"former_patron"`).
  - **Tiers:** Extract tier IDs from `data.relationships.currently_entitled_tiers.data` and match them in the `included` array (`type == "tier"`) to find `amount_cents` and `title`.
- **Pending Entitlement Reconciliation:** 
  - On `members:create` / `members:update`: Create or update a pending provider reconciliation record that says what app-owned membership or entitlement should probably change, and store the Patreon Member ID as a provider reference.
  - On `members:delete`: Create or update a pending reconciliation record that says the corresponding app-owned membership or entitlement should probably be canceled, revoked, or expired.
  - A later reviewed worker or admin action can apply those pending changes to `Membership`, `Subscription`, or entitlement records.
- **Idempotency:** Each webhook event should be processed with idempotency. We must ensure events processed out of order don't overwrite newer state (e.g., ignoring a `create` event if we've already processed a later `update` for that user).

### 4. No Direct Billing Mutation
Patreon handles all billing, upgrades, and downgrades. Our system is strictly a read-only consumer of webhooks to update internal entitlement state. We do not implement any upgrade/downgrade/cancel mutation calls to the Patreon API.

## Boundary rule

Supporter status can unlock product access only after a reviewed app-owned entitlement explains why access exists.

No route should ask Patreon directly, "Can this person open this project?"

Routes should ask Quipsly's own authorization layer.
