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
