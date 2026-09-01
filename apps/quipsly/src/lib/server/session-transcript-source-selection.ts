import { newestCoherentRecordingTake } from "./session-recording-share";

export type SessionTranscriptSourceCandidate = {
  id: string;
  participantId: string | null;
  kind: string;
  recordedStartedAt: Date;
  recordedStoppedAt?: Date | null;
  localManifestJson?: unknown;
  transcriptJobs: Array<{ id: string; createdAt: Date }>;
};

/**
 * Chooses the current participant-owned transcript lanes. A declared capture
 * group outranks wall-clock clustering. Sequential crash/reconnect segments
 * remain separate lanes; simultaneous device alternatives remain one lane.
 * Legacy sources with no group retain the bounded coherent-take fallback.
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

  return participantIds.flatMap((participantId) => {
    const participantSources = take.filter((row) => row.participantId === participantId);
    if (!participantSources.length) return [null];
    const anchorSource = participantSources.find((row) => row.id === input.anchorRecordingAssetId);
    const audioSources = participantSources.filter((row) => row.kind === "LOCAL_AUDIO");
    const candidates = anchorSource
      ? participantSources.filter((row) => row.kind === anchorSource.kind)
      : audioSources.length ? audioSources : participantSources;
    const groups: T[][] = [];
    for (const source of [...candidates].sort((left, right) =>
      left.recordedStartedAt.getTime() - right.recordedStartedAt.getTime() || left.id.localeCompare(right.id),
    )) {
      const latest = groups.at(-1);
      const latestEnd = latest?.every((item) =>
        item.recordedStoppedAt instanceof Date && item.recordedStoppedAt > item.recordedStartedAt,
      )
        ? Math.max(...latest.map((item) => item.recordedStoppedAt!.getTime()))
        : (latest?.at(-1)?.recordedStartedAt.getTime() ?? Number.NEGATIVE_INFINITY) + 30_000;
      if (!latest || source.recordedStartedAt.getTime() >= (latestEnd ?? Number.NEGATIVE_INFINITY)) {
        groups.push([source]);
      } else {
        latest.push(source);
      }
    }
    return groups.map((group) => group.sort((left, right) => {
      const leftDuration = left.recordedStoppedAt instanceof Date
        ? left.recordedStoppedAt.getTime() - left.recordedStartedAt.getTime()
        : 0;
      const rightDuration = right.recordedStoppedAt instanceof Date
        ? right.recordedStoppedAt.getTime() - right.recordedStartedAt.getTime()
        : 0;
      return rightDuration - leftDuration
        || (left.id === input.anchorRecordingAssetId ? -1 : right.id === input.anchorRecordingAssetId ? 1 : 0)
        || kindPriority(left.kind) - kindPriority(right.kind)
        || right.transcriptJobs[0]!.createdAt.getTime() - left.transcriptJobs[0]!.createdAt.getTime()
        || left.id.localeCompare(right.id);
    })[0]!);
  });
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
