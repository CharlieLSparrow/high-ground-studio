"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, FileUp, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";

import type { SessionPreparation } from "./session-preparation-model";
import {
  importSessionRecording,
  sessionRecordingFileType,
  type SessionRecordingImportResult,
} from "./session-recording-import";

type ImportStage = "idle" | "hashing" | "reserving" | "uploading" | "verifying" | "complete" | "failed";

function newImportIdentity(captureGroupId: string) {
  return {
    uploadSessionId: crypto.randomUUID(),
    captureId: crypto.randomUUID(),
    captureGroupId,
  };
}

function localDateTimeValue(value: string | null, fallback: Date) {
  const parsed = value ? new Date(value) : fallback;
  const safe = Number.isFinite(parsed.getTime()) ? parsed : fallback;
  const shifted = new Date(safe.getTime() - safe.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function isoFromLocal(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function formatBytes(bytes: number) {
  const units = ["bytes", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: unit ? 2 : 0 })} ${units[unit]}`;
}

function progressLabel(stage: ImportStage, hashProgress: number, uploadProgress: number) {
  if (stage === "hashing") return `Reading original safely · ${Math.round(hashProgress * 100)}%`;
  if (stage === "reserving") return "Reserving private media storage";
  if (stage === "uploading") return `Preserving original · ${Math.round(uploadProgress * 100)}%`;
  if (stage === "verifying") return "Independently verifying size and SHA-256";
  return null;
}

export function SessionRecordingImportCard({ roomId, preparation }: {
  roomId: string;
  preparation: SessionPreparation | null;
}) {
  const router = useRouter();
  const actor = preparation?.participants.find((participant) => participant.isCurrentActor) ?? null;
  const actorConsent = actor?.consent ?? null;
  const now = useMemo(() => new Date(), []);
  const initialEnd = useMemo(() => localDateTimeValue(preparation?.scheduledEnd ?? null, now), [now, preparation?.scheduledEnd]);
  const initialStart = useMemo(() => localDateTimeValue(preparation?.scheduledStart ?? null, new Date(now.getTime() - 30 * 60_000)), [now, preparation?.scheduledStart]);
  const [file, setFile] = useState<File | null>(null);
  const [startedAt, setStartedAt] = useState(initialStart);
  const [stoppedAt, setStoppedAt] = useState(initialEnd);
  const [stage, setStage] = useState<ImportStage>("idle");
  const [hashProgress, setHashProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<SessionRecordingImportResult | null>(null);
  const identity = useRef(newImportIdentity(preparation?.captureGroupId || ""));
  const controller = useRef<AbortController | null>(null);
  const busy = stage === "hashing" || stage === "reserving" || stage === "uploading" || stage === "verifying";

  let fileType: ReturnType<typeof sessionRecordingFileType> | null = null;
  let fileError: string | null = null;
  if (file) {
    try {
      fileType = sessionRecordingFileType(file);
    } catch (error) {
      fileError = error instanceof Error ? error.message : "This recording cannot be imported.";
    }
  }
  const actorCanRecord = Boolean(
    actorConsent?.recordingReady
    && fileType
    && (fileType.sourceType === "audio" ? actorConsent.canRecordAudio : actorConsent.canRecordVideo),
  );
  const startIso = isoFromLocal(startedAt);
  const stopIso = isoFromLocal(stoppedAt);
  const validRange = Boolean(startIso && stopIso && new Date(stopIso).getTime() >= new Date(startIso).getTime());
  const canImport = Boolean(file && fileType && actor && actorConsent?.id && actorCanRecord && validRange && preparation?.captureGroupId && !busy);
  const activeProgress = progressLabel(stage, hashProgress, uploadProgress);

  function chooseFile(nextFile: File | null) {
    if (busy) return;
    setFile(nextFile);
    setResult(null);
    setNotice(null);
    setHashProgress(0);
    setUploadProgress(0);
    setStage("idle");
    identity.current = newImportIdentity(preparation?.captureGroupId || "");
  }

  async function runImport() {
    if (!file || !actor || !actorConsent?.id || !startIso || !stopIso || !canImport) return;
    controller.current = new AbortController();
    setNotice(null);
    setResult(null);
    try {
      const imported = await importSessionRecording({
        roomId,
        participantId: actor.id,
        recordingConsentId: actorConsent.id,
        project: preparation?.project ? { id: preparation.project.id, slug: preparation.project.slug } : null,
        purpose: preparation?.purpose || "COACHING",
        file,
        startedAt: startIso,
        stoppedAt: stopIso,
        ...identity.current,
        onHashProgress: setHashProgress,
        onUploadProgress: setUploadProgress,
        onStage: setStage,
        signal: controller.current.signal,
      });
      setResult(imported);
      setStage("complete");
      setNotice(imported.processingDisposition === "RELEASED"
        ? "The exact original is verified and eligible for the next processing step."
        : "The exact original is verified and preserved. Processing stays held until Quipsly has the required room evidence and an explicit release.");
      router.refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setNotice("Import stopped. The original file was not changed. Select it again to recover or begin a new import.");
      } else {
        setNotice(error instanceof Error ? error.message : "The recording was not imported. Keep the original and retry.");
      }
      setStage("failed");
    } finally {
      controller.current = null;
    }
  }

  return <section className="rounded-2xl border border-violet-200 bg-violet-50/45 p-5" aria-labelledby="session-recording-import-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white p-2 text-violet-700"><FileUp aria-hidden="true" /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">Computer, camera, or recorder</p>
          <h2 id="session-recording-import-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Import an existing session recording</h2>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[#765f40]">Choose the original Canon, Shure, browser, phone, or recorder file. Quipsly reads it in chunks, preserves it privately, then independently matches its exact byte count and SHA-256. It joins this Session’s recording take for clock and waveform review; it does not alter, transcribe, share, or publish the source.</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-violet-900"><ShieldCheck size={14} aria-hidden="true" />Original-preserving</span>
    </div>

    {!actor ? <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-black leading-5 text-amber-950"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>Your signed-in account is not attached as a participant in this Session. Join the room before importing evidence.</p></div> : !actorConsent?.recordingReady ? <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-black leading-5 text-amber-950"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{actor.label} does not have current, versioned recording consent for this Session. Grant or refresh consent in room setup before preserving a recording under this identity.</p></div> : null}

    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <div className="space-y-4">
        <label className="block rounded-xl border border-dashed border-violet-300 bg-white p-5 text-sm font-black text-[#3d3122] focus-within:ring-2 focus-within:ring-violet-500">
          <span className="block">Original audio or video file</span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-[#765f40]">MOV, MP4, M4A, WAV, FLAC, MP3, AAC, OGG, or WebM. The browser never rewrites your selection.</span>
          <input type="file" accept="audio/*,video/*,.mov,.m4v,.mp4,.webm,.m4a,.wav,.flac,.mp3,.aac,.ogg" disabled={busy} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className="mt-4 block w-full text-xs font-bold text-[#5b472f] file:mr-3 file:rounded-full file:border-0 file:bg-violet-800 file:px-4 file:py-2.5 file:text-xs file:font-black file:text-white disabled:opacity-50" />
        </label>
        {file ? <div className={`rounded-xl border bg-white p-4 text-xs font-bold ${fileError ? "border-rose-200 text-rose-950" : "border-violet-100 text-[#5b472f]"}`}><p className="break-words text-sm font-black text-[#3d3122]">{file.name}</p><p className="mt-1">{formatBytes(file.size)} · {fileType ? `${fileType.sourceType} · ${fileType.contentType}` : "unsupported type"}</p>{fileError ? <p className="mt-2">{fileError}</p> : null}{fileType?.sourceType === "video" && !actorConsent?.canRecordVideo ? <p className="mt-2 text-amber-950">This consent permits audio but not video. Choose audio or update consent before importing this video.</p> : null}</div> : null}
      </div>

      <div className="rounded-xl border border-violet-100 bg-white p-4">
        <h3 className="text-sm font-black text-[#3d3122]">Place it on the session timeline</h3>
        <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">Use when the recording actually started and stopped. Quipsly preserves these as source metadata; it does not pretend they prove phone START/STOP receipts.</p>
        <label className="mt-4 block text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Recording started<input type="datetime-local" value={startedAt} disabled={busy} onChange={(event) => setStartedAt(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-[#d8c7a7] px-3 py-2 text-sm font-bold normal-case tracking-normal text-[#3d3122]" /></label>
        <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Recording stopped<input type="datetime-local" value={stoppedAt} disabled={busy} onChange={(event) => setStoppedAt(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-[#d8c7a7] px-3 py-2 text-sm font-bold normal-case tracking-normal text-[#3d3122]" /></label>
        {!validRange ? <p className="mt-2 text-xs font-black text-rose-800">Stop time must be at or after start time.</p> : null}
      </div>
    </div>

    {activeProgress ? <div className="mt-5 rounded-xl border border-violet-200 bg-white p-4" role="status"><p className="inline-flex items-center gap-2 text-xs font-black text-violet-950"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />{activeProgress}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-700 transition-[width]" style={{ width: `${Math.round((stage === "hashing" ? hashProgress : stage === "uploading" ? uploadProgress : stage === "reserving" ? 5 / 100 : 100) * 100)}%` }} /></div></div> : null}

    {notice ? <div className={`mt-5 flex gap-3 rounded-xl border p-4 text-xs font-black leading-5 ${stage === "complete" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-950"}`} role="status">{stage === "complete" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}<div><p>{notice}</p>{result ? <dl className="mt-3 grid gap-1 font-mono text-[10px]"><div><dt className="inline font-sans uppercase">SHA-256 </dt><dd className="inline break-all">{result.sha256}</dd></div><div><dt className="inline font-sans uppercase">Verified bytes </dt><dd className="inline">{result.verifiedSizeBytes.toLocaleString()}</dd></div><div><dt className="inline font-sans uppercase">Processing </dt><dd className="inline">{result.processingDisposition}</dd></div><div><dt className="inline font-sans uppercase">Transcript </dt><dd className="inline">{result.transcriptDisposition}</dd></div></dl> : null}</div></div> : null}

    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" disabled={!canImport} onClick={() => void runImport()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-45"><FileUp size={15} aria-hidden="true" />Hash, preserve, and verify</button>
      {busy ? <button type="button" onClick={() => controller.current?.abort()} className="inline-flex min-h-11 items-center rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-900">Stop safely</button> : null}
      <p className="max-w-2xl text-xs font-semibold leading-5 text-[#765f40]">Keep your camera or recorder original until this card and the source-evidence ledger both show verification. A held source is preserved, not cleared for transcription or sharing.</p>
    </div>
  </section>;
}
