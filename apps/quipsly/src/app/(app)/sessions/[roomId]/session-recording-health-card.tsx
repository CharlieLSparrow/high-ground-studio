"use client";

import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, CircleHelp, Ear, ShieldAlert } from "lucide-react";

import { buildSessionRecordingHealth, type SessionRecordingHealthGate, type SessionRecordingHealthState } from "./session-recording-health";
import type { SessionReadinessTopology } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";
import { SessionRecordingHealthListeningNavigator } from "./session-recording-health-listening-navigator";

type Props = {
  roomId: string;
  topology: SessionReadinessTopology;
  sourceEvidence: SessionSourceEvidence;
};

function stateTone(state: SessionRecordingHealthState) {
  if (state === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (state === "BLOCKED") return "border-rose-200 bg-rose-50 text-rose-950";
  if (state === "REVIEW") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function stateIcon(state: SessionRecordingHealthState) {
  if (state === "READY") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (state === "BLOCKED") return <ShieldAlert size={15} aria-hidden="true" />;
  if (state === "REVIEW") return <Ear size={15} aria-hidden="true" />;
  return <CircleHelp size={15} aria-hidden="true" />;
}

function actionForGate(roomId: string, gate: SessionRecordingHealthGate, recordingAssetId: string | null) {
  const room = encodeURIComponent(roomId);
  if (gate.id === "plan") return { label: "Open source plan", href: `/sessions/${room}?mode=recordings#session-recording-plan-heading` };
  if (gate.id === "transcription") return {
    label: "Open transcript evidence",
    href: `/sessions/${room}?mode=transcript${recordingAssetId ? `&source=${encodeURIComponent(recordingAssetId)}` : ""}`,
  };
  return { label: "Inspect source evidence", href: `/sessions/${room}?mode=recordings#source-evidence-heading` };
}

export function SessionRecordingHealthCard({ roomId, topology, sourceEvidence }: Props) {
  const health = buildSessionRecordingHealth({ topology, sourceEvidence });
  return <section className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-5 shadow-sm sm:p-6" aria-labelledby="audio-flight-deck-heading" data-session-recording-health={health.state}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-sky-800"><Activity size={16} aria-hidden="true" />Audio Flight Deck</p>
        <h2 id="audio-flight-deck-heading" className="mt-1 font-serif text-3xl font-black text-[#3d3122]">{health.headline}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">{health.detail}</p>
        <p className="mt-2 text-[10px] font-bold leading-4 text-sky-900">No mystery score: plan, exact bytes, complete decode, useful signal, processing release, and transcription release stay independently inspectable. “Ready” still does not mean proof-listened or published.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-wide">
        <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-emerald-900">{health.counts.READY} ready</span>
        <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-amber-900">{health.counts.REVIEW} review</span>
        <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-rose-900">{health.counts.BLOCKED} blocked</span>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">{health.counts.UNKNOWN} unknown</span>
      </div>
    </div>

    {health.sources.length ? <ol className="mt-5 space-y-4">
      {health.sources.map((source) => {
        const nextGate = source.gates.find((gate) => gate.state === "BLOCKED")
          ?? source.gates.find((gate) => gate.state === "REVIEW")
          ?? source.gates.find((gate) => gate.state === "UNKNOWN")
          ?? null;
        const action = nextGate ? actionForGate(roomId, nextGate, source.recordingAssetId) : null;
        return <li key={source.id} className="rounded-2xl border border-slate-200 bg-white/90 p-4" data-recording-health-source={source.state}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8a7354]">{source.participantLabel} · {source.retentionRole.replaceAll("-", " ")} · {source.sourceKind}</p>
              <h3 className="mt-1 text-lg font-black text-[#3d3122]"><span className="sr-only">Recording health for </span>{source.label}</h3>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wide ${stateTone(source.state)}`}>{stateIcon(source.state)}{source.state}</span>
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label={`${source.label} health gates`}>
            {source.gates.map((gate) => <li key={gate.id} className={`rounded-xl border p-3 ${stateTone(gate.state)}`} data-recording-health-gate={gate.id} data-recording-health-gate-state={gate.state}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-wide">{gate.label}</p>
                {stateIcon(gate.state)}
              </div>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wide opacity-65">{gate.state}</p>
              <p className="mt-2 text-[10px] font-semibold leading-4">{gate.detail}</p>
            </li>)}
          </ol>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <p className="max-w-3xl text-[11px] font-bold leading-5 text-slate-700">Next: {source.nextAction}</p>
            {action ? <Link href={action.href} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-sky-300 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-wide text-sky-900 hover:underline">{action.label}<ArrowRight size={11} aria-hidden="true" /></Link> : null}
          </div>
        </li>;
      })}
    </ol> : <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-4 text-sm font-bold text-slate-700">No active planned or retained source is available. Declare the intended microphone, camera, sync, and backup sources before recording so a device that never starts cannot disappear from review.</p>}

    <div className="mt-5">
      <SessionRecordingHealthListeningNavigator health={health} evidence={sourceEvidence} />
    </div>
  </section>;
}
