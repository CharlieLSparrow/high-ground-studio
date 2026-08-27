import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type {
  Prisma,
  PrismaClient,
  TransactionalEmailKind,
} from "@prisma/client";

import { authorizeGoogleOidcWorker } from "@/lib/server/google-oidc-worker-auth";
import { normalizeEmail } from "@/lib/server/studio-user-identity";
import {
  sendTransactionalEmail,
  type TransactionalEmailSendResult,
} from "@/lib/server/transactional-email-transport";

const TEMPLATE_VERSION = "2026-08-27.v1";
const SCAN_HORIZON_MS = 8 * 24 * 60 * 60 * 1_000;
const CONFIRMATION_LOOKBACK_MS = 48 * 60 * 60 * 1_000;
const LEASE_MS = 2 * 60 * 1_000;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const BOOKING_SCAN_LIMIT = 500;

type WorkerPrisma = PrismaClient | Prisma.TransactionClient | any;

type PlannedEmail = {
  bookingId: string;
  roomId: string;
  recipientUserId: string;
  recipientEmail: string;
  recipientRole: "COACH" | "CLIENT";
  kind: TransactionalEmailKind;
  scheduleFingerprint: string;
  scheduledFor: Date;
  idempotencyKey: string;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function scheduleFingerprint(input: {
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
}) {
  return hash([
    input.scheduledStart.toISOString(),
    input.scheduledEnd.toISOString(),
    input.timezone,
  ].join("|"));
}

function plannedAt(kind: TransactionalEmailKind, booking: { createdAt: Date; scheduledStart: Date }) {
  if (kind === "SESSION_REMINDER_24H") {
    return new Date(booking.scheduledStart.getTime() - 24 * 60 * 60 * 1_000);
  }
  if (kind === "SESSION_REMINDER_1H") {
    return new Date(booking.scheduledStart.getTime() - 60 * 60 * 1_000);
  }
  return booking.createdAt;
}

function latestSendAt(kind: TransactionalEmailKind, scheduledStart: Date) {
  const beforeStart = kind === "SESSION_REMINDER_24H"
    ? 12 * 60 * 60 * 1_000
    : 10 * 60 * 1_000;
  return new Date(scheduledStart.getTime() - beforeStart);
}

function nextAttemptDate(scheduledFor: Date, now: Date) {
  return scheduledFor.getTime() > now.getTime() ? scheduledFor : now;
}

function retryDate(input: {
  now: Date;
  attemptCount: number;
  result: Extract<TransactionalEmailSendResult, { ok: false }>;
}) {
  if (input.result.retryAfterSeconds !== null) {
    return new Date(input.now.getTime() + Math.max(15, input.result.retryAfterSeconds) * 1_000);
  }
  const minutes = Math.min(60, 2 ** Math.max(0, input.attemptCount - 1) * 5);
  return new Date(input.now.getTime() + minutes * 60 * 1_000);
}

function emailIdempotencyKey(input: Omit<PlannedEmail, "idempotencyKey">) {
  return `txn-email/${hash([
    input.bookingId,
    input.roomId,
    input.recipientUserId,
    input.recipientRole,
    input.kind,
    input.scheduleFingerprint,
    TEMPLATE_VERSION,
  ].join("|"))}`;
}

function buildPlans(booking: any, now: Date): PlannedEmail[] {
  if (!booking.callRoom || booking.status !== "CONFIRMED") return [];
  const fingerprint = scheduleFingerprint({
    scheduledStart: booking.scheduledStart,
    scheduledEnd: booking.scheduledEnd,
    timezone: booking.timezone,
  });
  const recipients = [
    booking.coachUser
      ? { user: booking.coachUser, role: "COACH" as const }
      : null,
    booking.clientUser
      ? { user: booking.clientUser, role: "CLIENT" as const }
      : null,
  ].filter((entry): entry is { user: any; role: "COACH" | "CLIENT" } => Boolean(entry));
  const uniqueRecipients = recipients.filter((entry, index) =>
    recipients.findIndex((candidate) => candidate.user.id === entry.user.id) === index);
  const kinds: TransactionalEmailKind[] = [
    "SESSION_REMINDER_24H",
    "SESSION_REMINDER_1H",
  ];
  if (booking.createdAt.getTime() >= now.getTime() - CONFIRMATION_LOOKBACK_MS) {
    kinds.unshift("BOOKING_CONFIRMED");
  }
  return uniqueRecipients.flatMap(({ user, role }) => {
    const email = normalizeEmail(user.primaryEmail);
    if (!user.isActive || !email) return [];
    return kinds.map((kind) => {
      const scheduledFor = plannedAt(kind, booking);
      const plan = {
        bookingId: booking.id,
        roomId: booking.callRoom.id,
        recipientUserId: user.id,
        recipientEmail: email,
        recipientRole: role,
        kind,
        scheduleFingerprint: fingerprint,
        scheduledFor,
      };
      return { ...plan, idempotencyKey: emailIdempotencyKey(plan) };
    });
  });
}

async function planUpcomingEmail(input: {
  prisma: WorkerPrisma;
  now: Date;
}) {
  const scanned = await input.prisma.coachingBooking.findMany({
    where: {
      status: "CONFIRMED",
      scheduledStart: {
        gt: input.now,
        lte: new Date(input.now.getTime() + SCAN_HORIZON_MS),
      },
    },
    orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
    take: BOOKING_SCAN_LIMIT + 1,
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      timezone: true,
      createdAt: true,
      callRoom: { select: { id: true } },
      clientUser: {
        select: { id: true, primaryEmail: true, isActive: true },
      },
      coachUser: {
        select: { id: true, primaryEmail: true, isActive: true },
      },
    },
  });
  const scanSaturated = scanned.length > BOOKING_SCAN_LIMIT;
  const bookings = scanned.slice(0, BOOKING_SCAN_LIMIT);
  const plans: PlannedEmail[] = bookings.flatMap((booking: any) =>
    buildPlans(booking, input.now));
  const fingerprints = new Map(
    bookings.map((booking: any) => [
      booking.id,
      scheduleFingerprint({
        scheduledStart: booking.scheduledStart,
        scheduledEnd: booking.scheduledEnd,
        timezone: booking.timezone,
      }),
    ]),
  );
  const existing = bookings.length
    ? await input.prisma.transactionalEmail.findMany({
        where: { bookingId: { in: bookings.map((booking: any) => booking.id) } },
        select: {
          id: true,
          idempotencyKey: true,
          bookingId: true,
          status: true,
          errorCode: true,
          scheduleFingerprint: true,
        },
      })
    : [];
  const staleIds = existing
    .filter((email: any) =>
      ["PLANNED", "FAILED"].includes(email.status) &&
      fingerprints.get(email.bookingId) !== email.scheduleFingerprint)
    .map((email: any) => email.id);
  const canceledStale = staleIds.length
    ? (await input.prisma.transactionalEmail.updateMany({
        where: { id: { in: staleIds }, status: { in: ["PLANNED", "FAILED"] } },
        data: {
          status: "CANCELED",
          canceledAt: input.now,
          completedAt: input.now,
          errorCode: "SESSION_RESCHEDULED",
          errorMessage: "A newer Session schedule replaced this email.",
          leaseToken: null,
          leaseExpiresAt: null,
        },
      })).count
    : 0;

  const desiredKeys = new Set(plans.map((plan) => plan.idempotencyKey));
  const reactivatableIds = existing
    .filter((email: any) =>
      email.status === "CANCELED" &&
      email.errorCode === "SESSION_RESCHEDULED" &&
      desiredKeys.has(email.idempotencyKey))
    .map((email: any) => email.id);
  const reactivated = reactivatableIds.length
    ? (await input.prisma.transactionalEmail.updateMany({
        where: {
          id: { in: reactivatableIds },
          status: "CANCELED",
          errorCode: "SESSION_RESCHEDULED",
        },
        data: {
          status: "PLANNED",
          nextAttemptAt: input.now,
          canceledAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      })).count
    : 0;

  const existingKeys = new Set(existing.map((email: any) => email.idempotencyKey));
  const missing = plans.filter((plan) => !existingKeys.has(plan.idempotencyKey));
  const created = missing.length
    ? await input.prisma.transactionalEmail.createMany({
        data: missing.map((plan) => ({
          ...plan,
          templateVersion: TEMPLATE_VERSION,
          nextAttemptAt: nextAttemptDate(plan.scheduledFor, input.now),
          metadataJson: {
            source: "quipsly-transactional-email-worker",
            bodyPersisted: false,
            invitationCredentialPersisted: false,
          },
        })),
        skipDuplicates: true,
      })
    : { count: 0 };
  return {
    scannedBookings: bookings.length,
    scanSaturated,
    planned: created.count + reactivated,
    canceledStale,
    reactivated,
  };
}

async function recoverExpiredLeases(prisma: WorkerPrisma, now: Date) {
  const recovered = await prisma.transactionalEmail.updateMany({
    where: {
      status: "SENDING",
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: "FAILED",
      nextAttemptAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      errorCode: "DELIVERY_LEASE_EXPIRED",
      errorMessage: "A delivery attempt ended without a provider receipt and will be retried.",
    },
  });
  return recovered.count;
}

async function claimEmail(prisma: WorkerPrisma, id: string, now: Date) {
  const leaseToken = randomUUID();
  const claimed = await prisma.transactionalEmail.updateMany({
    where: {
      id,
      status: { in: ["PLANNED", "FAILED"] },
      scheduledFor: { lte: now },
      nextAttemptAt: { lte: now },
      attemptCount: { lt: 5 },
    },
    data: {
      status: "SENDING",
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      attemptCount: { increment: 1 },
      errorCode: null,
      errorMessage: null,
    },
  });
  if (claimed.count !== 1) return null;
  return prisma.transactionalEmail.findUnique({
    where: { id },
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          timezone: true,
          clientUser: { select: { id: true, name: true, primaryEmail: true, isActive: true } },
          coachUser: { select: { id: true, name: true, primaryEmail: true, isActive: true } },
        },
      },
      room: { select: { id: true, title: true } },
      recipient: { select: { id: true, name: true, primaryEmail: true, isActive: true } },
    },
  });
}

async function cancelClaim(prisma: WorkerPrisma, email: any, now: Date, code: string, message: string) {
  await prisma.transactionalEmail.updateMany({
    where: { id: email.id, status: "SENDING", leaseToken: email.leaseToken },
    data: {
      status: "CANCELED",
      canceledAt: now,
      completedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      errorCode: code,
      errorMessage: message,
    },
  });
}

async function dispatchClaim(input: {
  prisma: WorkerPrisma;
  email: any;
  now: Date;
  send: typeof sendTransactionalEmail;
}) {
  const { prisma, email, now } = input;
  const currentFingerprint = scheduleFingerprint({
    scheduledStart: email.booking.scheduledStart,
    scheduledEnd: email.booking.scheduledEnd,
    timezone: email.booking.timezone,
  });
  if (
    email.booking.status !== "CONFIRMED" ||
    currentFingerprint !== email.scheduleFingerprint ||
    !email.recipient.isActive
  ) {
    await cancelClaim(
      prisma,
      email,
      now,
      "SESSION_NO_LONGER_SENDABLE",
      "The Session or recipient changed before delivery.",
    );
    return "canceled" as const;
  }
  if (now.getTime() > latestSendAt(email.kind, email.booking.scheduledStart).getTime()) {
    await cancelClaim(
      prisma,
      email,
      now,
      "DELIVERY_WINDOW_CLOSED",
      "Quipsly skipped a stale reminder rather than sending it at an unhelpful time.",
    );
    return "canceled" as const;
  }
  const recipientEmail = normalizeEmail(email.recipient.primaryEmail);
  if (!recipientEmail || recipientEmail !== normalizeEmail(email.recipientEmail)) {
    await cancelClaim(
      prisma,
      email,
      now,
      "RECIPIENT_IDENTITY_CHANGED",
      "The recipient email changed before delivery; a future reconciliation can plan the current address.",
    );
    return "canceled" as const;
  }
  const recipientState = await prisma.emailRecipientDeliveryState.findUnique({
    where: { recipientEmail },
    select: { status: true },
  });
  if (recipientState && recipientState.status !== "DELIVERABLE") {
    await prisma.transactionalEmail.updateMany({
      where: { id: email.id, status: "SENDING", leaseToken: email.leaseToken },
      data: {
        status: "SUPPRESSED",
        completedAt: now,
        providerStatusAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        errorCode: `RECIPIENT_${recipientState.status}`,
        errorMessage: "Quipsly did not call the provider for a suppressed recipient.",
      },
    });
    return "suppressed" as const;
  }
  const counterpart = email.recipientRole === "COACH"
    ? email.booking.clientUser
    : email.booking.coachUser;
  const result = await input.send({
    recipientEmail,
    recipientName: email.recipient.name,
    counterpartName: counterpart?.name || null,
    roomId: email.room.id,
    roomTitle: email.room.title || "Coaching Session",
    scheduledStart: email.booking.scheduledStart,
    timezone: email.booking.timezone,
    kind: email.kind,
    idempotencyKey: email.idempotencyKey,
  });
  if (result.ok) {
    await prisma.transactionalEmail.updateMany({
      where: { id: email.id, status: "SENDING", leaseToken: email.leaseToken },
      data: {
        status: "SENT",
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        providerStatusAt: now,
        sentAt: now,
        completedAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return "sent" as const;
  }
  const terminal = [
    "INVALID_RECIPIENT",
    "INVALID_SESSION_URL",
    "LOCAL_TEST_RECIPIENT",
  ].includes(result.code) || email.attemptCount >= email.maxAttempts;
  await prisma.transactionalEmail.updateMany({
    where: { id: email.id, status: "SENDING", leaseToken: email.leaseToken },
    data: {
      status: terminal ? "CANCELED" : "FAILED",
      nextAttemptAt: retryDate({
        now,
        attemptCount: email.attemptCount,
        result,
      }),
      canceledAt: terminal ? now : null,
      completedAt: terminal ? now : null,
      leaseToken: null,
      leaseExpiresAt: null,
      errorCode: result.code,
      errorMessage: result.message.slice(0, 500),
    },
  });
  return terminal ? "canceled" as const : "failed" as const;
}

export async function authorizeTransactionalEmailWorker(input: {
  authorization: string | null;
  environment?: Readonly<Record<string, string | undefined>>;
  verifyIdToken?: (input: { idToken: string; audience: string }) => Promise<{
    email?: string | null;
    emailVerified?: boolean | null;
  }>;
}) {
  const environment = input.environment ?? process.env;
  return authorizeGoogleOidcWorker({
    authorization: input.authorization,
    expectedEmail: environment.QUIPSLY_TRANSACTIONAL_EMAIL_SERVICE_ACCOUNT,
    audience: environment.QUIPSLY_TRANSACTIONAL_EMAIL_AUDIENCE,
    verifyIdToken: input.verifyIdToken,
  });
}

export async function runTransactionalEmailMaintenance(input: {
  prisma: WorkerPrisma;
  now?: Date;
  limit?: number;
  send?: typeof sendTransactionalEmail;
}) {
  const now = input.now ?? new Date();
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`Transactional email limit must be between 1 and ${MAX_LIMIT}.`);
  }
  const recoveredLeases = await recoverExpiredLeases(input.prisma, now);
  const planning = await planUpcomingEmail({
    prisma: input.prisma,
    now,
  });
  const candidates = await input.prisma.transactionalEmail.findMany({
    where: {
      status: { in: ["PLANNED", "FAILED"] },
      scheduledFor: { lte: now },
      nextAttemptAt: { lte: now },
      attemptCount: { lt: 5 },
    },
    orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  const outcomes = { sent: 0, failed: 0, canceled: 0, suppressed: 0, contended: 0 };
  for (const candidate of candidates) {
    const email = await claimEmail(input.prisma, candidate.id, now);
    if (!email) {
      outcomes.contended += 1;
      continue;
    }
    const outcome = await dispatchClaim({
      prisma: input.prisma,
      email,
      now,
      send: input.send ?? sendTransactionalEmail,
    });
    outcomes[outcome] += 1;
  }
  return {
    schema: "quipsly-transactional-email-maintenance-v1",
    ...planning,
    recoveredLeases,
    candidates: candidates.length,
    ...outcomes,
    bodyPersisted: false,
    invitationCredentialPersisted: false,
  };
}
