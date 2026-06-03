import { useReducer } from "react";

export const TRACK_PREFIX_VIDEO = "V" as const;
export const TRACK_PREFIX_AUDIO = "A" as const;

export const DEFAULT_VIDEO_TRACK = `${TRACK_PREFIX_VIDEO}1`;
export const DEFAULT_AUDIO_TRACK = `${TRACK_PREFIX_AUDIO}1`;
export type TimelineTrackKind = "audio" | "video";

type TrackPrefix = typeof TRACK_PREFIX_VIDEO | typeof TRACK_PREFIX_AUDIO;

const TRACK_ID_PATTERN = /^[VA]\d+(?:\.\d+)?$/i;
const LEGACY_NUMERIC_TRACK_PATTERN = /^\d+(?:\.\d+)?$/;
const MIN_TIMELINE_CLIP_SECONDS = 0.05;

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampDuration(value: number) {
  return Math.max(MIN_TIMELINE_CLIP_SECONDS, value);
}

function overlapsInterval(clipStart: number, clipEnd: number, blockStart: number, blockEnd: number) {
  return clipStart < blockEnd && clipEnd > blockStart;
}

function sanitizeTimelineClip(clip: TimelineClip, fallbackTrackId: string): TimelineClip {
  const safeTrackKind = trackKindFromTrackId(fallbackTrackId);
  const safeTrackId = normalizeTrackId(clip.trackId, fallbackTrackId, safeTrackKind);
  const explicitKind = clip.kind === "audio" || clip.kind === "video" ? clip.kind : undefined;
  const safeKind = explicitKind ?? trackKindFromTrackId(safeTrackId);
  const safeStartIn = Math.max(0, toFiniteNumber(clip.startIn, 0));
  const safeDuration = clampDuration(toFiniteNumber(clip.duration, MIN_TIMELINE_CLIP_SECONDS));
  const safeSourceStart = Math.max(0, toFiniteNumber(clip.sourceStart, 0));
  const explicitSourceEnd = toFiniteNumber(clip.sourceEnd, safeSourceStart + safeDuration);
  const safeSourceEnd = Math.max(safeSourceStart, explicitSourceEnd);

  return {
    ...clip,
    id: clip.id || `clip-${Math.floor(Math.random() * 1_000_000)}`,
    trackId: safeTrackId,
    startIn: safeStartIn,
    duration: safeDuration,
    sourceStart: safeSourceStart,
    sourceEnd: safeSourceEnd,
    kind: safeKind,
    name: (clip.name ?? "").trim() || "Clip",
    color: clip.color || "#2563eb",
    assetId: clip.assetId || "",
  };
}

function sanitizeTranscriptBlock(block: TranscriptBlock) {
  return {
    ...block,
    id: block.id || `block-${Math.floor(Math.random() * 1_000_000)}`,
    time: Math.max(0, toFiniteNumber(block.time, 0)),
    duration: Math.max(0.1, toFiniteNumber(block.duration, 1)),
    text: (block.text ?? "").trim(),
    deleted: Boolean(block.deleted),
    alert: block.alert ?? null,
  } satisfies TranscriptBlock;
}

function makeSplitTimelineId(clipId: string, suffix: string) {
  return `${clipId}_${suffix}`;
}

export function trackKindFromTrackId(value: unknown): TimelineTrackKind {
  return isVideoTrackId(value) ? "video" : "audio";
}

export function normalizeTrackIdForKind(value: unknown, kind: TimelineTrackKind, fallbackIndex = 1) {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!raw) {
    return `${kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO}${Math.max(1, Math.floor(fallbackIndex))}`;
  }

  const normalized = raw.toUpperCase();
  if (TRACK_ID_PATTERN.test(normalized)) return normalized;
  if (LEGACY_NUMERIC_TRACK_PATTERN.test(normalized)) {
    return `${kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO}${normalized}`;
  }

  return `${kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO}${Math.max(1, Math.floor(fallbackIndex))}`;
}

export function makeTrackId(prefix: TrackPrefix, index: number, suffix?: number | string) {
  const safeIndex = Number.isFinite(index) ? Math.max(1, Math.floor(index)) : 1;
  const base = `${prefix}${safeIndex}`;
  if (suffix === undefined) return base;
  const safeSuffix = String(suffix).trim();
  return safeSuffix ? `${base}.${safeSuffix}` : base;
}

export function normalizeTrackId(value: unknown, fallback = DEFAULT_VIDEO_TRACK, kind: TimelineTrackKind = "video") {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!raw) return fallback;

  const normalized = raw.toUpperCase();
  if (TRACK_ID_PATTERN.test(normalized)) return normalized;
  if (LEGACY_NUMERIC_TRACK_PATTERN.test(normalized)) return normalizeTrackIdForKind(normalized, kind);

  return fallback;
}

export function isVideoTrackId(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.toUpperCase().startsWith(TRACK_PREFIX_VIDEO);
}

export function isAudioTrackId(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.toUpperCase().startsWith(TRACK_PREFIX_AUDIO);
}

export type TimelineClip = {
  id: string;
  assetId: string;
  kind: TimelineTrackKind;
  startIn: number;   // Start time relative to timeline (00:00)
  duration: number;  // Duration of the clip on timeline
  sourceStart: number; // In-point on the source media
  sourceEnd?: number;
  name: string;
  color: string;
  trackId: string;
};

export type TranscriptBlock = {
  id: string;
  time: number; // Timeline time where this block starts
  duration: number;
  text: string;
  deleted: boolean;
  alert: string | null;
};

export type PaperEditSnapshot = {
  clips: TimelineClip[];
  transcript: TranscriptBlock[];
  createdAt?: string;
  label?: string;
};

export type TimelineState = {
  clips: TimelineClip[];
  transcript: TranscriptBlock[];
  paperEditSnapshots?: Record<string, PaperEditSnapshot>;
};

function sanitizePaperEditSnapshots(value: TimelineState["paperEditSnapshots"]) {
  const snapshots = value && typeof value === "object" ? value : {};
  const entries: Array<[string, PaperEditSnapshot]> = [];

  Object.entries(snapshots).forEach(([blockId, snapshot]) => {
    if (!snapshot || typeof snapshot !== "object") return;
    const clips = Array.isArray(snapshot.clips)
      ? snapshot.clips.map((clip) => sanitizeTimelineClip(clip, DEFAULT_VIDEO_TRACK))
      : [];
    const transcript = Array.isArray(snapshot.transcript)
      ? snapshot.transcript.map(sanitizeTranscriptBlock)
      : [];
    if (!clips.length && !transcript.length) return;
    entries.push([
      blockId,
      {
        clips,
        transcript,
        createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : undefined,
        label: typeof snapshot.label === "string" ? snapshot.label : undefined,
      },
    ]);
  });

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function sanitizeTimelineState(nextState: TimelineState): TimelineState {
  const paperEditSnapshots = sanitizePaperEditSnapshots(nextState.paperEditSnapshots);
  const sanitized = {
    clips: nextState.clips.map((clip) => sanitizeTimelineClip(clip, DEFAULT_VIDEO_TRACK)),
    transcript: nextState.transcript.map(sanitizeTranscriptBlock),
  };

  return paperEditSnapshots ? { ...sanitized, paperEditSnapshots } : sanitized;
}

type Action =
  | { type: "INIT"; payload: TimelineState }
  | { type: "REPLACE"; payload: TimelineState }
  | { type: "ADD_CLIP"; payload: { clip: TimelineClip } }
  | { type: "TOGGLE_DELETE_BLOCK"; payload: { blockId: string } }
  | { type: "SPLIT_CLIP_AT"; payload: { clipId: string; time: number } }
  | { type: "TRIM_CLIP"; payload: { clipId: string; edge: "start" | "end"; deltaSeconds: number } }
  | { type: "UPDATE_CLIP_SOURCE"; payload: { clipId: string; assetId: string; name?: string } }
  | { type: "DELETE_CLIP"; payload: { clipId: string } }
  | { type: "DELETE_CLIP_AND_CLOSE_GAP"; payload: { clipId: string } }
  | { type: "DUPLICATE_CLIP"; payload: { clipId: string } }
  | { type: "NUDGE_CLIP"; payload: { clipId: string; deltaSeconds: number } }
  | { type: "MOVE_CLIP_TO"; payload: { clipId: string; startIn: number } }
  | { type: "MOVE_CLIP_TO_TRACK"; payload: { clipId: string; trackId: string } }
  | { type: "RENAME_CLIP"; payload: { clipId: string; name: string } }
  | { type: "SNAP_CLIP_TO_PREVIOUS"; payload: { clipId: string } }
  | { type: "SNAP_CLIP_TO_NEXT"; payload: { clipId: string } }
  | { type: "UPDATE_CLIP_TIMING"; payload: { clipId: string; startIn?: number; duration?: number; sourceStart?: number; sourceEnd?: number } }
  | { type: "COMPACT_TRACK_FROM_CLIP"; payload: { clipId: string } }
  | { type: "PUSH_TRACK_OVERLAPS_FROM_CLIP"; payload: { clipId: string } };

function timelineReducer(state: TimelineState, action: Action): TimelineState {
  switch (action.type) {
    case "INIT":
      return sanitizeTimelineState(action.payload);

    case "REPLACE":
      return sanitizeTimelineState(action.payload);

    case "ADD_CLIP":
      return sanitizeTimelineState({
        ...state,
        clips: [...state.clips, action.payload.clip].sort((a, b) => a.startIn - b.startIn),
      });

    case "TOGGLE_DELETE_BLOCK": {
      const blockId = action.payload.blockId;
      const blockIndex = state.transcript.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return state;

      const block = state.transcript[blockIndex];
      const isDeleting = !block.deleted;
      const timeDelta = isDeleting ? -block.duration : block.duration;
      const deleteStart = Math.max(0, block.time);
      const deleteEnd = Math.max(deleteStart, deleteStart + Math.max(0.01, block.duration));
      
      const newTranscript = [...state.transcript];
      newTranscript[blockIndex] = { ...block, deleted: isDeleting };
      const snapshots = state.paperEditSnapshots ?? {};

      if (!isDeleting) {
        const snapshot = snapshots[blockId];
        if (snapshot) {
          const { [blockId]: _restored, ...remainingSnapshots } = snapshots;
          return sanitizeTimelineState({
            clips: snapshot.clips,
            transcript: snapshot.transcript.map((candidate) =>
              candidate.id === blockId ? { ...candidate, deleted: false } : candidate
            ),
            paperEditSnapshots: remainingSnapshots,
          });
        }

        return {
          ...state,
          transcript: newTranscript,
        };
      }
      
      let nextClips = state.clips.map((clip) => ({ ...clip }));

      const transformed: TimelineClip[] = [];

      for (const clip of nextClips) {
        const clipStart = Math.max(0, clip.startIn);
        const clipEnd = clipStart + Math.max(0, clip.duration);
        const doesIntersect = overlapsInterval(clipStart, clipEnd, deleteStart, deleteEnd);
        if (!doesIntersect) {
          transformed.push(clip);
          continue;
        }

        const leftDuration = deleteStart - clipStart;
        const rightStart = Math.min(clipEnd, deleteEnd);
        const rightDuration = Math.max(0, clipEnd - rightStart);

        const shouldKeepLeft = leftDuration >= MIN_TIMELINE_CLIP_SECONDS;
        const shouldKeepRight = rightDuration >= MIN_TIMELINE_CLIP_SECONDS;

        if (!shouldKeepLeft && !shouldKeepRight) {
          continue;
        }

        if (shouldKeepLeft) {
          transformed.push({
            ...clip,
            sourceEnd: Math.max(clip.sourceStart + leftDuration, clip.sourceStart + MIN_TIMELINE_CLIP_SECONDS),
            duration: clampDuration(leftDuration),
          });
        }

        if (shouldKeepRight) {
          const sourceStart = clip.sourceStart + (rightStart - clipStart);
          const sourceEnd = Math.max(sourceStart, clip.sourceEnd ?? sourceStart) + rightDuration;
          transformed.push({
            ...clip,
            id: makeSplitTimelineId(clip.id, "right"),
            startIn: rightStart,
            sourceStart,
            sourceEnd,
            duration: clampDuration(rightDuration),
          });
        }
      }

      nextClips = transformed;

      // Ripple subsequent clips for both delete and restore operations.
      nextClips = nextClips.map((c) => {
        if (c.startIn > block.time) {
          return { ...c, startIn: c.startIn + timeDelta };
        }
        return c;
      });
      
      // Ripple transcript
      const rippledTranscript = newTranscript.map((b, i) => {
        if (i > blockIndex) {
          return { ...b, time: Math.max(0, b.time + timeDelta) };
        }
        return b;
      });

      return {
        ...state,
        transcript: rippledTranscript,
        clips: nextClips.filter((candidate) => toFiniteNumber(candidate.duration, 0) >= MIN_TIMELINE_CLIP_SECONDS),
        paperEditSnapshots: {
          ...snapshots,
          [blockId]: snapshots[blockId] ?? {
            clips: state.clips,
            transcript: state.transcript,
            createdAt: new Date().toISOString(),
            label: block.text.slice(0, 120),
          },
        },
      };
    }
    case "SPLIT_CLIP_AT": {
      const splitTime = toFiniteNumber(action.payload.time, -1);
      const clip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!clip) return state;

      const clipStart = Math.max(0, clip.startIn);
      const clipEnd = clipStart + Math.max(MIN_TIMELINE_CLIP_SECONDS, clip.duration);
      if (splitTime <= clipStart + MIN_TIMELINE_CLIP_SECONDS || splitTime >= clipEnd - MIN_TIMELINE_CLIP_SECONDS) {
        return state;
      }

      const leftDuration = clampDuration(splitTime - clipStart);
      const rightDuration = clampDuration(clipEnd - splitTime);
      const rightSourceStart = clip.sourceStart + leftDuration;
      const leftClip = {
        ...clip,
        duration: leftDuration,
        sourceEnd: Math.max(clip.sourceStart + leftDuration, clip.sourceStart + MIN_TIMELINE_CLIP_SECONDS),
      };
      const rightClip = {
        ...clip,
        id: makeSplitTimelineId(clip.id, `split-${Math.round(splitTime * 1000)}`),
        startIn: splitTime,
        duration: rightDuration,
        sourceStart: rightSourceStart,
        sourceEnd: Math.max(rightSourceStart + rightDuration, rightSourceStart + MIN_TIMELINE_CLIP_SECONDS),
        name: `${clip.name} / split`,
      };

      return {
        ...state,
        clips: state.clips
          .flatMap((candidate) => candidate.id === clip.id ? [leftClip, rightClip] : [candidate])
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "TRIM_CLIP": {
      return {
        ...state,
        clips: state.clips.map((clip) => {
          if (clip.id !== action.payload.clipId) return clip;

          const delta = toFiniteNumber(action.payload.deltaSeconds, 0);
          if (!delta) return clip;

          if (action.payload.edge === "start") {
            const clipEnd = clip.startIn + clip.duration;
            const requestedStart = clip.startIn + delta;
            const nextStart = Math.max(0, Math.min(requestedStart, clipEnd - MIN_TIMELINE_CLIP_SECONDS));
            const appliedDelta = nextStart - clip.startIn;
            const nextSourceStart = Math.max(0, clip.sourceStart + appliedDelta);
            return {
              ...clip,
              startIn: nextStart,
              sourceStart: nextSourceStart,
              duration: clampDuration(clipEnd - nextStart),
            };
          }

          const nextDuration = clampDuration(clip.duration + delta);
          return {
            ...clip,
            duration: nextDuration,
            sourceEnd: Math.max(clip.sourceStart + nextDuration, clip.sourceStart + MIN_TIMELINE_CLIP_SECONDS),
          };
        }),
      };
    }
    case "UPDATE_CLIP_SOURCE": {
      const nextAssetId = action.payload.assetId.trim();
      if (!nextAssetId) return state;

      return {
        ...state,
        clips: state.clips.map((clip) => {
          if (clip.id !== action.payload.clipId) return clip;

          const nextName = action.payload.name?.trim();
          return {
            ...clip,
            assetId: nextAssetId,
            name: nextName || clip.name,
          };
        }),
      };
    }
    case "DELETE_CLIP": {
      return {
        ...state,
        clips: state.clips.filter((clip) => clip.id !== action.payload.clipId),
      };
    }
    case "DELETE_CLIP_AND_CLOSE_GAP": {
      const deletedClip = state.clips.find((clip) => clip.id === action.payload.clipId);
      if (!deletedClip) return state;

      const deletedStart = deletedClip.startIn;
      const deletedEnd = deletedStart + deletedClip.duration;

      return {
        ...state,
        clips: state.clips
          .filter((clip) => clip.id !== action.payload.clipId)
          .map((clip) => {
            if (clip.trackId !== deletedClip.trackId || clip.startIn < deletedEnd) return clip;
            return { ...clip, startIn: Math.max(0, clip.startIn - deletedClip.duration) };
          })
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "DUPLICATE_CLIP": {
      const clip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!clip) return state;

      const duplicate = sanitizeTimelineClip(
        {
          ...clip,
          id: makeSplitTimelineId(clip.id, `copy-${Date.now()}`),
          startIn: clip.startIn + clip.duration,
          name: `${clip.name} / copy`,
        },
        clip.trackId
      );

      return {
        ...state,
        clips: [...state.clips, duplicate].sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "NUDGE_CLIP": {
      const delta = toFiniteNumber(action.payload.deltaSeconds, 0);
      if (!delta) return state;

      return {
        ...state,
        clips: state.clips
          .map((clip) =>
            clip.id === action.payload.clipId
              ? { ...clip, startIn: Math.max(0, clip.startIn + delta) }
              : clip
          )
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "MOVE_CLIP_TO": {
      const startIn = Math.max(0, toFiniteNumber(action.payload.startIn, 0));

      return {
        ...state,
        clips: state.clips
          .map((clip) =>
            clip.id === action.payload.clipId
              ? { ...clip, startIn }
              : clip
          )
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "MOVE_CLIP_TO_TRACK": {
      return {
        ...state,
        clips: state.clips
          .map((clip) => {
            if (clip.id !== action.payload.clipId) return clip;
            const nextTrackId = normalizeTrackId(action.payload.trackId, clip.trackId, clip.kind);
            return {
              ...clip,
              trackId: nextTrackId,
              kind: trackKindFromTrackId(nextTrackId),
            };
          })
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "RENAME_CLIP": {
      const name = action.payload.name.trim();
      if (!name) return state;

      return {
        ...state,
        clips: state.clips.map((clip) =>
          clip.id === action.payload.clipId ? { ...clip, name } : clip
        ),
      };
    }
    case "SNAP_CLIP_TO_PREVIOUS": {
      const clip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!clip) return state;

      const previousClip = state.clips
        .filter((candidate) => candidate.id !== clip.id && candidate.trackId === clip.trackId)
        .filter((candidate) => candidate.startIn + candidate.duration <= clip.startIn + 0.05)
        .sort((a, b) => (b.startIn + b.duration) - (a.startIn + a.duration))[0];
      const nextStart = previousClip ? previousClip.startIn + previousClip.duration : 0;

      return {
        ...state,
        clips: state.clips
          .map((candidate) => candidate.id === clip.id ? { ...candidate, startIn: nextStart } : candidate)
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "SNAP_CLIP_TO_NEXT": {
      const clip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!clip) return state;

      const nextClip = state.clips
        .filter((candidate) => candidate.id !== clip.id && candidate.trackId === clip.trackId)
        .filter((candidate) => candidate.startIn >= clip.startIn + clip.duration - 0.05)
        .sort((a, b) => a.startIn - b.startIn)[0];
      if (!nextClip) return state;

      return {
        ...state,
        clips: state.clips
          .map((candidate) =>
            candidate.id === clip.id
              ? { ...candidate, startIn: Math.max(0, nextClip.startIn - candidate.duration) }
              : candidate
          )
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "UPDATE_CLIP_TIMING": {
      return {
        ...state,
        clips: state.clips
          .map((clip) => {
            if (clip.id !== action.payload.clipId) return clip;

            const startIn = action.payload.startIn === undefined
              ? clip.startIn
              : Math.max(0, toFiniteNumber(action.payload.startIn, clip.startIn));
            const duration = action.payload.duration === undefined
              ? clip.duration
              : clampDuration(toFiniteNumber(action.payload.duration, clip.duration));
            const sourceStart = action.payload.sourceStart === undefined
              ? clip.sourceStart
              : Math.max(0, toFiniteNumber(action.payload.sourceStart, clip.sourceStart));
            const sourceEnd = action.payload.sourceEnd === undefined
              ? sourceStart + duration
              : Math.max(sourceStart + MIN_TIMELINE_CLIP_SECONDS, toFiniteNumber(action.payload.sourceEnd, sourceStart + duration));

            return {
              ...clip,
              startIn,
              duration,
              sourceStart,
              sourceEnd,
            };
          })
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "COMPACT_TRACK_FROM_CLIP": {
      const selectedClip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!selectedClip) return state;

      let cursor = 0;
      const selectedTrackClips = state.clips
        .filter((clip) => clip.trackId === selectedClip.trackId)
        .sort((a, b) => a.startIn - b.startIn)
        .map((clip) => {
          const nextClip = { ...clip, startIn: cursor };
          cursor += clip.duration;
          return nextClip;
        });
      const byId = new Map(selectedTrackClips.map((clip) => [clip.id, clip]));

      return {
        ...state,
        clips: state.clips
          .map((clip) => byId.get(clip.id) ?? clip)
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "PUSH_TRACK_OVERLAPS_FROM_CLIP": {
      const selectedClip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!selectedClip) return state;

      let cursor = 0;
      const selectedTrackClips = state.clips
        .filter((clip) => clip.trackId === selectedClip.trackId)
        .sort((a, b) => a.startIn - b.startIn)
        .map((clip) => {
          const startIn = Math.max(clip.startIn, cursor);
          const nextClip = { ...clip, startIn };
          cursor = startIn + clip.duration;
          return nextClip;
        });
      const byId = new Map(selectedTrackClips.map((clip) => [clip.id, clip]));

      return {
        ...state,
        clips: state.clips
          .map((clip) => byId.get(clip.id) ?? clip)
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    default:
      return state;
  }
}

export function useTimelineState(initialState: TimelineState) {
  const [state, dispatch] = useReducer(timelineReducer, initialState);

  return {
    state,
    replaceTimeline: (nextState: TimelineState) =>
      dispatch({ type: "REPLACE", payload: nextState }),
    addClip: (clip: TimelineClip) =>
      dispatch({ type: "ADD_CLIP", payload: { clip } }),
    toggleDeleteBlock: (blockId: string) =>
      dispatch({ type: "TOGGLE_DELETE_BLOCK", payload: { blockId } }),
    splitClipAt: (clipId: string, time: number) =>
      dispatch({ type: "SPLIT_CLIP_AT", payload: { clipId, time } }),
    trimClip: (clipId: string, edge: "start" | "end", deltaSeconds: number) =>
      dispatch({ type: "TRIM_CLIP", payload: { clipId, edge, deltaSeconds } }),
    updateClipSource: (clipId: string, assetId: string, name?: string) =>
      dispatch({ type: "UPDATE_CLIP_SOURCE", payload: { clipId, assetId, name } }),
    deleteClip: (clipId: string) =>
      dispatch({ type: "DELETE_CLIP", payload: { clipId } }),
    deleteClipAndCloseGap: (clipId: string) =>
      dispatch({ type: "DELETE_CLIP_AND_CLOSE_GAP", payload: { clipId } }),
    duplicateClip: (clipId: string) =>
      dispatch({ type: "DUPLICATE_CLIP", payload: { clipId } }),
    nudgeClip: (clipId: string, deltaSeconds: number) =>
      dispatch({ type: "NUDGE_CLIP", payload: { clipId, deltaSeconds } }),
    moveClipTo: (clipId: string, startIn: number) =>
      dispatch({ type: "MOVE_CLIP_TO", payload: { clipId, startIn } }),
    moveClipToTrack: (clipId: string, trackId: string) =>
      dispatch({ type: "MOVE_CLIP_TO_TRACK", payload: { clipId, trackId } }),
    renameClip: (clipId: string, name: string) =>
      dispatch({ type: "RENAME_CLIP", payload: { clipId, name } }),
    snapClipToPrevious: (clipId: string) =>
      dispatch({ type: "SNAP_CLIP_TO_PREVIOUS", payload: { clipId } }),
    snapClipToNext: (clipId: string) =>
      dispatch({ type: "SNAP_CLIP_TO_NEXT", payload: { clipId } }),
    updateClipTiming: (clipId: string, timing: { startIn?: number; duration?: number; sourceStart?: number; sourceEnd?: number }) =>
      dispatch({ type: "UPDATE_CLIP_TIMING", payload: { clipId, ...timing } }),
    compactTrackFromClip: (clipId: string) =>
      dispatch({ type: "COMPACT_TRACK_FROM_CLIP", payload: { clipId } }),
    pushTrackOverlapsFromClip: (clipId: string) =>
      dispatch({ type: "PUSH_TRACK_OVERLAPS_FROM_CLIP", payload: { clipId } }),
  };
}
