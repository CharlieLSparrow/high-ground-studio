import { getPrismaClient } from "@/lib/prisma";
import {
  evaluatePatreonBetaAccess,
  QUIPSLY_BETA_PATREON_PLAN_SLUG,
  type PatreonBetaAccessDecision,
} from "@/lib/patreon/betaAccess";
import { validatePatreonWebhook, PatreonWebhookEventType } from "@/lib/patreon/types";

const prisma = getPrismaClient();

/**
 * Sweeps the WorldHubProviderEvent inbox for UNPROCESSED Patreon events.
 * Implements DLQ retries and out-of-order delivery protection.
 */
export async function processPatreonInboxEvents() {
  const unprocessedEvents = await prisma.worldHubProviderEvent.findMany({
    where: {
      connection: { providerKey: "patreon_main" },
      processingStatus: "UNPROCESSED",
    },
    take: 50,
    orderBy: { receivedAt: "asc" }
  });

  if (unprocessedEvents.length === 0) return 0;

  let successCount = 0;

  for (const event of unprocessedEvents) {
    try {
      // 1. Validate payload structure using Zod
      // We parse the JsonValue back to unknown for Zod
      const payload = validatePatreonWebhook(event.payloadSummaryJson as unknown);

      const email = payload.data.attributes.email;
      const patronStatus = payload.data.attributes.patron_status;
      const lastChargeStatus = payload.data.attributes.last_charge_status;
      const currentlyEntitledAmountCents = payload.data.attributes.currently_entitled_amount_cents;
      const willPayAmountCents = payload.data.attributes.will_pay_amount_cents;
      const eventType = event.eventType as PatreonWebhookEventType;

      // Extract Patreon Tiers (Array of IDs)
      const entitledTiers = payload.data.relationships?.currently_entitled_tiers?.data || [];
      const tierIds = entitledTiers.map(t => t.id);

      if (!email) {
        await prisma.worldHubProviderEvent.update({
          where: { id: event.id },
          data: {
            processingStatus: "NEEDS_REVIEW",
            errorMessage: "No email in Patreon payload",
          },
        });
        continue;
      }

      // 2. Out-of-order Delivery Protection (Anemic Webhook check)
      // Check if we've already processed a NEWER event for this exact email
      const newerProcessedEvent = await prisma.membershipReconciliation.findFirst({
        where: {
          provider: "patreon",
          providerEmail: email,
          event: {
            // If the existing processed event arrived AFTER this one, we skip this stale one
            receivedAt: { gt: event.receivedAt }
          }
        }
      });

      if (newerProcessedEvent) {
        console.warn(`[Patreon Worker] Skipping stale out-of-order event ${event.id}`);
        await prisma.worldHubProviderEvent.update({
          where: { id: event.id },
          data: { processingStatus: "SKIPPED_STALE" }
        });
        continue;
      }

      // 3. Find Quipsly User by Email
      const user = await prisma.user.findUnique({
        where: { primaryEmail: email.toLowerCase() }
      });

      const decision = evaluatePatreonBetaAccess({
        patronStatus,
        lastChargeStatus,
        currentlyEntitledAmountCents,
        willPayAmountCents,
        tierIds,
      });

      if (!user) {
        await createReconciliation(event.id, null, email, patronStatus, tierIds, eventType, decision);
      } else {
        const membership = await prisma.membership.findFirst({
          where: {
            userId: user.id,
            plan: {
              slug: QUIPSLY_BETA_PATREON_PLAN_SLUG,
            },
          },
        });

        await createReconciliation(
          event.id,
          membership?.id || null,
          email,
          patronStatus,
          tierIds,
          eventType,
          decision,
        );
      }

      // 4. Mark Event as PROCESSED
      await prisma.worldHubProviderEvent.update({
        where: { id: event.id },
        data: {
          processingStatus: "PROCESSED",
          processedAt: new Date()
        }
      });

      successCount++;
    } catch (err) {
      console.error(`[Patreon Worker] Failed to process event ${event.id}:`, err);

      // Implement DLQ / Retry logic
      const nextRetryCount = event.retryCount + 1;
      const isDeadLetter = nextRetryCount >= 3;

      await prisma.worldHubProviderEvent.update({
        where: { id: event.id },
        data: {
          retryCount: nextRetryCount,
          processingStatus: isDeadLetter ? "FAILED" : "UNPROCESSED", // Leave unprocessed if retrying
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        }
      });
    }
  }

  return successCount;
}

/**
 * Creates the actual MembershipReconciliation proposal.
 */
async function createReconciliation(
  eventId: string,
  membershipId: string | null,
  email: string,
  patronStatus: string | null,
  patreonTierIds: string[],
  eventType: PatreonWebhookEventType,
  decision: PatreonBetaAccessDecision,
) {
  let action = decision.eligible ? "grant" : "review";
  if (
    eventType === PatreonWebhookEventType.MEMBERS_DELETE ||
    patronStatus === "declined_patron" ||
    decision.status === "EXPIRED"
  ) {
    action = "revoke";
  } else if (eventType === PatreonWebhookEventType.MEMBERS_UPDATE && decision.eligible) {
    action = "modify";
  }

  const proposedTier = decision.eligible
    ? "paid-patreon-beta"
    : patreonTierIds.length > 0
      ? "manual-review"
      : "free-or-unverified";

  await prisma.membershipReconciliation.create({
    data: {
      provider: "patreon",
      providerEmail: email,
      proposedTier: proposedTier,
      action: action,
      status: "pending",
      providerStatus: patronStatus,
      eventId: eventId,
      membershipId: membershipId,
      note: `Auto-generated from ${eventType} webhook: ${decision.reasonCode}`,
    }
  });
}
