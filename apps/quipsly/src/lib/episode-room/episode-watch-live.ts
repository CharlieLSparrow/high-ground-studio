import type { EpisodeRoomState } from "./episode-room-contract";

export const EPISODE_WATCH_LIVE_HINT_SCHEMA = "quipsly-episode-watch-hint.v1" as const;
export const EPISODE_WATCH_LIVE_TOPIC = "quipsly.episode-watch.authority.v1" as const;

export type EpisodeWatchLiveHint = {
  schema: typeof EPISODE_WATCH_LIVE_HINT_SCHEMA;
  projectSlug: string;
  episodeSlug: string;
  callRoomId: string;
  revision: number;
  receiptId: string;
  clientRequestId: string;
  command: string;
  acceptedAt: string;
  sentAt: string;
};

type EpisodeWatchLiveContext = {
  projectSlug: string;
  episodeSlug: string;
  callRoomId: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validIso(value: string) {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

export function episodeWatchLiveHintFromRoom(
  context: EpisodeWatchLiveContext,
  room: EpisodeRoomState,
  sentAt = new Date().toISOString(),
): EpisodeWatchLiveHint | null {
  const receipt = room.lastCommand;
  if (!receipt || receipt.revision !== room.revision) return null;
  if (!context.projectSlug || !context.episodeSlug || !context.callRoomId) return null;
  return {
    schema: EPISODE_WATCH_LIVE_HINT_SCHEMA,
    projectSlug: context.projectSlug,
    episodeSlug: context.episodeSlug,
    callRoomId: context.callRoomId,
    revision: receipt.revision,
    receiptId: receipt.id,
    clientRequestId: receipt.clientRequestId,
    command: receipt.command,
    acceptedAt: receipt.acceptedAt,
    sentAt,
  };
}

export function parseEpisodeWatchLiveHint(
  value: unknown,
  expected: EpisodeWatchLiveContext,
): EpisodeWatchLiveHint | null {
  const row = record(value);
  const revision = typeof row.revision === "number" ? row.revision : Number.NaN;
  const hint: EpisodeWatchLiveHint = {
    schema: text(row.schema) as typeof EPISODE_WATCH_LIVE_HINT_SCHEMA,
    projectSlug: text(row.projectSlug),
    episodeSlug: text(row.episodeSlug),
    callRoomId: text(row.callRoomId),
    revision,
    receiptId: text(row.receiptId),
    clientRequestId: text(row.clientRequestId),
    command: text(row.command),
    acceptedAt: text(row.acceptedAt),
    sentAt: text(row.sentAt),
  };
  if (
    hint.schema !== EPISODE_WATCH_LIVE_HINT_SCHEMA
    || hint.projectSlug !== expected.projectSlug
    || hint.episodeSlug !== expected.episodeSlug
    || hint.callRoomId !== expected.callRoomId
    || !Number.isSafeInteger(hint.revision)
    || hint.revision < 1
    || !hint.receiptId
    || !hint.clientRequestId
    || !hint.command
    || !validIso(hint.acceptedAt)
    || !validIso(hint.sentAt)
  ) return null;
  return hint;
}

export function decodeEpisodeWatchLiveHint(
  payload: Uint8Array,
  expected: EpisodeWatchLiveContext,
) {
  try {
    return parseEpisodeWatchLiveHint(
      JSON.parse(new TextDecoder().decode(payload)),
      expected,
    );
  } catch {
    return null;
  }
}
