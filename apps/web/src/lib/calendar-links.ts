const GOOGLE_CALENDAR_BASE_URL =
  "https://calendar.google.com/calendar/render?action=TEMPLATE";

function formatGoogleCalendarDate(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

type GoogleCalendarEventUrlInput = {
  title: string;
  start: Date;
  end: Date;
  details: string;
  location: string;
  guestEmail?: string | null;
};

export function buildGoogleCalendarEventUrl({
  title,
  start,
  end,
  details,
  location,
  guestEmail,
}: GoogleCalendarEventUrlInput) {
  const params = new URLSearchParams({
    text: title,
    dates: `${formatGoogleCalendarDate(start)}/${formatGoogleCalendarDate(end)}`,
    details,
    location,
  });

  if (guestEmail?.trim()) {
    params.set("add", guestEmail.trim());
  }

  return `${GOOGLE_CALENDAR_BASE_URL}&${params.toString()}`;
}
