import type { PrismaClient } from "@prisma/client";

type Source = {
  id: string;
  participantId: string | null;
  recordedStartedAt: Date;
  localManifestJson?: unknown;
};
export type RecordingAttemptReceipt = {
  captureId: string | null;
  participantId: string;
  directive: { id: string; issuedAt: Date };
};
export type SessionRecordingAttempt<T> = {
  id: string;
  startedAt: Date;
  sources: T[];
};

function manifestText(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field.trim() : "";
}

/** One START, including its participant tracks and reconnect segments, is one
 * recording attempt. A room's capture group can outlive many Record/Stop actions. */
export function recordingShareAttempts<T extends Source>(
  sources: T[],
  receipts: RecordingAttemptReceipt[],
) {
  const byCapture = new Map<string, RecordingAttemptReceipt>();
  const orderedReceipts = [...receipts].sort(
    (a, b) => a.directive.issuedAt.getTime() - b.directive.issuedAt.getTime(),
  );
  for (const receipt of orderedReceipts) {
    const key = `${receipt.participantId}:${receipt.captureId}`;
    if (receipt.captureId && !byCapture.has(key)) byCapture.set(key, receipt);
  }
  const groups = new Map<string, SessionRecordingAttempt<T>>();
  for (const source of sources) {
    const captureId = manifestText(source.localManifestJson, "captureId").slice(0, 80);
    const receipt = byCapture.get(`${source.participantId}:${captureId}`);
    const id = receipt
      ? `start:${receipt.directive.id}`
      : `group:${manifestText(source.localManifestJson, "captureGroupId") || "unbound"}`;
    const startedAt = receipt?.directive.issuedAt || source.recordedStartedAt;
    const group = groups.get(id) || { id, startedAt, sources: [] };
    if (startedAt < group.startedAt) group.startedAt = startedAt;
    group.sources.push(source);
    groups.set(id, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime() || a.id.localeCompare(b.id),
  );
}

/** Callers authorize the room first. Receipts are then matched by room,
 * participant, capture identity, and an actual START acknowledgement. */
export async function readSessionRecordingAttempts<T extends Source>(
  prisma: Pick<PrismaClient, "callRecordingEndpointReceipt">,
  roomId: string,
  sources: T[],
) {
  const captureIds = [...new Set(sources.map(
    source => manifestText(source.localManifestJson, "captureId").slice(0, 80),
  ))].filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
  const receipts = captureIds.length
    ? await prisma.callRecordingEndpointReceipt.findMany({
        where: {
          roomId,
          captureId: { in: captureIds },
          state: "STARTED",
          directive: { roomId, action: "START" },
        },
        select: {
          captureId: true,
          participantId: true,
          directive: { select: { id: true, issuedAt: true } },
        },
      })
    : [];
  return recordingShareAttempts(sources, receipts);
}
