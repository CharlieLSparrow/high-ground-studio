"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CallRole = "host" | "guest";
type ConnectionStatus = "idle" | "joining" | "calling" | "connected" | "ended" | "error";
type RecordingStatus = "unavailable";

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
const LEGACY_CALL_SIGNALING_RETIRED = true;
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
      projectSlug: "",
      episodeSlug: DEFAULT_EPISODE_SLUG,
      roomId: "main",
      role: "guest" as CallRole,
      name: "",
    };
  }
  const params = new URLSearchParams(window.location.search);
  const role: CallRole = params.get("role") === "host" ? "host" : "guest";
  return {
    projectSlug: params.get("project") || params.get("projectSlug") || "",
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

export default function CallRoomPage() {
  const route = useMemo(() => getRouteParams(), []);
  const [projectSlug] = useState(route.projectSlug);
  const [episodeSlug] = useState(route.episodeSlug);
  const [roomId] = useState(route.roomId);
  const [role, setRole] = useState<CallRole>(route.role);
  const [name, setName] = useState(route.name);
  const [peerId, setPeerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [recordingStatus] = useState<RecordingStatus>("unavailable");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [recordingMessage] = useState(
    "Web recording and upload are temporarily unavailable while this room moves to consent-bound resumable-v2. Live WebRTC audio still goes to call participants, but this page creates no recording file or recording upload.",
  );
  const [roomPayload, setRoomPayload] = useState<RoomPayload>(() => normalizeRoomPayload(null));
  const [roomMessage, setRoomMessage] = useState<string | null>(null);
  const [connectionDetails, setConnectionDetails] = useState("Not connected yet.");
  const [deviceMessage, setDeviceMessage] = useState("Mic not started yet.");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalSinceRef = useRef<string>("");
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const handledSignalIdsRef = useRef<Set<string>>(new Set());
  const stopRequestedRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const statusRef = useRef<ConnectionStatus>("idle");
  const latestRoomRef = useRef({
    projectSlug,
    episodeSlug,
    roomId,
    peerId: "",
    name: "",
    role,
  });

  const displayName = name.trim() || (role === "host" ? "Charlie" : "Homer");
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
      setDeviceMessage("Screen wake lock active. Keep this tab visible during the call.");
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
    if (LEGACY_CALL_SIGNALING_RETIRED) return;
    const stored = window.localStorage.getItem("quipsly-call-peer-id");
    const nextPeerId = stored || makeId("peer");
    window.localStorage.setItem("quipsly-call-peer-id", nextPeerId);
    setPeerId(nextPeerId);
  }, []);

  useEffect(() => {
    if (LEGACY_CALL_SIGNALING_RETIRED) return;
    void refreshEpisodeRoom();
  }, [refreshEpisodeRoom]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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
        && (statusRef.current === "calling" || statusRef.current === "connected")
      ) {
        void requestWakeLock();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
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
    stopRequestedRef.current = false;
    setStatus("joining");
    setConnectionDetails("Requesting microphone permission...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setDeviceMessage("Microphone active for the live call only. This page is not recording or uploading it.");
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
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("ended");
    setConnectionDetails("Call ended. No recording file was created or uploaded by this page.");
    setDeviceMessage("Call ended. Use iPhone Capture for a consent-bound production recording.");
    await releaseWakeLock();
    await signal("leave").catch(() => null);
    addLog("Call ended.");
  };

  const participantSummary = participants
    .filter((participant) => participant.peerId !== peerId)
    .map((participant) => participant.name)
    .join(", ");

  if (LEGACY_CALL_SIGNALING_RETIRED) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#17120d] px-4 py-10 text-[#fff4db] md:px-8">
        <section className="w-full max-w-3xl rounded-[2rem] border border-[#d7c3a1]/30 bg-[#241a10] p-7 shadow-xl md:p-10" role="status">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-[#e7b15f]">Live room migration</div>
          <h1 className="mt-3 text-4xl font-black">This prototype call room is retired.</h1>
          <p className="mt-5 text-base font-semibold leading-8 text-[#d8c6a6]">
            Quipsly did not join a room, request microphone access, create a guest link, start recording, or send signaling. Live podcast and coaching rooms must use the canonical Session, consent, participant, and recording evidence before this surface returns.
          </p>
          <div className="mt-7 rounded-2xl border border-[#f2b35b]/30 bg-[#17120d] p-4 text-sm leading-6 text-[#ffe2a8]">
            Use Sessions to prepare the people, goal, consent, and follow-through. Use iPhone Capture for a retained local recording source. Recorder remains available only after Nest access is verified.
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/coaching/sessions" className="rounded-full bg-[#f2b35b] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#17120d]">
              Open Sessions
            </Link>
            {projectSlug ? (
              <Link href={`/recorder?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`} className="rounded-full border border-[#f2b35b]/40 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#ffe2a8]">
                Open protected Recorder
              </Link>
            ) : null}
            <Link href="/projects" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#fff4db]">
              Choose a Nest
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#17120d] px-4 py-6 text-[#fff4db] md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[2rem] border border-[#d7c3a1]/30 bg-[#241a10] p-5 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.25em] text-[#e7b15f]">Quipsly Live Call</div>
              <h1 className="mt-2 text-4xl font-black">Call and read together</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#d8c6a6]">
                WebRTC carries the live conversation. Web recording and cloud upload are paused until this room has the same explicit consent and resumable-v2 evidence as iPhone Capture.
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

        {!projectSlug ? (
          <div className="mt-5 rounded-[1.5rem] border border-amber-400/40 bg-amber-200/10 p-5 text-sm leading-6 text-[#ffe2a8]">
            <strong className="block text-xs font-black uppercase tracking-[0.18em] text-[#f2b35b]">Choose a Nest first</strong>
            This call room needs an explicit project in the URL so signaling and session context attach to the right workspace.
            <Link className="ml-2 font-black underline decoration-[#f2b35b]/60 underline-offset-4" href="/projects">
              Open Nests
            </Link>
          </div>
        ) : null}

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
                <div className="mt-1 font-mono text-xl font-black">{recordingStatus}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={startCall}
                disabled={status === "joining" || status === "calling" || status === "connected"}
                className="rounded-3xl bg-[#2d2216] px-5 py-4 text-left text-lg font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-45"
              >
                Start live call
                <span className="mt-1 block text-xs font-bold text-[#e6c58b]">Mic permission required. No recording is created.</span>
              </button>
              <button
                type="button"
                onClick={stopCall}
                disabled={status === "idle" || status === "ended"}
                className="rounded-3xl border border-[#b04b31] bg-[#fff7ed] px-5 py-4 text-left text-lg font-black text-[#7a2418] disabled:cursor-not-allowed disabled:opacity-45"
              >
                End live call
                <span className="mt-1 block text-xs font-bold text-[#8a5c1d]">No recording or upload is created.</span>
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
                <p><strong>Record in iPhone Capture.</strong> This web room does not create or upload a production take.</p>
                <p><strong>Wait for resumable-v2 here.</strong> Web recording stays fail-closed until explicit consent and durable upload receipts are wired.</p>
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
