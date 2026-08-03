"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, BellRing, CalendarClock, Check, Circle, CircleSlash2, Flag, ListChecks, Pencil, Play, Repeat2, RotateCcw, Tags, Target, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import LocalDateTime from "@/components/LocalDateTime";
import { TagSearchChips } from "@/components/tag-search-chips";
import { applyTagMerge, applyTagMergeRollback, changeWorkTagTaxonomy, createAndAssignWorkTag, createWorkGoal, createWorkTask, createWorkVocabularyTag, editTaskRecurrence, editWorkGoal, editWorkTask, linkWorkGoalTask, previewTagMerge, previewTagMergeRollback, recordWorkGoalProgress, replaceWorkTags, reviewImportedWorkTag, saveWeeklyCommitment, setWorkTaskReminder, unlinkWorkGoalTask, updateTaskRecurrenceStatus, updateWorkGoalStatus, updateWorkTaskStatus, type SerializedWorkTagMergePreview, type SerializedWorkTagMergeRollbackPreview } from "./actions";
import type { WorkCommitment, WorkGoal, WorkGoalStatus, WorkProjectOption, WorkSnapshot, WorkTag, WorkTagCandidate, WorkTask, WorkTaskStatus } from "./work-model";

export type TaskFilter = "ATTENTION" | "OPEN" | "DONE" | "ALL";

type WorkClientProps = {
  initialSnapshot: WorkSnapshot;
  projectOptions?: WorkProjectOption[];
  focusTaskId?: string | null;
  focusGoalId?: string | null;
  unavailableFocusKind?: "task" | "goal" | null;
  initialFilter?: "ATTENTION" | "OPEN";
  manageTags?: boolean;
  initialProjectId?: string | null;
};

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatUtcOptionDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatMediaTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function localDateTimeInput(value: string | null, timeZone: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 86_400_000);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function currentWeekStartsOn() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function TagChips({ tags }: { tags: WorkTag[] }) {
  return <TagSearchChips tags={tags} />;
}

function TagEditor({ entityKind, entityId, project, tags, updatedAt, canManage, onRefresh }: {
  entityKind: "task" | "goal";
  entityId: string;
  project: WorkProjectOption | null;
  tags: WorkTag[];
  updatedAt: string;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [creating, startCreating] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!project || !canManage || !project.canWrite) return <TagChips tags={tags} />;
  const selectedIds = new Set(tags.map((tag) => tag.id));
  const activeTags = project.tags.filter((tag) => tag.isActive !== false);
  return <div className="mt-3">
    <TagChips tags={tags} />
    <details className="mt-2 rounded-xl border border-sky-100 bg-sky-50/40 p-3">
      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-sky-900"><Tags className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />Edit {project.name} tags</summary>
      {activeTags.length ? <form key={`${updatedAt}-${tags.map((tag) => tag.id).join("-")}`} action={(formData) => {
        setMessage(null);
        startTransition(async () => {
          const result = await replaceWorkTags({ entityKind, entityId, tagIds: formData.getAll("tagId").map(String), expectedUpdatedAt: updatedAt });
          if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onRefresh(); return; }
          setMessage("Tags saved inside this Nest. No external action was taken.");
          onRefresh();
        });
      }} className="mt-3 space-y-3">
        <fieldset className="flex flex-wrap gap-2"><legend className="sr-only">Choose tags</legend>{activeTags.map((tag) => <label key={tag.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-950"><input type="checkbox" name="tagId" value={tag.id} defaultChecked={selectedIds.has(tag.id)} />{tag.label}</label>)}</fieldset>
        <button type="submit" disabled={pending} className="rounded-full bg-sky-800 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50">{pending ? "Saving…" : "Save tags"}</button>
      </form> : <p className="mt-2 text-xs font-semibold text-sky-900">This Nest has no active tags yet. Create the first reusable tag below.</p>}
      <form action={(formData) => {
        setMessage(null);
        startCreating(async () => {
          const result = await createAndAssignWorkTag({
            entityKind,
            entityId,
            label: String(formData.get("newTagLabel") || ""),
            expectedUpdatedAt: updatedAt,
          });
          if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onRefresh(); return; }
          setMessage(result.created
            ? `#${result.tag.label} was created for ${project.name} and applied here.`
            : `Existing #${result.tag.label} was applied here; no duplicate tag was created.`);
          onRefresh();
        });
      }} className="mt-4 border-t border-sky-100 pt-4">
        <label htmlFor={`new-tag-${entityKind}-${entityId}`} className="block text-[10px] font-black uppercase tracking-wide text-sky-900">New reusable tag</label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input id={`new-tag-${entityKind}-${entityId}`} name="newTagLabel" required maxLength={80} placeholder="e.g. Product development" aria-describedby={`new-tag-help-${entityKind}-${entityId}`} className="min-h-11 min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-sky-950" />
          <button type="submit" disabled={creating} className="min-h-11 rounded-full border border-sky-700 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-sky-900 disabled:opacity-50">{creating ? "Creating…" : "Create & apply"}</button>
        </div>
        <p id={`new-tag-help-${entityKind}-${entityId}`} className="mt-2 text-[11px] font-semibold leading-5 text-sky-800">Shared only inside {project.name}. Exact-name retries reuse the existing tag; ambiguous names never merge silently.</p>
      </form>
      {message && <p role="status" className="mt-2 text-xs font-bold text-sky-950">{message}</p>}
    </details>
  </div>;
}

function TagMergeControl({ source, project, onRefresh }: { source: WorkTag; project: WorkProjectOption; onRefresh: () => void }) {
  const targets = project.tags.filter((tag) => tag.isActive !== false && !tag.mergedInto && tag.id !== source.id);
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<SerializedWorkTagMergePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [merging, startMerge] = useTransition();
  if (!targets.length || source.isActive === false || source.mergedInto) return null;

  function previewMerge() {
    setMessage(null);
    setPreview(null);
    setConfirmed(false);
    startPreview(async () => {
      const result = await previewTagMerge({ sourceTagId: source.id, targetTagId: targetId });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setPreview(result.preview);
      setMessage(result.preview.canMerge
        ? "Preview verified. Review the exact impact before confirming."
        : "This merge is blocked until the listed evidence conflicts are resolved.");
    });
  }

  function merge() {
    if (!preview || !confirmed) return;
    setMessage(null);
    startMerge(async () => {
      const result = await applyTagMerge({
        sourceTagId: preview.source.id,
        targetTagId: preview.target.id,
        expectedImpactHash: preview.impactHash,
        expectedSourceUpdatedAt: preview.source.updatedAt,
        expectedTargetUpdatedAt: preview.target.updatedAt,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") setPreview(null);
        return;
      }
      setMessage(`#${result.sourceTag.label} now redirects to #${result.targetTag.label}. ${result.counts.totalUses} exact use${result.counts.totalUses === 1 ? " was" : "s were"} preserved.`);
      onRefresh();
    });
  }

  return <details className="mt-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/50 p-3">
    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-fuchsia-900">Merge into another tag</summary>
    <p className="mt-2 text-[11px] font-semibold leading-5 text-fuchsia-950">This is global inside {project.name}. Quipsly previews every supported relationship first, preserves #{source.label} as a redirect, and writes an exact rollback receipt.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <label className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-wide text-fuchsia-900">Canonical target
        <select value={targetId} onChange={(event) => { setTargetId(event.target.value); setPreview(null); setConfirmed(false); setMessage(null); }} className="mt-1 min-h-11 w-full rounded-xl border border-fuchsia-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal">
          <option value="">Choose the tag that should remain</option>
          {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
        </select>
      </label>
      <button type="button" disabled={!targetId || previewing || merging} onClick={previewMerge} className="min-h-11 self-end rounded-full border border-fuchsia-300 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-fuchsia-900 disabled:opacity-50">{previewing ? "Checking…" : "Preview merge"}</button>
    </div>
    {preview && <div className={`mt-3 rounded-xl border p-3 ${preview.canMerge ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <p className="text-xs font-black text-fuchsia-950">#{preview.source.label} → #{preview.target.label}</p>
      <p className="mt-2 text-[11px] font-semibold leading-5 text-fuchsia-950">{preview.counts.totalUses} total uses: {preview.counts.documents} documents, {preview.counts.tasks} tasks, {preview.counts.goals} goals, {preview.counts.sessions} Sessions, {preview.counts.coachingNotes} coaching notes, {preview.counts.annotations} annotations, {preview.counts.taggedSpans} anchored spans, {preview.counts.knowledgeNodes} knowledge nodes, and {preview.counts.mediaClips} media clips.</p>
      {(Object.values(preview.deduplicated).reduce((sum, count) => sum + count, 0) > 0) && <p className="mt-2 text-[11px] font-bold text-fuchsia-900">{Object.values(preview.deduplicated).reduce((sum, count) => sum + count, 0)} already-shared relationship{Object.values(preview.deduplicated).reduce((sum, count) => sum + count, 0) === 1 ? " will" : "s will"} deduplicate without deleting either underlying record.</p>}
      {!preview.canMerge && <ul className="mt-2 list-disc pl-5 text-[11px] font-bold text-rose-900">
        {preview.blockingConflicts.anchoredSpanCollisions > 0 && <li>{preview.blockingConflicts.anchoredSpanCollisions} same-range writing anchor collision{preview.blockingConflicts.anchoredSpanCollisions === 1 ? "" : "s"} require human review.</li>}
        {preview.blockingConflicts.aliasCollisions.map((collision) => <li key={`${collision.slug}-${collision.label}`}>“{collision.label}” conflicts with “{collision.conflictingLabel}”.</li>)}
        {preview.blockingConflicts.relationLimitExceeded && <li>This tag exceeds the safe 5,000-row preview limit for at least one relationship type.</li>}
        {preview.blockingConflicts.personalDocumentOwnershipConflict && <li>Another person owns private writing that uses this tag. Quipsly will not expose or rewrite that relationship; ask each owner to reconcile it intentionally.</li>}
      </ul>}
      {preview.canMerge && <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold leading-5 text-emerald-950"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />I reviewed this exact impact. Keep #{preview.target.label} as canonical and preserve #{preview.source.label} as a redirect.</label>}
      {preview.canMerge && <button type="button" disabled={!confirmed || merging} onClick={merge} className="mt-3 min-h-11 rounded-full bg-fuchsia-800 px-4 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50">{merging ? "Merging…" : `Merge into #${preview.target.label}`}</button>}
    </div>}
    {message && <p role="status" className="mt-3 text-xs font-bold leading-5 text-fuchsia-950">{message}</p>}
  </details>;
}

function TagMergeRollbackControl({ source, project, onRefresh }: { source: WorkTag; project: WorkProjectOption; onRefresh: () => void }) {
  const [preview, setPreview] = useState<SerializedWorkTagMergeRollbackPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [rollingBack, startRollback] = useTransition();
  if (!source.mergedInto) return null;

  function previewRollback() {
    setPreview(null);
    setConfirmed(false);
    setMessage(null);
    startPreview(async () => {
      const result = await previewTagMergeRollback({ sourceTagId: source.id });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setPreview(result.preview);
      setMessage(result.preview.canRollback
        ? "Receipt verified. Review exactly what will be restored and preserved."
        : "Rollback is blocked because the recorded merge state changed afterward.");
    });
  }

  function rollback() {
    if (!preview || !confirmed) return;
    setMessage(null);
    startRollback(async () => {
      const result = await applyTagMergeRollback({
        sourceTagId: preview.source.id,
        expectedPreviewHash: preview.previewHash,
        expectedSourceUpdatedAt: preview.source.updatedAt,
        expectedTargetUpdatedAt: preview.target.updatedAt,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") setPreview(null);
        return;
      }
      setMessage(`#${result.sourceTag.label} is independent again. ${result.counts.totalUses} exact use${result.counts.totalUses === 1 ? " was" : "s were"} restored from receipt ${result.rollbackReceiptId}.`);
      onRefresh();
    });
  }

  const preservedCount = preview ? Object.values(preview.targetRelationshipsPreserved).reduce((sum, count) => sum + count, 0) : 0;
  const removedCount = preview ? Object.values(preview.targetRelationshipsRemoved).reduce((sum, count) => sum + count, 0) : 0;
  return <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-amber-950">Inspect merge receipt & rollback</summary>
    <p className="mt-2 text-[11px] font-semibold leading-5 text-amber-950">Rollback is local to {project.name}. Quipsly restores only the source relationships recorded at merge time, preserves target relationships that already existed, and fails closed after later edits.</p>
    <button type="button" disabled={previewing || rollingBack} onClick={previewRollback} className="mt-3 min-h-11 rounded-full border border-amber-300 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-amber-950 disabled:opacity-50">{previewing ? "Checking receipt…" : "Preview exact rollback"}</button>
    {preview && <div className={`mt-3 rounded-xl border p-3 ${preview.canRollback ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <p className="text-xs font-black text-amber-950">Restore #{preview.source.label} from merge receipt {preview.receiptId}</p>
      <p className="mt-2 text-[11px] font-semibold leading-5 text-amber-950">{preview.counts.totalUses} uses return to the source: {preview.counts.documents} documents, {preview.counts.tasks} tasks, {preview.counts.goals} goals, {preview.counts.sessions} Sessions, {preview.counts.coachingNotes} coaching notes, {preview.counts.annotations} annotations, {preview.counts.taggedSpans} anchored spans, {preview.counts.knowledgeNodes} knowledge nodes, and {preview.counts.mediaClips} media clips.</p>
      <p className="mt-2 text-[11px] font-bold text-amber-950">{preservedCount} target relationship{preservedCount === 1 ? "" : "s"} already existed and will remain. {removedCount} relationship{removedCount === 1 ? "" : "s"} created by the merge will be removed from #{preview.target.label}.</p>
      {!preview.canRollback && <ul className="mt-2 list-disc pl-5 text-[11px] font-bold text-rose-900">{preview.blockingConflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>}
      {preview.canRollback && <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold leading-5 text-emerald-950"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />I reviewed this receipt. Restore #{preview.source.label}; preserve the {preservedCount} pre-existing target relationship{preservedCount === 1 ? "" : "s"}.</label>}
      {preview.canRollback && <button type="button" disabled={!confirmed || rollingBack} onClick={rollback} className="mt-3 min-h-11 rounded-full bg-amber-800 px-4 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50">{rollingBack ? "Rolling back…" : `Restore #${preview.source.label}`}</button>}
    </div>}
    {message && <p role="status" className="mt-3 text-xs font-bold leading-5 text-amber-950">{message}</p>}
  </details>;
}

function ImportedKeywordReview({ project, onRefresh }: { project: WorkProjectOption; onRefresh: () => void }) {
  const candidates = project.tagCandidates ?? [];
  const pendingCandidates = candidates.filter((candidate) => candidate.status === "PENDING");
  const rejectedCandidates = candidates.filter((candidate) => candidate.status === "REJECTED");
  const promotedCandidates = candidates.filter((candidate) => candidate.status === "PROMOTED");
  const [confirmedCandidateId, setConfirmedCandidateId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!candidates.length) return null;

  function review(candidate: WorkTagCandidate, operation: "PROMOTE" | "REJECT" | "REOPEN") {
    setMessage(null);
    startSaving(async () => {
      const result = await reviewImportedWorkTag({
        candidateId: candidate.id,
        operation,
        expectedUpdatedAt: candidate.updatedAt,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT" || result.code === "INVALID_STATE") onRefresh();
        return;
      }
      setConfirmedCandidateId(null);
      setMessage(operation === "PROMOTE"
        ? `#${result.tag?.label ?? candidate.label} is now intentional shared vocabulary. Imported evidence remains attached to receipt ${result.receiptId}.`
        : operation === "REJECT"
          ? `“${candidate.label}” stays preserved as imported evidence but is not available as a tag.`
          : `“${candidate.label}” is back in review. It is still not available as a tag.`);
      onRefresh();
    });
  }

  return <section aria-label={`Imported keyword review for ${project.name}`} className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-[10px] font-black uppercase tracking-wide text-violet-800">Imported keyword review</p><p className="mt-1 text-xs font-semibold leading-5 text-violet-950">Suggestions remain separate from shared tags until you deliberately promote them.</p></div>
      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-900">{pendingCandidates.length} pending</span>
    </div>
    {pendingCandidates.length > 0 && <ul className="mt-3 space-y-3">{pendingCandidates.map((candidate) => <li key={candidate.id} className="rounded-xl border border-violet-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-black">{candidate.label}</p><p className="mt-1 text-[11px] font-semibold text-violet-900">{candidate.evidenceCount} imported source {candidate.evidenceCount === 1 ? "receipt" : "receipts"} · not yet a tag</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900">Suggestion only</span></div>
      <details className="mt-2 text-[11px] font-semibold text-violet-900"><summary className="cursor-pointer font-black">Inspect source evidence</summary><ul className="mt-2 space-y-1 pl-4">{candidate.evidence.map((evidence) => <li key={evidence.id} className="list-disc break-all">{evidence.sourceKind}: {evidence.sourceIdentity}</li>)}</ul>{candidate.evidenceCount > candidate.evidence.length && <p className="mt-2">Showing {candidate.evidence.length} of {candidate.evidenceCount} receipts.</p>}</details>
      <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-bold leading-5 text-violet-950"><input type="checkbox" checked={confirmedCandidateId === candidate.id} onChange={(event) => setConfirmedCandidateId(event.target.checked ? candidate.id : null)} className="mt-1" />Add #{candidate.label} to intentional shared vocabulary.</label>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving || confirmedCandidateId !== candidate.id} onClick={() => review(candidate, "PROMOTE")} className="min-h-11 rounded-full bg-violet-800 px-4 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50">Promote to #{candidate.label}</button><button type="button" disabled={saving} onClick={() => review(candidate, "REJECT")} className="min-h-11 rounded-full border border-slate-300 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-700 disabled:opacity-50">Reject suggestion</button></div>
    </li>)}</ul>}
    {pendingCandidates.length === 0 && <p className="mt-3 rounded-xl border border-dashed border-violet-200 bg-white/70 p-3 text-xs font-semibold text-violet-900">No imported keywords need a decision.</p>}
    {(rejectedCandidates.length > 0 || promotedCandidates.length > 0) && <details className="mt-3 rounded-xl border border-violet-100 bg-white/70 p-3"><summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-violet-800">Reviewed · {promotedCandidates.length} promoted · {rejectedCandidates.length} rejected</summary>
      {promotedCandidates.length > 0 && <ul className="mt-3 space-y-2">{promotedCandidates.map((candidate) => <li key={candidate.id} className="text-xs font-semibold text-emerald-900">#{candidate.label} → {candidate.promotedTag ? `#${candidate.promotedTag.label}` : "preserved promotion receipt"}</li>)}</ul>}
      {rejectedCandidates.length > 0 && <ul className="mt-3 space-y-2">{rejectedCandidates.map((candidate) => <li key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-semibold text-slate-800">{candidate.label} · evidence preserved, not a tag</span><button type="button" disabled={saving} onClick={() => review(candidate, "REOPEN")} className="min-h-11 rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 disabled:opacity-50">Reopen review</button></li>)}</ul>}
    </details>}
    {message && <p role="status" className="mt-3 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-violet-950">{message}</p>}
  </section>;
}

function TagVocabulary({ projects, onRefresh, expanded = false, initialProjectId = null }: { projects: WorkProjectOption[]; onRefresh: () => void; expanded?: boolean; initialProjectId?: string | null }) {
  const writableProjects = projects.filter((project) => project.canWrite);
  const [pending, startTransition] = useTransition();
  const [creating, startCreating] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(
    writableProjects.some((project) => project.id === initialProjectId)
      ? initialProjectId!
      : writableProjects[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);
  if (!writableProjects.length) return null;
  const selectedProject = writableProjects.find((project) => project.id === selectedProjectId) ?? writableProjects[0];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTags = selectedProject.tags.filter((tag) => {
    if (!showArchived && tag.isActive === false) return false;
    if (!normalizedQuery) return true;
    return [
      tag.label,
      tag.slug,
      tag.category,
      ...(tag.aliases ?? []).flatMap((alias) => [alias.label, alias.slug]),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
  const activeTagCount = writableProjects.reduce(
    (count, project) => count + project.tags.filter((tag) => tag.isActive !== false).length,
    0,
  );

  function change(tag: WorkTag, operation: "RENAME" | "ARCHIVE" | "RESTORE", label?: string) {
    if (!tag.updatedAt) {
      setMessage("Refresh Work before changing this tag.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await changeWorkTagTaxonomy({ tagId: tag.id, operation, label, expectedUpdatedAt: tag.updatedAt! });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") onRefresh();
        return;
      }
      setMessage(operation === "RENAME"
        ? `Renamed to #${result.tag.label}. The former name remains a reusable alias.`
        : operation === "ARCHIVE"
          ? `#${result.tag.label} is archived. Existing records keep it; new assignments hide it.`
          : `#${result.tag.label} is active again.`);
      onRefresh();
    });
  }

  function createTag() {
    const label = newTagLabel.trim();
    if (!label) {
      setMessage("Enter a reusable tag name first.");
      return;
    }
    setMessage(null);
    startCreating(async () => {
      const result = await createWorkVocabularyTag({
        projectId: selectedProject.id,
        label,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setNewTagLabel("");
      setQuery("");
      setShowArchived(false);
      setMessage(result.created
        ? `Created #${result.tag.label} for ${selectedProject.name}. It is ready to assign; no record was tagged automatically.`
        : `#${result.tag.label} already exists in ${selectedProject.name}. No duplicate was created.`);
      onRefresh();
    });
  }

  return <section aria-labelledby="tag-vocabulary-heading" className="rounded-3xl border border-sky-200 bg-[linear-gradient(145deg,#f7fcff,#eef8ff)] p-5 shadow-sm md:p-6">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-sky-100 p-2 text-sky-900"><Tags aria-hidden="true" /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">Shared organizing language</p><h2 id="tag-vocabulary-heading" className="font-serif text-2xl font-black">Nest vocabulary</h2><p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-sky-950">Rename without breaking older iPhone captures: Quipsly keeps the former name as an alias. Archive hides a tag from new choices while preserving every existing link.</p></div></div>
    <details open={expanded || undefined} className="mt-5 rounded-2xl border border-sky-200 bg-white/80 p-4">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-sky-900">Manage vocabulary · {activeTagCount} active across {writableProjects.length} Nest{writableProjects.length === 1 ? "" : "s"}</summary>
      <form action={createTag} className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[15rem] flex-1 text-[10px] font-black uppercase tracking-wide text-sky-900">New reusable tag
            <input name="newTagLabel" required maxLength={80} value={newTagLabel} onChange={(event) => setNewTagLabel(event.target.value)} placeholder="Episode production…" className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal" />
          </label>
          <button type="submit" disabled={creating} className="min-h-11 rounded-full bg-sky-800 px-5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50">{creating ? "Creating…" : "Create tag"}</button>
        </div>
        <p className="mt-2 text-xs font-semibold leading-5 text-sky-950">Adds shared vocabulary to the selected Nest. It does not tag a task, goal, note, document, session, or clip by itself.</p>
      </form>
      <div className="mt-4 grid gap-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-4 md:grid-cols-[minmax(13rem,1fr)_minmax(15rem,2fr)_auto] md:items-end">
        <label className="text-[10px] font-black uppercase tracking-wide text-sky-900">Nest
          <select value={selectedProject.id} onChange={(event) => { setSelectedProjectId(event.target.value); setExpandedTagId(null); }} className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal">
            {writableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-sky-900">Find a tag or former name
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setExpandedTagId(null); }} placeholder="Episode, coaching, proof listen…" className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal" />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-xs font-bold text-sky-950">
          <input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); setExpandedTagId(null); }} />
          Show archived
        </label>
      </div>
      <article className="mt-4 rounded-2xl border border-sky-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-xl font-black">{selectedProject.name}</h3><p className="text-[10px] font-black uppercase tracking-wide text-sky-800">{selectedProject.tags.filter((tag) => tag.isActive !== false).length} active · {selectedProject.tags.filter((tag) => tag.isActive === false).length} archived</p></div><Link href={`/nests/${encodeURIComponent(selectedProject.slug)}`} className="min-h-11 content-center text-[10px] font-black uppercase tracking-wide text-sky-800 hover:underline">Open Nest</Link></div>
        {visibleTags.length ? <ul className="mt-4 space-y-2">{visibleTags.map((tag) => {
          const isExpanded = expandedTagId === tag.id;
          return <li key={tag.id} className={`rounded-xl border p-3 ${tag.isActive === false ? "border-slate-200 bg-slate-50" : "border-sky-100 bg-sky-50/40"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-black">#{tag.label}</p><p className="mt-1 text-[11px] font-semibold text-sky-900">{tag.aliases?.length ? `Also matches ${tag.aliases.map((alias) => `#${alias.label}`).join(", ")}` : "No former names"}</p></div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tag.isActive === false ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>{tag.isActive === false ? "Archived" : "Active"}</span>
                <button type="button" aria-label={isExpanded ? `Close ${tag.label} controls` : `Manage ${tag.label}`} aria-expanded={isExpanded} onClick={() => setExpandedTagId(isExpanded ? null : tag.id)} className="min-h-11 shrink-0 rounded-full border border-sky-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-sky-900">{isExpanded ? "Close" : "Manage"}</button>
              </div>
            </div>
            {isExpanded && <div className="mt-3 border-t border-sky-100 pt-3">
              {tag.mergedInto ? <><p className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs font-bold text-fuchsia-950">Merged into #{tag.mergedInto.label}. Older captures using this name resolve to the canonical tag.</p><TagMergeRollbackControl source={tag} project={selectedProject} onRefresh={onRefresh} /></> : tag.isActive === false ? <button type="button" disabled={pending} onClick={() => change(tag, "RESTORE")} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-800 disabled:opacity-50"><RotateCcw size={14} aria-hidden="true" />Restore</button> : <div className="flex flex-col gap-2 sm:flex-row">
                <form action={(formData) => change(tag, "RENAME", String(formData.get("label") || ""))} className="flex min-w-0 flex-1 gap-2"><label htmlFor={`rename-tag-${tag.id}`} className="sr-only">Rename {tag.label}</label><input id={`rename-tag-${tag.id}`} name="label" required maxLength={80} defaultValue={tag.label} className="min-h-11 min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold" /><button type="submit" disabled={pending} className="min-h-11 rounded-full bg-sky-800 px-4 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50">Rename</button></form>
                <button type="button" disabled={pending} onClick={() => change(tag, "ARCHIVE")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-700 disabled:opacity-50"><Archive size={14} aria-hidden="true" />Archive</button>
              </div>}
              {!tag.mergedInto && <TagMergeControl source={tag} project={selectedProject} onRefresh={onRefresh} />}
            </div>}
          </li>;
        })}</ul> : <p className="mt-4 rounded-xl border border-dashed border-sky-200 p-4 text-sm font-semibold text-sky-900">{normalizedQuery ? "No tags or former names match this search." : "Create the first reusable tag above."}</p>}
        <ImportedKeywordReview project={selectedProject} onRefresh={onRefresh} />
      </article>
      {message && <p role="status" className="mt-4 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-950">{message}</p>}
    </details>
  </section>;
}

function TaskRecurrenceEditor({ task, onRefresh }: { task: WorkTask; onRefresh: () => void }) {
  const recurrence = task.recurrence;
  const [scope, setScope] = useState<"THIS_OCCURRENCE" | "THIS_AND_FUTURE">("THIS_OCCURRENCE");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef<string>(crypto.randomUUID());
  if (!recurrence || task.status !== "OPEN") return null;

  return <details className="mt-3 rounded-xl border border-violet-200 bg-white/80 p-3">
    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-violet-950"><Pencil className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />Edit repeating task</summary>
    <form action={(formData) => {
      setMessage(null);
      startTransition(async () => {
        const nextScope = String(formData.get("scope")) as "THIS_OCCURRENCE" | "THIS_AND_FUTURE";
        const result = await editTaskRecurrence({
          taskId: task.id,
          seriesId: recurrence.seriesId,
          scope: nextScope,
          title: String(formData.get("title") || ""),
          detail: String(formData.get("detail") || ""),
          expectedTaskUpdatedAt: task.updatedAt,
          expectedSeriesUpdatedAt: recurrence.updatedAt,
          clientRequestId: requestId.current,
          dueLocal: String(formData.get("dueLocal") || ""),
          timezone: String(formData.get("timezone") || ""),
          recurrence: nextScope === "THIS_AND_FUTURE" ? {
            cadence: String(formData.get("cadence")) as "FIXED" | "COMPLETION",
            frequency: String(formData.get("frequency")) as "DAILY" | "WEEKLY" | "MONTHLY",
            interval: Number(formData.get("interval") || 1),
          } : null,
        });
        if (!result.ok) {
          setMessage(result.error);
          if (result.code === "CONFLICT") onRefresh();
          return;
        }
        setMessage(result.scope === "THIS_OCCURRENCE"
          ? "This task’s wording changed. Its date and repeat stayed fixed."
          : `${result.supersededTaskCount ?? 0} open task${result.supersededTaskCount === 1 ? " was" : "s were"} preserved as superseded history; ${result.materializedCount ?? 0} future occurrence${result.materializedCount === 1 ? " was" : "s were"} created under the revised repeat.`);
        requestId.current = crypto.randomUUID();
        onRefresh();
      });
    }} className="mt-3 space-y-3">
      <label className="block text-xs font-bold text-violet-950">Change scope
        <select name="scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm">
          <option value="THIS_OCCURRENCE">This task only</option>
          <option value="THIS_AND_FUTURE">This and future tasks</option>
        </select>
      </label>
      <p className="text-[11px] font-semibold leading-relaxed text-violet-800">{scope === "THIS_OCCURRENCE"
        ? "Only this open task’s wording changes. Its date and repeat identity stay fixed."
        : "Quipsly closes the old repeat at this next open task, preserves completed and skipped history, and creates a new future series. Historical work is never rewritten."}</p>
      <label className="block text-xs font-bold text-violet-950">Task title<input name="title" required maxLength={500} defaultValue={task.title} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 px-3 text-sm" /></label>
      <label className="block text-xs font-bold text-violet-950">Optional detail<textarea name="detail" maxLength={5000} defaultValue={task.detail ?? ""} rows={3} className="mt-1 w-full rounded-xl border border-violet-200 px-3 py-2 text-sm" /></label>
      {scope === "THIS_AND_FUTURE" && <fieldset className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
        <legend className="px-1 text-[10px] font-black uppercase tracking-wide text-violet-900">Future repeat</legend>
        <label className="block text-xs font-bold text-violet-950">Cadence<select name="cadence" defaultValue={recurrence.cadence} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm"><option value="FIXED">Fixed schedule</option><option value="COMPLETION">After completion</option></select></label>
        <label className="block text-xs font-bold text-violet-950">First future due<input type="datetime-local" name="dueLocal" required defaultValue={localDateTimeInput(task.dueAt, recurrence.timezone)} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-violet-950">Frequency<select name="frequency" defaultValue={recurrence.frequency} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm"><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
          <label className="block text-xs font-bold text-violet-950">Interval<input type="number" name="interval" min={1} max={365} required defaultValue={recurrence.interval} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm" /></label>
        </div>
        <label className="block text-xs font-bold text-violet-950">IANA timezone<input name="timezone" required maxLength={100} defaultValue={recurrence.timezone} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm" /></label>
      </fieldset>}
      <p className="text-[11px] font-semibold leading-relaxed text-[#927b5b]">No completed history, reminder, provider calendar event, message, delivery, or publication is changed.</p>
      <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-violet-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{pending ? "Saving…" : "Save edit"}</button>
      {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</p>}
    </form>
  </details>;
}

function TaskReminderEditor({ task, onRefresh }: { task: WorkTask; onRefresh: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef<string>(crypto.randomUUID());
  if (!task.canManageReminder || task.status !== "OPEN" || task.recurrence) return null;

  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const defaultValue = localDateTimeInput(
    task.reminderAt ?? new Date(Date.now() + 3_600_000).toISOString(),
    localTimezone,
  );

  function save(remindAt: string | null) {
    setMessage(null);
    startTransition(async () => {
      if (remindAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(remindAt)) {
        setMessage("Choose a valid future reminder.");
        return;
      }
      const result = await setWorkTaskReminder({
        taskId: task.id,
        remindAtLocal: remindAt,
        timezone: localTimezone,
        expectedTaskUpdatedAt: task.updatedAt,
        expectedReminderUpdatedAt: task.reminderUpdatedAt ?? null,
        clientRequestId: requestId.current,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") onRefresh();
        return;
      }
      requestId.current = crypto.randomUUID();
      setMessage(result.status === "CANCELED"
        ? "Reminder canceled in Nest. Signed-in iPhones remove their local alert on the next verified refresh."
        : "Reminder saved in Nest. Signed-in iPhones reconcile the local alert on the next verified refresh; delivery is never promised.");
      onRefresh();
    });
  }

  return <details className="mt-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 p-3">
    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-fuchsia-950"><BellRing className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />{task.reminderAt ? "Change reminder" : "Add reminder"}</summary>
    <form action={(formData) => save(String(formData.get("remindAt") || ""))} className="mt-3 space-y-3">
      <label className="block text-xs font-bold text-fuchsia-950">Remind me
        <input type="datetime-local" name="remindAt" required defaultValue={defaultValue} className="mt-1 min-h-11 w-full rounded-xl border border-fuchsia-200 bg-white px-3 text-sm" />
      </label>
      <p className="text-[11px] font-semibold leading-relaxed text-fuchsia-900">This saves canonical intent in Nest. Each signed-in iPhone schedules its own private alert when iOS permission allows it. No provider calendar event, message, or guaranteed delivery is created.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-fuchsia-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{pending ? "Saving…" : task.reminderAt ? "Move reminder" : "Save reminder"}</button>
        {task.reminderAt && <button type="button" disabled={pending} onClick={() => {
          if (window.confirm("Cancel this reminder? The task and due date stay unchanged. Signed-in iPhones remove their local alert after the next verified refresh.")) save(null);
        }} className="min-h-11 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-800 disabled:opacity-50">Cancel reminder</button>}
      </div>
      {message && <p role="status" className="rounded-xl border border-fuchsia-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-fuchsia-950">{message}</p>}
    </form>
  </details>;
}

function TaskEditor({ task, onRefresh }: { task: WorkTask; onRefresh: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!task.canEdit || task.status !== "OPEN" || task.recurrence) return null;

  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  function save(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await editWorkTask({
        taskId: task.id,
        title: String(formData.get("title") || ""),
        detail: String(formData.get("detail") || ""),
        dueLocal: String(formData.get("dueLocal") || "") || null,
        timezone: localTimezone,
        expectedUpdatedAt: task.updatedAt,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") onRefresh();
        return;
      }
      setMessage("Task saved. Its reminder, repeat, status, tags, goal links, and external calendars were left unchanged.");
      onRefresh();
    });
  }

  return <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-amber-950"><Pencil className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />Edit task</summary>
    <form action={save} className="mt-3 space-y-3">
      <label className="block text-xs font-bold text-amber-950">Edit task title
        <input name="title" required maxLength={500} defaultValue={task.title} className="mt-1 min-h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm" />
      </label>
      <label className="block text-xs font-bold text-amber-950">Edit task detail
        <textarea name="detail" maxLength={5000} defaultValue={task.detail ?? ""} rows={3} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" />
      </label>
      <label className="block text-xs font-bold text-amber-950">Edit due date (optional)
        <input type="datetime-local" name="dueLocal" defaultValue={task.dueAt ? localDateTimeInput(task.dueAt, localTimezone) : ""} className="mt-1 min-h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm" />
      </label>
      <p className="text-[11px] font-semibold leading-relaxed text-amber-900">Clear the date to make this an undated task. Editing does not move its reminder or change any linked goal, repeat, tag, message, provider calendar event, or publication.</p>
      <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-amber-950 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{pending ? "Saving…" : "Save task changes"}</button>
      {message && <p role="status" className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-amber-950">{message}</p>}
    </form>
  </details>;
}

function GoalEditor({ goal, onRefresh }: { goal: WorkGoal; onRefresh: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (goal.provenance !== "Canonical goal"
      || (goal.status !== "ACTIVE" && goal.status !== "PAUSED")) {
    return null;
  }

  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const targetLocalDate = goal.targetAt
    ? localDateTimeInput(goal.targetAt, localTimezone).slice(0, 10)
    : "";

  function save(formData: FormData) {
    setMessage(null);
    const requestedTargetLocalDate = String(formData.get("targetLocalDate") || "") || null;
    const targetDecision = requestedTargetLocalDate === (targetLocalDate || null)
      ? "KEEP" as const
      : requestedTargetLocalDate
        ? "SET" as const
        : "CLEAR" as const;
    startTransition(async () => {
      const result = await editWorkGoal({
        goalId: goal.id,
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        targetDecision,
        targetLocalDate: targetDecision === "SET" ? requestedTargetLocalDate : null,
        timezone: localTimezone,
        expectedUpdatedAt: goal.updatedAt,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") onRefresh();
        return;
      }
      setMessage("Goal saved. Status, progress evidence, linked tasks, tags, source evidence, and external calendars were left unchanged.");
      onRefresh();
    });
  }

  return <details className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-violet-950"><Pencil className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />Edit goal</summary>
    <form action={save} className="mt-3 space-y-3">
      <label className="block text-xs font-bold text-violet-950">Goal title
        <input name="title" required maxLength={500} defaultValue={goal.title} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm" />
      </label>
      <label className="block text-xs font-bold text-violet-950">Definition of success
        <textarea name="description" maxLength={5000} defaultValue={goal.description ?? ""} rows={3} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm" />
      </label>
      <label className="block text-xs font-bold text-violet-950">Target date (optional)
        <input type="date" name="targetLocalDate" defaultValue={targetLocalDate} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm" />
      </label>
      <p className="text-[11px] font-semibold leading-relaxed text-violet-900">Clear the date to keep this goal open-ended. Editing never changes status or progress, completes a linked task, rewrites transcript evidence, moves a calendar, or sends anything.</p>
      <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-violet-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{pending ? "Saving…" : "Save goal changes"}</button>
      {message && <p role="status" className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-violet-950">{message}</p>}
    </form>
  </details>;
}

function TaskCard({ task, focused, managesRecurrence, projectOptions, onSaved, onConflict }: { task: WorkTask; focused: boolean; managesRecurrence: boolean; projectOptions: WorkProjectOption[]; onSaved: (taskId: string, nextStatus: WorkTaskStatus, updatedAt: string, notice: string) => void; onConflict: () => void }) {
  const [pending, startTransition] = useTransition();
  const [recurrencePending, startRecurrenceTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function decide(nextStatus: WorkTaskStatus) {
    const missedOccurrence = nextStatus === "CANCELED" && task.isOverdue && Boolean(task.recurrence);
    if (nextStatus === "CANCELED" && !window.confirm(missedOccurrence
      ? "Skip this missed occurrence? Quipsly will preserve it as skipped and continue the canonical series. No reminder, calendar event, message, delivery, or publication will occur."
      : task.recurrence?.cadence === "COMPLETION"
        ? "Skip this occurrence? The task stays in the audit trail and the next occurrence will be scheduled from now. No external action will be taken."
        : task.recurrence
          ? "Skip this occurrence? The task stays in the audit trail and the canonical series continues. No external action will be taken."
          : "Cancel this task? The task stays in the audit trail and no external action will be taken.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateWorkTaskStatus({
        taskId: task.id,
        nextStatus,
        expectedUpdatedAt: task.updatedAt,
        ...(missedOccurrence ? { decisionReason: "MISSED_OCCURRENCE_SKIPPED" as const } : {}),
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") onConflict();
        return;
      }
      const notice = nextStatus === "DONE" ? result.nextOccurrenceTaskId ? "Marked done. The next canonical occurrence was created; no reminder or provider event was scheduled." : "Marked done. A private status receipt was saved." : nextStatus === "OPEN" ? "Reopened. A private status receipt was saved." : missedOccurrence ? result.nextOccurrenceTaskId ? "Missed occurrence preserved as skipped. The next canonical occurrence was created; no external action occurred." : "Missed occurrence preserved as skipped. No external action occurred." : result.nextOccurrenceTaskId ? "Occurrence skipped. The next canonical occurrence was created; no reminder or provider event was scheduled." : "Canceled. The audit trail was preserved.";
      setMessage(notice);
      onSaved(task.id, nextStatus, result.updatedAt, notice);
    });
  }

  function decideRecurrence(nextStatus: "ACTIVE" | "PAUSED" | "ENDED") {
    const verb = nextStatus === "ENDED" ? "end" : nextStatus === "PAUSED" ? "pause" : "resume";
    if (nextStatus === "ENDED" && !window.confirm("End this repeat permanently? Existing task occurrences stay in the audit trail, and no provider calendar event or reminder will be changed.")) return;
    setMessage(null);
    startRecurrenceTransition(async () => {
      if (!task.recurrence) return;
      const result = await updateTaskRecurrenceStatus({ seriesId: task.recurrence.seriesId, nextStatus, expectedUpdatedAt: task.recurrence.updatedAt });
      if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onConflict(); return; }
      setMessage(`Repeat ${verb}${verb.endsWith("e") ? "d" : "ed"} inside Quipsly.${result.materializedCount ? ` ${result.materializedCount} canonical occurrence${result.materializedCount === 1 ? " was" : "s were"} restored.` : ""} Existing occurrences were preserved; no external calendar or reminder changed.`);
      onConflict();
    });
  }

  return (
    <article id={`work-task-${task.id}`} tabIndex={-1} aria-current={focused ? "true" : undefined} className={`scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm outline-none ${focused ? "border-sky-400 ring-4 ring-sky-100" : "border-[#e4d3b3]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${task.status === "DONE" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : task.status === "CANCELED" ? "border-stone-200 bg-stone-100 text-stone-600" : task.isOverdue ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{task.isOverdue ? "Overdue" : humanize(task.status)}</span>
            <span className="text-[10px] font-black uppercase tracking-wide text-[#92754f]">{task.provenance}</span>
          </div>
          <h3 className={`mt-2 text-lg font-black text-[#3d3122] ${task.status !== "OPEN" ? "line-through decoration-[#bca98d]" : ""}`}>{task.title}</h3>
          {task.attentionReason && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-orange-800"><BellRing size={13} aria-hidden="true" />{task.attentionReason}</p>}
          {task.recurrence && <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <p className="flex items-center gap-2 text-xs font-black text-violet-950"><Repeat2 size={15} aria-hidden="true" />{task.recurrence.label}</p>
            <p className="mt-1 text-[11px] font-semibold text-violet-800">Occurrence {task.recurrence.scheduledLocalDate} · Series {humanize(task.recurrence.status)}. Quipsly has not scheduled a reminder or provider event.</p>
            {task.recurrence.status !== "ENDED" && managesRecurrence && <div className="mt-2 flex flex-wrap gap-2">
              {task.recurrence.status === "ACTIVE" ? <button type="button" disabled={recurrencePending} onClick={() => decideRecurrence("PAUSED")} className="min-h-11 rounded-full border border-violet-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-violet-900 disabled:opacity-50">Pause repeat</button> : <button type="button" disabled={recurrencePending} onClick={() => decideRecurrence("ACTIVE")} className="min-h-11 rounded-full border border-violet-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-violet-900 disabled:opacity-50">Resume repeat</button>}
              <button type="button" disabled={recurrencePending} onClick={() => decideRecurrence("ENDED")} className="min-h-11 rounded-full border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-800 disabled:opacity-50">End repeat</button>
            </div>}
            {task.recurrence.status !== "ENDED" && managesRecurrence && <TaskRecurrenceEditor task={task} onRefresh={onConflict} />}
            {task.recurrence.status !== "ENDED" && !managesRecurrence && <p className="mt-2 text-[11px] font-semibold text-violet-800">Manage this series from its next open occurrence.</p>}
          </div>}
          <TaskEditor task={task} onRefresh={onConflict} />
          <TaskReminderEditor task={task} onRefresh={onConflict} />
          {task.detail && <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[#765f40]">{task.detail}</p>}
          <TagEditor entityKind="task" entityId={task.id} project={projectOptions.find((project) => project.id === task.project?.id) ?? null} tags={task.tags} updatedAt={task.updatedAt} canManage={task.canManageTags} onRefresh={onConflict} />
          {task.sourceAnchor && task.roomId && (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Reviewed transcript source</p>
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-sky-950">{task.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${task.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{task.sourceAnchor.effectiveTextSnapshot}</p>
              <Link href={`/sessions/${encodeURIComponent(task.roomId)}#transcript-segment-${encodeURIComponent(task.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline">
                <Play size={14} aria-hidden="true" />Return to {formatMediaTime(task.sourceAnchor.startSeconds)}–{formatMediaTime(task.sourceAnchor.endSeconds)}
              </Link>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-[#806a4d]">
        <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} aria-hidden="true" />{task.dueAt ? <LocalDateTime value={task.dueAt} mode="date" /> : "No due date"}</span>
        {task.reminderAt && <span className="inline-flex items-center gap-1.5">Reminder <LocalDateTime value={task.reminderAt} /></span>}
        <span className="inline-flex items-center gap-1.5"><UsersRound size={14} aria-hidden="true" />{task.assigneeLabel || "Unassigned"}</span>
        {task.project && <Link href={`/nests/${task.project.slug}`} className="inline-flex items-center gap-1.5 text-sky-700 hover:underline"><Tags size={14} aria-hidden="true" />{task.project.name}</Link>}
        {task.roomId && <Link href={`/sessions/${task.roomId}`} className="inline-flex items-center gap-1.5 text-violet-700 hover:underline"><ListChecks size={14} aria-hidden="true" />{task.sessionTitle || "Open session"}</Link>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {task.status !== "DONE" && <button type="button" disabled={pending} onClick={() => decide("DONE")} className="inline-flex items-center gap-1.5 rounded-full bg-[#3e2f21] px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"><Check size={14} aria-hidden="true" />Mark done</button>}
        {task.status !== "OPEN" && !task.historicalLocked && <button type="button" disabled={pending} onClick={() => decide("OPEN")} className="inline-flex items-center gap-1.5 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50"><RotateCcw size={14} aria-hidden="true" />Reopen</button>}
        {task.status !== "OPEN" && task.historicalLocked && <span className="inline-flex min-h-11 items-center rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-stone-600">Historical · replacement exists</span>}
        {task.status !== "CANCELED" && <button type="button" disabled={pending} onClick={() => decide("CANCELED")} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-700 disabled:opacity-50"><CircleSlash2 size={14} aria-hidden="true" />{task.recurrence ? task.isOverdue ? "Skip missed" : "Skip occurrence" : "Cancel"}</button>}
      </div>
      <p className="mt-3 text-[11px] font-semibold leading-relaxed text-[#927b5b]">Status changes stay inside Quipsly. They do not assign a person, send a message, change a calendar, or publish anything.</p>
      {message && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</p>}
    </article>
  );
}

function GoalCard({ goal, focused, availableTasks, projectOptions, onRefresh }: { goal: WorkGoal; focused: boolean; availableTasks: WorkTask[]; projectOptions: WorkProjectOption[]; onRefresh: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const canonical = goal.provenance === "Canonical goal";
  const linkedTaskIds = new Set(goal.linkedTasks.map((link) => link.task.id));
  const linkableTasks = availableTasks.filter((task) => !linkedTaskIds.has(task.id));

  function decide(nextStatus: WorkGoalStatus) {
    if (!canonical) return;
    if (nextStatus === "ARCHIVED" && !window.confirm("Archive this goal? Its history and task links stay preserved.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateWorkGoalStatus({ goalId: goal.id, nextStatus, expectedUpdatedAt: goal.updatedAt });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") onRefresh();
        return;
      }
      setMessage(`${humanize(nextStatus)} saved with a private goal receipt.`);
      onRefresh();
    });
  }

  function recordProgress(formData: FormData) {
    if (!canonical) return;
    setMessage(null);
    startTransition(async () => {
      const result = await recordWorkGoalProgress({
        goalId: goal.id,
        progressPercent: Number(formData.get("progressPercent")),
        note: String(formData.get("progressNote") || ""),
        expectedUpdatedAt: goal.updatedAt,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "CONFLICT") onRefresh();
        return;
      }
      setMessage("Progress evidence saved. Goal status did not change automatically.");
      onRefresh();
    });
  }

  function connectTask(formData: FormData) {
    if (!canonical) return;
    setMessage(null);
    startTransition(async () => {
      const result = await linkWorkGoalTask({
        goalId: goal.id,
        taskId: String(formData.get("taskId") || ""),
        relationship: String(formData.get("relationship") || "CONTRIBUTES") as "CONTRIBUTES" | "BLOCKS" | "OUTCOME",
        expectedUpdatedAt: goal.updatedAt,
      });
      if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onRefresh(); return; }
      setMessage("Task linked to this goal. Neither record changed status.");
      onRefresh();
    });
  }

  function disconnectTask(taskId: string) {
    if (!canonical) return;
    setMessage(null);
    startTransition(async () => {
      const result = await unlinkWorkGoalTask({ goalId: goal.id, taskId, expectedUpdatedAt: goal.updatedAt });
      if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onRefresh(); return; }
      setMessage("Task disconnected. The goal and task histories remain intact.");
      onRefresh();
    });
  }

  const tone = goal.status === "ACHIEVED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : goal.status === "PAUSED" ? "border-amber-200 bg-amber-50 text-amber-800" : goal.status === "ARCHIVED" ? "border-stone-200 bg-stone-100 text-stone-600" : "border-violet-200 bg-violet-50 text-violet-800";
  return <article id={`work-goal-${goal.id}`} tabIndex={-1} aria-current={focused ? "true" : undefined} className={`scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm outline-none ${focused ? "border-sky-400 ring-4 ring-sky-100" : "border-violet-200"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><Target className="text-violet-700" aria-hidden="true" /><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tone}`}>{humanize(goal.status)}</span><span className="rounded-full border border-[#e4d3b3] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#806a4d]">{goal.provenance}</span>{goal.restoredFromPortableBackup && <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-800">Restored copy</span>}</div></div>
    <h3 className="mt-3 text-xl font-black" aria-label={goal.restoredFromPortableBackup ? `${goal.title} — Restored copy` : undefined}>{goal.title}</h3>
    {goal.restoredFromPortableBackup && <p className="mt-2 rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-xs font-semibold leading-5 text-sky-950">Restored from a portable Nest backup. This copy keeps its own Quipsly identity and history; compare it with similarly named current work before changing either one.</p>}
    {goal.description && <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[#765f40]">{goal.description}</p>}
    <GoalEditor goal={goal} onRefresh={onRefresh} />
    <TagEditor entityKind="goal" entityId={goal.id} project={projectOptions.find((project) => project.id === goal.project?.id) ?? null} tags={goal.tags} updatedAt={goal.updatedAt} canManage={canonical && goal.canManageTags} onRefresh={onRefresh} />
    {goal.sourceAnchor && goal.roomId && <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-violet-800">Reviewed transcript goal source</p><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-violet-950">{goal.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${goal.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{goal.sourceAnchor.effectiveTextSnapshot}</p><Link href={`/sessions/${encodeURIComponent(goal.roomId)}#transcript-segment-${encodeURIComponent(goal.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-900 hover:underline"><Play size={14} aria-hidden="true" />Return to {formatMediaTime(goal.sourceAnchor.startSeconds)}–{formatMediaTime(goal.sourceAnchor.endSeconds)}</Link></div>}
    {goal.lastMergedTranscriptEvidence && <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Latest reviewed evidence added to this goal</p><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-sky-950">{goal.lastMergedTranscriptEvidence.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${goal.lastMergedTranscriptEvidence.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{goal.lastMergedTranscriptEvidence.sourceAnchor.effectiveTextSnapshot}</p><Link href={`/sessions/${encodeURIComponent(goal.lastMergedTranscriptEvidence.sourceAnchor.roomId)}#transcript-segment-${encodeURIComponent(goal.lastMergedTranscriptEvidence.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline"><Play size={14} aria-hidden="true" />Return to {formatMediaTime(goal.lastMergedTranscriptEvidence.sourceAnchor.startSeconds)}–{formatMediaTime(goal.lastMergedTranscriptEvidence.sourceAnchor.endSeconds)}</Link><p className="mt-2 text-[10px] font-bold leading-4 text-sky-800">Evidence was appended without changing this goal’s definition, status, target, tags, tasks, or project.</p></div>}
    <div className="mt-4 grid gap-2 text-xs font-bold text-[#806a4d] sm:grid-cols-2"><p>Progress: {goal.progressPercent === null ? "No update yet" : `${goal.progressPercent}%`}</p><p>Target: {goal.targetAt ? <LocalDateTime value={goal.targetAt} mode="date" /> : "No target date"}</p>{goal.parent && <p>Parent: {goal.parent.title}</p>}{goal.childCount > 0 && <p>{goal.childCount} child goal(s)</p>}{goal.project && <p>Project: {goal.project.name}</p>}{goal.sessionTitle && <p>Session: {goal.sessionTitle}</p>}</div>
    {goal.progressNote && <p className="mt-3 rounded-xl bg-violet-50 p-3 text-xs font-semibold leading-5 text-violet-950"><strong>Latest progress:</strong> {goal.progressNote}</p>}
    {goal.linkedTasks.length > 0 && <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-wide text-[#987443]">Linked work</p><ul className="mt-2 space-y-2">{goal.linkedTasks.map((link) => <li key={link.task.id} className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#765f40]"><Link href={`/work?task=${encodeURIComponent(link.task.id)}`} className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">{humanize(link.relationship)} · {link.task.title} · {humanize(link.task.status)}</Link>{canonical && <button type="button" disabled={pending} onClick={() => disconnectTask(link.task.id)} className="text-[10px] font-black uppercase tracking-wide text-rose-700 hover:underline">Disconnect</button>}</li>)}</ul></div>}
    <div className="mt-4 flex flex-wrap gap-3 text-xs font-black uppercase tracking-wide">{goal.roomId && <Link href={`/sessions/${goal.roomId}`} className="text-violet-700 hover:underline">Open source session</Link>}{goal.project && <Link href={`/nests/${goal.project.slug}`} className="text-violet-700 hover:underline">Open project</Link>}</div>
    {canonical ? <>
      <form action={recordProgress} className="mt-4 grid gap-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-end"><label className="text-[10px] font-black uppercase tracking-wide text-violet-900">Progress<select aria-label="Progress" key={String(goal.progressPercent ?? 0)} name="progressPercent" defaultValue={String(goal.progressPercent ?? 0)} className="mt-1 block rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold">{[0, 25, 50, 75, 100].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wide text-violet-900">Evidence note<input aria-label="Evidence note" name="progressNote" maxLength={2000} placeholder="What changed or what is blocking it?" className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold normal-case tracking-normal" /></label><button type="submit" disabled={pending} className="rounded-lg bg-violet-700 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50">Save progress</button></form>
      {linkableTasks.length > 0 && <details className="mt-3 rounded-xl border border-[#e4d3b3] bg-[#fffaf0] p-3"><summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-[#6f573b]">Connect another committed task</summary><form action={connectTask} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"><label className="text-[10px] font-black uppercase tracking-wide text-[#6f573b]">Committed task<select name="taskId" required defaultValue="" className="mt-1 block w-full rounded-lg border border-[#d9c7a5] bg-white px-3 py-2 text-xs font-bold"><option value="" disabled>Choose committed work</option>{linkableTasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {task.dueAt ? `${formatUtcOptionDate(task.dueAt)} UTC` : "No due date"} · {humanize(task.status)}</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wide text-[#6f573b]">Relationship<select name="relationship" defaultValue="CONTRIBUTES" className="mt-1 block rounded-lg border border-[#d9c7a5] bg-white px-3 py-2 text-xs font-bold"><option value="CONTRIBUTES">Contributes</option><option value="BLOCKS">Blocks</option><option value="OUTCOME">Outcome</option></select></label><button type="submit" disabled={pending} className="rounded-lg border border-[#d9c7a5] bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-[#5b472f] disabled:opacity-50">Connect</button></form></details>}
      <div className="mt-3 flex flex-wrap gap-2">{goal.status === "ACTIVE" && <button type="button" disabled={pending} onClick={() => decide("PAUSED")} className="rounded-full border border-amber-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-amber-800">Pause</button>}{(goal.status === "PAUSED" || goal.status === "ACHIEVED") && <button type="button" disabled={pending} onClick={() => decide("ACTIVE")} className="rounded-full border border-violet-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-violet-800">Make active</button>}{goal.status !== "ACHIEVED" && <button type="button" disabled={pending} onClick={() => decide("ACHIEVED")} className="rounded-full bg-emerald-700 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white">Mark achieved</button>}{goal.status !== "ARCHIVED" && <button type="button" disabled={pending} onClick={() => decide("ARCHIVED")} className="rounded-full border border-stone-300 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-stone-700">Archive</button>}</div>
    </> : <p className="mt-4 text-xs font-semibold leading-5 text-[#806a4d]">This legacy Session Plan goal remains readable. Save the Session Plan again after the canonical Goal migration to promote it without losing its source note.</p>}
    <p className="mt-3 text-[11px] font-semibold text-[#927b5b]">Goal decisions stay inside Quipsly and never create tasks, calendar events, messages, or publication actions by implication.</p>
    {message && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</p>}
  </article>;
}

function WeeklyCommitmentEditor({ commitments, onRefresh }: { commitments: WorkCommitment[]; onRefresh: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const weekStartsOn = useMemo(currentWeekStartsOn, []);
  const current = commitments.find((commitment) => commitment.isOwnedByActor && commitment.status === "ACTIVE" && commitment.weekStartsAt.slice(0, 10) === weekStartsOn) ?? null;

  function save(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveWeeklyCommitment({
        weekStartsOn,
        commitmentOne: String(formData.get("commitmentOne") || ""),
        commitmentTwo: String(formData.get("commitmentTwo") || ""),
        commitmentThree: String(formData.get("commitmentThree") || ""),
        supportNeeded: String(formData.get("supportNeeded") || ""),
        progressNotes: String(formData.get("progressNotes") || ""),
        clientReviewed: formData.get("clientReviewed") === "on",
        expectedUpdatedAt: current?.updatedAt ?? null,
      });
      if (!result.ok) { setMessage(result.error); if (result.code === "CONFLICT") onRefresh(); return; }
      setMessage("Weekly plan saved with a private receipt. No messages or calendar events were created.");
      onRefresh();
    });
  }

  return <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/35 p-4">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">Your week of {weekStartsOn}</p><h3 className="mt-1 text-xl font-black text-[#3d3122]">Choose less. Follow through better.</h3></div><span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">{current ? "Saved plan" : "New plan"}</span></div>
    <form key={current?.updatedAt ?? weekStartsOn} action={save} className="mt-4 grid gap-3 lg:grid-cols-2">
      <label className="text-xs font-black uppercase tracking-wide text-emerald-900">First commitment<input name="commitmentOne" required maxLength={1000} defaultValue={current?.commitments[0] ?? ""} placeholder="The one thing that matters most" className="mt-1 block w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-emerald-900">Second, only if useful<input name="commitmentTwo" maxLength={1000} defaultValue={current?.commitments[1] ?? ""} placeholder="A second concrete outcome" className="mt-1 block w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-emerald-900">Third, only if honest<input name="commitmentThree" maxLength={1000} defaultValue={current?.commitments[2] ?? ""} placeholder="Leave blank if two is enough" className="mt-1 block w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-emerald-900">Support or blocker<input name="supportNeeded" maxLength={3000} defaultValue={current?.supportNeeded ?? ""} placeholder="What help, decision, or resource is needed?" className="mt-1 block w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-emerald-900 lg:col-span-2">Weekly reflection<textarea name="progressNotes" maxLength={5000} defaultValue={current?.progressNotes ?? ""} placeholder="What moved, what did not, and what did you learn from doing the work?" rows={3} className="mt-1 block w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label>
      <label className="flex items-start gap-2 text-xs font-bold leading-5 text-[#765f40] lg:col-span-2"><input name="clientReviewed" type="checkbox" defaultChecked={Boolean(current?.clientReviewedAt)} className="mt-1" />I reviewed this against what actually happened. This records my reflection; it does not mark linked goals or tasks complete.</label>
      <div className="lg:col-span-2"><button type="submit" disabled={pending} className="rounded-xl bg-emerald-800 px-5 py-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{pending ? "Saving…" : current ? "Update weekly plan" : "Save weekly plan"}</button></div>
    </form>
    <p className="mt-3 text-[11px] font-semibold text-[#927b5b]">This is your Quipsly planning record. Coach review remains separate, and nothing is messaged, scheduled externally, or completed by implication.</p>
    {message && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</p>}
  </div>;
}

function formatReviewMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function WeeklyReviewCard({ review }: { review: WorkSnapshot["weeklyReviews"][number] }) {
  const healthTone = {
    moving: "border-emerald-200 bg-emerald-50 text-emerald-900",
    "needs-attention": "border-amber-200 bg-amber-50 text-amber-900",
    "no-recent-evidence": "border-stone-200 bg-stone-50 text-stone-700",
    achieved: "border-sky-200 bg-sky-50 text-sky-900",
  } as const;
  return <article className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">{review.relationship === "coach-review" ? `Coach view · ${review.subjectLabel ?? "Client"}` : "Your evidence-backed week"}</p><h3 className="mt-1 font-serif text-2xl font-black">Week of <LocalDateTime value={review.weekStartsAt} mode="date" /></h3><p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#765f40]">Quipsly summarizes saved evidence. It never guesses unrecorded work or marks a goal healthy by itself.</p></div>
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-900">{humanize(review.reviewState)}</span>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4"><p className="text-2xl font-black text-sky-950">{formatReviewMinutes(review.plannedMinutes)}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-sky-800">Planned focus</p></div>
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><p className="text-2xl font-black text-emerald-950">{formatReviewMinutes(review.actualMinutes)}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">Explicit actual time</p></div>
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><p className="text-2xl font-black text-stone-800">{review.completedBlocksWithoutActualMinutes}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-stone-600">Completed · time not recorded</p></div>
    </div>
    {review.goals.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{review.goals.map((goal) => <section key={goal.id} className="rounded-2xl border border-[#e4d3b3] bg-[#fffdf8] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><Link href={`/work?goal=${encodeURIComponent(goal.id)}`} className="min-h-11 flex-1 py-2 text-base font-black underline decoration-[#c7ad7a] decoration-2 underline-offset-4">{goal.title}</Link><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${healthTone[goal.health]}`}>{goal.healthLabel}</span></div><div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-[#765f40]"><span>{goal.progressPercent === null ? "No percentage" : `${goal.progressPercent}% reported`}</span><span>{goal.completedTaskCount}/{goal.linkedTaskCount} linked tasks done</span><span>{formatReviewMinutes(goal.actualMinutes)} actual</span></div>{goal.latestEvidence ? <p className="mt-3 rounded-xl bg-white p-3 text-xs font-semibold leading-5 text-[#5f4b32]"><strong>Latest evidence:</strong> {goal.latestEvidence}</p> : <p className="mt-3 text-xs font-semibold text-stone-600">No recent evidence receipt. Add a check-in, complete linked work, or record actual focus time.</p>}{goal.blockers.length ? <p className="mt-3 text-xs font-bold text-amber-900"><strong>Blocking:</strong> {goal.blockers.join(" · ")}</p> : null}{goal.nextTask ? <Link href={`/work?task=${encodeURIComponent(goal.nextTask.id)}`} className="mt-3 inline-flex min-h-11 items-center text-xs font-black text-violet-900 underline">Next task · {goal.nextTask.title}</Link> : null}</section>)}</div> : <p className="mt-5 rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-4 text-sm font-semibold text-stone-700">No active or recently achieved canonical goals are available for this review yet.</p>}
    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      <section><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">Blockers & support</p>{review.blockers.length ? <ul className="mt-2 space-y-2">{review.blockers.map((blocker) => <li key={blocker} className="rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">{blocker}</li>)}</ul> : <p className="mt-2 text-xs font-semibold text-[#806a4d]">No blocker is recorded.</p>}</section>
      <section><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">Next commitments</p>{review.nextCommitments.length ? <ol className="mt-2 space-y-2">{review.nextCommitments.map((item, index) => <li key={`${item.kind}:${item.id}`} className="text-xs font-bold leading-5"><span className="mr-2 text-emerald-800">{index + 1}.</span>{item.kind === "task" ? <Link href={`/work?task=${encodeURIComponent(item.id)}`} className="underline">{item.title}</Link> : item.title}</li>)}</ol> : <p className="mt-2 text-xs font-semibold text-[#806a4d]">Choose the next commitment in the weekly plan below.</p>}</section>
      <section><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">Session contribution</p>{review.sessionContributions.length ? <ul className="mt-2 space-y-2">{review.sessionContributions.map((session) => <li key={session.roomId}><Link href={`/sessions/${encodeURIComponent(session.roomId)}`} className="inline-flex min-h-11 items-center text-xs font-black text-sky-900 underline">{session.title} · {session.evidenceCount} receipt{session.evidenceCount === 1 ? "" : "s"}</Link></li>)}</ul> : <p className="mt-2 text-xs font-semibold text-[#806a4d]">No session-linked evidence landed this week.</p>}</section>
    </div>
    {review.reflection ? <p className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm font-semibold leading-6 text-emerald-950"><strong>Reflection:</strong> {review.reflection}</p> : null}
  </article>;
}

export function WorkClient({
  initialSnapshot,
  projectOptions = [],
  focusTaskId = null,
  focusGoalId = null,
  unavailableFocusKind = null,
  initialFilter = "OPEN",
  manageTags = false,
  initialProjectId = null,
}: WorkClientProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const focusedTask = focusTaskId ? initialSnapshot.tasks.find((task) => task.id === focusTaskId) : null;
  const focusedGoal = focusGoalId ? initialSnapshot.goals.find((goal) => goal.id === focusGoalId) : null;
  const [filter, setFilter] = useState<TaskFilter>(focusedTask ? focusedTask.status !== "OPEN" ? "ALL" : "OPEN" : initialFilter);
  const [focusTaskOnly, setFocusTaskOnly] = useState(Boolean(focusedTask));
  const [focusGoalOnly, setFocusGoalOnly] = useState(Boolean(focusedGoal));
  const [creating, startCreating] = useTransition();
  const [repeatCadence, setRepeatCadence] = useState<"NEVER" | "FIXED" | "COMPLETION">("NEVER");
  const [browserTimezone, setBrowserTimezone] = useState("UTC");
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [creatingGoal, startCreatingGoal] = useTransition();
  const [goalMessage, setGoalMessage] = useState<string | null>(null);
  const [taskDecisionMessage, setTaskDecisionMessage] = useState<string | null>(null);
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const goalFormRef = useRef<HTMLFormElement>(null);
  const visibleTasks = useMemo(() => {
    if (focusTaskOnly && focusTaskId) return snapshot.tasks.filter((task) => task.id === focusTaskId);
    return filter === "ALL"
      ? snapshot.tasks
      : filter === "ATTENTION"
        ? snapshot.tasks.filter((task) => task.attentionReason !== null)
        : snapshot.tasks.filter((task) => task.status === filter);
  }, [filter, focusTaskId, focusTaskOnly, snapshot.tasks]);
  const visibleGoals = useMemo(() => focusGoalOnly && focusGoalId
    ? snapshot.goals.filter((goal) => goal.id === focusGoalId)
    : snapshot.goals, [focusGoalId, focusGoalOnly, snapshot.goals]);
  const recurrenceManagerTaskIds = useMemo(() => {
    const seen = new Set<string>();
    const managers = new Set<string>();
    for (const task of snapshot.tasks) {
      if (!task.recurrence || task.status !== "OPEN" || seen.has(task.recurrence.seriesId)) continue;
      seen.add(task.recurrence.seriesId);
      managers.add(task.id);
    }
    return managers;
  }, [snapshot.tasks]);

  useEffect(() => {
    setSnapshot(initialSnapshot);
    if (focusTaskId && initialSnapshot.tasks.some((task) => task.id === focusTaskId)) setFocusTaskOnly(true);
    if (focusGoalId && initialSnapshot.goals.some((goal) => goal.id === focusGoalId)) setFocusGoalOnly(true);
  }, [focusGoalId, focusTaskId, initialSnapshot]);
  useEffect(() => setBrowserTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);
  useEffect(() => {
    const targetId = focusTaskId && focusTaskOnly ? `work-task-${focusTaskId}` : focusGoalId && focusGoalOnly ? `work-goal-${focusGoalId}` : null;
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      target?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusGoalId, focusGoalOnly, focusTaskId, focusTaskOnly, snapshot.goals, snapshot.tasks]);

  function submitNewTask(formData: FormData) {
    setCreateMessage(null);
    startCreating(async () => {
      const dueValue = String(formData.get("dueAt") || "");
      const cadence = String(formData.get("recurrenceCadence") || "NEVER");
      const result = await createWorkTask({
        title: String(formData.get("title") || ""),
        detail: String(formData.get("detail") || ""),
        dueLocal: dueValue || null,
        timezone: dueValue ? String(formData.get("timezone") || browserTimezone) : null,
        projectId: String(formData.get("projectId") || "") || null,
        recurrence: cadence === "FIXED" || cadence === "COMPLETION" ? {
          cadence,
          frequency: String(formData.get("recurrenceFrequency") || "WEEKLY") as "DAILY" | "WEEKLY" | "MONTHLY",
          interval: Number(formData.get("recurrenceInterval") || 1),
        } : null,
      });
      if (!result.ok) {
        setCreateMessage(result.error);
        return;
      }
      setCreateMessage(result.recurrenceSeriesId ? `Repeat created with ${result.occurrenceCount} canonical occurrence${result.occurrenceCount === 1 ? "" : "s"}. No reminder or provider event was scheduled.` : "Personal task created and assigned to you. Nothing was sent or scheduled elsewhere.");
      createFormRef.current?.reset();
      setRepeatCadence("NEVER");
      router.refresh();
    });
  }

  function submitNewGoal(formData: FormData) {
    setGoalMessage(null);
    startCreatingGoal(async () => {
      const targetValue = String(formData.get("targetAt") || "");
      const result = await createWorkGoal({
        title: String(formData.get("goalTitle") || ""),
        description: String(formData.get("goalDescription") || ""),
        targetAt: targetValue ? new Date(`${targetValue}T12:00:00`).toISOString() : null,
        projectId: String(formData.get("goalProjectId") || "") || null,
      });
      if (!result.ok) { setGoalMessage(result.error); return; }
      setGoalMessage("Private goal created. No tasks or calendar events were added automatically.");
      goalFormRef.current?.reset();
      router.refresh();
    });
  }

  function onTaskSaved(taskId: string, nextStatus: WorkTaskStatus, updatedAt: string, notice: string) {
    setTaskDecisionMessage(notice);
    setSnapshot((current) => {
      const tasks = current.tasks.map((task) => task.id === taskId ? {
        ...task,
        status: nextStatus,
        updatedAt,
        completedAt: nextStatus === "DONE" ? updatedAt : null,
        isOverdue: nextStatus === "OPEN" && Boolean(task.dueAt) && new Date(task.dueAt!).getTime() < Date.now(),
        attentionReason: nextStatus !== "OPEN"
          ? null
          : task.dueAt && new Date(task.dueAt).getTime() < Date.now()
            ? "Overdue commitment" as const
            : task.dueAt && new Date(task.dueAt).getTime() <= Date.now() + 24 * 60 * 60 * 1000
              ? "Due within 24 hours" as const
              : task.provenance === "Reviewed transcript timestamp" && new Date(task.createdAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000
                ? "Reviewed transcript follow-through" as const
                : null,
      } : task);
      return {
        ...current,
        tasks,
        counts: {
          ...current.counts,
          openTasks: tasks.filter((task) => task.status === "OPEN").length,
          attentionTasks: tasks.filter((task) => task.attentionReason !== null).length,
          overdueTasks: tasks.filter((task) => task.isOverdue).length,
          completedTasks: tasks.filter((task) => task.status === "DONE").length,
        },
      };
    });
  }

  const overview: Array<[string, number, LucideIcon]> = [
    ["Open tasks", snapshot.counts.openTasks, Circle],
    ["Needs attention", snapshot.counts.attentionTasks, BellRing],
    ["Overdue", snapshot.counts.overdueTasks, Flag],
    ["Completed", snapshot.counts.completedTasks, Check],
    ["Active goals", snapshot.counts.activeGoals, Target],
    ["Active commitments", snapshot.counts.activeCommitments, UsersRound],
  ];
  const activeTagCount = projectOptions.reduce(
    (count, project) => count + project.tags.filter((tag) => tag.isActive !== false).length,
    0,
  );

  if (manageTags) {
    return (
      <main className="mx-auto max-w-[1080px] space-y-6 px-2 py-2 text-[#3d3122]">
        <section className="rounded-[2rem] border border-sky-200 bg-[linear-gradient(145deg,#f7fcff,#eef8ff)] p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-800">One vocabulary per Nest</p>
              <h1 className="mt-2 font-serif text-4xl font-black tracking-tight md:text-5xl">Tags</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-sky-950">Find, rename, archive, merge, and restore reusable organizing language without crowding the task queue. Existing work keeps its canonical tag identity and historical names.</p>
            </div>
            <Link href="/work" className="inline-flex min-h-11 items-center rounded-full border border-sky-300 bg-white px-4 text-xs font-black uppercase tracking-wide text-sky-900">Back to Work</Link>
          </div>
        </section>
        <TagVocabulary projects={projectOptions} onRefresh={() => router.refresh()} expanded initialProjectId={initialProjectId} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1280px] space-y-8 px-2 py-2 text-[#3d3122]">
      <section className="overflow-hidden rounded-[2rem] border border-[#dfcba6] bg-[radial-gradient(circle_at_top_right,_#f4d799,_transparent_40%),linear-gradient(135deg,#fffaf0,#f8edda)] p-6 shadow-sm md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9a6b2f]">Follow-through, in one place</p>
        <h1 className="mt-2 font-serif text-4xl font-black tracking-tight md:text-5xl">Work Queue</h1>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-3xl text-sm font-semibold leading-6 text-[#715a3e]">Committed tasks, active session goals, and weekly coaching commitments from records you can actually access. Proposed transcript follow-ups stay out until a human accepts them.</p>
          <Link href="/work?manage=tags" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d6bf97] bg-white/80 px-4 text-[10px] font-black uppercase tracking-wide text-[#6f573b]"><Tags size={15} aria-hidden="true" />Manage {activeTagCount} tag{activeTagCount === 1 ? "" : "s"}</Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Work overview">
          {overview.map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm"><Icon className="h-5 w-5 text-[#9a6b2f]" aria-hidden="true" /><p className="mt-3 text-3xl font-black">{value}</p><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">{label}</p></div>)}
        </div>
      </section>

      {unavailableFocusKind && (
        <section
          role="alert"
          aria-label={`${humanize(unavailableFocusKind)} unavailable`}
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm"
        >
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">
            Could not open that {unavailableFocusKind}
          </p>
          <p className="mt-2 text-sm font-semibold leading-6">
            That {unavailableFocusKind} is not available to this account. It may have moved, been deleted, or belong to another Nest.
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-800">
            Your accessible Work Queue is shown below. Nothing was changed.
          </p>
        </section>
      )}

      <section aria-labelledby="weekly-review-heading">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-800">Review what actually happened</p>
        <h2 id="weekly-review-heading" className="mt-1 font-serif text-3xl font-black">Weekly review</h2>
        <div className="mt-4 grid gap-4">{snapshot.weeklyReviews.map((review) => <WeeklyReviewCard key={`${review.subjectUserId}:${review.weekStartsAt}`} review={review} />)}</div>
      </section>

      <section aria-labelledby="new-task-heading" className="rounded-3xl border border-[#dfcba6] bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-start gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-800"><ListChecks aria-hidden="true" /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Quick capture</p><h2 id="new-task-heading" className="font-serif text-2xl font-black">Add a personal task</h2><p className="mt-1 text-sm font-semibold text-[#765f40]">This explicitly assigns the new task to your signed-in account.</p></div></div>
        <form ref={createFormRef} action={submitNewTask} className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-6 xl:items-end">
          <label className="text-xs font-black uppercase tracking-wide text-[#6f573b]">Task title<input name="title" required maxLength={500} placeholder="The next concrete thing" className="mt-1 block w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf8] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#3d3122]" /></label>
          <label className="text-xs font-black uppercase tracking-wide text-[#6f573b]">Useful detail<input name="detail" maxLength={5000} placeholder="Context, definition of done, or source" className="mt-1 block w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf8] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#3d3122]" /></label>
          <label className="text-xs font-black uppercase tracking-wide text-[#6f573b]">Due {repeatCadence === "NEVER" ? "(optional)" : "(required)"}<input name="dueAt" type="datetime-local" required={repeatCadence !== "NEVER"} className="mt-1 block w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf8] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#3d3122]" /></label>
          <label className="text-xs font-black uppercase tracking-wide text-[#6f573b]">Repeat<select name="recurrenceCadence" value={repeatCadence} onChange={(event) => setRepeatCadence(event.target.value as typeof repeatCadence)} className="mt-1 block w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf8] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#3d3122]"><option value="NEVER">Does not repeat</option><option value="FIXED">Fixed schedule</option><option value="COMPLETION">After completion</option></select></label>
          <label className="text-xs font-black uppercase tracking-wide text-[#6f573b]">Nest (optional)<select name="projectId" defaultValue="" className="mt-1 block w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf8] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#3d3122]"><option value="">Personal / unfiled</option>{projectOptions.filter((project) => project.canWrite).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <button type="submit" disabled={creating} className="rounded-xl bg-[#3e2f21] px-5 py-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{creating ? "Saving…" : "Add task"}</button>
          {repeatCadence !== "NEVER" && <fieldset className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 lg:col-span-2 xl:col-span-6 xl:grid-cols-[auto_auto_minmax(16rem,1fr)] xl:items-end"><legend className="px-2 text-xs font-black uppercase tracking-wide text-violet-900">Repeat rule</legend>
            <label className="text-xs font-black uppercase tracking-wide text-violet-900">Every<input name="recurrenceInterval" type="number" min={1} max={365} defaultValue={1} required className="mt-1 block w-24 rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label>
            <label className="text-xs font-black uppercase tracking-wide text-violet-900">Unit<select name="recurrenceFrequency" defaultValue="WEEKLY" className="mt-1 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal"><option value="DAILY">Day(s)</option><option value="WEEKLY">Week(s)</option><option value="MONTHLY">Month(s)</option></select></label>
            <label className="text-xs font-black uppercase tracking-wide text-violet-900">Timezone<input name="timezone" aria-label="Timezone" aria-describedby="task-repeat-timezone-help" required value={browserTimezone} onChange={(event) => setBrowserTimezone(event.target.value)} className="mt-1 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /><span id="task-repeat-timezone-help" className="mt-1 block text-[11px] font-semibold normal-case tracking-normal text-violet-800">The wall-clock time stays in this IANA zone across daylight-saving changes.</span></label>
          </fieldset>}
        </form>
        <p className="mt-3 text-[11px] font-semibold text-[#927b5b]">Fixed schedule keeps independent dates; after completion schedules the next occurrence from when you finish. Neither mode sends a message, schedules a reminder, creates a provider calendar event, or publishes anything.</p>
        {createMessage && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{createMessage}</p>}
      </section>

      {!focusGoalOnly && <section aria-labelledby="tasks-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">{focusTaskOnly ? "Opened from its source" : "Committed work"}</p><h2 id="tasks-heading" className="mt-1 font-serif text-3xl font-black">{focusTaskOnly ? "Focused task" : "Tasks"}</h2></div>
          {focusTaskOnly ? <button type="button" onClick={() => { setFocusTaskOnly(false); setFilter("ALL"); }} className="min-h-11 rounded-full border border-[#dcc8a5] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#765f40]">Show full task queue</button> : <div className="flex rounded-full border border-[#dcc8a5] bg-white p-1" aria-label="Task filter">
            {(["ATTENTION", "OPEN", "DONE", "ALL"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-wide ${filter === value ? "bg-[#3e2f21] text-white" : "text-[#765f40]"}`}>{humanize(value)}</button>)}
          </div>}
        </div>
        {taskDecisionMessage && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{taskDecisionMessage}</p>}
        {visibleTasks.length ? <div className={focusTaskOnly ? "mt-4 max-w-4xl" : "mt-4 grid gap-4 xl:grid-cols-2"}>{visibleTasks.map((task) => <TaskCard key={task.id} task={task} focused={task.id === focusTaskId} managesRecurrence={recurrenceManagerTaskIds.has(task.id)} projectOptions={projectOptions} onSaved={onTaskSaved} onConflict={() => router.refresh()} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-8 text-sm font-semibold text-[#765f40]">{filter === "ATTENTION" ? "Nothing currently needs attention. Quipsly has not invented an unread notification state." : `No ${filter === "ALL" ? "committed" : filter.toLowerCase()} tasks are in your scoped queue.`}</div>}
      </section>}

      <section aria-labelledby="goals-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">{focusGoalOnly ? "Opened from its source" : "Durable direction"}</p><h2 id="goals-heading" className="mt-1 font-serif text-3xl font-black">{focusGoalOnly ? "Focused goal" : "Goals"}</h2></div>
          {focusGoalOnly && <button type="button" onClick={() => setFocusGoalOnly(false)} className="min-h-11 rounded-full border border-[#dcc8a5] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#765f40]">Show all goals</button>}
        </div>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">Goals have their own identity, owner, progress evidence, project/session context, and exact links to committed work.</p>
        {!focusGoalOnly && <form ref={goalFormRef} action={submitNewGoal} className="mt-4 grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-4 lg:grid-cols-[1.1fr_1.5fr_auto_auto_auto] lg:items-end"><label className="text-xs font-black uppercase tracking-wide text-violet-900">Goal title<input name="goalTitle" required maxLength={500} placeholder="What does better look like?" className="mt-1 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label><label className="text-xs font-black uppercase tracking-wide text-violet-900">Why or definition of success<input name="goalDescription" maxLength={5000} placeholder="Enough context to recognize meaningful progress" className="mt-1 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label><label className="text-xs font-black uppercase tracking-wide text-violet-900">Target (optional)<input name="targetAt" type="date" className="mt-1 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal" /></label><label className="text-xs font-black uppercase tracking-wide text-violet-900">Nest (optional)<select name="goalProjectId" defaultValue="" className="mt-1 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal"><option value="">Personal / unfiled</option>{projectOptions.filter((project) => project.canWrite).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button type="submit" disabled={creatingGoal} className="rounded-xl bg-violet-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50">{creatingGoal ? "Saving…" : "Add goal"}</button></form>}
        {goalMessage && <p role="status" className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900">{goalMessage}</p>}
        {visibleGoals.length ? <div className={focusGoalOnly ? "mt-4 max-w-4xl" : "mt-4 grid gap-4 xl:grid-cols-2"}>{visibleGoals.map((goal) => <GoalCard key={goal.id} goal={goal} focused={goal.id === focusGoalId} availableTasks={snapshot.tasks} projectOptions={projectOptions} onRefresh={() => router.refresh()} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-8 text-sm font-semibold text-[#765f40]">No canonical or legacy Session Plan goals are available to this account.</div>}
      </section>

      <section aria-labelledby="commitments-heading">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Coaching cadence</p>
        <h2 id="commitments-heading" className="mt-1 font-serif text-3xl font-black">Weekly commitments</h2>
        <WeeklyCommitmentEditor commitments={snapshot.commitments} onRefresh={() => router.refresh()} />
        {snapshot.commitments.length ? <div className="mt-4 grid gap-4 lg:grid-cols-2">{snapshot.commitments.map((commitment) => <article key={commitment.id} className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-wide text-emerald-800">Week of <LocalDateTime value={commitment.weekStartsAt} mode="date" /></p><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">{humanize(commitment.status)}</span></div><ol className="mt-4 space-y-3">{commitment.commitments.map((item, index) => <li key={`${commitment.id}-${index}`} className="flex gap-3 text-sm font-bold leading-6"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs text-emerald-800">{index + 1}</span>{item}</li>)}</ol>{commitment.supportNeeded && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900"><strong>Support needed:</strong> {commitment.supportNeeded}</p>}{commitment.progressNotes && <p className="mt-3 text-xs font-semibold leading-5 text-[#765f40]"><strong>Progress:</strong> {commitment.progressNotes}</p>}{commitment.clientReviewedAt && <p className="mt-3 text-xs font-black text-emerald-800">Client reflection recorded <LocalDateTime value={commitment.clientReviewedAt} /></p>}{commitment.coachNotes && <p className="mt-3 text-xs font-semibold leading-5 text-[#765f40]"><strong>Coach note:</strong> {commitment.coachNotes}</p>}<p className="mt-4 text-[11px] font-bold text-[#927b5b]">{commitment.clientLabel ? `Client: ${commitment.clientLabel}` : "Private weekly record"}{commitment.reviewerLabel ? ` · Reviewed by ${commitment.reviewerLabel}` : ""}</p></article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-8 text-sm font-semibold text-[#765f40]">No persisted weekly commitments are available to this account.</div>}
      </section>

      <footer className="rounded-2xl border border-[#e4d3b3] bg-[#fffaf0] p-5 text-xs font-semibold leading-5 text-[#765f40]">This view reads at most {snapshot.boundaries.taskLimit} actor-scoped tasks. It excludes unreviewed transcript candidates. Task status controls write Quipsly-only receipts and have no external side effects.</footer>
    </main>
  );
}
