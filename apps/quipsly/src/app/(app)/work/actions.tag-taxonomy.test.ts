import { revalidatePath } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { createWorkTagTaxonomy } from "@/lib/server/work-tags";

import { createWorkVocabularyTag } from "./actions";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("@/lib/server/work-tags", () => ({
  createAndAssignWorkEntityTag: jest.fn(),
  createWorkTagTaxonomy: jest.fn(),
  mutateWorkTagTaxonomy: jest.fn(),
  replaceWorkEntityTags: jest.fn(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

describe("standalone Nest vocabulary action", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects signed-out creation before touching storage", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    const result = await createWorkVocabularyTag({
      projectId: "project-1",
      label: "Media clip QA",
    });
    expect(result).toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates vocabulary only and revalidates every tag consumer", async () => {
    const prisma = {};
    jest.mocked(getQuipslySession).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.test" },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(createWorkTagTaxonomy).mockResolvedValue({
      ok: true,
      projectId: "project-1",
      tag: {
        id: "tag-media",
        label: "Media clip QA",
        slug: "media-clip-qa",
        isActive: true,
        archivedAt: null,
        updatedAt: new Date("2026-07-30T18:00:01.000Z"),
      },
      aliases: [],
      created: true,
      revision: 1,
      receiptId: "create-tag-receipt",
    });

    const result = await createWorkVocabularyTag({
      projectId: "project-1",
      label: "  Media clip QA  ",
    });

    expect(createWorkTagTaxonomy).toHaveBeenCalledWith({
      prisma,
      actorUserId: "user-1",
      actorEmail: "person@example.test",
      projectId: "project-1",
      label: "Media clip QA",
    });
    expect(result).toMatchObject({
      ok: true,
      created: true,
      tag: {
        id: "tag-media",
        updatedAt: "2026-07-30T18:00:01.000Z",
      },
    });
    for (const path of ["/work", "/today", "/find", "/research", "/media"]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });
});
