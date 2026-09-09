"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import type { CoachingEngagementWorkEntry, CoachingEngagementWorkMember } from "./coaching-engagement-workspace";
import { WorkTagPicker, type WorkTagOption } from "./work-tag-picker";

export type CoachingWorkEdit = {
  title: string;
  body: string;
  ownerUserId: string;
  targetAt: string;
  visibility: string;
  status: string;
  tags: WorkTagOption[];
};

const fieldLabels: Record<keyof CoachingWorkEdit, string> = {
  title: "name", body: "details", ownerUserId: "owner", targetAt: "target date",
  visibility: "privacy", status: "status", tags: "tags",
};

export function workEditValues(entry: CoachingEngagementWorkEntry): CoachingWorkEdit {
  return {
    title: entry.title ?? "", body: entry.body ?? "", ownerUserId: entry.owner?.id ?? "",
    targetAt: entry.dueAt ?? "", visibility: entry.visibility, status: entry.status ?? "",
    tags: (entry.tags ?? []).map(tag => ({ ...tag, hexColor: tag.hexColor ?? null, isActive: tag.isActive !== false })),
  };
}

/** Carry only the fields the person changed onto the latest server version. */
export function mergeCoachingWorkEdits(base: CoachingWorkEdit, draft: CoachingWorkEdit, latest: CoachingWorkEdit) {
  const values = {...latest};
  const conflicts: Array<keyof CoachingWorkEdit> = [];
  for (const key of Object.keys(fieldLabels) as Array<keyof CoachingWorkEdit>) {
    if (key === "tags") {
      const identity = (tags: WorkTagOption[]) => JSON.stringify(tags.map(tag => tag.id).sort());
      if (identity(draft.tags) !== identity(base.tags)) {
        if (identity(latest.tags) !== identity(base.tags) && identity(latest.tags) !== identity(draft.tags)) conflicts.push(key);
        values.tags = draft.tags;
      }
      continue;
    }
    if (draft[key] === base[key]) continue;
    if (latest[key] !== base[key] && latest[key] !== draft[key]) conflicts.push(key);
    values[key] = draft[key];
  }
  return {values, conflicts};
}

export function CoachingWorkEditor({entry, engagementId, members, busy, onSave}: {
  entry: CoachingEngagementWorkEntry;
  engagementId?: string;
  members: CoachingEngagementWorkMember[];
  busy: boolean;
  onSave: (entry: CoachingEngagementWorkEntry, values: CoachingWorkEdit) => Promise<CoachingEngagementWorkEntry | null>;
}) {
  const [base, setBase] = useState(entry);
  const [draft, setDraft] = useState(() => workEditValues(entry));
  const [dirty, setDirty] = useState(false);
  const [conflicts, setConflicts] = useState<Array<keyof CoachingWorkEdit>>([]);
  const details = useRef<HTMLDetailsElement>(null);
  const saving = useRef(false);
  const [tagPending, setTagPending] = useState(false);

  useEffect(() => {
    if (dirty || saving.current) return;
    setBase(entry);
    setDraft(workEditValues(entry));
    setConflicts([]);
  }, [entry, dirty]);

  function change<K extends keyof CoachingWorkEdit>(key: K, value: CoachingWorkEdit[K]) {
    setDirty(true);
    setDraft((current) => ({...current, [key]: value}));
    setConflicts([]);
  }

  function useLatest(close = false) {
    setBase(entry);
    setDraft(workEditValues(entry));
    setDirty(false);
    setConflicts([]);
    if (close && details.current) details.current.open = false;
  }

  async function save(keepMyChanges = false) {
    if (busy || tagPending || saving.current) return;
    const merged = mergeCoachingWorkEdits(workEditValues(base), draft, workEditValues(entry));
    if (merged.conflicts.length && !keepMyChanges) {
      setConflicts(merged.conflicts);
      return;
    }
    saving.current = true;
    try {
      const saved = await onSave(entry, merged.values);
      if (!saved) return;
      setBase(saved);
      setDraft(workEditValues(saved));
      setDirty(false);
      setConflicts([]);
    } finally {
      saving.current = false;
    }
  }

  return (
    <details ref={details}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-wide text-[#41624b]">
        <Pencil size={14} aria-hidden="true" /> Edit
      </summary>
      <form onSubmit={(event) => {event.preventDefault(); void save();}} className="mt-3 grid gap-3">
        {dirty && base.updatedAt !== entry.updatedAt && !conflicts.length ? (
          <p role="status" className="text-sm text-[#765f40]">Updated elsewhere. Your draft is still here; saving keeps changes to other fields.</p>
        ) : null}
        {conflicts.length ? (
          <div role="alert" className="rounded-xl border border-[#d8c7a7] bg-[#fffaf1] p-3 text-sm text-[#3d3122]">
            <p>The {conflicts.map((key) => fieldLabels[key]).join(" and ")} changed elsewhere too. The latest version is shown above; your draft is below.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void save(true)} className="min-h-11 rounded-lg bg-[#41624b] px-3 font-bold text-white">Save my changes</button>
              <button type="button" disabled={busy} onClick={() => useLatest()} className="min-h-11 rounded-lg border border-[#d8c7a7] px-3 font-bold">Use latest version</button>
            </div>
          </div>
        ) : null}
        <fieldset disabled={busy || tagPending} className="min-w-0 grid gap-3">
          <input name="title" value={draft.title} onChange={(event) => change("title", event.target.value)} required maxLength={500}
            className="min-h-11 rounded-xl border border-[#d8c7a7] px-3 text-sm" aria-label={`${entry.kind.toLowerCase()} name`} />
          <textarea name="body" value={draft.body} onChange={(event) => change("body", event.target.value)} rows={3} maxLength={20_000}
            className="rounded-xl border border-[#d8c7a7] px-3 py-2 text-sm" aria-label={`${entry.kind.toLowerCase()} details`} />
          <div className="grid gap-3 sm:grid-cols-2">
            {entry.kind !== "NOTE" ? (
              <select name="ownerUserId" value={draft.ownerUserId} onChange={(event) => change("ownerUserId", event.target.value)}
                className="min-h-11 rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm" aria-label="Owner">
                {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
              </select>
            ) : entry.canChangeVisibility ? (
              <select name="visibility" value={draft.visibility} onChange={(event) => change("visibility", event.target.value)}
                className="min-h-11 rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm" aria-label="Note privacy">
                <option value="SHARED">Shared</option><option value="PRIVATE">Only me</option>
              </select>
            ) : null}
            {entry.kind !== "NOTE" ? (
              <input name="targetAt" type="date" value={draft.targetAt.slice(0, 10)}
                onChange={(event) => change("targetAt", event.target.value === base.dueAt?.slice(0, 10) ? base.dueAt ?? "" : event.target.value)}
                className="min-h-11 rounded-xl border border-[#d8c7a7] px-3 text-sm" aria-label={entry.kind === "TASK" ? "Due date" : "Target date"} />
            ) : null}
          </div>
          {entry.kind !== "NOTE" && engagementId && <WorkTagPicker entityKind={entry.kind === "GOAL" ? "goal" : "task"} entityId={entry.id}
            selected={draft.tags} onChange={tags => change("tags", tags)} disabled={busy} onPendingChange={setTagPending} />}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#41624b] px-4 py-2 text-sm font-black text-white disabled:opacity-50">
              <Check size={15} aria-hidden="true" /> {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => useLatest(true)} className="min-h-11 rounded-xl px-4 py-2 text-sm font-bold text-[#765f40]">Cancel</button>
          </div>
        </fieldset>
      </form>
    </details>
  );
}
