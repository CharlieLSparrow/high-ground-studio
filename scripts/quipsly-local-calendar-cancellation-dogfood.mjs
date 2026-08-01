#!/usr/bin/env node

import { randomBytes } from "node:crypto";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const enabled = process.env.QUIPSLY_LOCAL_CALENDAR_CANCELLATION_DOGFOOD === "1";
const baseUrl = new URL(process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012");
const databaseUrl = new URL(
  process.env.QUIPSLY_LOCAL_DATABASE_URL
    || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
const authEmulatorHost = String(
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
).trim();
const firebaseProjectId = "quipsly-reef";

assert(enabled, "Set QUIPSLY_LOCAL_CALENDAR_CANCELLATION_DOGFOOD=1 to authorize disposable local writes.");
assertLoopbackUrl(baseUrl, "Quipsly base URL");
assertLoopbackUrl(databaseUrl, "database URL");
assertLoopbackHost(authEmulatorHost, "Firebase Auth emulator");

process.env.DATABASE_URL = databaseUrl.toString();
process.env.PRISMA_PG_POOL_MAX ||= "1";
process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.GCLOUD_PROJECT = firebaseProjectId;
process.env.GOOGLE_CLOUD_PROJECT = firebaseProjectId;

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const nonce = randomBytes(5).toString("hex");
const prefix = `calendar-cancel-dogfood-${nonce}`;
const ownerEmail = `${prefix}-owner@example.test`;
const editorEmail = `${prefix}-editor@example.test`;
const viewerEmail = `${prefix}-viewer@example.test`;
const editorUid = `${prefix}-editor`;
const viewerUid = `${prefix}-viewer`;
const password = `Qp-${randomBytes(18).toString("base64url")}!26`;
const firebaseApp = initializeApp({ projectId: firebaseProjectId }, prefix);
const auth = getAuth(firebaseApp);

const fixture = {
  workspaceId: "",
  projectId: "",
  roomId: "",
  connectionId: "",
};
let operation = null;
let cleanup = null;

try {
  await Promise.all([
    auth.createUser({ uid: editorUid, email: editorEmail, emailVerified: true, password, displayName: "Calendar dogfood editor" }),
    auth.createUser({ uid: viewerUid, email: viewerEmail, emailVerified: true, password, displayName: "Calendar dogfood viewer" }),
  ]);
  const [editorToken, viewerToken] = await Promise.all([
    signInToEmulator(editorEmail, password),
    signInToEmulator(viewerEmail, password),
  ]);

  const [editorProvision, viewerProvision] = await Promise.all([
    requestJson(new URL("/api/calendar/connections/google", baseUrl), { headers: bearer(editorToken) }),
    requestJson(new URL("/api/calendar/connections/google", baseUrl), { headers: bearer(viewerToken) }),
  ]);
  assert(editorProvision.status === 200 && editorProvision.body?.connection === null, "Editor identity provisioning failed.");
  assert(viewerProvision.status === 200 && viewerProvision.body?.connection === null, "Viewer identity provisioning failed.");

  const [editor, viewer] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { primaryEmail: editorEmail } }),
    prisma.user.findUniqueOrThrow({ where: { primaryEmail: viewerEmail } }),
  ]);
  const owner = await prisma.user.create({
    data: { primaryEmail: ownerEmail, name: "Calendar dogfood owner", emailVerified: new Date() },
  });
  const workspace = await prisma.studioWorkspace.create({
    data: { slug: prefix, name: "Calendar cancellation dogfood" },
  });
  fixture.workspaceId = workspace.id;
  const project = await prisma.studioProject.create({
    data: { workspaceId: workspace.id, slug: `${prefix}-episode`, name: "Calendar cancellation episode" },
  });
  fixture.projectId = project.id;
  await prisma.studioProjectAccessGrant.createMany({
    data: [
      {
        projectId: project.id,
        email: editorEmail,
        role: "EDITOR",
        status: "ACTIVE",
        createdByUserId: owner.id,
        createdByEmail: ownerEmail,
        note: "Disposable Calendar editor grant",
      },
      {
        projectId: project.id,
        email: viewerEmail,
        role: "VIEWER",
        status: "ACTIVE",
        createdByUserId: owner.id,
        createdByEmail: ownerEmail,
        note: "Disposable Calendar viewer grant",
      },
    ],
  });
  const room = await prisma.callRoom.create({
    data: {
      projectId: project.id,
      createdByUserId: owner.id,
      purpose: "PODCAST",
      status: "CANCELED",
      provider: "local-dogfood",
      title: "Canceled production recording",
      scheduledStart: new Date("2026-08-10T18:00:00.000Z"),
      scheduledEnd: new Date("2026-08-10T19:00:00.000Z"),
      metadataJson: { scheduledTimezone: "America/Denver", fixture: prefix },
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
      metadataJson: { fixture: prefix, noProviderCredential: true },
    },
  });
  fixture.connectionId = connection.id;
  const collection = await prisma.calendarCollection.create({
    data: {
      connectionId: connection.id,
      nestId: project.id,
      purpose: "PODCAST_PRODUCTION",
      displayName: "Local production calendar",
      timezone: "America/Denver",
      providerCalendarId: `${prefix}-calendar`,
      visibility: "TEAM",
      status: "ACTIVE",
      metadataJson: { fixture: prefix },
    },
  });

  const viewerSelection = await requestJson(new URL("/api/calendar/connections/google", baseUrl), {
    method: "POST",
    headers: { ...bearer(viewerToken), "content-type": "application/json" },
    body: JSON.stringify({
      purpose: "PODCAST_PRODUCTION",
      projectId: project.id,
      calendarId: "unreachable-provider-calendar",
    }),
  });
  assert(viewerSelection.status === 403, `Viewer calendar selection returned HTTP ${viewerSelection.status}.`);

  const previewUrl = new URL(
    `/api/calendar/sessions/${encodeURIComponent(room.id)}/projection?collectionId=${encodeURIComponent(collection.id)}`,
    baseUrl,
  );
  const editorPreview = await requestJson(previewUrl, { headers: bearer(editorToken) });
  assert(editorPreview.status === 200, `Editor cancellation preview returned HTTP ${editorPreview.status}.`);
  assert(editorPreview.body?.preview?.action === "NOOP", "A never-projected canceled Session must preview as a local no-op.");
  assert(editorPreview.body?.preview?.snapshot?.status === "CANCELLED", "The preview did not preserve canceled source truth.");

  const mutationUrl = new URL(`/api/calendar/sessions/${encodeURIComponent(room.id)}/projection`, baseUrl);
  const viewerCancellation = await requestJson(mutationUrl, {
    method: "DELETE",
    headers: { ...bearer(viewerToken), "content-type": "application/json" },
    body: JSON.stringify({
      collectionId: collection.id,
      expectedSourceRevision: editorPreview.body.preview.sourceRevision,
      confirmCancellation: true,
    }),
  });
  assert(viewerCancellation.status === 404, `Viewer cancellation returned HTTP ${viewerCancellation.status}.`);

  const cancellationBody = {
    collectionId: collection.id,
    expectedSourceRevision: editorPreview.body.preview.sourceRevision,
    confirmCancellation: true,
  };
  const editorCancellation = await requestJson(mutationUrl, {
    method: "DELETE",
    headers: { ...bearer(editorToken), "content-type": "application/json" },
    body: JSON.stringify(cancellationBody),
  });
  assert(editorCancellation.status === 200, `Editor cancellation returned HTTP ${editorCancellation.status}.`);
  assert(editorCancellation.body?.result?.externalMutated === false, "Local absence verification must not claim a provider mutation.");
  assert(editorCancellation.body?.result?.providerAlreadyAbsent === true, "Local absence verification was not recorded.");

  const replay = await requestJson(mutationUrl, {
    method: "DELETE",
    headers: { ...bearer(editorToken), "content-type": "application/json" },
    body: JSON.stringify(cancellationBody),
  });
  assert(replay.status === 200 && replay.body?.result?.idempotentReplay === true, "Exact cancellation retry was not idempotent.");
  assert(replay.body.result.receiptId === editorCancellation.body.result.receiptId, "Exact retry did not return the original receipt.");

  const [projection, receipts] = await Promise.all([
    prisma.calendarProjection.findUniqueOrThrow({
      where: {
        collectionId_sourceType_sourceId: {
          collectionId: collection.id,
          sourceType: "CallRoom",
          sourceId: room.id,
        },
      },
    }),
    prisma.calendarSyncReceipt.findMany({
      where: { collectionId: collection.id, operation: "CANCEL_EVENT" },
      orderBy: { occurredAt: "asc" },
    }),
  ]);
  assert(projection.status === "CANCELED", "Persisted projection did not converge to CANCELED.");
  assert(projection.sourceRevision === editorPreview.body.preview.sourceRevision, "Persisted source revision drifted from the confirmed preview.");
  assert(projection.providerEventId === null && projection.providerEtag === null, "A local-only cancellation invented provider identity or version state.");
  assert(receipts.length === 1, `Expected one append-only cancellation receipt, found ${receipts.length}.`);
  assert(receipts[0].outcome === "SKIPPED" && receipts[0].externalMutated === false, "Cancellation receipt overstated provider effects.");

  operation = {
    editor: {
      previewAction: editorPreview.body.preview.action,
      cancellationStatus: editorCancellation.status,
      projectionStatus: projection.status,
      receiptOutcome: receipts[0].outcome,
      externalMutated: receipts[0].externalMutated,
      exactReplayReusedReceipt: replay.body.result.receiptId === receipts[0].id,
    },
    viewer: {
      teamCalendarSelectionStatus: viewerSelection.status,
      cancellationStatus: viewerCancellation.status,
    },
    providerCallsRequired: false,
  };
} finally {
  cleanup = await cleanupFixture().catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  await Promise.allSettled([auth.deleteUser(editorUid), auth.deleteUser(viewerUid)]);
  await deleteApp(firebaseApp);
  await prisma.$disconnect();
}

assert(cleanup?.ok === true, `Disposable Calendar cleanup failed: ${cleanup?.error || "unknown"}`);
assert(operation, "Calendar cancellation operation did not complete.");
process.stdout.write(`${JSON.stringify({ ok: true, operation, cleanup }, null, 2)}\n`);

async function cleanupFixture() {
  if (fixture.connectionId) {
    await prisma.calendarConnection.deleteMany({ where: { id: fixture.connectionId } });
  }
  if (fixture.roomId) await prisma.callRoom.deleteMany({ where: { id: fixture.roomId } });
  if (fixture.projectId) await prisma.studioProject.deleteMany({ where: { id: fixture.projectId } });
  if (fixture.workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: fixture.workspaceId } });
  await prisma.user.deleteMany({ where: { primaryEmail: { in: [ownerEmail, editorEmail, viewerEmail] } } });

  const [connections, rooms, projects, workspaces, users, prefixedWorkspaces] = await Promise.all([
    prisma.calendarConnection.count({ where: { providerAccountKey: `${prefix}-account` } }),
    prisma.callRoom.count({ where: { metadataJson: { path: ["fixture"], equals: prefix } } }),
    prisma.studioProject.count({ where: { slug: { startsWith: prefix } } }),
    prisma.studioWorkspace.count({ where: { slug: { startsWith: prefix } } }),
    prisma.user.count({ where: { primaryEmail: { contains: prefix } } }),
    prisma.studioWorkspace.count({ where: { name: "Calendar cancellation dogfood" } }),
  ]);
  const remaining = { connections, rooms, projects, workspaces, users, prefixedWorkspaces };
  return { ok: Object.values(remaining).every((count) => count === 0), remaining };
}

async function signInToEmulator(email, signInPassword) {
  const endpoint = new URL(
    "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dogfood",
    `http://${authEmulatorHost}`,
  );
  const result = await requestJson(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: signInPassword, returnSecureToken: true }),
  });
  assert(result.status === 200 && result.body?.idToken, `Firebase emulator sign-in failed for ${email}.`);
  return result.body.idToken;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLoopbackUrl(url, label) {
  assert(url.protocol === "http:" || url.protocol === "postgresql:", `${label} must use a local protocol.`);
  assertLoopbackHost(url.hostname, label);
}

function assertLoopbackHost(host, label) {
  const hostname = String(host).split(":")[0].replace(/^\[|\]$/g, "").toLowerCase();
  assert(
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1",
    `${label} must resolve to loopback.`,
  );
}
