/** @jest-environment node */

import {
  GOOGLE_CALENDAR_RECONCILIATION_FIELDS,
  readGoogleCalendarReconciliation,
  reconcileGoogleCalendarProjectionStates,
} from "./google-calendar-reconciliation";

function projection(overrides: Record<string, unknown> = {}) {
  return {
    id: "projection-1",
    providerEventId: "event-1",
    providerEtag: '"etag-1"',
    providerUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
    sourceType: "CallRoom",
    sourceId: "room-1",
    sourceRevision: "revision-1",
    status: "SYNCED",
    conflictState: "NONE",
    ...overrides,
  };
}

function providerEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    etag: '"etag-1"',
    status: "confirmed",
    updatedAt: "2026-08-01T01:00:00.000Z",
    quipslySourceType: "CallRoom",
    quipslySourceId: "room-1",
    quipslySourceRevision: "revision-1",
    quipslySchema: "quipsly-session-calendar-snapshot-v1",
    ...overrides,
  };
}

describe("Google Calendar reconciliation provider read", () => {
  it("paginates with the exact stable query and extracts no event content", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "event-1",
                etag: '"etag-1"',
                status: "confirmed",
                summary: "must never leave provider response parsing",
                attendees: [{ email: "private@example.com" }],
                extendedProperties: {
                  private: {
                    quipslySourceType: "CallRoom",
                    quipslySourceId: "room-1",
                  },
                },
              },
            ],
            nextPageToken: "page-2",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "event-1",
                etag: '"etag-2"',
                status: "confirmed",
                extendedProperties: {
                  private: {
                    quipslySourceType: "CallRoom",
                    quipslySourceId: "room-1",
                  },
                },
              },
            ],
            nextSyncToken: "next-sync-token",
          }),
          { status: 200 },
        ),
      );
    const result = await readGoogleCalendarReconciliation({
      accessToken: "access-token",
      calendarId: "calendar@example.com",
      syncToken: "prior-sync-token",
      fetchImpl,
    });
    expect(result).toMatchObject({
      status: "SYNCED",
      mode: "INCREMENTAL",
      nextSyncToken: "next-sync-token",
      pageCount: 2,
    });
    if (result.status !== "SYNCED")
      throw new Error("Expected a completed sync.");
    expect(result.events).toEqual([
      expect.objectContaining({
        id: "event-1",
        etag: '"etag-2"',
        quipslySourceId: "room-1",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("must never leave");
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    const first = new URL(fetchImpl.mock.calls[0][0]);
    const second = new URL(fetchImpl.mock.calls[1][0]);
    for (const url of [first, second]) {
      expect(url.searchParams.get("syncToken")).toBe("prior-sync-token");
      expect(url.searchParams.get("showDeleted")).toBe("true");
      expect(url.searchParams.get("singleEvents")).toBe("false");
      expect(url.searchParams.get("fields")).toBe(
        GOOGLE_CALENDAR_RECONCILIATION_FIELDS,
      );
    }
    expect(second.searchParams.get("pageToken")).toBe("page-2");
    expect(fetchImpl.mock.calls[0][1]).toEqual({
      headers: { Authorization: "Bearer access-token" },
    });
  });

  it("returns an explicit reset instruction for an expired incremental token", async () => {
    const result = await readGoogleCalendarReconciliation({
      accessToken: "access-token",
      calendarId: "calendar-id",
      syncToken: "expired",
      fetchImpl: jest
        .fn()
        .mockResolvedValue(new Response(null, { status: 410 })),
    });
    expect(result).toEqual({
      status: "RESET_REQUIRED",
      mode: "INCREMENTAL",
      events: [],
      nextSyncToken: null,
      pageCount: 1,
    });
  });
});

describe("Google Calendar projection reconciliation", () => {
  it("marks a Google-side version change as conflict without importing private fields", () => {
    const result = reconcileGoogleCalendarProjectionStates({
      mode: "INCREMENTAL",
      projections: [projection()],
      events: [providerEvent({ etag: '"etag-external"' })],
    });
    expect(result.decisions).toEqual([
      expect.objectContaining({
        projectionId: "projection-1",
        status: "CONFLICT",
        conflictState: "EXTERNAL_CHANGED",
        providerStatus: "provider-version-changed",
      }),
    ]);
  });

  it("distinguishes external deletion, verified cancellation, and restoration", () => {
    const externalDelete = reconcileGoogleCalendarProjectionStates({
      mode: "INCREMENTAL",
      projections: [projection()],
      events: [providerEvent({ status: "cancelled" })],
    });
    expect(externalDelete.decisions[0]).toMatchObject({
      status: "MISSING",
      outcome: "CONFLICT",
      providerStatus: "provider-event-cancelled",
    });

    const verifiedCancellation = reconcileGoogleCalendarProjectionStates({
      mode: "INCREMENTAL",
      projections: [projection({ status: "CANCELED", providerEtag: null })],
      events: [providerEvent({ status: "cancelled" })],
    });
    expect(verifiedCancellation.decisions[0]).toMatchObject({
      status: "CANCELED",
      outcome: "SUCCEEDED",
      providerStatus: "provider-cancellation-verified",
    });

    const restored = reconcileGoogleCalendarProjectionStates({
      mode: "INCREMENTAL",
      projections: [projection({ status: "CANCELED", providerEtag: null })],
      events: [providerEvent()],
    });
    expect(restored.decisions[0]).toMatchObject({
      status: "CONFLICT",
      outcome: "CONFLICT",
      providerStatus: "provider-event-restored",
    });
  });

  it("marks absent projected events only after a full collection read", () => {
    const incremental = reconcileGoogleCalendarProjectionStates({
      mode: "INCREMENTAL",
      projections: [projection()],
      events: [],
    });
    expect(incremental.decisions).toHaveLength(0);
    const full = reconcileGoogleCalendarProjectionStates({
      mode: "FULL",
      projections: [projection()],
      events: [],
    });
    expect(full.decisions[0]).toMatchObject({
      status: "MISSING",
      providerStatus: "provider-event-missing",
    });
  });

  it("fails closed when a provider event reuses Quipsly identity without its linkage", () => {
    const result = reconcileGoogleCalendarProjectionStates({
      mode: "FULL",
      projections: [projection()],
      events: [providerEvent({ quipslySourceId: null })],
    });
    expect(result.decisions[0]).toMatchObject({
      status: "CONFLICT",
      providerStatus: "provider-identity-mismatch",
    });
  });
});
