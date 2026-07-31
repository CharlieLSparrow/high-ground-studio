/** @jest-environment node */

import { normalizeWorkspaceSearchQuery, searchWorkspace } from "./workspace-search";

describe("permission-filtered workspace search", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not read persistence for an incomplete query", async () => {
    const prisma = { actionItem: { findMany: jest.fn() } } as any;
    const result = await searchWorkspace(prisma, { actorUserId: "user-1", query: " x ", visibleProjects: [] });
    expect(result.query).toBe("x");
    expect(result.tasks).toEqual([]);
    expect(prisma.actionItem.findMany).not.toHaveBeenCalled();
  });

  it("searches scoped canonical records and excludes unreviewed transcript candidates", async () => {
    const actionItemFindMany = jest.fn().mockResolvedValue([
      { id: "task-1", title: "Proof-listen episode", detail: null, status: "OPEN", dueAt: null, sourceJson: { source: "manual" }, room: { id: "room-1", title: "Episode review" }, project: { id: "project-1", name: "High Ground", slug: "high-ground" }, tagLinks: [{ tag: { id: "tag-1", slug: "proof", label: "Proof", isActive: true } }] },
      { id: "candidate", title: "Proof maybe", detail: null, status: "OPEN", dueAt: null, sourceJson: { source: "transcript-packet-builder", candidate: true }, room: { id: "room-1", title: "Episode review" }, project: null, tagLinks: [] },
    ]);
    const annotationFindMany = jest.fn().mockResolvedValue([{ id: "annotation-1", kind: "quote", body: "Proof before release", exactText: "Proof", visibility: "private", sourceUnit: { title: "Production philosophy" }, project: { name: "High Ground", slug: "high-ground" } }]);
    const noteFindMany = jest.fn().mockResolvedValue([{ id: "note-1", title: "Proof insight", body: "Proof this next", kind: "SESSION_NOTE", visibility: "AUTHOR_PRIVATE", updatedAt: new Date(), room: { id: "room-1", title: "Episode review" }, tagLinks: [{ tag: { id: "tag-1", slug: "proof", label: "Proof", isActive: true } }] }]);
    const prisma = {
      actionItem: { findMany: actionItemFindMany },
      goal: { findMany: jest.fn().mockResolvedValue([{ id: "goal-1", title: "Proof the episode", description: null, status: "ACTIVE", project: { id: "project-1", name: "High Ground", slug: "high-ground" }, room: null, tagLinks: [{ tag: { id: "tag-1", slug: "proof", label: "Proof", isActive: true } }] }]) },
      callRoom: { findMany: jest.fn().mockResolvedValue([{ id: "room-1", title: "Episode review", purpose: "PODCAST", status: "ENDED", projectSlug: "high-ground", scheduledStart: null, project: { id: "project-1", name: "High Ground", slug: "high-ground" }, tagLinks: [{ tag: { id: "tag-1", slug: "proof", label: "Proof", isActive: true } }] }]) },
      coachingNote: { findMany: noteFindMany },
      studioSourceUnit: { findMany: jest.fn().mockResolvedValue([{ id: "source-1", title: "Proof source", kind: "document", author: "Charlie", project: { name: "High Ground", slug: "high-ground" } }]) },
      studioDocument: { findMany: jest.fn().mockResolvedValue([{ id: "document-1", title: "Proof outline", sourceLabel: "document-kind:note", projectionStatus: "private", project: { name: "High Ground", slug: "high-ground" }, blocks: [{ id: "block-1", title: null, body: "Proof lives inside this note." }] }]) },
      studioSourceAnnotation: { findMany: annotationFindMany },
      studioTag: { findMany: jest.fn().mockResolvedValue([{ id: "tag-1", slug: "proof", label: "Proof", description: "Proof before publishing", category: "source", isPrivate: true, project: { name: "High Ground", slug: "high-ground" } }]) },
    } as any;

    const result = await searchWorkspace(prisma, { actorUserId: "user-1", query: "  proof   episode  ", visibleProjects: [{ id: "project-1", slug: "high-ground", name: "High Ground", role: "OWNER" }] });
    expect(result.query).toBe("proof episode");
    expect(result.tasks.map((task) => task.id)).toEqual(["task-1"]);
    expect(result.goals.map((goal) => goal.id)).toEqual(["goal-1"]);
    expect(result.notes.map((note) => note.id)).toEqual(["note-1"]);
    expect(result.tags.map((tag) => tag.id)).toEqual(["tag-1"]);
    expect(result.projectCount).toBe(1);
    expect(result.boundaries).toMatchObject({ actorScoped: true, unreviewedTranscriptCandidatesExcluded: true, externalSideEffects: false });
    expect(JSON.stringify(actionItemFindMany.mock.calls[0][0].where)).toContain("assignedUserId");
    expect(JSON.stringify(actionItemFindMany.mock.calls[0][0].where)).toContain("user-1");
    expect(JSON.stringify(actionItemFindMany.mock.calls[0][0].where)).toContain("tagLinks");
    expect(JSON.stringify(actionItemFindMany.mock.calls[0][0].select)).toContain("project-1");
    expect(JSON.stringify(noteFindMany.mock.calls[0][0].where)).toContain("user-1");
    expect(JSON.stringify(noteFindMany.mock.calls[0][0].where)).toContain("projectId");
    expect(JSON.stringify(noteFindMany.mock.calls[0][0].where)).toContain("tagLinks");
    expect(noteFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { kind: { in: ["SESSION_NOTE", "FOLLOW_UP", "DECISION", "PRODUCTION"] } },
          { OR: [
            { authorUserId: "user-1" },
            { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
            { visibility: "PROJECT_TEAM", room: { projectId: { in: ["project-1"] } } },
          ] },
        ]),
      }),
    }));
    expect(JSON.stringify(noteFindMany.mock.calls[0][0].select)).toContain("project-1");
    expect(JSON.stringify(prisma.studioDocument.findMany.mock.calls[0][0].where)).toContain("blocks");
    expect(JSON.stringify(prisma.studioDocument.findMany.mock.calls[0][0].where)).toContain("taggedSpans");
    expect(prisma.studioDocument.findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { personalOwnerUserId: null },
            { personalOwnerUserId: "user-1" },
          ],
        },
      ]),
    );
    expect(prisma.studioDocument.findMany.mock.calls[0][0].select.blocks).toMatchObject({
      where: { archivedAt: null },
      take: 1,
    });
    expect(annotationFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ projectId: { in: ["project-1"] }, status: "active" }) }));
    expect(JSON.stringify(annotationFindMany.mock.calls[0][0].where)).toContain("createdByUserId");
  });

  it("focuses one exact canonical tag without mixing the same label from another Nest", async () => {
    const tagFindFirst = jest.fn().mockResolvedValue({
      id: "tag-project-1",
      projectId: "project-1",
      slug: "episode-production",
      label: "Episode production",
      description: null,
      category: "meaning",
      isPrivate: true,
      isActive: true,
      mergedIntoTagId: null,
      aliases: [],
      project: { id: "project-1", name: "High Ground", slug: "high-ground" },
    });
    const actionItemFindMany = jest.fn().mockResolvedValue([]);
    const goalFindMany = jest.fn().mockResolvedValue([]);
    const roomFindMany = jest.fn().mockResolvedValue([]);
    const noteFindMany = jest.fn().mockResolvedValue([]);
    const sourceFindMany = jest.fn().mockResolvedValue([]);
    const documentFindMany = jest.fn().mockResolvedValue([]);
    const annotationFindMany = jest.fn().mockResolvedValue([]);
    const mediaClipFindMany = jest.fn().mockResolvedValue([{
      id: "clip-1",
      title: "Proof opening",
      description: null,
      inTimecode: 4,
      outTimecode: 12,
      mediaAsset: {
        id: "asset-1",
        filename: "episode.mov",
        duration: 120,
        isGlobal: false,
      },
    }]);
    const tagFindMany = jest.fn();
    const prisma = {
      studioTag: { findFirst: tagFindFirst, findMany: tagFindMany },
      actionItem: { findMany: actionItemFindMany },
      goal: { findMany: goalFindMany },
      callRoom: { findMany: roomFindMany },
      coachingNote: { findMany: noteFindMany },
      studioSourceUnit: { findMany: sourceFindMany },
      studioDocument: { findMany: documentFindMany },
      studioSourceAnnotation: { findMany: annotationFindMany },
      mediaClip: { findMany: mediaClipFindMany },
    } as any;

    const result = await searchWorkspace(prisma, {
      actorUserId: "user-1",
      exactTagId: "tag-project-1",
      visibleProjects: [
        { id: "project-1", slug: "high-ground", name: "High Ground", role: "OWNER" },
        { id: "project-2", slug: "coaching", name: "Coaching", role: "VIEWER" },
      ],
    });

    expect(result.tagFocus).toMatchObject({
      status: "resolved",
      requestedTagId: "tag-project-1",
      resolvedTagId: "tag-project-1",
      redirected: false,
      resolvedLabel: "Episode production",
      project: { id: "project-1" },
    });
    expect(result.tags.map((tag) => tag.id)).toEqual(["tag-project-1"]);
    expect(result.mediaClips.map((clip) => clip.id)).toEqual(["clip-1"]);
    expect(result.boundaries).toMatchObject({ actorScoped: true, exactTagIdentity: true });
    expect(tagFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tag-project-1", projectId: { in: ["project-1", "project-2"] } },
    }));
    for (const query of [
      actionItemFindMany,
      goalFindMany,
      roomFindMany,
      noteFindMany,
      sourceFindMany,
      documentFindMany,
      annotationFindMany,
      mediaClipFindMany,
    ]) {
      const where = JSON.stringify(query.mock.calls[0][0].where);
      expect(where).toContain("tag-project-1");
      expect(where).not.toContain("tag-project-2");
      expect(where).not.toContain("Episode production");
    }
    expect(mediaClipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tags: { some: { id: "tag-project-1" } },
        mediaAsset: {
          OR: [
            { isGlobal: true },
            { projects: { some: { id: "project-1" } } },
            { mediaBin: { projectId: "project-1" } },
            { assetAttachments: { some: { projectId: "project-1" } } },
          ],
        },
      },
    }));
    expect(tagFindMany).not.toHaveBeenCalled();
  });

  it("follows a preserved merge redirect to the exact canonical target", async () => {
    const studioTag = {
      findFirst: jest.fn()
        .mockResolvedValueOnce({
          id: "tag-old",
          projectId: "project-1",
          slug: "old-name",
          label: "Old name",
          description: null,
          category: "meaning",
          isPrivate: true,
          isActive: false,
          mergedIntoTagId: "tag-current",
          aliases: [],
          project: { id: "project-1", name: "High Ground", slug: "high-ground" },
        })
        .mockResolvedValueOnce({
          id: "tag-current",
          projectId: "project-1",
          slug: "current-name",
          label: "Current name",
          description: null,
          category: "meaning",
          isPrivate: true,
          isActive: true,
          mergedIntoTagId: null,
          aliases: [{ label: "Former current name", slug: "former-current-name" }],
          project: { id: "project-1", name: "High Ground", slug: "high-ground" },
        }),
      findMany: jest.fn(),
    };
    const empty = jest.fn().mockResolvedValue([]);
    const prisma = {
      studioTag,
      actionItem: { findMany: empty },
      goal: { findMany: empty },
      callRoom: { findMany: empty },
      coachingNote: { findMany: empty },
      studioSourceUnit: { findMany: empty },
      studioDocument: { findMany: empty },
      studioSourceAnnotation: { findMany: empty },
      mediaClip: { findMany: empty },
    } as any;

    const result = await searchWorkspace(prisma, {
      actorUserId: "user-1",
      exactTagId: "tag-old",
      visibleProjects: [{ id: "project-1", slug: "high-ground", name: "High Ground", role: "EDITOR" }],
    });

    expect(result.tagFocus).toMatchObject({
      status: "resolved",
      requestedTagId: "tag-old",
      resolvedTagId: "tag-current",
      redirected: true,
      requestedLabel: "Old name",
      resolvedLabel: "Current name",
    });
    expect(result.tags.map((tag) => tag.id)).toEqual(["tag-current"]);
    expect(JSON.stringify(studioTag.findFirst.mock.calls[1][0].where)).toContain("tag-current");
  });

  it("discloses no record identities when the exact tag is outside visible Nests", async () => {
    const actionItemFindMany = jest.fn();
    const prisma = {
      studioTag: { findFirst: jest.fn().mockResolvedValue(null) },
      actionItem: { findMany: actionItemFindMany },
    } as any;

    const result = await searchWorkspace(prisma, {
      actorUserId: "user-1",
      exactTagId: "tag-private-other-nest",
      visibleProjects: [{ id: "project-1", slug: "high-ground", name: "High Ground", role: "VIEWER" }],
    });

    expect(result.tagFocus).toMatchObject({
      status: "not-found",
      requestedTagId: "tag-private-other-nest",
    });
    expect(result.tasks).toEqual([]);
    expect(actionItemFindMany).not.toHaveBeenCalled();
  });

  it("normalizes whitespace and caps query bytes exposed to Prisma", () => {
    expect(normalizeWorkspaceSearchQuery(`  ${"word ".repeat(80)}  `).length).toBe(120);
  });
});
