"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Inspection = {
  ok: boolean;
  captureGroupId: string;
  sourceCount: number;
  transcriptJobId: string | null;
  productionUpdatedAt: string;
  plan: {
    ok: boolean;
    status: "blocked" | "media-ready" | "assembly-ready";
    roomId: string;
    changed: boolean;
    nextAction: string;
    transcriptBinding: null | {
      recordingAssetId: string;
      blockIds: string[];
      speakerAttributionComplete: boolean;
    };
    issues: Array<{
      code: string;
      severity: "blocker" | "warning";
      message: string;
    }>;
    impact: null | {
      operation: "initial-materialization" | "evidence-update" | "no-change";
      sourceLanesCreated: number;
      sourceLanesReused: number;
      transcriptBlocksAdded: number;
      transcriptBlocksReplaced: number;
      unrelatedTimelineClipsPreserved: number;
      unrelatedTranscriptBlocksPreserved: number;
    };
  };
  error?: string;
};

function statusLabel(inspection: Inspection | null) {
  if (!inspection) return "Inspecting";
  if (!inspection.plan.ok) return "Held";
  if (!inspection.plan.changed) return "Current";
  return inspection.plan.transcriptBinding ? "Transcript ready" : "Sources ready";
}

function actionLabel(inspection: Inspection | null) {
  if (!inspection) return "Inspecting evidence…";
  if (!inspection.plan.ok) return "Resolve held evidence";
  if (!inspection.plan.changed) return "Take is current";
  return inspection.plan.transcriptBinding
    ? "Bring sources + transcript into edit"
    : "Bring sources into edit";
}

export function EpisodeCaptureTakeHandoff({
  projectSlug,
  episodeSlug,
  captureGroupId,
  expectedTimelineFingerprint,
  canEdit,
  onMaterialized,
}: {
  projectSlug: string;
  episodeSlug: string;
  captureGroupId: string;
  expectedTimelineFingerprint: string;
  canEdit: boolean;
  onMaterialized: () => Promise<void> | void;
}) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Checking immutable Capture sources, reviewed alignment, and transcript evidence…");

  const inspect = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    const query = new URLSearchParams({ projectSlug, episodeSlug, captureGroupId });
    const response = await fetch(`/api/episode-production/capture-takes?${query.toString()}`, {
      cache: "no-store",
      signal,
    });
    const result = await response.json() as Inspection;
    if (!response.ok || !result.ok) throw new Error(result.error ?? "Capture evidence inspection failed.");
    setInspection(result);
    setMessage(result.plan.nextAction);
    setBusy(false);
  }, [captureGroupId, episodeSlug, projectSlug]);

  useEffect(() => {
    const controller = new AbortController();
    void inspect(controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Capture evidence inspection failed.");
    });
    return () => controller.abort();
  }, [inspect]);

  const materialize = async () => {
    if (!inspection?.plan.ok || !inspection.plan.changed || !canEdit) return;
    setBusy(true);
    setMessage("Bringing the reviewed Capture take onto the canonical Episode clock…");
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
      const result = await response.json() as Inspection;
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Capture take materialization failed.");
      setInspection(result);
      setMessage(result.plan.transcriptBinding
        ? "The reviewed sources and transcript now share the Episode clock."
        : "The reviewed sources now share the Episode clock; the transcript remains pending.");
      await onMaterialized();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Capture take materialization failed.");
    } finally {
      setBusy(false);
    }
  };

  const blockers = inspection?.plan.issues.filter((issue) => issue.severity === "blocker") ?? [];
  const transcriptHref = inspection?.plan.roomId
    ? `/sessions/${encodeURIComponent(inspection.plan.roomId)}?mode=transcript${inspection.plan.transcriptBinding?.recordingAssetId ? `&source=${encodeURIComponent(inspection.plan.transcriptBinding.recordingAssetId)}` : ""}`
    : null;
  const impact = inspection?.plan.impact;

  return (
    <section className="mt-3 rounded-2xl border border-[#6d5c38] bg-[#181d14] p-4" aria-labelledby="capture-handoff-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#d8ad56]">Capture → shared edit</p>
          <h3 id="capture-handoff-title" className="mt-1 font-serif text-xl text-[#f2ead8]">Put this take on the Episode clock</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#aab9af]">Quipsly rechecks exact source bytes, complete audio decode, and every non-spine alignment. It preserves provider words and existing human edit decisions.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${inspection?.plan.ok ? "bg-[#244b34] text-[#b8e0c4]" : "bg-amber-900/50 text-amber-100"}`}>
          {busy ? "Working" : statusLabel(inspection)}
        </span>
      </div>

      {inspection ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-[#101811] p-3"><span className="block text-[9px] font-black uppercase text-[#8fa094]">Protected sources</span><strong className="mt-1 block text-lg">{inspection.sourceCount}</strong></div>
          <div className="rounded-xl bg-[#101811] p-3"><span className="block text-[9px] font-black uppercase text-[#8fa094]">Timed transcript</span><strong className="mt-1 block text-lg">{inspection.plan.transcriptBinding ? `${inspection.plan.transcriptBinding.blockIds.length} turns` : "Pending"}</strong></div>
          <div className="rounded-xl bg-[#101811] p-3"><span className="block text-[9px] font-black uppercase text-[#8fa094]">Write</span><strong className="mt-1 block text-lg">{!inspection.plan.ok ? "Held safely" : impact?.operation === "evidence-update" ? "Evidence update" : impact?.operation === "no-change" ? "No change" : "First handoff"}</strong></div>
        </div>
      ) : null}

      {impact ? (
        <p className="mt-3 rounded-xl bg-[#101811] px-3 py-2 text-xs text-[#b7c4b8]">
          {impact.sourceLanesCreated} source lanes added · {impact.sourceLanesReused} reused · {impact.transcriptBlocksAdded} transcript turns added · {impact.unrelatedTimelineClipsPreserved} other clips preserved
        </p>
      ) : null}

      <p className="mt-3 text-xs font-semibold leading-5 text-[#d7c69d]" aria-live="polite">{message}</p>
      {blockers.map((issue) => <p key={issue.code} className="mt-2 rounded-xl bg-amber-950/40 px-3 py-2 text-xs text-amber-100">{issue.message}</p>)}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !canEdit || !inspection?.plan.ok || !inspection.plan.changed}
          onClick={() => void materialize()}
          className="min-h-11 rounded-xl bg-[#d8ad56] px-4 py-2 text-sm font-black text-[#172018] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {actionLabel(inspection)}
        </button>
        {transcriptHref ? <Link href={transcriptHref} className="inline-flex min-h-11 items-center rounded-xl border border-[#587160] px-4 text-sm font-black text-[#e7c97d]">Review source transcript</Link> : null}
      </div>
    </section>
  );
}
