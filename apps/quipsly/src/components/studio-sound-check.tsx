"use client";

import { Headphones, Mic2, RotateCcw, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  studioSoundCheckGuidance,
  type StudioAudioMeterEvidence,
} from "@/lib/studio-audio-meter";

const SOUND_CHECK_SECONDS = 10;

export type StudioSoundCheckDecision = {
  requestId: string;
  playbackDecision: "HEARD_CLEAR" | "NEEDS_ADJUSTMENT";
  privateSampleDurationSeconds: number;
  privateSamplePlaybackComplete: true;
};

export type StudioSoundCheckDecisionResult = {
  ok: boolean;
  status?: "READY" | "NEEDS_ATTENTION";
  message: string;
};

function supportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return [
    "audio/webm;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/webm",
    "audio/mp4",
  ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function revoke(url: string | null) {
  if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

export function StudioSoundCheck({
  getInputStream,
  prepareInputStream,
  microphoneLabel,
  outputId,
  evidence,
  setupKey,
  onDecision,
  disabled = false,
}: {
  getInputStream: () => MediaStream | null;
  prepareInputStream?: () => Promise<MediaStream | null | undefined>;
  microphoneLabel: string;
  outputId: string;
  evidence: StudioAudioMeterEvidence | null;
  setupKey?: string;
  onDecision?: (decision: StudioSoundCheckDecision) => Promise<StudioSoundCheckDecisionResult>;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "ready" | "error">("idle");
  const [message, setMessage] = useState("Nothing is recorded, uploaded, or retained until you choose Record private sample.");
  const [remainingSeconds, setRemainingSeconds] = useState(SOUND_CHECK_SECONDS);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleDurationSeconds, setSampleDurationSeconds] = useState<number | null>(null);
  const [playbackComplete, setPlaybackComplete] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const sampleRequestIdRef = useRef<string | null>(null);
  const previousSetupKeyRef = useRef(setupKey || microphoneLabel);
  const guidance = studioSoundCheckGuidance(evidence);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  const clearSample = useCallback((nextMessage = "Private sample cleared. Run another whenever the setup changes.") => {
    clearTimers();
    audioRef.current?.pause();
    revoke(sampleUrlRef.current);
    sampleUrlRef.current = null;
    setSampleUrl(null);
    setSampleDurationSeconds(null);
    setPlaybackComplete(false);
    setReviewBusy(false);
    sampleRequestIdRef.current = null;
    setRemainingSeconds(SOUND_CHECK_SECONDS);
    setPhase("idle");
    setMessage(nextMessage);
  }, [clearTimers]);

  const stopRecording = useCallback(() => {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, [clearTimers]);

  const startRecording = useCallback(async () => {
    if (disabled || phase === "recording") return;
    if (typeof MediaRecorder === "undefined") {
      setPhase("error");
      setMessage("This browser cannot create a private sound-check sample. The live meter still works; try current Safari or Chrome for playback verification.");
      return;
    }
    let stream = getInputStream();
    let audioTracks = stream?.getAudioTracks().filter((track) => track.readyState !== "ended") ?? [];
    if ((!stream || audioTracks.length === 0) && prepareInputStream) {
      setMessage("Opening the selected microphone…");
      try {
        stream = await prepareInputStream() ?? null;
        audioTracks = stream?.getAudioTracks().filter((track) => track.readyState !== "ended") ?? [];
      } catch {
        stream = null;
        audioTracks = [];
      }
    }
    if (!stream || audioTracks.length === 0) {
      setPhase("error");
      setMessage("Quipsly could not open the selected microphone. Check browser access and try again.");
      return;
    }

    clearSample("Preparing the private sample…");
    sampleRequestIdRef.current = crypto.randomUUID();
    chunksRef.current = [];
    const mimeType = supportedAudioMimeType();
    try {
      const recorder = new MediaRecorder(
        new MediaStream(audioTracks),
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        clearTimers();
        if (!mountedRef.current) return;
        setPhase("error");
        setMessage("The browser could not finish the private sample. The selected setup remains open; try the sound check again.");
      };
      recorder.onstop = () => {
        clearTimers();
        recorderRef.current = null;
        if (!mountedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size === 0) {
          setPhase("error");
          setMessage("The browser returned an empty sound-check sample. Keep the setup open and retry before joining.");
          return;
        }
        if (typeof URL.createObjectURL !== "function") {
          setPhase("error");
          setMessage("The browser captured the sample but cannot create a private playback URL. Try current Safari or Chrome before joining.");
          return;
        }
        const url = URL.createObjectURL(blob);
        revoke(sampleUrlRef.current);
        sampleUrlRef.current = url;
        setSampleUrl(url);
        setSampleDurationSeconds(Math.max(0.1, (performance.now() - startedAtRef.current) / 1_000));
        setRemainingSeconds(0);
        setPhase("ready");
        setMessage("Private sample ready. Listen through headphones, then clear or repeat it. The bytes remain only in this browser tab.");
      };
      startedAtRef.current = performance.now();
      setRemainingSeconds(SOUND_CHECK_SECONDS);
      setPhase("recording");
      setMessage(`Recording ${SOUND_CHECK_SECONDS} private seconds from ${microphoneLabel || "the selected microphone"}…`);
      recorder.start(250);
      intervalRef.current = window.setInterval(() => {
        const elapsedSeconds = (performance.now() - startedAtRef.current) / 1_000;
        setRemainingSeconds(Math.max(0, Math.ceil(SOUND_CHECK_SECONDS - elapsedSeconds)));
      }, 200);
      timeoutRef.current = window.setTimeout(stopRecording, SOUND_CHECK_SECONDS * 1_000);
    } catch (error) {
      recorderRef.current = null;
      setPhase("error");
      setMessage(error instanceof Error ? `Private sound check could not start: ${error.message}` : "Private sound check could not start.");
    }
  }, [clearSample, clearTimers, disabled, getInputStream, microphoneLabel, phase, prepareInputStream, stopRecording]);

  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }) | null;
    if (!audio || !outputId || !audio.setSinkId) return;
    void audio.setSinkId(outputId).catch(() => {
      setMessage("The sample is ready, but this browser could not route it to the selected output. Choose the headphones in system sound settings.");
    });
  }, [outputId, sampleUrl]);

  useEffect(() => {
    const currentSetupKey = setupKey || microphoneLabel;
    if (previousSetupKeyRef.current === currentSetupKey) return;
    previousSetupKeyRef.current = currentSetupKey;
    if (phase === "recording") stopRecording();
    clearSample("The studio setup changed. Run the selected-device test and record a fresh private sample.");
  }, [clearSample, microphoneLabel, phase, setupKey, stopRecording]);

  useEffect(() => {
    // React development Strict Mode mounts, cleans up, then mounts this effect
    // again. Re-arm the guard so the second mount can still finish a sample.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder?.state === "recording") recorder.stop();
      revoke(sampleUrlRef.current);
    };
  }, [clearTimers]);

  const guidanceTone = guidance.tone === "danger"
    ? "border-rose-300 bg-rose-50 text-rose-950"
    : guidance.tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : guidance.tone === "ready"
        ? "border-emerald-300 bg-emerald-50 text-emerald-950"
        : "border-[#d8c7a7] bg-white text-[#5b472f]";

  const decide = useCallback(async (playbackDecision: StudioSoundCheckDecision["playbackDecision"]) => {
    if (!sampleRequestIdRef.current || !sampleDurationSeconds || !playbackComplete || reviewBusy) return;
    setReviewBusy(true);
    setMessage("Saving a device-and-evidence receipt only. The private audio remains in this tab.");
    try {
      const result = onDecision
        ? await onDecision({
            requestId: sampleRequestIdRef.current,
            playbackDecision,
            privateSampleDurationSeconds: sampleDurationSeconds,
            privateSamplePlaybackComplete: true,
          })
        : {
            ok: true,
            status: playbackDecision === "HEARD_CLEAR" ? "READY" as const : "NEEDS_ATTENTION" as const,
            message: playbackDecision === "HEARD_CLEAR"
              ? "You confirmed the private playback locally. No shared setup receipt was requested."
              : "You marked this local setup for adjustment. No shared setup receipt was requested.",
          };
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The setup receipt could not be saved. The private sample remains in this tab; retry the same decision.");
    } finally {
      setReviewBusy(false);
    }
  }, [onDecision, playbackComplete, reviewBusy, sampleDurationSeconds]);

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4" aria-label="Private studio sound check">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-violet-800"><Headphones size={14} aria-hidden="true" /> Private playback check</p>
          <h3 className="mt-1 font-serif text-xl font-black text-[#3d3122]">Hear what the call microphone hears</h3>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">Record up to ten seconds locally, then play it through the selected headphones. It is never uploaded, attached, or treated as a retained recording.</p>
        </div>
        <span className="rounded-full border border-violet-200 bg-white px-3 py-1 font-mono text-[9px] font-black uppercase tracking-wide text-violet-900">{phase === "recording" ? `${remainingSeconds}s left` : phase}</span>
      </div>

      <div className={`mt-3 rounded-xl border p-3 ${guidanceTone}`}>
        <p className="text-xs font-black">{guidance.heading}</p>
        <p className="mt-1 text-[10px] font-bold leading-4 opacity-80">{guidance.detail}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "recording" ? (
          <button type="button" onClick={stopRecording} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-800 px-4 text-xs font-black uppercase tracking-wide text-white"><Square size={14} fill="currentColor" aria-hidden="true" />Stop and listen</button>
        ) : (
          <button type="button" onClick={() => void startRecording()} disabled={disabled} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-4 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-45"><Mic2 size={15} aria-hidden="true" />Record private sample</button>
        )}
        {sampleUrl ? <button type="button" onClick={() => clearSample()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-white px-4 text-xs font-black uppercase tracking-wide text-violet-950"><RotateCcw size={14} aria-hidden="true" />Clear sample</button> : null}
      </div>

      {sampleUrl ? (
        <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-violet-900"><span className="flex items-center gap-2"><Volume2 size={14} aria-hidden="true" />Call-path sample</span><span>{sampleDurationSeconds?.toFixed(1)} seconds · tab only</span></div>
          <audio
            ref={audioRef}
            src={sampleUrl}
            controls
            preload="metadata"
            className="mt-2 w-full"
            aria-label="Private call-path sound-check sample"
            onPlay={() => setPlaybackComplete(false)}
            onEnded={() => {
              setPlaybackComplete(true);
              setMessage("Full private sample played. Confirm whether you heard the intended microphone clearly through the intended headphones.");
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void decide("HEARD_CLEAR")} disabled={!playbackComplete || reviewBusy} className="min-h-11 rounded-full bg-emerald-800 px-4 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-45">{reviewBusy ? "Saving check…" : "Sounds clear in headphones"}</button>
            <button type="button" onClick={() => void decide("NEEDS_ADJUSTMENT")} disabled={!playbackComplete || reviewBusy} className="min-h-11 rounded-full border border-amber-300 bg-amber-50 px-4 text-xs font-black uppercase tracking-wide text-amber-950 disabled:cursor-not-allowed disabled:opacity-45">Needs adjustment</button>
          </div>
          {!playbackComplete ? <p className="mt-2 text-[10px] font-bold leading-4 text-violet-950/70">Play the sample from beginning to end before recording a setup result. The meter alone cannot certify mouth noise, room sound, delay, or output routing.</p> : null}
        </div>
      ) : null}

      <p className="mt-3 text-[10px] font-bold leading-4 text-violet-950/70" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
