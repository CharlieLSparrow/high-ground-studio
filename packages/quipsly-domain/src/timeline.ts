export type TimelineTrackKind = "audio" | "video";

export type TransformKeyframe = {
  id: string;
  timeOffset: number; // Seconds from the start of the clip
  scale?: number;     // Zoom (2D) or FOV (360)
  x?: number;         // Pan X (2D) or Yaw (360)
  y?: number;         // Pan Y (2D) or Pitch (360)
  rotation?: number;  // Roll
  easing?: "linear" | "ease-in-out";
  aiSuggested?: boolean;
};

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
  sourceId?: string;
  volume?: number;
  deactivated?: boolean;
  aiSuggested?: boolean;
  transforms?: TransformKeyframe[];
  /**
   * Identifies a deterministic projection rather than hand-authored media.
   * Editors preserve this so a projection can be refreshed by stable identity
   * without mutating the protected source recording.
   */
  generatedFrom?: string;
  /** Receipt-backed Episode Room clock evidence for Shared Watch spans. */
  recordingSync?: {
    episodeRoomSessionId: string;
    recordingRoomId?: string;
    recordingStartedAt?: string;
    watchSegmentId: string;
    startReceiptId: string;
    endReceiptId: string;
    watchedAt: string;
  };
};

export type TranscriptBlock = {
  id: string;
  time: number; // Timeline time where this block starts
  duration: number;
  text: string;
  deleted: boolean;
  alert: string | null;
  speaker?: string | null;
  deactivated?: boolean;
  aiSuggested?: boolean;
};

export type PaperEditSnapshot = {
  clips: TimelineClip[];
  transcript: TranscriptBlock[];
  createdAt?: string;
  label?: string;
};

export type LoopClip = {
  id: string;
  sourceType: "youtube-embed" | "bucket-video";
  sourceUrl: string;
  startSec: number;
  endSec: number;
  title: string;
  exportability: "playable" | "exportable";
  manuscriptBlockId?: string;
  projectSlug?: string;
  episodeSlug?: string;
  createdAt?: string;
};

export type TimelineState = {
  clips: TimelineClip[];
  transcript: TranscriptBlock[];
  paperEditSnapshots?: Record<string, PaperEditSnapshot>;
  loopClips?: LoopClip[];
  editorMode?: "play-all" | "play-edit";
};
