"use client";

import {
  AudioWaveform,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { SessionSourceEvidence } from "./session-source-evidence-model";

type Alignment = {
  jobId: string;
  status:
    | "queued"
    | "processing"
    | "output-ready"
    | "completed"
    | "blocked"
    | "failed";
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  clockAuthority:
    | "capture-clock-proposal"
    | "reported-wall-clock-fallback"
    | null;
  evidence: null | {
    opening: {
      measuredOffsetSeconds: number;
      normalizedCorrelation: number;
      peakMargin: number;
    };
    later: {
      measuredOffsetSeconds: number;
      normalizedCorrelation: number;
      peakMargin: number;
    };
    drift: {
      residualDriftMilliseconds: number;
      observedPartsPerMillion: number;
    };
    qualification: {
      minimumCorrelation: number;
      minimumPeakMargin: number;
      qualifiedForAuthorizedAgentReview: boolean;
      reason: string;
    };
  };
  error: string | null;
  decision: null | {
    revision: number;
    status: "approved" | "revoked";
    signedOffsetSeconds: number;
    targetTimelineStartSeconds: number;
    targetSourceTrimSeconds: number;
    residualDriftMilliseconds: number;
    reason: string | null;
    decidedAt: string;
  };
};

type AlignmentSuggestion =
  | {
      status: "ready";
      generatedAutomatically: true;
      acousticAnalysisStarted: false;
      spineRecordingAssetId: string;
      targetRecordingAssetId: string;
      clockAuthority: "capture-clock-proposal" | "reported-wall-clock-fallback";
      initialOffsetSeconds: number;
      overlapStartSeconds: number;
      overlapEndSeconds: number;
      searchRadiusSeconds: number;
      sharedReference?: null | {
        recordingAssetId: string;
        mode: "audio-reference" | "video-composite";
        targets: Array<{
          recordingAssetId: string;
          initialOffsetSeconds: number;
          overlapStartSeconds: number;
          overlapEndSeconds: number;
          searchRadiusSeconds: number;
          processorCompatible: boolean;
        }>;
        boundaries: {
          participantMastersRemainAuthoritative: true;
          providerReferenceIsOptionalWitness: true;
          exactGenerationReadAndHashed: true;
          referenceCannotReplaceParticipantMaster: true;
        };
      };
    }
  | {
      status: "waiting";
      generatedAutomatically: true;
      acousticAnalysisStarted: false;
      code: string;
      reason: string;
    };

function sourceLabel(source: SessionSourceEvidence["sources"][number]) {
  return source.fileName || source.recordingAssetId;
}

function milliseconds(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 1_000).toFixed(1)} ms`;
}

function compactSignalWaveform(
  source: SessionSourceEvidence["sources"][number] | undefined,
  maximumPoints = 120,
) {
  const signal = source?.analysis?.completeDecode
    ? source.analysis.signal
    : source?.captureRuntime.audioFormat?.signal;
  if (!signal?.waveform.length) return [];
  const bucketSize = Math.max(
    1,
    Math.ceil(signal.waveform.length / maximumPoints),
  );
  const result = [];
  for (let index = 0; index < signal.waveform.length; index += bucketSize) {
    const bucket = signal.waveform.slice(index, index + bucketSize);
    result.push(Math.max(...bucket.map((point) => point.rmsDbfs)));
  }
  return result;
}

function waveformHeight(dbfs: number) {
  return Math.max(6, Math.min(100, ((dbfs + 72) / 72) * 100));
}

function EvidenceQuality({
  evidence,
}: {
  evidence: NonNullable<Alignment["evidence"]>;
}) {
  const windows = [
    { label: "Opening window", value: evidence.opening },
    { label: "Later window", value: evidence.later },
  ];
  return (
    <div
      className="mt-4 grid gap-3 sm:grid-cols-2"
      aria-label="Waveform evidence quality"
    >
      {windows.map((window) => {
        const correlationPass =
          window.value.normalizedCorrelation >=
          evidence.qualification.minimumCorrelation;
        const marginPass =
          window.value.peakMargin >= evidence.qualification.minimumPeakMargin;
        return (
          <div
            key={window.label}
            className="rounded-xl border border-slate-800 bg-slate-900 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-300">
                {window.label}
              </p>
              <span
                className={`text-[9px] font-black uppercase ${correlationPass && marginPass ? "text-emerald-300" : "text-amber-300"}`}
              >
                {correlationPass && marginPass ? "Distinct" : "Held"}
              </span>
            </div>
            <QualityBar
              label="Waveform likeness"
              value={window.value.normalizedCorrelation}
              threshold={evidence.qualification.minimumCorrelation}
              maximum={1}
            />
            <QualityBar
              label="Peak distinctness"
              value={window.value.peakMargin}
              threshold={evidence.qualification.minimumPeakMargin}
              maximum={Math.max(
                0.2,
                evidence.qualification.minimumPeakMargin * 3,
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

function QualityBar({
  label,
  value,
  threshold,
  maximum,
}: {
  label: string;
  value: number;
  threshold: number;
  maximum: number;
}) {
  const width = Math.max(0, Math.min(100, (value / maximum) * 100));
  const thresholdPosition = Math.max(
    0,
    Math.min(100, (threshold / maximum) * 100),
  );
  const passed = value >= threshold;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2 text-[9px] font-bold text-slate-400">
        <span>{label}</span>
        <span className={passed ? "text-emerald-300" : "text-amber-300"}>
          {value.toFixed(3)} / {threshold.toFixed(3)} needed
        </span>
      </div>
      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-slate-950">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${passed ? "bg-emerald-300" : "bg-amber-300"}`}
          style={{ width: `${width}%` }}
        />
        <span
          className="absolute inset-y-0 w-px bg-white"
          style={{ left: `${thresholdPosition}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function SourceClockOverview({
  sources,
  suggestion,
}: {
  sources: SessionSourceEvidence["sources"];
  suggestion: Extract<AlignmentSuggestion, { status: "ready" }>;
}) {
  const spine = sources.find(
    (source) => source.recordingAssetId === suggestion.spineRecordingAssetId,
  );
  const target = sources.find(
    (source) => source.recordingAssetId === suggestion.targetRecordingAssetId,
  );
  const spineDuration = spine?.protectedPlayback?.durationSeconds ?? 0;
  const targetDuration = target?.protectedPlayback?.durationSeconds ?? 0;
  const targetStart = suggestion.initialOffsetSeconds;
  const timelineStart = Math.min(0, targetStart);
  const timelineEnd = Math.max(spineDuration, targetStart + targetDuration);
  const timelineDuration = Math.max(0.001, timelineEnd - timelineStart);
  const percentage = (value: number) =>
    `${Math.max(0, Math.min(100, (value / timelineDuration) * 100))}%`;
  const spineWaveform = compactSignalWaveform(spine);
  const targetWaveform = compactSignalWaveform(target);
  const overlapStart = targetStart + suggestion.overlapStartSeconds;
  const overlapEnd = targetStart + suggestion.overlapEndSeconds;
  const overlapLeft = overlapStart - timelineStart;
  const overlapWidth = Math.max(0, overlapEnd - overlapStart);
  const rows = [
    {
      key: "spine",
      label: spine ? sourceLabel(spine) : "Timeline spine",
      start: -timelineStart,
      duration: spineDuration,
      waveform: spineWaveform,
      trackTone: "bg-cyan-300/25",
      barTone: "bg-cyan-300",
    },
    {
      key: "target",
      label: target ? sourceLabel(target) : "Source to place",
      start: targetStart - timelineStart,
      duration: targetDuration,
      waveform: targetWaveform,
      trackTone: "bg-fuchsia-300/25",
      barTone: "bg-fuchsia-300",
    },
  ];
  return (
    <div
      className="mt-4 rounded-xl border border-sky-800 bg-slate-950/80 p-3"
      role="img"
      aria-label="Two-source clock and waveform overview"
    >
      <div className="flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-wide text-slate-400">
        <span>Earliest retained start</span>
        <span>{timelineDuration.toFixed(2)} s visible</span>
        <span>Latest retained end</span>
      </div>
      <div className="relative mt-2 space-y-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-2">
        <div
          className="pointer-events-none absolute inset-y-0 bg-emerald-300/10 ring-1 ring-inset ring-emerald-300/30"
          style={{
            left: percentage(overlapLeft),
            width: percentage(overlapWidth),
          }}
          aria-hidden="true"
        />
        {rows.map((row) => (
          <div
            key={row.key}
            className="relative grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[7rem_1fr] sm:gap-2"
          >
            <p
              className="truncate text-[9px] font-black text-slate-300"
              title={row.label}
            >
              {row.label}
            </p>
            <div className="relative h-9 overflow-hidden rounded-md bg-slate-950">
              <div
                className={`absolute inset-y-1 flex items-end gap-px overflow-hidden rounded ${row.trackTone} ring-1 ring-inset ring-white/10`}
                style={{
                  left: percentage(row.start),
                  width: percentage(row.duration),
                }}
              >
                {row.waveform.length ? (
                  row.waveform.map((point, index) => (
                    <span
                      key={`${row.key}-${index}`}
                      className={`min-w-px flex-1 rounded-t-sm ${row.barTone}`}
                      style={{ height: `${waveformHeight(point)}%` }}
                    />
                  ))
                ) : (
                  <span
                    className={`m-auto h-1 w-full ${row.barTone} opacity-70`}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-bold text-slate-400">
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-300" />
          Spine
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm bg-fuchsia-300" />
          Source to place
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-300/40" />
          Shared window
        </span>
        <span>
          {spineWaveform.length && targetWaveform.length
            ? "Complete-decode waveforms shown"
            : "Timing envelopes shown; waveforms appear after complete decode"}
        </span>
      </div>
    </div>
  );
}

export function SessionSourceAlignmentCard({
  roomId,
  evidence,
  canManage,
}: {
  roomId: string;
  evidence: SessionSourceEvidence | null;
  canManage: boolean;
}) {
  const sources = useMemo(
    () =>
      (evidence?.sources ?? []).filter(
        (source) =>
          source.status === "VERIFIED_MATCH" &&
          source.protectedPlayback &&
          source.captureGroupId,
      ),
    [evidence],
  );
  const [spineId, setSpineId] = useState(sources[0]?.recordingAssetId ?? "");
  const [targetId, setTargetId] = useState(
    sources.find((source) => source.recordingAssetId !== spineId)
      ?.recordingAssetId ?? "",
  );
  const [alignments, setAlignments] = useState<Alignment[]>([]);
  const [suggestion, setSuggestion] = useState<AlignmentSuggestion | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [showRevoke, setShowRevoke] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function load() {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/source-alignment`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as {
      ok?: boolean;
      alignments?: Alignment[];
      suggestion?: AlignmentSuggestion;
      error?: string;
    };
    if (!response.ok || !payload.ok)
      throw new Error(payload.error || "Could not read Session sync evidence.");
    setAlignments(payload.alignments ?? []);
    setSuggestion(payload.suggestion ?? null);
    if (payload.suggestion?.status === "ready") {
      setSpineId(payload.suggestion.spineRecordingAssetId);
      setTargetId(payload.suggestion.targetRecordingAssetId);
    }
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not read Session sync evidence.",
      ),
    );
    // roomId is the private projection boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const current =
    alignments.find(
      (alignment) =>
        alignment.spineRecordingAssetId === spineId &&
        alignment.targetRecordingAssetId === targetId,
    ) ?? null;

  const pendingAlignment =
    alignments.find((alignment) =>
      ["queued", "processing", "output-ready"].includes(alignment.status),
    ) ?? null;

  const sharedReference =
    suggestion?.status === "ready" ? suggestion.sharedReference : null;
  const sharedReferenceAlignments = sharedReference
    ? alignments.filter(
        (alignment) =>
          alignment.spineRecordingAssetId === sharedReference.recordingAssetId,
      )
    : [];
  const compatibleReferenceTargets =
    sharedReference?.targets.filter((target) => target.processorCompatible) ??
    [];
  const completedReferenceAlignments = sharedReferenceAlignments.filter(
    (alignment) => alignment.status === "completed",
  );
  const referenceAnalysisPending = sharedReferenceAlignments.some((alignment) =>
    ["queued", "processing", "output-ready"].includes(alignment.status),
  );

  useEffect(() => {
    if (
      !pendingAlignment ||
      !["queued", "processing", "output-ready"].includes(
        pendingAlignment.status,
      )
    )
      return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(roomId)}/source-alignment`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "RECONCILE",
              jobId: pendingAlignment.jobId,
            }),
          },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          alignment?: Alignment;
          error?: string;
        };
        if (!response.ok || !payload.ok || !payload.alignment)
          throw new Error(
            payload.error || "Could not refresh Session sync evidence.",
          );
        setAlignments((existing) => [
          payload.alignment!,
          ...existing.filter((item) => item.jobId !== payload.alignment!.jobId),
        ]);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not refresh Session sync evidence.",
        );
      }
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [pendingAlignment, roomId]);

  async function analyze() {
    if (!spineId || !targetId || spineId === targetId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/source-alignment`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "QUEUE",
            spineRecordingAssetId: spineId,
            targetRecordingAssetId: targetId,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        alignment?: Alignment;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.alignment)
        throw new Error(
          payload.error || "Could not start exact-source sync analysis.",
        );
      setAlignments((existing) => [
        payload.alignment!,
        ...existing.filter((item) => item.jobId !== payload.alignment!.jobId),
      ]);
      setMessage(
        payload.alignment.status === "blocked"
          ? ""
          : "Two exact retained sources are being compared at opening and later waveform windows.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not start exact-source sync analysis.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function analyzeSharedReference() {
    if (!sharedReference) return;
    const targets = sharedReference.targets.filter(
      (target) => target.processorCompatible,
    );
    if (!targets.length) return;
    setBusy(true);
    setMessage("");
    let queued = 0;
    try {
      for (const target of targets) {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(roomId)}/source-alignment`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "QUEUE",
              spineRecordingAssetId: sharedReference.recordingAssetId,
              targetRecordingAssetId: target.recordingAssetId,
            }),
          },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          alignment?: Alignment;
          error?: string;
        };
        if (!response.ok || !payload.ok || !payload.alignment)
          throw new Error(
            payload.error ||
              "Could not compare a participant master with the shared room reference.",
          );
        queued += 1;
        setAlignments((existing) => [
          payload.alignment!,
          ...existing.filter((item) => item.jobId !== payload.alignment!.jobId),
        ]);
      }
      setMessage(
        `${queued} participant ${queued === 1 ? "master is" : "masters are"} being compared with the shared room reference. The originals remain authoritative.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not compare the participant masters with the shared room reference.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decide(operation: "APPROVE" | "REVOKE") {
    if (!current) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/source-alignment`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: operation,
            jobId: current.jobId,
            requestId: crypto.randomUUID(),
            expectedRevision: current.decision?.revision ?? 0,
            reason: operation === "REVOKE" ? revokeReason.trim() : "",
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        alignment?: Alignment;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.alignment)
        throw new Error(
          payload.error || "Could not save the measured placement decision.",
        );
      setAlignments((existing) => [
        payload.alignment!,
        ...existing.filter((item) => item.jobId !== payload.alignment!.jobId),
      ]);
      setShowRevoke(false);
      setRevokeReason("");
      setMessage(
        operation === "APPROVE"
          ? "Measured placement is now the Session conversation clock. The decision is reversible and no source bytes changed."
          : "Measured placement revoked. Quipsly returned to its visible capture-clock estimate; the result and decision history remain available.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save the measured placement decision.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sources.length < 2)
    return (
      <section
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        aria-labelledby="session-alignment-heading"
      >
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
          <AudioWaveform size={16} aria-hidden="true" />
          Participant sync evidence
        </p>
        <h2
          id="session-alignment-heading"
          className="mt-1 font-serif text-2xl font-black text-[#3d3122]"
        >
          Two verified sources unlock waveform sync
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">
          Quipsly needs two released, exact-byte-verified recordings from this
          take. It will keep the current clock estimate visible until both
          originals are ready.
        </p>
      </section>
    );

  if (!showAdvanced) {
    const activeMeasuredPlacement = alignments.some(
      (alignment) => alignment.decision?.status === "approved",
    );
    const qualifiedMeasurement = alignments.some(
      (alignment) =>
        alignment.status === "completed" &&
        alignment.evidence?.qualification.qualifiedForAuthorizedAgentReview,
    );
    return (
      <section
        className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"
        aria-labelledby="session-alignment-heading"
      >
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">
          <AudioWaveform size={16} aria-hidden="true" />
          Audio sync
        </p>
        <h2 id="session-alignment-heading" className="mt-1 font-serif text-2xl font-black text-emerald-950">
          {activeMeasuredPlacement
            ? "Measured sync is active"
            : pendingAlignment
              ? "Improving sync in the background"
              : qualifiedMeasurement
                ? "Measured sync is ready"
                : "Recording timeline ready"}
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-emerald-900">
          Quipsly places participant recordings automatically and keeps the originals unchanged. Advanced waveform evidence is available when you need to inspect or fine-tune an unusual recording.
        </p>
        <button
          type="button"
          onClick={() => setShowAdvanced(true)}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 text-[11px] font-black text-emerald-950"
        >
          <AudioWaveform size={15} aria-hidden="true" />
          Open sync details
        </button>
        {message ? <p className="mt-3 text-xs font-bold text-amber-900" role="status">{message}</p> : null}
      </section>
    );
  }

  return (
    <section
      className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-sm sm:p-6"
      aria-labelledby="session-alignment-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
            <AudioWaveform size={16} aria-hidden="true" />
            Participant sync evidence
          </p>
          <h2
            id="session-alignment-heading"
            className="mt-1 font-serif text-3xl font-black"
          >
            Measure the shared moment
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
            Quipsly compares two separated decoded-audio windows from the exact
            retained files. The result measures offset and drift; it never moves
            either source or calls the placement sample-accurate.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-emerald-200">
          <ShieldCheck size={14} aria-hidden="true" />
          Originals remain truth
        </span>
      </div>
      <button type="button" onClick={() => setShowAdvanced(false)} className="mt-4 min-h-9 rounded-full border border-slate-700 px-3 text-[10px] font-black text-slate-200">Hide sync details</button>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="text-[10px] font-black uppercase tracking-wide text-cyan-100">
          Timeline spine
          <select
            value={spineId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setSpineId(value);
              if (value === targetId)
                setTargetId(
                  sources.find((source) => source.recordingAssetId !== value)
                    ?.recordingAssetId ?? "",
                );
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold normal-case tracking-normal text-white"
          >
            {sources.map((source) => (
              <option
                key={source.recordingAssetId}
                value={source.recordingAssetId}
              >
                {sourceLabel(source)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-cyan-100">
          Source to place
          <select
            value={targetId}
            onChange={(event) => setTargetId(event.currentTarget.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold normal-case tracking-normal text-white"
          >
            {sources
              .filter((source) => source.recordingAssetId !== spineId)
              .map((source) => (
                <option
                  key={source.recordingAssetId}
                  value={source.recordingAssetId}
                >
                  {sourceLabel(source)}
                </option>
              ))}
          </select>
        </label>
      </div>
      {suggestion?.status === "ready" && !current ? (
        <div
          className="mt-5 rounded-2xl border border-sky-700 bg-sky-950/50 p-4"
          role="region"
          aria-label="Automatic capture clock suggestion"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-black text-sky-100">
              Capture clocks found a shared recording window
            </p>
            <span className="rounded-full border border-sky-700 px-2.5 py-1 text-[9px] font-black uppercase text-sky-200">
              No processing started
            </span>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Estimated offset"
              value={milliseconds(suggestion.initialOffsetSeconds)}
            />
            <Metric
              label="Shared window"
              value={`${suggestion.overlapStartSeconds.toFixed(2)}–${suggestion.overlapEndSeconds.toFixed(2)} s`}
            />
            <Metric
              label="Waveform search"
              value={`±${suggestion.searchRadiusSeconds.toFixed(2)} s`}
            />
          </dl>
          <p className="mt-3 text-xs font-semibold leading-5 text-sky-100/80">
            This automatic estimate comes from retained capture timing. It is a
            starting point, not an acoustic match or an applied edit. Compare
            waveforms to measure the opening offset and later drift from the
            exact source bytes.
          </p>
          <SourceClockOverview sources={sources} suggestion={suggestion} />
        </div>
      ) : suggestion?.status === "waiting" && sources.length >= 2 ? (
        <p className="mt-5 rounded-2xl border border-amber-700 bg-amber-950/40 p-4 text-sm font-bold text-amber-100">
          {suggestion.reason}
        </p>
      ) : null}
      {sharedReference ? (
        <div
          className="mt-5 rounded-2xl border border-violet-700 bg-violet-950/35 p-4"
          role="region"
          aria-label="Shared room sync reference"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-violet-100">
                Shared room reference ready
              </p>
              <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-violet-100/80">
                Quipsly also retained lightweight room audio heard by everyone.
                It can help each isolated high-quality master find the same
                moment when direct master-to-master audio is too different.
              </p>
            </div>
            <span className="rounded-full border border-violet-700 px-2.5 py-1 text-[9px] font-black uppercase text-violet-200">
              Reference only · never the master
            </span>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Reference"
              value={
                sharedReference.mode === "audio-reference"
                  ? "Room audio"
                  : "Room video mix"
              }
            />
            <Metric
              label="Masters compared"
              value={`${completedReferenceAlignments.length}/${compatibleReferenceTargets.length}`}
            />
            <Metric label="Integrity" value="Generation + SHA bound" />
          </dl>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {sharedReference.targets.map((target) => {
              const source = sources.find(
                (candidate) =>
                  candidate.recordingAssetId === target.recordingAssetId,
              );
              const alignment = sharedReferenceAlignments.find(
                (candidate) =>
                  candidate.targetRecordingAssetId === target.recordingAssetId,
              );
              return (
                <div
                  key={target.recordingAssetId}
                  className="rounded-xl border border-violet-900 bg-slate-950/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-black text-violet-100">
                      {source ? sourceLabel(source) : target.recordingAssetId}
                    </p>
                    <span className="text-[9px] font-black uppercase text-violet-300">
                      {alignment?.status ??
                        (target.processorCompatible
                          ? "ready"
                          : "materialization needed")}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    Clock estimate {milliseconds(target.initialOffsetSeconds)} ·
                    shared window {target.overlapStartSeconds.toFixed(1)}–
                    {target.overlapEndSeconds.toFixed(1)}s
                  </p>
                </div>
              );
            })}
          </div>
          {compatibleReferenceTargets.length ? (
            <button
              type="button"
              disabled={!canManage || busy || referenceAnalysisPending}
              onClick={() => void analyzeSharedReference()}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-violet-200 px-4 text-[10px] font-black text-violet-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy || referenceAnalysisPending ? (
                <LoaderCircle
                  size={15}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <AudioWaveform size={15} aria-hidden="true" />
              )}
              {completedReferenceAlignments.length
                ? "Compare with room reference again"
                : "Strengthen sync with room reference"}
            </button>
          ) : (
            <p className="mt-3 rounded-xl border border-amber-800 bg-amber-950/40 p-3 text-xs font-semibold text-amber-100">
              The reference is safely retained, but these sources must be
              materialized in one processor before waveform comparison can run.
              Capture-clock placement remains active.
            </p>
          )}
          <p className="mt-3 text-[10px] font-semibold leading-4 text-violet-200/70">
            This produces review evidence only. Participant originals remain
            unchanged and authoritative, and no timeline placement is applied
            automatically.
          </p>
        </div>
      ) : null}
      {current?.evidence ? (
        <div className="mt-5 rounded-2xl border border-cyan-700 bg-slate-950/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-black text-cyan-100">
              <CheckCircle2
                size={18}
                className={
                  current.evidence.qualification
                    .qualifiedForAuthorizedAgentReview
                    ? "text-emerald-300"
                    : "text-amber-300"
                }
                aria-hidden="true"
              />
              {current.evidence.qualification.qualifiedForAuthorizedAgentReview
                ? "Distinct peaks ready for protected review"
                : "Waveform match needs more evidence"}
            </p>
            <span className="rounded-full border border-slate-600 px-2.5 py-1 text-[9px] font-black uppercase text-slate-300">
              {current.clockAuthority?.replaceAll("-", " ") ||
                "clock authority retained"}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            <Metric
              label="Opening offset"
              value={milliseconds(
                current.evidence.opening.measuredOffsetSeconds,
              )}
            />
            <Metric
              label="Later offset"
              value={milliseconds(current.evidence.later.measuredOffsetSeconds)}
            />
            <Metric
              label="Residual drift"
              value={`${current.evidence.drift.residualDriftMilliseconds.toFixed(1)} ms`}
            />
            <Metric
              label="Observed drift"
              value={`${current.evidence.drift.observedPartsPerMillion.toFixed(1)} ppm`}
            />
          </dl>
          {suggestion?.status === "ready" ? (
            <p className="mt-3 rounded-xl border border-sky-900 bg-sky-950/40 p-3 text-xs font-semibold leading-5 text-sky-100">
              The retained capture clocks estimated{" "}
              {milliseconds(suggestion.initialOffsetSeconds)}. The decoded
              waveforms measured{" "}
              {milliseconds(current.evidence.opening.measuredOffsetSeconds)}, a{" "}
              {milliseconds(
                current.evidence.opening.measuredOffsetSeconds -
                  suggestion.initialOffsetSeconds,
              )}{" "}
              difference.
            </p>
          ) : null}
          <EvidenceQuality evidence={current.evidence} />
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-300">
            {current.evidence.qualification.reason}
          </p>
          {!current.evidence.qualification.qualifiedForAuthorizedAgentReview ? (
            <div className="mt-3 flex gap-3 rounded-xl border border-amber-800 bg-amber-950/40 p-3 text-xs font-semibold leading-5 text-amber-100">
              <CircleAlert
                className="mt-0.5 shrink-0"
                size={17}
                aria-hidden="true"
              />
              <p>
                Quipsly kept the capture-clock estimate and changed nothing.
                Repeating tones, silence, or similar background noise can
                produce several equally plausible peaks. Speech, a clap, or
                another distinct shared sound gives the analyzer stronger
                evidence.
              </p>
            </div>
          ) : null}
          <p className="mt-2 text-[9px] font-black uppercase tracking-wide text-slate-500">
            Opening corr{" "}
            {current.evidence.opening.normalizedCorrelation.toFixed(3)} · peak
            margin {current.evidence.opening.peakMargin.toFixed(3)} · later corr{" "}
            {current.evidence.later.normalizedCorrelation.toFixed(3)} · peak
            margin {current.evidence.later.peakMargin.toFixed(3)}
          </p>
          {current.decision ? (
            <div
              className={`mt-4 rounded-xl border p-3 ${current.decision.status === "approved" ? "border-emerald-700 bg-emerald-950/50 text-emerald-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}
            >
              <p className="text-xs font-black">
                {current.decision.status === "approved"
                  ? "Measured placement active"
                  : "Measured placement revoked"}
              </p>
              <p className="mt-1 text-[10px] font-semibold leading-4">
                Signed offset{" "}
                {milliseconds(current.decision.signedOffsetSeconds)} · target
                begins at{" "}
                {current.decision.targetTimelineStartSeconds.toFixed(3)}s ·
                source trim{" "}
                {current.decision.targetSourceTrimSeconds.toFixed(3)}s ·
                revision {current.decision.revision}. No drift correction or
                source mutation was applied.
              </p>
              {current.decision.reason ? (
                <p className="mt-1 text-[10px] font-bold">
                  Reason: {current.decision.reason}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {current.evidence.qualification.qualifiedForAuthorizedAgentReview &&
            current.decision?.status !== "approved" ? (
              <button
                type="button"
                disabled={!canManage || busy}
                onClick={() => void decide("APPROVE")}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-emerald-300 px-4 text-[10px] font-black text-emerald-950 disabled:opacity-50"
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                Use measured placement
              </button>
            ) : null}
            {current.decision?.status === "approved" ? (
              <button
                type="button"
                disabled={!canManage || busy}
                onClick={() => setShowRevoke(true)}
                className="inline-flex min-h-10 items-center rounded-full border border-rose-700 px-4 text-[10px] font-black text-rose-200 disabled:opacity-50"
              >
                Revoke placement
              </button>
            ) : null}
          </div>
          {showRevoke && current.decision?.status === "approved" ? (
            <div className="mt-3 rounded-xl border border-rose-800 bg-rose-950/40 p-3">
              <label className="text-[10px] font-black uppercase tracking-wide text-rose-100">
                Why should this placement stop being used?
                <textarea
                  value={revokeReason}
                  onChange={(event) =>
                    setRevokeReason(event.currentTarget.value)
                  }
                  maxLength={2_000}
                  className="mt-1 min-h-20 w-full rounded-lg border border-rose-800 bg-slate-950 p-3 text-xs font-semibold normal-case tracking-normal text-white"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !revokeReason.trim()}
                  onClick={() => void decide("REVOKE")}
                  className="min-h-10 rounded-full bg-rose-300 px-4 text-[10px] font-black text-rose-950 disabled:opacity-50"
                >
                  Confirm revoke
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRevoke(false);
                    setRevokeReason("");
                  }}
                  className="min-h-10 rounded-full border border-slate-600 px-4 text-[10px] font-black"
                >
                  Keep placement
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : current ? (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-700 bg-amber-950/40 p-4 text-sm font-bold text-amber-100">
          {["queued", "processing", "output-ready"].includes(current.status) ? (
            <LoaderCircle
              size={18}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <RefreshCw size={18} aria-hidden="true" />
          )}
          <span>
            {current.error || `Exact-source analysis is ${current.status}.`}
          </span>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={
            !canManage ||
            busy ||
            !targetId ||
            spineId === targetId ||
            ["queued", "processing", "output-ready"].includes(
              current?.status ?? "",
            )
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-200 px-5 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ||
          ["queued", "processing", "output-ready"].includes(
            current?.status ?? "",
          ) ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <AudioWaveform size={16} aria-hidden="true" />
          )}
          {current?.evidence
            ? "Analyze these exact sources again"
            : "Compare exact-source waveforms"}
        </button>
        <p className="text-[10px] font-semibold leading-4 text-slate-400">
          Analysis only creates evidence. Choosing “Use measured placement”
          applies it reversibly to the Session conversation clock; neither
          action changes the originals.
        </p>
      </div>
      {!canManage ? (
        <p className="mt-3 text-xs font-bold text-amber-200">
          A Session coach, host, participant, or owner can request processing.
          You can still read completed evidence.
        </p>
      ) : null}
      {message ? (
        <p
          className="mt-3 rounded-xl border border-cyan-800 bg-cyan-950/50 p-3 text-xs font-bold text-cyan-100"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <dt className="text-[9px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm font-black text-white">{value}</dd>
    </div>
  );
}
