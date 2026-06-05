# Proposal: Provider Event Inbox and Membership Reconciliation

Date: 2026-06-04
Status: PROPOSED
**SCHEMA AUTHORITY REQUIRED**

## 1. Problem
We must support Patreon, Stripe, manual grants, and alpha invites without tightly coupling our core application access logic to third-party billing providers. Billing providers must not be the source of truth for app access, as that leads to rigid schema constraints, brittle webhook dependencies, and un-auditable account suspensions.

## 2. Proposed Schema / Infrastructure Change

Introduce a decoupled "Inbox -> Reconciliation -> Membership" pipeline.

```prisma
model WorldHubProviderEvent {
  id             String   @id @default(cuid())
  provider       String   // "patreon", "stripe", "manual", "alpha"
  eventType      String   // e.g. "members:create", "invoice.paid"
  payloadJson    Json     // The complete, raw webhook payload
  status         String   @default("UNPROCESSED") // UNPROCESSED, PROCESSED, FAILED
  errorNote      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  reconciliations MembershipReconciliation[]
  
  @@index([status, createdAt])
}

model MembershipReconciliation {
  id               String   @id @default(cuid())
  eventId          String
  userId           String?  // Mapped User ID (if matched)
  membershipId     String?  // Target Membership ID (if updating existing)
  providerEmail    String   // Used for mapping and auditing
  providerStatus   String   // "active_patron", "declined", "canceled"
  proposedAction   String   // "grant", "revoke", "update_tier"
  status           String   @default("PENDING") // PENDING, APPROVED, REJECTED
  note             String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  event            WorldHubProviderEvent @relation(fields: [eventId], references: [id], onDelete: Restrict)
  user             User?                 @relation(fields: [userId], references: [id], onDelete: SetNull)
  membership       Membership?           @relation(fields: [membershipId], references: [id], onDelete: SetNull)
  
  @@index([status])
  @@index([providerEmail])
}

model Membership {
  id               String   @id @default(cuid())
  userId           String   @unique
  tier             String   @default("free") // "free", "supporter", "sponsor"
  status           String   @default("active") // "active", "suspended"
  expiresAt        DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  reconciliations  MembershipReconciliation[]
}
```

### The API Flow
1. **Webhook Reception**: `POST /api/webhooks/[provider]`
   - Validates the crypto signature.
   - Immediately saves to `WorldHubProviderEvent` (`UNPROCESSED`).
   - Returns 200 OK.
2. **Reconciliation Worker**:
   - Parses the `payloadJson`.
   - Generates a `MembershipReconciliation` with a `proposedAction` (e.g. "grant").
   - Marks the event `PROCESSED`.
3. **Membership Grant**:
   - For trusted scenarios, auto-approves the reconciliation and updates `Membership`.
   - App gating uses **only** `Membership.tier` and `Membership.status`. The app never queries the webhook event directly.

## 3. Compatibility
- **Patreon**: Supported out of the box via `provider: "patreon"`.
- **Stripe**: Fully compatible. `provider: "stripe"`, mapping `customer.email` to `providerEmail`.
- **Manual/Alpha**: A server action can manually insert a `WorldHubProviderEvent` with `provider: "manual"` and a dummy payload, flowing securely through the exact same audit trail.

## 4. Rollback and Validation Path
**Validation**:
- Before running any real events, we can manually inject sample `payloadJson` payloads into `WorldHubProviderEvent` using Prisma Studio, testing the background worker and the `MembershipReconciliation` generation without exposing endpoints.
**Rollback**:
- Because `Membership` remains our primary app-owned truth, rolling back a bad webhook processor is trivial: we simply delete the erroneous `MembershipReconciliation` rows and manually correct the `Membership` tier. The app never breaks.

## 5. Next Steps
Schema Authority is required to add `WorldHubProviderEvent`, `MembershipReconciliation`, and `Membership` to `prisma/schema.prisma` before routing can begin.
