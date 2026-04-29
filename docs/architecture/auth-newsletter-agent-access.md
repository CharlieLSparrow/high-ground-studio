# Auth, Newsletter, and Agent Access

Date: 2026-04-28

## Purpose

Extend the current Google-only login into a cleaner identity system that supports:

- human sign-in with Google and email magic links
- newsletter signup without account creation
- service-account access for AI agents
- clear separation between human auth, newsletter consent, and machine access

This note is intentionally incremental. It does not propose a full auth rewrite.

## Current Repo Reality

### Google-only auth is configured in one place

- `apps/web/src/auth.ts`

Current behavior:

- NextAuth is configured with only the Google provider.
- session strategy is JWT, not database-backed sessions.
- sign-in is allowed only when Google returns a verified email.
- the app session is enriched from the repo’s own `User` record, not from a NextAuth adapter model.

### Roles are assigned by email bootstrap today

- `apps/web/src/lib/server/user-identity.ts`
- `apps/web/src/lib/authz.ts`
- `.env.example`

Current behavior:

- when a verified Google user signs in, `ensureAppUserFromGoogle()` resolves or creates the app `User`
- staff roles are derived from env email lists:
  - `HGO_OWNER_EMAILS`
  - `HGO_TEAM_SCHEDULER_EMAILS`
  - `HGO_COACH_EMAILS`
- internal access is granted from app roles, not from Google itself

### Current identity data model

- `prisma/schema.prisma`

What already exists:

- `User`
  - canonical app person record
  - keyed by `primaryEmail`
  - already stores:
    - `newsletterOptIn`
    - `announcementsOptIn`
    - `welcomeCompletedAt`
- `UserEmail`
  - alias emails
  - already supports one person having multiple email identities
- `UserRole`
  - app roles
- `ClientProfile`, `Membership*`, `Appointment*`
  - downstream product data linked to `User`

What does not exist yet:

- no auth method table
- no provider account table
- no email magic-link token table
- no newsletter contact / consent ledger
- no double opt-in model
- no service account table
- no scoped token table
- no agent audit log

### Marketing preferences are currently account fields only

- `apps/web/src/app/welcome/actions.ts`
- `apps/web/src/app/dashboard/settings/actions.ts`

Current behavior:

- welcome and dashboard settings write `newsletterOptIn` and `announcementsOptIn` directly onto `User`
- this is adequate for authenticated user preferences
- it is not enough for:
  - email-only newsletter signup
  - double opt-in
  - consent evidence
  - separating account identity from marketing contact identity

## What Can Be Extended Cleanly

These parts should stay:

- `User` remains the canonical human/person record inside the app
- `UserEmail` remains the way to unify multiple email addresses under one person
- `UserRole` remains the authorization model
- JWT session enrichment in `auth.ts` can stay
- env-based role bootstrap can be reused for non-Google human sign-in

## What Needs New Models

### 1. Human auth methods

Add a model that records how a human can authenticate, without replacing `User`:

```prisma
enum HumanAuthMethodType {
  GOOGLE
  EMAIL_MAGIC_LINK
}

model HumanAuthIdentity {
  id          String              @id @default(cuid())
  userId       String
  type         HumanAuthMethodType
  provider     String
  subject      String
  email        String?
  verifiedAt   DateTime?
  lastUsedAt   DateTime?
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  user         User               @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, subject])
  @@index([userId, type])
}
```

Why:

- keeps Google login
- adds explicit support for email magic links
- lets the same human have multiple auth methods
- avoids pretending agents are humans

### 2. Human magic-link tokens

Add a one-time token model for email sign-in:

```prisma
model HumanMagicLinkToken {
  id             String    @id @default(cuid())
  email          String
  tokenHash      String    @unique
  expiresAt      DateTime
  consumedAt     DateTime?
  requestedIp    String?
  requestedUserAgent String?
  createdAt      DateTime  @default(now())

  @@index([email, expiresAt])
}
```

Why:

- supports magic-link login without adopting a full adapter rewrite first
- keeps session creation under app control

### 3. Newsletter contact and consent ledger

Add a contact model that is independent from `User`, with explicit consent records:

```prisma
enum ConsentTopic {
  NEWSLETTER
  ANNOUNCEMENTS
}

enum ConsentStatus {
  PENDING
  CONFIRMED
  REVOKED
}

model EmailContact {
  id          String    @id @default(cuid())
  email       String    @unique
  userId       String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  user         User?     @relation(fields: [userId], references: [id], onDelete: SetNull)
  consents     EmailConsent[]
}

model EmailConsent {
  id                  String        @id @default(cuid())
  contactId           String
  topic               ConsentTopic
  status              ConsentStatus
  source              String
  requestedAt         DateTime      @default(now())
  confirmedAt         DateTime?
  revokedAt           DateTime?
  tokenHash           String?       @unique
  tokenExpiresAt      DateTime?
  requestedIp         String?
  requestedUserAgent  String?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  contact             EmailContact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@index([contactId, topic, status])
}
```

Why:

- newsletter signup can exist without account creation
- explicit consent becomes auditable
- double opt-in becomes first-class
- later user creation can link to the same email contact instead of duplicating

### 4. Service accounts and scoped tokens

Add dedicated machine credentials that are separate from human auth:

```prisma
model ServiceAccount {
  id            String    @id @default(cuid())
  slug          String    @unique
  name          String
  description   String?
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  tokens        ServiceAccountToken[]
  auditEvents   ServiceAccessAudit[]
}

model ServiceAccountToken {
  id                String    @id @default(cuid())
  serviceAccountId  String
  tokenPrefix       String
  tokenHash         String    @unique
  scopes            String[]
  expiresAt         DateTime?
  revokedAt         DateTime?
  lastUsedAt        DateTime?
  createdAt         DateTime  @default(now())

  serviceAccount    ServiceAccount @relation(fields: [serviceAccountId], references: [id], onDelete: Cascade)

  @@index([serviceAccountId])
}

model ServiceAccessAudit {
  id                String    @id @default(cuid())
  serviceAccountId  String
  tokenId           String?
  scope             String
  action            String
  route             String?
  resourceType      String?
  resourceId        String?
  success           Boolean
  metadata          Json?
  createdAt         DateTime  @default(now())

  serviceAccount    ServiceAccount @relation(fields: [serviceAccountId], references: [id], onDelete: Cascade)
}
```

Why:

- agents get machine-only credentials
- no fake human sessions
- every machine action can be audited

## Recommended Human Email Login Flow

Use email magic links first. Do not add passwords in the first implementation.

Recommended flow:

1. User submits email to request sign-in link.
2. App creates `HumanMagicLinkToken` with a hashed token and short expiry.
3. App emails a one-time link.
4. Verification route consumes the token, resolves or creates the app `User`, records `HumanAuthIdentity(type=EMAIL_MAGIC_LINK)`, and creates the normal app session.
5. Role bootstrap runs on the normalized email the same way it already does for Google.

Important guardrails:

- if email matches `User.primaryEmail`, sign into that user
- if email matches `UserEmail.email`, sign into the linked user
- if email matches neither, create a new `User` with no roles
- do not auto-subscribe marketing preferences during sign-in

## Recommended Newsletter Flow

Public email-only newsletter signup should be separate from human account login.

Recommended flow:

1. Visitor enters email and explicitly selects consent topic(s).
2. App creates or updates `EmailContact`.
3. App creates `EmailConsent(status=PENDING)` per topic with a one-time confirmation token.
4. Confirmation email is sent.
5. User clicks confirm link.
6. Consent becomes `CONFIRMED`.

Linking rule:

- if the same email later creates an account, link `EmailContact.userId` to that `User`
- do not create duplicate contact records

Authenticated user rule:

- welcome/settings can continue to expose preferences
- once newsletter models exist, authenticated preference updates should write consent records too
- because the user is already signed in and owns the email, those writes can be treated as verified authenticated consent rather than public-form double opt-in

## Recommended Agent Access Flow

Do not use NextAuth sessions for agents.

Recommended flow:

1. Create `ServiceAccount`.
2. Issue one or more hashed bearer tokens with explicit scopes.
3. Expose a narrow machine-safe route layer for the actions agents are allowed to take.
4. Validate token, scope, expiry, and active status on every request.
5. Write `ServiceAccessAudit` on every action attempt.

Guardrails:

- no Google OAuth
- no email magic link
- no impersonating a human by default
- no silent writes without audit
- no broad “admin” token as the default pattern

## How Existing Google Auth Continues To Work

Google should remain in place with minimal disruption:

- keep Google provider in `apps/web/src/auth.ts`
- keep JWT session strategy
- on successful Google sign-in:
  - keep resolving/creating `User` by email
  - add or update `HumanAuthIdentity(type=GOOGLE)`
  - continue enriching session from the app `User`

This means Google remains fully supported while email magic links are added beside it.

## Migration Strategy

### Phase 1: Human auth extension

Add:

- `HumanAuthIdentity`
- `HumanMagicLinkToken`

Implement:

- email magic-link request + verify flow
- Google sign-in backfill into `HumanAuthIdentity`
- reuse current `User`/`UserEmail`/`UserRole` model

Do not implement yet:

- newsletter contact system
- service accounts

### Phase 2: Newsletter separation

Add:

- `EmailContact`
- `EmailConsent`

Implement:

- public email-only signup
- double opt-in
- link matching contact to existing or later-created users
- authenticated settings/welcome writes mirrored into consent records

Migration note:

- existing `newsletterOptIn` / `announcementsOptIn` on `User` should remain during transition
- treat them as legacy app preference flags until consent records become the new source of truth

### Phase 3: Service-account access

Add:

- `ServiceAccount`
- `ServiceAccountToken`
- `ServiceAccessAudit`

Implement:

- token issuance path
- scope checks
- agent-safe route surface
- audit logging

## Risks and Guardrails

### Risk: accidental auth rewrite

Guardrail:

- keep `User` as the app person model
- keep Google working first
- do not adopt a full adapter/session rewrite unless the incremental path proves insufficient

### Risk: mixing marketing consent with account creation

Guardrail:

- newsletter signup uses `EmailContact` + `EmailConsent`
- account creation does not imply newsletter consent

### Risk: service accounts becoming fake humans

Guardrail:

- no service account in `UserRole`
- no default NextAuth session for agents
- no machine access through Google or magic links

### Risk: duplicated identities by email

Guardrail:

- normalize all emails
- always resolve login by `primaryEmail` or `UserEmail.email`
- link newsletter contacts by normalized email

## Smallest Safe First Slice

The smallest safe first implementation slice is:

1. add `HumanAuthIdentity`
2. add `HumanMagicLinkToken`
3. add email magic-link login for humans
4. keep Google login unchanged
5. keep newsletter and agent work out of that slice

Why this is the best first slice:

- it solves the most immediate auth limitation without rewriting everything
- it preserves the current `User`/role model
- it proves multi-method human identity linking
- it does not entangle marketing consent or machine access yet

If that slice lands cleanly, the next safest slice is the newsletter contact/consent ledger. Service accounts should come after that, because they require a deliberate machine-safe access path and audit model.
