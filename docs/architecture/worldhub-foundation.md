# WorldHub Foundation

Date: 2026-05-22

## Purpose

WorldHub is the future central infrastructure hub for the High Ground, High
Ground Odyssey, QuipLore, Studio, and related site ecosystem.

This document is the first durable architecture foundation. It does not define
or require a new repo, microservice, Prisma model, payment flow, webhook route,
or provider integration. Its job is to name the boundary before implementation
pressure turns provider-specific needs into the core model.

WorldHub should eventually coordinate:

- coaching management
- subscriptions and memberships
- merchandise selling
- print-on-demand fulfillment integrations
- Patreon and supporter integrations
- entitlements and access control
- customer, order, and payment records
- provider connections and event intake
- embeddable widgets for public sites
- central admin workflows

## Relationship To Existing Apps And Sites

### `apps/web`

`apps/web` remains the public and operations-facing app.

Today it owns High Ground Odyssey public surfaces, `/coaching`, `/dashboard`,
`/team/*`, public episode/library routes, and the active coaching request,
membership, appointment, and support workflows.

WorldHub should not replace those routes in an early pass. It should first give
future work a shared domain language so coaching, memberships, offers,
entitlements, orders, and provider events can be modeled consistently when the
repo is ready.

### `apps/studio`

`apps/studio` remains the private creative operating system.

Studio owns private drafting, source material, semantic tagging, manuscript
workflows, and projection preparation. WorldHub may eventually grant access to
Studio surfaces or coordinate admin operations around Studio users, but it
should not own private Studio drafts, source tables, or authoring state.

### High Ground Odyssey

High Ground Odyssey is one public site surface that may consume WorldHub-backed
offers, memberships, access decisions, embeds, and supporter state later.

HGO content and projection safety remain separate concerns. WorldHub can answer
who has access to what; it should not become the raw content or publishing
approval system.

### QuipLore

QuipLore is a future public site surface that may need quote-entry access,
supporter gates, merchandise links, embeds, and shared customer identity.

WorldHub should make those cross-site operations possible without forcing
QuipLore to inherit HGO route structure or private Studio authoring tables.

### Future Sites

Future book, course, workshop, campaign, and event sites should be able to use
the same identity, offer, entitlement, provider, and embed concepts without
becoming new one-off commerce systems.

WorldHub is the shared infrastructure boundary. Each site remains responsible
for its public experience and content rendering.

## Broader Than Commerce

WorldHub is not just a commerce layer.

Commerce is one use case: products, prices, orders, subscriptions, payments,
refunds, and fulfillment. The broader platform need is coordination:

- which person is known across the ecosystem
- which site or embed is presenting an offer
- which access rights exist
- who currently has those rights
- which provider accounts are connected
- which provider events have been received
- which admin workflow needs human review
- which coaching session, package, order, or membership changed state

That means Stripe, Patreon, Shopify, Printful, Printify, Gelato, Fourthwall,
and similar systems must be treated as provider adapters, not as the core
domain. WorldHub's internal language should survive provider changes.

## Modular Monolith First

WorldHub should begin as modular monorepo architecture, not a new repository or
fleet of microservices.

Reasons:

- the current repo already holds the working identity, coaching, membership,
  appointment, public web, and private Studio boundaries
- the early risk is domain confusion, not runtime scale
- package seams can be reviewed, tested, and changed before service contracts
  harden
- provider adapters can stay isolated without creating distributed failure
  modes before the core model is stable
- Prisma schema changes should follow a reviewed domain proposal, not lead it

The first implementation seam is the pure domain package scaffold at
`packages/worldhub-domain`. It should stay provider-neutral and dependency-light
until the domain model earns database and runtime behavior.

The current `apps/web` coaching, membership, and appointment workflows are
mapped to these nouns in
`docs/architecture/worldhub-current-workflow-map.md`. Treat that map as a
read-only bridge before proposing Prisma changes or workflow migration.

## Future Extractable Service Boundaries

These boundaries may eventually earn separate runtime identities. They should
start as internal modules or packages until security, scaling, ownership, or
operational pressure justifies extraction.

### Admin Operations

Central staff workflows for people, sites, offers, orders, subscriptions,
entitlements, provider status, fulfillment jobs, and coaching operations.

### Provider Event Intake

Webhook and event ingestion for external systems. This boundary verifies
provider events, stores idempotency state, and translates provider-specific
payloads into internal actions.

### Entitlements And Access

Access decisions for memberships, supporter tiers, course access, site gates,
Studio access, and embeds. This boundary should answer access questions without
knowing how a provider names its plans.

### Commerce And Subscriptions

Provider-neutral product, price, order, payment, subscription, refund, and
billing reconciliation workflows.

### Fulfillment

Merchandise and POD job orchestration. This boundary should translate internal
orders into provider-specific production requests only after the order and
entitlement model is stable.

### Embed Delivery

Versioned public widgets that can appear on HGO, QuipLore, book sites, course
sites, or partner surfaces. Embeds should be consumers of WorldHub state, not
the source of record.

### Worker Jobs

Background reconciliation, provider sync, fulfillment polling, email receipts,
retry queues, and periodic audits.

## Core Domain Nouns

These nouns are the first shared language. They are not a Prisma schema yet.

### Person / User

The canonical human known to the ecosystem. Existing `User` records in the repo
already represent the current app identity center. A future WorldHub model
should preserve the separation between a person and provider-specific accounts.

### Site

A public or private surface in the ecosystem, such as High Ground Odyssey,
QuipLore, Studio, a book site, a course site, or a campaign site.

### Embed

A versioned widget or integration surface that can be placed on a site. Examples
could include offer cards, supporter gates, checkout handoffs, coaching request
entry points, or entitlement-aware calls to action.

### Offer

The audience-facing proposition. An offer packages a product, coaching package,
supporter tier, membership, bundle, or campaign in language suitable for a site
or embed.

### Product

The durable thing being sold, granted, fulfilled, or subscribed to. Products
should stay provider-neutral and should not be named after Stripe products,
Patreon tiers, or POD catalog entries.

### Price

The purchasable terms for a product or offer: amount, currency, cadence,
trial/intro terms, or pay-what-you-can posture. External provider price IDs are
adapter mappings, not the core identity.

### Order

A customer's purchase or requested purchase. Orders may later connect to
payments, fulfillment jobs, refunds, and entitlement grants.

### Subscription

A recurring relationship that may be backed by a provider but should be
understood internally as a lifecycle: active, paused, canceled, past due,
expired, or otherwise reconciled.

### Entitlement

An access right the platform can reason about, such as member content,
coaching-package access, course access, QuipLore supporter access, or Studio
operator access.

### EntitlementGrant

The assignment of an entitlement to a person, account, order, subscription,
manual admin action, or provider event. Grants need source, timing, status, and
audit posture.

### ProviderConnection

The account-level connection to an external system. Examples include a Stripe
account, Patreon campaign, Shopify store, Fourthwall shop, Printful account,
Printify shop, or Gelato account.

### ProviderEvent

A received external event or webhook payload, stored with provider identity,
event identity, verification status, idempotency key, received time, and
processing state.

### FulfillmentJob

An internal job that coordinates physical or digital fulfillment. It should
track intent, provider handoff state, retries, failures, and completion without
making any POD vendor the core model.

### CoachingProgram

A named coaching line of work, such as a general coaching offer, cohort, course,
or specialty program.

### CoachingPackage

A purchasable or grantable package within a coaching program. It may define
session counts, duration, cadence, price options, and entitlement behavior.

### CoachingSession

A scheduled or completed coaching interaction. Existing appointments and
coaching request conversion already cover part of this lifecycle in `apps/web`;
WorldHub should model the broader package/session relationship only after the
domain proposal is reviewed.

## Event And Webhook Posture

WorldHub should eventually receive provider events, but the early foundation is
not a webhook implementation.

Future event rules:

- provider events are append-only inputs, not trusted domain truth by default
- each provider event needs signature verification where the provider supports
  it
- each provider event needs idempotency handling before it can affect orders,
  subscriptions, entitlements, or fulfillment jobs
- provider payloads should be stored or referenced for audit, then translated
  into provider-neutral internal actions
- access changes should be reconcilable from internal state, not only from the
  latest webhook
- failed event processing should be visible to admins and retryable

Do not add webhook routes until the domain model and provider adapter boundary
are stable.

## Vendor Adapter Posture

Vendor adapters sit at the edge.

The core WorldHub model should not import vendor SDKs, use provider-specific
status names as its own lifecycle, or require one provider to be present for
local development.

Future adapters may include:

- Stripe for checkout, subscriptions, billing portal, and payment events
- Patreon for supporter tier and pledge state
- Shopify or Fourthwall for storefront/order channels
- Printful, Printify, or Gelato for POD fulfillment
- Resend or other email tools for receipts and admin notifications

Adapter rules:

- provider IDs live in mapping records or adapter state
- provider credentials stay outside core domain objects
- provider failures should be observable and retryable
- provider-specific payloads should not leak into app/page components
- replacing one provider should not require renaming the core domain

## What Not To Build Yet

Do not build these in the foundation pass:

- Stripe Checkout
- a Stripe dependency
- Stripe webhook routes
- Patreon API calls
- POD vendor API calls
- Shopify, Printful, Printify, Gelato, or Fourthwall integrations
- Prisma schema changes
- production workflow behavior changes
- a new repository
- a microservice split
- a full WorldHub admin app beyond the internal sample-data shell
- an embed SDK
- a fulfillment worker
- background provider sync
- provider credential storage
- migration of existing coaching or membership workflows

The next safe step is a domain model proposal and package seam plan that can be
reviewed before any database or runtime behavior changes.
