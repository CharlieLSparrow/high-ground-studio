#!/usr/bin/env node

import { randomBytes } from "node:crypto";

const enabled = process.env.QUIPSLY_LOCAL_GOOGLE_CALENDAR_PUSH_DOGFOOD === "1";
const databaseUrl = new URL(
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  enabled,
  "Set QUIPSLY_LOCAL_GOOGLE_CALENDAR_PUSH_DOGFOOD=1 to authorize disposable local writes.",
);
assertLoopbackHost(databaseUrl.hostname, "database URL");

process.env.DATABASE_URL = databaseUrl.toString();
process.env.PRISMA_PG_POOL_MAX ||= "1";
process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID = "local-calendar-push-client";
process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET = "local-calendar-push-secret";
process.env.GOOGLE_CALENDAR_OAUTH_STATE_SECRET =
  randomBytes(32).toString("base64url");
process.env.GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY =
  randomBytes(32).toString("base64url");
process.env.GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT =
  "calendar-push-worker@local-project.iam.gserviceaccount.com";
process.env.GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE =
  "https://calendar-push-worker.example.test";
process.env.QUIPSLY_APP_HOST = "https://nest.quipsly.com";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const { encryptGoogleRefreshToken, getGoogleCalendarOAuthConfig } =
  await import("../apps/quipsly/src/lib/server/google-calendar-oauth.ts");
const {
  disableGoogleCalendarLiveUpdates,
  enableGoogleCalendarLiveUpdates,
  receiveGoogleCalendarNotification,
} = await import("../apps/quipsly/src/lib/server/google-calendar-push.ts");
const {
  enqueueGoogleCalendarReconciliationBackstop,
  processGoogleCalendarReconciliationWakes,
  renewGoogleCalendarWatchChannels,
} =
  await import("../apps/quipsly/src/lib/server/google-calendar-push-worker.ts");

const prisma = getPrismaClient();
const originalFetch = globalThis.fetch;
const nonce = randomBytes(5).toString("hex");
const prefix = `calendar-push-dogfood-${nonce}`;
const ownerEmail = `${prefix}@example.test`;
const providerCalendarId = `${prefix}-calendar`;
const providerEventId = `${prefix}-event`;
const requestUrl = "https://nest.quipsly.com/api/cron/google-calendar-push";
const startedAt = new Date();
let providerEtag = '"etag-1"';
let syncCounter = 0;
let watchCounter = 0;
let watchClock = startedAt;
const providerCalls = [];
const fixture = { userId: "", connectionId: "", collectionId: "" };
let operation = null;
let cleanup = null;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (
    url.origin === "https://oauth2.googleapis.com" &&
    url.pathname === "/token"
  ) {
    providerCalls.push({ kind: "token" });
    return jsonResponse({ access_token: `access-${providerCalls.length}` });
  }
  if (url.pathname.endsWith("/events/watch")) {
    const body = JSON.parse(String(init.body));
    watchCounter += 1;
    providerCalls.push({
      kind: "watch",
      channelId: body.id,
      address: body.address,
      ttl: body.params?.ttl,
      token: body.token,
    });
    return jsonResponse({
      id: body.id,
      resourceId: `resource-${watchCounter}`,
      expiration: String(watchClock.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
  }
  if (url.pathname === "/calendar/v3/channels/stop") {
    providerCalls.push({ kind: "stop", body: JSON.parse(String(init.body)) });
    return new Response(null, { status: 204 });
  }
  if (
    url.pathname.endsWith(
      `/calendars/${encodeURIComponent(providerCalendarId)}/events`,
    )
  ) {
    syncCounter += 1;
    providerCalls.push({
      kind: "events",
      syncTokenPresent: url.searchParams.has("syncToken"),
      fields: url.searchParams.get("fields"),
    });
    return jsonResponse({
      items: [
        {
          id: providerEventId,
          etag: providerEtag,
          status: "confirmed",
          updated: new Date(
            startedAt.getTime() + syncCounter * 1000,
          ).toISOString(),
          extendedProperties: {
            private: {
              quipslySourceType: "CallRoom",
              quipslySourceId: `${prefix}-source`,
              quipslySourceRevision: "source-revision-1",
              quipslySchema: "quipsly-session-calendar-snapshot-v1",
            },
          },
        },
      ],
      nextSyncToken: `sync-token-${syncCounter}`,
    });
  }
  throw new Error(`Unexpected provider request: ${url}`);
};

try {
  const user = await prisma.user.create({
    data: {
      primaryEmail: ownerEmail,
      name: "Calendar push dogfood owner",
      emailVerified: startedAt,
    },
  });
  fixture.userId = user.id;
  const connection = await prisma.calendarConnection.create({
    data: {
      userId: user.id,
      provider: "GOOGLE",
      connectionKind: "USER_OAUTH",
      providerAccountKey: `${prefix}-account`,
      status: "VERIFIED",
      verifiedAt: startedAt,
      metadataJson: { fixture: prefix },
      oauthCredential: {
        create: {
          encryptedPayload: encryptGoogleRefreshToken(
            `${prefix}-refresh-token`,
            getGoogleCalendarOAuthConfig(requestUrl).encryptionKey,
          ),
        },
      },
    },
  });
  fixture.connectionId = connection.id;
  const collection = await prisma.calendarCollection.create({
    data: {
      connectionId: connection.id,
      ownerUserId: user.id,
      purpose: "PERSONAL_COMMITMENTS",
      displayName: "Calendar push dogfood",
      timezone: "America/Denver",
      providerCalendarId,
      visibility: "PRIVATE",
      status: "ACTIVE",
      metadataJson: { fixture: prefix },
    },
  });
  fixture.collectionId = collection.id;
  await prisma.calendarProjection.create({
    data: {
      collectionId: collection.id,
      sourceType: "CallRoom",
      sourceId: `${prefix}-source`,
      sourceRevision: "source-revision-1",
      providerEventId,
      providerEtag,
      uid: `${prefix}@quipsly.local`,
      status: "SYNCED",
      conflictState: "NONE",
      metadataJson: { fixture: prefix },
    },
  });

  const activation = await enableGoogleCalendarLiveUpdates({
    prisma,
    collectionId: collection.id,
    actorUserId: user.id,
    actorEmail: ownerEmail,
    requestUrl,
    now: startedAt,
  });
  const firstChannel =
    await prisma.calendarNotificationChannel.findUniqueOrThrow({
      where: { channelId: activation.channelId },
    });
  const watchCall = providerCalls.find((call) => call.kind === "watch");
  assert(
    firstChannel.status === "ACTIVE",
    "The first provider lease was not activated.",
  );
  assert(
    firstChannel.resourceId === "resource-1",
    "The provider resource identity was not bound exactly.",
  );
  assert(
    firstChannel.tokenDigest &&
      !JSON.stringify(firstChannel).includes(watchCall.token),
    "The raw channel token was persisted.",
  );
  assert(
    watchCall.address ===
      "https://nest.quipsly.com/api/calendar/connections/google/notifications",
    "The callback origin drifted.",
  );
  assert(watchCall.ttl === "604800", "The watch lease TTL drifted.");

  const activationWakes = await processGoogleCalendarReconciliationWakes({
    prisma,
    requestUrl,
    now: new Date(startedAt.getTime() + 1000),
  });
  assert(
    activationWakes.length === 1 && activationWakes[0].outcome === "reconciled",
    "The activation wake did not perform a full reconciliation.",
  );
  const fullCursor = await prisma.calendarSyncCursor.findUniqueOrThrow({
    where: { collectionId: collection.id },
  });
  assert(
    fullCursor.lastFullSyncAt,
    "Activation did not establish the full-sync cursor.",
  );

  providerEtag = '"etag-provider-change"';
  const notification = await receiveGoogleCalendarNotification({
    prisma,
    channelId: firstChannel.channelId,
    channelToken: watchCall.token,
    resourceId: firstChannel.resourceId,
    resourceState: "exists",
    messageNumber: "90071992547409930001",
    now: new Date(startedAt.getTime() + 2000),
  });
  assert(
    notification.queued === true,
    "A verified notification did not queue reconciliation.",
  );
  const duplicate = await receiveGoogleCalendarNotification({
    prisma,
    channelId: firstChannel.channelId,
    channelToken: watchCall.token,
    resourceId: firstChannel.resourceId,
    resourceState: "exists",
    messageNumber: "90071992547409930001",
    now: new Date(startedAt.getTime() + 3000),
  });
  assert(
    duplicate.queued === false,
    "An exact notification replay created duplicate work.",
  );
  await expectRejection(
    receiveGoogleCalendarNotification({
      prisma,
      channelId: firstChannel.channelId,
      channelToken: "wrong-token",
      resourceId: firstChannel.resourceId,
      resourceState: "exists",
      messageNumber: "90071992547409930002",
      now: new Date(startedAt.getTime() + 4000),
    }),
    "A wrong notification token was accepted.",
  );
  const notificationWakes = await processGoogleCalendarReconciliationWakes({
    prisma,
    requestUrl,
    now: new Date(startedAt.getTime() + 5000),
  });
  assert(
    notificationWakes.length === 1 && notificationWakes[0].conflictCount === 1,
    "The provider edit did not become one review conflict.",
  );
  const changedProjection = await prisma.calendarProjection.findFirstOrThrow({
    where: { collectionId: collection.id },
  });
  assert(
    changedProjection.status === "CONFLICT" &&
      changedProjection.conflictState === "EXTERNAL_CHANGED",
    "Reconciliation did not preserve the provider edit as a conflict.",
  );

  const backstopNow = new Date(startedAt.getTime() + 25 * 60 * 60 * 1000);
  const backstop = await enqueueGoogleCalendarReconciliationBackstop({
    prisma,
    now: backstopNow,
  });
  assert(
    backstop.length === 1 && backstop[0].deduplicated === false,
    "A stale live cursor did not queue the periodic correctness backstop.",
  );
  const backstopWakes = await processGoogleCalendarReconciliationWakes({
    prisma,
    requestUrl,
    now: new Date(backstopNow.getTime() + 1000),
  });
  assert(
    backstopWakes.length === 1 && backstopWakes[0].outcome === "reconciled",
    "The periodic correctness backstop did not reconcile.",
  );

  const renewalNow = new Date(startedAt.getTime() + 6.5 * 24 * 60 * 60 * 1000);
  watchClock = renewalNow;
  const renewals = await renewGoogleCalendarWatchChannels({
    prisma,
    requestUrl,
    now: renewalNow,
  });
  assert(
    renewals.length === 1 && renewals[0].outcome === "renewed",
    "The expiring lease was not renewed.",
  );
  const channelsAfterRenewal =
    await prisma.calendarNotificationChannel.findMany({
      where: { collectionId: collection.id },
      orderBy: { createdAt: "asc" },
    });
  assert(
    channelsAfterRenewal.length === 2,
    "Renewal did not preserve two auditable lease rows.",
  );
  assert(
    channelsAfterRenewal[0].status === "STOPPED" &&
      channelsAfterRenewal[1].status === "ACTIVE",
    "Renewal did not activate before retiring the old lease.",
  );
  assert(
    providerCalls.some(
      (call) => call.kind === "stop" && call.body.id === firstChannel.channelId,
    ),
    "The old provider lease was not stopped by exact identity.",
  );

  const disabled = await disableGoogleCalendarLiveUpdates({
    prisma,
    collectionId: collection.id,
    actorUserId: user.id,
    actorEmail: ownerEmail,
    requestUrl,
    now: new Date(renewalNow.getTime() + 1000),
  });
  assert(disabled.disabled === true, "Live updates did not disable.");
  const disabledCollection = await prisma.calendarCollection.findUniqueOrThrow({
    where: { id: collection.id },
  });
  assert(
    disabledCollection.liveUpdatesEnabled === false,
    "The canonical live-update setting stayed enabled.",
  );
  await expectRejection(
    receiveGoogleCalendarNotification({
      prisma,
      channelId: channelsAfterRenewal[1].channelId,
      channelToken: providerCalls.filter((call) => call.kind === "watch")[1]
        .token,
      resourceId: channelsAfterRenewal[1].resourceId,
      resourceState: "exists",
      messageNumber: "2",
      now: new Date(renewalNow.getTime() + 2000),
    }),
    "A disabled channel still accepted notifications.",
  );

  const receipts = await prisma.calendarSyncReceipt.findMany({
    where: { collectionId: collection.id },
  });
  const wakes = await prisma.calendarReconciliationWake.findMany({
    where: { collectionId: collection.id },
  });
  assert(
    receipts.some(
      (receipt) =>
        receipt.operation === "WATCH_START" && receipt.outcome === "SUCCEEDED",
    ),
    "No watch-start receipt was retained.",
  );
  assert(
    receipts.some(
      (receipt) =>
        receipt.operation === "WATCH_NOTIFICATION" &&
        receipt.outcome === "SUCCEEDED",
    ),
    "No verified notification receipt was retained.",
  );
  assert(
    receipts.some(
      (receipt) =>
        receipt.operation === "WATCH_NOTIFICATION" &&
        receipt.outcome === "SKIPPED",
    ),
    "No replay-skip receipt was retained.",
  );
  assert(
    receipts.some((receipt) => receipt.operation === "WATCH_STOP"),
    "No watch-stop receipt was retained.",
  );
  assert(
    wakes.every((wake) => wake.activeKey === null || wake.status === "QUEUED"),
    "A terminal wake retained its active deduplication key.",
  );
  assert(
    !JSON.stringify(receipts).includes(watchCall.token),
    "A raw notification token leaked into receipts.",
  );
  assert(
    providerCalls
      .filter((call) => call.kind === "events")
      .every(
        (call) =>
          call.fields ===
          "items(id,etag,status,updated,extendedProperties/private),nextPageToken,nextSyncToken",
      ),
    "A reconciliation read requested provider content.",
  );

  operation = {
    activation: { channelStatus: firstChannel.status, fullSync: true },
    notification: {
      queued: notification.queued,
      replaySkipped: !duplicate.queued,
      conflictCount: 1,
    },
    backstop: { queued: true, reconciled: true },
    renewal: {
      rows: channelsAfterRenewal.length,
      oldStatus: channelsAfterRenewal[0].status,
      newStatus: channelsAfterRenewal[1].status,
    },
    disabled: disabledCollection.liveUpdatesEnabled === false,
    provider: {
      watchCalls: providerCalls.filter((call) => call.kind === "watch").length,
      stopCalls: providerCalls.filter((call) => call.kind === "stop").length,
      contentImported: false,
    },
  };
} finally {
  globalThis.fetch = originalFetch;
  cleanup = await cleanupFixture().catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  await prisma.$disconnect();
}

assert(
  cleanup?.ok === true,
  `Disposable Calendar push cleanup failed: ${cleanup?.error || "unknown"}`,
);
assert(operation, "Calendar push operation did not complete.");
process.stdout.write(
  `${JSON.stringify({ ok: true, operation, cleanup }, null, 2)}\n`,
);

async function cleanupFixture() {
  if (fixture.connectionId)
    await prisma.calendarConnection.deleteMany({
      where: { id: fixture.connectionId },
    });
  if (fixture.userId)
    await prisma.user.deleteMany({ where: { id: fixture.userId } });
  const [connections, collections, channels, wakes, users] = await Promise.all([
    prisma.calendarConnection.count({
      where: { providerAccountKey: `${prefix}-account` },
    }),
    prisma.calendarCollection.count({
      where: { id: fixture.collectionId || "missing" },
    }),
    prisma.calendarNotificationChannel.count({
      where: { collectionId: fixture.collectionId || "missing" },
    }),
    prisma.calendarReconciliationWake.count({
      where: { collectionId: fixture.collectionId || "missing" },
    }),
    prisma.user.count({ where: { primaryEmail: ownerEmail } }),
  ]);
  return {
    ok: [connections, collections, channels, wakes, users].every(
      (count) => count === 0,
    ),
    counts: { connections, collections, channels, wakes, users },
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function expectRejection(promise, message) {
  let rejected = false;
  try {
    await promise;
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLoopbackHost(hostname, label) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  assert(
    ["127.0.0.1", "localhost", "::1"].includes(normalized),
    `${label} must use a loopback host.`,
  );
}
