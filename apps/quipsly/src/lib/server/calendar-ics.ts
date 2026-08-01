import { createHash } from "node:crypto";

export type QuipslyCalendarEvent = {
  sourceType: "COACHING_BOOKING" | "CALL_ROOM" | "PRODUCTION_MILESTONE" | "WORK_PLAN_BLOCK" | "ACTION_ITEM" | "GOAL";
  sourceId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  sequence?: number;
  updatedAt?: Date | null;
  url?: string | null;
  status?: "CONFIRMED" | "CANCELLED" | "TENTATIVE";
  transparency?: "OPAQUE" | "TRANSPARENT";
};

function validDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function utcDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

export function foldIcsLine(value: string) {
  const lines: string[] = [];
  let line = "";
  for (const character of value) {
    const candidate = `${line}${character}`;
    if (Buffer.byteLength(candidate, "utf8") <= 75) {
      line = candidate;
      continue;
    }
    if (!line) throw new Error("iCalendar line contains a code point larger than the fold limit.");
    lines.push(line);
    line = ` ${character}`;
  }
  if (line) lines.push(line);
  return lines.join("\r\n");
}

export function stableCalendarUid(sourceType: QuipslyCalendarEvent["sourceType"], sourceId: string) {
  const digest = createHash("sha256")
    .update(`quipsly-calendar-v1\0${sourceType}\0${sourceId}`)
    .digest("hex")
    .slice(0, 40);
  return `${digest}@calendar.quipsly.com`;
}

function buildEventLines(event: QuipslyCalendarEvent, generatedAt: Date) {
  if (!event.sourceId.trim() || !event.title.trim()) {
    throw new Error("iCalendar source identity and title are required.");
  }
  if (!validDate(event.startsAt) || !validDate(event.endsAt) || event.endsAt <= event.startsAt) {
    throw new Error("iCalendar event requires a valid end after its start.");
  }
  if (!validDate(generatedAt)) throw new Error("iCalendar generation time is invalid.");
  const sequence = Number.isSafeInteger(event.sequence) && Number(event.sequence) >= 0
    ? Number(event.sequence)
    : 0;
  const updatedAt = event.updatedAt && validDate(event.updatedAt) ? event.updatedAt : generatedAt;
  return [
    "BEGIN:VEVENT",
    `UID:${stableCalendarUid(event.sourceType, event.sourceId)}`,
    `DTSTAMP:${utcDate(updatedAt)}`,
    `DTSTART:${utcDate(event.startsAt)}`,
    `DTEND:${utcDate(event.endsAt)}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${event.status || "CONFIRMED"}`,
    `TRANSP:${event.transparency || "OPAQUE"}`,
    `SUMMARY:${escapeText(event.title.trim())}`,
    ...(event.description?.trim() ? [`DESCRIPTION:${escapeText(event.description.trim())}`] : []),
    ...(event.location?.trim() ? [`LOCATION:${escapeText(event.location.trim())}`] : []),
    ...(event.url?.trim() ? [`URL:${event.url.trim()}`] : []),
    `X-QUIPSLY-SOURCE-TYPE:${event.sourceType}`,
    "END:VEVENT",
  ];
}

export function buildIcsFeed(input: {
  name: string;
  events: QuipslyCalendarEvent[];
  generatedAt?: Date;
  refreshInterval?: string;
}) {
  const generatedAt = input.generatedAt ?? new Date();
  if (!input.name.trim()) throw new Error("iCalendar feed name is required.");
  if (!validDate(generatedAt)) throw new Error("iCalendar generation time is invalid.");
  const refreshInterval = input.refreshInterval || "PT1H";
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Quipsly//Calendar Projection 1.0//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name.trim())}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refreshInterval}`,
    `X-PUBLISHED-TTL:${refreshInterval}`,
    ...input.events.flatMap((event) => buildEventLines(event, generatedAt)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function buildIcsCalendar(event: QuipslyCalendarEvent, generatedAt = new Date()) {
  return buildIcsFeed({ name: event.title, events: [event], generatedAt });
}
