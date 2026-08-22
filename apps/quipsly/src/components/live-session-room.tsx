"use client";

import {
  Camera,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  Cloud,
  CloudOff,
  Headphones,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  RefreshCw,
  Smartphone,
  Users,
  Video,
} from "lucide-react";
import {
  ConnectionState,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserSourceRecorder } from "@/components/browser-source-recorder";
import { SessionGuardianCard } from "@/components/session-guardian-card";
import { browserClientInstanceId } from "@/lib/browser-client-instance";
import {
  StudioSoundCheck,
  type StudioSoundCheckDecision,
  type StudioSoundCheckDecisionResult,
} from "@/components/studio-sound-check";
import {
  decodeEpisodeWatchLiveHint,
  dispatchEpisodeWatchIncoming,
  EPISODE_WATCH_LIVE_TOPIC,
  EPISODE_WATCH_OUTGOING_EVENT,
  parseEpisodeWatchLiveHint,
  type EpisodeWatchLiveHint,
} from "@/lib/episode-room/episode-watch-live";
import {
  sessionExperienceForPurpose,
  type SessionCaptureProfile,
} from "@/lib/session-experience";
import {
  CHAT_PERSISTED_LIVE_TOPIC,
  CHAT_PERSISTED_OUTGOING_EVENT,
  decodeChatPersistedLiveHint,
  dispatchChatPersistedIncoming,
  encodeChatPersistedLiveHint,
  episodeChatThreadKey,
  parseChatPersistedLiveHint,
  sessionChatThreadKey,
} from "@/lib/live-collaboration/chat-live-hint";
import {
  analyseStudioAudioFrame,
  STUDIO_AUDIO_DISPLAY_FLOOR_DBFS,
  studioAudioDbfsPercent,
  studioAudioMeterEvidence,
  studioAudioSignalLabel,
  type StudioAudioMeterEvidence,
} from "@/lib/studio-audio-meter";
import {
  isCanonWebcamUtility,
  studioCameraFormatLabel,
  studioCameraInputEvidence,
  type StudioCameraInputEvidence,
} from "@/lib/studio-camera-input";
import {
  projectSessionGuardian,
  type BrowserRetainedSourceGuardianEvidence,
} from "@/lib/session-guardian";

type DeviceOption = { deviceId: string; label: string };
type PreferredDevices = {
  microphoneId?: string;
  microphoneLabel?: string;
  cameraId?: string;
  cameraLabel?: string;
  outputId?: string;
  outputLabel?: string;
  cameraWanted?: boolean;
  joinMuted?: boolean;
};
type JoinPacket = {
  ok?: boolean;
  error?: string;
  canJoin?: boolean;
  serverUrl?: string;
  participantToken?: string;
  participantId?: string;
  roomName?: string;
  recordingConsentGranted?: boolean;
  recordingConsentStatus?: string;
  nextAction?: string;
};

type ProviderRecordingState = {
  state: "off" | "starting" | "recording" | "stopping" | "needs-review" | "held";
  optionalWitness: true;
  affectsCaptureGroupSync: false;
  syncAuthority: string;
  canOperate: boolean;
  configured: boolean;
  enabled: boolean;
  paymentHeld: boolean;
  nextAction: string;
  activeRecordingAssetId: string | null;
  latestCommand: {
    id: string;
    action: "START" | "STOP";
    status: string;
    errorCode: string | null;
    message: string | null;
    updatedAt: string;
  } | null;
};

type ProviderRecordingPacket = {
  ok?: boolean;
  error?: string;
  message?: string;
  providerRecording?: ProviderRecordingState & {
    currentStatus?: string;
  };
};

export type LiveSessionRoomStatus = "preflight" | "checking" | "ready" | "joining" | "connected" | "reconnecting" | "ended" | "error";

function readableDeviceLabel(device: MediaDeviceInfo, index: number) {
  return device.label || `${device.kind === "audioinput" ? "Microphone" : device.kind === "videoinput" ? "Camera" : "Output"} ${index + 1}`;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function getUserMediaWithTimeout(
  constraints: MediaStreamConstraints,
  timeoutMs = 15_000,
) {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    if (expired) stopStream(stream);
    return stream;
  });
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error("Permission prompt timed out. Open this site's camera and microphone controls, allow the device you want, then try again."));
    }, timeoutMs);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function audioOutputSupported(element: HTMLMediaElement | null) {
  return Boolean(element && "setSinkId" in element);
}

const PREFERRED_DEVICES_KEY = "quipsly-live-preferred-devices-v2";
const LEGACY_PREFERRED_DEVICES_KEY = "quipsly-live-preferred-devices-v1";

function readPreferredDevices(): PreferredDevices {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(PREFERRED_DEVICES_KEY)
        || window.localStorage.getItem(LEGACY_PREFERRED_DEVICES_KEY)
        || "{}",
    );
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function preferredDeviceId(
  current: string,
  options: DeviceOption[],
  preferredId?: string,
  preferredLabel?: string,
) {
  if (current && options.some((option) => option.deviceId === current)) return current;
  if (preferredId && options.some((option) => option.deviceId === preferredId)) return preferredId;
  if (preferredLabel) {
    const labelMatch = options.find((option) => option.label === preferredLabel);
    if (labelMatch) return labelMatch.deviceId;
  }
  return options[0]?.deviceId || "";
}

function formattedDbfs(value: number) {
  if (!Number.isFinite(value) || value <= -120) return "below −120 dBFS";
  return `${value.toFixed(1).replace("-", "−")} dBFS`;
}

function StudioInputEvidenceMeter({ evidence }: { evidence: StudioAudioMeterEvidence | null }) {
  const signalState = evidence?.state ?? "inactive";
  const stateStyles = signalState === "clipping-risk"
    ? "border-rose-300 bg-rose-50 text-rose-950"
    : signalState === "hot"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : signalState === "ready"
        ? "border-emerald-300 bg-emerald-50 text-emerald-950"
        : "border-[#d8c7a7] bg-white text-[#5b472f]";
  const rmsPercent = studioAudioDbfsPercent(evidence?.rmsDbfs ?? STUDIO_AUDIO_DISPLAY_FLOOR_DBFS);
  const peakPercent = studioAudioDbfsPercent(evidence?.samplePeakDbfs ?? STUDIO_AUDIO_DISPLAY_FLOOR_DBFS);
  const processing = evidence
    ? [
        evidence.echoCancellation === true ? "echo cancellation" : null,
        evidence.noiseSuppression === true ? "noise suppression" : null,
        evidence.autoGainControl === true ? "automatic gain" : null,
      ].filter(Boolean)
    : [];

  return (
    <section className={`rounded-xl border p-3 ${stateStyles}`} aria-label="Call-path microphone evidence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide">Call-path input evidence</p>
          <p className="mt-1 text-sm font-black">{studioAudioSignalLabel(signalState)}</p>
        </div>
        <p className="text-right font-mono text-[10px] font-black">
          {evidence
            ? `${evidence.sampleRateHz ? `${(evidence.sampleRateHz / 1_000).toFixed(1)} kHz` : "rate unavailable"} · ${evidence.channelCount ? `${evidence.channelCount} ch` : "channels unavailable"}`
            : "Run selected setup"}
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        <div>
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold"><span>Frame RMS</span><span className="font-mono">{evidence ? formattedDbfs(evidence.rmsDbfs) : "—"}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10" role="meter" aria-label="Microphone frame RMS" aria-valuemin={STUDIO_AUDIO_DISPLAY_FLOOR_DBFS} aria-valuemax={0} aria-valuenow={evidence ? Math.max(STUDIO_AUDIO_DISPLAY_FLOOR_DBFS, evidence.rmsDbfs) : STUDIO_AUDIO_DISPLAY_FLOOR_DBFS} aria-valuetext={evidence ? formattedDbfs(evidence.rmsDbfs) : "Waiting for setup test"}>
            <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${rmsPercent}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold"><span>Sample peak</span><span className="font-mono">{evidence ? formattedDbfs(evidence.samplePeakDbfs) : "—"}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10" role="meter" aria-label="Microphone sample peak" aria-valuemin={STUDIO_AUDIO_DISPLAY_FLOOR_DBFS} aria-valuemax={0} aria-valuenow={evidence ? Math.max(STUDIO_AUDIO_DISPLAY_FLOOR_DBFS, evidence.samplePeakDbfs) : STUDIO_AUDIO_DISPLAY_FLOOR_DBFS} aria-valuetext={evidence ? formattedDbfs(evidence.samplePeakDbfs) : "Waiting for setup test"}>
            <div className={`h-full rounded-full transition-[width] ${signalState === "clipping-risk" ? "bg-rose-600" : signalState === "hot" ? "bg-amber-600" : "bg-violet-700"}`} style={{ width: `${peakPercent}%` }} />
          </div>
        </div>
      </div>

      {evidence ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] font-bold">
        <span>Peak hold {formattedDbfs(evidence.peakHoldDbfs)}</span>
        <span>{evidence.clippedSampleCountSinceStart.toLocaleString()} clipped samples observed</span>
        <span>{processing.length ? `Browser call processing: ${processing.join(", ")}` : "Browser call processing not reported"}</span>
      </div> : null}
      <p className="mt-2 text-[10px] font-bold leading-4 opacity-75">These are frame RMS and sample-peak observations from the browser call path—not LUFS, true peak, or proof of the retained source. Quipsly analyzes each preserved source independently after capture.</p>
    </section>
  );
}

function StudioCameraEvidence({
  cameraLabel,
  evidence,
}: {
  cameraLabel: string;
  evidence: StudioCameraInputEvidence | null;
}) {
  const canonVirtualCamera = isCanonWebcamUtility(cameraLabel);
  return (
    <section className={`rounded-xl border p-3 ${canonVirtualCamera ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950"}`} aria-label="Call-path camera evidence">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide">Call-path camera evidence</p>
          <p className="mt-1 text-sm font-black">{cameraLabel || "No camera selected"}</p>
        </div>
        <p className="font-mono text-[10px] font-black">{evidence ? studioCameraFormatLabel(evidence) : "Run selected setup"}</p>
      </div>
      {canonVirtualCamera ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-white/80 p-3 text-xs font-bold leading-5">
          <p className="font-black">Canon handoff check</p>
          <p className="mt-1">If the preview shows Canon&apos;s USB cable slate, quit both <span className="font-mono">EOS Utility</span> and <span className="font-mono">EOS Utility 3</span>, leave the R8 connected and in movie mode, then run this test again. Canon&apos;s background launcher can own the camera while still advertising this virtual source.</p>
        </div>
      ) : null}
      <p className="mt-2 text-[10px] font-bold leading-4 opacity-75">{canonVirtualCamera
        ? "This describes the browser call/reference feed only. Record the R8's 4K master on-camera and let Quipsly align that protected source to the Session capture group."
        : "This describes the browser call/reference feed only. Quipsly measures each protected retained source independently after capture."}</p>
    </section>
  );
}

export function LiveSessionRoom({
  callRoomId,
  captureGroupId,
  sessionTitle,
  kind,
  purpose,
  projectSlug = null,
  episodeSlug = null,
  episodeWatchHint = null,
  onEpisodeWatchHint,
  onStatusChange,
  compact = false,
  narrow = false,
}: {
  callRoomId: string;
  captureGroupId?: string | null;
  sessionTitle: string;
  kind: SessionCaptureProfile;
  purpose?: string | null;
  projectSlug?: string | null;
  episodeSlug?: string | null;
  episodeWatchHint?: EpisodeWatchLiveHint | null;
  onEpisodeWatchHint?: (hint: EpisodeWatchLiveHint) => void;
  onStatusChange?: (status: LiveSessionRoomStatus) => void;
  compact?: boolean;
  narrow?: boolean;
}) {
  const router = useRouter();
  const experience = useMemo(
    () => sessionExperienceForPurpose(purpose || (kind === "episode" ? "PODCAST" : "COACHING")),
    [kind, purpose],
  );
  const [status, setStatus] = useState<LiveSessionRoomStatus>("preflight");
  const [message, setMessage] = useState("Preparing your microphone and camera…");
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [cameraWanted, setCameraWanted] = useState(experience.defaultCamera);
  const [joinMuted, setJoinMuted] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [microphoneRecoveryHeld, setMicrophoneRecoveryHeld] = useState(false);
  const [cameraMuted, setCameraMuted] = useState(false);
  const [participants, setParticipants] = useState<Array<{ identity: string; name: string; speaking: boolean }>>([]);
  const [recordingConsentGranted, setRecordingConsentGranted] = useState(false);
  const [meterEvidence, setMeterEvidence] = useState<StudioAudioMeterEvidence | null>(null);
  const [cameraEvidence, setCameraEvidence] = useState<StudioCameraInputEvidence | null>(null);
  const [previewTested, setPreviewTested] = useState(false);
  const [supportsOutputSelection, setSupportsOutputSelection] = useState(false);
  const [supportsOutputPrompt, setSupportsOutputPrompt] = useState(false);
  const [sourceLocked, setSourceLocked] = useState(false);
  const [retainedGuardianEvidence, setRetainedGuardianEvidence] = useState<BrowserRetainedSourceGuardianEvidence | null>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [providerRecording, setProviderRecording] = useState<ProviderRecordingState | null>(null);
  const [providerRecordingBusy, setProviderRecordingBusy] = useState(false);
  const [providerRecordingMessage, setProviderRecordingMessage] = useState(
    "Cloud recording backup is off. Local recording remains available.",
  );
  const [providerStartArmed, setProviderStartArmed] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const cameraWantedRef = useRef(cameraWanted);
  const microphoneIdRef = useRef(microphoneId);
  const cameraIdRef = useRef(cameraId);
  const outputIdRef = useRef(outputId);
  const microphoneMutedRef = useRef(microphoneMuted);
  const cameraMutedRef = useRef(cameraMuted);
  const sourceLockedRef = useRef(sourceLocked);
  const previousSourceLockedRef = useRef(sourceLocked);
  const deviceRefreshGenerationRef = useRef(0);
  const suppressPreferenceWriteRef = useRef(false);
  const lastPublishedWatchReceiptRef = useRef("");
  const preflightStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteMediaRef = useRef<HTMLDivElement | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const providerRecordingRequestIdsRef = useRef<Record<"START_EGRESS" | "STOP_EGRESS", string | undefined>>({
    START_EGRESS: undefined,
    STOP_EGRESS: undefined,
  });

  const connected = status === "connected" || status === "reconnecting";
  const statusLabel = useMemo(() => status.replace(/\b\w/g, (letter) => letter.toUpperCase()), [status]);
  const providerRecordingState = providerRecording?.state || "off";
  const providerRecordingStateLabel = providerRecordingState === "needs-review"
    ? "Needs review"
    : providerRecordingState.replace(/\b\w/g, (letter) => letter.toUpperCase());
  const guardianProjection = useMemo(() => projectSessionGuardian({
    conversationStatus: status,
    callSignalState: meterEvidence?.state ?? "inactive",
    cameraWanted,
    cameraEvidenceAvailable: Boolean(cameraEvidence),
    pageVisible,
    retainedSourceAvailable: typeof captureGroupId === "string" && Boolean(captureGroupId.trim()),
    retained: retainedGuardianEvidence,
  }), [cameraEvidence, cameraWanted, captureGroupId, meterEvidence?.state, pageVisible, retainedGuardianEvidence, status]);

  useEffect(() => {
    cameraWantedRef.current = cameraWanted;
  }, [cameraWanted]);

  useEffect(() => {
    microphoneIdRef.current = microphoneId;
  }, [microphoneId]);

  useEffect(() => {
    cameraIdRef.current = cameraId;
  }, [cameraId]);

  useEffect(() => {
    outputIdRef.current = outputId;
  }, [outputId]);

  useEffect(() => {
    microphoneMutedRef.current = microphoneMuted;
  }, [microphoneMuted]);

  useEffect(() => {
    cameraMutedRef.current = cameraMuted;
  }, [cameraMuted]);

  useEffect(() => {
    sourceLockedRef.current = sourceLocked;
  }, [sourceLocked]);

  useEffect(() => {
    const preferred = readPreferredDevices();
    if (typeof preferred.cameraWanted === "boolean") {
      setCameraWanted(preferred.cameraWanted);
    }
    if (typeof preferred.joinMuted === "boolean") {
      setJoinMuted(preferred.joinMuted);
      setMicrophoneMuted(preferred.joinMuted);
    }
  }, []);

  useEffect(() => {
    const changed = () => setPageVisible(document.visibilityState === "visible");
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);

  useEffect(() => {
    setRetainedGuardianEvidence(null);
  }, [callRoomId, captureGroupId]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const updateRoster = useCallback((room: Room) => {
    const active = new Set(room.activeSpeakers.map((participant) => participant.identity));
    setParticipants([
      {
        identity: room.localParticipant.identity,
        name: room.localParticipant.name || "You",
        speaking: active.has(room.localParticipant.identity),
      },
      ...Array.from(room.remoteParticipants.values()).map((participant) => ({
        identity: participant.identity,
        name: participant.name || "Participant",
        speaking: active.has(participant.identity),
      })),
    ]);
  }, []);

  const clearRemoteMedia = useCallback(() => {
    remoteMediaRef.current?.replaceChildren();
  }, []);

  const clearPreflightPreview = useCallback(() => {
    meterCleanupRef.current?.();
    meterCleanupRef.current = null;
    stopStream(preflightStreamRef.current);
    preflightStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setMeterEvidence(null);
    setCameraEvidence(null);
    setPreviewTested(false);
  }, []);
  const currentPreflightStream = useCallback(() => preflightStreamRef.current, []);

  const saveSoundCheckDecision = useCallback(async (
    decision: StudioSoundCheckDecision,
  ): Promise<StudioSoundCheckDecisionResult> => {
    const microphoneLabel = microphones.find((device) => device.deviceId === microphoneId)?.label || "";
    const cameraLabel = cameraWanted
      ? cameras.find((device) => device.deviceId === cameraId)?.label || ""
      : "";
    const outputLabel = outputs.find((device) => device.deviceId === outputId)?.label
      || (supportsOutputSelection ? "System default" : "System output selected outside this browser");
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(callRoomId)}/preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...decision,
          clientInstanceId: browserClientInstanceId(),
          clientKind: "web",
          deviceLabel: navigator.platform ? `Quipsly Web · ${navigator.platform}` : "Quipsly Web",
          microphoneLabel,
          cameraLabel,
          outputLabel,
          cameraWanted,
          audioEvidence: meterEvidence,
          cameraEvidence,
          clientReportedAt: new Date().toISOString(),
        }),
      });
      const packet = await response.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        nextAction?: string;
        preflight?: { status?: "READY" | "NEEDS_ATTENTION" };
      };
      if (!response.ok || !packet.ok) {
        return {
          ok: false,
          message: packet.error || "Quipsly could not save the setup receipt. The private sample remains in this tab; retry the same decision.",
        };
      }
      router.refresh();
      return {
        ok: true,
        status: packet.preflight?.status,
        message: `${packet.preflight?.status === "READY" ? "Setup receipt ready" : "Setup receipt needs attention"}. ${packet.nextAction || "Refresh Session readiness to share this endpoint result with collaborators."} No private audio was uploaded.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: `${error instanceof Error ? error.message : "The setup receipt response was lost."} The private sample remains in this tab; retry the same decision and Quipsly will use the same request ID.`,
      };
    }
  }, [callRoomId, cameraEvidence, cameraId, cameraWanted, cameras, meterEvidence, microphoneId, microphones, outputId, outputs, router, supportsOutputSelection]);

  const refreshProviderRecording = useCallback(async (announceFailure = false) => {
    try {
      const response = await fetch(
        `/api/mobile/capture/rooms/provider-recording?callRoomId=${encodeURIComponent(callRoomId)}`,
        { cache: "no-store" },
      );
      const packet = await response.json().catch(() => ({})) as ProviderRecordingPacket;
      if (!response.ok || !packet.ok || !packet.providerRecording) {
        throw new Error(packet.error || "Provider safety-copy status is unavailable.");
      }
      setProviderRecording(packet.providerRecording);
      setProviderRecordingMessage(packet.providerRecording.nextAction);
    } catch (error) {
      if (announceFailure) {
        setProviderRecordingMessage(
          `${error instanceof Error ? error.message : "Provider safety-copy status is unavailable."} Local protected capture and Session synchronization are unaffected.`,
        );
      }
    }
  }, [callRoomId]);

  const runProviderRecordingAction = useCallback(async (action: "START_EGRESS" | "STOP_EGRESS") => {
    const requestId = providerRecordingRequestIdsRef.current[action] || crypto.randomUUID();
    providerRecordingRequestIdsRef.current[action] = requestId;
    setProviderRecordingBusy(true);
    setProviderRecordingMessage(action === "START_EGRESS"
      ? "Submitting one durable provider START command…"
      : "Submitting one durable provider STOP command…");
    try {
      const response = await fetch("/api/mobile/capture/rooms/provider-recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callRoomId, action, requestId }),
      });
      const packet = await response.json().catch(() => ({})) as ProviderRecordingPacket;
      if (response.status < 500) providerRecordingRequestIdsRef.current[action] = undefined;
      setProviderRecordingMessage(
        packet.providerRecording?.nextAction
        || packet.message
        || packet.error
        || `Provider ${action === "START_EGRESS" ? "START" : "STOP"} returned HTTP ${response.status}.`,
      );
      if (response.ok && packet.providerRecording?.currentStatus) {
        setProviderRecording((current) => current ? {
          ...current,
          state: packet.providerRecording!.currentStatus === "started"
            ? "recording"
            : packet.providerRecording!.currentStatus === "stopped"
              ? "off"
              : packet.providerRecording!.currentStatus === "reconcile-required"
                ? "needs-review"
                : current.state,
        } : current);
      }
      await refreshProviderRecording(false);
    } catch (error) {
      setProviderRecordingMessage(
        `${error instanceof Error ? error.message : "Provider command response was lost."} Retry uses the same request ID, so Quipsly will not create a duplicate command.`,
      );
    } finally {
      setProviderStartArmed(false);
      setProviderRecordingBusy(false);
    }
  }, [callRoomId, refreshProviderRecording]);

  const routeAudioOutput = useCallback(async (element: HTMLMediaElement) => {
    const sinkElement = element as HTMLMediaElement & { setSinkId?: (deviceId: string) => Promise<void> };
    if (!outputId || !sinkElement.setSinkId) return;
    await sinkElement.setSinkId(outputId).catch(() => {
      setMessage("The browser kept the system audio output. Choose your headphones in macOS Sound settings.");
    });
  }, [outputId]);

  const attachRemoteTrack = useCallback((track: RemoteTrack) => {
    const container = remoteMediaRef.current;
    if (!container) return;
    const element = track.attach();
    element.dataset.livekitTrackSid = track.sid;
    element.autoplay = true;
    if (track.kind === Track.Kind.Audio) {
      element.className = "hidden";
      void routeAudioOutput(element);
    } else {
      element.className = "aspect-video w-full rounded-2xl bg-black object-cover";
    }
    container.appendChild(element);
  }, [routeAudioOutput]);

  const refreshDevices = useCallback(async (
    permission: "none" | "microphone" | "camera" | "media" = "none",
    cause: "initial" | "manual" | "devicechange" = "manual",
  ) => {
    const generation = ++deviceRefreshGenerationRef.current;
    const room = roomRef.current;
    const preserveLiveConnection = Boolean(room && room.state !== ConnectionState.Disconnected);
    if (!navigator.mediaDevices?.enumerateDevices) {
      if (!preserveLiveConnection) setStatus("error");
      setMessage("This browser cannot access media devices. Use HTTPS, localhost, or Quipsly Capture on iPhone.");
      return;
    }
    if (!preserveLiveConnection) {
      setStatus("checking");
      setMessage(permission === "microphone"
        ? "Waiting for browser microphone permission…"
        : permission === "camera" || permission === "media"
          ? "Waiting for browser camera permission…"
          : "Reading available devices…");
    } else if (permission !== "none" || cause === "manual") {
      setMessage("Checking connected call devices without leaving the room…");
    }
    try {
      if (permission !== "none") {
        clearPreflightPreview();
        preflightStreamRef.current = await getUserMediaWithTimeout({
          audio: permission === "microphone" || permission === "media",
          video: permission === "camera" || permission === "media",
        });
        stopStream(preflightStreamRef.current);
        preflightStreamRef.current = null;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (generation !== deviceRefreshGenerationRef.current) return;
      const rawMicrophones = devices.filter((device) => device.kind === "audioinput");
      const rawCameras = devices.filter((device) => device.kind === "videoinput");
      const nextMicrophones = rawMicrophones.filter((device) => device.deviceId).map((device, index) => ({ deviceId: device.deviceId, label: readableDeviceLabel(device, index) }));
      const nextCameras = rawCameras.filter((device) => device.deviceId).map((device, index) => ({ deviceId: device.deviceId, label: readableDeviceLabel(device, index) }));
      const nextOutputs = devices.filter((device) => device.kind === "audiooutput" && device.deviceId).map((device, index) => ({ deviceId: device.deviceId, label: readableDeviceLabel(device, index) }));
      const preferred = readPreferredDevices();
      const previousMicrophoneId = microphoneIdRef.current;
      const previousCameraId = cameraIdRef.current;
      const previousOutputId = outputIdRef.current;
      const microphoneDisconnected = Boolean(previousMicrophoneId && !nextMicrophones.some((device) => device.deviceId === previousMicrophoneId));
      const cameraDisconnected = Boolean(previousCameraId && !nextCameras.some((device) => device.deviceId === previousCameraId));
      const outputDisconnected = Boolean(previousOutputId && !nextOutputs.some((device) => device.deviceId === previousOutputId));
      const nextMicrophoneId = preferredDeviceId("", nextMicrophones, preferred.microphoneId, preferred.microphoneLabel);
      const nextCameraId = preferredDeviceId("", nextCameras, preferred.cameraId, preferred.cameraLabel);
      const nextOutputId = preferredDeviceId("", nextOutputs, preferred.outputId, preferred.outputLabel);
      const lockedMicrophones = sourceLockedRef.current && microphoneDisconnected
        ? [{ deviceId: previousMicrophoneId, label: preferred.microphoneLabel || "Retained microphone" }, ...nextMicrophones]
        : nextMicrophones;
      const lockedCameras = sourceLockedRef.current && cameraDisconnected
        ? [{ deviceId: previousCameraId, label: preferred.cameraLabel || "Retained camera" }, ...nextCameras]
        : nextCameras;
      const recoveryMessages: string[] = [];

      if (previousMicrophoneId && !microphoneDisconnected) setMicrophoneRecoveryHeld(false);

      if (microphoneDisconnected || cameraDisconnected || outputDisconnected) {
        suppressPreferenceWriteRef.current = true;
      }
      setMicrophones(lockedMicrophones);
      setCameras(lockedCameras);
      setOutputs(nextOutputs);

      if (!preserveLiveConnection) {
        if (microphoneDisconnected || cameraDisconnected) clearPreflightPreview();
        if (!(sourceLockedRef.current && microphoneDisconnected)) {
          const selected = preferredDeviceId(
            previousMicrophoneId,
            nextMicrophones,
            preferred.microphoneId,
            preferred.microphoneLabel,
          );
          microphoneIdRef.current = selected;
          setMicrophoneId(selected);
        }
        if (!(sourceLockedRef.current && cameraDisconnected)) {
          const selected = preferredDeviceId(
            previousCameraId,
            nextCameras,
            preferred.cameraId,
            preferred.cameraLabel,
          );
          cameraIdRef.current = selected;
          setCameraId(selected);
        }
        if (microphoneDisconnected) {
          setMicrophoneRecoveryHeld(sourceLockedRef.current || !nextMicrophoneId);
          recoveryMessages.push(sourceLockedRef.current
            ? "The retained microphone disconnected. Stop this recording before choosing another microphone."
            : nextMicrophoneId
              ? `Microphone disconnected. Quipsly selected ${nextMicrophones.find((device) => device.deviceId === nextMicrophoneId)?.label || "an available microphone"}; preview it when convenient.`
              : "Microphone disconnected. Connect or choose another microphone before joining.");
        }
        if (cameraDisconnected) {
          recoveryMessages.push(sourceLockedRef.current
            ? "The retained camera disconnected. Stop this recording before choosing another camera."
            : nextCameraId
              ? `Camera disconnected. Quipsly selected ${nextCameras.find((device) => device.deviceId === nextCameraId)?.label || "an available camera"}; preview it when convenient.`
              : "Camera disconnected. Connect or choose another camera, or join with camera off.");
        }
      } else if (room) {
        if (microphoneDisconnected) {
          if (sourceLockedRef.current) {
            await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
            setMicrophoneMuted(true);
            microphoneMutedRef.current = true;
            setMicrophoneRecoveryHeld(true);
            recoveryMessages.push("The call microphone disconnected, so Quipsly muted it. Stop the retained recording before choosing another microphone.");
          } else if (nextMicrophoneId) {
            try {
              await room.switchActiveDevice("audioinput", nextMicrophoneId);
              if (!microphoneMutedRef.current) {
                await room.localParticipant.setMicrophoneEnabled(true, {
                  deviceId: nextMicrophoneId,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                });
              }
              setMicrophoneId(nextMicrophoneId);
              microphoneIdRef.current = nextMicrophoneId;
              setMicrophoneRecoveryHeld(false);
              recoveryMessages.push(`Microphone disconnected. The call moved to ${nextMicrophones.find((device) => device.deviceId === nextMicrophoneId)?.label || "an available microphone"}.`);
            } catch {
              await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
              setMicrophoneId("");
              microphoneIdRef.current = "";
              setMicrophoneMuted(true);
              microphoneMutedRef.current = true;
              setMicrophoneRecoveryHeld(true);
              recoveryMessages.push("The microphone disconnected and the fallback could not start, so Quipsly muted the call. Choose another microphone in settings.");
            }
          } else {
            await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
            setMicrophoneId("");
            microphoneIdRef.current = "";
            setMicrophoneMuted(true);
            microphoneMutedRef.current = true;
            setMicrophoneRecoveryHeld(true);
            recoveryMessages.push("The microphone disconnected, so Quipsly muted the call. Connect or choose another microphone.");
          }
        }

        if (cameraDisconnected) {
          if (sourceLockedRef.current) {
            await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
            setCameraMuted(true);
            cameraMutedRef.current = true;
            recoveryMessages.push("The call camera disconnected, so Quipsly turned it off. Stop the retained recording before choosing another camera.");
          } else if (nextCameraId) {
            try {
              if (cameraWantedRef.current && !cameraMutedRef.current) {
                await room.switchActiveDevice("videoinput", nextCameraId);
                const publication = await room.localParticipant.setCameraEnabled(true, { deviceId: nextCameraId });
                const mediaTrack = publication?.track?.mediaStreamTrack;
                if (localVideoRef.current && mediaTrack) {
                  localVideoRef.current.srcObject = new MediaStream([mediaTrack]);
                  await localVideoRef.current.play().catch(() => undefined);
                }
              }
              setCameraId(nextCameraId);
              cameraIdRef.current = nextCameraId;
              setCameraEvidence(null);
              recoveryMessages.push(`Camera disconnected. ${cameraWantedRef.current && !cameraMutedRef.current ? "The call moved" : "Camera remains off; its next start will use"} ${nextCameras.find((device) => device.deviceId === nextCameraId)?.label || "an available camera"}.`);
            } catch {
              await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
              setCameraId("");
              cameraIdRef.current = "";
              setCameraMuted(true);
              cameraMutedRef.current = true;
              recoveryMessages.push("The camera disconnected and the fallback could not start, so Quipsly turned video off. Choose another camera in settings.");
            }
          } else {
            await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
            setCameraId("");
            cameraIdRef.current = "";
            setCameraMuted(true);
            cameraMutedRef.current = true;
            recoveryMessages.push("The camera disconnected, so Quipsly turned video off. Connect or choose another camera.");
          }
        }
      }

      if (outputDisconnected) {
        setOutputId(nextOutputId);
        outputIdRef.current = nextOutputId;
        recoveryMessages.push(nextOutputId
          ? `Headphone output disconnected. Remote audio moved to ${nextOutputs.find((device) => device.deviceId === nextOutputId)?.label || "an available output"}.`
          : "Headphone output disconnected. Remote audio moved to the system default.");
      } else if (!preserveLiveConnection) {
        const selected = preferredDeviceId(
          previousOutputId,
          nextOutputs,
          preferred.outputId,
          preferred.outputLabel,
        );
        outputIdRef.current = selected;
        setOutputId(selected);
      }
      const microphoneNamesVisible = nextMicrophones.some((device) => !/^Microphone \d+$/.test(device.label));
      const cameraNamesVisible = nextCameras.some((device) => !/^Camera \d+$/.test(device.label));
      if (recoveryMessages.length) {
        if (!preserveLiveConnection) setStatus(nextMicrophones.length && (!cameraWantedRef.current || nextCameras.length) ? "ready" : "preflight");
        setMessage(recoveryMessages.join(" "));
      } else if ((permission === "camera" || permission === "media") && !nextCameras.length) {
        if (!preserveLiveConnection) setStatus("error");
        setMessage("Camera access did not expose a usable device. Open this site's camera controls, choose the Canon or desired camera, then try again—or turn off Join with camera.");
      } else if (permission === "camera" || permission === "media") {
        if (!preserveLiveConnection) setStatus("ready");
        setMessage(cameraNamesVisible ? "Camera names are visible. Choose the exact camera and run the preview." : "Camera access is available. Use the preview to verify the selected source.");
      } else if (!nextMicrophones.length) {
        if (!preserveLiveConnection) setStatus(rawMicrophones.length ? "preflight" : "error");
        setMessage(rawMicrophones.length
          ? "A microphone is present, but the browser is hiding the usable device until you allow microphone access."
          : "No microphone was found. Check the cable and macOS Sound settings, then scan again.");
      } else if (cameraWantedRef.current && !nextCameras.length) {
        if (!preserveLiveConnection) setStatus("preflight");
        setMessage("Microphone names are visible. Allow and choose a camera, or turn off Join with camera for an audio-only call.");
      } else {
        if (!preserveLiveConnection) setStatus("ready");
        if (preserveLiveConnection) {
          if (cause !== "devicechange") setMessage("Call devices refreshed. The conversation stayed connected.");
        } else setMessage(microphoneNamesVisible
            ? "Microphone names are visible. Choose the exact source, then run the confidence check before joining."
            : "Microphone access is available. Use the confidence check to verify the selected source.");
      }
    } catch (error) {
      if (!preserveLiveConnection) setStatus("error");
      setMessage(error instanceof Error ? `Device check failed: ${error.message}` : "Device permission was not granted.");
    }
  }, [clearPreflightPreview]);

  useEffect(() => {
    const wasLocked = previousSourceLockedRef.current;
    previousSourceLockedRef.current = sourceLocked;
    if (wasLocked && !sourceLocked) void refreshDevices("none", "manual");
  }, [refreshDevices, sourceLocked]);

  const startSelectedPreview = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !microphoneId) return;
    if (cameraWanted && !cameraId) {
      setStatus("error");
      setMessage("Choose a usable camera or turn off Join with camera before testing this setup.");
      return;
    }
    setStatus("checking");
    setMessage("Opening the selected studio devices…");
    try {
      clearPreflightPreview();
      const stream = await getUserMediaWithTimeout({
        audio: {
          deviceId: { exact: microphoneId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: cameraWanted && cameraId ? {
          deviceId: { exact: cameraId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        } : false,
      });
      preflightStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => undefined);
      }
      const videoTrack = stream.getVideoTracks()[0];
      setCameraEvidence(videoTrack
        ? studioCameraInputEvidence(
            cameras.find((device) => device.deviceId === cameraId)?.label || videoTrack.label || "Selected camera",
            videoTrack.getSettings(),
          )
        : null);
      const context = new AudioContext();
      await context.resume().catch(() => undefined);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2_048;
      context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const audioTrack = stream.getAudioTracks()[0];
      const trackSettings = audioTrack?.getSettings() ?? {};
      let peakHoldDbfs = -120;
      let clippedSampleCountSinceStart = 0;
      let lastPublishedAt = 0;
      let frame = 0;
      const tick = (timestamp: number) => {
        analyser.getFloatTimeDomainData(samples);
        const frameEvidence = analyseStudioAudioFrame(samples);
        peakHoldDbfs = Math.max(peakHoldDbfs, frameEvidence.samplePeakDbfs);
        clippedSampleCountSinceStart += frameEvidence.clippedSampleCount;
        if (timestamp - lastPublishedAt >= 100) {
          setMeterEvidence(studioAudioMeterEvidence(frameEvidence, {
            previousPeakHoldDbfs: peakHoldDbfs,
            previousClippedSampleCount:
              clippedSampleCountSinceStart - frameEvidence.clippedSampleCount,
            sampleRateHz: context.sampleRate,
            channelCount: trackSettings.channelCount ?? 1,
            echoCancellation: typeof trackSettings.echoCancellation === "boolean"
              ? trackSettings.echoCancellation
              : null,
            noiseSuppression: typeof trackSettings.noiseSuppression === "boolean"
              ? trackSettings.noiseSuppression
              : null,
            autoGainControl: typeof trackSettings.autoGainControl === "boolean"
              ? trackSettings.autoGainControl
              : null,
          }));
          lastPublishedAt = timestamp;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      meterCleanupRef.current = () => {
        cancelAnimationFrame(frame);
        void context.close();
        setMeterEvidence(null);
      };
      setStatus("ready");
      setPreviewTested(true);
      suppressPreferenceWriteRef.current = false;
      setMessage("Preview is live. This is a device check only—nothing is sent or recorded.");
    } catch (error) {
      setStatus("error");
      setCameraEvidence(null);
      setMessage(error instanceof Error ? `Selected device could not start: ${error.message}` : "Selected device could not start.");
    }
  }, [cameraId, cameraWanted, cameras, clearPreflightPreview, microphoneId]);

  const leave = useCallback(async () => {
    clearPreflightPreview();
    roomRef.current?.disconnect(true);
    roomRef.current = null;
    clearRemoteMedia();
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setParticipants([]);
    setStatus("ended");
    setMessage("You left the call.");
  }, [clearPreflightPreview, clearRemoteMedia]);

  const join = useCallback(async () => {
    let selectedMicrophoneId = microphoneIdRef.current;
    let selectedCameraId = cameraIdRef.current;
    if (!selectedMicrophoneId || (cameraWanted && !selectedCameraId)) {
      await refreshDevices(cameraWanted ? "media" : "microphone", "manual");
      selectedMicrophoneId = microphoneIdRef.current;
      selectedCameraId = cameraIdRef.current;
    }
    if (!selectedMicrophoneId) {
      setStatus("error");
      setMessage("Microphone access is off. Allow it in this site's browser settings, then join again.");
      return;
    }
    if (cameraWanted && !selectedCameraId) {
      setStatus("error");
      setMessage("Camera access is off. Allow it in this site's browser settings, or turn the camera off and join again.");
      return;
    }
    setStatus("joining");
    setMessage("Joining…");
    try {
      clearPreflightPreview();
      const response = await fetch("/api/mobile/capture/rooms/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId,
          clientInstanceId: browserClientInstanceId(),
          clientKind: "web",
          deviceLabel: navigator.platform ? `Quipsly Web · ${navigator.platform}` : "Quipsly Web",
        }),
      });
      const packet = await response.json().catch(() => ({})) as JoinPacket;
      setRecordingConsentGranted(packet.recordingConsentGranted === true);
      if (!response.ok || !packet.ok || !packet.canJoin || !packet.serverUrl || !packet.participantToken) {
        throw new Error(packet.error || packet.nextAction || "This Session is not ready for a live room.");
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => attachRemoteTrack(track))
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((element) => element.remove()))
        .on(RoomEvent.ParticipantConnected, () => updateRoster(room))
        .on(RoomEvent.ParticipantDisconnected, () => updateRoster(room))
        .on(RoomEvent.ActiveSpeakersChanged, () => updateRoster(room))
        .on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
          const chatThreadKeys = [
            sessionChatThreadKey(callRoomId),
            episodeSlug ? episodeChatThreadKey(episodeSlug) : null,
          ].filter((threadKey): threadKey is string => Boolean(threadKey));
          if (topic === CHAT_PERSISTED_LIVE_TOPIC) {
            const hint = chatThreadKeys
              .map((threadKey) => decodeChatPersistedLiveHint(payload, threadKey))
              .find((candidate) => candidate !== null) ?? null;
            if (hint) dispatchChatPersistedIncoming(hint);
            return;
          }
          if (
            topic !== EPISODE_WATCH_LIVE_TOPIC
            || !projectSlug
            || !episodeSlug
          ) return;
          const hint = decodeEpisodeWatchLiveHint(payload, {
            projectSlug,
            episodeSlug,
            callRoomId,
          });
          if (hint) {
            dispatchEpisodeWatchIncoming(hint);
            onEpisodeWatchHint?.(hint);
          }
        })
        .on(RoomEvent.Reconnecting, () => {
          setStatus("reconnecting");
          setMessage("Connection interrupted. Reconnecting… Any local recording continues safely on this device.");
        })
        .on(RoomEvent.Reconnected, () => {
          setStatus("connected");
          setMessage("Reconnected.");
        })
        .on(RoomEvent.Disconnected, () => {
          setStatus("ended");
          setMessage("The call ended.");
          setParticipants([]);
          clearRemoteMedia();
        });

      await room.connect(packet.serverUrl, packet.participantToken);
      await room.switchActiveDevice("audioinput", selectedMicrophoneId);
      await room.localParticipant.setMicrophoneEnabled(!joinMuted, {
        deviceId: selectedMicrophoneId,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      setMicrophoneMuted(joinMuted);
      microphoneMutedRef.current = joinMuted;
      if (cameraWanted && selectedCameraId) {
        await room.switchActiveDevice("videoinput", selectedCameraId);
        const publication = await room.localParticipant.setCameraEnabled(true, {
          deviceId: selectedCameraId,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
        });
        const mediaTrack = publication?.track?.mediaStreamTrack;
        if (localVideoRef.current && mediaTrack) {
          localVideoRef.current.srcObject = new MediaStream([mediaTrack]);
          await localVideoRef.current.play().catch(() => undefined);
        }
      }
      suppressPreferenceWriteRef.current = false;
      room.remoteParticipants.forEach((participant: RemoteParticipant) => {
        participant.trackPublications.forEach((publication: RemoteTrackPublication) => {
          if (publication.track) attachRemoteTrack(publication.track);
        });
      });
      updateRoster(room);
      setStatus("connected");
      setMessage(packet.recordingConsentGranted
        ? "You’re connected. Recording is off."
        : "You’re connected. Recording will stay off until everyone consents.");
    } catch (error) {
      roomRef.current?.disconnect(true);
      roomRef.current = null;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The live room could not connect.");
    }
  }, [attachRemoteTrack, callRoomId, cameraWanted, clearPreflightPreview, clearRemoteMedia, episodeSlug, joinMuted, onEpisodeWatchHint, projectSlug, refreshDevices, updateRoster]);

  useEffect(() => {
    const threadKeys = new Set([
      sessionChatThreadKey(callRoomId),
      episodeSlug ? episodeChatThreadKey(episodeSlug) : null,
    ].filter((threadKey): threadKey is string => Boolean(threadKey)));
    if (!connected || !threadKeys.size) return;
    const publishPersistedHint = (event: Event) => {
      const hint = parseChatPersistedLiveHint((event as CustomEvent<unknown>).detail);
      const room = roomRef.current;
      if (!hint || !threadKeys.has(hint.threadKey) || !room || room.state === ConnectionState.Disconnected) return;
      void room.localParticipant.publishData(
        encodeChatPersistedLiveHint(hint),
        { reliable: true, topic: CHAT_PERSISTED_LIVE_TOPIC },
      ).catch(() => {
        // PostgreSQL plus the authenticated thread poll remains the delivery authority.
      });
    };
    window.addEventListener(CHAT_PERSISTED_OUTGOING_EVENT, publishPersistedHint);
    return () => window.removeEventListener(CHAT_PERSISTED_OUTGOING_EVENT, publishPersistedHint);
  }, [callRoomId, connected, episodeSlug]);

  useEffect(() => {
    if (!connected || !projectSlug || !episodeSlug) return;
    const publishWatchHint = (event: Event) => {
      const hint = parseEpisodeWatchLiveHint(
        (event as CustomEvent<unknown>).detail,
        { projectSlug, episodeSlug, callRoomId },
      );
      const room = roomRef.current;
      if (
        !hint
        || hint.receiptId === lastPublishedWatchReceiptRef.current
        || !room
        || room.state === ConnectionState.Disconnected
      ) return;
      lastPublishedWatchReceiptRef.current = hint.receiptId;
      void room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(hint)),
        { reliable: true, topic: EPISODE_WATCH_LIVE_TOPIC },
      ).catch(() => {
        // The durable Episode Room command log remains authoritative.
        lastPublishedWatchReceiptRef.current = "";
      });
    };
    window.addEventListener(EPISODE_WATCH_OUTGOING_EVENT, publishWatchHint);
    return () => window.removeEventListener(EPISODE_WATCH_OUTGOING_EVENT, publishWatchHint);
  }, [callRoomId, connected, episodeSlug, projectSlug]);

  useEffect(() => {
    const room = roomRef.current;
    if (
      !connected
      || !room
      || !episodeWatchHint
      || episodeWatchHint.receiptId === lastPublishedWatchReceiptRef.current
      || episodeWatchHint.projectSlug !== projectSlug
      || episodeWatchHint.episodeSlug !== episodeSlug
      || episodeWatchHint.callRoomId !== callRoomId
    ) return;
    lastPublishedWatchReceiptRef.current = episodeWatchHint.receiptId;
    void room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(episodeWatchHint)),
      { reliable: true, topic: EPISODE_WATCH_LIVE_TOPIC },
    ).catch(() => {
      // This channel is only a latency hint. The durable room poll remains authoritative.
      lastPublishedWatchReceiptRef.current = "";
    });
  }, [callRoomId, connected, episodeSlug, episodeWatchHint, projectSlug]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (microphoneMuted && microphoneRecoveryHeld) {
      setMessage("Choose a working microphone in settings before unmuting.");
      return;
    }
    const nextMuted = !microphoneMuted;
    await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    setMicrophoneMuted(nextMuted);
    microphoneMutedRef.current = nextMuted;
  }, [microphoneMuted, microphoneRecoveryHeld]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextEnabled = !cameraWanted || cameraMuted;
    if (nextEnabled && !cameraId) {
      setMessage("Choose a usable camera before starting video.");
      return;
    }
    await room.localParticipant.setCameraEnabled(nextEnabled, nextEnabled && cameraId ? { deviceId: cameraId } : undefined);
    setCameraWanted(true);
    setCameraMuted(!nextEnabled);
    cameraMutedRef.current = !nextEnabled;
  }, [cameraId, cameraMuted, cameraWanted]);

  const chooseMicrophone = useCallback(async (nextId: string) => {
    if (!nextId || nextId === microphoneId) return;
    if (sourceLocked) {
      setMessage("Stop the retained local source before changing microphones. Quipsly will not relabel a recording after its source is locked.");
      return;
    }
    const previousId = microphoneId;
    suppressPreferenceWriteRef.current = false;
    const room = roomRef.current;
    try {
      if (connected && room) {
        await room.switchActiveDevice("audioinput", nextId);
        if (!microphoneMuted) {
          await room.localParticipant.setMicrophoneEnabled(true, {
            deviceId: nextId,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
        }
      }
      setMicrophoneId(nextId);
      microphoneIdRef.current = nextId;
      setMicrophoneRecoveryHeld(false);
      if (!connected) {
        clearPreflightPreview();
        setStatus("preflight");
      }
      const label = microphones.find((device) => device.deviceId === nextId)?.label || "selected microphone";
      setMessage(connected ? `Microphone switched to ${label}.` : `Microphone selected: ${label}.`);
    } catch (error) {
      setMicrophoneId(previousId);
      microphoneIdRef.current = previousId;
      setMessage(error instanceof Error ? `Microphone switch failed: ${error.message}` : "Microphone switch failed.");
    }
  }, [clearPreflightPreview, connected, microphoneId, microphoneMuted, microphones, sourceLocked]);

  const chooseCamera = useCallback(async (nextId: string) => {
    if (!nextId || nextId === cameraId) return;
    if (sourceLocked) {
      setMessage("Stop the retained local source before changing cameras. The active take keeps its original measured source profile.");
      return;
    }
    const previousId = cameraId;
    suppressPreferenceWriteRef.current = false;
    const room = roomRef.current;
    try {
      if (connected && room && cameraWanted && !cameraMuted) {
        await room.switchActiveDevice("videoinput", nextId);
        const publication = await room.localParticipant.setCameraEnabled(true, { deviceId: nextId });
        const mediaTrack = publication?.track?.mediaStreamTrack;
        if (localVideoRef.current && mediaTrack) {
          localVideoRef.current.srcObject = new MediaStream([mediaTrack]);
          await localVideoRef.current.play().catch(() => undefined);
        }
      }
      setCameraId(nextId);
      cameraIdRef.current = nextId;
      if (!connected) {
        clearPreflightPreview();
        setStatus("preflight");
      } else {
        setCameraEvidence(null);
      }
      const label = cameras.find((device) => device.deviceId === nextId)?.label || "selected camera";
      setMessage(connected ? `Camera switched to ${label}.` : `Camera selected: ${label}.`);
    } catch (error) {
      setCameraId(previousId);
      cameraIdRef.current = previousId;
      setMessage(error instanceof Error ? `Camera switch failed: ${error.message}` : "Camera switch failed.");
    }
  }, [cameraId, cameraMuted, cameraWanted, cameras, clearPreflightPreview, connected, sourceLocked]);

  const chooseOutput = useCallback((nextId: string) => {
    suppressPreferenceWriteRef.current = false;
    setOutputId(nextId);
    outputIdRef.current = nextId;
    const label = outputs.find((device) => device.deviceId === nextId)?.label || "system default";
    setMessage(`Speaker output set to ${label}.`);
  }, [outputs]);

  const chooseAudioOutput = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices as MediaDevices & {
      selectAudioOutput?: () => Promise<MediaDeviceInfo>;
    };
    if (!mediaDevices.selectAudioOutput) {
      setMessage("Choose the MV7i or other headphone output in macOS Sound settings for this browser.");
      return;
    }
    try {
      const selected = await mediaDevices.selectAudioOutput();
      const option = { deviceId: selected.deviceId, label: readableDeviceLabel(selected, outputs.length) };
      setOutputs((current) => current.some((item) => item.deviceId === option.deviceId) ? current : [...current, option]);
      setOutputId(option.deviceId);
      outputIdRef.current = option.deviceId;
      suppressPreferenceWriteRef.current = false;
      setMessage(`Speaker output set to ${option.label}.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Headphone output was not changed: ${error.message}` : "Headphone output was not changed.");
    }
  }, [outputs.length]);

  useEffect(() => {
    setSupportsOutputSelection(audioOutputSupported(document.createElement("audio")));
    setSupportsOutputPrompt(typeof (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: unknown } | undefined)?.selectAudioOutput === "function");
    void refreshDevices("none", "initial");
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refreshDevices("none", "devicechange"), 250);
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
      meterCleanupRef.current?.();
      stopStream(preflightStreamRef.current);
      roomRef.current?.disconnect(true);
      clearRemoteMedia();
    };
  }, [clearRemoteMedia, refreshDevices]);

  useEffect(() => {
    const microphone = microphones.find((device) => device.deviceId === microphoneId);
    const camera = cameras.find((device) => device.deviceId === cameraId);
    const output = outputs.find((device) => device.deviceId === outputId);
    if (!microphone && !camera && !output) return;
    if (suppressPreferenceWriteRef.current) {
      suppressPreferenceWriteRef.current = false;
      return;
    }
    window.localStorage.setItem(PREFERRED_DEVICES_KEY, JSON.stringify({
      microphoneId: microphone?.deviceId,
      microphoneLabel: microphone?.label,
      cameraId: camera?.deviceId,
      cameraLabel: camera?.label,
      outputId: output?.deviceId,
      outputLabel: output?.label,
      cameraWanted,
      joinMuted,
    } satisfies PreferredDevices));
  }, [cameraId, cameraWanted, cameras, joinMuted, microphoneId, microphones, outputId, outputs]);

  useEffect(() => {
    if (!connected || !outputId) return;
    remoteMediaRef.current?.querySelectorAll("audio").forEach((element) => void routeAudioOutput(element));
  }, [connected, outputId, routeAudioOutput]);

  useEffect(() => {
    void refreshProviderRecording(false);
    const interval = window.setInterval(() => void refreshProviderRecording(false), 12_000);
    return () => window.clearInterval(interval);
  }, [refreshProviderRecording]);

  const handlePreparationStateChange = useCallback((state: {
    participantReady: boolean;
    everyoneReady: boolean;
  }) => {
    setRecordingConsentGranted(state.participantReady);
  }, []);

  const retainedSourceControls = typeof captureGroupId === "string" && captureGroupId.trim() ? (
    <BrowserSourceRecorder
      key={`${callRoomId}:${captureGroupId.trim()}`}
      callRoomId={callRoomId}
      captureGroupId={captureGroupId.trim()}
      sessionTitle={sessionTitle}
      sessionKind={experience.captureProfile}
      projectSlug={projectSlug}
      episodeSlug={episodeSlug}
      microphoneId={microphoneId}
      microphoneLabel={microphones.find((device) => device.deviceId === microphoneId)?.label || ""}
      cameraId={cameraId}
      cameraLabel={cameras.find((device) => device.deviceId === cameraId)?.label || ""}
      conversationConnected={connected}
      onSourceLockChange={setSourceLocked}
      onGuardianEvidenceChange={setRetainedGuardianEvidence}
      onPreparationStateChange={handlePreparationStateChange}
    />
  ) : (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" aria-label="Retained source unavailable">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><CircleAlert size={16} aria-hidden="true" /> Conversation available · recording held</p>
      <p className="mt-2 text-sm font-semibold leading-6">You can still join the call, but recording is unavailable for this Session.</p>
      <p className="mt-2 text-[10px] font-black leading-4">Refresh the Session. If recording is still unavailable, ask the host to reopen it.</p>
    </section>
  );

  return (
    <section className={`overflow-hidden rounded-[1.75rem] border border-[#d8c7a7] bg-[#fffdf8] shadow-sm ${compact ? "p-4" : "p-5 sm:p-7"}`} aria-labelledby={`live-room-${callRoomId}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-800"><Radio size={14} aria-hidden="true" /> Call · {experience.label}</p>
          <h2 id={`live-room-${callRoomId}`} className="mt-2 font-serif text-3xl font-black text-[#3d3122]">{sessionTitle}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected ? <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-900">{participants.length} in call</span> : null}
          <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${connected ? "border-emerald-300 bg-emerald-50 text-emerald-900" : status === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-violet-200 bg-violet-50 text-violet-900"}`}>{statusLabel}</span>
        </div>
      </div>

      <div className={`mt-5 grid gap-4 ${narrow ? "" : "xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]"}`}>
        <div className="space-y-4">
          {!connected ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4" aria-label="Ready to join">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">Ready to join?</p>
                  <h3 className="mt-1 font-serif text-2xl font-black text-violet-950">Check how you’ll enter the call</h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-violet-900">
                    {microphones.find((device) => device.deviceId === microphoneId)?.label || "Microphone not available yet"}
                    {cameraWanted ? ` · ${cameras.find((device) => device.deviceId === cameraId)?.label || "Camera not available yet"}` : " · Camera off"}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${previewTested ? "bg-emerald-100 text-emerald-950" : "bg-white text-violet-950"}`}>
                  {previewTested ? "Preview checked" : "Preview optional"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setJoinMuted((current) => !current)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-black ${joinMuted ? "bg-rose-100 text-rose-950" : "border border-violet-200 bg-white text-violet-950"}`}
                  aria-pressed={joinMuted}
                >
                  {joinMuted ? <MicOff size={16} /> : <Mic size={16} />}{joinMuted ? "Muted" : "Mic on"}
                </button>
                <button
                  type="button"
                  onClick={() => setCameraWanted((current) => !current)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-black ${cameraWanted ? "border border-violet-200 bg-white text-violet-950" : "bg-rose-100 text-rose-950"}`}
                  aria-pressed={cameraWanted}
                >
                  {cameraWanted ? <Camera size={16} /> : <CameraOff size={16} />}{cameraWanted ? "Camera on" : "Camera off"}
                </button>
                <button type="button" onClick={() => void join()} disabled={status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-6 text-xs font-black text-white disabled:opacity-50">
                  {status === "joining" ? <LoaderCircle size={15} className="animate-spin" /> : <Radio size={15} />} Join call
                </button>
              </div>
              <p className="mt-3 text-[11px] font-bold text-violet-900">Joining doesn’t start recording.</p>
            </section>
          ) : null}

          <div className={`relative overflow-hidden rounded-2xl border border-[#d8c7a7] bg-[#211a14] ${!connected && !cameraWanted ? "h-28" : ""}`}>
            <video ref={localVideoRef} muted playsInline className={`w-full object-cover ${!connected && !cameraWanted ? "h-full" : "aspect-video"} ${cameraWanted && !cameraMuted ? "" : "opacity-20"}`} />
            {!cameraWanted || cameraMuted ? <div className="absolute inset-0 grid place-items-center text-center text-[#f5dfb9]"><div><CameraOff className="mx-auto" aria-hidden="true" /><p className="mt-2 text-xs font-black uppercase tracking-wide">Camera off</p></div></div> : null}
            <div className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white">You · {sessionTitle}</div>
          </div>

          {connected ? (
            <div className="flex flex-wrap gap-2" aria-label="Call controls">
              <button type="button" onClick={() => void toggleMicrophone()} disabled={microphoneMuted && microphoneRecoveryHeld} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-black uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-45 ${microphoneMuted ? "bg-rose-100 text-rose-900" : "bg-[#3e2f21] text-white"}`}>{microphoneMuted ? <MicOff size={16} /> : <Mic size={16} />}{microphoneMuted ? "Unmute" : "Mute"}</button>
              <button type="button" onClick={() => void toggleCamera()} disabled={sourceLocked || ((!cameraWanted || cameraMuted) && !cameraId)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-black uppercase tracking-wide disabled:opacity-45 ${!cameraWanted || cameraMuted ? "bg-rose-100 text-rose-900" : "border border-[#d8c7a7] bg-white text-[#5b472f]"}`}>{!cameraWanted || cameraMuted ? <CameraOff size={16} /> : <Camera size={16} />}{!cameraWanted || cameraMuted ? "Start camera" : "Stop camera"}</button>
              <button type="button" onClick={() => void leave()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-800 px-4 text-xs font-black uppercase tracking-wide text-white"><PhoneOff size={16} /> Leave</button>
            </div>
          ) : null}

          <details className="rounded-2xl border border-[#d8c7a7] bg-white p-4" open={!connected && (!microphoneId || (cameraWanted && !cameraId))}>
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">Audio and video settings</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2" role="group" aria-label={connected ? "Live studio devices" : "Preflight studio devices"}>
            <label className="text-xs font-black uppercase tracking-wide text-[#5b472f]">Microphone
              <select value={microphoneId} disabled={sourceLocked} onChange={(event) => void chooseMicrophone(event.target.value)} className="mt-1 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal disabled:cursor-not-allowed disabled:opacity-55">
                <option value="">Choose a microphone</option>{microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-[#5b472f]">Camera
              <select value={cameraId} disabled={sourceLocked} onChange={(event) => void chooseCamera(event.target.value)} className="mt-1 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal disabled:cursor-not-allowed disabled:opacity-55">
                <option value="">Choose a camera</option>{cameras.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-[#5b472f]">Headphones / output
              <select value={outputId} disabled={!supportsOutputSelection} onChange={(event) => chooseOutput(event.target.value)} className="mt-1 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal disabled:opacity-50">
                <option value="">System default</option>{outputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
              {!supportsOutputSelection ? <span className="mt-1 block text-[10px] font-bold normal-case tracking-normal text-[#8a7354]">This browser uses the macOS or system output. Choose the MV7i headphones there.</span> : null}
              {supportsOutputPrompt ? <button type="button" onClick={() => void chooseAudioOutput()} className="mt-2 min-h-9 rounded-full border border-sky-300 bg-sky-50 px-3 text-[10px] font-black normal-case tracking-normal text-sky-950">Choose headphone output…</button> : null}
            </label>
            {!connected ? <div className="flex min-h-12 items-center rounded-xl border border-[#d8c7a7] bg-[#fffaf0] px-3 text-xs font-bold leading-5 text-[#765f40]">
              Your choices above are remembered on this browser. If a device is unplugged, Quipsly safely falls back to an available one.
            </div> : <div className={`flex min-h-12 items-center rounded-xl border px-3 text-xs font-black leading-5 ${sourceLocked ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
              {sourceLocked ? "Device switching is locked until this retained take stops." : "You can switch call devices live. Retained recording still starts separately."}
            </div>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!connected && (!microphoneId || (cameraWanted && !cameraId)) ? <>
              <button type="button" aria-label={`Allow microphone${cameraWanted ? " and camera" : ""}`} onClick={() => void refreshDevices(cameraWanted ? "media" : "microphone")} disabled={status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8c7a7] bg-white px-4 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50">{status === "checking" ? <LoaderCircle size={15} className="animate-spin" /> : <Mic size={15} />} Use microphone{cameraWanted ? " and camera" : ""}</button>
            </> : null}
            {!connected ? <button type="button" aria-label="Test selected setup" onClick={() => void startSelectedPreview()} disabled={!microphoneId || (cameraWanted && !cameraId) || status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-violet-50 px-4 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50"><Video size={15} /> Preview</button> : null}
            <button type="button" onClick={() => void refreshDevices("none", "manual")} disabled={status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8c7a7] bg-white px-4 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50"><RefreshCw size={15} /> Refresh devices</button>
          </div>

          {!connected ? (
            <details className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-violet-900">Optional sound check</summary>
              <div className="mt-3">
              <StudioSoundCheck
                getInputStream={currentPreflightStream}
                microphoneLabel={microphones.find((device) => device.deviceId === microphoneId)?.label || ""}
                outputId={outputId}
                evidence={meterEvidence}
                setupKey={[microphoneId, cameraWanted ? cameraId : "camera-off", outputId || "system-output"].join(":")}
                onDecision={saveSoundCheckDecision}
                disabled={!preflightStreamRef.current || status !== "ready"}
              />
              </div>
            </details>
          ) : null}
          </details>

          {experience.captureProfile === "coaching" ? retainedSourceControls : null}
          <p role="status" aria-live="polite" className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm font-bold leading-6 text-violet-950">{message}</p>

          <div ref={remoteMediaRef} className="grid gap-3 md:grid-cols-2" aria-label="Remote participant media" />

          <StudioInputEvidenceMeter evidence={meterEvidence} />
          {cameraWanted ? <StudioCameraEvidence cameraLabel={cameras.find((device) => device.deviceId === cameraId)?.label || ""} evidence={cameraEvidence} /> : null}
        </div>

        <aside className="space-y-3">
          <details className="rounded-2xl border border-[#d8c7a7] bg-white p-4" open={["recording", "needs-review"].includes(providerRecordingState)}>
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">More call and recording options</summary>
            <div className="mt-3 space-y-3">
          <p className="rounded-xl bg-[#fffaf0] p-3 text-xs font-semibold leading-5 text-[#765f40]">{experience.liveDescription}</p>
          <details className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950" open={["recording", "needs-review"].includes(providerRecordingState)}>
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wide">Backup recording details · {providerRecordingStateLabel}</summary>
          <div className={`mt-3 rounded-2xl border p-4 ${providerRecordingState === "recording" ? "border-rose-300 bg-rose-50 text-rose-950" : providerRecordingState === "needs-review" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-white text-sky-950"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                {providerRecordingState === "recording" ? <Cloud className="text-rose-800" aria-hidden="true" /> : providerRecordingState === "needs-review" ? <CircleAlert className="text-amber-800" aria-hidden="true" /> : <CloudOff className="text-sky-800" aria-hidden="true" />}
                <h3 className="mt-2 font-serif text-xl font-black">Cloud recording backup: {providerRecordingStateLabel}</h3>
              </div>
            </div>
            <p className="mt-2 text-xs font-bold leading-5">{providerRecordingMessage}</p>
            <p className="mt-3 rounded-xl bg-white/80 p-3 text-[10px] font-black leading-4">Turning this copy off cannot change take synchronization. Alignment comes from the shared capture group, device clock and START receipts, protected local masters, and waveform/drift review.</p>

            {providerRecording?.canOperate && providerRecordingState === "recording" ? (
              <button type="button" disabled={providerRecordingBusy} onClick={() => void runProviderRecordingAction("STOP_EGRESS")} className="mt-3 min-h-10 rounded-full bg-rose-900 px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">
                {providerRecordingBusy ? "Stopping safely…" : "Stop backup recording"}
              </button>
            ) : null}

            {providerRecording?.canOperate && !["recording", "starting", "stopping", "needs-review"].includes(providerRecordingState) && providerRecording.configured && providerRecording.enabled ? (
              providerStartArmed ? (
                <div className="mt-3 rounded-xl border border-sky-300 bg-white p-3">
                  <p className="text-xs font-black">Start an optional cloud recording backup?</p>
                  <p className="mt-1 text-[10px] font-bold leading-4">This creates a convenient reference copy. It does not replace the high-quality recordings saved on each device.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={providerRecordingBusy} onClick={() => void runProviderRecordingAction("START_EGRESS")} className="min-h-10 rounded-full bg-sky-900 px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{providerRecordingBusy ? "Starting safely…" : "Start backup recording"}</button>
                    <button type="button" disabled={providerRecordingBusy} onClick={() => setProviderStartArmed(false)} className="min-h-10 rounded-full border border-sky-300 bg-white px-4 text-xs font-black uppercase tracking-wide">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setProviderStartArmed(true)} className="mt-3 min-h-10 rounded-full border border-sky-300 bg-white px-4 text-xs font-black uppercase tracking-wide text-sky-950">Cloud recording backup</button>
              )
            ) : null}

            {providerRecording?.canOperate && (!providerRecording.configured || !providerRecording.enabled) ? (
              <p className="mt-3 text-[10px] font-black uppercase tracking-wide">Cloud backup is unavailable. Local recording remains fully usable.</p>
            ) : null}
          </div>
          </details>
          <div className="rounded-2xl border border-[#d8c7a7] bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#5b472f]"><Users size={15} /> In this room · {participants.length}</div>
            <div className="mt-3 space-y-2">{participants.length ? participants.map((participant) => <div key={participant.identity} className="flex items-center justify-between rounded-xl bg-[#fffaf0] px-3 py-2 text-sm font-bold text-[#5b472f]"><span>{participant.name}</span><span className={`h-2.5 w-2.5 rounded-full ${participant.speaking ? "bg-emerald-500 ring-4 ring-emerald-100" : "bg-[#cdbb9a]"}`} aria-label={participant.speaking ? "Speaking" : "Quiet"} /></div>) : <p className="text-xs font-semibold leading-5 text-[#8a7354]">The roster appears after you join. iPhone and browser devices can represent the same person without replacing each other.</p>}</div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs font-bold leading-5 text-sky-950">
            <Smartphone aria-hidden="true" />
            <p className="mt-2">Best quality: use headphones for the call, then run local Capture on each source device. Quipsly aligns those retained originals to the Session clock for transcript and editor handoff.</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-950">
            <Headphones aria-hidden="true" />
            <p className="mt-2">For your MV7i: choose it as microphone and choose its headphone output here when supported. Safari may require selecting it in macOS Sound instead.</p>
          </div>
            </div>
          </details>
        </aside>
      </div>
      <div className="mt-5 space-y-4">
        {experience.captureProfile === "episode" ? retainedSourceControls : null}
        <details className="rounded-2xl border border-[#d8c7a7] bg-white p-4">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">
            Recording safety details
          </summary>
          <div className="mt-4">
            <SessionGuardianCard projection={guardianProjection} />
          </div>
        </details>
      </div>
    </section>
  );
}
