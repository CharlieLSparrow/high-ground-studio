import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { resolveCalendarPublicOrigin } from "@/lib/server/calendar-public-origin";
import {
  decryptGoogleRefreshToken,
  getGoogleCalendarOAuthConfig,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

const GOOGLE_WATCH_TTL_SECONDS = 7 * 24 * 60 * 60;
const ACCEPTED_RESOURCE_STATES = new Set(["sync", "exists", "not_exists"]);
const ACCEPTED_CHANNEL_STATUSES = new Set(["STARTING", "ACTIVE", "DRAINING"]);

export class GoogleCalendarPushError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function equalDigest(expectedHex: string, value: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(digest(value), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function safeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseMessageNumber(value: string) {
  if (!/^\d{1,40}$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function isNewerMessage(prior: string | null, next: string) {
  const nextNumber = parseMessageNumber(next);
  if (nextNumber === null) return false;
  const priorNumber = prior ? parseMessageNumber(prior) : null;
  return priorNumber === null || nextNumber > priorNumber;
}

function requirePushWorkerConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const serviceAccount =
    environment.GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT?.trim();
  const audience = environment.GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE?.trim();
  let validAudience = false;
  try {
    const url = new URL(audience || "");
    validAudience =
      url.protocol === "https:" &&
      url.origin === url.toString().replace(/\/$/, "");
  } catch {
    validAudience = false;
  }
  if (
    !serviceAccount ||
    !/^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$/.test(
      serviceAccount,
    ) ||
    !validAudience
  ) {
    throw new GoogleCalendarPushError(
      "Google Calendar live updates are not available until the signed scheduler identity is configured.",
      "calendar-push-worker-not-configured",
      503,
    );
  }
}

async function authorizedCollection(input: {
  prisma: any;
  collectionId: string;
  actorUserId: string;
  actorEmail?: string | null;
}) {
  const collection = await input.prisma.calendarCollection.findFirst({
    where: {
      id: input.collectionId,
      status: "ACTIVE",
      connection: {
        userId: input.actorUserId,
        provider: "GOOGLE",
        connectionKind: "USER_OAUTH",
        status: "VERIFIED",
      },
      OR: [{ ownerUserId: input.actorUserId }, { nestId: { not: null } }],
    },
    include: {
      nest: { select: { id: true, slug: true } },
      connection: { include: { oauthCredential: true } },
      notificationChannels: {
        where: { status: { in: ["ACTIVE", "DRAINING"] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!collection?.providerCalendarId) {
    throw new GoogleCalendarPushError(
      "That Google calendar selection is unavailable.",
      "calendar-selection-unavailable",
      404,
    );
  }
  if (collection.nest) {
    const access = await resolveStudioProjectAccess({
      projectSlug: collection.nest.slug,
      email: input.actorEmail,
      action: "write",
      prisma: input.prisma,
    });
    if (!access.allowed || access.projectId !== collection.nest.id) {
      throw new GoogleCalendarPushError(
        "You need edit access to change live updates for that team calendar.",
        "calendar-live-updates-access-denied",
        403,
      );
    }
  }
  if (!collection.connection.oauthCredential?.encryptedPayload) {
    throw new GoogleCalendarPushError(
      "Reconnect Google Calendar before enabling live updates.",
      "calendar-reconnect-required",
      409,
    );
  }
  return collection;
}

async function accessForCollection(input: {
  collection: any;
  requestUrl: string;
}) {
  const config = getGoogleCalendarOAuthConfig(input.requestUrl);
  const refreshToken = decryptGoogleRefreshToken(
    input.collection.connection.oauthCredential.encryptedPayload,
    config.encryptionKey,
  );
  return refreshGoogleCalendarAccess({ refreshToken, config });
}

export async function watchGoogleCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  channelId: string;
  channelToken: string;
  address: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await (input.fetchImpl ?? fetch)(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: input.channelId,
        type: "web_hook",
        address: input.address,
        token: input.channelToken,
        params: { ttl: String(GOOGLE_WATCH_TTL_SECONDS) },
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const providerId = safeText(body?.id);
  const resourceId = safeText(body?.resourceId);
  const expirationText = safeText(body?.expiration);
  const expirationMs = expirationText ? Number(expirationText) : Number.NaN;
  if (
    !response.ok ||
    providerId !== input.channelId ||
    !resourceId ||
    !Number.isSafeInteger(expirationMs)
  ) {
    throw new GoogleCalendarPushError(
      response.status === 401 || response.status === 403
        ? "Google Calendar access is no longer sufficient for live updates."
        : "Google Calendar did not return a verifiable live-update lease.",
      response.status === 401 || response.status === 403
        ? "calendar-reconnect-required"
        : `calendar-watch-${response.status || "failed"}`,
      response.status === 401 || response.status === 403 ? 409 : 502,
    );
  }
  return { resourceId, expiresAt: new Date(expirationMs) };
}

export async function stopGoogleCalendarChannel(input: {
  accessToken: string;
  channelId: string;
  resourceId: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await (input.fetchImpl ?? fetch)(
    "https://www.googleapis.com/calendar/v3/channels/stop",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: input.channelId,
        resourceId: input.resourceId,
      }),
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new GoogleCalendarPushError(
      "Google Calendar could not confirm that the old live-update lease stopped.",
      `calendar-watch-stop-${response.status || "failed"}`,
    );
  }
  return response.status === 404
    ? ("already-stopped" as const)
    : ("stopped" as const);
}

export async function queueGoogleCalendarReconciliationWake(
  transaction: any,
  input: {
    collectionId: string;
    reason: string;
    metadataJson: Record<string, unknown>;
    now: Date;
  },
) {
  await acquirePrismaAdvisoryTransactionLock(
    transaction,
    `google-calendar-wake:${input.collectionId}`,
  );
  const existing = await transaction.calendarReconciliationWake.findUnique({
    where: { activeKey: input.collectionId },
  });
  if (existing) {
    const requeueAfterProcessing = existing.status === "PROCESSING";
    await transaction.calendarReconciliationWake.update({
      where: { id: existing.id },
      data: {
        reason: input.reason,
        metadataJson: requeueAfterProcessing
          ? { ...input.metadataJson, requeueAfterProcessing: true }
          : input.metadataJson,
        ...(existing.status === "QUEUED" && existing.availableAt > input.now
          ? { availableAt: input.now }
          : {}),
      },
    });
    return { wakeId: existing.id, deduplicated: true };
  }
  const wake = await transaction.calendarReconciliationWake.create({
    data: {
      collectionId: input.collectionId,
      activeKey: input.collectionId,
      status: "QUEUED",
      reason: input.reason,
      availableAt: input.now,
      metadataJson: input.metadataJson,
    },
  });
  return { wakeId: wake.id, deduplicated: false };
}

export async function enableGoogleCalendarLiveUpdates(input: {
  prisma: any;
  collectionId: string;
  actorUserId: string;
  actorEmail?: string | null;
  requestUrl: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}) {
  requirePushWorkerConfiguration();
  const now = input.now ?? new Date();
  const collection = await authorizedCollection(input);
  const accessToken = await accessForCollection({
    collection,
    requestUrl: input.requestUrl,
  });
  const channelId = randomUUID();
  const channelToken = randomBytes(32).toString("base64url");
  const address = new URL(
    "/api/calendar/connections/google/notifications",
    resolveCalendarPublicOrigin(input.requestUrl),
  ).toString();
  const starting = await input.prisma.calendarNotificationChannel.create({
    data: {
      collectionId: collection.id,
      channelId,
      tokenDigest: digest(channelToken),
      status: "STARTING",
      metadataJson: {
        schema: "quipsly-google-calendar-watch-channel-v1",
        notificationAddress: address,
        tokenPersisted: false,
      },
    },
  });

  let lease: { resourceId: string; expiresAt: Date };
  try {
    lease = await watchGoogleCalendarEvents({
      accessToken,
      calendarId: collection.providerCalendarId,
      channelId,
      channelToken,
      address,
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    await input.prisma.$transaction(async (transaction: any) => {
      await transaction.calendarNotificationChannel.update({
        where: { id: starting.id },
        data: {
          status: "UNKNOWN",
          metadataJson: {
            schema: "quipsly-google-calendar-watch-channel-v1",
            providerOutcomeUncertain: true,
            tokenPersisted: false,
          },
        },
      });
      await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: collection.connectionId,
          collectionId: collection.id,
          actorUserId: input.actorUserId,
          operation: "WATCH_START",
          outcome: "FAILED",
          externalMutated: false,
          providerStatus:
            error instanceof GoogleCalendarPushError
              ? error.code
              : "calendar-watch-failed",
          metadataJson: {
            schema: "quipsly-google-calendar-watch-receipt-v1",
            providerOutcomeUncertain: true,
          },
        },
      });
    });
    throw error;
  }

  const priorChannels = collection.notificationChannels.filter(
    (channel: any) => channel.id !== starting.id && channel.resourceId,
  );
  const activated = await input.prisma.$transaction(
    async (transaction: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        transaction,
        `google-calendar-watch:${collection.id}`,
      );
      await transaction.calendarNotificationChannel.updateMany({
        where: {
          collectionId: collection.id,
          id: { not: starting.id },
          status: "ACTIVE",
        },
        data: { status: "DRAINING" },
      });
      const channel = await transaction.calendarNotificationChannel.update({
        where: { id: starting.id },
        data: {
          resourceId: lease.resourceId,
          expiresAt: lease.expiresAt,
          status: "ACTIVE",
          metadataJson: {
            schema: "quipsly-google-calendar-watch-channel-v1",
            notificationAddress: address,
            tokenPersisted: false,
            activatedAt: now.toISOString(),
          },
        },
      });
      await transaction.calendarCollection.update({
        where: { id: collection.id },
        data: { liveUpdatesEnabled: true },
      });
      const wake = await queueGoogleCalendarReconciliationWake(transaction, {
        collectionId: collection.id,
        reason: "watch-activated",
        metadataJson: {
          schema: "quipsly-calendar-reconciliation-wake-v1",
          source: "watch-activation",
        },
        now,
      });
      const receipt = await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: collection.connectionId,
          collectionId: collection.id,
          actorUserId: input.actorUserId,
          operation: "WATCH_START",
          outcome: "SUCCEEDED",
          requestDigest: digest(`${collection.id}:${channelId}:${address}`),
          responseDigest: digest(
            `${lease.resourceId}:${lease.expiresAt.toISOString()}`,
          ),
          providerStatus: "watch-active",
          externalMutated: true,
          occurredAt: now,
          metadataJson: {
            schema: "quipsly-google-calendar-watch-receipt-v1",
            channelIdPersisted: true,
            tokenPersisted: false,
            expiresAt: lease.expiresAt.toISOString(),
          },
        },
      });
      return { channel, wake, receiptId: receipt.id };
    },
  );

  const stopped: Array<{ channelId: string; outcome: string }> = [];
  for (const prior of priorChannels) {
    try {
      const outcome = await stopGoogleCalendarChannel({
        accessToken,
        channelId: prior.channelId,
        resourceId: prior.resourceId,
        fetchImpl: input.fetchImpl,
      });
      await input.prisma.calendarNotificationChannel.update({
        where: { id: prior.id },
        data: { status: "STOPPED", stoppedAt: now },
      });
      stopped.push({ channelId: prior.channelId, outcome });
    } catch {
      stopped.push({
        channelId: prior.channelId,
        outcome: "draining-until-expiry",
      });
    }
  }
  return {
    channelId: activated.channel.channelId,
    expiresAt: activated.channel.expiresAt,
    wakeId: activated.wake.wakeId,
    receiptId: activated.receiptId,
    priorChannels: stopped,
  };
}

export async function disableGoogleCalendarLiveUpdates(input: {
  prisma: any;
  collectionId: string;
  actorUserId: string;
  actorEmail?: string | null;
  requestUrl: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}) {
  const now = input.now ?? new Date();
  const collection = await authorizedCollection(input);
  const accessToken = await accessForCollection({
    collection,
    requestUrl: input.requestUrl,
  });
  const outcomes: string[] = [];
  for (const channel of collection.notificationChannels) {
    if (!channel.resourceId) continue;
    try {
      outcomes.push(
        await stopGoogleCalendarChannel({
          accessToken,
          channelId: channel.channelId,
          resourceId: channel.resourceId,
          fetchImpl: input.fetchImpl,
        }),
      );
    } catch {
      outcomes.push("provider-stop-unconfirmed");
    }
  }
  await input.prisma.$transaction(async (transaction: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      transaction,
      `google-calendar-watch:${collection.id}`,
    );
    await transaction.calendarNotificationChannel.updateMany({
      where: {
        collectionId: collection.id,
        status: { in: ["STARTING", "ACTIVE", "DRAINING", "UNKNOWN"] },
      },
      data: { status: "STOPPED", stoppedAt: now },
    });
    await transaction.calendarCollection.update({
      where: { id: collection.id },
      data: { liveUpdatesEnabled: false },
    });
    await transaction.calendarSyncReceipt.create({
      data: {
        connectionId: collection.connectionId,
        collectionId: collection.id,
        actorUserId: input.actorUserId,
        operation: "WATCH_STOP",
        outcome: outcomes.includes("provider-stop-unconfirmed")
          ? "FAILED"
          : "SUCCEEDED",
        providerStatus: outcomes.includes("provider-stop-unconfirmed")
          ? "provider-stop-unconfirmed-local-disabled"
          : "watch-stopped",
        externalMutated: outcomes.some((outcome) => outcome === "stopped"),
        occurredAt: now,
        metadataJson: {
          schema: "quipsly-google-calendar-watch-receipt-v1",
          localNotificationsAccepted: false,
          providerOutcomes: outcomes,
        },
      },
    });
  });
  return { disabled: true, providerOutcomes: outcomes };
}

export async function receiveGoogleCalendarNotification(input: {
  prisma: any;
  channelId: string;
  channelToken: string;
  resourceId: string;
  resourceState: string;
  messageNumber: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (
    !input.channelId ||
    input.channelId.length > 64 ||
    !input.channelToken ||
    input.channelToken.length > 256 ||
    !input.resourceId ||
    !ACCEPTED_RESOURCE_STATES.has(input.resourceState) ||
    parseMessageNumber(input.messageNumber) === null
  ) {
    throw new GoogleCalendarPushError(
      "The notification headers are invalid.",
      "calendar-notification-invalid",
      400,
    );
  }
  const candidate = await input.prisma.calendarNotificationChannel.findUnique({
    where: { channelId: input.channelId },
    include: { collection: { include: { connection: true } } },
  });
  if (
    !candidate ||
    !ACCEPTED_CHANNEL_STATUSES.has(candidate.status) ||
    !equalDigest(candidate.tokenDigest, input.channelToken) ||
    candidate.collection.status !== "ACTIVE" ||
    !candidate.collection.liveUpdatesEnabled ||
    candidate.collection.connection?.status !== "VERIFIED" ||
    (candidate.expiresAt && candidate.expiresAt <= now)
  ) {
    throw new GoogleCalendarPushError(
      "The notification channel is unavailable.",
      "calendar-notification-unavailable",
      404,
    );
  }
  // Google may deliver the initial sync notification before the watch response
  // reaches Quipsly. The token and channel are verifiable at that point, but
  // the provider resource identity is not. Activation always queues an initial
  // reconciliation, so acknowledging this race without trusting it loses no
  // calendar evidence.
  if (!candidate.resourceId || candidate.status === "STARTING") {
    return { accepted: true, queued: false, reason: "watch-still-starting" };
  }
  if (candidate.resourceId !== input.resourceId) {
    throw new GoogleCalendarPushError(
      "The notification resource does not match its channel.",
      "calendar-notification-resource-mismatch",
      404,
    );
  }
  return input.prisma.$transaction(
    async (transaction: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        transaction,
        `google-calendar-notification:${input.channelId}`,
      );
      const current = await transaction.calendarNotificationChannel.findUnique({
        where: { id: candidate.id },
        include: { collection: { include: { connection: true } } },
      });
      if (
        !current ||
        !ACCEPTED_CHANNEL_STATUSES.has(current.status) ||
        !equalDigest(current.tokenDigest, input.channelToken) ||
        current.resourceId !== input.resourceId ||
        !current.collection.liveUpdatesEnabled ||
        current.collection.status !== "ACTIVE" ||
        current.collection.connection?.status !== "VERIFIED" ||
        (current.expiresAt && current.expiresAt <= now)
      ) {
        throw new GoogleCalendarPushError(
          "The notification channel changed before it could be recorded.",
          "calendar-notification-superseded",
          409,
        );
      }
      if (!isNewerMessage(current.lastMessageNumber, input.messageNumber)) {
        await transaction.calendarSyncReceipt.create({
          data: {
            connectionId: current.collection.connectionId,
            collectionId: current.collectionId,
            operation: "WATCH_NOTIFICATION",
            outcome: "SKIPPED",
            requestDigest: digest(
              `${input.channelId}:${input.resourceId}:${input.messageNumber}`,
            ),
            providerStatus: "duplicate-or-out-of-order-notification",
            externalMutated: false,
            occurredAt: now,
            metadataJson: {
              schema: "quipsly-google-calendar-watch-notification-v1",
              providerContentImported: false,
              tokenPersisted: false,
            },
          },
        });
        return {
          accepted: true,
          queued: false,
          reason: "duplicate-or-out-of-order",
        };
      }
      await transaction.calendarNotificationChannel.update({
        where: { id: current.id },
        data: {
          lastMessageNumber: input.messageNumber,
          lastResourceState: input.resourceState,
          lastNotificationAt: now,
        },
      });
      const wake = await queueGoogleCalendarReconciliationWake(transaction, {
        collectionId: current.collectionId,
        reason: `google-${input.resourceState}`,
        metadataJson: {
          schema: "quipsly-calendar-reconciliation-wake-v1",
          source: "verified-google-watch-notification",
          resourceState: input.resourceState,
        },
        now,
      });
      await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: current.collection.connectionId,
          collectionId: current.collectionId,
          operation: "WATCH_NOTIFICATION",
          outcome: "SUCCEEDED",
          requestDigest: digest(
            `${input.channelId}:${input.resourceId}:${input.messageNumber}`,
          ),
          providerStatus: `verified-${input.resourceState}`,
          externalMutated: false,
          occurredAt: now,
          metadataJson: {
            schema: "quipsly-google-calendar-watch-notification-v1",
            providerContentImported: false,
            tokenPersisted: false,
            wakeDeduplicated: wake.deduplicated,
          },
        },
      });
      return { accepted: true, queued: true, ...wake };
    },
    { maxWait: 5_000, timeout: 10_000, isolationLevel: "Serializable" },
  );
}
