import { Temporal } from "@js-temporal/polyfill";

export type TaskRecurrenceCadence = "FIXED" | "COMPLETION";
export type TaskRecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export type TaskRecurrenceRule = {
  cadence: TaskRecurrenceCadence;
  frequency: TaskRecurrenceFrequency;
  interval: number;
  timezone: string;
  localTimeMinutes: number;
  anchorLocalDate: string;
  anchorDayOfMonth: number;
};

export type TaskOccurrencePlan = {
  occurrenceKey: string;
  scheduledLocalDate: string;
  scheduledFor: Date;
  requestedLocalDateTime: string;
  resolvedLocalDateTime: string;
  dstResolution: "exact" | "shifted";
};

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function parseRecurrenceStart(localDateTime: string, timezone: string) {
  const match = LOCAL_DATE_TIME.exec(localDateTime);
  if (!match || !isIanaTimeZone(timezone)) return null;
  const [, year, month, day, hour, minute] = match;
  try {
    const plain = Temporal.PlainDateTime.from({
      year: Number(year), month: Number(month), day: Number(day),
      hour: Number(hour), minute: Number(minute),
    }, { overflow: "reject" });
    const zoned = plain.toZonedDateTime(timezone, { disambiguation: "compatible" });
    return {
      timezone,
      localTimeMinutes: plain.hour * 60 + plain.minute,
      anchorLocalDate: plain.toPlainDate().toString(),
      anchorDayOfMonth: plain.day,
      dueAt: new Date(zoned.epochMilliseconds),
      requestedLocalDateTime: plain.toString({ smallestUnit: "minute" }),
      resolvedLocalDateTime: zoned.toPlainDateTime().toString({ smallestUnit: "minute" }),
      dstResolution: plain.equals(zoned.toPlainDateTime()) ? "exact" as const : "shifted" as const,
    };
  } catch {
    return null;
  }
}

function localTime(rule: Pick<TaskRecurrenceRule, "localTimeMinutes">) {
  if (!Number.isInteger(rule.localTimeMinutes) || rule.localTimeMinutes < 0 || rule.localTimeMinutes > 1439) {
    throw new RangeError("localTimeMinutes must be a whole minute from 0 through 1439");
  }
  return {
    hour: Math.floor(rule.localTimeMinutes / 60),
    minute: rule.localTimeMinutes % 60,
  };
}

export function validateTaskRecurrenceRule(rule: TaskRecurrenceRule) {
  if (!isIanaTimeZone(rule.timezone)) return false;
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 365) return false;
  if (!Number.isInteger(rule.localTimeMinutes) || rule.localTimeMinutes < 0 || rule.localTimeMinutes > 1439) return false;
  if (!Number.isInteger(rule.anchorDayOfMonth) || rule.anchorDayOfMonth < 1 || rule.anchorDayOfMonth > 31) return false;
  try {
    Temporal.PlainDate.from(rule.anchorLocalDate);
    return true;
  } catch {
    return false;
  }
}

export function nextRecurrenceLocalDate(
  currentLocalDate: string,
  rule: Pick<TaskRecurrenceRule, "frequency" | "interval" | "anchorDayOfMonth">,
) {
  const current = Temporal.PlainDate.from(currentLocalDate);
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 365) throw new RangeError("Invalid recurrence interval");
  if (rule.frequency === "DAILY") return current.add({ days: rule.interval }).toString();
  if (rule.frequency === "WEEKLY") return current.add({ weeks: rule.interval }).toString();
  if (rule.frequency === "MONTHLY") {
    const nextMonth = current.with({ day: 1 }).add({ months: rule.interval });
    return nextMonth.with({ day: Math.min(rule.anchorDayOfMonth, nextMonth.daysInMonth) }).toString();
  }
  throw new RangeError("Unsupported recurrence frequency");
}

export function occurrenceForLocalDate(localDate: string, rule: TaskRecurrenceRule): TaskOccurrencePlan {
  if (!validateTaskRecurrenceRule(rule)) throw new RangeError("Invalid recurrence rule");
  const date = Temporal.PlainDate.from(localDate);
  const time = localTime(rule);
  const plain = date.toPlainDateTime(time);
  const zoned = plain.toZonedDateTime(rule.timezone, { disambiguation: "compatible" });
  const requestedLocalDateTime = plain.toString({ smallestUnit: "minute" });
  const resolvedLocalDateTime = zoned.toPlainDateTime().toString({ smallestUnit: "minute" });
  return {
    occurrenceKey: `${requestedLocalDateTime}[${rule.timezone}]`,
    scheduledLocalDate: date.toString(),
    scheduledFor: new Date(zoned.epochMilliseconds),
    requestedLocalDateTime,
    resolvedLocalDateTime,
    dstResolution: requestedLocalDateTime === resolvedLocalDateTime ? "exact" : "shifted",
  };
}

export function initialOccurrencePlan(rule: TaskRecurrenceRule, count = rule.cadence === "FIXED" ? 3 : 1) {
  if (!validateTaskRecurrenceRule(rule) || !Number.isInteger(count) || count < 1 || count > 32) {
    throw new RangeError("Invalid recurrence plan request");
  }
  const occurrences: TaskOccurrencePlan[] = [];
  let date = rule.anchorLocalDate;
  for (let index = 0; index < count; index += 1) {
    occurrences.push(occurrenceForLocalDate(date, rule));
    date = nextRecurrenceLocalDate(date, rule);
  }
  return occurrences;
}

export function nextCompletionOccurrence(completedAt: Date, rule: TaskRecurrenceRule) {
  if (!validateTaskRecurrenceRule(rule) || !Number.isFinite(completedAt.getTime())) throw new RangeError("Invalid completion recurrence request");
  const completedLocalDate = Temporal.Instant.from(completedAt.toISOString())
    .toZonedDateTimeISO(rule.timezone)
    .toPlainDate()
    .toString();
  return occurrenceForLocalDate(nextRecurrenceLocalDate(completedLocalDate, rule), rule);
}

export function recurrenceLabel(rule: Pick<TaskRecurrenceRule, "cadence" | "frequency" | "interval" | "timezone" | "localTimeMinutes">) {
  const unit = rule.frequency === "DAILY" ? "day" : rule.frequency === "WEEKLY" ? "week" : "month";
  const cadence = rule.cadence === "COMPLETION" ? "after completion" : "on schedule";
  const hour = Math.floor(rule.localTimeMinutes / 60);
  const minute = rule.localTimeMinutes % 60;
  return `${rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`} at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${rule.timezone}), ${cadence}`;
}
