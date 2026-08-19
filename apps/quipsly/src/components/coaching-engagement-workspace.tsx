"use client";

import { useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  CircleDot,
  LockKeyhole,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  UsersRound,
} from "lucide-react";

export type CoachingEngagementWorkEntry = {
  id: string;
  kind: "NOTE" | "TASK" | "GOAL";
  title: string | null;
  body: string | null;
  status: string | null;
  owner: { id: string; label: string } | null;
  visibility: "PRIVATE" | "SHARED";
  dueAt: string | null;
  canEdit: boolean;
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

function inputDate(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function entryIcon(kind: CoachingEngagementWorkEntry["kind"]) {
  if (kind === "NOTE") return NotebookPen;
  if (kind === "TASK") return CheckCircle2;
  return Target;
}

export function CoachingEngagementWorkspace({
  engagementId,
  initialEntries,
  members,
  currentUserId,
  canWrite,
}: {
  engagementId: string;
  initialEntries: CoachingEngagementWorkEntry[];
  members: CoachingEngagementWorkMember[];
  currentUserId: string;
  canWrite: boolean;
}) {
  const defaultOwner =
    members.find((member) => member.role === "CLIENT")?.id ||
    members.find((member) => member.id === currentUserId)?.id ||
    members[0]?.id ||
    currentUserId;
  const [entries, setEntries] = useState(initialEntries);
  const [createKind, setCreateKind] = useState<"NOTE" | "TASK" | "GOAL">(
    "NOTE",
  );
  const [createOwnerUserId, setCreateOwnerUserId] = useState(defaultOwner);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  function replaceEntry(entry: CoachingEngagementWorkEntry) {
    setEntries((current) =>
      [entry, ...current.filter((candidate) => candidate.id !== entry.id)].sort(
        (left, right) => right.updatedAt.localeCompare(left.updatedAt),
      ),
    );
  }

  async function createEntry(formData: FormData) {
    setBusyId("create");
    setNotice(null);
    try {
      const response = await fetch(
        `/api/coaching/engagements/${encodeURIComponent(engagementId)}/work`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            kind: String(formData.get("kind") || "NOTE"),
            title: String(formData.get("title") || ""),
            body: String(formData.get("body") || ""),
            ownerUserId: String(formData.get("ownerUserId") || defaultOwner),
            targetAt: String(formData.get("targetAt") || ""),
            visibility: String(formData.get("visibility") || "SHARED"),
          }),
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
      setBusyId(null);
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
    setBusyId(entry.id);
    setNotice(null);
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
            targetAt: values.targetAt ?? inputDate(entry.dueAt),
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
        throw new Error(payload.error || "The coaching work was not updated.");
      }
      replaceEntry(payload.entry);
      setNotice(`${payload.entry.title || "Item"} is up to date.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The coaching work was not updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      className="rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-6"
      aria-labelledby="engagement-work-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">
            Work between sessions
          </p>
          <h2
            id="engagement-work-heading"
            className="mt-2 font-serif text-3xl font-black text-[#3d3122]"
          >
            Notes, tasks, and goals
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">
            Keep the relationship moving without hunting through old calls.
            Shared work stays here across every Session; private notes stay with
            their author.
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
            {counts.goals} active goals
          </span>
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-bold leading-5 text-violet-950"
        >
          {notice}
        </p>
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
            action={(formData) => void createEntry(formData)}
            className="mt-4 grid gap-3"
          >
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
              disabled={busyId === "create"}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-3 text-sm font-black text-white disabled:cursor-wait disabled:opacity-50"
            >
              <Plus size={16} aria-hidden="true" />
              {busyId === "create" ? "Saving…" : "Save to coaching home"}
            </button>
          </form>
        </details>
      ) : (
        <p className="mt-5 rounded-xl border border-[#eadfc9] bg-white p-4 text-sm font-semibold text-[#765f40]">
          You can read this relationship. A coach, client, or support member can
          add shared work.
        </p>
      )}

      <div className="mt-5 grid gap-3">
        {entries.length ? (
          entries.map((entry) => {
            const Icon = entryIcon(entry.kind);
            const isActive = activeStatus(entry);
            const completedStatus = entry.kind === "TASK" ? "DONE" : "ACHIEVED";
            const reopenStatus = entry.kind === "TASK" ? "OPEN" : "ACTIVE";
            return (
              <article
                key={entry.id}
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
                  {canWrite && entry.kind !== "NOTE" ? (
                    <button
                      type="button"
                      disabled={busyId === entry.id}
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
                  <details className="mt-4 border-t border-[#eee4d1] pt-3">
                    <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-900">
                      <Pencil size={14} aria-hidden="true" /> Edit
                    </summary>
                    <form
                      action={(formData) =>
                        void updateEntry(entry, {
                          title: String(formData.get("title") || ""),
                          body: String(formData.get("body") || ""),
                          ownerUserId: String(
                            formData.get("ownerUserId") ||
                              entry.owner?.id ||
                              currentUserId,
                          ),
                          targetAt: String(formData.get("targetAt") || ""),
                          visibility: String(
                            formData.get("visibility") || entry.visibility,
                          ),
                          status: String(
                            formData.get("status") || entry.status || "",
                          ),
                        })
                      }
                      className="mt-3 grid gap-3"
                    >
                      <input
                        name="title"
                        defaultValue={entry.title || ""}
                        required
                        className="min-h-11 rounded-xl border border-[#d8c7a7] px-3 text-sm"
                        aria-label={`${entry.kind.toLowerCase()} name`}
                      />
                      <textarea
                        name="body"
                        defaultValue={entry.body || ""}
                        rows={3}
                        className="rounded-xl border border-[#d8c7a7] px-3 py-2 text-sm"
                        aria-label={`${entry.kind.toLowerCase()} details`}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        {entry.kind !== "NOTE" ? (
                          <select
                            name="ownerUserId"
                            defaultValue={entry.owner?.id || defaultOwner}
                            className="min-h-11 rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm"
                            aria-label="Owner"
                          >
                            {members.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            name="visibility"
                            defaultValue={entry.visibility}
                            className="min-h-11 rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm"
                            aria-label="Note privacy"
                          >
                            <option value="SHARED">Shared</option>
                            <option value="PRIVATE">Only me</option>
                          </select>
                        )}
                        {entry.kind !== "NOTE" ? (
                          <input
                            name="targetAt"
                            type="date"
                            defaultValue={inputDate(entry.dueAt)}
                            className="min-h-11 rounded-xl border border-[#d8c7a7] px-3 text-sm"
                            aria-label="Target date"
                          />
                        ) : null}
                      </div>
                      {entry.kind !== "NOTE" ? (
                        <input
                          type="hidden"
                          name="status"
                          value={entry.status || ""}
                        />
                      ) : null}
                      <button
                        type="submit"
                        disabled={busyId === entry.id}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
                      >
                        <Check size={15} aria-hidden="true" /> Save changes
                      </button>
                    </form>
                  </details>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white p-6 text-center">
            <CircleDot className="mx-auto text-violet-700" aria-hidden="true" />
            <p className="mt-3 font-black text-[#3d3122]">
              Nothing to chase down yet.
            </p>
            <p className="mt-1 text-sm text-[#765f40]">
              Add the first note, task, or goal above. It will still be here for
              the next Session.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
