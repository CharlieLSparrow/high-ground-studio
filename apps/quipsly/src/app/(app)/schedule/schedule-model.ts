import type { TranscriptDerivedGoalSourceAnchor, TranscriptDerivedTaskSourceAnchor } from "@high-ground/quipsly-domain/transcript-derived-task";
import type { CalendarOverview } from "@/lib/server/calendar-overview";

export type ScheduleTranscriptSourceAnchor = TranscriptDerivedTaskSourceAnchor | TranscriptDerivedGoalSourceAnchor;

export type ScheduleTag = {
  id: string;
  label: string;
  isActive: boolean;
};

export type ScheduleSession = {
  id: string;
  title: string;
  purpose: string;
  projectId: string | null;
  status: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  scheduledTimezone?: string | null;
  calendarStatus: string;
  calendarLinked: boolean;
  participantLabel: string | null;
  tags: ScheduleTag[];
};

export type ScheduleTask = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  dueAt: string | null;
  reminderAt?: string | null;
  sessionTitle: string | null;
  provenance: string;
  roomId: string | null;
  sourceAnchor: TranscriptDerivedTaskSourceAnchor | null;
  tags: ScheduleTag[];
};

export type SchedulePlanBlockStatus = "PLANNED" | "COMPLETED" | "SKIPPED" | "CANCELED";

export type SchedulePlanBlock = {
  id: string;
  targetType: "task" | "goal";
  targetId: string;
  title: string;
  targetStatus: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: SchedulePlanBlockStatus;
  completedAt: string | null;
  actualMinutes: number | null;
  updatedAt: string;
  roomId: string | null;
  sourceAnchor: ScheduleTranscriptSourceAnchor | null;
  tags: ScheduleTag[];
};

export type SchedulePlanTarget = {
  id: string;
  type: "task" | "goal";
  title: string;
  context: string;
  roomId: string | null;
  sourceAnchor: ScheduleTranscriptSourceAnchor | null;
};

export type ScheduleSnapshot =
  | {
      state: "ready";
      authState: "signed-in";
      accessibleNestCount: number;
      calendarOverview: CalendarOverview;
      calendarProjects: Array<{ id: string; name: string; canWrite: boolean }>;
      calendarFeeds: Array<{
        id: string;
        purpose: "COACHING" | "PODCAST_PRODUCTION" | "PERSONAL_COMMITMENTS";
        displayName: string;
        projectId: string | null;
        status: "ACTIVE" | "REVOKED";
        createdAt: string;
        lastGeneratedAt: string | null;
      }>;
      sessions: ScheduleSession[];
      tasks: ScheduleTask[];
      planBlocks: SchedulePlanBlock[];
      planTargets: SchedulePlanTarget[];
    }
  | {
      state: "unavailable";
      authState: "signed-in";
      message: string;
    }
  | {
      state: "signed-out";
      message: string;
    };

export function humanizeScheduleValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase().replace(/[_-]+/g, " ");
  if (!normalized) return "Not set";
  return normalized.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function formatScheduleMediaTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatScheduleDateTime(
  value: Date | string | null | undefined,
  timezone?: string | null,
) {
  if (!value) return "No date";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date needs review";
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone || "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
}

export function planBlockDurationMinutes(block: Pick<SchedulePlanBlock, "startsAt" | "endsAt">) {
  const startsAt = new Date(block.startsAt).getTime();
  const endsAt = new Date(block.endsAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
  return Math.round((endsAt - startsAt) / 60_000);
}

export function planBlockLocalInputValue(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
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

export function collapseTaskRecurrenceForCalendar<
  T extends { recurrenceOccurrence?: { seriesId: string } | null },
>(tasks: T[]) {
  const seenSeries = new Set<string>();
  return tasks.filter((task) => {
    const seriesId = task.recurrenceOccurrence?.seriesId;
    if (!seriesId) return true;
    if (seenSeries.has(seriesId)) return false;
    seenSeries.add(seriesId);
    return true;
  });
}

export function groupPlanBlocksByLocalDay(blocks: SchedulePlanBlock[], timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const groups = new Map<string, SchedulePlanBlock[]>();
  for (const block of [...blocks].sort((left, right) => left.startsAt.localeCompare(right.startsAt))) {
    const date = new Date(block.startsAt);
    if (Number.isNaN(date.getTime())) continue;
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    groups.set(key, [...(groups.get(key) ?? []), block]);
  }
  return [...groups].map(([date, dayBlocks]) => ({ date, blocks: dayBlocks }));
}
