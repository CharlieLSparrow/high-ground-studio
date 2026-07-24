import { resolveReusableProjectTag } from "./work-tags";
import { resolveQuickEntryTags } from "./quick-entry-tags";

jest.mock("./work-tags", () => ({
  resolveReusableProjectTag: jest.fn(),
}));

describe("shared quick-entry tag resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a selected tag outside the exact active Nest vocabulary", async () => {
    const tx = {
      studioTag: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      studioProjectAccessGrant: {
        findFirst: jest.fn(),
      },
    };

    await expect(resolveQuickEntryTags({
      tx: tx as any,
      projectId: "project-1",
      actorEmail: "person@example.test",
      tagIds: ["other-project-tag"],
      newTagLabels: [],
    })).resolves.toEqual({ kind: "invalid-tags" });
    expect(resolveReusableProjectTag).not.toHaveBeenCalled();
  });

  it("requires a current Owner or Editor grant before expanding vocabulary", async () => {
    const tx = {
      studioTag: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      studioProjectAccessGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(resolveQuickEntryTags({
      tx: tx as any,
      projectId: "project-1",
      actorEmail: "person@example.test",
      tagIds: [],
      newTagLabels: ["Episode 8"],
    })).resolves.toEqual({ kind: "tag-creation-forbidden" });
    expect(tx.studioProjectAccessGrant.findFirst).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        email: "person@example.test",
        status: "ACTIVE",
        role: { in: ["OWNER", "EDITOR"] },
      },
      select: { id: true },
    });
  });

  it("converges selected, former-name, and new labels on canonical identities", async () => {
    const tx = {
      studioTag: {
        findMany: jest.fn().mockResolvedValue([
          { id: "tag-episode", slug: "episode", label: "Episode" },
        ]),
      },
      studioProjectAccessGrant: {
        findFirst: jest.fn().mockResolvedValue({ id: "grant-1" }),
      },
    };
    jest.mocked(resolveReusableProjectTag)
      .mockResolvedValueOnce({
        ok: true,
        tag: {
          id: "tag-episode",
          projectId: "project-1",
          slug: "episode",
          label: "Episode",
          category: "meaning",
          isActive: true,
        } as any,
        created: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        tag: {
          id: "tag-proof",
          projectId: "project-1",
          slug: "proof-listen",
          label: "Proof listen",
          category: "meaning",
          isActive: true,
        } as any,
        created: true,
      });

    await expect(resolveQuickEntryTags({
      tx: tx as any,
      projectId: "project-1",
      actorEmail: "person@example.test",
      tagIds: ["tag-episode"],
      newTagLabels: ["Former episode name", "Proof listen"],
    })).resolves.toEqual({
      kind: "resolved",
      tags: [
        { id: "tag-episode", slug: "episode", label: "Episode" },
        { id: "tag-proof", slug: "proof-listen", label: "Proof listen" },
      ],
      createdTagCount: 1,
      reusedTagCount: 1,
    });
  });

  it("surfaces an alias slug collision instead of silently merging vocabulary", async () => {
    const tx = {
      studioTag: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      studioProjectAccessGrant: {
        findFirst: jest.fn().mockResolvedValue({ id: "grant-1" }),
      },
    };
    jest.mocked(resolveReusableProjectTag).mockResolvedValue({
      ok: false,
      code: "SLUG_CONFLICT",
      existingLabel: "Episode-8",
      error: "collision",
    });

    await expect(resolveQuickEntryTags({
      tx: tx as any,
      projectId: "project-1",
      actorEmail: "person@example.test",
      tagIds: [],
      newTagLabels: ["Episode 8"],
    })).resolves.toEqual({
      kind: "tag-slug-conflict",
      label: "Episode 8",
      existingLabel: "Episode-8",
    });
  });
});
