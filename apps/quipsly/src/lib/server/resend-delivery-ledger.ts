import "server-only";

import type {
  CallRoomInvitationDeliveryStatus,
  Prisma,
  PrismaClient,
  TransactionalEmailStatus,
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

const TRANSACTIONAL_STATUS_RANK: Record<TransactionalEmailStatus, number> = {
  PLANNED: 0,
  SENDING: 1,
  SENT: 2,
  DELIVERY_DELAYED: 3,
  DELIVERED: 4,
  FAILED: 5,
  CANCELED: 6,
  BOUNCED: 7,
  COMPLAINED: 8,
  SUPPRESSED: 9,
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

function shouldApplyTransactionalStatus(input: {
  currentStatus: TransactionalEmailStatus;
  currentAt: Date | null;
  nextStatus: TransactionalEmailStatus;
  nextAt: Date;
}) {
  if (!input.currentAt) return true;
  if (input.nextAt.getTime() > input.currentAt.getTime()) return true;
  if (input.nextAt.getTime() < input.currentAt.getTime()) return false;
  return TRANSACTIONAL_STATUS_RANK[input.nextStatus] >= TRANSACTIONAL_STATUS_RANK[input.currentStatus];
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
      select: { id: true, deliveryReceiptId: true, transactionalEmailId: true },
    });

    const delivery = await tx.callRoomInvitationDeliveryReceipt.findFirst({
      where: { provider: "resend", providerMessageId: event.providerMessageId },
      select: { id: true, status: true, providerStatusAt: true, recipientEmail: true },
    });
    const transactionalEmail = delivery
      ? null
      : await tx.transactionalEmail.findFirst({
          where: { provider: "resend", providerMessageId: event.providerMessageId },
          select: { id: true, status: true, providerStatusAt: true, recipientEmail: true },
        });
    const savedEvent = replay
      ? await tx.emailProviderEvent.update({
          where: { id: replay.id },
          data: {
            deliveryReceiptId: replay.deliveryReceiptId || delivery?.id || null,
            transactionalEmailId:
              replay.transactionalEmailId || transactionalEmail?.id || null,
          },
          select: { id: true },
        })
      : await tx.emailProviderEvent.create({
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
            transactionalEmailId: transactionalEmail?.id ?? null,
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

    if (transactionalEmail) {
      const nextStatus = deliveryStatusForResendEvent(
        event.eventType,
      ) as TransactionalEmailStatus;
      if (shouldApplyTransactionalStatus({
        currentStatus: transactionalEmail.status,
        currentAt: transactionalEmail.providerStatusAt,
        nextStatus,
        nextAt: event.occurredAt,
      })) {
        await tx.transactionalEmail.update({
          where: { id: transactionalEmail.id },
          data: {
            status: nextStatus,
            providerStatusAt: event.occurredAt,
            completedAt: event.occurredAt,
            ...failureFields(event),
          },
        });
      }
    }

    const recipientStatus = recipientStatusForResendEvent(event.eventType);
    const recipientEmail =
      event.recipientEmail ||
      delivery?.recipientEmail ||
      transactionalEmail?.recipientEmail ||
      null;
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

    return {
      duplicate: Boolean(replay),
      eventId: savedEvent.id,
      matched: Boolean(delivery || transactionalEmail),
    };
  });
}
