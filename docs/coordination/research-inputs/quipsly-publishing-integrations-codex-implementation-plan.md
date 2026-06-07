# Quipsly Publishing Integrations Codex Implementation Plan

Date prepared: 2026-06-05

Prepared for: local Codex Agent working in `CharlieLSparrow/high-ground-studio`

Primary goal: implement a public-safe, versioned, destination-aware publishing architecture for Quipsly and the High Ground Studio monorepo without breaking the existing private Studio, HGO staging, QuipLore, or WorldHub boundaries.

This file is intentionally detailed. It is meant to be placed in the repo as a working implementation brief, for example:

```txt
docs/implementation/quipsly-publishing-integrations-codex-plan.md
```

The plan below assumes the local Codex Agent has the repository checked out and can inspect files directly. The line references in this document are observational anchors from the repo study performed on 2026-06-05. If the repo has moved, prefer the current local code over these exact line numbers.

---

## 0. The job in one paragraph

Build a publishing system where Quipsly can take one reviewed source, derive an immutable public-safe `PublishPacket`, transform that packet for many destinations, track each destination independently, and safely republish, archive, or rollback without confusing private creative state with public artifacts. MVP should support owned-site publishing to High Ground Odyssey and QuipLore, podcast RSS generation, and manual export packages for YouTube, social, and Patreon. Direct external API posting is not part of the first safe slice.

The architecture should feel like this:

```txt
Private source or Nest
  -> immutable source snapshot
  -> public projection policy
  -> immutable PublishPacket
  -> destination transform
  -> DestinationPublication
  -> PublishJob or manual publish action
  -> RemoteArtifact
  -> status event ledger
```

The most important safety rule:

```txt
Destination adapters must never read private Studio, Nest, manuscript, staged artifact, or source document tables directly.
They receive a public-safe PublishPacket and a Destination config. Nothing else.
```

---

## 1. Repo reality: what already exists

This repo is not a blank whiteboard. It already has a lot of publishing-adjacent scaffolding. Use it. Do not build an unrelated parallel spaceship unless a seam has clearly earned a new boundary.

### 1.1 Monorepo and scripts

The root `package.json` defines a pnpm workspace with:

```txt
apps/*
packages/*
```

Observed in `package.json` lines 4 to 10 and `pnpm-workspace.yaml` lines 3 to 5.

Relevant root scripts already exist:

```json
{
  "studio": "pnpm --filter studio dev",
  "web": "pnpm --filter web dev",
  "quiplore": "pnpm --filter quiplore dev",
  "quipsly:api": "pnpm --filter quipsly-api dev",
  "quipsly:domain:build": "pnpm --filter @high-ground/quipsly-domain build",
  "quipsly:domain:typecheck": "pnpm --filter @high-ground/quipsly-domain typecheck",
  "content-studio:domain:build": "pnpm --filter @high-ground/content-studio-domain build",
  "content-studio:domain:typecheck": "pnpm --filter @high-ground/content-studio-domain typecheck",
  "content-studio:packet:test": "node --experimental-strip-types --test scripts/content-studio-packet.test.mjs",
  "hgo:artifact:test": "node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/hgo-staged-artifact.test.mjs",
  "hgo:store-lab:test": "node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/hgo-staged-artifact-store-lab.test.mjs",
  "hgo:publish-candidate:test": "node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/hgo-publish-candidate-packet.test.mjs",
  "db:generate": "prisma generate",
  "db:push": "prisma db push",
  "db:migrate": "prisma migrate dev"
}
```

Do not invent a new package manager or test style. Use pnpm, Prisma, TypeScript, and `node --test` in the style already present.

### 1.2 Apps and packages to know

Current relevant app/package map:

```txt
apps/quipsly
  Private Studio/Content Studio surface. Next app. Uses Prisma, NextAuth, Tiptap, Remotion, Cloud Storage.

apps/web
  High Ground Odyssey app. Public HGO routes, team routes, WorldHub, coaching, current HGO staged artifact and publish queue surfaces.

apps/quiplore
  Public QuipLore prototype. Static seed-data quote exploration app consuming @high-ground/quipsly-domain/seed.

apps/quipsly-api
  Prototype Quipsly API service surface with CORS helpers and OpenAPI-oriented domain package usage.

packages/content-studio-domain
  Provider-neutral Content Studio contracts and workflow definitions.

packages/quipsly-domain
  Quote/source/person/evidence/QuipLore projection contracts, seed data, and OpenAPI helpers.

prisma/schema.prisma
  Shared Prisma/Postgres schema for identity, Studio, HGO staging, WorldHub, Quipsly prototypes, podcast/social stubs, and agent models.
```

Use these existing package/app roles:

```txt
packages/*
  Pure domain contracts and pure helper logic. No Prisma, no Next, no provider calls.

apps/quipsly
  Private publishing cockpit, packet building, admin review, source-to-packet flows.

apps/web
  HGO owned-site public rendering, HGO team workflows, podcast feed route for High Ground Odyssey, WorldHub provider readiness.

apps/quiplore
  QuipLore public rendering. MVP can remain seed-backed, then consume public packets later.

apps/quipsly-api
  Public/API-facing Quipsly projection endpoints later. Do not block the MVP on this app unless a route belongs naturally here.
```

### 1.3 Prisma is already shared and uses Postgres

The root Prisma schema has:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}
```

Observed in `prisma/schema.prisma` lines 61 to 67.

Both `apps/web` and `apps/quipsly` use Prisma 7 with `@prisma/adapter-pg` and a `pg` Pool.

Existing web client:

```txt
apps/web/src/lib/prisma.ts
```

Existing Quipsly client:

```txt
apps/quipsly/src/lib/prisma.ts
```

Do not create another Prisma schema for the MVP. Add publishing tables to the existing root schema unless Chuck explicitly chooses a separate service database later.

### 1.4 Content Studio already models creative workflow and packet handoff

The Content Studio domain package already defines:

```txt
ContentStudioStatus:
  idea, draft, active, blocked, ready, published, archived

ContentStudioWorkflowStage:
  research, structure, produce, publish, learn

ContentStudioPublishingTargetKind:
  high_ground_odyssey, future_site, social, email, kindle, audible, patreon, embed, custom
```

Observed in `packages/content-studio-domain/src/index.ts` lines 8 to 57.

`apps/quipsly/src/app/content-studio/content-studio-model.ts` already has browser and production packet types:

```ts
export const CONTENT_STUDIO_PACKET_KIND =
  "high-ground-content-studio-browser-packet";

export const CONTENT_STUDIO_PRODUCTION_PACKET_KIND =
  "high-ground-content-studio-production-packet";
```

Existing production packets explicitly declare:

```ts
safety: {
  providerCalls: false;
  publicPublished: false;
  containsRealManuscriptText: false;
  requiresHumanReview: true;
}
```

Observed in `apps/quipsly/src/app/content-studio/content-studio-model.ts` lines 168 to 192.

This means the current production packet is not the same thing as the new `PublishPacket`. Treat it as an upstream private or semi-private planning packet that can be used to derive a public-safe `PublishPacket` only after explicit review.

### 1.5 HGO already has staged artifacts and a private publish queue

Current HGO publishing-adjacent flow:

```txt
Content Studio production packet
  -> HGO /projection-stage/import
  -> saved HgoStagedProjectionArtifact
  -> HGO private publish queue
  -> HgoEpisodePublishCandidate private publish intent
```

Important existing models:

```txt
HgoStagedProjectionArtifact
HgoEpisodePublishCandidate
```

Observed in `prisma/schema.prisma` around lines 970 to 1080 in the fetched schema output.

Existing HGO packet helpers live in:

```txt
apps/web/src/lib/hgo/publish-candidate-packet.ts
apps/web/src/lib/hgo/publish-draft-packet.ts
apps/web/src/lib/hgo/publish-candidate-store-record.ts
apps/web/src/lib/server/hgo-episode-publish-candidates.ts
```

The existing HGO publish candidate packet is intentionally private. It says it does not create public routes, mutate the database, call providers, certify public safety, or publish live pages. It also contains explicit rollback notes and human review gates.

Keep that spirit. The new system should be the formal next step after those private review gates, not a bypass.

### 1.6 Current HGO public episode loading is not settled

The repo currently has a gap that the new architecture should clean up.

`apps/web/src/components/home/EpisodeFeed.tsx` currently queries:

```ts
await prisma.hgoEpisodePublishCandidate.findMany({
  where: { candidateStatus: "published" },
  orderBy: { createdAt: "desc" },
  take: 6,
});
```

Observed in `apps/web/src/components/home/EpisodeFeed.tsx` lines 6 to 13.

`apps/web/src/app/episodes/[slug]/read/page.tsx` currently reads a candidate by `projectionSlug` and uses `episode?.mdxDraft` as the transcript/content source. Observed around lines 72 to 89.

`apps/web/src/lib/server/hgo-episode-publish-candidates.ts` also contains an `executeHgoEpisodePublishCandidate()` function that writes `candidate.mdxDraft` directly into a local content file path and marks the candidate as `published`. Observed around lines 281 to 342.

This should be treated as a legacy or experimental bridge, not the final model. In Cloud Run, local filesystem writes are not a durable content publishing strategy. More importantly, a private review/intention row should not become the public content ledger.

The new publishing model should migrate public HGO episode rendering to:

```txt
PublishPacket
DestinationPublication
RemoteArtifact
PublishStatusEvent
```

### 1.7 QuipLore is currently a seed-backed projection prototype

`apps/quiplore/src/app/page.tsx` imports seeded projections from `@high-ground/quipsly-domain/seed` and renders QuipStream, QuipCards, Lorelists, people, quotes, and source works.

It already says, in product language, that cards are projections over quote, person, source, evidence, review state, variants, and themes.

This is philosophically aligned with the publish packet architecture. QuipLore should consume public-safe quote packets later, but MVP can initially add destination transforms and seed configs without forcing QuipLore off seed data immediately.

### 1.8 WorldHub already owns provider readiness, including Patreon

`apps/web/src/lib/worldhub/provider-definitions.ts` already defines provider readiness metadata for Stripe, Patreon, Google Calendar, Analytics, Search Console, AdSense, affiliate links, sponsors, merch, Resend, and app cart.

The Patreon provider definition has capabilities:

```txt
supporter_memberships
subscriptions
webhooks
```

It requires:

```txt
PATREON_CLIENT_ID
PATREON_CLIENT_SECRET
PATREON_WEBHOOK_SECRET
```

Optional:

```txt
PATREON_CAMPAIGN_ID
PATREON_CREATOR_ACCESS_TOKEN
```

Observed in `apps/web/src/lib/worldhub/provider-definitions.ts` lines 80 to 95.

Do not build Patreon entitlement logic inside publishing. For MVP, publishing can generate Patreon packages and record manual URLs or webhook events. WorldHub owns supporter entitlement and provider connection readiness.

---

## 2. External research sources to keep nearby

Use these official references while implementing. The MVP should not call most external APIs yet, but the model should be shaped so the later adapters fit.

### 2.1 Headless publishing and content architecture

Contentful headless CMS overview:

```txt
https://www.contentful.com/headless-cms/
```

Useful principle: content model and presentation should be separated, with structured content delivered to many frontends and channels.

Sanity drafts and publishing model:

```txt
https://www.sanity.io/docs/content-lake/drafts
```

Useful principle: draft and published states are distinct, and publishing promotes reviewed content into public API-visible state.

### 2.2 Next.js implementation references

Next.js App Router docs:

```txt
https://nextjs.org/docs/app
```

Route Handlers:

```txt
https://nextjs.org/docs/app/api-reference/file-conventions/route
```

`revalidatePath`:

```txt
https://nextjs.org/docs/app/api-reference/functions/revalidatePath
```

Use for owned-site cache invalidation after publication. Do not rely on cache invalidation as proof of publish success. It is a rendering concern after the DB ledger is correct.

### 2.3 Prisma and job safety

Prisma transactions:

```txt
https://www.prisma.io/docs/orm/prisma-client/queries/transactions
```

Transactional outbox pattern:

```txt
https://microservices.io/patterns/data/transactional-outbox.html
```

Use this principle:

```txt
Create packet + publication + job inside one DB transaction.
Call external APIs or revalidation hooks outside that transaction.
Make job execution idempotent.
```

### 2.4 Podcast RSS requirements

Apple Podcasts RSS requirements:

```txt
https://podcasters.apple.com/support/823-podcast-requirements
```

Apple requires public RSS feeds, correct RSS/XML structure, required tags, stable GUIDs, valid enclosure fields, and server support for HEAD and byte-range requests for episode files.

Podcast Standards Project RSS specification:

```txt
https://github.com/Podcast-Standards-Project/PSP-1-Podcast-RSS-Specification
```

Podcasting 2.0 namespace:

```txt
https://podcasting2.org/docs/podcast-namespace
```

### 2.5 YouTube workflow references

YouTube Data API overview:

```txt
https://developers.google.com/youtube/v3/docs
```

Videos insert:

```txt
https://developers.google.com/youtube/v3/docs/videos/insert
```

Video resource and status fields:

```txt
https://developers.google.com/youtube/v3/docs/videos
```

Thumbnail upload:

```txt
https://developers.google.com/youtube/v3/docs/thumbnails/set
```

MVP should generate manual YouTube packages. Direct upload is a later adapter because OAuth, upload processing, quota, channel verification, policy fields, and audit readiness all matter.

### 2.6 Social publishing references

X create post endpoint:

```txt
https://docs.x.com/x-api/posts/create-post
```

Important fields include text and platform metadata such as AI-generated media labeling. For MVP, export copy and assets. Direct X posting is later.

LinkedIn Share on LinkedIn:

```txt
https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
```

LinkedIn requires OAuth scopes such as `w_member_social`, and post/share payloads include author, commentary/content, lifecycle state, and visibility. For MVP, export copy and assets. Direct LinkedIn posting is later.

Meta Facebook Page and Instagram publishing docs often require logged-in developer access. Keep Meta as a manual export destination until a verified app and permissions path exists.

### 2.7 Patreon references

Patreon API docs:

```txt
https://docs.patreon.com/
```

Patreon docs currently expose read endpoints for campaign posts and individual posts:

```txt
GET /api/oauth2/v2/campaigns/{campaign_id}/posts
GET /api/oauth2/v2/posts/{id}
```

They also expose webhooks and triggers including post publish/update/delete:

```txt
posts:publish
posts:update
posts:delete
```

Do not assume normal Patreon post creation is available through the public API. MVP should generate manual Patreon packages and optionally track a pasted Patreon URL or webhook event.

### 2.8 SCORM and book export references

SCORM content packaging overview:

```txt
https://scorm.com/scorm-explained/technical-scorm/content-packaging/
```

Kindle Direct Publishing formatting help:

```txt
https://kdp.amazon.com/help?topicId=G200634390
```

MVP should treat SCORM and Kindle as export destinations only.

---

## 3. Non-negotiable implementation rules

These are the guardrails. Codex should obey them unless Chuck explicitly overrides them.

### 3.1 Do not publish raw private material

Never publish directly from:

```txt
StudioManuscriptSnapshot.draftJson
StudioContentProject.projectJson
StudioContentProject.productionPacketJson
HgoStagedProjectionArtifact.artifactJson
HgoEpisodePublishCandidate.mdxDraft
StudioDocumentBlock.body
StudioKnowledgeNode.body
QuipslyNode.payloadJson
```

Those may be used as source inputs to a packet builder only after explicit validation and projection.

Public publication starts at `PublishPacket`, not before.

### 3.2 Treat current HGO private publish queue as upstream review state

The current HGO queue is valuable. Do not delete it. It represents private review intent and handoff.

The new system should add a formal step:

```txt
HgoEpisodePublishCandidate private intent
  -> explicit public-safety/citation approval
  -> PublishPacket
  -> DestinationPublication for owned-site:hgo
```

### 3.3 Make packets immutable

A `PublishPacket` is frozen public intent.

Do not update `packetJson` in place after creation. If content changes, create a new packet version. Republishing means a destination publication points at a newer packet and creates a new artifact event.

### 3.4 Destination adapters only receive public packets

Adapter function signatures should look like:

```ts
publish({ packet, destination, publication, payload, idempotencyKey })
```

They should not query raw source tables.

### 3.5 Status is per destination

One packet can be:

```txt
published to HGO
queued for podcast RSS
draft for YouTube
failed for LinkedIn
archived on Patreon package
```

Do not store a single global status on `PublishPacket` and pretend it describes every destination.

### 3.6 Every status transition writes an event

`DestinationPublication.status` is the current state.

`PublishStatusEvent` is the history.

Never change status without inserting a status event in the same transaction.

### 3.7 Do not call external APIs in long Prisma transactions

A transaction may create packet rows, publication rows, status events, and outbox jobs.

A worker should later process the job and call external APIs. Even owned-site revalidation should happen after durable DB state exists.

### 3.8 Direct provider APIs are deferred for MVP

MVP direct external calls allowed:

```txt
none, unless they are internal owned-site revalidation calls behind a signed local route
```

MVP generated outputs:

```txt
HGO owned-site public artifact
QuipLore owned-site packet/artifact placeholder
Podcast RSS XML
Manual YouTube package
Manual social package
Manual Patreon package
Manual Kindle/SCORM package metadata where useful
```

### 3.9 Do not store new OAuth tokens in plaintext

The existing `SocialAccount.accessToken` field is plaintext. Do not copy that pattern into the new publishing destination model.

For MVP, destinations should store readiness/config only. For future OAuth, use encrypted token storage, Secret Manager, or WorldHub provider connection patterns.

### 3.10 Preserve synthetic-test posture

Existing HGO and Studio tests are careful to use synthetic data and explicitly avoid real private material. Keep that posture. New tests should use synthetic packets and fixtures.

---

## 4. Target architecture

### 4.1 System diagram

```txt
Private authoring and source layer
  Studio manuscript snapshots
  Content Studio projects
  HGO staged artifacts
  Quipsly quote/source nodes
  Nests and Lorelists
        |
        v
Source snapshot and projection policy
  Select allowed fields
  Exclude private blocks
  Validate rights and citation state
  Normalize public assets
  Hash source and output
        |
        v
PublishPacket
  Immutable public-safe payload
  Versioned
  Schema-tagged
  Visibility-aware
  Contains public content only
        |
        v
Destination transform
  owned-site:hgo:episode@v1
  owned-site:quiplore:quote-card@v1
  podcast-rss:hgo@v1
  youtube:manual-package@v1
  social:x-manual@v1
  patreon:manual-package@v1
        |
        v
DestinationPublication
  Per destination current status
  Desired packet
  Published packet
  Payload hash
  Remote URL and artifact pointer
        |
        v
PublishJob or manual action
  Idempotency key
  Retry count
  Worker lock
        |
        v
RemoteArtifact
  DB-backed owned-site artifact
  RSS feed item entry
  Manual export package
  Future provider remote ID
        |
        v
Status event and attempt ledger
```

### 4.2 Recommended code ownership

Add one pure domain package:

```txt
packages/publishing-domain
```

Why a new package instead of putting everything in `content-studio-domain` or `quipsly-domain`?

```txt
content-studio-domain
  Owns creative workflow and production planning packets.

quipsly-domain
  Owns quote/source/person/evidence/public projection contracts for QuipLore.

publishing-domain
  Should own cross-product public packet, destination, status, transform, and publication contracts.
```

This keeps the new domain broad enough for HGO, QuipLore, podcast RSS, YouTube, Patreon, SCORM, Kindle, and future destinations without bloating either source domain.

Add server implementation in the apps that need it:

```txt
apps/quipsly/src/lib/publishing
  packet builders
  destination transforms
  private admin APIs
  publish cockpit UI
  job runner route for dev/operator use

apps/web/src/lib/publishing
  HGO public query helpers
  HGO owned-site artifact reader
  podcast RSS feed generator
  revalidation hooks if needed

apps/quiplore/src/lib/publishing
  later: QuipLore public packet reader

apps/quipsly-api/src/lib/publishing
  later: public packet/projection API if needed
```

### 4.3 MVP boundary choice

For MVP, use shared Postgres as the publication ledger.

That means:

```txt
Quipsly creates PublishPacket and DestinationPublication rows.
apps/web reads PUBLISHED owned-site HGO publications from the same database.
apps/web renders /episodes and /episodes/[slug]/read from the new ledger.
QuipLore can remain seed-backed until the QuipLore slice is ready.
```

This is safer than writing MDX files into a Cloud Run container and simpler than adding a cross-service public packet API on day one.

Later, if apps deploy with separate databases or service boundaries, add a read-only public packet API and signed revalidation webhook.

---

## 5. Prisma schema implementation

### 5.1 Add enums

Add these near the existing Prisma enums in `prisma/schema.prisma`.

Use PascalCase enum names, all-caps values, consistent with existing models like `AppRole` and `MembershipStatus`. Existing Studio projection statuses are lowercase, but the new publishing ledger should use all-caps operational states.

```prisma
enum PublishPacketKind {
  ARTICLE
  EPISODE
  PODCAST_EPISODE
  QUOTE_CARD
  QUOTE_FEED
  VIDEO_METADATA
  SOCIAL_CAMPAIGN
  PATREON_PACKAGE
  COURSE
  SCORM_PACKAGE
  BOOK
  KINDLE_PACKAGE
  GENERIC
}

enum PublishVisibility {
  PUBLIC
  UNLISTED
  PATRON_ONLY
  PRIVATE_PREVIEW
}

enum PublishDestinationType {
  OWNED_SITE
  PODCAST_RSS
  YOUTUBE
  X
  LINKEDIN
  META_FACEBOOK_PAGE
  META_INSTAGRAM
  PATREON
  QUIPLORE_FEED
  SCORM_EXPORT
  KINDLE_EXPORT
  MANUAL_EXPORT
  GENERIC_WEBHOOK
}

enum DestinationPublicationStatus {
  DRAFT
  QUEUED
  PUBLISHING
  PUBLISHED
  FAILED
  REPUBLISHED
  ARCHIVED
  CANCELLED
  BLOCKED
}

enum PublishOperation {
  CREATE
  REPUBLISH
  ARCHIVE
  FETCH_STATUS
  EXPORT
}

enum PublishJobStatus {
  PENDING
  LOCKED
  SUCCEEDED
  FAILED
  CANCELLED
}
```

### 5.2 Add models

Add the models below near the existing content and integration models. A good location is after `HgoEpisodePublishCandidate` and before `StudioDocumentBlock`, because this is the bridge from private HGO candidate state into general publishing state. Another acceptable location is a new section near the end named `PUBLISHING LEDGER MODELS`.

#### 5.2.1 PublishSourceSnapshot

This optional model freezes the exact private source input used to derive a public packet. It is not public. It is an audit bridge.

```prisma
model PublishSourceSnapshot {
  id               String   @id @default(cuid())
  ownerUserId       String?
  ownerEmail        String
  sourceSystem      String
  sourceType        String
  sourceRefId       String
  sourceVersionRef  String?
  schemaVersion     String
  sourceHash        String
  snapshotJson      Json
  privateMetaJson   Json?
  createdByEmail    String?
  createdAt         DateTime @default(now())

  packets           PublishPacket[]

  @@index([ownerEmail, createdAt])
  @@index([sourceSystem, sourceRefId])
  @@unique([ownerEmail, sourceSystem, sourceRefId, sourceHash])
}
```

Examples:

```txt
sourceSystem: hgo
sourceType: hgo-episode-publish-candidate
sourceRefId: HgoEpisodePublishCandidate.id
sourceVersionRef: candidate.sourceArtifactHash

sourceSystem: content-studio
sourceType: studio-content-project
sourceRefId: StudioContentProject.id
sourceVersionRef: StudioContentProject.updatedAt ISO string or content hash

sourceSystem: quipsly
sourceType: quipsly-node
sourceRefId: QuipslyNode.id
sourceVersionRef: QuipslyNode.updatedAt ISO string or payload hash
```

#### 5.2.2 PublishPacket

This is the immutable public-safe artifact.

```prisma
model PublishPacket {
  id                String             @id @default(cuid())
  ownerUserId        String?
  ownerEmail         String

  sourceSnapshotId   String?
  sourceSystem       String
  sourceType         String
  sourceRefId        String
  sourceVersionRef   String?

  packetKind         PublishPacketKind
  packetVersion      Int
  schemaVersion      String
  title              String
  slug               String
  visibility         PublishVisibility @default(PRIVATE_PREVIEW)
  contentHash        String

  packetJson         Json
  publicMetaJson     Json?
  derivedFromJson    Json?
  approvalJson       Json?

  createdByEmail     String?
  createdAt          DateTime          @default(now())
  archivedAt         DateTime?

  sourceSnapshot     PublishSourceSnapshot? @relation(fields: [sourceSnapshotId], references: [id], onDelete: SetNull)
  publicationsAsDesired   DestinationPublication[] @relation("DesiredPacket")
  publicationsAsPublished DestinationPublication[] @relation("PublishedPacket")
  artifacts          RemoteArtifact[]

  @@unique([ownerEmail, sourceSystem, sourceRefId, packetVersion])
  @@unique([ownerEmail, contentHash])
  @@index([ownerEmail, createdAt])
  @@index([packetKind, slug])
  @@index([sourceSystem, sourceRefId])
}
```

Notes:

```txt
packetVersion is per owner/sourceSystem/sourceRefId.
contentHash prevents duplicate identical packet rows for the same owner.
visibility PRIVATE_PREVIEW means public-safe enough for destination preview, not public yet.
archivedAt hides packet from default packet lists, but does not delete audit history.
```

#### 5.2.3 PublishDestination

This is destination configuration, not per-packet state.

```prisma
model PublishDestination {
  id                       String                 @id @default(cuid())
  key                      String                 @unique
  type                     PublishDestinationType
  name                     String
  status                   String                 @default("enabled")
  accountLabel             String?
  worldHubProviderKey      String?
  worldHubProviderConnectionId String?
  configJson               Json
  capabilitiesJson         Json?
  createdAt                DateTime               @default(now())
  updatedAt                DateTime               @updatedAt

  publications             DestinationPublication[]
  artifacts                RemoteArtifact[]
  jobs                     PublishJob[]

  @@index([type, status])
  @@index([worldHubProviderKey])
}
```

Do not store tokens here. This is config and readiness metadata.

Example keys:

```txt
owned-site:hgo
owned-site:quiplore
podcast-rss:hgo-main
youtube:manual:hgo
social:x:manual:hgo
social:linkedin:manual:hgo
patreon:manual:hgo
kindle:manual:hgo
scorm:manual:hgo
```

#### 5.2.4 DestinationPublication

This is the stable per-destination publication record. It may move from one desired/published packet to another over time.

```prisma
model DestinationPublication {
  id                    String                       @id @default(cuid())
  ownerUserId            String?
  ownerEmail             String

  destinationId          String
  publicationKey         String
  title                  String
  slug                   String

  status                DestinationPublicationStatus @default(DRAFT)
  operation             PublishOperation             @default(CREATE)

  desiredPacketId        String
  publishedPacketId      String?

  transformKey           String
  transformVersion       String
  renderedPayloadJson    Json?
  payloadHash            String?

  scheduledFor           DateTime?
  publishedAt            DateTime?
  republishedAt          DateTime?
  archivedAt             DateTime?

  currentArtifactId      String?
  remoteId               String?
  remoteUrl              String?

  lastErrorCode          String?
  lastErrorMessage       String?
  lastAttemptAt          DateTime?

  createdByEmail         String?
  createdAt              DateTime                     @default(now())
  updatedAt              DateTime                     @updatedAt

  destination            PublishDestination            @relation(fields: [destinationId], references: [id], onDelete: Restrict)
  desiredPacket          PublishPacket                 @relation("DesiredPacket", fields: [desiredPacketId], references: [id], onDelete: Restrict)
  publishedPacket        PublishPacket?                @relation("PublishedPacket", fields: [publishedPacketId], references: [id], onDelete: SetNull)
  attempts               PublishAttempt[]
  events                 PublishStatusEvent[]
  artifacts              RemoteArtifact[]
  jobs                   PublishJob[]

  @@unique([destinationId, publicationKey])
  @@index([ownerEmail, status, updatedAt])
  @@index([destinationId, status])
  @@index([desiredPacketId])
  @@index([publishedPacketId])
}
```

Publication key examples:

```txt
hgo:episode:synthetic-candidate-projection
hgo:article:launch-notes
quiplore:quote:imagination-more-important-than-knowledge
quiplore:lorelist:curiosity-without-cliche
podcast:hgo-main:episode:synthetic-candidate-projection
youtube:manual:hgo:episode:synthetic-candidate-projection
patreon:manual:hgo:episode:synthetic-candidate-projection
```

Why use `publicationKey` instead of `@@unique([packetId, destinationId])`?

Because a destination publication is a durable public target. A new packet version should update the same target instead of creating disconnected publication rows for the same route/feed item. The packet changes. The destination target stays recognizable.

#### 5.2.5 PublishStatusEvent

```prisma
model PublishStatusEvent {
  id              String                       @id @default(cuid())
  publicationId   String
  fromStatus      DestinationPublicationStatus?
  toStatus        DestinationPublicationStatus
  operation       PublishOperation?
  reason          String?
  actorEmail      String?
  jobId           String?
  metadataJson    Json?
  createdAt       DateTime                     @default(now())

  publication     DestinationPublication       @relation(fields: [publicationId], references: [id], onDelete: Cascade)

  @@index([publicationId, createdAt])
  @@index([toStatus, createdAt])
}
```

#### 5.2.6 PublishAttempt

```prisma
model PublishAttempt {
  id                  String                       @id @default(cuid())
  publicationId       String
  jobId               String?
  attemptNumber       Int
  operation           PublishOperation
  status              DestinationPublicationStatus
  requestSummaryJson  Json?
  responseSummaryJson Json?
  errorCode           String?
  errorMessage        String?
  startedAt           DateTime                     @default(now())
  finishedAt          DateTime?

  publication         DestinationPublication       @relation(fields: [publicationId], references: [id], onDelete: Cascade)

  @@unique([publicationId, attemptNumber])
  @@index([jobId])
  @@index([publicationId, startedAt])
}
```

#### 5.2.7 RemoteArtifact

This stores the artifact that resulted from a destination publication. For owned sites, this is the public render payload. For manual exports, it is the generated copy/package. For future provider APIs, it stores the remote ID and URL.

```prisma
model RemoteArtifact {
  id                String             @id @default(cuid())
  publicationId     String
  packetId          String
  destinationId     String

  artifactKind      String
  remoteId          String?
  remoteUrl         String?
  remoteStatus      String?
  artifactJson      Json?
  payloadHash       String?

  active            Boolean            @default(true)
  supersededById    String?
  archivedAt        DateTime?

  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  publication       DestinationPublication @relation(fields: [publicationId], references: [id], onDelete: Cascade)
  packet            PublishPacket          @relation(fields: [packetId], references: [id], onDelete: Restrict)
  destination       PublishDestination     @relation(fields: [destinationId], references: [id], onDelete: Restrict)

  @@index([destinationId, remoteId])
  @@index([packetId])
  @@index([publicationId, active])
}
```

#### 5.2.8 PublishJob

This is the MVP outbox/job table.

```prisma
model PublishJob {
  id                String           @id @default(cuid())
  type              String
  operation         PublishOperation
  status            PublishJobStatus @default(PENDING)

  publicationId     String
  packetId          String
  destinationId     String

  runAt             DateTime         @default(now())
  lockedAt          DateTime?
  lockedBy          String?
  attempts          Int              @default(0)
  maxAttempts       Int              @default(5)
  idempotencyKey    String           @unique

  payloadJson       Json?
  lastErrorCode     String?
  lastErrorMessage  String?

  createdByEmail    String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  publication       DestinationPublication @relation(fields: [publicationId], references: [id], onDelete: Cascade)
  destination       PublishDestination     @relation(fields: [destinationId], references: [id], onDelete: Restrict)

  @@index([status, runAt])
  @@index([publicationId])
  @@index([packetId])
  @@index([destinationId])
}
```

#### 5.2.9 PublishPublicAsset

Add this if the first implementation needs public asset metadata. If asset handling is not in the first PR, include the model but use it lightly.

```prisma
model PublishPublicAsset {
  id                 String   @id @default(cuid())
  ownerUserId         String?
  ownerEmail          String
  sourceMediaAssetId  String?
  kind               String
  url                String
  mimeType           String?
  sizeBytes          BigInt?
  checksum           String?
  altText            String?
  rightsStatus       String   @default("unknown")
  visibility         PublishVisibility @default(PRIVATE_PREVIEW)
  metadataJson       Json?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([ownerEmail, createdAt])
  @@index([kind, visibility])
  @@index([sourceMediaAssetId])
}
```

### 5.3 Migration commands

After schema changes:

```bash
pnpm db:generate
pnpm db:migrate
```

If local migration setup is not ready and this is a prototype branch:

```bash
pnpm db:push
```

Prefer `pnpm db:migrate` for durable implementation work.

---

## 6. Add `packages/publishing-domain`

### 6.1 Files to create

```txt
packages/publishing-domain/package.json
packages/publishing-domain/tsconfig.json
packages/publishing-domain/src/index.ts
```

### 6.2 package.json

```json
{
  "name": "@high-ground/publishing-domain",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

### 6.3 tsconfig.json

Mirror the simple package tsconfigs in existing domain packages. If in doubt, copy from `packages/quipsly-domain/tsconfig.json` or `packages/content-studio-domain/tsconfig.json`.

### 6.4 Core domain types

`packages/publishing-domain/src/index.ts` should export pure types and helper functions.

Start with:

```ts
export const PUBLISHING_DOMAIN_VERSION = "publishing-domain-v1" as const;
export const PUBLISH_PACKET_SCHEMA_VERSION = "publish-packet-v1" as const;

export type PublishPacketKind =
  | "ARTICLE"
  | "EPISODE"
  | "PODCAST_EPISODE"
  | "QUOTE_CARD"
  | "QUOTE_FEED"
  | "VIDEO_METADATA"
  | "SOCIAL_CAMPAIGN"
  | "PATREON_PACKAGE"
  | "COURSE"
  | "SCORM_PACKAGE"
  | "BOOK"
  | "KINDLE_PACKAGE"
  | "GENERIC";

export type PublishVisibility =
  | "PUBLIC"
  | "UNLISTED"
  | "PATRON_ONLY"
  | "PRIVATE_PREVIEW";

export type PublishDestinationType =
  | "OWNED_SITE"
  | "PODCAST_RSS"
  | "YOUTUBE"
  | "X"
  | "LINKEDIN"
  | "META_FACEBOOK_PAGE"
  | "META_INSTAGRAM"
  | "PATREON"
  | "QUIPLORE_FEED"
  | "SCORM_EXPORT"
  | "KINDLE_EXPORT"
  | "MANUAL_EXPORT"
  | "GENERIC_WEBHOOK";

export type DestinationPublicationStatus =
  | "DRAFT"
  | "QUEUED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "REPUBLISHED"
  | "ARCHIVED"
  | "CANCELLED"
  | "BLOCKED";

export type PublishOperation =
  | "CREATE"
  | "REPUBLISH"
  | "ARCHIVE"
  | "FETCH_STATUS"
  | "EXPORT";
```

### 6.5 Public packet shape

Add a broad but not bloated packet type:

```ts
export type PublicAssetProjection = {
  id: string;
  kind:
    | "cover_image"
    | "thumbnail"
    | "audio"
    | "video"
    | "transcript"
    | "caption_file"
    | "download"
    | "quote_card"
    | "generic";
  publicUrl: string;
  mimeType?: string;
  bytes?: number;
  checksum?: string;
  altText?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  rightsStatus?: "unknown" | "private" | "licensed" | "public_safe";
};

export type PublicCitationProjection = {
  label: string;
  publicUrl?: string;
  sourceTitle?: string;
  author?: string;
  date?: string;
  quoteApproved?: boolean;
  verificationStatus?: string;
};

export type PublishPacketBody = {
  html?: string;
  markdown?: string;
  plainText?: string;
  blocks?: Array<{
    id: string;
    type: string;
    text?: string;
    html?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type PublishPacketJson = {
  packetKind: "quipsly-publish-packet-v1";
  schemaVersion: typeof PUBLISH_PACKET_SCHEMA_VERSION;
  source: {
    sourceSystem: string;
    sourceType: string;
    sourceRefId: string;
    sourceVersionRef?: string;
    sourceHash?: string;
  };
  identity: {
    title: string;
    subtitle?: string;
    slug: string;
    packetKind: PublishPacketKind;
    packetVersion: number;
    visibility: PublishVisibility;
  };
  body: PublishPacketBody;
  summary?: string;
  description?: string;
  seo?: {
    title?: string;
    description?: string;
    canonicalUrl?: string;
    imageAssetId?: string;
    noindex?: boolean;
  };
  authors: Array<{
    name: string;
    publicUrl?: string;
    role?: string;
  }>;
  publicTags: string[];
  topics: string[];
  compliance: {
    explicit?: boolean;
    mature?: boolean;
    madeForKids?: boolean;
    containsSyntheticMedia?: boolean;
    aiAssistedDisclosure?: string;
    rightsChecked: boolean;
    humanApproved: boolean;
    citationReview?: "not_required" | "pending" | "approved" | "blocked";
    publicSafetyReview?: "pending" | "approved" | "blocked";
  };
  citations: PublicCitationProjection[];
  assets: PublicAssetProjection[];
  channelHints?: {
    podcast?: {
      showSlug: string;
      season?: number;
      episode?: number;
      episodeType?: "full" | "trailer" | "bonus";
      durationSeconds?: number;
    };
    youtube?: {
      categoryId?: string;
      tags?: string[];
      defaultPrivacy?: "private" | "unlisted" | "public";
    };
    social?: {
      campaignName?: string;
      preferredHashtags?: string[];
      shortLink?: string;
    };
    patreon?: {
      teaser?: string;
      tierIds?: string[];
      isPublic?: boolean;
    };
  };
  createdAt: string;
  createdByEmail?: string;
};
```

### 6.6 Status transition helpers

Add a pure transition map:

```ts
export const destinationPublicationTransitions: Record<
  DestinationPublicationStatus,
  readonly DestinationPublicationStatus[]
> = {
  DRAFT: ["QUEUED", "BLOCKED", "ARCHIVED", "CANCELLED"],
  QUEUED: ["PUBLISHING", "CANCELLED", "BLOCKED"],
  PUBLISHING: ["PUBLISHED", "REPUBLISHED", "FAILED", "BLOCKED"],
  PUBLISHED: ["QUEUED", "REPUBLISHED", "ARCHIVED", "BLOCKED"],
  FAILED: ["QUEUED", "BLOCKED", "ARCHIVED", "CANCELLED"],
  REPUBLISHED: ["QUEUED", "ARCHIVED", "BLOCKED"],
  ARCHIVED: ["QUEUED"],
  CANCELLED: ["QUEUED", "ARCHIVED"],
  BLOCKED: ["DRAFT", "QUEUED", "ARCHIVED"],
};

export function canTransitionDestinationPublicationStatus(input: {
  from: DestinationPublicationStatus;
  to: DestinationPublicationStatus;
}): boolean {
  return destinationPublicationTransitions[input.from].includes(input.to);
}
```

### 6.7 Validation helpers

Add pure validators:

```ts
export type PublishValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
  path?: string;
};

export type PublishValidationResult = {
  ok: boolean;
  errors: PublishValidationIssue[];
  warnings: PublishValidationIssue[];
};

export function validatePublicSafePacket(packet: PublishPacketJson): PublishValidationResult {
  const errors: PublishValidationIssue[] = [];
  const warnings: PublishValidationIssue[] = [];

  if (packet.packetKind !== "quipsly-publish-packet-v1") {
    errors.push({ code: "packet.kind", message: "Invalid packet kind.", severity: "error" });
  }

  if (packet.schemaVersion !== PUBLISH_PACKET_SCHEMA_VERSION) {
    errors.push({ code: "packet.schemaVersion", message: "Invalid packet schema version.", severity: "error" });
  }

  if (!packet.identity.title.trim()) {
    errors.push({ code: "identity.title", message: "Title is required.", severity: "error" });
  }

  if (!packet.identity.slug.trim()) {
    errors.push({ code: "identity.slug", message: "Slug is required.", severity: "error" });
  }

  if (!packet.compliance.humanApproved) {
    errors.push({ code: "compliance.humanApproved", message: "Human approval is required before creating a public packet.", severity: "error" });
  }

  if (!packet.compliance.rightsChecked) {
    errors.push({ code: "compliance.rightsChecked", message: "Rights check is required before creating a public packet.", severity: "error" });
  }

  if (packet.compliance.publicSafetyReview !== "approved") {
    errors.push({ code: "compliance.publicSafetyReview", message: "Public-safety review must be approved.", severity: "error" });
  }

  for (const asset of packet.assets) {
    if (!asset.publicUrl.trim()) {
      errors.push({ code: "assets.publicUrl", message: `Asset ${asset.id} is missing a public URL.`, severity: "error" });
    }
    if ((asset.kind === "cover_image" || asset.kind === "thumbnail" || asset.kind === "quote_card") && !asset.altText?.trim()) {
      warnings.push({ code: "assets.altText", message: `Image asset ${asset.id} should include alt text.`, severity: "warning" });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
```

Keep this strict. Public packet creation should fail closed.

### 6.8 Hash and slug helpers

Domain package can include pure string helpers, or server apps can own hashing if Node crypto imports are inconvenient. If implementing in the domain package, use no Node-specific APIs unless package build allows it.

Minimum helpers:

```ts
export function normalizePublishSlug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  ).slice(0, 96);
}

export function createPublicationKey(input: {
  destinationKey: string;
  packetKind: PublishPacketKind;
  slug: string;
}): string {
  return `${input.destinationKey}:${input.packetKind.toLowerCase()}:${normalizePublishSlug(input.slug)}`;
}
```

Hashing can live in app server code:

```txt
apps/quipsly/src/lib/publishing/hash.ts
```

---

## 7. Server implementation in `apps/quipsly`

### 7.1 Directory structure

Create:

```txt
apps/quipsly/src/lib/publishing/hash.ts
apps/quipsly/src/lib/publishing/public-projection-policy.ts
apps/quipsly/src/lib/publishing/packet-builder.ts
apps/quipsly/src/lib/publishing/destination-seeds.ts
apps/quipsly/src/lib/publishing/destination-publications.ts
apps/quipsly/src/lib/publishing/status-events.ts
apps/quipsly/src/lib/publishing/jobs.ts
apps/quipsly/src/lib/publishing/worker.ts
apps/quipsly/src/lib/publishing/transforms/index.ts
apps/quipsly/src/lib/publishing/transforms/owned-site-hgo.ts
apps/quipsly/src/lib/publishing/transforms/owned-site-quiplore.ts
apps/quipsly/src/lib/publishing/transforms/podcast-rss.ts
apps/quipsly/src/lib/publishing/transforms/youtube-manual.ts
apps/quipsly/src/lib/publishing/transforms/social-manual.ts
apps/quipsly/src/lib/publishing/transforms/patreon-manual.ts
apps/quipsly/src/lib/publishing/adapters/index.ts
apps/quipsly/src/lib/publishing/adapters/owned-site-adapter.ts
apps/quipsly/src/lib/publishing/adapters/manual-export-adapter.ts
apps/quipsly/src/lib/publishing/adapters/podcast-rss-adapter.ts
```

Create app routes:

```txt
apps/quipsly/src/app/publishing/page.tsx
apps/quipsly/src/app/publishing/packets/page.tsx
apps/quipsly/src/app/publishing/packets/[packetId]/page.tsx
apps/quipsly/src/app/publishing/destinations/page.tsx
apps/quipsly/src/app/publishing/publications/[publicationId]/page.tsx
apps/quipsly/src/app/api/publishing/destinations/seed/route.ts
apps/quipsly/src/app/api/publishing/packets/route.ts
apps/quipsly/src/app/api/publishing/publications/route.ts
apps/quipsly/src/app/api/publishing/jobs/run-one/route.ts
```

Use existing auth gate:

```ts
import { getStudioAccessState } from "@/lib/server/studio-access";
```

`getStudioAccessState()` returns session, roles, actorLabel, `isSignedIn`, and `canAccess`. Observed in `apps/quipsly/src/lib/server/studio-access.ts` lines 6 to 19.

### 7.2 Hash helper

Create `apps/quipsly/src/lib/publishing/hash.ts`:

```ts
import { createHash } from "node:crypto";

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }

  return value;
}

export function hashStableJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
```

Use this for:

```txt
sourceHash
contentHash
payloadHash
idempotencyKey material
```

### 7.3 Projection policy

Create `public-projection-policy.ts`.

This is the customs checkpoint. It decides which private input fields may enter the packet.

```ts
export type PublicProjectionPolicy = {
  id: string;
  label: string;
  sourceSystem: "hgo" | "content-studio" | "quipsly" | "manual";
  allowedSourceTypes: string[];
  requiredApprovals: Array<
    | "human_final"
    | "rights_checked"
    | "citation_review"
    | "public_safety_review"
  >;
  allowRealManuscriptText: boolean;
  allowPrivateNotes: false;
  allowBackstageNotes: false;
  assetRules: {
    requirePublicAssetUrls: boolean;
    requireAltTextForImages: boolean;
    allowedMimeTypes: string[];
  };
};

export const HGO_EPISODE_PUBLIC_PACKET_POLICY: PublicProjectionPolicy = {
  id: "hgo-episode-public-packet-v1",
  label: "HGO episode public packet v1",
  sourceSystem: "hgo",
  allowedSourceTypes: ["hgo-episode-publish-candidate"],
  requiredApprovals: [
    "human_final",
    "rights_checked",
    "citation_review",
    "public_safety_review",
  ],
  allowRealManuscriptText: false,
  allowPrivateNotes: false,
  allowBackstageNotes: false,
  assetRules: {
    requirePublicAssetUrls: false,
    requireAltTextForImages: true,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/mp4"],
  },
};
```

For the first implementation, do not attempt to infer approval from vibes. Use explicit user action or stored approval JSON.

A minimal approval JSON shape:

```ts
export type PublishApprovalInput = {
  humanApproved: boolean;
  rightsChecked: boolean;
  citationReview: "not_required" | "pending" | "approved" | "blocked";
  publicSafetyReview: "pending" | "approved" | "blocked";
  approvedByEmail: string;
  approvedAt: string;
  notes?: string;
};
```

### 7.4 Packet builder service

Create `packet-builder.ts` with these exported functions:

```ts
export async function createPublishPacketFromHgoCandidate(input: {
  candidateId: string;
  ownerEmail: string;
  actorEmail: string;
  approval: PublishApprovalInput;
}): Promise<CreatePublishPacketResult>;

export async function createPublishPacketFromStudioContentProject(input: {
  projectId: string;
  ownerEmail: string;
  actorEmail: string;
  approval: PublishApprovalInput;
}): Promise<CreatePublishPacketResult>;

export async function createPublishPacketFromQuipslyNode(input: {
  nodeId: string;
  ownerEmail: string;
  actorEmail: string;
  approval: PublishApprovalInput;
}): Promise<CreatePublishPacketResult>;
```

Result type:

```ts
type CreatePublishPacketResult =
  | {
      ok: true;
      packetId: string;
      packetVersion: number;
      contentHash: string;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };
```

#### 7.4.1 HGO candidate packet builder rules

Input source:

```txt
HgoEpisodePublishCandidate
```

Prerequisites:

```txt
candidate.ownerEmail matches input.ownerEmail
candidate.archivedAt is null
candidate.candidateStatus is not archived
candidate.readinessState indicates ready, or the packet JSON readiness state is ready-for-human-publish-review
candidate.blockerCount is 0
approval.humanApproved true
approval.rightsChecked true
approval.citationReview approved or not_required
approval.publicSafetyReview approved
```

Important: The existing `HgoEpisodePublishCandidate.mdxDraft` is private review copy. Do not blindly copy it into the packet. For MVP, derive conservative public content:

```txt
title: candidate.projectionTitle
slug: candidate.projectionSlug normalized
summary: from draftPacketJson or reviewBrief if known safe, otherwise explicit placeholder summary requiring user input
body.markdown: approved public MDX only if explicit approval says allowed
body.plainText: short public summary only
```

Codex should implement this in the first safe slice:

```txt
Do not include candidate.mdxDraft in PublishPacket unless a new explicit form field says "include approved public body" and the approval JSON records that body inclusion was reviewed.
```

For MVP, it is acceptable for HGO owned-site packet body to be generated from the existing `draftPacketJson` public-ish projection fields if the builder excludes backstage notes and source notes marked needs-review.

Suggested HGO packet JSON:

```ts
const packet: PublishPacketJson = {
  packetKind: "quipsly-publish-packet-v1",
  schemaVersion: PUBLISH_PACKET_SCHEMA_VERSION,
  source: {
    sourceSystem: "hgo",
    sourceType: "hgo-episode-publish-candidate",
    sourceRefId: candidate.id,
    sourceVersionRef: candidate.sourceArtifactHash,
    sourceHash,
  },
  identity: {
    title: candidate.projectionTitle,
    slug,
    packetKind: "EPISODE",
    packetVersion,
    visibility: "PRIVATE_PREVIEW",
  },
  summary,
  description: summary,
  body: {
    markdown,
    plainText,
  },
  seo: {
    title: candidate.projectionTitle,
    description: summary,
    noindex: true,
  },
  authors: [{ name: "High Ground Odyssey" }],
  publicTags: ["high-ground-odyssey", "episode"],
  topics: [],
  compliance: {
    rightsChecked: approval.rightsChecked,
    humanApproved: approval.humanApproved,
    citationReview: approval.citationReview,
    publicSafetyReview: approval.publicSafetyReview,
  },
  citations: [],
  assets: [],
  channelHints: {
    podcast: {
      showSlug: "high-ground-odyssey",
      episodeType: "full",
    },
    youtube: {
      defaultPrivacy: "private",
    },
    social: {
      campaignName: candidate.projectionTitle,
    },
    patreon: {
      isPublic: false,
    },
  },
  createdAt: new Date().toISOString(),
  createdByEmail: input.actorEmail,
};
```

Then:

```txt
validatePublicSafePacket(packet)
compute contentHash
create PublishSourceSnapshot
create PublishPacket
```

Use a Prisma transaction for snapshot + packet creation.

Pseudo-code:

```ts
return prisma.$transaction(async (tx) => {
  const existingMax = await tx.publishPacket.findFirst({
    where: {
      ownerEmail,
      sourceSystem: "hgo",
      sourceRefId: candidate.id,
    },
    orderBy: { packetVersion: "desc" },
  });

  const packetVersion = (existingMax?.packetVersion ?? 0) + 1;
  const packetJson = buildPacketJson({ packetVersion });
  const validation = validatePublicSafePacket(packetJson);

  if (!validation.ok) {
    throw new PublicPacketValidationError(validation);
  }

  const sourceSnapshot = await tx.publishSourceSnapshot.create({ ... });
  const packet = await tx.publishPacket.create({ ... });

  return { ok: true, packetId: packet.id, packetVersion, contentHash, warnings };
});
```

Handle unique content hash gracefully:

```txt
If same owner/contentHash exists, return existing packet instead of failing.
```

#### 7.4.2 Content Studio project packet builder rules

Input source:

```txt
StudioContentProject
```

Use cases:

```txt
book package
podcast production package
episode page package
social/manual packages
```

Important existing boundary:

`StudioContentProject.productionPacketJson` is a production planning packet, not public state. It explicitly says `providerCalls: false`, `publicPublished: false`, and `requiresHumanReview: true`.

First implementation should not include real manuscript body. It can create public preview packets from safe metadata:

```txt
title
kind
stage
notes only if explicitly public-approved
handoff summary
next action
public-safe target metadata
```

Use this builder mostly for manual export packages and future planning, not public HGO episodes unless the project has gone through the HGO staged artifact queue.

#### 7.4.3 Quipsly node packet builder rules

Input source:

```txt
QuipslyNode
```

Use only for QuipLore quote cards/feed in a later MVP slice.

Rules:

```txt
QuipslyNode.nodeType QUOTE can become QUOTE_CARD.
QuipslyNode.nodeType LORELIST can become QUOTE_FEED.
Payload must validate against @high-ground/quipsly-domain projection types.
Quote verification status must be high-trust for public default: verified or attributed.
Misattributed/disputed/needs-review can be packetized only with explicit explanatory public copy.
```

`packages/quipsly-domain` already exports `isHighTrustStatus(status)` that returns true for `verified` and `attributed`. Observed in `packages/quipsly-domain/src/index.ts` lines 229 to 230.

---

## 8. Destination transforms

### 8.1 Transform interface

Add this in `apps/quipsly/src/lib/publishing/transforms/index.ts`:

```ts
import type { PublishPacketJson } from "@high-ground/publishing-domain";

export type DestinationTransformResult = {
  transformKey: string;
  transformVersion: string;
  payload: unknown;
  payloadHash: string;
  preview: {
    title: string;
    body?: string;
    destinationUrlPreview?: string;
    assets?: string[];
  };
  warnings: string[];
  errors: string[];
};

export type DestinationTransformInput = {
  packet: PublishPacketJson;
  destinationKey: string;
  destinationConfig: Record<string, unknown>;
};

export type DestinationTransform = {
  key: string;
  version: string;
  supportedPacketKinds: string[];
  transform(input: DestinationTransformInput): DestinationTransformResult;
};
```

### 8.2 HGO owned-site episode transform

File:

```txt
apps/quipsly/src/lib/publishing/transforms/owned-site-hgo.ts
```

Transform key:

```txt
owned-site:hgo:episode
```

Version:

```txt
v1
```

Input kind:

```txt
EPISODE
PODCAST_EPISODE
ARTICLE later
```

Payload shape:

```ts
type HgoOwnedSiteEpisodePayload = {
  kind: "hgo-owned-site-episode-v1";
  slug: string;
  route: string;
  title: string;
  subtitle?: string;
  summary: string;
  bodyMarkdown?: string;
  bodyHtml?: string;
  seo: {
    title: string;
    description: string;
    canonicalUrl: string;
    noindex: boolean;
  };
  podcast?: {
    showSlug: string;
    season?: number;
    episode?: number;
    episodeType?: "full" | "trailer" | "bonus";
    durationSeconds?: number;
    audioAssetId?: string;
  };
  assets: Array<{
    id: string;
    kind: string;
    publicUrl: string;
    mimeType?: string;
    altText?: string;
    durationSeconds?: number;
    bytes?: number;
  }>;
  compliance: PublishPacketJson["compliance"];
  source: PublishPacketJson["source"];
};
```

Rules:

```txt
route = /episodes/${slug}
canonicalUrl = config.canonicalBaseUrl + route
noindex = packet.visibility !== PUBLIC
summary required
body optional for first MVP, but reader route should have a fallback if body omitted
```

Validation errors:

```txt
packet.kind not EPISODE or PODCAST_EPISODE
missing title
missing slug
publicSafetyReview not approved
rightsChecked false
humanApproved false
```

Warnings:

```txt
no audio asset for podcast episode
no cover image or thumbnail
no body markdown
visibility not PUBLIC
```

### 8.3 QuipLore quote card transform

File:

```txt
apps/quipsly/src/lib/publishing/transforms/owned-site-quiplore.ts
```

Transform key:

```txt
owned-site:quiplore:quote-card
```

Payload shape:

```ts
type QuipLoreQuoteCardPayload = {
  kind: "quiplore-quote-card-v1";
  slug: string;
  route: string;
  quoteText: string;
  attribution: string;
  sourceHint?: string;
  verificationStatus: string;
  contextNote?: string;
  quipslyNote?: string;
  themes: string[];
  source: PublishPacketJson["source"];
  citations: PublishPacketJson["citations"];
  assets: PublishPacketJson["assets"];
};
```

For first HGO-focused MVP, this transform can be implemented with tests but not wired into public QuipLore routes yet.

### 8.4 Podcast RSS transform

File:

```txt
apps/quipsly/src/lib/publishing/transforms/podcast-rss.ts
```

Transform key:

```txt
podcast-rss:hgo:item
```

Payload shape:

```ts
type PodcastRssItemPayload = {
  kind: "podcast-rss-item-v1";
  showSlug: string;
  guid: string;
  title: string;
  description: string;
  link: string;
  pubDate?: string;
  enclosure?: {
    url: string;
    length: number;
    type: string;
  };
  durationSeconds?: number;
  explicit?: boolean;
  season?: number;
  episode?: number;
  episodeType?: "full" | "trailer" | "bonus";
  transcriptUrl?: string;
};
```

Rules:

```txt
guid must be stable across metadata republishes.
guid should be based on source identity or publicationKey, not random packet id.
enclosure URL must be immutable if audio changes.
pubDate must be RFC 2822 when published.
Do not include items without a valid enclosure in the public feed unless feed config allows trailer/placeholder items, which Apple generally does not want for real episodes.
```

### 8.5 YouTube manual package transform

File:

```txt
apps/quipsly/src/lib/publishing/transforms/youtube-manual.ts
```

Transform key:

```txt
youtube:manual-package
```

Payload shape:

```ts
type YouTubeManualPackagePayload = {
  kind: "youtube-manual-package-v1";
  title: string;
  description: string;
  tags: string[];
  thumbnailAsset?: PublicAssetProjection;
  videoAsset?: PublicAssetProjection;
  chapters: Array<{ label: string; startTime: string }>;
  defaultPrivacy: "private" | "unlisted" | "public";
  madeForKids: boolean | null;
  containsSyntheticMedia: boolean | null;
  canonicalUrl?: string;
  checklist: string[];
};
```

Checklist should include:

```txt
Confirm title and description.
Confirm made-for-kids setting.
Confirm synthetic media disclosure.
Upload video manually.
Upload thumbnail manually.
Paste final YouTube URL back into Quipsly publication record.
```

### 8.6 Social manual package transform

File:

```txt
apps/quipsly/src/lib/publishing/transforms/social-manual.ts
```

Transform keys:

```txt
social:x-manual
social:linkedin-manual
social:instagram-manual
social:facebook-manual
```

Payload shape:

```ts
type SocialManualPackagePayload = {
  kind: "social-manual-package-v1";
  platform: "x" | "linkedin" | "instagram" | "facebook";
  campaignName: string;
  variants: Array<{
    label: string;
    text: string;
    mediaAssetIds: string[];
    linkUrl?: string;
    warnings: string[];
  }>;
  scheduledFor?: string;
  checklist: string[];
};
```

For MVP, do not post. Generate clean copy, assets, and warnings.

### 8.7 Patreon manual package transform

File:

```txt
apps/quipsly/src/lib/publishing/transforms/patreon-manual.ts
```

Transform key:

```txt
patreon:manual-package
```

Payload shape:

```ts
type PatreonManualPackagePayload = {
  kind: "patreon-manual-package-v1";
  title: string;
  publicTeaser: string;
  patronOnlyBodyMarkdown: string;
  patronOnlyBodyHtml?: string;
  suggestedTierIds: string[];
  isPublic: boolean;
  assets: PublicAssetProjection[];
  canonicalUrl?: string;
  checklist: string[];
};
```

Checklist should include:

```txt
Open Patreon manually.
Create post.
Paste title.
Paste public teaser.
Paste patron-only body.
Attach/download assets.
Choose tiers.
Publish or schedule.
Paste resulting Patreon URL back into Quipsly.
```

---

## 9. Destination adapter layer

### 9.1 Adapter interface

Create `apps/quipsly/src/lib/publishing/adapters/index.ts`:

```ts
import type { PublishPacketJson } from "@high-ground/publishing-domain";
import type { DestinationTransformResult } from "../transforms";

export type AdapterResult = {
  ok: boolean;
  remoteId?: string;
  remoteUrl?: string;
  remoteStatus?: string;
  artifactKind: string;
  artifactJson?: unknown;
  warnings: string[];
  errorCode?: string;
  errorMessage?: string;
};

export type PublishAdapterInput = {
  publicationId: string;
  packet: PublishPacketJson;
  destinationKey: string;
  destinationConfig: Record<string, unknown>;
  payload: DestinationTransformResult;
  idempotencyKey: string;
};

export type PublishAdapter = {
  key: string;
  publish(input: PublishAdapterInput): Promise<AdapterResult>;
  republish(input: PublishAdapterInput): Promise<AdapterResult>;
  archive(input: PublishAdapterInput & { currentRemoteId?: string }): Promise<AdapterResult>;
  fetchRemoteStatus?(input: PublishAdapterInput & { currentRemoteId?: string }): Promise<AdapterResult>;
};
```

### 9.2 Owned-site adapter

File:

```txt
apps/quipsly/src/lib/publishing/adapters/owned-site-adapter.ts
```

MVP behavior:

```txt
Do not call external APIs.
Return artifactJson as the transformed owned-site payload.
Remote URL is computed from destination config and slug.
The DB write to RemoteArtifact happens in worker after adapter returns.
```

The adapter can return:

```ts
return {
  ok: true,
  remoteId: input.payload.payloadHash,
  remoteUrl,
  remoteStatus: "active",
  artifactKind: "owned-site-page",
  artifactJson: input.payload.payload,
  warnings: input.payload.warnings,
};
```

### 9.3 Manual export adapter

Manual export destinations are considered successful when Quipsly generates the package artifact. The remote platform has not been updated.

Use remote status:

```txt
manual-export-ready
```

Remote URL is null until the operator pastes one.

Later add a UI action:

```txt
Record external URL
```

This updates `RemoteArtifact.remoteUrl`, `RemoteArtifact.remoteStatus`, and writes a status event.

### 9.4 Podcast RSS adapter

The feed itself is generated dynamically by `apps/web`. Publishing a podcast item means creating or activating a `RemoteArtifact` with `artifactKind = podcast-rss-item`.

The feed route will read active published artifacts for destination `podcast-rss:hgo-main`.

---

## 10. Destination seeding

### 10.1 Seed function

Create:

```txt
apps/quipsly/src/lib/publishing/destination-seeds.ts
```

Implement:

```ts
export async function seedPublishingDestinations(input: {
  actorEmail: string;
}): Promise<{ created: number; updated: number }>;
```

Use Prisma upsert by `key`.

### 10.2 Seed destinations

Seed these first:

```ts
const destinations = [
  {
    key: "owned-site:hgo",
    type: "OWNED_SITE",
    name: "High Ground Odyssey",
    configJson: {
      domain: "highgroundodyssey.com",
      appBaseUrl: process.env.HGO_SITE_URL ?? "https://app.highgroundodyssey.com",
      canonicalBaseUrl: "https://highgroundodyssey.com",
      supportedPacketKinds: ["EPISODE", "PODCAST_EPISODE", "ARTICLE"],
      routeMap: {
        EPISODE: "/episodes/[slug]",
        PODCAST_EPISODE: "/episodes/[slug]",
        ARTICLE: "/updates/[slug]"
      },
      transformKeys: ["owned-site:hgo:episode@v1"]
    },
    capabilitiesJson: {
      canPublish: true,
      canRepublish: true,
      canArchive: true,
      directProviderCall: false,
      ownedByRepo: true
    }
  },
  {
    key: "owned-site:quiplore",
    type: "OWNED_SITE",
    name: "QuipLore",
    configJson: {
      domain: "quiplore.com",
      canonicalBaseUrl: "https://quiplore.com",
      supportedPacketKinds: ["QUOTE_CARD", "QUOTE_FEED", "ARTICLE"],
      routeMap: {
        QUOTE_CARD: "/quotes/[slug]",
        QUOTE_FEED: "/lorelists/[slug]",
        ARTICLE: "/notes/[slug]"
      },
      transformKeys: ["owned-site:quiplore:quote-card@v1"]
    },
    capabilitiesJson: {
      canPublish: true,
      canRepublish: true,
      canArchive: true,
      directProviderCall: false,
      ownedByRepo: true
    }
  },
  {
    key: "podcast-rss:hgo-main",
    type: "PODCAST_RSS",
    name: "High Ground Odyssey Podcast RSS",
    configJson: {
      showSlug: "high-ground-odyssey",
      feedPath: "/podcasts/high-ground-odyssey/feed.xml",
      title: "High Ground Odyssey",
      language: "en-us",
      explicit: false,
      websiteUrl: "https://highgroundodyssey.com",
      transformKeys: ["podcast-rss:hgo:item@v1"]
    },
    capabilitiesJson: {
      canPublish: true,
      canRepublish: true,
      canArchive: true,
      directProviderCall: false,
      generatedFeed: true
    }
  },
  {
    key: "youtube:manual:hgo",
    type: "MANUAL_EXPORT",
    name: "YouTube Manual Package",
    configJson: {
      provider: "youtube",
      transformKeys: ["youtube:manual-package@v1"],
      defaultPrivacy: "private"
    },
    capabilitiesJson: {
      canPublish: true,
      canRepublish: true,
      canArchive: true,
      directProviderCall: false,
      manualExport: true
    }
  },
  {
    key: "social:x:manual:hgo",
    type: "MANUAL_EXPORT",
    name: "X Manual Package",
    configJson: {
      provider: "x",
      transformKeys: ["social:x-manual@v1"]
    },
    capabilitiesJson: {
      canPublish: true,
      canRepublish: true,
      canArchive: true,
      directProviderCall: false,
      manualExport: true
    }
  },
  {
    key: "social:linkedin:manual:hgo",
    type: "MANUAL_EXPORT",
    name: "LinkedIn Manual Package",
    configJson: {
      provider: "linkedin",
      transformKeys: ["social:linkedin-manual@v1"]
    },
    capabilitiesJson: {
      canPublish: true,
      canRepublish: true,
      canArchive: true,
      directProviderCall: false,
      manualExport: true
    }
  },
  {
    key: "patreon:manual:hgo",
    type: "PATREON",
    name: "Patreon Manual Package",
    worldHubProviderKey: "patreon",
    configJson: {
      provider: "patreon",
      transformKeys: ["patreon:manual-package@v1"],
      defaultPublic: false
    },
    capabilitiesJson: {
      canPublish: true,
      canRepublish: true,
      canArchive: true,
      directProviderCall: false,
      manualExport: true,
      webhookTrackingLater: true
    }
  }
];
```

### 10.3 Seed route

Create:

```txt
apps/quipsly/src/app/api/publishing/destinations/seed/route.ts
```

Rules:

```txt
POST only.
Require signed-in Studio access.
Only allow in development or for OWNER role unless Chuck wants broader team access.
Return created/updated counts.
Do not expose secrets.
```

---

## 11. Publication creation and status events

### 11.1 Service file

Create:

```txt
apps/quipsly/src/lib/publishing/destination-publications.ts
```

Functions:

```ts
export async function createDraftPublicationForDestination(input: {
  packetId: string;
  destinationKey: string;
  ownerEmail: string;
  actorEmail: string;
}): Promise<CreatePublicationResult>;

export async function queuePublication(input: {
  publicationId: string;
  actorEmail: string;
  scheduledFor?: Date;
}): Promise<QueuePublicationResult>;

export async function archivePublication(input: {
  publicationId: string;
  actorEmail: string;
  reason?: string;
}): Promise<ArchivePublicationResult>;

export async function markPublicationExternalUrl(input: {
  publicationId: string;
  remoteUrl: string;
  actorEmail: string;
  note?: string;
}): Promise<MarkExternalUrlResult>;
```

### 11.2 Draft publication flow

Pseudo-code:

```ts
export async function createDraftPublicationForDestination(input) {
  const packet = await prisma.publishPacket.findFirst({
    where: { id: input.packetId, ownerEmail: input.ownerEmail, archivedAt: null },
  });

  const destination = await prisma.publishDestination.findUnique({
    where: { key: input.destinationKey },
  });

  const packetJson = assertPublishPacketJson(packet.packetJson);
  const transform = getTransformForDestination(destination, packetJson);
  const transformResult = transform.transform({ packet: packetJson, destinationKey: destination.key, destinationConfig });

  if (transformResult.errors.length) {
    return { ok: false, errors: transformResult.errors, warnings: transformResult.warnings };
  }

  const publicationKey = createPublicationKey({
    destinationKey: destination.key,
    packetKind: packetJson.identity.packetKind,
    slug: packetJson.identity.slug,
  });

  return prisma.$transaction(async (tx) => {
    const publication = await tx.destinationPublication.upsert({
      where: { destinationId_publicationKey: { destinationId: destination.id, publicationKey } },
      create: {
        ownerEmail: input.ownerEmail,
        ownerUserId: packet.ownerUserId,
        destinationId: destination.id,
        publicationKey,
        title: packet.title,
        slug: packet.slug,
        status: "DRAFT",
        desiredPacketId: packet.id,
        transformKey: transformResult.transformKey,
        transformVersion: transformResult.transformVersion,
        renderedPayloadJson: transformResult.payload,
        payloadHash: transformResult.payloadHash,
        createdByEmail: input.actorEmail,
      },
      update: {
        desiredPacketId: packet.id,
        title: packet.title,
        slug: packet.slug,
        transformKey: transformResult.transformKey,
        transformVersion: transformResult.transformVersion,
        renderedPayloadJson: transformResult.payload,
        payloadHash: transformResult.payloadHash,
      },
    });

    await tx.publishStatusEvent.create({
      data: {
        publicationId: publication.id,
        fromStatus: null,
        toStatus: publication.status,
        operation: "CREATE",
        reason: "Draft publication created or refreshed.",
        actorEmail: input.actorEmail,
      },
    });

    return { ok: true, publicationId: publication.id, warnings: transformResult.warnings };
  });
}
```

If the publication already exists and is PUBLISHED, updating `desiredPacketId` should not silently change public output. It should remain current until queued/published.

### 11.3 Queue publication flow

```txt
DRAFT or FAILED or PUBLISHED or REPUBLISHED
  -> QUEUED
```

When queueing:

```txt
Create PublishJob with idempotencyKey.
Write PublishStatusEvent.
Set scheduledFor if provided.
Set status QUEUED.
```

Idempotency material:

```txt
publicationId
operation
packetId
payloadHash
destinationId
scheduledFor or immediate
```

Example key string:

```ts
const idempotencyKey = hashStableJson({
  publicationId,
  operation,
  packetId: publication.desiredPacketId,
  destinationId: publication.destinationId,
  payloadHash: publication.payloadHash,
});
```

### 11.4 Status event helper

Create:

```txt
apps/quipsly/src/lib/publishing/status-events.ts
```

Implement:

```ts
export async function transitionPublicationStatusTx(input: {
  tx: Prisma.TransactionClient;
  publicationId: string;
  toStatus: DestinationPublicationStatus;
  operation?: PublishOperation;
  actorEmail?: string;
  jobId?: string;
  reason?: string;
  metadataJson?: Prisma.InputJsonValue;
}): Promise<void>;
```

This helper should:

```txt
Load current publication.
Check canTransitionDestinationPublicationStatus.
Update publication current status and timestamps.
Insert PublishStatusEvent.
```

Timestamps:

```txt
PUBLISHED: set publishedAt if null.
REPUBLISHED: set republishedAt to now.
ARCHIVED: set archivedAt to now.
FAILED: set lastError fields from metadata.
PUBLISHING: set lastAttemptAt to now.
```

---

## 12. Worker and job processing

### 12.1 Worker file

Create:

```txt
apps/quipsly/src/lib/publishing/worker.ts
```

Export:

```ts
export async function runNextPublishJob(input: {
  workerId: string;
  now?: Date;
}): Promise<RunJobResult>;
```

### 12.2 Worker flow

```txt
1. Find one PENDING job where runAt <= now.
2. Lock it by setting status LOCKED, lockedAt, lockedBy, attempts + 1.
3. Load publication, desired packet, destination.
4. Transition publication QUEUED -> PUBLISHING.
5. Run transform again or use stored rendered payload.
6. Select adapter by destination type/config.
7. Call publish, republish, archive, or export.
8. In a transaction:
   - create PublishAttempt
   - create RemoteArtifact if successful
   - supersede old active artifacts if successful republish
   - update publication publishedPacketId/currentArtifactId/remoteUrl/remoteId
   - transition status to PUBLISHED or REPUBLISHED or ARCHIVED
   - mark job SUCCEEDED
9. On failure:
   - create PublishAttempt
   - transition publication to FAILED
   - mark job FAILED or PENDING for retry with backoff if attempts < maxAttempts
```

### 12.3 Avoid double workers

For MVP, a simple lock update is okay.

Pseudo-code:

```ts
const job = await prisma.publishJob.findFirst({
  where: { status: "PENDING", runAt: { lte: now } },
  orderBy: { runAt: "asc" },
});

if (!job) return { ok: true, status: "idle" };

const locked = await prisma.publishJob.updateMany({
  where: { id: job.id, status: "PENDING" },
  data: {
    status: "LOCKED",
    lockedAt: now,
    lockedBy: workerId,
    attempts: { increment: 1 },
  },
});

if (locked.count !== 1) return { ok: true, status: "lost-lock" };
```

This is not a perfect queue, but it is enough for MVP and matches the repo's pragmatic vertical-slice posture.

### 12.4 Dev/operator route

Create:

```txt
apps/quipsly/src/app/api/publishing/jobs/run-one/route.ts
```

Rules:

```txt
POST only.
Require Studio access.
In production, require OWNER role or env PUBLISHING_RUN_ONE_ENABLED=1.
Run exactly one job.
Return a concise result.
```

Later, move worker to Cloud Run Jobs, Cloud Tasks, Pub/Sub, Inngest, or Temporal.

---

## 13. HGO owned-site migration

This is the highest-value MVP slice. The current HGO public route uses `HgoEpisodePublishCandidate` as public content. Move it to the new ledger.

### 13.1 Add public query helper in `apps/web`

Create:

```txt
apps/web/src/lib/server/published-episodes.ts
```

Export:

```ts
export type PublishedEpisodeSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  route: string;
  remoteUrl: string | null;
  publishedAt: string | null;
  payload: unknown;
};

export async function listPublishedHgoEpisodes(input?: {
  take?: number;
}): Promise<PublishedEpisodeSummary[]>;

export async function getPublishedHgoEpisodeBySlug(input: {
  slug: string;
}): Promise<PublishedEpisodeSummary | null>;
```

Query should join:

```txt
PublishDestination where key = owned-site:hgo
DestinationPublication where status in PUBLISHED, REPUBLISHED and slug = input.slug
RemoteArtifact where active = true and artifactKind = owned-site-page
PublishPacket for packet JSON if needed
```

Prisma include example:

```ts
const destination = await prisma.publishDestination.findUnique({
  where: { key: "owned-site:hgo" },
});

const publications = await prisma.destinationPublication.findMany({
  where: {
    destinationId: destination.id,
    status: { in: ["PUBLISHED", "REPUBLISHED"] },
    archivedAt: null,
  },
  include: {
    artifacts: {
      where: { active: true, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
    },
    publishedPacket: true,
  },
  orderBy: { publishedAt: "desc" },
  take,
});
```

### 13.2 Modify EpisodeFeed

File:

```txt
apps/web/src/components/home/EpisodeFeed.tsx
```

Current:

```ts
const publishedEpisodes = await prisma.hgoEpisodePublishCandidate.findMany({
  where: { candidateStatus: "published" },
  orderBy: { createdAt: "desc" },
  take: 6,
});
```

Replace with:

```ts
import { listPublishedHgoEpisodes } from "@/lib/server/published-episodes";

export default async function EpisodeFeed() {
  const feed = await listPublishedHgoEpisodes({ take: 6 });
  ...
}
```

Optional legacy fallback:

```ts
const allowLegacy = process.env.HGO_LEGACY_PUBLISH_CANDIDATE_FEED === "1";
```

Do not leave legacy fallback enabled by default.

### 13.3 Modify EpisodeCard

File:

```txt
apps/web/src/components/home/EpisodeCard.tsx
```

Current component is a stub. Replace with a typed component that can render `PublishedEpisodeSummary`:

```tsx
import Link from "next/link";
import type { PublishedEpisodeSummary } from "@/lib/server/published-episodes";

export default function EpisodeCard({ episode }: { episode: PublishedEpisodeSummary }) {
  return (
    <article className="border border-white/10 p-4 rounded-xl">
      <h3>{episode.title}</h3>
      <p>{episode.summary}</p>
      <Link href={`/episodes/${episode.slug}/read`}>Read companion</Link>
    </article>
  );
}
```

Keep styling consistent with existing HGO UI if time allows.

### 13.4 Modify reader route

File:

```txt
apps/web/src/app/episodes/[slug]/read/page.tsx
```

Current route queries `hgoEpisodePublishCandidate` by `projectionSlug`. Replace with `getPublishedHgoEpisodeBySlug`.

Reader content source priority:

```txt
artifact.payload.bodyHtml
artifact.payload.bodyMarkdown
packet.body.html
packet.body.markdown
packet.body.plainText
safe fallback saying content package is missing body
```

Keep membership/staff gating logic if it is still needed for snippets and interactive reader. Do not let member gating imply the private source is safe to expose.

### 13.5 What to do with `executeHgoEpisodePublishCandidate`

Do not delete immediately, because existing UI may call it. Instead:

1. Add a big comment above it:

```ts
// LEGACY BRIDGE ONLY.
// Do not use for new publishing flows.
// New publication should go through PublishPacket + DestinationPublication.
```

2. Add an environment guard:

```ts
if (process.env.HGO_LEGACY_DIRECT_MDX_PUBLISH_ENABLED !== "1") {
  return { ok: false, error: "Legacy direct MDX publish is disabled. Use the publishing ledger." };
}
```

3. Change the UI action label, if exposed, to make it clear this is legacy.

4. Open a follow-up task to remove it after the new ledger path has shipped.

This prevents a footgun while preserving rollback.

---

## 14. Podcast RSS MVP

### 14.1 Feed route

Create in `apps/web`:

```txt
apps/web/src/app/podcasts/[showSlug]/feed.xml/route.ts
```

or:

```txt
apps/web/src/app/api/public/feeds/podcast/[showSlug]/route.ts
```

Prefer the public pretty route:

```txt
/podcasts/high-ground-odyssey/feed.xml
```

### 14.2 Feed generator file

Create:

```txt
apps/web/src/lib/publishing/podcast-rss.ts
```

Export:

```ts
export async function buildPodcastFeedXml(input: {
  showSlug: string;
}): Promise<{ ok: true; xml: string } | { ok: false; status: number; message: string }>;
```

### 14.3 Query source

Read active published artifacts from destination:

```txt
podcast-rss:hgo-main
```

Only include publications where:

```txt
status PUBLISHED or REPUBLISHED
archivedAt null
active RemoteArtifact exists
payload has enclosure URL, length, type
```

### 14.4 XML requirements

Include namespaces:

```xml
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:atom="http://www.w3.org/2005/Atom">
```

Channel fields:

```txt
title
description
link
language
itunes:author
itunes:owner
itunes:explicit
itunes:category
itunes:image
atom:link rel="self"
lastBuildDate
```

Item fields:

```txt
title
description
pubDate in RFC 2822
guid isPermaLink="false"
enclosure url length type
itunes:duration
itunes:explicit
itunes:season when available
itunes:episode when available
itunes:episodeType when available
podcast:transcript when available
```

### 14.5 XML escaping

Implement helper:

```ts
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
```

Use `new Date(date).toUTCString()` for RSS pubDate.

### 14.6 Podcast artifact validation

Before publishing a podcast RSS item, transform validation should require:

```txt
audio asset exists
audio asset has publicUrl
audio asset has bytes
audio asset has mimeType, preferably audio/mpeg
durationSeconds exists or warning
guid stable
```

Do not generate a real podcast feed item without a valid enclosure.

---

## 15. Manual export packages

### 15.1 Package UI

On publication detail pages in `apps/quipsly`:

```txt
show rendered payload JSON
show copyable Markdown/HTML/plain text sections
show asset list
show checklist
show button: Record external URL
show button: Mark archived
show status event history
```

### 15.2 YouTube package display

Show:

```txt
Title
Description
Tags
Thumbnail asset
Video asset
Chapters
Compliance answers
Canonical HGO URL
Checklist
```

Add a warning:

```txt
This package has not been uploaded to YouTube. Manual export generated only.
```

### 15.3 Social package display

Show platform tabs:

```txt
X
LinkedIn
Instagram
Facebook
```

Each variant should show:

```txt
text
character count
asset list
link URL
warnings
copy button
```

### 15.4 Patreon package display

Show:

```txt
Title
Public teaser
Patron-only Markdown
Patron-only HTML if available
Tier notes
Assets
Canonical URL
Checklist
External Patreon URL field
```

Do not claim that Quipsly posted to Patreon.

---

## 16. Publishing cockpit UI

### 16.1 Route structure

Add private routes in `apps/quipsly`:

```txt
/publishing
/publishing/packets
/publishing/packets/[packetId]
/publishing/destinations
/publishing/publications/[publicationId]
```

Use `export const dynamic = "force-dynamic";` for admin pages that read fresh DB state.

### 16.2 Main dashboard

`/publishing` should show:

```txt
Packet counts by kind
Publication counts by status
Failed publications
Queued jobs
Recently published artifacts
Destination readiness
Links to HGO private queue and Content Studio
```

### 16.3 Packet detail page

For each packet show:

```txt
Title
Kind
Slug
Version
Visibility
Source system/source ref
Content hash
Approval summary
Public safety review status
Rights checked status
Citation review status
Packet JSON preview
Destination cards
```

Destination card states:

```txt
Not configured
Draft exists
Queued
Published
Failed
Republished
Archived
```

Actions:

```txt
Create draft publication
Queue publish
Schedule publish
Retry failed
Archive
Generate manual export
```

### 16.4 Publication detail page

Show:

```txt
Destination
Publication key
Current status
Desired packet
Published packet
Remote URL
Payload preview
Artifacts
Attempt log
Status event history
Queue/retry/archive buttons
Manual external URL form
```

### 16.5 Approval UI for HGO candidate to PublishPacket

Add either:

```txt
apps/quipsly/src/app/publishing/create-from-hgo-candidate/page.tsx
```

or add action controls to the existing HGO candidate detail page later.

First slice can expose an API route plus simple form:

```txt
Candidate ID
Confirm human approved
Confirm rights checked
Citation review: approved/not_required
Public safety review: approved
Optional notes
Create PublishPacket
```

Do not auto-create packets from every candidate.

---

## 17. API routes in `apps/quipsly`

### 17.1 Packet route

```txt
apps/quipsly/src/app/api/publishing/packets/route.ts
```

Methods:

```txt
GET list packets for owner
POST create packet from source
```

POST body:

```ts
type CreatePacketRequest = {
  sourceSystem: "hgo" | "content-studio" | "quipsly";
  sourceType: string;
  sourceRefId: string;
  approval: PublishApprovalInput;
};
```

Behavior:

```txt
Require Studio access.
Normalize ownerEmail from session primaryEmail/email.
Dispatch to packet builder.
Return packetId and warnings.
```

### 17.2 Publications route

```txt
apps/quipsly/src/app/api/publishing/publications/route.ts
```

Methods:

```txt
POST create draft publication or queue publication depending action
```

POST body:

```ts
type PublicationActionRequest =
  | { action: "create-draft"; packetId: string; destinationKey: string }
  | { action: "queue"; publicationId: string; scheduledFor?: string }
  | { action: "archive"; publicationId: string; reason?: string }
  | { action: "record-external-url"; publicationId: string; remoteUrl: string; note?: string };
```

### 17.3 Run-one job route

As described in section 12.4.

---

## 18. Republish and rollback model

### 18.1 Republish

Republish means:

```txt
new PublishPacket created
existing DestinationPublication.desiredPacketId updated to new packet
publication queued with operation REPUBLISH
worker creates a new RemoteArtifact
old active RemoteArtifact.active = false
old artifact.supersededById = newArtifact.id
publication.publishedPacketId = new packet
publication.currentArtifactId = new artifact
status moves to REPUBLISHED
```

### 18.2 Archive

Archive means:

```txt
publication.status = ARCHIVED
publication.archivedAt = now
active RemoteArtifact.active = false
active RemoteArtifact.archivedAt = now
public query helpers ignore archived publication/artifact
status event records actor and reason
```

Owned site rollback is just a special republish/archive action that points back to an earlier artifact or packet.

### 18.3 Owned-site rollback

Add a future helper:

```ts
export async function rollbackPublicationToArtifact(input: {
  publicationId: string;
  artifactId: string;
  actorEmail: string;
  reason: string;
})
```

Rules:

```txt
artifact must belong to publication
artifact must not be archived
current artifact becomes inactive
selected artifact becomes active
publication.publishedPacketId = selected artifact packetId
publication.currentArtifactId = selected artifact id
status = REPUBLISHED
status event reason = rollback
```

### 18.4 Podcast rollback caution

Podcast clients cache feeds and enclosures. Do not promise instant rollback. For podcast RSS:

```txt
Metadata edits can republish same GUID.
Audio file changes should usually create a new immutable enclosure URL.
Deleting items can have unpredictable client behavior.
Corrections may be safer than deletion.
```

---

## 19. Direct API integrations later

Do not build these in MVP. Design for them.

### 19.1 YouTube phase 2

Future adapter flow:

```txt
OAuth connect channel
validate title/description/tags/thumbnail/compliance
create resumable upload with videos.insert
upload media
poll videos.list status
upload thumbnail with thumbnails.set
store videoId, watch URL, uploadStatus, privacyStatus
queue publishAt if scheduled
```

Extra model needs later:

```txt
DestinationAccount encrypted tokens
OAuth scopes
token expiry
provider audit state
quota usage
```

### 19.2 Social phase 2

Future X/LinkedIn/Meta adapters should each have their own transform and validator. Keep Quipsly scheduling app-owned:

```txt
Quipsly scheduledFor controls queue time.
Platform native scheduling is optional later.
```

### 19.3 Patreon phase 2

Future Patreon work should start with:

```txt
webhook tracking of posts:publish, posts:update, posts:delete
manual URL reconciliation
supporter entitlement stays in WorldHub
```

Do not build normal post creation unless official docs and app permissions confirm a supported path.

---

## 20. Tests to add

### 20.1 Package/domain tests

Create:

```txt
scripts/publishing-domain.test.mjs
```

Test:

```txt
status transition allowed cases
status transition blocked cases
slug normalization
publication key generation
public packet validation blocks missing human approval
public packet validation blocks missing rights check
public packet validation blocks publicSafetyReview not approved
public packet validation warns image asset missing alt text
```

Root script to add:

```json
"publishing:domain:test": "node --experimental-strip-types --test scripts/publishing-domain.test.mjs"
```

### 20.2 Packet builder tests

Create:

```txt
scripts/publishing-packet-builder.test.mjs
```

Use synthetic HGO candidate fixture similar to `scripts/hgo-publish-candidate-packet.test.mjs`.

Test:

```txt
creates PublishPacketJson from ready synthetic HGO candidate
blocks missing approval
blocks candidate with blockerCount > 0
does not include backstage/private notes
does not call provider APIs
content hash stable for identical input
new version increments when source changes
```

If DB calls make this hard, split pure packet JSON builder from DB persistence and test the pure builder first.

### 20.3 Transform tests

Create:

```txt
scripts/publishing-transforms.test.mjs
```

Test:

```txt
HGO owned-site transform maps EPISODE to /episodes/[slug]
HGO transform errors if public safety not approved
Podcast transform requires audio enclosure
YouTube manual package creates checklist and default private visibility
Patreon manual package creates teaser/body/checklist and does not claim remote publish
Social manual package creates platform variants
```

### 20.4 Worker tests

Create:

```txt
scripts/publishing-worker.test.mjs
```

This can be pure/in-memory for first pass or use a test DB only if the repo already has a safe pattern.

Test the service-level functions where possible:

```txt
queue creates one job with idempotency key
retry does not create duplicate remote artifacts for same idempotency key
success creates RemoteArtifact and status event
failure marks FAILED and records attempt
archive hides artifact from public query helper
```

### 20.5 RSS tests

Create:

```txt
scripts/podcast-rss-feed.test.mjs
```

Test pure XML generator:

```txt
escapes XML
includes rss/channel/item/enclosure/guid/pubDate
uses RFC 2822 dates
omits invalid item or returns validation error
includes atom self link
```

### 20.6 Regression tests to keep passing

Run these after implementation:

```bash
pnpm hgo:publish-candidate:test
pnpm hgo:artifact:test
pnpm hgo:store-lab:test
pnpm content-studio:packet:test
pnpm quipsly:domain:typecheck
pnpm content-studio:domain:typecheck
pnpm --filter @high-ground/publishing-domain typecheck
pnpm --filter quipsly typecheck
pnpm --filter web build
```

If build is too slow during early iteration, still run typechecks and focused tests before handing off.

---

## 21. Root package scripts to add

Add to root `package.json`:

```json
{
  "publishing:domain:build": "pnpm --filter @high-ground/publishing-domain build",
  "publishing:domain:typecheck": "pnpm --filter @high-ground/publishing-domain typecheck",
  "publishing:domain:test": "node --experimental-strip-types --test scripts/publishing-domain.test.mjs",
  "publishing:transforms:test": "node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/publishing-transforms.test.mjs",
  "publishing:packet:test": "node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/publishing-packet-builder.test.mjs",
  "publishing:rss:test": "node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/podcast-rss-feed.test.mjs"
}
```

If tests import TS from `apps/quipsly`, use the same loader style as existing HGO tests.

---

## 22. Implementation phases

### Phase 0: Baseline and branch safety

Codex should begin by running:

```bash
git status --short
pnpm db:generate
pnpm hgo:publish-candidate:test
pnpm content-studio:packet:test
```

If tests fail before changes, record the baseline failure and do not claim the new work caused it.

Create a branch:

```bash
git checkout -b quipsly-publishing-ledger-mvp
```

### Phase 1: Pure domain package

Deliverables:

```txt
packages/publishing-domain
root scripts for typecheck/build/test
publishing-domain.test.mjs
```

Acceptance:

```bash
pnpm publishing:domain:typecheck
pnpm publishing:domain:test
```

### Phase 2: Prisma schema

Deliverables:

```txt
new enums
new publishing ledger models
Prisma generate passes
migration created or db push documented
```

Acceptance:

```bash
pnpm db:generate
```

If using migration:

```bash
pnpm db:migrate
```

### Phase 3: Destination seeds and transforms

Deliverables:

```txt
destination-seeds.ts
transforms for HGO, QuipLore, podcast RSS, YouTube manual, social manual, Patreon manual
transform tests
seed API route or script
```

Acceptance:

```bash
pnpm publishing:transforms:test
pnpm --filter quipsly typecheck
```

### Phase 4: Packet builder from HGO candidate

Deliverables:

```txt
public-projection-policy.ts
packet-builder.ts
createPublishPacketFromHgoCandidate()
packet tests
packet API route
basic packet list/detail UI
```

Acceptance:

```bash
pnpm publishing:packet:test
pnpm --filter quipsly typecheck
```

### Phase 5: DestinationPublication and owned-site HGO publish

Deliverables:

```txt
create draft publication service
queue publication service
worker run-one service
owned-site adapter
publication detail UI
HGO public query helper in apps/web
EpisodeFeed uses new query helper
reader route uses new query helper
legacy direct MDX publish disabled by default
```

Acceptance:

```bash
pnpm --filter quipsly typecheck
pnpm --filter web build
```

Manual acceptance:

```txt
Seed destinations.
Create synthetic or reviewed packet.
Create HGO draft publication.
Queue it.
Run one job.
See status PUBLISHED.
See RemoteArtifact active.
See HGO episode feed read from new ledger.
Archive publication.
Confirm HGO feed hides it.
```

### Phase 6: Podcast RSS

Deliverables:

```txt
podcast RSS transform validation
podcast feed route in apps/web
RSS XML generator tests
```

Acceptance:

```bash
pnpm publishing:rss:test
pnpm --filter web build
```

Manual acceptance:

```txt
Publish an episode packet to podcast-rss:hgo-main.
Open /podcasts/high-ground-odyssey/feed.xml.
Confirm XML includes one valid item with enclosure.
```

### Phase 7: Manual export packages

Deliverables:

```txt
YouTube manual publication
Social manual publication
Patreon manual publication
UI copy/download panels
record external URL action
```

Acceptance:

```txt
Manual export publication can be generated and marked PUBLISHED as an export artifact.
No external API calls occur.
Operator can paste external URL afterward.
Status event history records URL addition.
```

### Phase 8: QuipLore destination starter

Deliverables:

```txt
QuipLore quote-card transform tested
seed owned-site:quiplore destination
optional placeholder public query helper for future QuipLore DB-backed packets
```

Do not force `apps/quiplore` off seed data in the first HGO-oriented PR unless the implementation is small and safe.

### Phase 9: Direct APIs later

Do not implement in MVP.

Prepare docs only:

```txt
YouTube OAuth/upload adapter plan
LinkedIn/X direct-post plan
Patreon webhook tracking plan
Meta permissions plan
```

---

## 23. Public-safe derivation details

### 23.1 Field allowlist examples

For HGO candidate source:

Allowed by default:

```txt
projectionTitle
projectionSlug
proposedRoute
sourceArtifactHash
review status metadata
approved public summary if present
approved public body only if explicitly approved
approved public assets only
```

Blocked by default:

```txt
raw staged artifact JSON
backstage notes
source notes with needs-review
pull quotes with needs-review
private manuscript text
internal review brief notes
operator handoff instructions
candidate.mdxDraft unless explicitly approved for public body
```

For Content Studio project:

Allowed by default:

```txt
title
kind
workflow
handoff progress
safe delivery target metadata
safe checklist labels
```

Blocked by default:

```txt
real manuscript text
private notes unless explicitly copied into public summary
agent prompts containing private context
backstage notes
raw project JSON
```

For Quipsly quote node:

Allowed by default:

```txt
quote text
attribution
source title
verification status
public context note
public themes
approved visual asset
```

Blocked by default:

```txt
private research notes
unverified evidence excerpts
rights-review merch notes
agent decision log unless converted into public explanation
```

### 23.2 Approval JSON convention

Store approval in `PublishPacket.approvalJson`:

```json
{
  "approvalKind": "publish-packet-approval-v1",
  "humanApproved": true,
  "rightsChecked": true,
  "citationReview": "approved",
  "publicSafetyReview": "approved",
  "approvedByEmail": "operator@example.com",
  "approvedAt": "2026-06-05T18:00:00.000Z",
  "notes": "Reviewed HGO episode packet. No private manuscript text included."
}
```

### 23.3 Derived-from JSON convention

Store source mapping in `PublishPacket.derivedFromJson`:

```json
{
  "derivationKind": "publish-packet-derivation-v1",
  "policyId": "hgo-episode-public-packet-v1",
  "sourceFieldsIncluded": [
    "projectionTitle",
    "projectionSlug",
    "sourceArtifactHash",
    "approvedSummary"
  ],
  "sourceFieldsExcluded": [
    "mdxDraft",
    "artifactJson",
    "backstageNotes",
    "operatorHandoff"
  ],
  "assetIdsIncluded": [],
  "warnings": []
}
```

---

## 24. Owned-site URL and canonical decisions

The repo currently uses `https://app.highgroundodyssey.com` as the live Cloud Run app domain in current-state docs. Product language also refers to `HighGroundOdyssey.com`.

For config, store both:

```json
{
  "appBaseUrl": "https://app.highgroundodyssey.com",
  "canonicalBaseUrl": "https://highgroundodyssey.com"
}
```

Use `appBaseUrl` for operational links if the public domain is not routed yet.

Use `canonicalBaseUrl` for SEO when the public domain is confirmed.

Add an open question for Chuck if unclear:

```txt
Should public episode remoteUrl be app.highgroundodyssey.com or highgroundodyssey.com in MVP?
```

Do not block implementation. Make it configurable.

---

## 25. Security and access control

### 25.1 Admin UI

All `apps/quipsly` publishing admin routes must require:

```txt
signed in
canAccessStudio true
```

For destructive or public-impacting actions such as queue publish, archive, or rollback, require one of:

```txt
OWNER role
PUBLISHING_ALLOW_TEAM_OPERATORS=1
NODE_ENV=development
```

Use the existing session roles from NextAuth. `apps/quipsly/src/auth.ts` already enriches tokens with `roles` and `isStaff`.

### 25.2 API routes

All POST routes should:

```txt
parse JSON safely
reject invalid body
require auth
normalize owner email
never accept ownerEmail directly from the client as authority
return concise errors
log server details privately
```

### 25.3 Webhook/revalidation signatures later

If adding signed revalidation route later, use HMAC with a secret:

```txt
PUBLISHING_REVALIDATE_SECRET
```

Headers:

```txt
x-quipsly-signature
x-quipsly-timestamp
```

Do not add this until needed. Same-DB owned-site reading avoids this in MVP.

---

## 26. File-writing warning

Avoid public publishing by writing files in app runtime:

```txt
fs.writeFile(process.cwd() + /content/publish/...)
```

This pattern is present in `executeHgoEpisodePublishCandidate()`, but it should not become the final architecture.

Reasons:

```txt
Cloud Run container filesystem is not a durable content store.
It bypasses the packet/version/status ledger.
It makes rollback a git/runtime artifact problem instead of an app state problem.
It confuses private intent with public publication.
```

The new owned-site adapter should write database artifacts and let public routes render from them.

---

## 27. Data migration strategy

### 27.1 Do not migrate everything at once

Leave existing HGO staged artifacts and candidates untouched.

Add new packet creation actions for selected candidates.

### 27.2 Optional legacy import script

Later, create:

```txt
scripts/publishing-import-legacy-hgo-candidates.mjs
```

It should:

```txt
find HgoEpisodePublishCandidate rows with candidateStatus published
for each, create PublishSourceSnapshot
create PublishPacket only if approval can be safely represented
create DestinationPublication owned-site:hgo
create RemoteArtifact
mark status PUBLISHED
```

But do not run automatically. This requires human review because existing `published` status may not mean public-safety review was completed under the new rules.

### 27.3 New content only first

MVP success can be demonstrated with one synthetic or reviewed HGO candidate, not a full migration.

---

## 28. Suggested UI copy

Use clear language in UI so humans understand what happened.

Packet state copy:

```txt
Public-safe packet
A reviewed, immutable output derived from private source material. Destinations can publish this packet, but the packet itself does not mean any destination is live.
```

Destination draft copy:

```txt
Draft destination publication
The packet has been transformed for this destination, but it is not queued or live.
```

Queued copy:

```txt
Queued
This destination publication is waiting for a worker or scheduled time.
```

Published copy:

```txt
Published
Quipsly has an active artifact for this destination.
```

Manual export copy:

```txt
Manual export ready
Quipsly generated the package. The external platform has not been updated unless an operator records the external URL.
```

Failed copy:

```txt
Failed
The last publish attempt failed. Review the attempt log before retrying.
```

Archived copy:

```txt
Archived
This destination artifact is no longer active in Quipsly public queries.
```

---

## 29. Concrete first vertical slice

If Codex needs a crisp first PR target, do this exact slice:

```txt
1. Add @high-ground/publishing-domain.
2. Add Prisma publishing ledger models.
3. Add destination seed service and seed route.
4. Add HGO owned-site transform.
5. Add packet builder from HGO candidate with strict approval JSON.
6. Add create draft publication and queue publication services.
7. Add run-one worker with owned-site adapter.
8. Add apps/web public query helper.
9. Change EpisodeFeed and reader route to use new ledger.
10. Add tests for domain, transform, and packet builder.
```

Do not include YouTube, social, Patreon UI in the first PR unless the first slice is already clean. Add them as Phase 7.

---

## 30. Acceptance checklist for MVP

A complete MVP should satisfy all of this:

```txt
[ ] Prisma schema compiles with new publishing models.
[ ] @high-ground/publishing-domain typechecks.
[ ] Destination seed creates HGO, QuipLore, podcast RSS, YouTube manual, social manual, Patreon manual destinations.
[ ] A ready HGO private publish candidate can be converted into a PublishPacket only with explicit approval.
[ ] Missing rights, public-safety, human, or citation approval blocks packet creation.
[ ] PublishPacket packetJson is immutable after creation by convention and code paths.
[ ] HGO owned-site destination publication can be created as DRAFT.
[ ] HGO owned-site publication can be queued.
[ ] run-one worker publishes the queued item into RemoteArtifact.
[ ] Status event is written for DRAFT, QUEUED, PUBLISHING, PUBLISHED or FAILED.
[ ] Attempt log is written.
[ ] HGO episode feed reads from DestinationPublication/RemoteArtifact, not HgoEpisodePublishCandidate.
[ ] HGO reader route reads from DestinationPublication/RemoteArtifact, not HgoEpisodePublishCandidate.
[ ] Legacy direct MDX publish is disabled by default.
[ ] Archive hides an HGO episode from public query helpers.
[ ] Republish creates a new artifact and supersedes the old active artifact.
[ ] Podcast RSS route can produce valid XML from a published podcast artifact.
[ ] YouTube/social/Patreon manual packages can be generated without external API calls.
[ ] Existing HGO staged artifact tests still pass.
[ ] Existing Content Studio packet tests still pass.
```

---

## 31. Risks and anti-patterns

### 31.1 Highest risks

Private/public leakage:

```txt
The biggest risk is copying private manuscript, backstage, source-note, or review material into packetJson.
```

Legacy HGO direct file write:

```txt
The existing executeHgoEpisodePublishCandidate() function can bypass the new ledger if left as-is.
```

Cloud Run filesystem assumption:

```txt
Runtime file writes are not durable publication in Cloud Run.
```

Mutable packet JSON:

```txt
Updating packetJson after publish destroys auditability.
```

Provider API overreach:

```txt
YouTube, social, and Patreon direct APIs require OAuth, scopes, app review, quota, policy, retries, and better token storage. Manual packages first.
```

Podcast feed identity mistakes:

```txt
Changing GUIDs or enclosure URLs carelessly can confuse podcast clients.
```

### 31.2 Anti-patterns to reject in code review

```txt
[ ] Adapter imports prisma and reads raw Studio/HGO/Quipsly source tables.
[ ] One publishAll() function handles every destination with conditionals.
[ ] PublishPacket has a single global published status.
[ ] packetJson is updated in place.
[ ] OAuth tokens are stored in PublishDestination.configJson.
[ ] UI server action calls YouTube/X/Patreon directly.
[ ] Job retry can create duplicate social posts or remote artifacts without idempotency.
[ ] Public HGO routes query HgoEpisodePublishCandidate as their primary source after the migration.
[ ] Podcast feed includes items without valid enclosures.
[ ] Patreon package claims it published remotely.
```

---

## 32. Open questions for Chuck

Do not block implementation on these unless they affect the immediate code being written. Make conservative, configurable choices.

```txt
1. Should the publishing cockpit live in apps/quipsly only, or should HGO team pages also expose packet/publication actions?
2. What is the canonical HGO public URL for MVP: app.highgroundodyssey.com or highgroundodyssey.com?
3. Should an HGO packet include the approved public body on day one, or only summary/metadata until body review UI exists?
4. Where should public audio/image assets live first: existing StudioMediaAsset URLs, Cloud Storage public bucket, or manually pasted URLs?
5. Should old HgoEpisodePublishCandidate rows with candidateStatus published be imported into the new ledger, or left legacy-only?
6. Should podcast RSS be HGO app-owned in apps/web or Quipsly API-owned later?
7. When should QuipLore move from seed data to PublishPacket-driven public pages?
8. What exact approval roles are allowed to create public packets?
9. Should manual export artifacts be considered PUBLISHED, or should they use a separate status label in UI while retaining DB status PUBLISHED?
10. Which direct API integration should come first after MVP: YouTube, LinkedIn, X, Patreon webhook tracking, or Meta?
```

---

## 33. Handoff summary for Codex

Build the publishing ledger like a careful lock between a private workshop and many public doors.

The repo already has excellent instincts: private packets, staging gates, explicit safety flags, synthetic tests, WorldHub provider readiness, QuipLore projection language, and Content Studio handoff flows. The implementation should formalize the public side:

```txt
PublishPacket
PublishDestination
DestinationPublication
PublishJob
RemoteArtifact
PublishStatusEvent
PublishAttempt
```

Start with owned HGO publishing because it gives the fastest proof of value and the safest rollback. Then add podcast RSS and manual export packages. Leave direct external APIs for a later, credentials-aware, provider-reviewed phase.

Do not let the private source cauldron slosh into public cups. Packets are the ladle. The ledger is the tray. Destinations get only what has passed review. 🛂
