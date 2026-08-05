export const QUIPSLY_BROWSER_SOURCE_CAPTURE_KIND =
  "quipsly-browser-source-capture-v1" as const;

export const BROWSER_SOURCE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export type BrowserSourceKind = "audio" | "video";
export type BrowserSourceCaptureQuality = "studio-source" | "conversation-reference";
export type BrowserSourceCaptureState =
  | "preparing"
  | "recording"
  | "stopped"
  | "uploading"
  | "verifying"
  | "verified"
  | "held"
  | "failed";

export type BrowserSourceCaptureChunk = {
  readonly index: number;
  readonly byteOffset: number;
  readonly sizeBytes: number;
  readonly recorderTimecodeMs: number | null;
  readonly receivedAt: string;
};

export type BrowserSourceCaptureMeterSummaryLegacy = {
  readonly contractKind: "quipsly-browser-source-meter-v1";
  readonly measurement: string;
  readonly coverage: string;
  readonly startedAt: string;
  readonly stoppedAt: string;
  readonly sampleRateHz: number;
  readonly sourceChannelCount: number | null;
  readonly analysisChannelCount: number;
  readonly observedFrameCount: number;
  readonly observedSampleCount: number;
  readonly meterMessageCount?: number;
  readonly missingMessageCount?: number;
  readonly highestFrameRmsDbfs: number;
  readonly samplePeakDbfs: number;
  readonly clippedSampleCount: number;
  readonly completeDecodePerformed: false;
  readonly integratedLoudnessMeasured: false;
  readonly truePeakMeasured: false;
};

export type BrowserSourceCaptureMeterSummaryV2 = {
  readonly contractKind: "quipsly-browser-source-meter-v2";
  readonly measurement:
    | "audio-worklet-render-quantum-aggregate"
    | "analyser-animation-frame-fallback";
  readonly coverage: "realtime-observation-not-complete-decode";
  readonly startedAt: string;
  readonly stoppedAt: string;
  readonly sampleRateHz: number;
  readonly sourceChannelCount: number | null;
  readonly analysisChannelCount: number;
  readonly observedBlockCount: number;
  readonly observedSampleCount: number;
  readonly meterMessageCount: number;
  readonly missingMessageCount: number;
  readonly tailAggregateFlushed: boolean;
  readonly highestObservedRmsDbfs: number;
  readonly samplePeakDbfs: number;
  readonly nearFullScaleSampleCount: number;
  readonly completeDecodePerformed: false;
  readonly integratedLoudnessMeasured: false;
  readonly truePeakMeasured: false;
};

export type BrowserSourceCaptureMeterSummary =
  | BrowserSourceCaptureMeterSummaryLegacy
  | BrowserSourceCaptureMeterSummaryV2;

export type BrowserSourceCaptureProfile = {
  readonly contractKind: typeof QUIPSLY_BROWSER_SOURCE_CAPTURE_KIND;
  readonly clientKind: "web";
  readonly sourceKind: BrowserSourceKind;
  readonly quality: BrowserSourceCaptureQuality;
  readonly browserMimeType: string;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly trackSettings: Readonly<Record<string, string | number | boolean | null>>;
  readonly processing: {
    readonly echoCancellation: boolean | null;
    readonly noiseSuppression: boolean | null;
    readonly autoGainControl: boolean | null;
  };
  readonly captureMeter?: BrowserSourceCaptureMeterSummary;
  readonly headphonesAttested: boolean;
  readonly localVault: "opfs";
  readonly localRetentionRequired: true;
};

export type BrowserSourceCaptureLedger = {
  readonly kind: typeof QUIPSLY_BROWSER_SOURCE_CAPTURE_KIND;
  readonly version: 1;
  readonly captureId: string;
  readonly captureGroupId: string;
  readonly uploadSessionId: string;
  readonly callRoomId: string;
  readonly participantId: string | null;
  readonly recordingConsentId: string | null;
  readonly episodeSlug: string | null;
  readonly fileName: string;
  readonly opfsFileName: string;
  readonly contentType: string;
  readonly sourceType: BrowserSourceKind;
  readonly sourceProfile: BrowserSourceCaptureProfile;
  readonly state: BrowserSourceCaptureState;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
  readonly sizeBytes: number;
  readonly uploadedBytes: number;
  readonly sha256: string | null;
  readonly chunks: readonly BrowserSourceCaptureChunk[];
  readonly startReceiptId: string;
  readonly stopReceiptId: string;
  readonly startReceiptPersisted: boolean;
  readonly stopReceiptPersisted: boolean;
  readonly serverRecordingAssetId: string | null;
  readonly serverTranscriptJobId: string | null;
  readonly failureReason: string | null;
  readonly updatedAt: string;
};

export function browserSourcePersistedBytes(rangeHeader: string | null) {
  if (!rangeHeader) return 0;
  const match = /^bytes=0-(\d+)$/i.exec(rangeHeader.trim());
  if (!match) return 0;
  const lastByte = Number(match[1]);
  return Number.isSafeInteger(lastByte) && lastByte >= 0 ? lastByte + 1 : 0;
}

export function browserSourceNextUploadChunk(
  totalBytes: number,
  uploadedBytes: number,
  chunkBytes = BROWSER_SOURCE_UPLOAD_CHUNK_BYTES,
) {
  if (
    !Number.isSafeInteger(totalBytes)
    || totalBytes <= 0
    || !Number.isSafeInteger(uploadedBytes)
    || uploadedBytes < 0
    || uploadedBytes >= totalBytes
    || !Number.isSafeInteger(chunkBytes)
    || chunkBytes <= 0
    || chunkBytes % (256 * 1024) !== 0
  ) return null;
  const endExclusive = Math.min(totalBytes, uploadedBytes + chunkBytes);
  return {
    start: uploadedBytes,
    endExclusive,
    endInclusive: endExclusive - 1,
    sizeBytes: endExclusive - uploadedBytes,
  };
}

const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm",
] as const;

const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm",
] as const;

export function chooseBrowserSourceMimeType(
  sourceType: BrowserSourceKind,
  isSupported: (mimeType: string) => boolean,
) {
  const candidates = sourceType === "video" ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES;
  return candidates.find(isSupported) ?? "";
}

export function browserSourceFileExtension(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.startsWith("video/mp4")) return "mp4";
  if (normalized.startsWith("video/webm")) return "webm";
  if (normalized.startsWith("audio/mp4")) return "m4a";
  if (normalized.startsWith("audio/webm")) return "webm";
  return normalized.startsWith("video/") ? "video" : "audio";
}

export function browserSourceCanBegin(input: {
  opfsAvailable: boolean;
  microphoneId: string;
  cameraId?: string | null;
  sourceType: BrowserSourceKind;
  recordingConsentId?: string | null;
  allPartyConsentReady: boolean;
  headphonesAttested: boolean;
}) {
  if (!input.opfsAvailable) return { ok: false as const, reason: "Durable browser storage is unavailable." };
  if (!input.microphoneId) return { ok: false as const, reason: "Choose a microphone." };
  if (input.sourceType === "video" && !input.cameraId) return { ok: false as const, reason: "Choose a camera." };
  if (!input.recordingConsentId || !input.allPartyConsentReady) {
    return { ok: false as const, reason: "Every signed-in participant must grant the selected recording consent." };
  }
  if (!input.headphonesAttested) {
    return { ok: false as const, reason: "Confirm headphones before retaining a studio source." };
  }
  return { ok: true as const, reason: "Browser source is ready to retain locally." };
}

export function browserSourceRecordingSegments(ledger: BrowserSourceCaptureLedger) {
  return {
    version: 1,
    clock: "browser-media-recorder-timecode",
    chunks: ledger.chunks.map((chunk) => ({
      index: chunk.index,
      byteOffset: chunk.byteOffset,
      sizeBytes: chunk.sizeBytes,
      recorderTimecodeMs: chunk.recorderTimecodeMs,
      receivedAt: chunk.receivedAt,
    })),
  };
}
