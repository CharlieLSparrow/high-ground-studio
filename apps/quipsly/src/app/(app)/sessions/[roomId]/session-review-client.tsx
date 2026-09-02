"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clapperboard,
  ClipboardList,
  FileAudio,
  FileUp,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  MessageSquareText,
  Mic2,
  NotebookPen,
  Radio,
  RefreshCw,
  ShieldCheck,
  Tags,
  Target,
  Users,
} from "lucide-react";
import { buildQuipslySessionEntryReadiness } from "@high-ground/quipsly-domain/session-entry-readiness";

import { TagSearchChips } from "@/components/tag-search-chips";
import { AudibleEventQualificationLab } from "@/components/audio/AudibleEventQualificationLab";
import { CaptureAppHandoff } from "@/components/capture-app-handoff";
import {
  type LiveSessionDockConfig,
  useLiveSessionDock,
} from "@/components/live-session-dock";
import { SessionInvitations } from "@/components/session-invitations";
import { TranscriptSpeakerEvidenceBadge } from "@/components/transcript-speaker-evidence-badge";
import {
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "@/lib/mobile-capture-consent-policy.js";
import { sessionExperienceForPurpose } from "@/lib/session-experience";

import {
  committedTasks,
  timestampForSeconds,
  type SessionReviewPacket,
} from "./session-review-model";
import {
  PriorSessionContinuityCard,
  PriorSessionFollowThroughCard,
  SessionContinuityCard,
} from "./session-continuity-card";
import { SessionCoachingQuickPath } from "./session-coaching-quick-path";
import { SessionClientFollowUpCard } from "./session-client-follow-up-card";
import { SessionRecordingShareCard } from "./session-recording-share-card";
import type { SessionContinuityState } from "./session-continuity-model";
import { SessionEpisodeBindingRepair } from "./session-episode-binding-repair";
import { SessionEntryReadinessLive } from "./session-entry-readiness-live";
import { SessionFinishingCockpitCard } from "./session-finishing-cockpit-card";
import type { SessionFinishingEvidence } from "./session-finishing-cockpit";
import type { SessionPreparation } from "./session-preparation-model";
import { SessionRecordingImportCard } from "./session-recording-import-card";
import { SessionRecordingHealthCard } from "./session-recording-health-card";
import { SessionAudioMasteryCard } from "./session-audio-mastery-card";
import type { SessionSourceEvidence } from "./session-source-evidence-model";
import { SessionReadinessTopologyCard } from "./session-readiness-topology-card";
import {
  EMPTY_SESSION_READINESS_TOPOLOGY,
  type SessionReadinessTopology,
} from "./session-readiness-topology";
import { SessionSourceClockAttentionCard } from "./session-source-clock-attention-card";
import { SessionSourceAlignmentCard } from "./session-source-alignment-card";
import type { SessionSourceClockAttention } from "./session-source-clock-attention";
import { SessionVersionedOutputGraphCard } from "./session-versioned-output-graph-card";
import { SessionConversationThread } from "./session-conversation-thread";
import { CoachingSessionPlanCard } from "./coaching-session-plan-card";
import type { SessionVersionedOutputGraph } from "./session-versioned-output-graph";
import { SessionNotesWorkspace } from "./session-notes-workspace";
import type {
  EditableSessionNoteKind,
  SessionNoteView,
  SessionNoteVisibility,
  SessionWorkspaceNote,
} from "./session-notes-model";
import {
  EDITABLE_SESSION_NOTE_KINDS,
  SESSION_NOTE_VISIBILITIES,
  sessionNoteKindLabel,
  sessionNoteVisibilityLabel,
} from "./session-notes-model";
import {
  sessionWorkspaceDefinitionForPurpose,
  sessionWorkspaceHref,
  sessionWorkspaceModesForPurpose,
  type SessionWorkspaceMode,
} from "./session-workspace-model";
import {
  coachingEngagementHref,
  episodeRoomHref,
  type SessionCollaborationContext,
} from "./session-collaboration-model";
import { TranscriptCorrectionDesk } from "./transcript-correction-desk";

function humanize(value: string | null | undefined) {
  return (value || "not set")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function videoQualityLabel(value: string | null | undefined) {
  switch (value) {
    case "production-4k-24":
      return "4K · 24 fps";
    case "production-4k-30":
      return "4K · 30 fps";
    case "endurance-1080p-24":
      return "1080p · 24 fps endurance";
    default:
      return humanize(value);
  }
}

function liveRoomReadinessLabel(preparation: SessionPreparation | null) {
  if (!preparation) return "Provider truth unavailable";
  if (preparation.providerCanJoin) return "Browser + iPhone ready";
  if (preparation.providerReadiness === "livekit-needs-config")
    return "LiveKit credentials needed";
  if (preparation.providerReadiness === "livekit-needs-room-id")
    return "Live room not prepared";
  return "Local-only Session";
}

function SessionPostCallPath({
  roomId,
  hasRecording,
  transcriptStatus,
  transcriptSegmentCount,
  canReviewPrivatePacket,
  reviewMaterialReady,
  packetStale,
  preparingReviewMaterial,
  held,
  followUpReady,
}: {
  roomId: string;
  hasRecording: boolean;
  transcriptStatus: string;
  transcriptSegmentCount: number;
  canReviewPrivatePacket: boolean;
  reviewMaterialReady: boolean;
  packetStale: boolean;
  preparingReviewMaterial: boolean;
  held: boolean;
  followUpReady: boolean;
}) {
  const transcriptReady =
    transcriptStatus === "COMPLETED" && transcriptSegmentCount > 0;
  const resultsReady = reviewMaterialReady && !packetStale;
  const steps = [
    { label: "Recording", ready: hasRecording },
    { label: "Transcript", ready: transcriptReady },
    ...(canReviewPrivatePacket
      ? [{ label: "Results", ready: resultsReady }]
      : []),
    { label: "Follow-up", ready: followUpReady },
  ];
  const running = ["QUEUED", "RUNNING", "PROCESSING"].includes(
    transcriptStatus,
  );
  const next = !hasRecording
    ? {
        label: "Review recordings",
        href: sessionWorkspaceHref(roomId, "recordings"),
        detail: "A verified recording is needed before transcription.",
      }
    : held
      ? {
          label: "Check recording permission",
          href: sessionWorkspaceHref(roomId, "prepare"),
          detail:
            "The transcript is waiting for a participant to allow recording or transcription.",
        }
      : !transcriptReady
        ? {
            label: running
              ? "Transcription is running"
              : "Start or retry transcription",
            href: "#transcript-status",
            detail: running
              ? "Quipsly is processing the source in the background; this page refreshes automatically."
              : "Use the verified recording to create the timed transcript.",
          }
        : !canReviewPrivatePacket
          ? followUpReady
            ? {
                label: "Open shared follow-up",
                href: sessionWorkspaceHref(roomId, "outputs"),
                detail: "The follow-up deliberately shared with you is ready.",
              }
            : {
                label: "Open transcript",
                href: "#transcript-correction-review",
                detail:
                  "Your timed transcript is ready. Shared follow-up will appear here only after the coach deliberately shares it.",
              }
          : !resultsReady
            ? preparingReviewMaterial
              ? {
                  label: "Preparing your follow-up",
                  href: "#review-material",
                  detail:
                    "Quipsly is turning the completed transcript into editable notes, tasks, and goals.",
                }
              : {
                  label: "Retry Session results",
                  href: "#review-material",
                  detail: packetStale
                    ? "Quipsly could not refresh the Session results automatically. Try again without changing the saved transcript."
                    : "Quipsly could not prepare the Session results automatically. Try again without changing the saved transcript.",
                }
            : !followUpReady
              ? {
                  label: "Use Session results",
                  href: "#session-results",
                  detail:
                    "Your editable notes, tasks, and goals are ready. The transcript remains available for corrections.",
                }
              : {
                  label: "Open shared follow-up",
                  href: sessionWorkspaceHref(roomId, "outputs"),
                  detail: "The released follow-up is ready to read or share.",
                };

  return (
    <section
      className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 shadow-sm"
      aria-label="Post-call workflow"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">
            After the call
          </p>
          <h2 className="mt-1 font-serif text-2xl font-black text-[#3d3122]">
            Recording to useful follow-up
          </h2>
        </div>
        <a
          href={next.href}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 py-2 text-xs font-black uppercase tracking-wide text-white"
        >
          {next.label} <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step) => (
          <li
            key={step.label}
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide ${step.ready ? "border-emerald-200 bg-white text-emerald-900" : "border-violet-100 bg-white/65 text-violet-800"}`}
          >
            {step.ready ? (
              <CheckCircle2 size={15} aria-label="Done" />
            ) : (
              <CircleDashed size={15} aria-label="Not finished" />
            )}
            {step.label}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs font-bold leading-5 text-violet-950">
        {next.detail}
      </p>
    </section>
  );
}

function TranscriptConfidenceSummary({
  confidence,
}: {
  confidence: NonNullable<
    NonNullable<SessionReviewPacket["transcriptJob"]>["readiness"]
  >;
}) {
  const checks = [
    {
      label: confidence.exactSourceBound
        ? "Exact recording"
        : "Check recording",
      ready: confidence.exactSourceBound,
    },
    {
      label: confidence.segmentTimingReady
        ? "Timed transcript"
        : "Timing attention",
      ready: confidence.segmentTimingReady,
    },
    {
      label: confidence.wordEditingReady
        ? "Text editing ready"
        : "Word timing needed",
      ready: confidence.wordEditingReady,
    },
    {
      label: `${confidence.attributedSpeakerClusterCount}/${confidence.speakerClusterCount} speakers identified`,
      ready: confidence.speakerAttributionComplete,
    },
    {
      label: `${confidence.reviewedSegmentCount}/${confidence.segmentCount} segments reviewed`,
      ready: confidence.humanReviewComplete,
    },
  ];
  const healthy =
    confidence.state === "READY_TO_REVIEW" || confidence.state === "REVIEWED";
  return (
    <div
      className={`mt-4 rounded-xl border p-4 ${healthy ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}
      data-testid="transcript-confidence-summary"
    >
      <p className="text-sm font-black text-[#3d3122]">{confidence.label}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
        {confidence.detail}
      </p>
      <ul
        className="mt-3 flex flex-wrap gap-2"
        aria-label="Transcript readiness checks"
      >
        {checks.map((check) => (
          <li
            key={check.label}
            className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${check.ready ? "border-emerald-200 bg-white text-emerald-900" : "border-amber-200 bg-white text-amber-950"}`}
          >
            {check.ready ? "✓ " : ""}
            {check.label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-bold leading-5 text-[#3d3122]">
        {confidence.nextAction}
      </p>
      <details className="mt-3 border-t border-current/10 pt-3">
        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-[#765f40]">
          How Quipsly decides
        </summary>
        <p className="mt-2 text-[10px] font-semibold leading-4 text-[#765f40]">
          A completed provider job is not enough by itself. Quipsly separately
          checks exact recording bytes, usable timing, reviewed speaker
          identities, and playback-reviewed corrections. Provider confidence is
          never presented as measured accuracy.
        </p>
      </details>
    </div>
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type PacketSummary = NonNullable<
  NonNullable<SessionReviewPacket["packet"]>["summary"]
>;

function packetBrief(summary: PacketSummary) {
  const source = record(record(summary).source);
  const brief = record(source.packetBrief);
  if (brief.kind !== "quipsly-transcript-packet-brief-v1") return null;
  const overview = record(brief.overview);
  const sections = Array.isArray(brief.sections)
    ? brief.sections.map(record).map((section) => ({
        id: String(section.id || "section"),
        label: String(section.label || "Review candidates"),
        items: Array.isArray(section.items)
          ? section.items.map(record).flatMap((item) => {
              const segmentId = String(item.segmentId || "").trim();
              const text = String(item.text || "").trim();
              if (!segmentId || !text) return [];
              return [
                {
                  segmentId,
                  text,
                  timeLabel: String(item.timeLabel || ""),
                  speakerLabel: String(item.speakerLabel || ""),
                },
              ];
            })
          : [],
      }))
    : [];
  return {
    overview: {
      segmentCount: Number(overview.segmentCount) || 0,
      speakerCount: Number(overview.speakerCount) || 0,
      startSeconds: Number(overview.startSeconds) || 0,
      endSeconds: Number(overview.endSeconds) || 0,
    },
    sections,
    sourceTruth: String(
      brief.sourceTruth ||
        "Every item remains linked to transcript evidence; recording media remains source truth.",
    ),
    humanApprovalRequired: brief.humanApprovalRequired === true,
  };
}

function ReviewPacketSummary({ summary }: { summary: PacketSummary }) {
  const brief = packetBrief(summary);
  if (!brief)
    return (
      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[#765f40]">
        {summary.body}
      </p>
    );
  const populatedSections = brief.sections.filter(
    (section) => section.items.length > 0,
  );
  const emptySections = brief.sections.filter(
    (section) => section.items.length === 0,
  );
  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide text-[#5b472f]">
        <span className="rounded-full border border-[#d9c7a5] bg-[#fffaf0] px-3 py-1.5">
          {brief.overview.segmentCount} source segments
        </span>
        <span className="rounded-full border border-[#d9c7a5] bg-[#fffaf0] px-3 py-1.5">
          {brief.overview.speakerCount} provider speaker label
          {brief.overview.speakerCount === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-[#d9c7a5] bg-[#fffaf0] px-3 py-1.5">
          {timestampForSeconds(brief.overview.startSeconds)}–
          {timestampForSeconds(brief.overview.endSeconds)}
        </span>
        {brief.humanApprovalRequired && (
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-800">
            Extra suggestions available
          </span>
        )}
      </div>
      {populatedSections.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {populatedSections.map((section) => (
            <section
              key={section.id}
              className="rounded-xl border border-[#eadfc9] bg-[#fffdf8] p-4"
              aria-labelledby={`packet-section-${section.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  id={`packet-section-${section.id}`}
                  className="font-serif text-xl font-black text-[#3d3122]"
                >
                  {section.label}
                </h3>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#8a7354]">
                  {section.items.length}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {section.items.map((item) => (
                  <li key={`${section.id}-${item.segmentId}`}>
                    <a
                      href={`#transcript-segment-${encodeURIComponent(item.segmentId)}`}
                      className="block rounded-lg border border-sky-100 bg-white p-3 text-sm font-semibold text-[#5f4d37] transition hover:border-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                    >
                      <span className="block text-[10px] font-black uppercase tracking-wide text-sky-800">
                        {item.timeLabel || "Source timestamp"}
                        {item.speakerLabel ? ` · ${item.speakerLabel}` : ""}
                      </span>
                      <span className="mt-1 block leading-relaxed">
                        {item.text}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[#d8c7a7] bg-[#fffdf8] p-4 text-sm font-semibold text-[#765f40]">
          This packet contains no source-linked brief candidates. Quipsly
          created nothing to fill the space.
        </p>
      )}
      {emptySections.length ? (
        <details className="rounded-xl border border-[#eadfc9] bg-white p-4 text-sm text-[#765f40]">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">
            {emptySections.length}{" "}
            {emptySections.length === 1 ? "category has" : "categories have"} no
            candidates
          </summary>
          <p className="mt-3 font-semibold leading-relaxed">
            {emptySections.map((section) => section.label).join(" · ")}. These
            categories stay visible as taxonomy, not review work.
          </p>
        </details>
      ) : null}
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold leading-relaxed text-emerald-950">
        {brief.sourceTruth}
      </p>
      <details className="rounded-xl border border-[#eadfc9] bg-white p-4 text-sm text-[#765f40]">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">
          Inspect exact saved packet text
        </summary>
        <p className="mt-4 whitespace-pre-wrap font-semibold leading-relaxed">
          {summary.body}
        </p>
      </details>
    </div>
  );
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
  visibility?: "AUTHOR_PRIVATE" | "SESSION_SHARED";
  ownedByCurrentActor?: boolean;
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

function SessionContentReadinessCard({
  readiness,
}: {
  readiness: SessionContentReadiness;
}) {
  const ready = readiness.status === "substantial";
  return (
    <section
      className={`rounded-2xl border p-5 ${ready ? "border-emerald-200 bg-emerald-50/45" : "border-orange-200 bg-orange-50/55"}`}
      aria-labelledby="recording-content-readiness-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`rounded-xl bg-white p-2 ${ready ? "text-emerald-700" : "text-orange-700"}`}
          >
            <FileAudio aria-hidden="true" />
          </span>
          <div>
            <p
              className={`text-[10px] font-black uppercase tracking-[0.18em] ${ready ? "text-emerald-800" : "text-orange-800"}`}
            >
              Production content truth
            </p>
            <h2
              id="recording-content-readiness-heading"
              className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
            >
              {readiness.label}
            </h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">
              {readiness.detail}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(ready ? "READY" : "HELD")}`}
        >
          {humanize(readiness.status)}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/80 bg-white/80 p-3">
          <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
            Source media
          </dt>
          <dd className="mt-1 text-lg font-black text-[#3d3122]">
            {readiness.captureAssetCount}{" "}
            <span className="text-xs text-[#765f40]">
              · {readiness.verifiedCaptureCount} verified
            </span>
          </dd>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/80 p-3">
          <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
            Known duration
          </dt>
          <dd className="mt-1 text-lg font-black text-[#3d3122]">
            {durationLabel(readiness.knownDurationSeconds)}
          </dd>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/80 p-3">
          <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
            Longest take
          </dt>
          <dd className="mt-1 text-lg font-black text-[#3d3122]">
            {durationLabel(readiness.longestKnownDurationSeconds)}
          </dd>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/80 p-3">
          <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
            Simulator / short
          </dt>
          <dd className="mt-1 text-lg font-black text-[#3d3122]">
            {readiness.simulatorCaptureCount} / {readiness.shortCaptureCount}
          </dd>
        </div>
      </dl>
      <p
        className={`mt-4 rounded-xl border bg-white px-4 py-3 text-xs font-black leading-5 ${ready ? "border-emerald-200 text-emerald-900" : "border-orange-200 text-orange-950"}`}
      >
        Next: {readiness.nextAction}
      </p>
    </section>
  );
}

function sessionTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : null;
}

function localDateTimeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function defaultSessionWindow() {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15);
  return {
    scheduledStart: localDateTimeValue(start.toISOString()),
    scheduledEnd: localDateTimeValue(
      new Date(start.getTime() + 50 * 60_000).toISOString(),
    ),
  };
}

function scheduleRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (part) => {
    const random = Math.floor(Math.random() * 16);
    return (part === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function SessionScheduleControl({
  roomId,
  preparation,
}: {
  roomId: string;
  preparation: SessionPreparation;
}) {
  const router = useRouter();
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    scheduledStart: localDateTimeValue(preparation.scheduledStart),
    scheduledEnd: localDateTimeValue(preparation.scheduledEnd),
  });

  useEffect(() => {
    setDraft({
      scheduledStart: localDateTimeValue(preparation.scheduledStart),
      scheduledEnd: localDateTimeValue(preparation.scheduledEnd),
    });
    setClientRequestId(null);
  }, [
    preparation.scheduledEnd,
    preparation.scheduledStart,
    preparation.updatedAt,
    roomId,
  ]);

  if (!preparation.canSchedule) return null;

  function open() {
    if (!preparation.scheduledStart || !preparation.scheduledEnd)
      setDraft(defaultSessionWindow());
    setMessage(null);
    setError(null);
    setIsOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const start = new Date(draft.scheduledStart);
    const end = new Date(draft.scheduledEnd);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start
    ) {
      setError("Choose an end time after the start time.");
      return;
    }
    if (!preparation.updatedAt) {
      setError("Refresh this Session before changing its time.");
      return;
    }

    const requestId = clientRequestId || scheduleRequestId();
    setClientRequestId(requestId);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/sessions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId: roomId,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
          timezone,
          expectedUpdatedAt: preparation.updatedAt,
          clientRequestId: requestId,
          reason: "Scheduled from the exact Quipsly Session workspace.",
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !body.ok)
        throw new Error(
          body.error || `Scheduling returned HTTP ${response.status}.`,
        );
      setMessage("Session time saved.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Session time could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-4 rounded-2xl border border-sky-200 bg-white/80 p-3 sm:p-4"
      aria-labelledby="session-time-editor-heading"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3
            id="session-time-editor-heading"
            className="font-black text-[#3d3122]"
          >
            Session time
          </h3>
        </div>
        <button
          type="button"
          onClick={open}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-950 hover:bg-sky-50"
        >
          {preparation.scheduledStart
            ? "Change time"
            : "Choose time"}
        </button>
      </div>
      {isOpen ? (
        <form
          onSubmit={save}
          className="mt-4 grid gap-4 border-t border-sky-100 pt-4 md:grid-cols-2"
        >
          <label className="text-sm font-black text-[#3d3122]">
            Session starts
            <input
              type="datetime-local"
              required
              value={draft.scheduledStart}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  scheduledStart: event.target.value,
                }));
                setClientRequestId(null);
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 font-semibold"
            />
          </label>
          <label className="text-sm font-black text-[#3d3122]">
            Session ends
            <input
              type="datetime-local"
              required
              value={draft.scheduledEnd}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  scheduledEnd: event.target.value,
                }));
                setClientRequestId(null);
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 font-semibold"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-sky-800 px-5 py-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save time"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-950"
            >
              Cancel
            </button>
            <p className="text-xs font-bold text-sky-950">
              Shown in {timezone} on this device.
            </p>
          </div>
          {message ? (
            <p
              role="status"
              className="text-sm font-bold text-emerald-800 md:col-span-2"
            >
              {message}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="text-sm font-bold text-rose-800 md:col-span-2"
            >
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function SessionConsentControl({
  roomId,
  preparation,
}: {
  roomId: string;
  preparation: SessionPreparation;
}) {
  const router = useRouter();
  const actor =
    preparation.participants.find(
      (participant) => participant.isCurrentActor,
    ) ?? null;
  const consent = actor?.consent ?? null;
  const requestedConsent = consent?.status === "REQUESTED";
  const defaultVideoConsent = sessionExperienceForPurpose(
    preparation.purpose,
  ).defaultCamera;
  const closed =
    preparation.status === "CANCELED" || preparation.status === "ENDED";
  const [canRecordAudio, setCanRecordAudio] = useState(
    requestedConsent ? true : (consent?.canRecordAudio ?? true),
  );
  const [canRecordVideo, setCanRecordVideo] = useState(
    requestedConsent || !consent ? defaultVideoConsent : consent.canRecordVideo,
  );
  const [canTranscribe, setCanTranscribe] = useState(
    requestedConsent ? true : (consent?.canTranscribe ?? true),
  );
  const [isEditingConsent, setIsEditingConsent] = useState(
    consent?.recordingReady !== true,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCanRecordAudio(
      requestedConsent ? true : (consent?.canRecordAudio ?? true),
    );
    setCanRecordVideo(
      requestedConsent || !consent
        ? defaultVideoConsent
        : consent.canRecordVideo,
    );
    setCanTranscribe(
      requestedConsent ? true : (consent?.canTranscribe ?? true),
    );
    setIsEditingConsent(consent?.recordingReady !== true);
  }, [
    actor?.id,
    consent?.status,
    consent?.canRecordAudio,
    consent?.canRecordVideo,
    consent?.canTranscribe,
    consent?.updatedAt,
    defaultVideoConsent,
  ]);

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [actor?.id, roomId]);

  async function saveConsent(consentAction: "GRANT" | "DECLINE" | "REVOKE") {
    if (!actor || busy || closed) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callRoomId: roomId,
          participantId: actor.id,
          consentAction,
          ...(consentAction === "GRANT"
            ? {
                consentPolicyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
                consentText: MOBILE_CAPTURE_CONSENT_TEXT,
                consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
                canRecordAudio,
                canRecordVideo,
                canTranscribe,
                allAudibleParticipantsNotifiedAndAgreed: true,
                presentationEvidence: {
                  version: 1,
                  surface: "quipsly-session-workspace-consent-v1",
                  presentedAt: new Date().toISOString(),
                  recordingChoicePresented: true,
                  transcriptionChoicePresented: true,
                  audibleParticipantAttestationPresented: true,
                },
              }
            : {}),
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        session?: { nextAction?: string };
      };
      if (!response.ok || !body.ok) {
        throw new Error(
          body.error || `Consent update returned HTTP ${response.status}.`,
        );
      }
      setMessage(
        body.session?.nextAction ||
          "Your consent choice is saved. Quipsly is refreshing the exact Session evidence.",
      );
      if (consentAction === "GRANT") setIsEditingConsent(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your consent choice could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  const grantDisabled =
    busy || closed || !actor || (!canRecordAudio && !canRecordVideo);

  return (
    <section
      className={`mt-4 rounded-2xl border ${consent?.recordingReady && !isEditingConsent ? "p-3 sm:p-4" : "p-4 sm:p-5"} ${consent?.recordingReady ? "border-emerald-200 bg-emerald-50/55" : "border-amber-200 bg-amber-50/55"}`}
      aria-labelledby="my-session-consent-heading"
      data-testid="session-consent-control"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">
            Recording
          </p>
          <h3
            id="my-session-consent-heading"
            className="mt-1 text-xl font-black text-[#3d3122]"
          >
            {consent?.recordingReady
              ? "Recording ready"
              : "Allow recording for this session?"}
          </h3>
          {!consent?.recordingReady || isEditingConsent ? (
            <p className="mt-2 text-sm font-semibold leading-6 text-[#6b5538]">
              Agree to this device&apos;s selected audio, video, and transcript
              options. You can still join the call without being recorded.
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(consent?.recordingReady ? "READY" : "HELD")}`}
        >
          {consent?.recordingReady ? "Saved" : "Action needed"}
        </span>
      </div>

      {!actor ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-white p-4 text-sm font-black leading-6 text-amber-950">
          Your signed-in account is not attached as a participant in this
          Session. Accept the invitation or ask an owner to add the exact
          account before granting consent.
        </div>
      ) : consent?.recordingReady && !isEditingConsent ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black text-emerald-900">
          <div className="flex flex-wrap gap-2">
            {consent.canRecordAudio ? (
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5">
                Audio
              </span>
            ) : null}
            {consent.canRecordVideo ? (
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5">
                Video
              </span>
            ) : null}
            {consent.canTranscribe ? (
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5">
                Transcript
              </span>
            ) : null}
          </div>
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setIsEditingConsent(true)}
              disabled={busy || closed}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black text-emerald-900 disabled:opacity-45"
            >
              Options
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950">
            <div>
              <p className="text-sm font-black">
                {canRecordVideo ? "Camera and audio" : "Audio"} on this device ·{" "}
                {canTranscribe ? "Transcript on" : "Transcript off"}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5">
                Continue only after everyone who may be heard or seen has
                agreed. Recording starts separately.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void saveConsent("GRANT")}
              disabled={grantDisabled}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy
                ? "Saving…"
                : consent?.status === "GRANTED"
                  ? "Save changes"
                  : "Agree and continue"}
            </button>
          </div>

          <details className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">
              Recording options
            </summary>
            <div className="mt-3 grid gap-3 text-sm font-bold text-[#3d3122] md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl border border-amber-100 bg-[#fffaf0] p-3">
                <input
                  type="checkbox"
                  checked={canRecordAudio}
                  onChange={(event) => setCanRecordAudio(event.target.checked)}
                  disabled={busy || closed}
                  className="mt-1"
                />
                Record audio from this device
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-amber-100 bg-[#fffaf0] p-3">
                <input
                  type="checkbox"
                  checked={canRecordVideo}
                  onChange={(event) => setCanRecordVideo(event.target.checked)}
                  disabled={busy || closed}
                  className="mt-1"
                />
                Record camera video from this device
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-amber-100 bg-[#fffaf0] p-3">
                <input
                  type="checkbox"
                  checked={canTranscribe}
                  onChange={(event) => setCanTranscribe(event.target.checked)}
                  disabled={busy || closed}
                  className="mt-1"
                />
                Create a transcript and suggested notes/tasks
              </label>
            </div>
            <details className="mt-3 text-xs font-semibold leading-5 text-[#765f40]">
              <summary className="cursor-pointer font-black">
                Recording and privacy details
              </summary>
              <p className="mt-2">{MOBILE_CAPTURE_CONSENT_TEXT}</p>
            </details>
          </details>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {consent?.recordingReady ? (
              <button
                type="button"
                onClick={() => setIsEditingConsent(false)}
                disabled={busy || closed}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 disabled:opacity-45"
              >
                Cancel
              </button>
            ) : consent?.status === "GRANTED" ? (
              <button
                type="button"
                onClick={() => void saveConsent("REVOKE")}
                disabled={busy || closed}
                className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-800 disabled:opacity-45"
              >
                Revoke
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void saveConsent("DECLINE")}
                disabled={busy || closed || consent?.status === "DECLINED"}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-900 disabled:opacity-45"
              >
                Don’t record me
              </button>
            )}
          </div>
        </>
      )}

      {!consent?.recordingReady || isEditingConsent ? (
        <p className="mt-4 text-xs font-bold leading-5 text-[#765f40]">
          Your choice is saved for this Session and can be changed here later.
        </p>
      ) : null}
      {closed ? (
        <p className="mt-3 text-xs font-black uppercase tracking-wide text-rose-800">
          This Session is closed, so consent changes are paused.
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-900"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-900"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function SessionPreparationCard({
  roomId,
  preparation,
}: {
  roomId: string;
  preparation: SessionPreparation;
}) {
  const scheduledStart = sessionTime(preparation.scheduledStart);
  const scheduledEnd = sessionTime(preparation.scheduledEnd);
  const scheduledLabel = scheduledStart
    ? `${scheduledStart}${scheduledEnd ? ` – ${scheduledEnd}` : ""}`
    : "No Quipsly schedule time";
  const audioReady =
    preparation.participants.length > 0 && preparation.allAudioReady;
  const currentActor =
    preparation.participants.find(
      (participant) => participant.isCurrentActor,
    ) ?? null;
  const requiredParticipantCount =
    preparation.purpose.toUpperCase() === "COACHING" ? 2 : 1;
  const entry =
    preparation.entryReadiness ??
    buildQuipslySessionEntryReadiness({
      roomStatus: preparation.status,
      purpose: preparation.purpose,
      actorAttached: Boolean(currentActor),
      actorAudioConsentGranted: currentActor?.consent?.recordingReady === true,
      actorVideoConsentGranted: currentActor?.consent?.canRecordVideo === true,
      actorTranscriptionConsentGranted:
        currentActor?.consent?.transcriptionReady === true,
      participantCount: preparation.participants.length,
      requiredParticipantCount,
      audioConsentGrantedParticipantCount: preparation.participants.filter(
        (participant) => participant.consent?.recordingReady,
      ).length,
      videoConsentGrantedParticipantCount: preparation.participants.filter(
        (participant) => participant.consent?.canRecordVideo,
      ).length,
      transcriptionConsentGrantedParticipantCount:
        preparation.participants.filter(
          (participant) => participant.consent?.transcriptionReady,
        ).length,
      allParticipantAudioConsentGranted:
        preparation.participants.length >= requiredParticipantCount &&
        preparation.allAudioReady,
      allParticipantVideoConsentGranted:
        preparation.participants.length >= requiredParticipantCount &&
        preparation.participants.every(
          (participant) => participant.consent?.canRecordVideo === true,
        ),
      allParticipantTranscriptionConsentGranted:
        preparation.participants.length >= requiredParticipantCount &&
        preparation.allTranscriptionReady,
      providerCanJoin: preparation.providerCanJoin,
      providerReadiness: preparation.providerReadiness,
      localCaptureAvailable: true,
      paymentBlocked: false,
    });

  return (
    <section
      className="rounded-2xl border border-sky-200 bg-sky-50/45 p-4 sm:p-5"
      aria-labelledby="session-preparation-heading"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white p-2 text-sky-700">
          <ClipboardList aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">
            Session setup
          </p>
          <h2
            id="session-preparation-heading"
            className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
          >
            {scheduledStart ? "Your session is scheduled" : "Choose a time and invite your client"}
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#765f40]">
            {scheduledLabel}
          </p>
        </div>
      </div>

      <SessionEntryReadinessLive roomId={roomId} initial={entry} />

      <SessionScheduleControl roomId={roomId} preparation={preparation} />

      <SessionConsentControl roomId={roomId} preparation={preparation} />

      <details className="mt-4 rounded-xl border border-sky-200 bg-white/80 p-3">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-sky-950">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden="true" />
            People and recording choices
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${statusTone(audioReady ? "READY" : "HELD")}`}>
            {audioReady ? "Ready" : "Waiting"}
          </span>
        </summary>
        {preparation.participants.length ? (
          <ul className="mt-3 grid gap-2 border-t border-sky-100 pt-3 lg:grid-cols-2">
            {preparation.participants.map((participant) => {
              const consent = participant.consent;
              const recordingReady = consent?.recordingReady === true;
              return (
                <li key={participant.id} className="rounded-xl border border-sky-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#3d3122]">{participant.label}</p>
                      <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{humanize(participant.role)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${statusTone(recordingReady ? "READY" : "HELD")}`}>
                      {recordingReady ? "Ready" : "Waiting"}
                    </span>
                  </div>
                  {recordingReady ? (
                    <p className="mt-2 text-xs font-semibold text-[#765f40]">
                      {[consent?.canRecordAudio ? "Audio" : null, consent?.canRecordVideo ? "Video" : null, consent?.canTranscribe ? "Transcript" : null].filter(Boolean).join(" · ")}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-[#765f40]">They can choose their recording options when they open the session.</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 border-t border-sky-100 pt-3 text-xs font-semibold text-[#765f40]">
            Invite your client below. They can choose their recording options when they open the session.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-sky-100 pt-3">
          <Link href="/schedule" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-950">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Calendar
          </Link>
          <Link href="/coaching/sessions" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-950">
            <Users className="h-4 w-4" aria-hidden="true" /> All sessions
          </Link>
        </div>
      </details>
    </section>
  );
}

function SessionCaptureReceiptCard({
  receipts,
}: {
  receipts: SessionCaptureReceipts;
}) {
  const visibleCaptures = receipts.captures.slice(0, 4);
  const olderCaptures = receipts.captures.slice(4);
  const receiptArticle = (
    capture: SessionCaptureReceipts["captures"][number],
  ) => {
    const complete = capture.status === "START_AND_STOP_RECEIVED";
    return (
      <article
        key={capture.captureId}
        className="rounded-xl border border-amber-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
              Local source ID
            </p>
            <p className="mt-1 break-all font-mono text-xs font-black text-[#3d3122]">
              {capture.captureId}
            </p>
          </div>
          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusTone(complete ? "COMPLETED" : "HELD")}`}
          >
            {complete ? "Start + stop received" : humanize(capture.status)}
          </span>
        </div>
        <p className="mt-3 text-xs font-bold leading-5 text-[#765f40]">
          {complete
            ? "The take closed cleanly in Nest; its immutable audio source remains on the iPhone until upload succeeds."
            : "This receipt trail is incomplete. Reopen Capture so local recovery can reconcile the take before relying on it."}
        </p>
        <dl className="mt-3 grid gap-2 text-[10px] font-bold text-[#8a7354]">
          <div>
            <dt className="inline font-black">Started </dt>
            <dd className="inline">
              {capture.startedAt
                ? new Date(capture.startedAt).toLocaleString()
                : "not received"}
            </dd>
            {capture.startReceiptId ? (
              <dd className="mt-0.5 break-all font-mono text-[9px]">
                {capture.startReceiptId}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="inline font-black">Stopped </dt>
            <dd className="inline">
              {capture.stoppedAt
                ? new Date(capture.stoppedAt).toLocaleString()
                : "not received"}
            </dd>
            {capture.stopReceiptId ? (
              <dd className="mt-0.5 break-all font-mono text-[9px]">
                {capture.stopReceiptId}
              </dd>
            ) : null}
          </div>
        </dl>
      </article>
    );
  };
  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50/45 p-5"
      aria-labelledby="capture-receipt-heading"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white p-2 text-amber-700">
          <FileAudio aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">
            iPhone capture boundary
          </p>
          <h2
            id="capture-receipt-heading"
            className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
          >
            {receipts.captures.length} phone capture receipt trail
            {receipts.captures.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
            START/STOP receipts prove the local capture boundary reached Nest.
            They do not claim the audio uploaded: a verified RecordingAsset
            appears separately after its bytes arrive.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {visibleCaptures.map(receiptArticle)}
        {receipts.captures.length === 0 && (
          <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 p-4 text-xs font-bold text-amber-900">
            No phone capture boundary receipts exist for this Session. Quipsly
            does not infer a recording from consent alone.
          </div>
        )}
      </div>
      {olderCaptures.length > 0 && (
        <details className="mt-4 rounded-xl border border-amber-200 bg-white/75 p-3">
          <summary className="cursor-pointer text-xs font-black text-amber-950">
            Show {olderCaptures.length} older receipt trail
            {olderCaptures.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {olderCaptures.map(receiptArticle)}
          </div>
        </details>
      )}
    </section>
  );
}

function HeldSourceReleaseControl({
  source,
}: {
  source: SessionSourceEvidence["sources"][number];
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const release = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (!source.uploadSessionId) {
      setNotice({
        tone: "error",
        message: "This source has no immutable upload-session binding.",
      });
      return;
    }
    if (reason.trim().length < 20 || !confirmed) return;
    setBusy(true);
    try {
      const response = await fetch(
        "/api/mobile/capture/uploads/resumable/release",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadSessionId: source.uploadSessionId,
            reason: reason.trim(),
          }),
        },
      );
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        processingDisposition?: string;
        transcriptDisposition?: string;
      };
      if (!response.ok || !body.ok) {
        throw new Error(
          body.error || "Quipsly could not release this held source.",
        );
      }
      setNotice({
        tone: "success",
        message: `${humanize(body.processingDisposition)} processing · ${humanize(body.transcriptDisposition)} transcript. Nest saved the audited staff decision and is refreshing source evidence.`,
      });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Quipsly could not release this held source.",
      });
    } finally {
      setBusy(false);
    }
  };

  const reasonId = `release-reason-${source.recordingAssetId}`;
  const confirmationId = `release-confirmation-${source.recordingAssetId}`;
  return (
    <form
      onSubmit={release}
      className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-800">
        Staff release review
      </p>
      <h4 className="mt-1 font-serif text-lg font-black text-violet-950">
        Release these exact verified bytes
      </h4>
      <p className="mt-2 text-xs font-semibold leading-5 text-violet-900">
        This is an exceptional external-import boundary. It does not invent
        phone START/STOP receipts. Media can proceed only after this audited
        decision; transcript release still requires current transcription
        consent from every signed-in participant.
      </p>
      <label
        htmlFor={reasonId}
        className="mt-4 block text-xs font-black text-violet-950"
      >
        Why is this exact source safe to release?
      </label>
      <textarea
        id={reasonId}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Record the source review, all-party consent, and intended session use."
        className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
      />
      <p className="mt-1 text-[10px] font-bold text-violet-800">
        {reason.trim().length}/20 minimum characters
      </p>
      <label
        htmlFor={confirmationId}
        className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-white p-3 text-xs font-bold leading-5 text-violet-950"
      >
        <input
          id={confirmationId}
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 h-4 w-4 accent-violet-700"
        />
        <span>
          I reviewed this exact source ledger and the current all-party
          recording consent.
        </span>
      </label>
      <button
        type="submit"
        disabled={busy || !confirmed || reason.trim().length < 20}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-violet-800 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? (
          <>
            <LoaderCircle
              className="mr-2 h-4 w-4 animate-spin"
              aria-hidden="true"
            />
            Rechecking immutable source…
          </>
        ) : (
          "Release exact source"
        )}
      </button>
      {notice ? (
        <p
          role="status"
          className={`mt-3 rounded-lg border p-3 text-xs font-black leading-5 ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}
        >
          {notice.message}
        </p>
      ) : null}
    </form>
  );
}

function SessionSourceEvidenceCard({
  roomId,
  evidence,
  canReleaseHeldMedia,
}: {
  roomId: string;
  evidence: SessionSourceEvidence;
  canReleaseHeldMedia: boolean;
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
    const audio = source.captureRuntime.audioFormat ?? {
      container: null,
      codec: null,
      sampleRateHz: null,
      channelCount: null,
      hardwareSampleRateHz: null,
      hardwareInputChannelCount: null,
      decodedAudioTrackCount: null,
      decodedSampleRateHz: null,
      decodedChannelCount: null,
      capturePipeline: null,
      pauseTimelinePolicy: null,
      signal: null,
    };
    const analyzedMedia = source.analysis?.completeDecode
      ? source.analysis.media
      : null;
    const visibleSignal = source.analysis?.completeDecode
      ? source.analysis.signal
      : audio.signal;
    const signalObservations = visibleSignal?.observations ?? [];
    const signalObservationCount = signalObservations.length;
    const transcriptReviewHref = `/sessions/${encodeURIComponent(roomId)}?mode=transcript&source=${encodeURIComponent(source.recordingAssetId)}#transcript-audio-review`;
    const waveform = visibleSignal?.waveform ?? [];
    const compactWaveform = waveform.length <= 96
      ? waveform
      : Array.from({ length: 96 }, (_, index) => {
          const startIndex = Math.floor((index * waveform.length) / 96);
          const endIndex = Math.max(startIndex + 1, Math.floor(((index + 1) * waveform.length) / 96));
          return waveform
            .slice(startIndex, endIndex)
            .reduce((loudest, point) => point.samplePeakDbfs > loudest.samplePeakDbfs ? point : loudest);
        });
    const waveformHeight = (dbfs: number) =>
      Math.max(4, Math.min(100, ((Math.max(-72, Math.min(0, dbfs)) + 72) / 72) * 100));
    const waveformDuration = Math.max(
      visibleSignal?.durationSeconds ?? 0,
      ...waveform.map((point) => point.startSeconds + point.durationSeconds),
    );
    const recordingSafetyLabel = verified
      ? "Safely stored"
      : drift
        ? "Needs attention"
        : "Still processing";
    const audioHealthLabel = !visibleSignal
      ? "Audio analysis pending"
      : visibleSignal.status === "signal-present" &&
          signalObservationCount === 0
        ? "Audio looks clear"
        : visibleSignal.status === "near-digital-silence"
          ? "Audio may be too quiet"
          : signalObservationCount > 0
            ? `${signalObservationCount} ${signalObservationCount === 1 ? "moment" : "moments"} worth checking`
            : "Audio needs a quick check";
    const audioSampleRate =
      analyzedMedia?.sampleRateHz ??
      audio.decodedSampleRateHz ??
      audio.sampleRateHz;
    const audioChannels =
      analyzedMedia?.channelCount ??
      audio.decodedChannelCount ??
      audio.channelCount;
    const audioFormatLabel =
      [
        (analyzedMedia?.codec ?? audio.codec)?.toUpperCase(),
        (analyzedMedia?.container ?? audio.container)?.toUpperCase(),
        audioSampleRate ? `${Math.round(audioSampleRate)} Hz` : null,
        audioChannels ? `${audioChannels} ch` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Audio format not preserved";
    const video = source.captureRuntime.videoFormat;
    const configuredVideoLabel = video
      ? [
          video.configured.widthPixels && video.configured.heightPixels
            ? `${video.configured.widthPixels}×${video.configured.heightPixels}`
            : null,
          video.configured.frameRate
            ? `${video.configured.frameRate} fps`
            : null,
          video.configured.codec?.toUpperCase(),
          video.configured.colorSpace,
        ]
          .filter(Boolean)
          .join(" · ") || "Configured format not preserved"
      : null;
    const recordedVideoLabel = video
      ? [
          video.recorded.presentationWidthPixels &&
          video.recorded.presentationHeightPixels
            ? `${video.recorded.presentationWidthPixels}×${video.recorded.presentationHeightPixels}`
            : null,
          video.recorded.frameRate ? `${video.recorded.frameRate} fps` : null,
          video.recorded.codec?.toUpperCase(),
          video.recorded.videoTrackCount !== null
            ? `${video.recorded.videoTrackCount} video track${video.recorded.videoTrackCount === 1 ? "" : "s"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Decoded movie evidence not preserved"
      : null;
    return (
      <article
        key={source.recordingAssetId}
        className={`min-w-0 overflow-hidden rounded-xl border bg-white p-4 ${drift ? "border-rose-300" : verified ? "border-emerald-200" : "border-amber-200"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
              {humanize(source.kind)} · {humanize(source.recordingStatus)}
            </p>
            <h3 className="mt-1 break-words font-black text-[#3d3122]">
              {source.fileName}
            </h3>
            <p className="mt-1 break-all font-mono text-[10px] font-bold text-[#765f40]">
              Asset {source.recordingAssetId}
            </p>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(tone)}`}
          >
            {humanize(source.status)}
          </span>
        </div>

        <div
          className={`mt-4 rounded-xl border p-4 ${verified ? "border-emerald-200 bg-emerald-50" : drift ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}
        >
          <p className="font-black text-[#3d3122]">{recordingSafetyLabel}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-[#765f40]">
            {verified
              ? "Quipsly matched this recording to the copy in private storage."
              : drift
                ? "Quipsly found a mismatch that should be resolved before editing or sharing."
                : "Quipsly is still confirming this recording and its private copy."}
          </p>
          <p
            className={`mt-2 text-xs font-black ${visibleSignal?.status === "signal-present" && signalObservationCount === 0 ? "text-emerald-800" : visibleSignal ? "text-amber-900" : "text-sky-800"}`}
          >
            {audioHealthLabel}
          </p>
          {compactWaveform.length > 0 ? (
            <div className="mt-3 rounded-lg border border-sky-200 bg-slate-950 p-3">
              <div
                className="relative flex h-16 items-end gap-px overflow-hidden rounded bg-slate-900 px-1 pt-2"
                role="img"
                aria-label={`Decoded waveform overview for ${source.fileName}${signalObservationCount > 0 ? ` with ${signalObservationCount} flagged ${signalObservationCount === 1 ? "moment" : "moments"}` : ""}`}
              >
                {compactWaveform.map((point, index) => (
                  <span
                    key={`${point.startSeconds}-${index}`}
                    className={`min-w-px flex-1 rounded-t-sm ${point.clippedFrameCount > 0 ? "bg-rose-300" : "bg-cyan-300/80"}`}
                    style={{ height: `${waveformHeight(point.rmsDbfs)}%` }}
                    aria-hidden="true"
                  />
                ))}
                {waveformDuration > 0
                  ? signalObservations.map((observation, index) => (
                      <span
                        key={`${observation.kind}-${observation.startSeconds}-${index}`}
                        className="absolute inset-y-0 w-0.5 bg-amber-300"
                        style={{ left: `${Math.max(0, Math.min(100, (observation.startSeconds / waveformDuration) * 100))}%` }}
                        aria-hidden="true"
                      />
                    ))
                  : null}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[9px] font-bold text-slate-300">
                <span>0:00</span>
                <span>{timestampForSeconds(waveformDuration)}</span>
              </div>
              {signalObservationCount > 0 ? (
                <p className="mt-2 text-[10px] font-bold leading-4 text-amber-100">
                  Flagged at {signalObservations.map((observation) => timestampForSeconds(observation.startSeconds)).join(", ")}. These are measured pointers for listening, not automatic quality judgments.
                </p>
              ) : (
                <p className="mt-2 text-[10px] font-bold leading-4 text-cyan-100">
                  Complete-source decoded overview. No configured threshold flagged a range; listening remains the quality check.
                </p>
              )}
            </div>
          ) : null}
          {signalObservationCount > 0 ? (
            <Link
              href={transcriptReviewHref}
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-950"
            >
              {signalObservationCount === 1
                ? "Check this audio moment"
                : `Check ${signalObservationCount} audio moments`}
            </Link>
          ) : compactWaveform.length > 0 ? (
            <Link
              href={transcriptReviewHref}
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-950"
            >
              Open this source in Transcript
            </Link>
          ) : null}
        </div>

        {verified && source.audioMastery ? (
          <SessionAudioMasteryCard coordinates={source.audioMastery} />
        ) : null}

        <details className="mt-3 rounded-lg border border-[#eadfc9] bg-[#fffdf8] p-3">
          <summary className="cursor-pointer text-xs font-black text-[#5b472f]">
            Technical recording details
          </summary>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-[#eadfc9] bg-[#fffdf8] p-3">
              <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
                Capture runtime
              </dt>
              <dd className="mt-1 text-xs font-black text-[#3d3122]">
                {appLabel}
              </dd>
              <dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">
                {[
                  source.captureRuntime.deviceModel,
                  source.captureRuntime.operatingSystem,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Device/OS not preserved"}
              </dd>
              <dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">
                {source.captureRuntime.audioRoute || "No captured audio route"}
                {source.captureRuntime.audioInputDataSource
                  ? ` · ${source.captureRuntime.audioInputDataSource}`
                  : ""}
              </dd>
              <dd className="mt-1 text-[10px] font-black leading-4 text-sky-800">
                {audioFormatLabel}
              </dd>
            </div>
            <div className="rounded-lg border border-[#eadfc9] bg-[#fffdf8] p-3">
              <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
                Cloud copy
              </dt>
              <dd className="mt-1 text-xs font-black text-[#3d3122]">
                {byteSizeLabel(source.cloud.byteSize)} · generation{" "}
                {source.cloud.generation || "absent"}
              </dd>
              <dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">
                {source.cloud.verifiedAt
                  ? `Verified ${new Date(source.cloud.verifiedAt).toLocaleString()}`
                  : "No server verification time"}
              </dd>
            </div>
            {source.analysis ? (
              <div
                className={`rounded-lg border p-3 sm:col-span-2 ${source.analysis.status === "failed" ? "border-rose-200 bg-rose-50" : source.analysis.completeDecode ? "border-sky-200 bg-sky-50" : "border-amber-200 bg-amber-50"}`}
              >
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
                  Derived complete-decode evidence
                </dt>
                <dd className="mt-1 text-xs font-black text-[#3d3122]">
                  {humanize(source.analysis.status)} ·{" "}
                  {source.analysis.exactSourceBound
                    ? "exact SHA-256 and byte count bound"
                    : "source binding failed"}
                </dd>
                <dd className="mt-1 break-all font-mono text-[10px] font-semibold leading-4 text-[#765f40]">
                  Job {source.analysis.jobId}
                </dd>
                <dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">
                  {source.analysis.completeDecode && source.analysis.media
                    ? `${source.analysis.media.durationSeconds.toFixed(2)} sec · ${source.analysis.media.sampleRateHz} Hz · ${source.analysis.media.channelCount} ch`
                    : source.analysis.error || "Result is not complete yet."}
                </dd>
                <dd className="mt-2 text-[10px] font-black uppercase tracking-wide text-sky-800">
                  Read-only projection · capture manifest unchanged · replica
                  generations stay distinct
                </dd>
              </div>
            ) : null}
            {video ? (
              <div className="rounded-lg border border-violet-200 bg-violet-50/55 p-3 sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-wide text-violet-800">
                  Video source truth
                </dt>
                <dd className="mt-1 text-xs font-black text-[#3d3122]">
                  Requested {videoQualityLabel(video.requestedQuality)} ·{" "}
                  {video.intentFulfilled === true
                    ? "resolved exactly"
                    : video.intentFulfilled === false
                      ? "intent not fulfilled"
                      : "fulfillment not preserved"}
                </dd>
                <dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">
                  Configured {configuredVideoLabel}
                </dd>
                <dd className="mt-1 text-[10px] font-semibold leading-4 text-[#765f40]">
                  Recorded {recordedVideoLabel}
                </dd>
                <dd className="mt-1 text-[10px] font-black leading-4 text-violet-800">
                  {humanize(video.configured.cameraPosition)} camera ·{" "}
                  {humanize(video.configured.orientation)} · pressure at Start{" "}
                  {humanize(video.systemPressureAtStart)}
                </dd>
                <dd className="mt-2 text-[10px] font-semibold leading-4 text-violet-900">
                  Requested and configured settings are capture evidence.
                  Recorded values come from complete movie decoding; neither
                  edits the immutable source.
                </dd>
              </div>
            ) : null}
          </dl>

          {visibleSignal ? (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs font-bold leading-5 text-sky-950">
              <p className="font-black uppercase tracking-wide">
                Complete decoded signal scan · {humanize(visibleSignal.status)}
              </p>
              <p className="mt-1">
                {visibleSignal.loudness?.integratedLoudnessLufs !== null
                  && visibleSignal.loudness?.integratedLoudnessLufs !== undefined
                  ? <>programme loudness {visibleSignal.loudness.integratedLoudnessLufs.toFixed(1)} LUFS · loudest 400 ms {visibleSignal.loudness.maximumMomentaryLoudnessLufs?.toFixed(1) ?? "—"} LUFS · </>
                  : <>RMS {visibleSignal.rmsDbfs.toFixed(1)} dBFS · </>}
                sample peak{" "}
                {visibleSignal.samplePeakDbfs.toFixed(1)} dBFS ·{" "}
                {visibleSignal.clippedFrameCount.toLocaleString()} clipped
                frames ·{" "}
                {(visibleSignal.nearSilentFrameFraction * 100).toFixed(1)}%
                near-silent frames
              </p>
              <p className="mt-1 text-[10px] text-sky-800">
                {visibleSignal.loudness?.integratedLoudnessLufs !== null
                  && visibleSignal.loudness?.integratedLoudnessLufs !== undefined
                  ? "Programme loudness is measured over the complete decoded source using ITU-R BS.1770-5; sample peak is not true peak. "
                  : "RMS is not LUFS. "}
                {visibleSignal.observations.length} exact-time
                signal observation
                {visibleSignal.observations.length === 1 ? "" : "s"} require
                {visibleSignal.observations.length === 1 ? "s" : ""} listening
                in Transcript review.
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-sky-200 bg-white p-3 text-xs font-bold leading-5 text-sky-950">
              No complete decoded signal scan is attached to this source. Nest
              does not infer audio health from transcript confidence.
            </p>
          )}

          <div className="mt-3 grid gap-2 text-[10px] font-bold text-[#765f40] sm:grid-cols-2">
            <div>
              <p className="font-black uppercase tracking-wide text-[#8a7354]">
                Capture / group
              </p>
              <p className="mt-1 break-all font-mono">
                {source.captureId || "Capture ID absent"}
              </p>
              <p className="mt-1 break-all font-mono">
                {source.captureGroupId || "Group ID absent"}
              </p>
            </div>
            <div>
              <p className="font-black uppercase tracking-wide text-[#8a7354]">
                Server boundaries
              </p>
              <p className="mt-1 break-all font-mono">
                START {source.startBoundary?.receiptId || "absent"}
              </p>
              <p className="mt-1 break-all font-mono">
                STOP {source.stopBoundary?.receiptId || "absent"}
              </p>
            </div>
          </div>
        </details>

        {source.boundaryAuthority === "STAFF_REVIEWED_EXTERNAL_IMPORT" &&
        source.releaseAudit ? (
          <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs font-bold leading-5 text-violet-950">
            <p className="font-black">Audited external-import boundary</p>
            <p className="mt-1">
              No phone START/STOP receipts exist. Staff accepted the exact
              verified source after all-party consent review on{" "}
              {new Date(source.releaseAudit.releasedAt).toLocaleString()}.
            </p>
            <p className="mt-2 font-semibold">{source.releaseAudit.reason}</p>
            {source.releaseAudit.transcriptReleasedAt ? (
              <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-violet-800">
                Transcript separately released{" "}
                {new Date(
                  source.releaseAudit.transcriptReleasedAt,
                ).toLocaleString()}
              </p>
            ) : (
              <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-amber-800">
                Transcript remains governed by its separate consent disposition
              </p>
            )}
          </div>
        ) : null}

        {source.boundaryAuthority === "AUDITED_RECOVERY_REPLICA" &&
        source.recoveryAudit ? (
          <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs font-bold leading-5 text-cyan-950">
            <p className="font-black">Audited recovery-replica boundary</p>
            <p className="mt-1">
              This exact retained replica was adopted through a durable recovery
              decision on{" "}
              {new Date(source.recoveryAudit.decidedAt).toLocaleString()}. It
              does not borrow native START/STOP boundaries from the immutable
              original.
            </p>
            <p className="mt-2 font-semibold">{source.recoveryAudit.reason}</p>
            <dl className="mt-3 grid gap-1 font-mono text-[10px]">
              <div>
                <dt className="inline font-black">Immutable original </dt>
                <dd className="inline break-all">
                  {source.recoveryAudit.originalRecordingAssetId}
                </dd>
              </div>
              <div>
                <dt className="inline font-black">Plan expectation </dt>
                <dd className="inline break-all">
                  {source.recoveryAudit.expectationId}
                </dd>
              </div>
              <div>
                <dt className="inline font-black">Generations </dt>
                <dd className="inline">
                  import {source.recoveryAudit.importedSourceGeneration} →
                  durable replica{" "}
                  {source.recoveryAudit.durableReplicaGeneration}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-cyan-800">
              Immutable original preserved · replica independently verified
            </p>
          </div>
        ) : null}

        {source.issues.length ? (
          <ul
            className={`mt-4 space-y-1 rounded-lg border p-3 text-xs font-bold leading-5 ${drift ? "border-rose-200 bg-rose-50 text-rose-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}
          >
            {source.issues.map((issue) => (
              <li key={issue}>• {issue}</li>
            ))}
          </ul>
        ) : verified ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-black leading-5 text-emerald-950">
            {source.boundaryAuthority === "STAFF_REVIEWED_EXTERNAL_IMPORT"
              ? "Nest independently matched the immutable receipt, RecordingAsset, exact server SHA-256 and byte count, cloud object generation, and durable staff release audit. No phone boundary is inferred."
              : source.boundaryAuthority === "AUDITED_RECOVERY_REPLICA"
                ? "Nest independently matched the recovery request, immutable original identity, imported-source hash, durable replica hash, byte count, storage identity, cloud generation, plan expectation, and release receipt. No native phone boundary is inferred."
                : "Nest independently matched the immutable receipt, RecordingAsset, exact server SHA-256 and byte count, cloud object generation, and applied START/STOP boundaries."}
          </p>
        ) : (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-black leading-5 text-amber-950">
            The immutable source identity matches, but its processing policy
            remains held. Review the saved disposition before creating
            transcript or output work.
          </p>
        )}

        <details className="mt-3 rounded-lg border border-[#eadfc9] bg-[#fffdf8] p-3">
          <summary className="cursor-pointer text-xs font-black text-[#5b472f]">
            Inspect exact cloud identity
          </summary>
          <dl className="mt-3 grid gap-2 text-[10px] font-bold text-[#765f40]">
            <div>
              <dt className="font-black uppercase tracking-wide text-[#8a7354]">
                Upload session
              </dt>
              <dd className="mt-1 break-all font-mono">
                {source.uploadSessionId || "absent"}
              </dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wide text-[#8a7354]">
                SHA-256
              </dt>
              <dd className="mt-1 break-all font-mono">
                {source.cloud.sha256 || "absent"}
              </dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wide text-[#8a7354]">
                Private object
              </dt>
              <dd className="mt-1 break-all font-mono">
                {source.cloud.bucket && source.cloud.objectPath
                  ? `${source.cloud.bucket}/${source.cloud.objectPath}`
                  : "absent"}
              </dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wide text-[#8a7354]">
                Dispositions
              </dt>
              <dd className="mt-1">
                {humanize(source.processingDisposition)} processing ·{" "}
                {humanize(source.transcriptDisposition)} transcript
              </dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wide text-[#8a7354]">
                Audio pipeline
              </dt>
              <dd className="mt-1 break-words">
                {audio.capturePipeline || "absent"} ·{" "}
                {audio.pauseTimelinePolicy || "pause policy absent"}
              </dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wide text-[#8a7354]">
                Hardware input
              </dt>
              <dd className="mt-1">
                {audio.hardwareSampleRateHz
                  ? `${audio.hardwareSampleRateHz} Hz`
                  : "not measured"}{" "}
                ·{" "}
                {audio.hardwareInputChannelCount
                  ? `${audio.hardwareInputChannelCount} ch`
                  : "channels unknown"}
              </dd>
            </div>
          </dl>
        </details>
        {source.status === "HELD" && source.uploadSessionId ? (
          source.sourceOrigin === "NEST_RECOVERY_REPLICA" ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-black leading-5 text-amber-950">
              This audited recovery replica remains held. Repair its recovery
              lineage or governed release receipt; native Capture and
              external-import exceptions cannot be substituted.
            </p>
          ) : source.sourceOrigin === "NEST_EXTERNAL_IMPORT" ? (
            canReleaseHeldMedia ? (
              <HeldSourceReleaseControl source={source} />
            ) : (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-black leading-5 text-amber-950">
                Staff review is required to release this held external import.
                No participant-facing control can bypass the immutable source
                and consent checks.
              </p>
            )
          ) : (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-black leading-5 text-amber-950">
              This native Capture source remains held. Restore or reconcile its
              signed START/STOP receipt trail; the external-import exception is
              unavailable.
            </p>
          )
        ) : null}
      </article>
    );
  };

  return (
    <section
      className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-5"
      aria-labelledby="source-evidence-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white p-2 text-emerald-700">
            <ShieldCheck aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">
              Recording quality
            </p>
            <h2
              id="source-evidence-heading"
              className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
            >
              Your recordings are safe and ready
            </h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">
              Quipsly checks that every participant recording reached private
              storage intact, then keeps the technical proof available without
              putting it in the way of normal editing and sharing.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-black uppercase tracking-wide">
          <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-emerald-800">
            {exact} safe
          </span>
          <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-amber-900">
            {held} processing
          </span>
          <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-rose-900">
            {needsReview} attention
          </span>
          <a
            href={`/api/sessions/${encodeURIComponent(roomId)}/source-evidence`}
            className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 bg-white px-3 py-2 text-emerald-900 normal-case tracking-normal"
          >
            Download technical receipt
          </a>
        </div>
      </div>
      <div className="mt-4 grid min-w-0 gap-3 xl:grid-cols-2">
        {evidence.sources.map(sourceArticle)}
      </div>
      {evidence.sources.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-white/70 p-4 text-xs font-bold text-emerald-950">
          No recording has arrived for this Session yet.
        </div>
      ) : null}
    </section>
  );
}

function SessionQuickEntryCard({
  roomId,
  entries,
  taxonomy,
  scope,
}: {
  roomId: string;
  entries: SessionQuickEntry[];
  taxonomy: SessionTaxonomy | null;
  scope: "notes" | "work";
}) {
  const router = useRouter();
  const entriesForScope = entries.filter((entry) =>
    scope === "notes"
      ? entry.kind === "NOTE"
      : entry.kind === "TASK" || entry.kind === "GOAL",
  );
  const [currentEntries, setCurrentEntries] = useState(entriesForScope);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<"TASK" | "GOAL">("TASK");
  const createWorkFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setCurrentEntries(
      entries.filter((entry) =>
        scope === "notes"
          ? entry.kind === "NOTE"
          : entry.kind === "TASK" || entry.kind === "GOAL",
      ),
    );
  }, [entries, scope]);
  const icon = (kind: SessionQuickEntry["kind"]) =>
    kind === "NOTE" ? MessageSquareText : kind === "TASK" ? ListTodo : Target;
  function updateEntry(noteId: string, update: Partial<SessionQuickEntry>) {
    setCurrentEntries((current) =>
      current.map((entry) =>
        entry.id === noteId ? { ...entry, ...update } : entry,
      ),
    );
  }
  async function createWork(formData: FormData) {
    const requestId = crypto.randomUUID();
    setBusyId("create-work");
    setNotice(null);
    try {
      const rawTargetAt = String(formData.get("targetAt") || "");
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/work`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientRequestId: requestId,
            kind: createKind,
            title: String(formData.get("title") || ""),
            body: String(formData.get("body") || ""),
            visibility: String(formData.get("visibility") || "SESSION_SHARED"),
            targetAt: rawTargetAt
              ? new Date(`${rawTargetAt}T12:00:00`).toISOString()
              : null,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        entry?: SessionQuickEntry;
        nextAction?: string;
      };
      if (!response.ok || !payload.ok || !payload.entry)
        throw new Error(payload.error || "The Session work was not saved.");
      setCurrentEntries((current) => [
        payload.entry!,
        ...current.filter((entry) => entry.id !== payload.entry!.id),
      ]);
      createWorkFormRef.current?.reset();
      setCreateKind("TASK");
      setNotice(`${createKind === "TASK" ? "Task" : "Goal"} saved.`);
      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The Session work was not saved.",
      );
    } finally {
      setBusyId(null);
    }
  }
  async function saveNote(entry: SessionQuickEntry, formData: FormData) {
    setBusyId(entry.id);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/notes/${encodeURIComponent(entry.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: String(formData.get("title") || ""),
            body: String(formData.get("body") || ""),
            expectedUpdatedAt: entry.updatedAt,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        note?: {
          title: string | null;
          body: string;
          updatedAt: string;
          tags: SessionQuickEntry["tags"];
        };
      };
      if (!response.ok || !payload.ok || !payload.note)
        throw new Error(payload.error || "The note was not saved.");
      updateEntry(entry.id, {
        title: payload.note.title,
        body: payload.note.body,
        updatedAt: payload.note.updatedAt,
        tags: payload.note.tags,
      });
      setNotice(
        "Note saved to its original Session identity. No copy, message, calendar event, or publication action was created.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The note was not saved.",
      );
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
        body: JSON.stringify({
          entityKind: "note",
          entityId: entry.id,
          tagIds,
          expectedUpdatedAt: entry.updatedAt,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        updatedAt?: string;
      };
      if (!response.ok || !payload.ok || !payload.updatedAt)
        throw new Error(payload.error || "The note tags were not saved.");
      const catalog = taxonomy?.catalog ?? [];
      updateEntry(entry.id, {
        tags: catalog
          .filter((tag) => tagIds.includes(tag.id))
          .map(({ id, label, slug }) => ({ id, label, slug })),
        updatedAt: payload.updatedAt,
      });
      setNotice("Canonical Nest tags saved on the same note identity.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The note tags were not saved.",
      );
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
        body: JSON.stringify({
          entityKind: "note",
          entityId: entry.id,
          operation: "CREATE_AND_ASSIGN",
          label: String(formData.get("label") || ""),
          expectedUpdatedAt: entry.updatedAt,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        updatedAt?: string;
        tag?: { id: string; label: string; slug: string };
      };
      if (!response.ok || !payload.ok || !payload.updatedAt || !payload.tag)
        throw new Error(payload.error || "The reusable tag was not created.");
      updateEntry(entry.id, {
        tags: [
          ...entry.tags.filter((tag) => tag.id !== payload.tag!.id),
          payload.tag,
        ],
        updatedAt: payload.updatedAt,
      });
      setNotice(
        `#${payload.tag.label} is now reusable in this Nest and attached to the note.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The reusable tag was not created.",
      );
    } finally {
      setBusyId(null);
    }
  }
  const noteScope = scope === "notes";
  const taskCount = currentEntries.filter(
    (entry) => entry.kind === "TASK",
  ).length;
  const goalCount = currentEntries.filter(
    (entry) => entry.kind === "GOAL",
  ).length;
  const title = noteScope
    ? `${currentEntries.length} deliberate Session note${currentEntries.length === 1 ? "" : "s"}`
    : "Tasks and goals";
  return (
    <section
      className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5"
      aria-labelledby={`quick-entry-${scope}-heading`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">
            {noteScope
              ? "Actor-owned Session context"
              : "Session follow-through"}
          </p>
          <h2
            id={`quick-entry-${scope}-heading`}
            className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
          >
            {title}
          </h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
            {noteScope
              ? "These notes were deliberately captured for this Session. They are not transcript suggestions or copied phone drafts."
              : `${taskCount} task${taskCount === 1 ? "" : "s"} · ${goalCount} goal${goalCount === 1 ? "" : "s"}. Add the next step here or continue it in Work.`}
          </p>
        </div>
        {noteScope ? null : (
          <Link
            href="/work"
            className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-900"
          >
            Open my Work
          </Link>
        )}
      </div>
      {!noteScope && (
        <details
          open={currentEntries.length === 0}
          className="mt-4 rounded-xl border border-emerald-200 bg-white p-4"
        >
          <summary className="cursor-pointer text-sm font-black text-emerald-950">
            Add task or goal
          </summary>
          <form
            ref={createWorkFormRef}
            action={(formData) => void createWork(formData)}
            className="mt-4 grid gap-3 md:grid-cols-2"
          >
            <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
              Type
              <select
                name="kind"
                value={createKind}
                onChange={(event) =>
                  setCreateKind(event.target.value as "TASK" | "GOAL")
                }
                className="mt-1 block min-h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal"
              >
                <option value="TASK">Task</option>
                <option value="GOAL">Goal</option>
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
              Who can see it
              <select
                name="visibility"
                defaultValue="SESSION_SHARED"
                className="mt-1 block min-h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal"
              >
                <option value="SESSION_SHARED">Everyone in this Session</option>
                <option value="AUTHOR_PRIVATE">Only me</option>
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900 md:col-span-2">
              {createKind === "TASK" ? "Task" : "Goal"} title
              <input
                name="title"
                required
                maxLength={500}
                placeholder={
                  createKind === "TASK"
                    ? "What happens next?"
                    : "What are we working toward?"
                }
                className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal"
              />
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900 md:col-span-2">
              Context{" "}
              <span className="normal-case tracking-normal text-emerald-700">
                (optional)
              </span>
              <textarea
                name="body"
                maxLength={5_000}
                rows={3}
                placeholder="Add enough detail that this still makes sense next time."
                className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal"
              />
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
              {createKind === "TASK" ? "Due date" : "Target date"}{" "}
              <span className="normal-case tracking-normal text-emerald-700">
                (optional)
              </span>
              <input
                name="targetAt"
                type="date"
                className="mt-1 block min-h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal"
              />
            </label>
            <button
              type="submit"
              disabled={busyId === "create-work"}
              className="min-h-11 self-end rounded-full bg-emerald-800 px-5 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
            >
              {busyId === "create-work"
                ? "Saving…"
                : `Save ${createKind.toLowerCase()}`}
            </button>
          </form>
          <p className="mt-3 text-[11px] font-semibold leading-5 text-emerald-900">
            Saved here and in Work, ready to update anytime.
          </p>
        </details>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-950"
        >
          {notice}
        </p>
      )}
      {currentEntries.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {currentEntries.map((entry) => {
            const Icon = icon(entry.kind);
            const href =
              entry.ownedByCurrentActor === false
                ? null
                : entry.kind === "TASK"
                  ? `/work?task=${encodeURIComponent(entry.id)}`
                  : entry.kind === "GOAL"
                    ? `/work?goal=${encodeURIComponent(entry.id)}`
                    : null;
            return (
              <article
                id={`quick-entry-${entry.id}`}
                key={entry.id}
                tabIndex={-1}
                className="scroll-mt-24 rounded-xl border border-emerald-200 bg-white p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-black text-[#3d3122]">
                        {entry.title ||
                          (entry.kind === "NOTE"
                            ? "Quick note"
                            : `Untitled ${entry.kind.toLowerCase()}`)}
                      </p>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusTone(entry.status)}`}
                      >
                        {humanize(entry.status)}
                      </span>
                    </div>
                    {entry.body && (
                      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#765f40]">
                        {entry.body}
                      </p>
                    )}
                    <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
                      {humanize(entry.kind)} ·{" "}
                      {entry.visibility === "SESSION_SHARED"
                        ? "Everyone in this Session"
                        : "Only me"}{" "}
                      ·{" "}
                      {entry.ownedByCurrentActor === false
                        ? "Created by another participant"
                        : "Mine"}{" "}
                      · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                    {href && (
                      <Link
                        href={href}
                        className="mt-3 inline-flex min-h-11 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900"
                      >
                        Open same {entry.kind.toLowerCase()} in Work
                      </Link>
                    )}
                  </div>
                </div>
                <TagSearchChips
                  tags={entry.tags}
                  label={`${entry.title || entry.kind} tags`}
                />
                {entry.kind === "NOTE" && (
                  <details className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                    <summary className="cursor-pointer text-xs font-black text-emerald-950">
                      Edit note and tags
                    </summary>
                    <form
                      action={(formData) => void saveNote(entry, formData)}
                      className="mt-3 grid gap-3"
                    >
                      <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
                        Title
                        <input
                          name="title"
                          maxLength={500}
                          defaultValue={entry.title ?? ""}
                          className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal"
                        />
                      </label>
                      <label className="text-[10px] font-black uppercase tracking-wide text-emerald-900">
                        Note
                        <textarea
                          name="body"
                          required
                          maxLength={20_000}
                          defaultValue={entry.body ?? ""}
                          rows={5}
                          className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={busyId === entry.id}
                        className="min-h-11 justify-self-start rounded-full bg-emerald-800 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        Save note
                      </button>
                    </form>
                    {taxonomy?.canManageVocabulary && (
                      <div className="mt-4 border-t border-emerald-100 pt-4">
                        <form
                          action={(formData) =>
                            void saveNoteTags(entry, formData)
                          }
                        >
                          <fieldset className="grid gap-2 sm:grid-cols-2">
                            <legend className="mb-2 text-[10px] font-black uppercase tracking-wide text-sky-900">
                              Canonical {taxonomy.project.name} tags
                            </legend>
                            {taxonomy.catalog.map((tag) => (
                              <label
                                key={tag.id}
                                className="flex min-h-11 items-center gap-2 rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs font-bold text-sky-950"
                              >
                                <input
                                  name="noteTagId"
                                  value={tag.id}
                                  type="checkbox"
                                  defaultChecked={entry.tags.some(
                                    (selected) => selected.id === tag.id,
                                  )}
                                />
                                #{tag.label}
                              </label>
                            ))}
                          </fieldset>
                          <button
                            type="submit"
                            disabled={busyId === entry.id}
                            className="mt-3 min-h-11 rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-black text-sky-950 disabled:opacity-50"
                          >
                            Save tags
                          </button>
                        </form>
                        <form
                          action={(formData) =>
                            void createNoteTag(entry, formData)
                          }
                          className="mt-3 flex flex-col gap-2 sm:flex-row"
                        >
                          <label className="flex-1 text-[10px] font-black uppercase tracking-wide text-violet-900">
                            New reusable tag
                            <input
                              name="label"
                              required
                              maxLength={80}
                              placeholder="e.g. Opening craft"
                              className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal"
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={busyId === entry.id}
                            className="min-h-11 self-end rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-xs font-black text-violet-950 disabled:opacity-50"
                          >
                            Create and attach
                          </button>
                        </form>
                      </div>
                    )}
                  </details>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-white/70 p-4 text-xs font-bold text-emerald-900">
          {noteScope
            ? "No deliberate Session note has been added yet. Quipsly does not substitute transcript text or an Inbox count."
            : "No tasks or goals yet. Add one now, or let Quipsly create editable next steps from the transcript."}
        </div>
      )}
    </section>
  );
}

function SessionStudioHandoffCard({
  handoff,
  contentReadiness,
}: {
  handoff: SessionStudioHandoff;
  contentReadiness?: SessionContentReadiness | null;
}) {
  const attached = handoff.recordings.filter(
    (recording) => recording.status === "ATTACHED",
  );
  const integrityHolds = handoff.recordings.filter(
    (recording) =>
      recording.status === "RECEIPT_MISSING" ||
      recording.status === "PROJECT_CONFLICT",
  );
  const captureProofOnly = contentReadiness?.status === "capture-proof-only";
  return (
    <section
      className="rounded-2xl border border-violet-200 bg-violet-50/45 p-5"
      aria-labelledby="studio-handoff-heading"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white p-2 text-violet-700">
          <FileUp aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">
            Durable Studio handoff
          </p>
          <h2
            id="studio-handoff-heading"
            className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
          >
            {attached.length} immutable source attachment
            {attached.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
            The source RecordingAsset stays immutable. A unique Nest attachment
            is a provenance receipt—not proof that the take is substantial,
            editorially chosen, or release-ready.
          </p>
        </div>
      </div>
      {integrityHolds.length > 0 && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-900"
        >
          {integrityHolds.length} recording handoff
          {integrityHolds.length === 1 ? " is" : "s are"} held because its
          project binding or durable attachment receipt does not match this
          Session.
        </p>
      )}
      {captureProofOnly && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black leading-5 text-orange-950"
        >
          These attachment receipts point to capture-test media. The current
          source set is still “capture proof only,” so Quipsly does not call any
          attached file a production spine.
        </p>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {handoff.recordings.map((recording) => (
          <article
            key={recording.recordingAssetId}
            className="rounded-xl border border-violet-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#3d3122]">
                  {recording.fileName}
                </p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">
                  {humanize(recording.kind)} ·{" "}
                  {humanize(
                    captureProofOnly &&
                      recording.importRole === "spine-audio-candidate"
                      ? "historical-spine-candidate-label"
                      : recording.importRole || recording.recordingStatus,
                  )}
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusTone(recording.status)}`}
              >
                {humanize(
                  recording.status === "READY_FOR_HANDOFF"
                    ? "READY_FOR_SOURCE_ATTACHMENT"
                    : recording.status,
                )}
              </span>
            </div>
            {recording.status === "ATTACHED" && recording.episodeSlug ? (
              <Link
                href={`/editor?project=${encodeURIComponent(handoff.project.slug)}&episode=${encodeURIComponent(recording.episodeSlug)}`}
                className="mt-3 inline-flex min-h-11 items-center rounded-full border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-black text-violet-950"
              >
                Open {humanize(recording.episodeSlug)} in Studio
              </Link>
            ) : null}
            {recording.status === "READY_FOR_HANDOFF" ? (
              <p className="mt-3 text-xs font-bold leading-5 text-violet-900">
                Verified bytes are ready for an explicit source attachment. This
                is not a production-content or editorial-readiness verdict.
              </p>
            ) : null}
            {recording.status === "ATTACHED" && captureProofOnly ? (
              <p className="mt-3 text-xs font-black leading-5 text-orange-900">
                Attachment receipt verified; production-spine status withheld
                because this Session contains only capture-test evidence.
              </p>
            ) : null}
            {recording.status === "NOT_READY" ? (
              <p className="mt-3 text-xs font-bold leading-5 text-[#765f40]">
                This capture must be verified and released before Studio
                promotion.
              </p>
            ) : null}
            {recording.attachmentId ? (
              <details className="mt-3 text-[10px] font-bold text-[#765f40]">
                <summary className="cursor-pointer">
                  Inspect handoff receipt
                </summary>
                <dl className="mt-2 grid gap-1 font-mono">
                  <div>
                    <dt className="inline font-black">Attachment </dt>
                    <dd className="inline break-all">
                      {recording.attachmentId}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-black">Media </dt>
                    <dd className="inline break-all">
                      {recording.mediaAssetId}
                    </dd>
                  </div>
                </dl>
              </details>
            ) : null}
          </article>
        ))}
        {handoff.recordings.length === 0 && (
          <div className="rounded-xl border border-dashed border-violet-200 bg-white/70 p-4 text-xs font-bold text-violet-900">
            This Session has no persisted recordings yet. Studio handoff will
            appear here only from real capture evidence.
          </div>
        )}
      </div>
    </section>
  );
}

function SessionTaxonomyCard({
  roomId,
  initial,
}: {
  roomId: string;
  initial: SessionTaxonomy;
}) {
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
      const response = await fetch("/api/work/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityKind: "session",
          entityId: roomId,
          tagIds,
          expectedUpdatedAt: taxonomy.updatedAt,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        updatedAt?: string;
      };
      if (!response.ok || !body.ok || !body.updatedAt)
        throw new Error(body.error || "Session tags were not saved.");
      setTaxonomy((current) => ({
        ...current,
        tags: current.catalog.filter((tag) => tagIds.includes(tag.id)),
        updatedAt: body.updatedAt!,
      }));
      setNotice(
        "Session tags saved to the canonical Nest record. No source, task, provider, calendar, or publication state changed.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Session tags were not saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-sky-200 bg-sky-50/45 p-5"
      aria-labelledby="session-context-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">
            Shared production context
          </p>
          <h2
            id="session-context-heading"
            className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
          >
            {taxonomy.project.name}
          </h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
            This Session, its accepted work, Today, and Nest share one project
            identity.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/nests/${encodeURIComponent(taxonomy.project.slug)}`}
            className="rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900"
          >
            Open Nest
          </Link>
          <Link
            href={`/editor?project=${encodeURIComponent(taxonomy.project.slug)}`}
            className="rounded-full border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-900"
          >
            Open Studio editor
          </Link>
        </div>
      </div>
      <TagSearchChips tags={taxonomy.tags} label="Session tags" />
      {taxonomy.canManage && (
        <details className="mt-4 rounded-xl border border-sky-200 bg-white/80 p-3">
          <summary className="cursor-pointer text-xs font-black text-sky-950">
            <Tags className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Edit Session tags
          </summary>
          {taxonomy.catalog.length ? (
            <form
              key={taxonomy.updatedAt}
              action={save}
              className="mt-3 space-y-3"
            >
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Choose Session tags</legend>
                {taxonomy.catalog.map((tag) => (
                  <label
                    key={tag.id}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-200 px-3 py-2 text-xs font-bold"
                  >
                    <input
                      name="sessionTagId"
                      type="checkbox"
                      value={tag.id}
                      defaultChecked={selected.has(tag.id)}
                    />
                    {tag.label}
                  </label>
                ))}
              </fieldset>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-sky-800 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Session tags"}
              </button>
            </form>
          ) : (
            <p className="mt-2 text-xs font-semibold text-sky-900">
              This Nest has no active taxonomy yet.
            </p>
          )}
        </details>
      )}
      {!taxonomy.canManage && (
        <p className="mt-3 text-xs font-semibold text-[#765f40]">
          Tags are read-only here. Only the Session creator with Editor access
          can change them.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-950"
        >
          {notice}
        </p>
      )}
    </section>
  );
}

function statusTone(value: string | null | undefined) {
  const normalized = (value || "").toUpperCase();
  if (/(COMPLETED|READY|GRANTED|ACCEPTED|OPEN)/.test(normalized))
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (/(HELD|REJECTED|FAILED|DECLINED|REVOKED)/.test(normalized))
    return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function WorkspaceModeIcon({ mode }: { mode: SessionWorkspaceMode }) {
  if (mode === "prepare")
    return <ClipboardList className="h-4 w-4" aria-hidden="true" />;
  if (mode === "live") return <Radio className="h-4 w-4" aria-hidden="true" />;
  if (mode === "conversation")
    return <MessageSquareText className="h-4 w-4" aria-hidden="true" />;
  if (mode === "recordings")
    return <Mic2 className="h-4 w-4" aria-hidden="true" />;
  if (mode === "transcript")
    return <FileAudio className="h-4 w-4" aria-hidden="true" />;
  if (mode === "notes")
    return <NotebookPen className="h-4 w-4" aria-hidden="true" />;
  if (mode === "work")
    return <ListTodo className="h-4 w-4" aria-hidden="true" />;
  if (mode === "outputs")
    return <Clapperboard className="h-4 w-4" aria-hidden="true" />;
  return <LayoutDashboard className="h-4 w-4" aria-hidden="true" />;
}

function SessionWorkspaceNavigation({
  roomId,
  mode,
  purpose,
}: {
  roomId: string;
  mode: SessionWorkspaceMode;
  purpose: string;
}) {
  const modes = sessionWorkspaceModesForPurpose(purpose);
  return (
    <section className="rounded-2xl border border-[#e5d5b7] bg-[#fffdf8]/90 p-2 shadow-sm sm:p-3">
      <nav aria-label="Session workspace modes">
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 xl:grid-cols-9">
          {modes.map((definition) => {
            const selected = definition.id === mode;
            return (
              <Link
                key={definition.id}
                href={sessionWorkspaceHref(roomId, definition.id)}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition sm:min-h-12 sm:shrink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${selected ? "order-first sm:order-none" : ""} ${
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
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">
        {detail}
      </p>
    </section>
  );
}

function SessionCollaborationScopes({
  roomId,
  purpose,
  context,
}: {
  roomId: string;
  purpose: string;
  context: SessionCollaborationContext;
}) {
  const experience = sessionExperienceForPurpose(purpose);
  const episode = experience.kind === "episode";
  const episodeHref = episodeRoomHref(context);
  const engagementHref = coachingEngagementHref(context);
  const projectHref = context.project
    ? `/nests/${encodeURIComponent(context.project.slug)}`
    : null;
  const continuityHeading = episode
    ? context.episode
      ? `Episode Room · ${context.episode.title}`
      : "Episode relationship needs attention"
    : experience.kind === "coaching"
      ? context.engagement?.title || "Coaching engagement needs attention"
      : experience.kind === "research"
        ? "Research continuity"
        : "Project continuity";
  const continuityDetail =
    episode && !context.episode
      ? "This recording Session is not bound to a validated Episode Room. Quipsly will not guess from its title or send collaborators into the wrong episode. The Nest remains available while the relationship is repaired."
      : experience.kind === "coaching" && !context.engagement
        ? "This call is not bound to a reviewed Coaching Engagement. Quipsly will preserve it as an individual Session instead of guessing which long-term client relationship it belongs to."
        : experience.continuityDescription;
  if (experience.kind === "coaching") {
    return (
      <section
        className="rounded-2xl border border-sky-200 bg-sky-50/65 p-4 sm:p-5"
        aria-labelledby="session-collaboration-scopes-heading"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">
          Shared coaching space
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2
              id="session-collaboration-scopes-heading"
              className="font-serif text-2xl font-black text-[#3d3122]"
            >
              Everything stays connected
            </h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-sky-950">
              The call, recording, transcript, shared notes, goals, and next
              steps stay with this Session. Ongoing client work stays in the
              coaching space.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {engagementHref ? (
              <Link
                href={engagementHref}
                className="rounded-full bg-emerald-800 px-3 py-2 text-[10px] font-black uppercase text-white"
              >
                Open coaching space
              </Link>
            ) : null}
            <Link
              href={sessionWorkspaceHref(roomId, "notes")}
              className="rounded-full border border-sky-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-sky-950"
            >
              Shared notes
            </Link>
            <Link
              href={sessionWorkspaceHref(roomId, "work")}
              className="rounded-full border border-sky-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-sky-950"
            >
              Goals &amp; tasks
            </Link>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section
      className="rounded-2xl border border-sky-200 bg-sky-50/65 p-5"
      aria-labelledby="session-collaboration-scopes-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">
            Keep working together
          </p>
          <h2
            id="session-collaboration-scopes-heading"
            className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
          >
            Everything from this Session stays connected
          </h2>
          <p className="mt-1 max-w-4xl text-xs font-semibold leading-5 text-sky-950">
            The call, chat, recordings, transcript, notes, and next steps stay
            together. Ongoing work continues in the related coaching, episode,
            research, or project space.
          </p>
        </div>
        <span className="rounded-full border border-sky-300 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-sky-950">
          {experience.label}
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl border border-sky-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-violet-800">
            This Session
          </p>
          <h3 className="mt-1 font-black text-[#3d3122]">
            Call, chat, recording, and transcript
          </h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
            Join the call, chat, review recordings, edit the transcript, and
            keep notes from this meeting in one place.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={sessionWorkspaceHref(roomId, "live")}
              className="rounded-full bg-violet-800 px-3 py-2 text-[10px] font-black uppercase text-white"
            >
              Open call
            </Link>
            <Link
              href={sessionWorkspaceHref(roomId, "recordings")}
              className="rounded-full border border-violet-200 px-3 py-2 text-[10px] font-black uppercase text-violet-950"
            >
              Open recordings
            </Link>
          </div>
        </article>
        <article className="rounded-xl border border-sky-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">
            {experience.continuityLabel}
          </p>
          <h3 className="mt-1 font-black text-[#3d3122]">
            {continuityHeading}
          </h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
            {continuityDetail}
          </p>
          {episode && !context.episode && context.episodeRepair ? (
            <SessionEpisodeBindingRepair
              roomId={roomId}
              state={context.episodeRepair}
            />
          ) : null}
          {episode && (context.episodeBindingHistory?.length ?? 0) > 0 ? (
            <details className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-emerald-950">
                Relationship history · {context.episodeBindingHistory!.length}
              </summary>
              <ol className="mt-2 space-y-2">
                {context.episodeBindingHistory!.map((receipt) => (
                  <li
                    key={receipt.id}
                    className="text-[11px] font-semibold leading-5 text-emerald-950"
                  >
                    <span className="font-black">
                      {receipt.action === "REBIND"
                        ? "Rebound"
                        : receipt.action === "BIND"
                          ? "Bound"
                          : "Verified"}
                    </span>{" "}
                    {receipt.previousEpisodeSlug &&
                    receipt.previousEpisodeSlug !== receipt.nextEpisodeSlug
                      ? `${receipt.previousEpisodeSlug} → `
                      : ""}
                    {receipt.nextEpisodeSlug}
                    {receipt.reason ? ` · ${receipt.reason}` : ""}
                    <span className="block text-[10px] text-emerald-800">
                      {receipt.createdAt
                        .replace("T", " ")
                        .replace(".000Z", " UTC")}{" "}
                      · authorized collaborator · no external side effects
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {episodeHref ? (
              <Link
                href={episodeHref}
                className="rounded-full bg-emerald-800 px-3 py-2 text-[10px] font-black uppercase text-white"
              >
                Open exact Episode Room
              </Link>
            ) : null}
            {episodeHref ? (
              <Link
                href={`${episodeHref}#episode-thread`}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase text-emerald-950"
              >
                Episode thread
              </Link>
            ) : null}
            {engagementHref ? (
              <Link
                href={engagementHref}
                className="rounded-full bg-emerald-800 px-3 py-2 text-[10px] font-black uppercase text-white"
              >
                Open coaching engagement
              </Link>
            ) : null}
            {projectHref ? (
              <Link
                href={projectHref}
                className="rounded-full border border-emerald-300 px-3 py-2 text-[10px] font-black uppercase text-emerald-950"
              >
                Open {context.project!.name}
              </Link>
            ) : null}
          </div>
        </article>
        <article className="rounded-xl border border-sky-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">
            Next steps
          </p>
          <h3 className="mt-1 font-black text-[#3d3122]">
            {episode
              ? "Editor, production work, and publishing"
              : experience.kind === "research"
                ? "Evidence, findings, and writing uses"
                : "Decisions, tasks, and handoffs"}
          </h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
            Turn useful moments into notes, goals, and tasks. Nothing is sent to
            a client or published until someone chooses to share it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={sessionWorkspaceHref(roomId, "work")}
              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase text-amber-950"
            >
              {episode
                ? "Episode work"
                : experience.kind === "research"
                  ? "Findings & tasks"
                  : "Decisions & tasks"}
            </Link>
            {episodeHref ? (
              <Link
                href={`${episodeHref}?mode=edit`}
                className="rounded-full border border-amber-300 px-3 py-2 text-[10px] font-black uppercase text-amber-950"
              >
                Episode editor
              </Link>
            ) : null}
            <Link
              href="/schedule"
              className="rounded-full border border-amber-300 px-3 py-2 text-[10px] font-black uppercase text-amber-950"
            >
              Calendar
            </Link>
          </div>
        </article>
      </div>
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
  purpose,
}: {
  roomId: string;
  preparation: SessionPreparation | null;
  contentReadiness: SessionContentReadiness | null;
  sessionTaxonomy: SessionTaxonomy | null;
  studioHandoff: SessionStudioHandoff | null;
  sessionNotes: SessionWorkspaceNote[];
  sessionQuickEntries: SessionQuickEntry[];
  sessionContinuity: SessionContinuityState | null;
  consentSnapshot: {
    total: number;
    granted: number;
    transcriptionPermitted: number;
  };
  purpose: string;
}) {
  const modeLabel = (workspaceMode: SessionWorkspaceMode) =>
    sessionWorkspaceDefinitionForPurpose(workspaceMode, purpose).label;
  const continuity = sessionContinuity?.current.summary;
  const noteQuickEntryCount = sessionQuickEntries.filter(
    (entry) => entry.kind === "NOTE",
  ).length;
  const workQuickEntryCount = sessionQuickEntries.filter(
    (entry) => entry.kind === "TASK" || entry.kind === "GOAL",
  ).length;
  const attachedOutputCount =
    studioHandoff?.recordings.filter(
      (recording) => recording.status === "ATTACHED",
    ).length ?? 0;
  const substantialRecording = contentReadiness?.status === "substantial";
  const attention = [
    ...(!substantialRecording
      ? [
          {
            id: "recording",
            title:
              contentReadiness?.label || "Recording truth is not available",
            detail:
              contentReadiness?.nextAction ||
              "Open Recordings before relying on transcript or output status.",
            mode: "recordings" as const,
          },
        ]
      : []),
    ...((continuity?.unresolvedPastBlockCount ?? 0) > 0
      ? [
          {
            id: "follow-through",
            title: `${continuity!.unresolvedPastBlockCount} focus block${continuity!.unresolvedPastBlockCount === 1 ? "" : "s"} need a decision`,
            detail:
              "The planned time passed without completion, skip, or cancellation evidence.",
            mode: "prepare" as const,
          },
        ]
      : []),
    ...(consentSnapshot.total > consentSnapshot.granted
      ? [
          {
            id: "consent",
            title: "Consent evidence is incomplete",
            detail: `${consentSnapshot.granted} of ${consentSnapshot.total} persisted consent records are granted.`,
            mode: "transcript" as const,
          },
        ]
      : consentSnapshot.total > consentSnapshot.transcriptionPermitted
        ? [
            {
              id: "transcription-permission",
              title: "Transcription permission is incomplete",
              detail: `${consentSnapshot.transcriptionPermitted} of ${consentSnapshot.total} standalone consent records permit transcription.`,
              mode: "transcript" as const,
            },
          ]
        : []),
  ];
  const lanes = [
    {
      mode: "prepare" as const,
      title: modeLabel("prepare"),
      value: preparation
        ? `${preparation.participants.length} signed-in participant${preparation.participants.length === 1 ? "" : "s"}`
        : "Preparation unavailable",
      detail: `${preparation ? humanize(preparation.status) : "Unknown status"} · ${preparation?.scheduledStart ? sessionTime(preparation.scheduledStart) : "unscheduled"} · ${sessionTaxonomy?.tags.length ?? 0} Session tags`,
    },
    {
      mode: "recordings" as const,
      title: modeLabel("recordings"),
      value: contentReadiness?.label || "Truth unavailable",
      detail: `${contentReadiness?.captureAssetCount ?? 0} source asset${contentReadiness?.captureAssetCount === 1 ? "" : "s"} · ${contentReadiness?.verifiedCaptureCount ?? 0} verified`,
    },
    {
      mode: "live" as const,
      title: modeLabel("live"),
      value: liveRoomReadinessLabel(preparation),
      detail:
        preparation?.providerNextAction ||
        "External mic, camera, headphones, participant roster, and an explicit no-hidden-recording boundary",
    },
    {
      mode: "transcript" as const,
      title: modeLabel("transcript"),
      value: substantialRecording
        ? "Source ready; inspect gate"
        : "Held by source truth",
      detail: consentSnapshot.total
        ? `${consentSnapshot.transcriptionPermitted} of ${consentSnapshot.total} standalone consent records permit transcription; Transcript enforces the complete release gate`
        : "No standalone consent rows are projected here; Transcript verifies the complete release receipt before review",
    },
    {
      mode: "notes" as const,
      title: modeLabel("notes"),
      value: `${sessionNotes.length} visible deliberate note${sessionNotes.length === 1 ? "" : "s"}`,
      detail: `${noteQuickEntryCount} from iPhone Capture · ${continuity?.noteCount ?? 0} actor-owned note${continuity?.noteCount === 1 ? "" : "s"} in continuity`,
    },
    {
      mode: "work" as const,
      title: modeLabel("work"),
      value: `${continuity?.openTaskCount ?? 0} open task${continuity?.openTaskCount === 1 ? "" : "s"} · ${continuity?.activeGoalCount ?? 0} active goal${continuity?.activeGoalCount === 1 ? "" : "s"}`,
      detail: `${workQuickEntryCount} deliberate iPhone work capture${workQuickEntryCount === 1 ? "" : "s"} · ${continuity?.plannedBlockCount ?? 0} planned focus block${continuity?.plannedBlockCount === 1 ? "" : "s"}`,
    },
    {
      mode: "outputs" as const,
      title: modeLabel("outputs"),
      value: `${attachedOutputCount} Studio attachment${attachedOutputCount === 1 ? "" : "s"}`,
      detail: `${studioHandoff?.recordings.length ?? 0} recording handoff receipt${studioHandoff?.recordings.length === 1 ? "" : "s"} available for inspection`,
    },
  ];

  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl border border-[#e5d5b7] bg-white p-6 shadow-sm"
        aria-labelledby="session-runway-heading"
      >
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">
          One Session, eight focused modes
        </p>
        <h2
          id="session-runway-heading"
          className="mt-2 font-serif text-3xl font-black text-[#3d3122]"
        >
          Current runway
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">
          Open the lane for the job in front of you. Every lane reads the same
          canonical Session; switching modes creates nothing and changes
          nothing.
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
              <span className="mt-3 block font-serif text-xl font-black text-[#3d3122]">
                {lane.value}
              </span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-[#765f40]">
                {lane.detail}
              </span>
              <span className="mt-3 block text-xs font-black text-violet-800 group-hover:underline">
                Open {lane.title}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section
        className={`rounded-2xl border p-5 ${attention.length ? "border-amber-200 bg-amber-50/65" : "border-emerald-200 bg-emerald-50/55"}`}
        aria-labelledby="session-attention-heading"
      >
        <h2
          id="session-attention-heading"
          className="font-serif text-2xl font-black text-[#3d3122]"
        >
          {attention.length
            ? "Needs an honest decision"
            : "No overview blocker"}
        </h2>
        {attention.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={sessionWorkspaceHref(roomId, item.mode)}
                  className="block rounded-xl border border-amber-200 bg-white p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                >
                  <span className="block text-sm font-black text-amber-950">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-amber-900">
                    {item.detail}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm font-semibold text-emerald-950">
            The overview snapshot exposes no recording, standalone-consent, or
            follow-through blocker. Transcript and Outputs still enforce their
            own evidence gates.
          </p>
        )}
      </section>
    </div>
  );
}

export function SessionReviewClient({
  roomId,
  sessionTitle,
  mode = "overview",
  notesView = "all",
  joinedFromInvitation = false,
  captureOpenFallback = false,
  preparation = null,
  consentSnapshot,
  contentReadiness = null,
  sourceEvidence = {
    sources: [],
    counts: { VERIFIED_MATCH: 0, HELD: 0, DRIFT: 0, INCOMPLETE: 0 },
  },
  audibleEventSources = [],
  readinessTopology = EMPTY_SESSION_READINESS_TOPOLOGY,
  canManageSourcePlan = false,
  canViewEntryChoiceMetrics = false,
  canReleaseHeldMedia = false,
  sessionTaxonomy = null,
  studioHandoff = null,
  finishingEvidence = {
    transcriptJobs: [],
    outputs: [],
    analyzedSourceCount: 0,
  },
  versionedOutputGraph = null,
  sourceClockAttention = null,
  focusedAttentionId = null,
  focusedRecordingAssetId = null,
  sessionNotes = [],
  canUseProjectTeamNotes = false,
  sessionQuickEntries = [],
  captureReceipts = { captures: [] },
  sessionContinuity = null,
  collaborationContext = {
    project: null,
    episode: null,
    engagement: null,
    binding: "STANDALONE",
  },
}: {
  roomId: string;
  sessionTitle: string;
  mode?: SessionWorkspaceMode;
  notesView?: SessionNoteView;
  joinedFromInvitation?: boolean;
  captureOpenFallback?: boolean;
  preparation?: SessionPreparation | null;
  consentSnapshot: {
    total: number;
    granted: number;
    transcriptionPermitted: number;
  };
  contentReadiness?: SessionContentReadiness | null;
  sourceEvidence?: SessionSourceEvidence;
  audibleEventSources?: Array<{
    projectSlug: string;
    assetId: string;
    sourceId: string;
    sourceUrl: string;
    durationSeconds: number;
    label: string;
  }>;
  readinessTopology?: SessionReadinessTopology;
  canManageSourcePlan?: boolean;
  canViewEntryChoiceMetrics?: boolean;
  canReleaseHeldMedia?: boolean;
  sessionTaxonomy?: SessionTaxonomy | null;
  studioHandoff?: SessionStudioHandoff | null;
  finishingEvidence?: SessionFinishingEvidence;
  versionedOutputGraph?: SessionVersionedOutputGraph | null;
  sourceClockAttention?: SessionSourceClockAttention | null;
  focusedAttentionId?: string | null;
  focusedRecordingAssetId?: string | null;
  sessionNotes?: SessionWorkspaceNote[];
  canUseProjectTeamNotes?: boolean;
  sessionQuickEntries?: SessionQuickEntry[];
  captureReceipts?: SessionCaptureReceipts;
  sessionContinuity?: SessionContinuityState | null;
  collaborationContext?: SessionCollaborationContext;
}) {
  const [packet, setPacket] = useState<SessionReviewPacket | null>(null);
  const [loading, setLoading] = useState(mode === "transcript");
  const [runningTranscript, setRunningTranscript] = useState(false);
  const [buildingPacket, setBuildingPacket] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const automaticPacketAttempts = useRef(new Set<string>());
  const liveDock = useLiveSessionDock();

  const load = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background === true;
      if (!background) {
        setLoading(true);
        setMessage(null);
      }
      try {
        const packetParams = new URLSearchParams({ callRoomId: roomId });
        if (focusedRecordingAssetId)
          packetParams.set("recordingAssetId", focusedRecordingAssetId);
        const response = await fetch(
          `/api/mobile/capture/transcripts/packet?${packetParams.toString()}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as SessionReviewPacket;
        if (!response.ok || !body.ok)
          throw new Error(
            body.error || "Quipsly could not read this session packet.",
          );
        setPacket(body);
      } catch (error) {
        if (!background) setPacket(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "Quipsly could not read this session packet.",
        );
      } finally {
        if (!background) setLoading(false);
      }
    },
    [focusedRecordingAssetId, roomId],
  );

  useEffect(() => {
    if (mode !== "transcript") {
      setLoading(false);
      return;
    }
    void load();
  }, [load, mode]);

  const transcriptJobStatus = packet?.transcriptJob?.status || "";
  useEffect(() => {
    if (
      mode !== "transcript" ||
      !["QUEUED", "RUNNING", "PROCESSING"].includes(transcriptJobStatus)
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      void load({ background: true });
    }, 2_500);
    return () => window.clearInterval(interval);
  }, [load, mode, transcriptJobStatus]);

  const buildPacket = useCallback(
    async (options?: { automatic?: boolean }) => {
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
        const body = (await response.json()) as {
          ok?: boolean;
          error?: string;
          idempotentReplay?: boolean;
        };
        if (!response.ok || !body.ok)
          throw new Error(body.error || "Session follow-through was not created.");
        await load();
        setMessage(
          options?.automatic
            ? "Your Session recap, notes, tasks, and goals are ready. Everything stays editable and linked to the recording."
            : body.idempotentReplay
              ? "Your current Session follow-through is already up to date."
              : "Session follow-through is ready. Edit, complete, reassign, or remove anything whenever you like.",
        );
      } catch (error) {
        setMessage(
          options?.automatic
            ? "Quipsly could not prepare the follow-up yet. Your transcript is safe; try again below."
            : error instanceof Error
              ? error.message
              : "Session follow-through was not created.",
        );
      } finally {
        setBuildingPacket(false);
      }
    },
    [load, packet?.transcriptJob?.id],
  );

  async function runTranscript() {
    const transcriptJobId = packet?.transcriptJob?.id;
    const recordingAssetId =
      packet?.transcriptJob?.asset?.id ?? packet?.selectedRecordingAsset?.id;
    const runFromRecording =
      !transcriptJobId ||
      ["FAILED", "HELD"].includes(packet?.transcriptJob?.status || "");
    if (runFromRecording && !recordingAssetId) {
      setMessage("This transcript action has no immutable recording binding.");
      return;
    }
    setRunningTranscript(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          runFromRecording ? { recordingAssetId } : { transcriptJobId },
        ),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        status?: string;
        alreadyCompleted?: boolean;
      };
      if (!response.ok || !body.ok) {
        throw new Error(
          body.error || "Quipsly could not start this transcript job.",
        );
      }
      await load();
      setMessage(
        body.alreadyCompleted
          ? "This exact transcript job was already complete; Quipsly created no duplicate transcript."
          : body.status === "COMPLETED"
            ? "Transcription completed. Timed text and editable Session work are ready; play or correct any passage whenever useful."
            : "Transcription started. This page updates automatically while Quipsly works.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Quipsly could not start this transcript job.",
      );
    } finally {
      setRunningTranscript(false);
    }
  }

  const tasks = committedTasks(packet);
  const sessionResults = packet?.packet?.results ?? null;
  const resultTasks = sessionResults?.tasks ?? tasks.map((task) => ({
    ...task,
    source: {
      segmentId: null,
      startSeconds: null,
      endSeconds: null,
      speakerLabel: null,
    },
  }));
  const resultNotes = sessionResults?.notes ?? [];
  const resultGoals = sessionResults?.goals ?? [];
  const held = packet?.transcriptProcessingGate?.allowed === false;
  const packetStale = packet?.packet?.transcriptReview?.packetStale === true;
  const reviewHeld = held || packetStale;
  const packetBuildAction = packet?.packet?.safeActions?.find(
    (action) => action.id === "build-review-packet" && action.enabled,
  );
  const canReviewPrivatePacket =
    packet?.packet?.reviewAccess?.canReviewPrivatePacket !== false;
  const canPrepareReviewMaterial = Boolean(
    mode === "transcript" &&
    canReviewPrivatePacket &&
    packet?.transcriptJob?.status === "COMPLETED" &&
    (packet?.transcriptJob?.segmentCount ?? 0) > 0 &&
    !held &&
    packetBuildAction &&
    (!packet?.packet?.summary || packetStale),
  );
  const packetAttemptKey = packet?.transcriptJob?.id
    ? `${packet.transcriptJob.id}:${packet.packet?.transcriptReview?.snapshotSha256 || "missing"}`
    : null;
  const transcriptPermissionReady =
    packet?.transcriptProcessingGate?.allowed === true;
  const clientFollowUpReady = finishingEvidence.outputs.some(
    (output) =>
      output.kind === "CLIENT_FOLLOW_UP" && output.status === "RELEASED",
  );
  const followUpReadyForReview =
    canReviewPrivatePacket && Boolean(packet?.packet?.summary) && !packetStale;
  const followUpStatusLabel = !canReviewPrivatePacket
    ? clientFollowUpReady
      ? "Shared with you"
      : "Not shared yet"
    : followUpReadyForReview
      ? "Ready to use"
      : buildingPacket && canPrepareReviewMaterial
        ? "Preparing"
        : packetStale
          ? "Refreshing"
          : "Waiting for transcript";

  useEffect(() => {
    if (
      !canPrepareReviewMaterial ||
      !packetAttemptKey ||
      buildingPacket ||
      automaticPacketAttempts.current.has(packetAttemptKey)
    ) {
      return;
    }
    automaticPacketAttempts.current.add(packetAttemptKey);
    void buildPacket({ automatic: true });
  }, [buildPacket, buildingPacket, canPrepareReviewMaterial, packetAttemptKey]);

  const reviewLanes = packet?.packet?.reviewLanes ?? [];
  const actionableReviewLanes = reviewLanes.filter(
    (lane) => lane.itemCount > 0,
  );
  const emptyReviewLanes = reviewLanes.filter((lane) => lane.itemCount <= 0);
  const purpose = preparation?.purpose || "COACHING";
  const transcriptRecordingAssetId =
    packet?.transcriptJob?.asset?.id ||
    packet?.selectedRecordingAsset?.id ||
    focusedRecordingAssetId;
  const transcriptAudioMastery =
    sourceEvidence.sources.find(
      (source) => source.recordingAssetId === transcriptRecordingAssetId,
    )?.audioMastery ?? null;
  const activeMode = sessionWorkspaceDefinitionForPurpose(mode, purpose);
  const liveProjectSlug =
    collaborationContext.project?.slug ||
    collaborationContext.engagement?.projectSlug ||
    preparation?.project?.slug ||
    null;
  const liveParentHref =
    episodeRoomHref(collaborationContext) ||
    coachingEngagementHref(collaborationContext) ||
    (liveProjectSlug ? `/nests/${encodeURIComponent(liveProjectSlug)}` : null);
  const liveParentLabel = collaborationContext.episode
    ? "Episode Room"
    : collaborationContext.engagement
      ? "Coaching engagement"
      : liveProjectSlug
        ? "Nest"
        : null;
  const liveDockConfig = useMemo<LiveSessionDockConfig>(
    () => ({
      callRoomId: roomId,
      captureGroupId: preparation?.captureGroupId || "",
      sessionTitle,
      kind: sessionExperienceForPurpose(purpose).captureProfile,
      purpose,
      projectSlug: liveProjectSlug,
      episodeSlug: collaborationContext.episode?.slug || null,
      parentHref: liveParentHref,
      parentLabel: liveParentLabel,
    }),
    [
      collaborationContext.episode?.slug,
      liveParentHref,
      liveParentLabel,
      liveProjectSlug,
      preparation?.captureGroupId,
      purpose,
      roomId,
      sessionTitle,
    ],
  );
  const browserCallActive = liveDock.activeCallRoomId === roomId;
  const browserCallFocused = liveDock.isOpen && browserCallActive;

  if (mode === "live") {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-4xl items-start px-0 py-3 sm:items-center sm:py-8">
        <div className="w-full">
          {browserCallActive ? (
            <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50/90 p-5 shadow-xl shadow-[#3d3122]/10 sm:p-7" aria-labelledby="active-session-heading">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-800">
                Session in progress
              </p>
              <h1 id="active-session-heading" className="mt-1 break-words font-serif text-3xl font-black leading-tight text-[#3d3122]">
                {sessionTitle}
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#5f513e]">
                Your call stays available while you work with the transcript,
                notes, goals, and tasks from this Session.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => liveDock.open(liveDockConfig)}
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-800 px-5 text-xs font-black uppercase tracking-wide text-white"
                >
                  {browserCallFocused ? "Focus call" : "Return to call"}
                </button>
                <Link href={sessionWorkspaceHref(roomId, "conversation")} className="inline-flex min-h-12 items-center justify-center rounded-full border border-emerald-300 bg-white px-4 text-xs font-black text-emerald-950">
                  Conversation
                </Link>
                <Link href={sessionWorkspaceHref(roomId, "transcript")} className="inline-flex min-h-12 items-center justify-center rounded-full border border-emerald-300 bg-white px-4 text-xs font-black text-emerald-950">
                  Transcript
                </Link>
                <Link href={sessionWorkspaceHref(roomId, "notes")} className="inline-flex min-h-12 items-center justify-center rounded-full border border-emerald-300 bg-white px-4 text-xs font-black text-emerald-950">
                  Notes
                </Link>
                <Link href={sessionWorkspaceHref(roomId, "work")} className="inline-flex min-h-12 items-center justify-center rounded-full border border-emerald-300 bg-white px-4 text-xs font-black text-emerald-950">
                  Goals &amp; tasks
                </Link>
              </div>
            </section>
          ) : (
            <CaptureAppHandoff
              roomId={roomId}
              sessionTitle={sessionTitle}
              joinedFromInvitation={joinedFromInvitation}
              captureOpenFallback={captureOpenFallback}
              canViewChoiceMetrics={canViewEntryChoiceMetrics}
              onContinueInBrowser={() => liveDock.open(liveDockConfig)}
            />
          )}

        </div>
      </main>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden sm:space-y-8">
      <section className="rounded-3xl border border-[#e5d5b7] bg-white/85 p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#987443] sm:text-xs sm:tracking-[0.22em]">
              Session workspace · {activeMode.eyebrow}
            </p>
            <h1 className="mt-1 font-serif text-2xl font-black tracking-tight text-[#3d3122] sm:mt-2 sm:text-4xl">
              {sessionTitle}
            </h1>
            <p className="mt-1 hidden max-w-3xl text-xs font-semibold leading-5 text-[#765f40] sm:mt-2 sm:block sm:text-sm sm:leading-relaxed">
              {activeMode.description}
            </p>
          </div>
          {mode === "transcript" ? (
            <button
              type="button"
              onClick={() => void load()}
              disabled={
                loading ||
                buildingPacket
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={loading ? "animate-spin" : ""}
                aria-hidden="true"
              />
              Refresh transcript
            </button>
          ) : null}
        </div>
        {mode === "transcript" && message ? (
          <p
            role="status"
            className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"
          >
            {message}
          </p>
        ) : null}
      </section>

      <SessionWorkspaceNavigation
        roomId={roomId}
        mode={mode}
        purpose={purpose}
      />

      {mode === "overview" && purpose === "COACHING" ? (
        <SessionCoachingQuickPath
          roomId={roomId}
          preparation={preparation}
          contentReadiness={contentReadiness}
          finishingEvidence={finishingEvidence}
        />
      ) : null}

      {mode === "overview" ? (
        <SessionCollaborationScopes
          roomId={roomId}
          purpose={purpose}
          context={collaborationContext}
        />
      ) : null}

      {mode === "overview" && purpose !== "COACHING" ? (
        <SessionWorkspaceOverview
          roomId={roomId}
          preparation={preparation}
          contentReadiness={contentReadiness}
          sessionTaxonomy={sessionTaxonomy}
          studioHandoff={studioHandoff}
          sessionNotes={sessionNotes}
          sessionQuickEntries={sessionQuickEntries}
          sessionContinuity={sessionContinuity}
          consentSnapshot={consentSnapshot}
          purpose={purpose}
        />
      ) : null}

      {mode === "prepare" ? (
        <>
          {preparation ? (
            <SessionPreparationCard roomId={roomId} preparation={preparation} />
          ) : (
            <WorkspaceEmptyState
              title="Preparation truth unavailable"
              detail="Quipsly could not derive this Session’s schedule, participant, or versioned-consent projection. No ready-to-record state is inferred."
            />
          )}
          <SessionInvitations
            roomId={roomId}
            purpose={preparation?.purpose || "COACHING"}
          />
          {purpose === "COACHING" ? <CoachingSessionPlanCard roomId={roomId} /> : null}
          {sessionContinuity?.priorFollowThrough || sessionContinuity?.prior ? (
            <details className="rounded-2xl border border-violet-200 bg-white p-3 shadow-sm sm:p-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-[#3d3122]">
                Previous session context
                <span className="text-xs font-bold text-violet-800">Open</span>
              </summary>
              <div className="mt-4 space-y-4 border-t border-violet-100 pt-4">
                <PriorSessionFollowThroughCard
                  followThrough={sessionContinuity?.priorFollowThrough ?? null}
                />
                <PriorSessionContinuityCard
                  prior={sessionContinuity?.prior ?? null}
                />
              </div>
            </details>
          ) : null}
          {sessionTaxonomy ? (
            <details className="rounded-2xl border border-sky-200 bg-white p-3 shadow-sm sm:p-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-[#3d3122]">
                Workspace and tags
                <span className="max-w-[55%] truncate text-xs font-bold text-sky-800">
                  {sessionTaxonomy.project.name}
                </span>
              </summary>
              <div className="mt-4 border-t border-sky-100 pt-4">
                <SessionTaxonomyCard roomId={roomId} initial={sessionTaxonomy} />
              </div>
            </details>
          ) : (
            <WorkspaceEmptyState
              title="No project context"
              detail="This Session is not connected to an accessible Nest, so Quipsly has no shared tag vocabulary or Studio destination to show."
            />
          )}
        </>
      ) : null}

      {mode === "recordings" ? (
        <>
          <SessionFinishingCockpitCard
            roomId={roomId}
            topology={readinessTopology}
            sourceEvidence={sourceEvidence}
            contentReadiness={contentReadiness}
            studioHandoff={studioHandoff}
            finishingEvidence={finishingEvidence}
          />
          <SessionReadinessTopologyCard
            roomId={roomId}
            topology={readinessTopology}
            canManageSourcePlan={canManageSourcePlan}
          />
          <SessionRecordingImportCard
            roomId={roomId}
            preparation={preparation}
          />
          {contentReadiness ? (
            <SessionContentReadinessCard readiness={contentReadiness} />
          ) : (
            <WorkspaceEmptyState
              title="Recording truth unavailable"
              detail="Quipsly could not derive a source-media readiness snapshot for this Session. No substitute recording state is shown."
            />
          )}
          <SessionCaptureReceiptCard receipts={captureReceipts} />
          <SessionRecordingHealthCard
            roomId={roomId}
            topology={readinessTopology}
            sourceEvidence={sourceEvidence}
          />
          <SessionSourceAlignmentCard
            roomId={roomId}
            evidence={sourceEvidence}
            canManage={Boolean(canManageSourcePlan)}
          />
          {sourceClockAttention ? (
            <SessionSourceClockAttentionCard
              attention={sourceClockAttention}
              initialItemId={focusedAttentionId}
            />
          ) : null}
          <SessionSourceEvidenceCard
            roomId={roomId}
            evidence={sourceEvidence}
            canReleaseHeldMedia={canReleaseHeldMedia}
          />
        </>
      ) : null}

      {mode === "notes" ? (
        <SessionNotesWorkspace
          roomId={roomId}
          initialNotes={sessionNotes}
          activeView={notesView}
          taxonomy={sessionTaxonomy}
          canUseProjectTeamNotes={canUseProjectTeamNotes}
        />
      ) : null}

      {mode === "conversation" ? (
        <SessionConversationThread roomId={roomId} />
      ) : null}

      {mode === "work" ? (
        <>
          <SessionQuickEntryCard
            roomId={roomId}
            entries={sessionQuickEntries}
            taxonomy={sessionTaxonomy}
            scope="work"
          />
          {sessionContinuity ? (
            <SessionContinuityCard
              roomId={roomId}
              initial={sessionContinuity}
            />
          ) : (
            <WorkspaceEmptyState
              title="No continuity snapshot"
              detail="No actor-owned Session notes, committed tasks, goals, or focus blocks are available to carry forward."
            />
          )}
        </>
      ) : null}

      {mode === "outputs" ? (
        <div className="space-y-5">
          {purpose === "COACHING" ? (
            <SessionRecordingShareCard roomId={roomId} />
          ) : null}
          {purpose === "COACHING" ? (
            <SessionClientFollowUpCard roomId={roomId} />
          ) : null}
          {purpose === "COACHING" ? (
            <details className="rounded-3xl border border-[#ddcdaf] bg-[#fffdf8] p-4 shadow-sm sm:p-5">
              <summary className="cursor-pointer text-sm font-black text-[#5b472f]">
                Advanced production evidence and recovery
              </summary>
              <p className="mt-2 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">
                Inspect source provenance, recovery warnings, Studio handoff,
                and delivery history when something needs investigation. These
                diagnostics do not block drafting a client-safe follow-up.
              </p>
              <div className="mt-5 space-y-5">
                <SessionFinishingCockpitCard
                  roomId={roomId}
                  topology={readinessTopology}
                  sourceEvidence={sourceEvidence}
                  contentReadiness={contentReadiness}
                  studioHandoff={studioHandoff}
                  finishingEvidence={finishingEvidence}
                />
                {versionedOutputGraph ? (
                  <SessionVersionedOutputGraphCard
                    graph={versionedOutputGraph}
                  />
                ) : null}
                {studioHandoff ? (
                  <SessionStudioHandoffCard
                    handoff={studioHandoff}
                    contentReadiness={contentReadiness}
                  />
                ) : (
                  <WorkspaceEmptyState
                    title="No Studio output context"
                    detail="This Session has no accessible Nest Studio boundary. Quipsly will not invent a media handoff or publication receipt."
                  />
                )}
              </div>
            </details>
          ) : (
            <>
              <SessionFinishingCockpitCard
                roomId={roomId}
                topology={readinessTopology}
                sourceEvidence={sourceEvidence}
                contentReadiness={contentReadiness}
                studioHandoff={studioHandoff}
                finishingEvidence={finishingEvidence}
              />
              {versionedOutputGraph ? (
                <SessionVersionedOutputGraphCard graph={versionedOutputGraph} />
              ) : null}
              {studioHandoff ? (
                <SessionStudioHandoffCard
                  handoff={studioHandoff}
                  contentReadiness={contentReadiness}
                />
              ) : (
                <WorkspaceEmptyState
                  title="No Studio output context"
                  detail="This Session has no accessible Nest Studio boundary. Quipsly will not invent a media handoff or publication receipt."
                />
              )}
            </>
          )}
        </div>
      ) : null}

      {mode === "transcript" ? (
        loading ? (
          <section className="rounded-2xl border border-[#e5d5b7] bg-white p-8 text-sm font-bold text-[#765f40]">
            <LoaderCircle
              className="mr-2 inline animate-spin"
              size={18}
              aria-hidden="true"
            />
            Reading the Session’s transcript evidence…
          </section>
        ) : !packet ? (
          <section
            className="rounded-2xl border border-amber-200 bg-amber-50 p-8"
            role="status"
          >
            <CircleAlert className="text-amber-700" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-2xl font-black text-[#3d3122]">
              Transcript workspace is unavailable.
            </h2>
            <p className="mt-2 font-semibold text-[#765f40]">
              No sample transcript or tasks are substituted. Your saved Session
              was not changed.
            </p>
          </section>
        ) : (
          <>
            <TranscriptCorrectionDesk
              roomId={roomId}
              sessionTitle={sessionTitle}
              recordingAssetId={focusedRecordingAssetId}
              canUseProjectTeamNotes={canUseProjectTeamNotes}
              canEditRecording={purpose === "COACHING"}
              recordingEditor={
                purpose === "COACHING"
                  ? (focus) => (
                      <SessionRecordingShareCard
                        roomId={roomId}
                        focusTranscriptKey={
                          focus
                            ? `${focus.transcriptJobId}:${focus.segmentId}`
                            : null
                        }
                      />
                    )
                  : null
              }
              audioMastery={
                transcriptAudioMastery ? (
                  <SessionAudioMasteryCard
                    coordinates={transcriptAudioMastery}
                  />
                ) : null
              }
            />
            <details className="rounded-2xl border border-[#e5d5b7] bg-white p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-black text-[#3d3122]">
                Session results and status
              </summary>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
                Open this for the recap, generated notes, tasks, goals, and
                processing status. The dedicated Notes, Goals &amp; commitments,
                and Follow-up views keep the ordinary work easier to use.
              </p>
              <div className="mt-5 space-y-5">
                <SessionPostCallPath
                  roomId={roomId}
                  hasRecording={Boolean(
                    packet.selectedRecordingAsset || packet.transcriptJob?.asset,
                  )}
                  transcriptStatus={packet.transcriptJob?.status || "NOT_STARTED"}
                  transcriptSegmentCount={packet.transcriptJob?.segmentCount ?? 0}
                  canReviewPrivatePacket={canReviewPrivatePacket}
                  reviewMaterialReady={Boolean(packet.packet?.summary)}
                  packetStale={packetStale}
                  preparingReviewMaterial={
                    buildingPacket && canPrepareReviewMaterial
                  }
                  held={held}
                  followUpReady={clientFollowUpReady}
                />
            <section
              className={`grid gap-4 ${transcriptPermissionReady ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}
              aria-label="Session evidence status"
            >
              {!transcriptPermissionReady ? (
                <div
                  id="transcript-status"
                  className="scroll-mt-24 rounded-2xl border border-amber-200 bg-amber-50 p-5"
                >
                  <ShieldCheck className="text-amber-700" aria-hidden="true" />
                  <p className="mt-3 text-xs font-black uppercase tracking-wide text-[#987443]">
                    Recording choice
                  </p>
                  <p
                    className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(held ? "HELD" : "NOT_READY")}`}
                  >
                    {held ? "Needs attention" : "Waiting"}
                  </p>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-[#765f40]">
                    {packet.transcriptProcessingGate?.error ||
                      "Quipsly will start the transcript after everyone being recorded allows it."}
                  </p>
                  <details className="mt-3 text-xs text-[#765f40]">
                    <summary className="cursor-pointer font-black">
                      Details
                    </summary>
                    <p className="mt-2 font-semibold leading-5">
                      {consentSnapshot.granted}/{consentSnapshot.total}{" "}
                      participants allowed recording ·{" "}
                      {consentSnapshot.transcriptionPermitted} allow
                      transcription
                    </p>
                  </details>
                </div>
              ) : null}
              <div className="rounded-2xl border border-[#e5d5b7] bg-white p-5">
                <FileAudio className="text-violet-700" aria-hidden="true" />
                <p className="mt-3 text-xs font-black uppercase tracking-wide text-[#987443]">
                  Transcript
                </p>
                <p
                  className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(packet.transcriptJob?.status || (packet.selectedRecordingAsset ? "NOT_STARTED" : undefined))}`}
                >
                  {humanize(
                    packet.transcriptJob?.status ||
                      (packet.selectedRecordingAsset
                        ? "NOT_STARTED"
                        : undefined),
                  )}
                </p>
                <p className="mt-3 text-sm font-semibold text-[#765f40]">
                  {packet.transcriptJob?.segmentCount ?? 0} timed passage(s) ·{" "}
                  {packet.transcriptJob?.asset?.fileName ||
                    packet.selectedRecordingAsset?.fileName ||
                    "no bound recording asset"}
                </p>
                {packet.transcriptJob?.readiness ? (
                  <TranscriptConfidenceSummary
                    confidence={packet.transcriptJob.readiness}
                  />
                ) : null}
                {packet.selectedRecordingAsset?.explicitlySelected ? (
                  <details className="mt-3 text-xs text-violet-900">
                    <summary className="cursor-pointer font-black">
                      Recording details
                    </summary>
                    <p className="mt-2 break-all font-mono text-[10px] font-bold">
                      RecordingAsset · {packet.selectedRecordingAsset.id}
                    </p>
                  </details>
                ) : null}
                {!["QUEUED", "RUNNING", "PROCESSING"].includes(
                  packet.transcriptJob?.status || "",
                ) &&
                packet.packet?.safeActions?.find(
                  (action) =>
                    action.id === "repair-transcript-first" && action.enabled,
                ) ? (
                  <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
                    <button
                      type="button"
                      onClick={() => void runTranscript()}
                      disabled={runningTranscript || loading}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runningTranscript ? (
                        <LoaderCircle
                          size={15}
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Mic2 size={15} aria-hidden="true" />
                      )}
                      {runningTranscript
                        ? "Starting transcription…"
                        : ["FAILED", "HELD"].includes(
                              packet.transcriptJob?.status || "",
                            )
                          ? "Retry transcription"
                          : "Start transcription"}
                    </button>
                    <p className="mt-2 text-[10px] font-bold leading-4 text-violet-900">
                      Uses this recording to create timed text. It does not
                      create or send notes, tasks, goals, or messages.
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-[#e5d5b7] bg-white p-5">
                <MessageSquareText
                  className="text-emerald-700"
                  aria-hidden="true"
                />
                <p className="mt-3 text-xs font-black uppercase tracking-wide text-[#987443]">
                  Follow-up
                </p>
                <p
                  className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone(packet.packet?.status)}`}
                >
                  {followUpStatusLabel}
                </p>
                <p className="mt-3 text-sm font-semibold text-[#765f40]">
                  {!canReviewPrivatePacket
                    ? clientFollowUpReady
                      ? "A follow-up has been shared with you in this Session."
                      : "Nothing has been shared yet. Your transcript and shared Session tools remain available."
                    : followUpReadyForReview
                      ? "Your recap, notes, tasks, and goals are ready to use."
                      : buildingPacket && canPrepareReviewMaterial
                        ? "Quipsly is organizing the transcript into editable Session work."
                        : "Quipsly will organize the transcript into editable Session work when it is ready."}
                </p>
              </div>
            </section>

            {canReviewPrivatePacket || sessionResults ? (
              <>
                <section
                  id="review-material"
                  aria-labelledby="summary-heading"
                  className="scroll-mt-24 rounded-2xl border border-[#e5d5b7] bg-white p-6 shadow-sm"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">
                    Session recap
                  </p>
                  <h2
                    id="summary-heading"
                    className="mt-2 font-serif text-3xl font-black text-[#3d3122]"
                  >
                    {packet.packet?.summary?.title ||
                      "Preparing your follow-up"}
                  </h2>
                  {packet.packet?.summary ? (
                    <>
                      <ReviewPacketSummary summary={packet.packet.summary} />
                      {packetStale ? (
                        <div
                          className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4"
                          role="status"
                        >
                          <p className="text-sm font-black text-amber-950">
                            Your transcript changed, so Quipsly is refreshing
                            the Session results.
                          </p>
                          <p className="mt-2 text-xs font-bold leading-relaxed text-amber-900">
                            Your existing work remains editable while the
                            refreshed version is prepared.
                          </p>
                          <button
                            type="button"
                            onClick={() => void buildPacket()}
                            disabled={buildingPacket || loading}
                            className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
                          >
                            {buildingPacket ? (
                              <LoaderCircle
                                size={15}
                                className="animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <RefreshCw size={15} aria-hidden="true" />
                            )}
                            {buildingPacket
                              ? "Refreshing results…"
                              : "Try again"}
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-sm font-semibold text-[#765f40]">
                        Quipsly prepares the recap and follow-through
                        automatically from the completed transcript.
                      </p>
                      {packetBuildAction ? (
                        <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                          <button
                            type="button"
                            onClick={() => void buildPacket()}
                            disabled={buildingPacket || loading}
                            className="inline-flex items-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {buildingPacket ? (
                              <LoaderCircle
                                size={15}
                                className="animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <MessageSquareText size={15} aria-hidden="true" />
                            )}
                            {buildingPacket
                              ? "Preparing your follow-up…"
                              : "Try again"}
                          </button>
                          <p className="mt-3 text-xs font-bold leading-relaxed text-violet-900">
                            Quipsly normally prepares this automatically from
                            the exact transcript. Retrying creates no task or
                            goal and sends or publishes nothing.
                          </p>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>

                <section id="session-results" className="scroll-mt-24" aria-labelledby="packet-lanes-heading">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded-xl bg-sky-50 p-2 text-sky-700">
                        <ClipboardList aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">
                          Ready to use
                        </p>
                        <h2
                          id="packet-lanes-heading"
                          className="font-serif text-3xl font-black text-[#3d3122]"
                        >
                          Session results
                        </h2>
                      </div>
                    </div>
                    <Link
                      href={sessionWorkspaceHref(roomId, "notes")}
                      className="rounded-full border border-[#d8c7a7] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                    >
                      Open Notes
                    </Link>
                  </div>
                  <p className="mb-4 max-w-4xl text-sm font-semibold leading-relaxed text-[#765f40]">
                    Quipsly organized the transcript and created editable notes,
                    tasks, and goals. Open any result to change it while its
                    source stays linked to the recording.
                  </p>
                  {reviewHeld ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">
                      {packetStale
                        ? "Quipsly is refreshing the Session results after the transcript changed."
                        : "Session results will be ready after recording permission is complete."}
                    </div>
                  ) : canReviewPrivatePacket && actionableReviewLanes.length ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {actionableReviewLanes.map((lane) => (
                        <article
                          key={lane.id}
                          className="rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm"
                        >
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#987443]">
                            {lane.itemCount} source-linked item
                            {lane.itemCount === 1 ? "" : "s"}
                          </p>
                          <h3 className="mt-1 font-serif text-2xl font-black text-[#3d3122]">
                            {lane.label}
                          </h3>
                          <p className="mt-3 text-sm font-semibold leading-relaxed text-[#765f40]">
                            {lane.meaning}
                          </p>
                          <p className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-xs font-semibold leading-5 text-sky-950">
                            {lane.sourceTruth}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">
                      No Session results are available in these categories yet.
                    </div>
                  )}
                  {!reviewHeld && canReviewPrivatePacket && emptyReviewLanes.length ? (
                    <details className="mt-4 rounded-xl border border-[#eadfc9] bg-white p-4 text-sm text-[#765f40]">
                      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#5b472f]">
                        {emptyReviewLanes.length}{" "}
                        {emptyReviewLanes.length === 1
                          ? "category has"
                          : "categories have"}{" "}
                        no results
                      </summary>
                      <p className="mt-3 font-semibold leading-relaxed">
                        {emptyReviewLanes.map((lane) => lane.label).join(" · ")}
                        . Quipsly leaves empty categories quiet instead of
                        creating filler.
                      </p>
                    </details>
                  ) : null}
                  {!reviewHeld && sessionResults ? (
                    <div className="mt-5 grid gap-4 xl:grid-cols-3">
                      <section className="rounded-2xl border border-orange-200 bg-orange-50/45 p-5" aria-labelledby="session-result-notes-heading">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-800">Editable notes</p>
                        <h3 id="session-result-notes-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{resultNotes.length} note{resultNotes.length === 1 ? "" : "s"}</h3>
                        {resultNotes.length ? (
                          <ul className="mt-4 space-y-3">
                            {resultNotes.slice(0, 6).map((note) => (
                              <li key={note.id} className="rounded-xl border border-orange-100 bg-white p-3">
                                <Link href={`${sessionWorkspaceHref(roomId, "notes")}#session-note-${encodeURIComponent(note.id)}`} className="font-black text-[#3d3122] hover:underline">{note.title || "Session note"}</Link>
                                <p className="mt-1 line-clamp-3 text-xs font-semibold leading-5 text-[#765f40]">{note.body}</p>
                                {note.source.startSeconds !== null && note.source.endSeconds !== null ? (
                                  <Link href={`${sessionWorkspaceHref(roomId, "transcript")}#transcript-segment-${encodeURIComponent(note.source.segmentId || "")}`} className="mt-2 inline-flex min-h-11 items-center text-xs font-black text-sky-800 hover:underline">{note.source.speakerLabel ? `${note.source.speakerLabel} · ` : ""}{timestampForSeconds(note.source.startSeconds)}–{timestampForSeconds(note.source.endSeconds)}</Link>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-3 text-xs font-semibold text-[#765f40]">No source-linked notes were needed.</p>}
                      </section>

                      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/45 p-5" aria-labelledby="session-result-tasks-heading">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">Next actions</p>
                        <h3 id="session-result-tasks-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{resultTasks.length} task{resultTasks.length === 1 ? "" : "s"}</h3>
                        {resultTasks.length ? (
                          <ul className="mt-4 space-y-3">
                            {resultTasks.slice(0, 6).map((task) => (
                              <li key={task.id} className="rounded-xl border border-emerald-100 bg-white p-3">
                                <Link href={`/work?task=${encodeURIComponent(task.id)}`} className="font-black text-[#3d3122] hover:underline">{task.title}</Link>
                                {task.detail ? <p className="mt-1 line-clamp-3 text-xs font-semibold leading-5 text-[#765f40]">{task.detail}</p> : null}
                                {task.source.startSeconds !== null && task.source.endSeconds !== null ? (
                                  <Link href={`${sessionWorkspaceHref(roomId, "transcript")}#transcript-segment-${encodeURIComponent(task.source.segmentId || "")}`} className="mt-2 inline-flex min-h-11 items-center text-xs font-black text-sky-800 hover:underline">{task.source.speakerLabel ? `${task.source.speakerLabel} · ` : ""}{timestampForSeconds(task.source.startSeconds)}–{timestampForSeconds(task.source.endSeconds)}</Link>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-3 text-xs font-semibold text-[#765f40]">No next action was detected.</p>}
                      </section>

                      <section className="rounded-2xl border border-violet-200 bg-violet-50/45 p-5" aria-labelledby="session-result-goals-heading">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">Ongoing goals</p>
                        <h3 id="session-result-goals-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{resultGoals.length} goal{resultGoals.length === 1 ? "" : "s"}</h3>
                        {resultGoals.length ? (
                          <ul className="mt-4 space-y-3">
                            {resultGoals.slice(0, 6).map((goal) => (
                              <li key={goal.id} className="rounded-xl border border-violet-100 bg-white p-3">
                                <Link href={`/work?goal=${encodeURIComponent(goal.id)}`} className="font-black text-[#3d3122] hover:underline">{goal.title}</Link>
                                {goal.description ? <p className="mt-1 line-clamp-3 text-xs font-semibold leading-5 text-[#765f40]">{goal.description}</p> : null}
                                {goal.source.startSeconds !== null && goal.source.endSeconds !== null ? (
                                  <Link href={`${sessionWorkspaceHref(roomId, "transcript")}#transcript-segment-${encodeURIComponent(goal.source.segmentId || "")}`} className="mt-2 inline-flex min-h-11 items-center text-xs font-black text-sky-800 hover:underline">{goal.source.speakerLabel ? `${goal.source.speakerLabel} · ` : ""}{timestampForSeconds(goal.source.startSeconds)}–{timestampForSeconds(goal.source.endSeconds)}</Link>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-3 text-xs font-semibold text-[#765f40]">No ongoing goal was detected.</p>}
                      </section>
                    </div>
                  ) : null}
                </section>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <h2 className="font-serif text-2xl font-black text-emerald-950">
                    Follow-through is ready
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-emerald-950">
                    Notes, tasks, and goals now live with the Session work. They
                    are ordinary editable items, not proposals waiting for
                    approval.
                  </p>
                  <Link
                    href={sessionWorkspaceHref(roomId, "work")}
                    className="mt-4 inline-flex min-h-11 items-center rounded-full bg-emerald-800 px-5 text-xs font-black uppercase tracking-wide text-white"
                  >
                    Open session work
                  </Link>
                </div>

                <section aria-labelledby="tasks-heading">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                      <CheckCircle2 aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">
                        Session work
                      </p>
                      <h2
                        id="tasks-heading"
                        className="font-serif text-3xl font-black text-[#3d3122]"
                      >
                        Tasks from this Session
                      </h2>
                    </div>
                  </div>
                  {resultTasks.length ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {resultTasks.map((task) => (
                        <article
                          key={task.id}
                          className="rounded-2xl border border-[#e5d5b7] bg-white p-5"
                        >
                          <p className="font-black text-[#3d3122]">
                            <Link
                              href={`/work?task=${encodeURIComponent(task.id)}`}
                              className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                            >
                              {task.title}
                            </Link>
                          </p>
                          {task.detail && (
                            <p className="mt-2 text-sm font-semibold leading-relaxed text-[#765f40]">
                              {task.detail}
                            </p>
                          )}
                          <p className="mt-3 text-xs font-black uppercase tracking-wide text-[#8a7354]">
                            {humanize(task.status)} ·{" "}
                            {task.dueAt
                              ? `Due ${new Date(task.dueAt).toLocaleDateString()}`
                              : "No due date"}{" "}
                            · editable in Work
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">
                      No tasks were created from this Session.
                    </div>
                  )}
                </section>
              </>
            ) : (
              <section className="rounded-2xl border border-[#e5d5b7] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">
                  Shared follow-up
                </p>
                <h2 className="mt-2 font-serif text-3xl font-black text-[#3d3122]">
                  {clientFollowUpReady
                    ? "Your follow-up is ready"
                    : "Nothing shared yet"}
                </h2>
                <p className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-[#765f40]">
                  {clientFollowUpReady
                    ? "Open Client follow-up to read the recap shared with you."
                    : "You can keep using the transcript, Conversation, Notes, and Work. Private coach notes stay private unless they are shared with you."}
                </p>
              </section>
            )}

              </div>
            </details>

            {sourceClockAttention || audibleEventSources.length ? (
              <details className="rounded-3xl border border-cyan-200 bg-cyan-50/35 p-4 shadow-sm sm:p-5">
                <summary className="cursor-pointer text-sm font-black text-cyan-950">
                  Audio details
                </summary>
                <p className="mt-2 max-w-4xl text-xs font-semibold leading-5 text-[#765f40]">
                  Optional signal maps and detector details for closer listening.
                  Your transcript, automatic audio result, and ordinary editing
                  tools work without opening this section.
                </p>
                <div className="mt-5 space-y-5">
                  {sourceClockAttention ? (
                    <SessionSourceClockAttentionCard
                      attention={sourceClockAttention}
                      initialItemId={focusedAttentionId}
                    />
                  ) : null}
                  {audibleEventSources.length ? (
                    <section
                      aria-labelledby="session-detector-qualification-heading"
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-cyan-50 p-2 text-cyan-700">
                          <FileAudio aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">
                            Audio detector details
                          </p>
                          <h2
                            id="session-detector-qualification-heading"
                            className="font-serif text-3xl font-black text-[#3d3122]"
                          >
                            Inspect detected sounds
                          </h2>
                        </div>
                      </div>
                      <p className="max-w-4xl text-sm font-semibold leading-relaxed text-[#765f40]">
                        Listen to exact source ranges or correct a detector label
                        when useful. Quipsly keeps these details linked to the
                        source without blocking transcription, editing, or sharing.
                      </p>
                      {audibleEventSources.map((source) => (
                        <div key={`${source.assetId}:${source.sourceId}`}>
                          <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#765f40]">
                            {source.label}
                          </p>
                          <AudibleEventQualificationLab
                            {...source}
                            defaultWorkload={
                              purpose === "PODCAST" ? "podcast" : "coaching"
                            }
                          />
                        </div>
                      ))}
                    </section>
                  ) : null}
                </div>
              </details>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
