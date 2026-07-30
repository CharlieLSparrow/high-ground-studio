/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { filePersonalSourceIntoResearch } from "@/lib/server/personal-source-filing";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/personal-source-filing", () => ({ filePersonalSourceIntoResearch: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const actor = {
  user: {
    id: "user-1",
    primaryEmail: " Researcher@Example.com ",
    email: "researcher@example.com",
  },
};

describe("mobile private source Inbox", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as any);
  });

  it("denies signed-out reads before touching private persistence", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/inbox"));

    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns only actor-owned unfiled captures and writable Research destinations", async () => {
    const snippetFindMany = jest.fn().mockResolvedValue([{
      id: "snippet-1",
      sourceTitle: "Curiosity",
      highlightedText: "Be curious, not judgmental.",
      sourceUrl: "https://example.com/curiosity",
      updatedAt: new Date("2026-07-30T09:00:00.000Z"),
      _count: { captureReceipts: 2 },
      captureReceipts: [{ capturedAt: new Date("2026-07-30T09:10:00.000Z") }],
    }]);
    const bookmarkFindMany = jest.fn().mockResolvedValue([{
      id: "bookmark-1",
      title: "Coaching source",
      url: "https://example.com/coaching",
      updatedAt: new Date("2026-07-30T08:00:00.000Z"),
      _count: { captureReceipts: 1 },
      captureReceipts: [{ capturedAt: new Date("2026-07-30T08:00:00.000Z") }],
    }]);
    jest.mocked(getPrismaClient).mockReturnValue({
      snippet: { findMany: snippetFindMany },
      bookmark: { findMany: bookmarkFindMany },
    } as any);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([
      { id: "project-edit", slug: "episode", name: "Episode", role: "EDITOR", sourceLabel: "show" },
      { id: "project-view", slug: "archive", name: "Archive", role: "VIEWER", sourceLabel: "archive" },
    ] as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/inbox"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(snippetFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", collectionId: null, researchFilings: { none: {} } },
    }));
    expect(bookmarkFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", collectionId: null, researchFilings: { none: {} } },
    }));
    expect(payload).toMatchObject({
      ok: true,
      inboxKind: "quipsly-mobile-source-inbox-v1",
      sources: [
        {
          id: "snippet-1",
          captureType: "SNIPPET",
          captureCount: 2,
          updatedAt: "2026-07-30T09:00:00.000Z",
        },
        {
          id: "bookmark-1",
          captureType: "BOOKMARK",
          captureCount: 1,
        },
      ],
      destinations: [{ id: "project-edit", role: "EDITOR" }],
      boundaries: {
        actorOwnedPrivateInbox: true,
        writableResearchDestinationsOnly: true,
        privateCaptureMutated: false,
        externalSideEffects: false,
      },
    });
  });

  it("requires one stable, revision-bound filing decision", async () => {
    const response = await POST(new Request("http://localhost/api/mobile/capture/inbox", {
      method: "POST",
      body: JSON.stringify({
        action: "file-source",
        captureId: "snippet-1",
        captureType: "SNIPPET",
        projectId: "project-1",
        clientRequestId: "not-a-uuid",
        expectedCaptureUpdatedAt: "2026-07-30T09:00:00.000Z",
      }),
    }));

    expect(response.status).toBe(400);
    expect(filePersonalSourceIntoResearch).not.toHaveBeenCalled();
  });

  it("files the same private source through the canonical idempotent service", async () => {
    jest.mocked(getPrismaClient).mockReturnValue({} as any);
    jest.mocked(filePersonalSourceIntoResearch).mockResolvedValue({
      ok: true,
      filingId: "filing-1",
      sourceUnitId: "source-1",
      projectId: "project-1",
      projectSlug: "episode",
      projectName: "Episode",
      captureId: "snippet-1",
      captureType: "SNIPPET",
      reused: false,
      href: "/research?source=source-1",
    });
    const requestId = "5f7a3e4d-33eb-4fc8-943f-5922d14922d4";

    const response = await POST(new Request("http://localhost/api/mobile/capture/inbox", {
      method: "POST",
      body: JSON.stringify({
        action: "file-source",
        captureId: "snippet-1",
        captureType: "SNIPPET",
        projectId: "project-1",
        clientRequestId: requestId,
        expectedCaptureUpdatedAt: "2026-07-30T09:00:00.000Z",
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(filePersonalSourceIntoResearch).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "user-1",
      actorEmail: "researcher@example.com",
      captureId: "snippet-1",
      captureType: "SNIPPET",
      projectId: "project-1",
      clientRequestId: requestId,
      expectedCaptureUpdatedAt: new Date("2026-07-30T09:00:00.000Z"),
    }));
    expect(payload).toMatchObject({
      ok: true,
      action: "file-source",
      captureId: "snippet-1",
      sourceUnitId: "source-1",
      boundaries: {
        immutableResearchSourceCreated: true,
        privateCaptureMutated: false,
        externalSideEffects: false,
      },
    });
  });

  it("holds viewer or revision conflicts without fabricating success", async () => {
    jest.mocked(getPrismaClient).mockReturnValue({} as any);
    jest.mocked(filePersonalSourceIntoResearch).mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      message: "This private source changed after the phone review.",
    });

    const response = await POST(new Request("http://localhost/api/mobile/capture/inbox", {
      method: "POST",
      body: JSON.stringify({
        action: "file-source",
        captureId: "bookmark-1",
        captureType: "BOOKMARK",
        projectId: "project-view",
        clientRequestId: "91384103-fee4-47fd-ae6a-027cfcff1081",
        expectedCaptureUpdatedAt: "2026-07-30T08:00:00.000Z",
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
  });
});
