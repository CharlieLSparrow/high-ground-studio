import { createSign } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureWorldHubProviderConnection } from "@/lib/server/worldhub-integrations";
import {
  buildWorldHubAppointmentCalendarEvent,
  type WorldHubGoogleCalendarEventPayload,
} from "@/lib/worldhub/google-calendar-events";
import {
  getWorldHubProviderDefinition,
  getWorldHubProviderReadiness,
} from "@/lib/worldhub/provider-definitions";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

type CalendarSyncOutcome = {
  appointmentId: string;
  status: "synced" | "queued" | "failed";
  jobId: string;
  googleEventId?: string | null;
  errorMessage?: string | null;
};

type ServiceAccountCredential = {
  client_email?: string;
  private_key?: string;
  private_key_id?: string;
  token_uri?: string;
};

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
  const json = trimmed.startsWith("{")
    ? trimmed
    : Buffer.from(trimmed, "base64").toString("utf8");
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
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claimSet),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedJwt)
    .sign(credential.private_key);

  return `${unsignedJwt}.${base64Url(signature)}`;
}

async function fetchGoogleAccessTokenFromServiceAccount() {
  const rawCredential = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;

  if (!rawCredential?.trim()) {
    return null;
  }

  const credential = parseServiceAccountCredential(rawCredential);
  const assertion = buildServiceAccountJwt({
    credential,
    subject: process.env.GOOGLE_CALENDAR_IMPERSONATION_EMAIL,
  });
  const response = await fetch(credential.token_uri || GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
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

  if (!refreshToken) {
    return null;
  }

  const clientId = process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CALENDAR_REFRESH_TOKEN requires GOOGLE_CALENDAR_SYNC_CLIENT_ID and GOOGLE_CALENDAR_SYNC_CLIENT_SECRET.",
    );
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
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

async function fetchGoogleCalendarAccessToken() {
  return (
    (await fetchGoogleAccessTokenFromServiceAccount()) ||
    (await fetchGoogleAccessTokenFromRefreshToken())
  );
}

function shouldIncludeAttendees() {
  return Boolean(
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim() ||
      process.env.GOOGLE_CALENDAR_IMPERSONATION_EMAIL?.trim(),
  );
}

function googleCalendarSendUpdates() {
  const value = process.env.GOOGLE_CALENDAR_SEND_UPDATES?.trim();

  return value === "all" || value === "externalOnly" || value === "none"
    ? value
    : "none";
}

async function writeGoogleCalendarEvent({
  accessToken,
  eventId,
  payload,
}: {
  accessToken: string;
  eventId?: string | null;
  payload: WorldHubGoogleCalendarEventPayload;
}) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();

  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is not configured.");
  }

  const encodedCalendarId = encodeURIComponent(calendarId);
  const params = new URLSearchParams({
    sendUpdates: googleCalendarSendUpdates(),
  });
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`;
  const url = eventId
    ? `${baseUrl}/${encodeURIComponent(eventId)}?${params.toString()}`
    : `${baseUrl}?${params.toString()}`;
  const response = await fetch(url, {
    method: eventId ? "PUT" : "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar event write failed: ${await response.text()}`);
  }

  return (await response.json()) as {
    id?: string;
    htmlLink?: string;
    hangoutLink?: string;
    status?: string;
  };
}

async function markProviderHealth(
  connectionId: string,
  healthStatus: string,
) {
  await prisma.worldHubProviderConnection.update({
    where: {
      id: connectionId,
    },
    data: {
      healthStatus,
      lastCheckedAt: new Date(),
    },
  });
}

async function syncAppointmentToGoogleCalendar({
  appointmentId,
  requestedByEmail,
}: {
  appointmentId: string;
  requestedByEmail: string;
}): Promise<CalendarSyncOutcome> {
  const connection = await ensureWorldHubProviderConnection("google-calendar");
  const appointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
    include: {
      clientUser: true,
      coachUser: true,
    },
  });

  if (!appointment) {
    throw new Error(`Appointment not found: ${appointmentId}`);
  }

  const payload = buildWorldHubAppointmentCalendarEvent({
    appointmentId: appointment.id,
    client: {
      email: appointment.clientUser.primaryEmail,
      name: appointment.clientUser.name,
    },
    coach: appointment.coachUser
      ? {
          email: appointment.coachUser.primaryEmail,
          name: appointment.coachUser.name,
        }
      : null,
    scheduledStart: appointment.scheduledStart,
    scheduledEnd: appointment.scheduledEnd,
    timezone: appointment.timezone,
    status: appointment.status,
    locationType: appointment.locationType,
    locationDetails: appointment.locationDetails,
    includeAttendees: shouldIncludeAttendees(),
  });
  const job = await prisma.worldHubProviderSyncJob.create({
    data: {
      connectionId: connection.id,
      providerKey: "google-calendar",
      jobType: appointment.googleEventId
        ? "calendar_event_update"
        : "calendar_event_insert",
      subjectType: "Appointment",
      subjectId: appointment.id,
      status: "queued",
      requestedByEmail,
      payloadJson: toJsonInput({
        appointmentId: appointment.id,
        existingGoogleEventId: appointment.googleEventId,
        calendarId: process.env.GOOGLE_CALENDAR_ID || null,
        event: payload,
      }),
    },
  });
  const definition = getWorldHubProviderDefinition("google-calendar");
  const readiness = definition
    ? getWorldHubProviderReadiness(definition)
    : null;

  if (!readiness || readiness.missingEnv.length > 0) {
    const errorMessage = `Waiting for Google Calendar env: ${readiness?.missingEnv.join(", ") || "provider definition missing"}.`;
    await prisma.worldHubProviderSyncJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "queued",
        errorMessage,
        resultJson: toJsonInput({
          readyForProviderCall: false,
          missingEnv: readiness?.missingEnv ?? [],
        }),
      },
    });

    return {
      appointmentId,
      status: "queued",
      jobId: job.id,
      errorMessage,
    };
  }

  try {
    await prisma.worldHubProviderSyncJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "running",
        startedAt: new Date(),
      },
    });

    const accessToken = await fetchGoogleCalendarAccessToken();

    if (!accessToken) {
      throw new Error("Google Calendar auth is configured as ready, but no access token could be created.");
    }

    const event = await writeGoogleCalendarEvent({
      accessToken,
      eventId: appointment.googleEventId,
      payload,
    });

    if (!event.id) {
      throw new Error("Google Calendar response did not include an event id.");
    }

    await prisma.$transaction([
      prisma.appointment.update({
        where: {
          id: appointment.id,
        },
        data: {
          googleEventId: event.id,
        },
      }),
      prisma.worldHubProviderSyncJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "completed",
          completedAt: new Date(),
          resultJson: toJsonInput({
            googleEventId: event.id,
            htmlLink: event.htmlLink || null,
            hangoutLink: event.hangoutLink || null,
            status: event.status || null,
          }),
        },
      }),
    ]);
    await markProviderHealth(connection.id, "ready");

    return {
      appointmentId,
      status: "synced",
      jobId: job.id,
      googleEventId: event.id,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Google Calendar sync failed.";

    await prisma.worldHubProviderSyncJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage,
      },
    });
    await markProviderHealth(connection.id, "error");

    return {
      appointmentId,
      status: "failed",
      jobId: job.id,
      errorMessage,
    };
  }
}

export async function syncUnsyncedGoogleCalendarAppointments({
  requestedByEmail,
  limit = 10,
}: {
  requestedByEmail: string;
  limit?: number;
}) {
  await ensureWorldHubProviderConnection("google-calendar");

  const now = new Date();
  const appointments = await prisma.appointment.findMany({
    where: {
      googleEventId: null,
      scheduledEnd: {
        gte: now,
      },
      status: {
        in: ["SCHEDULED", "CONFIRMED"],
      },
    },
    orderBy: [{ scheduledStart: "asc" }],
    take: limit,
    select: {
      id: true,
    },
  });
  const outcomes = [];

  for (const appointment of appointments) {
    outcomes.push(
      await syncAppointmentToGoogleCalendar({
        appointmentId: appointment.id,
        requestedByEmail,
      }),
    );
  }

  return {
    attempted: outcomes.length,
    synced: outcomes.filter((outcome) => outcome.status === "synced").length,
    queued: outcomes.filter((outcome) => outcome.status === "queued").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    outcomes,
  };
}
