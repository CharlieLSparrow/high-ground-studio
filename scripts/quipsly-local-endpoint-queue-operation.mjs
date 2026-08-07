#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopback(value, label) {
  const url = new URL(String(value || ""));
  assert(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !url.username && !url.password, `${label} must be an explicit credential-free loopback URL.`);
  return url.origin;
}

async function requireTemporaryCredentialPath(value) {
  const requested = String(value || "");
  assert(requested, "Use an owner-only temporary QA credential file.");
  const [target, temporaryRoot] = await Promise.all([
    realpath(requested),
    realpath(os.tmpdir()),
  ]);
  const relative = path.relative(temporaryRoot, target);
  assert(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    "Use an owner-only credential file below the operating-system temporary directory.",
  );
  const metadata = await stat(target);
  assert(metadata.isFile() && (metadata.mode & 0o077) === 0, "The temporary QA credential file must be owner-only.");
  return target;
}

async function requestJson(url, token, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const packet = await response.json().catch(() => ({}));
  return { status: response.status, packet };
}

async function main() {
  assert(process.env.QUIPSLY_LOCAL_ENDPOINT_QUEUE_OPERATION === "1", "Set QUIPSLY_LOCAL_ENDPOINT_QUEUE_OPERATION=1 to authorize retained local endpoint receipts.");
  const appOrigin = requireLoopback(process.env.QUIPSLY_LOCAL_ORIGIN || "http://127.0.0.1:3012", "Nest origin");
  const authOrigin = requireLoopback(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`, "Firebase emulator");
  const databaseURL = new URL(process.env.DATABASE_URL || "");
  assert(["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname), "The endpoint queue operation requires loopback PostgreSQL.");
  const credentialPath = await requireTemporaryCredentialPath(process.env.QUIPSLY_LOCAL_QA_CREDENTIAL_PATH);
  const credentials = JSON.parse(await readFile(credentialPath, "utf8"));
  const signIn = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: credentials.email, password: credentials.password, returnSecureToken: true }),
  });
  const auth = await signIn.json().catch(() => ({}));
  assert(signIn.status === 200 && auth.idToken, "The retained test coach could not sign in to the local emulator.");
  credentials.password = "";

  const roomId = process.env.QUIPSLY_LOCAL_ENDPOINT_QUEUE_ROOM_ID || "retained-coaching-follow-up-20260731";
  const clientInstanceId = "web-retained-endpoint-queue-20260806";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL.toString(), max: 2 }) });
  try {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        captureGroupId: true,
        recordingAssets: {
          where: { participant: { user: { primaryEmail: credentials.email } }, kind: { not: "SERVER_MIX" } },
          select: { id: true, localManifestJson: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    assert(room, "The retained Session fixture is unavailable.");
    const capturedAssets = room.recordingAssets.map((asset) => {
      const manifest = asset.localManifestJson && typeof asset.localManifestJson === "object" && !Array.isArray(asset.localManifestJson) ? asset.localManifestJson : {};
      return { id: asset.id, captureId: typeof manifest.captureId === "string" ? manifest.captureId.toLowerCase() : null };
    }).filter((asset) => asset.captureId);
    assert(capturedAssets.length > 0, "The retained Session has no endpoint-owned sources to reconcile.");

    const now = new Date();
    const preflight = await requestJson(`${appOrigin}/api/sessions/${encodeURIComponent(room.id)}/preflight`, auth.idToken, "POST", {
      requestId: randomUUID(),
      clientInstanceId,
      clientKind: "web",
      deviceLabel: "Retained QA browser installation",
      microphoneLabel: "Retained QA source",
      outputLabel: "Retained QA headphones",
      cameraWanted: false,
      audioEvidence: { state: "ready", rmsDbfs: -20, samplePeakDbfs: -6, peakHoldDbfs: -6, clippedSampleCount: 0, sampleRateHz: 48000, channelCount: 1 },
      privateSampleDurationSeconds: 4,
      privateSamplePlaybackComplete: true,
      playbackDecision: "HEARD_CLEAR",
      testedAt: now.toISOString(),
    });
    assert([200, 201].includes(preflight.status) && preflight.packet.ok, `Preflight failed (${preflight.status}): ${preflight.packet.error || "unknown"}`);

    const latest = await prisma.callEndpointQueueReceipt.findFirst({ where: { roomId: room.id, clientInstanceId }, orderBy: { queueRevision: "desc" } });
    let revision = (latest?.queueRevision || 0n) + 1n;
    const shared = {
      clientInstanceId,
      clientKind: "web",
      deviceLabel: "Retained QA browser installation",
      latestLocalMutationAt: now.toISOString(),
    };
    const post = (body) => requestJson(`${appOrigin}/api/sessions/${encodeURIComponent(room.id)}/endpoint-queue`, auth.idToken, "POST", { requestId: randomUUID(), ...body, reconciledAt: new Date().toISOString() });
    const notEmpty = await post({
      ...shared,
      queueRevision: String(revision++),
      queueState: "NOT_EMPTY",
      localSourceCount: capturedAssets.length + 1,
      pendingSourceCount: 1,
      failedSourceCount: 0,
      observedCaptureIds: capturedAssets.map((asset) => asset.captureId),
      recordingAssetIds: capturedAssets.map((asset) => asset.id),
    });
    assert([200, 201].includes(notEmpty.status) && notEmpty.packet.ok && notEmpty.packet.safeToLeaveThisEndpoint === false, `NOT_EMPTY receipt failed (${notEmpty.status}): ${notEmpty.packet.error || "unknown"}`);
    const recoveryDigest = await requestJson(`${appOrigin}/api/mobile/capture/review-digest`, auth.idToken);
    const recoveringSession = recoveryDigest.packet.digest?.sessions?.find((session) => session.callRoomId === room.id);
    const recoveryAction = recoveryDigest.packet.digest?.finishActions?.find((action) => action.callRoomId === room.id);
    assert(recoveryDigest.status === 200 && recoveryDigest.packet.ok, `Recovery digest failed (${recoveryDigest.status}): ${recoveryDigest.packet.error || "unknown"}`);
    assert(recoveringSession?.sourceExitReadiness?.safeToLeaveAllEndpoints === false, "The iPhone digest did not project the retained endpoint as unsafe to leave.");
    assert(
      ["protect-recording-sources", "confirm-endpoint-drain"].includes(recoveryAction?.kind),
      "The iPhone Finish queue did not prioritize retained endpoint recovery.",
    );
    assert(recoveringSession.sourceExitReadiness.drainedEndpointCount === 0, "The iPhone digest did not preserve the NOT_EMPTY endpoint evidence.");
    const recoveringEndpoint = recoveringSession.sourceExitReadiness.endpointQueues?.find((queue) => queue.clientInstanceId === clientInstanceId);
    assert(recoveringEndpoint?.queueState === "NOT_EMPTY" && recoveringEndpoint.pendingSourceCount === 1, "The iPhone recovery detail did not identify the retained browser queue and its pending source.");
    assert(recoveringSession.sourceExitReadiness.missingPlannedSources?.length > 0, "The iPhone recovery detail hid the retained Session's blocking planned master.");
    const drained = await post({
      ...shared,
      queueRevision: String(revision++),
      queueState: "DRAINED",
      localSourceCount: capturedAssets.length,
      pendingSourceCount: 0,
      failedSourceCount: 0,
      observedCaptureIds: capturedAssets.map((asset) => asset.captureId),
      recordingAssetIds: capturedAssets.map((asset) => asset.id),
    });
    assert([200, 201].includes(drained.status) && drained.packet.ok && drained.packet.safeToLeaveThisEndpoint === true, `DRAINED receipt failed (${drained.status}): ${drained.packet.error || "unknown"}`);
    const readback = await requestJson(`${appOrigin}/api/sessions/${encodeURIComponent(room.id)}/endpoint-queue`, auth.idToken);
    assert(readback.status === 200 && readback.packet.endpointQueues?.some((queue) => queue.clientInstanceId === clientInstanceId && queue.queueState === "DRAINED"), "Latest drained receipt did not survive HTTP readback.");
    const drainedDigest = await requestJson(`${appOrigin}/api/mobile/capture/review-digest`, auth.idToken);
    const safeSession = drainedDigest.packet.digest?.sessions?.find((session) => session.callRoomId === room.id);
    const drainedRecoveryAction = drainedDigest.packet.digest?.finishActions?.find((action) => action.callRoomId === room.id);
    assert(drainedDigest.status === 200 && drainedDigest.packet.ok, `Drained digest failed (${drainedDigest.status}): ${drainedDigest.packet.error || "unknown"}`);
    assert(safeSession?.sourceExitReadiness?.drainedEndpointCount === 1, "The iPhone digest did not project the retained endpoint as drained.");
    assert(safeSession.sourceExitReadiness.safeToLeaveAllEndpoints === false, "The iPhone digest falsely declared a Session with an incomplete retained-source plan safe to leave.");
    assert(drainedRecoveryAction?.kind === "protect-recording-sources", "The iPhone Finish queue did not preserve the separate missing-master recovery action.");
    const drainedEndpoint = safeSession.sourceExitReadiness.endpointQueues?.find((queue) => queue.clientInstanceId === clientInstanceId);
    assert(drainedEndpoint?.queueState === "DRAINED" && drainedEndpoint.pendingSourceCount === 0, "The iPhone recovery detail did not replace the browser queue with its latest drained revision.");
    assert(safeSession.sourceExitReadiness.missingPlannedSources?.length > 0, "Draining one endpoint incorrectly erased the separate blocking planned master.");
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      roomId: room.id,
      clientInstanceId,
      capturedSourceCount: capturedAssets.length,
      notEmptyRevision: notEmpty.packet.endpointQueue.queueRevision,
      drainedRevision: drained.packet.endpointQueue.queueRevision,
      recoveryActionKind: recoveryAction.kind,
      recoveryState: recoveringSession.sourceExitReadiness.state,
      drainedState: safeSession.sourceExitReadiness.state,
      drainedEndpointCount: safeSession.sourceExitReadiness.drainedEndpointCount,
      missingPlannedSourceCount: safeSession.sourceExitReadiness.missingPlannedSources.length,
      drainedEndpointRevision: drainedEndpoint.queueRevision,
      safeToLeaveAfterDrain: safeSession.sourceExitReadiness.safeToLeaveAllEndpoints,
      secretsPrinted: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
