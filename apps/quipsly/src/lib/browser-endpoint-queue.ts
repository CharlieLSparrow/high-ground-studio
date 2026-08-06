import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";

import { browserClientInstanceId } from "@/lib/browser-client-instance";
import { listBrowserSourceLedgers } from "@/lib/browser-source-vault";

export type BrowserEndpointQueueSnapshot = {
  clientInstanceId: string;
  clientKind: "web";
  deviceLabel: string;
  queueState: "NOT_EMPTY" | "DRAINED";
  localSourceCount: number;
  pendingSourceCount: number;
  failedSourceCount: number;
  observedCaptureIds: string[];
  recordingAssetIds: string[];
  latestLocalMutationAt: string;
};

const FAILURE_STATES = new Set(["failed", "held"]);

export function buildBrowserEndpointQueueSnapshot(
  ledgers: readonly BrowserSourceCaptureLedger[],
  clientInstanceId: string,
): BrowserEndpointQueueSnapshot | null {
  if (!ledgers.length) return null;
  const sorted = [...ledgers].sort((left, right) => left.captureId.localeCompare(right.captureId));
  const failedSourceCount = sorted.filter((ledger) => FAILURE_STATES.has(ledger.state)).length;
  const pendingSourceCount = sorted.filter((ledger) => ledger.state !== "verified" && !FAILURE_STATES.has(ledger.state)).length;
  const recordingAssetIds = sorted
    .map((ledger) => ledger.serverRecordingAssetId)
    .filter((id): id is string => Boolean(id))
    .sort();
  return {
    clientInstanceId,
    clientKind: "web",
    deviceLabel: sorted[0]?.sourceProfile.deviceLabel || "Quipsly Web",
    queueState: pendingSourceCount + failedSourceCount === 0 ? "DRAINED" : "NOT_EMPTY",
    localSourceCount: sorted.length,
    pendingSourceCount,
    failedSourceCount,
    observedCaptureIds: sorted.map((ledger) => ledger.captureId.toLowerCase()).sort(),
    recordingAssetIds,
    latestLocalMutationAt: sorted.reduce(
      (latest, ledger) => ledger.updatedAt > latest ? ledger.updatedAt : latest,
      sorted[0].updatedAt,
    ),
  };
}

function snapshotFingerprint(snapshot: BrowserEndpointQueueSnapshot) {
  return JSON.stringify({
    queueState: snapshot.queueState,
    localSourceCount: snapshot.localSourceCount,
    pendingSourceCount: snapshot.pendingSourceCount,
    failedSourceCount: snapshot.failedSourceCount,
    observedCaptureIds: snapshot.observedCaptureIds,
    recordingAssetIds: snapshot.recordingAssetIds,
  });
}

type PendingEndpointQueueReceipt = {
  fingerprint: string;
  queueRevision: string;
  requestId: string;
  reconciledAt: string;
};

type PublishCursor = {
  version: 2;
  acknowledgedFingerprint: string | null;
  lastRevision: string;
  pending: PendingEndpointQueueReceipt | null;
};

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function revision(value: unknown) {
  return typeof value === "string" && /^[0-9]+$/.test(value) ? value : "0";
}

function pendingReceipt(value: unknown): PendingEndpointQueueReceipt | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.fingerprint !== "string"
    || typeof entry.requestId !== "string"
    || !REQUEST_ID.test(entry.requestId)
    || typeof entry.reconciledAt !== "string"
    || revision(entry.queueRevision) === "0"
    || !Number.isFinite(new Date(entry.reconciledAt).getTime())
  ) return null;
  return {
    fingerprint: entry.fingerprint,
    queueRevision: revision(entry.queueRevision),
    requestId: entry.requestId,
    reconciledAt: entry.reconciledAt,
  };
}

function readPublishCursor(key: string): PublishCursor {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null") as Record<string, unknown> | null;
    if (value?.version === 2) {
      return {
        version: 2,
        acknowledgedFingerprint: typeof value.acknowledgedFingerprint === "string" ? value.acknowledgedFingerprint : null,
        lastRevision: revision(value.lastRevision),
        pending: pendingReceipt(value.pending),
      };
    }
    if (typeof value?.fingerprint === "string" && typeof value.queueRevision === "string") {
      return {
        version: 2,
        acknowledgedFingerprint: value.fingerprint,
        lastRevision: revision(value.queueRevision),
        pending: null,
      };
    }
  } catch {
    // Fail closed below. A lost cursor is repaired from the server before POST.
  }
  return { version: 2, acknowledgedFingerprint: null, lastRevision: "0", pending: null };
}

function persistPublishCursor(key: string, cursor: PublishCursor) {
  window.localStorage.setItem(key, JSON.stringify(cursor));
}

function largerRevision(left: string, right: string) {
  const safeLeft = revision(left);
  const safeRight = revision(right);
  return BigInt(safeLeft) > BigInt(safeRight) ? safeLeft : safeRight;
}

export async function publishBrowserEndpointQueue(input: {
  callRoomId: string;
  captureGroupId: string;
}, retriedAfterStale = false) {
  const ledgers = (await listBrowserSourceLedgers(input.callRoomId))
    .filter((ledger) => ledger.captureGroupId === input.captureGroupId);
  const snapshot = buildBrowserEndpointQueueSnapshot(ledgers, browserClientInstanceId());
  if (!snapshot) return null;
  const fingerprint = snapshotFingerprint(snapshot);
  const key = `quipsly-endpoint-queue:${input.callRoomId}:${input.captureGroupId}`;
  let cursor = readPublishCursor(key);
  if (cursor.acknowledgedFingerprint === fingerprint) return { acknowledged: true as const, unchanged: true as const };
  let pending = cursor.pending?.fingerprint === fingerprint ? cursor.pending : null;
  if (!pending) {
    const readback = await fetch(`/api/sessions/${encodeURIComponent(input.callRoomId)}/endpoint-queue`, {
      headers: { accept: "application/json" },
    });
    const readbackPacket = await readback.json().catch(() => ({}));
    if (!readback.ok || !readbackPacket?.ok) {
      throw new Error(readbackPacket?.error || "Nest could not read the latest browser recovery revision.");
    }
    const serverRevision = (readbackPacket.endpointQueues as Array<{ clientInstanceId?: string; queueRevision?: string }> | undefined)
      ?.find((queue) => queue.clientInstanceId === snapshot.clientInstanceId)?.queueRevision || "0";
    const queueRevision = (BigInt(largerRevision(cursor.lastRevision, serverRevision)) + 1n).toString();
    pending = { fingerprint, queueRevision, requestId: crypto.randomUUID(), reconciledAt: new Date().toISOString() };
    cursor = { ...cursor, lastRevision: queueRevision, pending };
    // Durable-before-network: if the response is lost, retry the exact request
    // instead of inventing a conflicting request at the same revision.
    persistPublishCursor(key, cursor);
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(input.callRoomId)}/endpoint-queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...snapshot,
      queueRevision: pending.queueRevision,
      requestId: pending.requestId,
      reconciledAt: pending.reconciledAt,
    }),
  });
  const packet = await response.json().catch(() => ({}));
  if (response.status === 409 && packet?.code === "STALE_QUEUE_REVISION" && !retriedAfterStale) {
    const latestRevision = typeof packet?.latest?.queueRevision === "string" ? packet.latest.queueRevision : cursor.lastRevision;
    persistPublishCursor(key, {
      ...cursor,
      lastRevision: largerRevision(cursor.lastRevision, latestRevision),
      pending: null,
    });
    return publishBrowserEndpointQueue(input, true);
  }
  if (!response.ok || !packet?.ok) throw new Error(packet?.error || "Nest did not acknowledge this browser recovery queue.");
  persistPublishCursor(key, {
    version: 2,
    acknowledgedFingerprint: fingerprint,
    lastRevision: pending.queueRevision,
    pending: null,
  });
  return { acknowledged: true as const, unchanged: false as const, endpointQueue: packet.endpointQueue };
}
