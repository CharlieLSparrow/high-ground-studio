"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, AudioLines, CheckCircle2, Clock3, Play, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SessionSourceClockAttention, SessionSourceClockReviewMoment } from "./session-source-clock-attention";
import { SessionAudibleEventDecision } from "./session-audible-event-decision";

function clock(seconds: number) {
  const tenths = Math.max(0, Math.floor(seconds * 10 + 0.000001));
  const whole = Math.floor(tenths / 10);
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const remainder = whole % 60;
  const base = hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
  return tenths % 10 ? `${base}.${tenths % 10}` : base;
}

function range(item: { startSeconds: number; endSeconds: number }) {
  return `${clock(item.startSeconds)}–${clock(item.endSeconds)}`;
}

function reviewBudget(seconds: number) {
  return seconds < 60 ? `~${seconds}s` : `~${Math.max(1, Math.ceil(seconds / 60))} min`;
}

export function SessionSourceClockAttentionCard({
  attention,
  initialItemId = null,
}: {
  attention: SessionSourceClockAttention;
  initialItemId?: string | null;
}) {
  const router = useRouter();
  const initial = attention.moments.find((moment) => moment.items.some((item) => item.id === initialItemId)) ?? attention.moments[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [playRequest, setPlayRequest] = useState(0);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const [listenedSecondBins, setListenedSecondBins] = useState<Set<number>>(() => new Set());
  const selected = useMemo(() => attention.moments.find((moment) => moment.id === selectedId) ?? attention.moments[0] ?? null, [attention.moments, selectedId]);

  useEffect(() => {
    if (!initialItemId) return;
    const moment = attention.moments.find((candidate) => candidate.items.some((item) => item.id === initialItemId));
    if (moment) setSelectedId(moment.id);
  }, [attention.moments, initialItemId]);

  function seekSelected(shouldPlay: boolean) {
    const media = mediaRef.current;
    if (!media || !selected) return;
    try { media.currentTime = selected.startSeconds; } catch { return; }
    previousTimeRef.current = null;
    stopAtRef.current = selected.endSeconds;
    if (shouldPlay) void media.play().catch(() => undefined);
  }

  useEffect(() => {
    if (!selected) return;
    const media = mediaRef.current;
    if (!media) return;
    media.pause();
    previousTimeRef.current = null;
    setListenedSecondBins(new Set());
    stopAtRef.current = selected.endSeconds;
    if (media.readyState >= 1) seekSelected(playRequest > 0);
    else media.load();
    // playRequest makes a repeated press on the same evidence range actionable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequest, selected?.id]);

  function open(moment: SessionSourceClockReviewMoment) {
    setSelectedId(moment.id);
    setPlayRequest((value) => value + 1);
  }

  function stopAtRangeEnd(media: HTMLMediaElement) {
    if (stopAtRef.current !== null && media.currentTime >= stopAtRef.current - 0.01) {
      media.pause();
      stopAtRef.current = null;
      previousTimeRef.current = null;
    }
  }

  function observePlayback(media: HTMLMediaElement, ended = false) {
    if (!selected) return;
    const current = ended ? Math.min(selected.endSeconds, selected.source.durationSeconds) - 0.001 : media.currentTime;
    if (!ended && (media.paused || media.seeking)) return;
    const previous = previousTimeRef.current;
    const contiguous = previous !== null && current >= previous && current - previous <= 1.5;
    const first = contiguous ? Math.floor(previous) : Math.floor(current);
    const last = Math.floor(current);
    previousTimeRef.current = current;
    setListenedSecondBins((existing) => {
      const next = new Set(existing);
      for (let bin = first; bin <= last; bin += 1) {
        if (bin >= Math.floor(selected.startSeconds) && bin <= Math.max(Math.floor(selected.startSeconds), Math.ceil(selected.endSeconds) - 1)) next.add(bin);
      }
      return next.size === existing.size ? existing : next;
    });
    stopAtRangeEnd(media);
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
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Transcript uncertainty, detector suggestions, repair candidates, decoded mastering observations, and edit proposals share a clock—not an authority or confidence scale. Nearby signals become one bounded listening moment while every reason and deep link remains separate.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
        <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-900">{attention.counts.high} high signal{attention.counts.high === 1 ? "" : "s"}</span>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-900">{attention.counts.review} review signal{attention.counts.review === 1 ? "" : "s"}</span>
        <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-cyan-900">{attention.counts.moments} listening moment{attention.counts.moments === 1 ? "" : "s"}</span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-900">{reviewBudget(attention.counts.estimatedReviewSeconds)} source review</span>
      </div>
    </div>

    {attention.counts.sharedContextSavingsSeconds > 0 ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-950">Shared context avoids about {attention.counts.sharedContextSavingsSeconds} seconds of duplicate source playback across {attention.counts.total} preserved evidence signals. This deterministic budget includes one source-context pass and decision time; matched A/B, full-mix, and proof-listen requirements remain additional.</p> : null}

    {selected ? <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white" aria-label="Selected protected source range">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-cyan-200">Shared listening moment · {selected.items.length} signal{selected.items.length === 1 ? "" : "s"}</p><h3 className="mt-1 text-xl font-black">{selected.title}</h3><p className="mt-1 font-mono text-xs font-black text-cyan-100">{range(selected)} · {selected.source.label}</p></div><span className="rounded-full border border-slate-600 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-300">{reviewBudget(selected.estimatedReviewSeconds)} budget</span></div>
        {selected.source.sourceKind === "video"
          ? <video ref={(node) => { mediaRef.current = node; }} src={selected.source.sourceUrl} controls preload="metadata" className="mt-4 max-h-80 w-full rounded-xl bg-black" aria-label={`Protected source for ${selected.title}`} onLoadedMetadata={() => seekSelected(playRequest > 0)} onPlay={(event) => { previousTimeRef.current = event.currentTarget.currentTime; }} onPause={() => { previousTimeRef.current = null; }} onSeeking={() => { previousTimeRef.current = null; }} onTimeUpdate={(event) => observePlayback(event.currentTarget)} onEnded={(event) => observePlayback(event.currentTarget, true)} />
          : <audio ref={(node) => { mediaRef.current = node; }} src={selected.source.sourceUrl} controls preload="metadata" className="mt-4 w-full" aria-label={`Protected source for ${selected.title}`} onLoadedMetadata={() => seekSelected(playRequest > 0)} onPlay={(event) => { previousTimeRef.current = event.currentTarget.currentTime; }} onPause={() => { previousTimeRef.current = null; }} onSeeking={() => { previousTimeRef.current = null; }} onTimeUpdate={(event) => observePlayback(event.currentTarget)} onEnded={(event) => observePlayback(event.currentTarget, true)} />}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setPlayRequest((value) => value + 1); }} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-200 px-4 text-xs font-black text-slate-950"><Play size={14} aria-hidden="true" />Play shared context</button></div>
        {selected.contextTruncated ? <p className="mt-3 rounded-lg border border-amber-700/60 bg-amber-950/50 p-3 text-xs font-bold leading-5 text-amber-100">One exact evidence range extends beyond this bounded preview. Its full range remains visible below; use the authority-specific deep link to complete that review.</p> : null}
        <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-slate-500">Client-tracked playback is navigation, not proof that a person heard or understood the range.</p>
      </section>
      <aside className="rounded-2xl border border-cyan-200 bg-white p-4" aria-label="Preserved evidence boundaries">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-cyan-900"><ShieldCheck size={15} aria-hidden="true" />Evidence remains separate</p>
        <div className="mt-3 space-y-3">{selected.items.map((item) => <article key={item.id} className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-cyan-800">{item.authorityLabel} · {range(item)}</p>
          <h4 className="mt-1 text-sm font-black text-[#3d3122]">{item.title}</h4>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">{item.detail}</p>
          {item.confidenceLabel ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-black text-amber-950">{item.confidenceLabel}</p> : null}
          <p className="mt-2 text-[10px] font-semibold leading-4 text-[#765f40]">{item.boundary}</p>
          <p className="mt-2 text-[10px] font-black leading-4 text-cyan-950">Why it ranked here: {item.rankReason}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.audioStudioHref ? <Link href={item.audioStudioHref} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-cyan-300 bg-white px-3 text-[10px] font-black text-cyan-950">Open Audio Studio<ArrowUpRight size={12} aria-hidden="true" /></Link> : null}
            {item.editorHref ? <Link href={item.editorHref} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-fuchsia-300 bg-white px-3 text-[10px] font-black text-fuchsia-950">Open Studio editor<ArrowUpRight size={12} aria-hidden="true" /></Link> : null}
            {item.transcriptHref ? <Link href={item.transcriptHref} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-violet-300 bg-white px-3 text-[10px] font-black text-violet-950">Open transcript segment<ArrowUpRight size={12} aria-hidden="true" /></Link> : null}
          </div>
          {item.decisionTarget?.kind === "AUDIBLE_EVENT_REVIEW" ? <SessionAudibleEventDecision item={item} listenedSecondBins={listenedSecondBins} onSaved={() => router.refresh()} /> : null}
        </article>)}</div>
      </aside>
    </div> : null}

    {attention.moments.length ? <ol className="mt-5 grid gap-3 xl:grid-cols-2" aria-label="Shared source-clock listening moments">{attention.moments.map((moment, index) => <li id={`source-clock-review-moment-${encodeURIComponent(moment.id)}`} key={moment.id} className={`rounded-2xl border p-4 ${style[moment.severity]} ${selected?.id === moment.id ? "ring-2 ring-cyan-500 ring-offset-2" : ""}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wide">#{index + 1} · {moment.severity} · {moment.items.length} signal{moment.items.length === 1 ? "" : "s"}</p><h3 className="mt-1 text-base font-black">{moment.title}</h3><p className="mt-1 flex items-center gap-1 font-mono text-[10px] font-black"><Clock3 size={12} aria-hidden="true" />{range(moment)} · {moment.source.label}</p><p className="mt-1 text-[9px] font-bold opacity-80">{moment.authorityLabels.join(" · ")}</p></div><span className="max-w-32 rounded-full border border-current px-2 py-1 text-center text-[8px] font-black uppercase tracking-wide opacity-80">{reviewBudget(moment.estimatedReviewSeconds)} review</span></div>
      <button type="button" onClick={() => open(moment)} aria-current={selected?.id === moment.id ? "true" : undefined} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-current bg-white/75 px-4 text-xs font-black"><Play size={14} aria-hidden="true" />Review from {clock(moment.startSeconds)}</button>
    </li>)}</ol> : <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><p className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={18} aria-hidden="true" />No unresolved exact-clock item is projected.</p><p className="mt-2 text-xs font-semibold leading-5">This means the current canonical evidence produced no queue item. It does not certify that the complete source was proof-listened or that every detector class has measured recall.</p></div>}
  </section>;
}
