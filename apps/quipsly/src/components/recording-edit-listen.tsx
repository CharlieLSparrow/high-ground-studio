"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, LoaderCircle, Pause, Play } from "lucide-react";
import { recordingListenPlan, type ListenSource, type ListenRange } from "@/lib/recording-listen-plan";
import { RecordingListenTransport, type ListenState } from "@/lib/recording-listen-transport";
import { SessionRecordingAudio } from "./session-recording-audio";

function time(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function RecordingEditListen({ sources, startSeconds, endSeconds, cuts, disabled = false }: {
  sources: Array<ListenSource & {contentType?: string | null}>;
  startSeconds: number; endSeconds: number; cuts: ListenRange[]; disabled?: boolean;
}) {
  const media = useRef(new Map<string, HTMLAudioElement>());
  const root = useRef<HTMLElement | null>(null);
  const player = useRef<RecordingListenTransport | null>(null);
  const [state, setState] = useState<ListenState>({status: "paused", seconds: 0, error: null});
  const [, refresh] = useState(0);
  // Parent readback may recreate arrays without changing the edit. Do not
  // interrupt listening on a receipt refresh; do stop on an actual edit.
  const signature = JSON.stringify({sources, startSeconds, endSeconds, cuts});
  const config = useMemo(() => ({sources, spans: recordingListenPlan(startSeconds, endSeconds, cuts)}), [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const duration = config.spans.at(-1)?.outputEnd ?? 0;
  const validSources = sources.length > 0 && new Set(sources.map(source => source.id)).size === sources.length
    && sources.every(source => Number.isFinite(source.offset) && Number.isFinite(source.duration) && source.duration > 0);
  const ready = validSources && sources.every(source => (media.current.get(source.id)?.readyState ?? 0) >= 1);
  useEffect(() => {
    player.current?.dispose(); player.current = null;
    setState({status: "paused", seconds: 0, error: null});
    return () => { player.current?.dispose(); player.current = null; };
  }, [config]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) player.current?.pause(); };
    const otherPlayback = (event: Event) => {
      if (![...media.current.values()].includes(event.target as HTMLAudioElement)) player.current?.pause();
    };
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("play", otherPlayback, true);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("play", otherPlayback, true);
    };
  }, []);
  useEffect(() => { if (disabled) player.current?.pause(); }, [disabled]);

  function play() {
    if (!ready || disabled) return;
    // Only stop players in this recording workspace, never live-call media.
    for (const element of root.current?.closest("#recording-share")?.querySelectorAll<HTMLMediaElement>("audio,video") ?? []) {
      if (!media.current.has(element.dataset.listenSource ?? "")) element.pause();
    }
    if (!player.current) player.current = new RecordingListenTransport(config.sources, config.spans, setState, {
      media: source => media.current.get(source.id)!, ownsMedia: false,
      now: () => performance.now(), frame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
    });
    void player.current.start(state.seconds);
  }
  const active = state.status === "playing" || state.status === "loading";
  return <section ref={root} aria-label="Listen to current edit" className="mt-4 rounded-2xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => active ? player.current?.pause() : play()}
        disabled={!active && (disabled || !ready || !duration)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {state.status === "loading" ? <LoaderCircle size={16} className="animate-spin" /> : active ? <Pause size={16} /> : <Play size={16} />}
        {active ? state.status === "loading" ? "Cancel listening" : "Pause edit" : "Listen to edit"}
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold"><Headphones size={16} />{time(state.seconds)} / {time(duration)}</p>
        <p className="text-xs text-muted-foreground">{sources.length} {sources.length === 1 ? "track" : "tracks"} · Current trims and cuts · No new file needed</p>
      </div>
    </div>
    <input type="range" min={0} max={duration} step="0.01" value={state.seconds} aria-label="Edited recording position"
      disabled={!ready || !duration || disabled} className="mt-3 w-full accent-primary"
      onChange={event => {
        const seconds = Number(event.target.value);
        if (player.current) player.current.seek(seconds);
        else setState(current => ({...current, seconds}));
      }} />
    <p className="text-xs text-muted-foreground">Quick audio preview. Cuts may briefly pause while seeking; create a preview for the finished mix and video.</p>
    {state.error ? <p role="alert" className="mt-2 text-sm text-destructive">{state.error}</p> : null}
    {!validSources ? <p role="status" className="mt-2 text-sm">Select tracks with available recording timing to listen.</p>
      : !duration ? <p role="status" className="mt-2 text-sm">Nothing to play. Restore a cut or extend the trim to include some audio.</p>
      : !ready ? <p role="status" className="mt-2 text-sm">Preparing tracks for listening…</p> : null}
    <div>{config.sources.map(source => <SessionRecordingAudio key={`${source.id}|${source.url}`}
      ref={node => { if (node) media.current.set(source.id, node); else media.current.delete(source.id); }}
      data-listen-source={source.id} aria-label={`${source.label} edit preview track`} controls={false} preload="metadata"
      src={source.url} contentType={source.contentType ?? undefined}
      onLoadedMetadata={() => refresh(value => value + 1)} onEmptied={() => refresh(value => value + 1)} />)}</div>
  </section>;
}
