"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PROJECT_SLUG } from "@/lib/studio/project-registry";

type CallRole = "host" | "guest";
type ConnectionStatus = "idle" | "joining" | "calling" | "connected" | "ended" | "error";
type RecordingStatus = "idle" | "recording" | "uploading" | "uploaded" | "error";

type SignalMessage = {
  id: string;
  from: string;
  to?: string;
  type: "offer" | "answer" | "ice" | "bye";
  payload: unknown;
  createdAt: string;
};

type Participant = {
  peerId: string;
  name: string;
  role: CallRole | string;
  joinedAt: string;
  lastSeenAt: string;
};

type EpisodeProductionState = {
  ok: boolean;
  mode: "database" | "fallback" | "conflict";
  id: string;
  projectSlug: string;
  slug: string;
  title: string;
  boundaryLabel: string;
  status: string;
  recordingRoomJson?: unknown;
  updatedAt?: string;
};

type PersistedTrack = {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: "audio" | "video";
  trackId: string;
  createdAt: string;
  sourceId?: string;
  sourceUrl?: string;
  durationMs?: number;
  uploadState?: "uploaded" | "error";
  uploadMessage?: string;
  fileName?: string;
  recordedStartAt?: string;
  recordedEndAt?: string;
  recordedSessionStartMs?: number;
  recordedSessionEndMs?: number;
};

type RoomPayload = {
  exportedAt: string;
  roomName: string;
  script: string;
  producerNotes: string;
  clips: unknown[];
  events: unknown[];
  tracks: PersistedTrack[];
};

const DEFAULT_EPISODE_SLUG = "episode-8";
const SIGNAL_POLL_MS = 1200;
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatClock(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function inferFileExt(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function getIceServers() {
  const raw = process.env.NEXT_PUBLIC_QUIPSLY_ICE_SERVERS_JSON;
  if (!raw) return DEFAULT_ICE_SERVERS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as RTCIceServer[]) : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

function getRouteParams() {
  if (typeof window === "undefined") {
    return {
      projectSlug: DEFAULT_PROJECT_SLUG,
      episodeSlug: DEFAULT_EPISODE_SLUG,
      roomId: "main",
      role: "guest" as CallRole,
      name: "",
    };
  }
  const params = new URLSearchParams(window.location.search);
  const role: CallRole = params.get("role") === "host" ? "host" : "guest";
  return {
    projectSlug: params.get("project") || params.get("projectSlug") || DEFAULT_PROJECT_SLUG,
    episodeSlug: params.get("episode") || params.get("episodeSlug") || params.get("boundary") || DEFAULT_EPISODE_SLUG,
    roomId: params.get("room") || "main",
    role,
    name: params.get("name") || "",
  };
}

async function postJson<T>(url: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `${url} returned ${response.status}`);
  }
  return data as T;
}

async function uploadCallRecording(blob: Blob, args: {
  projectSlug: string;
  episodeSlug: string;
  trackId: string;
  name: string;
}) {
  const extension = inferFileExt(blob.type);
  const formData = new FormData();
  const fileName = `${args.projectSlug}-${args.episodeSlug}-${args.trackId}-call.${extension}`;
  formData.append("file", new File([blob], fileName, { type: blob.type || "audio/webm" }));
  formData.append("projectSlug", args.projectSlug);
  formData.append("episodeSlug", args.episodeSlug);
  formData.append("type", "audio");
  formData.append("trackId", args.trackId);

  const response = await fetch("/api/ingest/mobile", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.details || payload?.error || "Audio upload failed.");
  }

  return {
    fileName,
    sourceId: safeString(payload.sourceId),
    sourceUrl: safeString(payload.url),
    message: safeString(payload.message, "Uploaded"),
  };
}

function normalizeRoomPayload(value: unknown) {
  const record = asRecord(value);
  return {
    exportedAt: safeString(record.exportedAt, new Date().toISOString()),
    roomName: safeString(record.roomName, "Quipsly Call Room"),
    script: safeString(record.script),
    producerNotes: safeString(record.producerNotes),
    clips: asArray<unknown>(record.clips),
    events: asArray<unknown>(record.events),
    tracks: asArray<PersistedTrack>(record.tracks),
  } satisfies RoomPayload;
}

async function attachTrackToEpisode(track: PersistedTrack, args: {
  projectSlug: string;
  episodeSlug: string;
}) {
  const state = await postJson<EpisodeProductionState>("/api/episode-production", {
    action: "ensure",
    projectSlug: args.projectSlug,
    episodeSlug: args.episodeSlug,
  });
  const room = normalizeRoomPayload(state.recordingRoomJson);
  const packageJson = {
    payloadVersion: 2,
    version: "quipsly-recording-room.v2",
    exportedAt: new Date().toISOString(),
    projectSlug: args.projectSlug,
    episodeSlug: args.episodeSlug,
    roomName: room.roomName,
    script: room.script,
    producerNotes: room.producerNotes,
    clips: room.clips,
    events: [
      {
        id: makeId("call-event"),
        kind: "session",
        label: `Call recording uploaded: ${track.name}`,
        atMs: track.recordedSessionStartMs ?? 0,
        note: track.uploadMessage,
        createdAt: new Date().toISOString(),
      },
      ...room.events,
    ],
    tracks: [track, ...room.tracks.filter((existing) => existing.id !== track.id)],
  };

  return postJson<EpisodeProductionState>("/api/episode-production", {
    action: "save-recording-room",
    projectSlug: args.projectSlug,
    episodeSlug: args.episodeSlug,
    packageJson,
  });
}

export default function CallRoomPage() {
  const route = useMemo(() => getRouteParams(), []);
  const [projectSlug] = useState(route.projectSlug);
  const [episodeSlug] = useState(route.episodeSlug);
  const [roomId] = useState(route.roomId);
  const [role, setRole] = useState<CallRole>(route.role);
  const [name, setName] = useState(route.name);
  const [peerId, setPeerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("idle");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingStartedAt, setRecordingStartedAt] = useState<string | null>(null);
  const [recordingMessage, setRecordingMessage] = useState<string | null>(null);
  const [roomPayload, setRoomPayload] = useState<RoomPayload>(() => normalizeRoomPayload(null));
  const [roomMessage, setRoomMessage] = useState<string | null>(null);
  const [connectionDetails, setConnectionDetails] = useState("Not connected yet.");
  const [deviceMessage, setDeviceMessage] = useState("Mic not started yet.");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalSinceRef = useRef<string>("");
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const recordingStartMsRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const handledSignalIdsRef = useRef<Set<string>>(new Set());
  const stopRequestedRef = useRef(false);
  const uploadInFlightRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const statusRef = useRef<ConnectionStatus>("idle");
  const recordingStatusRef = useRef<RecordingStatus>("idle");
  const latestRoomRef = useRef({
    projectSlug,
    episodeSlug,
    roomId,
    peerId: "",
    name: "",
    role,
  });

  const displayName = name.trim() || (role === "host" ? "Charlie" : "Homer");
  const trackId = role === "host" ? "A1" : "A2";
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const callUrl = `${origin}/call?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}&room=${encodeURIComponent(roomId)}&role=guest`;

  const addLog = useCallback((message: string) => {
    setLogs((current) => [`${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })} ${message}`, ...current].slice(0, 18));
  }, []);

  const requestWakeLock = useCallback(async () => {
    const wakeLock = (navigator as unknown as { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wakeLock || document.visibilityState !== "visible") return;
    try {
      wakeLockRef.current = await wakeLock.request("screen");
      setDeviceMessage("Screen wake lock active. Keep this tab visible while recording.");
      addLog("Screen wake lock active.");
    } catch {
      setDeviceMessage("Could not hold a screen wake lock. Keep the device awake manually.");
    }
  }, [addLog]);

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!wakeLock) return;
    await wakeLock.release().catch(() => undefined);
  }, []);

  const refreshEpisodeRoom = useCallback(async () => {
    try {
      const state = await postJson<EpisodeProductionState>("/api/episode-production", {
        action: "ensure",
        projectSlug,
        episodeSlug,
      });
      setRoomPayload(normalizeRoomPayload(state.recordingRoomJson));
      setRoomMessage(state.mode === "database" ? "Loaded episode room." : state.mode);
    } catch (error) {
      setRoomMessage(error instanceof Error ? error.message : "Could not load episode room.");
    }
  }, [episodeSlug, projectSlug]);

  useEffect(() => {
    const stored = window.localStorage.getItem("quipsly-call-peer-id");
    const nextPeerId = stored || makeId("peer");
    window.localStorage.setItem("quipsly-call-peer-id", nextPeerId);
    setPeerId(nextPeerId);
  }, []);

  useEffect(() => {
    void refreshEpisodeRoom();
  }, [refreshEpisodeRoom]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    recordingStatusRef.current = recordingStatus;
  }, [recordingStatus]);

  useEffect(() => {
    latestRoomRef.current = {
      projectSlug,
      episodeSlug,
      roomId,
      peerId,
      name: displayName,
      role,
    };
  }, [displayName, episodeSlug, peerId, projectSlug, role, roomId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (recordingStatusRef.current === "recording" || recordingStatusRef.current === "uploading") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const handlePageHide = () => {
      const snapshot = latestRoomRef.current;
      if (snapshot.peerId) {
        const payload = new Blob([JSON.stringify({
          action: "leave",
          projectSlug: snapshot.projectSlug,
          episodeSlug: snapshot.episodeSlug,
          roomId: snapshot.roomId,
          peerId: snapshot.peerId,
          name: snapshot.name,
          role: snapshot.role,
        })], { type: "application/json" });
        navigator.sendBeacon?.("/api/call-signaling", payload);
      }
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible"
        && !wakeLockRef.current
        && (statusRef.current === "calling" || statusRef.current === "connected" || recordingStatusRef.current === "recording")
      ) {
        void requestWakeLock();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestWakeLock]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const signal = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!peerId) return null;
    return postJson<{
      participants: Participant[];
      messages: SignalMessage[];
      serverTime: string;
    }>("/api/call-signaling", {
      action,
      projectSlug,
      episodeSlug,
      roomId,
      peerId,
      name: displayName,
      role,
      since: signalSinceRef.current,
      ...extra,
    });
  }, [displayName, episodeSlug, peerId, projectSlug, role, roomId]);

  const sendSignal = useCallback(async (signalType: SignalMessage["type"], payload: unknown, toPeerId = "") => {
    await signal("signal", { signalType, payload, toPeerId });
  }, [signal]);

  const resetCallRoom = async () => {
    await signal("reset");
    signalSinceRef.current = "";
    handledSignalIdsRef.current.clear();
    pendingIceRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    setRemoteStream(null);
    setParticipants([]);
    setStatus("idle");
    setConnectionDetails("Call room reset. Start again when both people are ready.");
    addLog("Call room signaling reset.");
  };

  const ensurePeerConnection = useCallback((stream: MediaStream) => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
    });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (event) => {
      const [incoming] = event.streams;
      if (incoming) {
        setRemoteStream(incoming);
        setStatus("connected");
        addLog("Remote audio connected.");
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal("ice", event.candidate.toJSON());
      }
    };
    pc.oniceconnectionstatechange = () => {
      setConnectionDetails(`ICE ${pc.iceConnectionState}; peer ${pc.connectionState}.`);
    };
    pc.onsignalingstatechange = () => {
      setConnectionDetails(`Signaling ${pc.signalingState}; ICE ${pc.iceConnectionState}.`);
    };
    pc.onconnectionstatechange = () => {
      setConnectionDetails(`Peer ${pc.connectionState}; ICE ${pc.iceConnectionState}.`);
      if (pc.connectionState === "connected") setStatus("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setStatus("error");
        addLog(`Call connection ${pc.connectionState}.`);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [addLog, sendSignal]);

  const startLocalRecording = useCallback((stream: MediaStream) => {
    if (recorderRef.current?.state === "recording") return;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    uploadInFlightRef.current = false;
    stopRequestedRef.current = false;
    const startedAt = new Date();
    recordingStartMsRef.current = startedAt.getTime();
    setRecordingStartedAt(startedAt.toISOString());
    setElapsedMs(0);
    setRecordingStatus("recording");
    setRecordingMessage("Recording your local mic. This is the production source.");
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - recordingStartMsRef.current);
    }, 250);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      if (uploadInFlightRef.current) return;
      uploadInFlightRef.current = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      const stoppedAt = new Date();
      const durationMs = Math.max(0, stoppedAt.getTime() - recordingStartMsRef.current);
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      if (!blob.size) {
        setRecordingStatus("error");
        setRecordingMessage("No audio data was captured. Check mic permission and try again.");
        addLog("Recording stopped with no audio data.");
        uploadInFlightRef.current = false;
        return;
      }
      setRecordingStatus("uploading");
      setRecordingMessage(`Uploading ${formatClock(durationMs)} local take to the vault...`);

      try {
        const upload = await uploadCallRecording(blob, {
          projectSlug,
          episodeSlug,
          trackId,
          name: displayName,
        });
        const track: PersistedTrack = {
          id: makeId("call-track"),
          name: `${displayName} call recording`,
          size: blob.size,
          type: blob.type || mimeType || "audio/webm",
          kind: "audio",
          trackId,
          createdAt: new Date().toISOString(),
          sourceId: upload.sourceId,
          sourceUrl: upload.sourceUrl,
          durationMs,
          uploadState: "uploaded",
          uploadMessage: upload.message,
          fileName: upload.fileName,
          recordedStartAt: recordingStartedAt ?? new Date(recordingStartMsRef.current).toISOString(),
          recordedEndAt: stoppedAt.toISOString(),
          recordedSessionStartMs: 0,
          recordedSessionEndMs: durationMs,
        };
        await attachTrackToEpisode(track, { projectSlug, episodeSlug });
        await refreshEpisodeRoom();
        setRecordingStatus("uploaded");
        setRecordingMessage("Uploaded and attached to the episode timeline source room.");
        addLog("Local call recording uploaded and attached.");
      } catch (error) {
        setRecordingStatus("error");
        setRecordingMessage(error instanceof Error ? error.message : "Upload failed.");
        addLog("Recording upload failed.");
      }
    };

    recorderRef.current = recorder;
    recorder.start(1000);
    addLog("Local production recording started.");
  }, [addLog, displayName, episodeSlug, projectSlug, recordingStartedAt, refreshEpisodeRoom, trackId]);

  const handleSignalMessages = useCallback(async (messages: SignalMessage[]) => {
    const pc = pcRef.current;
    if (!pc) return;

    for (const message of messages) {
      if (handledSignalIdsRef.current.has(message.id)) continue;
      handledSignalIdsRef.current.add(message.id);
      if (message.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(message.payload as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal("answer", answer, message.from);
        for (const candidate of pendingIceRef.current.splice(0)) {
          await pc.addIceCandidate(candidate);
        }
        setStatus("calling");
        addLog("Received offer and sent answer.");
      }

      if (message.type === "answer" && pc.signalingState !== "stable") {
        await pc.setRemoteDescription(new RTCSessionDescription(message.payload as RTCSessionDescriptionInit));
        for (const candidate of pendingIceRef.current.splice(0)) {
          await pc.addIceCandidate(candidate);
        }
        addLog("Received answer.");
      }

      if (message.type === "ice") {
        const candidate = message.payload as RTCIceCandidateInit;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(candidate).catch(() => undefined);
        } else {
          pendingIceRef.current.push(candidate);
        }
      }

      if (message.type === "bye") {
        addLog("Remote participant left.");
      }
    }
  }, [addLog, sendSignal]);

  useEffect(() => {
    if (!peerId || status === "idle" || status === "ended") return;
    const interval = window.setInterval(() => {
      void signal("poll")
        .then(async (state) => {
          if (!state) return;
          setParticipants(state.participants ?? []);
          if (state.serverTime) signalSinceRef.current = state.serverTime;
          await handleSignalMessages(state.messages ?? []);
        })
        .catch((error) => {
          console.warn("Call signaling poll failed.", error);
        });
    }, SIGNAL_POLL_MS);

    return () => window.clearInterval(interval);
  }, [handleSignalMessages, peerId, signal, status]);

  const startCall = async () => {
    if (!peerId) return;
    setStatus("joining");
    setConnectionDetails("Requesting microphone permission...");
    setRecordingStatus("idle");
    setRecordingMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setDeviceMessage("Microphone active. Local production recording will upload when you stop.");
      await requestWakeLock();
      setLocalStream(stream);
      const pc = ensurePeerConnection(stream);
      const joinState = await signal("join");
      setParticipants(joinState?.participants ?? []);
      if (joinState?.messages?.length) {
        await handleSignalMessages(joinState.messages);
      }
      signalSinceRef.current = joinState?.serverTime ?? "";
      setStatus("calling");
      startLocalRecording(stream);

      if (role === "host") {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        await sendSignal("offer", offer);
        setConnectionDetails("Host offer sent. Waiting for guest answer.");
        addLog("Host offer sent. Share the guest link.");
      } else {
        setConnectionDetails("Joined as guest. Waiting for host offer.");
        addLog("Joined as guest. Waiting for host audio offer.");
      }
    } catch (error) {
      setStatus("error");
      setRecordingStatus("error");
      setRecordingMessage(error instanceof Error ? error.message : "Could not start call.");
      setDeviceMessage("Could not start the microphone/call. Check browser mic permission.");
      addLog("Could not start call.");
    }
  };

  const retryOffer = async () => {
    const stream = localStreamRef.current;
    if (!stream || role !== "host") {
      addLog("Only the host can retry the offer after starting the call.");
      return;
    }
    const previous = pcRef.current;
    previous?.close();
    pcRef.current = null;
    pendingIceRef.current = [];
    const pc = ensurePeerConnection(stream);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await sendSignal("offer", offer);
    setStatus("calling");
    setConnectionDetails("Host offer resent. Waiting for guest answer.");
    addLog("Host offer resent.");
  };

  const stopCall = async () => {
    if (stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    recorderRef.current?.state === "recording" ? recorderRef.current.stop() : undefined;
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("ended");
    setConnectionDetails("Call ended. Upload continues if a recording was active.");
    setDeviceMessage("Call ended. You can start another take if needed.");
    await releaseWakeLock();
    await signal("leave").catch(() => null);
    addLog("Call ended.");
  };

  const participantSummary = participants
    .filter((participant) => participant.peerId !== peerId)
    .map((participant) => participant.name)
    .join(", ");

  return (
    <main className="min-h-screen bg-[#17120d] px-4 py-6 text-[#fff4db] md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[2rem] border border-[#d7c3a1]/30 bg-[#241a10] p-5 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.25em] text-[#e7b15f]">Quipsly Live Call</div>
              <h1 className="mt-2 text-4xl font-black">Call, read, record locally, upload clean takes</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#d8c6a6]">
                WebRTC carries the live conversation. Your local microphone recording is the production source and uploads to the same episode media pipeline.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <Link className="rounded-full border border-[#f2b35b]/40 px-4 py-2 text-[#ffe2a8] hover:bg-[#f2b35b]/10" href={`/recorder?project=${projectSlug}&episode=${episodeSlug}`}>
                Recorder
              </Link>
              <Link className="rounded-full border border-[#f2b35b]/40 px-4 py-2 text-[#ffe2a8] hover:bg-[#f2b35b]/10" href={`/editor?project=${projectSlug}&episode=${episodeSlug}`}>
                Editor
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[2rem] border border-[#d7c3a1]/30 bg-[#fff4db] p-5 text-[#2b2117] shadow-xl">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-black uppercase tracking-[0.18em] text-[#8a5c1d]">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={role === "host" ? "Charlie" : "Homer"}
                  className="mt-1 w-full rounded-2xl border border-[#d8bf94] bg-white px-3 py-2 text-sm normal-case tracking-normal outline-none"
                />
              </label>
              <label className="text-xs font-black uppercase tracking-[0.18em] text-[#8a5c1d]">
                Role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as CallRole)}
                  disabled={status !== "idle" && status !== "ended"}
                  className="mt-1 w-full rounded-2xl border border-[#d8bf94] bg-white px-3 py-2 text-sm normal-case tracking-normal outline-none"
                >
                  <option value="host">Host</option>
                  <option value="guest">Guest</option>
                </select>
              </label>
              <div className="rounded-2xl border border-[#d8bf94] bg-white px-3 py-2">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8a5c1d]">Recording</div>
                <div className="mt-1 font-mono text-xl font-black">{recordingStatus === "recording" ? formatClock(elapsedMs) : recordingStatus}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={startCall}
                disabled={status === "joining" || status === "calling" || status === "connected"}
                className="rounded-3xl bg-[#2d2216] px-5 py-4 text-left text-lg font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-45"
              >
                Start live call + local recording
                <span className="mt-1 block text-xs font-bold text-[#e6c58b]">Mic permission required. Headphones recommended.</span>
              </button>
              <button
                type="button"
                onClick={stopCall}
                disabled={status === "idle" || status === "ended"}
                className="rounded-3xl border border-[#b04b31] bg-[#fff7ed] px-5 py-4 text-left text-lg font-black text-[#7a2418] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Stop call and upload take
                <span className="mt-1 block text-xs font-bold text-[#8a5c1d]">Upload starts after the recorder stops.</span>
              </button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={retryOffer}
                disabled={role !== "host" || !localStream || status === "idle" || status === "ended"}
                className="rounded-2xl border border-[#d8bf94] bg-white px-4 py-3 text-left text-sm font-black text-[#5d4528] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Retry host offer
                <span className="mt-1 block text-xs font-bold text-[#8a5c1d]">Use if guest joined but audio did not connect.</span>
              </button>
              <button
                type="button"
                onClick={resetCallRoom}
                className="rounded-2xl border border-[#b04b31] bg-[#fff1e8] px-4 py-3 text-left text-sm font-black text-[#7a2418]"
              >
                Reset call room
                <span className="mt-1 block text-xs font-bold text-[#8a5c1d]">Clears stale offers/ICE for a fresh attempt.</span>
              </button>
            </div>

            <div className="mt-5 rounded-3xl border border-[#d8bf94] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8a5c1d]">Live state</div>
                  <div className="mt-1 text-2xl font-black">{status}</div>
                </div>
                <div className="text-right text-sm font-bold text-[#6d5335]">
                  <div>{participantSummary ? `Remote: ${participantSummary}` : "Waiting for another participant"}</div>
                  <div>{remoteStream ? "Remote audio stream active" : "No remote stream yet"}</div>
                  <div>{connectionDetails}</div>
                </div>
              </div>
              <audio ref={remoteAudioRef} autoPlay controls className="mt-4 w-full" />
              {recordingMessage ? (
                <div className="mt-4 rounded-2xl border border-[#e3c99c] bg-[#fff9ed] p-3 text-sm font-bold text-[#604623]">
                  {recordingMessage}
                </div>
              ) : null}
              <div className="mt-3 rounded-2xl border border-[#e3c99c] bg-[#fff9ed] p-3 text-xs font-bold text-[#604623]">
                {deviceMessage}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-[#d8bf94] bg-[#fff9ed] p-4">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8a5c1d]">Guest link</div>
              <p className="mt-2 break-all rounded-2xl bg-white p-3 font-mono text-xs text-[#604623]">{callUrl}</p>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(callUrl)}
                className="mt-3 rounded-full border border-[#2d2216] bg-[#2d2216] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white"
              >
                Copy guest link
              </button>
            </div>

            <div className="mt-5 rounded-3xl border border-[#d8bf94] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8a5c1d]">Session manuscript</div>
                  <h2 className="mt-1 text-xl font-black">{roomPayload.roomName || "Episode room"}</h2>
                </div>
                <button
                  type="button"
                  onClick={refreshEpisodeRoom}
                  className="rounded-full border border-[#d7bd8f] bg-[#fff9ed] px-3 py-1.5 text-xs font-black text-[#5d4528]"
                >
                  Refresh
                </button>
              </div>
              {roomMessage ? <div className="mt-2 text-xs font-bold text-[#8a5c1d]">{roomMessage}</div> : null}
              <div className="mt-4 max-h-[26rem] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[#ead8b6] bg-[#fffaf0] p-4 text-base leading-7 text-[#352719]">
                {roomPayload.script || "No session script loaded yet. Use the recorder room to add the episode read-through text."}
              </div>
              {roomPayload.producerNotes ? (
                <div className="mt-3 rounded-2xl border border-[#ead8b6] bg-[#fff9ed] p-3 text-sm leading-6 text-[#604623]">
                  <strong>Notes:</strong> {roomPayload.producerNotes}
                </div>
              ) : null}
            </div>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-[#d7c3a1]/30 bg-[#241a10] p-5 shadow-xl">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#e7b15f]">Operator checklist</div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[#d8c6a6]">
                <p><strong>Use headphones.</strong> Echo cancellation helps, but headphones make this much less haunted.</p>
                <p><strong>Keep the tab foregrounded.</strong> Mobile browsers can get weird when backgrounded.</p>
                <p><strong>Stop cleanly.</strong> The local production take uploads after stop.</p>
                <p><strong>If the call glitches, keep going.</strong> The local recording is the source of truth.</p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-[#d7c3a1]/30 bg-[#241a10] p-5 shadow-xl">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#e7b15f]">Room log</div>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 text-xs text-[#d8c6a6]">
                {logs.length ? logs.map((entry) => (
                  <div key={entry} className="rounded-2xl border border-white/10 bg-white/5 p-2">{entry}</div>
                )) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">No call events yet.</div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-[#d7c3a1]/30 bg-[#241a10] p-5 shadow-xl">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#e7b15f]">Participants</div>
              <div className="mt-3 space-y-2 text-sm text-[#d8c6a6]">
                {participants.length ? participants.map((participant) => (
                  <div key={participant.peerId} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="font-black text-[#fff4db]">{participant.name} {participant.peerId === peerId ? "(you)" : ""}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-[#e7b15f]">{participant.role}</div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">No participants yet.</div>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
