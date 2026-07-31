#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const ROOM_ID = process.env.QUIPSLY_PRIVACY_ROOM_ID || "local-transcript-dogfood-episode-4";
const PROJECT_SLUG = process.env.QUIPSLY_PRIVACY_PROJECT_SLUG || "quipsly-local-dogfood";
const TASK_ID = process.env.QUIPSLY_PRIVACY_TASK_ID || "transcript-task-f874d8605e8e94fdbfdfa3bb";
const GOAL_ID = process.env.QUIPSLY_PRIVACY_GOAL_ID || "transcript-goal-5e4c6fb62fc1d1636dfaabca";
const DOCUMENT_ID = process.env.QUIPSLY_PRIVACY_DOCUMENT_ID || "cms8oj49k004qz3xlid6fs329";
const SOURCE_ID = process.env.QUIPSLY_PRIVACY_SOURCE_ID || "local-transcript-source-episode-4";
const SEGMENT_ID = process.env.QUIPSLY_PRIVACY_SEGMENT_ID || "local-transcript-segment-episode-4-1";
const PRIVATE_TEXT_MARKERS = [
  "Welcome, everybody.",
  "QA Retained · Verify episode opening against transcript source",
  "QA Retained · Keep episode work source-grounded",
  "QA Retained · Episode 4 opening source note",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function requireLoopbackOrigin(value, label) {
  const url = new URL(value);
  assert(
    url.protocol === "http:"
      && loopbackHost(url.hostname)
      && !url.username
      && !url.password
      && url.pathname === "/"
      && !url.search
      && !url.hash,
    `${label} must be a credential-free loopback HTTP origin.`,
  );
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(value);
  assert(loopbackHost(url.hostname), "Retained privacy dogfood refuses non-local databases.");
  return value;
}

function confinedCredentialPath(value) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const target = path.resolve(value || path.join(temporaryRoot, "quipsly-capture-runtime-ui-smoke-credentials.json"));
  const xcodeHostBridgePath = path.resolve("/tmp/quipsly-capture-runtime-ui-smoke-credentials.json");
  if (target === xcodeHostBridgePath) return target;
  const relative = path.relative(temporaryRoot, target);
  assert(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    "The outsider credential packet must remain below the operating-system temporary directory.",
  );
  return target;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sessionCookie(setCookie) {
  return String(setCookie || "").split(";")[0].trim();
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let body = null;
  if (contentType.includes("application/json")) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return {
    response,
    status: response.status,
    contentType,
    cacheControl: response.headers.get("cache-control") || "",
    body,
  };
}

function assertPrivateMarkersAbsent(value, surface) {
  const serialized = JSON.stringify(value);
  for (const marker of [ROOM_ID, TASK_ID, GOAL_ID, DOCUMENT_ID, SOURCE_ID, SEGMENT_ID, ...PRIVATE_TEXT_MARKERS]) {
    assert(!serialized.includes(marker), `${surface} disclosed retained private marker ${marker}.`);
  }
}

async function signInOutsider(authOrigin, credentials) {
  const signIn = await jsonRequest(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        returnSecureToken: true,
      }),
    },
  );
  assert(signIn.status === 200 && signIn.body?.idToken, "Reserved outsider Firebase sign-in failed.");
  return signIn.body.idToken;
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_PRIVACY_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_PRIVACY_BASE_URL",
  );
  const authOrigin = requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || ""}`,
    "FIREBASE_AUTH_EMULATOR_HOST",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const credentialsPath = confinedCredentialPath(process.env.QUIPSLY_PRIVACY_CREDENTIALS_FILE);
  const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
  const outsiderEmail = String(credentials.email || "").trim().toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.test$/.test(outsiderEmail), "The outsider must use a reserved .test email.");
  assert(credentials.password, "The outsider credential packet has no password.");

  const idToken = await signInOutsider(authOrigin, credentials);
  const exchange = await jsonRequest(`${baseURL}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const cookie = sessionCookie(exchange.response.headers.get("set-cookie"));
  assert(
    exchange.status === 200
      && exchange.body?.user?.id
      && String(exchange.body?.user?.email || "").toLowerCase() === outsiderEmail
      && cookie.startsWith("session="),
    "Quipsly did not bind the reserved outsider to its own signed-in session.",
  );

  const authenticatedHeaders = {
    authorization: `Bearer ${idToken}`,
    cookie,
  };
  const get = (pathname) => jsonRequest(`${baseURL}${pathname}`, {
    headers: authenticatedHeaders,
    redirect: "manual",
  });

  const [sessions, today, work, context, corrections, sourceEvidence, media, researchExport] = await Promise.all([
    get("/api/mobile/capture/sessions"),
    get("/api/mobile/capture/today"),
    get("/api/mobile/capture/work"),
    get(`/api/mobile/capture/sessions/context?callRoomId=${encodeURIComponent(ROOM_ID)}`),
    get(`/api/mobile/capture/transcripts/corrections?callRoomId=${encodeURIComponent(ROOM_ID)}`),
    get(`/api/sessions/${encodeURIComponent(ROOM_ID)}/source-evidence`),
    get(`/api/ingest/media/${encodeURIComponent(SOURCE_ID)}`),
    get(`/api/research/export?project=${encodeURIComponent(PROJECT_SLUG)}`),
  ]);

  for (const [surface, result] of [["sessions", sessions], ["today", today], ["work", work]]) {
    assert(result.status === 200 && result.body?.ok === true, `${surface} did not return the outsider's bounded workspace.`);
    assertPrivateMarkersAbsent(result.body, surface);
  }
  for (const [surface, result] of [
    ["session-context", context],
    ["transcript-corrections", corrections],
    ["source-evidence", sourceEvidence],
    ["protected-media", media],
    ["research-export", researchExport],
  ]) {
    assert(result.status === 404, `${surface} must conceal retained private existence with HTTP 404.`);
    assert(
      result.cacheControl.toLowerCase().includes("private"),
      `${surface} denial must not be publicly cacheable.`,
    );
    assertPrivateMarkersAbsent(result.body, surface);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseURL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
    log: ["error"],
  });
  try {
    const outsider = await prisma.user.findUnique({
      where: { primaryEmail: outsiderEmail },
      select: { id: true, primaryEmail: true },
    });
    const project = await prisma.studioProject.findFirst({
      where: { slug: PROJECT_SLUG },
      select: { id: true },
    });
    assert(outsider?.id && project?.id, "Retained privacy database readback could not resolve its exact identities.");

    const [grantCount, participantCount, task, goal, document, segmentCount, wordCount] = await Promise.all([
      prisma.studioProjectAccessGrant.count({
        where: { projectId: project.id, email: outsiderEmail, status: "ACTIVE" },
      }),
      prisma.callParticipant.count({
        where: { roomId: ROOM_ID, userId: outsider.id },
      }),
      prisma.actionItem.findUnique({
        where: { id: TASK_ID },
        select: { id: true, assignedUserId: true, status: true, dueAt: true, sourceJson: true },
      }),
      prisma.goal.findUnique({
        where: { id: GOAL_ID },
        select: { id: true, ownerUserId: true, status: true, targetAt: true, sourceJson: true },
      }),
      prisma.studioDocument.findUnique({
        where: { id: DOCUMENT_ID },
        select: { id: true, personalOwnerUserId: true, isPrivate: true, projectionStatus: true },
      }),
      prisma.transcriptSegment.count({
        where: { transcriptJobId: "local-transcript-job-episode-4" },
      }),
      prisma.transcriptWord.count({
        where: { transcriptJobId: "local-transcript-job-episode-4" },
      }),
    ]);

    assert(grantCount === 0, "The reserved outsider unexpectedly has a project grant.");
    assert(participantCount === 0, "The reserved outsider unexpectedly participates in the retained Session.");
    assert(task?.assignedUserId && task.assignedUserId !== outsider.id && task.status === "OPEN" && !task.dueAt, "The retained private task changed or crossed owner identity.");
    assert(goal?.ownerUserId && goal.ownerUserId !== outsider.id && goal.status === "ACTIVE" && !goal.targetAt, "The retained private goal changed or crossed owner identity.");
    assert(document?.personalOwnerUserId && document.personalOwnerUserId !== outsider.id && document.isPrivate, "The retained writing document changed privacy owner.");
    assert(segmentCount === 5 && wordCount === 12, "The outsider proof changed retained transcript evidence.");

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      outsider: {
        emailSha256: sha256(outsiderEmail),
        domain: outsiderEmail.split("@")[1],
        userIdSha256: sha256(outsider.id),
      },
      retainedEvidence: {
        roomId: ROOM_ID,
        taskId: TASK_ID,
        goalId: GOAL_ID,
        documentId: DOCUMENT_ID,
        sourceId: SOURCE_ID,
        segmentId: SEGMENT_ID,
        segmentCount,
        wordCount,
        taskStatus: task.status,
        taskDueAt: task.dueAt,
        goalStatus: goal.status,
        goalTargetAt: goal.targetAt,
        documentPrivate: document.isPrivate,
        documentProjectionStatus: document.projectionStatus,
      },
      denialReadback: {
        sessions: sessions.status,
        today: today.status,
        work: work.status,
        sessionContext: context.status,
        transcriptCorrections: corrections.status,
        sourceEvidence: sourceEvidence.status,
        protectedMedia: media.status,
        researchExport: researchExport.status,
      },
      notificationBoundary: {
        taskReminderIntents:
          Array.isArray(today.body?.taskReminderIntents)
            ? today.body.taskReminderIntents.length
            : null,
        retainedTaskVisible: JSON.stringify(today.body).includes(TASK_ID),
      },
      databaseBoundary: {
        activeProjectGrants: grantCount,
        sessionParticipantRows: participantCount,
        taskOwnedByOutsider: task.assignedUserId === outsider.id,
        goalOwnedByOutsider: goal.ownerUserId === outsider.id,
        documentOwnedByOutsider: document.personalOwnerUserId === outsider.id,
      },
      externalSideEffects: false,
      credentialsPrinted: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
