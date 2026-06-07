export type RecordingDeviceKind =
  | "web-browser"
  | "ios-native"
  | "android-native"
  | "desktop"
  | "external-recorder"
  | "unknown";

export type RecordingSegmentStatus =
  | "recording"
  | "local-ready"
  | "uploading"
  | "uploaded"
  | "verified"
  | "held"
  | "failed";

export type RecordingStopReason =
  | "user-stop"
  | "pause"
  | "interruption"
  | "route-change"
  | "app-backgrounded"
  | "crash-recovered"
  | "network-loss"
  | "unknown";

export type RecordingUploadRef = {
  readonly provider: "gcs" | "local" | "external";
  readonly bucket?: string;
  readonly objectKey?: string;
  readonly url?: string;
  readonly contentType?: string;
  readonly sizeBytes?: number;
  readonly sha256?: string;
};

export type RecordingSegment = {
  readonly id: string;
  readonly sessionId: string;
  readonly participantId: string;
  readonly deviceKind: RecordingDeviceKind;
  readonly status: RecordingSegmentStatus;
  readonly startedAt: string;
  readonly stoppedAt?: string;
  readonly durationSeconds?: number;
  readonly stopReason?: RecordingStopReason;
  readonly localPath?: string;
  readonly upload?: RecordingUploadRef;
  readonly notes?: string;
};

export type RecordingParticipant = {
  readonly id: string;
  readonly displayName: string;
  readonly role: "host" | "guest" | "producer" | "observer";
  readonly deviceKind: RecordingDeviceKind;
};

export type EpisodeRecordingSession = {
  readonly payloadVersion: 1;
  readonly id: string;
  readonly projectSlug: string;
  readonly episodeSlug: string;
  readonly title: string;
  readonly participants: readonly RecordingParticipant[];
  readonly segments: readonly RecordingSegment[];
  readonly createdAt: string;
  readonly savedAt: string;
};

export function segmentHasUploadedMedia(segment: RecordingSegment) {
  return Boolean(segment.upload?.objectKey || segment.upload?.url);
}

export function segmentNeedsAttention(segment: RecordingSegment) {
  return segment.status === "failed" || segment.status === "held" || !segmentHasUploadedMedia(segment);
}

export function getRecordingSessionDurationSeconds(session: EpisodeRecordingSession) {
  return session.segments.reduce((total, segment) => total + Math.max(0, segment.durationSeconds ?? 0), 0);
}

export function createRecordingSegmentTimelineOffsets(session: EpisodeRecordingSession) {
  let cursor = 0;

  return session.segments.map((segment) => {
    const durationSeconds = Math.max(0, segment.durationSeconds ?? 0);
    const offset = {
      segmentId: segment.id,
      participantId: segment.participantId,
      timelineStartSeconds: cursor,
      timelineEndSeconds: cursor + durationSeconds,
      durationSeconds,
      status: segment.status,
    };

    cursor += durationSeconds;
    return offset;
  });
}
