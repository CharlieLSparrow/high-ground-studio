#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const ROOM_ID = "retained-coaching-follow-up-20260731";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopbackOrigin(value, label) {
  const url = new URL(String(value || ""));
  assert(url.protocol === "http:", `${label} must use loopback HTTP.`);
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    `${label} refuses non-loopback hosts.`,
  );
  assert(!url.username && !url.password, `${label} must not contain URL credentials.`);
  return url.origin;
}

function deterministicRequestId(captureId) {
  const bytes = Buffer.from(
    createHash("sha256")
      .update(`quipsly-ios-source-plan\0${captureId.toLowerCase()}`)
      .digest()
      .subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function exactReleasedBindingMatches(roomId, captureId, receipt, asset) {
  const manifest = asset?.localManifestJson && typeof asset.localManifestJson === "object"
    ? asset.localManifestJson
    : {};
  const metadata = receipt?.metadataJson && typeof receipt.metadataJson === "object"
    ? receipt.metadataJson
    : {};
  const binding = metadata.immutableUploadBinding && typeof metadata.immutableUploadBinding === "object"
    ? metadata.immutableUploadBinding
    : {};
  const scalar = (value) => value == null ? "" : String(value).trim();
  const sha256 = scalar(binding.sha256).toLowerCase();
  return manifest.exactBytesVerified === true
    && /^[a-f0-9]{64}$/.test(sha256)
    && scalar(asset.checksum).toLowerCase() === sha256
    && /^[1-9][0-9]*$/.test(scalar(binding.sizeBytes))
    && scalar(asset.byteSize) === scalar(binding.sizeBytes)
    && scalar(binding.uploadSessionId) === scalar(receipt.uploadSessionId)
    && scalar(binding.captureId).toLowerCase() === captureId.toLowerCase()
    && scalar(binding.roomId) === roomId
    && Boolean(scalar(binding.actorUserId))
    && scalar(asset.storageBucket) === scalar(binding.bucketName)
    && scalar(asset.storageObjectPath) === scalar(binding.objectName)
    && Boolean(scalar(binding.generation))
    && scalar(manifest.storageGeneration) === scalar(binding.generation);
}

async function authenticate(authOrigin) {
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: COACH_EMAIL,
  });
  assert(password, "The retained coach Keychain password is unavailable.");
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: COACH_EMAIL,
        password,
        returnSecureToken: true,
      }),
    },
  );
  const packet = await response.json().catch(() => null);
  assert(
    response.status === 200 && typeof packet?.idToken === "string",
    "The retained coach could not authenticate with the local Firebase emulator.",
  );
  return packet.idToken;
}

async function requestJson(url, token, method = "GET", body) {
  const response = await fetch(url, {
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

async function main() {
  assert(
    process.env.QUIPSLY_LOCAL_CAPTURE_SOURCE_PLAN_OPERATION === "1",
    "Set QUIPSLY_LOCAL_CAPTURE_SOURCE_PLAN_OPERATION=1 to authorize one retained local source-plan declaration.",
  );
  const appOrigin = requireLoopbackOrigin(
    process.env.QUIPSLY_LOCAL_ORIGIN || "http://127.0.0.1:3012",
    "Nest origin",
  );
  const authOrigin = requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`,
    "Firebase emulator",
  );
  const databaseURL = String(
    process.env.DATABASE_URL
      || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
  );
  const database = new URL(databaseURL);
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(database.hostname),
    "The source-plan operation refuses a non-loopback database.",
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }),
    log: ["error"],
  });
  try {
    const token = await authenticate(authOrigin);
    const route = `${appOrigin}/api/sessions/${encodeURIComponent(ROOM_ID)}/source-expectations`;
    const priorOperations = await prisma.callExpectedSource.findMany({
      where: {
        roomId: ROOM_ID,
        expectedDeviceLabel: "Quipsly Capture · retained iPhone operation",
        status: "ACTIVE",
      },
      include: { recordingAsset: true },
      orderBy: { createdAt: "asc" },
    });
    let reusableOperation = null;
    for (const expectation of priorOperations) {
      const receipt = expectation.captureId
        ? await prisma.mobileCaptureFinalizationReceipt.findFirst({
          where: {
            roomId: ROOM_ID,
            captureId: expectation.captureId,
            recordingAssetId: expectation.recordingAssetId,
            processingDisposition: "RELEASED",
          },
        })
        : null;
      if (
        expectation.captureId
        && expectation.recordingAsset
        && receipt
        && exactReleasedBindingMatches(
          ROOM_ID,
          expectation.captureId,
          receipt,
          expectation.recordingAsset,
        )
      ) {
        reusableOperation = {
          receipt,
          asset: expectation.recordingAsset,
        };
        break;
      }
      if (expectation.recordingAssetId) {
        const unbound = await requestJson(route, token, "PATCH", {
          requestId: deterministicRequestId(`cleanup-unbind-${expectation.id}`),
          expectationId: expectation.id,
          expectedRevision: expectation.revision,
          action: "UNBIND",
          reason: "Retained operation found incomplete legacy exact-byte evidence and removed the false binding.",
        });
        assert(
          unbound.status === 200 && unbound.packet?.expectation?.recordingAssetId === null,
          "The retained operation could not remove an incomplete legacy binding.",
        );
        expectation.revision = unbound.packet.expectation.revision;
      }
      const canceled = await requestJson(route, token, "PATCH", {
        requestId: deterministicRequestId(`cleanup-cancel-${expectation.id}`),
        expectationId: expectation.id,
        expectedRevision: expectation.revision,
        action: "CANCEL",
        reason: "Superseded because the legacy QA asset lacked complete exact-byte evidence.",
      });
      assert(
        canceled.status === 200 && canceled.packet?.expectation?.status === "CANCELED",
        "The retained operation could not preserve the incomplete declaration as canceled audit evidence.",
      );
    }
    const participants = await prisma.callParticipant.findMany({
      where: { roomId: ROOM_ID, accessStatus: "ACTIVE" },
      select: { id: true },
    });
    const activeParticipantIds = new Set(participants.map(({ id }) => id));
    const receipts = await prisma.mobileCaptureFinalizationReceipt.findMany({
      where: {
        roomId: ROOM_ID,
        processingDisposition: "RELEASED",
        recordingAssetId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        uploadSessionId: true,
        captureId: true,
        recordingAssetId: true,
        metadataJson: true,
      },
    });

    let candidate = reusableOperation;
    for (const receipt of receipts) {
      if (candidate) break;
      const asset = await prisma.recordingAsset.findFirst({
        where: {
          id: receipt.recordingAssetId,
          roomId: ROOM_ID,
          status: "VERIFIED",
          kind: { in: ["LOCAL_AUDIO", "LOCAL_VIDEO"] },
          sourceExpectation: null,
        },
        select: {
          id: true,
          participantId: true,
          kind: true,
          byteSize: true,
          checksum: true,
          storageBucket: true,
          storageObjectPath: true,
          localManifestJson: true,
        },
      });
      if (
        !asset
        || (asset.participantId && !activeParticipantIds.has(asset.participantId))
        || !exactReleasedBindingMatches(ROOM_ID, receipt.captureId, receipt, asset)
      ) continue;
      const existingCapturePlan = await prisma.callExpectedSource.findFirst({
        where: { roomId: ROOM_ID, captureId: receipt.captureId },
        select: { id: true },
      });
      if (!existingCapturePlan) {
        candidate = { receipt, asset };
        break;
      }
    }
    assert(
      candidate,
      "The retained Session has no released, verified, unplanned iPhone source available for this operation.",
    );

    const sourceKind = candidate.asset.kind === "LOCAL_VIDEO" ? "VIDEO" : "AUDIO";
    const requestId = deterministicRequestId(candidate.receipt.captureId);
    const payload = {
      requestId,
      participantId: candidate.asset.participantId,
      label: `Retained iPhone ${sourceKind.toLowerCase()} master · ${candidate.receipt.captureId.slice(0, 8)}`,
      sourceKind,
      retentionRole: "REQUIRED_MASTER",
      expectedClientKind: "ios",
      expectedDeviceLabel: "Quipsly Capture · retained iPhone operation",
      captureId: candidate.receipt.captureId,
      reason: "Declared from the protected iPhone source ledger before server byte verification.",
    };
    const created = await requestJson(route, token, "POST", payload);
    assert(
      [200, 201].includes(created.status) && created.packet?.ok === true,
      `Nest did not accept the retained Capture declaration (${created.status} ${String(created.packet?.code || created.packet?.error || "unknown")}).`,
    );
    assert(
      created.packet.expectation?.recordingAssetId === candidate.asset.id
        && created.packet.expectation?.revision === 2,
      "The late declaration did not bind the exact already released source.",
    );

    const replay = await requestJson(route, token, "POST", payload);
    assert(
      replay.status === 200
        && replay.packet?.idempotentReplay === true
        && replay.packet?.expectation?.id === created.packet.expectation.id,
      "The exact iPhone retry did not converge on the original plan item.",
    );

    const readback = await requestJson(route, token);
    assert(
      readback.status === 200
        && readback.packet?.expectations?.some((expectation) => (
          expectation.id === created.packet.expectation.id
          && expectation.captureId === candidate.receipt.captureId
          && expectation.recordingAssetId === candidate.asset.id
          && expectation.recordingAsset?.status === "VERIFIED"
        )),
      "The authenticated Session readback lost the exact Capture plan binding.",
    );

    const persisted = await prisma.callExpectedSource.findUnique({
      where: { id: created.packet.expectation.id },
      include: { revisions: { orderBy: { revision: "asc" } } },
    });
    assert(
      persisted?.recordingAssetId === candidate.asset.id
        && persisted?.captureId === candidate.receipt.captureId
        && persisted?.revision === 2,
      "PostgreSQL lost the exact Capture source binding.",
    );
    assert(
      persisted.revisions.length === 2
        && persisted.revisions[0].action === "CREATE"
        && persisted.revisions[1].action === "BIND",
      "PostgreSQL did not retain the append-only CREATE and BIND evidence.",
    );

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      roomId: ROOM_ID,
      requestId,
      expectationId: persisted.id,
      captureId: persisted.captureId,
      recordingAssetId: persisted.recordingAssetId,
      sourceKind,
      revision: persisted.revision,
      revisionActions: persisted.revisions.map(({ action }) => action),
      createdNow: created.status === 201,
      idempotentReplay: replay.packet.idempotentReplay,
      authenticatedReadback: true,
      secretsPrinted: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
