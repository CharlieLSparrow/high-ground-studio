export type WorldHubCalendarPerson = {
  email?: string | null;
  name?: string | null;
};

export type WorldHubAppointmentCalendarInput = {
  appointmentId: string;
  client: WorldHubCalendarPerson;
  coach?: WorldHubCalendarPerson | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  status: string;
  locationType: string;
  locationDetails?: string | null;
  includeAttendees?: boolean;
};

export type WorldHubGoogleCalendarEventPayload = {
  summary: string;
  description: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  extendedProperties: {
    private: {
      appointmentId: string;
      source: "high-ground-studio";
    };
  };
};

function displayName(person: WorldHubCalendarPerson | null | undefined) {
  return person?.name?.trim() || person?.email?.trim() || "Unknown";
}

function attendeeFor(person: WorldHubCalendarPerson | null | undefined) {
  const email = person?.email?.trim();

  if (!email) {
    return null;
  }

  const name = person?.name?.trim();

  return {
    email,
    ...(name ? { displayName: name } : {}),
  };
}

function locationLabel(locationType: string, locationDetails?: string | null) {
  return (
    locationDetails?.trim() ||
    (locationType === "IN_PERSON"
      ? "In person"
      : locationType.replace(/_/g, " ").toLowerCase())
  );
}

export function buildWorldHubAppointmentCalendarEvent({
  appointmentId,
  client,
  coach,
  scheduledStart,
  scheduledEnd,
  timezone,
  status,
  locationType,
  locationDetails,
  includeAttendees = false,
}: WorldHubAppointmentCalendarInput): WorldHubGoogleCalendarEventPayload {
  const attendees = [attendeeFor(client), attendeeFor(coach)].filter(
    (item): item is NonNullable<typeof item> => Boolean(item),
  );
  const location = locationLabel(locationType, locationDetails);
  const description = [
    "High Ground Odyssey coaching appointment.",
    `Appointment ID: ${appointmentId}`,
    `Status: ${status.replace(/_/g, " ").toLowerCase()}`,
    `Client: ${displayName(client)}`,
    coach ? `Coach: ${displayName(coach)}` : "Coach: Unassigned",
  ].join("\n");

  return {
    summary: `High Ground coaching: ${displayName(client)}`,
    description,
    location,
    start: {
      dateTime: scheduledStart.toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: scheduledEnd.toISOString(),
      timeZone: timezone,
    },
    ...(includeAttendees && attendees.length ? { attendees } : {}),
    extendedProperties: {
      private: {
        appointmentId,
        source: "high-ground-studio",
      },
    },
  };
}
