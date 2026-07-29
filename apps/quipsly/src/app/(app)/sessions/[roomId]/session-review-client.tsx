"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, CircleAlert, Clapperboard, ClipboardList, FileAudio, FileUp, LayoutDashboard, ListTodo, LoaderCircle, MessageSquareText, Mic2, NotebookPen, RefreshCw, ShieldCheck, Tags, Target, Users } from "lucide-react";
import type { TranscriptActionReviewDecision, TranscriptGoalReviewDecision } from "@high-ground/quipsly-domain/coaching-packet";

import { TagSearchChips } from "@/components/tag-search-chips";

import {
  candidateReviewRequest,
  committedTasks,
  goalCandidateReviewRequest,
  timestampForSeconds,
  type SessionReviewCandidate,
  type SessionReviewGoalCandidate,
  type SessionReviewPacket,
} from "./session-review-model";
import { SessionContinuityCard } from "./session-continuity-card";
import type { SessionContinuityState } from "./session-continuity-model";
import type { SessionPreparation } from "./session-preparation-model";
import type { SessionSourceEvidence } from "./session-source-evidence-model";
import { SessionNotesWorkspace } from "./session-notes-workspace";
import type {
  SessionNoteView,
  SessionWorkspaceNote,
} from "./session-notes-model";
import {
  SESSION_WORKSPACE_MODES,
  sessionWorkspaceDefinition,
  sessionWorkspaceHref,
  type SessionWorkspaceMode,
} from "./session-workspace-model";
import { TranscriptCorrectionDesk } from "./transcript-correction-desk";

function humanize(value: string | null | undefined) {
  return (value || "not set").toLowerCase().replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type PacketSummary = NonNullable<NonNullable<SessionReviewPacket["packet"]>["summary"]>;

function packetBrief(summary: PacketSummary) {
  const source = record(record(summary).source);
  const brief = record(source.packetBrief);
  if (brief.kind !== "quipsly-transcript-packet-brief-v1") return null;
  const overview = record(brief.overview);
  const sections = Array.isArray(brief.sections) ? brief.sections.map(record).map((section) => ({
    id: String(section.id || "section"),
    label: String(section.label || "Review candidates"),
    items: Array.isArray(section.items) ? section.items.map(record).flatMap((item) => {
      const segmentId = String(item.segmentId || "").trim();
      const text = String(item.text || "").trim();
      if (!segmentId || !text) return [];
      return [{ segmentId, text, timeLabel: String(item.timeLabel || ""), speakerLabel: String(item.speakerLabel || "") }];
    }) : [],
  })) : [];
  return {
    overview: {
      segmentCount: Number(overview.segmentCount) || 0,
      speakerCount: Number(overview.speakerCount) || 0,
      startSeconds: Number(overview.startSeconds) || 0,
      endSeconds: Number(overview.endSeconds) || 0,
    },
    sections,
    sourceTruth: String(brief.sourceTruth || "Every item remains linked to transcript evidence; recording media remains source truth."),
    humanApprovalRequired: brief.humanApprovalRequired === true,
  };
}

function ReviewPacketSummary({ summary }: { summary: PacketSummary }) {
  const brief = packetBrief(summary);
  if (!brief) return <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[#765f40]">{summary.body}</p>;
  return <div className="mt-5 space-y-5">
    <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide text-[#5b472f]">
      <span className="rounded-full border border-[#d9c7a5] bg-[#fffaf0] px-3 py-1.5">{brief.overview.segmentCount} source segments</span>
      <span className="rounded-full border border-[#d9c7a5] bg-[#fffaf0] px-3 py-1.5">{brief.overview.speakerCount} provider speaker label{brief.overview.speakerCount === 1 ? "" : "s"}</span>
      <span className="rounded-full border border-[#d9c7a5] bg-[#fffaf0] px-3 py-1.5">{timestampForSeconds(brief.overview.startSeconds)}–{timestampForSeconds(brief.overview.endSeconds)}</span>
      {brief.humanApprovalRequired && <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-800">Human review required</span>}
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      {brief.sections.map((section) => <section key={section.id} className="rounded-xl border border-[#eadfc9] bg-[#fffdf8] p-4" aria-labelledby={`packet-section-${section.id}`}>
        <div className="flex items-center justify-between gap-3"><h3 id={`packet-section-${section.id}`} className="font-serif text-xl font-black text-[#3d3122]">{section.label}</h3><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#8a7354]">{section.items.length}</span></div>
        {section.items.length ? <ul className="mt-3 space-y-2">{section.items.map((item) => <li key={`${section.id}-${item.segmentId}`}><a href={`#transcript-segment-${encodeURIComponent(item.segmentId)}`} className="block rounded-lg border border-sky-100 bg-white p-3 text-sm font-semibold text-[#5f4d37] transition hover:border-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"><span className="block text-[10px] font-black uppercase tracking-wide text-sky-800">{item.timeLabel || "Source timestamp"}{item.speakerLabel ? ` · ${item.speakerLabel}` : ""}</span><span className="mt-1 block leading-relaxed">{item.text}</span></a></li>)}</ul> : <p className="mt-3 text-xs font-semibold leading-relaxed text-[#8a7354]">No source-linked candidates in this lane. Quipsly created nothing to fill the space.</p>}
      </section>)}
    </div>
    <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold leading-relaxed text-emerald-950">{brief.sourceTruth}</p>
    <details className="rounded-xl border border-[#eadfc9] bg-white p-4 text-sm text-[#765f40]"><summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">Inspect exact saved packet text</summary><p className="mt-4 whitespace-pre-wrap font-semibold leading-relaxed">{summary.body}</p></details>
  </div>;
}

export type SessionTaxonomy = {
  project: { id: string; name: string; slug: string };
  tags: Array<{ id: string; label: string; slug: string; category: string; projectId: string }>;
  catalog: Array<{ id: string; label: string; slug: string; category: string; projectId: string }>;
  canManage: boolean;
  canManageVocabulary: boolean;
  updatedAt: string;
};

export type SessionStudioHandoff = {
  project: { id: string; name: string; slug: string };
  recordings: Array<{
    recordingAssetId: string;
    fileName: string;
    kind: string;
    recordingStatus: string;
    status: "READY_FOR_HANDOFF" | "NOT_READY" | "ATTACHED" | "RECEIPT_MISSING" | "PROJECT_CONFLICT";
    mediaAssetId: string | null;
    attachmentId: string | null;
    attachmentUpdatedAt: string | null;
    episodeSlug: string | null;
    importRole: string | null;
    promotedAt: string | null;
  }>;
};

export type SessionQuickEntry = {
  id: string;
  kind: "NOTE" | "TASK" | "GOAL";
  title: string | null;
  body: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  tags: Array<{ id: string; label: string; slug: string }>;
};

export type SessionCaptureReceipts = {
  captures: Array<{
    captureId: string;
    status: "START_AND_STOP_RECEIVED" | "START_ONLY" | "STOP_ONLY";
    startedAt: string | null;
    stoppedAt: string | null;
    startReceiptId: string | null;
    stopReceiptId: string | null;
    lastReceivedAt: string;
  }>;
};

export type SessionContentReadiness = {
  status: "none" | "capture-proof-only" | "substantial";
  label: string;
  tone: string;
  detail: string;
  nextAction: string;
  captureAssetCount: number;
  knownDurationSeconds: number;
  longestKnownDurationSeconds: number | null;
  shortCaptureCount: number;
  simulatorCaptureCount: number;
  unknownDurationCount: number;
  verifiedCaptureCount: number;
  substantialRecordingCount: number;
  substantialThresholdSeconds: number;
};

function durationLabel(seconds: number | null) {
  if (seconds === null) return "unknown";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function byteSizeLabel(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return "Exact size absent";
  try {
    return `${BigInt(value).toLocaleString()} bytes`;
  } catch {
    return "Exact size absent";
  }
}

function SessionContentReadinessCard({ readiness }: { readiness: SessionContentReadiness }) {
  const ready = readiness.status === "substantial";
  return <section className={`rounded-2xl border p-5 ${ready ? "border-emerald-200 bg-emerald-50/45" : "border-orange-200 bg-orange-50/55"}`} aria-labelledby="recording-content-readiness-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className={`rounded-xl bg-white p-2 ${ready ? "text-emerald-700" : "text-orange-700"}`}><FileAudio aria-hidden="true" /></span><div><p className={`text-[10px] font-black uppercase tracking-[0.18em] ${ready ? "text-emerald-800" : "text-orange-800"}`}>Production content truth</p><h2 id="recording-content-readiness-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{readiness.label}</h2><p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">{readiness.detail}</p></div></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(ready ? "READY" : "HELD")}`}>{humanize(readiness.status)}</span></div>
    <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border border-white/80 bg-white/80 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Source media</dt><dd className="mt-1 text-lg font-black text-[#3d3122]">{readiness.captureAssetCount} <span className="text-xs text-[#765f40]">· {readiness.verifiedCaptureCount} verified</span></dd></div>
      <div className="rounded-xl border border-white/80 bg-white/80 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Known duration</dt><dd className="mt-1 text-lg font-black text-[#3d3122]">{durationLabel(readiness.knownDurationSeconds)}</dd></div>
      <div className="rounded-xl border border-white/80 bg-white/80 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Longest take</dt><dd className="mt-1 text-lg font-black text-[#3d3122]">{durationLabel(readiness.longestKnownDurationSeconds)}</dd></div>
      <div className="rounded-xl border border-white/80 bg-white/80 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Simulator / short</dt><dd className="mt-1 text-lg font-black text-[#3d3122]">{readiness.simulatorCaptureCount} / {readiness.shortCaptureCount}</dd></div>
    </dl>
    <p className={`mt-4 rounded-xl border bg-white px-4 py-3 text-xs font-black leading-5 ${ready ? "border-emerald-200 text-emerald-900" : "border-orange-200 text-orange-950"}`}>Next: {readiness.nextAction}</p>
  </section>;
}

function sessionTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : null;
}

function SessionPreparationCard({
  preparation,
}: {
  preparation: SessionPreparation;
}) {
  const scheduledStart = sessionTime(preparation.scheduledStart);
  const scheduledEnd = sessionTime(preparation.scheduledEnd);
  const scheduledLabel = scheduledStart
    ? `${scheduledStart}${scheduledEnd ? ` – ${scheduledEnd}` : ""}`
    : "No Quipsly schedule time";
  const audioReady = preparation.participants.length > 0 && preparation.allAudioReady;

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/45 p-5" aria-labelledby="session-preparation-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white p-2 text-sky-700"><ClipboardList aria-hidden="true" /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">Before capture</p>
            <h2 id="session-preparation-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Preparation runway</h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">
              Schedule, participants, and their latest versioned consent stay separate from recording, transcript, and output evidence.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/schedule" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-950">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />Open Calendar
          </Link>
          <Link href="/coaching/sessions" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-950">
            <Users className="h-4 w-4" aria-hidden="true" />Manage room setup
          </Link>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/90 bg-white/85 p-3">
          <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Session type</dt>
          <dd className="mt-1 text-lg font-black text-[#3d3122]">{humanize(preparation.purpose)}</dd>
          <dd className="mt-1 text-xs font-semibold text-[#765f40]">{humanize(preparation.status)}</dd>
        </div>
        <div className="rounded-xl border border-white/90 bg-white/85 p-3">
          <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Time</dt>
          <dd className="mt-1 text-sm font-black leading-5 text-[#3d3122]">{scheduledLabel}</dd>
        </div>
        <div className="rounded-xl border border-white/90 bg-white/85 p-3">
          <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Nest</dt>
          <dd className="mt-1 text-lg font-black text-[#3d3122]">{preparation.project?.name || "No canonical Nest"}</dd>
          <dd className="mt-1 text-xs font-semibold text-[#765f40]">Provider: {humanize(preparation.provider)}</dd>
        </div>
        <div className="rounded-xl border border-white/90 bg-white/85 p-3">
          <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Recording consent</dt>
          <dd className={`mt-1 text-lg font-black ${audioReady ? "text-emerald-800" : "text-amber-900"}`}>
            {audioReady ? "All participants ready" : "Not ready"}
          </dd>
          <dd className="mt-1 text-xs font-semibold text-[#765f40]">{preparation.participants.length} signed-in participant{preparation.participants.length === 1 ? "" : "s"}</dd>
        </div>
      </dl>

      <div className="mt-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-700" aria-hidden="true" />
          <h3 className="font-black text-[#3d3122]">Participants and latest consent</h3>
        </div>
        {preparation.participants.length ? (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {preparation.participants.map((participant) => {
              const consent = participant.consent;
              const recordingReady = consent?.recordingReady === true;
              return (
                <li key={participant.id} className="rounded-xl border border-sky-100 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-[#3d3122]">{participant.label}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{humanize(participant.role)}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(recordingReady ? "READY" : "HELD")}`}>
                      {recordingReady ? "Capture ready" : consent ? "Needs current consent" : "Consent missing"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
                    <span className={`rounded-full border px-2 py-1 ${consent?.canRecordAudio ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>Audio choice {consent?.canRecordAudio ? "yes" : "no"}</span>
                    <span className={`rounded-full border px-2 py-1 ${consent?.canRecordVideo ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>Video {consent?.canRecordVideo ? "yes" : "no"}</span>
                    <span className={`rounded-full border px-2 py-1 ${consent?.transcriptionReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>Transcript {consent?.transcriptionReady ? "ready" : "not ready"}</span>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-[#765f40]">
                    {consent?.policyVersion ? `${humanize(consent.status)} · policy ${consent.policyVersion}` : "No versioned consent receipt"}
                    {participant.joinedAt ? ` · joined ${sessionTime(participant.joinedAt)}` : ""}
                  </p>
                  {consent && !recordingReady ? <p className="mt-2 text-xs font-black leading-5 text-amber-950">The saved row is not current capture-ready evidence. Recollect consent in Capture before recording.</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-4 text-xs font-black leading-5 text-amber-950">
            No signed-in, non-observer participant is attached. Do not treat an empty consent projection as permission to record.
          </div>
        )}
      </div>

      <p className="mt-5 rounded-xl border border-sky-200 bg-white px-4 py-3 text-xs font-black leading-5 text-sky-950">
        This is current preparation evidence only. Recordings verifies immutable source state; Transcript separately enforces the complete release receipt. No invitation, message, provider event, or consent decision is created here.
      </p>
    </section>
  );
}

function SessionCaptureReceiptCard({ receipts }: { receipts: SessionCaptureReceipts }) {
  const visibleCaptures = receipts.captures.slice(0, 4);
  const olderCaptures = receipts.captures.slice(4);
  const receiptArticle = (capture: SessionCaptureReceipts["captures"][number]) => {
    const complete = capture.status === "START_AND_STOP_RECEIVED";
    return <article key={capture.captureId} className="rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Local source ID</p><p className="mt-1 break-all font-mono text-xs font-black text-[#3d3122]">{capture.captureId}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusTone(complete ? "COMPLETED" : "HELD")}`}>{complete ? "Start + stop received" : humanize(capture.status)}</span></div>
      <p className="mt-3 text-xs font-bold leading-5 text-[#765f40]">{complete ? "The take closed cleanly in Nest; its immutable audio source remains on the iPhone until upload succeeds." : "This receipt trail is incomplete. Reopen Capture so local recovery can reconcile the take before relying on it."}</p>
      <dl className="mt-3 grid gap-2 text-[10px] font-bold text-[#8a7354]">
        <div><dt className="inline font-black">Started </dt><dd className="inline">{capture.startedAt ? new Date(capture.startedAt).toLocaleString() : "not received"}</dd>{capture.startReceiptId ? <dd className="mt-0.5 break-all font-mono text-[9px]">{capture.startReceiptId}</dd> : null}</div>
        <div><dt className="inline font-black">Stopped </dt><dd className="inline">{capture.stoppedAt ? new Date(capture.stoppedAt).toLocaleString() : "not received"}</dd>{capture.stopReceiptId ? <dd className="mt-0.5 break-all font-mono text-[9px]">{capture.stopReceiptId}</dd> : null}</div>
      </dl>
    </article>;
  };
  return <section className="rounded-2xl border border-amber-200 bg-amber-50/45 p-5" aria-labelledby="capture-receipt-heading">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-white p-2 text-amber-700"><FileAudio aria-hidden="true" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">iPhone capture boundary</p><h2 id="capture-receipt-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{receipts.captures.length} phone capture receipt trail{receipts.captures.length === 1 ? "" : "s"}</h2><p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">START/STOP receipts prove the local capture boundary reached Nest. They do not claim the audio uploaded: a verified RecordingAsset appears separately after its bytes arrive.</p></div></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {visibleCaptures.map(receiptArticle)}
      {receipts.captures.length === 0 && <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 p-4 text-xs font-bold text-amber-900">No phone capture boundary receipts exist for this Session. Quipsly does not infer a recording from consent alone.</div>}
    </div>
    {olderCaptures.length > 0 && <details className="mt-4 rounded-xl border border-amber-200 bg-white/75 p-3"><summary className="cursor-pointer text-xs font-black text-amber-950">Show {olderCaptures.length} older receipt trail{olderCaptures.length === 1 ? "" : "s"}</summary><div className="mt-3 grid gap-3 lg:grid-cols-2">{olderCaptures.map(receiptArticle)}</div></details>}
  </section>;
}

function SessionSourceEvidenceCard({
  roomId,
  evidence,
}: {
  roomId: string;
  evidence: SessionSourceEvidence;
}) {
  const exact = evidence.counts.VERIFIED_MATCH;
  const held = evidence.counts.HELD;
  const needsReview = evidence.counts.DRIFT + evidence.counts.INCOMPLETE;
  const sourceArticle = (source: SessionSourceEvidence["sources"][number]) => {
    const verified = source.status === "VERIFIED_MATCH";
    const drift = source.status === "DRIFT";
    const tone = verified ? "COMPLETED" : drift ? "FAILED" : "NOT_READY";
    const appLabel = source.captureRuntime.appVersion
      ? `Quipsly Capture ${source.captureRuntime.appVersion}${source.captureRuntime.appBuild ? ` (${source.captureRuntime.appBuild})` : ""}`
      : "Capture build not preserved";
    return <article key={source.recordingAssetId} className={`rounded-xl border bg-white p-4 ${drift ? "border-rose-300" : verified ? "border-emerald-200" : "border-amber-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{humanize(source.kind)} · {humanize(source.recordingStatus)}</p>
          <h3 className="mt-1 break-words font-black text-[#3d3122]">{source.fileName}</h3>
          <p className="mt-1 break-all font-mono text-[10px] font-bold text-[#765f40]">Asset {source.recordingAssetId}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(tone)}`}>{humanize(source.status)}</span>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[#eadfc9] bg-[#fffdf8] p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Capture runtime</dt><dd className="mt-1 text-xs font-black text-[#3d3122]">{appLabel}</dd><dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">{[source.captureRuntime.deviceModel, source.captureRuntime.operatingSystem].filter(Boolean).join(" · ") || "Device/OS not preserved"}</dd><dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">{source.captureRuntime.audioRoute || "No captured audio route"}</dd></div>
        <div className="rounded-lg border border-[#eadfc9] bg-[#fffdf8] p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Cloud copy</dt><dd className="mt-1 text-xs font-black text-[#3d3122]">{byteSizeLabel(source.cloud.byteSize)} · generation {source.cloud.generation || "absent"}</dd><dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">{source.cloud.verifiedAt ? `Verified ${new Date(source.cloud.verifiedAt).toLocaleString()}` : "No server verification time"}</dd></div>
      </dl>

      <div className="mt-3 grid gap-2 text-[10px] font-bold text-[#765f40] sm:grid-cols-2">
        <div><p className="font-black uppercase tracking-wide text-[#8a7354]">Capture / group</p><p className="mt-1 break-all font-mono">{source.captureId || "Capture ID absent"}</p><p className="mt-1 break-all font-mono">{source.captureGroupId || "Group ID absent"}</p></div>
        <div><p className="font-black uppercase tracking-wide text-[#8a7354]">Server boundaries</p><p className="mt-1 break-all font-mono">START {source.startBoundary?.receiptId || "absent"}</p><p className="mt-1 break-all font-mono">STOP {source.stopBoundary?.receiptId || "absent"}</p></div>
      </div>

      {source.issues.length ? <ul className={`mt-4 space-y-1 rounded-lg border p-3 text-xs font-bold leading-5 ${drift ? "border-rose-200 bg-rose-50 text-rose-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>{source.issues.map((issue) => <li key={issue}>• {issue}</li>)}</ul> : verified ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-black leading-5 text-emerald-950">Nest independently matched the immutable receipt, RecordingAsset, exact server SHA-256 and byte count, cloud object generation, and applied START/STOP boundaries.</p> : <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-black leading-5 text-amber-950">The immutable source identity matches, but its processing policy remains held. Review the saved disposition before creating transcript or output work.</p>}

      <details className="mt-3 rounded-lg border border-[#eadfc9] bg-[#fffdf8] p-3">
        <summary className="cursor-pointer text-xs font-black text-[#5b472f]">Inspect exact cloud identity</summary>
        <dl className="mt-3 grid gap-2 text-[10px] font-bold text-[#765f40]">
          <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Upload session</dt><dd className="mt-1 break-all font-mono">{source.uploadSessionId || "absent"}</dd></div>
          <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">SHA-256</dt><dd className="mt-1 break-all font-mono">{source.cloud.sha256 || "absent"}</dd></div>
          <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Private object</dt><dd className="mt-1 break-all font-mono">{source.cloud.bucket && source.cloud.objectPath ? `${source.cloud.bucket}/${source.cloud.objectPath}` : "absent"}</dd></div>
          <div><dt className="font-black uppercase tracking-wide text-[#8a7354]">Dispositions</dt><dd className="mt-1">{humanize(source.processingDisposition)} processing · {humanize(source.transcriptDisposition)} transcript</dd></div>
        </dl>
      </details>
    </article>;
  };

  return <section className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-5" aria-labelledby="source-evidence-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-white p-2 text-emerald-700"><ShieldCheck aria-hidden="true" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">Independent source comparison</p><h2 id="source-evidence-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Phone → cloud → Nest evidence</h2><p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">This projection recomputes the match from Nest’s immutable finalization receipt, canonical recording row, private cloud identity, and room boundaries. It does not trust or import a phone-exported receipt as authority.</p></div></div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-black uppercase tracking-wide"><span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-emerald-800">{exact} exact</span><span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-amber-900">{held} held</span><span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-rose-900">{needsReview} review</span><a href={`/api/sessions/${encodeURIComponent(roomId)}/source-evidence`} className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 bg-white px-3 py-2 text-emerald-900 normal-case tracking-normal">Download Nest receipt</a></div>
    </div>
    <div className="mt-4 grid gap-3 xl:grid-cols-2">{evidence.sources.map(sourceArticle)}</div>
    {evidence.sources.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-white/70 p-4 text-xs font-bold text-emerald-950">No canonical local capture source exists for this Session. A receipt slot, consent row, or provider join is not shown as source media.</div> : null}
  </section>;
}

function SessionQuickEntryCard({
  entries,
  taxonomy,
  scope,
}: {
  entries: SessionQuickEntry[];
  taxonomy: SessionTaxonomy | null;
  scope: "notes" | "work";
}) {
  const entriesForScope = entries.filter((entry) => (
    scope === "notes" ? entry.kind === "NOTE" : entry.kind === "TASK" || entry.kind === "GOAL"
  ));
  const [currentEntries, setCurrentEntries] = useState(entriesForScope);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setCurrentEntries(entries.filter((entry) => (
      scope === "notes" ? entry.kind === "NOTE" : entry.kind === "TASK" || entry.kind === "GOAL"
    )));
  }, [entries, scope]);
  const icon = (kind: SessionQuickEntry["kind"]) => kind === "NOTE" ? MessageSquareText : kind === "TASK" ? ListTodo : Target;
  function updateEntry(noteId: string, update: Partial<SessionQuickEntry>) {
    setCurrentEntries((current) => current.map((entry) => entry.id === noteId ? { ...entry, ...update } : entry));
  }
  async function saveNote(entry: SessionQuickEntry, formData: FormData) {
    setBusyId(entry.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(formData.get("title") || ""),
          body: String(formData.get("body") || ""),
          expectedUpdatedAt: entry.updatedAt,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; note?: { title: string | null; body: string; updatedAt: string; tags: SessionQuickEntry["tags"] } };
      if (!response.ok || !payload.ok || !payload.note) throw new Error(payload.error || "The note was not saved.");
      updateEntry(entry.id, { title: payload.note.title, body: payload.note.body, updatedAt: payload.note.updatedAt, tags: payload.note.tags });
      setNotice("Note saved to its original Session identity. No copy, message, calendar event, or publication action was created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The note was not saved.");
    } finally {
      setBusyId(null);
    }
  }
  async function saveNoteTags(entry: SessionQuickEntry, formData: FormData) {
    setBusyId(entry.id);
    setNotice(null);
    try {
      const tagIds = formData.getAll("noteTagId").map(String);
      const response = await fetch("/api/work/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityKind: "note", entityId: entry.id, tagIds, expectedUpdatedAt: entry.updatedAt }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; updatedAt?: string };
      if (!response.ok || !payload.ok || !payload.updatedAt) throw new Error(payload.error || "The note tags were not saved.");
      const catalog = taxonomy?.catalog ?? [];
      updateEntry(entry.id, { tags: catalog.filter((tag) => tagIds.includes(tag.id)).map(({ id, label, slug }) => ({ id, label, slug })), updatedAt: payload.updatedAt });
      setNotice("Canonical Nest tags saved on the same note identity.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The note tags were not saved.");
    } finally {
      setBusyId(null);
    }
  }
  async function createNoteTag(entry: SessionQuickEntry, formData: FormData) {
    setBusyId(entry.id);
    setNotice(null);
    try {
      const response = await fetch("/api/work/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityKind: "note", entityId: entry.id, operation: "CREATE_AND_ASSIGN", label: String(formData.get("label") || ""), expectedUpdatedAt: entry.updatedAt }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; updatedAt?: string; tag?: { id: string; label: string; slug: string } };
      if (!response.ok || !payload.ok || !payload.updatedAt || !payload.tag) throw new Error(payload.error || "The reusable tag was not created.");
      updateEntry(entry.id, { tags: [...entry.tags.filter((tag) => tag.id !== payload.tag!.id), payload.tag], updatedAt: payload.updatedAt });
      setNotice(`#${payload.tag.label} is now reusable in this Nest and attached to the note.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The reusable tag was not created.");
    } finally {
      setBusyId(null);
    }
  }
  const noteScope = scope === "notes";
  const title = noteScope
    ? `${currentEntries.length} deliberate iPhone Session note${currentEntries.length === 1 ? "" : "s"}`
    : `${currentEntries.length} deliberate iPhone work capture${currentEntries.length === 1 ? "" : "s"}`;
  return <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5" aria-labelledby={`quick-entry-${scope}-heading`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">{noteScope ? "Actor-owned Session context" : "Committed Session work"}</p><h2 id={`quick-entry-${scope}-heading`} className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{title}</h2><p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">{noteScope ? "These notes were deliberately captured for this Session. They are not transcript suggestions or copied phone drafts." : "These iPhone-created tasks and goals remain distinct from transcript candidates. Canonical work created through other reviewed paths appears in continuity below; every identity, owner, status, and tag remains unchanged here."}</p></div>{noteScope ? null : <Link href="/work" className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-900">Open Work</Link>}</div>
    {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-950">{notice}</p>}
    {currentEntries.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{currentEntries.map((entry) => {
      const Icon = icon(entry.kind);
      const href = entry.kind === "TASK" ? `/work?task=${encodeURIComponent(entry.id)}` : entry.kind === "GOAL" ? `/work?goal=${encodeURIComponent(entry.id)}` : null;
      return <article id={`quick-entry-${entry.id}`} key={entry.id} tabIndex={-1} className="scroll-mt-24 rounded-xl border border-emerald-200 bg-white p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
        <div className="flex items-start gap-3"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Icon className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-black text-[#3d3122]">{entry.title || (entry.kind === "NOTE" ? "Quick note" : `Untitled ${entry.kind.toLowerCase()}`)}</p><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusTone(entry.status)}`}>{humanize(entry.status)}</span></div>{entry.body && <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#765f40]">{entry.body}</p>}<p className="mt-3 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{humanize(entry.kind)} · {new Date(entry.createdAt).toLocaleString()}</p>{href && <Link href={href} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900">Open same {entry.kind.toLowerCase()} in Work</Link>}</div></div>
        <TagSearchChips tags={entry.tags} label={`${entry.title || entry.kind} tags`} />
        {entry.kind === "NOTE" && <details className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <summary className="cursor-pointer text-xs font-black text-emerald-950">Edit note and tags</summary>
          <form action={(formData) => void saveNote(entry, formData)} className="mt-3 grid gap-3">
            <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">Title<input name="title" maxLength={500} defaultValue={entry.title ?? ""} className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
            <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">Note<textarea name="body" required maxLength={20_000} defaultValue={entry.body ?? ""} rows={5} className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
            <button type="submit" disabled={busyId === entry.id} className="min-h-11 justify-self-start rounded-full bg-emerald-800 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Save note</button>
          </form>
          {taxonomy?.canManageVocabulary && <div className="mt-4 border-t border-emerald-100 pt-4">
            <form action={(formData) => void saveNoteTags(entry, formData)}>
              <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-[10px] font-black uppercase tracking-wide text-sky-900">Canonical {taxonomy.project.name} tags</legend>{taxonomy.catalog.map((tag) => <label key={tag.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs font-bold text-sky-950"><input name="noteTagId" value={tag.id} type="checkbox" defaultChecked={entry.tags.some((selected) => selected.id === tag.id)} />#{tag.label}</label>)}</fieldset>
              <button type="submit" disabled={busyId === entry.id} className="mt-3 min-h-11 rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-black text-sky-950 disabled:opacity-50">Save tags</button>
            </form>
            <form action={(formData) => void createNoteTag(entry, formData)} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label className="flex-1 text-[10px] font-black uppercase tracking-wide text-violet-900">New reusable tag<input name="label" required maxLength={80} placeholder="e.g. Opening craft" className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal" /></label>
              <button type="submit" disabled={busyId === entry.id} className="min-h-11 self-end rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-xs font-black text-violet-950 disabled:opacity-50">Create and attach</button>
            </form>
          </div>}
        </details>}
      </article>;
    })}</div> : <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-white/70 p-4 text-xs font-bold text-emerald-900">{noteScope ? "No deliberate iPhone Session note has synced yet. Quipsly does not substitute transcript text or an Inbox count." : "No deliberate iPhone task or goal is bound to this Session. Transcript candidates stay out until a person accepts them."}</div>}
  </section>;
}

function SessionStudioHandoffCard({ handoff, contentReadiness }: { handoff: SessionStudioHandoff; contentReadiness?: SessionContentReadiness | null }) {
  const attached = handoff.recordings.filter((recording) => recording.status === "ATTACHED");
  const integrityHolds = handoff.recordings.filter((recording) => recording.status === "RECEIPT_MISSING" || recording.status === "PROJECT_CONFLICT");
  const captureProofOnly = contentReadiness?.status === "capture-proof-only";
  return <section className="rounded-2xl border border-violet-200 bg-violet-50/45 p-5" aria-labelledby="studio-handoff-heading">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-white p-2 text-violet-700"><FileUp aria-hidden="true" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">Durable Studio handoff</p><h2 id="studio-handoff-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{attached.length} immutable source attachment{attached.length === 1 ? "" : "s"}</h2><p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">The source RecordingAsset stays immutable. A unique Nest attachment is a provenance receipt—not proof that the take is substantial, editorially chosen, or release-ready.</p></div></div>
    {integrityHolds.length > 0 && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-900">{integrityHolds.length} recording handoff{integrityHolds.length === 1 ? " is" : "s are"} held because its project binding or durable attachment receipt does not match this Session.</p>}
    {captureProofOnly && <p role="alert" className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black leading-5 text-orange-950">These attachment receipts point to capture-test media. The current source set is still “capture proof only,” so Quipsly does not call any attached file a production spine.</p>}
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {handoff.recordings.map((recording) => <article key={recording.recordingAssetId} className="rounded-xl border border-violet-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-black text-[#3d3122]">{recording.fileName}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{humanize(recording.kind)} · {humanize(captureProofOnly && recording.importRole === "spine-audio-candidate" ? "historical-spine-candidate-label" : recording.importRole || recording.recordingStatus)}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusTone(recording.status)}`}>{humanize(recording.status === "READY_FOR_HANDOFF" ? "READY_FOR_SOURCE_ATTACHMENT" : recording.status)}</span></div>
        {recording.status === "ATTACHED" && recording.episodeSlug ? <Link href={`/editor?project=${encodeURIComponent(handoff.project.slug)}&episode=${encodeURIComponent(recording.episodeSlug)}`} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-black text-violet-950">Open {humanize(recording.episodeSlug)} in Studio</Link> : null}
        {recording.status === "READY_FOR_HANDOFF" ? <p className="mt-3 text-xs font-bold leading-5 text-violet-900">Verified bytes are ready for an explicit source attachment. This is not a production-content or editorial-readiness verdict.</p> : null}
        {recording.status === "ATTACHED" && captureProofOnly ? <p className="mt-3 text-xs font-black leading-5 text-orange-900">Attachment receipt verified; production-spine status withheld because this Session contains only capture-test evidence.</p> : null}
        {recording.status === "NOT_READY" ? <p className="mt-3 text-xs font-bold leading-5 text-[#765f40]">This capture must be verified and released before Studio promotion.</p> : null}
        {recording.attachmentId ? <details className="mt-3 text-[10px] font-bold text-[#765f40]"><summary className="cursor-pointer">Inspect handoff receipt</summary><dl className="mt-2 grid gap-1 font-mono"><div><dt className="inline font-black">Attachment </dt><dd className="inline break-all">{recording.attachmentId}</dd></div><div><dt className="inline font-black">Media </dt><dd className="inline break-all">{recording.mediaAssetId}</dd></div></dl></details> : null}
      </article>)}
      {handoff.recordings.length === 0 && <div className="rounded-xl border border-dashed border-violet-200 bg-white/70 p-4 text-xs font-bold text-violet-900">This Session has no persisted recordings yet. Studio handoff will appear here only from real capture evidence.</div>}
    </div>
  </section>;
}

function SessionTaxonomyCard({ roomId, initial }: { roomId: string; initial: SessionTaxonomy }) {
  const [taxonomy, setTaxonomy] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setTaxonomy(initial), [initial]);
  const selected = new Set(taxonomy.tags.map((tag) => tag.id));

  async function save(formData: FormData) {
    setSaving(true);
    setNotice(null);
    try {
      const tagIds = formData.getAll("sessionTagId").map(String);
      const response = await fetch("/api/work/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entityKind: "session", entityId: roomId, tagIds, expectedUpdatedAt: taxonomy.updatedAt }) });
      const body = await response.json() as { ok?: boolean; error?: string; updatedAt?: string };
      if (!response.ok || !body.ok || !body.updatedAt) throw new Error(body.error || "Session tags were not saved.");
      setTaxonomy((current) => ({ ...current, tags: current.catalog.filter((tag) => tagIds.includes(tag.id)), updatedAt: body.updatedAt! }));
      setNotice("Session tags saved to the canonical Nest record. No source, task, provider, calendar, or publication state changed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Session tags were not saved.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-2xl border border-sky-200 bg-sky-50/45 p-5" aria-labelledby="session-context-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">Shared production context</p><h2 id="session-context-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{taxonomy.project.name}</h2><p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">This Session, its accepted work, Today, and Nest share one project identity.</p></div><div className="flex gap-2"><Link href={`/nests/${encodeURIComponent(taxonomy.project.slug)}`} className="rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900">Open Nest</Link><Link href={`/editor?project=${encodeURIComponent(taxonomy.project.slug)}`} className="rounded-full border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-900">Open Studio editor</Link></div></div>
    <TagSearchChips tags={taxonomy.tags} label="Session tags" />
    {taxonomy.canManage && <details className="mt-4 rounded-xl border border-sky-200 bg-white/80 p-3"><summary className="cursor-pointer text-xs font-black text-sky-950"><Tags className="mr-2 inline h-4 w-4" aria-hidden="true" />Edit Session tags</summary>{taxonomy.catalog.length ? <form key={taxonomy.updatedAt} action={save} className="mt-3 space-y-3"><fieldset className="flex flex-wrap gap-2"><legend className="sr-only">Choose Session tags</legend>{taxonomy.catalog.map((tag) => <label key={tag.id} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-200 px-3 py-2 text-xs font-bold"><input name="sessionTagId" type="checkbox" value={tag.id} defaultChecked={selected.has(tag.id)} />{tag.label}</label>)}</fieldset><button type="submit" disabled={saving} className="rounded-full bg-sky-800 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50">{saving ? "Saving…" : "Save Session tags"}</button></form> : <p className="mt-2 text-xs font-semibold text-sky-900">This Nest has no active taxonomy yet.</p>}</details>}
    {!taxonomy.canManage && <p className="mt-3 text-xs font-semibold text-[#765f40]">Tags are read-only here. Only the Session creator with Editor access can change them.</p>}
    {notice && <p role="status" className="mt-3 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-950">{notice}</p>}
  </section>;
}

function GoalCandidateCard({
  candidate,
  busy,
  onDecision,
}: {
  candidate: SessionReviewGoalCandidate;
  busy: boolean;
  onDecision: (candidate: SessionReviewGoalCandidate, decision: TranscriptGoalReviewDecision, draft?: { title: string; description: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(candidate.suggestedTitle);
  const [description, setDescription] = useState(candidate.suggestedDescription);
  const accepted = Boolean(candidate.committedGoalId) || candidate.reviewStatus === "ACCEPTED_AS_GOAL";

  useEffect(() => {
    setTitle(candidate.suggestedTitle);
    setDescription(candidate.suggestedDescription);
    setEditing(false);
  }, [candidate.reviewStatus, candidate.suggestedDescription, candidate.suggestedTitle]);

  return <article className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">{timestampForSeconds(candidate.startSeconds)}–{timestampForSeconds(candidate.endSeconds)} · {candidate.speakerLabel || "Unlabelled speaker"}</p><h3 className="mt-1 text-lg font-black text-[#3d3122]">{candidate.suggestedTitle}</h3></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(candidate.reviewStatus)}`}>{humanize(candidate.reviewStatus)}</span></div>
    <p className="mt-3 text-sm font-semibold leading-relaxed text-[#765f40]">{candidate.sourceText}</p>
    <a href={`#transcript-segment-${encodeURIComponent(candidate.segmentId)}`} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-900 hover:underline">Review exact transcript source</a>
    {accepted && candidate.committedGoalId ? <p className="mt-4 flex flex-wrap items-center gap-2 text-sm font-black text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />Accepted as one canonical goal. <Link href={`/work?goal=${encodeURIComponent(candidate.committedGoalId)}`} className="underline">Open goal</Link></p> : editing ? <div className="mt-4 space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4"><label className="block text-xs font-black uppercase tracking-wide text-violet-900">Goal title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" /></label><label className="block text-xs font-black uppercase tracking-wide text-violet-900">Definition of progress <span className="normal-case tracking-normal text-violet-700">(optional)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={3} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !title.trim()} onClick={() => onDecision(candidate, "EDIT", { title, description })} className="rounded-full bg-violet-700 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">Save for review</button><button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50">Cancel</button></div></div> : <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => onDecision(candidate, "ACCEPT", { title, description })} className="rounded-full bg-[#3e2f21] px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">Accept as goal</button><button type="button" disabled={busy} onClick={() => setEditing(true)} className="rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50">Edit candidate</button><button type="button" disabled={busy} onClick={() => onDecision(candidate, "DEFER")} className="rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-900 disabled:opacity-50">Defer</button><button type="button" disabled={busy} onClick={() => onDecision(candidate, "REJECT")} className="rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-800 disabled:opacity-50">Reject</button></div>}
    {!accepted && <p className="mt-3 text-xs font-bold leading-relaxed text-[#8a7354]">Only “Accept as goal” writes one actor-owned ACTIVE Goal. Edit, defer, and reject preserve the review record without creating a goal, task, date, focus block, reminder, calendar event, message, delivery, or publication.</p>}
  </article>;
}

function statusTone(value: string | null | undefined) {
  const normalized = (value || "").toUpperCase();
  if (/(COMPLETED|READY|GRANTED|ACCEPTED|OPEN)/.test(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (/(HELD|REJECTED|FAILED|DECLINED|REVOKED)/.test(normalized)) return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function CandidateCard({
  candidate,
  packet,
  busy,
  onDecision,
}: {
  candidate: SessionReviewCandidate;
  packet: SessionReviewPacket;
  busy: boolean;
  onDecision: (candidate: SessionReviewCandidate, decision: TranscriptActionReviewDecision, draft?: { title: string; detail: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(candidate.title);
  const [detail, setDetail] = useState(candidate.detail);
  const accepted = candidate.committedActionItemId || candidate.reviewStatus === "ACCEPTED_AS_ACTION_ITEM";

  return (
    <article className="rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">
            {timestampForSeconds(candidate.startSeconds)}–{timestampForSeconds(candidate.endSeconds)} · {candidate.speakerLabel || "Unlabelled speaker"}
          </p>
          <h3 className="mt-1 text-lg font-black text-[#3d3122]">{candidate.title}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(candidate.reviewStatus)}`}>{humanize(candidate.reviewStatus)}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[#765f40]">{candidate.detail}</p>
      {accepted ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-black text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" />Committed as a Quipsly task. It is still unassigned until someone explicitly assigns it.</p>
      ) : editing ? (
        <div className="mt-4 space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
          <label className="block text-xs font-black uppercase tracking-wide text-violet-900">Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
          </label>
          <label className="block text-xs font-black uppercase tracking-wide text-violet-900">Evidence-backed detail
            <textarea value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={5000} rows={3} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !title.trim()} onClick={() => onDecision(candidate, "EDIT", { title: title.trim(), detail: detail.trim() })} className="rounded-full bg-violet-700 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">Save for review</button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => onDecision(candidate, "ACCEPT")} className="rounded-full bg-[#3e2f21] px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">Accept as task</button>
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50">Edit candidate</button>
          <button type="button" disabled={busy} onClick={() => onDecision(candidate, "DEFER")} className="rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-900 disabled:opacity-50">Defer</button>
          <button type="button" disabled={busy} onClick={() => onDecision(candidate, "REJECT")} className="rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-800 disabled:opacity-50">Reject</button>
        </div>
      )}
      {!accepted && <p className="mt-3 text-xs font-bold leading-relaxed text-[#8a7354]">Only “Accept as task” writes one unassigned ActionItem. Edit, defer, and reject preserve the review record without creating work, assigning anyone, sending follow-up, or publishing.</p>}
    </article>
  );
}

function WorkspaceModeIcon({ mode }: { mode: SessionWorkspaceMode }) {
  if (mode === "prepare") return <ClipboardList className="h-4 w-4" aria-hidden="true" />;
  if (mode === "recordings") return <Mic2 className="h-4 w-4" aria-hidden="true" />;
  if (mode === "transcript") return <MessageSquareText className="h-4 w-4" aria-hidden="true" />;
  if (mode === "notes") return <NotebookPen className="h-4 w-4" aria-hidden="true" />;
  if (mode === "work") return <ListTodo className="h-4 w-4" aria-hidden="true" />;
  if (mode === "outputs") return <Clapperboard className="h-4 w-4" aria-hidden="true" />;
  return <LayoutDashboard className="h-4 w-4" aria-hidden="true" />;
}

function SessionWorkspaceNavigation({
  roomId,
  mode,
}: {
  roomId: string;
  mode: SessionWorkspaceMode;
}) {
  const active = sessionWorkspaceDefinition(mode);
  return (
    <section className="rounded-2xl border border-[#e5d5b7] bg-[#fffdf8]/90 p-3 shadow-sm">
      <nav aria-label="Session workspace modes">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {SESSION_WORKSPACE_MODES.map((definition) => {
            const selected = definition.id === mode;
            return (
              <Link
                key={definition.id}
                href={sessionWorkspaceHref(roomId, definition.id)}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${
                  selected
                    ? "border-violet-300 bg-violet-800 text-white shadow-sm"
                    : "border-transparent bg-white text-[#5f4d37] hover:border-violet-200 hover:bg-violet-50"
                }`}
              >
                <WorkspaceModeIcon mode={definition.id} />
                {definition.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <p className="px-2 pb-1 pt-3 text-xs font-semibold leading-5 text-[#765f40]">
        <span className="font-black text-[#3d3122]">{active.eyebrow}.</span>{" "}
        {active.description}
      </p>
    </section>
  );
}

function WorkspaceEmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/60 p-6">
      <h2 className="font-serif text-2xl font-black text-[#3d3122]">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">{detail}</p>
    </section>
  );
}

function SessionWorkspaceOverview({
  roomId,
  preparation,
  contentReadiness,
  sessionTaxonomy,
  studioHandoff,
  sessionNotes,
  sessionQuickEntries,
  sessionContinuity,
  consentSnapshot,
}: {
  roomId: string;
  preparation: SessionPreparation | null;
  contentReadiness: SessionContentReadiness | null;
  sessionTaxonomy: SessionTaxonomy | null;
  studioHandoff: SessionStudioHandoff | null;
  sessionNotes: SessionWorkspaceNote[];
  sessionQuickEntries: SessionQuickEntry[];
  sessionContinuity: SessionContinuityState | null;
  consentSnapshot: { total: number; granted: number; transcriptionPermitted: number };
}) {
  const continuity = sessionContinuity?.current.summary;
  const noteQuickEntryCount = sessionQuickEntries.filter((entry) => entry.kind === "NOTE").length;
  const workQuickEntryCount = sessionQuickEntries.filter((entry) => entry.kind === "TASK" || entry.kind === "GOAL").length;
  const attachedOutputCount = studioHandoff?.recordings
    .filter((recording) => recording.status === "ATTACHED").length ?? 0;
  const substantialRecording = contentReadiness?.status === "substantial";
  const attention = [
    ...(!substantialRecording
      ? [{
          id: "recording",
          title: contentReadiness?.label || "Recording truth is not available",
          detail: contentReadiness?.nextAction || "Open Recordings before relying on transcript or output status.",
          mode: "recordings" as const,
        }]
      : []),
    ...((continuity?.unresolvedPastBlockCount ?? 0) > 0
      ? [{
          id: "follow-through",
          title: `${continuity!.unresolvedPastBlockCount} focus block${continuity!.unresolvedPastBlockCount === 1 ? "" : "s"} need a decision`,
          detail: "The planned time passed without completion, skip, or cancellation evidence.",
          mode: "prepare" as const,
        }]
      : []),
    ...(consentSnapshot.total > consentSnapshot.granted
      ? [{
          id: "consent",
          title: "Consent evidence is incomplete",
          detail: `${consentSnapshot.granted} of ${consentSnapshot.total} persisted consent records are granted.`,
          mode: "transcript" as const,
        }]
      : consentSnapshot.total > consentSnapshot.transcriptionPermitted
        ? [{
            id: "transcription-permission",
            title: "Transcription permission is incomplete",
            detail: `${consentSnapshot.transcriptionPermitted} of ${consentSnapshot.total} standalone consent records permit transcription.`,
            mode: "transcript" as const,
          }]
        : []),
  ];
  const lanes = [
    {
      mode: "prepare" as const,
      title: "Prepare",
      value: preparation
        ? `${preparation.participants.length} signed-in participant${preparation.participants.length === 1 ? "" : "s"}`
        : "Preparation unavailable",
      detail: `${preparation ? humanize(preparation.status) : "Unknown status"} · ${preparation?.scheduledStart ? sessionTime(preparation.scheduledStart) : "unscheduled"} · ${sessionTaxonomy?.tags.length ?? 0} Session tags`,
    },
    {
      mode: "recordings" as const,
      title: "Recordings",
      value: contentReadiness?.label || "Truth unavailable",
      detail: `${contentReadiness?.captureAssetCount ?? 0} source asset${contentReadiness?.captureAssetCount === 1 ? "" : "s"} · ${contentReadiness?.verifiedCaptureCount ?? 0} verified`,
    },
    {
      mode: "transcript" as const,
      title: "Transcript",
      value: substantialRecording ? "Source ready; inspect gate" : "Held by source truth",
      detail: consentSnapshot.total
        ? `${consentSnapshot.transcriptionPermitted} of ${consentSnapshot.total} standalone consent records permit transcription; Transcript enforces the complete release gate`
        : "No standalone consent rows are projected here; Transcript verifies the complete release receipt before review",
    },
    {
      mode: "notes" as const,
      title: "Notes",
      value: `${sessionNotes.length} visible deliberate note${sessionNotes.length === 1 ? "" : "s"}`,
      detail: `${noteQuickEntryCount} from iPhone Capture · ${continuity?.noteCount ?? 0} actor-owned note${continuity?.noteCount === 1 ? "" : "s"} in continuity`,
    },
    {
      mode: "work" as const,
      title: "Work",
      value: `${continuity?.openTaskCount ?? 0} open task${continuity?.openTaskCount === 1 ? "" : "s"} · ${continuity?.activeGoalCount ?? 0} active goal${continuity?.activeGoalCount === 1 ? "" : "s"}`,
      detail: `${workQuickEntryCount} deliberate iPhone work capture${workQuickEntryCount === 1 ? "" : "s"} · ${continuity?.plannedBlockCount ?? 0} planned focus block${continuity?.plannedBlockCount === 1 ? "" : "s"}`,
    },
    {
      mode: "outputs" as const,
      title: "Outputs",
      value: `${attachedOutputCount} Studio attachment${attachedOutputCount === 1 ? "" : "s"}`,
      detail: `${studioHandoff?.recordings.length ?? 0} recording handoff receipt${studioHandoff?.recordings.length === 1 ? "" : "s"} available for inspection`,
    },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#e5d5b7] bg-white p-6 shadow-sm" aria-labelledby="session-runway-heading">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">One Session, seven focused modes</p>
        <h2 id="session-runway-heading" className="mt-2 font-serif text-3xl font-black text-[#3d3122]">Current runway</h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">
          Open the lane for the job in front of you. Every lane reads the same canonical Session; switching modes creates nothing and changes nothing.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lanes.map((lane) => (
            <Link
              key={lane.mode}
              href={sessionWorkspaceHref(roomId, lane.mode)}
              className="group rounded-2xl border border-[#eadfc9] bg-[#fffdf8] p-4 transition hover:border-violet-300 hover:bg-violet-50/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
            >
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-800">
                <WorkspaceModeIcon mode={lane.mode} />
                {lane.title}
              </span>
              <span className="mt-3 block font-serif text-xl font-black text-[#3d3122]">{lane.value}</span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-[#765f40]">{lane.detail}</span>
              <span className="mt-3 block text-xs font-black text-violet-800 group-hover:underline">Open {lane.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={`rounded-2xl border p-5 ${attention.length ? "border-amber-200 bg-amber-50/65" : "border-emerald-200 bg-emerald-50/55"}`} aria-labelledby="session-attention-heading">
        <h2 id="session-attention-heading" className="font-serif text-2xl font-black text-[#3d3122]">
          {attention.length ? "Needs an honest decision" : "No overview blocker"}
        </h2>
        {attention.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {attention.map((item) => (
              <li key={item.id}>
                <Link href={sessionWorkspaceHref(roomId, item.mode)} className="block rounded-xl border border-amber-200 bg-white p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                  <span className="block text-sm font-black text-amber-950">{item.title}</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-amber-900">{item.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm font-semibold text-emerald-950">The overview snapshot exposes no recording, standalone-consent, or follow-through blocker. Transcript and Outputs still enforce their own evidence gates.</p>
        )}
      </section>
    </div>
  );
}

export function SessionReviewClient({ roomId, sessionTitle, mode = "overview", notesView = "all", preparation = null, consentSnapshot, contentReadiness = null, sourceEvidence = { sources: [], counts: { VERIFIED_MATCH: 0, HELD: 0, DRIFT: 0, INCOMPLETE: 0 } }, sessionTaxonomy = null, studioHandoff = null, sessionNotes = [], canUseProjectTeamNotes = false, sessionQuickEntries = [], captureReceipts = { captures: [] }, sessionContinuity = null }: {
  roomId: string;
  sessionTitle: string;
  mode?: SessionWorkspaceMode;
  notesView?: SessionNoteView;
  preparation?: SessionPreparation | null;
  consentSnapshot: { total: number; granted: number; transcriptionPermitted: number };
  contentReadiness?: SessionContentReadiness | null;
  sourceEvidence?: SessionSourceEvidence;
  sessionTaxonomy?: SessionTaxonomy | null;
  studioHandoff?: SessionStudioHandoff | null;
  sessionNotes?: SessionWorkspaceNote[];
  canUseProjectTeamNotes?: boolean;
  sessionQuickEntries?: SessionQuickEntry[];
  captureReceipts?: SessionCaptureReceipts;
  sessionContinuity?: SessionContinuityState | null;
}) {
  const [packet, setPacket] = useState<SessionReviewPacket | null>(null);
  const [loading, setLoading] = useState(mode === "transcript");
  const [buildingPacket, setBuildingPacket] = useState(false);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(roomId)}`, { cache: "no-store" });
      const body = await response.json() as SessionReviewPacket;
      if (!response.ok || !body.ok) throw new Error(body.error || "Quipsly could not read this session packet.");
      setPacket(body);
    } catch (error) {
      setPacket(null);
      setMessage(error instanceof Error ? error.message : "Quipsly could not read this session packet.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (mode !== "transcript") {
      setLoading(false);
      return;
    }
    void load();
  }, [load, mode]);

  async function buildPacket() {
    const transcriptJobId = packet?.transcriptJob?.id;
    if (!transcriptJobId) return;
    setBuildingPacket(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/packet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcriptJobId, force: false }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error || "The review packet was not built.");
      await load();
      setMessage(body.idempotentReplay
        ? "The current source-bound review packet already existed; no duplicate review artifacts were created."
        : "Review packet built from the completed transcript. Its summary and candidates remain internal until you explicitly review them.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review packet was not built.");
    } finally {
      setBuildingPacket(false);
    }
  }

  async function review(candidate: SessionReviewCandidate, decision: TranscriptActionReviewDecision, draft?: { title: string; detail: string }) {
    if (!packet) return;
    const request = candidateReviewRequest({ packet, candidate, decision, ...draft });
    if (!request) {
      setMessage("This review packet is missing its correlated source evidence. Refresh it before deciding.");
      return;
    }
    setBusyCandidateId(candidate.id);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/packet/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json() as { ok?: boolean; error?: string; actionItem?: { id: string } | null; idempotentReplay?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error || "The review decision was not saved.");
      const successMessage = decision === "ACCEPT"
        ? body.idempotentReplay ? "This candidate was already accepted as one task; nothing was duplicated." : "One unassigned Quipsly task was created from this accepted candidate."
        : `${humanize(decision)} saved as review state. No task was created.`;
      await load();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review decision was not saved.");
    } finally {
      setBusyCandidateId(null);
    }
  }

  async function reviewGoal(candidate: SessionReviewGoalCandidate, decision: TranscriptGoalReviewDecision, draft?: { title: string; description: string }) {
    if (!packet) return;
    const request = goalCandidateReviewRequest({ packet, candidate, decision, ...draft });
    if (!request) {
      setMessage("This goal candidate is already committed or missing a reviewed title. Refresh the packet before deciding again.");
      return;
    }
    setBusyCandidateId(candidate.id);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/packet/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean; goal?: { id: string } };
      if (!response.ok || !body.ok || (decision === "ACCEPT" && !body.goal?.id)) throw new Error(body.error || "The goal review decision was not saved.");
      const successMessage = decision === "ACCEPT"
        ? body.idempotentReplay ? "This candidate was already accepted as one canonical goal; nothing was duplicated." : "One actor-owned canonical goal was created. No task, date, focus block, calendar event, message, or delivery was added."
        : `${humanize(decision)} saved as goal review state. No goal or task was created.`;
      await load();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The goal review decision was not saved.");
    } finally {
      setBusyCandidateId(null);
    }
  }

  const tasks = committedTasks(packet);
  const held = packet?.transcriptProcessingGate?.allowed === false;
  const activeMode = sessionWorkspaceDefinition(mode);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-[#e5d5b7] bg-white/85 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#987443]">Session workspace · {activeMode.eyebrow}</p>
            <h1 className="mt-2 font-serif text-4xl font-black tracking-tight text-[#3d3122]">{sessionTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[#765f40]">{activeMode.description}</p>
          </div>
          {mode === "transcript" ? <button type="button" onClick={() => void load()} disabled={loading || buildingPacket || busyCandidateId !== null} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh transcript truth</button> : null}
        </div>
        {mode === "transcript" && message ? <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{message}</p> : null}
      </section>

      <SessionWorkspaceNavigation roomId={roomId} mode={mode} />

      {mode === "overview" ? <SessionWorkspaceOverview
        roomId={roomId}
        preparation={preparation}
        contentReadiness={contentReadiness}
        sessionTaxonomy={sessionTaxonomy}
        studioHandoff={studioHandoff}
        sessionNotes={sessionNotes}
        sessionQuickEntries={sessionQuickEntries}
        sessionContinuity={sessionContinuity}
        consentSnapshot={consentSnapshot}
      /> : null}

      {mode === "prepare" ? <>
        {preparation ? <SessionPreparationCard preparation={preparation} /> : <WorkspaceEmptyState title="Preparation truth unavailable" detail="Quipsly could not derive this Session’s schedule, participant, or versioned-consent projection. No ready-to-record state is inferred." />}
        {sessionTaxonomy ? <SessionTaxonomyCard roomId={roomId} initial={sessionTaxonomy} /> : <WorkspaceEmptyState title="No project context" detail="This Session is not connected to an accessible Nest, so Quipsly has no shared tag vocabulary or Studio destination to show." />}
      </> : null}

      {mode === "recordings" ? <>
        {contentReadiness ? <SessionContentReadinessCard readiness={contentReadiness} /> : <WorkspaceEmptyState title="Recording truth unavailable" detail="Quipsly could not derive a source-media readiness snapshot for this Session. No substitute recording state is shown." />}
        <SessionCaptureReceiptCard receipts={captureReceipts} />
        <SessionSourceEvidenceCard roomId={roomId} evidence={sourceEvidence} />
      </> : null}

      {mode === "notes" ? <SessionNotesWorkspace
        roomId={roomId}
        initialNotes={sessionNotes}
        activeView={notesView}
        taxonomy={sessionTaxonomy}
        canUseProjectTeamNotes={canUseProjectTeamNotes}
      /> : null}

      {mode === "work" ? <>
        <SessionQuickEntryCard entries={sessionQuickEntries} taxonomy={sessionTaxonomy} scope="work" />
        {sessionContinuity ? <SessionContinuityCard roomId={roomId} initial={sessionContinuity} /> : <WorkspaceEmptyState title="No continuity snapshot" detail="No actor-owned Session notes, committed tasks, goals, or focus blocks are available to carry forward." />}
      </> : null}

      {mode === "outputs" ? (
        studioHandoff
          ? <SessionStudioHandoffCard handoff={studioHandoff} contentReadiness={contentReadiness} />
          : <WorkspaceEmptyState title="No output context" detail="This Session has no accessible Nest output boundary. Quipsly will not invent a Studio handoff or publication receipt." />
      ) : null}

      {mode === "transcript" ? (loading ? <section className="rounded-2xl border border-[#e5d5b7] bg-white p-8 text-sm font-bold text-[#765f40]"><LoaderCircle className="mr-2 inline animate-spin" size={18} aria-hidden="true" />Reading the Session’s transcript evidence…</section> : !packet ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8" role="status"><CircleAlert className="text-amber-700" aria-hidden="true" /><h2 className="mt-3 font-serif text-2xl font-black text-[#3d3122]">Transcript workspace is unavailable.</h2><p className="mt-2 font-semibold text-[#765f40]">No sample transcript or tasks are substituted. Your saved Session was not changed.</p></section> : <>
        <section className="grid gap-4 lg:grid-cols-3" aria-label="Session evidence status">
          <div className="rounded-2xl border border-[#e5d5b7] bg-white p-5"><ShieldCheck className="text-sky-700" aria-hidden="true" /><p className="mt-3 text-xs font-black uppercase tracking-wide text-[#987443]">Consent & release</p><p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(held ? "HELD" : packet.transcriptProcessingGate?.allowed ? "RELEASED" : "NOT_READY")}`}>{held ? "Transcript held" : packet.transcriptProcessingGate?.allowed ? "Release evidence verified" : "Release not ready"}</p><p className="mt-3 text-sm font-semibold leading-relaxed text-[#765f40]">{held ? packet.transcriptProcessingGate?.error : "Packet review reads only released transcript evidence; recording and consent are not changed here."}</p><p className="mt-2 text-xs font-bold text-[#8a7354]">{consentSnapshot.granted}/{consentSnapshot.total} persisted consent record(s) granted · {consentSnapshot.transcriptionPermitted} permit transcription</p></div>
          <div className="rounded-2xl border border-[#e5d5b7] bg-white p-5"><FileAudio className="text-violet-700" aria-hidden="true" /><p className="mt-3 text-xs font-black uppercase tracking-wide text-[#987443]">Transcript</p><p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(packet.transcriptJob?.status)}`}>{humanize(packet.transcriptJob?.status)}</p><p className="mt-3 text-sm font-semibold text-[#765f40]">{packet.transcriptJob?.segmentCount ?? 0} persisted segment(s) · {packet.transcriptJob?.asset?.fileName || "no bound recording asset"}</p></div>
          <div className="rounded-2xl border border-[#e5d5b7] bg-white p-5"><MessageSquareText className="text-emerald-700" aria-hidden="true" /><p className="mt-3 text-xs font-black uppercase tracking-wide text-[#987443]">Packet</p><p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(packet.packet?.status)}`}>{humanize(packet.packet?.status)}</p><p className="mt-3 text-sm font-semibold text-[#765f40]">{packet.packet?.nextAction}</p></div>
        </section>

        <section aria-labelledby="summary-heading" className="rounded-2xl border border-[#e5d5b7] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Human review material</p>
          <h2 id="summary-heading" className="mt-2 font-serif text-3xl font-black text-[#3d3122]">{packet.packet?.summary?.title || "No review packet yet"}</h2>
          {packet.packet?.summary ? <ReviewPacketSummary summary={packet.packet.summary} /> : <>
            <p className="mt-3 text-sm font-semibold text-[#765f40]">A completed, released transcript can be built into a review packet. This desk will not fabricate a summary.</p>
            {packet.packet?.safeActions?.find((action) => action.id === "build-review-packet" && action.enabled) ? <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <button type="button" onClick={() => void buildPacket()} disabled={buildingPacket || loading} className="inline-flex items-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50">{buildingPacket ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <MessageSquareText size={15} aria-hidden="true" />}{buildingPacket ? "Building review material…" : "Build review packet"}</button>
              <p className="mt-3 text-xs font-bold leading-relaxed text-violet-900">Creates internal summary, highlight, and candidate review artifacts from this exact transcript. It creates no task or goal and sends or publishes nothing.</p>
            </div> : null}
          </>}
        </section>

        <section aria-labelledby="candidate-heading">
          <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-2 text-violet-700"><ListTodo aria-hidden="true" /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Quarantined suggestions</p><h2 id="candidate-heading" className="font-serif text-3xl font-black text-[#3d3122]">Decide candidate by candidate</h2></div></div>
          {held ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">Transcript review is held until the release evidence is valid. Nothing can be accepted or turned into a task.</div> : packet.packet?.actionCandidates.length ? <div className="grid gap-4 xl:grid-cols-2">{packet.packet.actionCandidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} packet={packet} busy={busyCandidateId === candidate.id} onDecision={review} />)}</div> : <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">No transcript action candidates are waiting for human review.</div>}
        </section>

        <section aria-labelledby="goal-candidate-heading">
          <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-violet-50 p-2 text-violet-700"><Target aria-hidden="true" /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Candidate goals · not committed</p><h2 id="goal-candidate-heading" className="font-serif text-3xl font-black text-[#3d3122]">Choose what deserves to become a goal</h2></div></div>
          {held ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">Goal review is held until the released transcript and recording evidence are valid. Nothing can become a goal.</div> : (packet.packet?.goalCandidates ?? []).length ? <div className="grid gap-4 xl:grid-cols-2">{(packet.packet?.goalCandidates ?? []).map((candidate) => <GoalCandidateCard key={candidate.id} candidate={candidate} busy={busyCandidateId === candidate.id} onDecision={reviewGoal} />)}</div> : <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">No goal-language segments are waiting in this packet. Quipsly will not invent a goal to fill the space.</div>}
        </section>

        <section aria-labelledby="tasks-heading">
          <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><CheckCircle2 aria-hidden="true" /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Committed work only</p><h2 id="tasks-heading" className="font-serif text-3xl font-black text-[#3d3122]">Tasks accepted from this packet</h2></div></div>
          {tasks.length ? <div className="grid gap-3 lg:grid-cols-2">{tasks.map((task) => <article key={task.id} className="rounded-2xl border border-[#e5d5b7] bg-white p-5"><p className="font-black text-[#3d3122]"><Link href={`/work?task=${encodeURIComponent(task.id)}`} className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">{task.title}</Link></p>{task.detail && <p className="mt-2 text-sm font-semibold leading-relaxed text-[#765f40]">{task.detail}</p>}<p className="mt-3 text-xs font-black uppercase tracking-wide text-[#8a7354]">{humanize(task.status)} · {task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : "No due date"} · assignment not implied</p></article>)}</div> : <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">No committed tasks from this packet. Suggestions remain separate until someone accepts one.</div>}
        </section>

        <TranscriptCorrectionDesk roomId={roomId} />
      </>) : null}
    </div>
  );
}
