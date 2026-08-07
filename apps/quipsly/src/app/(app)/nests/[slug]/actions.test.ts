import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { resolveQuickEntryTags } from "@/lib/server/quick-entry-tags";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { createNestQuickNoteAction, createNestQuickWorkAction } from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quick-entry-tags", () => ({
  resolveQuickEntryTags: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  resolveStudioProjectAccess: jest.fn(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const requestId = "37eb0cd8-4360-4b71-8e06-e0e570b45a23";
const replayHash = createHash("sha256").update(JSON.stringify({
  actorUserId: "user-1",
  projectSlug: "project",
  title: "Keep this thought",
  body: "Durable evidence.",
  tagIds: [],
  newTagLabels: [],
})).digest("hex");

function signedIn() {
  jest.mocked(auth).mockResolvedValue({
    user: { id: "user-1", primaryEmail: "person@example.test" },
  } as any);
}

describe("project quick note capture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveQuickEntryTags).mockResolvedValue({
      kind: "resolved",
      tags: [],
      createdTagCount: 0,
      reusedTagCount: 0,
    });
  });

  it("rejects signed-out capture before opening the database", async () => {
    jest.mocked(auth).mockResolvedValue(null as any);

    await expect(createNestQuickNoteAction({
      projectSlug: "Project",
      title: "A note",
      body: "Evidence",
      clientRequestId: requestId,
    })).resolves.toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("atomically creates one private canonical note and an explicit human receipt", async () => {
    signedIn();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as any);
    const tx = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "document-1" }),
      },
      studioDocumentOperation: {
        create: jest.fn().mockResolvedValue({ id: "operation-1" }),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const result = await createNestQuickNoteAction({
      projectSlug: "Project",
      title: "  Keep this thought  ",
      body: "  Durable evidence.  ",
      clientRequestId: requestId,
    });

    expect(result).toEqual({
      ok: true,
      documentId: "document-1",
      blockId: `project-note:user-1:${requestId}:body`,
      projectSlug: "project",
      href: `/create?project=project&document=document-1&block=project-note%3Auser-1%3A${requestId}%3Abody`,
      idempotentReplay: false,
      externalSideEffects: false,
    });
    expect(tx.studioDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project-1",
        stableId: `project-note:user-1:${requestId}`,
        title: "Keep this thought",
        sourceLabel: "document-kind:note;origin:nest-project-capture",
        projectionStatus: "private",
        isPrivate: true,
        blocks: {
          create: [expect.objectContaining({
            body: "Durable evidence.",
            isPrivate: true,
          })],
        },
      }),
      select: { id: true },
    });
    expect(tx.studioDocumentOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        origin: "human",
        operationType: "create-project-quick-note",
        reversible: true,
        afterJson: expect.objectContaining({
          clientRequestId: requestId,
          sourceMutated: false,
          externalSideEffects: false,
        }),
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/library");
    expect(revalidatePath).toHaveBeenCalledWith("/find");
  });

  it("replays the same evidence without creating a second document", async () => {
    signedIn();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as any);
    const tx = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: "document-1",
          projectId: "project-1",
          blocks: [{ id: "block-1" }],
          documentOperations: [{ afterJson: {
            inputHash: replayHash,
          } }],
        }),
        create: jest.fn(),
      },
      studioDocumentOperation: { create: jest.fn() },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const result = await createNestQuickNoteAction({
      projectSlug: "project",
      title: "Keep this thought",
      body: "Durable evidence.",
      clientRequestId: requestId,
    });

    expect(result).toMatchObject({
      ok: true,
      documentId: "document-1",
      blockId: "block-1",
      idempotentReplay: true,
    });
    expect(tx.studioDocument.create).not.toHaveBeenCalled();
    expect(tx.studioDocumentOperation.create).not.toHaveBeenCalled();
  });

  it("recovers a concurrent unique race as the same idempotent note", async () => {
    signedIn();
    const replay = {
      id: "document-1",
      project: { slug: "project" },
      blocks: [{ id: "block-1" }],
      documentOperations: [{ afterJson: { inputHash: replayHash } }],
    };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(Object.assign(new Error("unique race"), { code: "P2002" })),
      studioDocument: { findUnique: jest.fn().mockResolvedValue(replay) },
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);

    const result = await createNestQuickNoteAction({
      projectSlug: "project",
      title: "Keep this thought",
      body: "Durable evidence.",
      clientRequestId: requestId,
    });

    expect(result).toMatchObject({
      ok: true,
      documentId: "document-1",
      blockId: "block-1",
      idempotentReplay: true,
      externalSideEffects: false,
    });
    expect(prisma.studioDocument.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { stableId: `project-note:user-1:${requestId}` },
    }));
  });

  it("creates document-level canonical tag links inside the same note transaction", async () => {
    signedIn();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as any);
    jest.mocked(resolveQuickEntryTags).mockResolvedValue({
      kind: "resolved",
      tags: [{ id: "tag-episode", slug: "episode", label: "Episode" }],
      createdTagCount: 0,
      reusedTagCount: 0,
    });
    const tx = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "document-1" }),
      },
      studioDocumentTagLink: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      studioDocumentOperation: { create: jest.fn().mockResolvedValue({ id: "operation-1" }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const result = await createNestQuickNoteAction({
      projectSlug: "project",
      title: "Episode thought",
      body: "Keep this exact source-linked thought.",
      clientRequestId: requestId,
      tagIds: ["tag-episode"],
      newTagLabels: [],
    });

    expect(result).toMatchObject({ ok: true, documentId: "document-1" });
    expect(resolveQuickEntryTags).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      actorEmail: "person@example.test",
      tagIds: ["tag-episode"],
      newTagLabels: [],
    }));
    expect(tx.studioDocumentTagLink.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        documentId: "document-1",
        tagId: "tag-episode",
        createdByUserId: "user-1",
        sourceJson: expect.objectContaining({
          source: "quipsly-project-quick-note-v2",
          documentLevel: true,
          sourceMutated: false,
          externalSideEffects: false,
        }),
      })],
    });
    expect(tx.studioDocumentOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        afterJson: expect.objectContaining({
          tagIds: ["tag-episode"],
          tagLabels: ["Episode"],
          externalSideEffects: false,
        }),
      }),
    });
  });
});

describe("project quick Task and Goal capture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as any);
    jest.mocked(resolveQuickEntryTags).mockResolvedValue({
      kind: "resolved",
      tags: [{ id: "tag-episode", slug: "episode", label: "Episode" }],
      createdTagCount: 0,
      reusedTagCount: 1,
    });
  });

  it("atomically creates an idempotent tagged Task with truthful side-effect boundaries", async () => {
    const tx = {
      actionItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: `project-task-${requestId}` }),
      },
      actionItemTagLink: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const result = await createNestQuickWorkAction({
      projectSlug: "project",
      entityKind: "TASK",
      title: " Prepare Episode 8 ",
      body: " Read the source notes first. ",
      clientRequestId: requestId,
      tagIds: [],
      newTagLabels: [" Episode "],
    });

    expect(result).toEqual({
      ok: true,
      entityKind: "TASK",
      entityId: `project-task-${requestId}`,
      projectSlug: "project",
      href: `/work?task=project-task-${requestId}`,
      tags: [{ id: "tag-episode", slug: "episode", label: "Episode" }],
      idempotentReplay: false,
      externalSideEffects: false,
    });
    expect(tx.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: `project-task-${requestId}`,
        assignedUserId: "user-1",
        projectId: "project-1",
        title: "Prepare Episode 8",
        detail: "Read the source notes first.",
        sourceJson: expect.objectContaining({
          creationReceipt: expect.objectContaining({
            tagIds: ["tag-episode"],
            messageSent: false,
            calendarMutated: false,
            published: false,
            externalSideEffects: false,
          }),
        }),
      }),
    });
    expect(tx.actionItemTagLink.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        actionItemId: `project-task-${requestId}`,
        tagId: "tag-episode",
        createdByUserId: "user-1",
      })],
    });
  });

  it("creates one canonical Work task with an exact source-card evidence receipt", async () => {
    const sourceCard = {
      id: "card-1",
      stableId: "source-card:lake-reveal",
      title: "Lake reveal",
      revision: 3,
      tags: [{ tag: { id: "tag-episode" } }],
      sourceRange: {
        id: "range-1",
        startSeconds: 12.25,
        endSeconds: 24.5,
        selectorSha256: "a".repeat(64),
        sourceRevision: { id: "revision-1", identitySha256: "b".repeat(64) },
        sourceSet: { id: "set-1", captureKey: "VID_004", displayName: "Episode 5 segment 4", identitySha256: "c".repeat(64) },
      },
      placements: [{
        board: { id: "board-1", slug: "insta360-selects", title: "Insta360 selects", revision: 11 },
        groupKey: "episode-open",
        laneKey: "b-roll",
      }],
    };
    const tx = {
      studioStoryCard: { findFirst: jest.fn().mockResolvedValue(sourceCard) },
      actionItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: `project-task-${requestId}` }),
      },
      actionItemEvidenceReceipt: { create: jest.fn().mockResolvedValue({ id: `source-card-action-${requestId}` }) },
      actionItemTagLink: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const result = await createNestQuickWorkAction({
      projectSlug: "project",
      entityKind: "TASK",
      title: "Review the lake reveal",
      body: "Confirm the reframing before the Episode edit.",
      clientRequestId: requestId,
      tagIds: ["tag-episode"],
      sourceCardId: "card-1",
      sourceBoardId: "board-1",
    });

    expect(result).toMatchObject({ ok: true, entityKind: "TASK", externalSideEffects: false });
    expect(tx.studioStoryCard.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "card-1", projectId: "project-1", archivedAt: null }),
    }));
    expect(tx.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: `project-task-${requestId}`,
      projectId: "project-1",
      assignedUserId: "user-1",
      sourceJson: expect.objectContaining({
        sourceCardAnchor: expect.objectContaining({
          schema: "quipsly-source-card-action-anchor-v1",
          storyCardId: "card-1",
          storyCardRevision: 3,
          sourceRangeId: "range-1",
          sourceSetId: "set-1",
          boardId: "board-1",
          boardSection: "episode-open",
          immutableSourceRange: true,
          externalSideEffects: false,
        }),
      }),
    }) });
    expect(tx.actionItemEvidenceReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: `source-card-action-${requestId}`,
      actionItemId: `project-task-${requestId}`,
      actorUserId: "user-1",
      kind: "SOURCE_CARD_ANCHOR",
      evidenceJson: expect.objectContaining({ selectorSha256: "a".repeat(64), sourceRevisionIdentitySha256: "b".repeat(64) }),
    }) });
  });

  it("refuses a missing or cross-project source card before creating Work", async () => {
    const tx = {
      studioStoryCard: { findFirst: jest.fn().mockResolvedValue(null) },
      actionItem: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      actionItemEvidenceReceipt: { create: jest.fn() },
      actionItemTagLink: { createMany: jest.fn() },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    await expect(createNestQuickWorkAction({
      projectSlug: "project",
      entityKind: "TASK",
      title: "Invented source task",
      clientRequestId: requestId,
      sourceCardId: "invented-card",
    })).resolves.toMatchObject({ ok: false, code: "CONFLICT" });
    expect(tx.actionItem.create).not.toHaveBeenCalled();
    expect(resolveQuickEntryTags).not.toHaveBeenCalled();
  });

  it("refuses stale card tags instead of silently creating differently tagged Work", async () => {
    const tx = {
      studioStoryCard: { findFirst: jest.fn().mockResolvedValue({
        id: "card-1",
        stableId: "source-card:lake-reveal",
        title: "Lake reveal",
        revision: 4,
        tags: [{ tag: { id: "tag-current" } }],
        sourceRange: {
          id: "range-1",
          startSeconds: 1,
          endSeconds: 2,
          selectorSha256: "a".repeat(64),
          sourceRevision: { id: "revision-1", identitySha256: "b".repeat(64) },
          sourceSet: null,
        },
        placements: [],
      }) },
      actionItem: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      actionItemEvidenceReceipt: { create: jest.fn() },
      actionItemTagLink: { createMany: jest.fn() },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    await expect(createNestQuickWorkAction({
      projectSlug: "project",
      entityKind: "TASK",
      title: "Stale-tag source task",
      clientRequestId: requestId,
      tagIds: ["tag-episode"],
      sourceCardId: "card-1",
    })).resolves.toMatchObject({ ok: false, code: "CONFLICT", error: expect.stringContaining("tags changed") });
    expect(resolveQuickEntryTags).not.toHaveBeenCalled();
    expect(tx.actionItem.create).not.toHaveBeenCalled();
  });

  it("replays the exact Goal identity without resolving or creating tags again", async () => {
    const inputHash = createHash("sha256").update(JSON.stringify({
      actorUserId: "user-1",
      projectSlug: "project",
      entityKind: "GOAL",
      title: "Publish Episode 8",
      body: "Finish the proof listen.",
      tagIds: ["tag-episode"],
      newTagLabels: [],
      sourceCardId: "",
      sourceBoardId: "",
    })).digest("hex");
    const existing = {
      id: `project-goal-${requestId}`,
      projectId: "project-1",
      ownerUserId: "user-1",
      sourceJson: { creationReceipt: { inputHash } },
      tagLinks: [{ tag: { id: "tag-episode", slug: "episode", label: "Episode" } }],
    };
    const tx = {
      goal: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
      goalTagLink: { createMany: jest.fn() },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const result = await createNestQuickWorkAction({
      projectSlug: "project",
      entityKind: "GOAL",
      title: "Publish Episode 8",
      body: "Finish the proof listen.",
      clientRequestId: requestId,
      tagIds: ["tag-episode"],
      newTagLabels: [],
    });

    expect(result).toMatchObject({
      ok: true,
      entityKind: "GOAL",
      entityId: `project-goal-${requestId}`,
      idempotentReplay: true,
    });
    expect(resolveQuickEntryTags).not.toHaveBeenCalled();
    expect(tx.goal.create).not.toHaveBeenCalled();
    expect(tx.goalTagLink.createMany).not.toHaveBeenCalled();
  });
});
