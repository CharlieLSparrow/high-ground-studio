"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ListTodo,
  LoaderCircle,
  Play,
  Target,
  TriangleAlert,
} from "lucide-react";

import { TranscriptSpeakerEvidenceBadge } from "@/components/transcript-speaker-evidence-badge";

import type {
  PriorSessionContinuity,
  PriorSessionFollowThrough,
  SavedSessionContinuityBrief,
  SessionContinuityState,
} from "./session-continuity-model";
import { sessionWorkspaceHref } from "./session-workspace-model";

function humanize(value: string) {
  return value.toLowerCase().replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortHash(value: string) {
  return value.length === 64 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : "Time needs review";
}

function formatMediaTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function statusTone(value: string) {
  const normalized = value.toUpperCase();
  if (/(DONE|COMPLETED|ACHIEVED)/.test(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (/(CANCELED|SKIPPED|ARCHIVED)/.test(normalized)) return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function PriorSessionFollowThroughCard({
  followThrough,
}: {
  followThrough: PriorSessionFollowThrough | null;
}) {
  if (!followThrough) return null;
  const changed = followThrough.summary.changedSinceReleaseCount;

  return (
    <section className="rounded-2xl border border-fuchsia-300 bg-gradient-to-br from-fuchsia-50/80 to-violet-50/70 p-5" aria-labelledby="prior-follow-through-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-900">Follow-through for this Session</p>
          <h2 id="prior-follow-through-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{followThrough.output.title}</h2>
          <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#8a7354]">
            Released to {followThrough.output.recipientLabel} · revision {followThrough.output.revision} · live canonical status
          </p>
        </div>
        <Link
          href={sessionWorkspaceHref(followThrough.sourceRoom.id, "outputs")}
          className="inline-flex min-h-11 items-center rounded-full border border-fuchsia-300 bg-white px-4 py-2 text-xs font-black text-fuchsia-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700"
        >
          Open release source
        </Link>
      </div>

      {followThrough.output.intro ? <p className="mt-4 max-w-4xl text-sm font-semibold leading-6 text-[#5f4d37]">{followThrough.output.intro}</p> : null}

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Commitments</dt><dd className="mt-1 text-lg font-black text-[#3d3122]">{followThrough.summary.openTaskCount} open · {followThrough.summary.completedTaskCount} done</dd></div>
        <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Goals</dt><dd className="mt-1 text-lg font-black text-[#3d3122]">{followThrough.summary.activeGoalCount} active · {followThrough.summary.achievedGoalCount} achieved</dd></div>
        <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Since release</dt><dd className="mt-1 text-lg font-black text-[#3d3122]">{changed} updated</dd></div>
        <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Visibility</dt><dd className="mt-1 text-sm font-black text-[#3d3122]">Assigned {followThrough.viewerRole === "COACH" ? "coach" : "client"}</dd></div>
      </dl>

      {followThrough.summary.unavailableCount > 0 ? (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-950">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {followThrough.summary.unavailableCount} released record{followThrough.summary.unavailableCount === 1 ? " is" : "s are"} no longer available to this client. Quipsly preserves the release receipt instead of silently dropping it.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-fuchsia-100 bg-white p-4" aria-labelledby="follow-through-tasks-heading">
          <div className="flex items-center gap-2"><ListTodo className="h-4 w-4 text-fuchsia-800" aria-hidden="true" /><h3 id="follow-through-tasks-heading" className="font-black text-[#3d3122]">Commitments now</h3></div>
          {followThrough.tasks.length ? <ul className="mt-3 space-y-2">{followThrough.tasks.map((task) => {
            const card = <><span className="flex flex-wrap items-start justify-between gap-2"><span className="text-xs font-black text-[#3d3122]">{task.title}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusTone(task.status)}`}>{humanize(task.status)}</span></span>{task.detail ? <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-[#765f40]">{task.detail}</span> : null}{task.changedSinceRelease ? <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-sky-800">Updated since release · was {humanize(task.releasedStatus)}</span> : <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-emerald-800">Matches released state</span>}</>;
            return <li key={task.id}>{followThrough.canOpenWork && task.availability === "CURRENT" ? <Link href={`/work?task=${encodeURIComponent(task.id)}`} className="block rounded-lg border border-fuchsia-100 p-3 hover:border-fuchsia-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700">{card}</Link> : <div className="rounded-lg border border-fuchsia-100 p-3">{card}</div>}</li>;
          })}</ul> : <p className="mt-3 text-xs font-semibold text-[#765f40]">The released follow-up did not include a client commitment.</p>}
        </section>

        <section className="rounded-xl border border-violet-100 bg-white p-4" aria-labelledby="follow-through-goals-heading">
          <div className="flex items-center gap-2"><Target className="h-4 w-4 text-violet-800" aria-hidden="true" /><h3 id="follow-through-goals-heading" className="font-black text-[#3d3122]">Goals now</h3></div>
          {followThrough.goals.length ? <ul className="mt-3 space-y-2">{followThrough.goals.map((goal) => {
            const card = <><span className="flex flex-wrap items-start justify-between gap-2"><span className="text-xs font-black text-[#3d3122]">{goal.title}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusTone(goal.status)}`}>{humanize(goal.status)}</span></span>{goal.latestProgress ? <span className="mt-1 block text-xs font-semibold leading-5 text-[#765f40]">{goal.latestProgress.progressPercent === null ? "Latest check-in recorded" : `${goal.latestProgress.progressPercent}% at latest check-in`}{goal.latestProgress.note ? ` · ${goal.latestProgress.note}` : ""}</span> : null}{goal.progressedSinceRelease ? <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-sky-800">New check-in since release</span> : null}{goal.changedSinceRelease ? <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-sky-800">Goal changed since release · was {humanize(goal.releasedStatus)}</span> : !goal.progressedSinceRelease ? <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-emerald-800">Matches released state</span> : null}</>;
            return <li key={goal.id}>{followThrough.canOpenWork && goal.availability === "CURRENT" ? <Link href={`/work?goal=${encodeURIComponent(goal.id)}`} className="block rounded-lg border border-violet-100 p-3 hover:border-violet-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">{card}</Link> : <div className="rounded-lg border border-violet-100 p-3">{card}</div>}</li>;
          })}</ul> : <p className="mt-3 text-xs font-semibold text-[#765f40]">The released follow-up did not include a client goal.</p>}
        </section>
      </div>

      {followThrough.output.nextSessionFocus ? <div className="mt-4 rounded-xl border border-violet-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wide text-violet-900">Bring into this Session</p><p className="mt-1 text-sm font-semibold leading-6 text-[#5f4d37]">{followThrough.output.nextSessionFocus}</p></div> : null}

      <details className="mt-4 rounded-xl border border-fuchsia-200 bg-white/85 p-4">
        <summary className="cursor-pointer text-xs font-black text-fuchsia-950">Inspect immutable release receipt</summary>
        <div className="mt-3 space-y-1 text-[10px] font-black uppercase tracking-wide text-[#765f40]"><p>Source Session · {followThrough.sourceRoom.title}</p><p>Released · {dateTime(followThrough.output.releasedAt)}</p><p className="break-all font-mono normal-case tracking-normal">SHA-256 {followThrough.output.contentSha256}</p></div>
      </details>

      <p className="mt-4 text-[10px] font-black uppercase tracking-wide text-fuchsia-950">
        Same Nest, purpose, client, and coach · released in Quipsly · same canonical IDs · no copied work · no completion, message, or calendar side effect
      </p>
    </section>
  );
}

export function PriorSessionContinuityCard({
  prior,
}: {
  prior: PriorSessionContinuity | null;
}) {
  if (!prior) {
    return (
      <section className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/35 p-5" aria-labelledby="prior-continuity-heading">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">Longitudinal preparation</p>
        <h2 id="prior-continuity-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">No saved prior brief</h2>
        <p className="mt-2 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">
          Quipsly carries forward only a private brief you deliberately saved from an earlier Session in this same Nest and Session purpose. It will not guess from titles, copy another person’s notes, or create new work.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-violet-300 bg-violet-50/60 p-5" aria-labelledby="prior-continuity-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">From the previous Session</p>
          <h2 id="prior-continuity-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{prior.sourceRoom.title}</h2>
          <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#8a7354]">
            Saved {dateTime(prior.brief.createdAt)} · {shortHash(prior.brief.snapshotSha256)}
          </p>
        </div>
        <Link
          href={sessionWorkspaceHref(prior.sourceRoom.id, "work")}
          className="inline-flex min-h-11 items-center rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black text-violet-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        >
          Open source Session
        </Link>
      </div>
      <p className="mt-4 whitespace-pre-wrap rounded-xl border border-violet-100 bg-white p-4 text-sm font-semibold leading-6 text-[#5f4d37]">
        {prior.brief.body}
      </p>
      {(prior.brief.taskEvidence ?? []).length ? (
        <section className="mt-4 rounded-xl border border-sky-200 bg-white p-4" aria-labelledby="prior-continuity-evidence-heading">
          <p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Reviewed transcript evidence</p>
          <h3 id="prior-continuity-evidence-heading" className="mt-1 font-black text-[#3d3122]">Return to what was actually said</h3>
          <ul className="mt-3 space-y-3">
            {(prior.brief.taskEvidence ?? []).map(({ taskId, taskTitle, evidence }) => (
              <li key={`${taskId}-${evidence.receiptId}`} className="rounded-lg border border-sky-100 bg-sky-50/45 p-3">
                <p className="text-xs font-black text-[#3d3122]">{taskTitle}</p>
                <p className="mt-1 line-clamp-3 text-xs font-semibold leading-5 text-sky-950">{evidence.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${evidence.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{evidence.sourceAnchor.effectiveTextSnapshot}</p>
                <TranscriptSpeakerEvidenceBadge authority={evidence.sourceAnchor.speakerAuthority} />
                <Link href={`/sessions/${encodeURIComponent(evidence.sourceAnchor.roomId)}?mode=transcript#transcript-segment-${encodeURIComponent(evidence.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
                  <Play size={14} aria-hidden="true" />Return to {formatMediaTime(evidence.sourceAnchor.startSeconds)}–{formatMediaTime(evidence.sourceAnchor.endSeconds)}
                </Link>
                <p className="mt-2 text-[10px] font-bold leading-4 text-sky-800">Append-only reviewed evidence · task identity and state remain canonical</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-violet-900">
        Same Nest and purpose · private to this actor · current Session unchanged · no AI or external side effects
      </p>
    </section>
  );
}

function SavedBrief({
  brief,
}: {
  brief: SavedSessionContinuityBrief;
}) {
  return (
    <details className="rounded-xl border border-violet-200 bg-white p-4">
      <summary className="cursor-pointer list-none">
        <span className="flex flex-wrap items-start justify-between gap-3">
          <span>
            <span className="block text-sm font-black text-[#3d3122]">{brief.title}</span>
            <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
              {dateTime(brief.createdAt)} · {shortHash(brief.snapshotSha256)}
            </span>
          </span>
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-violet-900">
            Inspect
          </span>
        </span>
      </summary>
      <p className="mt-4 whitespace-pre-wrap rounded-xl border border-violet-100 bg-violet-50/45 p-4 text-sm font-semibold leading-6 text-[#5f4d37]">
        {brief.body}
      </p>
    </details>
  );
}

export function SessionContinuityCard({
  roomId,
  initial,
}: {
  roomId: string;
  initial: SessionContinuityState;
}) {
  const [continuity, setContinuity] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const { snapshot, snapshotSha256, summary } = continuity.current;

  async function saveBrief() {
    setSaving(true);
    setNotice(null);
    requestIdRef.current ||= crypto.randomUUID();
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/continuity-brief`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientRequestId: requestIdRef.current,
          expectedSnapshotSha256: snapshotSha256,
        }),
      });
      const body = await response.json() as {
        ok?: boolean;
        error?: string;
        idempotentReplay?: boolean;
        continuity?: SessionContinuityState;
      };
      if (!response.ok || !body.ok || !body.continuity) {
        if (body.continuity) setContinuity(body.continuity);
        throw new Error(body.error || "The private brief was not saved.");
      }
      setContinuity(body.continuity);
      requestIdRef.current = null;
      setNotice({
        tone: "success",
        message: body.idempotentReplay
          ? "This exact private brief already existed; Quipsly reused it without a duplicate."
          : "Private next-session brief saved with exact note, task, goal, and focus-block receipts.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "The private brief was not saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/45 p-5" aria-labelledby="session-continuity-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white p-2 text-violet-700"><ClipboardCheck aria-hidden="true" /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">Bring the thread forward</p>
            <h2 id="session-continuity-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Next-session continuity</h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">
              Quipsly assembles only your committed Session records. It does not invent a recap, claim the work happened, notify anyone, or change Calendar.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={saving || !continuity.canSave}
          onClick={() => void saveBrief()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
          {saving ? "Saving private brief…" : "Save private brief"}
        </button>
      </div>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-4 rounded-xl border px-4 py-3 text-xs font-black ${
            notice.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      <div className="mt-4">
        <PriorSessionFollowThroughCard followThrough={continuity.priorFollowThrough} />
      </div>

      <div className="mt-4">
        <PriorSessionContinuityCard prior={continuity.prior} />
      </div>

      {summary.unresolvedPastBlockCount > 0 ? (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-950">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {summary.unresolvedPastBlockCount} planned focus block{summary.unresolvedPastBlockCount === 1 ? " has" : "s have"} passed without a completion, skip, or cancellation decision. That is next-session evidence—not silent failure.
        </p>
      ) : null}

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/90 bg-white/85 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Notes</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{summary.noteCount}</dd></div>
        <div className="rounded-xl border border-white/90 bg-white/85 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Tasks</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{summary.openTaskCount} open · {summary.completedTaskCount} done</dd></div>
        <div className="rounded-xl border border-white/90 bg-white/85 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Goals</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{summary.activeGoalCount} active · {summary.achievedGoalCount} achieved</dd></div>
        <div className="rounded-xl border border-white/90 bg-white/85 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Focus blocks</dt><dd className="mt-1 text-xl font-black text-[#3d3122]">{summary.plannedBlockCount} planned · {summary.completedBlockCount} done</dd></div>
      </dl>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <section className="rounded-xl border border-violet-200 bg-white p-4" aria-labelledby="continuity-notes-heading">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-violet-700" aria-hidden="true" /><h3 id="continuity-notes-heading" className="font-black text-[#3d3122]">Notes to carry</h3></div>
          {snapshot.notes.length ? (
            <ul className="mt-3 space-y-3">
              {snapshot.notes.map((note) => (
                <li key={note.id}>
                  <a href={`${sessionWorkspaceHref(roomId, "notes")}#session-note-${encodeURIComponent(note.id)}`} className="block rounded-lg border border-violet-100 p-3 hover:border-violet-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
                    <span className="block text-xs font-black text-[#3d3122]">{note.title || "Quick note"}</span>
                    <span className="mt-1 line-clamp-3 block text-xs font-semibold leading-5 text-[#765f40]">{note.bodyExcerpt}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs font-semibold text-[#765f40]">No deliberate Session note yet.</p>}
        </section>

        <section className="rounded-xl border border-violet-200 bg-white p-4" aria-labelledby="continuity-tasks-heading">
          <div className="flex items-center gap-2"><ListTodo className="h-4 w-4 text-violet-700" aria-hidden="true" /><h3 id="continuity-tasks-heading" className="font-black text-[#3d3122]">Committed tasks</h3></div>
          {snapshot.tasks.length ? (
            <ul className="mt-3 space-y-3">
              {snapshot.tasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-violet-100 p-3">
                  <Link href={`/work?task=${encodeURIComponent(task.id)}`} className="block rounded-md hover:bg-violet-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
                    <span className="flex flex-wrap items-start justify-between gap-2"><span className="text-xs font-black text-[#3d3122]">{task.title}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusTone(task.status)}`}>{humanize(task.status)}</span></span>
                    {task.detailExcerpt ? <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-[#765f40]">{task.detailExcerpt}</span> : null}
                  </Link>
                  {task.lastMergedTranscriptEvidence ? (
                    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Latest reviewed evidence added</p>
                      <p className="mt-1 line-clamp-3 text-xs font-semibold leading-5 text-sky-950">{task.lastMergedTranscriptEvidence.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${task.lastMergedTranscriptEvidence.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{task.lastMergedTranscriptEvidence.sourceAnchor.effectiveTextSnapshot}</p>
                      <TranscriptSpeakerEvidenceBadge authority={task.lastMergedTranscriptEvidence.sourceAnchor.speakerAuthority} />
                      <Link href={`/sessions/${encodeURIComponent(task.lastMergedTranscriptEvidence.sourceAnchor.roomId)}?mode=transcript#transcript-segment-${encodeURIComponent(task.lastMergedTranscriptEvidence.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
                        <Play size={14} aria-hidden="true" />Return to {formatMediaTime(task.lastMergedTranscriptEvidence.sourceAnchor.startSeconds)}–{formatMediaTime(task.lastMergedTranscriptEvidence.sourceAnchor.endSeconds)}
                      </Link>
                      <p className="mt-2 text-[10px] font-bold leading-4 text-sky-800">Evidence was appended without changing task definition, owner, state, dates, tags, goals, reminder, or recurrence.</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs font-semibold text-[#765f40]">No assigned Session task yet.</p>}
        </section>

        <section className="rounded-xl border border-violet-200 bg-white p-4" aria-labelledby="continuity-goals-heading">
          <div className="flex items-center gap-2"><Target className="h-4 w-4 text-violet-700" aria-hidden="true" /><h3 id="continuity-goals-heading" className="font-black text-[#3d3122]">Goals and evidence</h3></div>
          {snapshot.goals.length ? (
            <ul className="mt-3 space-y-3">
              {snapshot.goals.map((goal) => (
                <li key={goal.id}>
                  <Link href={`/work?goal=${encodeURIComponent(goal.id)}`} className="block rounded-lg border border-violet-100 p-3 hover:border-violet-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
                    <span className="flex flex-wrap items-start justify-between gap-2"><span className="text-xs font-black text-[#3d3122]">{goal.title}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusTone(goal.status)}`}>{humanize(goal.status)}</span></span>
                    {goal.latestProgress ? <span className="mt-1 block text-xs font-semibold leading-5 text-[#765f40]">{goal.latestProgress.progressPercent === null ? "Progress note recorded" : `${goal.latestProgress.progressPercent}% recorded`}{goal.latestProgress.noteExcerpt ? ` · ${goal.latestProgress.noteExcerpt}` : ""}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs font-semibold text-[#765f40]">No actor-owned Session goal yet.</p>}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-violet-200 bg-white p-4" aria-labelledby="continuity-plan-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-violet-700" aria-hidden="true" /><h3 id="continuity-plan-heading" className="font-black text-[#3d3122]">Focus-block truth</h3></div>
          <Link href="/schedule" className="inline-flex min-h-11 items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-900">Open Calendar</Link>
        </div>
        {snapshot.planBlocks.length ? (
          <ul className="mt-3 grid gap-2 lg:grid-cols-2">
            {snapshot.planBlocks.map((block) => {
              const unresolvedPast = block.status === "PLANNED" && new Date(block.endsAt).getTime() < Date.now();
              return (
                <li key={block.id} className={`rounded-lg border p-3 text-xs font-semibold leading-5 ${unresolvedPast ? "border-amber-200 bg-amber-50 text-amber-950" : "border-violet-100 text-[#765f40]"}`}>
                  <span className="block font-black">{dateTime(block.startsAt)}–{new Date(block.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  <span className="block">{unresolvedPast ? "Planned time passed · decision still missing" : humanize(block.status)} · {block.timezone}</span>
                  <code className="mt-1 block break-all text-[10px]">{block.id}</code>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-3 text-xs font-semibold text-[#765f40]">No focus-block receipt is connected to this Session’s work yet.</p>}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-wide text-[#765f40]">
        <span>Current receipt · {shortHash(snapshotSha256)}</span>
        <span>Private to this actor · no AI · no external side effects</span>
      </div>

      {continuity.saved.length ? (
        <details className="mt-4 rounded-xl border border-violet-200 bg-violet-100/35 p-4">
          <summary className="cursor-pointer text-xs font-black text-violet-950">
            <CheckCircle2 className="mr-2 inline h-4 w-4" aria-hidden="true" />
            {continuity.saved.length} saved private brief{continuity.saved.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 space-y-3">{continuity.saved.map((brief) => <SavedBrief key={brief.id} brief={brief} />)}</div>
        </details>
      ) : null}
    </section>
  );
}
