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

    render(<GoogleCalendarConnectionManager projects={[]} sessions={[]} milestones={[]} />);

    expect(await screen.findByRole("heading", { name: "Google Calendar and Quipsly both changed" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing was overwritten\. Choose what should happen to each item whenever you are ready\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prepare Quipsly preview" }));

    await waitFor(() => {
      expect(screen.getByText(/Google is unchanged\. Preview the current Quipsly source below/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Google Calendar and Quipsly both changed" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quipsly source")).toHaveValue("SESSION:older-session-1");
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

  it("previews a production milestone through its project-bound Google selection", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(connectionState))
      .mockResolvedValueOnce(jsonResponse({ ok: true, conflicts: [] }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        preview: {
          action: "CREATE",
          sourceRevision: "milestone-revision-1",
          snapshot: {
            sourceType: "StudioEpisodeMilestone",
            title: "Rough cut ready",
            description: "Open Quipsly for the episode production context.",
            startsAt: "2026-08-12T18:00:00.000Z",
            endsAt: "2026-08-12T18:30:00.000Z",
            timezone: "America/Denver",
            status: "CONFIRMED",
            providerVisibility: "default",
          },
          warning: "Confirming changes one owned Google calendar with notifications disabled and no attendees.",
        },
      }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<GoogleCalendarConnectionManager
      projects={[{ id: "project-1", name: "High Ground Odyssey" }]}
      sessions={[]}
      milestones={[{
        id: "milestone-1",
        title: "Rough cut ready",
        projectId: "project-1",
        startsAt: "2026-08-12T18:00:00.000Z",
        endsAt: null,
        timezone: "America/Denver",
        status: "PLANNED",
        episodeTitle: "The Swear Jar",
      }]}
    />);

    expect(await screen.findByLabelText("Quipsly source")).toHaveValue("PRODUCTION_MILESTONE:milestone-1");
    expect(screen.getByRole("option", { name: /Milestone · The Swear Jar · Rough cut ready/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Verified calendar selection")).toHaveValue("collection-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Preview Google event" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Preview Google event" }));

    expect(await screen.findByRole("heading", { name: "Rough cut ready" })).toBeInTheDocument();
    expect(screen.getByText(/Notifications off · No attendees/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/calendar/milestones/milestone-1/projection?collectionId=collection-1",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ cache: "no-store" });
  });
});
