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
  Settings2,
  Ellipsis,
  Smartphone,
  ScreenShare,
  ScreenShareOff,
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
  TrackPublication,
  type Participant,
} from "livekit-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BrowserSourceRecorder } from "@/components/browser-source-recorder";
import { CallWorkspacePanel } from "@/components/call-workspace-panel";
import { CallPeoplePanel } from "@/components/call-people-panel";
import { CallFollowThrough } from "@/components/call-follow-through";
import type { BrowserRecordingHandoff } from "@/lib/browser-source-upload-recovery";
import { BrowserRecordingMicrophone } from "@/lib/browser-recording-microphone";
import { CallParticipantGallery, type CallParticipant, type CallParticipantVideo } from "@/components/call-participant-gallery";
import { SessionGuardianCard } from "@/components/session-guardian-card";
import { browserClientInstanceId } from "@/lib/browser-client-instance";
import { requestBrowserMedia } from "@/lib/browser-media-request";
import { StudioSoundCheck } from "@/components/studio-sound-check";
import { StudioSpeakerTest } from "@/components/studio-speaker-test";
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
import { dispatchQuipslyProductEvent } from "@/lib/product-analytics";
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
import { useActiveMediaLifecycle } from "@/hooks/use-active-media-lifecycle";
import { useCallScreenShare } from "@/hooks/use-call-screen-share";

type DeviceOption = { deviceId: string; label: string };
type CallAudioMode = "this-device" | "other-device";
type PreferredDevices = {
  microphoneId?: string;
  microphoneLabel?: string;
  cameraId?: string;
  cameraLabel?: string;
  outputId?: string;
  outputLabel?: string;
  cameraWanted?: boolean;
  joinMuted?: boolean;
  callAudioMode?: CallAudioMode;
};
type JoinPacket = {
  ok?: boolean;
  code?: string;
  error?: string;
  canJoin?: boolean;
  serverUrl?: string;
  participantToken?: string;
  participantId?: string;
  roomName?: string;
  recordingConsentGranted?: boolean;
  recordingConsentStatus?: string;
  providerReadiness?: string;
  localFallback?: {
    available?: boolean;
    safeToRecordLocally?: boolean;
    reason?: string;
    nextAction?: string;
  };
  nextAction?: string;
};

class CallJoinFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "CallJoinFailure";
  }
}

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
export type LiveSessionMicrophoneControl = { muted: boolean; disabled: boolean; toggle: () => Promise<void> };

function readableDeviceLabel(device: MediaDeviceInfo, index: number) {
  return device.label || `${device.kind === "audioinput" ? "Microphone" : device.kind === "videoinput" ? "Camera" : "Output"} ${index + 1}`;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function retainedMediaPermissionState(name: "microphone" | "camera") {
  if (!navigator.permissions?.query) return "unsupported" as const;
  try {
    return (await navigator.permissions.query({ name: name as PermissionName })).state;
  } catch {
    // Safari and some embedded browsers expose the Permissions API without
    // accepting camera/microphone descriptors. Never turn that into a prompt.
    return "unsupported" as const;
  }
}

function waitForDeviceEnumeration(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function enumerateDevicesAfterPermissionSettles(
  permission: "none" | "microphone" | "camera" | "media",
) {
  const requiredKinds: MediaDeviceKind[] = permission === "media"
    ? ["audioinput", "videoinput"]
    : permission === "microphone"
      ? ["audioinput"]
      : permission === "camera"
        ? ["videoinput"]
        : [];
  const retryDelays = requiredKinds.length ? [100, 200, 400] : [];
  let devices = await navigator.mediaDevices.enumerateDevices();

  for (const delay of retryDelays) {
    const allRequiredDevicesVisible = requiredKinds.every((kind) =>
      devices.some((device) => device.kind === kind && device.deviceId),
    );
    if (allRequiredDevicesVisible) break;
    // Browsers can resolve getUserMedia before enumerateDevices has published
    // the newly granted input IDs. Give that standard permission transition a
    // short bounded settle window instead of telling the person no microphone
    // exists or making them press Refresh devices.
    await waitForDeviceEnumeration(delay);
    devices = await navigator.mediaDevices.enumerateDevices();
  }

  return devices;
}

function audioOutputSupported(element: HTMLMediaElement | null) {
  return Boolean(element && "setSinkId" in element);
}

const PREFERRED_DEVICES_KEY = "quipsly-live-preferred-devices-v3";
const PREVIOUS_PREFERRED_DEVICES_KEY = "quipsly-live-preferred-devices-v2";
const LEGACY_PREFERRED_DEVICES_KEY = "quipsly-live-preferred-devices-v1";

function readPreferredDevices(): PreferredDevices {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(PREFERRED_DEVICES_KEY)
        || window.localStorage.getItem(PREVIOUS_PREFERRED_DEVICES_KEY)
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

export function liveMicrophoneStatusPresentation({
  evidence,
  muted,
  recoveryHeld,
}: {
  evidence: StudioAudioMeterEvidence | null;
  muted: boolean;
  recoveryHeld: boolean;
}) {
  const state = recoveryHeld
    ? "attention"
    : muted
      ? "muted"
      : evidence?.state ?? "checking";
  return state === "attention"
    ? { label: "Microphone needs attention", style: "border-rose-300 bg-rose-50 text-rose-950", dot: "bg-rose-600" }
    : state === "muted"
      ? { label: "Microphone muted", style: "border-slate-300 bg-slate-50 text-slate-800", dot: "bg-slate-500" }
      : state === "no-signal"
        ? { label: "No microphone signal", style: "border-rose-300 bg-rose-50 text-rose-950", dot: "bg-rose-600" }
        : state === "low"
          ? { label: "Microphone is low", style: "border-amber-300 bg-amber-50 text-amber-950", dot: "bg-amber-500" }
          : state === "hot"
            ? { label: "Microphone is loud", style: "border-amber-300 bg-amber-50 text-amber-950", dot: "bg-amber-500" }
            : state === "clipping-risk"
              ? { label: "Microphone may clip", style: "border-rose-300 bg-rose-50 text-rose-950", dot: "bg-rose-600" }
              : state === "ready"
                ? { label: "Microphone level looks good", style: "border-emerald-300 bg-emerald-50 text-emerald-950", dot: "bg-emerald-600" }
                : { label: "Checking microphone", style: "border-violet-200 bg-violet-50 text-violet-950", dot: "bg-violet-500" };
}

function LiveMicrophoneStatus({
  evidence,
  muted,
  recoveryHeld,
  compact = false,
}: {
  evidence: StudioAudioMeterEvidence | null;
  muted: boolean;
  recoveryHeld: boolean;
  compact?: boolean;
}) {
  const presentation = liveMicrophoneStatusPresentation({ evidence, muted, recoveryHeld });

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-black ${compact ? "min-h-6 px-3 text-[10px]" : "min-h-11 px-4 text-xs"} ${presentation.style}`}
      aria-label={`Live microphone status: ${presentation.label}`}
      data-testid="live-microphone-status"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${presentation.dot}`} aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

function PreJoinMicrophoneActivity({
  evidence,
  muted,
}: {
  evidence: StudioAudioMeterEvidence | null;
  muted: boolean;
}) {
  const measured = liveMicrophoneStatusPresentation({
    evidence,
    muted,
    recoveryHeld: false,
  });
  const presentation = !muted && evidence?.state === "no-signal"
    ? { ...measured, label: "Listening for your voice", style: "border-border text-muted-foreground", dot: "bg-muted-foreground" }
    : measured;
  const level = muted
    ? 0
    : studioAudioDbfsPercent(
        evidence?.rmsDbfs ?? STUDIO_AUDIO_DISPLAY_FLOOR_DBFS,
      );

  return (
    <div
      className={`mt-3 rounded-xl border bg-card p-3 ${presentation.style}`}
      aria-label={`Pre-join microphone status: ${presentation.label}`}
      data-testid="prejoin-microphone-activity"
    >
      <div className="flex items-center justify-between gap-3 text-xs font-semibold">
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${presentation.dot}`}
            aria-hidden="true"
          />
          {presentation.label}
        </span>
        <span>{muted ? "Muted" : "Speak normally"}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-black/10"
        role="meter"
        aria-label="Microphone activity"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${
            evidence?.state === "clipping-risk" ||
            evidence?.state === "no-signal"
              ? "bg-rose-600"
              : evidence?.state === "hot" || evidence?.state === "low"
                ? "bg-amber-500"
                : "bg-emerald-600"
          }`}
          style={{ width: `${level}%` }}
        />
      </div>
    </div>
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
  onProtectionChange,
  leaveRequestVersion = 0,
  onExitComplete,
  compact = false,
  narrow = false,
  showSessionHeading = true,
  controlsContainer = null,
  stageLayout = false,
  onOpenSessionWork,
  toolPanelContainer = null,
  activeToolPanel,
  onToolPanelChange,
  collaborationControls,
  onMicrophoneControlChange,
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
  onProtectionChange?: (protectedSourceActive: boolean) => void;
  leaveRequestVersion?: number;
  onExitComplete?: () => void;
  compact?: boolean;
  narrow?: boolean;
  showSessionHeading?: boolean;
  controlsContainer?: HTMLElement | null;
  stageLayout?: boolean;
  onOpenSessionWork?: () => void;
  toolPanelContainer?: HTMLElement | null;
  activeToolPanel?: "devices" | "recording" | "details" | "people" | null;
  onToolPanelChange?: (panel: "devices" | "recording" | "details" | "people" | null) => void;
  collaborationControls?: ReactNode;
  onMicrophoneControlChange?: (control: LiveSessionMicrophoneControl | null) => void;
}) {
  const router = useRouter();
  const [localToolPanel, setLocalToolPanel] = useState<"devices" | "recording" | "details" | "people" | null>(null);
  const toolPanel = activeToolPanel === undefined ? localToolPanel : activeToolPanel;
  const setToolPanel = useCallback((panel: "devices" | "recording" | "details" | "people" | null) => {
    if (onToolPanelChange) onToolPanelChange(panel);
    else setLocalToolPanel(panel);
  }, [onToolPanelChange]);
  const closeToolPanel = useCallback(() => setToolPanel(null), [setToolPanel]);
  const [consentContainer, setConsentContainer] = useState<HTMLDivElement | null>(null);
  const experience = useMemo(
    () => sessionExperienceForPurpose(purpose || (kind === "episode" ? "PODCAST" : "COACHING")),
    [kind, purpose],
  );
  const [status, setStatus] = useState<LiveSessionRoomStatus>("preflight");
  const [message, setMessage] = useState("Preparing your microphone and camera…");
  const [technicalMessage, setTechnicalMessage] = useState<string | null>(null);
  const [showCallNotice, setShowCallNotice] = useState(false);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [cameraWanted, setCameraWanted] = useState(experience.defaultCamera);
  const [callAudioMode, setCallAudioMode] = useState<CallAudioMode>("this-device");
  const [callAudioModeBusy, setCallAudioModeBusy] = useState(false);
  const [joinMuted, setJoinMuted] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [microphoneRecoveryHeld, setMicrophoneRecoveryHeld] = useState(false);
  const microphoneToggleInFlightRef = useRef(false);
  const [cameraMuted, setCameraMuted] = useState(false);
  const [cameraToggleBusy, setCameraToggleBusy] = useState(false);
  const [cameraControlError, setCameraControlError] = useState<string | null>(null);
  const cameraToggleInFlightRef = useRef(false);
  const cameraOperationGenerationRef = useRef(0);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [recordingControlContainer, setRecordingControlContainer] = useState<HTMLDivElement | null>(null);
  const [meterEvidence, setMeterEvidence] = useState<StudioAudioMeterEvidence | null>(null);
  const [cameraEvidence, setCameraEvidence] = useState<StudioCameraInputEvidence | null>(null);
  const [previewTested, setPreviewTested] = useState(false);
  const [supportsOutputSelection, setSupportsOutputSelection] = useState(false);
  const [supportsOutputPrompt, setSupportsOutputPrompt] = useState(false);
  const [sourceLocked, setSourceLocked] = useState(false);
  const [leaveAfterSourceStops, setLeaveAfterSourceStops] = useState(false);
  const [sourceStopRequestVersion, setSourceStopRequestVersion] = useState(0);
  const recorderIdentity = `${callRoomId}:${captureGroupId?.trim() || ""}`;
  const [recordingHandoff, setRecordingHandoff] = useState<{identity: string; value: BrowserRecordingHandoff | null} | null>(null);
  const handleRecordingHandoff = useCallback((value: BrowserRecordingHandoff | null) => {
    setRecordingHandoff({identity: recorderIdentity, value});
  }, [recorderIdentity]);
  const recordingMicrophone = useMemo(() => new BrowserRecordingMicrophone(), [recorderIdentity]);
  const [retainedGuardianState, setRetainedGuardianState] = useState<{
    identity: string; evidence: BrowserRetainedSourceGuardianEvidence;
  } | null>(null);
  const retainedGuardianEvidence = retainedGuardianState?.identity === recorderIdentity
    ? retainedGuardianState.evidence : null;
  const reportRetainedGuardianEvidence = useCallback((evidence: BrowserRetainedSourceGuardianEvidence) => {
    setRetainedGuardianState({identity: recorderIdentity, evidence});
  }, [recorderIdentity]);
  const [pageVisible, setPageVisible] = useState(true);
  const [providerRecording, setProviderRecording] = useState<ProviderRecordingState | null>(null);
  const [providerRecordingBusy, setProviderRecordingBusy] = useState(false);
  const [providerRecordingMessage, setProviderRecordingMessage] = useState(
    "Cloud recording backup is off. Local recording remains available.",
  );
  const [providerStartArmed, setProviderStartArmed] = useState(false);
  const [participantVideos, setParticipantVideos] = useState<CallParticipantVideo[]>([]);
  const [callRecoveryAvailable, setCallRecoveryAvailable] = useState(false);
  const [callEndedByPerson, setCallEndedByPerson] = useState(false);
  const [callPermanentlyClosed, setCallPermanentlyClosed] = useState(false);
  const [localRecordingFallback, setLocalRecordingFallback] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const deviceSettingsRef = useRef<HTMLDetailsElement | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const callJoinTrackedRef = useRef(false);
  const cameraWantedRef = useRef(cameraWanted);
  const callAudioModeRef = useRef(callAudioMode);
  const callAudioModeChangeInFlightRef = useRef(false);
  const microphoneIdRef = useRef(microphoneId);
  const cameraIdRef = useRef(cameraId);
  const outputIdRef = useRef(outputId);
  const microphoneMutedRef = useRef(microphoneMuted);
  const cameraMutedRef = useRef(cameraMuted);
  const sourceLockedRef = useRef(sourceLocked);
  const previousSourceLockedRef = useRef(sourceLocked);
  const deviceRefreshGenerationRef = useRef(0);
  const activePermissionRefreshesRef = useRef(0);
  const joinAttemptGenerationRef = useRef(0);
  const pendingMediaRequestRef = useRef<AbortController | null>(null);
  const suppressPreferenceWriteRef = useRef(false);
  const lastPublishedWatchReceiptRef = useRef("");
  const preflightStreamRef = useRef<MediaStream | null>(null);
  const localCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteMediaRef = useRef<HTMLDivElement | null>(null);
  const remoteTracksRef = useRef(new Map<string, RemoteTrack>());
  const remoteAudioElementsRef = useRef(new Map<string, {track: RemoteTrack; element: HTMLMediaElement}>());
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const audioMeterGenerationRef = useRef(0);
  const automaticPreviewAttemptedRef = useRef(false);
  const previewRequestGenerationRef = useRef(0);
  const lastLeaveRequestVersionRef = useRef(leaveRequestVersion);
  const providerRecordingRequestIdsRef = useRef<Record<"START_EGRESS" | "STOP_EGRESS", string | undefined>>({
    START_EGRESS: undefined,
    STOP_EGRESS: undefined,
  });

  const bindLocalVideoElement = useCallback((element: HTMLVideoElement | null) => {
    localVideoRef.current = element;
    if (!element) return;
    const previewStream = preflightStreamRef.current;
    const cameraTrack = localCameraTrackRef.current;
    element.srcObject = previewStream || (cameraTrack ? new MediaStream([cameraTrack]) : null);
    if (element.srcObject) void element.play().catch(() => undefined);
  }, []);

  const attachLocalCameraTrack = useCallback(async (
    mediaTrack: MediaStreamTrack | null | undefined,
  ) => {
    localCameraTrackRef.current = mediaTrack ?? null;
    const element = localVideoRef.current;
    if (!element) return;
    element.srcObject = mediaTrack ? new MediaStream([mediaTrack]) : null;
    if (mediaTrack) await element.play().catch(() => undefined);
  }, []);

  const connected = status === "connected" || status === "reconnecting";
  const screenShare = useCallScreenShare(connected ? roomRef.current : null);
  useEffect(() => {
    if (connected) return;
    cameraOperationGenerationRef.current += 1;
    cameraToggleInFlightRef.current = false;
    setCameraToggleBusy(false);
    setCameraControlError(null);
  }, [connected]);
  const mutedForNextJoin = callRecoveryAvailable ? microphoneMuted : joinMuted;
  const cameraEnabledForNextJoin = cameraWanted && !(callRecoveryAvailable && cameraMuted);
  const statusLabel = useMemo(() => {
    switch (status) {
      case "preflight": return "Ready to join";
      case "checking": return "Checking devices";
      case "ready": return "Ready to join";
      case "joining": return "Joining";
      case "connected": return "You’re connected";
      case "reconnecting": return "Reconnecting";
      case "ended": return callRecoveryAvailable ? "Call disconnected" : "Call ended";
      case "error": return "Needs attention";
    }
  }, [callRecoveryAvailable, status]);
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
    callAudioModeRef.current = callAudioMode;
  }, [callAudioMode]);

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

  useActiveMediaLifecycle({
    keepScreenAwake: connected || sourceLocked,
  });

  useEffect(() => {
    const preferred = readPreferredDevices();
    if (typeof preferred.cameraWanted === "boolean") {
      setCameraWanted(preferred.cameraWanted);
    }
    if (typeof preferred.joinMuted === "boolean") {
      setJoinMuted(preferred.joinMuted);
      setMicrophoneMuted(preferred.joinMuted);
    }
    if (preferred.callAudioMode === "other-device") {
      setCallAudioMode("other-device");
      setMicrophoneMuted(true);
    }
  }, []);

  useEffect(() => {
    const changed = () => setPageVisible(document.visibilityState === "visible");
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    onProtectionChange?.(sourceLocked || leaveAfterSourceStops);
  }, [leaveAfterSourceStops, onProtectionChange, sourceLocked]);

  const updateRoster = useCallback((room: Room) => {
    const active = new Set(room.activeSpeakers.map((participant) => participant.identity));
    setParticipants([
      {
        identity: room.localParticipant.identity,
        name: room.localParticipant.name || "You",
        speaking: active.has(room.localParticipant.identity),
        isLocal: true,
        microphoneMuted: !room.localParticipant.isMicrophoneEnabled,
      },
      ...Array.from(room.remoteParticipants.values()).map((participant) => ({
        identity: participant.identity,
        name: participant.name || "Participant",
        speaking: active.has(participant.identity),
        isLocal: false,
        microphoneMuted: !participant.isMicrophoneEnabled,
      })),
    ]);
  }, []);

  const clearRemoteMedia = useCallback(() => {
    remoteTracksRef.current.forEach(track => { if (track.kind === Track.Kind.Audio) track.detach().forEach(element => element.remove()); });
    remoteMediaRef.current?.replaceChildren();
    remoteTracksRef.current.clear();
    remoteAudioElementsRef.current.clear();
    setParticipantVideos([]);
  }, []);

  const stopAudioMeter = useCallback(() => {
    audioMeterGenerationRef.current += 1;
    meterCleanupRef.current?.();
    meterCleanupRef.current = null;
    setMeterEvidence(null);
  }, []);

  const clearPreflightPreview = useCallback(() => {
    pendingMediaRequestRef.current?.abort();
    pendingMediaRequestRef.current = null;
    previewRequestGenerationRef.current += 1;
    stopAudioMeter();
    stopStream(preflightStreamRef.current);
    preflightStreamRef.current = null;
    void attachLocalCameraTrack(null);
    setCameraEvidence(null);
    setPreviewTested(false);
  }, [attachLocalCameraTrack, stopAudioMeter]);
  const currentPreflightStream = useCallback(() => preflightStreamRef.current, []);

  const acquireMedia = useCallback(async (constraints: MediaStreamConstraints) => {
    pendingMediaRequestRef.current?.abort();
    const controller = new AbortController();
    pendingMediaRequestRef.current = controller;
    try {
      return await requestBrowserMedia(navigator.mediaDevices, constraints, controller.signal);
    } finally {
      if (pendingMediaRequestRef.current === controller) pendingMediaRequestRef.current = null;
    }
  }, []);

  const cancelDeviceSetup = useCallback(() => {
    deviceRefreshGenerationRef.current += 1;
    joinAttemptGenerationRef.current += 1;
    cameraOperationGenerationRef.current += 1;
    cameraToggleInFlightRef.current = false;
    setCameraToggleBusy(false);
    clearPreflightPreview();
    setStatus("preflight");
    setMessage("");
  }, [clearPreflightPreview]);

  const startAudioMeter = useCallback(async (audioTrack: MediaStreamTrack | null | undefined) => {
    stopAudioMeter();
    if (!audioTrack || audioTrack.readyState === "ended") return;
    const generation = audioMeterGenerationRef.current;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      await context.resume().catch(() => undefined);
      if (generation !== audioMeterGenerationRef.current) {
        void context.close();
        return;
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 2_048;
      const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const trackSettings = audioTrack.getSettings();
      let peakHoldDbfs = -120;
      let clippedSampleCountSinceStart = 0;
      let lastPublishedAt = 0;
      let frame = 0;
      const tick = (timestamp: number) => {
        if (generation !== audioMeterGenerationRef.current) return;
        if (audioTrack.readyState === "ended") {
          stopAudioMeter();
          return;
        }
        analyser.getFloatTimeDomainData(samples);
        const frameEvidence = analyseStudioAudioFrame(samples);
        peakHoldDbfs = Math.max(peakHoldDbfs, frameEvidence.samplePeakDbfs);
        clippedSampleCountSinceStart += frameEvidence.clippedSampleCount;
        if (timestamp - lastPublishedAt >= 100) {
          setMeterEvidence(studioAudioMeterEvidence(frameEvidence, {
            previousPeakHoldDbfs: peakHoldDbfs,
            previousClippedSampleCount:
              clippedSampleCountSinceStart - frameEvidence.clippedSampleCount,
            sampleRateHz: context?.sampleRate ?? null,
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
        source.disconnect();
        void context?.close();
        setMeterEvidence(null);
      };
    } catch {
      void context?.close();
      setMeterEvidence(null);
    }
  }, [stopAudioMeter]);

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

  const mountRemoteTrack = useCallback((track: RemoteTrack, container: HTMLDivElement) => {
    if (track.kind !== Track.Kind.Audio) return;
    const trackKey = track.sid || track.mediaStreamTrack.id;
    const previous = remoteAudioElementsRef.current.get(trackKey);
    if (previous && previous.track !== track) {
      previous.track.detach(previous.element);
      previous.element.remove();
    }
    // Subscription events and the post-connect snapshot can report the same
    // track. Reuse its element instead of creating a second playing stream.
    const element = previous?.track === track ? previous.element : track.attach();
    remoteAudioElementsRef.current.set(trackKey, {track, element});
    element.dataset.livekitTrackSid = trackKey;
    element.autoplay = true;
    if (track.kind === Track.Kind.Audio) {
      element.className = "hidden";
      const useAudioHere = callAudioModeRef.current === "this-device";
      element.muted = !useAudioHere;
      element.volume = useAudioHere ? 1 : 0;
      if (useAudioHere) void routeAudioOutput(element);
    }
    container.appendChild(element);
  }, [routeAudioOutput]);

  const bindRemoteMediaElement = useCallback((element: HTMLDivElement | null) => {
    remoteMediaRef.current = element;
    if (!element) return;
    element.replaceChildren();
    remoteTracksRef.current.forEach((track) => mountRemoteTrack(track, element));
  }, [mountRemoteTrack]);

  const attachRemoteTrack = useCallback((track: RemoteTrack, participant?: Participant) => {
    const trackKey = track.sid || track.mediaStreamTrack.id;
    remoteTracksRef.current.set(trackKey, track);
    if (track.kind === Track.Kind.Video) {
      if (participant) setParticipantVideos(current => [...current.filter(video => video.key !== trackKey), {identity: participant.identity, key: trackKey, track}]);
      return;
    }
    const container = remoteMediaRef.current;
    if (container) mountRemoteTrack(track, container);
  }, [mountRemoteTrack]);

  const detachRemoteTrack = useCallback((track: RemoteTrack) => {
    // React owns video nodes; detaching all tracks must not remove its nodes.
    if (track.kind === Track.Kind.Audio) track.detach().forEach((element) => element.remove());
    remoteAudioElementsRef.current.delete(track.sid || track.mediaStreamTrack.id);
    remoteTracksRef.current.delete(track.sid || track.mediaStreamTrack.id);
    if (track.kind !== Track.Kind.Video) return;
    setParticipantVideos(current => current.filter(video => video.key !== (track.sid || track.mediaStreamTrack.id)));
  }, []);

  const refreshDevices = useCallback(async (
    permission: "none" | "microphone" | "camera" | "media" = "none",
    cause: "initial" | "manual" | "devicechange" = "manual",
  ): Promise<boolean> => {
    const generation = ++deviceRefreshGenerationRef.current;
    const room = roomRef.current;
    const preserveLiveConnection = Boolean(room && room.state !== ConnectionState.Disconnected);
    if (!preserveLiveConnection && permission === "none" && cause === "initial") {
      setShowCallNotice(false);
    }
    if (!navigator.mediaDevices?.enumerateDevices) {
      if (!preserveLiveConnection) setStatus("error");
      setMessage("This browser cannot access media devices. Use HTTPS, localhost, or Quipsly Capture on iPhone or iPad.");
      return false;
    }
    if (!preserveLiveConnection && (permission !== "none" || cause !== "initial")) {
      setStatus("checking");
      setMessage(permission === "microphone"
        ? "Waiting for browser microphone permission…"
        : permission === "camera" || permission === "media"
          ? "Waiting for browser camera permission…"
          : "Reading available devices…");
    } else if (permission !== "none" || cause === "manual") {
      setMessage("Checking connected call devices without leaving the room…");
    }
    const ownsPermissionRefresh = permission !== "none";
    if (ownsPermissionRefresh) activePermissionRefreshesRef.current += 1;
    try {
      if (permission !== "none") {
        clearPreflightPreview();
        const permissionStream = await acquireMedia({
          audio: permission === "microphone" || permission === "media",
          video: permission === "camera" || permission === "media",
        });
        stopStream(permissionStream);
        if (generation !== deviceRefreshGenerationRef.current) return false;
      }
      const devices = await enumerateDevicesAfterPermissionSettles(permission);
      if (generation !== deviceRefreshGenerationRef.current) return false;
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
        // Permission can first arrive after a deliberately muted join. Select
        // the newly exposed input for both call and recording, without opening
        // it or changing the participant's mute choice.
        if (!previousMicrophoneId && nextMicrophoneId && !sourceLockedRef.current) {
          microphoneIdRef.current = nextMicrophoneId;
          setMicrophoneId(nextMicrophoneId);
          setMicrophoneRecoveryHeld(false);
        }
        if (microphoneDisconnected) {
          if (sourceLockedRef.current) {
            await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
            stopAudioMeter();
            setMicrophoneMuted(true);
            microphoneMutedRef.current = true;
            setMicrophoneRecoveryHeld(true);
            recoveryMessages.push("The call microphone disconnected, so Quipsly muted it. Stop the retained recording before choosing another microphone.");
          } else if (nextMicrophoneId) {
            try {
              await room.switchActiveDevice("audioinput", nextMicrophoneId);
              if (!microphoneMutedRef.current) {
                const publication = await room.localParticipant.setMicrophoneEnabled(true, {
                  deviceId: nextMicrophoneId,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                });
                await startAudioMeter(publication?.track?.mediaStreamTrack);
              }
              setMicrophoneId(nextMicrophoneId);
              microphoneIdRef.current = nextMicrophoneId;
              setMicrophoneRecoveryHeld(false);
              recoveryMessages.push(`Microphone disconnected. The call moved to ${nextMicrophones.find((device) => device.deviceId === nextMicrophoneId)?.label || "an available microphone"}.`);
            } catch {
              await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
              stopAudioMeter();
              setMicrophoneId("");
              microphoneIdRef.current = "";
              setMicrophoneMuted(true);
              microphoneMutedRef.current = true;
              setMicrophoneRecoveryHeld(true);
              recoveryMessages.push("The microphone disconnected and the fallback could not start, so Quipsly muted the call. Choose another microphone in settings.");
            }
          } else {
            await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
            stopAudioMeter();
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
            await attachLocalCameraTrack(null);
            setCameraMuted(true);
            cameraMutedRef.current = true;
            recoveryMessages.push("The call camera disconnected, so Quipsly turned it off. Stop the retained recording before choosing another camera.");
          } else if (nextCameraId) {
            try {
              if (cameraWantedRef.current && !cameraMutedRef.current) {
                await room.switchActiveDevice("videoinput", nextCameraId);
                const publication = await room.localParticipant.setCameraEnabled(true, { deviceId: nextCameraId });
                const mediaTrack = publication?.track?.mediaStreamTrack;
                await attachLocalCameraTrack(mediaTrack);
              }
              setCameraId(nextCameraId);
              cameraIdRef.current = nextCameraId;
              setCameraEvidence(null);
              recoveryMessages.push(`Camera disconnected. ${cameraWantedRef.current && !cameraMutedRef.current ? "The call moved" : "Camera remains off; its next start will use"} ${nextCameras.find((device) => device.deviceId === nextCameraId)?.label || "an available camera"}.`);
            } catch {
              await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
              await attachLocalCameraTrack(null);
              setCameraId("");
              cameraIdRef.current = "";
              setCameraMuted(true);
              cameraMutedRef.current = true;
              recoveryMessages.push("The camera disconnected and the fallback could not start, so Quipsly turned video off. Choose another camera in settings.");
            }
          } else {
            await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
            await attachLocalCameraTrack(null);
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
        setShowCallNotice(true);
        if (!preserveLiveConnection) setStatus(nextMicrophones.length && (!cameraWantedRef.current || nextCameras.length) ? "ready" : "preflight");
        setMessage(recoveryMessages.join(" "));
      } else if ((permission === "camera" || permission === "media") && !nextCameras.length) {
        setShowCallNotice(false);
        if (!preserveLiveConnection) setStatus("error");
        setMessage("No camera is available. Check its connection and browser permission, or join with camera off.");
      } else if (permission === "camera" || permission === "media") {
        setShowCallNotice(false);
        if (!preserveLiveConnection) setStatus("ready");
        setMessage(cameraNamesVisible ? "Camera names are visible. Choose the exact camera and run the preview." : "Camera access is available. Use the preview to verify the selected source.");
      } else if (!nextMicrophones.length) {
        setShowCallNotice(false);
        const waitingForJoinPermission = permission === "none" && cause === "initial";
        if (!preserveLiveConnection) {
          setStatus(waitingForJoinPermission || rawMicrophones.length ? "preflight" : "error");
        }
        setMessage(waitingForJoinPermission
          ? "Tap Join call to use your microphone."
          : rawMicrophones.length
            ? "Microphone access is off. Allow it in this site's browser settings, then join again."
            : "No microphone was found. Check the cable and system sound settings, then try again.");
      } else if (cameraWantedRef.current && !nextCameras.length) {
        setShowCallNotice(false);
        if (!preserveLiveConnection) setStatus("preflight");
        setMessage("Your microphone is ready. You can turn on a camera or join with camera off.");
      } else {
        setShowCallNotice(false);
        if (!preserveLiveConnection) setStatus("ready");
        if (preserveLiveConnection) {
          if (cause !== "devicechange") setMessage("Call devices refreshed. The conversation stayed connected.");
        } else setMessage(microphoneNamesVisible
            ? "Your microphone is ready. You can join now or try the optional sound check."
            : "Microphone access is available. Choose your device or join now.");
      }
      setTechnicalMessage(null);
      return true;
    } catch (error) {
      if (generation !== deviceRefreshGenerationRef.current || (error instanceof Error && error.name === "AbortError")) return false;
      if (!preserveLiveConnection) setStatus("error");
      setTechnicalMessage(error instanceof Error ? error.message : "The browser did not return a media-device error.");
      setMessage("Device access couldn't be completed. Check this site's microphone and camera permissions, then try again.");
      return false;
    } finally {
      if (ownsPermissionRefresh) {
        activePermissionRefreshesRef.current = Math.max(
          0,
          activePermissionRefreshesRef.current - 1,
        );
      }
    }
  }, [acquireMedia, attachLocalCameraTrack, clearPreflightPreview, startAudioMeter, stopAudioMeter]);

  useEffect(() => {
    const wasLocked = previousSourceLockedRef.current;
    previousSourceLockedRef.current = sourceLocked;
    if (wasLocked && !sourceLocked) void refreshDevices("none", "manual");
  }, [refreshDevices, sourceLocked]);

  const startSelectedPreview = useCallback(async (audioOnly = false) => {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    const useCallAudioHere = callAudioModeRef.current === "this-device";
    const selectedMicrophoneId = microphoneIdRef.current;
    const selectedCameraId = cameraIdRef.current;
    setStatus("checking");
    setMessage("Opening the selected studio devices…");
    clearPreflightPreview();
    const generation = previewRequestGenerationRef.current;
    try {
      const stream = await acquireMedia({
        audio: useCallAudioHere ? {
          ...(selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : false,
        video: !audioOnly && cameraWanted ? {
          ...(selectedCameraId ? { deviceId: { exact: selectedCameraId } } : {}),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        } : false,
      });
      if (generation !== previewRequestGenerationRef.current) {
        stopStream(stream);
        return null;
      }
      preflightStreamRef.current = stream;
      if (!audioOnly && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => undefined);
      }
      if (generation !== previewRequestGenerationRef.current) return null;
      const videoTrack = audioOnly ? undefined : stream.getVideoTracks()[0];
      setCameraEvidence(videoTrack
        ? studioCameraInputEvidence(
            cameras.find((device) => device.deviceId === cameraId)?.label || videoTrack.label || "Selected camera",
            videoTrack.getSettings(),
          )
        : null);
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) await startAudioMeter(audioTrack);
      if (generation !== previewRequestGenerationRef.current) return null;
      setStatus("ready");
      setPreviewTested(true);
      setTechnicalMessage(null);
      suppressPreferenceWriteRef.current = false;
      setMessage(audioOnly
        ? "Microphone is open for the private sound check. Nothing is sent or retained."
        : useCallAudioHere
          ? "Preview is live. This is a device check only—nothing is sent or recorded."
          : "Camera preview is live. Call audio stays on your other device; nothing is sent or recorded.");
      return stream;
    } catch (error) {
      if (generation !== previewRequestGenerationRef.current) return null;
      setStatus("error");
      setCameraEvidence(null);
      setTechnicalMessage(error instanceof Error ? error.message : "The browser did not return a preview error.");
      setMessage("The selected setup couldn't start. Check the device connection and browser permissions, then try again.");
      return null;
    }
  }, [acquireMedia, cameraId, cameraWanted, cameras, clearPreflightPreview, microphoneId, startAudioMeter]);

  const allowAndPreviewDevices = useCallback(async () => {
    const joinAttempt = joinAttemptGenerationRef.current;
    const allowed = await refreshDevices(callAudioMode === "this-device"
      ? (cameraWanted ? "media" : "microphone") : "camera");
    // Permission may resolve after Join or Leave. Never reopen a lobby stream
    // over the call that now owns the devices, or after its view was closed.
    if (allowed && !connected && joinAttempt === joinAttemptGenerationRef.current) {
      await startSelectedPreview();
    }
  }, [callAudioMode, cameraWanted, connected, refreshDevices, startSelectedPreview]);

  const previewLobbyCamera = useCallback(async (enabled: boolean) => {
    automaticPreviewAttemptedRef.current = true;
    const generation = ++previewRequestGenerationRef.current;
    setShowCallNotice(false);
    cameraWantedRef.current = enabled;
    setCameraWanted(enabled);
    cameraMutedRef.current = !enabled;
    setCameraMuted(!enabled);
    const existing = preflightStreamRef.current;
    // Camera controls must not close an already-open microphone preview.
    existing?.getVideoTracks().forEach((track) => {
      track.stop();
      existing.removeTrack(track);
    });
    setCameraEvidence(null);
    if (!enabled) {
      setPreviewTested(Boolean(existing?.getAudioTracks().length));
      setStatus("ready");
      setMessage("Camera off.");
      return;
    }
    setStatus("checking");
    setMessage("Opening your camera…");
    try {
      const stream = await acquireMedia({
        audio: false,
        video: {
          ...(cameraIdRef.current ? { deviceId: { exact: cameraIdRef.current } } : {}),
          width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 },
        },
      });
      if (generation !== previewRequestGenerationRef.current) {
        stopStream(stream);
        return;
      }
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stopStream(stream);
        throw new Error("The browser did not return a camera track.");
      }
      const preview = preflightStreamRef.current ?? stream;
      if (preview !== stream) preview.addTrack(track);
      preflightStreamRef.current = preview;
      const settings = track.getSettings();
      if (settings.deviceId) {
        cameraIdRef.current = settings.deviceId;
        setCameraId(settings.deviceId);
        setCameras((current) => current.some((device) => device.deviceId === settings.deviceId)
          ? current : [...current, { deviceId: settings.deviceId!, label: track.label || "Camera" }]);
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = preview;
        await localVideoRef.current.play().catch(() => undefined);
      }
      if (generation !== previewRequestGenerationRef.current) return;
      setCameraEvidence(studioCameraInputEvidence(track.label || "Camera", settings));
      setPreviewTested(true);
      setTechnicalMessage(null);
      setStatus("ready");
      setMessage("Camera preview is live. Nothing is sent or recorded.");
    } catch (error) {
      if (generation !== previewRequestGenerationRef.current) return;
      cameraWantedRef.current = false;
      setCameraWanted(false);
      setCameraMuted(true);
      cameraMutedRef.current = true;
      setStatus("ready");
      setShowCallNotice(true);
      setTechnicalMessage(error instanceof Error ? error.message : "Camera preview failed.");
      setMessage("Camera couldn't start. Check its connection and browser permission, or join with camera off.");
    }
  }, [acquireMedia]);

  useEffect(() => {
    automaticPreviewAttemptedRef.current = false;
  }, [callRoomId]);

  useEffect(() => {
    if (
      automaticPreviewAttemptedRef.current ||
      connected ||
      status === "checking" ||
      status === "joining"
    ) return;

    const useCallAudioHere = callAudioMode === "this-device";
    if ((useCallAudioHere && !microphoneId) || (cameraWanted && !cameraId)) return;
    automaticPreviewAttemptedRef.current = true;

    const generation = previewRequestGenerationRef.current;
    const reopenRememberedSetup = async () => {
      const requiredPermissions = [
        useCallAudioHere ? "microphone" as const : null,
        cameraWanted ? "camera" as const : null,
      ].filter((name): name is "microphone" | "camera" => name !== null);
      if (!requiredPermissions.length) return;
      const states = await Promise.all(
        requiredPermissions.map((name) => retainedMediaPermissionState(name)),
      );
      if (generation === previewRequestGenerationRef.current && states.every((state) => state === "granted")) {
        await startSelectedPreview();
      }
    };

    void reopenRememberedSetup();
  }, [
    callAudioMode,
    cameraId,
    cameraWanted,
    connected,
    microphoneId,
    startSelectedPreview,
    status,
  ]);

  const completeLeave = useCallback((protectedSourceStopped = false) => {
    // Invalidate any device refresh started when the retained source unlocked.
    // A late preflight result must not overwrite the final safe-leave state.
    deviceRefreshGenerationRef.current += 1;
    joinAttemptGenerationRef.current += 1;
    clearPreflightPreview();
    const wasConnected = Boolean(roomRef.current);
    intentionalDisconnectRef.current = true;
    roomRef.current?.disconnect(true);
    roomRef.current = null;
    clearRemoteMedia();
    void attachLocalCameraTrack(null);
    setParticipants([]);
    setSourceStopRequestVersion(0);
    setCallRecoveryAvailable(false);
    setCallEndedByPerson(true);
    setStatus("ended");
    setMessage(
      protectedSourceStopped
        ? "Call ended. Your local recording is protected. Keep Quipsly open until the recording panel says Safe to close."
        : "You left the call.",
    );
    if (wasConnected) {
      dispatchQuipslyProductEvent("call_completed", {
        surface: "session_workspace",
        workflow: kind === "coaching" ? "coaching" : "podcast",
        client_kind: "browser",
        result: "success",
      });
    }
    onExitComplete?.();
  }, [attachLocalCameraTrack, clearPreflightPreview, clearRemoteMedia, kind, onExitComplete]);

  const leave = useCallback(async () => {
    if (sourceLocked) {
      setLeaveAfterSourceStops(true);
      setSourceStopRequestVersion((version) => version + 1);
      setMessage("Stopping and protecting your local recording before leaving…");
      return;
    }
    completeLeave(false);
  }, [completeLeave, sourceLocked]);

  useEffect(() => {
    if (!leaveAfterSourceStops || sourceLocked) return;
    setLeaveAfterSourceStops(false);
    completeLeave(true);
  }, [completeLeave, leaveAfterSourceStops, sourceLocked]);

  useEffect(() => {
    if (
      leaveRequestVersion <= 0
      || leaveRequestVersion === lastLeaveRequestVersionRef.current
    ) return;
    lastLeaveRequestVersionRef.current = leaveRequestVersion;
    void leave();
  }, [leave, leaveRequestVersion]);

  const join = useCallback(async (options?: { withoutDevices?: boolean }) => {
    // A remembered-preview permission check may still be resolving. From
    // this point onward the join attempt owns device setup, not the lobby.
    previewRequestGenerationRef.current += 1;
    deviceRefreshGenerationRef.current += 1;
    pendingMediaRequestRef.current?.abort();
    const joinAttempt = ++joinAttemptGenerationRef.current;
    if (options?.withoutDevices) {
      setJoinMuted(true);
      setCameraWanted(false);
      cameraWantedRef.current = false;
      cameraToggleInFlightRef.current = false;
      setCameraToggleBusy(false);
    }
    const attemptCancelled = () => joinAttempt !== joinAttemptGenerationRef.current;
    let attemptRoom: Room | null = null;
    const abandonAttemptRoom = () => {
      if (!attemptRoom) return;
      intentionalDisconnectRef.current = true;
      void attemptRoom.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      void attemptRoom.localParticipant.setCameraEnabled(false).catch(() => undefined);
      if (roomRef.current === attemptRoom) roomRef.current = null;
      attemptRoom.disconnect(true);
    };
    const recoveringCall = callRecoveryAvailable;
    const useCallAudioHere = callAudioModeRef.current === "this-device";
    const shouldJoinMuted = options?.withoutDevices || (recoveringCall ? microphoneMutedRef.current : joinMuted);
    if (useCallAudioHere && shouldJoinMuted) recordingMicrophone.setMuted(true);
    const shouldJoinWithCamera = !options?.withoutDevices && cameraWanted && !(recoveringCall && cameraMutedRef.current);
    const microphoneNeededNow = useCallAudioHere && !shouldJoinMuted;
    const cameraNeededNow = shouldJoinWithCamera;
    let selectedMicrophoneId = microphoneIdRef.current;
    let selectedCameraId = cameraIdRef.current;

    // Join is the familiar, person-owned permission boundary. If the browser
    // can expose permission state, reuse an existing grant without another
    // prompt. Otherwise a cancellable request runs from this click; the lobby
    // can cancel it or join without devices. A deliberately
    // muted join never opens the microphone merely to enumerate it.
    const requiredPermissions = [
      microphoneNeededNow ? "microphone" as const : null,
      cameraNeededNow ? "camera" as const : null,
    ].filter((name): name is "microphone" | "camera" => name !== null);
    let permissionPreparationAttempted = false;
    if (
      requiredPermissions.length
      && typeof navigator.mediaDevices?.getUserMedia === "function"
    ) {
      const permissionStates = await Promise.all(
        requiredPermissions.map((name) => retainedMediaPermissionState(name)),
      );
      if (attemptCancelled()) return;
      if (permissionStates.some((state) => state !== "granted")) {
        permissionPreparationAttempted = true;
        const requestedPermission = microphoneNeededNow && cameraNeededNow
          ? "media"
          : microphoneNeededNow
            ? "microphone"
            : "camera";
        const prepared = await refreshDevices(requestedPermission, "manual");
        if (attemptCancelled()) return;
        selectedMicrophoneId = microphoneIdRef.current;
        selectedCameraId = cameraIdRef.current;
        if (!prepared && microphoneNeededNow && cameraNeededNow) {
          // A busy or unavailable camera must not cost the participant their
          // conversation. Retry only the microphone, then join camera-off.
          const microphonePrepared = await refreshDevices("microphone", "manual");
          if (attemptCancelled()) return;
          selectedMicrophoneId = microphonePrepared ? microphoneIdRef.current : "";
          selectedCameraId = "";
        } else if (!prepared) {
          if (microphoneNeededNow) selectedMicrophoneId = "";
          if (cameraNeededNow) selectedCameraId = "";
        }
      }
    }
    if (
      !permissionPreparationAttempted
      && ((microphoneNeededNow && !selectedMicrophoneId) || (cameraNeededNow && !selectedCameraId))
    ) {
      await refreshDevices(
        microphoneNeededNow ? (cameraNeededNow ? "media" : "microphone") : "camera",
        "manual",
      );
      if (attemptCancelled()) return;
      selectedMicrophoneId = microphoneIdRef.current;
      selectedCameraId = cameraIdRef.current;
    }
    const joinWithoutMicrophone = microphoneNeededNow && !selectedMicrophoneId;
    const joinWithoutCamera = cameraNeededNow && !selectedCameraId;
    const joinRecoveryMessages: string[] = [];
    const joinTechnicalMessages: string[] = [];
    if (joinWithoutMicrophone) {
      joinRecoveryMessages.push(
        "You joined muted. Choose a microphone in settings whenever you’re ready.",
      );
    }
    if (joinWithoutCamera) {
      joinRecoveryMessages.push(
        "Your camera is off. Choose a camera in settings whenever you’re ready.",
      );
    }
    if (recoveringCall && shouldJoinMuted && !joinWithoutMicrophone) {
      joinRecoveryMessages.push("You rejoined muted.");
    }
    if (recoveringCall && !shouldJoinWithCamera && cameraWanted) {
      joinRecoveryMessages.push("Your camera stayed off.");
    }
    if (attemptCancelled()) return;
    setStatus("joining");
    setMessage("Joining…");
    setLocalRecordingFallback(false);
    if (!recoveringCall) setCallRecoveryAvailable(false);
    setCallEndedByPerson(false);
    if (!recoveringCall) setCallPermanentlyClosed(false);
    intentionalDisconnectRef.current = false;
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
          endpointRole: useCallAudioHere ? "primary" : "companion",
        }),
      });
      const packet = await response.json().catch(() => ({})) as JoinPacket;
      if (attemptCancelled()) return;
      if (
        response.ok &&
        packet.ok &&
        !packet.canJoin &&
        packet.localFallback?.available
      ) {
        setLocalRecordingFallback(true);
        setStatus("error");
        setTechnicalMessage(packet.nextAction || packet.localFallback.nextAction || null);
        setMessage(
          packet.providerReadiness === "provider-not-configured" ||
          packet.providerReadiness === "livekit-needs-config"
            ? "The live call isn't configured for this Session yet. You can still record a high-quality copy on this device after everyone allows recording."
            : "The live call isn't available right now. You can retry Join call or continue with the protected recorder on this device.",
        );
        return;
      }
      if (!response.ok || !packet.ok || !packet.canJoin || !packet.serverUrl || !packet.participantToken) {
        throw new CallJoinFailure(
          packet.error || packet.nextAction || "This Session is not ready for a live room.",
          response.status,
          packet.code || null,
        );
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      attemptRoom = room;
      if (attemptCancelled()) {
        abandonAttemptRoom();
        return;
      }
      roomRef.current = room;
      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => { attachRemoteTrack(track, participant); updateRoster(room); })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => detachRemoteTrack(track))
        .on(RoomEvent.TrackMuted, (publication: TrackPublication, participant: Participant) => {
          if (participant !== room.localParticipant && publication.track?.kind === Track.Kind.Video) {
            detachRemoteTrack(publication.track as RemoteTrack);
          }
          updateRoster(room);
        })
        .on(RoomEvent.TrackUnmuted, (publication: TrackPublication, participant: Participant) => {
          if (participant !== room.localParticipant && publication.track?.kind === Track.Kind.Video) {
            attachRemoteTrack(publication.track as RemoteTrack, participant);
          }
          updateRoster(room);
        })
        .on(RoomEvent.ParticipantConnected, () => updateRoster(room))
        .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          participant.trackPublications.forEach(publication => { if (publication.track) detachRemoteTrack(publication.track); });
          setParticipantVideos(current => current.filter(video => video.identity !== participant.identity));
          updateRoster(room);
        })
        .on(RoomEvent.ParticipantNameChanged, () => updateRoster(room))
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
          if (roomRef.current !== room) return;
          setCallRecoveryAvailable(false);
          setStatus("reconnecting");
          setMessage("Connection interrupted. Reconnecting… Any local recording continues safely on this device.");
        })
        .on(RoomEvent.Reconnected, () => {
          if (roomRef.current !== room) return;
          setCallRecoveryAvailable(false);
          setStatus("connected");
          setMessage("Reconnected.");
        })
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current !== room) return;
          const canRejoin = !intentionalDisconnectRef.current;
          roomRef.current = null;
          stopAudioMeter();
          setStatus("ended");
          setCallRecoveryAvailable(canRejoin);
          setCallEndedByPerson(!canRejoin);
          setMessage(canRejoin
            ? "The call disconnected. Your local recording is still protected. Rejoin when you’re ready."
            : "The call ended.");
          setParticipants([]);
          clearRemoteMedia();
          void attachLocalCameraTrack(null);
        });

      await room.connect(packet.serverUrl, packet.participantToken);
      if (attemptCancelled()) {
        abandonAttemptRoom();
        return;
      }
      let microphonePublication;
      if (microphoneNeededNow && selectedMicrophoneId) {
        try {
          await room.switchActiveDevice("audioinput", selectedMicrophoneId);
          microphonePublication = await room.localParticipant.setMicrophoneEnabled(!shouldJoinMuted, {
            deviceId: selectedMicrophoneId,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
          if (!shouldJoinMuted) {
            await startAudioMeter(microphonePublication?.track?.mediaStreamTrack);
          }
          setMicrophoneRecoveryHeld(false);
          setMicrophoneMuted(shouldJoinMuted);
          microphoneMutedRef.current = shouldJoinMuted;
          recordingMicrophone.setMuted(Boolean(shouldJoinMuted));
        } catch (error) {
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
          stopAudioMeter();
          setMicrophoneMuted(true);
          microphoneMutedRef.current = true;
          setMicrophoneRecoveryHeld(true);
          recordingMicrophone.setMuted(true);
          joinRecoveryMessages.push("You joined muted because the microphone couldn't start. Choose another microphone in settings and try Unmute.");
          joinTechnicalMessages.push(error instanceof Error ? `Microphone: ${error.message}` : "Microphone: device start failed.");
        }
      } else {
        await room.localParticipant.setMicrophoneEnabled(false);
        setMicrophoneMuted(true);
        microphoneMutedRef.current = true;
        setMicrophoneRecoveryHeld(recoveringCall ? microphoneRecoveryHeld : joinWithoutMicrophone);
        if (useCallAudioHere) recordingMicrophone.setMuted(true);
      }
      if (attemptCancelled()) {
        abandonAttemptRoom();
        return;
      }
      if (shouldJoinWithCamera && selectedCameraId) {
        try {
          await room.switchActiveDevice("videoinput", selectedCameraId);
          const publication = await room.localParticipant.setCameraEnabled(true, {
            deviceId: selectedCameraId,
            resolution: { width: 1920, height: 1080, frameRate: 30 },
          });
          const mediaTrack = publication?.track?.mediaStreamTrack;
          await attachLocalCameraTrack(mediaTrack);
          setCameraMuted(false);
          cameraMutedRef.current = false;
        } catch (error) {
          await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
          setCameraMuted(true);
          cameraMutedRef.current = true;
          joinRecoveryMessages.push("You joined with the camera off because it couldn't start. The conversation is still connected.");
          joinTechnicalMessages.push(error instanceof Error ? `Camera: ${error.message}` : "Camera: device start failed.");
        }
      } else {
        await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
        await attachLocalCameraTrack(null);
        setCameraMuted(true);
        cameraMutedRef.current = true;
      }
      if (attemptCancelled()) {
        abandonAttemptRoom();
        return;
      }
      suppressPreferenceWriteRef.current = false;
      room.remoteParticipants.forEach((participant: RemoteParticipant) => {
        participant.trackPublications.forEach((publication: RemoteTrackPublication) => {
          if (publication.track && !publication.isMuted) attachRemoteTrack(publication.track, participant);
        });
      });
      updateRoster(room);
      setCallRecoveryAvailable(false);
      setLocalRecordingFallback(false);
      setStatus("connected");
      if (!callJoinTrackedRef.current) {
        callJoinTrackedRef.current = true;
        dispatchQuipslyProductEvent("call_joined", {
          surface: "session_workspace",
          workflow: kind === "coaching" ? "coaching" : "podcast",
          client_kind: "browser",
          result: "success",
          has_video: shouldJoinWithCamera,
        });
      }
      setTechnicalMessage(joinTechnicalMessages.length ? joinTechnicalMessages.join(" ") : null);
      setMessage(joinRecoveryMessages.length
        ? joinRecoveryMessages.join(" ")
        : !useCallAudioHere
          ? "You’re connected as a second device. Call audio stays on your other device."
          : packet.recordingConsentGranted
            ? "You’re connected. Recording is off."
            : "You’re connected. Recording is off until everyone chooses to allow it.");
    } catch (error) {
      if (attemptCancelled()) {
        abandonAttemptRoom();
        return;
      }
      intentionalDisconnectRef.current = true;
      roomRef.current?.disconnect(true);
      roomRef.current = null;
      if (recoveringCall && error instanceof CallJoinFailure && error.code === "ROOM_NOT_OPEN") {
        setCallRecoveryAvailable(false);
        setCallEndedByPerson(true);
        setCallPermanentlyClosed(true);
        setStatus("ended");
        setTechnicalMessage(null);
        setMessage("This call has ended. Your local recording is still protected; stop and save it when you’re ready.");
        return;
      }
      setCallRecoveryAvailable(recoveringCall);
      const fallbackAllowed = !(
        error instanceof CallJoinFailure &&
        ["AUTH_REQUIRED", "ROOM_ACCESS_DENIED", "ROOM_NOT_OPEN", "PAYMENT_HOLD"].includes(
          error.code || "",
        )
      );
      setLocalRecordingFallback(fallbackAllowed);
      setStatus("error");
      setTechnicalMessage(error instanceof Error ? error.message : "The browser did not return a call connection error.");
      setMessage(error instanceof CallJoinFailure && error.code === "AUTH_REQUIRED"
        ? "Your sign-in expired. Sign in again, then return to this Session. Any local recording remains protected on this device."
        : error instanceof CallJoinFailure && error.code === "ROOM_ACCESS_DENIED"
          ? "Your access to this Session changed. Return to Quipsly Home or ask the host for a new invitation."
          : fallbackAllowed
            ? "The live call couldn't connect. Retry Join call, or continue with the protected recorder on this device."
            : "The call couldn't connect. Check your internet connection and try again.");
    }
  }, [attachLocalCameraTrack, attachRemoteTrack, callRecoveryAvailable, callRoomId, cameraWanted, clearPreflightPreview, clearRemoteMedia, detachRemoteTrack, episodeSlug, joinMuted, kind, microphoneRecoveryHeld, onEpisodeWatchHint, projectSlug, recordingMicrophone, refreshDevices, startAudioMeter, stopAudioMeter, updateRoster]);

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
    if (!room || microphoneToggleInFlightRef.current) return;
    if (microphoneMuted && microphoneRecoveryHeld && sourceLockedRef.current) {
      setMessage("Choose a working microphone in settings before unmuting.");
      return;
    }
    const nextMuted = !microphoneMuted;
    if (nextMuted) recordingMicrophone.setMuted(true);
    microphoneToggleInFlightRef.current = true;
    try {
      if (!nextMuted && (!microphoneIdRef.current || microphoneRecoveryHeld)) {
        const prepared = await refreshDevices("microphone", "manual");
        if (!prepared || !microphoneIdRef.current || roomRef.current !== room || room.state === ConnectionState.Disconnected) return;
      }
      const selectedMicrophoneId = microphoneIdRef.current;
      const publication = await room.localParticipant.setMicrophoneEnabled(
        !nextMuted,
        !nextMuted && selectedMicrophoneId
          ? {
              deviceId: selectedMicrophoneId,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : undefined,
      );
      if (roomRef.current !== room || room.state === ConnectionState.Disconnected || callAudioModeRef.current !== "this-device") {
        publication?.track?.stop();
        return;
      }
      if (nextMuted) {
        stopAudioMeter();
      } else {
        await startAudioMeter(publication?.track?.mediaStreamTrack);
      }
      setMicrophoneMuted(nextMuted);
      microphoneMutedRef.current = nextMuted;
      recordingMicrophone.setMuted(nextMuted);
      setTechnicalMessage(null);
    } catch (error) {
      setMessage(nextMuted
        ? "The call microphone couldn't mute. Your local recording is muted. Try again or leave the call."
        : "The microphone couldn't start. Choose another microphone in settings and try again.");
      setTechnicalMessage(error instanceof Error ? error.message : "The browser did not return a microphone error.");
    } finally {
      microphoneToggleInFlightRef.current = false;
    }
  }, [microphoneMuted, microphoneRecoveryHeld, recordingMicrophone, refreshDevices, startAudioMeter, stopAudioMeter]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || sourceLockedRef.current || cameraToggleInFlightRef.current) return;
    const nextEnabled = !cameraWantedRef.current || cameraMutedRef.current;
    const generation = ++cameraOperationGenerationRef.current;
    const stillCurrent = () => generation === cameraOperationGenerationRef.current
      && roomRef.current === room && room.state !== ConnectionState.Disconnected;
    cameraToggleInFlightRef.current = true;
    setCameraToggleBusy(true);
    setCameraControlError(null);
    try {
      // Device IDs can be hidden until permission is granted. The SDK acquires
      // only video here and owns publication; don't open a second camera stream.
      const selectedCameraId = cameraIdRef.current;
      const publication = await room.localParticipant.setCameraEnabled(nextEnabled, nextEnabled && selectedCameraId ? { deviceId: selectedCameraId } : undefined);
      if (!stillCurrent()) {
        publication?.track?.stop();
        return;
      }
      const mediaTrack = nextEnabled ? publication?.track?.mediaStreamTrack : null;
      if (nextEnabled && (!mediaTrack || mediaTrack.readyState === "ended")) {
        throw new Error("The camera did not return a live video track.");
      }
      const resolvedCameraId = mediaTrack?.getSettings().deviceId;
      if (resolvedCameraId) {
        cameraIdRef.current = resolvedCameraId;
        setCameraId(resolvedCameraId);
        setCameras((current) => current.some((camera) => camera.deviceId === resolvedCameraId)
          ? current : [...current, { deviceId: resolvedCameraId, label: mediaTrack?.label || "Camera" }]);
      }
      await attachLocalCameraTrack(mediaTrack);
      if (!stillCurrent()) return;
      setCameraWanted(true);
      cameraWantedRef.current = true;
      setCameraMuted(!nextEnabled);
      cameraMutedRef.current = !nextEnabled;
      setTechnicalMessage(null);
    } catch (error) {
      if (!stillCurrent()) return;
      const errorName = error instanceof Error ? error.name : "";
      setCameraControlError(!nextEnabled
        ? "The camera couldn't stop. Try again or leave the call."
        : errorName === "NotAllowedError"
          ? "Camera access is blocked. Allow camera access in your browser’s site settings, then try Start camera again. Your call is still connected."
          : errorName === "NotFoundError"
            ? "No camera was found. Connect or enable a camera, then try again. Your call is still connected."
            : "The camera couldn't start. Your call is still connected. Check that another app isn’t using the camera, or choose another camera in settings and try again.");
      setTechnicalMessage(error instanceof Error ? error.message : "The browser did not return a camera error.");
    } finally {
      if (generation === cameraOperationGenerationRef.current) {
        cameraToggleInFlightRef.current = false;
        setCameraToggleBusy(false);
      }
    }
  }, [attachLocalCameraTrack]);

  const chooseCallAudioMode = useCallback(async (nextMode: CallAudioMode) => {
    if (nextMode === callAudioModeRef.current || callAudioModeChangeInFlightRef.current) return;
    callAudioModeChangeInFlightRef.current = true;
    setCallAudioModeBusy(true);
    try {
      const room = roomRef.current;
      if (connected && room && nextMode === "other-device") {
        // This choice is a live transport boundary, not just a label. Disable
        // the provider microphone before claiming this endpoint is silent.
        await room.localParticipant.setMicrophoneEnabled(false);
        stopAudioMeter();
        setMicrophoneMuted(true);
        microphoneMutedRef.current = true;
        setMicrophoneRecoveryHeld(false);
      }

      callAudioModeRef.current = nextMode;
      setCallAudioMode(nextMode);
      suppressPreferenceWriteRef.current = false;
      setTechnicalMessage(null);
      if (nextMode === "other-device") {
        if (!connected) clearPreflightPreview();
        setMicrophoneMuted(true);
        microphoneMutedRef.current = true;
        setMessage(connected
          ? "Call microphone and speakers are off on this device. Use your other device to talk and listen."
          : "Call audio will stay off on this device to prevent echo.");
      } else if (connected) {
        // Returning call audio is deliberately two-step: listening resumes,
        // while speaking stays private until the person taps Unmute.
        setMicrophoneMuted(true);
        microphoneMutedRef.current = true;
        setMicrophoneRecoveryHeld(false);
        setMessage("Call audio is back on this device. You can listen now; tap Unmute when you’re ready to speak.");
      } else {
        setMicrophoneMuted(joinMuted);
        microphoneMutedRef.current = joinMuted;
        setMessage("This device will handle the conversation audio when you join.");
      }
    } catch (error) {
      setMessage("Call audio stayed on this device because its microphone could not be turned off. Try again or leave this endpoint before using another device.");
      setTechnicalMessage(error instanceof Error ? error.message : "The browser did not return an audio-route error.");
    } finally {
      callAudioModeChangeInFlightRef.current = false;
      setCallAudioModeBusy(false);
    }
  }, [clearPreflightPreview, connected, joinMuted, stopAudioMeter]);

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
          const publication = await room.localParticipant.setMicrophoneEnabled(true, {
            deviceId: nextId,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
          await startAudioMeter(publication?.track?.mediaStreamTrack);
        }
      }
      setMicrophoneId(nextId);
      microphoneIdRef.current = nextId;
      setMicrophoneRecoveryHeld(false);
      if (!connected) {
        clearPreflightPreview();
        await startSelectedPreview();
      }
      const label = microphones.find((device) => device.deviceId === nextId)?.label || "selected microphone";
      setMessage(connected ? `Microphone switched to ${label}.` : `Microphone selected: ${label}.`);
    } catch (error) {
      setMicrophoneId(previousId);
      microphoneIdRef.current = previousId;
      setMessage(error instanceof Error ? `Microphone switch failed: ${error.message}` : "Microphone switch failed.");
    }
  }, [clearPreflightPreview, connected, microphoneId, microphoneMuted, microphones, sourceLocked, startAudioMeter, startSelectedPreview]);

  const chooseCamera = useCallback(async (nextId: string) => {
    if (!nextId || nextId === cameraId || cameraToggleInFlightRef.current) return;
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
        await attachLocalCameraTrack(mediaTrack);
      }
      setCameraId(nextId);
      cameraIdRef.current = nextId;
      if (!connected && cameraWantedRef.current) {
        await previewLobbyCamera(true);
        return;
      }
      setCameraEvidence(null);
      const label = cameras.find((device) => device.deviceId === nextId)?.label || "selected camera";
      setMessage(connected ? `Camera switched to ${label}.` : `Camera selected: ${label}.`);
    } catch (error) {
      setCameraId(previousId);
      cameraIdRef.current = previousId;
      setMessage(error instanceof Error ? `Camera switch failed: ${error.message}` : "Camera switch failed.");
    }
  }, [attachLocalCameraTrack, cameraId, cameraMuted, cameraWanted, cameras, connected, previewLobbyCamera, sourceLocked]);

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
      setMessage("Choose your headphones in your device’s sound settings for this browser.");
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
      // Permission grants commonly emit devicechange before enumerateDevices
      // exposes the granted IDs. The active permission refresh already owns a
      // bounded settle-and-enumerate cycle; a competing refresh would cancel
      // it by advancing deviceRefreshGenerationRef and can leave the lobby in
      // a false no-microphone state.
      if (activePermissionRefreshesRef.current > 0) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refreshDevices("none", "devicechange"), 250);
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    return () => {
      pendingMediaRequestRef.current?.abort();
      pendingMediaRequestRef.current = null;
      deviceRefreshGenerationRef.current += 1;
      joinAttemptGenerationRef.current += 1;
      previewRequestGenerationRef.current += 1;
      cameraOperationGenerationRef.current += 1;
      if (refreshTimer) clearTimeout(refreshTimer);
      navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
      meterCleanupRef.current?.();
      stopStream(preflightStreamRef.current);
      intentionalDisconnectRef.current = true;
      roomRef.current?.disconnect(true);
      roomRef.current = null;
      clearRemoteMedia();
    };
  }, [clearRemoteMedia, refreshDevices]);

  useEffect(() => {
    const microphone = microphones.find((device) => device.deviceId === microphoneId);
    const camera = cameras.find((device) => device.deviceId === cameraId);
    const output = outputs.find((device) => device.deviceId === outputId);
    if (!microphone && !camera && !output && callAudioMode === "this-device") return;
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
      callAudioMode,
    } satisfies PreferredDevices));
  }, [callAudioMode, cameraId, cameraWanted, cameras, joinMuted, microphoneId, microphones, outputId, outputs]);

  useEffect(() => {
    if (!connected) return;
    remoteMediaRef.current?.querySelectorAll("audio").forEach((element) => {
      const useAudioHere = callAudioMode === "this-device";
      element.muted = !useAudioHere;
      element.volume = useAudioHere ? 1 : 0;
      if (useAudioHere) void routeAudioOutput(element);
    });
  }, [callAudioMode, connected, outputId, routeAudioOutput]);

  useEffect(() => {
    // Device failures and returning from companion audio can also leave the
    // call muted. Never let its displayed muted state conceal a live master.
    // A transport disconnect alone does not change the retained-source choice.
    if (connected && callAudioMode === "this-device" && microphoneMuted) recordingMicrophone.setMuted(true);
  }, [callAudioMode, connected, microphoneMuted, recordingMicrophone]);

  useEffect(() => {
    void refreshProviderRecording(false);
    const interval = window.setInterval(() => void refreshProviderRecording(false), 12_000);
    return () => window.clearInterval(interval);
  }, [refreshProviderRecording]);

  const handleRecordingConsentChange = useCallback((state: {
    participantConsentGranted: boolean;
    everyoneConsentGranted: boolean;
  }) => {
    // Joining muted is the conventional fallback when a microphone prompt is
    // denied, dismissed, or cannot expose a usable input. Keep that immediate
    // device recovery message visible; recorder consent/readiness must not
    // overwrite the reason Unmute is unavailable.
    if (!connected || microphoneRecoveryHeld) return;
    setMessage(
      !state.participantConsentGranted
        ? "You’re connected. Recording is off until you allow it."
        : state.everyoneConsentGranted
          ? "You’re connected. Everyone has allowed recording."
          : "You’re connected. Your recording choice is saved. Waiting for the other participant.",
    );
  }, [connected, microphoneRecoveryHeld]);

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
      conversationConnected={connected || callRecoveryAvailable || localRecordingFallback || sourceLocked}
      conversationEnded={callEndedByPerson}
      callTransportInterrupted={status === "reconnecting" || callRecoveryAvailable || localRecordingFallback}
      recordingMicrophone={recordingMicrophone}
      onSourceLockChange={setSourceLocked}
      onRecordingHandoffChange={handleRecordingHandoff}
      stopRequestVersion={sourceStopRequestVersion}
      onGuardianEvidenceChange={reportRetainedGuardianEvidence}
      onRecordingConsentChange={handleRecordingConsentChange}
      consentContainer={stageLayout && connected && toolPanel !== "recording" ? consentContainer : null}
      controlsContainer={stageLayout ? recordingControlContainer : null}
      presentation={stageLayout ? "panel" : "card"}
      onOpenRecordingSettings={() => setToolPanel("recording")}
      onOpenDeviceSettings={() => {
        if (stageLayout) setToolPanel("devices");
        const settings = deviceSettingsRef.current;
        if (!settings) return;
        settings.open = true;
        settings.querySelector("summary")?.focus();
      }}
    />
  ) : (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" aria-label="Retained source unavailable">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><CircleAlert size={16} aria-hidden="true" /> Conversation available · recording held</p>
      <p className="mt-2 text-sm font-semibold leading-6">You can still join the call, but recording is unavailable for this Session.</p>
      <p className="mt-2 text-[10px] font-black leading-4">Refresh the Session. If recording is still unavailable, ask the host to reopen it.</p>
    </section>
  );
  const showRetainedSourceControls = connected || callRecoveryAvailable || localRecordingFallback || status === "ended" || sourceLocked || leaveAfterSourceStops ||
    (retainedGuardianEvidence?.protectedRecoveryCount ?? 0) > 0;
  const callVideoStage = connected ? (
    <CallParticipantGallery participants={participants} videos={[...participantVideos, ...screenShare.videos]}
      bindLocalVideo={bindLocalVideoElement} localCameraOn={cameraWanted && !cameraMuted}
      localMicrophoneMuted={microphoneMuted || callAudioMode === "other-device"} />
  ) : (
    <div data-testid="call-video-stage" aria-label="Your camera preview"
      className={`relative overflow-hidden rounded-2xl bg-[#211a14] ${stageLayout ? "min-h-40 aspect-video max-h-[45dvh]" : !cameraWanted ? "h-28" : "aspect-video"}`}>
      <video ref={bindLocalVideoElement} muted playsInline aria-label="Your camera"
        className={`absolute inset-0 h-full w-full object-cover ${cameraWanted && !cameraMuted ? "" : "invisible"}`} />
      {(!cameraWanted || cameraMuted) ? <div className="absolute inset-0 grid place-items-center text-[#f5dfb9]">
        <div className="text-center"><CameraOff className="mx-auto size-8 opacity-70" aria-hidden="true" /><p className="mt-3 text-sm font-medium">Camera off</p></div>
      </div> : !previewTested ? <div className="absolute inset-0 grid place-items-center bg-black/35 px-6 text-center text-white">
        <div><Camera className="mx-auto" aria-hidden="true" /><p className="mt-2 text-sm font-semibold">Camera starts when you join</p>
        <p className="mt-1 text-xs text-white/80">Preview is available in audio and video settings.</p></div>
      </div> : null}
      <div className="absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white">You</div>
    </div>
  );
  useEffect(() => {
    onMicrophoneControlChange?.(connected && callAudioMode === "this-device" ? {
      muted: microphoneMuted,
      disabled: microphoneMuted && microphoneRecoveryHeld && sourceLocked,
      toggle: toggleMicrophone,
    } : null);
  }, [connected, callAudioMode, microphoneMuted, microphoneRecoveryHeld, sourceLocked, toggleMicrophone, onMicrophoneControlChange]);
  useEffect(() => () => onMicrophoneControlChange?.(null), [onMicrophoneControlChange]);

  const callControls = connected ? (
    <div className="flex flex-col gap-2" role="group" aria-label="Call controls">
      <div data-testid="call-control-rows" className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-center lg:gap-4">
      <div data-testid="call-primary-controls" className="grid min-w-0 grid-cols-2 items-stretch justify-center gap-2 min-[380px]:flex [&>button]:min-w-11 min-[380px]:[&>button]:flex-1 lg:[&>button]:flex-none">
        {callAudioMode === "this-device" ? (
          <button type="button" title={microphoneMuted ? "Unmute" : "Mute"} onClick={() => void toggleMicrophone()} aria-pressed={microphoneMuted} disabled={microphoneMuted && microphoneRecoveryHeld && sourceLocked} className={`inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45 sm:flex-row sm:gap-2 ${microphoneMuted ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>{microphoneMuted ? <MicOff size={18} /> : <Mic size={18} />}{microphoneMuted ? "Unmute" : "Mute"}</button>
        ) : <span title="Audio on another device" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-muted px-3 text-xs font-semibold text-foreground"><Smartphone size={18} /> Audio on other device</span>}
        <button type="button" title={!cameraWanted || cameraMuted ? "Start camera" : "Stop camera"} onClick={() => void toggleCamera()} aria-pressed={cameraWanted && !cameraMuted} aria-busy={cameraToggleBusy} disabled={sourceLocked || cameraToggleBusy} className={`inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-45 sm:flex-row sm:gap-2 ${!cameraWanted || cameraMuted ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>{cameraToggleBusy ? <LoaderCircle size={18} className="animate-spin" /> : !cameraWanted || cameraMuted ? <CameraOff size={18} /> : <Camera size={18} />}{cameraToggleBusy ? "Updating camera…" : !cameraWanted || cameraMuted ? "Start camera" : "Stop camera"}</button>
        {stageLayout && typeof captureGroupId === "string" && captureGroupId.trim() ? <div ref={setRecordingControlContainer} className="min-w-0 self-center" data-testid="call-recording-control-slot" /> : null}
        <button type="button" title={sourceLocked ? "Stop recording and leave" : "Leave"} onClick={() => void leave()} disabled={leaveAfterSourceStops} className="inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-rose-800 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60 sm:flex-row sm:gap-2"><PhoneOff size={18} /> {leaveAfterSourceStops ? "Saving recording…" : sourceLocked ? "Stop recording & leave" : "Leave"}</button>
      </div>
      {stageLayout ? <div data-testid="call-secondary-controls" className="grid min-w-0 grid-cols-3 items-center justify-center gap-1 border-t border-border pt-1 min-[380px]:flex lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0 [&>button]:min-w-0 min-[380px]:[&>button]:flex-1 lg:[&>button]:flex-none">
        <button type="button" onClick={() => void (screenShare.sharing || screenShare.busy ? screenShare.stop() : screenShare.start())}
          title={screenShare.sharing ? "Stop sharing" : "Share screen"} aria-pressed={screenShare.sharing}
          className={`inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold sm:flex-row sm:gap-2 ${screenShare.sharing ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
          {screenShare.sharing ? <ScreenShareOff size={18} /> : <ScreenShare size={18} />}
          {screenShare.busy ? "Cancel sharing" : screenShare.sharing ? "Stop sharing" : "Share screen"}
        </button>
        {collaborationControls}
        <button type="button" title="People" onClick={() => setToolPanel(toolPanel === "people" ? null : "people")} aria-expanded={toolPanel === "people"} className={`inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold sm:flex-row sm:gap-2 ${toolPanel === "people" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Users size={18} /><span>People <span className="tabular-nums">{participants.length}</span></span></button>
        {!captureGroupId?.trim() ? <button type="button" title="Recording" onClick={() => setToolPanel("recording")} className="min-h-11 rounded-xl px-3 text-xs font-semibold hover:bg-muted"><Radio size={18} />Recording</button> : null}
        <button type="button" title="Devices" onClick={() => setToolPanel("devices")} className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-muted sm:flex-row sm:gap-2"><Settings2 size={18} />Devices</button>
        <button type="button" title="More" onClick={() => setToolPanel("details")} className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-muted sm:flex-row sm:gap-2"><Ellipsis size={18} />More</button>
      </div> : null}
      </div>
      {callAudioMode === "this-device" ? <div data-testid="call-microphone-status" data-routine={!microphoneRecoveryHeld}><LiveMicrophoneStatus evidence={meterEvidence} muted={microphoneMuted} recoveryHeld={microphoneRecoveryHeld} compact={Boolean(controlsContainer)} /></div> : null}
      {cameraControlError ? <p role="alert" className="text-xs leading-5 text-destructive">{cameraControlError}</p> : null}
      {screenShare.error ? <p role="alert" className="text-xs leading-5 text-destructive">{screenShare.error}</p> : null}
      {screenShare.sharing ? <p role="status" className="text-center text-xs text-muted-foreground">You’re sharing your screen live. Local recordings still capture your microphone and camera, not the shared screen.</p> : null}
    </div>
  ) : null;

  return (
    <section className={stageLayout ? "flex h-full min-h-0 min-w-0 flex-col text-foreground" : `overflow-hidden rounded-[1.75rem] border border-[#d8c7a7] bg-[#fffdf8] shadow-sm ${compact ? "p-4" : "p-5 sm:p-7"}`} aria-labelledby={`live-room-${callRoomId}`}>
      <div ref={bindRemoteMediaElement} aria-label="Remote participant audio" className="hidden" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className={showSessionHeading ? "max-w-3xl" : "sr-only"}>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-800"><Radio size={14} aria-hidden="true" /> Call · {experience.label}</p>
          <h2 id={`live-room-${callRoomId}`} className="mt-2 font-serif text-3xl font-black text-[#3d3122]">{sessionTitle}</h2>
        </div>
        <div className={showSessionHeading || connected && !stageLayout ? "flex flex-wrap items-center gap-2" : "sr-only"}>
          {connected ? <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-900">{participants.length} in call</span> : null}
          <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${connected ? "border-emerald-300 bg-emerald-50 text-emerald-900" : status === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-violet-200 bg-violet-50 text-violet-900"}`}>{statusLabel}</span>
        </div>
      </div>

      <div className={stageLayout ? "flex min-h-0 flex-1 flex-col" : `${showSessionHeading ? "mt-5 " : ""}grid gap-4 ${narrow ? "" : "xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]"}`}>
        <div className={stageLayout ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4"}>
          {stageLayout && status === "ended" && callEndedByPerson ? (
            <CallFollowThrough roomId={callRoomId}
              recording={recordingHandoff?.identity === recorderIdentity ? recordingHandoff.value : null}
              onOpenWork={onOpenSessionWork} onOpenRecording={() => setToolPanel("recording")}
              onRejoin={callPermanentlyClosed ? undefined : () => void join()} />
          ) : !connected && callPermanentlyClosed ? (
            <section className="rounded-2xl border border-slate-300 bg-slate-50 p-4" aria-label="Call closed">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Call ended</p>
              <h3 className="mt-1 font-serif text-2xl font-black text-slate-950">This Session is closed</h3>
              <p className="mt-2 text-xs font-bold leading-5 text-slate-800">Your retained recording is separate and remains available below to stop, save, upload, or recover.</p>
            </section>
          ) : !connected ? (
            <section className={stageLayout ? "mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center py-2 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)] lg:content-center lg:gap-x-8" : "rounded-2xl border border-violet-200 bg-violet-50/70 p-4 sm:p-5"} aria-label={callRecoveryAvailable ? "Ready to rejoin" : "Ready to join"}>
              <div className={`flex flex-wrap items-start justify-between gap-3 ${stageLayout ? "lg:col-start-2 lg:row-start-1" : ""}`}>
                <div>
                  {!stageLayout ? <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">{callRecoveryAvailable ? "Call disconnected" : "Call lobby"}</p> : null}
                  <h3 className="text-2xl font-semibold text-foreground">{callRecoveryAvailable ? "Ready to rejoin?" : "Ready to join?"}</h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-violet-900">
                    {callAudioMode === "other-device"
                      ? "Call audio on your other device"
                      : microphones.find((device) => device.deviceId === microphoneId)?.label || "Audio on this device"}
                    {cameraEnabledForNextJoin ? ` · ${cameras.find((device) => device.deviceId === cameraId)?.label || "Camera on when you join"}` : " · Camera off"}
                  </p>
                </div>
                {previewTested ? <span className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-violet-950">Preview ready</span> : null}
              </div>
              <div className={stageLayout ? "mt-4 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:mt-0" : "mt-4"}>{callVideoStage}</div>
              <div className={`mt-4 flex flex-wrap gap-2 ${stageLayout ? "justify-center lg:col-start-2" : ""}`}>
                {callAudioMode === "this-device" ? <button
                  type="button"
                  onClick={() => {
                    if (callRecoveryAvailable) {
                      const nextMuted = !microphoneMutedRef.current;
                      setMicrophoneMuted(nextMuted);
                      microphoneMutedRef.current = nextMuted;
                      return;
                    }
                    setJoinMuted((current) => !current);
                  }}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-black ${mutedForNextJoin ? "bg-rose-100 text-rose-950" : "border border-violet-200 bg-white text-violet-950"}`}
                  aria-pressed={mutedForNextJoin}
                >
                  {mutedForNextJoin ? <MicOff size={16} /> : <Mic size={16} />}{mutedForNextJoin ? "Muted" : "Mic on"}
                </button> : null}
                <button
                  type="button"
                  onClick={() => {
                    if (callRecoveryAvailable || sourceLocked) {
                      const nextEnabled = !cameraEnabledForNextJoin;
                      setCameraWanted(nextEnabled);
                      cameraWantedRef.current = nextEnabled;
                      setCameraMuted(!nextEnabled);
                      cameraMutedRef.current = !nextEnabled;
                      return;
                    }
                    void previewLobbyCamera(!cameraEnabledForNextJoin);
                  }}
                  disabled={status === "joining"}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-black ${cameraEnabledForNextJoin ? "border border-violet-200 bg-white text-violet-950" : "bg-rose-100 text-rose-950"}`}
                  aria-pressed={cameraEnabledForNextJoin}
                >
                  {cameraEnabledForNextJoin ? <Camera size={16} /> : <CameraOff size={16} />}{cameraEnabledForNextJoin ? "Camera on" : "Camera off"}
                </button>
                {stageLayout ? <button type="button" onClick={() => setToolPanel("devices")} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold"><Settings2 size={16} />Devices</button> : null}
                <button type="button" autoFocus={stageLayout} onClick={() => void join()} disabled={status === "checking" || status === "joining"} className={stageLayout ? "mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground disabled:opacity-50" : "inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-6 text-xs font-black text-white disabled:opacity-50"}>
                  {status === "joining" ? <LoaderCircle size={15} className="animate-spin" /> : <Radio size={15} />} {callRecoveryAvailable ? "Rejoin call" : "Join call"}
                </button>
              </div>
              {status === "checking" || cameraToggleBusy ? <div className={stageLayout ? "mt-3 flex flex-wrap justify-center gap-2 lg:col-start-2" : "mt-3 flex flex-wrap gap-2"}>
                <button type="button" onClick={cancelDeviceSetup} className="min-h-11 rounded-xl border border-border px-4 text-sm">Cancel setup</button>
                <button type="button" onClick={() => void join({ withoutDevices: true })} className="min-h-11 rounded-xl px-4 text-sm font-semibold underline underline-offset-4">Join without microphone or camera</button>
              </div> : null}
              {callAudioMode === "this-device" && previewTested && Boolean(preflightStreamRef.current?.getAudioTracks().length) ? (
                <PreJoinMicrophoneActivity
                  evidence={meterEvidence}
                  muted={mutedForNextJoin}
                />
              ) : null}
              <p className={`mt-3 text-xs leading-5 text-muted-foreground ${stageLayout ? "text-center lg:col-start-2" : ""}`}>
                {callAudioMode === "other-device"
                  ? "Quipsly keeps this device’s call microphone and speakers off to prevent echo."
                  : mutedForNextJoin
                    ? "This device will join muted."
                    : stageLayout ? "" : "This device will handle the conversation audio."}
                {" "}Joining doesn’t start recording.
              </p>
            </section>
          ) : null}

          {connected ? callVideoStage : null}
          {stageLayout ? <div ref={setConsentContainer} hidden={!connected} className="empty:hidden" data-testid="call-recording-choice-slot" /> : null}
          {stageLayout && connected && retainedGuardianEvidence?.issue ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-3 text-sm">
            <p>Recording needs attention: {retainedGuardianEvidence.issue.detail}</p>
            <button type="button" onClick={() => setToolPanel("recording")} className="min-h-11 rounded-xl border border-border px-3 font-semibold">Open recording</button>
          </div> : null}

          {/* Keep transport and capture ownership here while the dock places
              these controls outside its independently scrolling/hidden panes. */}
          {controlsContainer ? createPortal(callControls, controlsContainer) : callControls}

          {stageLayout && !connected && showRetainedSourceControls ? <button type="button" onClick={() => setToolPanel("recording")} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Recordings and saved uploads</button> : null}

          {/* One stable recorder owns capture/recovery across call transitions.
              Keep it mounted in the lobby so a reload resumes saved uploads
              without asking someone to join the conversation again. */}
          <CallWorkspacePanel title="Recording" open={toolPanel === "recording"} onClose={closeToolPanel} inline={!stageLayout} container={toolPanelContainer}>
          <div hidden={!showRetainedSourceControls} data-testid="session-recorder-surface">
            {retainedSourceControls}
          </div>
          </CallWorkspacePanel>

          <CallWorkspacePanel title="Audio and video settings" open={toolPanel === "devices"} onClose={closeToolPanel} inline={!stageLayout} container={toolPanelContainer}>
          <details ref={deviceSettingsRef} open={stageLayout || undefined} data-testid="call-device-settings" className={stageLayout ? "" : "rounded-2xl border border-border bg-card p-4"}>
            <summary className={stageLayout ? "hidden" : "cursor-pointer text-xs font-semibold text-foreground"}>Audio and video settings</summary>
          <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Where to use call audio">
            <button
              type="button"
              onClick={() => void chooseCallAudioMode("this-device")}
              disabled={callAudioModeBusy}
              className={`min-h-12 rounded-xl border px-3 py-2 text-left text-xs font-semibold ${callAudioMode === "this-device" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-foreground"}`}
              aria-pressed={callAudioMode === "this-device"}
            >
              <span className="flex items-center gap-2"><Headphones size={16} /> Audio on this device</span>
              <span className={`mt-1 block text-[10px] font-semibold ${callAudioMode === "this-device" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>Talk and listen here</span>
            </button>
            <button
              type="button"
              onClick={() => void chooseCallAudioMode("other-device")}
              disabled={callAudioModeBusy}
              className={`min-h-12 rounded-xl border px-3 py-2 text-left text-xs font-semibold ${callAudioMode === "other-device" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-foreground"}`}
              aria-pressed={callAudioMode === "other-device"}
            >
              <span className="flex items-center gap-2"><Smartphone size={16} /> Audio on another device</span>
              <span className={`mt-1 block text-[10px] font-semibold ${callAudioMode === "other-device" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>Prevents echo when joining twice</span>
            </button>
          </div>
          <div className={`mt-4 grid gap-3 ${toolPanelContainer ? "" : "md:grid-cols-2"}`} role="group" aria-label={connected ? "Live studio devices" : "Preflight studio devices"}>
            {callAudioMode === "this-device" ? <label className="text-xs font-semibold text-foreground">Microphone
              <select value={microphoneId} disabled={sourceLocked} onChange={(event) => void chooseMicrophone(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-3 text-sm font-semibold normal-case tracking-normal disabled:cursor-not-allowed disabled:opacity-55">
                <option value="">Choose a microphone</option>{microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
            </label> : <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs font-bold leading-5 text-sky-950">
              Call audio is off on this device. Use your other device to talk and listen.
            </div>}
            <label className="text-xs font-semibold text-foreground">Camera
              <select value={cameraId} disabled={sourceLocked || cameraToggleBusy} onChange={(event) => void chooseCamera(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-3 text-sm font-semibold normal-case tracking-normal disabled:cursor-not-allowed disabled:opacity-55">
                <option value="">Choose a camera</option>{cameras.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
            </label>
            {callAudioMode === "this-device" ? <div className="text-xs font-semibold text-foreground">
              <label>Headphones / output
                <select value={outputId} disabled={!supportsOutputSelection} onChange={(event) => chooseOutput(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-3 text-sm font-semibold normal-case tracking-normal disabled:opacity-50">
                  <option value="">System default</option>{outputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                </select>
              </label>
              {!supportsOutputSelection ? <span className="mt-1 block text-[10px] font-bold normal-case tracking-normal text-muted-foreground">This browser uses your system audio output. Choose your headphones in your device’s sound settings.</span> : null}
              {supportsOutputPrompt ? <button type="button" onClick={() => void chooseAudioOutput()} className="mt-2 min-h-9 rounded-full border border-sky-300 bg-sky-50 px-3 text-[10px] font-semibold normal-case tracking-normal text-sky-950">Choose headphone output…</button> : null}
              <StudioSpeakerTest
                outputId={outputId}
                outputLabel={outputs.find((device) => device.deviceId === outputId)?.label || "the system output"}
                disabled={status === "checking" || status === "joining"}
              />
            </div> : null}
            {!connected ? <div className="flex min-h-12 items-center rounded-xl border border-border bg-muted px-3 text-xs font-bold leading-5 text-muted-foreground">
              Your device choices are remembered.
            </div> : <div className={`flex min-h-12 items-center rounded-xl border px-3 text-xs font-semibold leading-5 ${sourceLocked ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
              {sourceLocked ? "Stop recording before changing its microphone or camera." : "Changes apply to this call."}
            </div>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!sourceLocked && ((callAudioMode === "this-device" && !microphoneId) || (!connected && cameraWanted && !cameraId)) ? <>
              <button type="button" aria-label={callAudioMode === "this-device" ? `Allow microphone${cameraWanted ? " and camera" : ""}` : "Allow camera"} onClick={() => void allowAndPreviewDevices()} disabled={status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground disabled:opacity-50">{status === "checking" ? <LoaderCircle size={15} className="animate-spin" /> : callAudioMode === "this-device" ? <Mic size={15} /> : <Camera size={15} />} {callAudioMode === "this-device" ? `Use microphone${cameraWanted ? " and camera" : ""}` : "Use camera"}</button>
            </> : null}
            {!connected ? <button type="button" aria-label="Test selected setup" onClick={() => void startSelectedPreview()} disabled={(cameraWanted && !cameraId) || status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-muted px-4 text-xs font-semibold text-foreground disabled:opacity-50"><Video size={15} /> Preview</button> : null}
            <button type="button" onClick={() => void refreshDevices("none", "manual")} disabled={status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground disabled:opacity-50"><RefreshCw size={15} /> Refresh devices</button>
          </div>

          {!connected && callAudioMode === "this-device" ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-[10px] font-semibold text-foreground">Test microphone</summary>
              <div className="mt-3">
              <StudioSoundCheck
                getInputStream={currentPreflightStream}
                prepareInputStream={() => startSelectedPreview(true)}
                microphoneLabel={microphones.find((device) => device.deviceId === microphoneId)?.label || ""}
                outputId={outputId}
                evidence={meterEvidence}
                setupKey={[microphoneId, cameraWanted ? cameraId : "camera-off", outputId || "system-output"].join(":")}
                disabled={status === "checking" || status === "joining"}
              />
              </div>
            </details>
          ) : null}

          <details data-testid="call-technical-device-details" className="mt-4 rounded-xl border border-border bg-muted p-3">
            <summary className="cursor-pointer text-[10px] font-semibold text-muted-foreground">Technical device details</summary>
            <div className="mt-3 space-y-3">
              {technicalMessage ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 font-mono text-[10px] font-semibold leading-4 text-amber-950" data-testid="call-technical-error">{technicalMessage}</p> : null}
              <StudioInputEvidenceMeter evidence={meterEvidence} />
              {cameraWanted ? <StudioCameraEvidence cameraLabel={cameras.find((device) => device.deviceId === cameraId)?.label || ""} evidence={cameraEvidence} /> : null}
            </div>
          </details>
          </details>
          </CallWorkspacePanel>

          {!(stageLayout && status === "ended" && callEndedByPerson) && (showCallNotice || ["checking", "joining", "connected", "reconnecting", "ended", "error"].includes(status)) ? (
            <p data-testid="call-status-message" role="status" aria-live="polite" className={stageLayout && connected && message.startsWith("You’re connected.") ? "sr-only" : "rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-card-foreground"}>{message}</p>
          ) : null}

        </div>

        {stageLayout ? <CallWorkspacePanel title="People" open={toolPanel === "people"} onClose={closeToolPanel} container={toolPanelContainer}>
          <CallPeoplePanel participants={participants.map(person => person.isLocal ? { ...person, microphoneMuted: microphoneMuted || callAudioMode === "other-device" } : person)} sharingIdentities={[...participantVideos, ...screenShare.videos].filter(video => video.track.source === Track.Source.ScreenShare).map(video => video.identity)} />
        </CallWorkspacePanel> : null}
        <CallWorkspacePanel title="Call details" open={toolPanel === "details"} onClose={closeToolPanel} inline={!stageLayout} container={toolPanelContainer}>
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
            <p className="mt-2">Using a USB microphone or audio interface? Select it as your microphone and choose its headphone output. If your browser cannot change the output, use your device’s sound settings.</p>
          </div>
            </div>
          </details>
        </aside>
        <details className="mt-4 rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Recording diagnostics</summary>
          <div className="mt-4"><SessionGuardianCard projection={guardianProjection} /></div>
        </details>
        </CallWorkspacePanel>
      </div>
      <div className="mt-5 space-y-4">
        {!connected && localRecordingFallback ? (
          <section
            className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
            aria-label="Local recording fallback"
          >
            <p className="text-xs font-black uppercase tracking-wide">
              Call unavailable · recorder ready
            </p>
            <p className="mt-2 text-sm font-semibold leading-6">
              Retry Join call when you want the conversation here. You can also
              use the protected recorder below now; it still waits for consent,
              saves on this device first, and uploads to this Session.
            </p>
          </section>
        ) : null}
      </div>
    </section>
  );
}
