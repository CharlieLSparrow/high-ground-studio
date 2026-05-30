import { useReducer } from "react";

export type TimelineClip = {
  id: string;
  assetId: string;
  startIn: number;   // Start time relative to timeline (00:00)
  duration: number;  // Duration of the clip on timeline
  sourceStart: number; // In-point on the source media
  name: string;
  color: string;
  trackId: "V1" | "A1" | "A2"; // Added Track ID
};

export type TranscriptBlock = {
  id: string;
  time: number; // Timeline time where this block starts
  duration: number;
  text: string;
  deleted: boolean;
  alert: string | null;
};

export type TimelineState = {
  clips: TimelineClip[];
  transcript: TranscriptBlock[];
};

type Action =
  | { type: "INIT"; payload: TimelineState }
  | { type: "TOGGLE_DELETE_BLOCK"; payload: { blockId: string } };

function timelineReducer(state: TimelineState, action: Action): TimelineState {
  switch (action.type) {
    case "INIT":
      return action.payload;

    case "TOGGLE_DELETE_BLOCK": {
      const blockId = action.payload.blockId;
      const blockIndex = state.transcript.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return state;

      const block = state.transcript[blockIndex];
      const isDeleting = !block.deleted;
      const timeDelta = isDeleting ? -block.duration : block.duration;
      
      const newTranscript = [...state.transcript];
      newTranscript[blockIndex] = { ...block, deleted: isDeleting };
      
      let newClips = [...state.clips];
      
      // Multi-Track Slice: We must slice ALL clips across ALL tracks that intersect this block's time.
      const intersectingClips = newClips.filter(
        (c) => c.startIn <= block.time && c.startIn + c.duration >= block.time
      );

      for (const targetClip of intersectingClips) {
        const clipIndex = newClips.findIndex(c => c.id === targetClip.id);
        
        if (isDeleting) {
          const splitPointRelative = block.time - targetClip.startIn;
          const clip1: TimelineClip = { ...targetClip, duration: splitPointRelative };
          const clip2: TimelineClip = {
            ...targetClip,
            id: targetClip.id + "_split_" + Date.now(), // Generate unique ID
            startIn: block.time + block.duration, 
            sourceStart: targetClip.sourceStart + splitPointRelative + block.duration,
            duration: targetClip.duration - splitPointRelative - block.duration,
          };
          
          newClips.splice(clipIndex, 1, clip1, clip2);
        } else {
          // Simplistic restore logic: extend the previous clip
          newClips[clipIndex] = { ...targetClip, duration: targetClip.duration + block.duration };
        }
      }

      // Ripple all subsequent clips left or right on ALL tracks
      newClips = newClips.map((c) => {
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
        clips: newClips.filter(c => c.duration > 0),
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
    toggleDeleteBlock: (blockId: string) =>
      dispatch({ type: "TOGGLE_DELETE_BLOCK", payload: { blockId } }),
  };
}
