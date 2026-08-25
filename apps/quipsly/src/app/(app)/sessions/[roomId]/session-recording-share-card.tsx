"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileAudio, FileText, Headphones, LockKeyhole, Play, RefreshCw, RotateCcw, Scissors, Send, ShieldCheck, Undo2 } from "lucide-react";

type Source = {
  id: string;
  participantLabel: string;
  kind: string;
  fileName: string | null;
  contentType?: string | null;
  sizeBytes: number;
  startedAt: string;
  stoppedAt: string;
  programOffsetSeconds: number;
  playbackUrl: string;
};

type TranscriptSegment = {
  transcriptJobId: string;
  segmentId: string;
  sourceRecordingAssetId: string;
  providerTextSha256: string;
  speakerLabel: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  cutStartSeconds?: number;
  cutEndSeconds?: number;
  timingFingerprint?: string;
  timingBasis?: "provider-words" | "provider-segment";
  cutSafety?: "safe" | "timing-unavailable" | "timing-overlap" | "overlapping-speech";
  cutSafetyReason?: string;
};

type Output = {
  id: string;
  status: "DRAFT" | "RELEASED" | "REVOKED";
  title: string;
  revision: number;
  contentSha256: string;
  recipient: { id: string; label: string };
  render: {
    status: "QUEUED" | "PROCESSING" | "VERIFIED" | "FAILED" | "NOT_REQUESTED";
    durationSeconds: number | null;
    sizeBytes: number | null;
    sha256: string | null;
    mediaKind?: "audio" | "video";
    contentType?: "audio/mp4" | "video/mp4";
    primaryVideoSourceId?: string | null;
  };
  mediaUrl: string | null;
  playbackReview?: {
    schema: string;
    requiredSecondBins: number[];
    joinSecondBins: number[];
    reviewed: boolean;
    reviewedAt: string | null;
    clientTrackedPlaybackIsNotProofOfAudibility: true;
  };
  body: { edit?: { startSeconds?: number; endSeconds?: number; transcriptExclusions?: TranscriptSegment[] } };
  sourceManifest?: { sources?: Array<{ recordingAssetId?: string }> };
};

type Snapshot = {
  ok: boolean;
  code?: string;
  error?: string;
  role?: "COACH" | "CLIENT" | "COLLABORATOR";
  room?: { id: string; title: string; client: { id: string; label: string }; coach: { id: string; label: string } | null };
  available?: { programDurationSeconds: number; sources: Source[]; transcriptSegments: TranscriptSegment[] };
  output?: Output | null;
  readiness?: { canPrepare: boolean; hasVerifiedParticipantSources: boolean; localRendererAvailable: boolean; cloudRendererAvailable: boolean };
};

type PassageAudition = {
  key: string;
  sourceId: string;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  programStartSeconds: number;
  programEndSeconds: number;
  speakerLabel: string;
  text: string;
};

function time(value: number) {
  const seconds = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

const MIN_TRIM_SECONDS = 0.1;

function trimStart(value: number, endSeconds: number, duration: number) {
  return Math.max(0, Math.min(Number(value) || 0, Math.max(0, Math.min(endSeconds - MIN_TRIM_SECONDS, duration))));
}

function trimEnd(value: number, startSeconds: number, duration: number) {
  return Math.min(duration, Math.max(Number(value) || 0, Math.min(duration, startSeconds + MIN_TRIM_SECONDS)));
}

function megabytes(value: number | null | undefined) {
  return value ? `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 0 : 1)} MB` : null;
}

function defaultParticipantSources(sources: Source[]) {
  const selected = new Map<string, Source>();
  for (const source of sources) {
    const existing = selected.get(source.participantLabel);
    if (!existing || (source.kind === "LOCAL_AUDIO" && existing.kind !== "LOCAL_AUDIO")) {
      selected.set(source.participantLabel, source);
    }
  }
  return [...selected.values()].map((source) => source.id);
}

function transcriptExclusionKeys(output: Output | null | undefined) {
  return new Set((output?.body.edit?.transcriptExclusions || []).map(
    (segment) => `${segment.transcriptJobId}:${segment.segmentId}`,
  ));
}

function outputSourceIds(output: Output | null | undefined, availableSources: Source[]) {
  const available = new Set(availableSources.map((source) => source.id));
  const requested = (output?.sourceManifest?.sources || [])
    .map((source) => source.recordingAssetId || "")
    .filter(Boolean);
  return requested?.length
    ? requested.filter((id) => available.has(id))
    : defaultParticipantSources(availableSources);
}

function missingOutputSourceCount(output: Output | null | undefined, availableSources: Source[]) {
  const available = new Set(availableSources.map((source) => source.id));
  return (output?.sourceManifest?.sources || []).filter(
    (source) => Boolean(source.recordingAssetId) && !available.has(source.recordingAssetId || ""),
  ).length;
}

function recordingCutElementId(key: string) {
  return `recording-cut-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function editDuration(startSeconds: number, endSeconds: number, exclusions: TranscriptSegment[]) {
  const merged: Array<{ startSeconds: number; endSeconds: number }> = [];
  for (const segment of exclusions
    .map((item) => ({
      startSeconds: Math.max(startSeconds, Number(item.cutStartSeconds ?? item.startSeconds)),
      endSeconds: Math.min(endSeconds, Number(item.cutEndSeconds ?? item.endSeconds)),
    }))
    .filter((range) => range.endSeconds > range.startSeconds)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)) {
    const previous = merged.at(-1);
    if (previous && segment.startSeconds <= previous.endSeconds + 0.02) {
      previous.endSeconds = Math.max(previous.endSeconds, segment.endSeconds);
    } else {
      merged.push({ ...segment });
    }
  }
  const removedSeconds = merged.reduce((total, range) => total + range.endSeconds - range.startSeconds, 0);
  return {
    removedSeconds,
    previewSeconds: Math.max(0, endSeconds - startSeconds - removedSeconds),
  };
}

export function SessionRecordingShareCard({
  roomId,
  focusTranscriptKey = null,
}: {
  roomId: string;
  focusTranscriptKey?: string | null;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [outputMediaKind, setOutputMediaKind] = useState<"audio" | "video">("audio");
  const [primaryVideoSourceId, setPrimaryVideoSourceId] = useState("");
  const [excludedTranscriptKeys, setExcludedTranscriptKeys] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [audition, setAudition] = useState<PassageAudition | null>(null);
  const [auditionNotice, setAuditionNotice] = useState<string | null>(null);
  const [previewListenedSecondBins, setPreviewListenedSecondBins] = useState<Set<number>>(() => new Set());
  const [reviewSaveFailed, setReviewSaveFailed] = useState(false);
  const auditionMediaRef = useRef<HTMLMediaElement | null>(null);
  const previewMediaRef = useRef<HTMLMediaElement | null>(null);
  const previewLastPlaybackTimeRef = useRef<number | null>(null);
  const reviewRequestStartedForRef = useRef<string | null>(null);
  const requestIds = useRef<Partial<Record<"PREPARE" | "REVIEW" | "RELEASE" | "REVOKE", string>>>({});

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy("LOAD");
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/recording-share`, { cache: "no-store" });
      const payload = await response.json() as Snapshot;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Quipsly could not load the recording workspace.");
      setSnapshot(payload);
      if (payload.role === "COACH" && !payload.output) {
        setSelected(new Set(defaultParticipantSources(payload.available?.sources || [])));
        setEndSeconds(payload.available?.programDurationSeconds || 0);
        setTitle(`${payload.room?.title || "Coaching Session"} recording`);
      }
      if (payload.output) {
        setSelected(new Set(outputSourceIds(payload.output, payload.available?.sources || [])));
        setTitle(payload.output.title);
        setStartSeconds(Number(payload.output.body.edit?.startSeconds) || 0);
        setEndSeconds(Number(payload.output.body.edit?.endSeconds) || 0);
        setExcludedTranscriptKeys(transcriptExclusionKeys(payload.output));
        setOutputMediaKind(payload.output.render.mediaKind === "video" ? "video" : "audio");
        setPrimaryVideoSourceId(payload.output.render.primaryVideoSourceId || "");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Quipsly could not load the recording workspace.");
    } finally {
      if (!quiet) setBusy(null);
    }
  }, [roomId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!snapshot?.output || !["QUEUED", "PROCESSING"].includes(snapshot.output.render.status)) return;
    const timer = window.setInterval(() => void load(true), 1_500);
    return () => window.clearInterval(timer);
  }, [load, snapshot?.output]);

  const duration = snapshot?.available?.programDurationSeconds || 0;
  const reviewOutput = snapshot?.output ?? null;
  const requiredPreviewSecondBins = reviewOutput?.playbackReview?.requiredSecondBins ?? [];
  const observedPreviewSecondBins = requiredPreviewSecondBins.filter((second) => previewListenedSecondBins.has(second));
  const previewReviewComplete = requiredPreviewSecondBins.length > 0 && observedPreviewSecondBins.length === requiredPreviewSecondBins.length;
  const rangeValid = startSeconds >= 0 && endSeconds > startSeconds && endSeconds <= duration + 0.05;
  const chosen = useMemo(() => snapshot?.available?.sources.filter((source) => selected.has(source.id)) || [], [selected, snapshot?.available?.sources]);
  const videoSources = useMemo(
    () => (snapshot?.available?.sources || []).filter((source) => source.kind === "LOCAL_VIDEO" || source.contentType?.startsWith("video/")),
    [snapshot?.available?.sources],
  );
  const videoSelectionValid = outputMediaKind === "audio" || (Boolean(primaryVideoSourceId) && selected.has(primaryVideoSourceId));
  const missingCurrentSources = useMemo(
    () => missingOutputSourceCount(snapshot?.output, snapshot?.available?.sources || []),
    [snapshot?.available?.sources, snapshot?.output],
  );
  const editableTranscript = useMemo(() => (snapshot?.available?.transcriptSegments || []).filter((segment) => (
    selected.has(segment.sourceRecordingAssetId)
    && segment.endSeconds > startSeconds
    && segment.startSeconds < endSeconds
  )), [endSeconds, selected, snapshot?.available?.transcriptSegments, startSeconds]);
  const excludedTranscriptSegments = useMemo(() => editableTranscript.filter((segment) => (
    excludedTranscriptKeys.has(`${segment.transcriptJobId}:${segment.segmentId}`)
  )), [editableTranscript, excludedTranscriptKeys]);
  const durationEstimate = useMemo(
    () => editDuration(startSeconds, endSeconds, excludedTranscriptSegments),
    [endSeconds, excludedTranscriptSegments, startSeconds],
  );
  const focusedTranscriptSegment = useMemo(() => (
    focusTranscriptKey
      ? (snapshot?.available?.transcriptSegments || []).find((segment) => (
          `${segment.transcriptJobId}:${segment.segmentId}` === focusTranscriptKey
        )) ?? null
      : null
  ), [focusTranscriptKey, snapshot?.available?.transcriptSegments]);
  const focusedSegmentVisible = Boolean(focusedTranscriptSegment && editableTranscript.some((segment) => (
    segment.transcriptJobId === focusedTranscriptSegment.transcriptJobId
    && segment.segmentId === focusedTranscriptSegment.segmentId
  )));
  const auditionSource = useMemo(() => (
    audition ? (snapshot?.available?.sources || []).find((source) => source.id === audition.sourceId) ?? null : null
  ), [audition, snapshot?.available?.sources]);

  const loadPassageAudition = useCallback((segment: TranscriptSegment) => {
    const source = (snapshot?.available?.sources || []).find((candidate) => candidate.id === segment.sourceRecordingAssetId);
    if (!source?.playbackUrl) {
      setAuditionNotice("This exact participant master is not playable yet. Refresh after its protected source finishes preparing.");
      return;
    }
    const programStartSeconds = Number(segment.cutStartSeconds ?? segment.startSeconds);
    const programEndSeconds = Number(segment.cutEndSeconds ?? segment.endSeconds);
    const sourceStartSeconds = Math.max(0, programStartSeconds - source.programOffsetSeconds);
    const sourceEndSeconds = Math.max(sourceStartSeconds, programEndSeconds - source.programOffsetSeconds);
    setAuditionNotice(null);
    setAudition({
      key: `${segment.transcriptJobId}:${segment.segmentId}`,
      sourceId: source.id,
      sourceStartSeconds,
      sourceEndSeconds,
      programStartSeconds,
      programEndSeconds,
      speakerLabel: segment.speakerLabel,
      text: segment.text,
    });
    window.requestAnimationFrame(() => {
      document.getElementById("recording-cut-audition")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [snapshot?.available?.sources]);

  const beginAuditionPlayback = useCallback(() => {
    const media = auditionMediaRef.current;
    if (!media || !audition) return;
    try {
      media.currentTime = audition.sourceStartSeconds;
      const started = media.play();
      void started?.catch(() => setAuditionNotice("The passage is loaded. Press Play in the recording control to listen."));
    } catch {
      setAuditionNotice("The passage is loaded. Press Play in the recording control to listen.");
    }
  }, [audition]);

  const stopAtAuditionBoundary = useCallback(() => {
    const media = auditionMediaRef.current;
    if (!media || !audition) return;
    if (media.currentTime >= audition.sourceEndSeconds - 0.015) {
      media.pause();
      media.currentTime = audition.sourceStartSeconds;
    }
  }, [audition]);

  useEffect(() => {
    setPreviewListenedSecondBins(new Set());
    setReviewSaveFailed(false);
    previewLastPlaybackTimeRef.current = null;
    reviewRequestStartedForRef.current = null;
  }, [reviewOutput?.contentSha256, reviewOutput?.id]);

  const savePlaybackReview = useCallback(async (output: Output, listenedSecondBins: number[]) => {
    const reviewKey = `${output.id}:${output.revision}:${output.contentSha256}`;
    if (reviewRequestStartedForRef.current === reviewKey && !reviewSaveFailed) return;
    reviewRequestStartedForRef.current = reviewKey;
    setReviewSaveFailed(false);
    setBusy("REVIEW");
    setNotice(null);
    try {
      const clientRequestId = requestIds.current.REVIEW || crypto.randomUUID();
      requestIds.current.REVIEW = clientRequestId;
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/recording-share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "REVIEW",
          clientRequestId,
          outputId: output.id,
          expectedRevision: output.revision,
          playbackEvidence: { listenedSecondBins, clientTrackedPlaybackIsNotProofOfAudibility: true },
        }),
      });
      const payload = await response.json() as Snapshot;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Quipsly could not save this playback review.");
      delete requestIds.current.REVIEW;
      setNotice("Listening review saved for this exact private preview. It is ready to share.");
      await load(true);
    } catch (error) {
      setReviewSaveFailed(true);
      setNotice(error instanceof Error ? error.message : "Quipsly could not save this playback review.");
    } finally {
      setBusy(null);
    }
  }, [load, reviewSaveFailed, roomId]);

  useEffect(() => {
    if (!reviewOutput || reviewOutput.status !== "DRAFT" || reviewOutput.render.status !== "VERIFIED" || reviewOutput.playbackReview?.reviewed || !previewReviewComplete || reviewSaveFailed || busy) return;
    void savePlaybackReview(reviewOutput, [...previewListenedSecondBins].sort((left, right) => left - right));
  }, [busy, previewListenedSecondBins, previewReviewComplete, reviewOutput, reviewSaveFailed, savePlaybackReview]);

  function observePreviewPlayback(media: HTMLMediaElement, ended = false) {
    const durationSeconds = Number.isFinite(media.duration) ? media.duration : reviewOutput?.render.durationSeconds;
    const currentTime = ended && durationSeconds && durationSeconds > 0 ? durationSeconds - 0.001 : media.currentTime;
    if (!ended && (media.paused || media.seeking)) return;
    if (!durationSeconds || durationSeconds <= 0) return;
    const second = Math.max(0, Math.min(Math.ceil(durationSeconds) - 1, Math.floor(currentTime)));
    const previousTime = previewLastPlaybackTimeRef.current;
    const contiguous = previousTime !== null && currentTime >= previousTime && currentTime - previousTime <= 1.5;
    const firstSecond = contiguous ? Math.floor(previousTime) : second;
    previewLastPlaybackTimeRef.current = currentTime;
    setPreviewListenedSecondBins((current) => {
      const next = new Set(current);
      for (let bin = firstSecond; bin <= second; bin += 1) next.add(bin);
      return next.size === current.size ? current : next;
    });
  }

  function playNextReviewCheckpoint() {
    const media = previewMediaRef.current;
    const nextSecond = requiredPreviewSecondBins.find((second) => !previewListenedSecondBins.has(second));
    if (!media || nextSecond === undefined) return;
    media.currentTime = Math.max(0, nextSecond - 0.1);
    previewLastPlaybackTimeRef.current = media.currentTime;
    void media.play().catch(() => setNotice("The next review point is ready. Press Play in the recording control."));
  }

  useEffect(() => {
    if (!focusTranscriptKey || !snapshot?.role) return;
    if (snapshot.output && !editing) {
      setSelected(new Set(outputSourceIds(snapshot.output, snapshot.available?.sources || [])));
      setTitle(snapshot.output.title);
      setStartSeconds(Number(snapshot.output.body.edit?.startSeconds) || 0);
      setEndSeconds(Number(snapshot.output.body.edit?.endSeconds) || duration);
      setExcludedTranscriptKeys(transcriptExclusionKeys(snapshot.output));
      setOutputMediaKind(snapshot.output.render.mediaKind === "video" ? "video" : "audio");
      setPrimaryVideoSourceId(snapshot.output.render.primaryVideoSourceId || "");
      setEditing(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(recordingCutElementId(focusTranscriptKey));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [duration, editing, focusTranscriptKey, snapshot]);

  async function mutate(action: "PREPARE" | "RELEASE" | "REVOKE") {
    setBusy(action);
    setNotice(null);
    try {
      const output = snapshot?.output;
      const clientRequestId = requestIds.current[action] || crypto.randomUUID();
      requestIds.current[action] = clientRequestId;
      const body: Record<string, unknown> = { action, clientRequestId };
      if (action === "PREPARE") Object.assign(body, {
        title,
        sourceIds: [...selected],
        outputMediaKind,
        primaryVideoSourceId: outputMediaKind === "video" ? primaryVideoSourceId : null,
        startSeconds,
        endSeconds,
        excludedTranscriptSegments: excludedTranscriptSegments.map((segment) => ({
          transcriptJobId: segment.transcriptJobId,
          segmentId: segment.segmentId,
          providerTextSha256: segment.providerTextSha256,
          timingFingerprint: segment.timingFingerprint,
        })),
      });
      else {
        if (!output) throw new Error("Refresh before changing recording visibility.");
        Object.assign(body, { outputId: output.id, expectedRevision: output.revision });
      }
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/recording-share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as Snapshot;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The recording decision was not confirmed.");
      setNotice(action === "PREPARE"
        ? "Private preview queued from immutable participant masters. The client cannot see it yet."
        : action === "RELEASE"
          ? `Released inside ${output?.recipient.label}'s private Session. No email or public link was sent.`
          : "Client access revoked. Original masters and decision history remain intact.");
      delete requestIds.current[action];
      if (action === "PREPARE") setEditing(false);
      await load(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The recording decision was not confirmed.");
    } finally {
      setBusy(null);
    }
  }

  if (!snapshot?.role || !snapshot.room) {
    return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5" role="status"><LockKeyhole className="text-amber-800" /><h2 className="mt-3 font-serif text-2xl font-black text-amber-950">Private recording unavailable</h2><p className="mt-2 text-sm font-semibold text-amber-900">{notice || "Loading the recipient boundary…"}</p></section>;
  }

  const output = snapshot.output;
  const coach = snapshot.role === "COACH";
  const verifiedRendererAvailable = Boolean(snapshot.readiness?.localRendererAvailable || snapshot.readiness?.cloudRendererAvailable);
  return (
    <section id="recording-share" className="rounded-3xl border border-sky-200 bg-sky-50/40 p-5 shadow-sm sm:p-6" aria-labelledby="recording-share-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-white p-3 text-sky-800 shadow-sm"><FileAudio aria-hidden="true" size={22} /></span>
          <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">Reviewed recording</p><h2 id="recording-share-heading" className="font-serif text-2xl font-black text-sky-950">Trim, listen, then share</h2><p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-sky-900">Recipient: <strong>{snapshot.room.client.label}</strong>. A draft stays coach-only until the explicit release step.</p></div>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-900 disabled:opacity-50"><RefreshCw className={`mr-1.5 inline ${busy === "LOAD" ? "animate-spin" : ""}`} size={14} />Refresh</button>
      </div>

      {notice ? <p className="mt-4 rounded-xl border border-sky-200 bg-white p-3 text-sm font-bold text-sky-950" role="status">{notice}</p> : null}

      {coach && (!output || editing) ? (
        <div className="mt-5 space-y-5">
          {output && editing ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-white p-3"><p className="text-xs font-bold leading-5 text-sky-900">Editing starts from revision {output.revision}. Your current {output.status === "RELEASED" ? "shared recording stays available" : "private preview stays unchanged"} until a new preview finishes.</p><button type="button" onClick={() => { setSelected(new Set(outputSourceIds(output, snapshot.available?.sources || []))); setTitle(output.title); setStartSeconds(Number(output.body.edit?.startSeconds) || 0); setEndSeconds(Number(output.body.edit?.endSeconds) || duration); setExcludedTranscriptKeys(transcriptExclusionKeys(output)); setOutputMediaKind(output.render.mediaKind === "video" ? "video" : "audio"); setPrimaryVideoSourceId(output.render.primaryVideoSourceId || ""); setEditing(false); }} disabled={Boolean(busy)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-900 disabled:opacity-50">Cancel changes</button></div> : null}
          {output && editing && missingCurrentSources ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">{missingCurrentSources} source{missingCurrentSources === 1 ? " is" : "s are"} no longer in the verified Session take. Quipsly kept the remaining exact source selection and will not substitute another track. Restore or deliberately replace the missing source before creating a new preview.</p> : null}
          {!snapshot.readiness?.hasVerifiedParticipantSources ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">No complete, verified participant masters are ready yet. Finish the Session recording upload first.</p> : null}
          <div className="rounded-2xl border border-sky-200 bg-white p-4 sm:p-5" aria-label="Trim recording">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-sm font-black text-sky-950">Trim the beginning and end</h3><p className="mt-1 text-xs font-semibold text-sky-800">Quipsly already selected one high-quality track for each person.</p></div>
              <button type="button" onClick={() => { setStartSeconds(0); setEndSeconds(duration); }} disabled={!duration || (startSeconds === 0 && endSeconds === duration)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-900 disabled:opacity-45"><RotateCcw className="mr-1 inline" size={12} />Use full recording</button>
            </div>
            <div className="mt-5 space-y-5">
              <label className="block text-xs font-black uppercase tracking-wide text-sky-900"><span className="flex items-center justify-between gap-3"><span>Start</span><output className="rounded-full bg-sky-100 px-2.5 py-1 font-mono text-[11px] normal-case tracking-normal text-sky-950">{time(startSeconds)}</output></span><input aria-label="Recording start" type="range" min={0} max={duration} step="0.1" value={startSeconds} onChange={(event) => setStartSeconds(trimStart(Number(event.target.value), endSeconds, duration))} className="mt-2 block w-full accent-sky-800" /></label>
              <label className="block text-xs font-black uppercase tracking-wide text-sky-900"><span className="flex items-center justify-between gap-3"><span>End</span><output className="rounded-full bg-sky-100 px-2.5 py-1 font-mono text-[11px] normal-case tracking-normal text-sky-950">{time(endSeconds)}</output></span><input aria-label="Recording end" type="range" min={0} max={duration} step="0.1" value={endSeconds} onChange={(event) => setEndSeconds(trimEnd(Number(event.target.value), startSeconds, duration))} className="mt-2 block w-full accent-sky-800" /></label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-900"><span>{time(startSeconds)} – {time(endSeconds)}</span><span>{time(endSeconds - startSeconds)} selected</span></div>
            <details className="mt-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3"><summary className="cursor-pointer text-[11px] font-black uppercase tracking-wide text-sky-900">Precise timing</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-sky-900">Start (seconds)<input type="number" min={0} max={duration} step="0.1" value={startSeconds} onChange={(event) => setStartSeconds(trimStart(Number(event.target.value), endSeconds, duration))} className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-sky-950" /></label><label className="text-xs font-black text-sky-900">End (seconds)<input type="number" min={0} max={duration} step="0.1" value={endSeconds} onChange={(event) => setEndSeconds(trimEnd(Number(event.target.value), startSeconds, duration))} className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-sky-950" /></label></div></details>
          </div>
          {videoSources.length ? <fieldset className="rounded-2xl border border-sky-200 bg-white p-4">
            <legend className="text-sm font-black text-sky-950">Preview format</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-sky-50 p-1" role="radiogroup" aria-label="Preview format">
              {(["audio", "video"] as const).map((kind) => <button key={kind} type="button" role="radio" aria-checked={outputMediaKind === kind} onClick={() => {
                setOutputMediaKind(kind);
                if (kind === "video" && !primaryVideoSourceId && videoSources[0]) {
                  setPrimaryVideoSourceId(videoSources[0].id);
                  setSelected((current) => new Set(current).add(videoSources[0]!.id));
                }
              }} className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${outputMediaKind === kind ? "bg-sky-800 text-white shadow-sm" : "text-sky-900"}`}>{kind}</button>)}
            </div>
            {outputMediaKind === "video" ? <label className="mt-4 block text-xs font-black uppercase tracking-wide text-sky-900">Primary camera
              <select value={primaryVideoSourceId} onChange={(event) => {
                setPrimaryVideoSourceId(event.target.value);
                setSelected((current) => new Set(current).add(event.target.value));
              }} className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-sky-950">
                {videoSources.map((source) => <option key={source.id} value={source.id}>{source.participantLabel} · {source.fileName || "Camera"}</option>)}
              </select>
              <span className="mt-2 block text-xs font-semibold normal-case leading-5 tracking-normal text-sky-800">This exact camera supplies the picture. Quipsly uses one preferred local microphone per person and does not mix a camera mic over a selected dedicated mic.</span>
            </label> : null}
          </fieldset> : null}
          <details className="rounded-2xl border border-sky-200 bg-white p-4"><summary className="cursor-pointer text-sm font-black text-sky-950">Name and recording sources <span className="ml-1 text-xs font-bold text-sky-700">({chosen.length} selected)</span></summary><div className="mt-4 space-y-4"><label className="block text-xs font-black uppercase tracking-wide text-sky-900">Recording name<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-sky-950" /></label>{snapshot.available?.sources.length ? <fieldset><legend className="text-sm font-black text-sky-950">High-quality tracks</legend><p className="mt-1 text-xs font-semibold text-sky-800">The recommended track for each person is selected automatically. Change this only when you need a different master.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{snapshot.available.sources.map((source) => <label key={source.id} className="flex cursor-pointer gap-3 rounded-xl border border-sky-200 bg-sky-50/40 p-3"><input type="checkbox" className="mt-1 size-4 accent-sky-700" checked={selected.has(source.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(source.id)) next.delete(source.id); else next.add(source.id); return next; })} /><span><span className="block text-sm font-black text-sky-950">{source.participantLabel}</span><span className="block text-xs font-semibold text-sky-700">{source.kind === "LOCAL_VIDEO" ? "Camera master audio" : "Local audio master"} · starts +{source.programOffsetSeconds.toFixed(2)}s · {megabytes(source.sizeBytes)}</span></span></label>)}</div></fieldset> : null}</div></details>
          {editableTranscript.length ? (
            <fieldset className="rounded-2xl border border-sky-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <legend className="flex items-center gap-2 text-sm font-black text-sky-950"><FileText size={16} />Cut the recording by transcript</legend>
                  <p className="mt-1 text-xs font-semibold text-sky-800">Included passages stay in the recording. Clear a passage to remove it from this private preview. Transcript wording does not change.</p>
                </div>
                {excludedTranscriptSegments.length ? <button type="button" onClick={() => setExcludedTranscriptKeys(new Set())} className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-black text-sky-900"><RotateCcw className="mr-1 inline" size={12} />Restore all</button> : null}
              </div>
              {audition && auditionSource ? (
                <div id="recording-cut-audition" className="mt-4 scroll-mt-28 rounded-xl border border-indigo-200 bg-indigo-50 p-3" aria-label="Exact passage audition">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-indigo-900"><Headphones size={14} aria-hidden="true" />Exact participant master</p>
                      <p className="mt-1 text-sm font-black text-indigo-950">{audition.speakerLabel} · {time(audition.programStartSeconds)}–{time(audition.programEndSeconds)}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-indigo-900">{audition.text}</p>
                    </div>
                    <button type="button" onClick={beginAuditionPlayback} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-indigo-800 px-4 py-2 text-xs font-black text-white"><Play size={13} fill="currentColor" aria-hidden="true" />Play passage</button>
                  </div>
                  {auditionSource.kind === "LOCAL_VIDEO" ? (
                    <video
                      ref={(node) => { auditionMediaRef.current = node; }}
                      aria-label={`Source passage from ${auditionSource.participantLabel}`}
                      className="mt-3 aspect-video w-full max-w-xl rounded-lg bg-black"
                      controls
                      playsInline
                      preload="metadata"
                      src={auditionSource.playbackUrl}
                      onLoadedMetadata={beginAuditionPlayback}
                      onTimeUpdate={stopAtAuditionBoundary}
                      onError={() => setAuditionNotice("Quipsly could not open this protected participant master. Refresh after source preparation finishes.")}
                    />
                  ) : (
                    <audio
                      ref={(node) => { auditionMediaRef.current = node; }}
                      aria-label={`Source passage from ${auditionSource.participantLabel}`}
                      className="mt-3 w-full"
                      controls
                      preload="metadata"
                      src={auditionSource.playbackUrl}
                      onLoadedMetadata={beginAuditionPlayback}
                      onTimeUpdate={stopAtAuditionBoundary}
                      onError={() => setAuditionNotice("Quipsly could not open this protected participant master. Refresh after source preparation finishes.")}
                    >Your browser cannot play this private participant recording.</audio>
                  )}
                  <p className="mt-2 text-[11px] font-bold leading-5 text-indigo-800">This plays only the exact source passage. Your reversible cut is not applied until you create and listen to the private preview.</p>
                </div>
              ) : null}
              {auditionNotice ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950" role="status">{auditionNotice}</p> : null}
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {editableTranscript.map((segment) => {
                  const key = `${segment.transcriptJobId}:${segment.segmentId}`;
                  const included = !excludedTranscriptKeys.has(key);
                  const safe = segment.cutSafety === "safe" && Boolean(segment.timingFingerprint);
                  const focused = focusTranscriptKey === key;
                  return (
                    <div id={recordingCutElementId(key)} tabIndex={-1} key={key} className="scroll-mt-28 outline-none">
                      <label data-transcript-key={key} className={`grid grid-cols-[auto_4.5rem_1fr] gap-3 rounded-xl border p-3 outline-none ${focused ? "ring-4 ring-sky-300" : ""} ${!safe ? "cursor-not-allowed border-amber-200 bg-amber-50" : included ? "cursor-pointer border-sky-100 bg-sky-50/50" : "cursor-pointer border-rose-200 bg-rose-50 text-rose-950"}`}>
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-sky-700"
                          checked={included}
                          disabled={!safe}
                          aria-label={`${included ? "Keep in recording" : "Restore to recording"}: ${segment.text}`}
                          aria-describedby={!safe ? `${key}-safety` : undefined}
                          onChange={() => setExcludedTranscriptKeys((current) => {
                            const next = new Set(current);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })}
                        />
                        <span className="pt-0.5 text-[11px] font-black tabular-nums text-sky-700">{time(segment.startSeconds)}</span>
                        <span>
                          <span className="flex flex-wrap items-center gap-2 text-xs font-black text-sky-950">
                            {segment.speakerLabel}
                            <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${!safe ? "bg-amber-100 text-amber-950" : included ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{!safe ? "Kept safe" : included ? "Included" : "Removed"}</span>
                          </span>
                          <span className={`mt-0.5 block text-sm leading-5 ${included ? "text-sky-950" : "line-through decoration-rose-500"}`}>{segment.text}</span>
                          {!safe ? <span id={`${key}-safety`} className="mt-1 block text-[11px] font-bold leading-4 text-amber-900">{segment.cutSafetyReason || "Precise source timing is unavailable, so this passage stays included."}</span> : null}
                        </span>
                      </label>
                      <button type="button" onClick={() => loadPassageAudition(segment)} aria-pressed={audition?.key === key} className="ml-[6.75rem] mt-1 inline-flex min-h-9 items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-black text-indigo-900 aria-pressed:bg-indigo-100"><Headphones size={13} aria-hidden="true" />Listen to exact passage</button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs font-bold text-sky-800">{excludedTranscriptSegments.length ? `${excludedTranscriptSegments.length} passage${excludedTranscriptSegments.length === 1 ? "" : "s"} removed · ${time(durationEstimate.removedSeconds)} cut · preview about ${time(durationEstimate.previewSeconds)}.` : "Everything in the selected range is included."}</p>
            </fieldset>
          ) : (
            <div className="rounded-xl border border-sky-200 bg-white p-4"><p className="text-sm font-black text-sky-950">Recording cuts appear when the transcript is ready</p><p className="mt-1 text-xs font-semibold text-sky-800">You can trim the beginning and end now.</p></div>
          )}
          {focusTranscriptKey && focusedTranscriptSegment && !focusedSegmentVisible ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">This passage is outside the current trim or source selection. Expand the start/end range or restore its participant track to edit it.</p> : null}
          <p className="text-xs font-bold text-sky-800"><Scissors className="mr-1 inline" size={14} />Prepared range {time(startSeconds)}–{time(endSeconds)} ({time(endSeconds - startSeconds)}) from {chosen.length} participant source{chosen.length === 1 ? "" : "s"}.</p>
          <button type="button" aria-label="Create private preview" disabled={Boolean(busy) || !chosen.length || !rangeValid || !videoSelectionValid || !verifiedRendererAvailable} onClick={() => void mutate("PREPARE")} className="w-full rounded-xl bg-sky-800 px-4 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{busy === "PREPARE" ? "Creating preview…" : `Create private ${outputMediaKind} preview`}</button>
          {!verifiedRendererAvailable ? <p className="text-xs font-bold text-amber-800">Preview preparation is temporarily unavailable. Your trim and transcript choices stay here; try again shortly.</p> : null}
        </div>
      ) : null}

      {output ? <div className="mt-5 space-y-4 rounded-2xl border border-sky-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-sky-950">{output.title}</p><p className="text-xs font-bold text-sky-700">Revision {output.revision} · {output.status === "DRAFT" ? "Private coach draft" : output.status === "RELEASED" ? `Visible to ${output.recipient.label}` : "Access revoked"}</p></div><span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-sky-900">{output.render.status}</span></div>
        {output.render.status === "VERIFIED" && output.mediaUrl ? <>{output.render.mediaKind === "video" ? <video
          ref={(node) => { previewMediaRef.current = node; }}
          aria-label="Private video preview"
          className="aspect-video w-full rounded-xl bg-black"
          controls playsInline preload="metadata" src={output.mediaUrl}
          onPlay={(event) => { previewLastPlaybackTimeRef.current = event.currentTarget.currentTime; }}
          onPause={() => { previewLastPlaybackTimeRef.current = null; }}
          onSeeking={() => { previewLastPlaybackTimeRef.current = null; }}
          onTimeUpdate={(event) => observePreviewPlayback(event.currentTarget)}
          onEnded={(event) => observePreviewPlayback(event.currentTarget, true)}
        >Your browser cannot play this private video.</video> : <audio
          ref={(node) => { previewMediaRef.current = node; }}
          aria-label="Private recording preview"
          className="w-full" controls preload="metadata" src={output.mediaUrl}
          onPlay={(event) => { previewLastPlaybackTimeRef.current = event.currentTarget.currentTime; }}
          onPause={() => { previewLastPlaybackTimeRef.current = null; }}
          onSeeking={() => { previewLastPlaybackTimeRef.current = null; }}
          onTimeUpdate={(event) => observePreviewPlayback(event.currentTarget)}
          onEnded={(event) => observePreviewPlayback(event.currentTarget, true)}
        >Your browser cannot play this private recording.</audio>}<div className="flex flex-wrap gap-2 text-xs font-bold text-sky-800"><span>{time(output.render.durationSeconds || 0)}</span><span>·</span><span>{megabytes(output.render.sizeBytes)}</span><span>·</span><span className="font-mono">SHA-256 {output.render.sha256?.slice(0, 12)}…</span></div><a href={`${output.mediaUrl}?download=1`} className="inline-flex items-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-900"><Download className="mr-1.5" size={14} />Download exact reviewed copy</a></> : output.render.status === "FAILED" ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">The private copy did not pass verification, so nothing was shared. Your original recording and edit choices are safe.</p> : <p className="text-sm font-bold text-sky-800"><RefreshCw className="mr-2 inline animate-spin" size={15} />{output.render.mediaKind === "video" ? "Aligning picture and sound, leveling, decoding, and verifying the private preview…" : "Aligning, leveling, decoding, and verifying the private preview…"}</p>}
        {coach && output.status === "DRAFT" && output.render.status === "VERIFIED" ? <div className={`rounded-xl border p-4 ${output.playbackReview?.reviewed ? "border-emerald-200 bg-emerald-50" : "border-indigo-200 bg-indigo-50"}`}>
          {output.playbackReview?.reviewed ? <p className="text-sm font-bold text-emerald-950"><ShieldCheck className="mr-2 inline" size={16} />Listening review saved for this exact revision. It is ready to share with <strong>{output.recipient.label}</strong>.</p> : <>
            <p className="text-sm font-black text-indigo-950">Listen before sharing</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-indigo-900">Play the beginning, middle, ending, and each edit join. Quipsly saves the review automatically after every checkpoint has played.</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Private preview listening review" aria-valuemin={0} aria-valuemax={requiredPreviewSecondBins.length} aria-valuenow={observedPreviewSecondBins.length}><div className="h-full rounded-full bg-indigo-700 transition-[width]" style={{ width: `${requiredPreviewSecondBins.length ? (observedPreviewSecondBins.length / requiredPreviewSecondBins.length) * 100 : 0}%` }} /></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold text-indigo-900">{busy === "REVIEW" ? "Saving listening review…" : `${observedPreviewSecondBins.length} of ${requiredPreviewSecondBins.length} review checkpoints played`}</p>
              {!previewReviewComplete ? <button type="button" onClick={playNextReviewCheckpoint} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-indigo-300 bg-white px-4 py-2 text-xs font-black text-indigo-950 disabled:opacity-50"><Play size={13} fill="currentColor" aria-hidden="true" />Play next review point</button> : null}
            </div>
            {reviewSaveFailed && previewReviewComplete ? <button type="button" onClick={() => void savePlaybackReview(output, [...previewListenedSecondBins].sort((left, right) => left - right))} disabled={Boolean(busy)} className="mt-3 rounded-full border border-indigo-300 bg-white px-4 py-2 text-xs font-black text-indigo-950 disabled:opacity-50">Retry saving review</button> : null}
          </>}
          <button type="button" disabled={Boolean(busy) || !output.playbackReview?.reviewed} onClick={() => void mutate("RELEASE")} className="mt-3 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="mr-2 inline" size={16} />{output.playbackReview?.reviewed ? `Share with ${output.recipient.label}` : "Listen before sharing"}</button>
        </div> : null}
        {coach && output.status === "RELEASED" ? <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("REVOKE")} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-900"><Undo2 className="mr-1.5 inline" size={14} />Revoke client access</button> : null}
        {!coach && output.status === "RELEASED" ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"><ShieldCheck className="mr-2 inline" size={16} />Your coach released this reviewed copy to your private Session.</p> : null}
        {coach && !editing ? <button type="button" disabled={Boolean(busy)} onClick={() => { setSelected(new Set(outputSourceIds(output, snapshot.available?.sources || []))); setTitle(output.title); setStartSeconds(Number(output.body.edit?.startSeconds) || 0); setEndSeconds(Number(output.body.edit?.endSeconds) || duration); setExcludedTranscriptKeys(transcriptExclusionKeys(output)); setOutputMediaKind(output.render.mediaKind === "video" ? "video" : "audio"); setPrimaryVideoSourceId(output.render.primaryVideoSourceId || ""); setEditing(true); }} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-900"><Scissors className="mr-1.5 inline" size={14} />{output.render.status === "FAILED" ? "Review trim and try again" : output.status === "DRAFT" ? "Edit private preview" : "Create new private edit"}</button> : null}
      </div> : null}

      <p className="mt-4 text-[11px] font-semibold leading-5 text-sky-800"><LockKeyhole className="mr-1 inline" size={13} />Only you can see the preview. Sharing gives the named client access inside this Session; it does not create a public link or change the original recordings.</p>
    </section>
  );
}
