/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const updatedAt = new Date("2026-07-24T18:00:00.000Z");

describe("mobile Capture Work contract", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails before project or work reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(new Request("http://localhost/api/mobile/capture/work"));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects a project outside the actor's explicit grants", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{
      id: "project-1",
      slug: "home-person",
      name: "Home",
      role: "OWNER",
      sourceLabel: "nest-kind:home",
      updatedAt,
    }] as never);

    const response = await GET(new Request("http://localhost/api/mobile/capture/work?projectId=project-other"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "WORK_PROJECT_FORBIDDEN" });
  });

  it("returns the selected canonical Nest workspace and excludes unreviewed transcript candidates", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(updatedAt);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([
      { id: "project-home", slug: "home-person", name: "Home", role: "OWNER", sourceLabel: "nest-kind:home", updatedAt },
      { id: "project-1", slug: "high-ground", name: "High Ground", role: "EDITOR", sourceLabel: "nest-kind:production", updatedAt },
      { id: "project-view", slug: "reference", name: "Reference", role: "VIEWER", sourceLabel: "nest-kind:research", updatedAt },
    ] as never);
    const prisma = {
      actionItem: { findMany: jest.fn().mockResolvedValue([
        {
          id: "candidate",
          title: "Maybe do this",
          detail: null,
          status: "OPEN",
          dueAt: null,
          updatedAt,
          sourceJson: { source: "transcript-packet-builder", candidate: true },
          project: { id: "project-1", name: "High Ground", slug: "high-ground" },
          room: null,
          reminder: null,
          recurrenceOccurrence: null,
          tagLinks: [],
        },
        {
          id: "task-1",
          title: "Proof-listen the opening",
          detail: "Compare it against the recording.",
          status: "OPEN",
          dueAt: new Date("2026-07-23T18:00:00.000Z"),
          updatedAt,
          sourceJson: {},
          project: { id: "project-1", name: "High Ground", slug: "high-ground" },
          room: null,
          reminder: null,
          recurrenceOccurrence: null,
          tagLinks: [{ tag: { id: "tag-1", label: "Episode 4" } }],
        },
      ]) },
      goal: { findMany: jest.fn().mockResolvedValue([{
        id: "goal-1",
        title: "Publish a trustworthy episode",
        description: "Finish the human review loop.",
        status: "ACTIVE",
        targetAt: null,
        updatedAt,
        sourceJson: {},
        project: { id: "project-1", name: "High Ground", slug: "high-ground" },
        room: null,
        progressReceipts: [{ progressPercent: 60, note: "First proof pass complete." }],
        tagLinks: [{ tag: { id: "tag-1", label: "Episode 4" } }],
      }]) },
      studioDocument: { findMany: jest.fn().mockResolvedValue([{
        id: "note-1",
        projectId: "project-1",
        stableId: "mobile-note-1",
        title: "Opening idea",
        sourceLabel: "document-kind:note;origin:ios-capture",
        projectionStatus: "private",
        isPrivate: true,
        tagRevision: 3,
        updatedAt,
        project: { id: "project-1", slug: "high-ground", name: "High Ground" },
        blocks: [
          {
            id: "title-block",
            documentId: "note-1",
            stableId: "mobile-note-1-title",
            order: 0,
            title: "Note Title",
            body: "Opening idea",
            sourceLabel: "document-kind:note;origin:ios-capture",
            externalId: null,
            updatedAt,
            taggedSpans: [],
          },
          {
            id: "body-block",
            documentId: "note-1",
            stableId: "mobile-note-1-body",
            order: 1,
            title: null,
            body: "Begin with the surprising admission.",
            sourceLabel: "document-kind:note;origin:ios-capture",
            externalId: null,
            updatedAt,
            taggedSpans: [],
          },
        ],
        tagLinks: [{ tagId: "tag-1" }],
      }]) },
      studioTag: { findMany: jest.fn().mockResolvedValue([
        { id: "tag-1", projectId: "project-1", slug: "episode-4", label: "Episode 4", isActive: true },
        { id: "tag-old", projectId: "project-1", slug: "old", label: "Old", isActive: false },
      ]) },
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    const response = await GET(new Request("http://localhost/api/mobile/capture/work?projectId=project-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      workspaceKind: "quipsly-mobile-work-v1",
      selectedProjectId: "project-1",
      projects: [
        { id: "project-home", canWrite: true, isHomeNest: true },
        { id: "project-1", canWrite: true },
        { id: "project-view", canWrite: false },
      ],
      workspace: {
        project: { id: "project-1", role: "EDITOR", canWrite: true },
        tasks: [{ id: "task-1", isOverdue: true, tagIds: ["tag-1"] }],
        goals: [{ id: "goal-1", progressPercent: 60, progressNote: "First proof pass complete." }],
        notes: [{
          id: "note-1",
          excerpt: "Begin with the surprising admission.",
          tagRevision: 3,
          canEditTags: true,
          canEditContent: true,
          contentRevision: expect.stringMatching(/^[0-9a-f]{64}$/),
          blocks: [{
            id: "body-block",
            stableId: "mobile-note-1-body",
            order: 1,
            body: "Begin with the surprising admission.",
          }],
          tagLabels: ["Episode 4"],
          webPath: "/create?project=high-ground&document=note-1",
        }],
        tags: [
          { id: "tag-1", usageCount: 3, isActive: true },
          { id: "tag-old", usageCount: 0, isActive: false },
        ],
      },
      boundaries: {
        actorScoped: true,
        explicitProjectGrantRequired: true,
        protectedOfflineSnapshotSupported: true,
        externalSideEffects: false,
      },
    });
    expect(payload.workspace.tasks).toHaveLength(1);
    expect(prisma.actionItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.any(Array) }),
    }));
    jest.useRealTimers();
  });
});
