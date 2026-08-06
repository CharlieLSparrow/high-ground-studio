"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clock3, DatabaseZap, ShieldAlert } from "lucide-react";

import type { SessionSourceEvidence } from "./session-source-evidence-model";
import type { SessionReadinessTopology } from "./session-readiness-topology";
import { buildSessionFinishingCockpit, type SessionFinishingEvidence } from "./session-finishing-cockpit";
import { buildSessionSourceJourneyProjection, type SessionSourceJourneyCheckpoint } from "./session-source-journey";

type Props = {
  roomId: string;
  topology: SessionReadinessTopology;
  sourceEvidence: SessionSourceEvidence;
  contentReadiness: { status: "none" | "capture-proof-only" | "substantial"; captureAssetCount: number; substantialRecordingCount: number } | null;
  studioHandoff: { recordings: Array<{ status: "READY_FOR_HANDOFF" | "NOT_READY" | "ATTACHED" | "RECEIPT_MISSING" | "PROJECT_CONFLICT" }> } | null;
  finishingEvidence: SessionFinishingEvidence;
};

function laneHref(roomId: string, lane: string) {
  return `/sessions/${encodeURIComponent(roomId)}?mode=${lane}`;
}

function checkpointTone(state: SessionSourceJourneyCheckpoint["state"]) {
  if (state === "COMPLETE") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (state === "HELD") return "border-rose-200 bg-rose-50 text-rose-950";
  if (state === "CURRENT") return "border-sky-200 bg-sky-50 text-sky-950";
  if (state === "MISSING") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function checkpointStateLabel(state: SessionSourceJourneyCheckpoint["state"]) {
  if (state === "NOT_APPLICABLE") return "Not part of this path";
  return state.toLowerCase().replaceAll("_", " ");
}

function timestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function SessionFinishingCockpitCard(props: Props) {
  const cockpit = buildSessionFinishingCockpit(props);
  const sourceJourney = buildSessionSourceJourneyProjection(props);
  const severityStyle = {
    BLOCKER: "border-rose-200 bg-rose-50 text-rose-950",
    HIGH: "border-amber-200 bg-amber-50 text-amber-950",
    REVIEW: "border-violet-200 bg-violet-50 text-violet-950",
  } as const;
  const stageStyle = {
    BLOCKED: "border-rose-200 bg-rose-50",
    READY: "border-emerald-200 bg-emerald-50",
    IN_PROGRESS: "border-sky-200 bg-sky-50",
    NOT_OBSERVED: "border-slate-200 bg-slate-50",
  } as const;

  return <section className="rounded-3xl border border-[#ddcdaF] bg-[#fffdf8] p-5 shadow-sm sm:p-6" aria-labelledby="session-finishing-cockpit-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">Episode & Session finishing cockpit</p>
        <h2 id="session-finishing-cockpit-heading" className="mt-1 font-serif text-3xl font-black text-[#3d3122]">What needs attention next</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">One ranked projection over canonical source, transcript, audio-analysis, Studio handoff, and delivery evidence. It creates no workflow state and never treats a missing receipt as completed work.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
        <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-900">{cockpit.counts.blockers} blockers</span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900">{cockpit.counts.high} high</span>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-900">{cockpit.counts.review} review</span>
      </div>
    </div>

    <ol className="mt-6 grid gap-3 lg:grid-cols-5" aria-label="Finishing stages">
      {cockpit.stages.map((stage, index) => <li key={stage.id} className={`relative rounded-2xl border p-4 ${stageStyle[stage.state]}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{index + 1}. {stage.label}</span>
          {stage.state === "READY" ? <CheckCircle2 size={16} className="text-emerald-700" aria-label="Ready" /> : stage.state === "BLOCKED" ? <ShieldAlert size={16} className="text-rose-700" aria-label="Blocked" /> : <CircleDashed size={16} className="text-slate-600" aria-label={stage.state === "IN_PROGRESS" ? "In progress" : "Not observed"} />}
        </div>
        <p className="mt-3 text-sm font-black leading-5 text-[#3d3122]">{stage.summary}</p>
        <p className="mt-2 text-[10px] font-bold leading-4 text-[#765f40]">{stage.evidence}</p>
        <Link href={stage.href ?? laneHref(props.roomId, stage.lane)} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-violet-800 hover:underline">{stage.actionLabel ?? `Inspect ${stage.label}`}<ArrowRight size={12} aria-hidden="true" /></Link>
      </li>)}
    </ol>

    <div className="mt-6 rounded-3xl border border-sky-200 bg-white p-4 sm:p-5" data-testid="session-source-journey">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-sky-800"><DatabaseZap size={15} aria-hidden="true" />Source journey</p>
          <h3 className="mt-1 font-serif text-2xl font-black text-[#3d3122]">What happened to each planned master</h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">A read-only reconstruction from the recording plan, Capture boundaries, exact-byte finalization, transcript attempts, and canonical editor receipts. Live call presence is intentionally not rewritten as historical proof.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-wide">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900">{sourceJourney.counts.complete} complete</span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-900">{sourceJourney.counts.inProgress} moving</span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-900">{sourceJourney.counts.attention} attention</span>
        </div>
      </div>

      {sourceJourney.journeys.length ? <ol className="mt-4 space-y-4">
        {sourceJourney.journeys.map((journey) => <li key={journey.id} className="rounded-2xl border border-slate-200 bg-[#fffdf8] p-4" data-source-journey-state={journey.state}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8a7354]">{journey.participantLabel} · {journey.retentionRole.replaceAll("-", " ")} · {journey.sourceKind}</p>
              <h4 className="mt-1 text-base font-black text-[#3d3122]">{journey.label}</h4>
              <p className="mt-1 text-[11px] font-semibold text-[#765f40]">{journey.deviceLabel}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wide ${journey.state === "COMPLETE" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : journey.state === "ATTENTION" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>{journey.state.replaceAll("_", " ")}</span>
          </div>
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold leading-5 text-slate-700">{journey.summary}</p>
          <ol className="mt-3 grid gap-2 md:grid-cols-5" aria-label={`${journey.label} source checkpoints`}>
            {journey.checkpoints.map((checkpoint) => <li key={checkpoint.id} className={`rounded-xl border p-3 ${checkpointTone(checkpoint.state)}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-wide">{checkpoint.label}</p>
                {checkpoint.state === "COMPLETE" ? <CheckCircle2 size={14} aria-hidden="true" /> : checkpoint.state === "HELD" ? <ShieldAlert size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
              </div>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wide opacity-70">{checkpointStateLabel(checkpoint.state)}</p>
              <p className="mt-2 text-[10px] font-semibold leading-4">{checkpoint.detail}</p>
              {timestamp(checkpoint.at) ? <time className="mt-2 block text-[9px] font-bold opacity-70" dateTime={checkpoint.at ?? undefined}>{timestamp(checkpoint.at)}</time> : null}
            </li>)}
          </ol>
          <details className="mt-3 text-[10px] font-semibold text-slate-600">
            <summary className="cursor-pointer font-black uppercase tracking-wide text-sky-800">Evidence identities</summary>
            <dl className="mt-2 grid gap-1 rounded-xl bg-slate-50 p-3 font-mono">
              <div><dt className="inline font-black">Plan </dt><dd className="inline break-all">{journey.expectedSourceId ?? "not declared"}</dd></div>
              <div><dt className="inline font-black">Capture </dt><dd className="inline break-all">{journey.captureId ?? "not observed"}</dd></div>
              <div><dt className="inline font-black">RecordingAsset </dt><dd className="inline break-all">{journey.recordingAssetId ?? "not retained"}</dd></div>
            </dl>
          </details>
        </li>)}
      </ol> : <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">No retained-source plan or observed source can be reconstructed yet. Declare the intended masters before recording so a device that never starts remains visible.</p>}
    </div>

    <div className="mt-6">
      <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#5b472f]"><AlertTriangle size={16} aria-hidden="true" />Ranked attention queue</h3>
      {cockpit.attention.length ? <ol className="mt-3 space-y-3">
        {cockpit.attention.map((item, index) => <li key={item.id} className={`rounded-2xl border p-4 ${severityStyle[item.severity]}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl"><p className="text-[10px] font-black uppercase tracking-wide">#{index + 1} · {item.severity}</p><h4 className="mt-1 text-lg font-black">{item.title}</h4><p className="mt-1 text-xs font-semibold leading-5">{item.detail}</p><p className="mt-2 text-xs font-black leading-5">Why it matters: {item.consequence}</p></div>
            <Link href={item.href ?? laneHref(props.roomId, item.lane)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-current bg-white/70 px-4 py-2 text-[10px] font-black uppercase tracking-wide">{item.actionLabel ?? `Open ${item.lane}`}<ArrowRight size={13} aria-hidden="true" /></Link>
          </div>
        </li>)}
      </ol> : <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-950">No source, transcript, analysis-coverage, Studio-integrity, or delivery attention item is projected from the current canonical evidence.</p>}
    </div>
  </section>;
}
