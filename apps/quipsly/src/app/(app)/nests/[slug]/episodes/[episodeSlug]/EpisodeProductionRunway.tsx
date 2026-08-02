"use client";

import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { parseRecurrenceStart } from "@/lib/task-recurrence";
import type {
  EpisodeRoomMilestone,
  EpisodeRoomMilestoneAssignee,
} from "@/lib/server/episode-room-store";

const KINDS = [
  ["RESEARCH_LOCK", "Research lock"],
  ["RUN_OF_SHOW_READY", "Run of show ready"],
  ["TECH_CHECK", "Technical check"],
  ["RECORDING", "Recording"],
  ["SOURCE_UPLOAD_VERIFIED", "Source upload verified"],
  ["TRANSCRIPT_REVIEW", "Transcript review"],
  ["ROUGH_CUT", "Rough cut"],
  ["EDITORIAL_REVIEW", "Editorial review"],
  ["FINAL_APPROVAL", "Final approval"],
  ["SCHEDULED_PUBLICATION", "Scheduled publication"],
  ["RELEASE", "Release"],
  ["CLIPS_WINDOW", "Clips window"],
  ["FOLLOW_UP", "Follow-up"],
  ["CUSTOM", "Custom milestone"],
] as const;

type Kind = (typeof KINDS)[number][0];
type Status = EpisodeRoomMilestone["status"];

type Draft = {
  kind: Kind;
  title: string;
  detail: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  assigneeUserId: string;
  dependsOnMilestoneId: string;
};

const EMPTY_DRAFT: Draft = {
  kind: "RESEARCH_LOCK",
  title: "Research lock",
  detail: "",
  startsAt: "",
  endsAt: "",
  timezone: "",
  assigneeUserId: "",
  dependsOnMilestoneId: "",
};

function localInput(iso: string | null, timezone: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return "";
  }
}

function draftFromMilestone(milestone: EpisodeRoomMilestone): Draft {
  return {
    kind: milestone.kind as Kind,
    title: milestone.title,
    detail: milestone.detail || "",
    startsAt: localInput(milestone.startsAt, milestone.timezone),
    endsAt: localInput(milestone.endsAt, milestone.timezone),
    timezone: milestone.timezone,
    assigneeUserId: milestone.assignee?.id || "",
    dependsOnMilestoneId: milestone.dependsOn?.id || "",
  };
}

function statusLabel(status: Status) {
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "COMPLETED") return "Complete";
  if (status === "CANCELED") return "Canceled";
  return "Planned";
}

function statusClass(status: Status) {
  if (status === "COMPLETED") return "bg-emerald-400/15 text-emerald-200";
  if (status === "IN_PROGRESS") return "bg-sky-400/15 text-sky-200";
  if (status === "CANCELED") return "bg-rose-400/10 text-rose-200";
  return "bg-white/5 text-[#bac7bf]";
}

function iso(value: string, timezone: string) {
  return parseRecurrenceStart(value, timezone)?.dueAt.toISOString() ?? null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function milestoneDateTimeLabel(iso: string, timezone: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Date needs review";
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]));
    const month = MONTHS[Number(parts.month) - 1];
    if (!month || !parts.day || !parts.year || !parts.hour || !parts.minute) return "Date needs review";
    return `${month} ${Number(parts.day)}, ${parts.year} · ${parts.hour}:${parts.minute}`;
  } catch {
    return "Date needs review";
  }
}

export default function EpisodeProductionRunway({
  projectSlug,
  episodeSlug,
  initialMilestones,
  initialAssignees,
  canEdit,
}: {
  projectSlug: string;
  episodeSlug: string;
  initialMilestones: EpisodeRoomMilestone[];
  initialAssignees: EpisodeRoomMilestoneAssignee[];
  canEdit: boolean;
}) {
  const [milestones, setMilestones] = useState(initialMilestones);
  const [assignees, setAssignees] = useState(initialAssignees);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const active = useMemo(
    () => milestones.filter((milestone) => milestone.status !== "CANCELED"),
    [milestones],
  );
  const completedCount = active.filter((milestone) => milestone.status === "COMPLETED").length;
  const editing = editingId ? milestones.find((milestone) => milestone.id === editingId) || null : null;

  async function refresh() {
    const response = await fetch(
      `/api/nests/${encodeURIComponent(projectSlug)}/episode-milestones?episode=${encodeURIComponent(episodeSlug)}`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not refresh the episode runway.");
    setMilestones(body.milestones);
    setAssignees(body.assignees);
  }

  function acceptMutation(milestone: EpisodeRoomMilestone) {
    setMilestones((current) => {
      const next = current.some((candidate) => candidate.id === milestone.id)
        ? current.map((candidate) => candidate.id === milestone.id ? milestone : candidate)
        : [...current, milestone];
      return next.sort((left, right) =>
        left.startsAt.localeCompare(right.startsAt) || left.createdAt.localeCompare(right.createdAt));
    });
  }

  function beginCreate() {
    setEditingId(null);
    setDraft({
      ...EMPTY_DRAFT,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    setMessage("");
    setError("");
    setOpen(true);
  }

  function beginEdit(milestone: EpisodeRoomMilestone) {
    setEditingId(milestone.id);
    setDraft(draftFromMilestone(milestone));
    setMessage("");
    setError("");
    setOpen(true);
  }

  function closeForm() {
    setOpen(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const startsAt = iso(draft.startsAt, draft.timezone);
    const endsAt = draft.endsAt ? iso(draft.endsAt, draft.timezone) : null;
    if (!startsAt || (draft.endsAt && !endsAt)) {
      setError("Choose a valid milestone date and optional end.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(projectSlug)}/episode-milestones`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeSlug,
            clientRequestId: crypto.randomUUID(),
            ...(editing
              ? { milestoneId: editing.id, expectedRevision: editing.revision }
              : {}),
            kind: draft.kind,
            title: draft.title,
            detail: draft.detail || null,
            startsAt,
            endsAt,
            timezone: draft.timezone,
            assigneeUserId: draft.assigneeUserId || null,
            dependsOnMilestoneId: draft.dependsOnMilestoneId || null,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not save the milestone.");
      acceptMutation(body.milestone);
      setMessage(editing ? "Milestone revision saved. No external calendar changed." : "Milestone added to the episode runway. No external calendar changed.");
      closeForm();
      void refresh().catch(() => {
        setMessage("Milestone saved. Team dependency status will refresh on the next page load.");
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the milestone.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(milestone: EpisodeRoomMilestone, status: Status) {
    if (status === "CANCELED" && !window.confirm("Cancel this milestone? Its revision history will remain and calendar feeds will emit a cancellation.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(projectSlug)}/episode-milestones`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeSlug,
            milestoneId: milestone.id,
            expectedRevision: milestone.revision,
            clientRequestId: crypto.randomUUID(),
            status,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not update the milestone.");
      acceptMutation(body.milestone);
      setMessage(`${body.milestone.title} is now ${statusLabel(body.milestone.status).toLowerCase()}. No external calendar changed.`);
      void refresh().catch(() => {
        setMessage(`${body.milestone.title} was saved. Team dependency status will refresh on the next page load.`);
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update the milestone.");
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="episode-runway-heading"
      className="mt-5 rounded-[1.75rem] border border-[#30483d] bg-[#101b16] p-5 md:p-6"
      data-testid="episode-production-runway"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d8ad56]">Production runway</p>
          <h2 id="episode-runway-heading" className="mt-1 font-serif text-3xl font-black">Dates the whole episode can trust</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#aab9af]">
            Research, recording, edit, review, approval, and release stay canonical here. Personal focus blocks remain private. Calendar subscriptions receive scheduled rooms and these team milestones. Google milestone projection remains held until it has its own preview and confirmation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/5 px-3 py-2 text-xs font-black text-[#d5ded8]">
            {completedCount}/{active.length} complete
          </span>
          <Link
            href="/schedule"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#40584c] px-4 text-xs font-black hover:border-[#d8ad56]"
          >
            <CalendarClock size={15} /> Open Calendar
          </Link>
          {canEdit ? (
            <button
              type="button"
              onClick={beginCreate}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d8ad56] px-4 text-xs font-black text-[#172018]"
            >
              <Plus size={15} /> Add milestone
            </button>
          ) : null}
        </div>
      </div>

      {message ? <p role="status" className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 text-sm font-bold text-emerald-100">{message}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-950/50 px-4 py-3 text-sm font-bold text-rose-100">{error}</p> : null}

      {open ? (
        <form onSubmit={submit} className="mt-5 rounded-2xl border border-[#40584c] bg-[#07110d] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-serif text-xl font-black">{editing ? "Revise milestone" : "New production milestone"}</h3>
            <button type="button" onClick={closeForm} className="min-h-11 rounded-full border border-[#40584c] px-4 text-xs font-black">Close</button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-black text-[#d5ded8]">
              Milestone type
              <select
                value={draft.kind}
                onChange={(event) => {
                  const nextKind = event.target.value as Kind;
                  const priorLabel = KINDS.find(([kind]) => kind === draft.kind)?.[1] || "";
                  const nextLabel = KINDS.find(([kind]) => kind === nextKind)?.[1] || "";
                  setDraft((current) => ({ ...current, kind: nextKind, title: current.title === priorLabel ? nextLabel : current.title }));
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-[#40584c] bg-[#101b16] px-3 text-sm"
              >
                {KINDS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-black text-[#d5ded8] md:col-span-1 xl:col-span-3">
              Title
              <input required maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#40584c] bg-[#101b16] px-3 text-sm" />
            </label>
            <label className="text-xs font-black text-[#d5ded8]">
              Starts
              <input required type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#40584c] bg-[#101b16] px-3 text-sm" />
            </label>
            <label className="text-xs font-black text-[#d5ded8]">
              Optional window end
              <input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#40584c] bg-[#101b16] px-3 text-sm" />
            </label>
            <label className="text-xs font-black text-[#d5ded8]">
              Timezone
              <input aria-label="Timezone" aria-describedby="episode-milestone-timezone-help" required maxLength={100} value={draft.timezone} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#40584c] bg-[#101b16] px-3 text-sm" />
              <span id="episode-milestone-timezone-help" className="mt-1 block text-[10px] font-semibold leading-4 text-[#82958a]">IANA zone · the wall clock stays here across DST changes.</span>
            </label>
            <label className="text-xs font-black text-[#d5ded8]">
              Assigned to
              <select value={draft.assigneeUserId} onChange={(event) => setDraft((current) => ({ ...current, assigneeUserId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#40584c] bg-[#101b16] px-3 text-sm">
                <option value="">Unassigned</option>
                {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-black text-[#d5ded8]">
              Depends on
              <select value={draft.dependsOnMilestoneId} onChange={(event) => setDraft((current) => ({ ...current, dependsOnMilestoneId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[#40584c] bg-[#101b16] px-3 text-sm">
                <option value="">No prerequisite</option>
                {milestones.filter((milestone) => milestone.id !== editingId && milestone.status !== "CANCELED").map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
              </select>
            </label>
            <label className="text-xs font-black text-[#d5ded8] md:col-span-2 xl:col-span-4">
              Production context <span className="font-semibold text-[#82958a]">(never exported as private notes)</span>
              <textarea maxLength={2000} value={draft.detail} onChange={(event) => setDraft((current) => ({ ...current, detail: event.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border border-[#40584c] bg-[#101b16] px-3 py-3 text-sm leading-6" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d8ad56] px-5 text-xs font-black text-[#172018] disabled:opacity-50">
              {editing ? <Pencil size={15} /> : <Plus size={15} />}
              {busy ? "Saving…" : editing ? "Save revision" : "Add to runway"}
            </button>
            <span className="inline-flex items-center gap-2 text-xs font-bold text-[#82958a]"><LockKeyhole size={14} /> Append-only revision · no provider write</span>
          </div>
        </form>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {milestones.length ? milestones.map((milestone) => (
          <article key={milestone.id} className={`rounded-2xl border p-4 ${milestone.status === "CANCELED" ? "border-rose-400/15 bg-rose-950/10 opacity-75" : milestone.blocked ? "border-amber-300/25 bg-amber-950/10" : "border-[#30483d] bg-[#17251e]"}`} data-milestone-id={milestone.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#d8ad56]">{KINDS.find(([kind]) => kind === milestone.kind)?.[1] || milestone.kind}</p>
                <h3 className="mt-1 font-serif text-xl font-black text-[#f4eedf]">{milestone.title}</h3>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${statusClass(milestone.status)}`}>{statusLabel(milestone.status)}</span>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm font-bold text-[#d5ded8]"><Clock3 size={14} aria-hidden="true" /><time dateTime={milestone.startsAt}>{milestoneDateTimeLabel(milestone.startsAt, milestone.timezone)}</time>{milestone.endsAt ? <> – <time dateTime={milestone.endsAt}>{milestoneDateTimeLabel(milestone.endsAt, milestone.timezone)}</time></> : null}</p>
            <p className="mt-1 text-xs font-semibold text-[#82958a]">{milestone.timezone} · revision {milestone.revision}</p>
            {milestone.assignee ? <p className="mt-3 text-xs font-bold text-[#bac7bf]">Assigned to {milestone.assignee.label}</p> : <p className="mt-3 text-xs font-bold text-[#82958a]">Unassigned team milestone</p>}
            {milestone.dependsOn ? <p className={`mt-2 text-xs font-bold ${milestone.blocked ? "text-amber-200" : "text-[#91a298]"}`}>{milestone.blocked ? "Waiting on" : "Prerequisite complete"}: {milestone.dependsOn.title}</p> : null}
            {milestone.detail ? <p className="mt-3 line-clamp-3 text-xs font-semibold leading-5 text-[#aab9af]">{milestone.detail}</p> : null}
            {canEdit ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#30483d] pt-3">
                <button type="button" disabled={busy} onClick={() => beginEdit(milestone)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#40584c] px-3 text-[10px] font-black"><Pencil size={13} /> Edit</button>
                {milestone.status === "PLANNED" ? <button type="button" disabled={busy} onClick={() => void changeStatus(milestone, "IN_PROGRESS")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-sky-400/30 px-3 text-[10px] font-black text-sky-200"><CircleDashed size={13} /> Start</button> : null}
                {milestone.status !== "COMPLETED" && milestone.status !== "CANCELED" ? <button type="button" disabled={busy || milestone.blocked} title={milestone.blocked ? "Complete the prerequisite first" : undefined} onClick={() => void changeStatus(milestone, "COMPLETED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-emerald-400/30 px-3 text-[10px] font-black text-emerald-200 disabled:opacity-40"><CheckCircle2 size={13} /> Complete</button> : null}
                {milestone.status === "COMPLETED" || milestone.status === "CANCELED" ? <button type="button" disabled={busy} onClick={() => void changeStatus(milestone, "PLANNED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#40584c] px-3 text-[10px] font-black"><RotateCcw size={13} /> Reopen</button> : null}
                {milestone.status !== "CANCELED" ? <button type="button" disabled={busy} onClick={() => void changeStatus(milestone, "CANCELED")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-rose-400/25 px-3 text-[10px] font-black text-rose-200"><XCircle size={13} /> Cancel</button> : null}
              </div>
            ) : null}
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-[#40584c] p-6 lg:col-span-2 2xl:col-span-3">
            <p className="font-serif text-xl font-black">No episode milestones yet.</p>
            <p className="mt-2 text-sm font-semibold text-[#aab9af]">Add the first real production date when the team has agreed to it. Quipsly will not manufacture a template schedule.</p>
          </div>
        )}
      </div>
    </section>
  );
}
