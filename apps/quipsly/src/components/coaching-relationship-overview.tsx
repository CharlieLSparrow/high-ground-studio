import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MessageCircle,
  NotebookPen,
  Target,
  Video,
  type LucideIcon,
} from "lucide-react";

export type CoachingRelationshipOverviewItem = {
  nextSession: {
    id: string;
    title: string;
    startsAt: string | null;
    status: string;
  } | null;
  lastSession: {
    id: string;
    title: string;
    startsAt: string | null;
    recordingCount: number;
    transcriptStatus: string | null;
    followUpReleased: boolean;
  } | null;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    ownerLabel: string | null;
    overdue: boolean;
  }>;
  goals: Array<{
    id: string;
    title: string;
    targetAt: string | null;
    ownerLabel: string;
  }>;
  recentNotes: Array<{
    id: string;
    title: string;
    body: string;
    private: boolean;
  }>;
  openTaskCount: number;
  overdueTaskCount: number;
  activeGoalCount: number;
  sharedNoteCount: number;
  privateNoteCount: number;
};

function dateTime(value: string | null) {
  if (!value) return "Time not set";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(parsed)
    : "Time not set";
}

function date(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed)
    : null;
}

function transcriptLabel(status: string | null) {
  if (status === "COMPLETED") return "Transcript ready";
  if (["QUEUED", "RUNNING"].includes(status || ""))
    return "Transcript processing";
  if (status === "FAILED") return "Transcript needs attention";
  return "Transcript not started";
}

export function CoachingRelationshipOverview({
  overview,
  canSchedule,
}: {
  overview: CoachingRelationshipOverviewItem;
  canSchedule: boolean;
}) {
  const nextIsLive = ["OPEN", "RECORDING"].includes(
    overview.nextSession?.status || "",
  );
  const nextIsLate = overview.nextSession?.status === "PLANNED_LATE";
  const primaryHref = overview.nextSession
    ? `/sessions/${encodeURIComponent(overview.nextSession.id)}?mode=live`
    : canSchedule
      ? "/coaching#create-appointment"
      : "#relationship-conversation";
  const primaryLabel = nextIsLive
    ? "Join session"
    : overview.nextSession
      ? nextIsLate
        ? "Open session"
        : "Prepare session"
      : canSchedule
        ? "Schedule next session"
        : "Message your coach";
  const PrimaryIcon = nextIsLive
    ? Video
    : overview.nextSession || canSchedule
      ? CalendarClock
      : MessageCircle;

  return (
    <section
      aria-labelledby="relationship-overview-heading"
      className="rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-5 shadow-sm sm:p-6"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">
            {nextIsLive ? "Happening now" : "Next step"}
          </p>
          <h2
            id="relationship-overview-heading"
            className="mt-2 font-serif text-3xl font-black text-[#34291d]"
          >
            {overview.nextSession?.title ||
              (canSchedule
                ? "Keep the relationship moving"
                : "Stay connected between sessions")}
          </h2>
          {overview.nextSession ? (
            <p className="mt-2 flex items-center gap-2 text-sm font-black text-[#5f4d37]">
              <Clock3 size={16} aria-hidden="true" />
              {nextIsLate
                ? `Scheduled for ${dateTime(overview.nextSession.startsAt)} · open it or reschedule`
                : dateTime(overview.nextSession.startsAt)}
            </p>
          ) : (
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#765f40]">
              {canSchedule
                ? "Choose a time, invite your client, and Quipsly will keep the room, shared work, and follow-up together here."
                : "Use this space for shared notes, commitments, goals, and a message whenever you need to reconnect."}
            </p>
          )}
          <Link
            href={primaryHref}
            className={`mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-black text-white shadow-sm transition ${
              nextIsLive
                ? "bg-rose-700 hover:bg-rose-800"
                : "bg-violet-800 hover:bg-violet-900"
            }`}
          >
            <PrimaryIcon size={17} aria-hidden="true" /> {primaryLabel}
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["Open commitments", overview.openTaskCount, CheckCircle2],
              ["Past due", overview.overdueTaskCount, AlertCircle],
              ["Active goals", overview.activeGoalCount, Target],
              ["Shared notes", overview.sharedNoteCount, NotebookPen],
            ] satisfies Array<[string, number, LucideIcon]>
          ).map(([label, value, Icon]) => (
            <a
              key={String(label)}
              href="#relationship-work"
              className="rounded-2xl border border-[#e8dcc6] bg-white p-4 transition hover:border-violet-300"
            >
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#806747]">
                <Icon size={14} aria-hidden="true" /> {String(label)}
              </p>
              <p className="mt-2 font-serif text-3xl font-black text-[#34291d]">
                {String(value)}
              </p>
            </a>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-[#eadfc9] bg-white p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#806747]">
            <CheckCircle2 size={14} aria-hidden="true" /> Commitments to revisit
          </p>
          {overview.tasks.length ? (
            <ul className="mt-3 space-y-3">
              {overview.tasks.slice(0, 3).map((task) => (
                <li
                  key={task.id}
                  className="border-t border-[#f0e7d8] pt-3 first:border-0 first:pt-0"
                >
                  <p className="text-sm font-black text-[#3d3122]">
                    {task.title}
                  </p>
                  <p
                    className={`mt-1 text-xs font-semibold ${task.overdue ? "text-rose-800" : "text-[#806d52]"}`}
                  >
                    {task.ownerLabel || "Unassigned"}
                    {date(task.dueAt)
                      ? ` · ${task.overdue ? "Past due " : "Due "}${date(task.dueAt)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm font-semibold text-[#765f40]">
              No open commitments.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-[#eadfc9] bg-white p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#806747]">
            <Target size={14} aria-hidden="true" /> Goals in focus
          </p>
          {overview.goals.length ? (
            <ul className="mt-3 space-y-3">
              {overview.goals.slice(0, 3).map((goal) => (
                <li
                  key={goal.id}
                  className="border-t border-[#f0e7d8] pt-3 first:border-0 first:pt-0"
                >
                  <p className="text-sm font-black text-[#3d3122]">
                    {goal.title}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#806d52]">
                    {goal.ownerLabel}
                    {date(goal.targetAt)
                      ? ` · Target ${date(goal.targetAt)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm font-semibold text-[#765f40]">
              No active goals yet.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-[#eadfc9] bg-white p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#806747]">
            <NotebookPen size={14} aria-hidden="true" /> Recent context
          </p>
          {overview.recentNotes.length ? (
            <ul className="mt-3 space-y-3">
              {overview.recentNotes.slice(0, 3).map((note) => (
                <li
                  key={note.id}
                  className="border-t border-[#f0e7d8] pt-3 first:border-0 first:pt-0"
                >
                  <p className="flex items-center gap-1.5 text-sm font-black text-[#3d3122]">
                    {note.private ? (
                      <LockKeyhole
                        size={13}
                        aria-label="Only you can read this note"
                      />
                    ) : null}
                    {note.title || "Note"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#806d52]">
                    {note.body}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm font-semibold text-[#765f40]">
              No notes to carry forward yet.
            </p>
          )}
        </section>
      </div>

      {overview.lastSession ? (
        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[#eadfc9] bg-[#f8f3ea] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-[#806747]">
              Last session
            </p>
            <p className="mt-1 font-black text-[#3d3122]">
              {overview.lastSession.title}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#765f40]">
              {dateTime(overview.lastSession.startsAt)} ·{" "}
              {overview.lastSession.recordingCount
                ? `${overview.lastSession.recordingCount} recording${overview.lastSession.recordingCount === 1 ? "" : "s"}`
                : "No recording"}{" "}
              · {transcriptLabel(overview.lastSession.transcriptStatus)}
              {overview.lastSession.followUpReleased
                ? " · Follow-up shared"
                : ""}
            </p>
          </div>
          <Link
            href={`/sessions/${encodeURIComponent(overview.lastSession.id)}`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#d8c7a7] bg-white px-4 text-xs font-black uppercase tracking-wide text-[#5b472f]"
          >
            Review session <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      {overview.privateNoteCount > 0 ? (
        <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-violet-900">
          <LockKeyhole size={14} aria-hidden="true" />{" "}
          {overview.privateNoteCount} private{" "}
          {overview.privateNoteCount === 1 ? "note is" : "notes are"} visible
          only to you.
        </p>
      ) : null}
    </section>
  );
}
