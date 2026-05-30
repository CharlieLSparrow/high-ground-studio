# Data Models: The Schema Map

This document maps the `prisma/schema.prisma` ledger. The database is intentionally designed to be compact but highly relational, separating identities, product lifecycle, and domain data.

## 1. Identity & Auth (`User`, `UserEmail`, `UserRole`)
- **`User`**: The canonical human record. It contains the core identity.
- **`UserEmail`**: Allows one human to have multiple email aliases without creating duplicate `User` accounts.
- **`UserRole`**: Maps a human to specific app capabilities (e.g., `OWNER`, `COACH`, `CLIENT`, `NETWORK_PASS`).

## 2. Product & Entitlement (`MembershipPlan`, `Membership`)
- **`MembershipPlan`**: The catalog of what exists (e.g., "Pro Tier").
- **`Membership`**: The actual entitlement record linking a `User` to a `MembershipPlan` with a `status` (ACTIVE, PAUSED) and dates.

## 3. Coaching & Client Management
- **`ClientProfile`**: Stores domain-specific notes for users who are clients.
- **`Appointment`**: The scheduling ledger tying a Client, Coach, and Creator together for a time-bounded event (Zoom, Phone, In-Person).
- **`CoachingRequest`**: The intake funnel (NEW -> SCHEDULED -> CLOSED).
- **`WeeklyCommitment`**: Accountability tracking between Coach and Client.

## 4. WorldHub (E-Commerce & External Connections)
WorldHub is the monetization and external integration engine.
- **`WorldHubProviderConnection`**: Stores OAuth/API keys for external tools (Patreon, Stripe, AdSense).
- **`WorldHubOffer` & `WorldHubCatalogItem`**: Defines what is for sale.
- **`WorldHubCart` & `WorldHubOrder`**: The checkout and payment lifecycle.
- **`WorldHubFulfillmentJob`**: Background jobs that fire after an order to actually deliver the digital goods.

## 5. Content Studio (The NLE & Publishing)
- **`StoryDraft`**: Manages the lifecycle of a podcast or article from `ROUGH` to `PROMOTED`.
- **`WorldHubSeoBrief`**: Tracks keyword targeting, meta descriptions, and SEO checklists for published content.

## Architectural Tradeoffs
*As noted by "Future Chuck" in the schema comments:*
We explicitly use separate models instead of nullable columns when lifecycles diverge. For example, `Appointment` explicitly names its relations (`clientUser`, `coachUser`) rather than just having a generic `userId` list, ensuring strict domain integrity.
