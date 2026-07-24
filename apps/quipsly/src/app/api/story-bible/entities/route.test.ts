/** @jest-environment node */

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/server/access";
import { GET } from "./route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/access", () => ({ requireProjectAccess: jest.fn() }));

const prisma = {
  studioProject: { findUnique: jest.fn() },
  storyEntity: { findMany: jest.fn() },
  studioAssistantAction: { findMany: jest.fn() },
};

describe("Story Bible entity route canonical truth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(auth).mockResolvedValue({ user: { email: "writer@example.test" } } as never);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(requireProjectAccess).mockResolvedValue(undefined as never);
    prisma.studioProject.findUnique.mockResolvedValue({ id: "project-1", slug: "episode", workspace: {} });
  });

  it("returns canonical StoryEntity rows without virtualizing legacy saved actions", async () => {
    const canonical = { id: "entity-1", projectId: "project-1", type: "THEME_MOTIF", name: "Courage" };
    prisma.storyEntity.findMany.mockResolvedValue([canonical]);

    const response = await GET(new Request("http://localhost/api/story-bible/entities?projectId=project-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entities: [canonical] });
    expect(prisma.studioAssistantAction.findMany).not.toHaveBeenCalled();
  });
});
