"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  CircleDot,
  LockKeyhole,
  NotebookPen,
  Plus,
  RefreshCw,
  RotateCcw,
  Target,
  Trash2,
  UsersRound,
} from "lucide-react";
import { CoachingWorkEditor } from "./coaching-work-editor";

export type CoachingEngagementWorkEntry = {
  id: string;
  kind: "NOTE" | "TASK" | "GOAL";
  title: string | null;
  body: string | null;
  sourceHref?: string | null;
  status: string | null;
  owner: { id: string; label: string } | null;
  visibility: "PRIVATE" | "SHARED";
  dueAt: string | null;
  canEdit: boolean;
  canChangeVisibility?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CoachingEngagementWorkMember = {
  id: string;
  label: string;
  role: string;
};

function activeStatus(entry: CoachingEngagementWorkEntry) {
  return entry.kind === "TASK"
    ? entry.status === "OPEN"
    : entry.kind === "GOAL"
      ? ["ACTIVE", "PAUSED"].includes(entry.status || "")
      : true;
}

function statusLabel(value: string | null) {
  return (value || "saved").toLowerCase().replaceAll("_", " ");
}

function entryIcon(kind: CoachingEngagementWorkEntry["kind"]) {
  if (kind === "NOTE") return NotebookPen;
  if (kind === "TASK") return CheckCircle2;
  return Target;
}

type CoachingEngagementWorkspaceProps = {
  engagementId: string;
  initialEntries: CoachingEngagementWorkEntry[];
  members: CoachingEngagementWorkMember[];
  currentUserId: string;
  canWrite: boolean;
};

export function CoachingEngagementWorkspace(
  props: CoachingEngagementWorkspaceProps,
) {
  return (
    <CoachingEngagementWorkspaceContent
      key={JSON.stringify([props.engagementId, props.currentUserId])}
      {...props}
    />
  );
}

function CoachingEngagementWorkspaceContent({
  engagementId,
  initialEntries,
  members: initialMembers,
  currentUserId,
  canWrite: initialCanWrite,
}: CoachingEngagementWorkspaceProps) {
  const [members, setMembers] = useState(initialMembers);
  const [canWrite, setCanWrite] = useState(initialCanWrite);
  const [accessUnavailable, setAccessUnavailable] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshController = useRef<AbortController | null>(null);
  const mutationRevision = useRef(0);
  const workspace = useRef<HTMLElement>(null);
  const defaultOwner =
    members.find((member) => member.role === "CLIENT")?.id ||
    members.find((member) => member.id === currentUserId)?.id ||
    members[0]?.id ||
    currentUserId;
  const [entries, setEntries] = useState(initialEntries);
  const [workFilter, setWorkFilter] = useState<
    "ALL" | CoachingEngagementWorkEntry["kind"]
  >("ALL");
  const [createKind, setCreateKind] = useState<"NOTE" | "TASK" | "GOAL">(
    "NOTE",
  );
  const [createOwnerUserId, setCreateOwnerUserId] = useState(defaultOwner);
  const pendingIds = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const createRequest = useRef<{ fingerprint: string; body: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{
    entry: CoachingEngagementWorkEntry;
    removalUpdatedAt: string;
  } | null>(null);
  const createForm = useRef<HTMLFormElement>(null);
  const counts = useMemo(
    () => ({
      notes: entries.filter((entry) => entry.kind === "NOTE").length,
      tasks: entries.filter(
        (entry) => entry.kind === "TASK" && entry.status === "OPEN",
      ).length,
      goals: entries.filter(
        (entry) => entry.kind === "GOAL" && activeStatus(entry),
      ).length,
    }),
    [entries],
  );
  const visibleEntries = entries.filter(
    (entry) => workFilter === "ALL" || entry.kind === workFilter,
  );

  const refreshEntries = useCallback(async () => {
    if (refreshController.current || pendingIds.current.size) return;
    const controller = new AbortController();
    refreshController.current = controller;
    const revision = mutationRevision.current;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setRefreshing(true);
    try {
      const response = await fetch(`/api/coaching/engagements/${encodeURIComponent(engagementId)}/work`, {
        cache: "no-store", signal: controller.signal,
      });
      if (refreshController.current !== controller) return;
      if ([401, 403, 404].includes(response.status)) {
        setAccessUnavailable(true);
        setEntries([]);
        setNotice(null);
        setLastRemoved(null);
        return;
      }
      const payload = await response.json().catch(() => null);
      if (refreshController.current !== controller) return;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.engagement?.entries) || !Array.isArray(payload.engagement?.members)) throw new Error("Read unavailable");
      if (payload.engagement.id !== engagementId || payload.engagement.currentUserId !== currentUserId) {
        setAccessUnavailable(true);
        setEntries([]);
        setNotice(null);
        setLastRemoved(null);
        return;
      }
      // A snapshot requested before a local save must not put the old item
      // back, undo a completion, or resurrect something just removed.
      if (mutationRevision.current !== revision) return;
      setEntries(payload.engagement.entries);
      setMembers(payload.engagement.members);
      setCanWrite(payload.engagement.canWrite === true);
      setAccessUnavailable(false);
      setRefreshError(null);
    } catch {
      if (refreshController.current === controller) {
        setRefreshError("Updates paused. Your loaded work is still here. Try refreshing when you’re connected.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (refreshController.current === controller) {
        refreshController.current = null;
        setRefreshing(false);
      }
    }
  }, [engagementId, currentUserId]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !workspace.current?.closest("[hidden]")) {
        void refreshEntries();
      }
    };
    const interval = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      const controller = refreshController.current;
      refreshController.current = null;
      controller?.abort();
    };
  }, [refreshEntries]);

  function replaceEntry(entry: CoachingEngagementWorkEntry) {
    setEntries((current) =>
      [entry, ...current.filter((candidate) => candidate.id !== entry.id)].sort(
        (left, right) => right.updatedAt.localeCompare(left.updatedAt),
      ),
    );
  }

  function beginOperation(id: string) {
    if (pendingIds.current.has(id)) return false;
    mutationRevision.current += 1;
    pendingIds.current.add(id);
    setBusyIds(new Set(pendingIds.current));
    return true;
  }

  function endOperation(id: string) {
    mutationRevision.current += 1;
    pendingIds.current.delete(id);
    setBusyIds(new Set(pendingIds.current));
  }

  async function createEntry(formData: FormData) {
    if (!beginOperation("create")) return;
    setNotice(null);
    setLastRemoved(null);
    try {
      const values = {
        kind: String(formData.get("kind") || "NOTE"),
        title: String(formData.get("title") || ""),
        body: String(formData.get("body") || ""),
        ownerUserId: String(formData.get("ownerUserId") || defaultOwner),
        targetAt: String(formData.get("targetAt") || ""),
        visibility: String(formData.get("visibility") || "SHARED"),
      };
      const fingerprint = JSON.stringify(values);
      // A lost response does not mean the server failed to save. Retry the
      // same draft with its original identity; a changed draft is new work.
      if (createRequest.current?.fingerprint !== fingerprint) {
        createRequest.current = {
          fingerprint,
          body: JSON.stringify({ clientRequestId: crypto.randomUUID(), ...values }),
        };
      }
      const response = await fetch(
        `/api/coaching/engagements/${encodeURIComponent(engagementId)}/work`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: createRequest.current.body,
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        entry?: CoachingEngagementWorkEntry;
      };
      if (!response.ok || !payload.ok || !payload.entry) {
        throw new Error(payload.error || "The coaching work was not saved.");
      }
      replaceEntry(payload.entry);
      const savedKind = payload.entry.kind;
      setWorkFilter((current) => current === "ALL" ? current : savedKind);
      createRequest.current = null;
      createForm.current?.reset();
      const itemLabel =
        payload.entry.kind === "NOTE"
          ? "Note"
          : payload.entry.kind === "TASK"
            ? "Task"
            : "Goal";
      setNotice(
        payload.entry.visibility === "PRIVATE"
          ? `${itemLabel} saved. Only you can read this private note.`
          : `${itemLabel} saved. Everyone in this coaching relationship can find it here.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The coaching work was not saved.",
      );
    } finally {
      endOperation("create");
    }
  }

  async function updateEntry(
    entry: CoachingEngagementWorkEntry,
    values: {
      title?: string;
      body?: string;
      ownerUserId?: string;
      targetAt?: string;
      visibility?: string;
      status?: string;
    },
  ) {
    if (!beginOperation(entry.id)) return null;
    let needsRefresh = false;
    setNotice(null);
    setLastRemoved(null);
    try {
      const response = await fetch(
        `/api/coaching/engagements/${encodeURIComponent(engagementId)}/work`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: entry.id,
            kind: entry.kind,
            title: values.title ?? entry.title ?? "",
            body: values.body ?? entry.body ?? "",
            ownerUserId: values.ownerUserId ?? entry.owner?.id ?? currentUserId,
            targetAt: values.targetAt ?? entry.dueAt ?? "",
            visibility: values.visibility ?? entry.visibility,
            status: values.status ?? entry.status,
            expectedUpdatedAt: entry.updatedAt,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        entry?: CoachingEngagementWorkEntry;
      };
      if (!response.ok || !payload.ok || !payload.entry) {
        needsRefresh = [401, 403, 404, 409].includes(response.status);
        throw new Error(payload.error || "The coaching work was not updated.");
      }
      replaceEntry(payload.entry);
      setNotice(`${payload.entry.title || "Item"} is up to date.`);
      return payload.entry;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The coaching work was not updated.",
      );
      return null;
    } finally {
      endOperation(entry.id);
      if (needsRefresh) void refreshEntries();
    }
  }

  async function removeEntry(entry: CoachingEngagementWorkEntry) {
    if (!beginOperation(entry.id)) return;
    setNotice(null);
    try {
      const response = await fetch(
        `/api/coaching/engagements/${encodeURIComponent(engagementId)}/work`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: entry.id,
            kind: entry.kind,
            expectedUpdatedAt: entry.updatedAt,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        removal?: { updatedAt: string };
      };
      if (!response.ok || !payload.ok || !payload.removal) {
        throw new Error(payload.error || "The item was not removed.");
      }
      setEntries((current) =>
        current.filter((candidate) => candidate.id !== entry.id),
      );
      setLastRemoved({
        entry,
        removalUpdatedAt: payload.removal.updatedAt,
      });
      setNotice(`${entry.title || "Item"} removed.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The item was not removed.",
      );
    } finally {
      endOperation(entry.id);
    }
  }

  async function restoreLastRemoved() {
    if (!lastRemoved || !beginOperation(lastRemoved.entry.id)) return;
    try {
      const response = await fetch(
        `/api/coaching/engagements/${encodeURIComponent(engagementId)}/work`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: lastRemoved.entry.id,
            kind: lastRemoved.entry.kind,
            expectedUpdatedAt: lastRemoved.removalUpdatedAt,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        entry?: CoachingEngagementWorkEntry;
      };
      if (!response.ok || !payload.ok || !payload.entry) {
        throw new Error(payload.error || "The item was not restored.");
      }
      replaceEntry(payload.entry);
      setLastRemoved(null);
      setNotice(`${payload.entry.title || "Item"} restored.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The item was not restored.",
      );
    } finally {
      endOperation(lastRemoved.entry.id);
    }
  }

  if (accessUnavailable) {
    return (
      <section ref={workspace} id="relationship-work" className="rounded-2xl border border-[#dfcfb4] bg-[#fffdf8] p-5">
        <p role="alert" className="text-[#3d3122]">This space is no longer available with your current sign-in.</p>
        <Link href="/coaching/engagements" className="mt-3 inline-flex min-h-11 items-center font-bold text-[#41624b] underline">Open my coaching spaces</Link>
      </section>
    );
  }

  return (
    <section
      ref={workspace}
      id="relationship-work"
      className="min-w-0 rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-4 sm:p-6"
      aria-labelledby="engagement-work-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="engagement-work-heading"
            className="font-serif text-2xl font-bold text-[#3d3122]"
          >
            Notes, tasks, and goals
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">
            Shared notes and next steps. Choose “Only me” for a private note.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
          <span className="rounded-full bg-orange-100 px-3 py-1.5 text-orange-900">
            {counts.notes} notes
          </span>
          <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sky-900">
            {counts.tasks} open tasks
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-900">
            {counts.goals} active {counts.goals === 1 ? "goal" : "goals"}
          </span>
        </div>
      </div>

      {refreshError ? <p role="status" className="mt-3 max-w-xl text-sm text-[#765f40]">{refreshError}</p> : null}

      <div className="mt-4 flex items-center gap-2">
      <div role="group" aria-label="Filter work" className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-xl bg-[#f1eadb] p-1">
        {([
          ["ALL", "All"], ["NOTE", "Notes"], ["TASK", "Tasks"], ["GOAL", "Goals"],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={workFilter === value}
            onClick={() => setWorkFilter(value)}
            className={`min-h-11 rounded-lg px-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#41624b] ${workFilter === value ? "bg-[#41624b] text-white shadow-sm" : "text-[#5e503c] hover:bg-[#e6dcc7]"}`}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => void refreshEntries()} disabled={refreshing || busyIds.size > 0}
        aria-label={refreshing ? "Refreshing work" : "Refresh work"} title="Refresh work"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[#41624b] disabled:opacity-50">
        <RefreshCw size={18} aria-hidden="true" className={refreshing ? "animate-spin" : ""} />
      </button>
      </div>

      {notice ? (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-bold leading-5 text-violet-950"
        >
          <span>{notice}</span>
          {lastRemoved ? (
            <button
              type="button"
              disabled={busyIds.has(lastRemoved.entry.id)}
              onClick={() => void restoreLastRemoved()}
              className="inline-flex min-h-9 items-center gap-2 rounded-full bg-violet-800 px-4 text-xs font-black text-white disabled:opacity-50"
            >
              <RotateCcw size={14} aria-hidden="true" /> Undo
            </button>
          ) : null}
        </div>
      ) : null}

      {canWrite ? (
        <details
          className="mt-5 rounded-2xl border border-violet-200 bg-white p-4"
          open={entries.length === 0}
        >
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-black text-violet-950">
            <Plus size={17} aria-hidden="true" /> Add note, task, or goal
          </summary>
          <form
            ref={createForm}
            onSubmit={(event) => {
              event.preventDefault();
              void createEntry(new FormData(event.currentTarget));
            }}
            className="mt-4 grid gap-3"
          >
            <fieldset disabled={busyIds.has("create")} className="min-w-0 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">
                Type
                <select
                  name="kind"
                  value={createKind}
                  onChange={(event) =>
                    setCreateKind(
                      event.target.value as "NOTE" | "TASK" | "GOAL",
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm normal-case tracking-normal text-[#3d3122]"
                >
                  <option value="NOTE">Note</option>
                  <option value="TASK">Task</option>
                  <option value="GOAL">Goal</option>
                </select>
              </label>
              {createKind === "NOTE" ? (
                <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">
                  Who can read it?
                  <select
                    name="visibility"
                    defaultValue="SHARED"
                    className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm normal-case tracking-normal text-[#3d3122]"
                  >
                    <option value="SHARED">
                      Everyone in this relationship
                    </option>
                    <option value="PRIVATE">Only me</option>
                  </select>
                </label>
              ) : (
                <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">
                  Who owns it?
                  <select
                    name="ownerUserId"
                    value={createOwnerUserId}
                    onChange={(event) =>
                      setCreateOwnerUserId(event.target.value)
                    }
                    className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm normal-case tracking-normal text-[#3d3122]"
                  >
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.label} · {member.role.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">
              Name
              <input
                name="title"
                required
                maxLength={500}
                placeholder="What should we remember or do?"
                className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] px-3 text-sm normal-case tracking-normal text-[#3d3122]"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">
              Details
              <textarea
                name="body"
                rows={3}
                maxLength={20_000}
                placeholder="Add the useful context."
                className="mt-1 w-full rounded-xl border border-[#d8c7a7] px-3 py-2 text-sm normal-case tracking-normal text-[#3d3122]"
              />
            </label>
            {createKind !== "NOTE" ? (
              <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">
                Target date
                <input
                  name="targetAt"
                  type="date"
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] px-3 text-sm normal-case tracking-normal text-[#3d3122]"
                />
                <span className="mt-1 block text-[11px] normal-case tracking-normal">
                  Optional. You can add or change it later.
                </span>
              </label>
            ) : null}
            <button
              type="submit"
              disabled={busyIds.has("create")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-3 text-sm font-black text-white disabled:cursor-wait disabled:opacity-50"
            >
              <Plus size={16} aria-hidden="true" />
              {busyIds.has("create") ? "Saving…" : "Save to coaching home"}
            </button>
            </fieldset>
          </form>
        </details>
      ) : (
        <p className="mt-5 rounded-xl border border-[#eadfc9] bg-white p-4 text-sm font-semibold text-[#765f40]">
          You can read this relationship. A coach, client, or support member can
          add shared work.
        </p>
      )}

      <div className="mt-5 grid gap-3">
        {entries.map((entry) => {
            const Icon = entryIcon(entry.kind);
            const isActive = activeStatus(entry);
            const completedStatus = entry.kind === "TASK" ? "DONE" : "ACHIEVED";
            const reopenStatus = entry.kind === "TASK" ? "OPEN" : "ACTIVE";
            return (
              <article
                key={entry.id}
                data-work-id={entry.id}
                hidden={workFilter !== "ALL" && entry.kind !== workFilter}
                className={`rounded-2xl border bg-white p-4 ${isActive ? "border-[#eadfc9]" : "border-emerald-200 opacity-80"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#80694a]">
                      <Icon size={15} aria-hidden="true" />{" "}
                      {entry.kind.toLowerCase()}
                      {entry.visibility === "PRIVATE" ? (
                        <span className="inline-flex items-center gap-1 text-violet-800">
                          <LockKeyhole size={12} aria-hidden="true" /> only me
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-800">
                          <UsersRound size={12} aria-hidden="true" /> shared
                        </span>
                      )}
                    </p>
                    <h3 className="mt-1 text-lg font-black text-[#3d3122]">
                      {entry.title || "Untitled note"}
                    </h3>
                    {entry.body ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#765f40]">
                        {entry.body}
                      </p>
                    ) : null}
                    {entry.sourceHref ? (
                      <Link
                        href={entry.sourceHref}
                        className="mt-2 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-bold text-[#41624b] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        aria-label={`From recording: ${entry.title || "Untitled note"}`}
                      >
                        From recording
                      </Link>
                    ) : null}
                    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[#8a7354]">
                      {entry.owner ? <span>{entry.owner.label}</span> : null}
                      {entry.status ? (
                        <span>{statusLabel(entry.status)}</span>
                      ) : null}
                      {entry.dueAt ? (
                        <span>
                          Target{" "}
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                          }).format(new Date(entry.dueAt))}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {canWrite && entry.canEdit && entry.kind !== "NOTE" ? (
                    <button
                      type="button"
                      disabled={busyIds.has(entry.id)}
                      onClick={() =>
                        void updateEntry(entry, {
                          status: isActive ? completedStatus : reopenStatus,
                        })
                      }
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-300 px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-900 disabled:opacity-50"
                    >
                      {isActive ? <Check size={15} /> : <RotateCcw size={15} />}
                      {isActive
                        ? entry.kind === "TASK"
                          ? "Complete"
                          : "Achieve"
                        : "Reopen"}
                    </button>
                  ) : null}
                </div>
                {canWrite && entry.canEdit ? (
                  <div className="mt-4 border-t border-[#eee4d1] pt-3">
                    <CoachingWorkEditor
                      entry={entry}
                      members={members}
                      busy={busyIds.has(entry.id)}
                      onSave={updateEntry}
                    />
                    <button
                      type="button"
                      disabled={busyIds.has(entry.id)}
                      onClick={() => void removeEntry(entry)}
                      className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-black text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 size={14} aria-hidden="true" /> Remove
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        {visibleEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white p-6 text-center">
            <CircleDot className="mx-auto text-violet-700" aria-hidden="true" />
            <p className="mt-3 font-black text-[#3d3122]">
              {workFilter === "ALL" ? "Nothing to chase down yet." : `No ${workFilter === "NOTE" ? "notes" : workFilter === "TASK" ? "tasks" : "goals"} yet.`}
            </p>
            <p className="mt-1 text-sm text-[#765f40]">
              {canWrite
                ? "Add a note, task, or goal above. It will still be here for the next session."
                : "Shared work will appear here when someone in this space adds it."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
