"use client";

import { useId, useState } from "react";
import { CheckCircle2, FileUp, ShieldCheck, TriangleAlert } from "lucide-react";

type ImportedBackup = {
  id: string;
  sourceId: string;
  originalName: string;
  kind: "audio" | "video" | "unknown";
  contentType: string;
  playbackUrl: string;
};

type RecoveryPayload = {
  ok?: boolean;
  error?: string;
  productionJson?: unknown;
  replacement?: {
    recordingAssetId: string;
    mediaAssetId: string;
    sourceId: string;
    expectationId: string;
  };
  signalProfile?: unknown;
  nextAction?: string;
};

type PendingAdoption = {
  importedBackup: ImportedBackup;
  reason: string;
  requestId: string;
};

async function mediaDuration(file: File) {
  const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
  const url = URL.createObjectURL(file);
  element.preload = "metadata";
  element.src = url;
  try {
    return await new Promise<number | null>((resolve) => {
      const timeout = window.setTimeout(() => resolve(null), 8_000);
      element.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve(Number.isFinite(element.duration) && element.duration > 0 ? element.duration : null);
      };
      element.onerror = () => {
        window.clearTimeout(timeout);
        resolve(null);
      };
    });
  } finally {
    element.removeAttribute("src");
    element.load();
    URL.revokeObjectURL(url);
  }
}

export function CaptureSourceRecoveryPanel({
  projectSlug,
  episodeSlug,
  captureGroupId,
  originalRecordingAssetId,
  originalName,
  accept,
  onRecovered,
}: {
  projectSlug: string;
  episodeSlug: string;
  captureGroupId: string;
  originalRecordingAssetId: string;
  originalName: string;
  accept: string;
  onRecovered: (payload: RecoveryPayload, importedBackup: ImportedBackup) => void;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [pendingAdoption, setPendingAdoption] = useState<PendingAdoption | null>(null);
  const [state, setState] = useState<"idle" | "importing" | "adopting" | "complete" | "error">("idle");
  const [message, setMessage] = useState("Choose the separately recorded backup that should fulfill this source slot.");

  const recover = async () => {
    if (!file || reason.trim().length < 12 || !authorityConfirmed) return;
    try {
      let adoption = pendingAdoption;
      if (!adoption) {
        setState("importing");
        setMessage("Importing the backup as a separate immutable episode source…");
        const durationSeconds = await mediaDuration(file);
        const form = new FormData();
        form.append("file", file);
        form.append("projectSlug", projectSlug);
        form.append("episodeSlug", episodeSlug);
        form.append("importRole", "backup-master");
        form.append("sourceFileModifiedAt", new Date(file.lastModified).toISOString());
        if (deviceLabel.trim()) form.append("deviceLabel", deviceLabel.trim());
        if (durationSeconds) form.append("durationSeconds", String(durationSeconds));
        const importedResponse = await fetch("/api/episode-production/import-media", { method: "POST", body: form });
        const importedPayload = await importedResponse.json().catch(() => null) as { ok?: boolean; error?: string; importedAsset?: ImportedBackup } | null;
        if (!importedResponse.ok || !importedPayload?.ok || !importedPayload.importedAsset) {
          throw new Error(importedPayload?.error || `Backup import returned HTTP ${importedResponse.status}.`);
        }
        adoption = {
          importedBackup: importedPayload.importedAsset,
          reason: reason.trim(),
          requestId: crypto.randomUUID(),
        };
        setPendingAdoption(adoption);
      }
      setState("adopting");
      setMessage("Verifying exact bytes and writing the append-only replacement decision…");
      const adoptedResponse = await fetch("/api/episode-production/capture-source-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          episodeSlug,
          captureGroupId,
          originalRecordingAssetId,
          importedMediaAssetId: adoption.importedBackup.id,
          sourceId: adoption.importedBackup.sourceId,
          reason: adoption.reason,
          requestId: adoption.requestId,
          authorityConfirmed: true,
        }),
      });
      const adopted = await adoptedResponse.json().catch(() => null) as RecoveryPayload | null;
      if (!adoptedResponse.ok || !adopted?.ok || !adopted.replacement) {
        throw new Error(`${adopted?.error || `Recovery adoption returned HTTP ${adoptedResponse.status}.`} The imported backup remains safely available in the episode source bin.`);
      }
      setState("complete");
      setMessage(adopted.nextAction || "Replacement adopted. Complete decode is now proving its signal.");
      onRecovered(adopted, adoption.importedBackup);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Quipsly could not adopt the backup master.");
    }
  };

  return (
    <details className="col-span-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-violet-950">
      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.1em]">Recover with backup master</summary>
      <div className="mt-3 space-y-3">
        <p className="text-[10px] font-bold leading-4">
          Import a recorder, camera, or phone backup and make it the active master for this exact slot. <strong>{originalName}</strong> remains immutable and visible as superseded evidence.
        </p>
        <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 text-[10px] font-black">
          <FileUp size={14} aria-hidden="true" /> {file ? file.name : "Choose backup file"}
        </label>
        <input id={inputId} type="file" accept={accept} className="sr-only" disabled={Boolean(pendingAdoption)} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <label className="block text-[10px] font-black">Recorder or camera label
          <input value={deviceLabel} disabled={Boolean(pendingAdoption)} onChange={(event) => setDeviceLabel(event.target.value)} maxLength={160} placeholder="Shure MV7i · Canon R8 · DJI Mic 2" className="mt-1 min-h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold disabled:bg-slate-100" />
        </label>
        <label className="block text-[10px] font-black">Why this source replaces the retained original
          <textarea required value={reason} disabled={Boolean(pendingAdoption)} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="The browser master completely decoded as near-silence; this is the MV7i backup from the same recorded session." className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold disabled:bg-slate-100" />
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-violet-200 bg-white p-3 text-[10px] font-bold leading-4">
          <input type="checkbox" checked={authorityConfirmed} onChange={(event) => setAuthorityConfirmed(event.target.checked)} className="mt-0.5 size-4" />
          <span>I confirm this backup records the same Session/source owner and is covered by the Session&apos;s existing recording and processing consent.</span>
        </label>
        <button type="button" onClick={() => void recover()} disabled={!file || reason.trim().length < 12 || !authorityConfirmed || state === "importing" || state === "adopting" || state === "complete"} className="min-h-11 w-full rounded-lg bg-violet-800 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          {state === "importing" ? "Importing immutable backup…" : state === "adopting" ? "Adopting verified replacement…" : state === "complete" ? "Replacement adopted" : pendingAdoption ? "Retry verified adoption" : "Verify and adopt replacement"}
        </button>
        {pendingAdoption && state === "error" ? (
          <button type="button" onClick={() => { setPendingAdoption(null); setFile(null); setReason(""); setDeviceLabel(""); setAuthorityConfirmed(false); setState("idle"); setMessage("Choose the separately recorded backup that should fulfill this source slot."); }} className="min-h-10 w-full rounded-lg border border-violet-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-violet-900">
            Start with a different backup
          </button>
        ) : null}
        <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold leading-4 ${state === "error" ? "border-red-200 bg-red-50 text-red-900" : state === "complete" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-violet-200 bg-white text-violet-950"}`}>
          {state === "error" ? <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : state === "complete" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span>{message}</span>
        </div>
        <p className="text-[9px] font-black uppercase tracking-wide text-violet-700">Exact bytes · inherited capture-time consent scope · append-only selection history · no publication</p>
      </div>
    </details>
  );
}
