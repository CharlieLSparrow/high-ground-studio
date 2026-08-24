import { newestCoherentRecordingTake } from "./session-recording-share";

export type SessionTranscriptSourceCandidate = {
  id: string;
  participantId: string | null;
  kind: string;
  recordedStartedAt: Date;
  localManifestJson?: unknown;
  transcriptJobs: Array<{ id: string; createdAt: Date }>;
};

/**
 * Chooses one current participant-owned transcript source per participant.
 * A declared capture group outranks wall-clock clustering. Legacy sources with
 * no group retain the bounded coherent-take fallback.
 */
export function selectSessionTranscriptSources<T extends SessionTranscriptSourceCandidate>(input: {
  rows: T[];
  participantIds?: string[];
  anchorRecordingAssetId?: string | null;
}): Array<T | null> {
  const rows = input.rows.filter((row) => row.participantId && row.transcriptJobs[0]?.id);
  const anchor = rows.find((row) => row.id === input.anchorRecordingAssetId) ?? null;
  const anchorGroupId = captureGroupId(anchor?.localManifestJson);
  const take = anchorGroupId
    ? rows.filter((row) => captureGroupId(row.localManifestJson) === anchorGroupId)
    : anchor
      ? newestCoherentRecordingTake(rows.filter((row) => (
          Math.abs(row.recordedStartedAt.getTime() - anchor.recordedStartedAt.getTime()) <= 30_000
        )))
      : newestCoherentRecordingTake(rows);
  const participantIds = input.participantIds?.length
    ? [...new Set(input.participantIds.filter(Boolean))]
    : [...new Set(take.map((row) => row.participantId).filter((value): value is string => Boolean(value)))];

  return participantIds.map((participantId) => take
    .filter((row) => row.participantId === participantId)
    .sort((left, right) => {
      if (left.id === input.anchorRecordingAssetId) return -1;
      if (right.id === input.anchorRecordingAssetId) return 1;
      return kindPriority(left.kind) - kindPriority(right.kind)
        || right.transcriptJobs[0]!.createdAt.getTime() - left.transcriptJobs[0]!.createdAt.getTime()
        || left.id.localeCompare(right.id);
    })[0] ?? null);
}

export function transcriptSourceCaptureGroupId(value: unknown) {
  return captureGroupId(value);
}

function captureGroupId(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return typeof row.captureGroupId === "string" ? row.captureGroupId.trim() : "";
}

function kindPriority(kind: string) {
  return kind === "LOCAL_AUDIO" ? 0 : kind === "LOCAL_VIDEO" ? 1 : 2;
}
