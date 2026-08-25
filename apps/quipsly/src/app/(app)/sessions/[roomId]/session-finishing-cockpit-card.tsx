"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clock3, DatabaseZap, ShieldAlert } from "lucide-react";

import type { SessionSourceEvidence } from "./session-source-evidence-model";
import type { SessionReadinessTopology } from "./session-readiness-topology";
import { buildSessionFinishingCockpit, type SessionFinishingEvidence } from "./session-finishing-cockpit";
import { buildSessionSourceJourneyProjection, type SessionSourceJourney, type SessionSourceJourneyCheckpoint } from "./session-source-journey";

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

function checkpointAction(input: {
  roomId: string;
  journey: SessionSourceJourney;
  checkpoint: SessionSourceJourneyCheckpoint;
  editorHref: string | null;
}) {
  if (input.checkpoint.state === "COMPLETE" || input.checkpoint.state === "NOT_APPLICABLE") return null;
  const room = encodeURIComponent(input.roomId);
  if (input.checkpoint.id === "plan") return { label: "Open source plan", href: `/sessions/${room}?mode=recordings#session-recording-plan-heading` };
  if (input.checkpoint.id === "capture") return { label: "Inspect capture receipts", href: `/sessions/${room}?mode=recordings#capture-receipt-heading` };
  if (input.checkpoint.id === "retention") return { label: "Inspect retained bytes", href: `/sessions/${room}?mode=recordings#source-evidence-heading` };
  if (input.checkpoint.id === "playback" && input.journey.protectedPlayback) return {
    label: "Open recording",
    href: input.journey.protectedPlayback.url,
  };
  if (input.checkpoint.id === "transcript" && input.journey.recordingAssetId) return {
    label: input.checkpoint.state === "HELD" ? "Repair this transcript" : "Open this transcript",
    href: `/sessions/${room}?mode=transcript&source=${encodeURIComponent(input.journey.recordingAssetId)}`,
  };
  if (input.checkpoint.id === "assembly" && input.editorHref) return { label: "Open selected take", href: input.editorHref };
  return null;
}

export function SessionFinishingCockpitCard(props: Props) {
  const router = useRouter();
  const cockpit = buildSessionFinishingCockpit(props);
  const sourceJourney = buildSessionSourceJourneyProjection(props);
  const shouldRefresh = sourceJourney.counts.attention === 0
    && sourceJourney.counts.inProgress > 0;
  useEffect(() => {
    if (!shouldRefresh) return;
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 24) window.clearInterval(interval);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [props.roomId, router, shouldRefresh]);
  const protectedSourceCount = props.sourceEvidence.counts.VERIFIED_MATCH;
  const completedTranscriptCount = props.finishingEvidence.transcriptJobs.filter(
    (job) => job.readiness ? job.readiness.state === "READY" : job.status === "COMPLETED" && job.segmentCount > 0,
  ).length;
  const playbackReadyCount = sourceJourney.journeys.filter((journey) =>
    journey.checkpoints.some((checkpoint) => checkpoint.id === "playback" && checkpoint.state === "COMPLETE"),
  ).length;
  const firstAttention = cockpit.attention[0] ?? null;
  const recordingHeadline = sourceJourney.counts.attention > 0
    ? `${sourceJourney.counts.attention} recording ${sourceJourney.counts.attention === 1 ? "item needs" : "items need"} attention`
    : sourceJourney.counts.inProgress > 0
      ? "Finishing your recording"
      : protectedSourceCount > 0
        ? "Recording protected"
        : "Waiting for recording";
  const recordingDetail = sourceJourney.counts.attention > 0
    ? "Quipsly preserved everything it received. Open the next action to recover or review the affected source."
    : sourceJourney.counts.inProgress > 0
      ? "You can leave this page. Quipsly will keep checking the recordings and prepare the transcript automatically."
      : protectedSourceCount > 0
        ? `${playbackReadyCount} of ${protectedSourceCount} participant-owned ${protectedSourceCount === 1 ? "source is" : "sources are"} verified, decoded, and ready in the protected player. Originals remain unchanged.`
        : "Record this Session when everyone is ready. Missing expected participants remain visible.";
  const primaryHref = firstAttention?.href ??
    (completedTranscriptCount > 0
      ? laneHref(props.roomId, "transcript")
      : laneHref(props.roomId, "recordings"));
  const primaryLabel = firstAttention?.actionLabel ??
    (completedTranscriptCount > 0 ? "Review transcript" : "Open recording");
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
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">Your recording</p>
        <h2 id="session-finishing-cockpit-heading" className="mt-1 font-serif text-3xl font-black text-[#3d3122]">{recordingHeadline}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">{recordingDetail}</p>
      </div>
      <Link href={primaryHref} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 py-2 text-xs font-black uppercase tracking-wide text-white">{primaryLabel}<ArrowRight size={14} aria-hidden="true" /></Link>
    </div>

    <dl className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Recording readiness">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wide text-emerald-800">Sources</dt><dd className="mt-1 text-sm font-black text-emerald-950">{protectedSourceCount > 0 ? `${protectedSourceCount} protected` : sourceJourney.counts.inProgress > 0 ? "Finishing" : "Not recorded"}</dd></div>
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wide text-sky-800">Transcript</dt><dd className="mt-1 text-sm font-black text-sky-950">{completedTranscriptCount > 0 ? `${completedTranscriptCount} ready` : protectedSourceCount > 0 ? "Preparing automatically" : "After recording"}</dd></div>
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wide text-violet-800">Edit & share</dt><dd className="mt-1 text-sm font-black text-violet-950">{protectedSourceCount > 0 ? "Available here" : "After recording"}</dd></div>
    </dl>

    <details className="mt-5 rounded-2xl border border-slate-200 bg-white/70 p-4">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-violet-900">Recording details</summary>
      <p className="mt-3 text-xs font-semibold leading-5 text-[#765f40]">Technical source, transcript, editor, and delivery evidence. Most people never need this; it remains available for support, recovery, and professional review.</p>

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
          {journey.protectedPlayback ? <div className="mt-3 rounded-2xl border border-sky-200 bg-white p-3">
            <p className="mb-2 text-[9px] font-black uppercase tracking-wide text-sky-800">Protected source player</p>
            {journey.protectedPlayback.kind === "video"
              ? <video controls preload="metadata" className="max-h-80 w-full rounded-xl bg-black" src={journey.protectedPlayback.url}>Your browser cannot play this recording.</video>
              : <audio controls preload="metadata" className="w-full" src={journey.protectedPlayback.url}>Your browser cannot play this recording.</audio>}
            <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-600">This authenticated route is bound to the retained source. Playing it here is the runtime listening or viewing check; the original remains unchanged.</p>
          </div> : null}
          <ol className="mt-3 grid gap-2 md:grid-cols-6" aria-label={`${journey.label} source checkpoints`}>
            {journey.checkpoints.map((checkpoint) => {
              const action = checkpointAction({ roomId: props.roomId, journey, checkpoint, editorHref: props.finishingEvidence.assembly?.editorHref ?? null });
              return <li key={checkpoint.id} className={`rounded-xl border p-3 ${checkpointTone(checkpoint.state)}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-wide">{checkpoint.label}</p>
                {checkpoint.state === "COMPLETE" ? <CheckCircle2 size={14} aria-hidden="true" /> : checkpoint.state === "HELD" ? <ShieldAlert size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
              </div>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wide opacity-70">{checkpointStateLabel(checkpoint.state)}</p>
              <p className="mt-2 text-[10px] font-semibold leading-4">{checkpoint.detail}</p>
              {timestamp(checkpoint.at) ? <time className="mt-2 block text-[9px] font-bold opacity-70" dateTime={checkpoint.at ?? undefined}>{timestamp(checkpoint.at)}</time> : null}
              {action ? <Link href={action.href} className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-full border border-current bg-white/70 px-3 py-2 text-[9px] font-black uppercase tracking-wide hover:underline">{action.label}<ArrowRight size={11} aria-hidden="true" /></Link> : null}
            </li>;
            })}
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
    </details>
  </section>;
}
