/** @jest-environment node */

import { recordResendDeliveryEvent } from "./resend-delivery-ledger";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn().mockResolvedValue(undefined),
}));

function harness(input?: { status?: string; providerStatusAt?: Date | null }) {
  const events = new Map<string, any>();
  const recipientStates = new Map<string, any>();
  const delivery = {
    id: "delivery-1",
    status: input?.status || "SENT",
    providerStatusAt: input?.providerStatusAt ?? new Date("2026-08-27T18:00:00.000Z"),
    recipientEmail: "client@example.com",
  };
  const models = {
    emailProviderEvent: {
      findUnique: jest.fn(async ({ where }: any) => events.get(where.provider_providerEventId.providerEventId) || null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `saved-${events.size + 1}`, ...data };
        events.set(data.providerEventId, row);
        return { id: row.id };
      }),
    },
    callRoomInvitationDeliveryReceipt: {
      findFirst: jest.fn(async () => ({ ...delivery })),
      update: jest.fn(async ({ data }: any) => Object.assign(delivery, data)),
    },
    emailRecipientDeliveryState: {
      findUnique: jest.fn(async ({ where }: any) => recipientStates.get(where.recipientEmail) || null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const row = recipientStates.has(where.recipientEmail) ? update : create;
        recipientStates.set(where.recipientEmail, row);
        return row;
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: any) => callback(models)),
  };
  return { prisma, models, delivery, events, recipientStates };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    providerEventId: "provider-event-1",
    providerMessageId: "provider-email-1",
    eventType: "email.bounced" as const,
    recipientEmail: "client@example.com",
    occurredAt: new Date("2026-08-27T18:30:00.000Z"),
    payloadSha256: "a".repeat(64),
    diagnostic: { bounceSubType: "MessageRejected", message: "Mailbox rejected the message" },
    ...overrides,
  };
}

describe("Resend delivery ledger", () => {
  it("updates the send receipt and recipient projection once for a bounced event", async () => {
    const state = harness();
    await expect(recordResendDeliveryEvent({ prisma: state.prisma as never, event: event() })).resolves.toMatchObject({
      duplicate: false,
      matched: true,
    });
    expect(state.delivery).toMatchObject({
      status: "BOUNCED",
      errorCode: "EMAIL_BOUNCED",
      errorMessage: "Mailbox rejected the message",
    });
    expect(state.recipientStates.get("client@example.com")).toMatchObject({
      status: "BOUNCED",
      lastProviderEventId: "provider-event-1",
    });

    await expect(recordResendDeliveryEvent({ prisma: state.prisma as never, event: event() })).resolves.toMatchObject({
      duplicate: true,
      matched: true,
    });
    expect(state.models.emailProviderEvent.create).toHaveBeenCalledTimes(1);
  });

  it("records an older out-of-order event without regressing current delivery truth", async () => {
    const state = harness({
      status: "DELIVERED",
      providerStatusAt: new Date("2026-08-27T18:30:00.000Z"),
    });
    await recordResendDeliveryEvent({
      prisma: state.prisma as never,
      event: event({
        providerEventId: "older-sent-event",
        eventType: "email.sent",
        occurredAt: new Date("2026-08-27T18:20:00.000Z"),
        diagnostic: {},
      }),
    });
    expect(state.models.emailProviderEvent.create).toHaveBeenCalledTimes(1);
    expect(state.models.callRoomInvitationDeliveryReceipt.update).not.toHaveBeenCalled();
    expect(state.delivery.status).toBe("DELIVERED");
  });
});
