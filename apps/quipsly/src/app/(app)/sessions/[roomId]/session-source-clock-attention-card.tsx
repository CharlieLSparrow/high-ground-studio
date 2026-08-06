"use client";

import Link from "next/link";
import { ArrowUpRight, AudioLines, CheckCircle2, Clock3, Play, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SessionSourceClockAttention, SessionSourceClockAttentionItem } from "./session-source-clock-attention";

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const remainder = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function range(item: SessionSourceClockAttentionItem) {
  return `${clock(item.startSeconds)}–${clock(item.endSeconds)}`;
}

export function SessionSourceClockAttentionCard({
  attention,
  initialItemId = null,
}: {
  attention: SessionSourceClockAttention;
  initialItemId?: string | null;
}) {
  const initial = attention.items.find((item) => item.id === initialItemId) ?? attention.items[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [playRequest, setPlayRequest] = useState(0);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const selected = useMemo(() => attention.items.find((item) => item.id === selectedId) ?? attention.items[0] ?? null, [attention.items, selectedId]);

  useEffect(() => {
    if (!initialItemId || !attention.items.some((item) => item.id === initialItemId)) return;
    setSelectedId(initialItemId);
  }, [attention.items, initialItemId]);

  function seekSelected(shouldPlay: boolean) {
    const media = mediaRef.current;
    if (!media || !selected) return;
    try { media.currentTime = selected.startSeconds; } catch { return; }
    stopAtRef.current = selected.endSeconds;
    if (shouldPlay) void media.play().catch(() => undefined);
  }

  useEffect(() => {
    if (!selected) return;
    const media = mediaRef.current;
    if (!media) return;
    media.pause();
    stopAtRef.current = selected.endSeconds;
    if (media.readyState >= 1) seekSelected(playRequest > 0);
    else media.load();
    // playRequest makes a repeated press on the same evidence range actionable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequest, selected?.id]);

  function open(item: SessionSourceClockAttentionItem) {
    setSelectedId(item.id);
    setPlayRequest((value) => value + 1);
  }

  function stopAtRangeEnd(media: HTMLMediaElement) {
    if (stopAtRef.current !== null && media.currentTime >= stopAtRef.current - 0.01) {
      media.pause();
      stopAtRef.current = null;
    }
  }

  const style = {
    HIGH: "border-rose-200 bg-rose-50 text-rose-950",
    REVIEW: "border-violet-200 bg-violet-50 text-violet-950",
  } as const;

  return <section id="source-clock-attention" className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50/60 to-violet-50/60 p-5 shadow-sm sm:p-6" aria-labelledby="source-clock-attention-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-800"><AudioLines size={16} aria-hidden="true" />Shared source-clock review</p>
        <h2 id="source-clock-attention-heading" className="mt-1 font-serif text-3xl font-black text-[#3d3122]">Listen where the evidence points</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Transcript uncertainty, detector suggestions, repair candidates, decoded mastering observations, and edit proposals share a clock—not an authority or confidence scale. This queue ranks review only and creates no decision.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
        <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-900">{attention.counts.high} high</span>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-900">{attention.counts.review} review</span>
        <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-cyan-900">{attention.counts.total} exact ranges</span>
      </div>
    </div>

    {selected ? <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white" aria-label="Selected protected source range">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-cyan-200">{selected.authorityLabel}</p><h3 className="mt-1 text-xl font-black">{selected.title}</h3><p className="mt-1 font-mono text-xs font-black text-cyan-100">{range(selected)} · {selected.source.label}</p></div><span className="rounded-full border border-slate-600 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-300">{selected.reviewState}</span></div>
        {selected.source.sourceKind === "video"
          ? <video ref={(node) => { mediaRef.current = node; }} src={selected.source.sourceUrl} controls preload="metadata" className="mt-4 max-h-80 w-full rounded-xl bg-black" aria-label={`Protected source for ${selected.title}`} onLoadedMetadata={() => seekSelected(playRequest > 0)} onTimeUpdate={(event) => stopAtRangeEnd(event.currentTarget)} />
          : <audio ref={(node) => { mediaRef.current = node; }} src={selected.source.sourceUrl} controls preload="metadata" className="mt-4 w-full" aria-label={`Protected source for ${selected.title}`} onLoadedMetadata={() => seekSelected(playRequest > 0)} onTimeUpdate={(event) => stopAtRangeEnd(event.currentTarget)} />}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setPlayRequest((value) => value + 1); }} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-200 px-4 text-xs font-black text-slate-950"><Play size={14} aria-hidden="true" />Play exact range</button>{selected.audioStudioHref ? <Link href={selected.audioStudioHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-600 px-4 text-xs font-black text-white">Open Audio Studio<ArrowUpRight size={14} aria-hidden="true" /></Link> : null}{selected.editorHref ? <Link href={selected.editorHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-fuchsia-500 px-4 text-xs font-black text-fuchsia-100">Open Studio editor<ArrowUpRight size={14} aria-hidden="true" /></Link> : null}{selected.transcriptHref ? <Link href={selected.transcriptHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-500 px-4 text-xs font-black text-violet-100">Open transcript segment<ArrowUpRight size={14} aria-hidden="true" /></Link> : null}</div>
        <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-slate-500">Client-tracked playback is navigation, not proof that a person heard or understood the range.</p>
      </section>
      <aside className="rounded-2xl border border-cyan-200 bg-white p-4" aria-label="Selected evidence boundary"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-cyan-900"><ShieldCheck size={15} aria-hidden="true" />Authority boundary</p><p className="mt-2 text-sm font-black leading-6 text-[#3d3122]">{selected.detail}</p>{selected.confidenceLabel ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-black text-amber-950">{selected.confidenceLabel}</p> : null}<p className="mt-3 text-xs font-semibold leading-5 text-[#765f40]">{selected.boundary}</p><p className="mt-3 text-xs font-black leading-5 text-cyan-950">Why it ranked here: {selected.rankReason}</p></aside>
    </div> : null}

    {attention.items.length ? <ol className="mt-5 grid gap-3 xl:grid-cols-2" aria-label="Exact source-clock attention queue">{attention.items.map((item, index) => <li id={`source-clock-attention-item-${encodeURIComponent(item.id)}`} key={item.id} className={`rounded-2xl border p-4 ${style[item.severity]} ${selected?.id === item.id ? "ring-2 ring-cyan-500 ring-offset-2" : ""}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wide">#{index + 1} · {item.severity} · {item.authorityLabel}</p><h3 className="mt-1 text-base font-black">{item.title}</h3><p className="mt-1 flex items-center gap-1 font-mono text-[10px] font-black"><Clock3 size={12} aria-hidden="true" />{range(item)} · {item.source.label}</p></div><span className="max-w-32 rounded-full border border-current px-2 py-1 text-center text-[8px] font-black uppercase tracking-wide opacity-80">{item.reviewState}</span></div>
      <button type="button" onClick={() => open(item)} aria-current={selected?.id === item.id ? "true" : undefined} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-current bg-white/75 px-4 text-xs font-black"><Play size={14} aria-hidden="true" />Listen at {clock(item.startSeconds)}</button>
    </li>)}</ol> : <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><p className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={18} aria-hidden="true" />No unresolved exact-clock item is projected.</p><p className="mt-2 text-xs font-semibold leading-5">This means the current canonical evidence produced no queue item. It does not certify that the complete source was proof-listened or that every detector class has measured recall.</p></div>}
  </section>;
}
