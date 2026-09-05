import type { TimelineClip, TimelineState } from "@high-ground/quipsly-domain";
import { EPISODE_ROOM_TIMELINE_SOURCE } from "@/lib/episode-room/episode-room-contract";
import { QUIPSLY_TIMELINE_COLORS } from "@/lib/quipsly-palette";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeSharedWatchClip(value: unknown): TimelineClip | null {
  const row = record(value);
  if (row.generatedFrom !== EPISODE_ROOM_TIMELINE_SOURCE) return null;
  const recordingSync = record(row.recordingSync);
  const id = text(row.id);
  const assetId = text(row.assetId);
  const trackId = text(row.trackId);
  const kind = row.kind === "audio" ? "audio" : row.kind === "video" ? "video" : null;
  const startIn = finiteNumber(row.startIn);
  const duration = finiteNumber(row.duration);
  const sourceStart = finiteNumber(row.sourceStart);
  const sourceEnd = finiteNumber(row.sourceEnd);
  const episodeRoomSessionId = text(recordingSync.episodeRoomSessionId);
  const watchSegmentId = text(recordingSync.watchSegmentId);
  const startReceiptId = text(recordingSync.startReceiptId);
  const endReceiptId = text(recordingSync.endReceiptId);
  const watchedAt = text(recordingSync.watchedAt);

  if (
    !id || !assetId || !trackId || !kind
    || startIn === undefined || startIn < 0
    || duration === undefined || duration < 0.05
    || sourceStart === undefined || sourceStart < 0
    || sourceEnd === undefined || sourceEnd < sourceStart
    || !episodeRoomSessionId || !watchSegmentId
    || !startReceiptId || !endReceiptId || !watchedAt
  ) return null;

  const recordingRoomId = text(recordingSync.recordingRoomId);
  const recordingStartedAt = text(recordingSync.recordingStartedAt);
  return {
    id,
    assetId,
    trackId,
    kind,
    startIn,
    duration,
    sourceStart,
    sourceEnd,
    name: text(row.name) || "Watched clip",
    color: text(row.color) || (kind === "audio"
      ? QUIPSLY_TIMELINE_COLORS.watchedAudio
      : QUIPSLY_TIMELINE_COLORS.watchedVideo),
    generatedFrom: EPISODE_ROOM_TIMELINE_SOURCE,
    recordingSync: {
      episodeRoomSessionId,
      watchSegmentId,
      startReceiptId,
      endReceiptId,
      watchedAt,
      ...(recordingRoomId ? { recordingRoomId } : {}),
      ...(recordingStartedAt ? { recordingStartedAt } : {}),
    },
  };
}

function isSharedWatchMaterialization(clip: TimelineClip) {
  return clip.generatedFrom === EPISODE_ROOM_TIMELINE_SOURCE
    || clip.id.startsWith("episode-room-watch-");
}

export type SharedWatchTimelineProjection = {
  timeline: TimelineState;
  derivativeCount: number;
  authoritative: boolean;
};

/**
 * Projects the current receipt-backed Shared Watch pass into an editor view.
 * productionJson remains the canonical receipt ledger; the protected source
 * baseline is never rewritten here.
 */
export function projectSharedWatchTimeline(
  baseTimeline: TimelineState,
  productionJson: unknown,
): SharedWatchTimelineProjection {
  const production = record(productionJson);
  const episodeRoom = record(production.episodeRoom);
  const rows = Array.isArray(production.timelineClips) ? production.timelineClips : [];
  const derivatives = rows
    .map(normalizeSharedWatchClip)
    .filter((clip): clip is TimelineClip => Boolean(clip));
  const authoritative = derivatives.length > 0
    || Object.keys(record(episodeRoom.timelineSync)).length > 0;

  if (!authoritative) {
    return { timeline: baseTimeline, derivativeCount: 0, authoritative: false };
  }

  const derivativeIds = new Set<string>();
  const uniqueDerivatives = derivatives.filter((clip) => {
    if (derivativeIds.has(clip.id)) return false;
    derivativeIds.add(clip.id);
    return true;
  });
  const clips = [
    ...baseTimeline.clips.filter((clip) => !isSharedWatchMaterialization(clip)),
    ...uniqueDerivatives,
  ].sort((left, right) => left.startIn - right.startIn || left.id.localeCompare(right.id));

  return {
    timeline: { ...baseTimeline, clips },
    derivativeCount: uniqueDerivatives.length,
    authoritative: true,
  };
}
