"use client";

import { Mic2, RotateCcw, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  studioSoundCheckGuidance,
  studioSoundCheckPrompt,
  type StudioAudioMeterEvidence,
} from "@/lib/studio-audio-meter";

const SOUND_CHECK_SECONDS = 10;

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
  disabled = false,
}: {
  getInputStream: () => MediaStream | null;
  prepareInputStream?: () => Promise<MediaStream | null | undefined>;
  microphoneLabel: string;
  outputId: string;
  evidence: StudioAudioMeterEvidence | null;
  setupKey?: string;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(SOUND_CHECK_SECONDS);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleDurationSeconds, setSampleDurationSeconds] = useState<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const sampleGenerationRef = useRef(0);
  const openingRef = useRef(false);
  const previousSetupKeyRef = useRef(setupKey || microphoneLabel);
  const guidance = studioSoundCheckGuidance(evidence);
  const spokenPrompt = studioSoundCheckPrompt(remainingSeconds);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  const clearSample = useCallback((nextMessage = "") => {
    sampleGenerationRef.current += 1;
    openingRef.current = false;
    clearTimers();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder?.state === "recording") recorder.stop();
    audioRef.current?.pause();
    revoke(sampleUrlRef.current);
    sampleUrlRef.current = null;
    setSampleUrl(null);
    setSampleDurationSeconds(null);
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
    if (disabled || openingRef.current || phase === "recording") return;
    if (typeof MediaRecorder === "undefined") {
      setPhase("error");
      setMessage("This browser cannot create a private sound-check sample. The live meter still works; try current Safari or Chrome for playback verification.");
      return;
    }
    clearSample();
    const generation = sampleGenerationRef.current;
    openingRef.current = true;
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
    if (!mountedRef.current || generation !== sampleGenerationRef.current) return;
    openingRef.current = false;
    if (!stream || audioTracks.length === 0) {
      setPhase("error");
      setMessage("Quipsly could not open the selected microphone. Check browser access and try again.");
      return;
    }

    chunksRef.current = [];
    const mimeType = supportedAudioMimeType();
    try {
      const recorder = new MediaRecorder(
        new MediaStream(audioTracks),
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (generation === sampleGenerationRef.current && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current || generation !== sampleGenerationRef.current) return;
        clearSample();
        setPhase("error");
        setMessage("The microphone test stopped unexpectedly. Try again.");
      };
      recorder.onstop = () => {
        if (!mountedRef.current || generation !== sampleGenerationRef.current) return;
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
        setMessage("Play it back to hear how you sound.");
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
    clearSample("Devices changed. Test again whenever you like.");
  }, [clearSample, microphoneLabel, phase, setupKey, stopRecording]);

  useEffect(() => {
    // React development Strict Mode mounts, cleans up, then mounts this effect
    // again. Re-arm the guard so the second mount can still finish a sample.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sampleGenerationRef.current += 1;
      openingRef.current = false;
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
        : "border-border bg-card text-foreground";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground" aria-label="Microphone test">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Hear yourself before joining</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Record up to 10 seconds and listen back. Only you can hear it; nothing is uploaded.</p>
        </div>
        {phase === "recording" ? <span className="text-sm font-semibold">{remainingSeconds}s</span> : null}
      </div>

      {evidence && phase === "recording" ? <div className={`mt-3 rounded-xl border p-3 ${guidanceTone}`}>
        <p className="text-xs font-semibold">{guidance.heading}</p>
        <p className="mt-1 text-[10px] font-bold leading-4 opacity-80">{guidance.detail}</p>
      </div> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "recording" ? (
          <button type="button" onClick={stopRecording} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-800 px-4 text-xs font-semibold text-white"><Square size={14} fill="currentColor" aria-hidden="true" />Stop test</button>
        ) : (
          <button type="button" onClick={() => void startRecording()} disabled={disabled} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"><Mic2 size={15} aria-hidden="true" />Test microphone</button>
        )}
        {sampleUrl ? <button type="button" onClick={() => clearSample()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground"><RotateCcw size={14} aria-hidden="true" />Clear test</button> : null}
      </div>

      {phase === "recording" ? (
        <div className="mt-3 rounded-xl border border-border bg-card p-3" aria-live="polite">
          <p className="text-sm font-semibold text-foreground">{spokenPrompt.heading}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">{spokenPrompt.detail}</p>
        </div>
      ) : null}

      {sampleUrl ? (
        <div className="mt-3 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-foreground"><span className="flex items-center gap-2"><Volume2 size={14} aria-hidden="true" />Your microphone test</span><span>{sampleDurationSeconds?.toFixed(1)} seconds</span></div>
          <audio
            ref={audioRef}
            src={sampleUrl}
            controls
            preload="metadata"
            className="mt-2 w-full"
            aria-label="Microphone test playback"
            onEnded={() => {
              setMessage("Test complete. You can join whenever you’re ready.");
            }}
          />
          <details className="mt-3 rounded-lg border border-border bg-muted p-3">
            <summary className="cursor-pointer text-[10px] font-semibold text-foreground">Troubleshoot sound</summary>
            <ul className="mt-2 space-y-2 text-xs font-semibold leading-5 text-muted-foreground">
              <li><span className="font-semibold text-foreground">Clicks or popping B/P sounds:</span> move the microphone slightly farther away and 20–45° off axis; keep the pop filter between you and the mic.</li>
              <li><span className="font-semibold text-foreground">Hiss, hum, or room echo:</span> move closer before raising gain, quiet nearby fans or appliances, and keep headphones on.</li>
              <li><span className="font-semibold text-foreground">Delay, doubling, or the wrong voice:</span> confirm the chosen input and headphone output. Do not try to fix a routing problem with processing.</li>
            </ul>
          </details>
        </div>
      ) : null}

      <p className="mt-3 text-[10px] font-bold leading-4 text-muted-foreground" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
