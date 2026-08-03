import "server-only";

import { reconcileGoogleCalendarCollection } from "@/lib/server/google-calendar-reconciliation-service";
import {
  enableGoogleCalendarLiveUpdates,
  GoogleCalendarPushError,
  queueGoogleCalendarReconciliationWake,
} from "@/lib/server/google-calendar-push";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

const PROCESSING_LEASE_MS = 10 * 60 * 1000;
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;
const RECONCILIATION_BACKSTOP_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function authorizeGoogleCalendarPushWorker(input: {
  authorization: string | null;
  environment?: Readonly<Record<string, string | undefined>>;
  verifyIdToken?: (input: { idToken: string; audience: string }) => Promise<{
    email?: string | null;
    emailVerified?: boolean | null;
  }>;
}) {
  const environment = input.environment ?? process.env;
  const expectedEmail =
    environment.GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT?.trim();
  const audience = environment.GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE?.trim();
  if (!expectedEmail || !audience) return "not-configured" as const;
  try {
    const parsed = new URL(audience);
    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== parsed.toString().replace(/\/$/, "")
    ) {
      return "not-configured" as const;
    }
  } catch {
    return "not-configured" as const;
  }
  const token = input.authorization?.startsWith("Bearer ")
    ? input.authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) return "unauthorized" as const;
  const verifyIdToken = input.verifyIdToken ?? verifyGoogleOidcToken;
  try {
    const identity = await verifyIdToken({ idToken: token, audience });
    return identity.email === expectedEmail && identity.emailVerified !== false
      ? ("authorized" as const)
      : ("unauthorized" as const);
  } catch {
    return "unauthorized" as const;
  }
}

async function verifyGoogleOidcToken(input: {
  idToken: string;
  audience: string;
}) {
  const { google } = await import("googleapis");
  const client = new google.auth.OAuth2();
  const ticket = await client.verifyIdToken({
    idToken: input.idToken,
    audience: input.audience,
  });
  const payload = ticket.getPayload();
  return {
    email: payload?.email || null,
    emailVerified: payload?.email_verified ?? null,
  };
}

async function claimWake(prisma: any, now: Date) {
  return prisma.$transaction(
    async (transaction: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        transaction,
        "google-calendar-reconciliation-wake-claim",
      );
      await transaction.calendarReconciliationWake.updateMany({
        where: {
          status: "PROCESSING",
          claimedAt: { lt: new Date(now.getTime() - PROCESSING_LEASE_MS) },
        },
        data: {
          status: "QUEUED",
          claimedAt: null,
          availableAt: now,
          lastErrorCode: "worker-lease-expired",
        },
      });
      const wake = await transaction.calendarReconciliationWake.findFirst({
        where: { status: "QUEUED", availableAt: { lte: now } },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      });
      if (!wake) return null;
      return transaction.calendarReconciliationWake.update({
        where: { id: wake.id },
        data: {
          status: "PROCESSING",
          claimedAt: now,
          attemptCount: { increment: 1 },
          lastErrorCode: null,
        },
      });
    },
    { maxWait: 5_000, timeout: 10_000, isolationLevel: "Serializable" },
  );
}

async function completeWake(prisma: any, wake: any, now: Date) {
  return prisma.$transaction(
    async (transaction: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        transaction,
        `google-calendar-wake:${wake.collectionId}`,
      );
      const current = await transaction.calendarReconciliationWake.findUnique({
        where: { id: wake.id },
      });
      const metadata =
        current?.metadataJson &&
        typeof current.metadataJson === "object" &&
        !Array.isArray(current.metadataJson)
          ? { ...current.metadataJson }
          : {};
      if (
        current?.status === "PROCESSING" &&
        metadata.requeueAfterProcessing === true
      ) {
        delete metadata.requeueAfterProcessing;
        return transaction.calendarReconciliationWake.update({
          where: { id: wake.id },
          data: {
            status: "QUEUED",
            claimedAt: null,
            completedAt: null,
            availableAt: now,
            lastErrorCode: null,
            metadataJson: metadata,
          },
        });
      }
      return transaction.calendarReconciliationWake.update({
        where: { id: wake.id },
        data: {
          activeKey: null,
          status: "SUCCEEDED",
          claimedAt: null,
          completedAt: now,
          lastErrorCode: null,
        },
      });
    },
    { maxWait: 5_000, timeout: 10_000, isolationLevel: "Serializable" },
  );
}

async function failWake(prisma: any, wake: any, error: unknown, now: Date) {
  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "calendar-reconciliation-worker-failed";
  const retry = wake.attemptCount < MAX_ATTEMPTS;
  const backoffMinutes = Math.min(30, 2 ** Math.max(0, wake.attemptCount - 1));
  await prisma.calendarReconciliationWake.update({
    where: { id: wake.id },
    data: retry
      ? {
          status: "QUEUED",
          claimedAt: null,
          availableAt: new Date(now.getTime() + backoffMinutes * 60_000),
          lastErrorCode: errorCode,
        }
      : {
          activeKey: null,
          status: "FAILED",
          claimedAt: null,
          completedAt: now,
          lastErrorCode: errorCode,
        },
  });
  return { retry, errorCode };
}

export async function processGoogleCalendarReconciliationWakes(input: {
  prisma: any;
  requestUrl: string;
  now?: Date;
  limit?: number;
  fetchImpl?: typeof fetch;
}) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 10, 25));
  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < limit; index += 1) {
    const wake = await claimWake(input.prisma, now);
    if (!wake) break;
    const collection = await input.prisma.calendarCollection.findUnique({
      where: { id: wake.collectionId },
      include: { connection: { include: { user: true } } },
    });
    if (
      !collection ||
      collection.status !== "ACTIVE" ||
      !collection.liveUpdatesEnabled ||
      collection.connection?.status !== "VERIFIED" ||
      !collection.connection.userId
    ) {
      await completeWake(input.prisma, wake, now);
      results.push({ wakeId: wake.id, outcome: "retired-selection" });
      continue;
    }
    try {
      const reconciliation = await reconcileGoogleCalendarCollection({
        prisma: input.prisma,
        collectionId: collection.id,
        actorUserId: collection.connection.userId,
        actorEmail:
          collection.connection.user?.primaryEmail ||
          collection.connection.user?.email ||
          null,
        requestUrl: input.requestUrl,
        fetchImpl: input.fetchImpl,
      });
      await completeWake(input.prisma, wake, now);
      results.push({
        wakeId: wake.id,
        outcome: reconciliation.superseded
          ? "superseded-by-newer-check"
          : "reconciled",
        conflictCount: reconciliation.superseded
          ? 0
          : reconciliation.conflictCount,
      });
    } catch (error) {
      const failure = await failWake(input.prisma, wake, error, now);
      results.push({
        wakeId: wake.id,
        outcome: failure.retry ? "retrying" : "failed",
        ...failure,
      });
    }
  }
  return results;
}

export async function renewGoogleCalendarWatchChannels(input: {
  prisma: any;
  requestUrl: string;
  now?: Date;
  limit?: number;
  fetchImpl?: typeof fetch;
}) {
  const now = input.now ?? new Date();
  const renewBefore = new Date(now.getTime() + RENEW_BEFORE_MS);
  await input.prisma.calendarNotificationChannel.updateMany({
    where: {
      status: { in: ["ACTIVE", "DRAINING"] },
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
  const collections = await input.prisma.calendarCollection.findMany({
    where: {
      status: "ACTIVE",
      liveUpdatesEnabled: true,
      providerCalendarId: { not: null },
      connection: {
        provider: "GOOGLE",
        connectionKind: "USER_OAUTH",
        status: "VERIFIED",
      },
    },
    include: {
      connection: { include: { user: true } },
      notificationChannels: {
        where: { status: { in: ["STARTING", "ACTIVE"] } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(input.limit ?? 10, 25)),
  });
  const results: Array<Record<string, unknown>> = [];
  for (const collection of collections) {
    const starting = collection.notificationChannels.find(
      (channel: any) =>
        channel.status === "STARTING" &&
        channel.createdAt.getTime() > now.getTime() - PROCESSING_LEASE_MS,
    );
    const active = collection.notificationChannels.find(
      (channel: any) => channel.status === "ACTIVE",
    );
    if (starting || (active?.expiresAt && active.expiresAt > renewBefore))
      continue;
    if (!collection.connection?.userId) continue;
    try {
      const renewed = await enableGoogleCalendarLiveUpdates({
        prisma: input.prisma,
        collectionId: collection.id,
        actorUserId: collection.connection.userId,
        actorEmail:
          collection.connection.user?.primaryEmail ||
          collection.connection.user?.email ||
          null,
        requestUrl: input.requestUrl,
        now,
        fetchImpl: input.fetchImpl,
      });
      results.push({
        collectionId: collection.id,
        outcome: "renewed",
        expiresAt: renewed.expiresAt,
      });
    } catch (error) {
      results.push({
        collectionId: collection.id,
        outcome: "renewal-failed",
        code:
          error instanceof GoogleCalendarPushError
            ? error.code
            : "calendar-watch-renewal-failed",
      });
    }
  }
  return results;
}

export async function enqueueGoogleCalendarReconciliationBackstop(input: {
  prisma: any;
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - RECONCILIATION_BACKSTOP_MS);
  const collections = await input.prisma.calendarCollection.findMany({
    where: {
      status: "ACTIVE",
      liveUpdatesEnabled: true,
      providerCalendarId: { not: null },
      connection: {
        provider: "GOOGLE",
        connectionKind: "USER_OAUTH",
        status: "VERIFIED",
      },
      OR: [
        { cursor: { is: null } },
        { cursor: { is: { updatedAt: { lt: staleBefore } } } },
      ],
    },
    select: { id: true, cursor: { select: { updatedAt: true } } },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(input.limit ?? 25, 100)),
  });
  const results: Array<Record<string, unknown>> = [];
  for (const collection of collections) {
    const queued = await input.prisma.$transaction(
      (transaction: any) =>
        queueGoogleCalendarReconciliationWake(transaction, {
          collectionId: collection.id,
          reason: "periodic-cursor-backstop",
          metadataJson: {
            schema: "quipsly-google-calendar-reconciliation-wake-v1",
            source: "scheduler-backstop",
            cursorUpdatedAt:
              collection.cursor?.updatedAt?.toISOString() || null,
            staleBefore: staleBefore.toISOString(),
          },
          now,
        }),
      { maxWait: 5_000, timeout: 10_000, isolationLevel: "Serializable" },
    );
    results.push({ collectionId: collection.id, ...queued });
  }
  return results;
}

export async function runGoogleCalendarPushMaintenance(input: {
  prisma: any;
  requestUrl: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}) {
  const now = input.now ?? new Date();
  const renewals = await renewGoogleCalendarWatchChannels({ ...input, now });
  const backstop = await enqueueGoogleCalendarReconciliationBackstop({
    prisma: input.prisma,
    now,
  });
  const wakes = await processGoogleCalendarReconciliationWakes({
    ...input,
    now,
  });
  return { renewals, backstop, wakes, checkedAt: now.toISOString() };
}
