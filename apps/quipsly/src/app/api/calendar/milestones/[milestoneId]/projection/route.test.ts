/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  cancelGoogleCalendarProjection,
  writeGoogleCalendarProjection,
} from "@/lib/server/google-calendar-session-projection";
import {
  decryptGoogleRefreshToken,
  getGoogleCalendarOAuthConfig,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { DELETE, GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ resolveStudioProjectAccess: jest.fn() }));
jest.mock("@/lib/server/google-calendar-oauth", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-oauth"),
  decryptGoogleRefreshToken: jest.fn(),
  getGoogleCalendarOAuthConfig: jest.fn(),
  refreshGoogleCalendarAccess: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-session-projection", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-session-projection"),
  cancelGoogleCalendarProjection: jest.fn(),
  writeGoogleCalendarProjection: jest.fn(),
}));

const actor = {
  user: {
    id: "user-1",
    email: "producer@example.test",
    primaryEmail: "producer@example.test",
    isStaff: false,
  },
};

function milestone(status = "PLANNED") {
  return {
    id: "milestone-1",
    title: "Rough cut ready for review",
    kind: "ROUGH_CUT",
    status,
    startsAt: new Date("2026-08-10T18:00:00.000Z"),
    endsAt: null,
    timezone: "America/Denver",
    episodeProduction: {
      title: "The Swear Jar",
      slug: "the-swear-jar",
      project: { id: "project-1", slug: "high-ground-odyssey" },
    },
  };
}

function collection() {
  return {
    id: "collection-1",
    connectionId: "connection-1",
    displayName: "HGO Production",
    purpose: "PODCAST_PRODUCTION",
    visibility: "TEAM",
    timezone: "America/Denver",
    providerCalendarId: "provider-calendar-id",
    connection: { oauthCredential: { encryptedPayload: "encrypted-token" } },
  };
}

function database(overrides: Record<string, any> = {}) {
  return {
    studioEpisodeMilestone: { findUnique: jest.fn().mockResolvedValue(milestone()) },
    calendarCollection: { findFirst: jest.fn().mockResolvedValue(collection()) },
    calendarProjection: { findUnique: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

function request(method: "POST" | "DELETE", body: Record<string, unknown>) {
  return new Request("https://nest.quipsly.com/api/calendar/milestones/milestone-1/projection", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Production milestone Google Calendar projection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      role: "EDITOR",
      source: "grant",
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
    });
  });

  it("rejects signed-out preview before reading milestone or provider state", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/milestones/milestone-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("previews one exact point milestone without reading Google or copying private episode context", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const prisma = database();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/milestones/milestone-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.preview).toMatchObject({
      action: "CREATE",
      sendUpdates: "none",
      snapshot: {
        sourceType: "StudioEpisodeMilestone",
        title: "Rough cut ready for review",
        providerTransparency: "transparent",
        attendeesIncluded: false,
        privateSessionContentIncluded: false,
      },
    });
    expect(body.preview.snapshot.endsAt).toBe("2026-08-10T18:30:00.000Z");
    expect(body.externalSideEffects).toBe(false);
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/encrypted-token|provider-calendar-id|producer@example/i);
  });

  it("requires current episode Nest edit access before any provider write", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      role: "VIEWER",
      source: "grant",
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
    });
    jest.mocked(getPrismaClient).mockReturnValue(database() as never);
    const response = await POST(
      request("POST", { collectionId: "collection-1", expectedSourceRevision: "revision" }),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    expect(response.status).toBe(404);
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
    expect(writeGoogleCalendarProjection).not.toHaveBeenCalled();
  });

  it("persists the exact provider version and effect receipt after preview confirmation", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const transaction = {
      calendarProjection: { upsert: jest.fn().mockResolvedValue({ id: "projection-1" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-1" }) },
    };
    const prisma = database({ $transaction: jest.fn(async (operation) => operation(transaction)) });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getGoogleCalendarOAuthConfig).mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
    jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
    jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
    jest.mocked(writeGoogleCalendarProjection).mockResolvedValue({
      outcome: "SYNCED",
      externalMutated: true,
      providerEventId: "provider-event-1",
      providerEtag: '"etag-1"',
      providerUpdatedAt: "2026-08-02T12:00:00.000Z",
      providerStatus: "confirmed",
      recoveredCreate: false,
    });
    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/milestones/milestone-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    const preview = (await previewResponse.json()).preview;
    const response = await POST(
      request("POST", { collectionId: "collection-1", expectedSourceRevision: preview.sourceRevision }),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { projectionId: "projection-1", receiptId: "receipt-1", externalMutated: true } });
    expect(writeGoogleCalendarProjection).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access-token",
      calendarId: "provider-calendar-id",
      preview: expect.objectContaining({ action: "CREATE" }),
    }));
    expect(transaction.calendarProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        sourceType: "StudioEpisodeMilestone",
        sourceId: "milestone-1",
        providerEventId: "provider-event-1",
      }),
    }));
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operation: "CREATE_EVENT", outcome: "SUCCEEDED", externalMutated: true }),
    });
  });

  it("requires a separate explicit removal after the canonical milestone is canceled", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const transaction = {
      calendarProjection: { upsert: jest.fn().mockResolvedValue({ id: "projection-1" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-1" }) },
    };
    const prisma = database({
      studioEpisodeMilestone: { findUnique: jest.fn().mockResolvedValue(milestone("CANCELED")) },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(cancelGoogleCalendarProjection).mockResolvedValue({
      outcome: "ALREADY_ABSENT",
      externalMutated: false,
      providerEventId: null,
      providerEtag: null,
      providerUpdatedAt: null,
      providerStatus: "not-projected",
      providerAlreadyAbsent: true,
    });
    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/milestones/milestone-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    const preview = (await previewResponse.json()).preview;
    const postResponse = await POST(
      request("POST", { collectionId: "collection-1", expectedSourceRevision: preview.sourceRevision }),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    expect(postResponse.status).toBe(409);
    expect(cancelGoogleCalendarProjection).not.toHaveBeenCalled();

    const response = await DELETE(
      request("DELETE", { collectionId: "collection-1", expectedSourceRevision: preview.sourceRevision, confirmCancellation: true }),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { action: "CANCEL", providerAlreadyAbsent: true, externalMutated: false } });
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operation: "CANCEL_EVENT", outcome: "SKIPPED", providerStatus: "not-projected" }),
    });
  });

  it("records a conflict when the milestone changes after Google accepts the write", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const changed = { ...milestone(), title: "Rough cut approved" };
    const transaction = {
      calendarProjection: { upsert: jest.fn().mockResolvedValue({ id: "projection-conflict" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-conflict" }) },
    };
    const prisma = database({
      studioEpisodeMilestone: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(milestone())
          .mockResolvedValueOnce(milestone())
          .mockResolvedValueOnce(changed),
      },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getGoogleCalendarOAuthConfig).mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
    jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
    jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
    jest.mocked(writeGoogleCalendarProjection).mockResolvedValue({
      outcome: "SYNCED",
      externalMutated: true,
      providerEventId: "provider-event-1",
      providerEtag: '"etag-1"',
      providerUpdatedAt: "2026-08-02T12:00:00.000Z",
      providerStatus: "confirmed",
      recoveredCreate: false,
    });
    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/milestones/milestone-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );
    const preview = (await previewResponse.json()).preview;

    const response = await POST(
      request("POST", { collectionId: "collection-1", expectedSourceRevision: preview.sourceRevision }),
      { params: Promise.resolve({ milestoneId: "milestone-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "source-changed-after-provider-effect",
      providerWriteAttempted: true,
      externalSideEffects: true,
      projectionId: "projection-conflict",
      receiptId: "receipt-conflict",
    });
    expect(transaction.calendarProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: "CONFLICT", conflictState: "QUIPSLY_CHANGED" }),
    }));
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "CONFLICT", externalMutated: true }),
    });
  });
});
