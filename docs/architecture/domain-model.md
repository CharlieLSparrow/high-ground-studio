# Domain Model

This file documents the real domain model in `prisma/schema.prisma` plus the app-layer content access model that sits beside it.

## Core Identity

### `User`

Canonical app identity.

Key fields:
- `primaryEmail`
- `name`
- `image`
- `newsletterOptIn`
- `announcementsOptIn`
- `isActive`

Relationships:
- `aliases` -> `UserEmail`
- `roles` -> `UserRole`
- `clientProfile` -> `ClientProfile`
- `memberships` -> `Membership`
- `clientAppointments` -> appointments where the user is the client
- `coachAppointments` -> appointments where the user is the coach

### `UserEmail`

Alias email table.

Purpose:
- lets one human authenticate with multiple Google accounts
- prevents duplicate internal identities when the “wrong” Google address is used

### `UserRole`

Role assignment table.

Current role enum:
- `OWNER`
- `TEAM_SCHEDULER`
- `COACH`
- `CLIENT`

App behavior:
- `OWNER`, `TEAM_SCHEDULER`, and `COACH` all count as team/internal access today
- membership management is narrower than general team access

## Client And Commercial Ops

### `ClientProfile`

One-to-one extension of `User` for client-facing people.

Current usage:
- display name
- internal notes
- anchor for team-client workflows

### `MembershipPlan`

Catalog of plans assignable by the team.

Current fields suggest eventual billing/commercialization support:
- `slug`
- `priceCents`
- `billingIntervalMonths`
- `isActive`

Current reality:
- plans are internal records, not live Stripe products
- seed action currently creates:
  - `coaching-monthly`
  - `coaching-quarterly`

### `Membership`

User-to-plan assignment.

Key fields:
- `status`
- `startsAt`
- `endsAt`
- `grantedByUserId`
- `notes`

Current status enum:
- `ACTIVE`
- `PAUSED`
- `CANCELED`
- `EXPIRED`

Current usage:
- drives the dashboard’s “active membership” display
- managed from the team console, not from Stripe webhooks

## Appointments

### `Appointment`

Scheduling record connecting client, coach, and internal operators.

Key fields:
- `clientUserId`
- `coachUserId`
- `createdByUserId`
- `updatedByUserId`
- `scheduledStart`
- `scheduledEnd`
- `timezone`
- `status`
- `locationType`
- `locationDetails`
- `notes`
- `clientNotes`
- `googleEventId`

Current status enum:
- `SCHEDULED`
- `CONFIRMED`
- `COMPLETED`
- `CANCELED`
- `NO_SHOW`

Current location enum:
- `VIDEO`
- `PHONE`
- `IN_PERSON`
- `OTHER`

Current reality:
- appointments are managed through internal forms and can also be created by converting a coaching request
- request conversion creates an appointment with client, coach, creator, scheduled start/end, timezone, location, and notes
- generated Google Calendar event-template links remain the fallback behavior
- `/team/worldhub` can queue appointment sync jobs and, when dedicated
  `GOOGLE_CALENDAR_*` credentials are mounted, create/update Google Calendar
  events and write `googleEventId`

## Coaching Requests

### `CoachingRequest`

Client-facing request for a coaching follow-up conversation.

Key fields:
- `clientUserId`
- `preferredContactMethod`
- `email`
- `phone`
- `availabilityNotes`
- `coachingGoals`
- `contactConsent`
- `status`
- `assignedCoachUserId`
- `convertedAppointmentId`
- `internalNotes`

Current status enum:
- `NEW`
- `CONTACTED`
- `SCHEDULED`
- `CLOSED`
- `DECLINED`

Current usage:
- created from the signed-in dashboard coaching request form
- listed on `/dashboard` for the client
- managed from `/team/coaching-requests`
- can be assigned to a coach before conversion
- can be converted to an `Appointment`

Conversion behavior:
- creates an `Appointment`
- marks the request `SCHEDULED`
- sets `assignedCoachUserId`
- links `convertedAppointmentId`
- appends the scheduling note to `internalNotes`
- leaves later appointment edits to `/team/appointments`

Notification behavior:
- new request creation attempts a best-effort internal Resend email after the request transaction commits
- email failure is logged and does not block request creation or redirect

## Studio Manuscript Snapshots

### `StudioManuscript`

Private Studio manuscript library record.

Current intended usage:
- gives `/manuscript` a named manuscript/project layer above the flat snapshot
  stack
- separates `WORKING` manuscripts from `SYNTHETIC` smoke/test drafts
- lets manual snapshots belong to a selected manuscript when possible
- keeps old snapshots loadable when they do not have a manuscript parent

Key fields:
- `ownerEmail`
- `title`
- `description`
- `sourceFileName`
- `kind`
- `lastSnapshotAt`
- `archivedAt`

Current reality:
- the browser-local draft remains the active working copy
- creating a library record stores metadata only, not the full draft JSON
- snapshots are still the explicit server write for manuscript content
- deletion, ownership transfer, autosave, and collaboration are not active

### `StudioManuscriptSnapshot`

Private Studio manuscript snapshot row.

Current intended usage:
- stores an explicit full `ManuscriptDraft` JSON snapshot from `/manuscript`
- supports cross-device loading, especially desktop-to-phone/tablet Recording /
  Reading mode
- remains separate from canonical public manuscript content and public
  projections

Key fields:
- `manuscriptId` optional parent link
- `ownerEmail`
- `title`
- `description`
- `schemaVersion`
- `sourceFileName`
- `draftJson`
- `contentHash`
- `clientUpdatedAt`
- word, character, block, structure, cited quote, and quote review counts

Current reality:
- snapshots are manual, not autosaved
- snapshots can belong to a `StudioManuscript`, but legacy/orphan snapshots
  without a manuscript id remain valid and loadable
- the browser-local draft remains the active working copy
- the schema must be applied to a safe Studio database before snapshot routes can
  persist data
- this is not real-time collaboration or a canonical manuscript document model
- SMS/Twilio notification sending is not wired into the current request flow

## WorldHub Business Infrastructure

WorldHub keeps provider state, growth work, and commercial follow-through
app-owned before specific providers mutate app state.

### `WorldHubProviderConnection`

Provider readiness ledger for Stripe, Patreon, Google Calendar, merch,
transactional email, analytics, search, ads, affiliates, sponsors, and the
app-owned cart boundary.

Current reality:
- stores provider kind, capabilities, expected env names, configured env names,
  missing env names, setup notes, and health/readiness state
- does not store secret values
- refreshed from `/team/worldhub` and `/team/growth`

### `WorldHubProviderEvent`

Verified provider-event inbox.

Current reality:
- Stripe and Patreon webhook routes can verify signatures and write safe event
  summaries
- payment reconciliation, entitlement mutation, and fulfillment mutation are
  still later steps

### `WorldHubProviderSyncJob`

App-owned job ledger for provider sync attempts.

Current reality:
- Google Calendar appointment sync writes queued/completed/failed job rows
- the model is generic enough for analytics, search, merch, or fulfillment sync
  jobs later

### `WorldHubCatalogItem`, `WorldHubOffer`, `WorldHubCart`, `WorldHubOrder`,
and `WorldHubFulfillmentJob`

Commerce staging records.

Current reality:
- these are app-owned cart/order/catalog/fulfillment rails
- no Stripe Checkout session creation, automatic payment reconciliation, or
  merch fulfillment provider call is active yet

### `WorldHubSeoBrief`

Private SEO planning brief for a page, offer, episode page, book page, or
collection.

Current reality:
- stores target path/URL, keyword fields, meta title/description, intended
  structured data type, checklist JSON, notes, and creator email
- written from `/team/growth`

### `WorldHubAnalyticsSnapshot`

Manual or future-provider-imported analytics snapshot.

Current reality:
- stores source, channel, content path, period dates, metrics JSON, notes, and
  capture metadata
- written manually from `/team/growth` until GA/Search Console/AdSense imports
  are added

### `WorldHubMonetizationPlacement`

Private ad, affiliate, book recommendation, sponsor, or merch placement record.

Current reality:
- stores placement type, target path, provider key, destination URL, disclosure
  text, call to action, and metadata JSON
- public affiliate/ad publishing remains a reviewed later step

## Content Access Model

Content access is currently an app-layer model, not a Prisma model.

### Access values

From `src/lib/content-access.ts` and `src/lib/content-mode.ts`:
- `public`
- `members`
- `team`
- `private`

### Content modes

For staff/internal review:
- `public`
- `editor`
- `charlie`
- `skippy`

Current behavior:
- non-team users only see public/published content
- team users can switch modes via cookie-backed content mode logic
- `/library` and `/episodes` rely on this model for visibility decisions

## Important Domain Boundaries

- Auth identity and staff bootstrap are env-assisted.
- Clients, memberships, and appointments are Prisma-backed and operational.
- Coaching requests are Prisma-backed and operational, including internal request-to-appointment conversion.
- Stripe commercialization is not the source of truth yet.
- Donation/payment support is currently an external link, not app-owned Stripe Checkout state.
- Google Calendar support is generated links, not OAuth/API sync.
- Content publishing is split between stable metadata arrays and a guarded MDX route path.
