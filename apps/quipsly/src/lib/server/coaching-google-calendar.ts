import { createHash, createSign } from "node:crypto";

import { Prisma } from "@prisma/client";
import { google } from "googleapis";

import { getPrismaClient } from "@/lib/prisma";
import { recordManagedCoachingCalendarProjection } from "@/lib/server/calendar-projections";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const DEFAULT_COACHING_TIMEZONE = "America/Los_Angeles";

type ServiceAccountCredential = {
  client_email?: string;
  private_key?: string;
  private_key_id?: string;
  token_uri?: string;
};

type GoogleCalendarEventResponse = {
  id?: string;
  etag?: string;
  htmlLink?: string;
  status?: string;
  summary?: string;
  updated?: string;
};

type GoogleCalendarMetadataResponse = {
  id?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
  accessRole?: string;
  primary?: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validProviderDate(value: unknown) {
  const parsed = new Date(text(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function getCoachingDefaultTimezone() {
  return text(process.env.COACHING_DEFAULT_TIMEZONE) || DEFAULT_COACHING_TIMEZONE;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sourceJson(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataWithEvent(metadata: unknown, key: string, event: Record<string, unknown>) {
  const current = sourceJson(metadata);
  const previous = Array.isArray(current[key]) ? (current[key] as unknown[]) : [];
  return toJsonInput({
    ...current,
    [key]: [...previous.slice(-24), event],
  });
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parseServiceAccountCredential(raw: string): ServiceAccountCredential {
  const trimmed = raw.trim();
  const json = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  const credential = JSON.parse(json) as ServiceAccountCredential;

  return {
    ...credential,
    private_key: credential.private_key?.replace(/\\n/g, "\n"),
  };
}

function buildServiceAccountJwt({
  credential,
  subject,
}: {
  credential: ServiceAccountCredential;
  subject?: string | null;
}) {
  if (!credential.client_email || !credential.private_key) {
    throw new Error("Google Calendar service account JSON is missing required fields.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    ...(credential.private_key_id ? { kid: credential.private_key_id } : {}),
  };
  const claimSet = {
    iss: credential.client_email,
    scope: GOOGLE_CALENDAR_SCOPE,
    aud: credential.token_uri || GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
    ...(subject?.trim() ? { sub: subject.trim() } : {}),
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const signature = createSign("RSA-SHA256").update(unsignedJwt).sign(credential.private_key);

  return `${unsignedJwt}.${base64Url(signature)}`;
}

async function fetchGoogleAccessTokenFromServiceAccount() {
  const rawCredential = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawCredential) return null;

  const credential = parseServiceAccountCredential(rawCredential);
  const assertion = buildServiceAccountJwt({
    credential,
    subject: process.env.GOOGLE_CALENDAR_IMPERSONATION_EMAIL,
  });
  const response = await fetch(credential.token_uri || GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google service account token request failed: ${await response.text()}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Google service account token response did not include an access token.");
  }

  return json.access_token;
}

async function fetchGoogleAccessTokenFromRefreshToken() {
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();
  if (!refreshToken) return null;

  const clientId = process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CALENDAR_REFRESH_TOKEN requires GOOGLE_CALENDAR_SYNC_CLIENT_ID and GOOGLE_CALENDAR_SYNC_CLIENT_SECRET.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google refresh-token request failed: ${await response.text()}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Google refresh-token response did not include an access token.");
  }

  return json.access_token;
}

async function fetchGoogleAccessTokenFromApplicationDefault() {
  if (process.env.GOOGLE_CALENDAR_ALLOW_APPLICATION_DEFAULT !== "true") return null;

  const auth = new google.auth.GoogleAuth({
    scopes: [GOOGLE_CALENDAR_SCOPE],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (typeof token === "string") return token;
  return token?.token || null;
}

async function fetchMetadataToken(scope?: string) {
  const suffix = scope ? `?scopes=${encodeURIComponent(scope)}` : "";

  try {
    const response = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token${suffix}`,
      { headers: { "Metadata-Flavor": "Google" } },
    );
    if (!response.ok) return null;

    const json = (await response.json()) as { access_token?: string };
    return json.access_token || null;
  } catch {
    return null;
  }
}

async function fetchGoogleCalendarAccessToken() {
  return (
    (await fetchGoogleAccessTokenFromServiceAccount()) ||
    (await fetchGoogleAccessTokenFromRefreshToken()) ||
    (await fetchGoogleAccessTokenFromApplicationDefault()) ||
    (await fetchMetadataToken(GOOGLE_CALENDAR_SCOPE)) ||
    (await fetchMetadataToken())
  );
}

function googleCalendarSendUpdates() {
  const value = process.env.GOOGLE_CALENDAR_SEND_UPDATES?.trim();
  return value === "all" || value === "externalOnly" || value === "none" ? value : "none";
}

function shouldIncludeAttendees() {
  return process.env.GOOGLE_CALENDAR_INCLUDE_ATTENDEES === "true";
}

export function getCoachingCalendarReadiness() {
  const calendarId = text(process.env.GOOGLE_CALENDAR_ID);
  const hasServiceAccountCredential = configuredCalendarCredential(process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON);
  const hasRefreshTokenCredential =
    configuredCalendarCredential(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) &&
    configuredCalendarCredential(process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID) &&
    configuredCalendarCredential(process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET);
  const applicationDefaultCredentialEnabled = process.env.GOOGLE_CALENDAR_ALLOW_APPLICATION_DEFAULT === "true";
  const canAttemptMetadataToken = process.env.GOOGLE_CALENDAR_ALLOW_METADATA_TOKEN !== "false";
  const dedicatedCredentialConfigured = hasServiceAccountCredential || hasRefreshTokenCredential;
  const credentialConfigured = dedicatedCredentialConfigured || applicationDefaultCredentialEnabled;
  const metadataTokenCandidate = !credentialConfigured && canAttemptMetadataToken;
  const configurationStatus = !calendarId
    ? "missing-calendar-id"
    : dedicatedCredentialConfigured
      ? "calendar-id-and-credential-configured"
      : applicationDefaultCredentialEnabled
        ? "calendar-id-and-application-default-configured"
      : metadataTokenCandidate
        ? "metadata-token-candidate"
        : "missing-calendar-credentials";

  return {
    provider: "google-calendar",
    configured: Boolean(calendarId && (credentialConfigured || metadataTokenCandidate)),
    calendarIdConfigured: Boolean(calendarId),
    calendarIdVisibleForOps: calendarId || null,
    credentialConfigured,
    dedicatedCredentialConfigured,
    applicationDefaultCredentialEnabled,
    metadataTokenCandidate,
    configurationStatus,
    verificationRecommended: Boolean(calendarId && (credentialConfigured || metadataTokenCandidate)),
    credentialPath: hasServiceAccountCredential
      ? "service-account"
      : hasRefreshTokenCredential
        ? "refresh-token"
        : applicationDefaultCredentialEnabled
          ? "application-default"
        : canAttemptMetadataToken
          ? "metadata-token"
          : "missing",
    defaultTimezone: getCoachingDefaultTimezone(),
    sendUpdates: googleCalendarSendUpdates(),
    attendeesIncluded: shouldIncludeAttendees(),
    sourceOfTruth:
      "Google Calendar is scheduling evidence and convenience. Quipsly owns booking, room, consent, recording, transcript, notes, goals, and follow-up truth.",
    nextAction: !calendarId
      ? "Set GOOGLE_CALENDAR_ID before syncing booking evidence to Google Calendar."
      : dedicatedCredentialConfigured
        ? "Run the staff read-only calendar verification before promising external calendar sync. After that, operators can explicitly sync booking evidence."
        : applicationDefaultCredentialEnabled
          ? "Run the staff read-only calendar verification using Application Default Credentials before promising external calendar sync."
        : metadataTokenCandidate
          ? "Calendar ID is set, but the only credential path is deployed metadata-token fallback. Verify on the deployed runtime before promising external calendar sync."
          : "Add Google Calendar credentials or enable the deployed metadata-token fallback before syncing booking evidence.",
  };
}

export async function checkCoachingCalendarAccess() {
  const readiness = getCoachingCalendarReadiness();
  const calendarId = text(process.env.GOOGLE_CALENDAR_ID);

  if (!calendarId) {
    return {
      ...readiness,
      accessOk: false,
      accessStatus: "missing-calendar-id",
      externalMutated: false,
      message: "GOOGLE_CALENDAR_ID is not configured.",
    };
  }

  const accessToken = await fetchGoogleCalendarAccessToken();
  if (!accessToken) {
    return {
      ...readiness,
      accessOk: false,
      accessStatus: "missing-token",
      externalMutated: false,
      message: "Google Calendar token could not be minted from configured credentials.",
    };
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    return {
      ...readiness,
      accessOk: false,
      accessStatus: `google-${response.status}`,
      externalMutated: false,
      message: `Google Calendar metadata check failed with HTTP ${response.status}.`,
    };
  }

  const calendar = (await response.json()) as GoogleCalendarMetadataResponse;

  return {
    ...readiness,
    accessOk: true,
    accessStatus: "readable",
    externalMutated: false,
    calendar: {
      id: text(calendar.id) || calendarId,
      summary: text(calendar.summary) || null,
      timeZone: text(calendar.timeZone) || null,
      accessRole: text(calendar.accessRole) || null,
      primary: calendar.primary === true,
    },
    message: "Google Calendar is readable. No event was created, updated, deleted, or sent.",
  };
}

function configuredCalendarCredential(value: unknown) {
  return text(value).length > 0;
}

function eventTitle(booking: any) {
  return text(booking.callRoom?.title) || text(booking.offering?.title) || "Quipsly coaching session";
}

function participantEmail(user: any) {
  return text(user?.primaryEmail);
}

function buildCalendarDescription(booking: any) {
  const clientName = text(booking.clientUser?.name) || participantEmail(booking.clientUser) || "Client";
  const coachName = text(booking.coachUser?.name) || participantEmail(booking.coachUser) || "Coach";
  const roomName = text(booking.callRoom?.providerRoomId) || text(booking.callRoom?.id) || "Quipsly room pending";

  return [
    "Quipsly coaching/capture session.",
    "",
    `Client: ${clientName}`,
    `Coach: ${coachName}`,
    `Quipsly booking: ${booking.id}`,
    `Quipsly room: ${roomName}`,
    "",
    "Quipsly remains the source of truth for booking state, consent, recording evidence, transcript, notes, goals, and follow-up work.",
  ].join("\n");
}

function buildCalendarPayload(booking: any) {
  const timezone = text(booking.timezone) || getCoachingDefaultTimezone();
  const attendees = shouldIncludeAttendees()
    ? [participantEmail(booking.clientUser), participantEmail(booking.coachUser)]
        .filter(Boolean)
        .map((email) => ({ email }))
    : undefined;

  return {
    summary: eventTitle(booking),
    description: buildCalendarDescription(booking),
    location: "Quipsly Capture",
    start: {
      dateTime: new Date(booking.scheduledStart).toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: new Date(booking.scheduledEnd).toISOString(),
      timeZone: timezone,
    },
    ...(attendees?.length ? { attendees } : {}),
    extendedProperties: {
      private: {
        source: "quipsly-nest",
        truthOwner: "quipsly",
        bookingId: booking.id,
        callRoomId: booking.callRoom?.id || "",
      },
    },
  };
}

export function deterministicGoogleCalendarEventId(calendarId: string, bookingId: string) {
  return createHash("sha256").update(`quipsly-google-calendar-v1\0${calendarId}\0${bookingId}`).digest("hex");
}

export function canManageCoachingCalendarEvidence(input: {
  operatorUserId: string;
  operatorIsStaff?: boolean;
  assignedCoachUserId?: string | null;
  roomCreatedByUserId?: string | null;
}) {
  return input.operatorIsStaff === true
    || input.assignedCoachUserId === input.operatorUserId
    || input.roomCreatedByUserId === input.operatorUserId;
}

export async function writeGoogleCalendarEvent(input: {
  accessToken: string;
  eventId?: string | null;
  createEventId?: string | null;
  payload: Record<string, unknown>;
}) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is not configured.");
  }

  const params = new URLSearchParams({ sendUpdates: googleCalendarSendUpdates() });
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const url = input.eventId
    ? `${baseUrl}/${encodeURIComponent(input.eventId)}?${params.toString()}`
    : `${baseUrl}?${params.toString()}`;
  const response = await fetch(url, {
    method: input.eventId ? "PUT" : "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input.eventId || !input.createEventId ? input.payload : { ...input.payload, id: input.createEventId }),
  });

  if (response.status === 409 && !input.eventId && input.createEventId) {
    return writeGoogleCalendarEvent({
      accessToken: input.accessToken,
      eventId: input.createEventId,
      payload: input.payload,
    });
  }
  if (!response.ok) {
    throw new Error(`Google Calendar event write failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as GoogleCalendarEventResponse;
}

export async function deleteGoogleCalendarEvent(input: { accessToken: string; eventId: string }) {
  const calendarId = text(process.env.GOOGLE_CALENDAR_ID);
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID is not configured.");
  const params = new URLSearchParams({ sendUpdates: googleCalendarSendUpdates() });
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}?${params.toString()}`,
    { method: "DELETE", headers: { authorization: `Bearer ${input.accessToken}`, accept: "application/json" } },
  );
  if (response.status === 404 || response.status === 410) {
    return { providerEventId: input.eventId, alreadyAbsent: true, httpStatus: response.status };
  }
  if (!response.ok) throw new Error(`Google Calendar event cancellation failed with HTTP ${response.status}.`);
  return { providerEventId: input.eventId, alreadyAbsent: false, httpStatus: response.status };
}

export async function syncCoachingBookingToGoogleCalendar(input: {
  bookingId: string;
  operatorUserId: string;
  operatorIsStaff?: boolean;
}) {
  const prisma = getPrismaClient() as any;
  const booking = await prisma.coachingBooking.findUnique({
    where: { id: input.bookingId },
    include: {
      appointment: true,
      offering: true,
      clientUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
      coachUser: { select: { id: true, name: true, primaryEmail: true, image: true } },
      callRoom: { include: { project: { select: { workspaceId: true } } } },
      calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!booking) {
    throw new Error("That coaching booking was not found.");
  }
  if (!canManageCoachingCalendarEvidence({
    operatorUserId: input.operatorUserId,
    operatorIsStaff: input.operatorIsStaff,
    assignedCoachUserId: booking.coachUser?.id,
    roomCreatedByUserId: booking.callRoom?.createdByUserId,
  })) {
    throw new Error("Only the assigned coach or Quipsly staff can sync this booking to an external calendar.");
  }
  if (booking.status === "CANCELED") {
    throw new Error("Canceled bookings should not create fresh calendar events. Preserve the cancellation history instead.");
  }

  const accessToken = await fetchGoogleCalendarAccessToken();
  if (!accessToken) {
    throw new Error("Google Calendar credentials are not available to Quipsly.");
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || null;
  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is not configured.");
  }
  const latestLink = booking.calendarLinks?.[0] || null;
  const latestLinkMatchesCalendar = !latestLink?.providerCalendarId || latestLink.providerCalendarId === calendarId;
  const existingEventId = latestLinkMatchesCalendar
    ? text(latestLink?.providerEventId) || text(booking.calendarEventId) || null
    : null;
  const createEventId = deterministicGoogleCalendarEventId(calendarId, booking.id);
  const payload = buildCalendarPayload(booking);
  const googleEvent = await writeGoogleCalendarEvent({ accessToken, eventId: existingEventId, createEventId, payload });
  const providerEventId = text(googleEvent.id) || existingEventId || createEventId;
  const htmlLink = text(googleEvent.htmlLink) || null;
  const now = new Date();
  const status = existingEventId ? "updated" : "synced";

  const link = await prisma.$transaction(async (tx: any) => {
    const createdLink = await tx.calendarEventLink.create({
      data: {
        bookingId: booking.id,
        roomId: booking.callRoom?.id || null,
        provider: "google",
        providerCalendarId: calendarId,
        providerEventId,
        status,
        title: eventTitle(booking),
        scheduledStart: booking.scheduledStart,
        scheduledEnd: booking.scheduledEnd,
        timezone: text(booking.timezone) || getCoachingDefaultTimezone(),
        htmlLink,
        rawJson: toJsonInput({
          source: "quipsly-coaching-runway",
          action: "sync-google-calendar-event",
          syncedByUserId: input.operatorUserId,
          syncedAt: now.toISOString(),
          externalCalendarMutatedByQuipsly: true,
          deterministicProviderEventId: createEventId,
          sendUpdates: googleCalendarSendUpdates(),
          attendeesIncluded: shouldIncludeAttendees(),
          previousCalendarLinkId: latestLink?.id || null,
          googleEvent,
        }),
      },
    });

    await tx.coachingBooking.update({
      where: { id: booking.id },
      data: {
        calendarEventId: providerEventId,
        metadataJson: metadataWithEvent(booking.metadataJson, "calendarReceiptEvents", {
          at: now.toISOString(),
          byUserId: input.operatorUserId,
          provider: "google",
          providerCalendarId: calendarId,
          providerEventId,
          htmlLink,
          status,
          externalCalendarMutatedByQuipsly: true,
        }),
      },
    });

    if (booking.appointment?.id && providerEventId) {
      await tx.appointment.update({
        where: { id: booking.appointment.id },
        data: {
          googleEventId: providerEventId,
          updatedByUserId: input.operatorUserId,
        },
      });
    }
    await recordManagedCoachingCalendarProjection({
      tx,
      workspaceId: booking.callRoom?.project?.workspaceId || null,
      calendarId,
      bookingId: booking.id,
      roomId: booking.callRoom?.id || null,
      title: eventTitle(booking),
      scheduledStart: booking.scheduledStart,
      scheduledEnd: booking.scheduledEnd,
      timezone: text(booking.timezone) || getCoachingDefaultTimezone(),
      bookingStatus: booking.status,
      providerEventId,
      providerEtag: text(googleEvent.etag) || null,
      providerUpdatedAt: validProviderDate(googleEvent.updated),
      operation: existingEventId ? "UPDATE_EVENT" : "CREATE_EVENT",
      providerStatus: text(googleEvent.status) || status,
      externalMutated: true,
      actorUserId: input.operatorUserId,
      legacyCalendarLinkId: createdLink.id,
      occurredAt: now,
    });
    return createdLink;
  });

  return {
    bookingId: booking.id,
    callRoomId: booking.callRoom?.id || null,
    calendarLinkId: link.id,
    provider: "google",
    providerCalendarId: calendarId,
    providerEventId,
    htmlLink,
    calendarStatus: status,
    nextAction:
      "Google Calendar receipt is attached. Quipsly still owns booking, consent, recording, transcript, notes, goals, and follow-up truth.",
  };
}

export async function cancelCoachingBookingGoogleCalendar(input: {
  bookingId: string;
  operatorUserId: string;
  operatorIsStaff?: boolean;
}) {
  const prisma = getPrismaClient() as any;
  const booking = await prisma.coachingBooking.findUnique({
    where: { id: input.bookingId },
    include: {
      coachUser: { select: { id: true } },
      callRoom: { include: { project: { select: { workspaceId: true } } } },
      calendarLinks: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
  if (!booking) throw new Error("That coaching booking was not found.");
  if (!canManageCoachingCalendarEvidence({
    operatorUserId: input.operatorUserId,
    operatorIsStaff: input.operatorIsStaff,
    assignedCoachUserId: booking.coachUser?.id,
    roomCreatedByUserId: booking.callRoom?.createdByUserId,
  })) {
    throw new Error("Only the assigned coach, room creator, or Quipsly staff can cancel this booking's external calendar event.");
  }
  if (booking.status !== "CANCELED") {
    throw new Error("Cancel the Quipsly booking first, then explicitly reconcile the external calendar event.");
  }
  const calendarId = text(process.env.GOOGLE_CALENDAR_ID);
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID is not configured.");
  const matchingLink = booking.calendarLinks.find((link: any) =>
    text(link.providerEventId)
      && (!text(link.providerCalendarId) || text(link.providerCalendarId) === calendarId),
  );
  const providerEventId = text(matchingLink?.providerEventId) || text(booking.calendarEventId);
  if (!providerEventId) {
    throw new Error("No Google Calendar event receipt exists for this canceled booking. Nothing external was changed.");
  }
  const accessToken = await fetchGoogleCalendarAccessToken();
  if (!accessToken) throw new Error("Google Calendar credentials are not available to Quipsly.");
  const providerReceipt = await deleteGoogleCalendarEvent({ accessToken, eventId: providerEventId });
  const now = new Date();
  const link = await prisma.$transaction(async (tx: any) => {
    const createdLink = await tx.calendarEventLink.create({
      data: {
        bookingId: booking.id,
        roomId: booking.callRoom?.id || null,
        provider: "google",
        providerCalendarId: calendarId,
        providerEventId,
        status: providerReceipt.alreadyAbsent ? "canceled-already-absent" : "canceled",
        title: eventTitle(booking),
        scheduledStart: booking.scheduledStart,
        scheduledEnd: booking.scheduledEnd,
        timezone: text(booking.timezone) || getCoachingDefaultTimezone(),
        rawJson: toJsonInput({
          source: "quipsly-coaching-runway",
          action: "cancel-google-calendar-event",
          canceledByUserId: input.operatorUserId,
          canceledAt: now.toISOString(),
          externalCalendarMutatedByQuipsly: !providerReceipt.alreadyAbsent,
          providerReceipt,
          previousCalendarLinkId: matchingLink?.id || null,
          sendUpdates: googleCalendarSendUpdates(),
        }),
      },
    });
    await tx.coachingBooking.update({
      where: { id: booking.id },
      data: {
        metadataJson: metadataWithEvent(booking.metadataJson, "calendarReceiptEvents", {
          at: now.toISOString(),
          byUserId: input.operatorUserId,
          provider: "google",
          providerCalendarId: calendarId,
          providerEventId,
          status: createdLink.status,
          externalCalendarCanceled: true,
          alreadyAbsent: providerReceipt.alreadyAbsent,
        }),
      },
    });
    await recordManagedCoachingCalendarProjection({
      tx,
      workspaceId: booking.callRoom?.project?.workspaceId || null,
      calendarId,
      bookingId: booking.id,
      roomId: booking.callRoom?.id || null,
      title: eventTitle(booking),
      scheduledStart: booking.scheduledStart,
      scheduledEnd: booking.scheduledEnd,
      timezone: text(booking.timezone) || getCoachingDefaultTimezone(),
      bookingStatus: booking.status,
      providerEventId,
      operation: "CANCEL_EVENT",
      providerStatus: createdLink.status,
      externalMutated: !providerReceipt.alreadyAbsent,
      actorUserId: input.operatorUserId,
      legacyCalendarLinkId: createdLink.id,
      occurredAt: now,
    });
    return createdLink;
  });
  return {
    bookingId: booking.id,
    callRoomId: booking.callRoom?.id || null,
    calendarLinkId: link.id,
    provider: "google",
    providerCalendarId: calendarId,
    providerEventId,
    calendarStatus: link.status,
    alreadyAbsent: providerReceipt.alreadyAbsent,
    nextAction: "External calendar cancellation receipt is attached. The canceled Quipsly booking remains preserved as scheduling history.",
  };
}
