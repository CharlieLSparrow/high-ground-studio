import "server-only";

import { createHash } from "node:crypto";

import {
  calendarProjectionUid,
  calendarSourceRevision,
} from "@/lib/server/calendar-projections";

export type SessionCalendarSnapshot = {
  schema: "quipsly-session-calendar-snapshot-v1";
  sourceType: "CallRoom";
  sourceId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  url: string;
  status: "CONFIRMED" | "CANCELLED";
  providerVisibility: "default" | "private";
  attendeesIncluded: false;
  privateSessionContentIncluded: false;
};

export type SessionCalendarProjectionPreview = {
  schema: "quipsly-session-calendar-projection-preview-v1";
  action: "CREATE" | "UPDATE" | "NOOP" | "CANCEL" | "BLOCKED";
  sourceRevision: string;
  deterministicProviderEventId: string;
  uid: string;
  sendUpdates: "none";
  snapshot: SessionCalendarSnapshot;
  existing: null | {
    projectionId: string;
    providerEventId: string | null;
    providerEtag: string | null;
    sourceRevision: string;
    conflictState: string;
    status: string;
  };
  warning: string;
};

export class SessionCalendarProjectionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function deterministicGoogleEventId(roomId: string) {
  return `q${createHash("sha256").update(roomId).digest("hex")}`;
}

export function buildSessionCalendarSnapshot(input: {
  roomId: string;
  title?: string | null;
  purpose: string;
  roomStatus: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  url: string;
  providerVisibility: "default" | "private";
}) {
  if (input.scheduledEnd <= input.scheduledStart) {
    throw new SessionCalendarProjectionError(
      "The Session end must be after its start before it can reach a calendar.",
      "invalid-session-time",
    );
  }
  const fallback = input.purpose === "PODCAST"
    ? "Quipsly podcast session"
    : input.purpose === "COACHING"
      ? "Quipsly coaching session"
      : "Quipsly session";
  return {
    schema: "quipsly-session-calendar-snapshot-v1" as const,
    sourceType: "CallRoom" as const,
    sourceId: input.roomId,
    title: input.title?.trim() || fallback,
    description: "Open Quipsly for Session details. Recordings, transcript text, notes, goals, tasks, participant identities, and consent records are not copied to this event.",
    startsAt: input.scheduledStart.toISOString(),
    endsAt: input.scheduledEnd.toISOString(),
    timezone: input.timezone,
    url: input.url,
    status: input.roomStatus === "CANCELED" ? "CANCELLED" as const : "CONFIRMED" as const,
    providerVisibility: input.providerVisibility,
    attendeesIncluded: false as const,
    privateSessionContentIncluded: false as const,
  };
}

export function buildSessionCalendarProjectionPreview(input: {
  snapshot: SessionCalendarSnapshot;
  existing?: {
    id: string;
    providerEventId: string | null;
    providerEtag: string | null;
    sourceRevision: string;
    conflictState: string;
    status: string;
  } | null;
}): SessionCalendarProjectionPreview {
  const sourceRevision = calendarSourceRevision(input.snapshot);
  const existing = input.existing ? {
    projectionId: input.existing.id,
    providerEventId: input.existing.providerEventId,
    providerEtag: input.existing.providerEtag,
    sourceRevision: input.existing.sourceRevision,
    conflictState: input.existing.conflictState,
    status: input.existing.status,
  } : null;
  let action: SessionCalendarProjectionPreview["action"];
  if (existing?.conflictState && existing.conflictState !== "NONE") action = "BLOCKED";
  else if (input.snapshot.status === "CANCELLED") action = existing?.providerEventId ? "CANCEL" : "NOOP";
  else if (!existing?.providerEventId) action = "CREATE";
  else if (existing.sourceRevision === sourceRevision && existing.status === "SYNCED") action = "NOOP";
  else action = "UPDATE";
  return {
    schema: "quipsly-session-calendar-projection-preview-v1",
    action,
    sourceRevision,
    deterministicProviderEventId: deterministicGoogleEventId(input.snapshot.sourceId),
    uid: calendarProjectionUid("call-room", input.snapshot.sourceId),
    sendUpdates: "none",
    snapshot: input.snapshot,
    existing,
    warning: action === "BLOCKED"
      ? "Google or Quipsly changed after the last verified sync. Review the conflict before writing either side."
      : action === "CANCEL"
        ? "Cancellation is held for its own explicit confirmation; this action will not delete the Google event."
        : action === "NOOP"
          ? "Google already has this exact verified Session revision. Confirming performs no provider write."
          : "Confirming changes one owned Google calendar with notifications disabled and no attendees.",
  };
}

function eventResource(preview: SessionCalendarProjectionPreview) {
  return {
    id: preview.deterministicProviderEventId,
    summary: preview.snapshot.title,
    description: preview.snapshot.description,
    start: { dateTime: preview.snapshot.startsAt, timeZone: preview.snapshot.timezone },
    end: { dateTime: preview.snapshot.endsAt, timeZone: preview.snapshot.timezone },
    status: "confirmed",
    visibility: preview.snapshot.providerVisibility,
    extendedProperties: {
      private: {
        quipslySourceType: preview.snapshot.sourceType,
        quipslySourceId: preview.snapshot.sourceId,
        quipslySourceRevision: preview.sourceRevision,
        quipslySchema: preview.snapshot.schema,
      },
    },
    source: { title: "Open in Quipsly", url: preview.snapshot.url },
  };
}

async function responseJson(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, any> | null>;
}

export async function writeSessionGoogleCalendarProjection(input: {
  preview: SessionCalendarProjectionPreview;
  accessToken: string;
  calendarId: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  if (["BLOCKED", "CANCEL"].includes(input.preview.action)) {
    throw new SessionCalendarProjectionError(
      input.preview.warning,
      input.preview.action === "BLOCKED" ? "projection-conflict" : "cancellation-requires-separate-action",
      409,
    );
  }
  if (input.preview.action === "NOOP") {
    return {
      outcome: "NOOP" as const,
      externalMutated: false,
      providerEventId: input.preview.existing?.providerEventId || input.preview.deterministicProviderEventId,
      providerEtag: input.preview.existing?.providerEtag || null,
      providerUpdatedAt: null,
      providerStatus: "unchanged",
      recoveredCreate: false,
    };
  }
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
  };
  let response: Response;
  if (input.preview.action === "CREATE") {
    response = await fetchImpl(`${base}?sendUpdates=none`, {
      method: "POST",
      headers,
      body: JSON.stringify(eventResource(input.preview)),
    });
    if (response.status === 409) {
      const recovered = await fetchImpl(`${base}/${encodeURIComponent(input.preview.deterministicProviderEventId)}`, {
        headers: { Authorization: `Bearer ${input.accessToken}` },
      });
      const recoveredBody = await responseJson(recovered);
      if (
        recovered.ok &&
        recoveredBody?.extendedProperties?.private?.quipslySourceId === input.preview.snapshot.sourceId &&
        recoveredBody?.extendedProperties?.private?.quipslySourceRevision === input.preview.sourceRevision
      ) {
        return {
          outcome: "SYNCED" as const,
          externalMutated: false,
          providerEventId: String(recoveredBody.id),
          providerEtag: typeof recoveredBody.etag === "string" ? recoveredBody.etag : null,
          providerUpdatedAt: typeof recoveredBody.updated === "string" ? recoveredBody.updated : null,
          providerStatus: typeof recoveredBody.status === "string" ? recoveredBody.status : "confirmed",
          recoveredCreate: true,
        };
      }
      throw new SessionCalendarProjectionError(
        "A different Google event already uses Quipsly's deterministic event identity.",
        "provider-event-identity-conflict",
        409,
      );
    }
  } else {
    if (!input.preview.existing?.providerEventId || !input.preview.existing.providerEtag) {
      throw new SessionCalendarProjectionError(
        "The previous Google event version is missing. Read it back before updating.",
        "provider-etag-required",
        409,
      );
    }
    headers["If-Match"] = input.preview.existing.providerEtag;
    const patch = eventResource(input.preview);
    delete (patch as any).id;
    response = await fetchImpl(`${base}/${encodeURIComponent(input.preview.existing.providerEventId)}?sendUpdates=none`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(patch),
    });
    if (response.status === 412) {
      throw new SessionCalendarProjectionError(
        "Google Calendar changed after Quipsly last verified it. Review the conflict before overwriting anything.",
        "provider-etag-conflict",
        409,
      );
    }
  }
  const body = await responseJson(response);
  if (!response.ok || !body?.id) {
    throw new SessionCalendarProjectionError(
      response.status === 401 || response.status === 403
        ? "Google Calendar access is no longer sufficient. Reconnect or choose another owned calendar."
        : "Google Calendar did not accept the Session event.",
      `provider-write-${response.status || "failed"}`,
      response.status === 401 || response.status === 403 ? 409 : 502,
    );
  }
  return {
    outcome: "SYNCED" as const,
    externalMutated: true,
    providerEventId: String(body.id),
    providerEtag: typeof body.etag === "string" ? body.etag : null,
    providerUpdatedAt: typeof body.updated === "string" ? body.updated : null,
    providerStatus: typeof body.status === "string" ? body.status : "confirmed",
    recoveredCreate: false,
  };
}
