/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { resolveGoogleCalendarProjectionConflict } from "@/lib/server/google-calendar-conflict-review";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/google-calendar-conflict-review", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-conflict-review"),
  resolveGoogleCalendarProjectionConflict: jest.fn(),
}));

const actor = {
  user: {
    id: "user-1",
    email: "person@example.com",
    primaryEmail: "person@example.com",
    isStaff: false,
  },
};

function post(body: Record<string, unknown>) {
  return new Request("https://nest.quipsly.com/api/calendar/connections/google/conflicts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Google Calendar conflict review route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects conflict reads before database access when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/connections/google/conflicts"));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns safe canonical context but no provider identity or content", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const database = {
      calendarProjection: {
        findMany: jest.fn().mockResolvedValue([{
          id: "projection-1",
          sourceId: "room-1",
          sourceRevision: "revision-1",
          providerEventId: "provider-event-must-not-escape",
          providerEtag: '"etag-must-not-escape"',
          status: "CONFLICT",
          conflictState: "EXTERNAL_CHANGED",
          metadataJson: {
            reconciliation: { reason: "provider-version-changed" },
          },
          updatedAt: new Date("2026-08-01T05:00:00.000Z"),
          collection: {
            id: "collection-1",
            displayName: "Production",
            purpose: "PODCAST_PRODUCTION",
            nestId: "project-1",
          },
          receipts: [{
            providerStatus: "provider-version-changed",
            occurredAt: new Date("2026-08-01T05:00:00.000Z"),
          }],
        }]),
      },
      callRoom: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{
            id: "room-1",
            title: "Episode recording",
            purpose: "PODCAST",
            projectId: "project-1",
            status: "PLANNED",
            scheduledStart: new Date("2026-08-12T18:00:00.000Z"),
            scheduledEnd: new Date("2026-08-12T19:00:00.000Z"),
            metadataJson: { scheduledTimezone: "America/Denver" },
            booking: null,
          }])
          .mockResolvedValueOnce([]),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/connections/google/conflicts"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.conflicts[0]).toMatchObject({
      projectionId: "projection-1",
      reason: "provider-version-changed",
      allowedIntents: [],
      providerContentImported: false,
      session: { id: "room-1", title: "Episode recording" },
    });
    expect(payload.conflicts[0].conflictVersion).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("provider-event-must-not-escape");
    expect(serialized).not.toContain("etag-must-not-escape");
  });

  it("rejects incomplete decisions before persistence", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const response = await POST(post({ projectionId: "projection-1", intent: "DELETE_GOOGLE" }));
    expect(response.status).toBe(400);
    expect(resolveGoogleCalendarProjectionConflict).not.toHaveBeenCalled();
  });

  it("records an explicit local-only conflict decision", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(resolveGoogleCalendarProjectionConflict).mockResolvedValue({
      projectionId: "projection-1",
      receiptId: "receipt-1",
      intent: "STOP_PROJECTING",
      status: "REVOKED",
      idempotentReplay: false,
      externalMutated: false,
    });
    const response = await POST(post({
      projectionId: "projection-1",
      expectedConflictVersion: "a".repeat(64),
      intent: "STOP_PROJECTING",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { status: "REVOKED", externalMutated: false },
    });
    expect(resolveGoogleCalendarProjectionConflict).toHaveBeenCalledWith(expect.objectContaining({
      actor: actor.user,
      projectionId: "projection-1",
      expectedConflictVersion: "a".repeat(64),
      intent: "STOP_PROJECTING",
    }));
  });
});
