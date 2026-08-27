import "server-only";

import type { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import {
  sanitizeProductEventParameters,
  type QuipslyProductEventName,
  type QuipslyProductEventParameters,
} from "@/lib/product-analytics";

type ProductEventPrisma = Pick<
  Prisma.TransactionClient,
  "userEvent"
>;

/**
 * Persist a privacy-minimized product outcome from the same server operation
 * that made it true. Browser analytics remains useful for acquisition and
 * navigation, but this ledger is Quipsly's durable operational truth.
 *
 * Call this only for successful state transitions. It deliberately accepts no
 * titles, emails, paths, transcript text, room IDs, or other customer content.
 */
export async function recordQuipslyProductOutcome(input: {
  prisma: ProductEventPrisma;
  userId: string;
  organizationId?: string | null;
  eventName: QuipslyProductEventName;
  parameters?: QuipslyProductEventParameters;
}) {
  try {
    return await input.prisma.userEvent.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        eventName: `Product: ${input.eventName}`,
        payloadJson: {
          schema: "quipsly-product-event-v1",
          parameters: sanitizeProductEventParameters(input.parameters),
          source: "server-outcome",
        },
      },
    });
  } catch (error) {
    // Observability must never become a customer-facing availability
    // dependency. Cloud error reporting still captures the failed write.
    console.warn("Quipsly product outcome could not be persisted.", {
      eventName: input.eventName,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

export async function recordQuipslyProductOutcomeForUser(input: Omit<
  Parameters<typeof recordQuipslyProductOutcome>[0],
  "prisma"
>) {
  return recordQuipslyProductOutcome({
    ...input,
    prisma: getPrismaClient(),
  });
}

export async function recordQuipslyProductOutcomeOnce(input: Omit<
  Parameters<typeof recordQuipslyProductOutcome>[0],
  "prisma"
>) {
  const prisma = getPrismaClient();
  try {
    const eventName = `Product: ${input.eventName}`;
    const existing = await prisma.userEvent.findFirst({
      where: { userId: input.userId, eventName },
      select: { id: true },
    });
    if (existing) return existing;
    return recordQuipslyProductOutcome({ ...input, prisma });
  } catch (error) {
    console.warn("Quipsly first product outcome could not be checked.", {
      eventName: input.eventName,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}
