# Quipsly Patreon Beta Access Research Report

Source: ChatGPT Deep Research paste supplied by user on 2026-06-05.

Original attachment: `/Users/wall-e/.codex/attachments/d502941f-4890-4080-8f73-5d7a76d2d306/pasted-text.txt`

---

Quipsly Patreon Beta Access Research Report
Executive summary

The safest architecture is: Patreon is an external provider feed, not Quipsly’s authorization database. Quipsly should ingest verified Patreon webhooks into a durable ProviderEvent inbox, acknowledge quickly, and let an asynchronous reconciler convert provider facts into app-owned Membership, Subscription, and Entitlement records. The Quipsly app should check only Quipsly entitlements when granting beta access. Patreon’s API is the verification input, not the runtime gatekeeper. 🛡️

Patreon’s official docs currently point developers to API v2, with API v1 no longer maintained and “deprecated soon”; they also require explicit fields and includes for API v2 responses, so the implementation should request only the member, user, and tier fields it needs. Patreon webhooks use X-Patreon-Event for the trigger and X-Patreon-Signature for a hex HMAC-MD5 digest of the raw request body using the webhook secret. The Next.js webhook route must therefore read the raw body with request.text(), verify before parsing, and run in the Node.js runtime rather than the Edge runtime.

The reconciliation layer should fetch the current Patreon member by member_id when possible, upsert provider mirror records, then evaluate Quipsly’s own access rules. This handles duplicate events, webhook retries, out-of-order delivery, tier changes, pledge declines, changed memberships, and deleted memberships more safely than applying webhook payload deltas directly. Patreon documents that members:update includes payment charging events, that members:pledge:update covers upgrade and downgrade changes, and that members:delete only fires in limited cases where no prior payment occurred; this makes canonical reconciliation and periodic full syncs important.

The UI should show clear states: Not linked, Pending verification, Active beta access, Expired, and Manual review needed. Users should never see confusing raw provider status such as “Fraud” or “Deleted”; those are internal reconciliation facts. Admins should see an audit trail, event inbox, provider member mirror, retry controls, and manual override controls.

For a Next.js + Prisma + Cloud Run MVP, use a DB-backed queue rather than adding a separate queue system immediately. Cloud Run request handlers should stay tiny because long-running request work can hit timeouts and even continue after the client receives a 504; use Cloud Run Jobs scheduled by Cloud Scheduler for event reconciliation and periodic full campaign sync. Store Patreon secrets and tokens in Secret Manager.

Official sources with links

Primary Patreon sources:

Patreon API Reference, especially API v2 OAuth scopes, clients, campaign members, member details, webhooks, triggers, resources, and changelog. Use API v2; Patreon’s docs say v1 is no longer maintained and client creation for v1 has been restricted. The docs also say API v2 requires explicit fields and include parameters.

Patreon OAuth/client docs. These document the creator access token, refresh token, client ID, client secret, HTTPS API calls, and the warning that the client secret must never be exposed because it grants access to campaign and patron data.

Patreon API v2 scopes. Relevant scopes include campaigns, campaigns.members, campaigns.members[email] if email is needed, and w:campaigns.webhook for webhook management. Avoid campaigns.members.address unless Quipsly truly needs mailing addresses, which it should not for beta access.

Patreon campaign members and member endpoint docs. The campaign members endpoint supports currently_entitled_tiers, user, and pledge_history; the member endpoint requires campaigns.members and must use the member UUID, not the user ID.

Patreon member resource docs. Important fields include currently_entitled_amount_cents, patron_status, last_charge_status, last_charge_date, next_charge_date, will_pay_amount_cents, is_free_trial, is_gifted, and relationships to current tiers and user. Patreon also documents active_patron, declined_patron, and former_patron as member status values.

Patreon webhook docs. Patreon documents webhook endpoints, webhook secrets, triggers, X-Patreon-Event, X-Patreon-Signature, and HMAC-MD5 signature verification over the raw body.

Patreon webhook retries. Patreon documents retry delays of 30 seconds, 5 minutes, 15 minutes, 1 hour, 3 hours, 1 day, 1 week, then manual retry; it also notes queued events may be delivered later after successful calls or manual retries.

Supporting implementation sources:

Next.js Route Handlers. Route Handlers use Web Request and Response APIs, support POST, and can read webhook bodies with request.text(); the docs specifically show this pattern for webhooks.

Node.js crypto docs. Use crypto.createHmac() to create HMAC digests and crypto.timingSafeEqual() to compare HMAC digests without leaking timing information.

Prisma transaction/idempotency guidance. Prisma’s docs define idempotency as allowing the same logic to run multiple times with the same resulting database state, and they specifically discuss unique constraints and idempotent APIs for retryable workflows.

Cloud Run docs. Cloud Run request timeouts can produce 504 responses and may leave the container instance still processing after the request ends, so webhook routes should not perform long reconciliation inline. Cloud Run Jobs can run background tasks, and Cloud Scheduler can trigger those jobs on a cron schedule.

Google Secret Manager with Cloud Run. Google recommends Secret Manager for API keys, passwords, and sensitive configuration; Cloud Run services need permission to access the secrets.

Architecture pattern reference: transactional outbox/inbox style. The key idea is to store messages durably in the same database as business state and process them idempotently later; the outbox reference also warns that relays can publish more than once and consumers must handle duplicates. This maps neatly to an inbound ProviderEvent inbox for webhooks.

Recommended architecture

Quipsly should treat Patreon as a provider adapter. Patreon tells Quipsly what happened; Quipsly decides what that means.

The core invariant should be:

User can access Quipsly beta only if Quipsly has an ACTIVE app-owned Entitlement
for product = QUIPSLY_BETA, and that entitlement is not expired or revoked.

Do not let request-time app authorization call Patreon. Do not let raw Patreon webhook payloads directly unlock the app. The authorization path should be boring, fast, local, and auditable.

Recommended flow:

Patreon webhook
  -> Next.js webhook route
  -> verify raw body signature
  -> insert ProviderEvent inbox row
  -> return 2xx quickly

Cloud Run reconciliation job
  -> claim pending ProviderEvent rows
  -> fetch canonical Patreon member, when possible
  -> upsert provider mirror records
  -> evaluate Quipsly entitlement rules
  -> write Subscription / Entitlement / DecisionAudit rows
  -> mark event processed

Nightly full sync
  -> page through Patreon campaign members
  -> reconcile all known provider memberships
  -> repair missed, delayed, deleted, or out-of-order webhook effects

Quipsly app
  -> reads local Entitlement table only
  -> shows pending / active / expired / manual review states

The reason to fetch current Patreon member state during reconciliation is that Patreon webhook triggers are not a complete event-sourcing system. Patreon documents that members:create can fire more than once for a patron if they delete and renew, that members:update includes payment charging events, that members:delete is limited to cases where no prior payment occurred, and that pledge update/delete triggers have important exceptions. Those details make state reconciliation safer than delta application.

The app should subscribe to these Patreon triggers for MVP:

members:create
members:update
members:delete
members:pledge:create
members:pledge:update
members:pledge:delete

members:update is important because it includes payment charging events. members:pledge:update is important because it covers tier upgrades and downgrades. members:pledge:delete helps detect pledge deletion, but Patreon notes it does not trigger for every cancellation case, so it must be backed by member fetches and full sync.

Quipsly should have three durable layers:

First, ProviderEvent inbox. This stores every verified webhook delivery, including duplicates, retry attempts, malformed-but-signed payloads, and unrecognized-but-signed events. This is the blast shield.

Second, provider mirror. This stores Patreon’s current known facts: Patreon user ID, Patreon member ID, campaign ID, current tier IDs, charge status, patron status, entitlement amount, next charge date, and the last raw snapshot or normalized snapshot. This is not the authorization layer; it is the adapter’s mirror of provider state.

Third, app-owned access records. Subscription and Entitlement records say what Quipsly believes the user is allowed to do. These are the only tables the product should consult for beta access.

A useful mental model: Patreon is the weather station, Quipsly is the airport tower. The tower can use the weather station’s feed, but it does not hand over runway control to a webhook cloud. 🌦️

Data model recommendation

Below is an implementation-oriented Prisma-style model. Field names can be adapted to the existing Quipsly schema, but the separation of concerns should stay intact.

enum Provider {
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

enum ProviderLinkStatus {
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

model ProviderEvent {
  id                 String              @id @default(cuid())

  provider           Provider
  eventType          String
  eventKey           String              @unique

  providerWebhookId  String?
  campaignId         String?
  providerMemberId   String?
  providerUserId     String?

  // Store a hash for dedupe/audit. Store raw body only if encrypted and retained briefly.
  rawBodySha256      String
  signatureSha256    String?
  headersRedacted    Json?
  payload            Json?

  status             ProviderEventStatus @default(RECEIVED)
  attempts           Int                 @default(0)
  nextAttemptAt      DateTime?
  lockedUntil        DateTime?
  lockOwner          String?
  lastError          String?

  receivedAt         DateTime            @default(now())
  verifiedAt         DateTime?
  processedAt        DateTime?

  @@index([provider, status, nextAttemptAt])
  @@index([provider, providerMemberId, receivedAt])
  @@index([provider, campaignId, receivedAt])
}

model ProviderAccount {
  id                 String              @id @default(cuid())

  userId             String?
  user               User?               @relation(fields: [userId], references: [id])

  provider           Provider
  providerUserId     String

  email              String?
  displayName        String?
  avatarUrl          String?
  linkStatus         ProviderLinkStatus  @default(UNCLAIMED)

  rawProfile         Json?
  linkedAt           DateTime?
  lastSeenAt         DateTime?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  memberships        ProviderMembership[]

  @@unique([provider, providerUserId])
  @@index([userId])
}

model ProviderMembership {
  id                              String                       @id @default(cuid())

  provider                        Provider
  campaignId                      String
  providerMemberId                String
  providerUserId                  String?

  providerAccountId               String?
  providerAccount                 ProviderAccount?             @relation(fields: [providerAccountId], references: [id])

  userId                          String?
  user                            User?                        @relation(fields: [userId], references: [id])

  patronStatus                    String?
  lastChargeStatus                String?
  lastChargeDate                  DateTime?
  nextChargeDate                  DateTime?
  currentlyEntitledAmountCents    Int?
  willPayAmountCents              Int?
  campaignLifetimeSupportCents    Int?
  pledgeRelationshipStart         DateTime?

  isFreeTrial                     Boolean?
  isGifted                        Boolean?

  syncState                       ProviderMembershipSyncState  @default(CURRENT)
  lastSeenAt                      DateTime?
  lastFetchedAt                   DateTime?
  deletedAt                       DateTime?

  rawSnapshot                     Json?
  createdAt                       DateTime                     @default(now())
  updatedAt                       DateTime                     @updatedAt

  tiers                           ProviderMembershipTier[]
  subscriptions                   Subscription[]
  entitlements                    Entitlement[]

  @@unique([provider, campaignId, providerMemberId])
  @@index([provider, providerUserId])
  @@index([userId])
  @@index([syncState, lastFetchedAt])
}

model ProviderMembershipTier {
  membershipId       String
  membership         ProviderMembership @relation(fields: [membershipId], references: [id])

  providerTierId     String
  title              String?
  amountCents        Int?
  isQualifyingBeta   Boolean            @default(false)

  lastSeenAt         DateTime           @default(now())

  @@id([membershipId, providerTierId])
  @@index([providerTierId])
}

model PatreonTierMapping {
  id                 String   @id @default(cuid())

  campaignId         String
  providerTierId     String
  title              String?
  amountCents        Int?

  grantsProduct      String   @default("QUIPSLY_BETA")
  isEnabled          Boolean  @default(true)
  minAmountCents     Int?

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([campaignId, providerTierId, grantsProduct])
}

model Subscription {
  id                   String             @id @default(cuid())

  userId               String?
  user                 User?              @relation(fields: [userId], references: [id])

  source               EntitlementSource
  providerMembershipId String?
  providerMembership   ProviderMembership? @relation(fields: [providerMembershipId], references: [id])

  status               SubscriptionStatus
  currentPeriodStart   DateTime?
  currentPeriodEnd     DateTime?
  providerStatus       String?
  reasonCode           String?

  lastReconciledAt     DateTime?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  @@index([userId, status])
  @@index([providerMembershipId])
}

model Entitlement {
  id                   String             @id @default(cuid())

  userId               String?
  user                 User?              @relation(fields: [userId], references: [id])

  product              String             // "QUIPSLY_BETA"
  source               EntitlementSource
  sourceRefId          String?            // ProviderMembership.id, ManualOverride.id, etc.

  providerMembershipId String?
  providerMembership   ProviderMembership? @relation(fields: [providerMembershipId], references: [id])

  status               EntitlementStatus
  startsAt             DateTime?
  endsAt               DateTime?
  graceEndsAt          DateTime?

  reasonCode           String?
  reasonMessage        String?
  ruleVersion          String
  lastEvaluatedAt      DateTime?
  manualOverrideId     String?

  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  decisions            EntitlementDecision[]

  @@index([userId, product, status])
  @@index([providerMembershipId])
  @@index([status, endsAt])
}

model EntitlementDecision {
  id                   String   @id @default(cuid())

  entitlementId        String?
  entitlement          Entitlement? @relation(fields: [entitlementId], references: [id])

  providerEventId      String?
  providerMembershipId String?

  oldStatus            String?
  newStatus            String
  ruleVersion          String
  inputHash            String?
  summary              String
  details              Json?

  createdAt            DateTime @default(now())
}

model ManualReviewCase {
  id                   String   @id @default(cuid())

  subjectType          String   // "ProviderMembership", "ProviderAccount", "Entitlement"
  subjectId            String

  status               String   // "OPEN", "RESOLVED", "DENIED", "MERGED"
  reasonCode           String
  summary              String
  details              Json?

  assignedToUserId     String?
  resolvedByUserId     String?
  resolvedAt           DateTime?

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@index([status, createdAt])
  @@index([subjectType, subjectId])
}

model ManualOverride {
  id                   String   @id @default(cuid())

  userId               String
  product              String
  status               EntitlementStatus

  reason               String
  approvedByUserId     String?
  startsAt             DateTime @default(now())
  expiresAt            DateTime?

  createdAt            DateTime @default(now())

  @@index([userId, product, status])
}

For PostgreSQL, add partial unique indexes in raw SQL migrations where Prisma cannot express them cleanly. For example, prevent multiple simultaneously active Patreon beta entitlements for the same user/product:

CREATE UNIQUE INDEX entitlement_one_active_patreon_beta_per_user
ON "Entitlement" ("userId", "product")
WHERE "source" = 'PATREON'
  AND "status" IN ('ACTIVE', 'PENDING', 'MANUAL_REVIEW');

Important modeling notes:

Use Patreon user ID as the provider identity key, not email. Patreon docs say email requires a special scope and may still be null, and Patreon’s 2026 changelog notes that some member/user identity fields may be null when users hide identity. That means email is useful for display and support, but not safe as the identity key.

Use Patreon member ID as the membership key, not Patreon user ID. Patreon’s member endpoint specifically warns to use the member UUID, not the user ID. A single provider user may have historical, renewed, or changed membership records over time.

Keep provider data and app decisions separate. ProviderMembership.patronStatus = "active_patron" is not the same as Entitlement.status = ACTIVE. The entitlement is a Quipsly decision derived from provider facts plus product policy.

Store raw webhook bodies carefully. For MVP, store rawBodySha256, redacted headers, parsed JSON, and normalized fields. If raw bodies are stored, encrypt them and set short retention because Patreon data can include personally identifiable and payment-adjacent status information.

API route / webhook recommendation

The webhook route should be narrow and durable. It is a drawbridge, not the whole castle. 🏰

Recommended path:

POST /api/webhooks/patreon

What the route should do:

Read the raw request body with request.text().

Read X-Patreon-Signature and X-Patreon-Event.

Verify the signature before JSON parsing. Patreon documents the signature as a hex HMAC-MD5 digest of the message body using the webhook secret.

Use constant-time comparison for the digest. Node’s timingSafeEqual() is suitable for comparing HMAC digests, provided the surrounding code does not introduce timing leaks and buffers are equal length.

Validate the trigger against an allowlist.

Compute rawBodySha256.

Parse JSON after verification.

Extract normalized IDs: providerMemberId, providerUserId, campaignId, current tier IDs when present.

Insert a ProviderEvent row with a stable idempotency key.

Return 2xx after durable insert, including for duplicate verified events.

Return 401 or 400 for missing or bad signatures.

For signed but malformed or semantically unexpected payloads, store the event as NEEDS_REVIEW and return 2xx. This avoids Patreon retry storms for a payload that Quipsly has already captured.

What the route should not do:

Do not grant beta access.

Do not revoke beta access.

Do not call Patreon’s API inline.

Do not perform user matching.

Do not send emails or notifications.

Do not perform tier policy evaluation.

Do not log raw request bodies, webhook secrets, access tokens, refresh tokens, or full signatures.

Do not trust email as identity.

Do not reject valid signed events merely because the payload shape is surprising.

Do not run in the Edge runtime unless you have carefully reimplemented Patreon’s HMAC-MD5 verification. For Next.js, use the Node.js runtime because Node’s crypto.createHmac() supports HMAC creation.

Example Next.js route skeleton:

// app/api/webhooks/patreon/route.ts
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ALLOWED_PATREON_EVENTS = new Set([
  "members:create",
  "members:update",
  "members:delete",
  "members:pledge:create",
  "members:pledge:update",
  "members:pledge:delete",
]);

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function verifyPatreonSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
}): boolean {
  const { rawBody, signatureHeader, webhookSecret } = params;

  if (!signatureHeader) return false;

  // Patreon HMAC-MD5 hex digests are 32 hex chars.
  if (!/^[a-f0-9]{32}$/i.test(signatureHeader)) return false;

  const expectedHex = crypto
    .createHmac("md5", webhookSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(signatureHeader.toLowerCase(), "hex");

  if (expected.length !== actual.length) return false;

  return crypto.timingSafeEqual(expected, actual);
}

function extractPatreonIds(payload: any) {
  const data = payload?.data;
  const relationships = data?.relationships ?? {};

  const providerMemberId =
    data?.type === "member" && typeof data?.id === "string" ? data.id : null;

  const campaignId =
    relationships?.campaign?.data?.id ??
    relationships?.campaign?.data?.[0]?.id ??
    null;

  const providerUserId =
    relationships?.user?.data?.id ??
    relationships?.user?.data?.[0]?.id ??
    null;

  return { providerMemberId, campaignId, providerUserId };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.PATREON_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Misconfiguration. Do not leak details to caller.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const eventType = request.headers.get("x-patreon-event");
  const signature = request.headers.get("x-patreon-signature");
  const rawBody = await request.text();

  if (
    !verifyPatreonSignature({
      rawBody,
      signatureHeader: signature,
      webhookSecret,
    })
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const rawBodySha = sha256Hex(rawBody);
  const signatureSha = signature ? sha256Hex(signature) : null;

  let payload: any = null;
  let parseError: string | null = null;

  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    parseError = err instanceof Error ? err.message : "Invalid JSON";
  }

  const allowedEvent = eventType && ALLOWED_PATREON_EVENTS.has(eventType);
  const ids = payload ? extractPatreonIds(payload) : {
    providerMemberId: null,
    campaignId: null,
    providerUserId: null,
  };

  // Patreon docs document event and signature headers, but not a unique webhook
  // delivery id in the reviewed webhook payload. Use a Quipsly-owned idempotency key.
  const eventKey = [
    "PATREON",
    eventType ?? "missing-event-type",
    ids.providerMemberId ?? "missing-member",
    rawBodySha,
  ].join(":");

  try {
    await prisma.providerEvent.create({
      data: {
        provider: "PATREON",
        eventType: eventType ?? "UNKNOWN",
        eventKey,
        campaignId: ids.campaignId,
        providerMemberId: ids.providerMemberId,
        providerUserId: ids.providerUserId,
        rawBodySha256: rawBodySha,
        signatureSha256: signatureSha,
        headersRedacted: {
          "x-patreon-event": eventType,
          "user-agent": request.headers.get("user-agent"),
        },
        payload,
        status:
          parseError || !allowedEvent
            ? "NEEDS_REVIEW"
            : "RECEIVED",
        lastError:
          parseError ??
          (!allowedEvent ? `Unexpected Patreon event type: ${eventType}` : null),
        verifiedAt: new Date(),
      },
    });
  } catch (err: any) {
    // Prisma unique constraint conflict. Verified duplicate: acknowledge.
    if (err?.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }

    // DB unavailable. Let Patreon retry.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

Idempotency key guidance:

The Patreon webhook docs reviewed here document X-Patreon-Event, X-Patreon-Signature, and a member-shaped payload, but they do not show a unique delivery/event ID in the webhook envelope. Therefore, the MVP should create its own dedupe key from provider, event type, provider member ID when available, and rawBodySha256. Do not use only providerMemberId, because the same member can legitimately produce many events. Do not use only the signature, because signature handling and future rotations should not become your only dedupe mechanism.

For production hardening, consider storing duplicate deliveries as lightweight audit rows linked to the original ProviderEvent, but do not enqueue duplicate reconciliation work.

Reconciliation job recommendation

Use a Cloud Run Job or a normal Cloud Run service endpoint invoked by Cloud Scheduler. For MVP, a Cloud Run Job that polls the database is enough. Cloud Run Jobs are designed for task execution, and Cloud Scheduler can trigger them on a cron schedule.

Recommended jobs:

patreon-reconcile-events
  schedule: every 1-5 minutes
  purpose: process ProviderEvent rows with status RECEIVED or FAILED and nextAttemptAt <= now

patreon-full-sync
  schedule: nightly; optionally every 6 hours during beta launch
  purpose: page through campaign members and repair missed/out-of-order/deleted states

patreon-dry-run-sync
  schedule: manual before launch or after rule changes
  purpose: evaluate decisions without changing entitlements

Event reconciliation algorithm:

for each pending ProviderEvent:
  claim row with a short processing lease
  if no providerMemberId:
    mark NEEDS_REVIEW
    create ManualReviewCase
    continue

  fetch current Patreon member by member_id
  if member exists:
    upsert ProviderAccount from member.relationships.user
    upsert ProviderMembership from member.attributes and relationships
    upsert ProviderMembershipTier rows
    evaluate beta access policy
    upsert Subscription
    upsert Entitlement
    write EntitlementDecision
    mark ProviderEvent PROCESSED

  if member not found:
    reconcile from event type and existing mirror
    usually mark membership MISSING_PROVIDER or deletedAt
    set entitlement EXPIRED or MANUAL_REVIEW depending policy
    write EntitlementDecision
    mark ProviderEvent PROCESSED or NEEDS_REVIEW

  on Patreon 429 or 5xx:
    increment attempts
    set nextAttemptAt with exponential backoff + jitter
    mark FAILED

  on Patreon 401 or 403:
    mark FAILED or NEEDS_REVIEW
    alert operator; likely token/scope problem

  on unexpected data:
    mark NEEDS_REVIEW
    create ManualReviewCase

Fetch canonical member state with:

GET /api/oauth2/v2/members/{member_id}
  include=currently_entitled_tiers,user,campaign
  fields[member]=full_name,is_follower,last_charge_date,last_charge_status,patron_status,currently_entitled_amount_cents,will_pay_amount_cents,next_charge_date,pledge_relationship_start,is_free_trial,is_gifted,campaign_lifetime_support_cents
  fields[tier]=title,amount_cents,published,url
  fields[user]=email,full_name,image_url,url

The member endpoint requires campaigns.members and says to use the member UUID rather than user ID. Use campaigns.members[email] only if Quipsly truly needs email for support or display, because email requires a separate scope and may still be null.

Full campaign sync should use:

GET /api/oauth2/v2/campaigns/{campaign_id}/members
  include=currently_entitled_tiers,user,pledge_history
  fields[member]=...
  fields[tier]=...
  fields[user]=...
  page[count]=500 or 1000

Patreon’s docs say the campaign members endpoint requires campaigns.members, supports currently_entitled_tiers, user, and pledge_history, and uses paginated responses with page sizes up to 1000, or 500 when pledge events are requested.

Recommended entitlement policy for Quipsly beta MVP:

ACTIVE when:
  - ProviderMembership is linked to exactly one Quipsly user
  - campaignId matches Quipsly's configured Patreon campaign
  - patronStatus == "active_patron"
  - currentlyEntitledAmountCents > 0, unless explicit policy allows free/gifted
  - at least one currently_entitled_tier maps to QUIPSLY_BETA
  - lastChargeStatus is not Declined, Fraud, Refunded, Deleted, or another disqualifying status
  - no active manual block/revocation exists

PENDING when:
  - Patreon account is linked but membership has not been fetched yet
  - signed webhook was received but reconciliation has not completed
  - membership is found but payment status is Pending/queued
  - user has not linked a Patreon identity yet, but a provider record exists

EXPIRED when:
  - patronStatus is former_patron or declined_patron
  - no currently entitled qualifying tier remains
  - membership was missing from full sync past the configured grace/staleness window
  - pledge was deleted and current provider fetch confirms no entitlement
  - lastChargeStatus/payment status is disqualifying and no grace policy applies

MANUAL_REVIEW when:
  - Patreon user ID cannot be linked to a Quipsly user
  - multiple Quipsly users claim the same Patreon user ID
  - email/name is hidden or null and user matching is ambiguous
  - provider tier is unknown
  - provider response conflicts with local state
  - repeated API failures leave entitlement uncertain
  - raw event is signed but malformed or semantically surprising

Patreon member resources expose both currently_entitled_amount_cents and status/charge fields; pledge event resources include payment statuses such as Paid, Declined, Deleted, Pending, Refunded, and Fraud. Use these as provider facts, but let Quipsly’s rule engine decide the final app entitlement.

Duplicate events and retries:

Patreon retries failed webhook deliveries on a published schedule and may later deliver queued events. Therefore, duplicates are normal, not exceptional. The ProviderEvent table must have a unique eventKey, and the reconciler must be idempotent. Prisma’s own transaction guidance frames idempotency as making repeat executions produce the same database state, which is exactly what this flow needs.

Deleted and changed memberships:

For members:delete, do not assume every cancellation emits this trigger. Patreon says members:delete only occurs if no prior payment happened, while membership deletion after prior payment is represented as a status update. Therefore, members:update, members:pledge:delete, canonical member fetches, and full sync all matter.

For tier changes, process members:pledge:update, but compute current access from the fetched currently_entitled_tiers, not from “old tier -> new tier” deltas. This avoids out-of-order event problems.

For pledge declines, do not immediately hard-code permanent denial. Mark PAST_DUE, PENDING, EXPIRED, or MANUAL_REVIEW depending on Quipsly’s beta policy. For a private beta, the safest default is: declined, fraud, deleted, refunded, and pending payment do not grant new access unless there is a manual override or explicit grace rule.

UI state recommendation

The UI should describe Quipsly’s access decision, not Patreon’s internal billing jargon.

Recommended user-facing states:

NOT_LINKED
Message:
  "Link your Patreon account to request Quipsly beta access."

Access:
  No beta access.

Actions:
  "Link Patreon"
  "I support on Patreon but need help"
PENDING
Message:
  "We found your Patreon connection and are verifying beta access."

Access:
  Usually no full beta access yet. Optional: allow a read-only preview or waitlist screen.

Actions:
  "Refresh status"
  "Contact support"

Internal causes:
  Signed webhook received but not reconciled
  Patreon OAuth linked but member fetch pending
  payment status pending/queued
  campaign member exists but no user match yet
ACTIVE
Message:
  "Your Quipsly beta access is active through Patreon."

Access:
  Full beta access.

Actions:
  "Manage Patreon membership"
  "View access details"

Internal causes:
  Active app-owned Entitlement exists
EXPIRED
Message:
  "Your Patreon beta access is no longer active."

Access:
  No beta access, or read-only account shell if Quipsly wants to preserve user data.

Actions:
  "Manage Patreon membership"
  "Refresh status"
  "Contact support"

Internal causes:
  former/declined patron
  no qualifying tier
  payment no longer qualifies
  membership stale/missing after full sync
MANUAL_REVIEW_NEEDED
Message:
  "We found a Patreon record, but we need to verify it before enabling beta access."

Access:
  No full beta access unless manually granted.

Actions:
  "Contact support"
  "Check Patreon link"

Internal causes:
  ambiguous identity
  hidden/null email with no OAuth link
  multiple accounts claim same Patreon user
  unknown tier
  conflicting provider data
  repeated API failures

The user-facing page should also show:

Last checked: June 5, 2026, 10:14 AM MDT
Source: Patreon
Status: Pending verification / Active / Expired / Manual review
Support reference: QRB-12345

Do not show raw values like Fraud, Deleted, Declined, or full charge metadata to end users. Those belong in admin tools.

Recommended admin UI:

Patreon Integration Dashboard
  - webhook health
  - latest webhook received time
  - bad signature count
  - pending event count
  - oldest pending event age
  - reconciliation failure count
  - manual review queue count

Provider Event Inbox
  - event type
  - receivedAt
  - providerMemberId
  - providerUserId
  - status
  - attempts
  - lastError
  - "requeue" action

Provider Membership View
  - linked Quipsly user
  - Patreon member ID
  - Patreon user ID
  - campaign ID
  - current tier IDs
  - patron status
  - last charge status
  - currently entitled amount
  - last fetched
  - raw snapshot, redacted/collapsed

Entitlement Decision Log
  - old status
  - new status
  - rule version
  - provider event
  - summary
  - manual override link
MVP implementation steps for Next.js + Prisma + Cloud Run

Step 1: Create and configure the Patreon API client.

Use a Patreon API v2 client. Store the creator access token, refresh token, client secret, campaign ID, webhook secret, and qualifying tier IDs as secrets/config, not source code. Patreon warns that the client secret must never be revealed because compromise can expose campaign and patron information.

Minimum Patreon scopes:

campaigns
campaigns.members
w:campaigns.webhook

Optional:

campaigns.members[email]

Avoid:

campaigns.members.address

Quipsly does not need patron addresses to grant beta access.

Step 2: Create the Patreon webhook.

Configure the webhook URI:

https://<quipsly-domain>/api/webhooks/patreon

Subscribe to:

members:create
members:update
members:delete
members:pledge:create
members:pledge:update
members:pledge:delete

Patreon’s webhook API requires w:campaigns.webhook, and webhook records include attributes such as secret, triggers, URI, paused state, failures, and last attempted time.

Step 3: Add Prisma migration.

Add these model groups:

ProviderEvent
ProviderAccount
ProviderMembership
ProviderMembershipTier
PatreonTierMapping
Subscription
Entitlement
EntitlementDecision
ManualReviewCase
ManualOverride

Add unique constraints for:

ProviderEvent.eventKey
ProviderAccount(provider, providerUserId)
ProviderMembership(provider, campaignId, providerMemberId)
PatreonTierMapping(campaignId, providerTierId, grantsProduct)

Add indexes for:

ProviderEvent(provider, status, nextAttemptAt)
ProviderEvent(providerMemberId, receivedAt)
ProviderMembership(userId)
ProviderMembership(syncState, lastFetchedAt)
Entitlement(userId, product, status)
ManualReviewCase(status, createdAt)

Step 4: Implement the webhook route.

Use the route skeleton above. Tests should cover:

valid signature -> ProviderEvent created -> 200
duplicate valid event -> 200 duplicate
missing signature -> 401
bad signature -> 401
valid signature + malformed JSON -> ProviderEvent NEEDS_REVIEW -> 200
valid signature + unknown event type -> ProviderEvent NEEDS_REVIEW -> 200
database insert failure -> 500 so Patreon retries

Step 5: Implement a Patreon API client.

Requirements:

- uses API v2
- includes a descriptive User-Agent
- requests explicit fields/includes
- refreshes tokens if needed
- handles 429 with retry_after_seconds when provided
- handles 401/403 as operator alerts
- exposes fetchMember(memberId)
- exposes listCampaignMembers(cursor)

Patreon documents rate limits by client and access token, and says 429 responses include a retry delay field. The integration should treat rate limit handling as part of the provider adapter, not something scattered through product code.

Step 6: Implement the event reconciler.

Create a command such as:

pnpm patreon:reconcile-events

Batch size:

10-50 events per run for MVP

Processing lease:

5 minutes

Retry policy:

attempt 1: 1 minute
attempt 2: 5 minutes
attempt 3: 15 minutes
attempt 4: 1 hour
attempt 5+: manual review or long backoff

Reconciler pseudocode:

async function reconcileProviderEvent(eventId: string) {
  const event = await claimEvent(eventId);

  if (!event.providerMemberId) {
    await markNeedsReview(event, "MISSING_PROVIDER_MEMBER_ID");
    return;
  }

  const member = await patreon.fetchMember(event.providerMemberId);

  if (!member.found) {
    await reconcileMissingMember(event);
    return;
  }

  const normalized = normalizePatreonMember(member);

  await prisma.$transaction(async (tx) => {
    const account = await upsertProviderAccount(tx, normalized);
    const membership = await upsertProviderMembership(tx, normalized, account);

    await replaceMembershipTiers(tx, membership.id, normalized.tiers);

    const decision = evaluateQuipslyBetaAccess({
      membership: normalized,
      account,
      qualifyingTierIds: config.PATREON_BETA_TIER_IDS,
      ruleVersion: "patreon-beta-v1",
    });

    const subscription = await upsertSubscription(tx, membership, decision);
    const entitlement = await upsertEntitlement(tx, membership, decision);

    await tx.entitlementDecision.create({
      data: {
        entitlementId: entitlement.id,
        providerEventId: event.id,
        providerMembershipId: membership.id,
        oldStatus: decision.oldStatus,
        newStatus: decision.newStatus,
        ruleVersion: decision.ruleVersion,
        inputHash: decision.inputHash,
        summary: decision.summary,
        details: decision.details,
      },
    });

    await tx.providerEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        lastError: null,
      },
    });
  });
}

Step 7: Implement entitlement evaluation as a pure function.

Do not hide business logic in database writes. Make it a testable function:

type BetaDecision =
  | { status: "ACTIVE"; reasonCode: "QUALIFYING_PATREON_TIER" }
  | { status: "PENDING"; reasonCode: "PAYMENT_PENDING" | "UNLINKED_PATREON_ACCOUNT" }
  | { status: "EXPIRED"; reasonCode: "NO_QUALIFYING_TIER" | "DECLINED" | "FORMER_PATRON" }
  | { status: "MANUAL_REVIEW"; reasonCode: "AMBIGUOUS_IDENTITY" | "UNKNOWN_TIER" | "CONFLICT" };

function evaluateQuipslyBetaAccess(input: {
  membership: NormalizedPatreonMember;
  linkedUserId: string | null;
  qualifyingTierIds: Set<string>;
  allowGifted: boolean;
  allowFreeTrial: boolean;
  ruleVersion: string;
}): BetaDecision {
  if (!input.linkedUserId) {
    return { status: "PENDING", reasonCode: "UNLINKED_PATREON_ACCOUNT" };
  }

  if (input.membership.patronStatus === "declined_patron") {
    return { status: "EXPIRED", reasonCode: "DECLINED" };
  }

  if (input.membership.patronStatus === "former_patron") {
    return { status: "EXPIRED", reasonCode: "FORMER_PATRON" };
  }

  const disqualifyingChargeStatuses = new Set([
    "Declined",
    "Deleted",
    "Fraud",
    "Refunded",
  ]);

  if (
    input.membership.lastChargeStatus &&
    disqualifyingChargeStatuses.has(input.membership.lastChargeStatus)
  ) {
    return { status: "EXPIRED", reasonCode: "DECLINED" };
  }

  if (
    input.membership.currentlyEntitledAmountCents <= 0 &&
    !(input.allowGifted && input.membership.isGifted) &&
    !(input.allowFreeTrial && input.membership.isFreeTrial)
  ) {
    return { status: "EXPIRED", reasonCode: "NO_CURRENT_ENTITLEMENT" };
  }

  const hasQualifyingTier = input.membership.tierIds.some((tierId) =>
    input.qualifyingTierIds.has(tierId)
  );

  if (!hasQualifyingTier) {
    return { status: "EXPIRED", reasonCode: "NO_QUALIFYING_TIER" };
  }

  if (input.membership.patronStatus === "active_patron") {
    return { status: "ACTIVE", reasonCode: "QUALIFYING_PATREON_TIER" };
  }

  return { status: "MANUAL_REVIEW", reasonCode: "UNKNOWN_PROVIDER_STATUS" };
}

Step 8: Implement full sync.

Create a command:

pnpm patreon:full-sync

The full sync should:

- list campaign members with pagination
- upsert ProviderMembership records for every returned member
- update lastSeenAt for all returned members
- reconcile each returned member
- identify local provider memberships not seen in the latest full sync
- mark missing memberships STALE first, not instantly expired
- expire after a configured staleness window, unless manual review is needed

Suggested staleness policy for MVP:

Webhook event says expired/declined and canonical fetch confirms:
  expire immediately.

Full sync misses a previously active member:
  mark STALE.
  if still missing after 24 hours:
    expire or manual review, depending launch risk tolerance.

Patreon API outage:
  do not expire everyone.
  mark sync ERROR and alert.

Step 9: Add UI.

User-facing:

/settings/beta-access

Admin-facing:

/admin/patreon/events
/admin/patreon/memberships
/admin/entitlements
/admin/manual-review

Step 10: Deploy to Cloud Run.

Use Secret Manager for:

PATREON_WEBHOOK_SECRET
PATREON_CLIENT_ID
PATREON_CLIENT_SECRET
PATREON_CREATOR_ACCESS_TOKEN
PATREON_CREATOR_REFRESH_TOKEN
PATREON_CAMPAIGN_ID
PATREON_BETA_TIER_IDS

Google recommends Secret Manager for sensitive values, and Cloud Run services need secret access permissions.

Deploy the web service:

Cloud Run service:
  handles Next.js app and webhook route
  min instances: optional for launch reliability
  concurrency: default is usually fine, but monitor DB pool pressure

Cloud Run’s default maximum concurrent requests per instance is 80, and concurrency can be configured. Tune it based on Prisma connection behavior and Cloud SQL connection limits.

Deploy jobs:

Cloud Run Job: patreon-reconcile-events
Cloud Run Job: patreon-full-sync
Cloud Scheduler trigger: every 1-5 minutes for event reconciliation
Cloud Scheduler trigger: nightly for full sync

Step 11: Add observability.

Metrics:

webhook.received.count
webhook.verified.count
webhook.bad_signature.count
webhook.duplicate.count
provider_event.pending.count
provider_event.oldest_pending_age_seconds
reconciler.processed.count
reconciler.failed.count
reconciler.retry.count
patreon.api.429.count
patreon.api.401_403.count
entitlement.active.count
entitlement.expired.count
manual_review.open.count
full_sync.discrepancy.count

Alerts:

Bad signatures spike
No webhook received in expected period during launch
ProviderEvent oldest pending age > 15 minutes
Reconciler failures > threshold
Patreon API auth failure
Full sync fails
Manual review queue > threshold

Step 12: Launch safely.

Recommended launch sequence:

1. Create schema and deploy webhook route.
2. Register Patreon webhook.
3. Send test webhooks and verify ProviderEvent insert.
4. Run full sync in dry-run mode.
5. Review generated entitlement decisions manually.
6. Enable entitlement writes.
7. Enable UI pending states.
8. Enable beta access checks from Entitlement only.
9. Invite first small Patreon cohort.
10. Monitor dashboard and manual review queue.
Risks and anti-patterns

Anti-pattern: granting access inside the webhook route.
This couples external delivery to product authorization and makes retries, duplicates, and partial failures dangerous. The route should verify, store, and acknowledge.

Anti-pattern: using Patreon as the runtime source of truth.
Calling Patreon whenever a user opens Quipsly creates slow, fragile authorization and can break access during Patreon API issues or rate limits. Patreon documents rate limits, so local entitlements are safer.

Anti-pattern: using email as the identity key.
Email can require extra scope, may be null, and identity fields can be hidden. Use Patreon user ID for provider identity and Patreon member ID for membership.

Anti-pattern: assuming webhooks are unique, ordered, or complete.
Patreon retries failed deliveries and queues missed events. It also has nuanced trigger behavior for membership deletion and pledge changes. Use an inbox, idempotency keys, canonical member fetches, and full sync.

Anti-pattern: returning 500 after successfully storing a verified event.
That invites Patreon to retry something Quipsly already captured. Return 2xx once the event is durably stored.

Anti-pattern: returning 400 for signed but semantically unexpected events.
Store as NEEDS_REVIEW and return 2xx. A retry will not fix an event your parser dislikes.

Anti-pattern: logging secrets or raw provider payloads.
Patreon client secrets, webhook secrets, access tokens, refresh tokens, and full payloads should not appear in logs. Store secrets in Secret Manager.

Anti-pattern: asking for unnecessary scopes.
Do not request address scope. Only request email scope if the UI/support workflow truly needs it.

Anti-pattern: treating HMAC-MD5 as a reason to skip verification.
HMAC-MD5 is what Patreon documents for webhook signatures, so implement it exactly. Compensate with HTTPS, secret storage, constant-time comparison, raw-body verification, replay-tolerant idempotency, and monitoring.

Anti-pattern: Edge runtime for the webhook route.
The official signature requires HMAC-MD5 over the raw body. In Next.js, the straightforward implementation uses Node crypto, so declare runtime = "nodejs".

Anti-pattern: expiring all users after a Patreon outage.
If full sync fails or Patreon API returns widespread errors, mark sync state ERROR, alert, and preserve the last known entitlement until policy says otherwise.

Anti-pattern: hiding uncertainty from users.
A private beta gate needs clear liminal states. “Pending verification” and “Manual review needed” are product features, not clutter.

Open questions

Which Patreon tier IDs qualify for Quipsly beta access?

Should beta access require a paid tier, or do gifted memberships and free trials count?

Should pending/queued pledges get temporary access? Safest MVP answer: no, show PENDING until payment is confirmed.

Should declined patrons receive a grace period? Safest private-beta answer: no automatic grace, but allow manual override.

Should canceled but still-current patrons keep access until next_charge_date or the end of their paid period? This is a product policy decision; if yes, encode it explicitly in the rule engine.

Will Quipsly require users to link Patreon via OAuth before beta access, or can an admin manually match provider records? Recommended: OAuth link by Patreon user ID, with manual review as fallback.

What auth system and user ID model does Quipsly use today? The data model above assumes an existing User table.

What database is production using? The recommendation assumes PostgreSQL with Prisma. If using another database, replace PostgreSQL partial indexes and row-locking patterns with equivalent mechanisms.

What is Quipsly’s retention policy for Patreon payloads and charge-adjacent metadata?

Who can approve manual overrides, and should every manual override expire automatically?

Should limited beta capacity override otherwise qualifying Patreon status? If yes, add WAITLISTED or keep PENDING with reason BETA_CAPACITY_LIMIT.

What support copy should users see when their access is expired, pending, or under review?

Should Quipsly send notifications when access becomes active or expires? For MVP, in-app status is enough; email can come later once the reconciliation core is stable.

The north star: Quipsly owns access; Patreon supplies evidence. Build the bridge with verification, inboxing, reconciliation, audits, and patient UI states, and the beta gate becomes a calm little customs office instead of a webhook haunted house. 🕯️