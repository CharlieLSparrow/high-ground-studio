/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { searchWorkspace } from "@/lib/server/workspace-search";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/workspace-search", () => ({
  normalizeWorkspaceSearchQuery: (value: unknown) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "",
  searchWorkspace: jest.fn(),
}));

describe("mobile Capture search contract", () => {
  const voiceWritingDraftId = "7a9b10f0-97bd-4bbb-a7dd-0b93fbc5918b";

  beforeEach(() => jest.clearAllMocks());

  it("does not disclose search or project data while signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);

    const response = await GET(new Request("http://localhost/api/mobile/capture/search?q=paper"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(listProjectsVisibleToEmail).not.toHaveBeenCalled();
    expect(searchWorkspace).not.toHaveBeenCalled();
  });

  it("does no persistence work for a query shorter than two characters", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);

    const response = await GET(new Request("http://localhost/api/mobile/capture/search?q=p"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      schema: "quipsly-mobile-search-v1",
      results: [],
      boundaries: { minimumQueryLength: 2 },
    });
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(searchWorkspace).not.toHaveBeenCalled();
  });

  it("maps permission-filtered canonical results with owned and shared Nest context", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "Person@Example.com" },
    } as never);
    const prisma = {};
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([
      {
        id: "home-1",
        slug: "home-person",
        name: "My Nest",
        role: "OWNER",
        sourceLabel: "nest-kind:home",
        updatedAt: new Date("2026-08-28T00:00:00.000Z"),
      },
      {
        id: "shared-1",
        slug: "doctoral-research",
        name: "Doctoral research",
        role: "EDITOR",
        sourceLabel: "nest-kind:research",
        updatedAt: new Date("2026-08-28T00:00:00.000Z"),
      },
    ] as never);
    jest.mocked(searchWorkspace).mockResolvedValue({
      query: "paper idea",
      projectCount: 2,
      tasks: [{
        id: "task-1",
        title: "Draft the methods paper",
        detail: "Use the voice outline",
        status: "OPEN",
        project: { id: "shared-1", slug: "doctoral-research", name: "Doctoral research" },
        tagLinks: [{ tag: { id: "tag-writing", label: "Writing", isActive: true } }],
      }],
      goals: [],
      sessions: [],
      notes: [{
        id: "session-note-1",
        title: "Paper direction",
        body: "Keep the lived experience in the introduction.",
        room: { id: "room-1", title: "Coaching session" },
        tagLinks: [],
      }],
      documents: [{
        id: `voice-writing-${voiceWritingDraftId}`,
        title: "Dissertation chapter idea",
        sourceLabel: "document-kind:note;origin:ios-voice-writing",
        projectionStatus: "private",
        project: { slug: "home-person", name: "My Nest" },
        tagLinks: [],
        blocks: [{ id: "block-1", title: null, body: "The first spoken paragraph." }],
      }],
      sources: [],
      annotations: [],
      tags: [],
      mediaClips: [],
      tagFocus: null,
      boundaries: {
        actorScoped: true,
        minimumQueryLength: 2,
        unreviewedTranscriptCandidatesExcluded: true,
        externalSideEffects: false,
      },
    } as never);

    const response = await GET(
      new Request("http://localhost/api/mobile/capture/search?q=paper%20idea"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(listProjectsVisibleToEmail).toHaveBeenCalledWith("person@example.com", prisma);
    expect(searchWorkspace).toHaveBeenCalledWith(prisma, expect.objectContaining({
      actorUserId: "actor-1",
      query: "paper idea",
    }));
    expect(payload).toMatchObject({
      ok: true,
      schema: "quipsly-mobile-search-v1",
      query: "paper idea",
      projectCount: 2,
      results: [
        {
          id: "task-1",
          kind: "TASK",
          project: { id: "shared-1", role: "EDITOR", isHomeNest: false },
          nativeTargetId: "task-1",
          tags: [{ id: "tag-writing", label: "Writing" }],
        },
        {
          id: "session-note-1",
          kind: "SESSION_NOTE",
          nativeTargetId: "room-1",
        },
        {
          id: `voice-writing-${voiceWritingDraftId}`,
          kind: "WRITING",
          project: { id: "home-1", isHomeNest: true },
          nativeTargetId: voiceWritingDraftId,
          nativeDestination: "WRITING",
          webPath: `/writing/${voiceWritingDraftId}`,
        },
      ],
      boundaries: {
        actorScoped: true,
        explicitProjectGrantRequired: true,
        externalSideEffects: false,
      },
    });
  });
});
