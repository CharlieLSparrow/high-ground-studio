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
- appointments are managed manually through internal forms
- `googleEventId` exists in schema, but active calendar synchronization is not established in the current repo docs/code path

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
- Stripe commercialization is not the source of truth yet.
- Content publishing is split between stable metadata arrays and a guarded MDX route path.
