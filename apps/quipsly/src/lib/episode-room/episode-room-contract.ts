export const EPISODE_ROOM_VERSION = "quipsly-episode-room.v1" as const;
export const EPISODE_ROOM_TIMELINE_SOURCE = "quipsly-episode-room-watch.v1" as const;

export type EpisodeRoomPlaybackStatus = "idle" | "paused" | "playing" | "ended";

export type EpisodeRoomActor = {
  userId?: string;
  email: string;
  label: string;
};

export type EpisodeRoomClip = {
  assetId: string;
  sourceId?: string;
  title: string;
  kind: "audio" | "video";
  playbackUrl: string;
  durationSeconds?: number;
  importRole?: string;
  addedAt: string;
  addedBy: string;
};

export type EpisodeRoomSession = {
  id: string;
  startedAt: string;
  startedBy: string;
  recordingRoomId?: string;
  recordingStartedAt?: string;
};

export type EpisodeRoomActiveSegment = {
  id: string;
  sessionId: string;
  clipId: string;
  startedAt: string;
  sourceStartSeconds: number;
  episodeStartSeconds: number;
  startReceiptId: string;
};

export type EpisodeRoomWatchSegment = EpisodeRoomActiveSegment & {
  endedAt: string;
  sourceEndSeconds: number;
  episodeEndSeconds: number;
  endReceiptId: string;
};

export type EpisodeRoomReceipt = {
  id: string;
  clientRequestId: string;
  revision: number;
  command: EpisodeRoomCommand["type"];
  acceptedAt: string;
  actorEmail: string;
  actorLabel: string;
  clipId?: string;
  positionSeconds: number;
  episodeSeconds?: number;
};

export type EpisodeRoomState = {
  version: typeof EPISODE_ROOM_VERSION;
  revision: number;
  status: EpisodeRoomPlaybackStatus;
  selectedClipId?: string;
  positionSeconds: number;
  effectiveAt: string;
  durationSeconds?: number;
  session?: EpisodeRoomSession;
  activeSegment?: EpisodeRoomActiveSegment;
  clips: EpisodeRoomClip[];
  segments: EpisodeRoomWatchSegment[];
  receipts: EpisodeRoomReceipt[];
  lastCommand?: EpisodeRoomReceipt;
  timelineSync?: {
    syncedAt: string;
    syncedBy: string;
    sourceRevision: number;
    segmentCount: number;
    timelineClipCount: number;
  };
};

type EpisodeRoomCommandBase = {
  clientRequestId: string;
  expectedRevision: number;
};

export type EpisodeRoomCommand =
  | (EpisodeRoomCommandBase & {
      type: "START_SESSION";
      recordingRoomId?: string;
      recordingStartedAt?: string;
    })
  | (EpisodeRoomCommandBase & {
      type: "ADD_CLIP";
      clip: EpisodeRoomClip;
    })
  | (EpisodeRoomCommandBase & {
      type: "REMOVE_CLIP";
      clipId: string;
      positionSeconds?: number;
    })
  | (EpisodeRoomCommandBase & {
      type: "SELECT_CLIP";
      clipId: string;
      positionSeconds?: number;
    })
  | (EpisodeRoomCommandBase & {
      type: "PLAY";
      positionSeconds?: number;
    })
  | (EpisodeRoomCommandBase & {
      type: "PAUSE";
      positionSeconds?: number;
    })
  | (EpisodeRoomCommandBase & {
      type: "SEEK";
      positionSeconds: number;
      fromPositionSeconds?: number;
    })
  | (EpisodeRoomCommandBase & {
      type: "ENDED";
      positionSeconds?: number;
    })
  | (EpisodeRoomCommandBase & {
      type: "SYNC_TIMELINE";
    });

export type EpisodeRoomReducerContext = {
  actor: EpisodeRoomActor;
  acceptedAt: string;
  receiptId: string;
  sessionId: string;
  segmentId: string;
};

export class EpisodeRoomRevisionConflict extends Error {
  constructor(public readonly currentRevision: number) {
    super("The Episode Room changed before this command arrived.");
  }
}

export class EpisodeRoomCommandError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalFiniteNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = finiteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegative(value: unknown, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function isoOr(value: unknown, fallback: string) {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? new Date(candidate).toISOString() : fallback;
}

function clipKind(value: unknown): EpisodeRoomClip["kind"] {
  return value === "audio" ? "audio" : "video";
}

function normalizeClip(value: unknown, now: string): EpisodeRoomClip | null {
  const row = record(value);
  const assetId = text(row.assetId);
  const playbackUrl = text(row.playbackUrl);
  if (!assetId || !playbackUrl) return null;
  return {
    assetId,
    ...(text(row.sourceId) ? { sourceId: text(row.sourceId) } : {}),
    title: text(row.title) || "Untitled watch clip",
    kind: clipKind(row.kind),
    playbackUrl,
    ...(optionalFiniteNumber(row.durationSeconds) === undefined
      ? {}
      : { durationSeconds: nonNegative(row.durationSeconds) }),
    ...(text(row.importRole) ? { importRole: text(row.importRole) } : {}),
    addedAt: isoOr(row.addedAt, now),
    addedBy: text(row.addedBy) || "Unknown collaborator",
  };
}

function normalizeSession(value: unknown, now: string): EpisodeRoomSession | undefined {
  const row = record(value);
  const id = text(row.id);
  if (!id) return undefined;
  return {
    id,
    startedAt: isoOr(row.startedAt, now),
    startedBy: text(row.startedBy) || "Unknown collaborator",
    ...(text(row.recordingRoomId) ? { recordingRoomId: text(row.recordingRoomId) } : {}),
    ...(text(row.recordingStartedAt)
      ? { recordingStartedAt: isoOr(row.recordingStartedAt, now) }
      : {}),
  };
}

function normalizeActiveSegment(value: unknown, session?: EpisodeRoomSession): EpisodeRoomActiveSegment | undefined {
  const row = record(value);
  const id = text(row.id);
  const clipId = text(row.clipId);
  const sessionId = text(row.sessionId) || session?.id || "";
  if (!id || !clipId || !sessionId) return undefined;
  return {
    id,
    sessionId,
    clipId,
    startedAt: isoOr(row.startedAt, session?.startedAt ?? new Date(0).toISOString()),
    sourceStartSeconds: nonNegative(row.sourceStartSeconds),
    episodeStartSeconds: nonNegative(row.episodeStartSeconds),
    startReceiptId: text(row.startReceiptId) || id,
  };
}

function normalizeSegment(value: unknown): EpisodeRoomWatchSegment | null {
  const row = record(value);
  const active = normalizeActiveSegment(row);
  if (!active || !text(row.endedAt)) return null;
  return {
    ...active,
    endedAt: isoOr(row.endedAt, active.startedAt),
    sourceEndSeconds: Math.max(active.sourceStartSeconds, nonNegative(row.sourceEndSeconds)),
    episodeEndSeconds: Math.max(active.episodeStartSeconds, nonNegative(row.episodeEndSeconds)),
    endReceiptId: text(row.endReceiptId) || active.id,
  };
}

function normalizeReceipt(value: unknown): EpisodeRoomReceipt | null {
  const row = record(value);
  const id = text(row.id);
  const clientRequestId = text(row.clientRequestId);
  const command = text(row.command) as EpisodeRoomCommand["type"];
  const acceptedAt = text(row.acceptedAt);
  if (!id || !clientRequestId || !command || !acceptedAt) return null;
  return {
    id,
    clientRequestId,
    revision: Math.max(0, Math.trunc(finiteNumber(row.revision))),
    command,
    acceptedAt: isoOr(acceptedAt, new Date(0).toISOString()),
    actorEmail: text(row.actorEmail),
    actorLabel: text(row.actorLabel) || text(row.actorEmail) || "Unknown collaborator",
    ...(text(row.clipId) ? { clipId: text(row.clipId) } : {}),
    positionSeconds: nonNegative(row.positionSeconds),
    ...(optionalFiniteNumber(row.episodeSeconds) === undefined
      ? {}
      : { episodeSeconds: nonNegative(row.episodeSeconds) }),
  };
}

export function createEmptyEpisodeRoomState(now = new Date().toISOString()): EpisodeRoomState {
  return {
    version: EPISODE_ROOM_VERSION,
    revision: 0,
    status: "idle",
    positionSeconds: 0,
    effectiveAt: now,
    clips: [],
    segments: [],
    receipts: [],
  };
}

export function normalizeEpisodeRoomState(value: unknown, now = new Date().toISOString()): EpisodeRoomState {
  const row = record(value);
  if (row.version !== EPISODE_ROOM_VERSION) return createEmptyEpisodeRoomState(now);
  const session = normalizeSession(row.session, now);
  const clips = Array.isArray(row.clips)
    ? row.clips.map((clip) => normalizeClip(clip, now)).filter((clip): clip is EpisodeRoomClip => Boolean(clip))
    : [];
  const selectedClipId = text(row.selectedClipId);
  const selected = clips.find((clip) => clip.assetId === selectedClipId);
  const receipts = Array.isArray(row.receipts)
    ? row.receipts.map(normalizeReceipt).filter((receipt): receipt is EpisodeRoomReceipt => Boolean(receipt)).slice(-300)
    : [];
  const segments = Array.isArray(row.segments)
    ? row.segments.map(normalizeSegment).filter((segment): segment is EpisodeRoomWatchSegment => Boolean(segment)).slice(-500)
    : [];
  const status: EpisodeRoomPlaybackStatus = row.status === "playing"
    || row.status === "paused"
    || row.status === "ended"
    ? row.status
    : "idle";
  const activeSegment = status === "playing" ? normalizeActiveSegment(row.activeSegment, session) : undefined;
  const timelineSync = record(row.timelineSync);
  const normalizedTimelineSync = text(timelineSync.syncedAt)
    ? {
        syncedAt: isoOr(timelineSync.syncedAt, now),
        syncedBy: text(timelineSync.syncedBy) || "Unknown collaborator",
        sourceRevision: Math.max(0, Math.trunc(finiteNumber(timelineSync.sourceRevision))),
        segmentCount: Math.max(0, Math.trunc(finiteNumber(timelineSync.segmentCount))),
        timelineClipCount: Math.max(0, Math.trunc(finiteNumber(timelineSync.timelineClipCount))),
      }
    : undefined;

  return {
    version: EPISODE_ROOM_VERSION,
    revision: Math.max(0, Math.trunc(finiteNumber(row.revision))),
    status: selected ? status : "idle",
    ...(selected ? { selectedClipId: selected.assetId } : {}),
    positionSeconds: selected ? nonNegative(row.positionSeconds) : 0,
    effectiveAt: isoOr(row.effectiveAt, now),
    ...(selected?.durationSeconds === undefined ? {} : { durationSeconds: selected.durationSeconds }),
    ...(session ? { session } : {}),
    ...(activeSegment ? { activeSegment } : {}),
    clips,
    segments,
    receipts,
    ...(receipts.at(-1) ? { lastCommand: receipts.at(-1) } : {}),
    ...(normalizedTimelineSync ? { timelineSync: normalizedTimelineSync } : {}),
  };
}

export function projectedEpisodeRoomPosition(
  state: Pick<EpisodeRoomState, "status" | "positionSeconds" | "effectiveAt" | "durationSeconds">,
  at = new Date().toISOString(),
) {
  const elapsed = state.status === "playing"
    ? Math.max(0, (Date.parse(at) - Date.parse(state.effectiveAt)) / 1_000)
    : 0;
  const position = Math.max(0, state.positionSeconds + elapsed);
  return state.durationSeconds === undefined ? position : Math.min(position, state.durationSeconds);
}

function episodeSeconds(session: EpisodeRoomSession | undefined, at: string) {
  if (!session) return undefined;
  const anchor = session.recordingStartedAt || session.startedAt;
  return Math.max(0, (Date.parse(at) - Date.parse(anchor)) / 1_000);
}

function selectedClip(state: EpisodeRoomState) {
  return state.clips.find((clip) => clip.assetId === state.selectedClipId);
}

function selectedPosition(state: EpisodeRoomState, commandPosition: number | undefined, at: string) {
  const supplied = optionalFiniteNumber(commandPosition);
  const position = supplied === undefined ? projectedEpisodeRoomPosition(state, at) : Math.max(0, supplied);
  const duration = selectedClip(state)?.durationSeconds;
  return duration === undefined ? position : Math.min(position, duration);
}

function closeActiveSegment(
  state: EpisodeRoomState,
  at: string,
  positionSeconds: number,
  receiptId: string,
) {
  if (!state.activeSegment) return state.segments;
  const endEpisodeSeconds = Math.max(
    state.activeSegment.episodeStartSeconds,
    episodeSeconds(state.session, at) ?? state.activeSegment.episodeStartSeconds,
  );
  const endSourceSeconds = Math.max(state.activeSegment.sourceStartSeconds, positionSeconds);
  if (
    endEpisodeSeconds - state.activeSegment.episodeStartSeconds < 0.05
    && endSourceSeconds - state.activeSegment.sourceStartSeconds < 0.05
  ) {
    return state.segments;
  }
  return [
    ...state.segments,
    {
      ...state.activeSegment,
      endedAt: at,
      sourceEndSeconds: endSourceSeconds,
      episodeEndSeconds: endEpisodeSeconds,
      endReceiptId: receiptId,
    },
  ].slice(-500);
}

function openSegment(
  state: EpisodeRoomState,
  at: string,
  positionSeconds: number,
  context: EpisodeRoomReducerContext,
): EpisodeRoomActiveSegment {
  if (!state.session || !state.selectedClipId) {
    throw new EpisodeRoomCommandError("Start the episode clock and choose a clip before playback.");
  }
  return {
    id: context.segmentId,
    sessionId: state.session.id,
    clipId: state.selectedClipId,
    startedAt: at,
    sourceStartSeconds: positionSeconds,
    episodeStartSeconds: episodeSeconds(state.session, at) ?? 0,
    startReceiptId: context.receiptId,
  };
}

function appendReceipt(
  state: EpisodeRoomState,
  command: EpisodeRoomCommand,
  context: EpisodeRoomReducerContext,
  positionSeconds: number,
) {
  const receipt: EpisodeRoomReceipt = {
    id: context.receiptId,
    clientRequestId: command.clientRequestId,
    revision: state.revision + 1,
    command: command.type,
    acceptedAt: context.acceptedAt,
    actorEmail: context.actor.email,
    actorLabel: context.actor.label,
    ...(state.selectedClipId ? { clipId: state.selectedClipId } : {}),
    positionSeconds,
    ...(episodeSeconds(state.session, context.acceptedAt) === undefined
      ? {}
      : { episodeSeconds: episodeSeconds(state.session, context.acceptedAt) }),
  };
  return {
    receipt,
    receipts: [...state.receipts, receipt].slice(-300),
  };
}

export function applyEpisodeRoomCommand(
  current: EpisodeRoomState,
  command: EpisodeRoomCommand,
  context: EpisodeRoomReducerContext,
): EpisodeRoomState {
  const state = normalizeEpisodeRoomState(current, context.acceptedAt);
  const duplicate = state.receipts.find((receipt) => receipt.clientRequestId === command.clientRequestId);
  if (duplicate) return state;
  if (command.expectedRevision !== state.revision) {
    throw new EpisodeRoomRevisionConflict(state.revision);
  }

  const at = isoOr(context.acceptedAt, new Date().toISOString());
  let next: EpisodeRoomState = { ...state };
  let position = selectedPosition(state, "positionSeconds" in command ? command.positionSeconds : undefined, at);

  if (command.type === "START_SESSION") {
    const closeAt = selectedPosition(state, undefined, at);
    next = {
      ...state,
      status: state.selectedClipId ? "paused" : "idle",
      positionSeconds: closeAt,
      effectiveAt: at,
      session: {
        id: context.sessionId,
        startedAt: at,
        startedBy: context.actor.label,
        ...(command.recordingRoomId ? { recordingRoomId: command.recordingRoomId } : {}),
        ...(command.recordingStartedAt
          ? { recordingStartedAt: isoOr(command.recordingStartedAt, at) }
          : {}),
      },
      segments: closeActiveSegment(state, at, closeAt, context.receiptId),
      activeSegment: undefined,
    };
    position = closeAt;
  } else if (command.type === "ADD_CLIP") {
    const normalized = normalizeClip(command.clip, at);
    if (!normalized) throw new EpisodeRoomCommandError("The imported media is not playable.");
    const existing = state.clips.find((clip) => clip.assetId === normalized.assetId);
    const clips = existing
      ? state.clips.map((clip) => clip.assetId === normalized.assetId ? { ...clip, ...normalized } : clip)
      : [...state.clips, normalized];
    next = {
      ...state,
      clips,
      selectedClipId: state.selectedClipId || normalized.assetId,
      status: state.selectedClipId ? state.status : "paused",
      positionSeconds: state.selectedClipId ? state.positionSeconds : 0,
      durationSeconds: state.selectedClipId
        ? state.durationSeconds
        : normalized.durationSeconds,
      effectiveAt: at,
    };
    position = next.positionSeconds;
  } else if (command.type === "REMOVE_CLIP") {
    if (!state.clips.some((clip) => clip.assetId === command.clipId)) {
      throw new EpisodeRoomCommandError("That watch clip is no longer in the Episode Room.");
    }
    const wasSelected = command.clipId === state.selectedClipId;
    const clips = state.clips.filter((clip) => clip.assetId !== command.clipId);
    const fallback = wasSelected ? clips[0] : selectedClip(state);
    const closeAt = selectedPosition(state, command.positionSeconds, at);
    next = {
      ...state,
      clips,
      ...(fallback ? { selectedClipId: fallback.assetId } : { selectedClipId: undefined }),
      status: fallback ? "paused" : "idle",
      positionSeconds: wasSelected ? 0 : closeAt,
      effectiveAt: at,
      ...(fallback?.durationSeconds === undefined
        ? { durationSeconds: undefined }
        : { durationSeconds: fallback.durationSeconds }),
      segments: wasSelected
        ? closeActiveSegment(state, at, closeAt, context.receiptId)
        : state.segments,
      activeSegment: wasSelected ? undefined : state.activeSegment,
    };
    position = next.positionSeconds;
  } else if (command.type === "SELECT_CLIP") {
    const clip = state.clips.find((candidate) => candidate.assetId === command.clipId);
    if (!clip) throw new EpisodeRoomCommandError("Choose a clip already attached to this episode.");
    const closeAt = selectedPosition(state, command.positionSeconds, at);
    next = {
      ...state,
      selectedClipId: clip.assetId,
      status: "paused",
      positionSeconds: 0,
      effectiveAt: at,
      ...(clip.durationSeconds === undefined
        ? { durationSeconds: undefined }
        : { durationSeconds: clip.durationSeconds }),
      segments: closeActiveSegment(state, at, closeAt, context.receiptId),
      activeSegment: undefined,
    };
    position = 0;
  } else if (command.type === "SYNC_TIMELINE") {
    if (state.status === "playing") {
      throw new EpisodeRoomCommandError("Pause the shared clip before syncing watched segments.");
    }
    next = {
      ...state,
      effectiveAt: at,
    };
    position = state.positionSeconds;
  } else {
    if (!state.selectedClipId) {
      throw new EpisodeRoomCommandError("Add and choose a watch clip first.");
    }
    const session = state.session ?? {
      id: context.sessionId,
      startedAt: at,
      startedBy: context.actor.label,
    };
    const stateWithSession = state.session ? state : { ...state, session };
    position = selectedPosition(stateWithSession, command.positionSeconds, at);

    if (command.type === "PLAY") {
      next = {
        ...stateWithSession,
        status: "playing",
        positionSeconds: position,
        effectiveAt: at,
        activeSegment: state.status === "playing" && state.activeSegment
          ? state.activeSegment
          : openSegment(stateWithSession, at, position, context),
      };
    } else if (command.type === "PAUSE" || command.type === "ENDED") {
      next = {
        ...stateWithSession,
        status: command.type === "ENDED" ? "ended" : "paused",
        positionSeconds: position,
        effectiveAt: at,
        segments: closeActiveSegment(stateWithSession, at, position, context.receiptId),
        activeSegment: undefined,
      };
    } else if (command.type === "SEEK") {
      const wasPlaying = state.status === "playing";
      const closePosition = selectedPosition(stateWithSession, command.fromPositionSeconds, at);
      const closedSegments = wasPlaying
        ? closeActiveSegment(stateWithSession, at, closePosition, context.receiptId)
        : state.segments;
      next = {
        ...stateWithSession,
        status: wasPlaying ? "playing" : "paused",
        positionSeconds: position,
        effectiveAt: at,
        segments: closedSegments,
        activeSegment: wasPlaying
          ? openSegment({ ...stateWithSession, activeSegment: undefined }, at, position, context)
          : undefined,
      };
    }
  }

  const { receipt, receipts } = appendReceipt(next, command, context, position);
  return {
    ...next,
    revision: state.revision + 1,
    receipts,
    lastCommand: receipt,
  };
}

export type EpisodeRoomTimelineClip = {
  id: string;
  assetId: string;
  trackId: string;
  startIn: number;
  duration: number;
  sourceStart: number;
  sourceEnd: number;
  name: string;
  color: string;
  kind: "audio" | "video";
  generatedFrom: typeof EPISODE_ROOM_TIMELINE_SOURCE;
  recordingSync: {
    episodeRoomSessionId: string;
    watchSegmentId: string;
    startReceiptId: string;
    endReceiptId: string;
    watchedAt: string;
  };
};

export function episodeRoomTimelineClips(state: EpisodeRoomState): EpisodeRoomTimelineClip[] {
  const clipsById = new Map(state.clips.map((clip) => [clip.assetId, clip]));
  return state.segments.flatMap((segment) => {
    const clip = clipsById.get(segment.clipId);
    if (!clip) return [];
    const sourceDuration = Math.max(0, segment.sourceEndSeconds - segment.sourceStartSeconds);
    const episodeDuration = Math.max(0, segment.episodeEndSeconds - segment.episodeStartSeconds);
    const duration = Math.min(sourceDuration || episodeDuration, episodeDuration || sourceDuration);
    if (duration < 0.05) return [];
    return [{
      id: `episode-room-watch-${segment.id}`,
      assetId: clip.assetId,
      trackId: clip.kind === "audio" ? "A9" : "V9",
      startIn: Number(segment.episodeStartSeconds.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      sourceStart: Number(segment.sourceStartSeconds.toFixed(3)),
      sourceEnd: Number((segment.sourceStartSeconds + duration).toFixed(3)),
      name: `Watched · ${clip.title}`,
      color: clip.kind === "audio" ? "#8f6fc2" : "#d37b43",
      kind: clip.kind,
      generatedFrom: EPISODE_ROOM_TIMELINE_SOURCE,
      recordingSync: {
        episodeRoomSessionId: segment.sessionId,
        watchSegmentId: segment.id,
        startReceiptId: segment.startReceiptId,
        endReceiptId: segment.endReceiptId,
        watchedAt: segment.startedAt,
      },
    }];
  });
}
