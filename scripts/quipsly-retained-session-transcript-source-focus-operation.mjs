#!/usr/bin/env node

import { createRequire } from "node:module";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const ROOM_ID = "cmsfpfwrt000db9xld8ppuon4";
const RECORDING_ASSET_ID = "cmsi2v4l4000rlqxl78h1w8t3";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopbackURL(value, label) {
  const url = new URL(String(value || ""));
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), `${label} must use loopback.`);
  if (url.protocol === "http:") {
    assert(!url.username && !url.password, `${label} must be credential-free loopback HTTP.`);
    return url.origin;
  }
  return url.toString();
}

async function authenticate(authOrigin, password) {
  const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: OPERATOR_EMAIL, password, returnSecureToken: true }),
  });
  const body = await response.json().catch(() => null);
  assert(response.status === 200 && typeof body?.idToken === "string", "The retained media operator could not authenticate with the local emulator.");
  return body.idToken;
}

async function readPacket(baseURL, idToken, recordingAssetId) {
  const url = new URL("/api/mobile/capture/transcripts/packet", baseURL);
  url.searchParams.set("callRoomId", ROOM_ID);
  url.searchParams.set("recordingAssetId", recordingAssetId);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${idToken}`, "cache-control": "no-cache" },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_TRANSCRIPT_SOURCE_FOCUS_OPERATION === "1", "Set QUIPSLY_RETAINED_TRANSCRIPT_SOURCE_FOCUS_OPERATION=1 to inspect the retained local source-specific transcript path.");
  const baseURL = requireLoopbackURL(process.env.QUIPSLY_LOCAL_ORIGIN || "http://127.0.0.1:3012", "Nest origin");
  const authOrigin = requireLoopbackURL(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`, "Firebase emulator");
  const databaseURL = requireLoopbackURL(process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio", "PostgreSQL");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");
  const idToken = await authenticate(authOrigin, password);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }) });
  try {
    const [asset, beforeJobCount, outsideRoomAsset] = await Promise.all([
      prisma.recordingAsset.findFirst({ where: { id: RECORDING_ASSET_ID, roomId: ROOM_ID }, select: { id: true, fileName: true } }),
      prisma.transcriptJob.count({ where: { assetId: RECORDING_ASSET_ID } }),
      prisma.recordingAsset.findFirst({ where: { roomId: { not: ROOM_ID } }, select: { id: true } }),
    ]);
    assert(asset, "The retained recovered source is unavailable.");

    const first = await readPacket(baseURL, idToken, RECORDING_ASSET_ID);
    const second = await readPacket(baseURL, idToken, RECORDING_ASSET_ID);
    assert(first.status === 200 && first.body?.ok === true, `Exact-source packet read failed (${first.status}).`);
    assert(second.status === 200 && second.body?.ok === true, `Exact-source packet replay failed (${second.status}).`);
    assert(first.body?.boundaries?.sideEffectFreeRead === true, "Packet read lost its explicit side-effect-free boundary.");
    assert(first.body?.selectedRecordingAsset?.id === RECORDING_ASSET_ID, "Packet read returned a different RecordingAsset.");
    assert(first.body?.selectedRecordingAsset?.explicitlySelected === true, "Packet read did not preserve explicit source focus.");
    assert(first.body?.transcriptJob?.asset?.id === RECORDING_ASSET_ID || first.body?.transcriptJob == null, "Packet read selected a transcript from another source.");
    if (!first.body?.transcriptJob) {
      const startAction = first.body?.packet?.safeActions?.find((action) => action?.id === "repair-transcript-first");
      assert(startAction?.enabled === true && startAction?.label === "Start source-bound transcript", "A released source with no transcript job did not expose its bounded start action.");
    }
    const stableProjection = (body) => JSON.stringify({
      selectedRecordingAsset: body?.selectedRecordingAsset ?? null,
      transcriptJob: body?.transcriptJob ?? null,
      transcriptProcessingGate: body?.transcriptProcessingGate ?? null,
      packetStatus: body?.packet?.status ?? null,
      safeActions: body?.packet?.safeActions ?? [],
    });
    assert(stableProjection(first.body) === stableProjection(second.body), "Repeated source-specific packet reads were not stable.");

    let crossRoomStatus = null;
    if (outsideRoomAsset) {
      const crossRoom = await readPacket(baseURL, idToken, outsideRoomAsset.id);
      crossRoomStatus = crossRoom.status;
      assert(crossRoom.status === 404, "A source outside the requested Session crossed the room boundary.");
    }
    const afterJobCount = await prisma.transcriptJob.count({ where: { assetId: RECORDING_ASSET_ID } });
    assert(afterJobCount === beforeJobCount, "A read-only source focus created or removed a transcript job.");

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      readOnly: true,
      roomId: ROOM_ID,
      recordingAssetId: RECORDING_ASSET_ID,
      fileName: asset.fileName,
      transcriptJobCountBefore: beforeJobCount,
      transcriptJobCountAfter: afterJobCount,
      transcriptStatus: first.body?.transcriptJob?.status ?? "NOT_STARTED",
      boundedStartActionAvailable: Boolean(first.body?.packet?.safeActions?.find((action) => action?.id === "repair-transcript-first" && action?.enabled)),
      exactSourceReplayStable: true,
      crossRoomStatus,
      providerJobEnqueued: false,
      publicationStarted: false,
      secretsPrinted: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
