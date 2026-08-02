"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, FilePenLine, History, ListTodo, LoaderCircle, NotebookPen, Play, RefreshCw, ShieldCheck, Sparkles, Target, X } from "lucide-react";

import { timestampForSeconds } from "./session-review-model";
import {
  EDITABLE_SESSION_NOTE_KINDS,
  SESSION_NOTE_VISIBILITIES,
  sessionNoteKindLabel,
  sessionNoteVisibilityLabel,
  type EditableSessionNoteKind,
  type SessionNoteVisibility,
} from "./session-notes-model";

type Correction = {
  id: string;
  segmentId: string;
  origin: "human" | "ai";
  status: "proposed" | "accepted" | "rejected" | "superseded";
  correctedText: string | null;
  correctedSpeakerLabel: string | null;
  reason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revisions: Array<{ revision: number; operation: string; createdAt: string }>;
};

type Verification = {
  id: string;
  segmentId: string;
  reviewKind: "confirmed-as-is";
  reviewedAt: string;
};

type Segment = {
  id: string;
  speakerLabel: string | null;
  providerSpeakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
  providerText: string;
  providerTextSha256: string;
  confidence: number | null;
  words: Array<{
    id: string;
    providerWordIndex: number;
    startSeconds: number;
    endSeconds: number;
    word: string;
    punctuatedWord: string;
    confidence: number | null;
    speakerLabel: string | null;
    channel: number | null;
  }>;
  acceptedCorrection: Correction | null;
  acceptedVerification: Verification | null;
  proposals: Correction[];
  correctionHistory: Correction[];
};

type Desk = {
  ok: boolean;
  error?: string;
  roomId: string;
  transcriptJobId: string | null;
  transcriptStatus: string | null;
  processing: null | {
    status: string;
    message: string | null;
    wordCount: number;
    sourceBound: boolean;
    executionRequestedAt: string | null;
    resultReceived: boolean;
    providerReceiptReceived: boolean;
    workerBuildId: string | null;
  };
  gate: { allowed: boolean; error?: string };
  recording: null | {
    id: string;
    status: string;
    kind: string;
    fileName: string;
    durationSeconds: number | null;
    eligibleForProtectedPlaybackPreparation: boolean;
  };
  playback: null | {
    sourceId: string;
    url: string;
    kind: "audio" | "video";
    recordingAssetId: string;
    durationSeconds: number | null;
    label: string;
  };
  segments: Segment[];
  boundaries: Record<string, boolean>;
};

function requestId(segmentId: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `transcript-${segmentId}-${crypto.randomUUID()}`;
  return `transcript-${segmentId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function humanize(value: string) {
  return value.replaceAll("-", " ").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ProposalReview({
  roomId,
  segment,
  proposal,
  playbackReady,
  currentPlaybackPosition,
  busy,
  onPlay,
  onSaved,
}: {
  roomId: string;
  segment: Segment;
  proposal: Correction;
  playbackReady: boolean;
  currentPlaybackPosition: () => number | null;
  busy: boolean;
  onPlay: () => Promise<void>;
  onSaved: (message: string) => Promise<void>;
}) {
  const [listened, setListened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "accept" | "reject") {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "review-ai-proposal",
          roomId,
          correctionId: proposal.id,
          decision,
          expectedAcceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
          confirmedAgainstPlayback: decision === "accept" && listened,
          playbackPositionSeconds: currentPlaybackPosition(),
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "The proposal decision was not saved.");
      await onSaved(decision === "accept"
        ? "AI proposal accepted only after playback review. Its reviewed overlay is now effective."
        : "AI proposal rejected and preserved in correction history.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "The proposal decision was not saved.");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-800"><Sparkles size={15} aria-hidden="true" />AI proposal · not transcript truth</p>
      {proposal.correctedSpeakerLabel && <p className="mt-2 text-sm font-bold text-violet-950">Proposed speaker: {proposal.correctedSpeakerLabel}</p>}
      <p className="mt-2 text-sm font-semibold leading-relaxed text-violet-950">{proposal.correctedText || segment.text}</p>
      {proposal.reason && <p className="mt-2 text-xs font-bold text-violet-800">Reason: {proposal.reason}</p>}
      <label className="mt-3 flex items-start gap-3 rounded-lg border border-violet-200 bg-white p-3 text-sm font-bold leading-relaxed text-violet-950">
        <input type="checkbox" checked={listened} onChange={(event) => setListened(event.target.checked)} className="mt-1 size-4 accent-violet-800" />
        <span>I played this exact timestamp and verified the proposal against the recording.</span>
      </label>
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void onPlay()} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50"><Play size={14} fill="currentColor" aria-hidden="true" />Play timestamp</button>
        <button type="button" onClick={() => void decide("accept")} disabled={!playbackReady || !listened || busy} className="inline-flex items-center gap-2 rounded-full bg-violet-800 px-3 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Accept after listening</button>
        <button type="button" onClick={() => void decide("reject")} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-800 disabled:opacity-50"><X size={14} aria-hidden="true" />Reject proposal</button>
      </div>
      <p className="mt-2 text-xs font-bold text-violet-800">Until accepted here, this proposal does not change the effective transcript.</p>
    </div>
  );
}

function CorrectionEditor({
  roomId,
  segment,
  canUseProjectTeamNotes,
  playbackReady,
  currentPlaybackPosition,
  busy,
  onPlay,
  onPlayAt,
  onSaved,
}: {
  roomId: string;
  segment: Segment;
  canUseProjectTeamNotes: boolean;
  playbackReady: boolean;
  currentPlaybackPosition: () => number | null;
  busy: boolean;
  onPlay: () => Promise<void>;
  onPlayAt: (seconds: number) => Promise<void>;
  onSaved: (message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [correctedText, setCorrectedText] = useState(segment.text);
  const [correctedSpeaker, setCorrectedSpeaker] = useState(segment.speakerLabel || "");
  const [reason, setReason] = useState("");
  const [listened, setListened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState(segment.text.slice(0, 180));
  const [taskDetail, setTaskDetail] = useState(`From ${timestampForSeconds(segment.startSeconds)}–${timestampForSeconds(segment.endSeconds)}: ${segment.text}`);
  const [taskRequestId, setTaskRequestId] = useState(() => requestId(`task-${segment.id}`));
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState(segment.text.slice(0, 180));
  const [goalDescription, setGoalDescription] = useState(`Source commitment at ${timestampForSeconds(segment.startSeconds)}–${timestampForSeconds(segment.endSeconds)}: ${segment.text}`);
  const [goalRequestId, setGoalRequestId] = useState(() => requestId(`goal-${segment.id}`));
  const [creatingNote, setCreatingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState(`Note — ${segment.text}`.slice(0, 180));
  const [noteBody, setNoteBody] = useState(segment.text);
  const [noteKind, setNoteKind] = useState<EditableSessionNoteKind>("SESSION_NOTE");
  const [noteVisibility, setNoteVisibility] = useState<SessionNoteVisibility>("AUTHOR_PRIVATE");
  const [noteRequestId, setNoteRequestId] = useState(() => requestId(`note-${segment.id}`));
  const [noteHref, setNoteHref] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState(`Draft — ${segment.text}`.slice(0, 180));
  const [draftOpeningNote, setDraftOpeningNote] = useState("");
  const [draftRequestId, setDraftRequestId] = useState(() => requestId(`draft-${segment.id}`));
  const [draftHref, setDraftHref] = useState<string | null>(null);

  useEffect(() => {
    setCorrectedText(segment.text);
    setCorrectedSpeaker(segment.speakerLabel || "");
    setListened(false);
    setDraftTitle(`Draft — ${segment.text}`.slice(0, 180));
    setDraftOpeningNote("");
    setDraftHref(null);
    setNoteTitle(`Note — ${segment.text}`.slice(0, 180));
    setNoteBody(segment.text);
    setNoteHref(null);
  }, [segment.id, segment.text, segment.speakerLabel, segment.acceptedCorrection?.id]);

  async function save() {
    setError(null);
    const position = currentPlaybackPosition();
    try {
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "accept-human-correction",
          roomId,
          segmentId: segment.id,
          clientRequestId: requestId(segment.id),
          expectedText: segment.providerText,
          expectedSpeakerLabel: segment.providerSpeakerLabel,
          expectedAcceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
          correctedText,
          correctedSpeakerLabel: correctedSpeaker,
          reason,
          confirmedAgainstPlayback: listened,
          playbackPositionSeconds: position,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error || "The correction was not saved.");
      setEditing(false);
      setReason("");
      await onSaved(body.idempotentReplay
        ? "This reviewed correction was already saved; no duplicate was created."
        : "Reviewed correction saved. Provider words and media timing remain unchanged underneath it.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The correction was not saved.");
    }
  }

  async function confirmAsIs() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "confirm-segment-as-is",
          roomId,
          segmentId: segment.id,
          clientRequestId: requestId(`verify-${segment.id}`),
          expectedText: segment.providerText,
          expectedSpeakerLabel: segment.providerSpeakerLabel,
          expectedAcceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
          confirmedAgainstPlayback: true,
          playbackPositionSeconds: currentPlaybackPosition(),
          reviewNote: "Confirmed as-is in the Nest transcript review desk.",
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error || "The review decision was not saved.");
      await onSaved(body.idempotentReplay
        ? "This provider segment was already confirmed; no duplicate review receipt was created."
        : "Segment confirmed as heard. Quipsly preserved the provider text and added a playback-backed review receipt.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The review decision was not saved.");
    }
  }

  async function createTask() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          segmentId: segment.id,
          clientRequestId: taskRequestId,
          expectedProviderTextSha256: segment.providerTextSha256,
          title: taskTitle,
          detail: taskDetail,
          surface: "nest-session-transcript-review",
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean; task?: { title?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error || "The task was not created.");
      setCreatingTask(false);
      setTaskRequestId(requestId(`task-${segment.id}`));
      await onSaved(body.idempotentReplay
        ? "That source-linked task was already created; no duplicate was added."
        : `Task created in Today and Work: ${body.task?.title || taskTitle}`);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "The task was not created.");
    }
  }

  async function createGoal() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, segmentId: segment.id, clientRequestId: goalRequestId, expectedProviderTextSha256: segment.providerTextSha256, title: goalTitle, description: goalDescription, surface: "nest-session-transcript-review" }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean; goal?: { title?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error || "The goal was not created.");
      setCreatingGoal(false);
      setGoalRequestId(requestId(`goal-${segment.id}`));
      await onSaved(body.idempotentReplay ? "That source-linked goal was already created; no duplicate was added." : `Goal created in Work: ${body.goal?.title || goalTitle}`);
    } catch (goalError) {
      setError(goalError instanceof Error ? goalError.message : "The goal was not created.");
    }
  }

  async function createNote() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          segmentId: segment.id,
          clientRequestId: noteRequestId,
          expectedProviderTextSha256: segment.providerTextSha256,
          title: noteTitle,
          body: noteBody,
          kind: noteKind,
          visibility: noteVisibility,
          surface: "nest-session-transcript-review",
        }),
      });
      const body = await response.json() as {
        ok?: boolean;
        error?: string;
        idempotentReplay?: boolean;
        note?: { title?: string | null; href?: string };
      };
      if (!response.ok || !body.ok || !body.note?.href) throw new Error(body.error || "The source-linked Session note was not saved.");
      setCreatingNote(false);
      setNoteHref(body.note.href);
      setNoteRequestId(requestId(`note-${segment.id}`));
      await onSaved(body.idempotentReplay
        ? "That exact source-linked Session note was already saved; no duplicate was added."
        : `${sessionNoteKindLabel(noteKind)} saved for ${sessionNoteVisibilityLabel(noteVisibility).toLowerCase()} review. Nothing was sent.`);
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : "The source-linked Session note was not saved.");
    }
  }

  async function createDraft() {
    setError(null);
    try {
      const response = await fetch("/api/mobile/capture/transcripts/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          segmentId: segment.id,
          clientRequestId: draftRequestId,
          expectedProviderTextSha256: segment.providerTextSha256,
          title: draftTitle,
          openingNote: draftOpeningNote,
          surface: "nest-session-transcript-review",
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; idempotentReplay?: boolean; document?: { title?: string; href?: string } };
      if (!response.ok || !body.ok || !body.document?.href) throw new Error(body.error || "The source-linked draft was not created.");
      setCreatingDraft(false);
      setDraftHref(body.document.href);
      setDraftRequestId(requestId(`draft-${segment.id}`));
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "The source-linked draft was not created.");
    }
  }

  return (
    <li id={`transcript-segment-${encodeURIComponent(segment.id)}`} tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm outline-none target:border-sky-500 target:ring-4 target:ring-sky-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-sky-800">
            {timestampForSeconds(segment.startSeconds)}–{timestampForSeconds(segment.endSeconds)} · {segment.speakerLabel || "Unlabelled speaker"}
          </p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[#5f4d37]">{segment.text}</p>
          {segment.words.length > 0 && (
            <details className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-sky-900">
                Precise word timing · {segment.words.length} anchors
              </summary>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-sky-800">
                Choose a provider word to play its exact immutable timestamp. Reviewed corrections above never move these anchors.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Timed words from ${timestampForSeconds(segment.startSeconds)}`}>
                {segment.words.map((word) => (
                  <button
                    key={word.id}
                    type="button"
                    onClick={() => void onPlayAt(word.startSeconds)}
                    disabled={!playbackReady || busy}
                    className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-sm font-semibold text-sky-950 transition hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-50"
                    aria-label={`Play ${word.punctuatedWord} at ${timestampForSeconds(word.startSeconds)}`}
                    title={`${timestampForSeconds(word.startSeconds)}–${timestampForSeconds(word.endSeconds)}`}
                  >
                    {word.punctuatedWord}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
        <button type="button" onClick={() => void onPlay()} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-sky-900 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Play transcript segment from ${timestampForSeconds(segment.startSeconds)}`}>
          <Play size={14} fill="currentColor" aria-hidden="true" /> Play from here
        </button>
      </div>

      {segment.acceptedCorrection && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-800"><ShieldCheck size={15} aria-hidden="true" />Reviewed correction · revision {segment.acceptedCorrection.revisions.length}</p>
          {segment.providerSpeakerLabel !== segment.speakerLabel && <p className="mt-2 text-sm font-bold text-emerald-950">Speaker: {segment.providerSpeakerLabel || "Unlabelled"} → {segment.speakerLabel || "Unlabelled"}</p>}
          {segment.providerText !== segment.text && <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-950">{segment.text}</p>}
          {segment.acceptedCorrection.reason && <p className="mt-2 text-xs font-bold text-emerald-800">Reason: {segment.acceptedCorrection.reason}</p>}
        </div>
      )}

      {!segment.acceptedCorrection && segment.acceptedVerification && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-800"><ShieldCheck size={15} aria-hidden="true" />Reviewed as heard · provider text confirmed</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-950">A person played this exact timestamp and confirmed the provider words and speaker without inventing a no-op correction.</p>
        </div>
      )}

      {segment.proposals.map((proposal) => (
        <ProposalReview
          key={proposal.id}
          roomId={roomId}
          segment={segment}
          proposal={proposal}
          playbackReady={playbackReady}
          currentPlaybackPosition={currentPlaybackPosition}
          busy={busy}
          onPlay={onPlay}
          onSaved={onSaved}
        />
      ))}

      {editing ? (
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <label className="block text-xs font-black uppercase tracking-wide text-amber-950">Correct speaker
            <input value={correctedSpeaker} onChange={(event) => setCorrectedSpeaker(event.target.value)} maxLength={160} className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
          </label>
          <label className="block text-xs font-black uppercase tracking-wide text-amber-950">Correct words
            <textarea value={correctedText} onChange={(event) => setCorrectedText(event.target.value)} maxLength={10000} rows={4} className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" />
          </label>
          <label className="block text-xs font-black uppercase tracking-wide text-amber-950">Why this changed <span className="normal-case tracking-normal text-amber-800">(optional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Name, wording, crosstalk, diarization…" className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm font-bold leading-relaxed text-amber-950">
            <input type="checkbox" checked={listened} onChange={(event) => setListened(event.target.checked)} className="mt-1 size-4 accent-amber-800" />
            <span>I listened to this exact timestamp and these words match the protected recording.</span>
          </label>
          {error && <p role="alert" className="flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={busy || !listened || !playbackReady || (!correctedText.trim() && !correctedSpeaker.trim())} className="inline-flex items-center gap-2 rounded-full bg-[#3e2f21] px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Accept reviewed correction</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button>
          </div>
          <p className="text-xs font-bold leading-relaxed text-amber-800">Saving adds a reviewed overlay and audit revision. It does not overwrite provider output, move timestamps, create tasks, send notes, or publish anything.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!segment.acceptedCorrection && !segment.acceptedVerification && (
            <button type="button" onClick={() => void confirmAsIs()} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={15} aria-hidden="true" />Confirm correct as heard</button>
          )}
          <button type="button" onClick={() => setEditing(true)} disabled={!playbackReady || busy} className="inline-flex items-center gap-2 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:cursor-not-allowed disabled:opacity-50"><FilePenLine size={15} aria-hidden="true" />{segment.acceptedCorrection ? "Revise reviewed correction" : "Correct against playback"}</button>
          {segment.correctionHistory.length > 0 && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8a7354]"><History size={14} aria-hidden="true" />{segment.correctionHistory.length} correction record(s) preserved</span>}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
        {error && !editing && <p role="alert" className="mb-3 flex items-start gap-2 text-sm font-bold text-rose-800"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
        {noteHref ? (
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-orange-950"><NotebookPen size={16} aria-hidden="true" />Canonical source-linked note saved.</p>
            <Link href={noteHref} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-orange-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white">Open Session notes</Link>
            <p className="mt-2 text-xs font-bold leading-relaxed text-orange-800">The note keeps this exact timestamp, transcript job, provider hash, reviewed text, correction identity, and recording asset. Its audience can be revised later without losing the source or revision history.</p>
          </div>
        ) : creatingNote ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-orange-900"><NotebookPen size={15} aria-hidden="true" />Deliberate Session note · source linked</p>
            <label className="block text-xs font-black uppercase tracking-wide text-orange-950">Note title <span className="normal-case tracking-normal text-orange-700">(optional)</span>
              <input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} maxLength={500} className="mt-1 block w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
            </label>
            <label className="block text-xs font-black uppercase tracking-wide text-orange-950">Note
              <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={20000} rows={4} className="mt-1 block w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-black uppercase tracking-wide text-orange-950">Purpose
                <select value={noteKind} onChange={(event) => setNoteKind(event.target.value as EditableSessionNoteKind)} className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
                  {EDITABLE_SESSION_NOTE_KINDS
                    .filter((kind) => kind !== "PRODUCTION" || canUseProjectTeamNotes)
                    .map((kind) => <option key={kind} value={kind}>{sessionNoteKindLabel(kind)}</option>)}
                </select>
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-orange-950">Audience
                <select value={noteVisibility} onChange={(event) => setNoteVisibility(event.target.value as SessionNoteVisibility)} className="mt-1 block min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]">
                  {SESSION_NOTE_VISIBILITIES
                    .filter((visibility) => visibility !== "PROJECT_TEAM" || canUseProjectTeamNotes)
                    .map((visibility) => <option key={visibility} value={visibility}>{sessionNoteVisibilityLabel(visibility)}</option>)}
                </select>
              </label>
            </div>
            <p className="rounded-lg border border-orange-200 bg-white p-3 text-xs font-bold leading-relaxed text-orange-900">
              {noteVisibility === "AUTHOR_PRIVATE" && "Only your account can read it—even staff do not get an override."}
              {noteVisibility === "SESSION_SHARED" && "People who can access this Session can read it. Nothing is messaged or delivered."}
              {noteVisibility === "CLIENT_SAFE" && "Eligible for a reviewed client follow-up. It is not sent automatically."}
              {noteVisibility === "PROJECT_TEAM" && "Visible to Nest owners and editors; owner/editor authority is required. It is not public."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void createNote()} disabled={busy || !playbackReady || !noteBody.trim()} className="inline-flex items-center gap-2 rounded-full bg-orange-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Save source-linked note</button>
              <button type="button" onClick={() => setCreatingNote(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-orange-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-orange-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button>
            </div>
            <p className="text-xs font-bold leading-relaxed text-orange-800">Creates one revisioned canonical Session note. It does not correct the transcript, create a task or goal, send a message, add a calendar event, deliver a follow-up, or publish.</p>
          </div>
        ) : (
          <button type="button" onClick={() => setCreatingNote(true)} disabled={busy || !playbackReady} className="inline-flex items-center gap-2 rounded-full border border-orange-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-orange-900 disabled:opacity-50"><NotebookPen size={15} aria-hidden="true" />Save as Session note</button>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
        {creatingTask ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-blue-900"><ListTodo size={15} aria-hidden="true" />Explicit task · source linked</p>
            <label className="block text-xs font-black uppercase tracking-wide text-blue-950">Task title
              <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={240} className="mt-1 block w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" />
            </label>
            <label className="block text-xs font-black uppercase tracking-wide text-blue-950">Useful detail <span className="normal-case tracking-normal text-blue-700">(optional)</span>
              <textarea value={taskDetail} onChange={(event) => setTaskDetail(event.target.value)} maxLength={2000} rows={3} className="mt-1 block w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void createTask()} disabled={busy || !playbackReady || !taskTitle.trim()} className="inline-flex items-center gap-2 rounded-full bg-blue-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Create my task</button>
              <button type="button" onClick={() => setCreatingTask(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-blue-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-blue-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button>
            </div>
            <p className="text-xs font-bold leading-relaxed text-blue-800">Creates one OPEN task assigned to you with this room, timestamp, speaker, provider hash, reviewed overlay, and recording asset. It creates no deadline, reminder, calendar event, message, or publication.</p>
          </div>
        ) : (
          <button type="button" onClick={() => setCreatingTask(true)} disabled={busy || !playbackReady} className="inline-flex items-center gap-2 rounded-full border border-blue-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-blue-900 disabled:opacity-50"><ListTodo size={15} aria-hidden="true" />Make this my task</button>
        )}
      </div>
      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
        {creatingGoal ? <div className="space-y-3"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-900"><Target size={15} aria-hidden="true" />Explicit goal · source linked</p><label className="block text-xs font-black uppercase tracking-wide text-violet-950">Goal title<input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} maxLength={240} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" /></label><label className="block text-xs font-black uppercase tracking-wide text-violet-950">Definition of progress <span className="normal-case tracking-normal text-violet-700">(optional)</span><textarea value={goalDescription} onChange={(event) => setGoalDescription(event.target.value)} maxLength={5000} rows={3} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void createGoal()} disabled={busy || !playbackReady || !goalTitle.trim()} className="inline-flex items-center gap-2 rounded-full bg-violet-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Create my goal</button><button type="button" onClick={() => setCreatingGoal(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button></div><p className="text-xs font-bold leading-relaxed text-violet-800">Creates one ACTIVE goal owned by you with this exact transcript and recording source. It creates no task, target date, reminder, calendar event, message, or publication.</p></div> : <button type="button" onClick={() => setCreatingGoal(true)} disabled={busy || !playbackReady} className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50"><Target size={15} aria-hidden="true" />Make this my goal</button>}
      </div>
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        {draftHref ? <div><p className="text-sm font-black text-emerald-950">Private source-linked draft created.</p><Link href={draftHref} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white">Open source-linked draft</Link><p className="mt-2 text-xs font-bold leading-relaxed text-emerald-800">The page carries this exact timestamp, transcript job, recording asset, provider hash, and reviewed text snapshot. The source recording and transcript remain unchanged.</p></div> : creatingDraft ? <div className="space-y-3"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-900"><FilePenLine size={15} aria-hidden="true" />Private writing page · source linked</p><label className="block text-xs font-black uppercase tracking-wide text-emerald-950">Page title<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={180} className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-[#3d3122]" /></label><label className="block text-xs font-black uppercase tracking-wide text-emerald-950">Starting thought <span className="normal-case tracking-normal text-emerald-700">(optional)</span><textarea value={draftOpeningNote} onChange={(event) => setDraftOpeningNote(event.target.value)} maxLength={10000} rows={4} placeholder="Write the first honest response; Quipsly keeps the source moment beside it." className="mt-1 block w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-[#3d3122]" /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void createDraft()} disabled={busy || !playbackReady || !draftTitle.trim()} className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Create source-linked draft</button><button type="button" onClick={() => setCreatingDraft(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-950 disabled:opacity-50"><X size={14} aria-hidden="true" />Cancel</button></div><p className="text-xs font-bold leading-relaxed text-emerald-800">Creates one private Nest writing page with an immutable transcript-evidence block and a separate editable draft block. It does not correct the transcript, create a task or goal, send anything, or publish.</p></div> : <button type="button" onClick={() => setCreatingDraft(true)} disabled={busy || !playbackReady} className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-900 disabled:opacity-50"><FilePenLine size={15} aria-hidden="true" />Start source-linked draft</button>}
      </div>
    </li>
  );
}

export function TranscriptCorrectionDesk({
  roomId,
  canUseProjectTeamNotes = false,
}: {
  roomId: string;
  canUseProjectTeamNotes?: boolean;
}) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preparingPlayback, setPreparingPlayback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/mobile/capture/transcripts/corrections?callRoomId=${encodeURIComponent(roomId)}`, { cache: "no-store" });
      const payload = await response.json() as Desk;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The correction desk could not load.");
      setDesk(payload);
    } catch (error) {
      if (!silent) setDesk(null);
      setMessage(error instanceof Error ? error.message : "The correction desk could not load.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { void load(false); }, [load]);

  useEffect(() => {
    if (!["QUEUED", "RUNNING"].includes(desk?.transcriptStatus || "")) return;
    const interval = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(interval);
  }, [desk?.transcriptStatus, load]);

  useEffect(() => {
    if (!desk || typeof window === "undefined" || !window.location.hash.startsWith("#transcript-segment-")) return;
    const targetId = window.location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [desk]);

  async function playFromTime(seconds: number) {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seconds;
    try {
      await media.play();
      setMessage(`Playing source evidence from ${timestampForSeconds(seconds)}.`);
    } catch {
      setMessage("Playback needs your direct interaction. Press play in the recording controls, then try this timestamp again.");
    }
  }

  async function playFrom(segment: Segment) {
    return playFromTime(segment.startSeconds);
  }

  async function saved(nextMessage: string) {
    setBusy(true);
    setMessage(nextMessage);
    await load();
    setBusy(false);
  }

  async function prepareProtectedPlayback() {
    const recordingAssetId = desk?.recording?.id;
    if (!recordingAssetId) return;
    setPreparingPlayback(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/capture/recordings/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingAssetId }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        message?: string;
        playbackUrl?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || payload.message || "Protected playback could not be prepared.");
      }
      setMessage(payload.message || "Protected playback is ready from the verified recording source.");
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Protected playback could not be prepared.");
    } finally {
      setPreparingPlayback(false);
    }
  }

  if (loading) return <section className="rounded-2xl border border-[#e5d5b7] bg-white p-8 text-sm font-bold text-[#765f40]"><LoaderCircle className="mr-2 inline animate-spin" size={18} aria-hidden="true" />Loading protected playback and correction history…</section>;
  if (!desk) return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6" role="status"><CircleAlert className="text-rose-700" aria-hidden="true" /><h2 className="mt-3 font-serif text-2xl font-black text-[#3d3122]">Transcript correction is unavailable.</h2><p className="mt-2 text-sm font-semibold text-[#765f40]">{message || "No transcript text is substituted and no evidence was changed."}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-900"><RefreshCw size={14} aria-hidden="true" />Retry</button></section>;

  const reviewedSegmentCount = desk.segments.filter((segment) => segment.acceptedCorrection || segment.acceptedVerification).length;

  return (
    <section aria-labelledby="transcript-correction-heading" className="space-y-5">
      <div className="rounded-2xl border border-[#e5d5b7] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Playback-verified evidence</p>
            <h2 id="transcript-correction-heading" className="mt-2 font-serif text-3xl font-black text-[#3d3122]">Listen, correct, preserve the source</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[#765f40]">Corrections sit above provider output as reviewable revisions. Media timing never moves, and AI proposals never become transcript truth without a person listening here.</p>
            {desk.segments.length > 0 && <p className="mt-3 text-sm font-black text-emerald-800">{reviewedSegmentCount} of {desk.segments.length} segments playback-reviewed</p>}
          </div>
          <button type="button" onClick={() => void load(false)} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" />Refresh truth</button>
        </div>
        {message && <p role="status" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900">{message}</p>}
        {desk.processing && (
          <div className="mt-5 grid gap-3 rounded-xl border border-[#e5d5b7] bg-[#fffaf1] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#987443]">
                {desk.transcriptStatus === "COMPLETED"
                  ? `${desk.processing.wordCount} timed words ready`
                  : desk.transcriptStatus === "RUNNING"
                    ? "Transcribing safely in the background"
                    : `Transcript ${humanize(desk.transcriptStatus || "not started")}`}
              </p>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-[#5f4d37]">
                {desk.processing.message
                  || (desk.transcriptStatus === "RUNNING"
                    ? "You can leave this page. Quipsly keeps the exact recording generation, retries transient provider failures, and will refresh this desk when word evidence lands."
                    : "The provider response, source binding, and worker receipt stay attached to this transcript version.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[0.68rem] font-black uppercase tracking-wide">
              <span className={`rounded-full px-3 py-1.5 ${desk.processing.sourceBound ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>source bound</span>
              <span className={`rounded-full px-3 py-1.5 ${desk.processing.providerReceiptReceived ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}`}>provider receipt</span>
            </div>
          </div>
        )}
        {!desk.gate.allowed ? (
          <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900">{desk.gate.error || "Transcript evidence remains held by consent and release policy."}</p>
        ) : desk.playback ? (
          <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-sky-900">Protected source · {desk.playback.label}</p>
            {desk.playback.kind === "video"
              ? <video ref={(node) => { mediaRef.current = node; }} src={desk.playback.url} controls preload="metadata" className="max-h-[420px] w-full rounded-lg bg-black" aria-label="Protected session recording" />
              : <audio ref={(node) => { mediaRef.current = node; }} src={desk.playback.url} controls preload="metadata" className="w-full" aria-label="Protected session recording" />}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-relaxed text-amber-950">
            <p>The transcript is readable, but accepted correction is disabled until the verified recording is prepared as protected Quipsly playback. This prevents “I listened” from becoming a paperwork checkbox with no playable source.</p>
            {desk.recording?.eligibleForProtectedPlaybackPreparation ? (
              <div className="mt-4">
                <button type="button" onClick={() => void prepareProtectedPlayback()} disabled={preparingPlayback || busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {preparingPlayback ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
                  {preparingPlayback ? "Preparing protected playback…" : "Prepare protected playback"}
                </button>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-900">Registers the existing verified source behind Quipsly’s access and release checks. It does not copy or alter the recording, rerun transcription, create work, send anything, or publish.</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {desk.gate.allowed && (desk.segments.length ? (
        <ol className="space-y-4">
          {desk.segments.map((segment) => (
            <CorrectionEditor
              key={segment.id}
              roomId={roomId}
              segment={segment}
              canUseProjectTeamNotes={canUseProjectTeamNotes}
              playbackReady={Boolean(desk.playback)}
              currentPlaybackPosition={() => mediaRef.current?.currentTime ?? null}
              busy={busy}
              onPlay={() => playFrom(segment)}
              onPlayAt={playFromTime}
              onSaved={saved}
            />
          ))}
        </ol>
      ) : <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">No persisted transcript segments are available for this session.</div>)}
    </section>
  );
}
