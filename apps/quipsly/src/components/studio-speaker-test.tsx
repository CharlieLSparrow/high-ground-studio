"use client";

import { LoaderCircle, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type RoutedAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

type BrowserAudioContext = AudioContext & {
  createMediaStreamDestination: () => MediaStreamAudioDestinationNode;
};

type BrowserAudioContextConstructor = new () => BrowserAudioContext;

type ActiveSpeakerTest = {
  audio: RoutedAudioElement;
  context: BrowserAudioContext;
  oscillator: OscillatorNode;
  timeout: number;
};

function audioContextConstructor() {
  const browserWindow = window as typeof window & {
    webkitAudioContext?: BrowserAudioContextConstructor;
  };
  return (window.AudioContext || browserWindow.webkitAudioContext) as
    | BrowserAudioContextConstructor
    | undefined;
}

/**
 * A deliberately small, familiar output check. It never opens a microphone,
 * records bytes, calls the network, or changes the selected system device.
 */
export function StudioSpeakerTest({
  outputId,
  outputLabel,
  disabled = false,
}: {
  outputId: string;
  outputLabel: string;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "error">("idle");
  const [message, setMessage] = useState(
    "Play a short tone through the selected output.",
  );
  const activeRef = useRef<ActiveSpeakerTest | null>(null);
  const mountedRef = useRef(true);

  const stop = useCallback(async () => {
    const active = activeRef.current;
    activeRef.current = null;
    if (!active) return;
    window.clearTimeout(active.timeout);
    try {
      active.oscillator.stop();
    } catch {
      // The scheduled oscillator may already have ended.
    }
    active.audio.pause();
    active.audio.srcObject = null;
    await active.context.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stop();
    };
  }, [stop]);

  const play = useCallback(async () => {
    if (disabled || phase === "playing") return;
    setPhase("playing");
    setMessage(`Preparing ${outputLabel || "the system output"}…`);
    await stop();

    const AudioContextClass = audioContextConstructor();
    if (!AudioContextClass) {
      setPhase("error");
      setMessage(
        "This browser cannot create a speaker test. Use the system sound controls to check the output.",
      );
      return;
    }

    let context: BrowserAudioContext | null = null;
    let audio: RoutedAudioElement | null = null;
    let oscillator: OscillatorNode | null = null;
    try {
      context = new AudioContextClass();
      const destination = context.createMediaStreamDestination();
      const gain = context.createGain();
      oscillator = context.createOscillator();
      audio = new Audio() as RoutedAudioElement;
      audio.srcObject = destination.stream;

      if (outputId && audio.setSinkId) await audio.setSinkId(outputId);
      await context.resume();
      await audio.play();

      if (!mountedRef.current) {
        audio.pause();
        audio.srcObject = null;
        await context.close().catch(() => undefined);
        return;
      }

      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(523.25, now);
      oscillator.frequency.setValueAtTime(659.25, now + 0.24);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.065, now + 0.035);
      gain.gain.setValueAtTime(0.065, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start(now + 0.015);
      oscillator.stop(now + 0.54);

      setMessage(`Playing through ${outputLabel || "the system output"}…`);
      const timeout = window.setTimeout(() => {
        const active = activeRef.current;
        activeRef.current = null;
        if (active) {
          active.audio.pause();
          active.audio.srcObject = null;
          void active.context.close().catch(() => undefined);
        }
        if (mountedRef.current) {
          setPhase("idle");
          setMessage(
            `Test sound played through ${outputLabel || "the system output"}.`,
          );
        }
      }, 700);
      activeRef.current = { audio, context, oscillator, timeout };
    } catch (error) {
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
      if (context) await context.close().catch(() => undefined);
      setPhase("error");
      setMessage(
        error instanceof Error
          ? `The speaker test could not play: ${error.message}`
          : "The speaker test could not play. Check the selected output and try again.",
      );
    }
  }, [disabled, outputId, outputLabel, phase, stop]);

  return (
    <div className="mt-2" aria-label="Speaker test">
      <button
        type="button"
        onClick={() => void play()}
        disabled={disabled || phase === "playing"}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-3 text-[10px] font-black normal-case tracking-normal text-sky-950 disabled:cursor-wait disabled:opacity-55"
      >
        {phase === "playing" ? (
          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Volume2 size={14} aria-hidden="true" />
        )}
        {phase === "playing" ? "Playing test sound…" : "Test speakers"}
      </button>
      <p
        className={`mt-1 text-[10px] font-bold normal-case tracking-normal ${phase === "error" ? "text-rose-800" : "text-[#8a7354]"}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </div>
  );
}
