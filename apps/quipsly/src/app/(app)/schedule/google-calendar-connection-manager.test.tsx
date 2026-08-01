import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GoogleCalendarConnectionManager } from "./google-calendar-connection-manager";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

const connectionState = {
  ok: true,
  connection: {
    id: "connection-1",
    status: "VERIFIED",
    accountLabel: "QA Google Calendar",
    verifiedAt: "2026-08-01T18:00:00.000Z",
  },
  calendars: [{
    id: "provider-calendar-1",
    summary: "QA Production",
    primary: false,
    accessRole: "owner",
    timeZone: "America/Denver",
  }],
  selections: [{
    id: "collection-1",
    purpose: "PODCAST_PRODUCTION",
    displayName: "QA Production",
    providerCalendarId: "provider-calendar-1",
    nestId: "project-1",
    timezone: "America/Denver",
    cursor: null,
  }],
};

const conflict = {
  projectionId: "projection-1",
  collection: {
    id: "collection-1",
    displayName: "QA Production",
    purpose: "PODCAST_PRODUCTION",
  },
  session: {
    id: "older-session-1",
    title: "QA Retained · Older episode recording",
    purpose: "PODCAST",
    projectId: "project-1",
    status: "PLANNED",
    scheduledStart: "2026-07-01T18:00:00.000Z",
    scheduledEnd: "2026-07-01T19:00:00.000Z",
    timezone: "America/Denver",
  },
  reason: "provider-version-changed",
  observedAt: "2026-08-01T19:00:00.000Z",
  conflictVersion: "opaque-conflict-version",
  allowedIntents: ["PREPARE_QUIPSLY_UPDATE", "STOP_PROJECTING"],
  providerContentImported: false,
};

describe("Google Calendar conflict review UX", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("keeps an older conflicted Session reachable for explicit preview after local review", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(connectionState))
      .mockResolvedValueOnce(jsonResponse({ ok: true, conflicts: [conflict] }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        intent: "PREPARE_QUIPSLY_UPDATE",
        status: "PLANNED",
        externalMutated: false,
      }))
      .mockResolvedValueOnce(jsonResponse(connectionState))
      .mockResolvedValueOnce(jsonResponse({ ok: true, conflicts: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<GoogleCalendarConnectionManager projects={[]} sessions={[]} />);

    expect(await screen.findByRole("heading", { name: "Google Calendar changes need a decision" })).toBeInTheDocument();
    expect(screen.getByText(/did not import event content or change either calendar/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prepare Quipsly preview" }));

    await waitFor(() => {
      expect(screen.getByText(/Google is unchanged\. Preview the current Quipsly Session below/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Google Calendar changes need a decision" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scheduled Session")).toHaveValue("older-session-1");
    expect(screen.getByRole("option", { name: /QA Retained · Older episode recording/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Verified calendar selection")).toHaveValue("collection-1");

    const reviewRequest = fetchMock.mock.calls[2];
    expect(reviewRequest[0]).toBe("/api/calendar/connections/google/conflicts");
    expect(reviewRequest[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(reviewRequest[1]?.body))).toEqual({
      projectionId: "projection-1",
      expectedConflictVersion: "opaque-conflict-version",
      intent: "PREPARE_QUIPSLY_UPDATE",
    });
  });
});
