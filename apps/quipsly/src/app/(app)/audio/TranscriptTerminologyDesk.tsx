"use client";

import { Archive, BookOpenText, Check, Pencil, Plus, RefreshCcw, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TerminologyTerm = {
  id: string;
  canonicalText: string;
  aliases: string[];
  category: string;
  pronunciationHint: string | null;
  contextHint: string | null;
  priority: number;
  status: "active" | "archived";
  revision: number;
  updatedAt: string;
};

type TerminologyDeskPayload = {
  ok: true;
  terms: TerminologyTerm[];
  candidates: Array<{ id: string; proposedCanonicalText: string; category: string; createdAt: string }>;
  activeRevisionToken: string | null;
  activeTermCount: number;
};

const categories = ["general", "person", "organization", "brand", "product", "place", "title", "technical", "coaching"];
const emptyForm = { canonicalText: "", aliases: "", category: "general", pronunciationHint: "", contextHint: "", priority: 50 };

export function TranscriptTerminologyDesk({
  projectId,
  projectSlug,
  canWrite,
  transcriptRevisionToken,
  transcriptApplied,
  onActiveVocabularyChange,
}: {
  projectId: string;
  projectSlug: string;
  canWrite: boolean;
  transcriptRevisionToken: string | null;
  transcriptApplied: boolean;
  onActiveVocabularyChange: (revisionToken: string | null) => void;
}) {
  const [payload, setPayload] = useState<TerminologyDeskPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<TerminologyTerm | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!projectId || !projectSlug) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ projectId, projectSlug });
      const response = await fetch(`/api/media-vault/transcript-terminology?${query.toString()}`, { cache: "no-store", signal });
      const next = await response.json().catch(() => null) as (TerminologyDeskPayload & { error?: string }) | null;
      if (!response.ok || !next?.ok) throw new Error(next?.error || `Terminology returned HTTP ${response.status}.`);
      setPayload(next);
      onActiveVocabularyChange(next.activeRevisionToken);
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") setError(caught instanceof Error ? caught.message : "Project terminology is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [onActiveVocabularyChange, projectId, projectSlug]);

  useEffect(() => {
    const controller = new AbortController();
    setPayload(null);
    setEditing(null);
    setForm(emptyForm);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const activeTerms = useMemo(() => payload?.terms.filter((term) => term.status === "active") ?? [], [payload]);
  const archivedTerms = useMemo(() => payload?.terms.filter((term) => term.status === "archived") ?? [], [payload]);
  const transcriptIsCurrent = Boolean(payload?.activeRevisionToken) && payload?.activeRevisionToken === transcriptRevisionToken;
  const transcriptNeedsRefresh = Boolean(payload?.activeRevisionToken) && payload?.activeRevisionToken !== transcriptRevisionToken;

  function edit(term: TerminologyTerm) {
    setEditing(term);
    setForm({ canonicalText: term.canonicalText, aliases: term.aliases.join(", "), category: term.category, pronunciationHint: term.pronunciationHint || "", contextHint: term.contextHint || "", priority: term.priority });
    setNotice(null);
  }

  function resetForm() { setEditing(null); setForm(emptyForm); }

  async function mutate(operation: "create" | "update" | "archive" | "restore", term?: TerminologyTerm) {
    if (busy || !canWrite) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/media-vault/transcript-terminology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectSlug,
          operation,
          ...(operation === "create" || operation === "update" ? {
            canonicalText: form.canonicalText,
            aliases: form.aliases.split(",").map((value) => value.trim()).filter(Boolean),
            category: form.category,
            pronunciationHint: form.pronunciationHint || null,
            contextHint: form.contextHint || null,
            priority: form.priority,
          } : {}),
          ...(term ? { termId: term.id, expectedRevision: term.revision } : {}),
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || `Terminology update returned HTTP ${response.status}.`);
      resetForm();
      setNotice(operation === "create" ? "Preferred spelling added. The next transcription will retain a new vocabulary snapshot." : operation === "update" ? "Term updated without changing any existing transcript." : operation === "archive" ? "Term archived. Existing transcript evidence remains unchanged." : "Term restored for future transcription attempts.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project terminology could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm sm:p-5" aria-labelledby="terminology-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-violet-800"><BookOpenText className="h-4 w-4" aria-hidden="true" /> Transcript truth</div>
          <h2 id="terminology-heading" className="mt-1 text-xl font-black">Project terminology memory</h2>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-violet-950/70">Teach Quipsly preferred spellings for people, shows, products, and specialist language. Every transcription freezes the exact vocabulary it received; later edits never rewrite old provider evidence.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-300 bg-white px-4 text-xs font-black text-violet-950 hover:bg-violet-100 disabled:opacity-50"><RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />Refresh</button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-violet-200 bg-white px-3 py-3"><div className="font-mono text-lg font-black">{payload?.activeTermCount ?? "—"}</div><div className="text-[10px] font-bold text-violet-900/70">Active preferred spellings</div></div>
        <div className="rounded-xl border border-violet-200 bg-white px-3 py-3"><div className="font-mono text-lg font-black">{payload?.candidates.length ?? "—"}</div><div className="text-[10px] font-bold text-violet-900/70">Correction-derived suggestions</div></div>
        <div className={`rounded-xl border px-3 py-3 ${transcriptNeedsRefresh ? "border-amber-300 bg-amber-50" : transcriptIsCurrent && transcriptApplied ? "border-emerald-300 bg-emerald-50" : transcriptIsCurrent ? "border-sky-300 bg-sky-50" : "border-violet-200 bg-white"}`}>
          <div className="flex items-center gap-2 text-sm font-black">{transcriptNeedsRefresh ? <RefreshCcw className="h-4 w-4" aria-hidden="true" /> : transcriptIsCurrent && transcriptApplied ? <Check className="h-4 w-4" aria-hidden="true" /> : transcriptIsCurrent ? <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{transcriptNeedsRefresh ? "New attempt available" : transcriptIsCurrent && transcriptApplied ? "Snapshot applied" : transcriptIsCurrent ? "Snapshot queued" : "No matched snapshot"}</div>
          <div className="mt-1 text-[10px] font-bold text-violet-900/70">{transcriptNeedsRefresh ? "The current transcript predates this vocabulary." : transcriptIsCurrent && !transcriptApplied ? "Waiting for a matching provider receipt." : "Provider context is evidence, not a truth claim."}</div>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-950" role="alert">{error}</div> : null}
      {notice ? <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-950" role="status">{notice}</div> : null}

      {canWrite ? (
        <form className="mt-4 rounded-xl border border-violet-200 bg-white p-3" onSubmit={(event) => { event.preventDefault(); void mutate(editing ? "update" : "create", editing || undefined); }}>
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black">{editing ? `Edit ${editing.canonicalText}` : "Add a preferred spelling"}</h3>{editing ? <button type="button" onClick={resetForm} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-black text-violet-900 hover:bg-violet-50"><X className="h-4 w-4" aria-hidden="true" />Cancel</button> : null}</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-[0.08em] text-violet-900">Preferred spelling<input required maxLength={120} value={form.canonicalText} onChange={(event) => setForm((current) => ({ ...current, canonicalText: event.target.value }))} placeholder="High Ground Odyssey" className="mt-1 block min-h-11 w-full rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold normal-case tracking-normal outline-none focus:border-violet-600" /></label>
            <label className="text-[10px] font-black uppercase tracking-[0.08em] text-violet-900">Aliases, comma separated<input maxLength={500} value={form.aliases} onChange={(event) => setForm((current) => ({ ...current, aliases: event.target.value }))} placeholder="HGO, High Ground" className="mt-1 block min-h-11 w-full rounded-lg border border-violet-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none focus:border-violet-600" /></label>
            <label className="text-[10px] font-black uppercase tracking-[0.08em] text-violet-900">Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="mt-1 block min-h-11 w-full rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold normal-case tracking-normal outline-none focus:border-violet-600">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="text-[10px] font-black uppercase tracking-[0.08em] text-violet-900">Priority · {form.priority}<input type="range" min="0" max="100" step="10" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: Number(event.target.value) }))} className="mt-3 block w-full accent-violet-700" /></label>
            <label className="text-[10px] font-black uppercase tracking-[0.08em] text-violet-900">Pronunciation note<input maxLength={160} value={form.pronunciationHint} onChange={(event) => setForm((current) => ({ ...current, pronunciationHint: event.target.value }))} placeholder="quip-slee" className="mt-1 block min-h-11 w-full rounded-lg border border-violet-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none focus:border-violet-600" /></label>
            <label className="text-[10px] font-black uppercase tracking-[0.08em] text-violet-900">Context note<input maxLength={240} value={form.contextHint} onChange={(event) => setForm((current) => ({ ...current, contextHint: event.target.value }))} placeholder="Podcast and product name" className="mt-1 block min-h-11 w-full rounded-lg border border-violet-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none focus:border-violet-600" /></label>
          </div>
          <button type="submit" disabled={busy || !form.canonicalText.trim()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-800 px-4 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50">{editing ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}{busy ? "Saving…" : editing ? "Save new revision" : "Add to future transcripts"}</button>
        </form>
      ) : <div className="mt-4 rounded-xl border border-violet-200 bg-white p-3 text-xs font-semibold text-violet-950/70">Viewers can inspect terminology and transcript provenance. An owner or editor manages future provider context.</div>}

      <div className="mt-4 space-y-2">
        {activeTerms.map((term) => (
          <article key={term.id} className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black">{term.canonicalText}</span><span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-violet-800">{term.category}</span><span className="font-mono text-[9px] font-bold text-violet-900/60">priority {term.priority} · rev {term.revision}</span></div>{term.aliases.length ? <p className="mt-1 text-[10px] font-semibold text-violet-950/65">Aliases: {term.aliases.join(", ")}</p> : null}{term.pronunciationHint || term.contextHint ? <p className="mt-1 text-[10px] font-semibold text-violet-950/65">{[term.pronunciationHint ? `Sounds like ${term.pronunciationHint}` : "", term.contextHint || ""].filter(Boolean).join(" · ")}</p> : null}</div>
            {canWrite ? <div className="flex shrink-0 gap-2"><button type="button" onClick={() => edit(term)} disabled={busy} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-violet-200 px-2 text-[10px] font-black text-violet-900 hover:bg-violet-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</button><button type="button" onClick={() => void mutate("archive", term)} disabled={busy} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-stone-300 px-2 text-[10px] font-black text-stone-700 hover:bg-stone-50"><Archive className="h-3.5 w-3.5" aria-hidden="true" />Archive</button></div> : null}
          </article>
        ))}
        {!loading && payload && !activeTerms.length ? <div className="rounded-xl border border-dashed border-violet-300 bg-white/70 p-4 text-center text-xs font-bold text-violet-950/65">No preferred spellings yet. Start with co-hosts, show names, guests, products, and recurring specialist terms.</div> : null}
      </div>

      {archivedTerms.length ? <details className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3"><summary className="cursor-pointer text-xs font-black text-stone-800">Archived vocabulary · {archivedTerms.length}</summary><div className="mt-3 space-y-2">{archivedTerms.map((term) => <div key={term.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"><span className="text-xs font-bold text-stone-700">{term.canonicalText}</span>{canWrite ? <button type="button" onClick={() => void mutate("restore", term)} disabled={busy} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-stone-300 px-2 text-[10px] font-black text-stone-700 hover:bg-stone-50"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Restore</button> : null}</div>)}</div></details> : null}
    </section>
  );
}
