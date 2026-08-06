"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AudioEvidenceMap, type AudioEvidenceTranscriptWord } from "@/components/audio/AudioEvidenceMap";
import { SpectralEvidenceViewer } from "@/components/audio/SpectralEvidenceViewer";
import type { SpectralEvidenceMarker, SpectralLoudnessEvidence } from "@/components/audio/spectral-evidence-overlay";
import { transcriptConfidenceTriagePolicy, type AudioTranscriptEvidence } from "@/lib/transcript-evidence";

type ReviewCorrection = {
  id: string;
  status: string;
  origin: string;
  correctedText: string | null;
  correctedSpeakerLabel: string | null;
  reason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  revisions: Array<{ revision: number; operation: string; createdAt: string }>;
};

type ReviewSegment = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  providerText: string;
  providerTextSha256: string;
  providerSpeakerLabel: string | null;
  text: string;
  speakerLabel: string | null;
  confidence: number | null;
  acceptedCorrection: ReviewCorrection | null;
  confirmedAsIs: { id: string; reviewedAt: string } | null;
  words: Array<{
    id: string;
    providerWordIndex: number;
    startSeconds: number;
    endSeconds: number;
    punctuatedWord: string;
    confidence: number | null;
  }>;
};

type ReviewDesk = {
  ok: true;
  transcriptJobId: string;
  provider: string;
  language: string | null;
  playback: { sourceId: string; url: string; kind: "audio" | "video"; label: string; durationSeconds: number | null };
  source: { assetId: string; sourceId: string; sha256: string; generation: string };
  coverage: {
    segmentCount: number;
    wordCount: number;
    correctionReceiptCount: number;
    activeCorrectionCount: number;
    playbackVerificationCount: number;
    startSeconds: number | null;
    endSeconds: number | null;
  };
  page: { count: number; hasMore: boolean; nextAfterSegmentId: string | null };
  segments: ReviewSegment[];
};

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function requestId() {
  return crypto.randomUUID();
}

function probabilityTone(confidence: number | null) {
  if (confidence === null) return "border-slate-200 bg-slate-50 text-slate-700";
  if (confidence >= 0.9) return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (confidence >= 0.7) return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-rose-200 bg-rose-50 text-rose-950";
}

export function StudioTranscriptReviewDesk({
  projectId,
  projectSlug,
  episodeSlug,
  assetId,
  sourceId,
  audioSignal = null,
  audioSignalStatus = "not-queued",
  audioSignalError = null,
  isAudioSignalWorking = false,
  onRequestAudioSignal,
  processingEvidenceMarkers = [],
  loudnessEvidence = null,
}: {
  projectId?: string;
  projectSlug: string;
  episodeSlug: string;
  assetId: string;
  sourceId: string;
  audioSignal?: NonNullable<AudioTranscriptEvidence["audio"]["signal"]> | null;
  audioSignalStatus?: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  audioSignalError?: string | null;
  isAudioSignalWorking?: boolean;
  onRequestAudioSignal?: () => void;
  processingEvidenceMarkers?: SpectralEvidenceMarker[];
  loudnessEvidence?: SpectralLoudnessEvidence | null;
}) {
  const playerRef = useRef<HTMLMediaElement | null>(null);
  const playbackActiveRef = useRef(false);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [desk, setDesk] = useState<ReviewDesk | null>(null);
  const [segments, setSegments] = useState<ReviewSegment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftSpeaker, setDraftSpeaker] = useState("");
  const [reason, setReason] = useState("");
  const [playbackPosition, setPlaybackPosition] = useState<number | null>(null);
  const [heardSelected, setHeardSelected] = useState(false);
  const [status, setStatus] = useState("Loading transcript review evidence…");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      playerRef.current?.pause();
      playbackActiveRef.current = false;
      window.requestAnimationFrame(() => openButtonRef.current?.focus());
    };
  }, [expanded]);

  const selected = useMemo(
    () => segments.find((segment) => segment.id === selectedId) ?? null,
    [segments, selectedId],
  );
  const transcriptWords = useMemo<AudioEvidenceTranscriptWord[]>(() => segments.flatMap((segment) => (
    segment.words.map((word) => ({
      id: word.id,
      segmentId: segment.id,
      text: word.punctuatedWord,
      startSeconds: word.startSeconds,
      endSeconds: word.endSeconds,
      confidence: word.confidence,
      reviewState: segment.acceptedCorrection
        ? "corrected" as const
        : segment.confirmedAsIs
          ? "confirmed" as const
          : "unchecked" as const,
    }))
  )).sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds || left.id.localeCompare(right.id)), [segments]);
  const confidenceTriagePolicy = useMemo(() => transcriptConfidenceTriagePolicy({
    provider: desk?.provider,
    hasConfidenceEvidence: transcriptWords.some((word) => word.confidence !== null),
  }), [desk?.provider, transcriptWords]);
  const spectralEvidenceMarkers = useMemo<SpectralEvidenceMarker[]>(() => [
    ...(audioSignal?.observations ?? []).map((observation, index) => ({
      id: `signal-${observation.kind}-${observation.startSeconds}-${index}`,
      category: "signal" as const,
      startSeconds: observation.startSeconds,
      endSeconds: observation.endSeconds,
      label: observation.kind.replaceAll("-", " "),
      detail: observation.detail,
      severity: observation.severity,
    })),
    ...processingEvidenceMarkers,
  ], [audioSignal?.observations, processingEvidenceMarkers]);

  const selectSegment = useCallback((segment: ReviewSegment, play = false) => {
    playbackActiveRef.current = false;
    setSelectedId(segment.id);
    setDraftText(segment.text);
    setDraftSpeaker(segment.speakerLabel ?? "");
    setReason("");
    setHeardSelected(false);
    setPlaybackPosition(null);
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, segment.startSeconds - 0.2);
    if (play) void player.play().catch(() => undefined);
  }, []);

  const loadPage = useCallback(async (afterSegmentId?: string | null) => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({ ...(projectId ? { projectId } : {}), projectSlug, episodeSlug, assetId, sourceId, limit: "40" });
      if (afterSegmentId) query.set("afterSegmentId", afterSegmentId);
      const response = await fetch(`/api/media-vault/source-transcript/review?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json() as ReviewDesk & { error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Transcript review evidence is unavailable.");
      setDesk(payload);
      setSegments((current) => afterSegmentId
        ? [...current, ...payload.segments.filter((segment) => !current.some((existing) => existing.id === segment.id))]
        : payload.segments);
      if (!afterSegmentId && payload.segments[0]) {
        const first = payload.segments[0];
        setSelectedId(first.id);
        setDraftText(first.text);
        setDraftSpeaker(first.speakerLabel ?? "");
      }
      setStatus(`Loaded ${afterSegmentId ? "another" : "the first"} ${payload.segments.length} source-bound segment${payload.segments.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Transcript review evidence is unavailable.");
    } finally {
      setIsLoading(false);
    }
  }, [assetId, episodeSlug, projectId, projectSlug, sourceId]);

  useEffect(() => {
    void loadPage(null);
  }, [loadPage]);

  useEffect(() => {
    if (!selected) return;
    setDraftText(selected.text);
    setDraftSpeaker(selected.speakerLabel ?? "");
  }, [selected]);

  const onPlaybackTime = useCallback((position: number) => {
    setPlaybackPosition(position);
    if (!selected || !playbackActiveRef.current) return;
    if (position >= Math.max(0, selected.startSeconds - 0.5) && position <= selected.endSeconds + 1.5) {
      setHeardSelected(true);
    }
  }, [selected]);

  const selectEvidenceTime = useCallback((seconds: number, play: boolean) => {
    playbackActiveRef.current = false;
    const player = playerRef.current;
    const segment = segments.find((candidate) => seconds >= candidate.startSeconds && seconds <= candidate.endSeconds);
    if (segment) {
      setSelectedId(segment.id);
      setDraftText(segment.text);
      setDraftSpeaker(segment.speakerLabel ?? "");
      setReason("");
    }
    setHeardSelected(false);
    setPlaybackPosition(Math.max(0, seconds));
    if (!player) return;
    player.currentTime = Math.max(0, seconds);
    if (play) void player.play().catch(() => undefined);
  }, [segments]);

  const operate = useCallback(async (action: "correct" | "confirm-as-is") => {
    if (!selected || playbackPosition === null || !heardSelected) return;
    setIsSaving(true);
    setStatus(action === "correct" ? "Saving the reviewed correction overlay…" : "Recording the playback verification…");
    try {
      const response = await fetch("/api/media-vault/source-transcript/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(projectId ? { projectId } : {}),
          projectSlug,
          episodeSlug,
          assetId,
          sourceId,
          segmentId: selected.id,
          clientRequestId: requestId(),
          expectedText: selected.providerText,
          expectedSpeakerLabel: selected.providerSpeakerLabel,
          expectedAcceptedCorrectionId: selected.acceptedCorrection?.id ?? null,
          correctedText: draftText,
          correctedSpeakerLabel: draftSpeaker || null,
          reason: reason || null,
          reviewNote: reason || null,
          confirmedAgainstPlayback: true,
          playbackPositionSeconds: playbackPosition,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; correction?: ReviewCorrection; verification?: { id: string; reviewedAt: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The review decision was not saved.");
      setSegments((current) => current.map((segment) => segment.id !== selected.id ? segment : action === "correct" && payload.correction
        ? {
            ...segment,
            text: payload.correction.correctedText ?? segment.providerText,
            speakerLabel: payload.correction.correctedSpeakerLabel ?? segment.providerSpeakerLabel,
            acceptedCorrection: payload.correction,
            confirmedAsIs: null,
          }
        : {
            ...segment,
            confirmedAsIs: payload.verification ? { id: payload.verification.id, reviewedAt: payload.verification.reviewedAt } : segment.confirmedAsIs,
          }));
      setDesk((current) => current ? {
        ...current,
        coverage: {
          ...current.coverage,
          correctionReceiptCount: current.coverage.correctionReceiptCount + (action === "correct" ? 1 : 0),
          activeCorrectionCount: current.coverage.activeCorrectionCount + (action === "correct" && !selected.acceptedCorrection ? 1 : 0),
          playbackVerificationCount: current.coverage.playbackVerificationCount + (action === "confirm-as-is" ? 1 : 0),
        },
      } : current);
      setStatus(action === "correct"
        ? `Correction accepted as a versioned overlay at ${clock(playbackPosition)}. Provider words and media are unchanged.`
        : `Segment confirmed as heard at ${clock(playbackPosition)}. Provider words and media are unchanged.`);
      setHeardSelected(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The review decision was not saved.");
    } finally {
      setIsSaving(false);
    }
  }, [assetId, draftSpeaker, draftText, episodeSlug, heardSelected, playbackPosition, projectId, projectSlug, reason, selected, sourceId]);

  const reviewReady = Boolean(selected && heardSelected && playbackPosition !== null);
  const changed = Boolean(selected && (draftText.trim() !== selected.providerText || (draftSpeaker.trim() || null) !== selected.providerSpeakerLabel));
  const reviewedLoaded = segments.filter((segment) => segment.acceptedCorrection || segment.confirmedAsIs).length;

  return (
    <>
      <section aria-label="Studio transcript and audio review summary" className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3 text-white">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-200">Transcript + audio evidence</p>
            <p className="mt-1 text-[10px] font-bold leading-4 text-slate-300">{desk ? `${desk.coverage.segmentCount} timed segments · ${desk.coverage.wordCount} words` : status}</p>
            <p className="mt-1 text-[9px] font-bold leading-4 text-slate-500">{audioSignal?.frequencyProfile ? `${audioSignal.frequencyProfile.bands.length}-band complete-decode frequency map ready` : audioSignal ? "Complete-decode level map ready" : "Decoded audio map not ready"} · protected playback review</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${desk && audioSignal ? "border-emerald-700 bg-emerald-950 text-emerald-200" : "border-amber-700 bg-amber-950 text-amber-200"}`}>{desk && audioSignal ? "Ready" : isLoading ? "Loading" : "Attention"}</span>
        </div>
        <button ref={openButtonRef} type="button" onClick={() => setExpanded(true)} className="mt-2 w-full rounded-md bg-cyan-200 px-3 py-2 text-[10px] font-black text-cyan-950 hover:bg-cyan-100">Open transcript and audio desk</button>
      </section>
      {expanded && createPortal(
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/80 p-2 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-labelledby="studio-transcript-audio-dialog-title">
          <div className="max-h-[96vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#fffdf7] p-3 shadow-2xl sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-800">Immutable source review</p><h2 id="studio-transcript-audio-dialog-title" className="mt-1 text-xl font-black text-[#3d3122]">Transcript and audio evidence desk</h2></div>
              <button ref={closeButtonRef} type="button" onClick={() => setExpanded(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-900 hover:bg-slate-100">Close</button>
            </div>
    <section aria-label="Playback-verified transcript correction desk" className="rounded-xl border border-cyan-300 bg-white p-3 text-[#3d3122] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-800">Source-bound review desk</div>
          <h4 className="mt-1 text-sm font-black">Listen, correct, or confirm—without rewriting provider evidence</h4>
          <p className="mt-1 text-[10px] font-bold leading-4 text-[#7a674c]">Word colors show provider probability, not measured accuracy. Every accepted review remains an overlay with its playback receipt.</p>
        </div>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 font-mono text-[9px] font-black text-cyan-900">
          {reviewedLoaded}/{segments.length} loaded reviewed
        </span>
      </div>

      {desk?.playback.kind === "video" ? (
        <video
          ref={(node) => { playerRef.current = node; }}
          controls
          preload="metadata"
          src={desk.playback.url}
          className="mt-3 max-h-64 w-full rounded-lg bg-black"
          aria-label={`Protected transcript source: ${desk.playback.label}`}
          onTimeUpdate={(event) => onPlaybackTime(event.currentTarget.currentTime)}
          onPlay={() => { playbackActiveRef.current = true; }}
          onPause={() => { playbackActiveRef.current = false; }}
          onEnded={() => { playbackActiveRef.current = false; }}
        />
      ) : desk?.playback ? (
        <audio
          ref={(node) => { playerRef.current = node; }}
          controls
          preload="metadata"
          src={desk.playback.url}
          className="mt-3 w-full"
          aria-label={`Protected transcript source: ${desk.playback.label}`}
          onTimeUpdate={(event) => onPlaybackTime(event.currentTarget.currentTime)}
          onPlay={() => { playbackActiveRef.current = true; }}
          onPause={() => { playbackActiveRef.current = false; }}
          onEnded={() => { playbackActiveRef.current = false; }}
        />
      ) : null}

      {audioSignal ? (
        <><AudioEvidenceMap
          signal={audioSignal}
          timelineEvents={[]}
          transcriptEndSeconds={desk?.coverage.endSeconds ?? null}
          playbackReady={Boolean(desk?.playback)}
          selectedSeconds={playbackPosition ?? selected?.startSeconds ?? 0}
          transcriptWords={transcriptWords}
          lowConfidenceThreshold={confidenceTriagePolicy.threshold}
          providerLabel={desk?.provider ?? null}
          transcriptScopeLabel={`Loaded transcript evidence (${segments.length}/${desk?.coverage.segmentCount ?? segments.length} segments)`}
          onSelect={selectEvidenceTime}
        />
        <SpectralEvidenceViewer
          projectId={projectId}
          projectSlug={projectSlug}
          assetId={assetId}
          sourceId={sourceId}
          selectedSeconds={playbackPosition ?? selected?.startSeconds ?? 0}
          playbackReady={Boolean(desk?.playback)}
          onSelect={selectEvidenceTime}
          transcriptWords={transcriptWords}
          lowConfidenceThreshold={confidenceTriagePolicy.threshold}
          transcriptEndSeconds={desk?.coverage.endSeconds ?? null}
          transcriptScopeLabel={`Loaded transcript evidence (${segments.length}/${desk?.coverage.segmentCount ?? segments.length} segments)`}
          evidenceMarkers={spectralEvidenceMarkers}
          loudnessEvidence={loudnessEvidence}
        /></>
      ) : (
        <section className="mt-3 rounded-xl border border-dashed border-sky-300 bg-sky-50 p-3" aria-label="Decoded audio evidence status">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">Shared source clock</div>
              <p className="mt-1 text-[10px] font-bold leading-4 text-sky-950">The transcript is timed, but its complete-decode RMS, sample-peak, clipping, silence, and dropout lanes are not ready yet. Quipsly will not infer those conditions from transcript probability.</p>
              {audioSignalError ? <p className="mt-2 text-[10px] font-black text-rose-900">{audioSignalError}</p> : null}
            </div>
            {onRequestAudioSignal ? <button type="button" disabled={isAudioSignalWorking || ["queued", "processing", "output-ready"].includes(audioSignalStatus)} onClick={onRequestAudioSignal} className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-[10px] font-black text-sky-950 hover:bg-sky-100 disabled:cursor-wait disabled:opacity-60">{isAudioSignalWorking || ["queued", "processing", "output-ready"].includes(audioSignalStatus) ? "Decoding exact source…" : audioSignalStatus === "failed" || audioSignalStatus === "blocked" ? "Retry decoded audio map" : "Build decoded audio map"}</button> : null}
          </div>
        </section>
      )}

      {desk && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[9px] font-bold sm:grid-cols-4">
          <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{desk.coverage.segmentCount}</div><div>Segments</div></div>
          <div className="rounded-lg bg-cyan-50 px-2 py-2"><div className="font-mono text-sm font-black">{desk.coverage.wordCount}</div><div>Words</div></div>
          <div className="rounded-lg bg-emerald-50 px-2 py-2" title={`${desk.coverage.correctionReceiptCount} retained correction receipts`}><div className="font-mono text-sm font-black">{desk.coverage.activeCorrectionCount}</div><div>Active overlays</div></div>
          <div className="rounded-lg bg-emerald-50 px-2 py-2"><div className="font-mono text-sm font-black">{desk.coverage.playbackVerificationCount}</div><div>Heard as-is</div></div>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div className="max-h-[32rem] space-y-1 overflow-y-auto pr-1" aria-label="Canonical transcript segments">
          {segments.map((segment) => (
            <button
              key={segment.id}
              type="button"
              onClick={() => selectSegment(segment, true)}
              className={`w-full rounded-lg border px-2 py-2 text-left transition ${selectedId === segment.id ? "border-cyan-500 bg-cyan-50 ring-1 ring-cyan-300" : "border-slate-200 bg-white hover:border-cyan-300"}`}
              aria-pressed={selectedId === segment.id}
              aria-label={`Review transcript segment at ${clock(segment.startSeconds)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] font-black text-cyan-800">{clock(segment.startSeconds)}–{clock(segment.endSeconds)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${segment.acceptedCorrection ? "bg-amber-100 text-amber-900" : segment.confirmedAsIs ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600"}`}>
                  {segment.acceptedCorrection ? "corrected" : segment.confirmedAsIs ? "heard as-is" : "unreviewed"}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-bold leading-4">{segment.speakerLabel ? <span className="mr-1 text-cyan-800">{segment.speakerLabel}:</span> : null}{segment.text}</p>
            </button>
          ))}
          {desk?.page.hasMore && (
            <button type="button" disabled={isLoading} onClick={() => void loadPage(desk.page.nextAfterSegmentId)} className="w-full rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-[10px] font-black text-cyan-950 hover:bg-cyan-100 disabled:opacity-60">
              {isLoading ? "Loading…" : `Load next segments (${segments.length} of ${desk.coverage.segmentCount})`}
            </button>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-black text-cyan-900">{clock(selected.startSeconds)}–{clock(selected.endSeconds)}</span>
                <button type="button" onClick={() => selectSegment(selected, true)} className="rounded-lg border border-cyan-300 bg-white px-3 py-1.5 text-[10px] font-black text-cyan-950 hover:bg-cyan-50">Listen to exact source</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1" aria-label="Provider word probability evidence">
                {selected.words.map((word) => (
                  <span key={word.id} className={`rounded border px-1.5 py-1 text-[10px] font-bold ${probabilityTone(word.confidence)}`} title={`${clock(word.startSeconds)}–${clock(word.endSeconds)} · ${word.confidence === null ? "probability unavailable" : `provider probability ${(word.confidence * 100).toFixed(1)}%`}`}>
                    {word.punctuatedWord}
                  </span>
                ))}
              </div>
              <label className="mt-3 block text-[10px] font-black text-[#6f5a3d]">Reviewed transcript text
                <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold leading-5 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200" />
              </label>
              <label className="mt-2 block text-[10px] font-black text-[#6f5a3d]">Reviewed speaker label
                <input value={draftSpeaker} onChange={(event) => setDraftSpeaker(event.target.value)} placeholder="e.g. Charlie, Homer, Guest" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200" />
              </label>
              <label className="mt-2 block text-[10px] font-black text-[#6f5a3d]">Review note (optional)
                <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What did you hear or change?" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200" />
              </label>
              <div className={`mt-3 rounded-lg border px-2 py-2 text-[10px] font-bold leading-4 ${reviewReady ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
                {reviewReady && playbackPosition !== null
                  ? `Playback evidence ready at ${clock(playbackPosition)} inside this segment.`
                  : "Play this exact segment first. Review actions remain unavailable until the protected player reaches its source range."}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" disabled={!reviewReady || !changed || isSaving} onClick={() => void operate("correct")} className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-left text-[10px] font-black text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500">
                  Save reviewed correction
                  <span className="mt-1 block font-bold opacity-75">Versioned overlay; provider words stay immutable.</span>
                </button>
                <button type="button" disabled={!reviewReady || changed || Boolean(selected.acceptedCorrection) || isSaving} onClick={() => void operate("confirm-as-is")} className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-2 text-left text-[10px] font-black text-emerald-950 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500">
                  Confirm exactly as heard
                  <span className="mt-1 block font-bold opacity-75">Closes review without inventing a no-op edit.</span>
                </button>
              </div>
              {selected.acceptedCorrection && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white px-2 py-2 text-[9px] font-bold leading-4 text-[#6f5a3d]">
                  Active correction {selected.acceptedCorrection.id.slice(0, 12)} · {selected.acceptedCorrection.revisions.length} revision receipt{selected.acceptedCorrection.revisions.length === 1 ? "" : "s"}. A new reviewed correction supersedes it; history is retained.
                </div>
              )}
            </>
          ) : (
            <p className="text-xs font-bold text-slate-600">Choose a timed segment to begin playback review.</p>
          )}
        </div>
      </div>

      <div role="status" className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold leading-4 text-slate-700">{status}</div>
      <p className="mt-2 text-[9px] font-bold leading-4 text-slate-500">Source {desk?.source.sha256.slice(0, 12) ?? "loading"} · provider segments and word clocks are immutable · corrections do not create edits, tasks, goals, publications, or deliveries.</p>
    </section>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
