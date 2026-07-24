import { lookupStudioProjectDocument } from "./project-registry";

describe("lookupStudioProjectDocument", () => {
  it("opens a canonical Nest outside the legacy workspace", async () => {
    const project = {
      id: "project-dogfood",
      workspaceId: "workspace-dogfood",
      slug: "quipsly-local-dogfood",
      updatedAt: new Date("2026-07-18T20:00:00.000Z"),
    };
    const document = {
      id: "document-dogfood",
      projectId: project.id,
      stableId: "evidence-draft-dogfood",
      updatedAt: new Date("2026-07-18T20:01:00.000Z"),
    };
    const prisma = {
      studioWorkspace: {
        findUnique: jest.fn().mockResolvedValue({ id: project.workspaceId }),
        upsert: jest.fn(),
      },
      studioProject: {
        findFirst: jest.fn().mockResolvedValue(project),
      },
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(document),
      },
    };

    const result = await lookupStudioProjectDocument(prisma as never, project.slug);

    expect(prisma.studioProject.findFirst).toHaveBeenCalledWith({
      where: { slug: project.slug },
      orderBy: { updatedAt: "desc" },
    });
    expect(prisma.studioWorkspace.upsert).not.toHaveBeenCalled();
    expect(result.project).toBe(project);
    expect(result.document).toBe(document);
    expect(result.workspace).toEqual({ id: project.workspaceId });
  });
});
