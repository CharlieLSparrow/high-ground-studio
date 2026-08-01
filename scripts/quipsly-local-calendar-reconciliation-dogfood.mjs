#!/usr/bin/env node

import { randomBytes } from "node:crypto";

const enabled = process.env.QUIPSLY_LOCAL_CALENDAR_RECONCILIATION_DOGFOOD === "1";
const databaseUrl = new URL(
  process.env.QUIPSLY_LOCAL_DATABASE_URL
    || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(enabled, "Set QUIPSLY_LOCAL_CALENDAR_RECONCILIATION_DOGFOOD=1 to authorize disposable local writes.");
assertLoopbackHost(databaseUrl.hostname, "database URL");
process.env.DATABASE_URL = databaseUrl.toString();
process.env.PRISMA_PG_POOL_MAX ||= "1";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const {
  decryptGoogleCalendarSyncToken,
  encryptGoogleCalendarSyncToken,
} = await import("../apps/quipsly/src/lib/server/google-calendar-oauth.ts");
const { persistGoogleCalendarReconciliation } = await import(
  "../apps/quipsly/src/lib/server/google-calendar-reconciliation.ts"
);
const { resolveStudioProjectAccess } = await import(
  "../apps/quipsly/src/lib/server/studio-project-access.ts"
);

const prisma = getPrismaClient();
const nonce = randomBytes(5).toString("hex");
const prefix = `calendar-reconcile-dogfood-${nonce}`;
const ownerEmail = `${prefix}-owner@example.test`;
const editorEmail = `${prefix}-editor@example.test`;
const encryptionKey = Buffer.alloc(32, 41);
const fixture = { workspaceId: "", projectId: "", roomId: "", connectionId: "", collectionId: "" };
let operation = null;
let cleanup = null;

try {
  const owner = await prisma.user.create({
    data: { primaryEmail: ownerEmail, name: "Calendar reconciliation owner", emailVerified: new Date() },
  });
  const editor = await prisma.user.create({
    data: { primaryEmail: editorEmail, name: "Calendar reconciliation editor", emailVerified: new Date() },
  });
  const workspace = await prisma.studioWorkspace.create({
    data: { slug: prefix, name: "Calendar reconciliation dogfood" },
  });
  fixture.workspaceId = workspace.id;
  const project = await prisma.studioProject.create({
    data: { workspaceId: workspace.id, slug: `${prefix}-episode`, name: "Calendar reconciliation episode" },
  });
  fixture.projectId = project.id;
  await prisma.studioProjectAccessGrant.create({
    data: {
      projectId: project.id,
      email: editorEmail,
      role: "EDITOR",
      status: "ACTIVE",
      createdByUserId: owner.id,
      createdByEmail: ownerEmail,
      note: "Disposable reconciliation editor",
    },
  });
  const room = await prisma.callRoom.create({
    data: {
      projectId: project.id,
      createdByUserId: owner.id,
      purpose: "PODCAST",
      status: "PLANNED",
      provider: "local-dogfood",
      title: "Reconciliation proof recording",
      scheduledStart: new Date("2026-08-12T18:00:00.000Z"),
      scheduledEnd: new Date("2026-08-12T19:00:00.000Z"),
      metadataJson: { fixture: prefix },
    },
  });
  fixture.roomId = room.id;
  const connection = await prisma.calendarConnection.create({
    data: {
      userId: editor.id,
      provider: "GOOGLE",
      connectionKind: "USER_OAUTH",
      providerAccountKey: `${prefix}-account`,
      status: "VERIFIED",
      verifiedAt: new Date(),
      metadataJson: { fixture: prefix, providerCallsPerformed: false },
    },
  });
  fixture.connectionId = connection.id;
  const collection = await prisma.calendarCollection.create({
    data: {
      connectionId: connection.id,
      nestId: project.id,
      purpose: "PODCAST_PRODUCTION",
      displayName: "Reconciliation proof calendar",
      timezone: "America/Denver",
      providerCalendarId: `${prefix}-calendar`,
      visibility: "TEAM",
      status: "ACTIVE",
      metadataJson: { fixture: prefix },
    },
  });
  fixture.collectionId = collection.id;
  const projection = await prisma.calendarProjection.create({
    data: {
      collectionId: collection.id,
      sourceType: "CallRoom",
      sourceId: room.id,
      sourceRevision: "source-revision-1",
      providerEventId: `${prefix}-event`,
      providerEtag: '"etag-1"',
      uid: `${prefix}@quipsly.local`,
      status: "SYNCED",
      conflictState: "NONE",
      lastSyncedAt: new Date("2026-08-01T00:00:00.000Z"),
      metadataJson: {
        schema: "quipsly-session-calendar-projection-v1",
        immutableFixtureMarker: prefix,
      },
    },
  });

  const fullCursorRef = encryptGoogleCalendarSyncToken("full-sync-token", encryptionKey);
  const full = await persistGoogleCalendarReconciliation({
    prisma,
    actorUserId: editor.id,
    actorEmail: editorEmail,
    revalidateTeamWriteAccess: ({ prisma, projectSlug, actorEmail }) => resolveStudioProjectAccess({
      projectSlug,
      email: actorEmail,
      action: "write",
      prisma,
    }),
    connectionId: connection.id,
    collectionId: collection.id,
    providerCalendarId: collection.providerCalendarId,
    priorCursorRef: null,
    priorSyncToken: null,
    nextCursorRef: fullCursorRef,
    providerRead: {
      status: "SYNCED",
      mode: "FULL",
      events: [{
        id: `${prefix}-event`,
        etag: '"etag-1"',
        status: "confirmed",
        updatedAt: "2026-08-01T00:00:00.000Z",
        quipslySourceType: "CallRoom",
        quipslySourceId: room.id,
        quipslySourceRevision: "source-revision-1",
        quipslySchema: "quipsly-session-calendar-snapshot-v1",
      }],
      nextSyncToken: "full-sync-token",
      pageCount: 2,
    },
    resetFromExpiredToken: false,
    occurredAt: new Date("2026-08-01T02:00:00.000Z"),
  });
  assert(full.superseded === false && full.conflictCount === 0, "Initial full reconciliation did not converge cleanly.");
  const afterFull = await prisma.calendarSyncCursor.findUniqueOrThrow({ where: { collectionId: collection.id } });
  assert(afterFull.syncTokenRef === fullCursorRef, "Full reconciliation cursor was not persisted exactly.");
  assert(decryptGoogleCalendarSyncToken(afterFull.syncTokenRef, encryptionKey) === "full-sync-token", "Encrypted full cursor did not round-trip.");

  const incrementalCursorRef = encryptGoogleCalendarSyncToken("incremental-sync-token", encryptionKey);
  const incremental = await persistGoogleCalendarReconciliation({
    prisma,
    actorUserId: editor.id,
    actorEmail: editorEmail,
    revalidateTeamWriteAccess: ({ prisma, projectSlug, actorEmail }) => resolveStudioProjectAccess({
      projectSlug,
      email: actorEmail,
      action: "write",
      prisma,
    }),
    connectionId: connection.id,
    collectionId: collection.id,
    providerCalendarId: collection.providerCalendarId,
    priorCursorRef: fullCursorRef,
    priorSyncToken: "full-sync-token",
    nextCursorRef: incrementalCursorRef,
    providerRead: {
      status: "SYNCED",
      mode: "INCREMENTAL",
      events: [{
        id: `${prefix}-event`,
        etag: '"etag-google-edit"',
        status: "confirmed",
        updatedAt: "2026-08-01T03:00:00.000Z",
        quipslySourceType: "CallRoom",
        quipslySourceId: room.id,
        quipslySourceRevision: "source-revision-1",
        quipslySchema: "quipsly-session-calendar-snapshot-v1",
      }],
      nextSyncToken: "incremental-sync-token",
      pageCount: 1,
    },
    resetFromExpiredToken: false,
    occurredAt: new Date("2026-08-01T03:00:01.000Z"),
  });
  assert(incremental.superseded === false && incremental.conflictCount === 1, "Google-side edit did not create one conflict.");

  const staleRetry = await persistGoogleCalendarReconciliation({
    prisma,
    actorUserId: editor.id,
    actorEmail: editorEmail,
    revalidateTeamWriteAccess: ({ prisma, projectSlug, actorEmail }) => resolveStudioProjectAccess({
      projectSlug,
      email: actorEmail,
      action: "write",
      prisma,
    }),
    connectionId: connection.id,
    collectionId: collection.id,
    providerCalendarId: collection.providerCalendarId,
    priorCursorRef: fullCursorRef,
    priorSyncToken: "full-sync-token",
    nextCursorRef: encryptGoogleCalendarSyncToken("stale-retry-token", encryptionKey),
    providerRead: {
      status: "SYNCED",
      mode: "INCREMENTAL",
      events: [],
      nextSyncToken: "stale-retry-token",
      pageCount: 1,
    },
    resetFromExpiredToken: false,
    occurredAt: new Date("2026-08-01T03:00:02.000Z"),
  });
  assert(staleRetry.superseded === true, "A stale concurrent reconciliation was not rejected.");

  const savedProjection = await prisma.calendarProjection.findUniqueOrThrow({ where: { id: projection.id } });
  const savedCursor = await prisma.calendarSyncCursor.findUniqueOrThrow({ where: { collectionId: collection.id } });
  const receipts = await prisma.calendarSyncReceipt.findMany({
    where: { collectionId: collection.id },
    orderBy: { occurredAt: "asc" },
  });
  assert(savedProjection.status === "CONFLICT" && savedProjection.conflictState === "EXTERNAL_CHANGED", "Projection conflict truth was not persisted.");
  assert(savedProjection.providerEtag === '"etag-google-edit"', "Provider version readback was not persisted.");
  assert(object(savedProjection.metadataJson).immutableFixtureMarker === prefix, "Reconciliation overwrote existing projection provenance.");
  assert(savedCursor.syncTokenRef === incrementalCursorRef, "Stale retry replaced the advanced cursor.");
  assert(decryptGoogleCalendarSyncToken(savedCursor.syncTokenRef, encryptionKey) === "incremental-sync-token", "Advanced encrypted cursor did not round-trip.");
  assert(receipts.length === 3, `Expected full, event-conflict, and incremental receipts; found ${receipts.length}.`);
  assert(receipts.every((receipt) => receipt.externalMutated === false), "Provider reads claimed a Google mutation.");
  assert(receipts.filter((receipt) => receipt.operation === "READ_EVENT" && receipt.outcome === "CONFLICT").length === 1, "Expected exactly one event conflict receipt.");
  assert(!JSON.stringify(receipts).includes("full-sync-token"), "A plaintext provider cursor leaked into receipts.");
  assert(!JSON.stringify(receipts).includes(`${prefix}-event`), "A provider event identity leaked into receipts.");

  operation = {
    full: { mode: full.mode, conflictCount: full.conflictCount, encryptedCursor: fullCursorRef.startsWith("sync-v1.") },
    incremental: { mode: incremental.mode, conflictCount: incremental.conflictCount, projectionStatus: savedProjection.status },
    staleRetrySuperseded: staleRetry.superseded,
    receiptCount: receipts.length,
    providerCallsPerformed: false,
    plaintextCursorStored: savedCursor.syncTokenRef.includes("incremental-sync-token"),
    existingProjectionMetadataPreserved: object(savedProjection.metadataJson).immutableFixtureMarker === prefix,
  };
} finally {
  cleanup = await cleanupFixture().catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  await prisma.$disconnect();
}

assert(cleanup?.ok === true, `Disposable reconciliation cleanup failed: ${cleanup?.error || "unknown"}`);
assert(operation, "Calendar reconciliation operation did not complete.");
process.stdout.write(`${JSON.stringify({ ok: true, operation, cleanup }, null, 2)}\n`);

async function cleanupFixture() {
  if (fixture.connectionId) await prisma.calendarConnection.deleteMany({ where: { id: fixture.connectionId } });
  if (fixture.roomId) await prisma.callRoom.deleteMany({ where: { id: fixture.roomId } });
  if (fixture.projectId) await prisma.studioProject.deleteMany({ where: { id: fixture.projectId } });
  if (fixture.workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: fixture.workspaceId } });
  await prisma.user.deleteMany({ where: { primaryEmail: { in: [ownerEmail, editorEmail] } } });
  const connections = await prisma.calendarConnection.count({ where: { providerAccountKey: `${prefix}-account` } });
  const rooms = await prisma.callRoom.count({ where: { metadataJson: { path: ["fixture"], equals: prefix } } });
  const projects = await prisma.studioProject.count({ where: { slug: { startsWith: prefix } } });
  const workspaces = await prisma.studioWorkspace.count({ where: { slug: { startsWith: prefix } } });
  const users = await prisma.user.count({ where: { primaryEmail: { contains: prefix } } });
  const cursors = await prisma.calendarSyncCursor.count({ where: { collectionId: fixture.collectionId || "fixture-not-created" } });
  const receipts = await prisma.calendarSyncReceipt.count({ where: { collectionId: fixture.collectionId || "fixture-not-created" } });
  const remaining = { connections, rooms, projects, workspaces, users, cursors, receipts };
  return { ok: Object.values(remaining).every((count) => count === 0), remaining };
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLoopbackHost(host, label) {
  const normalized = String(host).toLowerCase();
  assert(normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1", `${label} must resolve to loopback.`);
}
