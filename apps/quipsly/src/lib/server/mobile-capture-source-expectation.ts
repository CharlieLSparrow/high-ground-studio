import "server-only";

import { createHash } from "node:crypto";

import {
  expectedSourceRequestSha256,
  expectedSourceSnapshot,
  recordingKindMatchesExpectation,
} from "@/lib/server/session-source-expectations";

function deterministicRequestId(value: string) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function scalar(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function exactReleasedBindingMatches(args: {
  roomId: string;
  captureId: string;
  receipt: any;
  asset: any;
}) {
  const manifest = object(args.asset.localManifestJson);
  const binding = object(object(args.receipt.metadataJson).immutableUploadBinding);
  const sha256 = scalar(binding.sha256).toLowerCase();
  const byteSize = scalar(binding.sizeBytes);
  const generation = scalar(binding.generation);
  return manifest.exactBytesVerified === true
    && /^[a-f0-9]{64}$/.test(sha256)
    && scalar(args.asset.checksum).toLowerCase() === sha256
    && /^[1-9][0-9]*$/.test(byteSize)
    && scalar(args.asset.byteSize) === byteSize
    && scalar(binding.uploadSessionId) === scalar(args.receipt.uploadSessionId)
    && scalar(binding.captureId).toLowerCase() === args.captureId.toLowerCase()
    && scalar(binding.roomId) === args.roomId
    && Boolean(scalar(binding.actorUserId))
    && Boolean(scalar(binding.bucketName))
    && scalar(args.asset.storageBucket) === scalar(binding.bucketName)
    && Boolean(scalar(binding.objectName))
    && scalar(args.asset.storageObjectPath) === scalar(binding.objectName)
    && Boolean(generation)
    && scalar(manifest.storageGeneration) === generation;
}

export async function bindVerifiedMobileCaptureExpectation(args: {
  transaction: any;
  roomId: string | null;
  participantId: string | null;
  actorUserId: string;
  captureId: string;
  uploadSessionId: string;
  sourceType: string;
  recordingAssetId: string;
}) {
  if (!args.roomId) return { state: "not-session-bound" as const };
  const candidates = await args.transaction.callExpectedSource.findMany({
    where: { roomId: args.roomId, captureId: args.captureId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  if (candidates.length === 0) return { state: "not-declared" as const };
  if (candidates.length !== 1) return { state: "ambiguous" as const };
  const current = candidates[0];
  if (current.recordingAssetId === args.recordingAssetId) {
    return { state: "already-bound" as const, expectationId: current.id };
  }
  if (current.recordingAssetId) return { state: "conflicting-binding" as const };
  const recordingKind = args.sourceType.toLowerCase() === "video" ? "LOCAL_VIDEO" : "LOCAL_AUDIO";
  if (!recordingKindMatchesExpectation(current.sourceKind, recordingKind)
      || (current.participantId && args.participantId && current.participantId !== args.participantId)) {
    return { state: "mismatch" as const };
  }

  const nextRevision = current.revision + 1;
  const requestId = deterministicRequestId(`mobile-capture-plan-bind\0${args.uploadSessionId}\0${current.id}`);
  const beforeJson = expectedSourceSnapshot(current);
  const updated = await args.transaction.callExpectedSource.update({
    where: { id: current.id },
    data: {
      recordingAssetId: args.recordingAssetId,
      revision: nextRevision,
      latestReason: "Automatically bound after exact mobile-capture byte verification and release.",
    },
  });
  const afterJson = expectedSourceSnapshot(updated);
  const requestSha256 = expectedSourceRequestSha256({
    action: "BIND",
    source: "mobile-capture-finalization",
    expectationId: current.id,
    roomId: args.roomId,
    actorUserId: args.actorUserId,
    uploadSessionId: args.uploadSessionId,
    recordingAssetId: args.recordingAssetId,
    revision: nextRevision,
  });
  await args.transaction.callExpectedSourceRevision.create({
    data: {
      requestId,
      requestSha256,
      expectationId: current.id,
      roomId: args.roomId,
      actorUserId: args.actorUserId,
      action: "BIND",
      revision: nextRevision,
      beforeJson,
      afterJson,
      reason: "Exact captureId matched a verified, released mobile source.",
    },
  });
  return { state: "bound" as const, expectationId: current.id, revision: nextRevision };
}

/// Closes the inverse race: a phone may regain network long enough to upload
/// before its independent source-plan outbox is acknowledged. A late exact
/// declaration can bind only one already released receipt and one VERIFIED
/// RecordingAsset. Multiple candidates remain visibly unresolved.
export async function bindAlreadyReleasedMobileCaptureExpectation(args: {
  transaction: any;
  roomId: string;
  actorUserId: string;
  captureId: string;
}) {
  const receipts = await args.transaction.mobileCaptureFinalizationReceipt.findMany({
    where: {
      roomId: args.roomId,
      captureId: args.captureId,
      processingDisposition: "RELEASED",
      recordingAssetId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: {
      uploadSessionId: true,
      recordingAssetId: true,
      metadataJson: true,
    },
  });
  if (receipts.length === 0) return { state: "not-uploaded" as const };
  if (receipts.length !== 1) return { state: "ambiguous-upload" as const };
  const receipt = receipts[0];
  const asset = await args.transaction.recordingAsset.findFirst({
    where: {
      id: receipt.recordingAssetId,
      roomId: args.roomId,
      status: "VERIFIED",
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
  if (!asset) return { state: "asset-not-verified" as const };
  if (!["LOCAL_AUDIO", "LOCAL_VIDEO"].includes(String(asset.kind))) {
    return { state: "asset-kind-mismatch" as const };
  }
  if (!exactReleasedBindingMatches({
    roomId: args.roomId,
    captureId: args.captureId,
    receipt,
    asset,
  })) {
    return { state: "exact-byte-evidence-incomplete" as const };
  }
  return bindVerifiedMobileCaptureExpectation({
    transaction: args.transaction,
    roomId: args.roomId,
    participantId: asset.participantId,
    actorUserId: args.actorUserId,
    captureId: args.captureId,
    uploadSessionId: receipt.uploadSessionId,
    sourceType: asset.kind === "LOCAL_VIDEO" ? "video" : "audio",
    recordingAssetId: asset.id,
  });
}
