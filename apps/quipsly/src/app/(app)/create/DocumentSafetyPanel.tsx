"use client";

import { useRef, useState } from "react";
import {
  createNamedDocumentCheckpointAction,
  exportPortableDocumentAction,
  listNamedDocumentCheckpointsAction,
  restoreNamedDocumentCheckpointAction,
  restorePortableDocumentAction,
  type NamedDocumentCheckpoint,
} from "./actions";

type SaveState = "saved" | "saving" | "unsaved";

type ImportPreview = {
  raw: string;
  fileName: string;
  documentId: string;
  documentStableId: string;
  title: string;
  snapshotSha256: string;
  blockCount: number;
  spanCount: number;
  citationCount: number;
};

function safeFileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "quipsly-writing";
}

function shortHash(value: string) {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "Unavailable";
}

function localCheckpointTime(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : value;
}

function readImportPreview(raw: string, fileName: string): ImportPreview | null {
  try {
    const parsed = JSON.parse(raw) as any;
    const document = parsed?.snapshot?.document;
    const integrity = parsed?.integrity;
    if (parsed?.schemaVersion !== "quipsly-document-export-v1" || !document || !integrity) return null;
    return {
      raw,
      fileName,
      documentId: String(document.id ?? ""),
      documentStableId: String(document.stableId ?? ""),
      title: String(document.title ?? "Untitled document"),
      snapshotSha256: String(integrity.snapshotSha256 ?? ""),
      blockCount: Number(integrity.blockCount ?? 0),
      spanCount: Number(integrity.spanCount ?? 0),
      citationCount: Number(integrity.citationCount ?? 0),
    };
  } catch {
    return null;
  }
}

export default function DocumentSafetyPanel({
  documentId,
  documentTitle,
  projectSlug,
  saveState,
}: {
  documentId: string;
  documentTitle: string;
  projectSlug: string;
  saveState: SaveState;
}) {
  const [open, setOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<NamedDocumentCheckpoint[]>([]);
  const [checkpointName, setCheckpointName] = useState("");
  const [pendingCheckpoint, setPendingCheckpoint] = useState<NamedDocumentCheckpoint | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<"loading" | "checkpoint" | "export" | "restore" | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad" | "neutral"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const persistenceReady = saveState === "saved";

  const loadCheckpoints = async () => {
    setBusy("loading");
    const result = await listNamedDocumentCheckpointsAction(documentId);
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: "bad", text: result.error });
      return;
    }
    setCheckpoints(result.checkpoints ?? []);
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    setNotice(null);
    if (next && checkpoints.length === 0) void loadCheckpoints();
  };

  const createCheckpoint = async () => {
    if (!persistenceReady || !checkpointName.trim()) return;
    setBusy("checkpoint");
    setNotice(null);
    const result = await createNamedDocumentCheckpointAction(documentId, checkpointName);
    setBusy(null);
    if (!result.ok || !result.checkpoint) {
      setNotice({ tone: "bad", text: result.ok ? "The checkpoint receipt was incomplete." : result.error });
      return;
    }
    setCheckpoints((current) => [result.checkpoint!, ...current.filter((item) => item.id !== result.checkpoint!.id)]);
    setCheckpointName("");
    setNotice({ tone: "good", text: `Saved “${result.checkpoint.name}” with receipt ${shortHash(result.checkpoint.snapshotSha256)}.` });
  };

  const exportPortableBundle = async () => {
    if (!persistenceReady) return;
    setBusy("export");
    setNotice(null);
    const result = await exportPortableDocumentAction(documentId);
    setBusy(null);
    if (!result.ok || !result.bundleJson) {
      setNotice({ tone: "bad", text: result.ok ? "The export receipt was incomplete." : result.error });
      return;
    }
    const blob = new Blob([result.bundleJson], { type: "application/json;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileSlug(projectSlug)}-${safeFileSlug(documentTitle)}-${new Date().toISOString().slice(0, 10)}.quipsly-writing.json`;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    const parsed = readImportPreview(result.bundleJson, anchor.download);
    setNotice({
      tone: "good",
      text: parsed
        ? `Downloaded ${parsed.blockCount} blocks, ${parsed.spanCount} tagged spans, and ${parsed.citationCount} citations. Receipt ${shortHash(parsed.snapshotSha256)}.`
        : "Downloaded the portable writing bundle.",
    });
  };

  const chooseImport = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    setPendingCheckpoint(null);
    if (file.size > 60 * 1024 * 1024) {
      setImportPreview(null);
      setNotice({ tone: "bad", text: "That file is larger than the 60 MB writing-restore limit." });
      return;
    }
    const raw = await file.text();
    const preview = readImportPreview(raw, file.name);
    if (!preview) {
      setImportPreview(null);
      setNotice({ tone: "bad", text: "Choose a Quipsly .quipsly-writing.json export. Nothing was changed." });
      return;
    }
    setImportPreview(preview);
    if (preview.documentId !== documentId) {
      setNotice({ tone: "bad", text: "This backup belongs to a different canonical document. Restore is disabled." });
    } else {
      setNotice({ tone: "neutral", text: "Backup opened for review. Quipsly will verify its full SHA-256 receipt and citations on restore." });
    }
  };

  const restoreCheckpoint = async () => {
    if (!pendingCheckpoint || !persistenceReady) return;
    setBusy("restore");
    setNotice(null);
    const result = await restoreNamedDocumentCheckpointAction(documentId, pendingCheckpoint.id);
    setBusy(null);
    if (!result.ok || !result.receipt) {
      setNotice({ tone: "bad", text: result.ok ? "The restore receipt was incomplete." : result.error });
      return;
    }
    setNotice({ tone: "good", text: `Restored ${result.receipt.blockCount} blocks. Reloading the canonical document…` });
    window.setTimeout(() => window.location.reload(), 500);
  };

  const restoreImport = async () => {
    if (!importPreview || importPreview.documentId !== documentId || !persistenceReady) return;
    setBusy("restore");
    setNotice(null);
    const result = await restorePortableDocumentAction(documentId, importPreview.raw);
    setBusy(null);
    if (!result.ok || !result.receipt) {
      setNotice({ tone: "bad", text: result.ok ? "The restore receipt was incomplete." : result.error });
      return;
    }
    setNotice({ tone: "good", text: `Verified and restored receipt ${shortHash(result.receipt.snapshotSha256)}. Reloading…` });
    window.setTimeout(() => window.location.reload(), 500);
  };

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm" aria-labelledby="document-safety-title">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-violet-50/60"
        aria-expanded={open}
        data-testid="document-safety-toggle"
      >
        <span>
          <span id="document-safety-title" className="block text-[10px] font-black uppercase tracking-[0.22em] text-violet-800">
            Version history & portable backup
          </span>
          <span className="mt-1 block text-xs leading-5 text-[#6b5b45]">
            Name a safe point, download an inspectable JSON copy, or reopen a prior version without deleting later work.
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-800">
          {open ? "Close" : "Open"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-violet-100 px-4 py-4" data-testid="document-safety-panel">
          {!persistenceReady ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900" role="status">
              Wait for the <strong>Saved</strong> badge before checkpointing, exporting, or restoring. The backup must match canonical storage—not text still in flight.
            </div>
          ) : null}

          {notice ? (
            <div
              className={`mb-4 rounded-xl border px-3 py-2 text-xs leading-5 ${
                notice.tone === "good"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : notice.tone === "bad"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : "border-sky-200 bg-sky-50 text-sky-900"
              }`}
              role={notice.tone === "bad" ? "alert" : "status"}
              data-testid="document-safety-notice"
            >
              {notice.text}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[#eadfca] bg-[#fffdf9] p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Save a named checkpoint</div>
              <p className="mt-1 text-[11px] leading-5 text-[#6b5b45]">A checkpoint records exact block IDs, order, text, tags, citations, and a content receipt in the append-only history.</p>
              <div className="mt-3 flex gap-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Checkpoint name</span>
                  <input
                    value={checkpointName}
                    onChange={(event) => setCheckpointName(event.target.value)}
                    maxLength={120}
                    placeholder="e.g. Coaching outline approved"
                    className="w-full rounded-lg border border-[#d9c7a5] bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    data-testid="document-checkpoint-name"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void createCheckpoint()}
                  disabled={!persistenceReady || !checkpointName.trim() || busy !== null}
                  className="rounded-lg border border-violet-700 bg-violet-700 px-3 py-2 text-xs font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
                  data-testid="document-checkpoint-save"
                >
                  {busy === "checkpoint" ? "Saving…" : "Save point"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#eadfca] bg-[#fffdf9] p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Take it with you</div>
              <p className="mt-1 text-[11px] leading-5 text-[#6b5b45]">The JSON bundle is inspectable, integrity-checked, and can be reopened here. Markdown remains available above for a human-readable emergency copy.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void exportPortableBundle()}
                  disabled={!persistenceReady || busy !== null}
                  className="rounded-lg border border-[#3d3122] bg-[#3d3122] px-3 py-2 text-xs font-black text-white hover:bg-[#59442d] disabled:cursor-not-allowed disabled:opacity-45"
                  data-testid="document-portable-export"
                >
                  {busy === "export" ? "Preparing…" : "Download backup"}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!persistenceReady || busy !== null}
                  className="rounded-lg border border-[#d9c7a5] bg-white px-3 py-2 text-xs font-black text-[#5e4b33] hover:bg-[#f8f3e6] disabled:cursor-not-allowed disabled:opacity-45"
                  data-testid="document-portable-open"
                >
                  Open backup…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json,.quipsly-writing.json"
                  className="sr-only"
                  onChange={(event) => void chooseImport(event.target.files?.[0])}
                  data-testid="document-portable-file"
                />
              </div>
            </div>
          </div>

          {importPreview ? (
            <div className={`mt-4 rounded-xl border p-3 ${importPreview.documentId === documentId ? "border-sky-200 bg-sky-50" : "border-rose-200 bg-rose-50"}`} data-testid="document-import-preview">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-900">Opened backup · not restored</div>
                  <div className="mt-1 font-serif text-base font-bold text-[#342618]">{importPreview.title}</div>
                  <div className="mt-1 text-[11px] leading-5 text-[#6b5b45]">
                    {importPreview.fileName} · {importPreview.blockCount} blocks · {importPreview.spanCount} spans · {importPreview.citationCount} citations<br />
                    SHA-256 {shortHash(importPreview.snapshotSha256)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setImportPreview(null)} className="rounded-lg border border-[#d9c7a5] bg-white px-3 py-2 text-xs font-black text-[#5e4b33]">Cancel</button>
                  <button
                    type="button"
                    onClick={() => void restoreImport()}
                    disabled={importPreview.documentId !== documentId || !persistenceReady || busy !== null}
                    className="rounded-lg border border-sky-800 bg-sky-800 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                    data-testid="document-import-restore"
                  >
                    {busy === "restore" ? "Verifying…" : "Verify + restore"}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-sky-950">Restore writes a reversible history receipt first, restores exact canonical identities, and archives later blocks instead of deleting them.</p>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Named checkpoints</div>
              <button type="button" onClick={() => void loadCheckpoints()} disabled={busy !== null} className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-800 disabled:opacity-45">
                {busy === "loading" ? "Loading…" : "Refresh"}
              </button>
            </div>
            {checkpoints.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d9c7a5] px-3 py-4 text-center text-xs text-[#8c6b4a]">
                {busy === "loading" ? "Loading durable history…" : "No named checkpoints yet. Your ordinary edits still retain operation receipts."}
              </div>
            ) : (
              <div className="space-y-2" data-testid="document-checkpoint-list">
                {checkpoints.map((checkpoint) => (
                  <div key={checkpoint.id} className="rounded-xl border border-[#eadfca] bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-[#3d3122]">{checkpoint.name}</div>
                        <div className="mt-0.5 text-[10px] leading-4 text-[#8c6b4a]">
                          {localCheckpointTime(checkpoint.createdAt)} · {checkpoint.blockCount} blocks · {checkpoint.citationCount} citations · {shortHash(checkpoint.snapshotSha256)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setPendingCheckpoint(checkpoint); setImportPreview(null); setNotice(null); }}
                        disabled={!persistenceReady || busy !== null}
                        className="rounded-lg border border-[#d9c7a5] bg-[#fffaf3] px-3 py-1.5 text-xs font-black text-[#5e4b33] hover:bg-amber-50 disabled:opacity-45"
                        data-testid={`document-checkpoint-restore-${checkpoint.id}`}
                      >
                        Preview restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pendingCheckpoint ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3" data-testid="document-checkpoint-confirmation">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-900">Confirm restore</div>
              <p className="mt-1 text-xs leading-5 text-amber-950">
                Restore <strong>“{pendingCheckpoint.name}”</strong> from {localCheckpointTime(pendingCheckpoint.createdAt)}? Current content is captured in a reversible receipt, and later blocks are archived rather than deleted.
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setPendingCheckpoint(null)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-950">Keep current</button>
                <button
                  type="button"
                  onClick={() => void restoreCheckpoint()}
                  disabled={!persistenceReady || busy !== null}
                  className="rounded-lg border border-amber-900 bg-amber-900 px-3 py-2 text-xs font-black text-white disabled:opacity-45"
                  data-testid="document-checkpoint-confirm-restore"
                >
                  {busy === "restore" ? "Restoring…" : "Restore checkpoint"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
