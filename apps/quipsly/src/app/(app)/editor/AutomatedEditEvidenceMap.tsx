"use client";

import { useMemo, useState, type MouseEvent } from "react";

import type {
  AiEditProposal,
  AiEditReviewCandidate,
  AiEditSignalVisualization,
} from "@/lib/editor/ai-edit-proposal-contract";

type EvidenceItem =
  | { id: string; kind: "proposal"; item: AiEditProposal }
  | { id: string; kind: "candidate"; item: AiEditReviewCandidate };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

function itemLabel(item: EvidenceItem) {
  if (item.kind === "proposal") {
    if (item.item.type === "deactivate_range") return "Measured range-skip proposal";
    if (item.item.type === "deactivate") return "Transcript-cut proposal";
    return "Camera-reframe proposal";
  }
  return item.item.kind.replaceAll("-", " ");
}

export function automatedEditEvidenceAt(items: EvidenceItem[], seconds: number) {
  return items.filter(({ item }) => (
    seconds >= item.sourceRange.startSeconds && seconds < item.sourceRange.endSeconds
  ));
}

export function automatedEditEvidenceSummary(
  proposals: AiEditProposal[],
  candidates: AiEditReviewCandidate[],
) {
  return {
    proposalCount: proposals.length,
    candidateCount: candidates.length,
    signalBoundCount: [...proposals, ...candidates].filter((item) => item.evidence.audioSignal).length,
    lowEnergyProposalCount: proposals.filter((item) => item.evidence.audioSignal?.classification === "measured-low-energy").length,
  };
}

export function AutomatedEditEvidenceMap({
  proposals,
  candidates,
  signal,
  sourceStartSeconds,
  sourceEndSeconds,
  currentSeconds,
  onSelectTime,
  onProofReview,
}: {
  proposals: AiEditProposal[];
  candidates: AiEditReviewCandidate[];
  signal: AiEditSignalVisualization | null;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  currentSeconds: number;
  onSelectTime: (seconds: number) => void;
  onProofReview: (item: AiEditProposal | AiEditReviewCandidate) => void;
}) {
  const items = useMemo<EvidenceItem[]>(() => [
    ...proposals.map((item) => ({ id: item.proposalId, kind: "proposal" as const, item })),
    ...candidates.map((item) => ({ id: item.candidateId, kind: "candidate" as const, item })),
  ], [candidates, proposals]);
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const selectedRequiresBoundAudio = Boolean(selected?.item.evidence.audioSignal);
  const start = Math.max(0, Math.min(sourceStartSeconds, sourceEndSeconds));
  const end = Math.max(start + 0.001, sourceEndSeconds);
  const duration = end - start;
  const width = 1_000;
  const height = 186;
  const waveformTop = 20;
  const waveformBottom = 100;
  const center = (waveformTop + waveformBottom) / 2;
  const x = (seconds: number) => clamp(((seconds - start) / duration) * width, 0, width);
  const visibleWaveform = signal?.waveform.filter((point) => (
    point.startSeconds < end && point.startSeconds + point.durationSeconds > start
  )) ?? [];
  const summary = useMemo(
    () => automatedEditEvidenceSummary(proposals, candidates),
    [candidates, proposals],
  );
  const atPlayhead = useMemo(
    () => automatedEditEvidenceAt(items, currentSeconds),
    [currentSeconds, items],
  );

  function selectFromClock(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = bounds.width > 0 ? clamp((event.clientX - bounds.left) / bounds.width, 0, 1) : 0;
    onSelectTime(start + fraction * duration);
  }

  return (
    <section aria-label="Automated edit evidence map" className="rounded-xl border border-[#333] bg-[#171717] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-black text-white">Source audio → transcript evidence → edit proposals</h4>
          <p className="mt-1 text-[10px] leading-4 text-gray-400">One source clock. Waveform bars are decoded RMS windows, violet needles are sample peaks, and colored ranges remain unapplied review evidence.</p>
        </div>
        <span className="rounded-full border border-gray-700 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gray-300">
          {summary.proposalCount} proposals · {summary.candidateCount} checks
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold text-gray-400" aria-label="Automated edit evidence legend">
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-slate-500" />Decoded RMS</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-emerald-500" />Reversible proposal</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-sky-500" />Review candidate</span>
        <span><span className="mr-1 inline-block h-3 w-0.5 bg-cyan-300" />Playhead</span>
      </div>
      {signal && <p className="mt-2 break-all rounded-md border border-gray-800 bg-[#10151d] px-2 py-1.5 font-mono text-[8px] leading-4 text-gray-500">Bound source {signal.recordingAssetId} · source {signal.sourceSha256.slice(0, 12)} · profile {signal.signalProfileSha256.slice(0, 12)} · {signal.algorithm}</p>}

      <button
        type="button"
        onClick={selectFromClock}
        className="mt-2 block w-full overflow-hidden rounded-lg border border-gray-700 bg-[#0d1117] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        aria-label={`Edit evidence source clock from ${clock(start)} to ${clock(end)}. Select an exact playback position.`}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Decoded waveform with automated edit evidence over the source clock" preserveAspectRatio="none">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const gridX = fraction * width;
            const seconds = start + fraction * duration;
            return <g key={fraction}><line x1={gridX} x2={gridX} y1="10" y2="170" stroke="#273244" strokeWidth="1" /><text x={clamp(gridX + 5, 5, width - 50)} y="14" fill="#94a3b8" fontSize="9" fontWeight="700">{clock(seconds)}</text></g>;
          })}
          <line x1="0" x2={width} y1={center} y2={center} stroke="#334155" strokeWidth="1" />
          {visibleWaveform.map((point, index) => {
            const pointStart = Math.max(start, point.startSeconds);
            const pointEnd = Math.min(end, point.startSeconds + point.durationSeconds);
            const pointX = x(pointStart);
            const pointWidth = Math.max(1, x(pointEnd) - pointX - 0.4);
            const rmsHeight = Math.max(1, ((clamp(point.rmsDbfs, -96, 0) + 96) / 96) * 35);
            const peakHeight = Math.max(rmsHeight, ((clamp(point.samplePeakDbfs, -96, 0) + 96) / 96) * 38);
            const lowEnergy = signal && point.rmsDbfs <= signal.nearSilenceDbfs;
            return <g key={`${point.startSeconds}-${index}`}><rect x={pointX} y={center - rmsHeight} width={pointWidth} height={rmsHeight * 2} fill={lowEnergy ? "#334155" : "#64748b"}><title>{clock(point.startSeconds)} decoded RMS {point.rmsDbfs.toFixed(1)} dBFS · peak {point.samplePeakDbfs.toFixed(1)} dBFS</title></rect><line x1={pointX + pointWidth / 2} x2={pointX + pointWidth / 2} y1={center - peakHeight} y2={center + peakHeight} stroke={point.clippedFrameCount > 0 ? "#fb7185" : "#a78bfa"} strokeWidth="1" /></g>;
          })}
          {!signal && <text x="500" y="62" textAnchor="middle" fill="#94a3b8" fontSize="13" fontWeight="800">Decoded waveform is not bound to this proposal set</text>}
          <text x="6" y="119" fill="#6ee7b7" fontSize="9" fontWeight="800">PROPOSALS</text>
          {proposals.map((proposal) => <rect key={proposal.proposalId} x={x(proposal.sourceRange.startSeconds)} y="124" width={Math.max(2, x(proposal.sourceRange.endSeconds) - x(proposal.sourceRange.startSeconds))} height="15" rx="2" fill={proposal.proposalId === selectedId ? "#34d399" : "#047857"}><title>{itemLabel({ id: proposal.proposalId, kind: "proposal", item: proposal })} · {clock(proposal.sourceRange.startSeconds)}–{clock(proposal.sourceRange.endSeconds)}</title></rect>)}
          <text x="6" y="151" fill="#7dd3fc" fontSize="9" fontWeight="800">CHECKS</text>
          {candidates.map((candidate) => <rect key={candidate.candidateId} x={x(candidate.sourceRange.startSeconds)} y="156" width={Math.max(2, x(candidate.sourceRange.endSeconds) - x(candidate.sourceRange.startSeconds))} height="15" rx="2" fill={candidate.candidateId === selectedId ? "#38bdf8" : "#0369a1"}><title>{itemLabel({ id: candidate.candidateId, kind: "candidate", item: candidate })} · {clock(candidate.sourceRange.startSeconds)}–{clock(candidate.sourceRange.endSeconds)}</title></rect>)}
          <line x1={x(currentSeconds)} x2={x(currentSeconds)} y1="8" y2="175" stroke="#67e8f9" strokeWidth="2.5"><title>Playhead {clock(currentSeconds)}</title></line>
        </svg>
      </button>

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Source-bound edit evidence ranges">
        {items.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setSelectedId(entry.id);
              onSelectTime(entry.item.sourceRange.startSeconds);
            }}
            className={`rounded-md border px-2 py-1 text-[9px] font-black ${entry.id === selectedId ? "border-cyan-300 bg-cyan-950 text-cyan-100" : "border-gray-700 bg-[#202020] text-gray-300"}`}
          >
            {clock(entry.item.sourceRange.startSeconds)} · {itemLabel(entry)}
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-gray-700 bg-[#10151d] p-3" aria-label="Selected automated edit evidence">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-[10px] font-black uppercase tracking-wider text-cyan-200">{itemLabel(selected)}</p><p className="mt-1 font-mono text-[9px] text-gray-400">source {clock(selected.item.sourceRange.startSeconds)}–{clock(selected.item.sourceRange.endSeconds)}</p></div>
            <button type="button" disabled={selectedRequiresBoundAudio} onClick={() => onProofReview(selected.item)} className="rounded-lg border border-sky-500 px-3 py-1.5 text-[10px] font-black text-sky-200 hover:bg-sky-950 disabled:cursor-not-allowed disabled:border-amber-800 disabled:text-amber-300">{selectedRequiresBoundAudio ? "Protected-source proof required" : selected.kind === "candidate" && selected.item.suggestedAction === "review-camera" ? "Proof-watch source" : selected.kind === "proposal" && selected.item.type !== "deactivate_range" ? "Proof-watch source" : "Proof-listen source"}</button>
          </div>
          <p className="mt-2 text-[10px] font-bold leading-4 text-gray-300">{selected.item.rationale}</p>
          <p className="mt-2 text-[9px] font-black uppercase tracking-wider text-gray-500">{selected.item.confidence} confidence · original unchanged · not applied</p>
          {selected.item.evidence.audioSignal && <p className="mt-2 rounded-md border border-emerald-900 bg-emerald-950/30 px-2 py-1.5 text-[9px] font-bold text-emerald-200">{selected.item.evidence.audioSignal.classification.replaceAll("-", " ")} · {(selected.item.evidence.audioSignal.coverageFraction * 100).toFixed(0)}% decoded coverage · strongest RMS {selected.item.evidence.audioSignal.maximumRmsDbfs.toFixed(1)} dBFS</p>}
          {selectedRequiresBoundAudio && <p className="mt-2 text-[9px] font-bold leading-4 text-amber-300">Quipsly will not write a proof-listen receipt from the program monitor. The protected player must prove it is serving this exact RecordingAsset and source hash first.</p>}
        </div>
      )}

      <p className="mt-2 text-[9px] font-bold leading-4 text-gray-500">At playhead: {atPlayhead.length} evidence range{atPlayhead.length === 1 ? "" : "s"}. {summary.signalBoundCount} range{summary.signalBoundCount === 1 ? " is" : "s are"} bound to decoded audio; {summary.lowEnergyProposalCount} is a measured low-energy proposal. RMS is not LUFS, and display compaction is not sample accuracy.</p>
    </section>
  );
}
