"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type MaterializationIssue = {
  code: string;
  severity: "blocker" | "warning";
  message: string;
  recordingAssetId?: string;
};

type MaterializationInspection = {
  ok: boolean;
  episodeTitle: string;
  productionUpdatedAt: string;
  captureGroupId: string;
  selectedMediaCount: number;
  sourceCount: number;
  transcriptJobId: string | null;
  plan: {
    ok: boolean;
    status: "blocked" | "media-ready" | "assembly-ready";
    roomId: string;
    sourceSetFingerprintSha256: string;
    sourceBindings: Array<{
      recordingAssetId: string;
      mediaAssetId: string;
      trackId: string;
      participant: { displayLabel: string; deviceLabel: string | null } | null;
      cameraPosition: string | null;
      alignmentReviewId: string | null;
    }>;
    transcriptBinding: {
      blockIds: string[];
      speakerAttributionComplete: boolean;
      recordingAssetId: string;
    } | null;
    speakerCameraMappingIds: string[];
    cameraReadiness: {
      status: "NO_VIDEO_SOURCES" | "SPEAKER_REVIEW_REQUIRED" | "CAMERA_IDENTITY_REQUIRED" | "PRIMARY_ANGLE_REQUIRED" | "READY";
      videoSourceCount: number;
      participantBoundVideoSourceCount: number;
      unboundVideoSourceCount: number;
      reviewedSpeakerCount: number;
      attributedSpeakerCount: number;
      mappedSpeakerCount: number;
      participants: Array<{ participantId: string; label: string; cameraSourceCount: number; cameraLabels: string[]; status: "MISSING" | "AMBIGUOUS" | "MAPPED" }>;
      nextAction: string;
    } | null;
    issues: MaterializationIssue[];
    nextAction: string;
    changed: boolean;
    impact: {
      operation: "initial-materialization" | "evidence-update" | "no-change";
      priorMaterializationStatus: "media-materialized" | "assembly-ready" | null;
      sourceLanesCreated: number;
      sourceLanesReused: number;
      transcriptBlocksAdded: number;
      transcriptBlocksReplaced: number;
      unrelatedTimelineClipsPreserved: number;
      unrelatedTranscriptBlocksPreserved: number;
      manualSpeakerCameraMappingsPreserved: number;
      speakerCameraMappingsAdded: number;
    } | null;
    boundaries: {
      sourceMediaUnchanged: true;
      providerWordsUnchanged: true;
      reviewedAlignmentRequiredForNonSpineSources: true;
      speakerIdentityNeverGuessed: true;
      existingHumanTimelineDecisionsPreserved: true;
      publicationNotStarted: true;
    };
  };
  timelineJson?: unknown;
  timelineFingerprint?: string;
  updatedAt?: string;
  error?: string;
};

function statusLabel(status: MaterializationInspection["plan"]["status"]) {
  if (status === "assembly-ready") return "Assembly ready";
  if (status === "media-ready") return "Media ready";
  return "Held for review";
}

function statusTone(status: MaterializationInspection["plan"]["status"]) {
  if (status === "assembly-ready") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (status === "media-ready") return "border-sky-300 bg-sky-50 text-sky-950";
  return "border-amber-300 bg-amber-50 text-amber-950";
}

export function CaptureTakeMaterializationPanel({
  projectSlug,
  episodeSlug,
  captureGroupId,
  expectedTimelineFingerprint,
  disabled = false,
  onMaterialized,
}: {
  projectSlug: string;
  episodeSlug: string;
  captureGroupId: string;
  expectedTimelineFingerprint: string;
  disabled?: boolean;
  onMaterialized: (payload: MaterializationInspection) => void;
}) {
  const [inspection, setInspection] = useState<MaterializationInspection | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "materializing" | "error">("loading");
  const [message, setMessage] = useState("Inspecting exact Capture, sync, and transcript evidence…");
  const [refreshToken, setRefreshToken] = useState(0);

  const inspect = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setMessage("Inspecting exact Capture, sync, and transcript evidence…");
    const query = new URLSearchParams({ projectSlug, episodeSlug, captureGroupId });
    const response = await fetch(`/api/episode-production/capture-takes?${query.toString()}`, {
      signal,
      cache: "no-store",
    });
    const payload = await response.json() as MaterializationInspection;
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Capture take inspection failed.");
    setInspection(payload);
    setState("ready");
    setMessage(payload.plan.nextAction);
  }, [captureGroupId, episodeSlug, projectSlug]);

  useEffect(() => {
    const controller = new AbortController();
    void inspect(controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Capture take inspection failed.");
    });
    return () => controller.abort();
  }, [inspect, refreshToken]);

  const materialize = async () => {
    if (!inspection?.plan.ok || !expectedTimelineFingerprint) return;
    setState("materializing");
    setMessage("Writing one reversible, provenance-bound take into the canonical episode…");
    try {
      const response = await fetch("/api/episode-production/capture-takes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          episodeSlug,
          captureGroupId,
          expectedTimelineFingerprint,
          clientRequestId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json() as MaterializationInspection;
      if (!response.ok || !payload.ok) throw new Error(payload.error || payload.plan?.nextAction || "Capture take materialization failed.");
      setInspection(payload);
      setState("ready");
      setMessage(payload.plan.nextAction);
      onMaterialized(payload);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Capture take materialization failed.");
    }
  };

  const status = inspection?.plan.status ?? "blocked";
  const blockingIssues = inspection?.plan.issues.filter((issue) => issue.severity === "blocker") ?? [];
  const warnings = inspection?.plan.issues.filter((issue) => issue.severity === "warning") ?? [];
  const impact = inspection?.plan.impact ?? null;
  const isEvidenceUpdate = impact?.operation === "evidence-update";
  const transcriptReviewBaseHref = inspection?.plan.roomId && inspection.plan.transcriptBinding?.recordingAssetId
    ? `/sessions/${encodeURIComponent(inspection.plan.roomId)}?mode=transcript&source=${encodeURIComponent(inspection.plan.transcriptBinding.recordingAssetId)}`
    : null;
  const recordingSourcesHref = inspection?.plan.roomId
    ? `/sessions/${encodeURIComponent(inspection.plan.roomId)}?mode=recordings`
    : null;

  return (
    <section
      id="capture-take-materialization"
      aria-labelledby="capture-take-materialization-title"
      className="mt-3 rounded-xl border border-violet-200 bg-violet-50/80 p-3 text-violet-950"
      data-testid="capture-take-materialization"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="capture-take-materialization-title" className="font-black">
            {isEvidenceUpdate ? "Update this take with new evidence" : "Build this take into the episode"}
          </h3>
          <p className="mt-1 max-w-3xl text-[10px] font-bold leading-4 text-violet-900">
            One guarded handoff creates source lanes, translates the canonical transcript onto the reviewed clock, and maps speakers only when participant-camera identity is unambiguous. Existing human cuts and approvals stay untouched.
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusTone(status)}`}>
          {state === "loading" ? "Inspecting" : statusLabel(status)}
        </span>
      </div>

      {inspection ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Capture take readiness summary">
          <div className="rounded-lg border border-violet-100 bg-white px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-600">Protected sources</div>
            <div className="mt-1 font-black">{inspection.sourceCount}</div>
          </div>
          <div className="rounded-lg border border-violet-100 bg-white px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-600">Reviewed placements</div>
            <div className="mt-1 font-black">{inspection.plan.sourceBindings.filter((source) => source.alignmentReviewId).length} + spine</div>
          </div>
          <div className="rounded-lg border border-violet-100 bg-white px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-600">Transcript</div>
            <div className="mt-1 font-black">{inspection.plan.transcriptBinding ? `${inspection.plan.transcriptBinding.blockIds.length} timed turns` : "Pending"}</div>
          </div>
          <div className="rounded-lg border border-violet-100 bg-white px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-600">Speaker cameras</div>
            <div className="mt-1 font-black">{inspection.plan.speakerCameraMappingIds.length} explicit</div>
          </div>
        </div>
      ) : null}

      {impact ? (
        <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3" aria-label="Exact episode update preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
              {impact.operation === "initial-materialization"
                ? "First episode handoff"
                : impact.operation === "evidence-update"
                  ? "Evidence update preview"
                  : "Canonical take is current"}
            </div>
            {impact.priorMaterializationStatus ? (
              <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-violet-700">
                Prior {impact.priorMaterializationStatus === "assembly-ready" ? "assembly" : "media"} retained
              </span>
            ) : null}
          </div>
          <dl className="mt-2 grid gap-2 text-[10px] sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="font-black text-violet-700">Source lanes</dt>
              <dd className="mt-0.5 font-bold text-violet-950">{impact.sourceLanesCreated} new · {impact.sourceLanesReused} reused</dd>
            </div>
            <div>
              <dt className="font-black text-violet-700">Transcript turns</dt>
              <dd className="mt-0.5 font-bold text-violet-950">{impact.transcriptBlocksAdded} add · {impact.transcriptBlocksReplaced} replace</dd>
            </div>
            <div>
              <dt className="font-black text-violet-700">Other edit work</dt>
              <dd className="mt-0.5 font-bold text-violet-950">{impact.unrelatedTimelineClipsPreserved} clips · {impact.unrelatedTranscriptBlocksPreserved} turns preserved</dd>
            </div>
            <div>
              <dt className="font-black text-violet-700">Speaker cameras</dt>
              <dd className="mt-0.5 font-bold text-violet-950">{impact.speakerCameraMappingsAdded} add · {impact.manualSpeakerCameraMappingsPreserved} manual preserved</dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] font-bold leading-4 text-violet-900">
            This preview is computed from the exact current timeline. The server rechecks its fingerprint before writing, and a timeline conflict stops the update.
          </p>
        </div>
      ) : null}

      {inspection?.plan.cameraReadiness ? (
        <section className="mt-3 rounded-xl border border-sky-200 bg-white p-3" aria-labelledby="capture-camera-readiness-title">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 id="capture-camera-readiness-title" className="font-black text-sky-950">Participant camera readiness</h4>
              <p className="mt-1 text-[10px] font-bold leading-4 text-sky-900">{inspection.plan.cameraReadiness.nextAction}</p>
            </div>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-sky-900">
              {inspection.plan.cameraReadiness.status.replaceAll("_", " ")}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="rounded-lg bg-sky-50 p-2"><dt className="font-black text-sky-700">Video sources</dt><dd className="mt-1 text-base font-black text-sky-950">{inspection.plan.cameraReadiness.videoSourceCount}</dd></div>
            <div className="rounded-lg bg-sky-50 p-2"><dt className="font-black text-sky-700">Speaker identities</dt><dd className="mt-1 text-base font-black text-sky-950">{inspection.plan.cameraReadiness.attributedSpeakerCount}/{inspection.plan.cameraReadiness.reviewedSpeakerCount}</dd></div>
            <div className="rounded-lg bg-sky-50 p-2"><dt className="font-black text-sky-700">Camera maps</dt><dd className="mt-1 text-base font-black text-sky-950">{inspection.plan.cameraReadiness.mappedSpeakerCount}</dd></div>
          </dl>
          {inspection.plan.cameraReadiness.participants.length ? (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="Participant camera coverage">
              {inspection.plan.cameraReadiness.participants.map((participant) => <li key={participant.participantId} className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-[10px] font-bold text-sky-950"><span className="font-black">{participant.label}</span> · {participant.cameraSourceCount} camera{participant.cameraSourceCount === 1 ? "" : "s"} · {participant.status.toLowerCase()}</li>)}
            </ul>
          ) : null}
          {inspection.plan.cameraReadiness.status === "NO_VIDEO_SOURCES" && recordingSourcesHref ? (
            <Link href={recordingSourcesHref} className="mt-2 flex min-h-10 items-center justify-center rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-[10px] font-black text-sky-950 hover:bg-white">Open this Session’s recording sources</Link>
          ) : inspection.plan.cameraReadiness.status === "SPEAKER_REVIEW_REQUIRED" && transcriptReviewBaseHref ? (
            <Link href={`${transcriptReviewBaseHref}#transcript-correction-review`} className="mt-2 flex min-h-10 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-950 hover:bg-white">Review exact-source speakers</Link>
          ) : inspection.plan.cameraReadiness.status !== "READY" ? (
            <a href="#automated-edit-evidence" className="mt-2 flex min-h-10 items-center justify-center rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-[10px] font-black text-violet-950 hover:bg-white">Open speaker-camera mapping</a>
          ) : null}
        </section>
      ) : null}

      {blockingIssues.length || warnings.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {blockingIssues.map((issue) => (
            <div key={`${issue.code}:${issue.recordingAssetId ?? "take"}`} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-bold leading-4 text-amber-950">
              <span className="font-black">Needs review:</span> {issue.message}
            </div>
          ))}
          {warnings.map((issue) => (
            <div key={`${issue.code}:${issue.recordingAssetId ?? "take"}`} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-bold leading-4 text-sky-950">
              <span className="font-black">Can continue:</span> {issue.message}
              {(issue.code === "speaker-attribution-incomplete" || issue.code === "speaker-labels-unavailable") && transcriptReviewBaseHref ? (
                <Link
                  href={`${transcriptReviewBaseHref}#${issue.code === "speaker-attribution-incomplete" ? "speaker-attribution-review" : "transcript-correction-review"}`}
                  className="mt-2 flex min-h-10 items-center justify-center rounded-lg border border-indigo-300 bg-white px-3 py-2 font-black text-indigo-900 hover:bg-indigo-50"
                >
                  {issue.code === "speaker-attribution-incomplete"
                    ? "Review exact-source speaker identity"
                    : "Review exact-source transcript speakers"}
                </Link>
              ) : issue.code === "participant-camera-ambiguous" ? (
                <a
                  href="#automated-edit-evidence"
                  className="mt-2 flex min-h-10 items-center justify-center rounded-lg border border-sky-300 bg-white px-3 py-2 font-black text-sky-900 hover:bg-sky-50"
                >
                  Choose the primary camera
                </a>
              ) : issue.code === "participant-camera-missing" && recordingSourcesHref ? (
                <Link href={recordingSourcesHref} className="mt-2 flex min-h-10 items-center justify-center rounded-lg border border-sky-300 bg-white px-3 py-2 font-black text-sky-900 hover:bg-sky-50">Review missing camera sources</Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void materialize()}
          disabled={disabled || state === "loading" || state === "materializing" || !inspection?.plan.ok || inspection.plan.changed === false || !expectedTimelineFingerprint}
          className="rounded-lg border border-violet-300 bg-violet-700 px-4 py-2 font-black text-white shadow-sm hover:bg-violet-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {state === "materializing"
            ? isEvidenceUpdate ? "Updating take…" : "Building take…"
            : inspection?.plan.changed === false
              ? "Take already materialized"
              : isEvidenceUpdate
                ? "Update episode with current evidence"
                : "Build episode take"}
        </button>
        <button
          type="button"
          onClick={() => setRefreshToken((token) => token + 1)}
          disabled={state === "loading" || state === "materializing"}
          className="rounded-lg border border-violet-200 bg-white px-3 py-2 font-black text-violet-800 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Recheck evidence
        </button>
        <p role="status" aria-live="polite" className="min-w-0 flex-1 text-[10px] font-bold leading-4 text-violet-900">
          {message}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-violet-800" aria-label="Materialization safety boundaries">
        <span className="rounded-full bg-white px-2 py-1">Sources unchanged</span>
        <span className="rounded-full bg-white px-2 py-1">Provider words immutable</span>
        <span className="rounded-full bg-white px-2 py-1">Camera never guessed</span>
        <span className="rounded-full bg-white px-2 py-1">No publication</span>
      </div>
    </section>
  );
}
