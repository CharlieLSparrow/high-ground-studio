"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

function time(seconds: number) {
  const value = Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
  const hours = Math.floor(value / 3600);
  return `${hours ? `${hours}:` : ""}${hours ? String(Math.floor(value / 60) % 60).padStart(2, "0") : Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

const initial = { position: 0, duration: 0, playing: false, waiting: false, muted: false, rate: 1 };
const buttonBase = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-quipsly-divider focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40";
const button = `${buttonBase} bg-quipsly-surface text-quipsly-ink hover:bg-quipsly-surface-muted`;

/** Controls observe the real media element, including seeks made by the
 * transcript editor. No second playback clock or replacement source is used.
 */
export function RecordingAudioControls({ media, src, preparing, label, className }: {
  media: HTMLAudioElement | null;
  src?: string;
  preparing: boolean;
  label: string;
  className?: string;
}) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);
  const restorePosition = useRef<number | null>(null);

  useEffect(() => {
    attempt.current += 1;
    restorePosition.current = null;
    setState(initial);
    setError(null);
    if (!media || !src) return;
    const read = () => setState(previous => ({
      position: Number.isFinite(media.currentTime) ? media.currentTime : 0,
      duration: Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0,
      playing: !media.paused && !media.ended,
      waiting: !media.paused && media.readyState < 3 && previous.waiting,
      muted: media.muted,
      rate: media.playbackRate,
    }));
    const ready = () => {
      if (restorePosition.current !== null && Number.isFinite(media.duration) && media.duration > 0) {
        media.currentTime = Math.min(restorePosition.current, Math.max(0, media.duration - 0.1));
        restorePosition.current = null;
      }
      setError(null);
      read();
    };
    const waiting = () => setState(previous => ({ ...previous, waiting: !media.paused }));
    const failed = () => {
      setError(media.error?.code === 2
        ? "The recording couldn’t finish loading. Check your connection and try again."
        : "This recording couldn’t play. Try loading it again, or download it to listen.");
      setState(previous => ({ ...previous, playing: false, waiting: false }));
    };
    const events = ["timeupdate", "durationchange", "play", "playing", "pause", "ended", "seeking", "seeked", "ratechange", "volumechange"];
    events.forEach(event => media.addEventListener(event, read));
    media.addEventListener("loadedmetadata", ready);
    media.addEventListener("canplay", ready);
    media.addEventListener("waiting", waiting);
    media.addEventListener("error", failed);
    read();
    if (media.error) failed();
    return () => {
      attempt.current += 1;
      events.forEach(event => media.removeEventListener(event, read));
      media.removeEventListener("loadedmetadata", ready);
      media.removeEventListener("canplay", ready);
      media.removeEventListener("waiting", waiting);
      media.removeEventListener("error", failed);
    };
  }, [media, src]);

  async function toggle() {
    if (!media || !src || preparing) return;
    const request = ++attempt.current;
    if (!media.paused) { media.pause(); return; }
    setError(null);
    try {
      await media.play();
      // Playback events, not the click, establish the playing state.
    } catch (cause) {
      if (request !== attempt.current || cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error && cause.name === "NotAllowedError"
        ? "Your browser hasn’t allowed playback. Press Play to try again."
        : "Playback couldn’t start. Try loading the recording again.");
    }
  }

  function seek(seconds: number) {
    if (!media || !state.duration) return;
    media.currentTime = Math.max(0, Math.min(seconds, state.duration));
    setState(previous => ({ ...previous, position: media.currentTime }));
  }

  return <div role="group" aria-label={`${label} playback controls`} className={`rounded-2xl border border-quipsly-divider bg-quipsly-surface p-3 text-quipsly-ink ${className ?? ""}`}>
    <div className="flex items-center gap-3">
      <button type="button" className={`${buttonBase} shrink-0 bg-primary text-primary-foreground`} disabled={!src || preparing}
        aria-label={state.playing ? "Pause recording" : "Play recording"} onClick={() => void toggle()}>
        {state.playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1">
        <input type="range" min={0} max={state.duration || 1} step={0.1} value={Math.min(state.position, state.duration || 0)}
          disabled={!state.duration || preparing} aria-label="Recording position" aria-valuetext={`${time(state.position)} of ${time(state.duration)}`}
          onChange={event => seek(Number(event.target.value))}
          className="block min-h-8 w-full accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground" aria-hidden="true"><span>{time(state.position)}</span><span>{state.duration ? time(state.duration) : "–:––"}</span></div>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1">
        <button type="button" className={button} disabled={!state.duration || preparing} aria-label="Back 10 seconds" onClick={() => seek(state.position - 10)}><RotateCcw size={16} aria-hidden="true" /><span className="ml-1 text-xs">10</span></button>
        <button type="button" className={button} disabled={!state.duration || preparing} aria-label="Forward 10 seconds" onClick={() => seek(state.position + 10)}><RotateCw size={16} aria-hidden="true" /><span className="ml-1 text-xs">10</span></button>
        <button type="button" className={button} disabled={!src || preparing} aria-label={state.muted ? "Unmute playback" : "Mute playback"} onClick={() => {
          if (media) { media.muted = !media.muted; setState(previous => ({ ...previous, muted: media.muted })); }
        }}>
          {state.muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        </button>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">Speed
        <select aria-label="Playback speed" value={state.rate} disabled={!src || preparing}
          onChange={event => {
            if (media) { media.playbackRate = Number(event.target.value); setState(previous => ({ ...previous, rate: media.playbackRate })); }
          }}
          className="min-h-11 rounded-xl border border-quipsly-divider bg-quipsly-surface px-2 text-sm font-semibold text-quipsly-ink">
          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
      </label>
    </div>
    {state.waiting && !error && !preparing ? <p role="status" className="mt-2 text-sm text-muted-foreground">Loading audio…</p> : null}
    {error && !preparing ? <div role="status" className="mt-2 text-sm">
      <p>{error}</p>
      <button type="button" className="mt-2 min-h-11 rounded-full border border-quipsly-divider px-4 font-semibold" onClick={() => {
        if (!media) return;
        attempt.current += 1;
        restorePosition.current = state.position;
        setError(null);
        setState(previous => ({ ...previous, playing: false, waiting: false }));
        media.load();
      }}>Retry playback</button>
    </div> : null}
  </div>;
}
