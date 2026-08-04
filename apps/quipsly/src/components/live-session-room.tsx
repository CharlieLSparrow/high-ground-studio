"use client";

import {
  Camera,
  CameraOff,
  Headphones,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  ShieldCheck,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SessionKind = "coaching" | "episode";
type DeviceOption = { deviceId: string; label: string };
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

type RoomStatus = "preflight" | "checking" | "ready" | "joining" | "connected" | "reconnecting" | "ended" | "error";

function readableDeviceLabel(device: MediaDeviceInfo, index: number) {
  return device.label || `${device.kind === "audioinput" ? "Microphone" : device.kind === "videoinput" ? "Camera" : "Output"} ${index + 1}`;
}

function browserDeviceId() {
  const key = "quipsly-live-device-id";
  const stored = window.localStorage.getItem(key);
  if (stored) return stored;
  const value = `web-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, value);
  return value;
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

export function LiveSessionRoom({
  callRoomId,
  sessionTitle,
  kind,
  compact = false,
}: {
  callRoomId: string;
  sessionTitle: string;
  kind: SessionKind;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<RoomStatus>("preflight");
  const [message, setMessage] = useState("Choose the exact mic and camera you want Quipsly to use.");
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [cameraWanted, setCameraWanted] = useState(kind === "episode");
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [cameraMuted, setCameraMuted] = useState(false);
  const [participants, setParticipants] = useState<Array<{ identity: string; name: string; speaking: boolean }>>([]);
  const [recordingConsentGranted, setRecordingConsentGranted] = useState(false);
  const [recordingConsentStatus, setRecordingConsentStatus] = useState("not checked");
  const [level, setLevel] = useState(0);
  const [supportsOutputSelection, setSupportsOutputSelection] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const preflightStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteMediaRef = useRef<HTMLDivElement | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);

  const connected = status === "connected" || status === "reconnecting";
  const statusLabel = useMemo(() => status.replace(/\b\w/g, (letter) => letter.toUpperCase()), [status]);

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

  const refreshDevices = useCallback(async (permission: "none" | "microphone" | "camera" = "none") => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setStatus("error");
      setMessage("This browser cannot access media devices. Use HTTPS, localhost, or Quipsly Capture on iPhone.");
      return;
    }
    setStatus("checking");
    setMessage(permission === "microphone"
      ? "Waiting for browser microphone permission…"
      : permission === "camera"
        ? "Waiting for browser camera permission…"
        : "Reading available devices…");
    try {
      if (permission !== "none") {
        stopStream(preflightStreamRef.current);
        preflightStreamRef.current = await getUserMediaWithTimeout({
          audio: permission === "microphone",
          video: permission === "camera",
        });
        stopStream(preflightStreamRef.current);
        preflightStreamRef.current = null;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const rawMicrophones = devices.filter((device) => device.kind === "audioinput");
      const rawCameras = devices.filter((device) => device.kind === "videoinput");
      const nextMicrophones = rawMicrophones.filter((device) => device.deviceId).map((device, index) => ({ deviceId: device.deviceId, label: readableDeviceLabel(device, index) }));
      const nextCameras = rawCameras.filter((device) => device.deviceId).map((device, index) => ({ deviceId: device.deviceId, label: readableDeviceLabel(device, index) }));
      const nextOutputs = devices.filter((device) => device.kind === "audiooutput" && device.deviceId).map((device, index) => ({ deviceId: device.deviceId, label: readableDeviceLabel(device, index) }));
      setMicrophones(nextMicrophones);
      setCameras(nextCameras);
      setOutputs(nextOutputs);
      setMicrophoneId((current) => current || nextMicrophones[0]?.deviceId || "");
      setCameraId((current) => current || nextCameras[0]?.deviceId || "");
      setOutputId((current) => current || nextOutputs[0]?.deviceId || "");
      const microphoneNamesVisible = nextMicrophones.some((device) => !/^Microphone \d+$/.test(device.label));
      const cameraNamesVisible = nextCameras.some((device) => !/^Camera \d+$/.test(device.label));
      if (permission === "camera" && !nextCameras.length) {
        setStatus("error");
        setMessage("Camera access did not expose a usable device. Open this site's camera controls, choose the Canon or desired camera, then try again—or turn off Join with camera.");
      } else if (permission === "camera") {
        setStatus("ready");
        setMessage(cameraNamesVisible ? "Camera names are visible. Choose the exact camera and run the preview." : "Camera access is available. Use the preview to verify the selected source.");
      } else if (!nextMicrophones.length) {
        setStatus(rawMicrophones.length ? "preflight" : "error");
        setMessage(rawMicrophones.length
          ? "A microphone is present, but the browser is hiding the usable device until you allow microphone access."
          : "No microphone was found. Check the cable and macOS Sound settings, then scan again.");
      } else if (cameraWanted && !nextCameras.length) {
        setStatus("preflight");
        setMessage("Microphone names are visible. Allow and choose a camera, or turn off Join with camera for an audio-only call.");
      } else {
        setStatus("ready");
        setMessage(microphoneNamesVisible
          ? "Microphone names are visible. Choose the exact source, then run the confidence check before joining."
          : "Microphone access is available. Use the confidence check to verify the selected source.");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? `Device check failed: ${error.message}` : "Device permission was not granted.");
    }
  }, []);

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
      stopStream(preflightStreamRef.current);
      meterCleanupRef.current?.();
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
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }
        setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      meterCleanupRef.current = () => {
        cancelAnimationFrame(frame);
        void context.close();
        setLevel(0);
      };
      setStatus("ready");
      setMessage("Preview is live. This is a device check only—nothing is sent or recorded.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? `Selected device could not start: ${error.message}` : "Selected device could not start.");
    }
  }, [cameraId, cameraWanted, microphoneId]);

  const leave = useCallback(async () => {
    meterCleanupRef.current?.();
    meterCleanupRef.current = null;
    stopStream(preflightStreamRef.current);
    preflightStreamRef.current = null;
    roomRef.current?.disconnect(true);
    roomRef.current = null;
    clearRemoteMedia();
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setParticipants([]);
    setStatus("ended");
    setMessage("You left the live room. No provider recording was started by joining or leaving.");
  }, [clearRemoteMedia]);

  const join = useCallback(async () => {
    if (!microphoneId) {
      setMessage("Choose and test a microphone before joining.");
      return;
    }
    if (cameraWanted && !cameraId) {
      setStatus("error");
      setMessage("Choose a usable camera or turn off Join with camera before joining.");
      return;
    }
    setStatus("joining");
    setMessage("Requesting a short-lived, room-scoped key…");
    try {
      stopStream(preflightStreamRef.current);
      preflightStreamRef.current = null;
      meterCleanupRef.current?.();
      meterCleanupRef.current = null;
      const response = await fetch("/api/mobile/capture/rooms/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId,
          clientInstanceId: browserDeviceId(),
          clientKind: "web",
          deviceLabel: navigator.platform ? `Quipsly Web · ${navigator.platform}` : "Quipsly Web",
        }),
      });
      const packet = await response.json().catch(() => ({})) as JoinPacket;
      setRecordingConsentGranted(packet.recordingConsentGranted === true);
      setRecordingConsentStatus(packet.recordingConsentStatus || "not created");
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
        .on(RoomEvent.Reconnecting, () => {
          setStatus("reconnecting");
          setMessage("Network changed. Quipsly is reconnecting this live conversation…");
        })
        .on(RoomEvent.Reconnected, () => {
          setStatus("connected");
          setMessage("Reconnected. Local source recording remains separate from this conversation feed.");
        })
        .on(RoomEvent.Disconnected, () => {
          setStatus("ended");
          setMessage("The live conversation ended. Joining never started a recording.");
          setParticipants([]);
          clearRemoteMedia();
        });

      await room.connect(packet.serverUrl, packet.participantToken);
      await room.switchActiveDevice("audioinput", microphoneId);
      await room.localParticipant.setMicrophoneEnabled(true, {
        deviceId: microphoneId,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (cameraWanted && cameraId) {
        await room.switchActiveDevice("videoinput", cameraId);
        const publication = await room.localParticipant.setCameraEnabled(true, {
          deviceId: cameraId,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
        });
        const mediaTrack = publication?.track?.mediaStreamTrack;
        if (localVideoRef.current && mediaTrack) {
          localVideoRef.current.srcObject = new MediaStream([mediaTrack]);
          await localVideoRef.current.play().catch(() => undefined);
        }
      }
      room.remoteParticipants.forEach((participant: RemoteParticipant) => {
        participant.trackPublications.forEach((publication: RemoteTrackPublication) => {
          if (publication.track) attachRemoteTrack(publication.track);
        });
      });
      updateRoster(room);
      setStatus("connected");
      setMessage(packet.recordingConsentGranted
        ? "Live conversation connected. Recording is still off until a separate visible recording action creates evidence."
        : "Live conversation connected. Recording is held until every participant’s consent is current.");
    } catch (error) {
      roomRef.current?.disconnect(true);
      roomRef.current = null;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The live room could not connect.");
    }
  }, [attachRemoteTrack, callRoomId, cameraId, cameraWanted, clearRemoteMedia, microphoneId, updateRoster]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextMuted = !microphoneMuted;
    await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    setMicrophoneMuted(nextMuted);
  }, [microphoneMuted]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextMuted = !cameraMuted;
    await room.localParticipant.setCameraEnabled(!nextMuted, cameraId ? { deviceId: cameraId } : undefined);
    setCameraMuted(nextMuted);
  }, [cameraId, cameraMuted]);

  useEffect(() => {
    setSupportsOutputSelection(audioOutputSupported(document.createElement("audio")));
    void refreshDevices("none");
    const changed = () => void refreshDevices("none");
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
      meterCleanupRef.current?.();
      stopStream(preflightStreamRef.current);
      roomRef.current?.disconnect(true);
      clearRemoteMedia();
    };
  }, [clearRemoteMedia, refreshDevices]);

  useEffect(() => {
    if (!connected || !outputId) return;
    remoteMediaRef.current?.querySelectorAll("audio").forEach((element) => void routeAudioOutput(element));
  }, [connected, outputId, routeAudioOutput]);

  return (
    <section className={`overflow-hidden rounded-[1.75rem] border border-[#d8c7a7] bg-[#fffdf8] shadow-sm ${compact ? "p-4" : "p-5 sm:p-7"}`} aria-labelledby={`live-room-${callRoomId}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-800"><Radio size={14} aria-hidden="true" /> Live Session · {kind}</p>
          <h2 id={`live-room-${callRoomId}`} className="mt-2 font-serif text-3xl font-black text-[#3d3122]">Talk together from any device</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">
            Mac or PC browsers can use a studio mic and camera while iPhone Capture joins the same room. The call is for conversation; high-quality local sources remain separate and sync back to this Session.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${connected ? "border-emerald-300 bg-emerald-50 text-emerald-900" : status === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-violet-200 bg-violet-50 text-violet-900"}`}>{statusLabel}</span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-[#d8c7a7] bg-[#211a14]">
            <video ref={localVideoRef} muted playsInline className={`aspect-video w-full object-cover ${cameraWanted && !cameraMuted ? "" : "opacity-20"}`} />
            {!cameraWanted || cameraMuted ? <div className="absolute inset-0 grid place-items-center text-center text-[#f5dfb9]"><div><CameraOff className="mx-auto" aria-hidden="true" /><p className="mt-2 text-xs font-black uppercase tracking-wide">Camera off</p></div></div> : null}
            <div className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white">You · {sessionTitle}</div>
          </div>
          <div ref={remoteMediaRef} className="grid gap-3 md:grid-cols-2" aria-label="Remote participant media" />

          {!connected ? <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-black uppercase tracking-wide text-[#5b472f]">Microphone
              <select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)} className="mt-1 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal">
                <option value="">Choose a microphone</option>{microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-[#5b472f]">Camera
              <select value={cameraId} disabled={!cameraWanted} onChange={(event) => setCameraId(event.target.value)} className="mt-1 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal disabled:opacity-50">
                <option value="">Choose a camera</option>{cameras.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-[#5b472f]">Headphones / output
              <select value={outputId} disabled={!supportsOutputSelection} onChange={(event) => setOutputId(event.target.value)} className="mt-1 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal disabled:opacity-50">
                <option value="">System default</option>{outputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
              {!supportsOutputSelection ? <span className="mt-1 block text-[10px] font-bold normal-case tracking-normal text-[#8a7354]">This browser uses the macOS or system output. Choose the MV7i headphones there.</span> : null}
            </label>
            <label className="flex min-h-12 items-center gap-3 self-end rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm font-black text-[#5b472f]">
              <input type="checkbox" checked={cameraWanted} onChange={(event) => setCameraWanted(event.target.checked)} className="h-4 w-4 accent-violet-800" /> Join with camera
            </label>
          </div> : null}

          <div className="rounded-xl border border-[#d8c7a7] bg-white p-3">
            <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wide text-[#5b472f]"><span>Mic confidence meter</span><span>{Math.round(level * 100)}%</span></div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#eee4d2]" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}><div className={`h-full rounded-full transition-[width] ${level > 0.92 ? "bg-rose-600" : level > 0.08 ? "bg-emerald-600" : "bg-amber-500"}`} style={{ width: `${Math.max(2, level * 100)}%` }} /></div>
            <p className="mt-2 text-[10px] font-bold leading-4 text-[#8a7354]">This meter is confidence, not a production loudness measurement. The retained source gets waveform, loudness, clipping, and spectral review after capture.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!connected ? <>
              <button type="button" onClick={() => void refreshDevices("microphone")} disabled={status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8c7a7] bg-white px-4 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50">{status === "checking" ? <LoaderCircle size={15} className="animate-spin" /> : <Mic size={15} />} Allow microphone</button>
              {cameraWanted ? <button type="button" onClick={() => void refreshDevices("camera")} disabled={status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8c7a7] bg-white px-4 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50"><Camera size={15} /> Allow camera</button> : null}
              <button type="button" onClick={() => void startSelectedPreview()} disabled={!microphoneId || (cameraWanted && !cameraId) || status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-violet-50 px-4 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50"><Video size={15} /> Test selected setup</button>
              <button type="button" onClick={() => void join()} disabled={!microphoneId || (cameraWanted && !cameraId) || status === "checking" || status === "joining"} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{status === "joining" ? <LoaderCircle size={15} className="animate-spin" /> : <Radio size={15} />} Join live room</button>
            </> : <>
              <button type="button" onClick={() => void toggleMicrophone()} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-black uppercase tracking-wide ${microphoneMuted ? "bg-rose-100 text-rose-900" : "bg-[#3e2f21] text-white"}`}>{microphoneMuted ? <MicOff size={16} /> : <Mic size={16} />}{microphoneMuted ? "Unmute" : "Mute"}</button>
              {cameraWanted ? <button type="button" onClick={() => void toggleCamera()} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-black uppercase tracking-wide ${cameraMuted ? "bg-rose-100 text-rose-900" : "border border-[#d8c7a7] bg-white text-[#5b472f]"}`}>{cameraMuted ? <CameraOff size={16} /> : <Camera size={16} />}{cameraMuted ? "Start camera" : "Stop camera"}</button> : null}
              <button type="button" onClick={() => void leave()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-800 px-4 text-xs font-black uppercase tracking-wide text-white"><PhoneOff size={16} /> Leave</button>
            </>}
          </div>
          <p role="status" aria-live="polite" className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm font-bold leading-6 text-violet-950">{message}</p>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <ShieldCheck className="text-emerald-800" aria-hidden="true" />
            <h3 className="mt-2 font-serif text-xl font-black text-emerald-950">Conversation is not recording</h3>
            <p className="mt-2 text-xs font-bold leading-5 text-emerald-900">Joining publishes call media to participants. It does not start browser recording, iPhone local capture, or provider egress.</p>
            <p className="mt-3 rounded-xl bg-white/80 p-3 text-[10px] font-black uppercase tracking-wide text-emerald-950">Consent: {recordingConsentGranted ? "ready for a separate visible record action" : recordingConsentStatus}</p>
          </div>
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
        </aside>
      </div>
    </section>
  );
}
