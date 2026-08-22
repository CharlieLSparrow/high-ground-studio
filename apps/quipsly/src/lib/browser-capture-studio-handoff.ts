export type BrowserCaptureStudioHandoffSource = {
  recordingAssetId: string;
  captureGroupId: string;
  fileName: string;
  kind: string;
  recordingStatus: string;
  exactBytesVerified: boolean;
  processingDisposition: string;
  mediaAssetId: string | null;
  playbackUrl: string | null;
  interruptionRepairRequired: boolean;
  verifiedForStudio: boolean;
  promotedToStudio: boolean;
  providerWitness: boolean;
  requiredForStudio: boolean;
};

export type BrowserCaptureStudioHandoff = {
  roomId: string;
  captureGroupId: string;
  projectSlug: string | null;
  episodeSlug: string | null;
  sourceCount: number;
  requiredSourceCount: number;
  verifiedSourceCount: number;
  verifiedRequiredSourceCount: number;
  promotedSourceCount: number;
  promotedRequiredSourceCount: number;
  providerWitnessCount: number;
  ready: boolean;
  complete: boolean;
  sources: BrowserCaptureStudioHandoffSource[];
};

export type BrowserCaptureAutoHandoffAttempt = {
  key: string;
  projectSlug: string;
  recordingAssetIds: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function sameIdentity(left: unknown, right: unknown) {
  const leftText = text(left).toLowerCase();
  const rightText = text(right).toLowerCase();
  return Boolean(leftText && rightText && leftText === rightText);
}

/**
 * Reads the canonical mobile Session projection without trusting its aggregate
 * counters. The browser recomputes the exact requested capture-group snapshot
 * from the source rows it will submit to the promotion boundary.
 */
export function browserCaptureStudioHandoff(
  payload: unknown,
  roomId: string,
  captureGroupId: string,
): BrowserCaptureStudioHandoff | null {
  const packet = record(payload);
  const sessions = Array.isArray(packet.sessions) ? packet.sessions : [];
  const session = sessions
    .map(record)
    .find((candidate) => sameIdentity(candidate.id, roomId));
  if (!session) return null;

  const sources = (Array.isArray(session.captureSources)
    ? session.captureSources
    : [])
    .map(record)
    .filter((source) => sameIdentity(source.captureGroupId, captureGroupId))
    .flatMap((source): BrowserCaptureStudioHandoffSource[] => {
      const recordingAssetId = text(source.recordingAssetId);
      if (!recordingAssetId) return [];
      const recordingStatus = text(source.recordingStatus).toUpperCase();
      const processingDisposition = text(source.processingDisposition).toUpperCase();
      const mediaAssetId = nullableText(source.mediaAssetId);
      const interruptionRepairRequired =
        source.interruptionRepairRequired === true;
      const verifiedForStudio =
        source.exactBytesVerified === true
        && recordingStatus === "VERIFIED"
        && processingDisposition === "RELEASED"
        && !interruptionRepairRequired;
      return [{
        recordingAssetId,
        captureGroupId: text(source.captureGroupId).toLowerCase(),
        fileName: text(source.fileName) || "Untitled retained source",
        kind: text(source.kind).toUpperCase() || "CAPTURE_SOURCE",
        recordingStatus: recordingStatus || "UNKNOWN",
        exactBytesVerified: source.exactBytesVerified === true,
        processingDisposition: processingDisposition || "UNKNOWN",
        mediaAssetId,
        playbackUrl: nullableText(source.playbackUrl),
        interruptionRepairRequired,
        verifiedForStudio,
        promotedToStudio: Boolean(mediaAssetId),
        providerWitness: text(source.kind).toUpperCase() === "SERVER_MIX",
        requiredForStudio: text(source.kind).toUpperCase() !== "SERVER_MIX",
      }];
    });
  const uniqueSources = [...new Map(
    sources.map((source) => [source.recordingAssetId, source]),
  ).values()].sort((left, right) => (
    left.recordingAssetId.localeCompare(right.recordingAssetId)
  ));
  const verifiedSourceCount = uniqueSources.filter(
    (source) => source.verifiedForStudio,
  ).length;
  const promotedSourceCount = uniqueSources.filter(
    (source) => source.promotedToStudio,
  ).length;
  const requiredSources = uniqueSources.filter(
    (source) => source.requiredForStudio,
  );
  const verifiedRequiredSourceCount = requiredSources.filter(
    (source) => source.verifiedForStudio,
  ).length;
  const promotedRequiredSourceCount = requiredSources.filter(
    (source) => source.promotedToStudio,
  ).length;
  const attachableSources = uniqueSources.filter(
    (source) => source.requiredForStudio || source.verifiedForStudio,
  );

  return {
    roomId: text(session.id),
    captureGroupId: text(captureGroupId).toLowerCase(),
    projectSlug: nullableText(session.projectSlug),
    episodeSlug: nullableText(session.episodeSlug),
    sourceCount: uniqueSources.length,
    requiredSourceCount: requiredSources.length,
    verifiedSourceCount,
    verifiedRequiredSourceCount,
    promotedSourceCount,
    promotedRequiredSourceCount,
    providerWitnessCount: uniqueSources.filter(
      (source) => source.providerWitness,
    ).length,
    ready:
      requiredSources.length > 0
      && verifiedRequiredSourceCount === requiredSources.length,
    complete:
      requiredSources.length > 0
      && verifiedRequiredSourceCount === requiredSources.length
      && attachableSources.every((source) => source.promotedToStudio),
    sources: uniqueSources,
  };
}

export function browserCaptureStudioReviewHref(input: {
  projectSlug?: string | null;
  episodeSlug?: string | null;
  captureGroupId?: string | null;
}) {
  const projectSlug = text(input.projectSlug);
  const episodeSlug = text(input.episodeSlug);
  const captureGroupId = text(input.captureGroupId);
  if (!projectSlug || !episodeSlug || !captureGroupId) return null;
  const query = new URLSearchParams({
    project: projectSlug,
    episode: episodeSlug,
    captureGroup: captureGroupId,
  });
  return `/editor?${query.toString()}#guided-sync-wizard`;
}

/**
 * Returns one stable, idempotent attempt identity only after the exact required
 * source set is verified and has a destination. Attaching sources is an
 * internal preparation step, not publication, so callers can perform it
 * automatically and leave manual retry for exceptional failures.
 */
export function browserCaptureAutoHandoffAttempt(
  handoff: BrowserCaptureStudioHandoff | null,
  preferredProjectSlug?: string | null,
): BrowserCaptureAutoHandoffAttempt | null {
  const projectSlug = text(preferredProjectSlug) || text(handoff?.projectSlug);
  if (!handoff?.ready || handoff.complete || !projectSlug) return null;
  const recordingAssetIds = handoff.sources
    .filter((source) => source.requiredForStudio || source.verifiedForStudio)
    .map((source) => source.recordingAssetId)
    .sort();
  if (!recordingAssetIds.length) return null;
  return {
    key: `${handoff.captureGroupId}:${recordingAssetIds.join(":")}`,
    projectSlug,
    recordingAssetIds,
  };
}
