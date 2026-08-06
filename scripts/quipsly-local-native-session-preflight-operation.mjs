#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const { deleteApp, initializeApp } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";
const ROOM_ID = "retained-coaching-follow-up-20260731";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function requireLoopbackOrigin(value, label) {
  const normalized = String(value || "").trim();
  const url = new URL(normalized.includes("://") ? normalized : `http://${normalized}`);
  assert(url.protocol === "http:", `${label} must use loopback HTTP.`);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    `${label} refuses non-loopback hosts.`,
  );
  assert(!url.username && !url.password, `${label} must not contain URL credentials.`);
  return url.origin;
}

async function authenticate(authOrigin, email, suppliedPassword = null) {
  const password = suppliedPassword || readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: email,
  });
  assert(password, `The retained local credential for ${email} is unavailable.`);
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const packet = await response.json().catch(() => null);
  assert(response.status === 200 && typeof packet?.idToken === "string", `Local auth failed for ${email}.`);
  return packet.idToken;
}

async function request(origin, token, method, body) {
  const response = await fetch(`${origin}/api/sessions/${ROOM_ID}/preflight`, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    packet: await response.json().catch(() => null),
  };
}

function nativePayload(
  requestId,
  clientReportedAt = new Date(),
  clientInstanceId = "ios-retained-operation",
  deviceLabel = "Quipsly Capture · operated iPhone simulator",
) {
  return {
    requestId,
    clientInstanceId,
    clientKind: "ios",
    deviceLabel,
    microphoneLabel: "Operated simulator microphone route",
    cameraLabel: null,
    outputLabel: "Operated simulator private output",
    cameraWanted: false,
    privateSampleDurationSeconds: 6.25,
    privateSamplePlaybackComplete: true,
    playbackDecision: "HEARD_CLEAR",
    clientReportedAt: clientReportedAt.toISOString(),
    audioEvidence: {
      state: "ready",
      rmsDbfs: -24,
      samplePeakDbfs: -8,
      peakHoldDbfs: -6,
      clippedSampleCountSinceStart: 0,
      sampleRateHz: 48_000,
      channelCount: 1,
    },
    cameraEvidence: {},
  };
}

export async function main() {
  assert(
    process.env.QUIPSLY_LOCAL_NATIVE_PREFLIGHT_OPERATION === "1",
    "Set QUIPSLY_LOCAL_NATIVE_PREFLIGHT_OPERATION=1 to run the retained local mutation.",
  );
  const origin = requireLoopbackOrigin(
    process.env.QUIPSLY_LOCAL_ORIGIN || "http://127.0.0.1:3012",
    "Native Session preflight operation",
  );
  const authOrigin = requireLoopbackOrigin(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
    "Firebase Auth emulator",
  );
  process.env.FIREBASE_AUTH_EMULATOR_HOST = new URL(authOrigin).host;
  const databaseURL = String(
    process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
  );
  const database = new URL(databaseURL);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname),
    "Native Session preflight operation refuses a non-loopback database.",
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg(databaseURL),
    log: ["error"],
  });
  const requestId = randomUUID();
  const collaboratorRequestId = randomUUID();
  const staleRequestId = randomUUID();
  const privacyUID = `native-preflight-privacy-${randomUUID()}`;
  const privacyEmail = `${privacyUID}@example.test`;
  const privacyPassword = `Qp-${randomBytes(24).toString("base64url")}!26`;
  const firebaseApp = initializeApp(
    { projectId: "quipsly-reef" },
    `native-session-preflight-${randomUUID()}`,
  );
  const firebaseAuth = getAuth(firebaseApp);
  try {
    console.error("[native-session-preflight] authenticating retained coach");
    const coachToken = await authenticate(authOrigin, COACH_EMAIL);
    console.error("[native-session-preflight] authenticating retained client collaborator");
    const clientToken = await authenticate(authOrigin, CLIENT_EMAIL);
    console.error("[native-session-preflight] creating isolated privacy outsider");
    await firebaseAuth.createUser({
      uid: privacyUID,
      email: privacyEmail,
      password: privacyPassword,
      emailVerified: true,
      displayName: "Native Preflight Privacy Outsider",
    });
    const outsiderToken = await authenticate(authOrigin, privacyEmail, privacyPassword);
    console.error("[native-session-preflight] writing current iPhone receipt");
    const currentPayload = nativePayload(requestId);
    const first = await request(origin, coachToken, "POST", currentPayload);
    assert(first.status === 201 && first.packet?.ok === true, "Nest did not create the native preflight receipt.");
    assert(first.packet?.preflight?.clientKind === "ios", "Nest lost the iPhone endpoint kind.");
    assert(first.packet?.preflight?.status === "READY", "Healthy, fully heard native evidence did not become ready.");
    assert(first.packet?.preflight?.current === true, "The current native receipt was not projected current.");
    assert(first.packet?.boundaries?.sampleBytesUploaded === false, "Nest claimed private sample upload.");
    assert(first.packet?.boundaries?.recordingStarted === false, "Preflight incorrectly started recording.");

    console.error("[native-session-preflight] writing second collaborator iPhone receipt");
    const collaboratorPayload = nativePayload(
      collaboratorRequestId,
      new Date(),
      "ios-retained-collaborator-operation",
      "Quipsly Capture · collaborator iPhone simulator",
    );
    const collaborator = await request(origin, clientToken, "POST", collaboratorPayload);
    assert(collaborator.status === 201 && collaborator.packet?.preflight?.current === true, "The second collaborator could not publish current iPhone readiness.");
    const collaboratorReadback = await request(origin, clientToken, "GET");
    assert(collaboratorReadback.status === 200 && collaboratorReadback.packet?.preflight?.requestId === collaboratorRequestId, "The second collaborator could not read back their own exact endpoint receipt.");

    console.error("[native-session-preflight] proving idempotency and conflict handling");
    const replay = await request(origin, coachToken, "POST", currentPayload);
    assert(replay.status === 200 && replay.packet?.idempotentReplay === true, "Ambiguous retry did not converge idempotently.");

    const conflictBody = { ...currentPayload };
    conflictBody.outputLabel = "Changed output under reused request";
    const conflict = await request(origin, coachToken, "POST", conflictBody);
    assert(conflict.status === 409 && conflict.packet?.code === "REQUEST_ID_CONFLICT", "Changed evidence reused a request identity.");

    console.error("[native-session-preflight] writing delayed offline receipt");
    const stale = await request(
      origin,
      coachToken,
      "POST",
      nativePayload(staleRequestId, new Date(Date.now() - 3 * 60 * 60 * 1_000)),
    );
    assert(stale.status === 201 && stale.packet?.preflight?.current === false, "A delayed offline receipt painted fresh readiness.");

    console.error("[native-session-preflight] proving actor readback and outsider denial");
    const latest = await request(origin, coachToken, "GET");
    assert(latest.status === 200 && latest.packet?.preflight?.requestId === requestId, "Actor readback did not return the latest observed setup evidence.");
    assert(JSON.stringify(latest.packet).includes("sampleBytesUploaded") && !JSON.stringify(latest.packet).includes("requestSha256"), "Private readback leaked internal request binding or omitted its no-upload boundary.");

    const outsider = await request(origin, outsiderToken, "GET");
    assert(outsider.status === 404, "An unrelated account could read the private Session preflight endpoint.");

    console.error("[native-session-preflight] reading independent PostgreSQL evidence");
    const persisted = await prisma.callParticipantPreflightReceipt.findUnique({
      where: { requestId },
    });
    const collaboratorPersisted = await prisma.callParticipantPreflightReceipt.findUnique({
      where: { requestId: collaboratorRequestId },
    });
    assert(persisted?.clientKind === "ios" && persisted?.status === "READY", "PostgreSQL did not retain the exact native readiness receipt.");
    assert(persisted?.privateSamplePlaybackComplete === true, "PostgreSQL lost full-playback evidence.");
    assert(persisted?.evidenceJson?.privateSampleBytesRetained === false, "PostgreSQL claimed private sample bytes.");
    assert(persisted?.evidenceJson?.privateSampleUploaded === false, "PostgreSQL claimed private sample upload.");
    assert(collaboratorPersisted?.clientInstanceId === "ios-retained-collaborator-operation", "PostgreSQL lost the second collaborator's endpoint identity.");
    assert(collaboratorPersisted?.actorUserId !== persisted?.actorUserId, "Two collaborators collapsed into one actor identity.");

    const result = {
      ok: true,
      localOnly: true,
      roomId: ROOM_ID,
      requestId,
      collaboratorRequestId,
      staleRequestId,
      currentStatus: first.packet.preflight.status,
      staleCurrent: stale.packet.preflight.current,
      idempotentReplay: replay.packet.idempotentReplay,
      outsiderStatus: outsider.status,
      secondCollaborator: {
        status: collaborator.packet.preflight.status,
        current: collaborator.packet.preflight.current,
        distinctActor: collaboratorPersisted.actorUserId !== persisted.actorUserId,
      },
      postgresReadback: {
        clientKind: persisted.clientKind,
        status: persisted.status,
        privateSamplePlaybackComplete: persisted.privateSamplePlaybackComplete,
        privateSampleBytesRetained: persisted.evidenceJson.privateSampleBytesRetained,
        privateSampleUploaded: persisted.evidenceJson.privateSampleUploaded,
      },
      secretsPrinted: false,
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await firebaseAuth.deleteUser(privacyUID).catch(() => undefined);
    await deleteApp(firebaseApp);
    await prisma.$disconnect();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
