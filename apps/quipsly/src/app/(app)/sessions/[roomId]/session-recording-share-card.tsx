"use client";
import { SessionRecordingAudio } from "@/components/session-recording-audio";
import { RecordingEditListen } from "@/components/recording-edit-listen";
import { TranscriptExportDialog } from "@/components/transcript-export-dialog";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { Download, FileAudio, FileText, Headphones, LockKeyhole, Play, Redo2, RefreshCw, RotateCcw, Scissors, Send, ShieldCheck, Undo2 } from "lucide-react";
import { recordingEditHistory, reduceRecordingEditHistory, type RecordingEditDraft } from "@/lib/recording-edit-history";
import { recordingEditMatchesOutput, restoreRecordingEdit, serializeRecordingEdit } from "@/lib/recording-edit-draft";
import { RecordingEditSync, recordingEditKey } from "@/lib/recording-edit-sync";
import { recordingKeptRanges, type RecordingTimeRange } from "@/lib/recording-manual-cuts";

type Source = {
  id: string;
  participantId: string;
  participantLabel: string;
  kind: string;
  fileName: string | null;
  contentType?: string | null;
  sizeBytes: number;
  startedAt: string;
  stoppedAt: string;
  durationSeconds?: number;
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
  body: { edit?: { startSeconds?: number; endSeconds?: number; transcriptExclusions?: TranscriptSegment[]; manualCuts?: RecordingTimeRange[] } };
  sourceManifest?: { sources?: Array<{ recordingAssetId?: string }> };
};

type Snapshot = {
  ok: boolean;
  code?: string;
  error?: string;
  role?: "COACH" | "CLIENT" | "COLLABORATOR";
  room?: { id: string; title: string; client: { id: string; label: string }; coach: { id: string; label: string } | null };
  available?: {
    selectedTakeId?: string | null;
    takes?: Array<{id: string; startedAt: string; sourceCount: number}>;
    programDurationSeconds: number;
    timeline?: {
      authority: "single-source-origin" | "reviewed-waveform-placement" | "mixed-waveform-clock-placement" | "capture-clock-proposal" | "reported-wall-clock-fallback";
      precision: "unavailable" | "provisional" | "measured";
      reason: string;
      sources: Array<{ recordingAssetId: string; programOffsetSeconds: number; timingUncertaintyMilliseconds: number | null }>;
    };
    sources: Source[];
    transcriptSegments: TranscriptSegment[];
  };
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

function sourceDuration(source: Source) {
  return typeof source.durationSeconds === "number" && Number.isFinite(source.durationSeconds) && source.durationSeconds > 0
    ? source.durationSeconds : Math.max(0, (Date.parse(source.stoppedAt) - Date.parse(source.startedAt)) / 1_000);
}

function defaultParticipantSources(sources: Source[]) {
  const byParticipant = new Map<string, Source[]>();
  for (const source of sources) {
    const participantSources = byParticipant.get(source.participantId) || [];
    participantSources.push(source);
    byParticipant.set(source.participantId, participantSources);
  }
  const selected: Source[] = [];
  for (const participantSources of byParticipant.values()) {
    const audio = participantSources.filter((source) =>
      source.kind === "LOCAL_AUDIO" || source.contentType?.startsWith("audio/"),
    );
    const candidates = audio.length ? audio : participantSources;
    const interval = (source: Source) => {
      const startedAt = Date.parse(source.startedAt);
      const stoppedAt = Date.parse(source.stoppedAt);
      if (!Number.isFinite(startedAt) || !Number.isFinite(stoppedAt) || stoppedAt <= startedAt) return null;
      return {
        startSeconds: source.programOffsetSeconds,
        endSeconds: source.programOffsetSeconds + sourceDuration(source),
      };
    };
    const timed = candidates.every((source) => interval(source) !== null);
    if (!timed) {
      if (candidates[0]) selected.push(candidates[0]);
      continue;
    }
    const groups: Source[][] = [];
    for (const source of [...candidates].sort((left, right) =>
      interval(left)!.startSeconds - interval(right)!.startSeconds || left.id.localeCompare(right.id),
    )) {
      const latest = groups.at(-1);
      const latestEnd = latest
        ? Math.max(...latest.map((item) => interval(item)!.endSeconds))
        : Number.NEGATIVE_INFINITY;
      if (!latest || interval(source)!.startSeconds >= latestEnd) groups.push([source]);
      else latest.push(source);
    }
    for (const group of groups) {
      const preferred = [...group].sort((left, right) =>
        sourceDuration(right) - sourceDuration(left) ||
        left.id.localeCompare(right.id),
      )[0];
      if (preferred) selected.push(preferred);
    }
  }
  return selected.map((source) => source.id);
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

function draftFromSnapshot(snapshot: Snapshot): RecordingEditDraft {
  const output = snapshot.output;
  return {
    selected: new Set(outputSourceIds(output, snapshot.available?.sources || [])),
    title: output?.title || `${snapshot.room?.title || "Coaching Session"} recording`,
    startSeconds: Number(output?.body.edit?.startSeconds) || 0,
    endSeconds: Number(output?.body.edit?.endSeconds) || snapshot.available?.programDurationSeconds || 0,
    excludedTranscriptKeys: transcriptExclusionKeys(output),
    manualCuts: output?.body.edit?.manualCuts ?? [],
    outputMediaKind: output?.render.mediaKind === "video" ? "video" : "audio",
    primaryVideoSourceId: output?.render.primaryVideoSourceId || "",
  };
}

function recordingCutElementId(key: string) {
  return `recording-cut-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function editDuration(startSeconds: number, endSeconds: number, exclusions: Array<RecordingTimeRange & {cutStartSeconds?: number; cutEndSeconds?: number}>) {
  const kept = recordingKeptRanges(startSeconds, endSeconds, exclusions.map(item => ({startSeconds: item.cutStartSeconds ?? item.startSeconds, endSeconds: item.cutEndSeconds ?? item.endSeconds})));
  const previewSeconds = kept.reduce((total, range) => total + range.endSeconds - range.startSeconds, 0);
  return {
    removedSeconds: Math.max(0, endSeconds - startSeconds - previewSeconds),
    previewSeconds,
  };
}

export function SessionRecordingShareCard({
  roomId,
  focusTranscriptKey = null,
  initialSourceId = null,
  renderOriginalRecordings,
  onTakeSourcesChange,
}: {
  roomId: string;
  focusTranscriptKey?: string | null;
  initialSourceId?: string | null;
  renderOriginalRecordings?: (sourceIds: string[], editing: {
    selectedSourceIds: string[];
    sourceOffsets: Record<string, number>;
    removedRanges: Array<{startSeconds: number; endSeconds: number}>;
    startSeconds: number;
    endSeconds: number;
    disabled: boolean;
    onTrimBoundary: (boundary: "start" | "end", sourceId: string, sourceSeconds: number) => void;
    onCutBoundary?: (boundary: "start" | "end", sourceId: string, sourceSeconds: number) => void;
  }) => ReactNode;
  onTakeSourcesChange?: (sourceIds: string[]) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [editHistory, editDispatch] = useReducer(reduceRecordingEditHistory, undefined, () => recordingEditHistory({
    selected: new Set(), startSeconds: 0, endSeconds: 0, title: "", outputMediaKind: "audio", primaryVideoSourceId: "", excludedTranscriptKeys: new Set(),
  }));
  const {selected, startSeconds, endSeconds, title, outputMediaKind, primaryVideoSourceId, excludedTranscriptKeys} = editHistory.present;
  const manualCuts = editHistory.present.manualCuts ?? [];
  const [cutSelection, setCutSelection] = useState<{takeId: string | null; start: string; end: string}>({takeId: null, start: "", end: ""});
  const currentTakeId = snapshot?.available?.selectedTakeId ?? null;
  const cutStart = cutSelection.takeId === currentTakeId ? cutSelection.start : "";
  const cutEnd = cutSelection.takeId === currentTakeId ? cutSelection.end : "";
  function selectCut(boundary: "start" | "end", value: string) {
    setCutSelection(previous => ({...(previous.takeId === currentTakeId ? previous : {start: "", end: ""}), takeId: currentTakeId, [boundary]: value}));
  }
  function editField<K extends keyof RecordingEditDraft>(key: K, value: SetStateAction<RecordingEditDraft[K]>, group?: string) {
    editDispatch({type: "change", at: Date.now(), group, update: draft => ({[key]: typeof value === "function" ? (value as (old: RecordingEditDraft[K]) => RecordingEditDraft[K])(draft[key]) : value})});
  }
  const setSelected = (value: SetStateAction<Set<string>>) => editField("selected", value);
  const setStartSeconds = (value: number) => editField("startSeconds", value, "trim-start");
  const setEndSeconds = (value: number) => editField("endSeconds", value, "trim-end");
  const setTitle = (value: string) => editField("title", value, "title");
  const setExcludedTranscriptKeys = (value: SetStateAction<Set<string>>) => editField("excludedTranscriptKeys", value);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [transcriptView, setTranscriptView] = useState<"all" | "removed">("all");
  const [editing, setEditing] = useState(false);
  const editSurfaceRef = useRef<HTMLFieldSetElement | null>(null);
  const cutSurfaceRef = useRef<HTMLElement | null>(null);
  const requestedEditFocus = useRef<"editor" | "cut" | null>(null);
  useEffect(() => {
    const target = requestedEditFocus.current === "cut" ? cutSurfaceRef.current : requestedEditFocus.current === "editor" ? editSurfaceRef.current : null;
    if (!target) return;
    requestedEditFocus.current = null;
    target.scrollIntoView?.({block: "start"});
    target.focus({preventScroll: true});
  });
  const [audition, setAudition] = useState<PassageAudition | null>(null);
  const [auditionNotice, setAuditionNotice] = useState<string | null>(null);
  const auditionMediaRef = useRef<HTMLMediaElement | null>(null);
  const previewMediaRef = useRef<HTMLMediaElement | null>(null);
  const requestIds = useRef<Partial<Record<"PREPARE" | "RELEASE" | "REVOKE", string>>>({});
  const requestFingerprints = useRef<Partial<Record<"PREPARE" | "RELEASE" | "REVOKE", string>>>({});
  const draftRoom = useRef<string | null>(null);
  const draftTouched = useRef(false);
  const selectedTake = useRef<{roomId: string; id: string} | null>(null);
  const loadSequence = useRef(0);
  const currentDraft = useRef({ history: editHistory, editing });
  currentDraft.current = { history: editHistory, editing };
  const takeDrafts = useRef(new Map<string, typeof currentDraft.current>());
  const editSyncs = useRef(new Map<string, RecordingEditSync>());
  const activeEditSync = useRef<RecordingEditSync | null>(null);
  const [, setSyncUpdate] = useState(0);
  const [syncReadError, setSyncReadError] = useState<string | null>(null);
  const selectedSourceIds = snapshot?.role === "COACH" ? (snapshot.available?.sources || []).map(source => source.id).join("|") : "";
  useEffect(() => {
    if (selectedSourceIds) onTakeSourcesChange?.(selectedSourceIds.split("|"));
  }, [onTakeSourcesChange, selectedSourceIds]);

  useEffect(() => {
    const syncs = editSyncs.current;
    return () => {
      for (const sync of syncs.values()) { sync.onChange = undefined; void sync.flush(); }
      syncs.clear();
      activeEditSync.current = null;
    };
  }, [roomId]);

  const load = useCallback(async (quiet = false, resetDraft = false, takeId?: string) => {
    const sequence = ++loadSequence.current;
    if (takeId && selectedTake.current?.roomId === roomId && draftTouched.current) {
      takeDrafts.current.set(`${roomId}|${selectedTake.current.id}`, currentDraft.current);
    }
    if (!quiet) { setBusy("LOAD"); setNotice(null); }
    try {
      if (takeId) await activeEditSync.current?.flush();
      const requestedTakeId = takeId ?? (selectedTake.current?.roomId === roomId ? selectedTake.current.id : "");
      const query = requestedTakeId ? `?${new URLSearchParams({takeId: requestedTakeId})}`
        : initialSourceId ? `?${new URLSearchParams({sourceId: initialSourceId})}` : "";
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/recording-share${query}`, { cache: "no-store" });
      const payload = await response.json() as Snapshot;
      if (sequence !== loadSequence.current) return;
      if ([401, 403, 404].includes(response.status)) {
        setSnapshot(null);
        setEditing(false);
        draftRoom.current = null;
        draftTouched.current = false;
        selectedTake.current = null;
        requestIds.current = {};
        requestFingerprints.current = {};
        takeDrafts.current.clear();
        activeEditSync.current = null;
        editSyncs.current.clear();
      }
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Quipsly could not load the recording workspace.");
      if (payload.room?.id !== roomId) throw new Error("This recording workspace changed. Please reload.");
      const syncKey = `${roomId}|${payload.available?.selectedTakeId ?? ""}`;
      let sync = payload.role === "COACH" ? editSyncs.current.get(syncKey) ?? null : null;
      if (!sync && payload.role === "COACH" && payload.available?.selectedTakeId) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15_000);
        try {
          const url = `/api/sessions/${encodeURIComponent(roomId)}/recording-edit?${new URLSearchParams({takeId: payload.available.selectedTakeId})}`;
          const savedResponse = await fetch(url, {cache: "no-store", signal: controller.signal});
          const saved = await savedResponse.json();
          if (!savedResponse.ok || !saved.ok || !saved.actorUserId) throw new Error(saved.error || "Your saved edit could not load. Refresh to reconnect.");
          if (sequence !== loadSequence.current) return;
          sync = new RecordingEditSync(url, saved.actorUserId, saved.edit ?? null);
          editSyncs.current.set(syncKey, sync);
          setSyncReadError(null);
        } catch (error) {
          if (sequence !== loadSequence.current) return;
          setSyncReadError(controller.signal.aborted || error instanceof Error && error.name === "AbortError"
            ? "Connecting to your saved edit is taking longer than expected. Your changes here are kept."
            : "Your saved edit couldn’t connect. Your changes here are kept; retry when connected.");
        } finally { window.clearTimeout(timeout); }
      }
      if (sequence !== loadSequence.current) return;
      activeEditSync.current = sync;
      if (sync) sync.onChange = () => {
        if (activeEditSync.current === sync) setSyncUpdate(value => value + 1);
      };
      setSnapshot(payload);
      setLoadNotice(null);
      selectedTake.current = payload.available?.selectedTakeId ? {roomId, id: payload.available.selectedTakeId} : null;
      if (resetDraft && !takeId && selectedTake.current) takeDrafts.current.delete(`${roomId}|${selectedTake.current.id}`);
      if (payload.role !== "COACH") takeDrafts.current.clear();
      if (takeId) { setEditing(false); setAudition(null); setAuditionNotice(null); }
      // Refresh and render polling update availability, not the person's draft.
      // Untouched defaults can follow arriving sources; changed drafts stay put.
      const initializeDraft = draftRoom.current !== roomId || resetDraft || !draftTouched.current;
      if (!initializeDraft && sync) {
        // Reconnecting autosave must keep work done while its initial read was
        // unavailable, even when the media snapshot itself has not changed.
        sync.set(serializeRecordingEdit(currentDraft.current.history.present, currentDraft.current.editing, payload.output));
      }
      if (initializeDraft) editDispatch({type: "reset", draft: draftFromSnapshot(payload)});
      const restoredDraft = takeId ? takeDrafts.current.get(`${roomId}|${takeId}`) : null;
      const savedState = sync?.state && recordingEditMatchesOutput(sync.state, payload.output) ? sync.state : null;
      const restoreSaved = initializeDraft && savedState;
      if (restoredDraft && (!restoreSaved || recordingEditKey(serializeRecordingEdit(restoredDraft.history.present, restoredDraft.editing, payload.output)) === recordingEditKey(restoreSaved))) {
        editDispatch({type: "restore", history: restoredDraft.history});
        setEditing(restoredDraft.editing);
      } else if (restoreSaved) {
        editDispatch({type: "reset", draft: restoreRecordingEdit(restoreSaved)});
        setEditing(restoreSaved.editing);
      }
      draftRoom.current = roomId;
      if (initializeDraft) draftTouched.current = Boolean(restoredDraft || restoreSaved);
    } catch (error) {
      if (sequence === loadSequence.current) setLoadNotice(error instanceof Error ? error.message : "Quipsly could not load the recording workspace.");
    } finally {
      if (sequence === loadSequence.current) setBusy(current => current === "LOAD" ? null : current);
    }
  }, [roomId, initialSourceId]);

  useEffect(() => { void load(); return () => { loadSequence.current += 1; }; }, [load]);
  useEffect(() => {
    if (draftTouched.current && snapshot?.role === "COACH" && draftRoom.current === roomId) {
      activeEditSync.current?.set(serializeRecordingEdit(editHistory.present, editing, snapshot.output));
    }
  }, [editHistory.present, editing, roomId, snapshot?.role, snapshot?.output]);
  useEffect(() => {
    if (!snapshot?.output || !["QUEUED", "PROCESSING"].includes(snapshot.output.render.status)) return;
    const timer = window.setInterval(() => void load(true), 1_500);
    return () => window.clearInterval(timer);
  }, [load, snapshot?.output]);

  const duration = snapshot?.available?.programDurationSeconds || 0;
  function markTrimBoundary(boundary: "start" | "end", sourceId: string, sourceSeconds: number, cut = false) {
    if (snapshot?.role !== "COACH" || busy) return;
    const source = snapshot.available?.sources.find(candidate => candidate.id === sourceId);
    if (!source || !selected.has(sourceId) || !Number.isFinite(sourceSeconds)
      || sourceSeconds < 0 || !Number.isFinite(sourceDuration(source)) || sourceSeconds > sourceDuration(source)
      || !Number.isFinite(source.programOffsetSeconds)) {
      setNotice("Choose a track included in this edit before marking its start or end.");
      return;
    }
    // The player clock belongs to one source; edit boundaries belong to the
    // assembled session. Never treat a late-joining participant's zero as zero.
    const position = Math.max(0, Math.min(duration, source.programOffsetSeconds + sourceSeconds));
    if (cut) {
      if (boundary === "end") requestedEditFocus.current = "cut";
      selectCut(boundary, position.toFixed(3));
      setEditing(true);
      setNotice(`Cut ${boundary} set to ${time(position)}. Choose the other end, then remove the section below.`);
      return;
    }
    if (boundary === "start" ? position > endSeconds - MIN_TRIM_SECONDS : position < startSeconds + MIN_TRIM_SECONDS) {
      setNotice(boundary === "start" ? "Choose a start before the current end, or extend the end first." : "Choose an end after the current start, or move the start first.");
      return;
    }
    draftTouched.current = true;
    setEditing(true);
    editDispatch({type: "change", at: Date.now(), update: boundary === "start" ? {startSeconds: position} : {endSeconds: position}});
    setNotice(null);
  }
  const timeline = snapshot?.available?.timeline;
  const maximumTimingUncertainty = Math.max(
    0,
    ...(timeline?.sources.map((source) => source.timingUncertaintyMilliseconds || 0) || []),
  );
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
  const visibleTranscript = useMemo(() => {
    const query = transcriptQuery.trim().toLocaleLowerCase();
    return editableTranscript.filter((segment) => {
      const key = `${segment.transcriptJobId}:${segment.segmentId}`;
      if (transcriptView === "removed" && !excludedTranscriptKeys.has(key)) return false;
      if (!query) return true;
      return `${segment.speakerLabel} ${segment.text}`.toLocaleLowerCase().includes(query);
    });
  }, [editableTranscript, excludedTranscriptKeys, transcriptQuery, transcriptView]);
  const durationEstimate = useMemo(
    () => editDuration(startSeconds, endSeconds, [...excludedTranscriptSegments, ...manualCuts]),
    [endSeconds, excludedTranscriptSegments, startSeconds, manualCuts],
  );
  const removedRanges = [...excludedTranscriptSegments.map(segment => ({startSeconds: segment.cutStartSeconds ?? segment.startSeconds, endSeconds: segment.cutEndSeconds ?? segment.endSeconds})), ...manualCuts];
  const candidateCut = {startSeconds: Number(cutStart), endSeconds: Number(cutEnd)};
  const canCut = cutStart !== "" && cutEnd !== "" && Number.isFinite(candidateCut.startSeconds) && Number.isFinite(candidateCut.endSeconds)
    && candidateCut.startSeconds >= startSeconds && candidateCut.endSeconds <= endSeconds
    && candidateCut.endSeconds - candidateCut.startSeconds >= 0.05 && manualCuts.length < 500
    && editDuration(startSeconds, endSeconds, [...removedRanges, candidateCut]).previewSeconds >= 0.05;
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
    if (!focusTranscriptKey || !snapshot?.role) return;
    if (snapshot.output && !editing) {
      editDispatch({type: "reset", draft: draftFromSnapshot(snapshot)});
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
      const body: Record<string, unknown> = { action };
      if (action === "PREPARE") Object.assign(body, {
        title,
        sourceIds: [...selected],
        outputMediaKind,
        primaryVideoSourceId: outputMediaKind === "video" ? primaryVideoSourceId : null,
        startSeconds,
        endSeconds,
        manualCuts,
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
      const fingerprint = JSON.stringify(body);
      if (requestFingerprints.current[action] !== fingerprint) {
        requestIds.current[action] = crypto.randomUUID();
        requestFingerprints.current[action] = fingerprint;
      }
      body.clientRequestId = requestIds.current[action];
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/recording-share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as Snapshot;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The recording decision was not confirmed.");
      setNotice(action === "PREPARE"
        ? null // The render state below owns progress; don't retain a stale queued notice.
        : action === "RELEASE"
          ? `Released inside ${output?.recipient.label}'s private Session. No email or public link was sent.`
          : "Client access revoked. Original masters and decision history remain intact.");
      delete requestIds.current[action];
      delete requestFingerprints.current[action];
      if (action === "PREPARE") setEditing(false);
      await load(true, action === "PREPARE");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The recording decision was not confirmed.");
    } finally {
      setBusy(null);
    }
  }

  const visibleNotice = loadNotice || notice;
  if (!snapshot && !visibleNotice) {
    return <section className="rounded-2xl border border-[#ddcdaf] bg-[#fffdf8] p-5" role="status"><p className="flex items-center gap-2 text-sm font-semibold text-[#5b472f]"><RefreshCw size={16} className="animate-spin" aria-hidden="true" />Loading recording tools…</p></section>;
  }
  if (!snapshot?.role || !snapshot.room) {
    return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5" role="status"><LockKeyhole className="text-amber-800" /><h2 className="mt-3 font-serif text-2xl font-black text-amber-950">Recording tools unavailable</h2><p className="mt-2 text-sm font-semibold text-amber-900">{visibleNotice || "Quipsly could not load this recording workspace."}</p><button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-full border border-amber-300 bg-card px-4 text-sm font-bold text-amber-950">Try again</button></section>;
  }

  const output = snapshot.output;
  const coach = snapshot.role === "COACH";
  const verifiedRendererAvailable = Boolean(snapshot.readiness?.localRendererAvailable || snapshot.readiness?.cloudRendererAvailable);
  return (
    <section id="recording-share" className="rounded-3xl border border-border bg-muted/40 p-3 shadow-sm sm:p-6" aria-labelledby="recording-share-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-card p-3 text-muted-foreground shadow-sm"><FileAudio aria-hidden="true" size={22} /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Session recording</p>
            <h2 id="recording-share-heading" className="font-serif text-2xl font-black text-foreground">{coach ? "Trim and share" : "Shared recordings"}</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-foreground">
              {coach ? <>Recipient: <strong>{snapshot.room.client.label}</strong>. A draft stays coach-only until you share it.</> : output ? "Play or download the recording shared with you." : "When your coach shares an edited recording, it will appear here."}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-foreground disabled:opacity-50"><RefreshCw className={`mr-1.5 inline ${busy === "LOAD" ? "animate-spin" : ""}`} size={14} />Refresh</button>
      </div>

      {visibleNotice ? <p className="mt-4 rounded-xl border border-border bg-card p-3 text-sm font-bold text-foreground" role="status">{visibleNotice}</p> : null}
      {coach && (syncReadError || activeEditSync.current) ? <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-label="Edit sync">
        <span role="status">{syncReadError || activeEditSync.current?.error || ({saved: "Edits saved", unsaved: "Saving edits…", saving: "Saving edits…", error: "Edits not synced", conflict: "Edit changed on another device"}[activeEditSync.current?.status ?? "saved"])}</span>
        {activeEditSync.current?.status === "error" ? <button type="button" className="min-h-11 underline" onClick={() => void activeEditSync.current?.flush()}>Retry saving</button> : null}
        {activeEditSync.current?.status === "conflict" && activeEditSync.current.conflictRevision !== null ? <button type="button" className="min-h-11 underline" onClick={() => activeEditSync.current?.keepThisEdit()}>Keep this edit</button> : null}
        {syncReadError ? <button type="button" disabled={Boolean(busy)} className="min-h-11 underline disabled:opacity-50" onClick={() => void load()}>Reconnect saving</button> : null}
        {activeEditSync.current?.status === "conflict" ? <button type="button" className="min-h-11 underline" onClick={() => {
          if (selectedTake.current) {
            const key = `${roomId}|${selectedTake.current.id}`;
            const old = editSyncs.current.get(key);
            if (old) old.onChange = undefined;
            editSyncs.current.delete(key);
            takeDrafts.current.delete(key);
          }
          activeEditSync.current = null;
          draftTouched.current = false;
          void load(false, true);
        }}>Reload saved edit</button> : null}
      </div> : null}

      {coach && (snapshot.available?.takes?.length || 0) > 1 ? <label className="mt-4 block text-sm font-semibold text-foreground">
        Choose recording
        <select value={snapshot.available?.selectedTakeId || ""} disabled={Boolean(busy)}
          onChange={event => void load(false, true, event.target.value)}
          className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
          {snapshot.available?.takes?.map((take, index) => <option key={take.id} value={take.id}>
            {index === 0 ? "Latest · " : ""}{new Date(take.startedAt).toLocaleString(undefined, {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})} · {take.sourceCount} track{take.sourceCount === 1 ? "" : "s"}
          </option>)}
        </select>
        <span className="mt-1 block text-xs font-normal">Each recording includes the tracks captured together.</span>
      </label> : null}

      {coach && renderOriginalRecordings ? <div className="mt-4">{renderOriginalRecordings((snapshot.available?.sources || []).map(source => source.id), {
        selectedSourceIds: [...selected], startSeconds, endSeconds, disabled: Boolean(busy), onTrimBoundary: markTrimBoundary,
        onCutBoundary: (boundary, sourceId, seconds) => markTrimBoundary(boundary, sourceId, seconds, true),
        sourceOffsets: Object.fromEntries((snapshot.available?.sources || []).map(source => [source.id, source.programOffsetSeconds])),
        removedRanges,
      })}</div> : null}

      {coach && chosen.length > 0 ? <RecordingEditListen
        sources={chosen.map(source => ({id: source.id, label: source.participantLabel, url: source.playbackUrl,
          offset: source.programOffsetSeconds, duration: sourceDuration(source), contentType: source.contentType}))}
        startSeconds={startSeconds} endSeconds={endSeconds}
        cuts={removedRanges}
        disabled={Boolean(busy) || timeline?.precision === "unavailable"} /> : null}

      {coach && (!output || editing) ? (
        <fieldset disabled={Boolean(busy)} onChange={() => { draftTouched.current = true; }} onClick={() => { draftTouched.current = true; }}
          onKeyDown={event => {
            const target = event.target as HTMLElement;
            if (target.isContentEditable || target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range")) return;
            if (busy || !(event.metaKey || event.ctrlKey) || event.altKey) return;
            const key = event.key.toLowerCase();
            if (key !== "z" && key !== "y") return;
            event.preventDefault();
            draftTouched.current = true;
            editDispatch({type: key === "y" || event.shiftKey ? "redo" : "undo"});
          }}
          ref={editSurfaceRef} tabIndex={-1} aria-label="Recording edit" className="mt-5 min-w-0 scroll-mt-24 space-y-5 outline-none">
          <div className="flex flex-wrap items-center justify-between gap-3" role="group" aria-label="Recording edit history">
            <p className="text-xs text-foreground">Edit freely. Original recordings stay unchanged.</p>
            <div className="flex gap-2">
              <button type="button" disabled={!editHistory.past.length} onClick={() => editDispatch({type: "undo"})} aria-label="Undo recording edit" title="Undo (⌘Z / Ctrl+Z)" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground disabled:opacity-40"><Undo2 size={15} />Undo</button>
              <button type="button" disabled={!editHistory.future.length} onClick={() => editDispatch({type: "redo"})} aria-label="Redo recording edit" title="Redo (⌘⇧Z / Ctrl+Shift+Z)" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground disabled:opacity-40"><Redo2 size={15} />Redo</button>
            </div>
          </div>
          {output && editing ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"><p className="text-xs font-bold leading-5 text-foreground">Editing starts from revision {output.revision}. Your current {output.status === "RELEASED" ? "shared recording stays available" : "private preview stays unchanged"} until a new preview finishes.</p><button type="button" onClick={() => { editDispatch({type: "reset", draft: draftFromSnapshot(snapshot)}); setEditing(false); }} disabled={Boolean(busy)} className="rounded-lg border border-border bg-muted px-3 py-2 text-[11px] font-black text-foreground disabled:opacity-50">Cancel changes</button></div> : null}
          {output && editing && missingCurrentSources ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">{missingCurrentSources} source{missingCurrentSources === 1 ? " is" : "s are"} no longer in the verified Session take. Quipsly kept the remaining exact source selection and will not substitute another track. Restore or deliberately replace the missing source before creating a new preview.</p> : null}
          {!snapshot.readiness?.hasVerifiedParticipantSources ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">No complete, verified participant masters are ready yet. Finish the Session recording upload first.</p> : null}
          {timeline && timeline.precision !== "unavailable" ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" data-testid="recording-timeline-status"><p className="text-xs font-black text-emerald-950">{timeline.authority === "capture-clock-proposal" ? "Synced automatically from device clocks" : timeline.authority === "reported-wall-clock-fallback" ? "Placed automatically from recording start times" : timeline.authority === "reviewed-waveform-placement" ? "Synced from measured audio" : timeline.authority === "mixed-waveform-clock-placement" ? "Synced from audio and recording clocks" : "Recording timeline ready"}{maximumTimingUncertainty > 0 ? ` · estimated within ±${maximumTimingUncertainty.toFixed(0)} ms` : ""}</p><p className="mt-1 text-[11px] font-semibold leading-5 text-emerald-900">{timeline.reason}</p></div> : null}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Trim recording">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-sm font-black text-foreground">Trim the beginning and end</h3><p className="mt-1 text-xs font-semibold text-muted-foreground">Quipsly selected the high-quality tracks for this recording, including any reconnects.</p></div>
              <button type="button" onClick={() => { draftTouched.current = true; editDispatch({type: "change", at: Date.now(), update: {startSeconds: 0, endSeconds: duration}}); }} disabled={!duration || (startSeconds === 0 && endSeconds === duration)} className="rounded-lg border border-border bg-muted px-3 py-2 text-[11px] font-black text-foreground disabled:opacity-45"><RotateCcw className="mr-1 inline" size={12} />Use full recording</button>
            </div>
            <div className="mt-5 space-y-5">
              <label className="block text-xs font-black uppercase tracking-wide text-foreground"><span className="flex items-center justify-between gap-3"><span>Start</span><output className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] normal-case tracking-normal text-foreground">{time(startSeconds)}</output></span><input aria-label="Recording start" type="range" min={0} max={duration} step="0.1" value={startSeconds} onChange={(event) => setStartSeconds(trimStart(Number(event.target.value), endSeconds, duration))} className="mt-2 block w-full accent-primary" /></label>
              <label className="block text-xs font-black uppercase tracking-wide text-foreground"><span className="flex items-center justify-between gap-3"><span>End</span><output className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] normal-case tracking-normal text-foreground">{time(endSeconds)}</output></span><input aria-label="Recording end" type="range" min={0} max={duration} step="0.1" value={endSeconds} onChange={(event) => setEndSeconds(trimEnd(Number(event.target.value), startSeconds, duration))} className="mt-2 block w-full accent-primary" /></label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs font-bold text-foreground"><span>{time(startSeconds)} – {time(endSeconds)}</span><span>{time(endSeconds - startSeconds)} selected</span></div>
            <details className="mt-3 rounded-xl border border-border bg-muted/50 p-3"><summary className="cursor-pointer text-[11px] font-black uppercase tracking-wide text-foreground">Precise timing</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-foreground">Start (seconds)<input type="number" min={0} max={duration} step="0.1" value={startSeconds} onChange={(event) => setStartSeconds(trimStart(Number(event.target.value), endSeconds, duration))} className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground" /></label><label className="text-xs font-black text-foreground">End (seconds)<input type="number" min={0} max={duration} step="0.1" value={endSeconds} onChange={(event) => setEndSeconds(trimEnd(Number(event.target.value), startSeconds, duration))} className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground" /></label></div></details>
          </div>
          <section ref={cutSurfaceRef} tabIndex={-1} aria-label="Remove a section" className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
            <h3 className="text-sm font-black text-foreground">Remove a section</h3>
            <p className="mt-1 text-xs text-muted-foreground">Mark its start and end while listening, or enter seconds below. All tracks stay together. No transcript needed.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(["start", "end"] as const).map(boundary => <label key={boundary} className="min-w-0 text-xs font-semibold text-foreground">Cut {boundary} (seconds)
                <input type="number" min={startSeconds} max={endSeconds} step="0.01" value={boundary === "start" ? cutStart : cutEnd} onChange={event => selectCut(boundary, event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
              </label>)}
            </div>
            <button type="button" disabled={!canCut} onClick={() => {
              if (!canCut) return;
              editDispatch({type: "change", at: Date.now(), update: {manualCuts: [...manualCuts, candidateCut]}});
              setCutSelection({takeId: currentTakeId, start: "", end: ""});
              setNotice("Section removed from the edit. Listen to edit to hear it, or Undo to restore it.");
            }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Scissors size={15} />Remove section</button>
            {cutStart !== "" && cutEnd !== "" && !canCut ? <p className="mt-2 text-xs text-muted-foreground">Choose a section inside your trim and leave some recording to keep.</p> : null}
            {manualCuts.length ? <ul className="mt-3 space-y-2" aria-label="Removed sections">{manualCuts.map((cut, index) => <li key={`${index}:${cut.startSeconds}:${cut.endSeconds}`} className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-1 text-sm">
              <span className="tabular-nums">{time(cut.startSeconds)} – {time(cut.endSeconds)}</span>
              <button type="button" aria-label={`Restore section ${index + 1}`} onClick={() => editField("manualCuts", manualCuts.filter((_, item) => item !== index))} className="min-h-11 px-3 font-semibold text-foreground">Restore</button>
            </li>)}</ul> : null}
            <p className="mt-3 text-xs text-muted-foreground">Edited recording: about {time(durationEstimate.previewSeconds)}. Original unchanged.</p>
          </section>
          {videoSources.length ? <fieldset className="rounded-2xl border border-border bg-card p-4">
            <legend className="text-sm font-black text-foreground">Preview format</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Preview format">
              {(["audio", "video"] as const).map((kind) => <button key={kind} type="button" role="radio" aria-checked={outputMediaKind === kind} onClick={() => {
                const source = kind === "video" && !primaryVideoSourceId ? videoSources[0] : null;
                editDispatch({type: "change", at: Date.now(), update: {
                  outputMediaKind: kind,
                  ...(source ? {primaryVideoSourceId: source.id, selected: new Set(selected).add(source.id)} : {}),
                }});
              }} className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${outputMediaKind === kind ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground"}`}>{kind}</button>)}
            </div>
            {outputMediaKind === "video" ? <label className="mt-4 block text-xs font-black uppercase tracking-wide text-foreground">Primary camera
              <select value={primaryVideoSourceId} onChange={(event) => {
                editDispatch({type: "change", at: Date.now(), update: {
                  primaryVideoSourceId: event.target.value, selected: new Set(selected).add(event.target.value),
                }});
              }} className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm normal-case tracking-normal text-foreground">
                {videoSources.map((source) => <option key={source.id} value={source.id}>{source.participantLabel} · {source.fileName || "Camera"}</option>)}
              </select>
              <span className="mt-2 block text-xs font-semibold normal-case leading-5 tracking-normal text-muted-foreground">This exact camera supplies the picture. Quipsly uses one preferred local microphone per person and does not mix a camera mic over a selected dedicated mic.</span>
            </label> : null}
          </fieldset> : null}
          <details className="rounded-2xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-black text-foreground">Name and recording sources <span className="ml-1 text-xs font-bold text-muted-foreground">({chosen.length} selected)</span></summary><div className="mt-4 space-y-4"><label className="block text-xs font-black uppercase tracking-wide text-foreground">Recording name<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm normal-case tracking-normal text-foreground" /></label>{snapshot.available?.sources.length ? <fieldset><legend className="text-sm font-black text-foreground">High-quality tracks</legend><p className="mt-1 text-xs font-semibold text-muted-foreground">The recommended track for each person is selected automatically. Change this only when you need a different master.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{snapshot.available.sources.map((source) => <label key={source.id} className="flex cursor-pointer gap-3 rounded-xl border border-border bg-muted/40 p-3"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={selected.has(source.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(source.id)) next.delete(source.id); else next.add(source.id); return next; })} /><span><span className="block text-sm font-black text-foreground">{source.participantLabel}</span><span className="block text-xs font-semibold text-muted-foreground">{source.kind === "LOCAL_VIDEO" ? "Camera master audio" : "Local audio master"} · starts +{source.programOffsetSeconds.toFixed(2)}s · {megabytes(source.sizeBytes)}</span></span></label>)}</div></fieldset> : null}</div></details>
          {editableTranscript.length ? (
            <fieldset className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <legend className="flex items-center gap-2 text-sm font-black text-foreground"><FileText size={16} />Cut the recording by transcript</legend>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">Included passages stay in the recording. Clear a passage to remove it from this private preview. Transcript wording does not change.</p>
                </div>
                {excludedTranscriptSegments.length ? <button type="button" onClick={() => { draftTouched.current = true; setExcludedTranscriptKeys(new Set()); }} className="rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[11px] font-black text-foreground"><RotateCcw className="mr-1 inline" size={12} />Restore all</button> : null}
              </div>
              {audition && auditionSource ? (
                <div id="recording-cut-audition" className="mt-4 scroll-mt-28 rounded-xl border border-border bg-muted p-3" aria-label="Exact passage audition">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-foreground"><Headphones size={14} aria-hidden="true" />Exact participant master</p>
                      <p className="mt-1 text-sm font-black text-foreground">{audition.speakerLabel} · {time(audition.programStartSeconds)}–{time(audition.programEndSeconds)}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-foreground">{audition.text}</p>
                    </div>
                    <button type="button" onClick={beginAuditionPlayback} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-black text-primary-foreground"><Play size={13} fill="currentColor" aria-hidden="true" />Play passage</button>
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
                    <SessionRecordingAudio
                      ref={(node) => { auditionMediaRef.current = node; }}
                      aria-label={`Source passage from ${auditionSource.participantLabel}`}
                      className="mt-3 w-full"
                      controls
                      preload="metadata"
                      src={auditionSource.playbackUrl}
                      onLoadedMetadata={beginAuditionPlayback}
                      onTimeUpdate={stopAtAuditionBoundary}
                      onError={() => setAuditionNotice("Quipsly could not open this protected participant master. Refresh after source preparation finishes.")}
                    >Your browser cannot play this private participant recording.</SessionRecordingAudio>
                  )}
                  <p className="mt-2 text-[11px] font-bold leading-5 text-muted-foreground">This plays the original passage. Create a preview to hear your edit; the original recording stays unchanged.</p>
                </div>
              ) : null}
              {auditionNotice ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950" role="status">{auditionNotice}</p> : null}
              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="relative block">
                  <span className="sr-only">Search recording transcript</span>
                  <input
                    type="search"
                    value={transcriptQuery}
                    onChange={(event) => setTranscriptQuery(event.target.value)}
                    placeholder="Find words or a speaker"
                    aria-label="Search recording transcript"
                    className="block min-h-11 w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground"
                  />
                </label>
                <div className="grid grid-cols-2 rounded-xl bg-muted p-1" role="group" aria-label="Transcript passages to show">
                  <button type="button" aria-pressed={transcriptView === "all"} onClick={() => setTranscriptView("all")} className={`min-h-9 rounded-lg px-3 text-xs font-black ${transcriptView === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>All</button>
                  <button type="button" aria-pressed={transcriptView === "removed"} onClick={() => setTranscriptView("removed")} className={`min-h-9 rounded-lg px-3 text-xs font-black ${transcriptView === "removed" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Removed {excludedTranscriptSegments.length ? `(${excludedTranscriptSegments.length})` : ""}</button>
                </div>
              </div>
              <p className="mt-2 text-[11px] font-bold text-muted-foreground">Showing {visibleTranscript.length} of {editableTranscript.length} passages. Search changes only this view, not your edit.</p>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {visibleTranscript.map((segment) => {
                  const key = `${segment.transcriptJobId}:${segment.segmentId}`;
                  const included = !excludedTranscriptKeys.has(key);
                  const safe = segment.cutSafety === "safe" && Boolean(segment.timingFingerprint);
                  const focused = focusTranscriptKey === key;
                  return (
                    <div id={recordingCutElementId(key)} tabIndex={-1} key={key} className="scroll-mt-28 outline-none">
                      <label data-transcript-key={key} className={`grid grid-cols-[auto_4.5rem_1fr] gap-3 rounded-xl border p-3 outline-none ${focused ? "ring-4 ring-ring" : ""} ${!safe ? "cursor-not-allowed border-amber-200 bg-amber-50" : included ? "cursor-pointer border-border bg-muted/50" : "cursor-pointer border-rose-200 bg-rose-50 text-rose-950"}`}>
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-primary"
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
                        <span className="pt-0.5 text-[11px] font-black tabular-nums text-muted-foreground">{time(segment.startSeconds)}</span>
                        <span>
                          <span className="flex flex-wrap items-center gap-2 text-xs font-black text-foreground">
                            {segment.speakerLabel}
                            <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${!safe ? "bg-amber-100 text-amber-950" : included ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{!safe ? "Kept safe" : included ? "Included" : "Removed"}</span>
                          </span>
                          <span className={`mt-0.5 block text-sm leading-5 ${included ? "text-foreground" : "line-through decoration-rose-500"}`}>{segment.text}</span>
                          {!safe ? <span id={`${key}-safety`} className="mt-1 block text-[11px] font-bold leading-4 text-amber-900">{segment.cutSafetyReason || "Precise source timing is unavailable, so this passage stays included."}</span> : null}
                        </span>
                      </label>
                      <button type="button" onClick={() => loadPassageAudition(segment)} aria-pressed={audition?.key === key} className="ml-[6.75rem] mt-1 inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-black text-foreground aria-pressed:bg-muted"><Headphones size={13} aria-hidden="true" />Listen to exact passage</button>
                    </div>
                  );
                })}
                {!visibleTranscript.length ? <div className="rounded-xl border border-dashed border-border bg-muted/50 p-5 text-center"><p className="text-sm font-black text-foreground">No passages match this view</p><p className="mt-1 text-xs font-semibold text-muted-foreground">Try another search or show all passages.</p></div> : null}
              </div>
              <p className="mt-3 text-xs font-bold text-muted-foreground">{excludedTranscriptSegments.length ? `${excludedTranscriptSegments.length} passage${excludedTranscriptSegments.length === 1 ? "" : "s"} removed · ${time(durationEstimate.removedSeconds)} cut · preview about ${time(durationEstimate.previewSeconds)}.` : "Everything in the selected range is included."}</p>
            </fieldset>
          ) : (
            <p className="text-xs text-muted-foreground">When the transcript is ready, you can also remove passages by selecting their words.</p>
          )}
          {focusTranscriptKey && focusedTranscriptSegment && !focusedSegmentVisible ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">This passage is outside the current trim or source selection. Expand the start/end range or restore its participant track to edit it.</p> : null}
          <p className="text-xs font-bold text-muted-foreground"><Scissors className="mr-1 inline" size={14} />Prepared range {time(startSeconds)}–{time(endSeconds)} ({time(endSeconds - startSeconds)}) from {chosen.length} participant source{chosen.length === 1 ? "" : "s"}.</p>
          {rangeValid && durationEstimate.previewSeconds < 0.05 ? <p className="text-sm text-muted-foreground">This trim contains only removed sections. Restore a section or widen the trim to keep some recording.</p> : null}
          <button type="button" aria-label="Create private preview" disabled={Boolean(busy) || !chosen.length || !rangeValid || durationEstimate.previewSeconds < 0.05 || !videoSelectionValid || !verifiedRendererAvailable} onClick={() => void mutate("PREPARE")} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{busy === "PREPARE" ? "Creating preview…" : `Create private ${outputMediaKind} preview`}</button>
          {!verifiedRendererAvailable ? <p className="text-xs font-bold text-amber-800">Preview preparation is temporarily unavailable. Your trim and transcript choices stay here; try again shortly.</p> : null}
        </fieldset>
      ) : null}

      {output ? <div className="mt-5 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-foreground">{output.title}</p><p className="text-xs font-bold text-muted-foreground">{output.status === "DRAFT" ? "Private draft" : output.status === "RELEASED" ? `Shared with ${output.recipient.label}` : "Access revoked"}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">{{VERIFIED: "Ready", QUEUED: "Preparing", PROCESSING: "Preparing", FAILED: "Needs attention", NOT_REQUESTED: "Not prepared"}[output.render.status]}</span></div>
        {output.render.status === "VERIFIED" && output.mediaUrl ? <>{output.render.mediaKind === "video" ? <video
          ref={(node) => { previewMediaRef.current = node; }}
          aria-label={output.status === "RELEASED" ? "Shared video recording" : "Private video preview"}
          className="aspect-video w-full rounded-xl bg-black"
          controls playsInline preload="metadata" src={output.mediaUrl}
        >Your browser cannot play this private video.</video> : <SessionRecordingAudio
          ref={(node) => { previewMediaRef.current = node; }}
          aria-label={output.status === "RELEASED" ? "Shared recording" : "Private recording preview"}
          className="w-full" controls preload="metadata" src={output.mediaUrl}
        >Your browser cannot play this private recording.</SessionRecordingAudio>}<div className="flex flex-wrap gap-2 text-xs font-bold text-muted-foreground"><span>{time(output.render.durationSeconds || 0)}</span><span>·</span><span>{megabytes(output.render.sizeBytes)}</span></div><a href={`${output.mediaUrl}?download=1`} className="inline-flex min-h-11 items-center rounded-xl border border-border bg-muted px-3 py-2 text-sm font-semibold text-foreground"><Download className="mr-1.5" size={14} />Download recording</a></> : output.render.status === "FAILED" ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">The private copy did not pass verification, so nothing was shared. Your original recording and edit choices are safe.</p> : <p className="text-sm font-bold text-muted-foreground"><RefreshCw className="mr-2 inline animate-spin" size={15} />{output.render.mediaKind === "video" ? "Aligning picture and sound, leveling, decoding, and verifying the private preview…" : "Aligning, leveling, decoding, and verifying the private preview…"}</p>}
        {output.render.status === "VERIFIED" && output.mediaUrl ? <TranscriptExportDialog
          key={output.id} title={output.title} label="Export matching transcript"
          sourceUrl={`/api/sessions/${encodeURIComponent(roomId)}/recording-share/transcript/${encodeURIComponent(output.id)}`}
          description="Includes current text corrections and only the speech kept in this recording. Transcript and subtitle times follow this edited file, including cuts." /> : null}
        <details className="text-xs text-muted-foreground">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">File details</summary>
          <dl className="space-y-2 rounded-lg border border-border p-3">
            <div><dt className="font-semibold">Revision</dt><dd>{output.revision}</dd></div>
            <div><dt className="font-semibold">Processing status</dt><dd>{output.render.status}</dd></div>
            {output.render.sha256 && <div><dt className="font-semibold">SHA-256 checksum</dt><dd className="break-all font-mono">{output.render.sha256}</dd></div>}
          </dl>
        </details>
        {coach && output.status === "DRAFT" && output.render.status === "VERIFIED" ? <div className="rounded-xl border border-border bg-muted p-4">
          <p className="text-sm font-semibold leading-6 text-foreground">Preview the edit above when useful, or share it now. The original recordings remain unchanged.</p>
          <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("RELEASE")} className="mt-3 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="mr-2 inline" size={16} />Share with {output.recipient.label}</button>
        </div> : null}
        {coach && output.status === "RELEASED" ? <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("REVOKE")} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-900"><Undo2 className="mr-1.5 inline" size={14} />Revoke client access</button> : null}
        {!coach && output.status === "RELEASED" ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"><ShieldCheck className="mr-2 inline" size={16} />Your coach shared this private recording in your Session.</p> : null}
        {coach && !editing ? <button type="button" disabled={Boolean(busy)} onClick={() => { requestedEditFocus.current = "editor"; editDispatch({type: "reset", draft: draftFromSnapshot(snapshot)}); setEditing(true); }} className="rounded-xl border border-border bg-muted px-3 py-2 text-xs font-black text-foreground"><Scissors className="mr-1.5 inline" size={14} />{output.render.status === "FAILED" ? "Review trim and try again" : output.status === "DRAFT" ? "Edit private preview" : "Create new private edit"}</button> : null}
      </div> : null}

      {coach ? <p className="mt-4 text-[11px] font-semibold leading-5 text-muted-foreground"><LockKeyhole className="mr-1 inline" size={13} />{output?.status === "RELEASED"
        ? `This recording is shared with ${output.recipient.label} inside this Session. New edits stay private until you share them. The original recordings remain unchanged.`
        : "Only you can see the preview. Sharing gives the named client access inside this Session; it does not create a public link or change the original recordings."}</p> : null}
    </section>
  );
}
