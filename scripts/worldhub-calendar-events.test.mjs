import assert from "node:assert/strict";
import test from "node:test";

import { buildWorldHubAppointmentCalendarEvent } from "../apps/web/src/lib/worldhub/google-calendar-events.ts";

test("builds a Google Calendar event payload for a coaching appointment", () => {
  const event = buildWorldHubAppointmentCalendarEvent({
    appointmentId: "appt_123",
    client: {
      email: "client@example.test",
      name: "Client One",
    },
    coach: {
      email: "coach@example.test",
      name: "Coach One",
    },
    scheduledStart: new Date("2026-05-25T15:00:00.000Z"),
    scheduledEnd: new Date("2026-05-25T16:00:00.000Z"),
    timezone: "America/Denver",
    status: "SCHEDULED",
    locationType: "VIDEO",
    locationDetails: "Private video room",
    includeAttendees: true,
  });

  assert.equal(event.summary, "High Ground coaching: Client One");
  assert.equal(event.location, "Private video room");
  assert.equal(event.start.dateTime, "2026-05-25T15:00:00.000Z");
  assert.equal(event.start.timeZone, "America/Denver");
  assert.deepEqual(event.attendees, [
    {
      email: "client@example.test",
      displayName: "Client One",
    },
    {
      email: "coach@example.test",
      displayName: "Coach One",
    },
  ]);
  assert.deepEqual(event.extendedProperties.private, {
    appointmentId: "appt_123",
    source: "high-ground-studio",
  });
});

test("omits attendees until calendar auth can safely invite them", () => {
  const event = buildWorldHubAppointmentCalendarEvent({
    appointmentId: "appt_456",
    client: {
      email: "client@example.test",
      name: "Client Two",
    },
    scheduledStart: new Date("2026-05-25T15:00:00.000Z"),
    scheduledEnd: new Date("2026-05-25T16:00:00.000Z"),
    timezone: "America/Denver",
    status: "SCHEDULED",
    locationType: "PHONE",
    includeAttendees: false,
  });

  assert.equal("attendees" in event, false);
  assert.equal(event.location, "phone");
});
