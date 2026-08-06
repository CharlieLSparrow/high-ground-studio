import { createHash } from "node:crypto";

export type SessionEndpointQueueState = "NOT_EMPTY" | "DRAINED";

export type SessionEndpointQueueEvidence = {
  clientInstanceId: string;
  clientKind: "web" | "ios" | "macos";
  deviceLabel: string | null;
  queueRevision: bigint;
  queueState: SessionEndpointQueueState;
  localSourceCount: number;
  pendingSourceCount: number;
  failedSourceCount: number;
  observedCaptureIds: string[];
  recordingAssetIds: string[];
  latestLocalMutationAt: Date;
  reconciledAt: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function text(value: unknown, maximum = 160) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function boundedCount(value: unknown) {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(number) && number >= 0 && number <= 10_000 ? number : null;
}

function stringArray(value: unknown, options?: { uuids?: boolean }) {
  if (!Array.isArray(value) || value.length > 10_000) return null;
  const normalized = [...new Set(value.map((entry) => text(entry, 200).toLowerCase()).filter(Boolean))].sort();
  if (options?.uuids && normalized.some((entry) => !UUID.test(entry))) return null;
  return normalized;
}

function date(value: unknown) {
  const parsed = new Date(typeof value === "string" ? value : "");
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function parseSessionEndpointQueueEvidence(value: unknown): SessionEndpointQueueEvidence | null {
  const body = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const clientInstanceId = text(body.clientInstanceId, 200).toLowerCase();
  const clientKind = text(body.clientKind, 20).toLowerCase();
  const deviceLabel = text(body.deviceLabel, 160) || null;
  const queueState = text(body.queueState, 20).toUpperCase();
  const revisionText = text(body.queueRevision, 30);
  const localSourceCount = boundedCount(body.localSourceCount);
  const pendingSourceCount = boundedCount(body.pendingSourceCount);
  const failedSourceCount = boundedCount(body.failedSourceCount);
  const observedCaptureIds = stringArray(body.observedCaptureIds, { uuids: true });
  const recordingAssetIds = stringArray(body.recordingAssetIds);
  const latestLocalMutationAt = date(body.latestLocalMutationAt);
  const reconciledAt = date(body.reconciledAt);
  let queueRevision: bigint;
  try {
    queueRevision = BigInt(revisionText);
  } catch {
    return null;
  }
  if (
    !clientInstanceId
    || !/^(web|ios|macos)-[a-z0-9-]{8,180}$/.test(clientInstanceId)
    || !["web", "ios", "macos"].includes(clientKind)
    || !["NOT_EMPTY", "DRAINED"].includes(queueState)
    || queueRevision < 1n
    || localSourceCount == null
    || pendingSourceCount == null
    || failedSourceCount == null
    || observedCaptureIds == null
    || recordingAssetIds == null
    || !latestLocalMutationAt
    || !reconciledAt
    || latestLocalMutationAt.getTime() > Date.now() + 5 * 60_000
    || reconciledAt.getTime() > Date.now() + 5 * 60_000
  ) return null;
  if (pendingSourceCount + failedSourceCount > localSourceCount) return null;
  if (queueState === "DRAINED" && (pendingSourceCount !== 0 || failedSourceCount !== 0)) return null;
  if (queueState === "NOT_EMPTY" && pendingSourceCount + failedSourceCount === 0) return null;
  if (recordingAssetIds.length > localSourceCount || observedCaptureIds.length > localSourceCount) return null;
  return {
    clientInstanceId,
    clientKind: clientKind as SessionEndpointQueueEvidence["clientKind"],
    deviceLabel,
    queueRevision,
    queueState: queueState as SessionEndpointQueueState,
    localSourceCount,
    pendingSourceCount,
    failedSourceCount,
    observedCaptureIds,
    recordingAssetIds,
    latestLocalMutationAt,
    reconciledAt,
  };
}

export function sessionEndpointQueueStateSha256(evidence: SessionEndpointQueueEvidence) {
  return sha256({
    contractKind: "quipsly-endpoint-queue-state-v1",
    clientInstanceId: evidence.clientInstanceId,
    clientKind: evidence.clientKind,
    queueRevision: evidence.queueRevision.toString(),
    queueState: evidence.queueState,
    localSourceCount: evidence.localSourceCount,
    pendingSourceCount: evidence.pendingSourceCount,
    failedSourceCount: evidence.failedSourceCount,
    observedCaptureIds: evidence.observedCaptureIds,
    recordingAssetIds: evidence.recordingAssetIds,
    latestLocalMutationAt: evidence.latestLocalMutationAt.toISOString(),
  });
}

export function sessionEndpointQueueRequestSha256(input: {
  roomId: string;
  captureGroupId: string;
  participantId: string;
  actorUserId: string;
  evidence: SessionEndpointQueueEvidence;
}) {
  return sha256({
    contractKind: "quipsly-endpoint-queue-receipt-request-v1",
    roomId: input.roomId,
    captureGroupId: input.captureGroupId,
    participantId: input.participantId,
    actorUserId: input.actorUserId,
    evidence: {
      ...input.evidence,
      queueRevision: input.evidence.queueRevision.toString(),
      latestLocalMutationAt: input.evidence.latestLocalMutationAt.toISOString(),
      reconciledAt: input.evidence.reconciledAt.toISOString(),
    },
  });
}

export function serverSourceSetSha256(recordingAssetIds: string[]) {
  return sha256({
    contractKind: "quipsly-endpoint-server-source-set-v1",
    recordingAssetIds: [...new Set(recordingAssetIds.map((id) => id.toLowerCase()))].sort(),
  });
}
