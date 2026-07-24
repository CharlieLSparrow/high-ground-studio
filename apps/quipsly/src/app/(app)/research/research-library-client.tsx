"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clapperboard,
  Database,
  Download,
  FileSearch,
  FolderOpen,
  Link2,
  Search,
  ShieldCheck,
  Highlighter,
  LockKeyhole,
  MessageSquareQuote,
  Tag,
  Upload,
} from "lucide-react";

import {
  createResearchStudioHandoffAction,
  createSourceAnnotationAction,
  createWritingDraftFromAnnotationAction,
  setSourceAnnotationStatusAction,
} from "./actions";

import {
  filterResearchRecords,
  humanizeResearchStatus,
  type ResearchEvidenceRecord,
  type ResearchLibrarySnapshot,
  type ResearchPacketRecord,
  type ResearchSourceRecord,
} from "./research-library-model";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function statusTone(status: string) {
  const normalized = status.toLocaleLowerCase();
  if (normalized.includes("approved") || normalized.includes("verified")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (normalized.includes("review") || normalized.includes("proposed")) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-[#e8dcc4] bg-[#fffaf3] text-[#6f5a43]";
}

function PacketCard({ packet }: { packet: ResearchPacketRecord }) {
  return (
    <article className="rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a7047]">
            Saved packet · {packet.projectName}
          </p>
          <h3 className="mt-2 font-serif text-xl font-black text-[#3d3122]">
            {packet.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#806c54]">
            {packet.documentTitle || "Nest-level packet"} · Updated {formatDate(packet.updatedAt)}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusTone(packet.status)}`}
          title="Saved packet status"
        >
          {humanizeResearchStatus(packet.status)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-[#6f5a43]">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${packet.hasLineage ? "border-cyan-200 bg-cyan-50 text-cyan-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <Link2 size={13} aria-hidden="true" />
          {packet.hasLineage ? "Lineage metadata present" : "Lineage not recorded"}
        </span>
        <span className="rounded-full border border-[#e8dcc4] bg-[#fffaf3] px-2.5 py-1">
          {humanizeResearchStatus(packet.kind)}
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#806c54]">
        {packet.approvedAt
          ? `Approval timestamp recorded ${formatDate(packet.approvedAt)}.`
          : "No approval timestamp is recorded for this packet."}
      </p>

      <Link
        href={`/nests/${encodeURIComponent(packet.projectSlug)}`}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#d9c5a5] bg-[#fffaf3] px-4 py-2 text-[11px] font-black uppercase tracking-[0.13em] text-[#68472c] transition hover:bg-[#f8ecd9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
      >
        Open source Nest <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </article>
  );
}

function EvidenceCard({ node }: { node: ResearchEvidenceRecord }) {
  return (
    <article className="rounded-2xl border border-[#e8dcc4] bg-[#fffdf9] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a7047]">
            {node.projectName} · {node.documentTitle}
          </p>
          <h3 className="mt-1 font-serif text-lg font-black text-[#3d3122]">{node.title}</h3>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${statusTone(node.reviewStatus)}`}>
          {humanizeResearchStatus(node.reviewStatus)}
        </span>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#695744]">
        {node.excerpt || "This evidence record has no note body yet."}
      </p>

      <dl className="mt-4 grid gap-2 text-xs text-[#806c54] sm:grid-cols-2">
        <div>
          <dt className="font-black uppercase tracking-[0.1em]">Source</dt>
          <dd className="mt-1 break-words">{node.sourceLabel || node.sourcePath || "Source label not recorded"}</dd>
        </div>
        <div>
          <dt className="font-black uppercase tracking-[0.1em]">Tag</dt>
          <dd className="mt-1">{node.tagLabel} · {humanizeResearchStatus(node.nodeType)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#806c54]">
        Projection: {humanizeResearchStatus(node.projectionStatus)}
      </p>

      <Link
        href={`/create?project=${encodeURIComponent(node.projectSlug)}`}
        className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#815629] underline decoration-[#d8b98a] underline-offset-4 hover:text-[#4f351f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
      >
        Review in source document <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </article>
  );
}

type PassageSelection = { startOffset: number; endOffset: number; exactText: string };

function SourceAnnotationWorkbench({
  source,
  focusedAnnotationId = null,
}: {
  source: ResearchSourceRecord;
  focusedAnnotationId?: string | null;
}) {
  const router = useRouter();
  const textRef = useRef<HTMLDivElement>(null);
  const focusedAnnotationRef = useRef<HTMLElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const draftRequestIdsRef = useRef<Record<string, string>>({});
  const [selection, setSelection] = useState<PassageSelection | null>(null);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("note");
  const [visibility, setVisibility] = useState("private");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!focusedAnnotationId) return;
    const timer = window.setTimeout(() => {
      focusedAnnotationRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      focusedAnnotationRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusedAnnotationId]);

  function captureSelection() {
    if (!source.canWrite) return;
    const root = textRef.current;
    const browserSelection = window.getSelection();
    if (!root || !browserSelection || browserSelection.rangeCount === 0 || browserSelection.isCollapsed) return;
    const range = browserSelection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const before = range.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const startOffset = before.toString().length;
    const exactText = range.toString();
    if (!exactText.trim()) return;
    setSelection({ startOffset, endOffset: startOffset + exactText.length, exactText });
    setNotice(null);
  }

  function toggleTag(tagId: string) {
    setTagIds((current) => current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]);
  }

  function save() {
    if (!selection) {
      setNotice({ tone: "error", message: "Drag across an exact passage in the preserved source first." });
      return;
    }
    startTransition(async () => {
      requestIdRef.current ??= crypto.randomUUID();
      try {
        const result = await createSourceAnnotationAction({
          projectSlug: source.projectSlug,
          sourceUnitId: source.id,
          clientRequestId: requestIdRef.current,
          kind,
          visibility,
          body,
          startOffset: selection.startOffset,
          endOffset: selection.endOffset,
          exactText: selection.exactText,
          tagIds,
        });
        if (!result.ok) {
          setNotice({ tone: "error", message: result.message });
          return;
        }
        requestIdRef.current = null;
        setNotice({ tone: "success", message: result.reused ? "This annotation was already saved." : "Annotation saved with its source anchor." });
        setSelection(null);
        setBody("");
        setTagIds([]);
        window.getSelection()?.removeAllRanges();
        router.refresh();
      } catch {
        setNotice({ tone: "error", message: "Nest did not confirm the save. Retry will reuse the same save identity." });
      }
    });
  }

  function changeStatus(annotation: ResearchSourceRecord["annotations"][number], nextStatus: string) {
    startTransition(async () => {
      try {
        const result = await setSourceAnnotationStatusAction({
          annotationId: annotation.id,
          expectedUpdatedAt: annotation.updatedAt,
          nextStatus,
        });
        setNotice(result.ok
          ? { tone: "success", message: nextStatus === "resolved" ? "Annotation resolved; its history remains inspectable." : "Annotation reopened." }
          : { tone: "error", message: result.message });
        if (result.ok) router.refresh();
      } catch {
        setNotice({ tone: "error", message: "Nest did not confirm that review decision. Refresh before trying again." });
      }
    });
  }

  function startDraft(annotation: ResearchSourceRecord["annotations"][number]) {
    startTransition(async () => {
      draftRequestIdsRef.current[annotation.id] ??= crypto.randomUUID();
      try {
        const result = await createWritingDraftFromAnnotationAction({
          annotationId: annotation.id,
          projectSlug: source.projectSlug,
          clientRequestId: draftRequestIdsRef.current[annotation.id],
          expectedUpdatedAt: annotation.updatedAt,
        });
        if (!result.ok) {
          setNotice({ tone: "error", message: result.message });
          return;
        }
        delete draftRequestIdsRef.current[annotation.id];
        router.push(result.href);
      } catch {
        setNotice({ tone: "error", message: "Nest did not confirm the draft handoff. Retry will reuse the same handoff identity." });
      }
    });
  }

  function sendToStudio(annotation: ResearchSourceRecord["annotations"][number]) {
    startTransition(async () => {
      try {
        const result = await createResearchStudioHandoffAction({
          annotationId: annotation.id,
          projectSlug: source.projectSlug,
          expectedUpdatedAt: annotation.updatedAt,
        });
        setNotice(result.ok
          ? {
              tone: "success",
              message: result.reused
                ? `Studio already has this pinned revision (r${result.revision}).`
                : `Studio evidence packet created from pinned revision r${result.revision}.`,
            }
          : { tone: "error", message: result.message });
        if (result.ok) router.refresh();
      } catch {
        setNotice({ tone: "error", message: "Nest did not confirm the Studio handoff. Refresh before retrying this revision." });
      }
    });
  }

  return (
    <article id={`research-source-${source.id}`} className="scroll-mt-24 overflow-hidden rounded-3xl border border-[#dec9a9] bg-white shadow-sm">
      <header className="border-b border-[#eee1cd] bg-[#fffaf3] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a7047]">Preserved source · {source.projectName}</p>
            <h3 className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{source.title}</h3>
            <p className="mt-1 text-xs text-[#806c54]">{humanizeResearchStatus(source.kind)}{source.author ? ` · ${source.author}` : ""}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-900">
            <ShieldCheck size={13} aria-hidden="true" /> Source unchanged
          </span>
        </div>
        {source.personalCaptureOrigin ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs font-semibold text-cyan-950">
            <FileSearch size={15} aria-hidden="true" />
            <span>Filed deliberately from a personal {source.personalCaptureOrigin.captureType === "BOOKMARK" ? "link" : "passage"} capture on {formatDate(source.personalCaptureOrigin.filedAt)}. The private original was not changed or shared.</span>
            {source.personalCaptureOrigin.ownedByMe && source.personalCaptureOrigin.captureId ? (
              <Link href={`/collections?capture=${encodeURIComponent(source.personalCaptureOrigin.captureId)}`} className="font-black underline decoration-cyan-300 underline-offset-4">Open my original capture</Link>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <section className="min-w-0 border-b border-[#eee1cd] p-5 lg:border-b-0 lg:border-r" aria-label={`Source text for ${source.title}`}>
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-[#75593c]">
            <Highlighter size={15} aria-hidden="true" /> Drag across a passage to anchor a note.
          </p>
          <div
            ref={textRef}
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[#eadbc4] bg-[#fffdf9] p-5 font-serif text-[15px] leading-7 text-[#443729] selection:bg-amber-200"
            tabIndex={0}
          >
            {source.immutableText}
          </div>
          {source.contentTruncated ? (
            <p className="mt-2 text-xs text-amber-800">This reading window shows the first 18,000 characters. The complete immutable source remains stored; open its Nest for the rest.</p>
          ) : null}
        </section>

        {source.canWrite ? (
          <section className="p-5" aria-label="Annotation composer">
            <div className="flex items-center gap-2">
              <MessageSquareQuote size={17} className="text-[#9a7047]" aria-hidden="true" />
              <h4 className="font-serif text-lg font-black text-[#3d3122]">Annotate the evidence</h4>
            </div>
            <div className={`mt-3 min-h-20 rounded-xl border p-3 text-sm leading-6 ${selection ? "border-amber-300 bg-amber-50 text-amber-950" : "border-dashed border-[#d9c5a5] bg-[#fffaf3] text-[#806c54]"}`} aria-live="polite">
              {selection ? <q>{selection.exactText}</q> : "No passage selected yet."}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-[10px] font-black uppercase tracking-[0.12em] text-[#75593c]">
              Purpose
              <select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#d9c5a5] bg-white p-2.5 text-sm font-semibold normal-case tracking-normal">
                {['note', 'question', 'quote', 'claim', 'idea', 'correction', 'action', 'highlight'].map((value) => <option key={value} value={value}>{humanizeResearchStatus(value)}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-[0.12em] text-[#75593c]">
              Who can see it
              <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#d9c5a5] bg-white p-2.5 text-sm font-semibold normal-case tracking-normal">
                <option value="private">Only me</option>
                <option value="project">Nest collaborators</option>
              </select>
            </label>
            </div>

            <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.12em] text-[#75593c]">
            Note
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} placeholder="Why this matters, what to verify, or how it could shape the episode…" className="mt-1.5 w-full resize-y rounded-xl border border-[#d9c5a5] bg-white p-3 text-sm font-normal leading-6 normal-case tracking-normal outline-none focus:border-amber-600 focus:ring-4 focus:ring-amber-500/10" />
            </label>

            {source.tagCatalog.length > 0 ? (
              <fieldset className="mt-4">
                <legend className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#75593c]"><Tag size={12} aria-hidden="true" /> Tags</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {source.tagCatalog.map((tag) => (
                    <button key={tag.id} type="button" aria-pressed={tagIds.includes(tag.id)} onClick={() => toggleTag(tag.id)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${tagIds.includes(tag.id) ? "border-[#4f351f] bg-[#4f351f] text-white" : "border-[#d9c5a5] bg-[#fffaf3] text-[#68472c]"}`}>{tag.label}</button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <button type="button" onClick={save} disabled={isPending || !selection || (!body.trim() && tagIds.length === 0)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:opacity-45">
              {isPending ? "Saving…" : "Save source-linked annotation"}
            </button>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-[#806c54]"><LockKeyhole size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> Saving adds an overlay and revision receipt. It never edits the source text.</p>
            {notice ? <p role="status" className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>{notice.message}</p> : null}
          </section>
        ) : (
          <section className="p-5" aria-label="Read-only source access">
            <div className="flex items-center gap-2">
              <LockKeyhole size={17} className="text-[#9a7047]" aria-hidden="true" />
              <h4 className="font-serif text-lg font-black text-[#3d3122]">Read-only source view</h4>
            </div>
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              This local snapshot can verify persisted evidence, but it cannot save annotations, change review state, create drafts, or export private research. Sign in as a Nest collaborator to work with this source.
            </p>
            <Link href="/login?callbackUrl=/research" className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[#3d3122] bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white">
              Sign in to annotate
            </Link>
          </section>
        )}
      </div>

      {source.annotations.length > 0 ? (
        <section className="border-t border-[#eee1cd] bg-[#fffdf9] p-5" aria-label="Saved annotations">
          <h4 className="text-xs font-black uppercase tracking-[0.14em] text-[#75593c]">Saved annotations</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {source.annotations.map((annotation) => (
              <article
                key={annotation.id}
                id={`research-annotation-${annotation.id}`}
                ref={annotation.id === focusedAnnotationId ? focusedAnnotationRef : undefined}
                tabIndex={annotation.id === focusedAnnotationId ? -1 : undefined}
                aria-current={annotation.id === focusedAnnotationId ? "true" : undefined}
                className={`scroll-mt-24 rounded-2xl border bg-white p-4 outline-none ${
                  annotation.id === focusedAnnotationId
                    ? "border-cyan-500 ring-4 ring-cyan-100"
                    : "border-[#e8dcc4]"
                }`}
              >
                {annotation.id === focusedAnnotationId ? (
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-900">
                    Exact saved annotation opened from writing
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em]">
                  <span className="rounded-full bg-[#f4e8d4] px-2 py-1 text-[#68472c]">{humanizeResearchStatus(annotation.kind)}</span>
                  <span className={annotation.status === "resolved" ? "text-emerald-700" : "text-amber-700"}>{humanizeResearchStatus(annotation.status)}</span>
                  <span className="text-[#806c54]">{annotation.visibility === "private" ? "Only me" : "Nest collaborators"}</span>
                </div>
                <blockquote className="mt-3 border-l-2 border-amber-300 pl-3 font-serif text-sm italic leading-6 text-[#5c4935]">“{annotation.exactText}”</blockquote>
                {annotation.body ? <p className="mt-3 text-sm leading-6 text-[#443729]">{annotation.body}</p> : null}
                {annotation.tagLabels.length > 0 ? <p className="mt-3 text-xs font-bold text-[#806c54]">{annotation.tagLabels.join(" · ")}</p> : null}
                {annotation.writingUses.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-950">
                    <p className="font-black uppercase tracking-[0.1em]">Used in writing</p>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {annotation.writingUses.map((writingUse) => (
                        <Link key={writingUse.id} href={`/create?project=${encodeURIComponent(writingUse.projectSlug)}&document=${encodeURIComponent(writingUse.documentId)}`} className="font-bold underline decoration-cyan-300 underline-offset-4">
                          {writingUse.documentTitle}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {annotation.createdByMe || source.canWrite ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {annotation.createdByMe ? (
                      <button type="button" disabled={isPending} onClick={() => changeStatus(annotation, annotation.status === "resolved" ? "active" : "resolved")} className="text-xs font-black text-[#815629] underline decoration-[#d8b98a] underline-offset-4">
                        {annotation.status === "resolved" ? "Reopen" : "Mark resolved"}
                      </button>
                    ) : null}
                    {source.canWrite ? (
                      <>
                        <button type="button" disabled={isPending} onClick={() => startDraft(annotation)} className="text-xs font-black text-cyan-800 underline decoration-cyan-300 underline-offset-4">
                          Start private draft with this evidence
                        </button>
                        {annotation.visibility === "project" ? (
                          <button type="button" disabled={isPending} onClick={() => sendToStudio(annotation)} className="inline-flex items-center gap-1 text-xs font-black text-violet-800 underline decoration-violet-300 underline-offset-4">
                            <Clapperboard size={13} aria-hidden="true" /> Send pinned revision to Studio
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-[#806c54]">Share with this Nest before Studio handoff.</span>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

function SignedOutState({ message }: { message: string }) {
  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-[#e8dcc4] bg-white p-8 shadow-sm">
      <FolderOpen className="text-[#9a7047]" aria-hidden="true" />
      <h2 className="mt-4 font-serif text-3xl font-black text-[#3d3122]">Research stays private.</h2>
      <p className="mt-3 text-sm leading-6 text-[#6f5a43]">{message}</p>
      <Link
        href="/login?callbackUrl=/research"
        className="mt-6 inline-flex rounded-full bg-[#3d3122] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
      >
        Sign in
      </Link>
    </section>
  );
}

function UnavailableState({ snapshot }: { snapshot: Extract<ResearchLibrarySnapshot, { state: "unavailable" }> }) {
  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-7 text-amber-950 shadow-sm" role="status">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em]">Research data unavailable</p>
          <h2 className="mt-2 font-serif text-2xl font-black">Nothing here has been replaced with sample work.</h2>
          <p className="mt-3 text-sm leading-6">{snapshot.message} Your sources and saved packets have not been changed.</p>
          <p className="mt-2 text-xs leading-5 text-amber-900/80">
            Auth state: {snapshot.authState === "signed-in" ? "signed in" : "local operator override"}. Persistence state: unavailable.
          </p>
          <Link
            href="/research"
            className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            Retry read
          </Link>
        </div>
      </div>
    </section>
  );
}

type RestorePlan = {
  sourceCount: number;
  sourceCreates: number;
  sourceReuses: number;
  sourceSlugCollisions: number;
  tagCount: number;
  tagCreates: number;
  tagReuses: number;
  annotationCount: number;
  annotationCreates: number;
  annotationReuses: number;
  writingUseCount: number;
  writingUseCreates: number;
  writingUseReuses: number;
  writingUsesDeferred: number;
  writingTargetDocumentCreates: number;
  writingTargetDocumentReuses: number;
  writingTargetBlockCreates: number;
  writingTargetBlockReuses: number;
  sourceMutations: number;
  overwrites: number;
};

function ResearchRestoreControl({ projects }: { projects: Array<{ id: string; slug: string; name: string }> }) {
  const router = useRouter();
  const [projectSlug, setProjectSlug] = useState(projects[0]?.slug ?? "");
  const [fileName, setFileName] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [bundle, setBundle] = useState<unknown>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "neutral"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function loadBundleText(rawJson: string, label: string) {
    setPlan(null);
    setBundle(null);
    setFileName(label);
    setNotice(null);
    if (new TextEncoder().encode(rawJson).byteLength > 30 * 1024 * 1024) {
      setNotice({ tone: "error", message: "That file is larger than the 30 MB restore limit." });
      return;
    }
    try {
      setBundle(JSON.parse(rawJson));
      setNotice({ tone: "neutral", message: "Bundle loaded locally. Validate it before Quipsly offers a restore." });
    } catch {
      setNotice({ tone: "error", message: "That file is not valid JSON. Nothing was sent or restored." });
    }
  }

  async function chooseFile(file?: File) {
    setPlan(null);
    setBundle(null);
    setFileName(file?.name ?? "");
    setNotice(null);
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      setNotice({ tone: "error", message: "That file is larger than the 30 MB restore limit." });
      return;
    }
    loadBundleText(await file.text(), file.name);
  }

  function send(mode: "validate" | "apply") {
    if (!bundle || !projectSlug) return;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/research/restore?project=${encodeURIComponent(projectSlug)}&mode=${mode}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bundle),
        });
        const result = await response.json() as { ok?: boolean; error?: string; plan?: RestorePlan };
        if (!response.ok || !result.ok) {
          setNotice({ tone: "error", message: result.error || "Quipsly could not verify this research bundle." });
          return;
        }
        if (mode === "validate") {
          setPlan(result.plan ?? null);
          setNotice({ tone: "success", message: "Integrity and destination checks passed. Review the no-overwrite plan before applying it." });
          return;
        }
        setPlan(result.plan ?? plan);
        setNotice({ tone: "success", message: "Research and eligible writing excerpts restored privately. Existing sources and documents were not overwritten; retrying this bundle reuses the same restore identities." });
        router.refresh();
      } catch {
        setNotice({ tone: "error", message: "Nest did not confirm the restore. Retry uses the same restore identities and never overwrites source text." });
      }
    });
  }

  if (projects.length === 0) {
    return <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">You need Editor or Owner access to a destination Nest before restoring research.</p>;
  }

  const noticeTone = notice?.tone === "error"
    ? "border-red-200 bg-red-50 text-red-900"
    : notice?.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-[#e8dcc4] bg-[#fffaf3] text-[#6f5a43]";

  return (
    <div className="mt-5 border-t border-[#eee1cd] pt-5" aria-label="Restore portable research">
      <h3 className="text-xs font-black uppercase tracking-[0.13em] text-[#68472c]">Restore without overwriting</h3>
      <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.12em] text-[#75593c]">
        Destination Nest
        <select value={projectSlug} onChange={(event) => { setProjectSlug(event.target.value); setPlan(null); }} className="mt-1.5 w-full rounded-xl border border-[#d9c5a5] bg-white p-2.5 text-sm font-semibold normal-case tracking-normal">
          {projects.map((project) => <option key={project.id} value={project.slug}>{project.name}</option>)}
        </select>
      </label>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#cdb58f] bg-[#fffaf3] px-3 py-3 text-xs font-black text-[#68472c]">
        <Upload size={14} aria-hidden="true" /> {fileName || "Choose Quipsly research JSON"}
        <input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void chooseFile(event.target.files?.[0])} />
      </label>
      <details className="mt-3 rounded-xl border border-[#e2d2b8] bg-white px-3 py-2 text-xs text-[#68472c]">
        <summary className="cursor-pointer font-black">Can&apos;t choose a file? Paste portable JSON</summary>
        <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.12em] text-[#75593c]">
          Portable research JSON
          <textarea
            aria-label="Paste Quipsly research JSON"
            value={pastedJson}
            onChange={(event) => setPastedJson(event.target.value)}
            placeholder="Paste the complete Quipsly research export here"
            className="mt-1.5 min-h-28 w-full resize-y rounded-xl border border-[#d9c5a5] bg-[#fffaf3] p-2.5 font-mono text-[11px] font-normal normal-case leading-5 tracking-normal text-[#3d3122]"
          />
        </label>
        <button
          type="button"
          disabled={!pastedJson.trim()}
          onClick={() => loadBundleText(pastedJson, "Pasted portable JSON")}
          className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-[#3d3122] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#3d3122] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Load pasted JSON
        </button>
        <p className="mt-2 leading-5 text-[#806c54]">Pasted text stays in this browser until you press Validate restore plan.</p>
      </details>
      {notice ? <p role="status" className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${noticeTone}`}>{notice.message}</p> : null}
      <button type="button" disabled={!bundle || isPending} onClick={() => send("validate")} className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-[#3d3122] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#3d3122] disabled:cursor-not-allowed disabled:opacity-45">
        {isPending && !plan ? "Validating…" : "Validate restore plan"}
      </button>
      {plan ? (
        <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs leading-5 text-cyan-950">
          <p className="font-black uppercase tracking-[0.1em]">Verified no-overwrite plan</p>
          <ul className="mt-2 space-y-1">
            <li>{plan.sourceCreates} sources created · {plan.sourceReuses} exact sources reused</li>
            <li>{plan.annotationCreates} annotations created · {plan.annotationReuses} restore identities reused</li>
            <li>{plan.tagCreates} tags created · {plan.tagReuses} destination tags reused</li>
            <li>{plan.sourceSlugCollisions} source-name collisions become versioned copies</li>
            <li>{plan.writingTargetDocumentCreates} private writing excerpt documents created · {plan.writingTargetDocumentReuses} reused</li>
            <li>{plan.writingTargetBlockCreates} referenced writing blocks created · {plan.writingTargetBlockReuses} reused</li>
            <li>{plan.writingUseCreates} evidence-to-writing links restored · {plan.writingUseReuses} reused</li>
            <li>{plan.writingUsesDeferred} legacy writing-use links deferred because their export has no verified target snapshot</li>
          </ul>
          <p className="mt-2">Writing restore contains referenced blocks only, not a claim that the original full document was exported. Restored excerpts stay private until a person deliberately changes their status.</p>
          <p className="mt-2 font-black">{plan.overwrites} overwrites · {plan.sourceMutations} source mutations</p>
          <button type="button" disabled={isPending || plan.overwrites !== 0 || plan.sourceMutations !== 0} onClick={() => send("apply")} className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-[#3d3122] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-45">
            {isPending ? "Restoring…" : "Apply verified restore"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ResearchLibraryClient({
  snapshot,
  initialQuery = "",
  initialSourceId = null,
  initialAnnotationId = null,
}: {
  snapshot: ResearchLibrarySnapshot;
  initialQuery?: string;
  initialSourceId?: string | null;
  initialAnnotationId?: string | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [focusedSourceId, setFocusedSourceId] = useState(initialSourceId);
  const hasWriteAccess = snapshot.state === "ready" && snapshot.sources.some((source) => source.canWrite);

  const filtered = useMemo(() => {
    if (snapshot.state !== "ready") return { sources: [], packets: [], evidence: [] };
    const result = filterResearchRecords(query, snapshot.sources, snapshot.packets, snapshot.evidence);
    if (!focusedSourceId || query.trim()) return result;
    return {
      sources: result.sources.filter((source) => source.id === focusedSourceId),
      packets: [],
      evidence: [],
    };
  }, [focusedSourceId, query, snapshot]);

  return (
    <div className="mx-auto w-full max-w-7xl px-1 py-4 md:px-3 md:py-6">
      <header className="max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#9a7047]">Research</p>
        <h1 className="mt-3 font-serif text-4xl font-black leading-tight text-[#3d3122] md:text-5xl">
          Evidence, with its receipts.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#6f5a43]">
          Find source-backed notes and saved packets without losing the document, Nest, review state, or lineage that makes them trustworthy.
        </p>
      </header>

      <div className="mt-7">
        {snapshot.state === "signed-out" ? <SignedOutState message={snapshot.message} /> : null}
        {snapshot.state === "unavailable" ? <UnavailableState snapshot={snapshot} /> : null}
      </div>

      {snapshot.state === "ready" ? (
        <>
          <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950" aria-label="Workspace connection">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em]">Live workspace records</p>
                  <p className="mt-1 text-sm leading-6">
                    {snapshot.accessibleNestCount} accessible {snapshot.accessibleNestCount === 1 ? "Nest" : "Nests"}. Nothing below is representative or demo content.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-200 bg-white/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em]">
                {snapshot.authState === "signed-in" ? "Signed in" : "Local read-only"} · Persistence connected
              </span>
            </div>
          </section>

          <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <main className="min-w-0">
              <section aria-labelledby="research-search-heading">
                <h2 id="research-search-heading" className="sr-only">Search loaded research</h2>
                <label htmlFor="research-query" className="text-xs font-black uppercase tracking-[0.14em] text-[#7a5b3d]">
                  Search loaded evidence and packets
                </label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7047]" size={19} aria-hidden="true" />
                  <input
                    id="research-query"
                    type="search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setFocusedSourceId(null);
                    }}
                    placeholder="Try a source, Nest, tag, packet, or phrase"
                    className="w-full rounded-2xl border-2 border-[#e8dcc4] bg-white py-3.5 pl-12 pr-4 text-base text-[#3d3122] shadow-sm outline-none transition placeholder:text-[#a99477] focus:border-amber-600 focus:ring-4 focus:ring-amber-500/10"
                  />
                </div>
                <p className="mt-2 text-xs text-[#806c54]" aria-live="polite">
                  Showing {filtered.sources.length} preserved {filtered.sources.length === 1 ? "source" : "sources"}, {filtered.packets.length} saved {filtered.packets.length === 1 ? "packet" : "packets"}, and {filtered.evidence.length} evidence {filtered.evidence.length === 1 ? "record" : "records"}.
                </p>
                {focusedSourceId && !query.trim() ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
                    <span>Opened the exact preserved source selected in Library.</span>
                    <button type="button" onClick={() => setFocusedSourceId(null)} className="rounded-full border border-amber-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide">Show all research</button>
                  </div>
                ) : null}
              </section>

              <section className="mt-8" aria-labelledby="preserved-sources-heading">
                <div className="flex items-center gap-2">
                  <Highlighter className="text-[#9a7047]" size={19} aria-hidden="true" />
                  <h2 id="preserved-sources-heading" className="font-serif text-2xl font-black text-[#3d3122]">{hasWriteAccess ? "Read and annotate preserved sources" : "Read preserved sources"}</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#806c54]">
                  {hasWriteAccess
                    ? "Select the exact words that matter. Notes and tags live in a revisioned overlay while the imported source remains immutable."
                    : "Inspect the exact source, saved annotations, and writing links. Sign in before Quipsly offers any mutation control."}
                </p>
                {filtered.sources.length > 0 ? (
                  <div className="mt-4 space-y-6">
                    {filtered.sources.map((source) => (
                      <SourceAnnotationWorkbench
                        key={source.id}
                        source={source}
                        focusedAnnotationId={source.id === focusedSourceId ? initialAnnotationId : null}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#d9c5a5] bg-[#fffaf3] p-6">
                    <p className="font-serif text-lg font-black text-[#3d3122]">{query ? "No preserved sources match this search." : "No preserved text sources are available yet."}</p>
                    <p className="mt-2 text-sm leading-6 text-[#806c54]">Import source material into a Nest first. Quipsly will not create a fake reading sample here.</p>
                  </div>
                )}
              </section>

              <section className="mt-8" aria-labelledby="saved-packets-heading">
                <div className="flex items-center gap-2">
                  <Database className="text-[#9a7047]" size={19} aria-hidden="true" />
                  <h2 id="saved-packets-heading" className="font-serif text-2xl font-black text-[#3d3122]">Saved research packets</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#806c54]">
                  Only persisted output packets whose kind is marked as research appear here.
                </p>

                {filtered.packets.length > 0 ? (
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {filtered.packets.map((packet) => <PacketCard key={packet.id} packet={packet} />)}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#d9c5a5] bg-[#fffaf3] p-6">
                    <p className="font-serif text-lg font-black text-[#3d3122]">
                      {query ? "No saved packets match this search." : "No saved research packets yet."}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#806c54]">
                      {query
                        ? "Try a broader phrase or clear the search. Quipsly will not invent a packet to fill this space."
                        : "A packet belongs here only after source material is selected, a review draft is prepared in context, and that packet is actually saved."}
                    </p>
                  </div>
                )}
              </section>

              <section className="mt-9" aria-labelledby="evidence-heading">
                <div className="flex items-center gap-2">
                  <BookOpen className="text-[#9a7047]" size={19} aria-hidden="true" />
                  <h2 id="evidence-heading" className="font-serif text-2xl font-black text-[#3d3122]">Source material ready for review</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#806c54]">
                  These are real knowledge records projected from tagged source spans. Their review labels are workspace data, not assistant activity.
                </p>

                {filtered.evidence.length > 0 ? (
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {filtered.evidence.map((node) => <EvidenceCard key={node.id} node={node} />)}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#d9c5a5] bg-[#fffaf3] p-6">
                    <p className="font-serif text-lg font-black text-[#3d3122]">
                      {query ? "No evidence records match this search." : "No source evidence has been indexed for these Nests."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#806c54]">
                      Open a source document, select an exact passage, and tag or annotate it. The original source remains intact while the evidence layer grows around it.
                    </p>
                  </div>
                )}
              </section>
            </main>

            <aside className="space-y-5" aria-label="Research packet workflow">
              <section className="rounded-3xl border border-[#e8dcc4] bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-[#9a7047]" size={19} aria-hidden="true" />
                  <h2 className="font-serif text-xl font-black text-[#3d3122]">Prepare a real packet</h2>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#6f5a43]">
                  Packet preparation needs a source context. Start in the Nest that owns the evidence instead of launching a context-free assistant run here.
                </p>
                <ol className="mt-5 space-y-4 text-sm text-[#6f5a43]">
                  {[
                    ["1", "Open the source Nest"],
                    ["2", "Select exact passages and annotations"],
                    ["3", "Ask Quipsly for a review draft"],
                    ["4", "Check citations and approve deliberately"],
                  ].map(([number, label]) => (
                    <li key={number} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f4e8d4] text-xs font-black text-[#744d2b]">{number}</span>
                      <span>{label}</span>
                    </li>
                  ))}
                </ol>
                <Link
                  href="/projects"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#241a13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                >
                  <FolderOpen size={15} aria-hidden="true" /> Choose a source Nest
                </Link>
              </section>

              <section className="rounded-3xl border border-cyan-200 bg-cyan-50 p-6 text-cyan-950">
                <div className="flex items-center gap-2">
                  <FileSearch size={18} aria-hidden="true" />
                  <h2 className="font-serif text-lg font-black">What this page proves</h2>
                </div>
                <ul className="mt-4 space-y-3 text-xs leading-5">
                  <li>Source text remains attached to its document and Nest.</li>
                  <li>Packet lineage is visible before a packet is trusted.</li>
                  <li>Review status comes from saved records, never animated decoration.</li>
                  <li>No search, assistant, publish, or save success is simulated.</li>
                </ul>
              </section>

              <section className="rounded-3xl border border-[#e8dcc4] bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <Download size={18} className="text-[#9a7047]" aria-hidden="true" />
                  <h2 className="font-serif text-lg font-black text-[#3d3122]">Portable research</h2>
                </div>
                <p className="mt-3 text-xs leading-5 text-[#6f5a43]">
                  Download preserved source text, visible annotations, revision receipts, tags, eligible writing-use links with their referenced block snapshots, and SHA-256 verification evidence. Another member&apos;s private draft links are excluded. External URLs are not fetched.
                </p>
                {snapshot.authState === "signed-in" ? (
                  <>
                    <div className="mt-4 flex flex-col gap-2">
                      {snapshot.projects.map((project) => (
                        <a key={project.id} href={`/api/research/export?project=${encodeURIComponent(project.slug)}`} className="inline-flex items-center justify-between gap-2 rounded-xl border border-[#d9c5a5] bg-[#fffaf3] px-3 py-2.5 text-xs font-black text-[#68472c]">
                          <span className="truncate">Export {project.name}</span>
                          <Download size={14} className="shrink-0" aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                    <ResearchRestoreControl projects={snapshot.projects.filter((project) => project.canWrite)} />
                  </>
                ) : (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">Sign in before Quipsly exposes an export containing private workspace records.</p>
                )}
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
