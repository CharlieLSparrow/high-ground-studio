# Quipsly Patreon Beta Access Codex Implementation Plan

Date: 2026-06-05
Target repo: `CharlieLSparrow/high-ground-studio`
Primary target app: `apps/quipsly`
Supporting target app: `apps/quipsly-api`, only where the public API needs to expose read-only status later
Database: root Prisma/PostgreSQL schema in `prisma/schema.prisma`
Audience: local Codex Agent implementing the Patreon-gated beta access system

---

## 0. Mission brief for the local Codex Agent

You are implementing Patreon-gated private beta access for **Quipsly**, a private creative/research/publishing app inside the `high-ground-studio` monorepo.

The non-negotiable architectural rule is:

```txt
Patreon is a provider of evidence, not Quipsly's source of truth.
```

Quipsly must ingest Patreon events, verify them, store them durably, reconcile provider facts into app-owned access records, and make beta access decisions from Quipsly-owned database state.

Do **not** implement a direct webhook-to-role grant. Do **not** call Patreon during every app request. Do **not** create users from Patreon webhooks. Do **not** trust email as identity. Do **not** make raw Patreon membership status the runtime authorization check.

The safe target shape is:

```txt
Patreon webhook
  -> verified Next.js route in apps/quipsly
  -> ProviderEvent inbox row
  -> quick 2xx after durable insert
  -> asynchronous reconciliation
  -> ProviderAccount / ProviderMembership mirror rows
  -> Subscription + Entitlement app-owned records
  -> Quipsly UI reads Entitlement only
```

This document is deliberately implementation-heavy. It includes repo-specific context, official-doc assumptions, target data model, file paths, code skeletons, test cases, migration guidance, deployment guidance, and stop conditions. Treat it as a handoff map, not as a license to improvise a billing system in a broom closet. 🧭

---

## 1. Read this before editing anything

### 1.1 Required repo reading

Before changing code, read these files in order:

```txt
AGENTS.md
docs/project-context/current-state.md
docs/architecture/platform-service-boundaries.md
docs/architecture/quipsly-quiplore-foundation.md
docs/plans/quipsly-quiplore-now-next-later.md
docs/agents/quipsly-quiplore-codex-brief.md
docs/sessions/worldhub-provider-integration-workspace-result.md
docs/sessions/worldhub-provider-adapter-rails-result.md
prisma/schema.prisma
apps/quipsly/src/auth.ts
apps/quipsly/src/lib/server/studio-access.ts
apps/quipsly/src/lib/studio-authz.ts
apps/quipsly/src/app/studio-access-shell.tsx
apps/quipsly/src/app/page.tsx
apps/web/src/app/api/webhooks/patreon/route.ts
apps/web/src/app/api/worldhub/webhooks/patreon/route.ts
apps/web/src/lib/worldhub/webhook-signatures.ts
apps/web/src/lib/server/patreon.ts
apps/web/src/lib/server/worldhub-provider-events.ts
```

The existing docs say earlier Quipsly/QuipLore work should not touch `prisma/schema.prisma` without explicit handoff. This task is that handoff: Patreon-gated beta access requires durable app-owned identity, membership, subscription, and entitlement records. Make a narrow schema change, document it, and do not expand into unrelated Quipsly quote/source persistence in the same branch.

### 1.2 Suggested branch

Start from current `origin/main`:

```bash
git fetch origin
git switch -c codex/quipsly-patreon-beta-access-001 origin/main
```

Before committing, run:

```bash
git status --short
git diff --check
```

### 1.3 Implementation boundaries

Own these files and areas:

```txt
prisma/schema.prisma
prisma/migrations/*, if using migrate rather than db push
apps/quipsly/src/app/api/webhooks/patreon/route.ts
apps/quipsly/src/app/api/patreon/link/start/route.ts
apps/quipsly/src/app/api/patreon/link/callback/route.ts
apps/quipsly/src/app/api/internal/patreon/reconcile/route.ts
apps/quipsly/src/app/api/internal/patreon/full-sync/route.ts
apps/quipsly/src/app/settings/beta-access/page.tsx
apps/quipsly/src/lib/patreon/*
apps/quipsly/src/lib/server/quipsly-beta-access.ts
apps/quipsly/src/lib/server/studio-access.ts
apps/quipsly/src/app/studio-access-shell.tsx
scripts/quipsly-patreon-*.test.mjs
scripts/quipsly-patreon-*.mjs, if using script-based jobs
apps/quipsly/Dockerfile
cloudbuild.quipsly.yaml
scripts/quipsly-cloud-run-*.mjs
.env.example
docs/runbooks/quipsly-patreon-beta-access.md
docs/agents/quipsly-quiplore-codex-brief.md, small addendum only
docs/project-context/current-state.md, small addendum only
```

Avoid unrelated edits to:

```txt
apps/web public routes
apps/studio private manuscript/productivity surfaces
packages/content-studio-domain
packages/worldhub-domain
packages/quipsly-domain quote/source contracts, unless adding pure beta access types proves useful
existing HGO content trees
existing Stripe flows
existing Google Calendar flows
```

### 1.4 Stop and ask before doing these

Stop before:

```txt
- creating or changing live Patreon app settings
- rotating Patreon secrets
- creating GCP resources
- changing DNS
- changing OAuth callback settings in Google or Patreon dashboards
- running a migration against production Cloud SQL
- deleting or replacing existing apps/web Patreon routes
- granting access by editing UserRole directly from a webhook
- requesting Patreon address scope
- storing provider tokens in plaintext
- adding Stripe, merch, or paid checkout behavior
```

A local Codex Agent may prepare code and docs for those operations, but should not perform live provider or cloud changes without an operator step.

---

## 2. What the repo already has

### 2.1 Monorepo shape

The repo is a pnpm workspace with `apps/*` and `packages/*`. Root scripts already include Quipsly/QuipLore development/build commands and Prisma commands.

Relevant root scripts today include:

```bash
pnpm quipsly:api
pnpm quipsly:api:build
pnpm quipsly:api:typecheck
pnpm quipsly:domain:build
pnpm quipsly:domain:typecheck
pnpm db:generate
pnpm db:push
pnpm db:migrate
pnpm db:studio
```

The root package uses Prisma 7.7.0 and React 19.2.4. Do not introduce an incompatible dependency graph.

### 2.2 Quipsly app package

`apps/quipsly` is a Next.js app with:

```txt
next-auth 5.0.0-beta.30
@prisma/client 7.7.0
@prisma/adapter-pg
pg
React
```

The app currently uses Google sign-in through `apps/quipsly/src/auth.ts` and JWT sessions. Session enrichment sets:

```txt
session.user.id
session.user.primaryEmail
session.user.roles
session.user.isStaff
```

Current access gating is staff/team-role based through:

```txt
apps/quipsly/src/lib/server/studio-access.ts
apps/quipsly/src/lib/studio-authz.ts
apps/quipsly/src/app/page.tsx
apps/quipsly/src/app/studio-access-shell.tsx
```

`STUDIO_ACCESS_ROLES` currently includes:

```txt
OWNER
TEAM_SCHEDULER
COACH
```

Do **not** turn Patreon supporters into staff roles. Beta access should be an entitlement, not an `AppRole`.

### 2.3 Quipsly API package

`apps/quipsly-api` is a prototype API service. It depends on `@high-ground/quipsly-domain`, Prisma, Next 16.1.6, and React. It currently returns seeded/projection data and has CORS helpers.

Do not put the webhook route in `apps/quipsly-api` for this MVP unless the operator explicitly chooses `quipsly-api` as the beta gate runtime. The user-facing app currently needing access decisions is `apps/quipsly`.

### 2.4 Root Prisma schema

`prisma/schema.prisma` is the canonical durable ledger. It already has:

```txt
User
UserEmail
UserRole
MembershipPlan
Membership
WorldHubProviderConnection
WorldHubProviderEvent
WorldHubProviderSyncJob
WorldHubOrder
QuipslyNode
QuipLoreEdge
QuipStreamSession
QuipStreamEvent
```

The current `Membership`/`MembershipPlan` models are useful app-owned membership concepts, but they are too light to fully represent provider reconciliation, subscription audit trails, and beta entitlement decisions. Add new narrow access models rather than overloading the existing `Membership` table into a haunted null mansion.

### 2.5 Existing Patreon code to avoid copying

There are two existing Patreon webhook surfaces in `apps/web`.

#### Legacy route: do not reuse

```txt
apps/web/src/app/api/webhooks/patreon/route.ts
```

This route is an anti-pattern for Quipsly beta access. It:

```txt
- verifies Patreon HMAC-MD5, but uses simple string comparison
- bypasses failed signature checks outside production
- parses the webhook inline
- extracts email from included user data
- creates a stub User from Patreon email if none exists
- grants/revokes AppRole.NETWORK_PASS directly inside the webhook request
- returns errors in ways that can cause provider retries for business-rule issues
```

Do not build Quipsly beta access this way.

#### WorldHub route: useful reference, not final Quipsly design

```txt
apps/web/src/app/api/worldhub/webhooks/patreon/route.ts
```

This route is closer to the desired ingress shape because it:

```txt
- declares runtime = "nodejs"
- reads raw request text
- verifies X-Patreon-Signature
- records a WorldHubProviderEvent
```

However, it currently also calls `processPatreonWebhookEvent(event.id, payloadJson)` inline. That downstream function still uses email matching, mutates `NETWORK_PASS`, and upserts a `WorldHubOrder`. For Quipsly, use the signature helper pattern and event-inbox idea, not the inline processing behavior.

### 2.6 Existing signature helper

`apps/web/src/lib/worldhub/webhook-signatures.ts` already has a `verifyPatreonWebhookSignature` helper using Node `createHmac` and `timingSafeEqual`. You can copy the idea into `apps/quipsly/src/lib/patreon/signature.ts`, but improve the Patreon compare by treating the signature as hex bytes rather than UTF-8 text and by validating the 32-character hex shape first.

Do not import from `apps/web` into `apps/quipsly`; keep service boundaries clean.

### 2.7 Deployment gap

`apps/quipsly/Dockerfile` appears stale or incorrect for Quipsly. It copies `apps/studio` and `apps/web` manifests, runs `pnpm --filter studio build`, copies `apps/studio/.next/standalone`, and starts `node apps/studio/server.js`.

There is no `apps/quipsly-api/Dockerfile` currently.

For this task, fix `apps/quipsly/Dockerfile` if deploying Quipsly beta access to Cloud Run. Add dedicated Quipsly Cloud Build/deploy scripts instead of reusing `web` or `studio` deploy machinery.

---

## 3. Official documentation assumptions

Use these links as the source of truth while implementing.

### 3.1 Patreon API docs

Official Patreon API reference:

```txt
https://docs.patreon.com/
```

Key implementation facts from the official docs:

```txt
- Use Patreon API v2. API v1 is no longer maintained and is marked as deprecated soon.
- API v2 responses require explicit fields and includes.
- Webhook requests include X-Patreon-Event and X-Patreon-Signature.
- X-Patreon-Signature is the hex HMAC-MD5 digest of the raw message body using the webhook secret.
- Webhook event retries happen on a published retry schedule.
- Webhook triggers include members:create, members:update, members:delete,
  members:pledge:create, members:pledge:update, members:pledge:delete.
- members:update includes payment charging events.
- members:delete is limited; after prior payment, cancellation/status changes may arrive through update events instead.
- The member endpoint requires the member UUID, not the Patreon user ID.
- campaign members and member endpoints require campaign/member scopes.
- Email fields need special email scopes and may still be null or hidden.
- Creator client secrets and tokens are sensitive; never expose them to the browser or logs.
- API calls should include a descriptive User-Agent.
- Patreon rate limits exist; 429 responses can include retry timing.
```

Recommended Patreon docs sections to inspect during implementation:

```txt
API v2 intro and migration notes
OAuth scopes
GET /api/oauth2/v2/campaigns/{campaign_id}/members
GET /api/oauth2/v2/members/{member_id}
Webhook endpoint CRUD
Webhook trigger definitions
Webhook robustness / retry schedule
Member resource fields
Tier resource fields
```

### 3.2 Next.js Route Handlers

Official Next.js Route Handler docs:

```txt
https://nextjs.org/docs/app/api-reference/file-conventions/route
```

Key implementation facts:

```txt
- Route handlers use the Web Request and Response APIs.
- Use request.text() for webhook raw body reading.
- Unlike old Pages Router API routes, App Router route handlers do not need bodyParser configuration for raw webhook bodies.
- Set export const runtime = "nodejs" for Patreon webhook verification because Node crypto HMAC-MD5 is the straightforward implementation path.
```

### 3.3 Node crypto

Official Node.js crypto docs:

```txt
https://nodejs.org/api/crypto.html
```

Use:

```txt
crypto.createHmac("md5", secret).update(rawBody, "utf8").digest("hex")
crypto.timingSafeEqual(expectedBuffer, actualBuffer)
```

Important caution: `timingSafeEqual` does not make the surrounding code automatically timing-safe. Validate lengths and avoid branching that leaks useful information.

### 3.4 Prisma transaction/idempotency docs

Official Prisma transaction docs:

```txt
https://www.prisma.io/docs/orm/prisma-client/queries/transactions
```

Key implementation fact:

```txt
Design reconciliation APIs to be idempotent: running the same logic with the same parameters multiple times should leave the database in the same final state.
```

That matters because Patreon retries webhooks and event delivery can be delayed, duplicated, or arrive in an order that is inconvenient to the app.

### 3.5 Cloud Run docs

Official Cloud Run docs:

```txt
Request timeouts:
https://cloud.google.com/run/docs/configuring/request-timeout

Execute jobs:
https://cloud.google.com/run/docs/execute/jobs

Execute jobs on a schedule:
https://cloud.google.com/run/docs/execute/jobs-on-schedule

Secrets for services:
https://cloud.google.com/run/docs/configuring/services/secrets
```

Key implementation facts:

```txt
- Cloud Run service request timeout returns 504 when exceeded.
- The container instance is not necessarily terminated after timeout; code might keep running and interfere with other requests.
- Do not do long reconciliation inside webhook requests.
- Use Secret Manager for API keys, webhook secrets, OAuth secrets, and tokens.
- Cloud Run Jobs can run task-style work to completion and can be invoked manually or on a schedule.
```

---

## 4. Target architecture

### 4.1 High-level flow

```txt
1. User signs into Quipsly with Google.
2. User opens /settings/beta-access.
3. If user has no Patreon provider account, Quipsly offers "Link Patreon".
4. User links Patreon via OAuth.
5. Quipsly stores Patreon provider identity as ProviderAccount.
6. Patreon webhook arrives for campaign member/tier/payment changes.
7. Quipsly verifies signature over raw body.
8. Quipsly stores ProviderEvent inbox row.
9. Quipsly returns 200 quickly once event is durably stored.
10. Reconciler claims ProviderEvent rows.
11. Reconciler fetches canonical member state from Patreon API v2 using creator token.
12. Reconciler upserts ProviderMembership and ProviderMembershipTier mirror rows.
13. Reconciler attaches membership to ProviderAccount/user if safely linkable.
14. Reconciler evaluates Quipsly beta access policy.
15. Reconciler upserts Subscription and Entitlement records.
16. Quipsly app authorizes workbench access from Entitlement, not Patreon.
17. UI shows pending, active, expired, or manual review state.
18. Full sync periodically repairs missed or delayed events.
```

### 4.2 Runtime authorization invariant

```txt
Quipsly beta workbench access is allowed when:

- session.user.id exists, and
- user is internal staff OR user has an ACTIVE Entitlement where:
  productKey = "QUIPSLY_BETA"
  status = "ACTIVE"
  startsAt <= now
  and endsAt is null or endsAt > now
  and revokedAt is null
```

Do not call Patreon from `apps/quipsly/src/app/page.tsx`. Do not read raw provider membership status directly in page authorization. Do not check `UserRole.NETWORK_PASS` for Quipsly beta access.

### 4.3 Provider evidence vs app decision

Provider facts:

```txt
ProviderEvent
ProviderAccount
ProviderMembership
ProviderMembershipTier
PatreonTierMapping
```

App access decisions:

```txt
Subscription
Entitlement
EntitlementDecision
ManualReviewCase
ManualOverride
```

User-facing UI state:

```txt
NOT_LINKED
PENDING
ACTIVE
EXPIRED
MANUAL_REVIEW_NEEDED
```

### 4.4 Why not reuse only existing WorldHubProviderEvent?

The repo already has `WorldHubProviderEvent`, and WorldHub is described as the future central infrastructure hub for provider connections and entitlements. That said, the safest MVP for Quipsly beta access is to add Quipsly-focused provider/access records rather than forcing the existing WorldHub order/event tables to become Quipsly authorization state.

Reasons:

```txt
- Existing WorldHubProviderEvent stores payload summaries only, not enough by itself for Quipsly-specific reconciliation state.
- Existing processPatreonWebhookEvent mutates NETWORK_PASS and WorldHubOrder inline.
- Quipsly needs user-facing pending/manual-review states, not only provider readiness.
- Quipsly needs entitlement decisions with rule versions and auditability.
- The current WorldHub route lives in apps/web, while Quipsly beta gating lives in apps/quipsly.
```

Do not delete WorldHub. This implementation can later be consolidated into a shared WorldHub entitlement service. For now, keep Quipsly beta access narrow, auditable, and local to the Quipsly runtime plus root Prisma schema.

---

## 5. MVP policy decisions

Use these defaults unless the human operator overrides them.

### 5.1 Product key

```txt
QUIPSLY_BETA
```

### 5.2 Provider

```txt
PATREON
```

### 5.3 Qualifying Patreon tiers

Use environment variable:

```txt
QUIPSLY_PATREON_BETA_TIER_IDS="tier_1,tier_2"
```

Also seed `PatreonTierMapping` rows for operator visibility.

The env value is the launch source of truth for qualifying tier ids. The database mapping is the admin/audit mirror. Later, the mapping can become fully admin-managed.

### 5.4 Access grant rule

Grant `ACTIVE` Quipsly beta entitlement only when all are true:

```txt
- ProviderMembership is linked to exactly one User.
- provider = PATREON.
- campaignId equals QUIPSLY_PATREON_CAMPAIGN_ID.
- patronStatus = active_patron.
- currentlyEntitledAmountCents > 0, unless a deliberate free/gifted policy is enabled.
- at least one current tier id is in QUIPSLY_PATREON_BETA_TIER_IDS or enabled PatreonTierMapping.
- lastChargeStatus is not disqualifying.
- no manual block/revocation is active.
```

Disqualifying charge statuses for MVP:

```txt
Declined
Deleted
Fraud
Refunded
```

Payment status normalization should be tolerant of casing and underscores.

### 5.5 Pending rule

Show `PENDING` when:

```txt
- User has signed in but has not linked Patreon yet.
- User linked Patreon but no campaign membership has been fetched yet.
- Signed webhook was stored but not reconciled yet.
- Payment status is pending/queued.
- Membership exists but provider account/user link is not complete.
```

For a private beta, do not grant full workbench access for `PENDING` by default. The UI can show an access-status page and support CTA.

### 5.6 Expired rule

Show `EXPIRED` when canonical provider state says:

```txt
- patronStatus = former_patron.
- patronStatus = declined_patron.
- no qualifying tier remains.
- current tier/amount no longer grants beta.
- membership was missing from full sync beyond the staleness window.
```

### 5.7 Manual review rule

Show `MANUAL_REVIEW_NEEDED` when:

```txt
- Multiple users try to claim the same Patreon user id.
- Patreon identity email/name is hidden or null and there is no OAuth link.
- A provider membership cannot be linked safely to a user.
- Unknown tier appears and policy cannot decide.
- Provider data conflicts with local state.
- Patreon API repeatedly fails and current entitlement is uncertain.
- Signed webhook payload is malformed or semantically surprising.
```

### 5.8 Gifted/free trial policy

MVP default:

```txt
QUIPSLY_PATREON_ALLOW_GIFTED_BETA=false
QUIPSLY_PATREON_ALLOW_FREE_TRIAL_BETA=false
```

If the human wants gifted/free-trial patrons to enter beta, make that explicit via env and record it in `EntitlementDecision.detailsJson`.

### 5.9 Grace period policy

MVP default:

```txt
QUIPSLY_PATREON_DECLINED_GRACE_DAYS=0
QUIPSLY_PATREON_STALE_SYNC_GRACE_HOURS=24
```

Do not expire everyone because Patreon API is down. Full sync staleness and API outage state must be distinct.

---

## 6. Environment variables

Add these to `.env.example`, docs, and Quipsly Cloud Run deploy scripts.

Use Quipsly-specific names to avoid accidental collision with existing `apps/web` WorldHub variables.

```bash
# Quipsly Patreon beta access
QUIPSLY_PATREON_CLIENT_ID=""
QUIPSLY_PATREON_CLIENT_SECRET=""
QUIPSLY_PATREON_WEBHOOK_SECRET=""
QUIPSLY_PATREON_CAMPAIGN_ID=""
QUIPSLY_PATREON_CREATOR_ACCESS_TOKEN=""
QUIPSLY_PATREON_CREATOR_REFRESH_TOKEN=""
QUIPSLY_PATREON_BETA_TIER_IDS=""
QUIPSLY_PATREON_ALLOW_GIFTED_BETA="0"
QUIPSLY_PATREON_ALLOW_FREE_TRIAL_BETA="0"
QUIPSLY_PATREON_DECLINED_GRACE_DAYS="0"
QUIPSLY_PATREON_STALE_SYNC_GRACE_HOURS="24"
QUIPSLY_PATREON_WEBHOOK_ENABLED="0"
QUIPSLY_PATREON_RECONCILE_ENABLED="0"

# Internal job route protection, if using scheduled internal routes before Cloud Run Jobs
QUIPSLY_JOB_SECRET=""

# Quipsly service URL, used for OAuth callback construction if needed
QUIPSLY_SITE_URL="http://localhost:3000"
```

For local dev, allow fallback to existing Patreon env names only in helper functions, not throughout business logic:

```ts
function getEnv(primary: string, fallback?: string): string | undefined {
  return process.env[primary] || (fallback ? process.env[fallback] : undefined);
}

const webhookSecret = getEnv(
  "QUIPSLY_PATREON_WEBHOOK_SECRET",
  "PATREON_WEBHOOK_SECRET",
);
```

In production Cloud Run, mount only `QUIPSLY_*` secrets for Quipsly.

---

## 7. Database model recommendation

### 7.1 Add enums

Append these enums near the existing auth/membership enums in `prisma/schema.prisma`.

```prisma
enum ExternalProvider {
  PATREON
}

enum ProviderEventStatus {
  RECEIVED
  DUPLICATE
  PROCESSING
  PROCESSED
  IGNORED
  FAILED
  NEEDS_REVIEW
}

enum ProviderAccountStatus {
  UNCLAIMED
  LINKED
  CONFLICT
  REVOKED
}

enum ProviderMembershipSyncState {
  CURRENT
  STALE
  MISSING_PROVIDER
  ERROR
  MANUAL_REVIEW
}

enum SubscriptionStatus {
  PENDING
  ACTIVE
  PAST_DUE
  CANCELED
  EXPIRED
  MANUAL_REVIEW
}

enum EntitlementStatus {
  PENDING
  ACTIVE
  EXPIRED
  MANUAL_REVIEW
  REVOKED
}

enum EntitlementSource {
  PATREON
  MANUAL
  INTERNAL
}

enum ManualReviewStatus {
  OPEN
  RESOLVED
  DENIED
  MERGED
}
```

Use `ExternalProvider` rather than `Provider` to avoid semantic collision with React providers and future provider files.

### 7.2 Update User relations

Add these fields to `model User`.

```prisma
  providerAccounts             ProviderAccount[]      @relation("ProviderAccountUser")
  providerMemberships          ProviderMembership[]   @relation("ProviderMembershipUser")
  accessSubscriptions          Subscription[]         @relation("SubscriptionUser")
  entitlements                 Entitlement[]          @relation("EntitlementUser")
  manualOverrides              ManualOverride[]       @relation("ManualOverrideUser")
  manualOverridesApproved      ManualOverride[]       @relation("ManualOverrideApprovedBy")
  manualReviewCasesAssigned    ManualReviewCase[]     @relation("ManualReviewAssignedTo")
  manualReviewCasesResolved    ManualReviewCase[]     @relation("ManualReviewResolvedBy")
```

If Prisma complains about relation ambiguity, use exactly these relation names on both sides.

### 7.3 Add ProviderEvent

```prisma
model ProviderEvent {
  id                String              @id @default(cuid())

  provider          ExternalProvider
  eventType         String
  eventKey          String              @unique

  providerWebhookId String?
  campaignId        String?
  providerMemberId  String?
  providerUserId    String?

  rawBodySha256     String
  signatureSha256   String?
  headersRedacted   Json?
  payloadJson       Json?
  payloadSummaryJson Json?

  status            ProviderEventStatus @default(RECEIVED)
  attempts          Int                 @default(0)
  nextAttemptAt     DateTime?
  lockedUntil       DateTime?
  lockOwner         String?
  lastError         String?

  receivedAt        DateTime            @default(now())
  verifiedAt        DateTime?
  processedAt       DateTime?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  decisions         EntitlementDecision[]

  @@index([provider, status, nextAttemptAt])
  @@index([provider, providerMemberId, receivedAt])
  @@index([provider, providerUserId, receivedAt])
  @@index([provider, campaignId, receivedAt])
}
```

Field notes:

```txt
eventKey:
  Quipsly-owned idempotency key. Patreon docs reviewed here do not show a stable
  delivery id in the webhook envelope. Use provider + eventType + providerMemberId
  + rawBodySha256.

rawBodySha256:
  Used for duplicate detection and audit without relying on raw payload retention.

signatureSha256:
  Store hash of signature header, not the signature itself.

payloadJson:
  Optional. Store parsed JSON only if it does not include unnecessary sensitive data.
  Do not request address scope. Consider deleting after retention window later.

payloadSummaryJson:
  Always safe-ish summary for admin/event list.

status:
  RECEIVED means ready to reconcile.
  DUPLICATE is optional if duplicate deliveries are stored separately.
  NEEDS_REVIEW means signed event was captured but cannot be automatically processed.
```

### 7.4 Add ProviderAccount

```prisma
model ProviderAccount {
  id             String                @id @default(cuid())

  userId         String?
  user           User?                 @relation("ProviderAccountUser", fields: [userId], references: [id], onDelete: SetNull)

  provider       ExternalProvider
  providerUserId String

  email          String?
  displayName    String?
  avatarUrl      String?
  status         ProviderAccountStatus @default(UNCLAIMED)

  linkedAt       DateTime?
  lastSeenAt     DateTime?
  revokedAt      DateTime?
  rawProfileJson Json?

  memberships    ProviderMembership[]

  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  @@unique([provider, providerUserId])
  @@index([userId])
  @@index([provider, status])
  @@index([email])
}
```

Identity rule:

```txt
ProviderAccount(provider=PATREON, providerUserId=Patreon user id) is the identity key.
Email is display/support metadata only.
```

Do not create a Quipsly `User` from a Patreon webhook. The user should sign in with Google first, then link Patreon via OAuth, or an operator should attach a provider account manually from the manual review lane.

### 7.5 Add ProviderMembership

```prisma
model ProviderMembership {
  id                           String                       @id @default(cuid())

  provider                     ExternalProvider
  campaignId                   String
  providerMemberId             String
  providerUserId               String?

  providerAccountId            String?
  providerAccount              ProviderAccount?             @relation(fields: [providerAccountId], references: [id], onDelete: SetNull)

  userId                       String?
  user                         User?                        @relation("ProviderMembershipUser", fields: [userId], references: [id], onDelete: SetNull)

  patronStatus                 String?
  lastChargeStatus             String?
  lastChargeDate               DateTime?
  nextChargeDate               DateTime?
  currentlyEntitledAmountCents Int?
  willPayAmountCents           Int?
  campaignLifetimeSupportCents Int?
  pledgeRelationshipStart      DateTime?

  isFreeTrial                  Boolean?
  isGifted                     Boolean?

  syncState                    ProviderMembershipSyncState  @default(CURRENT)
  lastSeenAt                   DateTime?
  lastFetchedAt                DateTime?
  deletedAt                    DateTime?
  staleSince                   DateTime?

  rawSnapshotJson              Json?
  normalizedSnapshotJson       Json?

  createdAt                    DateTime                     @default(now())
  updatedAt                    DateTime                     @updatedAt

  tiers                        ProviderMembershipTier[]
  subscriptions                Subscription[]
  entitlements                 Entitlement[]
  decisions                    EntitlementDecision[]

  @@unique([provider, campaignId, providerMemberId])
  @@index([provider, providerUserId])
  @@index([providerAccountId])
  @@index([userId])
  @@index([syncState, lastFetchedAt])
}
```

Field notes:

```txt
providerMemberId:
  Patreon member UUID. Use this for GET /members/{member_id}.

providerUserId:
  Patreon user id. Use this to link to ProviderAccount.

rawSnapshotJson:
  Optional provider shape. Store only after redaction/minimization.

normalizedSnapshotJson:
  Quipsly-normalized facts used by the policy function.
```

### 7.6 Add ProviderMembershipTier

```prisma
model ProviderMembershipTier {
  membershipId     String
  membership       ProviderMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  providerTierId   String
  title            String?
  amountCents      Int?
  isQualifyingBeta Boolean            @default(false)
  lastSeenAt       DateTime           @default(now())

  @@id([membershipId, providerTierId])
  @@index([providerTierId])
  @@index([isQualifyingBeta])
}
```

### 7.7 Add PatreonTierMapping

```prisma
model PatreonTierMapping {
  id             String   @id @default(cuid())

  campaignId     String
  providerTierId String
  title          String?
  amountCents    Int?

  grantsProduct  String   @default("QUIPSLY_BETA")
  isEnabled      Boolean  @default(true)
  minAmountCents Int?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([campaignId, providerTierId, grantsProduct])
  @@index([campaignId, grantsProduct, isEnabled])
}
```

### 7.8 Add Subscription

```prisma
model Subscription {
  id                   String             @id @default(cuid())

  userId               String?
  user                 User?              @relation("SubscriptionUser", fields: [userId], references: [id], onDelete: SetNull)

  productKey           String             @default("QUIPSLY_BETA")
  source               EntitlementSource

  providerMembershipId String?
  providerMembership   ProviderMembership? @relation(fields: [providerMembershipId], references: [id], onDelete: SetNull)

  status               SubscriptionStatus @default(PENDING)
  currentPeriodStart   DateTime?
  currentPeriodEnd     DateTime?
  providerStatus       String?
  reasonCode           String?
  reasonMessage        String?

  lastReconciledAt     DateTime?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  entitlements         Entitlement[]

  @@index([userId, productKey, status])
  @@index([providerMembershipId])
  @@index([source, status])
}
```

This is app-owned subscription state, not Patreon itself. It says what Quipsly believes about the user's ongoing access source.

### 7.9 Add Entitlement

```prisma
model Entitlement {
  id                   String              @id @default(cuid())

  userId               String?
  user                 User?               @relation("EntitlementUser", fields: [userId], references: [id], onDelete: SetNull)

  productKey           String              @default("QUIPSLY_BETA")
  source               EntitlementSource
  sourceRefId          String?

  providerMembershipId String?
  providerMembership   ProviderMembership? @relation(fields: [providerMembershipId], references: [id], onDelete: SetNull)

  subscriptionId       String?
  subscription         Subscription?       @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)

  status               EntitlementStatus   @default(PENDING)
  startsAt             DateTime?
  endsAt               DateTime?
  graceEndsAt          DateTime?
  revokedAt            DateTime?

  reasonCode           String?
  reasonMessage        String?
  ruleVersion          String
  lastEvaluatedAt      DateTime?

  manualOverrideId     String?
  manualOverride       ManualOverride?     @relation(fields: [manualOverrideId], references: [id], onDelete: SetNull)

  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  decisions            EntitlementDecision[]

  @@index([userId, productKey, status])
  @@index([providerMembershipId])
  @@index([subscriptionId])
  @@index([status, endsAt])
  @@index([source, status])
}
```

Authorization reads this table.

### 7.10 Add EntitlementDecision

```prisma
model EntitlementDecision {
  id                   String              @id @default(cuid())

  entitlementId        String?
  entitlement          Entitlement?        @relation(fields: [entitlementId], references: [id], onDelete: SetNull)

  providerEventId      String?
  providerEvent        ProviderEvent?      @relation(fields: [providerEventId], references: [id], onDelete: SetNull)

  providerMembershipId String?
  providerMembership   ProviderMembership? @relation(fields: [providerMembershipId], references: [id], onDelete: SetNull)

  oldStatus            String?
  newStatus            String
  ruleVersion          String
  inputHash            String?
  summary              String
  detailsJson          Json?

  createdAt            DateTime            @default(now())

  @@index([entitlementId, createdAt])
  @@index([providerEventId])
  @@index([providerMembershipId, createdAt])
}
```

Every access change writes one of these. This is the little courtroom transcript that keeps everyone honest. ⚖️

### 7.11 Add ManualReviewCase

```prisma
model ManualReviewCase {
  id                 String             @id @default(cuid())

  subjectType        String
  subjectId          String

  status             ManualReviewStatus @default(OPEN)
  reasonCode         String
  summary            String
  detailsJson        Json?

  assignedToUserId   String?
  assignedToUser     User?              @relation("ManualReviewAssignedTo", fields: [assignedToUserId], references: [id], onDelete: SetNull)

  resolvedByUserId   String?
  resolvedByUser     User?              @relation("ManualReviewResolvedBy", fields: [resolvedByUserId], references: [id], onDelete: SetNull)
  resolvedAt         DateTime?

  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  @@index([status, createdAt])
  @@index([subjectType, subjectId])
  @@index([reasonCode, status])
}
```

### 7.12 Add ManualOverride

```prisma
model ManualOverride {
  id               String             @id @default(cuid())

  userId           String
  user             User               @relation("ManualOverrideUser", fields: [userId], references: [id], onDelete: Cascade)

  productKey       String             @default("QUIPSLY_BETA")
  status           EntitlementStatus

  reason           String
  approvedByUserId String?
  approvedByUser   User?              @relation("ManualOverrideApprovedBy", fields: [approvedByUserId], references: [id], onDelete: SetNull)

  startsAt         DateTime           @default(now())
  expiresAt        DateTime?
  revokedAt        DateTime?

  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  entitlements     Entitlement[]

  @@index([userId, productKey, status])
  @@index([expiresAt])
}
```

MVP can add the model without a full admin UI. Manual overrides can be inserted by trusted DB/admin script until admin UI exists.

### 7.13 Add PatreonOAuthState

```prisma
model PatreonOAuthState {
  id             String   @id @default(cuid())

  userId         String
  stateHash      String   @unique
  redirectTo     String?
  expiresAt      DateTime
  consumedAt     DateTime?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId, expiresAt])
  @@index([expiresAt, consumedAt])
}
```

Do not store raw OAuth state. Store a SHA-256 hash of the generated state value.

### 7.14 Optional partial indexes

Prisma does not model PostgreSQL partial indexes directly. Add raw SQL in the generated migration if using migrations.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "Entitlement_one_active_quipsly_beta_per_user"
ON "Entitlement" ("userId", "productKey")
WHERE "status" IN ('PENDING', 'ACTIVE', 'MANUAL_REVIEW')
  AND "source" = 'PATREON'
  AND "revokedAt" IS NULL;
```

Use this carefully. It enforces one active-ish Patreon beta entitlement per user/product. If Prisma migrate emits different quoted enum/table names, adjust to actual SQL.

### 7.15 Migration command guidance

For local implementation:

```bash
pnpm db:generate
pnpm db:migrate
```

If this repo is still using `db push` in some Cloud SQL flows, do not push to production as Codex. Prepare migration and docs. Let the operator choose production migration path.

---

## 8. Core library file plan

Create a dedicated Patreon integration folder:

```txt
apps/quipsly/src/lib/patreon/config.ts
apps/quipsly/src/lib/patreon/signature.ts
apps/quipsly/src/lib/patreon/event-types.ts
apps/quipsly/src/lib/patreon/event-normalizer.ts
apps/quipsly/src/lib/patreon/event-inbox.ts
apps/quipsly/src/lib/patreon/client.ts
apps/quipsly/src/lib/patreon/member-normalizer.ts
apps/quipsly/src/lib/patreon/beta-access-policy.ts
apps/quipsly/src/lib/patreon/reconciler.ts
apps/quipsly/src/lib/patreon/full-sync.ts
apps/quipsly/src/lib/patreon/oauth.ts
apps/quipsly/src/lib/patreon/manual-review.ts
apps/quipsly/src/lib/server/quipsly-beta-access.ts
```

Do not import from `apps/web`. Copy small pure helpers where needed.

---

## 9. Config helper

Create:

```txt
apps/quipsly/src/lib/patreon/config.ts
```

Skeleton:

```ts
import "server-only";

function readEnv(primary: string, fallback?: string): string | undefined {
  return process.env[primary] || (fallback ? process.env[fallback] : undefined);
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getPatreonConfig() {
  const clientId = readEnv("QUIPSLY_PATREON_CLIENT_ID", "PATREON_CLIENT_ID");
  const clientSecret = readEnv("QUIPSLY_PATREON_CLIENT_SECRET", "PATREON_CLIENT_SECRET");
  const webhookSecret = readEnv("QUIPSLY_PATREON_WEBHOOK_SECRET", "PATREON_WEBHOOK_SECRET");
  const campaignId = readEnv("QUIPSLY_PATREON_CAMPAIGN_ID", "PATREON_CAMPAIGN_ID");
  const creatorAccessToken = readEnv(
    "QUIPSLY_PATREON_CREATOR_ACCESS_TOKEN",
    "PATREON_CREATOR_ACCESS_TOKEN",
  );
  const creatorRefreshToken = readEnv(
    "QUIPSLY_PATREON_CREATOR_REFRESH_TOKEN",
    "PATREON_CREATOR_REFRESH_TOKEN",
  );

  return {
    siteUrl: readEnv("QUIPSLY_SITE_URL", "AUTH_URL") || "http://localhost:3000",
    clientId,
    clientSecret,
    webhookSecret,
    campaignId,
    creatorAccessToken,
    creatorRefreshToken,
    betaTierIds: new Set(
      splitCsv(readEnv("QUIPSLY_PATREON_BETA_TIER_IDS", "PATREON_BETA_TIER_IDS")),
    ),
    allowGiftedBeta: parseBoolean(process.env.QUIPSLY_PATREON_ALLOW_GIFTED_BETA),
    allowFreeTrialBeta: parseBoolean(process.env.QUIPSLY_PATREON_ALLOW_FREE_TRIAL_BETA),
    declinedGraceDays: parseInteger(process.env.QUIPSLY_PATREON_DECLINED_GRACE_DAYS, 0),
    staleSyncGraceHours: parseInteger(process.env.QUIPSLY_PATREON_STALE_SYNC_GRACE_HOURS, 24),
    webhookEnabled: parseBoolean(process.env.QUIPSLY_PATREON_WEBHOOK_ENABLED),
    reconcileEnabled: parseBoolean(process.env.QUIPSLY_PATREON_RECONCILE_ENABLED),
    jobSecret: process.env.QUIPSLY_JOB_SECRET,
  };
}

export function requirePatreonConfigValue(
  value: string | undefined,
  label: string,
): string {
  if (!value?.trim()) {
    throw new Error(`${label} is not configured.`);
  }

  return value.trim();
}
```

`webhookEnabled` should control whether the route accepts real provider events after deployment. In local tests, helpers should not require this flag.

---

## 10. Webhook signature verification

Create:

```txt
apps/quipsly/src/lib/patreon/signature.ts
```

Skeleton:

```ts
import "server-only";

import crypto from "node:crypto";

export type PatreonSignatureResult =
  | { ok: true }
  | { ok: false; reason: string };

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function verifyPatreonWebhookSignature({
  rawBody,
  signatureHeader,
  webhookSecret,
}: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string | undefined;
}): PatreonSignatureResult {
  const secret = webhookSecret?.trim();

  if (!secret) {
    return { ok: false, reason: "QUIPSLY_PATREON_WEBHOOK_SECRET is not configured." };
  }

  if (!signatureHeader?.trim()) {
    return { ok: false, reason: "Missing X-Patreon-Signature header." };
  }

  const actualHex = signatureHeader.trim().toLowerCase();

  if (!/^[a-f0-9]{32}$/.test(actualHex)) {
    return { ok: false, reason: "X-Patreon-Signature header is malformed." };
  }

  const expectedHex = crypto
    .createHmac("md5", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");

  if (expected.length !== actual.length) {
    return { ok: false, reason: "Patreon webhook signature length did not match." };
  }

  return crypto.timingSafeEqual(expected, actual)
    ? { ok: true }
    : { ok: false, reason: "Patreon webhook signature did not match." };
}
```

Test this helper independently. Do not put any dev-mode bypass in the verifier.

---

## 11. Patreon event types and payload normalization

Create:

```txt
apps/quipsly/src/lib/patreon/event-types.ts
```

Skeleton:

```ts
export const PATREON_WEBHOOK_EVENTS = [
  "members:create",
  "members:update",
  "members:delete",
  "members:pledge:create",
  "members:pledge:update",
  "members:pledge:delete",
] as const;

export type PatreonWebhookEventType = (typeof PATREON_WEBHOOK_EVENTS)[number];

export function isAllowedPatreonWebhookEvent(
  value: string | null | undefined,
): value is PatreonWebhookEventType {
  return PATREON_WEBHOOK_EVENTS.includes(value as PatreonWebhookEventType);
}
```

Create:

```txt
apps/quipsly/src/lib/patreon/event-normalizer.ts
```

Skeleton:

```ts
import { sha256Hex } from "./signature";

export type NormalizedPatreonWebhookEvent = {
  eventType: string;
  eventKey: string;
  campaignId: string | null;
  providerMemberId: string | null;
  providerUserId: string | null;
  rawBodySha256: string;
  signatureSha256: string | null;
  payloadSummaryJson: Record<string, unknown>;
};

function readRelationshipId(data: unknown, key: string): string | null {
  if (!data || typeof data !== "object") return null;
  const relationships = (data as { relationships?: unknown }).relationships;
  if (!relationships || typeof relationships !== "object") return null;

  const relationship = (relationships as Record<string, unknown>)[key];
  if (!relationship || typeof relationship !== "object") return null;

  const relData = (relationship as { data?: unknown }).data;

  if (Array.isArray(relData)) {
    const first = relData[0];
    return first && typeof first === "object" && typeof (first as { id?: unknown }).id === "string"
      ? (first as { id: string }).id
      : null;
  }

  return relData && typeof relData === "object" && typeof (relData as { id?: unknown }).id === "string"
    ? (relData as { id: string }).id
    : null;
}

export function normalizePatreonWebhookEvent({
  eventType,
  rawBody,
  signatureHeader,
  payloadJson,
}: {
  eventType: string;
  rawBody: string;
  signatureHeader: string | null;
  payloadJson: unknown;
}): NormalizedPatreonWebhookEvent {
  const rawBodySha = sha256Hex(rawBody);
  const signatureSha = signatureHeader ? sha256Hex(signatureHeader) : null;

  const data =
    payloadJson && typeof payloadJson === "object"
      ? (payloadJson as { data?: unknown }).data
      : undefined;

  const providerMemberId =
    data &&
    typeof data === "object" &&
    (data as { type?: unknown }).type === "member" &&
    typeof (data as { id?: unknown }).id === "string"
      ? (data as { id: string }).id
      : null;

  const campaignId = readRelationshipId(data, "campaign");
  const providerUserId = readRelationshipId(data, "user");

  const eventKey = [
    "PATREON",
    eventType || "UNKNOWN",
    providerMemberId || providerUserId || campaignId || "missing-resource",
    rawBodySha,
  ].join(":");

  return {
    eventType: eventType || "UNKNOWN",
    eventKey,
    campaignId,
    providerMemberId,
    providerUserId,
    rawBodySha256: rawBodySha,
    signatureSha256: signatureSha,
    payloadSummaryJson: {
      dataId:
        data && typeof data === "object" && typeof (data as { id?: unknown }).id === "string"
          ? (data as { id: string }).id
          : null,
      dataType:
        data && typeof data === "object" && typeof (data as { type?: unknown }).type === "string"
          ? (data as { type: string }).type
          : null,
      campaignId,
      providerMemberId,
      providerUserId,
    },
  };
}
```

If the webhook payload shape changes, the route must still store the signed event as `NEEDS_REVIEW` rather than crashing after verification.

---

## 12. Provider event inbox

Create:

```txt
apps/quipsly/src/lib/patreon/event-inbox.ts
```

Skeleton:

```ts
import "server-only";

import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import type { NormalizedPatreonWebhookEvent } from "./event-normalizer";

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function recordPatreonProviderEvent({
  normalized,
  payloadJson,
  headersRedacted,
  status,
  lastError,
}: {
  normalized: NormalizedPatreonWebhookEvent;
  payloadJson: unknown;
  headersRedacted: Record<string, unknown>;
  status: "RECEIVED" | "NEEDS_REVIEW" | "IGNORED";
  lastError?: string | null;
}) {
  const prisma = getPrismaClient();

  try {
    const created = await prisma.providerEvent.create({
      data: {
        provider: "PATREON",
        eventType: normalized.eventType,
        eventKey: normalized.eventKey,
        campaignId: normalized.campaignId,
        providerMemberId: normalized.providerMemberId,
        providerUserId: normalized.providerUserId,
        rawBodySha256: normalized.rawBodySha256,
        signatureSha256: normalized.signatureSha256,
        headersRedacted: toJsonInput(headersRedacted),
        payloadJson: payloadJson == null ? undefined : toJsonInput(payloadJson),
        payloadSummaryJson: toJsonInput(normalized.payloadSummaryJson),
        status,
        lastError: lastError || null,
        verifiedAt: new Date(),
      },
    });

    return { kind: "created" as const, event: created };
  } catch (error: any) {
    if (error?.code === "P2002") {
      const existing = await prisma.providerEvent.findUnique({
        where: { eventKey: normalized.eventKey },
      });

      return { kind: "duplicate" as const, event: existing };
    }

    throw error;
  }
}
```

If the DB insert fails because the DB is unavailable, the route should return `500` so Patreon retries. If the insert succeeds or the event is a duplicate, return `200`.

---

## 13. Webhook route

Create:

```txt
apps/quipsly/src/app/api/webhooks/patreon/route.ts
```

Skeleton:

```ts
import { NextResponse } from "next/server";

import { getPatreonConfig } from "@/lib/patreon/config";
import { isAllowedPatreonWebhookEvent } from "@/lib/patreon/event-types";
import { normalizePatreonWebhookEvent } from "@/lib/patreon/event-normalizer";
import { recordPatreonProviderEvent } from "@/lib/patreon/event-inbox";
import { verifyPatreonWebhookSignature } from "@/lib/patreon/signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getPatreonConfig();

  if (!config.webhookEnabled && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Quipsly Patreon webhook intake is disabled." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-patreon-signature");
  const eventTypeHeader = request.headers.get("x-patreon-event")?.trim() || "UNKNOWN";

  const verification = verifyPatreonWebhookSignature({
    rawBody,
    signatureHeader,
    webhookSecret: config.webhookSecret,
  });

  if (!verification.ok) {
    const isMisconfigured = verification.reason.includes("not configured");
    return NextResponse.json(
      { ok: false, error: verification.reason },
      { status: isMisconfigured ? 503 : 401 },
    );
  }

  let payloadJson: unknown = null;
  let parseError: string | null = null;

  try {
    payloadJson = JSON.parse(rawBody);
  } catch (error) {
    parseError = error instanceof Error ? error.message : "Invalid JSON payload.";
  }

  const normalized = normalizePatreonWebhookEvent({
    eventType: eventTypeHeader,
    rawBody,
    signatureHeader,
    payloadJson,
  });

  const allowedEvent = isAllowedPatreonWebhookEvent(eventTypeHeader);
  const semanticError =
    parseError ??
    (!allowedEvent ? `Unexpected Patreon event type: ${eventTypeHeader}` : null) ??
    (!normalized.providerMemberId ? "Patreon payload did not include a member id." : null);

  const status = semanticError ? "NEEDS_REVIEW" : "RECEIVED";

  try {
    const result = await recordPatreonProviderEvent({
      normalized,
      payloadJson,
      headersRedacted: {
        "x-patreon-event": eventTypeHeader,
        "user-agent": request.headers.get("user-agent"),
      },
      status,
      lastError: semanticError,
    });

    return NextResponse.json(
      {
        ok: true,
        received: true,
        duplicate: result.kind === "duplicate",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[quipsly:patreon:webhook] failed to record provider event", error);
    return NextResponse.json({ ok: false, error: "Failed to store event." }, { status: 500 });
  }
}
```

### 13.1 What this route must do

```txt
- Read raw request body with request.text().
- Verify signature before JSON parsing.
- Use Node runtime.
- Validate or record the event type.
- Store signed events durably.
- Return 2xx after durable insert.
- Return 2xx for duplicate signed events.
- Return 401 for bad signatures.
- Return 503 for missing required secret/config in production.
- Return 500 when DB insert failed and a retry would help.
```

### 13.2 What this route must not do

```txt
- Do not call Patreon API.
- Do not create User rows.
- Do not match by email.
- Do not grant/revoke AppRole.
- Do not create Entitlement.
- Do not send email.
- Do not enqueue long-running work inline beyond a DB row insert.
- Do not log raw body, access token, refresh token, webhook secret, or full signature.
```

---

## 14. Patreon API client

Create:

```txt
apps/quipsly/src/lib/patreon/client.ts
```

The client should support:

```txt
fetchMember(memberId)
listCampaignMembers(cursor?)
exchangeOAuthCode(code, redirectUri)
fetchOAuthIdentity(accessToken)
refreshCreatorTokenLater, optional/future
```

MVP can require a valid long-lived creator token in env. If the token expires in practice, create a manual token refresh operator step or implement refresh handling in a follow-up slice.

Skeleton:

```ts
import "server-only";

import { getPatreonConfig, requirePatreonConfigValue } from "./config";

const PATREON_API_BASE = "https://www.patreon.com/api/oauth2/v2";
const PATREON_TOKEN_URL = "https://www.patreon.com/api/oauth2/token";

export class PatreonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
    readonly bodyText?: string,
  ) {
    super(message);
  }
}

function userAgent() {
  return "Quipsly Patreon Beta Access/1.0 (https://quipsly.com; contact: support@quipsly.com)";
}

async function patreonFetch(path: string, init: RequestInit = {}) {
  const config = getPatreonConfig();
  const accessToken = requirePatreonConfigValue(
    config.creatorAccessToken,
    "QUIPSLY_PATREON_CREATOR_ACCESS_TOKEN",
  );

  const response = await fetch(`${PATREON_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent(),
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  const bodyText = await response.text();

  if (!response.ok) {
    let retryAfterSeconds: number | undefined;
    try {
      const parsed = JSON.parse(bodyText);
      const retryValue = parsed?.retry_after_seconds;
      if (typeof retryValue === "number") retryAfterSeconds = retryValue;
    } catch {
      // ignore parse failures
    }

    throw new PatreonApiError(
      `Patreon API returned HTTP ${response.status}`,
      response.status,
      retryAfterSeconds,
      bodyText.slice(0, 2000),
    );
  }

  return bodyText ? JSON.parse(bodyText) : null;
}

const memberFields = [
  "campaign_lifetime_support_cents",
  "currently_entitled_amount_cents",
  "full_name",
  "is_free_trial",
  "is_gifted",
  "last_charge_date",
  "last_charge_status",
  "next_charge_date",
  "patron_status",
  "pledge_relationship_start",
  "will_pay_amount_cents",
].join(",");

const tierFields = ["title", "amount_cents", "published", "url"].join(",");
const userFields = ["email", "full_name", "image_url", "url"].join(",");

function memberQuery() {
  const params = new URLSearchParams({
    include: "campaign,currently_entitled_tiers,user",
    "fields[member]": memberFields,
    "fields[tier]": tierFields,
    "fields[user]": userFields,
  });

  return params.toString();
}

export async function fetchPatreonMember(memberId: string) {
  return patreonFetch(`/members/${encodeURIComponent(memberId)}?${memberQuery()}`);
}

export async function listPatreonCampaignMembers(cursor?: string | null) {
  const config = getPatreonConfig();
  const campaignId = requirePatreonConfigValue(
    config.campaignId,
    "QUIPSLY_PATREON_CAMPAIGN_ID",
  );

  const params = new URLSearchParams({
    include: "currently_entitled_tiers,user",
    "fields[member]": memberFields,
    "fields[tier]": tierFields,
    "fields[user]": userFields,
    "page[count]": "500",
  });

  if (cursor) {
    params.set("page[cursor]", cursor);
  }

  return patreonFetch(`/campaigns/${encodeURIComponent(campaignId)}/members?${params.toString()}`);
}

export async function exchangePatreonOAuthCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  const config = getPatreonConfig();
  const clientId = requirePatreonConfigValue(config.clientId, "QUIPSLY_PATREON_CLIENT_ID");
  const clientSecret = requirePatreonConfigValue(
    config.clientSecret,
    "QUIPSLY_PATREON_CLIENT_SECRET",
  );

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch(PATREON_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": userAgent(),
    },
    body,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new PatreonApiError(
      `Patreon OAuth token exchange returned HTTP ${response.status}`,
      response.status,
      undefined,
      bodyText.slice(0, 2000),
    );
  }

  return JSON.parse(bodyText);
}

export async function fetchPatreonOAuthIdentity(accessToken: string) {
  const params = new URLSearchParams({
    include: "memberships",
    "fields[user]": userFields,
    "fields[member]": memberFields,
  });

  const response = await fetch(`${PATREON_API_BASE}/identity?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent(),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new PatreonApiError(
      `Patreon identity returned HTTP ${response.status}`,
      response.status,
      undefined,
      bodyText.slice(0, 2000),
    );
  }

  return JSON.parse(bodyText);
}
```

Token note:

```txt
Do not store user OAuth access/refresh tokens for MVP unless required. Exchange code,
fetch identity, persist ProviderAccount and ProviderMembership facts, then discard user token.
Creator token is the server-side campaign API credential and must live only in Secret Manager/env.
```

---

## 15. Member normalizer

Create:

```txt
apps/quipsly/src/lib/patreon/member-normalizer.ts
```

Purpose:

```txt
Convert Patreon JSON:API member response into stable Quipsly facts.
```

Skeleton:

```ts
export type NormalizedPatreonTier = {
  providerTierId: string;
  title: string | null;
  amountCents: number | null;
};

export type NormalizedPatreonMember = {
  campaignId: string;
  providerMemberId: string;
  providerUserId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  userAvatarUrl: string | null;
  patronStatus: string | null;
  lastChargeStatus: string | null;
  lastChargeDate: Date | null;
  nextChargeDate: Date | null;
  currentlyEntitledAmountCents: number | null;
  willPayAmountCents: number | null;
  campaignLifetimeSupportCents: number | null;
  pledgeRelationshipStart: Date | null;
  isFreeTrial: boolean | null;
  isGifted: boolean | null;
  tiers: NormalizedPatreonTier[];
  raw: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asDate(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function includedByTypeAndId(payload: any, type: string, id: string | null) {
  if (!id || !Array.isArray(payload?.included)) return null;
  return payload.included.find((entry: any) => entry?.type === type && entry?.id === id) ?? null;
}

function relationshipDataId(data: any, key: string): string | null {
  const relData = data?.relationships?.[key]?.data;
  if (Array.isArray(relData)) {
    return null;
  }
  return asString(relData?.id);
}

function relationshipDataIds(data: any, key: string): string[] {
  const relData = data?.relationships?.[key]?.data;
  if (!Array.isArray(relData)) return [];
  return relData.map((entry) => asString(entry?.id)).filter(Boolean) as string[];
}

export function normalizePatreonMemberPayload(payload: any): NormalizedPatreonMember {
  const data = payload?.data;
  if (!data || data.type !== "member" || !data.id) {
    throw new Error("Patreon member response did not include data.type=member and data.id.");
  }

  const attributes = data.attributes ?? {};
  const campaignId = relationshipDataId(data, "campaign");
  const providerUserId = relationshipDataId(data, "user");
  const user = includedByTypeAndId(payload, "user", providerUserId);
  const tierIds = relationshipDataIds(data, "currently_entitled_tiers");

  const tiers = tierIds.map((tierId) => {
    const tier = includedByTypeAndId(payload, "tier", tierId);
    return {
      providerTierId: tierId,
      title: asString(tier?.attributes?.title),
      amountCents: asNumber(tier?.attributes?.amount_cents),
    };
  });

  if (!campaignId) {
    throw new Error("Patreon member response did not include campaign relationship id.");
  }

  return {
    campaignId,
    providerMemberId: data.id,
    providerUserId,
    userEmail: asString(user?.attributes?.email),
    userDisplayName: asString(user?.attributes?.full_name) ?? asString(attributes.full_name),
    userAvatarUrl: asString(user?.attributes?.image_url),
    patronStatus: asString(attributes.patron_status),
    lastChargeStatus: asString(attributes.last_charge_status),
    lastChargeDate: asDate(attributes.last_charge_date),
    nextChargeDate: asDate(attributes.next_charge_date),
    currentlyEntitledAmountCents: asNumber(attributes.currently_entitled_amount_cents),
    willPayAmountCents: asNumber(attributes.will_pay_amount_cents),
    campaignLifetimeSupportCents: asNumber(attributes.campaign_lifetime_support_cents),
    pledgeRelationshipStart: asDate(attributes.pledge_relationship_start),
    isFreeTrial: asBoolean(attributes.is_free_trial),
    isGifted: asBoolean(attributes.is_gifted),
    tiers,
    raw: payload,
  };
}
```

The normalizer should be unit-tested with fixtures representing:

```txt
active member with user and tier
active member with null email
active member with hidden name
former patron with no entitled tiers
declined patron with lastChargeStatus Declined
member payload missing campaign relationship -> throws
```

---

## 16. Beta access policy function

Create:

```txt
apps/quipsly/src/lib/patreon/beta-access-policy.ts
```

This must be pure and heavily tested.

Skeleton:

```ts
import { createHash } from "node:crypto";

import type { NormalizedPatreonMember } from "./member-normalizer";

export const QUIPSLY_BETA_PRODUCT_KEY = "QUIPSLY_BETA" as const;
export const PATREON_BETA_RULE_VERSION = "patreon-quipsly-beta-v1" as const;

export type BetaAccessDecisionStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "MANUAL_REVIEW";

export type BetaAccessDecision = {
  status: BetaAccessDecisionStatus;
  subscriptionStatus: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "MANUAL_REVIEW";
  reasonCode: string;
  reasonMessage: string;
  startsAt: Date | null;
  endsAt: Date | null;
  graceEndsAt: Date | null;
  ruleVersion: typeof PATREON_BETA_RULE_VERSION;
  inputHash: string;
  details: Record<string, unknown>;
};

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function hashDecisionInput(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

const disqualifyingChargeStatuses = new Set([
  "declined",
  "deleted",
  "fraud",
  "refunded",
]);

export function evaluateQuipslyPatreonBetaAccess(input: {
  membership: NormalizedPatreonMember;
  linkedUserId: string | null;
  expectedCampaignId: string;
  qualifyingTierIds: Set<string>;
  allowGiftedBeta: boolean;
  allowFreeTrialBeta: boolean;
  now?: Date;
}): BetaAccessDecision {
  const now = input.now ?? new Date();
  const tierIds = input.membership.tiers.map((tier) => tier.providerTierId);
  const patronStatus = normalizeStatus(input.membership.patronStatus);
  const lastChargeStatus = normalizeStatus(input.membership.lastChargeStatus);
  const hasQualifyingTier = tierIds.some((tierId) => input.qualifyingTierIds.has(tierId));
  const entitledAmount = input.membership.currentlyEntitledAmountCents ?? 0;
  const giftedAllowed = input.allowGiftedBeta && input.membership.isGifted === true;
  const freeTrialAllowed = input.allowFreeTrialBeta && input.membership.isFreeTrial === true;

  const details = {
    provider: "PATREON",
    productKey: QUIPSLY_BETA_PRODUCT_KEY,
    providerMemberId: input.membership.providerMemberId,
    providerUserId: input.membership.providerUserId,
    campaignId: input.membership.campaignId,
    expectedCampaignId: input.expectedCampaignId,
    tierIds,
    hasQualifyingTier,
    patronStatus,
    lastChargeStatus,
    currentlyEntitledAmountCents: entitledAmount,
    isGifted: input.membership.isGifted,
    isFreeTrial: input.membership.isFreeTrial,
    linkedUserId: input.linkedUserId,
    evaluatedAt: now.toISOString(),
  };

  function decision(
    status: BetaAccessDecisionStatus,
    subscriptionStatus: BetaAccessDecision["subscriptionStatus"],
    reasonCode: string,
    reasonMessage: string,
  ): BetaAccessDecision {
    return {
      status,
      subscriptionStatus,
      reasonCode,
      reasonMessage,
      startsAt: status === "ACTIVE" ? now : null,
      endsAt: status === "ACTIVE" ? null : now,
      graceEndsAt: null,
      ruleVersion: PATREON_BETA_RULE_VERSION,
      inputHash: hashDecisionInput({ ...details, reasonCode, status }),
      details,
    };
  }

  if (input.membership.campaignId !== input.expectedCampaignId) {
    return decision(
      "MANUAL_REVIEW",
      "MANUAL_REVIEW",
      "PATREON_CAMPAIGN_MISMATCH",
      "The Patreon member belongs to a different campaign than Quipsly expects.",
    );
  }

  if (!input.linkedUserId) {
    return decision(
      "PENDING",
      "PENDING",
      "PATREON_ACCOUNT_NOT_LINKED",
      "The Patreon membership has not been safely linked to a Quipsly user.",
    );
  }

  if (!input.membership.providerUserId) {
    return decision(
      "MANUAL_REVIEW",
      "MANUAL_REVIEW",
      "PATREON_USER_ID_MISSING",
      "The Patreon member did not include a provider user id.",
    );
  }

  if (patronStatus === "former_patron") {
    return decision(
      "EXPIRED",
      "EXPIRED",
      "FORMER_PATRON",
      "The Patreon membership is no longer active.",
    );
  }

  if (patronStatus === "declined_patron") {
    return decision(
      "EXPIRED",
      "PAST_DUE",
      "DECLINED_PATRON",
      "The Patreon membership is declined.",
    );
  }

  if (lastChargeStatus && disqualifyingChargeStatuses.has(lastChargeStatus)) {
    return decision(
      "EXPIRED",
      "PAST_DUE",
      "DISQUALIFYING_CHARGE_STATUS",
      "The latest Patreon charge status does not qualify for beta access.",
    );
  }

  if (!hasQualifyingTier) {
    return decision(
      "EXPIRED",
      "EXPIRED",
      "NO_QUALIFYING_PATREON_TIER",
      "The current Patreon tiers do not grant Quipsly beta access.",
    );
  }

  if (entitledAmount <= 0 && !giftedAllowed && !freeTrialAllowed) {
    return decision(
      "EXPIRED",
      "EXPIRED",
      "NO_CURRENT_ENTITLED_AMOUNT",
      "The Patreon membership does not currently include a paid entitlement amount.",
    );
  }

  if (patronStatus === "active_patron") {
    return decision(
      "ACTIVE",
      "ACTIVE",
      "QUALIFYING_PATREON_MEMBER",
      "The linked Patreon membership qualifies for Quipsly beta access.",
    );
  }

  return decision(
    "MANUAL_REVIEW",
    "MANUAL_REVIEW",
    "UNKNOWN_PATREON_STATUS",
    "The Patreon member status was not recognized by Quipsly's beta policy.",
  );
}
```

Test matrix:

```txt
active_patron + qualifying tier + amount > 0 -> ACTIVE
active_patron + no qualifying tier -> EXPIRED
active_patron + amount 0 + gifted false/free false -> EXPIRED
active_patron + amount 0 + gifted true + allow gifted -> ACTIVE
former_patron -> EXPIRED
declined_patron -> EXPIRED/PAST_DUE
lastChargeStatus Declined -> EXPIRED/PAST_DUE
missing linked user -> PENDING
campaign mismatch -> MANUAL_REVIEW
missing providerUserId -> MANUAL_REVIEW
unknown patron status -> MANUAL_REVIEW
```

---

## 17. Reconciler

Create:

```txt
apps/quipsly/src/lib/patreon/reconciler.ts
```

### 17.1 Responsibilities

```txt
- Claim pending ProviderEvent rows with a lease.
- Fetch canonical Patreon member state when providerMemberId exists.
- Upsert ProviderAccount.
- Upsert ProviderMembership.
- Replace ProviderMembershipTier rows.
- Link membership to user only when safe.
- Evaluate beta access policy.
- Upsert Subscription.
- Upsert Entitlement.
- Write EntitlementDecision.
- Mark ProviderEvent processed, ignored, failed, or needs review.
- Create ManualReviewCase when automation cannot decide safely.
```

### 17.2 Claiming rows without SKIP LOCKED

Prisma does not expose PostgreSQL `FOR UPDATE SKIP LOCKED` nicely. Use a lease pattern for MVP.

Pseudo:

```ts
async function claimProviderEventBatch({ batchSize, lockOwner }: { batchSize: number; lockOwner: string }) {
  const prisma = getPrismaClient();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + 5 * 60 * 1000);

  const candidates = await prisma.providerEvent.findMany({
    where: {
      provider: "PATREON",
      status: { in: ["RECEIVED", "FAILED"] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    orderBy: { receivedAt: "asc" },
    take: batchSize,
  });

  const claimed = [];

  for (const event of candidates) {
    const result = await prisma.providerEvent.updateMany({
      where: {
        id: event.id,
        status: { in: ["RECEIVED", "FAILED"] },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: {
        status: "PROCESSING",
        lockOwner,
        lockedUntil,
        attempts: { increment: 1 },
      },
    });

    if (result.count === 1) {
      claimed.push(event.id);
    }
  }

  return claimed;
}
```

Prisma object cannot include duplicate `OR` keys in a single object. In actual code, combine conditions under `AND`:

```ts
where: {
  provider: "PATREON",
  status: { in: ["RECEIVED", "FAILED"] },
  AND: [
    { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
  ],
}
```

### 17.3 Reconcile one event

Pseudo:

```ts
export async function reconcilePatreonProviderEvent(eventId: string) {
  const prisma = getPrismaClient();
  const config = getPatreonConfig();

  const event = await prisma.providerEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  if (!event.providerMemberId) {
    await markEventNeedsReview(event.id, "MISSING_PROVIDER_MEMBER_ID");
    return;
  }

  let memberPayload: unknown;

  try {
    memberPayload = await fetchPatreonMember(event.providerMemberId);
  } catch (error) {
    await handlePatreonFetchError(event, error);
    return;
  }

  let normalized;
  try {
    normalized = normalizePatreonMemberPayload(memberPayload);
  } catch (error) {
    await markEventNeedsReview(event.id, "PATREON_MEMBER_NORMALIZATION_FAILED", error);
    return;
  }

  const expectedCampaignId = requirePatreonConfigValue(
    config.campaignId,
    "QUIPSLY_PATREON_CAMPAIGN_ID",
  );

  await prisma.$transaction(async (tx) => {
    const providerAccount = await upsertProviderAccount(tx, normalized);
    const linkedUserId = await determineLinkedUserId(tx, providerAccount, normalized);
    const membership = await upsertProviderMembership(tx, normalized, providerAccount.id, linkedUserId);

    await replaceProviderMembershipTiers(tx, membership.id, normalized, config.betaTierIds);

    const decision = evaluateQuipslyPatreonBetaAccess({
      membership: normalized,
      linkedUserId,
      expectedCampaignId,
      qualifyingTierIds: config.betaTierIds,
      allowGiftedBeta: config.allowGiftedBeta,
      allowFreeTrialBeta: config.allowFreeTrialBeta,
    });

    const subscription = await upsertSubscription(tx, membership.id, linkedUserId, normalized, decision);
    const entitlement = await upsertEntitlement(tx, membership.id, linkedUserId, subscription.id, decision);

    await tx.entitlementDecision.create({
      data: {
        entitlementId: entitlement.id,
        providerEventId: event.id,
        providerMembershipId: membership.id,
        oldStatus: null, // fill from existing entitlement before update if available
        newStatus: decision.status,
        ruleVersion: decision.ruleVersion,
        inputHash: decision.inputHash,
        summary: decision.reasonMessage,
        detailsJson: decision.details as any,
      },
    });

    if (decision.status === "MANUAL_REVIEW") {
      await upsertManualReviewCase(tx, {
        subjectType: "ProviderMembership",
        subjectId: membership.id,
        reasonCode: decision.reasonCode,
        summary: decision.reasonMessage,
        detailsJson: decision.details,
      });
    }

    await tx.providerEvent.update({
      where: { id: event.id },
      data: {
        status: decision.status === "MANUAL_REVIEW" ? "NEEDS_REVIEW" : "PROCESSED",
        processedAt: new Date(),
        lockedUntil: null,
        lockOwner: null,
        nextAttemptAt: null,
        lastError: null,
      },
    });
  });
}
```

### 17.4 Upsert ProviderAccount

Rules:

```txt
- providerUserId present -> upsert by (PATREON, providerUserId).
- If existing ProviderAccount has no userId and the OAuth link later provides one,
  attach it there.
- If existing ProviderAccount.userId differs from the signed-in linking user,
  mark CONFLICT and create ManualReviewCase.
- Do not attach by email automatically unless operator explicitly adds that behavior.
```

### 17.5 Upsert ProviderMembership

Rules:

```txt
- Unique by provider + campaignId + providerMemberId.
- Update canonical provider facts from normalized member.
- Set syncState CURRENT when fetched successfully.
- Set lastFetchedAt and lastSeenAt.
- Set userId from safely linked ProviderAccount.userId.
```

### 17.6 Replace ProviderMembershipTier rows

Use transaction:

```ts
await tx.providerMembershipTier.deleteMany({ where: { membershipId } });
await tx.providerMembershipTier.createMany({
  data: normalized.tiers.map((tier) => ({
    membershipId,
    providerTierId: tier.providerTierId,
    title: tier.title,
    amountCents: tier.amountCents,
    isQualifyingBeta: config.betaTierIds.has(tier.providerTierId),
  })),
  skipDuplicates: true,
});
```

### 17.7 Upsert Subscription

Recommended unique lookup for MVP:

```txt
providerMembershipId + productKey + source
```

Prisma cannot unique those unless you add a compound unique.

Add to `Subscription`:

```prisma
@@unique([providerMembershipId, productKey, source])
```

Then upsert:

```ts
await tx.subscription.upsert({
  where: {
    providerMembershipId_productKey_source: {
      providerMembershipId: membership.id,
      productKey: "QUIPSLY_BETA",
      source: "PATREON",
    },
  },
  create: {
    userId: linkedUserId,
    productKey: "QUIPSLY_BETA",
    source: "PATREON",
    providerMembershipId: membership.id,
    status: decision.subscriptionStatus,
    providerStatus: normalized.patronStatus,
    reasonCode: decision.reasonCode,
    reasonMessage: decision.reasonMessage,
    lastReconciledAt: new Date(),
  },
  update: {
    userId: linkedUserId,
    status: decision.subscriptionStatus,
    providerStatus: normalized.patronStatus,
    reasonCode: decision.reasonCode,
    reasonMessage: decision.reasonMessage,
    lastReconciledAt: new Date(),
  },
});
```

### 17.8 Upsert Entitlement

Recommended unique lookup for MVP:

```txt
providerMembershipId + productKey + source
```

Add to `Entitlement`:

```prisma
@@unique([providerMembershipId, productKey, source])
```

Then upsert:

```ts
await tx.entitlement.upsert({
  where: {
    providerMembershipId_productKey_source: {
      providerMembershipId: membership.id,
      productKey: "QUIPSLY_BETA",
      source: "PATREON",
    },
  },
  create: {
    userId: linkedUserId,
    productKey: "QUIPSLY_BETA",
    source: "PATREON",
    sourceRefId: membership.id,
    providerMembershipId: membership.id,
    subscriptionId: subscription.id,
    status: decision.status,
    startsAt: decision.startsAt,
    endsAt: decision.endsAt,
    graceEndsAt: decision.graceEndsAt,
    reasonCode: decision.reasonCode,
    reasonMessage: decision.reasonMessage,
    ruleVersion: decision.ruleVersion,
    lastEvaluatedAt: new Date(),
  },
  update: {
    userId: linkedUserId,
    subscriptionId: subscription.id,
    status: decision.status,
    startsAt: decision.status === "ACTIVE" ? decision.startsAt : undefined,
    endsAt: decision.status === "ACTIVE" ? null : decision.endsAt,
    graceEndsAt: decision.graceEndsAt,
    reasonCode: decision.reasonCode,
    reasonMessage: decision.reasonMessage,
    ruleVersion: decision.ruleVersion,
    lastEvaluatedAt: new Date(),
    revokedAt: decision.status === "REVOKED" ? new Date() : undefined,
  },
});
```

Be careful with `startsAt`: do not reset it on every successful active reconciliation if an active entitlement already has a startsAt. Preserve original startsAt if possible.

### 17.9 Retry handling

For Patreon API errors:

```txt
429:
  status FAILED
  nextAttemptAt = now + retryAfterSeconds if present, else exponential backoff

5xx:
  status FAILED
  nextAttemptAt = exponential backoff + jitter

401/403:
  NEEDS_REVIEW
  create ManualReviewCase reason PATREON_API_AUTH_FAILED
  alert operator; token/scope issue likely

404 for member:
  If existing active ProviderMembership exists, mark MISSING_PROVIDER or STALE.
  Do not instantly wipe everyone due to a transient provider/API issue.
  For explicit deletion-type webhook plus canonical missing member, expire or manual-review according to policy.
```

Backoff helper:

```ts
export function nextBackoffDate(attempts: number, retryAfterSeconds?: number): Date {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return new Date(Date.now() + retryAfterSeconds * 1000);
  }

  const minutes = [1, 5, 15, 60, 180, 1440][Math.min(attempts, 5)];
  const jitterMs = Math.floor(Math.random() * 30_000);
  return new Date(Date.now() + minutes * 60_000 + jitterMs);
}
```

---

## 18. Full sync

Create:

```txt
apps/quipsly/src/lib/patreon/full-sync.ts
```

### 18.1 Purpose

Webhooks are not a complete source-of-truth stream. Full sync repairs:

```txt
- missed webhooks
- delayed webhooks
- out-of-order webhooks
- membership deletion/status edge cases
- tier mapping drift
- local reconciliation bugs after policy changes
```

### 18.2 Algorithm

```txt
1. Start sync run id, e.g. syncStartedAt = now.
2. Page through campaign members with explicit fields/includes.
3. For each member:
   - normalize payload
   - upsert ProviderAccount
   - upsert ProviderMembership
   - replace ProviderMembershipTier
   - evaluate policy
   - upsert Subscription/Entitlement
   - write EntitlementDecision with providerEventId = null and details.syncRun = ...
4. After all pages succeed:
   - find ProviderMembership rows for campaign not seen since syncStartedAt
   - mark STALE first
   - if staleSince older than configured grace window, expire or manual-review
5. If API fails before all pages succeed:
   - mark sync ERROR
   - do not expire missing memberships
```

### 18.3 Schedule

MVP schedule:

```txt
patreon reconcile events: every 1-5 minutes
patreon full sync: nightly
patreon full sync during launch week: every 6 hours if traffic is high
```

---

## 19. OAuth account linking

### 19.1 Why OAuth link is needed

Webhook data alone is not safe identity. Email may be missing, hidden, or changed. The user should sign into Quipsly with Google, then link Patreon. That creates:

```txt
User -> ProviderAccount(provider=PATREON, providerUserId=...)
```

Provider events can then attach provider memberships to the correct app user without trusting email.

### 19.2 Start route

Create:

```txt
apps/quipsly/src/app/api/patreon/link/start/route.ts
```

Behavior:

```txt
- Require signed-in Quipsly session.
- Generate random state with crypto.randomBytes(32).toString("base64url").
- Store sha256(state) in PatreonOAuthState with userId and expiresAt now+10min.
- Redirect to Patreon OAuth authorize URL.
- Use scopes: identity identity[email] identity.memberships.
- Redirect URI: ${QUIPSLY_SITE_URL}/api/patreon/link/callback.
```

Skeleton:

```ts
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { getPatreonConfig, requirePatreonConfigValue } from "@/lib/patreon/config";
import { sha256Hex } from "@/lib/patreon/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const config = getPatreonConfig();
  const clientId = requirePatreonConfigValue(config.clientId, "QUIPSLY_PATREON_CLIENT_ID");
  const siteUrl = config.siteUrl.replace(/\/$/, "");
  const redirectUri = `${siteUrl}/api/patreon/link/callback`;
  const state = crypto.randomBytes(32).toString("base64url");

  const prisma = getPrismaClient();
  await prisma.patreonOAuthState.create({
    data: {
      userId,
      stateHash: sha256Hex(state),
      redirectTo: "/settings/beta-access",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "identity identity[email] identity.memberships",
    state,
  });

  redirect(`https://www.patreon.com/oauth2/authorize?${params.toString()}`);
}
```

### 19.3 Callback route

Create:

```txt
apps/quipsly/src/app/api/patreon/link/callback/route.ts
```

Behavior:

```txt
- Require signed-in Quipsly session.
- Validate code and state.
- Hash state and find unconsumed PatreonOAuthState for same user, not expired.
- Mark consumed inside transaction.
- Exchange code for access token.
- Fetch Patreon identity.
- Upsert ProviderAccount(provider=PATREON, providerUserId=identity.data.id).
- If ProviderAccount exists with a different userId, set CONFLICT and create ManualReviewCase.
- Attach matching ProviderMembership rows for providerUserId to this user if no conflict.
- Trigger reconciliation or direct fetch campaign membership if identity includes memberships.
- Redirect to /settings/beta-access?linked=1 or ?review=1.
- Do not store user OAuth token for MVP.
```

Pseudo skeleton:

```ts
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.redirect(new URL("/", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectToStatus(request.url, "error=missing_oauth_params");

  const prisma = getPrismaClient();
  const stateHash = sha256Hex(state);

  const oauthState = await prisma.patreonOAuthState.findFirst({
    where: {
      userId,
      stateHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!oauthState) {
    return redirectToStatus(request.url, "error=invalid_state");
  }

  await prisma.patreonOAuthState.update({
    where: { id: oauthState.id },
    data: { consumedAt: new Date() },
  });

  const config = getPatreonConfig();
  const redirectUri = `${config.siteUrl.replace(/\/$/, "")}/api/patreon/link/callback`;
  const token = await exchangePatreonOAuthCode({ code, redirectUri });
  const identity = await fetchPatreonOAuthIdentity(token.access_token);

  // Normalize identity and upsert ProviderAccount.
}
```

Use a transaction around ProviderAccount update and conflict/manual review creation.

### 19.4 Account conflict handling

Conflict case:

```txt
ProviderAccount(PATREON, patreonUserId) already exists with userId = A.
Signed-in user is B.
```

Do:

```txt
- Do not move the provider account automatically.
- Set ProviderAccount.status = CONFLICT.
- Create ManualReviewCase with subjectType ProviderAccount.
- Redirect signed-in user to /settings/beta-access?review=1.
```

### 19.5 Account unlinking

MVP does not need unlinking. If adding later:

```txt
- Do not delete provider account rows.
- Set status REVOKED or userId null with audit trail.
- Expire/review entitlements from that provider account.
```

---

## 20. Quipsly beta access reader

Create:

```txt
apps/quipsly/src/lib/server/quipsly-beta-access.ts
```

This is the only app-facing API for access checks.

Skeleton:

```ts
import "server-only";

import { getPrismaClient } from "@/lib/prisma";
import { QUIPSLY_BETA_PRODUCT_KEY } from "@/lib/patreon/beta-access-policy";

export type QuipslyBetaUiState =
  | "NOT_LINKED"
  | "PENDING"
  | "ACTIVE"
  | "EXPIRED"
  | "MANUAL_REVIEW_NEEDED";

export type QuipslyBetaAccessState = {
  canAccess: boolean;
  uiState: QuipslyBetaUiState;
  reasonCode: string;
  reasonMessage: string;
  lastCheckedAt: Date | null;
  providerAccountLinked: boolean;
  entitlementStatus: string | null;
};

export async function getQuipslyBetaAccessState(
  userId: string | null | undefined,
): Promise<QuipslyBetaAccessState> {
  if (!userId) {
    return {
      canAccess: false,
      uiState: "NOT_LINKED",
      reasonCode: "SIGNED_OUT",
      reasonMessage: "Sign in to check Quipsly beta access.",
      lastCheckedAt: null,
      providerAccountLinked: false,
      entitlementStatus: null,
    };
  }

  const prisma = getPrismaClient();

  const [providerAccount, entitlement, openReview] = await Promise.all([
    prisma.providerAccount.findFirst({
      where: { userId, provider: "PATREON", status: { in: ["LINKED", "CONFLICT"] } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.entitlement.findFirst({
      where: {
        userId,
        productKey: QUIPSLY_BETA_PRODUCT_KEY,
        source: "PATREON",
        revokedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.manualReviewCase.findFirst({
      where: {
        status: "OPEN",
        OR: [
          { subjectType: "ProviderAccount" },
          { subjectType: "ProviderMembership" },
          { subjectType: "Entitlement" },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (providerAccount?.status === "CONFLICT" || openReview) {
    return {
      canAccess: false,
      uiState: "MANUAL_REVIEW_NEEDED",
      reasonCode: "MANUAL_REVIEW_OPEN",
      reasonMessage: "We found a Patreon record, but it needs manual review before enabling access.",
      lastCheckedAt: entitlement?.lastEvaluatedAt ?? providerAccount?.lastSeenAt ?? null,
      providerAccountLinked: Boolean(providerAccount),
      entitlementStatus: entitlement?.status ?? null,
    };
  }

  if (!providerAccount) {
    return {
      canAccess: false,
      uiState: "NOT_LINKED",
      reasonCode: "PATREON_NOT_LINKED",
      reasonMessage: "Link Patreon to request Quipsly beta access.",
      lastCheckedAt: null,
      providerAccountLinked: false,
      entitlementStatus: null,
    };
  }

  if (!entitlement) {
    return {
      canAccess: false,
      uiState: "PENDING",
      reasonCode: "ENTITLEMENT_NOT_EVALUATED",
      reasonMessage: "Your Patreon account is linked and Quipsly is verifying beta access.",
      lastCheckedAt: providerAccount.lastSeenAt,
      providerAccountLinked: true,
      entitlementStatus: null,
    };
  }

  if (entitlement.status === "ACTIVE") {
    const now = new Date();
    const startsOk = !entitlement.startsAt || entitlement.startsAt <= now;
    const endsOk = !entitlement.endsAt || entitlement.endsAt > now;

    if (startsOk && endsOk) {
      return {
        canAccess: true,
        uiState: "ACTIVE",
        reasonCode: entitlement.reasonCode ?? "ACTIVE",
        reasonMessage: "Your Quipsly beta access is active through Patreon.",
        lastCheckedAt: entitlement.lastEvaluatedAt,
        providerAccountLinked: true,
        entitlementStatus: entitlement.status,
      };
    }
  }

  if (entitlement.status === "PENDING") {
    return {
      canAccess: false,
      uiState: "PENDING",
      reasonCode: entitlement.reasonCode ?? "PENDING",
      reasonMessage: entitlement.reasonMessage ?? "Quipsly is verifying beta access.",
      lastCheckedAt: entitlement.lastEvaluatedAt,
      providerAccountLinked: true,
      entitlementStatus: entitlement.status,
    };
  }

  if (entitlement.status === "MANUAL_REVIEW") {
    return {
      canAccess: false,
      uiState: "MANUAL_REVIEW_NEEDED",
      reasonCode: entitlement.reasonCode ?? "MANUAL_REVIEW",
      reasonMessage: entitlement.reasonMessage ?? "A Quipsly team member needs to review this Patreon access record.",
      lastCheckedAt: entitlement.lastEvaluatedAt,
      providerAccountLinked: true,
      entitlementStatus: entitlement.status,
    };
  }

  return {
    canAccess: false,
    uiState: "EXPIRED",
    reasonCode: entitlement.reasonCode ?? "EXPIRED",
    reasonMessage: entitlement.reasonMessage ?? "Your Patreon beta access is no longer active.",
    lastCheckedAt: entitlement.lastEvaluatedAt,
    providerAccountLinked: true,
    entitlementStatus: entitlement.status,
  };
}
```

Review the `openReview` query before shipping. The simplistic version above does not scope review cases to the current user's provider account/membership. Better implementation:

```txt
1. Fetch current user's ProviderAccount ids.
2. Fetch current user's ProviderMembership ids.
3. Fetch current user's Entitlement ids.
4. Look for open ManualReviewCase where subject id is in those ids.
```

---

## 21. Update Quipsly app access gate

### 21.1 Update `studio-access.ts`

Current file:

```txt
apps/quipsly/src/lib/server/studio-access.ts
```

Currently returns:

```txt
canAccess: canAccessStudio(roles)
```

Change to:

```ts
import { auth } from "@/auth";
import { canAccessStudio } from "@/lib/studio-authz";
import { getQuipslyBetaAccessState } from "@/lib/server/quipsly-beta-access";

export async function getStudioAccessState() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const userId = session?.user?.id || "";
  const actorLabel =
    session?.user?.primaryEmail || session?.user?.email || session?.user?.id || "";

  const isStaff = canAccessStudio(roles);
  const betaAccess = await getQuipslyBetaAccessState(userId || null);

  return {
    session,
    roles,
    actorLabel,
    isSignedIn: Boolean(userId),
    isStaff,
    betaAccess,
    canAccess: isStaff || betaAccess.canAccess,
  };
}
```

Staff keeps access independent from Patreon.

### 21.2 Update `page.tsx`

Current `apps/quipsly/src/app/page.tsx` renders denied shell when `!access.canAccess`.

Pass the beta state to the shell:

```tsx
if (!access.canAccess) {
  return (
    <StudioAccessShell
      mode="denied"
      email={access.actorLabel || undefined}
      roles={access.roles}
      betaAccess={access.betaAccess}
    />
  );
}
```

### 21.3 Update `StudioAccessShell`

Current shell says access requires approved Studio team role. Change copy to support Patreon beta access.

Recommended shell modes:

```txt
signed-out:
  "Sign in to Quipsly"
  copy: "Sign in with Google, then link Patreon to request private beta access."

denied + NOT_LINKED:
  "Link Patreon to request Quipsly beta access"
  buttons: Link Patreon, Sign out

denied + PENDING:
  "Quipsly is verifying your Patreon beta access"
  buttons: Refresh status, Sign out

denied + EXPIRED:
  "Your Patreon beta access is not active"
  buttons: Manage Patreon, Refresh status, Sign out

denied + MANUAL_REVIEW_NEEDED:
  "Your Patreon access needs manual review"
  buttons: Contact support, Sign out
```

Add a `betaAccess?: QuipslyBetaAccessState` prop. Avoid showing raw payment status or raw `Declined/Fraud/Deleted` values to users.

### 21.4 Add status settings page

Create:

```txt
apps/quipsly/src/app/settings/beta-access/page.tsx
```

Behavior:

```txt
- Requires sign-in.
- Displays current beta UI state.
- Shows "Link Patreon" if not linked.
- Shows "Refresh status" button if linked but not active.
- Shows lastCheckedAt if available.
- Shows support reference using entitlement/provider account id or a friendly short id.
- Does not reveal raw Patreon billing internals.
```

MVP page can be server-rendered and use simple forms/links.

---

## 22. Internal reconciliation routes or scripts

There are two practical MVP options.

### Option A: Protected internal Next.js routes

Create:

```txt
apps/quipsly/src/app/api/internal/patreon/reconcile/route.ts
apps/quipsly/src/app/api/internal/patreon/full-sync/route.ts
```

Protect with header:

```txt
Authorization: Bearer ${QUIPSLY_JOB_SECRET}
```

Pros:

```txt
- Easier first deployment.
- No separate job image needed.
- Cloud Scheduler can call HTTP endpoint.
```

Cons:

```txt
- Still subject to Cloud Run request timeout.
- Must keep batch small.
- Less clean than Cloud Run Jobs for long-running work.
```

For MVP, internal route is acceptable if batch size is small and reconciliation is idempotent.

Skeleton:

```ts
import { NextResponse } from "next/server";

import { getPatreonConfig } from "@/lib/patreon/config";
import { reconcileNextPatreonProviderEvents } from "@/lib/patreon/reconciler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const config = getPatreonConfig();
  const expected = config.jobSecret;
  const header = request.headers.get("authorization") || "";
  return Boolean(expected) && header === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcileNextPatreonProviderEvents({ batchSize: 10 });
  return NextResponse.json({ ok: true, ...result });
}
```

### Option B: Cloud Run Job scripts

Create:

```txt
scripts/quipsly-patreon-reconcile-events.mjs
scripts/quipsly-patreon-full-sync.mjs
```

These can import compiled app helpers only if path aliases work. Simpler option: create scripts in TypeScript style and run through the repo's existing TypeScript loader if available, or keep job logic in the Next app internal routes first.

Future Cloud Run Job command:

```bash
node scripts/quipsly-patreon-reconcile-events.mjs
```

Cloud Run Jobs are the better production shape, especially for full sync.

### Recommendation

Implement **Option A** for first beta launch, plus design the code so it can be called by scripts/jobs later. Add Cloud Run Job scaffolding after Quipsly Cloud Run deployment is stable.

---

## 23. Webhook duplicate, retry, and ordering handling

### 23.1 Duplicate event behavior

Patreon retries failed deliveries. Treat duplicate deliveries as normal.

Webhook route behavior:

```txt
- Same raw signed event arrives twice.
- eventKey unique constraint catches it.
- Route returns 200 with duplicate true.
- Reconciler does not run duplicate work.
```

Do not use only `providerMemberId` as event key. The same member will have many legitimate events.

Recommended key:

```txt
PATREON:${eventType}:${providerMemberId || providerUserId || campaignId || "missing-resource"}:${rawBodySha256}
```

### 23.2 Out-of-order events

Do not apply webhook deltas. Always fetch canonical member when possible and derive current entitlement from canonical state.

If event A says active and event B says declined, but A arrives after B, canonical fetch still sees the current provider state.

### 23.3 Changed memberships and tier changes

Events to subscribe to:

```txt
members:create
members:update
members:delete
members:pledge:create
members:pledge:update
members:pledge:delete
```

Tier changes should be reconciled from current `currently_entitled_tiers`, not from old/new tier deltas in a webhook.

### 23.4 Deleted memberships

Patreon deletion triggers are nuanced. Do not rely on `members:delete` alone. Full sync is required.

Rules:

```txt
- A deletion/update webhook should enqueue reconciliation.
- If canonical fetch says missing and local membership was active, mark STALE or MANUAL_REVIEW first unless deletion is unambiguous.
- Full sync can expire after configured staleness window.
```

### 23.5 Pledge declines

Declines should not grant new beta access. For MVP:

```txt
lastChargeStatus Declined -> Entitlement EXPIRED, Subscription PAST_DUE.
patronStatus declined_patron -> Entitlement EXPIRED, Subscription PAST_DUE.
```

If the product wants grace later, encode it explicitly in the policy function and decisions.

---

## 24. Manual review

### 24.1 Create review case helper

Create:

```txt
apps/quipsly/src/lib/patreon/manual-review.ts
```

Skeleton:

```ts
import type { Prisma, PrismaClient } from "@prisma/client";

export async function upsertManualReviewCase(
  tx: PrismaClient | Prisma.TransactionClient,
  input: {
    subjectType: string;
    subjectId: string;
    reasonCode: string;
    summary: string;
    detailsJson?: unknown;
  },
) {
  const existing = await tx.manualReviewCase.findFirst({
    where: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reasonCode: input.reasonCode,
      status: "OPEN",
    },
  });

  if (existing) {
    return tx.manualReviewCase.update({
      where: { id: existing.id },
      data: {
        summary: input.summary,
        detailsJson: input.detailsJson as Prisma.InputJsonValue,
      },
    });
  }

  return tx.manualReviewCase.create({
    data: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reasonCode: input.reasonCode,
      summary: input.summary,
      detailsJson: input.detailsJson as Prisma.InputJsonValue,
    },
  });
}
```

### 24.2 MVP admin workflow

No full admin UI is required for first implementation, but include enough data for an operator to inspect in Prisma Studio.

Minimum manual actions:

```txt
- Inspect ProviderAccount by providerUserId.
- Inspect ProviderMembership by providerMemberId.
- Inspect ManualReviewCase.
- Resolve conflict by setting ProviderAccount.userId and status LINKED.
- Re-run reconciliation.
- Create ManualOverride if needed.
```

Add docs for manual SQL/Prisma Studio steps in:

```txt
docs/runbooks/quipsly-patreon-beta-access.md
```

Later admin UI can live under:

```txt
apps/quipsly/src/app/admin/patreon/page.tsx
```

Only expose admin routes to staff roles.

---

## 25. User-facing UI recommendation

### 25.1 States

The UI must show Quipsly's access state, not raw Patreon billing status.

#### NOT_LINKED

```txt
Headline:
  Link Patreon to request Quipsly beta access

Copy:
  Quipsly beta access is available to qualifying Patreon supporters. Sign in with
  Google, then link Patreon so we can verify your supporter status.

Actions:
  Link Patreon
  Sign out
```

#### PENDING

```txt
Headline:
  Quipsly is verifying your Patreon access

Copy:
  Your Patreon connection is saved. Quipsly is checking your current membership
  and tier. This usually updates automatically after Patreon sends the latest
  membership data.

Actions:
  Refresh status
  Contact support
```

#### ACTIVE

```txt
Headline:
  Quipsly beta access is active

Copy:
  Your beta access is active through Patreon. Welcome to the workshop.

Actions:
  Enter Quipsly
  Manage Patreon membership
```

#### EXPIRED

```txt
Headline:
  Patreon beta access is not active

Copy:
  Quipsly could not find an active qualifying Patreon membership for this account.
  You can manage your Patreon membership or refresh this status after updating it.

Actions:
  Manage Patreon membership
  Refresh status
  Contact support
```

#### MANUAL_REVIEW_NEEDED

```txt
Headline:
  Patreon access needs review

Copy:
  We found a Patreon record, but it needs a quick review before beta access can
  be enabled. This can happen when account details are hidden or more than one
  Quipsly account tries to use the same Patreon membership.

Actions:
  Contact support
  Sign out
```

### 25.2 Do not show these to users

Do not show raw values like:

```txt
Fraud
Deleted
Declined
Refunded
campaign_lifetime_support_cents
currently_entitled_amount_cents
providerMemberId
providerUserId
raw Patreon payload
```

Show those only in admin/manual review surfaces.

### 25.3 Last checked

Display:

```txt
Last checked: Jun 5, 2026, 10:14 AM MDT
```

Use `lastEvaluatedAt` from Entitlement or `lastFetchedAt` from ProviderMembership.

---

## 26. File-by-file implementation checklist

### Phase 1: Schema and pure helpers

Files:

```txt
prisma/schema.prisma
apps/quipsly/src/lib/patreon/config.ts
apps/quipsly/src/lib/patreon/signature.ts
apps/quipsly/src/lib/patreon/event-types.ts
apps/quipsly/src/lib/patreon/event-normalizer.ts
apps/quipsly/src/lib/patreon/member-normalizer.ts
apps/quipsly/src/lib/patreon/beta-access-policy.ts
scripts/quipsly-patreon-signature.test.mjs
scripts/quipsly-patreon-event-normalizer.test.mjs
scripts/quipsly-patreon-member-normalizer.test.mjs
scripts/quipsly-patreon-beta-access-policy.test.mjs
package.json
```

Add root script:

```json
"quipsly:patreon:test": "node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/quipsly-patreon-*.test.mjs"
```

If `scripts/register-ts-extension-loader.mjs` is unavailable or not compatible, pattern after existing test scripts. The repo already runs TypeScript-ish scripts with `node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs` in several places.

Validation:

```bash
pnpm quipsly:patreon:test
pnpm db:generate
pnpm --filter quipsly typecheck
git diff --check
```

### Phase 2: Webhook inbox route

Files:

```txt
apps/quipsly/src/lib/patreon/event-inbox.ts
apps/quipsly/src/app/api/webhooks/patreon/route.ts
scripts/quipsly-patreon-webhook-route-notes.test.mjs, optional
```

Manual local smoke can use generated signatures:

```bash
PAYLOAD='{"data":{"type":"member","id":"member_123","relationships":{"campaign":{"data":{"type":"campaign","id":"campaign_123"}},"user":{"data":{"type":"user","id":"user_123"}}}}}'
SIG=$(node -e "const crypto=require('node:crypto'); console.log(crypto.createHmac('md5', process.env.QUIPSLY_PATREON_WEBHOOK_SECRET).update(process.argv[1],'utf8').digest('hex'))" "$PAYLOAD")

curl -i \
  -X POST http://localhost:3000/api/webhooks/patreon \
  -H "X-Patreon-Event: members:update" \
  -H "X-Patreon-Signature: $SIG" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD"
```

Expected:

```txt
200 { ok: true, received: true }
ProviderEvent row exists with status RECEIVED or NEEDS_REVIEW.
```

### Phase 3: Patreon OAuth link

Files:

```txt
apps/quipsly/src/lib/patreon/oauth.ts, optional helper
apps/quipsly/src/lib/patreon/client.ts
apps/quipsly/src/app/api/patreon/link/start/route.ts
apps/quipsly/src/app/api/patreon/link/callback/route.ts
apps/quipsly/src/app/settings/beta-access/page.tsx
```

Validation:

```bash
pnpm --filter quipsly typecheck
pnpm --filter quipsly build
```

Do not call live Patreon in automated tests. Mock helper inputs only.

### Phase 4: Reconciliation

Files:

```txt
apps/quipsly/src/lib/patreon/reconciler.ts
apps/quipsly/src/lib/patreon/manual-review.ts
apps/quipsly/src/app/api/internal/patreon/reconcile/route.ts
scripts/quipsly-patreon-reconciler.test.mjs
```

Validation:

```bash
pnpm quipsly:patreon:test
pnpm --filter quipsly typecheck
pnpm --filter quipsly build
```

### Phase 5: Full sync

Files:

```txt
apps/quipsly/src/lib/patreon/full-sync.ts
apps/quipsly/src/app/api/internal/patreon/full-sync/route.ts
scripts/quipsly-patreon-full-sync.test.mjs
```

Keep full-sync route protected and batch/page conscious.

### Phase 6: Access gate and UI states

Files:

```txt
apps/quipsly/src/lib/server/quipsly-beta-access.ts
apps/quipsly/src/lib/server/studio-access.ts
apps/quipsly/src/app/page.tsx
apps/quipsly/src/app/studio-access-shell.tsx
apps/quipsly/src/app/settings/beta-access/page.tsx
```

Validation:

```bash
pnpm --filter quipsly typecheck
pnpm --filter quipsly build
```

Manual scenarios:

```txt
Signed out -> sign-in shell.
Signed in staff -> app access even without Patreon.
Signed in non-staff, no ProviderAccount -> NOT_LINKED shell.
Signed in non-staff, ProviderAccount linked, no entitlement -> PENDING.
Signed in non-staff, active entitlement -> workbench access.
Signed in non-staff, expired entitlement -> EXPIRED shell.
Signed in non-staff, open review -> MANUAL_REVIEW_NEEDED shell.
```

### Phase 7: Deployment scaffolding

Files:

```txt
apps/quipsly/Dockerfile
cloudbuild.quipsly.yaml
scripts/quipsly-cloud-run-preflight.mjs
scripts/quipsly-cloud-run-deploy.mjs
scripts/quipsly-cloud-run-readiness.test.mjs
.env.example
docs/runbooks/quipsly-patreon-beta-access.md
```

Do not actually deploy unless instructed.

---

## 27. Tests in detail

### 27.1 Signature tests

File:

```txt
scripts/quipsly-patreon-signature.test.mjs
```

Test cases:

```txt
- accepts valid HMAC-MD5 signature over raw body
- rejects missing secret
- rejects missing signature
- rejects malformed signature
- rejects wrong signature
- rejects valid signature over different body
- accepts uppercase hex by lowercasing before compare
```

Example:

```js
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyPatreonWebhookSignature } from "../apps/quipsly/src/lib/patreon/signature.ts";

test("verifies Patreon HMAC-MD5 signature over raw body", () => {
  const rawBody = JSON.stringify({ data: { id: "member_123", type: "member" } });
  const secret = "patreon-secret";
  const signature = createHmac("md5", secret).update(rawBody, "utf8").digest("hex");

  assert.deepEqual(
    verifyPatreonWebhookSignature({
      rawBody,
      signatureHeader: signature,
      webhookSecret: secret,
    }),
    { ok: true },
  );
});
```

### 27.2 Event normalizer tests

Cases:

```txt
- extracts member id, campaign id, user id from member payload.
- creates event key with raw body hash.
- handles missing relationships by returning null ids.
- malformed payload still yields event key using missing-resource.
```

### 27.3 Member normalizer tests

Cases:

```txt
- active member with included user and tiers.
- null email does not throw.
- no current tiers returns empty tiers.
- missing campaign relationship throws.
- date parsing handles nulls.
```

### 27.4 Policy tests

Cases listed in Section 16.

### 27.5 Reconciler tests

Use mocked Patreon client functions and a local test database only if the repo already has a safe test DB pattern. Otherwise, test pure helpers and leave integration tests as manual.

Cases:

```txt
- duplicate event is not processed twice.
- active member upserts account/membership/tier/subscription/entitlement.
- declined member expires entitlement.
- unknown tier creates expired or manual review according to policy.
- account conflict creates ManualReviewCase.
- Patreon 429 marks event FAILED with nextAttemptAt.
- Patreon 401 marks NEEDS_REVIEW.
```

### 27.6 Route smoke tests

Optional, because Next route testing may be heavier. At minimum, add a manual smoke block to the runbook.

---

## 28. Deployment plan for Quipsly Cloud Run

### 28.1 Fix `apps/quipsly/Dockerfile`

Current file appears to build `studio`, not `quipsly`. Replace with a Quipsly-specific standalone build.

Expected shape:

```Dockerfile
# syntax=docker/dockerfile:1

FROM node:22-slim AS base

ARG PNPM_VERSION=10.30.3

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY apps/quipsly/package.json ./apps/quipsly/package.json
COPY packages/content-studio-domain/package.json ./packages/content-studio-domain/package.json
COPY packages/studio-domain/package.json ./packages/studio-domain/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app ./
COPY . .

RUN pnpm --filter quipsly build

FROM node:22-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/.next/static ./apps/quipsly/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/public ./apps/quipsly/public

USER nextjs

EXPOSE 8080

CMD ["node", "apps/quipsly/server.js"]
```

Verify whether `output: "standalone"` exists in `apps/quipsly/next.config.mjs`. If not, add it.

### 28.2 Add Cloud Build file

Create:

```txt
cloudbuild.quipsly.yaml
```

```yaml
substitutions:
  _REGION: us-central1
  _ARTIFACT_REPOSITORY: high-ground-studio
  _IMAGE_NAME: quipsly
  _IMAGE_TAG: manual

steps:
  - id: build-quipsly-image
    name: gcr.io/cloud-builders/docker
    args:
      - build
      - --file
      - apps/quipsly/Dockerfile
      - --tag
      - ${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_IMAGE_NAME}:${_IMAGE_TAG}
      - .

images:
  - ${_REGION}-docker.pkg.dev/$PROJECT_ID/${_ARTIFACT_REPOSITORY}/${_IMAGE_NAME}:${_IMAGE_TAG}
```

### 28.3 Add deploy script

Create:

```txt
scripts/quipsly-cloud-run-deploy.mjs
```

Pattern after `scripts/web-cloud-run-deploy.mjs`, but use dedicated service names/secrets.

Suggested secret bindings:

```js
const QUIPSLY_REQUIRED_SECRET_BINDINGS = [
  ["DATABASE_URL", "quipsly-cloudsql-database-url"],
  ["AUTH_SECRET", "quipsly-auth-secret"],
  ["GOOGLE_CLIENT_ID", "quipsly-google-client-id"],
  ["GOOGLE_CLIENT_SECRET", "quipsly-google-client-secret"],
  ["HGO_OWNER_EMAILS", "quipsly-owner-emails"],
];

const QUIPSLY_OPTIONAL_SECRET_BINDINGS = [
  ["QUIPSLY_PATREON_CLIENT_ID", "quipsly-patreon-client-id"],
  ["QUIPSLY_PATREON_CLIENT_SECRET", "quipsly-patreon-client-secret"],
  ["QUIPSLY_PATREON_WEBHOOK_SECRET", "quipsly-patreon-webhook-secret"],
  ["QUIPSLY_PATREON_CAMPAIGN_ID", "quipsly-patreon-campaign-id"],
  ["QUIPSLY_PATREON_CREATOR_ACCESS_TOKEN", "quipsly-patreon-creator-access-token"],
  ["QUIPSLY_PATREON_CREATOR_REFRESH_TOKEN", "quipsly-patreon-creator-refresh-token"],
  ["QUIPSLY_PATREON_BETA_TIER_IDS", "quipsly-patreon-beta-tier-ids"],
  ["QUIPSLY_JOB_SECRET", "quipsly-job-secret"],
];
```

Set env vars:

```txt
AUTH_TRUST_HOST=true
AUTH_URL=https://quipsly.com or chosen Cloud Run URL
QUIPSLY_SITE_URL=https://quipsly.com or chosen Cloud Run URL
QUIPSLY_PATREON_WEBHOOK_ENABLED=1 only after route is ready and secret is mounted
QUIPSLY_PATREON_RECONCILE_ENABLED=1 only after reconciler is tested
```

### 28.4 Cloud Scheduler for internal routes

If using internal routes before Cloud Run Jobs, Cloud Scheduler should call:

```txt
POST https://<quipsly-origin>/api/internal/patreon/reconcile
Authorization: Bearer <QUIPSLY_JOB_SECRET>
```

Schedule:

```txt
*/5 * * * *
```

Full sync:

```txt
POST https://<quipsly-origin>/api/internal/patreon/full-sync
Authorization: Bearer <QUIPSLY_JOB_SECRET>
```

Schedule:

```txt
0 8 * * *
```

Do not make these routes publicly callable without the bearer secret.

### 28.5 Future Cloud Run Jobs

Later, replace internal routes with jobs:

```txt
quipsly-patreon-reconcile-events
quipsly-patreon-full-sync
```

Use commands:

```bash
gcloud run jobs execute quipsly-patreon-reconcile-events --region=us-central1
gcloud run jobs execute quipsly-patreon-full-sync --region=us-central1
```

---

## 29. Patreon provider setup checklist

Operator task, not Codex task.

### 29.1 Patreon app settings

Set redirect URI:

```txt
https://<quipsly-origin>/api/patreon/link/callback
```

Set webhook URI:

```txt
https://<quipsly-origin>/api/webhooks/patreon
```

Subscribe to:

```txt
members:create
members:update
members:delete
members:pledge:create
members:pledge:update
members:pledge:delete
```

Required creator scopes for server-side campaign reconciliation:

```txt
campaigns
campaigns.members
campaigns.members[email], optional but useful for support display
w:campaigns.webhook, if managing webhooks by API
```

Required user OAuth scopes for account linking:

```txt
identity
identity[email]
identity.memberships
```

Do not request:

```txt
campaigns.members.address
```

Quipsly does not need patron addresses.

### 29.2 Secret Manager names

Recommended secret names:

```txt
quipsly-patreon-client-id
quipsly-patreon-client-secret
quipsly-patreon-webhook-secret
quipsly-patreon-campaign-id
quipsly-patreon-creator-access-token
quipsly-patreon-creator-refresh-token
quipsly-patreon-beta-tier-ids
quipsly-job-secret
```

Service account:

```txt
quipsly-cloud-run@<project>.iam.gserviceaccount.com
```

Grant only needed access:

```txt
Secret Manager Secret Accessor for Quipsly secrets
Cloud SQL Client for database if Cloud SQL is used
```

Do not reuse `web-cloud-run` or `studio` service accounts unless an operator explicitly chooses that temporary shortcut.

---

## 30. Local seed and manual test data

Add a local seed helper only if useful:

```txt
scripts/seed-quipsly-patreon-tier-mapping.mjs
```

It should read:

```txt
QUIPSLY_PATREON_CAMPAIGN_ID
QUIPSLY_PATREON_BETA_TIER_IDS
```

and upsert `PatreonTierMapping` rows.

Example:

```js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const campaignId = process.env.QUIPSLY_PATREON_CAMPAIGN_ID;
const tierIds = (process.env.QUIPSLY_PATREON_BETA_TIER_IDS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

if (!campaignId) throw new Error("QUIPSLY_PATREON_CAMPAIGN_ID is required.");

for (const providerTierId of tierIds) {
  await prisma.patreonTierMapping.upsert({
    where: {
      campaignId_providerTierId_grantsProduct: {
        campaignId,
        providerTierId,
        grantsProduct: "QUIPSLY_BETA",
      },
    },
    create: {
      campaignId,
      providerTierId,
      grantsProduct: "QUIPSLY_BETA",
      isEnabled: true,
    },
    update: {
      isEnabled: true,
    },
  });
}

await prisma.$disconnect();
```

Add root script:

```json
"quipsly:patreon:seed-tiers": "node scripts/seed-quipsly-patreon-tier-mapping.mjs"
```

---

## 31. Security risks and mitigations

### 31.1 Forged webhook

Risk:

```txt
Attacker posts fake active patron payload.
```

Mitigation:

```txt
- Verify X-Patreon-Signature over raw body before JSON parsing.
- Use nodejs runtime and HMAC-MD5 exactly as Patreon documents.
- Constant-time compare hex digest bytes.
- Reject unsigned/bad signatures.
- Never grant access in webhook route anyway.
```

### 31.2 Replay/duplicate webhook

Risk:

```txt
Same valid delivery is sent repeatedly.
```

Mitigation:

```txt
- ProviderEvent.eventKey unique.
- Reconciler idempotent.
- App access derived from canonical provider fetch and upserted entitlements.
```

### 31.3 Out-of-order events

Risk:

```txt
Older active event arrives after newer cancellation/decline.
```

Mitigation:

```txt
- Do not apply webhook deltas directly.
- Fetch canonical member state during reconciliation.
- Run full sync.
```

### 31.4 Email takeover or email mismatch

Risk:

```txt
Email in Patreon payload matches or conflicts with a Quipsly user incorrectly.
```

Mitigation:

```txt
- Do not use email as identity key.
- Link by Patreon user id through OAuth.
- Manual review for ambiguous cases.
```

### 31.5 Token/secret leakage

Risk:

```txt
Creator token or webhook secret leaks via logs, browser bundle, or repo.
```

Mitigation:

```txt
- Store secrets in Secret Manager/env only.
- Use server-only modules.
- Do not log raw headers or tokens.
- Hash signature before storing.
- Do not expose provider payloads to client.
```

### 31.6 Over-scoped Patreon permissions

Risk:

```txt
App requests patron addresses or unnecessary data.
```

Mitigation:

```txt
- Do not request address scope.
- Request email only if needed.
- Use explicit fields/includes.
```

### 31.7 Expiring all users during Patreon outage

Risk:

```txt
Full sync fails and app treats missing data as cancellation.
```

Mitigation:

```txt
- Full sync must distinguish provider API outage from confirmed absence.
- Mark sync ERROR instead of expiring users on partial/failed sync.
- Expire only after successful full sync plus stale grace window.
```

### 31.8 Internal job route abuse

Risk:

```txt
Public caller triggers expensive reconciliation repeatedly.
```

Mitigation:

```txt
- Require QUIPSLY_JOB_SECRET bearer token.
- Keep batch size small.
- Rate-limit later if needed.
- Prefer Cloud Run Jobs later.
```

### 31.9 Role confusion

Risk:

```txt
Patreon supporter is granted staff-like role.
```

Mitigation:

```txt
- Do not use AppRole for beta access.
- Entitlement grants product access only.
- Staff roles remain OWNER/TEAM_SCHEDULER/COACH.
```

---

## 32. Anti-patterns to remove or quarantine

### 32.1 Legacy `apps/web` Patreon webhook

The legacy route at:

```txt
apps/web/src/app/api/webhooks/patreon/route.ts
```

should not be used for Quipsly. After Quipsly route is deployed and Patreon dashboard is moved, add a comment or docs warning. Do not delete immediately unless the operator confirms no live provider uses it.

### 32.2 Inline WorldHub Patreon processor

`apps/web/src/lib/server/patreon.ts` currently mutates roles and orders from a webhook event. Do not copy this. If touching it, only add a warning comment or create a separate follow-up issue. Avoid broad changes in this branch.

### 32.3 `NETWORK_PASS` for Quipsly beta

Do not use `AppRole.NETWORK_PASS` as the Quipsly beta gate. It is a role, not a product entitlement. The Quipsly app should use `Entitlement(productKey="QUIPSLY_BETA")`.

### 32.4 Runtime Patreon API checks

Do not block page rendering on Patreon API calls. The app should read local access state.

---

## 33. Observability

Add structured logs with these prefixes:

```txt
[quipsly:patreon:webhook]
[quipsly:patreon:reconcile]
[quipsly:patreon:full-sync]
[quipsly:patreon:oauth]
[quipsly:beta-access]
```

Log:

```txt
- event id
- event type
- provider member id, if present
- status transitions
- attempt count
- high-level error reason
```

Do not log:

```txt
- raw body
- full provider payload
- access token
- refresh token
- webhook secret
- full signature
- user OAuth code
```

Metrics to add later:

```txt
quipsly_patreon_webhook_received_count
quipsly_patreon_webhook_bad_signature_count
quipsly_patreon_provider_event_pending_count
quipsly_patreon_reconcile_processed_count
quipsly_patreon_reconcile_failed_count
quipsly_patreon_api_429_count
quipsly_patreon_api_auth_error_count
quipsly_beta_entitlement_active_count
quipsly_beta_entitlement_expired_count
quipsly_manual_review_open_count
```

MVP can rely on logs and DB counts.

---

## 34. Runbook to add

Create:

```txt
docs/runbooks/quipsly-patreon-beta-access.md
```

Include:

```txt
- Purpose
- Architecture summary
- Env vars
- Patreon dashboard setup
- OAuth callback URL
- Webhook URL
- Subscribed events
- Local webhook signature smoke test
- How to run reconciler manually
- How to run full sync manually
- How to inspect ProviderEvent inbox
- How to inspect ProviderMembership
- How to resolve manual review in Prisma Studio
- How to seed tier mapping
- How to disable webhook intake quickly
- How to disable reconciliation quickly
- Rollback plan
```

Emergency toggles:

```txt
QUIPSLY_PATREON_WEBHOOK_ENABLED=0
QUIPSLY_PATREON_RECONCILE_ENABLED=0
```

Rollback plan:

```txt
- Disable reconciliation first.
- Keep webhook intake if safe so events are not lost.
- If webhook route is failing, disable Patreon webhook in Patreon dashboard or route it back after operator review.
- Route Cloud Run traffic back to previous revision if needed.
- Do not delete ProviderEvent rows.
```

---

## 35. Documentation updates

Update these after implementation:

```txt
docs/project-context/current-state.md
  Add concise note that Quipsly now has Patreon beta access inbox/reconciliation/access states.

docs/agents/quipsly-quiplore-codex-brief.md
  Add a short "Patreon beta access" note under Intended File Ownership or Data Rules.

docs/architecture/platform-service-boundaries.md
  Add a note that Quipsly owns local beta entitlements for MVP and can later consolidate with WorldHub.

docs/runbooks/quipsly-patreon-beta-access.md
  New operator runbook.
```

Do not bury durable architecture decisions only in commit messages.

---

## 36. Validation commands

Run as applicable:

```bash
pnpm quipsly:patreon:test
pnpm db:generate
pnpm --filter quipsly typecheck
pnpm --filter quipsly build
git diff --check
```

If deployment scaffolding is added:

```bash
node --test scripts/quipsly-cloud-run-readiness.test.mjs
```

If root scripts are modified:

```bash
pnpm install --lockfile-only
```

Only update lockfile when dependencies or scripts require it. Avoid dependency additions for this task; Node crypto and fetch are built in.

---

## 37. Acceptance criteria

This implementation is done when all of the following are true:

### Data model

```txt
- Prisma schema has provider event, provider account, provider membership,
  subscription, entitlement, decision, manual review, manual override, and OAuth state models.
- Prisma generate passes.
- Migration or db push path is documented.
```

### Webhook

```txt
- apps/quipsly has /api/webhooks/patreon route.
- Route reads raw body.
- Route verifies X-Patreon-Signature before JSON parsing.
- Route stores ProviderEvent row.
- Route returns 200 for durable insert and duplicate.
- Route returns 401 for bad signature.
- Route does not grant access or call Patreon.
```

### OAuth link

```txt
- Signed-in user can start Patreon link.
- Callback validates state.
- ProviderAccount is stored by Patreon user id.
- Conflicts become ManualReviewCase.
- User tokens are not stored for MVP.
```

### Reconciliation

```txt
- Reconciler claims ProviderEvent rows idempotently.
- Reconciler fetches canonical member by Patreon member UUID.
- Reconciler upserts provider mirror records.
- Reconciler evaluates pure beta policy.
- Reconciler writes Subscription, Entitlement, EntitlementDecision.
- Reconciler handles 429/5xx/401/403 distinctly.
- Reconciler creates manual review cases for ambiguous data.
```

### UI/access

```txt
- Staff roles still access Quipsly.
- Non-staff users need ACTIVE QUIPSLY_BETA entitlement.
- Signed-in non-staff users see NOT_LINKED, PENDING, EXPIRED, or MANUAL_REVIEW_NEEDED clearly.
- UI never shows raw billing danger words or raw provider IDs to normal users.
```

### Full sync

```txt
- Full sync can list campaign members and reconcile them.
- Failed full sync does not expire everyone.
- Stale memberships are marked before expiration.
```

### Tests

```txt
- Signature tests pass.
- Event normalizer tests pass.
- Member normalizer tests pass.
- Policy matrix tests pass.
- Typecheck/build pass.
```

### Docs

```txt
- Runbook exists.
- Current-state doc updated.
- Env example updated.
```

---

## 38. Open questions for Chuck/operator

These should be answered before live launch, but they do not block local implementation of safe scaffolding.

```txt
1. What Patreon campaign id should Quipsly use?
2. Which Patreon tier ids grant QUIPSLY_BETA?
3. Should gifted memberships grant beta access?
4. Should free trials grant beta access?
5. Should declined patrons receive any grace period?
6. What is the production Quipsly origin for OAuth callback and webhook URL?
7. Should the existing apps/web Patreon webhook be disabled after Quipsly launches?
8. Should beta capacity limits create a WAITLISTED state, or is Patreon support enough?
9. Who resolves manual review cases?
10. What support email/URL should the UI show?
11. How long should raw provider payload JSON be retained?
12. Should Quipsly eventually consolidate entitlements into WorldHub once the beta gate is stable?
```

---

## 39. Implementation notes for Codex style

Keep changes narrow and boring. This is an access system, not a fireworks machine.

Preferred coding style in this repo:

```txt
- Small server-only helpers.
- Pure policy functions with tests.
- Next route handlers with explicit runtime/dynamic config.
- Prisma transactions for multi-row state transitions.
- Idempotent upserts for provider-driven workflows.
- Docs updated when product/infrastructure truth changes.
```

Avoid:

```txt
- Broad refactors.
- New dependencies.
- Cross-importing apps/web code into apps/quipsly.
- Provider calls in user-facing render path.
- Auth changes unrelated to beta access.
- Secret values in tests, logs, docs, or fixtures.
```

The architecture should feel like a well-run little border office: papers checked, records stamped, decisions logged, humans summoned when the papers look odd. No throne for the webhook goblin. 🪪

---

## 40. Condensed build order

Use this as the actual task list:

```txt
1. Create branch.
2. Read required docs/files.
3. Add Prisma models/enums and User relations.
4. Run pnpm db:generate.
5. Add Patreon config/signature/event/member/policy helpers.
6. Add helper tests and root quipsly:patreon:test script.
7. Add ProviderEvent inbox helper.
8. Add apps/quipsly webhook route.
9. Add OAuth start/callback routes.
10. Add beta access state reader.
11. Update Quipsly access gate and shell UI.
12. Add /settings/beta-access.
13. Add Patreon API client.
14. Add reconciler and protected internal reconcile route.
15. Add full sync helper and protected route.
16. Add tier seed helper if useful.
17. Add runbook.
18. Update .env.example.
19. Fix apps/quipsly Dockerfile.
20. Add cloudbuild.quipsly.yaml and deploy/preflight scripts, if deployment is in scope.
21. Run validation.
22. Commit with clear message.
```

Suggested commit message:

```txt
feat(quipsly): add Patreon beta access reconciliation plan
```

If implementing fully rather than docs-only:

```txt
feat(quipsly): add Patreon beta access inbox and entitlements
```

---

## 41. Final reminder

Runtime access must be boring:

```ts
const beta = await getQuipslyBetaAccessState(session.user.id);
if (isStaff || beta.canAccess) renderWorkbench();
else renderAccessState(beta.uiState);
```

Everything else, Patreon webhooks, OAuth linking, payment weirdness, tier changes, retries, out-of-order events, hidden identity, and operator review, should happen around that calm little check.

That is the moat. 🏰
