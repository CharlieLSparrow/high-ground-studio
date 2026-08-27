import "server-only";

import type {
  CallRoomInvitationDeliveryStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import {
  deliveryStatusForResendEvent,
  recipientStatusForResendEvent,
  type VerifiedResendDeliveryEvent,
} from "@/lib/server/resend-webhook";

const STATUS_RANK: Record<CallRoomInvitationDeliveryStatus, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERY_DELAYED: 2,
  DELIVERED: 3,
  FAILED: 4,
  BOUNCED: 5,
  COMPLAINED: 6,
  SUPPRESSED: 7,
};

function shouldApplyStatus(input: {
  currentStatus: CallRoomInvitationDeliveryStatus;
  currentAt: Date | null;
  nextStatus: CallRoomInvitationDeliveryStatus;
  nextAt: Date;
}) {
  if (!input.currentAt) return true;
  if (input.nextAt.getTime() > input.currentAt.getTime()) return true;
  if (input.nextAt.getTime() < input.currentAt.getTime()) return false;
  return STATUS_RANK[input.nextStatus] >= STATUS_RANK[input.currentStatus];
}

function failureFields(event: VerifiedResendDeliveryEvent) {
  const nextStatus = deliveryStatusForResendEvent(event.eventType);
  if (!["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED", "DELIVERY_DELAYED"].includes(nextStatus)) {
    return { errorCode: null, errorMessage: null };
  }
  return {
    errorCode: event.eventType.toUpperCase().replaceAll(".", "_").slice(0, 120),
    errorMessage: event.diagnostic.message || event.diagnostic.bounceSubType || null,
  };
}

export async function recordResendDeliveryEvent(input: {
  prisma: PrismaClient;
  event: VerifiedResendDeliveryEvent;
}) {
  const { event } = input;
  return input.prisma.$transaction(async (tx) => {
    const lockKeys = [
      `quipsly:resend:event:${event.providerEventId}`,
      `quipsly:resend:message:${event.providerMessageId}`,
      ...(event.recipientEmail ? [`quipsly:resend:recipient:${event.recipientEmail}`] : []),
    ].sort();
    for (const key of lockKeys) await acquirePrismaAdvisoryTransactionLock(tx, key);

    const replay = await tx.emailProviderEvent.findUnique({
      where: { provider_providerEventId: { provider: "resend", providerEventId: event.providerEventId } },
      select: { id: true, deliveryReceiptId: true },
    });
    if (replay) return { duplicate: true, eventId: replay.id, matched: Boolean(replay.deliveryReceiptId) };

    const delivery = await tx.callRoomInvitationDeliveryReceipt.findFirst({
      where: { provider: "resend", providerMessageId: event.providerMessageId },
      select: { id: true, status: true, providerStatusAt: true, recipientEmail: true },
    });
    const savedEvent = await tx.emailProviderEvent.create({
      data: {
        provider: "resend",
        providerEventId: event.providerEventId,
        providerMessageId: event.providerMessageId,
        eventType: event.eventType,
        recipientEmail: event.recipientEmail,
        occurredAt: event.occurredAt,
        payloadSha256: event.payloadSha256,
        diagnosticJson: event.diagnostic as Prisma.InputJsonValue,
        deliveryReceiptId: delivery?.id ?? null,
      },
      select: { id: true },
    });

    if (delivery) {
      const nextStatus = deliveryStatusForResendEvent(event.eventType);
      if (shouldApplyStatus({
        currentStatus: delivery.status,
        currentAt: delivery.providerStatusAt,
        nextStatus,
        nextAt: event.occurredAt,
      })) {
        await tx.callRoomInvitationDeliveryReceipt.update({
          where: { id: delivery.id },
          data: {
            status: nextStatus,
            providerStatusAt: event.occurredAt,
            ...failureFields(event),
          },
        });
      }
    }

    const recipientStatus = recipientStatusForResendEvent(event.eventType);
    const recipientEmail = event.recipientEmail || delivery?.recipientEmail || null;
    if (recipientStatus && recipientEmail) {
      const current = await tx.emailRecipientDeliveryState.findUnique({
        where: { recipientEmail },
        select: { lastEventAt: true },
      });
      if (!current || event.occurredAt.getTime() >= current.lastEventAt.getTime()) {
        await tx.emailRecipientDeliveryState.upsert({
          where: { recipientEmail },
          create: {
            recipientEmail,
            status: recipientStatus,
            provider: "resend",
            lastProviderEventId: event.providerEventId,
            lastProviderMessageId: event.providerMessageId,
            reasonCode: event.diagnostic.bounceSubType || event.eventType,
            reasonMessage: event.diagnostic.message || null,
            lastEventAt: event.occurredAt,
          },
          update: {
            status: recipientStatus,
            provider: "resend",
            lastProviderEventId: event.providerEventId,
            lastProviderMessageId: event.providerMessageId,
            reasonCode: event.diagnostic.bounceSubType || event.eventType,
            reasonMessage: event.diagnostic.message || null,
            lastEventAt: event.occurredAt,
          },
        });
      }
    }

    return { duplicate: false, eventId: savedEvent.id, matched: Boolean(delivery) };
  });
}
