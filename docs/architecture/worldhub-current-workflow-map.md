# WorldHub Current Workflow Map

Date: 2026-05-23

## Purpose

This document maps the real `apps/web` coaching, client, membership, and
appointment workflows to future WorldHub nouns.

It is not a migration plan, Prisma schema proposal, or instruction to move
runtime behavior. The current workflows are working product reality and should
stay in place until WorldHub has a reviewed package, data, deploy, and rollback
path.

## Current Source Of Truth

Current runtime state still lives in:

- `prisma/schema.prisma`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/coaching/actions.ts`
- `apps/web/src/app/team/clients/page.tsx`
- `apps/web/src/app/team/clients/actions.ts`
- `apps/web/src/app/team/coaching-requests/page.tsx`
- `apps/web/src/app/team/coaching-requests/actions.ts`
- `apps/web/src/app/team/appointments/page.tsx`
- `apps/web/src/app/team/appointments/actions.ts`

WorldHub should first describe and wrap these concepts. It should not replace
them in an early pass.

## Mapping Table

| Current repo concept | Current meaning | Future WorldHub noun |
| --- | --- | --- |
| `User` | App identity, Google-auth-backed person, role holder, client/coach anchor | `Person/User` |
| `UserEmail` | Alternate email for the same human identity | Person contact identity / alias |
| `UserRole` | Staff/client authorization badge | `EntitlementGrant` candidate only when roles need scoped grants, expiry, or audit |
| `ClientProfile` | Client-specific extension of a user | Person profile / customer profile candidate |
| `MembershipPlan` | Internal catalog of assignable plans | `Product`, `Offer`, and `Price` candidate |
| `Membership` | User-to-plan grant with status and dates | `EntitlementGrant` candidate |
| `CoachingRequest` | Signed-in intake request and internal queue item | Coaching intake input, not a `CoachingSession` yet |
| `Appointment` | Scheduled client/coach time block | `CoachingSession` candidate |
| `HGO_COACHING_DONATION_URL` | External pay-what-you-can support link | External offer/payment handoff, not a WorldHub order |
| Google Calendar template links | User-facing calendar convenience URL | Future calendar provider adapter candidate |
| Resend coaching notification | Best-effort internal notification after DB write | Future provider event/job candidate only if retries/audit become needed |

## Coaching Lifecycle Today

The current coaching lifecycle is:

```text
/coaching -> sign in -> /dashboard?intent=coaching -> CoachingRequest
  -> /team/coaching-requests review
  -> optional coach assignment / internal notes
  -> convert to Appointment
  -> dashboard and team appointment views
```

Conversion behavior currently:

- verifies the actor has team appointment permissions
- verifies the chosen coach has the `COACH` role
- rejects already-converted, closed, or declined requests
- creates an `Appointment`
- marks the `CoachingRequest` as `SCHEDULED`
- records `assignedCoachUserId`
- records `convertedAppointmentId`
- appends internal scheduling notes
- revalidates `/team/coaching-requests`, `/team/appointments`, and
  `/dashboard`

Future WorldHub should preserve that shape. The future `CoachingSession` model
should not erase the existing distinction between intake request and scheduled
session.

## Membership Lifecycle Today

The current membership lifecycle is internal and manual:

```text
MembershipPlan -> Membership -> dashboard display / team management
```

Important current reality:

- `MembershipPlan` is not a Stripe product.
- `Membership` is not provider-reconciled subscription state.
- Team users grant or update memberships manually.
- The dashboard reads active membership state directly.

Future WorldHub can treat this as the seed of:

- provider-neutral `Product`
- audience-facing `Offer`
- provider-neutral `Price`
- `Entitlement`
- `EntitlementGrant`

Do not wire Stripe or subscription automation until this mapping is reviewed
against real admin workflows.

## Person / User Boundary

`User` is already the closest thing to a platform person record.

WorldHub should not introduce a second human identity center casually. The
likely path is:

1. Keep `User` as current source of truth.
2. Add provider-neutral WorldHub package helpers around person/user concepts.
3. Introduce database-backed WorldHub person/customer records only when a real
   cross-site/provider need forces it.

The first need to watch for is provider account mapping:

- Google identity
- Patreon account
- payment customer id
- merch storefront customer id
- email marketing subscriber id
- Quipsly/QuipLore identity

Those should be provider account refs at the edge, not fields jammed directly
onto the core user row.

## Entitlement Boundary

Today, access is a mix of:

- app roles
- client role/profile
- manual memberships
- content access helpers
- team route gates

WorldHub entitlements should eventually answer:

- who has member content access?
- who has coaching package access?
- who has Studio access?
- who has supporter access?
- who can see a specific embed or offer?

Do not replace existing route auth with a new entitlement engine until:

- the entitlement nouns are tested in `packages/worldhub-domain`
- a read-only mapping can explain current behavior
- the admin UI can show why access exists
- rollback keeps current role/membership gates intact

## Provider Adapter Boundary

No current workflow should be renamed around a vendor.

Future provider adapters may map:

- Stripe customer/product/price/subscription/payment events
- Patreon campaign/member/tier events
- Printful/Printify/Gelato/Fourthwall fulfillment state
- Google Calendar events
- Resend delivery events

Those mappings should feed WorldHub state through provider events and
connections. They should not become the core model.

## What Not To Do Next

Do not:

- move coaching request actions out of `apps/web`
- replace `Appointment` with `CoachingSession`
- change `prisma/schema.prisma`
- add Stripe, Patreon, POD, or social provider SDKs
- create provider webhook routes
- migrate memberships into subscriptions
- expose private Studio material in WorldHub
- make `/team/worldhub` the only way to manage current clients or coaching

## Best Next Implementation Slice

The next safe implementation slice is read-only:

```text
current Prisma-backed coaching/member workflows
  -> provider-neutral WorldHub summary objects
  -> /team/worldhub read-only overview
```

That can prove the domain mapping without changing writes, data ownership,
payment behavior, auth behavior, or provider state.
