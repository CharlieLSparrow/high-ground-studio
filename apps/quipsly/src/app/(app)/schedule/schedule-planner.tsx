"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus2, Check, CircleSlash2, Clock3, RotateCcw, SkipForward, Target } from "lucide-react";

import { createWorkPlanBlock, rescheduleWorkPlanBlock, updateWorkPlanBlockStatus } from "./actions";
import {
  groupPlanBlocksByLocalDay,
  formatScheduleMediaTime,
  humanizeScheduleValue,
  planBlockDurationMinutes,
  planBlockLocalInputValue,
  type SchedulePlanBlock,
  type SchedulePlanBlockStatus,
  type SchedulePlanTarget,
  type ScheduleTag,
} from "./schedule-model";

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function nextPlanningStart() {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30);
  if (date.getTime() <= Date.now()) date.setMinutes(date.getMinutes() + 30);
  return localInputValue(date);
}

function formatPlanTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatPlanDay(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function ScheduleTagChips({ tags }: { tags: ScheduleTag[] }) {
  if (!tags.length) return null;
  const labels = tags.map((tag) => `${tag.label}${tag.isActive ? "" : " (archived)"}`);
  return <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Tags: ${labels.join(", ")}`}>
    {tags.map((tag) => <span key={tag.id} className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-black ${tag.isActive ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950" : "border-stone-300 bg-stone-100 text-stone-700"}`}>#{tag.label}{tag.isActive ? "" : " · archived"}</span>)}
  </div>;
}

function PlanBlockCard({ block, onRefresh }: { block: SchedulePlanBlock; onRefresh: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const duration = planBlockDurationMinutes(block);

  function decide(nextStatus: SchedulePlanBlockStatus) {
    if (nextStatus === "CANCELED" && !window.confirm("Cancel this personal focus block? The planning receipt stays in Quipsly and no external calendar event will be touched.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateWorkPlanBlockStatus({ planBlockId: block.id, nextStatus, expectedUpdatedAt: block.updatedAt });
      if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onRefresh(); return; }
      setMessage(nextStatus === "COMPLETED" ? "Focus block completed. The task and goal status stayed unchanged." : `${humanizeScheduleValue(nextStatus)} saved inside Quipsly.`);
      onRefresh();
    });
  }

  function move(formData: FormData) {
    const startsAt = String(formData.get("startsAt") || "");
    setMessage(null);
    startTransition(async () => {
      const result = await rescheduleWorkPlanBlock({
        planBlockId: block.id,
        startsAt,
        durationMinutes: Number(formData.get("durationMinutes")),
        timezone: block.timezone,
        expectedUpdatedAt: block.updatedAt,
      });
      if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onRefresh(); return; }
      setMessage("Focus block moved inside Quipsly. No external calendar event was changed.");
      onRefresh();
    });
  }

  const statusTone = block.status === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : block.status === "PLANNED" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-stone-200 bg-stone-100 text-stone-700";
  return <article className="rounded-2xl border border-[#e4d3b3] bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone}`}>{humanizeScheduleValue(block.status)}</span><span className="text-[10px] font-black uppercase tracking-wide text-[#92754f]">{block.targetType}</span></div><h4 className="mt-2 text-lg font-black text-[#3d3122]">{block.title}</h4><p className="mt-1 text-xs font-bold text-[#806a4d]">{humanizeScheduleValue(block.targetStatus)} source · completing this block does not complete it</p></div>
      <div className="text-right text-sm font-black text-[#5f4b32]"><p>{formatPlanTime(block.startsAt, block.timezone)}–{formatPlanTime(block.endsAt, block.timezone)}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-[#92754f]">{duration ? `${duration} min` : "Duration needs review"}</p></div>
    </div>
    <ScheduleTagChips tags={block.tags} />
    <div className="mt-4 flex flex-wrap gap-2">
      {block.status !== "COMPLETED" && <button type="button" disabled={pending} onClick={() => decide("COMPLETED")} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={13} aria-hidden="true" />Block done</button>}
      {block.status === "PLANNED" && <button type="button" disabled={pending} onClick={() => decide("SKIPPED")} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-amber-800 disabled:opacity-50"><SkipForward size={13} aria-hidden="true" />Skip</button>}
      {block.status !== "PLANNED" && <button type="button" disabled={pending} onClick={() => decide("PLANNED")} className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-800 disabled:opacity-50"><RotateCcw size={13} aria-hidden="true" />Plan again</button>}
      {block.status !== "CANCELED" && <button type="button" disabled={pending} onClick={() => decide("CANCELED")} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-700 disabled:opacity-50"><CircleSlash2 size={13} aria-hidden="true" />Cancel block</button>}
    </div>
    {block.sourceAnchor && block.roomId ? <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Focus source · reviewed transcript</p><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-sky-950">{block.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${block.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{block.sourceAnchor.effectiveTextSnapshot}</p><Link href={`/sessions/${encodeURIComponent(block.roomId)}#transcript-segment-${encodeURIComponent(block.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline">Return to {formatScheduleMediaTime(block.sourceAnchor.startSeconds)}–{formatScheduleMediaTime(block.sourceAnchor.endSeconds)}</Link></div> : null}
    <form action={move} className="mt-4 grid gap-2 rounded-xl border border-[#eadfc9] bg-[#fffaf0] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <label className="text-[10px] font-black uppercase tracking-wide text-[#6f573b]">Move to · {block.timezone}<input name="startsAt" type="datetime-local" required defaultValue={planBlockLocalInputValue(block.startsAt, block.timezone)} className="mt-1 block w-full rounded-lg border border-[#d9c7a5] bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal" /></label>
      <label className="text-[10px] font-black uppercase tracking-wide text-[#6f573b]">Length<select name="durationMinutes" defaultValue={String(duration ?? 50)} className="mt-1 block rounded-lg border border-[#d9c7a5] bg-white px-3 py-2 text-xs font-bold"><option value="25">25 min</option><option value="50">50 min</option><option value="90">90 min</option><option value="120">2 hours</option></select></label>
      <button type="submit" disabled={pending} className="rounded-lg border border-[#d9c7a5] bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50">Move</button>
    </form>
    {message && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</p>}
  </article>;
}

export function SchedulePlanner({ initialBlocks, targets }: { initialBlocks: SchedulePlanBlock[]; targets: SchedulePlanTarget[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(nextPlanningStart);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);
  const dayGroups = useMemo(() => groupPlanBlocksByLocalDay(initialBlocks, timezone ?? "UTC"), [initialBlocks, timezone]);

  function create(formData: FormData) {
    const [targetType, targetId] = String(formData.get("target") || "").split(":", 2);
    const submittedStartsAt = String(formData.get("startsAt") || "");
    setMessage(null);
    startTransition(async () => {
      const result = await createWorkPlanBlock({
        targetType: targetType as "task" | "goal",
        targetId,
        startsAt: submittedStartsAt,
        durationMinutes: Number(formData.get("durationMinutes")),
        timezone: timezone ?? "",
      });
      if (!result.ok) { setMessage(result.error); return; }
      setMessage("Personal focus block saved. No external calendar event, task deadline, or goal target changed.");
      formRef.current?.reset();
      setStartsAt(nextPlanningStart());
      router.refresh();
    });
  }

  return <section aria-labelledby="personal-plan-heading" className="rounded-[2rem] border border-sky-200 bg-[linear-gradient(135deg,#f7fcff,#fffaf0)] p-5 shadow-sm md:p-7">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-sky-100 p-2 text-sky-800"><CalendarPlus2 aria-hidden="true" /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">Personal plan</p><h2 id="personal-plan-heading" className="font-serif text-3xl font-black text-[#3d3122]">Put the work on your day</h2><p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">A focus block is your private intention to work on one committed task or active goal. It is not a deadline, appointment, provider event, or promise to another person.</p></div></div><Link href="/work" className="inline-flex items-center gap-2 self-start rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-900"><Target size={14} aria-hidden="true" />Open goals & tasks</Link></div>
    {targets.length > 0 ? <form ref={formRef} action={create} className="mt-6 grid gap-3 rounded-2xl border border-white bg-white/80 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto] lg:items-end">
      <label className="text-xs font-black uppercase tracking-wide text-[#6f573b]">Work to focus on<select name="target" required className="mt-1 block w-full rounded-xl border border-[#cbdde7] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal"><option value="">Choose committed work</option>{targets.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.type === "goal" ? "Goal" : "Task"}: {target.title} · {target.context}</option>)}</select></label>
      <label className="text-xs font-black uppercase tracking-wide text-[#6f573b]">Start<input name="startsAt" type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 block w-full rounded-xl border border-[#cbdde7] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-[#6f573b]">Length<select name="durationMinutes" defaultValue="50" className="mt-1 block rounded-xl border border-[#cbdde7] bg-white px-3 py-2.5 text-sm font-bold"><option value="25">25 min</option><option value="50">50 min</option><option value="90">90 min</option><option value="120">2 hours</option></select></label>
      <button type="submit" disabled={pending || !timezone} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-800 px-5 py-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Clock3 size={15} aria-hidden="true" />{pending ? "Saving…" : "Plan focus"}</button>
    </form> : <div className="mt-6 rounded-2xl border border-dashed border-sky-200 bg-white/70 p-5 text-sm font-semibold text-[#765f40]">There are no accessible open tasks or active owned goals to plan. Capture committed work in <Link href="/work" className="font-black text-sky-800 underline">Work Queue</Link> first.</div>}
    <p className="mt-3 text-[11px] font-semibold text-[#927b5b]">Planning timezone: {timezone ?? "detecting…"}. Quipsly stores this block internally and does not call Google Calendar or send invitations.</p>
    {message && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</p>}
    <div className="mt-7 space-y-6">{dayGroups.map((group) => <section key={group.date} aria-label={`${formatPlanDay(group.date)} focus blocks`}><h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-[#765f40]">{formatPlanDay(group.date)}</h3><div className="grid gap-3 lg:grid-cols-2">{group.blocks.map((block) => <PlanBlockCard key={block.id} block={block} onRefresh={() => router.refresh()} />)}</div></section>)}{initialBlocks.length === 0 && <p className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/70 p-5 text-sm font-semibold text-[#7a6548]">No personal focus blocks are saved yet. Start with one realistic block, then use its completion receipt during weekly review.</p>}</div>
  </section>;
}
