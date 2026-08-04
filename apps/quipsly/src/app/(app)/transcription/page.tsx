import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Gauge,
  ScanSearch,
  ShieldCheck,
  TimerReset,
  Users,
} from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import {
  readTranscriptEvaluationBoard,
  type TranscriptEvaluationBoard,
  type TranscriptEvidenceProvider,
  type TranscriptEvidenceWorkload,
} from "@/lib/server/transcript-evaluation-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Transcription evidence - Quipsly",
  description: "Measure transcript accuracy, speakers, timing, correction effort, and provider recovery against protected human-reviewed sources.",
};

function humanize(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function percent(value: number | null, digits = 1) {
  return value == null ? "Unavailable" : `${(value * 100).toFixed(digits)}%`;
}

function duration(milliseconds: number) {
  if (!milliseconds) return "Not measured";
  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function date(value: string | null) {
  if (!value) return "Not collected";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function statusTone(status: TranscriptEvidenceProvider["status"]) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "fail") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function ProviderCard({ provider }: { provider: TranscriptEvidenceProvider }) {
  return <article className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-black text-[#3d3122]">{provider.providerName}</p>
        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#80694c]">{provider.model} · {provider.adapterVersion}</p>
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(provider.status)}`}>{humanize(provider.status)}</span>
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div className="rounded-xl bg-indigo-50 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Clean WER</dt><dd className="mt-1 text-sm font-black text-[#3d3122]">{percent(provider.cleanWordErrorRate)}</dd><p className="mt-1 text-[10px] font-bold text-indigo-700">bar ≤ 5%</p></div>
      <div className="rounded-xl bg-indigo-50 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Difficult WER</dt><dd className="mt-1 text-sm font-black text-[#3d3122]">{percent(provider.difficultWordErrorRate)}</dd><p className="mt-1 text-[10px] font-bold text-indigo-700">bar ≤ 10%</p></div>
      <div className="rounded-xl bg-indigo-50 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Speaker error</dt><dd className="mt-1 text-sm font-black text-[#3d3122]">{percent(provider.speakerErrorRate)}</dd><p className="mt-1 text-[10px] font-bold text-indigo-700">bar ≤ 3%</p></div>
      <div className="rounded-xl bg-indigo-50 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Timing p95</dt><dd className="mt-1 text-sm font-black text-[#3d3122]">{provider.timingP95Milliseconds == null ? "Unavailable" : `${Math.round(provider.timingP95Milliseconds)}ms`}</dd><p className="mt-1 text-[10px] font-bold text-indigo-700">word evidence only</p></div>
    </dl>
    <div className="mt-3 grid gap-2 text-xs font-bold text-[#685438] sm:grid-cols-3">
      <p className="rounded-lg border border-[#eadcc4] bg-[#fffaf2] p-2.5">{provider.succeededWindowCount}/{provider.expectedWindowCount} windows succeeded</p>
      <p className="rounded-lg border border-[#eadcc4] bg-[#fffaf2] p-2.5">{provider.correctionPassCount} correction pass{provider.correctionPassCount === 1 ? "" : "es"} · {duration(provider.correctionElapsedMilliseconds)}</p>
      <p className="rounded-lg border border-[#eadcc4] bg-[#fffaf2] p-2.5">{provider.realTimeFactor == null ? "Speed unavailable" : `${provider.realTimeFactor.toFixed(2)}× real time`} · {provider.estimatedCostUsd == null ? "cost unavailable" : `$${provider.estimatedCostUsd.toFixed(4)}`}</p>
    </div>
    {provider.missingConditions.length || provider.failedConditions.length ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">{provider.missingConditions.length ? `Missing: ${provider.missingConditions.map(humanize).join(", ")}. ` : ""}{provider.failedConditions.length ? `Failed: ${provider.failedConditions.map(humanize).join(", ")}.` : ""}</p> : null}
    <p className="mt-3 text-[10px] font-bold text-[#8a7354]">Exact config {provider.requestConfigSha256.slice(0, 12)}… · results from another config remain a separate comparison.</p>
  </article>;
}

function WorkloadCard({ workload }: { workload: TranscriptEvidenceWorkload }) {
  return <section className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm lg:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-700">{humanize(workload.id)} evidence</p>
        <h2 className="mt-2 font-serif text-2xl font-black text-[#3d3122]">{workload.coveredConditionCount}/{workload.requiredConditionCount} real conditions covered</h2>
        <p className="mt-2 text-sm font-semibold text-[#765f40]">{workload.windowCount} frozen, playback-reviewed window{workload.windowCount === 1 ? "" : "s"}.</p>
      </div>
      <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wide ${workload.complete ? "border-emerald-200 bg-emerald-100 text-emerald-950" : "border-amber-200 bg-amber-100 text-amber-950"}`}>{workload.complete ? "Coverage complete" : "Collecting truth"}</span>
    </div>
    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {workload.conditions.map((condition) => <div key={condition.id} className={`rounded-xl border p-3 ${condition.covered ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-white"}`}>
        <p className="flex items-center gap-2 text-xs font-black text-[#3d3122]">{condition.covered ? <CheckCircle2 size={15} className="text-emerald-700" aria-hidden="true" /> : <CircleAlert size={15} className="text-amber-700" aria-hidden="true" />}{humanize(condition.id)}</p>
        <p className="mt-1 text-[10px] font-bold text-[#80694c]">{condition.covered ? `${condition.windowCount} window${condition.windowCount === 1 ? "" : "s"} · ${condition.sessionCount} session${condition.sessionCount === 1 ? "" : "s"} · ${date(condition.latestApprovedAt)}` : "No approved real-work window yet"}</p>
      </div>)}
    </div>
    <div className="mt-5 space-y-3">
      {workload.providers.length ? workload.providers.map((provider) => <ProviderCard key={provider.identity} provider={provider} />) : <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/70 p-5 text-sm font-bold leading-6 text-indigo-950">No comparable provider attempt is retained for this workload yet. Approve genuine windows first; then run pinned candidates against the exact same derivative bytes.</div>}
    </div>
  </section>;
}

function TranscriptEvaluationBoardView({ board }: { board: TranscriptEvaluationBoard }) {
  const summary = board.summary;
  return <main className="mx-auto max-w-[1500px] space-y-6 pb-16 text-[#3d3122]">
    <header className="overflow-hidden rounded-[32px] border border-[#d7c5a6] bg-[#251b15] p-6 text-white shadow-xl shadow-amber-950/10 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-4xl">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-sky-300"><AudioLines size={17} aria-hidden="true" />Transcription evidence</p>
          <h1 className="mt-4 font-serif text-4xl font-black leading-tight lg:text-5xl">Know what Quipsly heard—and where it is wrong.</h1>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-[#eadfcf]">This desk compares exact provider builds against protected human-reviewed podcast and coaching sources. Word errors, speaker mistakes, timing drift, correction work, cost, latency, and failures stay separate so a confident-looking score can never masquerade as accuracy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/coaching/sessions" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-sky-300 px-4 py-2 text-xs font-black uppercase tracking-wide text-[#17212b]">Open sessions <ArrowRight size={15} aria-hidden="true" /></Link>
          <Link href="/editor" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-xs font-black uppercase tracking-wide text-white">Episode editor</Link>
        </div>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-sky-300"><ShieldCheck size={14} />Reviewed windows</p><p className="mt-2 text-3xl font-black">{summary.windowCount}/{summary.minimumWindowCount}</p><p className="mt-1 text-xs font-semibold text-[#d8caba]">minimum, never synthetic</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-sky-300"><ScanSearch size={14} />Conditions</p><p className="mt-2 text-3xl font-black">{summary.coveredConditionCount}/{summary.requiredConditionCount}</p><p className="mt-1 text-xs font-semibold text-[#d8caba]">podcast + coaching</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-sky-300"><Gauge size={14} />Provider attempts</p><p className="mt-2 text-3xl font-black">{summary.candidateAttemptCount}</p><p className="mt-1 text-xs font-semibold text-[#d8caba]">{summary.successfulCandidateCount} succeeded · {summary.failedCandidateCount} failed</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-sky-300"><TimerReset size={14} />Correction passes</p><p className="mt-2 text-3xl font-black">{summary.correctionPassCount}</p><p className="mt-1 text-xs font-semibold text-[#d8caba]">measured human effort</p></div>
      </div>
    </header>

    {!summary.windowCount ? <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
      <CircleAlert className="text-amber-700" aria-hidden="true" />
      <h2 className="mt-3 font-serif text-2xl font-black">The instrumentation is ready; genuine references are not.</h2>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-amber-950">Open a retained Session, play and correct a complete 60–180 second source-backed window, classify what is actually audible, and add it to the private corpus. Quipsly will not substitute provider output for human truth.</p>
      <Link href="/coaching/sessions" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-900 px-5 py-2 text-xs font-black uppercase tracking-wide text-white">Choose a retained Session <ArrowRight size={15} /></Link>
    </section> : null}

    <div className="grid gap-6 2xl:grid-cols-2">
      {board.workloads.map((workload) => <WorkloadCard key={workload.id} workload={workload} />)}
    </div>

    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-3xl border border-[#e1d2b7] bg-white p-5 shadow-sm lg:p-6">
        <div className="flex items-center gap-3"><Users className="text-[#8c6b4a]" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#987443]">Source Sessions</p><h2 className="mt-1 font-serif text-2xl font-black">Return to the exact listening surface</h2></div></div>
        {board.sessions.length ? <div className="mt-5 space-y-3">{board.sessions.map((session) => <Link key={session.roomId} href={`/sessions/${encodeURIComponent(session.roomId)}?mode=transcript`} className="group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#eadcc4] bg-[#fffaf2] p-4 transition hover:border-sky-300 hover:bg-sky-50">
          <div className="min-w-0"><p className="truncate text-sm font-black text-[#3d3122]">{session.title}</p><p className="mt-1 text-xs font-bold text-[#80694c]">{session.project?.name ?? "Independent Session"} · {session.workloads.map(humanize).join(" + ") || "Unclassified"}</p><p className="mt-2 text-[10px] font-semibold text-[#8a7354]">{session.conditions.map(humanize).join(" · ") || "No controlled condition"}</p></div>
          <div className="text-right"><p className="text-xs font-black text-[#3d3122]">{session.windowCount} window{session.windowCount === 1 ? "" : "s"}</p><p className="mt-1 text-[10px] font-bold text-[#80694c]">{session.candidateAttemptCount} attempts · {session.correctionPassCount} correction passes</p><p className="mt-2 inline-flex items-center gap-1 text-xs font-black text-sky-800">Open evidence <ArrowRight size={13} className="transition group-hover:translate-x-0.5" /></p></div>
        </Link>)}</div> : <p className="mt-5 rounded-2xl border border-dashed border-[#d8c7a7] bg-[#fffaf2] p-5 text-sm font-semibold text-[#765f40]">No accessible Session has a frozen accuracy window yet.</p>}
      </div>

      <div className="rounded-3xl border border-[#e1d2b7] bg-white p-5 shadow-sm lg:p-6">
        <div className="flex items-center gap-3"><Clock3 className="text-[#8c6b4a]" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#987443]">Next evidence</p><h2 className="mt-1 font-serif text-2xl font-black">Highest-value work, in order</h2></div></div>
        {board.nextEvidence.length ? <ol className="mt-5 space-y-3">{board.nextEvidence.slice(0, 12).map((item, index) => <li key={`${item.kind}-${item.workload}-${item.label}`} className="flex gap-3 rounded-xl border border-[#eadcc4] bg-[#fffaf2] p-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#3d3122] text-xs font-black text-white">{index + 1}</span>
          <div><p className="text-xs font-black text-[#3d3122]">{item.workload ? `${humanize(item.workload)} · ` : ""}{humanize(item.label)}</p><p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">{item.detail}</p></div>
        </li>)}</ol> : <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold leading-6 text-emerald-950">The encoded corpus, provider, failure, and correction gates are satisfied. Inspect workload-specific scorecards and downstream real-session quality before proposing any production default.</p>}
      </div>
    </section>

    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-xs font-bold leading-5 text-sky-950">
      <p className="flex items-center gap-2 font-black uppercase tracking-wide"><ShieldCheck size={15} aria-hidden="true" />Evidence boundary</p>
      <p className="mt-2">This read-only projection exposes no transcript text, reviewer identity, source path, or raw provider response. It does not choose a universal winner, invoke a provider, change a transcript, or alter a production default.</p>
    </section>
  </main>;
}

function TranscriptionUnavailable({ message }: { message: string }) {
  return <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10"><section role="status" className="w-full rounded-3xl border border-rose-200 bg-rose-50 p-7 text-rose-950"><CircleAlert className="h-8 w-8" /><h1 className="mt-4 font-serif text-3xl font-black">Transcription evidence could not be verified.</h1><p className="mt-3 text-sm font-semibold leading-6">{message} No zeroes, sample provider scores, or synthetic corpus rows are standing in for missing evidence.</p><Link href="/transcription" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-rose-900 px-5 py-2 text-xs font-black uppercase tracking-wide text-white">Try again</Link></section></main>;
}

export default async function TranscriptionPage() {
  const session = await getQuipslySession();
  if (!session?.user) return <TranscriptionUnavailable message="Sign in to inspect private transcript evidence." />;
  try {
    const board = await readTranscriptEvaluationBoard({
      prisma: getPrismaClient(),
      actor: session.user,
    });
    return <TranscriptEvaluationBoardView board={board} />;
  } catch (error) {
    console.error("[transcription] Failed to build private evidence board", error);
    const message = error instanceof Error && error.message.includes("ECONNREFUSED")
      ? "The workspace database is unavailable."
      : "Quipsly found invalid or unavailable private evaluation evidence.";
    return <TranscriptionUnavailable message={message} />;
  }
}
