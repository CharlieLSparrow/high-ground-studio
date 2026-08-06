import { createHash } from "node:crypto";

export const SESSION_PREFLIGHT_TTL_MS = 2 * 60 * 60 * 1_000;

export type SessionPreflightStatus = "READY" | "NEEDS_ATTENTION";
export type SessionPreflightDecision = "HEARD_CLEAR" | "NEEDS_ADJUSTMENT";
export type SessionPreflightClientKind = "web" | "ios" | "macos";

export type SessionPreflightEvidence = {
  clientInstanceId: string;
  clientKind: SessionPreflightClientKind;
  deviceLabel: string | null;
  microphoneLabel: string;
  cameraLabel: string | null;
  outputLabel: string | null;
  cameraWanted: boolean;
  status: SessionPreflightStatus;
  audioSignalState: "inactive" | "no-signal" | "low" | "ready" | "hot" | "clipping-risk";
  rmsDbfs: number | null;
  samplePeakDbfs: number | null;
  peakHoldDbfs: number | null;
  clippedSampleCount: number;
  sampleRateHz: number | null;
  channelCount: number | null;
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  cameraWidth: number | null;
  cameraHeight: number | null;
  cameraFrameRate: number | null;
  privateSampleDurationSeconds: number | null;
  privateSamplePlaybackComplete: boolean;
  playbackDecision: SessionPreflightDecision;
  issueCodes: string[];
  testedAt: Date;
  expiresAt: Date;
  evidenceJson: Record<string, unknown>;
};

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function finite(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = finite(value, minimum, maximum);
  return parsed === null ? null : Math.round(parsed);
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

const AUDIO_STATES = new Set<SessionPreflightEvidence["audioSignalState"]>([
  "inactive",
  "no-signal",
  "low",
  "ready",
  "hot",
  "clipping-risk",
]);

const CLIENT_KINDS = new Set<SessionPreflightClientKind>([
  "web",
  "ios",
  "macos",
]);

function clientReportedDate(value: unknown, receivedAt: Date) {
  const raw = text(value, 64);
  if (!raw) return receivedAt;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return receivedAt;
  // A client clock may be a little ahead of the server, but a future receipt
  // must never extend readiness indefinitely. Old offline receipts keep their
  // original age so a delayed outbox delivery cannot paint a fresh green state.
  if (parsed.getTime() > receivedAt.getTime() + 5 * 60 * 1_000) return receivedAt;
  return parsed;
}

export function buildSessionPreflightEvidence(
  value: unknown,
  testedAt = new Date(),
): SessionPreflightEvidence {
  const body = object(value);
  const audio = object(body.audioEvidence);
  const camera = object(body.cameraEvidence);
  const requestedClientKind = text(body.clientKind, 16).toLowerCase();
  const clientKindIsSupported = requestedClientKind === ""
    || CLIENT_KINDS.has(requestedClientKind as SessionPreflightClientKind);
  const clientKind: SessionPreflightClientKind = requestedClientKind !== "" && clientKindIsSupported
    ? requestedClientKind as SessionPreflightClientKind
    : "web";
  const clientInstanceId = text(body.clientInstanceId, 80).replace(/[^a-zA-Z0-9_-]+/g, "-");
  const microphoneLabel = text(body.microphoneLabel, 160);
  const cameraWanted = body.cameraWanted === true;
  const cameraLabel = text(body.cameraLabel, 160) || null;
  const outputLabel = text(body.outputLabel, 160) || null;
  const deviceLabel = text(body.deviceLabel, 160) || null;
  const requestedState = text(audio.state, 32) as SessionPreflightEvidence["audioSignalState"];
  const audioSignalState = AUDIO_STATES.has(requestedState) ? requestedState : "inactive";
  const playbackDecision: SessionPreflightDecision = body.playbackDecision === "HEARD_CLEAR"
    ? "HEARD_CLEAR"
    : "NEEDS_ADJUSTMENT";
  const privateSamplePlaybackComplete = body.privateSamplePlaybackComplete === true;
  const privateSampleDurationSeconds = finite(body.privateSampleDurationSeconds, 0.1, 15.5);
  const cameraWidth = integer(camera.width, 1, 16_384);
  const cameraHeight = integer(camera.height, 1, 16_384);
  const cameraFrameRate = finite(camera.frameRate, 0.1, 240);
  const issueCodes: string[] = [];

  if (!clientKindIsSupported) issueCodes.push("CLIENT_KIND_UNSUPPORTED");
  if (!clientInstanceId) issueCodes.push("CLIENT_INSTANCE_MISSING");
  if (!microphoneLabel) issueCodes.push("MICROPHONE_UNIDENTIFIED");
  if (!privateSamplePlaybackComplete) issueCodes.push("PLAYBACK_NOT_COMPLETED");
  if (privateSampleDurationSeconds === null) issueCodes.push("SAMPLE_DURATION_INVALID");
  if (playbackDecision === "NEEDS_ADJUSTMENT") issueCodes.push("LISTENER_NEEDS_ADJUSTMENT");
  if (audioSignalState !== "ready") issueCodes.push(`AUDIO_${audioSignalState.toUpperCase().replace("-", "_")}`);
  if (cameraWanted && (!cameraLabel || cameraWidth === null || cameraHeight === null || cameraFrameRate === null)) {
    issueCodes.push("CAMERA_NOT_VERIFIED");
  }

  const observedAt = clientReportedDate(body.clientReportedAt, testedAt);
  const expiresAt = new Date(observedAt.getTime() + SESSION_PREFLIGHT_TTL_MS);
  return {
    clientInstanceId,
    clientKind,
    deviceLabel,
    microphoneLabel,
    cameraLabel,
    outputLabel,
    cameraWanted,
    status: issueCodes.length === 0 ? "READY" : "NEEDS_ATTENTION",
    audioSignalState,
    rmsDbfs: finite(audio.rmsDbfs, -120, 0),
    samplePeakDbfs: finite(audio.samplePeakDbfs, -120, 0),
    peakHoldDbfs: finite(audio.peakHoldDbfs, -120, 0),
    clippedSampleCount: integer(audio.clippedSampleCountSinceStart, 0, 2_147_483_647) ?? 0,
    sampleRateHz: integer(audio.sampleRateHz, 1, 768_000),
    channelCount: integer(audio.channelCount, 1, 256),
    echoCancellation: optionalBoolean(audio.echoCancellation),
    noiseSuppression: optionalBoolean(audio.noiseSuppression),
    autoGainControl: optionalBoolean(audio.autoGainControl),
    cameraWidth,
    cameraHeight,
    cameraFrameRate,
    privateSampleDurationSeconds,
    privateSamplePlaybackComplete,
    playbackDecision,
    issueCodes,
    testedAt: observedAt,
    expiresAt,
    evidenceJson: {
      contractKind: "quipsly-session-preflight-v1",
      privateSampleBytesRetained: false,
      privateSampleUploaded: false,
      audioEvidenceCoverage: clientKind === "web"
        ? "realtime-call-path-observation-not-complete-decode"
        : "local-native-recorder-meter-and-complete-private-playback",
      outputRoutingAuthority: clientKind === "web"
        ? (outputLabel ? "browser-selected-or-reported" : "system-default-or-unavailable")
        : (outputLabel ? "native-current-audio-route" : "native-output-route-unavailable"),
      clientReportedAt: text(body.clientReportedAt, 64) || null,
    },
  };
}

export function sessionPreflightNextAction(evidence: SessionPreflightEvidence) {
  if (evidence.status === "READY") {
    return "This endpoint passed its private playback check. Keep the selected setup unchanged and start retained recording separately.";
  }
  if (evidence.issueCodes.includes("LISTENER_NEEDS_ADJUSTMENT")) {
    return "Adjust the microphone, monitoring, room, or output route, then record and review a fresh private sample.";
  }
  if (evidence.issueCodes.includes("AUDIO_CLIPPING_RISK") || evidence.issueCodes.includes("AUDIO_HOT")) {
    return "Lower input gain, repeat the loudest expected phrase, and listen to a fresh private sample.";
  }
  if (evidence.issueCodes.includes("AUDIO_NO_SIGNAL") || evidence.issueCodes.includes("AUDIO_LOW")) {
    return "Check input selection, mute, cable, interface gain, and mic distance before repeating the private sample.";
  }
  return "Complete the selected-device preview and full private playback check before relying on this endpoint.";
}

export function sessionPreflightRequestSha256(evidence: SessionPreflightEvidence) {
  const payload = {
    contractKind: "quipsly-session-preflight-request-v1",
    clientInstanceId: evidence.clientInstanceId,
    clientKind: evidence.clientKind,
    deviceLabel: evidence.deviceLabel,
    microphoneLabel: evidence.microphoneLabel,
    cameraLabel: evidence.cameraLabel,
    outputLabel: evidence.outputLabel,
    cameraWanted: evidence.cameraWanted,
    status: evidence.status,
    audioSignalState: evidence.audioSignalState,
    rmsDbfs: evidence.rmsDbfs,
    samplePeakDbfs: evidence.samplePeakDbfs,
    peakHoldDbfs: evidence.peakHoldDbfs,
    clippedSampleCount: evidence.clippedSampleCount,
    sampleRateHz: evidence.sampleRateHz,
    channelCount: evidence.channelCount,
    echoCancellation: evidence.echoCancellation,
    noiseSuppression: evidence.noiseSuppression,
    autoGainControl: evidence.autoGainControl,
    cameraWidth: evidence.cameraWidth,
    cameraHeight: evidence.cameraHeight,
    cameraFrameRate: evidence.cameraFrameRate,
    privateSampleDurationSeconds: evidence.privateSampleDurationSeconds,
    privateSamplePlaybackComplete: evidence.privateSamplePlaybackComplete,
    playbackDecision: evidence.playbackDecision,
    issueCodes: evidence.issueCodes,
    evidenceContract: {
      contractKind: evidence.evidenceJson.contractKind,
      privateSampleBytesRetained: evidence.evidenceJson.privateSampleBytesRetained,
      privateSampleUploaded: evidence.evidenceJson.privateSampleUploaded,
      audioEvidenceCoverage: evidence.evidenceJson.audioEvidenceCoverage,
      outputRoutingAuthority: evidence.evidenceJson.outputRoutingAuthority,
      clientReportedAt: evidence.evidenceJson.clientReportedAt,
    },
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
