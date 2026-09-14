/** @jest-environment node */

import { listProjectsVisibleToEmail } from "./home-nest";
import { replaceWorkEntityTags } from "./work-tags";

jest.mock("./home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));

describe("atomic iPhone vocabulary and tag replacement", () => {
  it("rechecks retained tag eligibility inside the transaction before changing links", async () => {
    const updatedAt = new Date("2026-09-09T00:00:00Z");
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{id: "project-1", role: "EDITOR"}] as never);
    const tx = {
      studioProjectAccessGrant: {findFirst: jest.fn(async () => ({id: "grant-1"}))},
      studioTag: {count: jest.fn(async () => 0)},
      actionItem: {findFirst: jest.fn(async () => ({id: "task-1", projectId: "project-1", updatedAt, sourceJson: {}})), updateMany: jest.fn()},
      actionItemTagLink: {deleteMany: jest.fn(), createMany: jest.fn()},
    };
    const prisma = {
      actionItem: {findFirst: jest.fn(async () => ({id: "task-1", projectId: "project-1", updatedAt, sourceJson: {}}))},
      studioTag: {findMany: jest.fn(async () => [{id: "retired-tag"}])},
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    expect(await replaceWorkEntityTags({prisma: prisma as never, actorUserId: "user-1", actorEmail: "person@example.test",
      entityKind: "task", entityId: "task-1", tagIds: ["retired-tag"], expectedUpdatedAt: updatedAt}))
      .toMatchObject({ok: false, code: "FORBIDDEN"});
    const eligibility = {OR: [{isActive: true}, {actionItems: {some: {actionItemId: "task-1"}}}]};
    const where = {projectId: "project-1", id: {in: ["retired-tag"]}, AND: expect.arrayContaining([eligibility])};
    expect(prisma.studioTag.findMany).toHaveBeenCalledWith({where: expect.objectContaining(where), select: {id: true}});
    expect(tx.studioTag.count).toHaveBeenCalledWith({where: expect.objectContaining(where)});
    expect(tx.actionItem.updateMany).not.toHaveBeenCalled();
    expect(tx.actionItemTagLink.deleteMany).not.toHaveBeenCalled();
    expect(tx.actionItemTagLink.createMany).not.toHaveBeenCalled();
  });

  it("creates one canonical label inside the complete decision and replays the same receipt", async () => {
    const originalUpdatedAt = new Date("2026-07-29T12:00:00.000Z");
    const savedUpdatedAt = new Date("2026-07-29T12:00:01.000Z");
    let currentUpdatedAt = originalUpdatedAt;
    let currentSource: Record<string, unknown> = {};
    const actionItemFindFirst = jest.fn(async () => ({
      id: "task-1",
      projectId: "project-1",
      updatedAt: currentUpdatedAt,
      sourceJson: currentSource,
    }));
    const actionItemUpdateMany = jest.fn(async (input: any) => {
      currentSource = input.data.sourceJson;
      currentUpdatedAt = savedUpdatedAt;
      return { count: 1 };
    });
    const actionItemTagCreateMany = jest.fn(async () => ({ count: 2 }));
    const transactionClient = {
      studioProjectAccessGrant: {
        findFirst: jest.fn(async () => ({ id: "grant-1" })),
      },
      studioTag: {
        count: jest.fn(async () => 1),
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({
          id: "tag-new",
          projectId: "project-1",
          slug: "recording-day",
          label: "Recording day",
          category: "meaning",
          isActive: true,
        })),
      },
      studioTagAlias: {
        findUnique: jest.fn(async () => null),
      },
      actionItem: {
        findFirst: actionItemFindFirst,
        updateMany: actionItemUpdateMany,
        findUnique: jest.fn(async () => ({ updatedAt: savedUpdatedAt })),
      },
      actionItemTagLink: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        createMany: actionItemTagCreateMany,
      },
    };
    const prisma = {
      actionItem: {
        findFirst: actionItemFindFirst,
      },
      studioTag: {
        findMany: jest.fn(async () => [{ id: "tag-existing" }]),
      },
      $transaction: jest.fn(async (operation: (tx: typeof transactionClient) => unknown) => operation(transactionClient)),
    };
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{
      id: "project-1",
      slug: "high-ground",
      name: "High Ground Odyssey",
      sourceLabel: "nest-kind:production",
      updatedAt: originalUpdatedAt,
      role: "EDITOR",
    }] as never);

    const clientRequestId = "6593b18d-93a5-4d25-826e-b971e3864948";
    const input = {
      prisma: prisma as never,
      actorUserId: "user-1",
      actorEmail: "person@example.test",
      entityKind: "task" as const,
      entityId: "task-1",
      tagIds: ["tag-existing"],
      newTagLabels: ["Recording day"],
      expectedUpdatedAt: originalUpdatedAt,
      clientRequestId,
      surface: "ios-capture-today" as const,
    };
    const first = await replaceWorkEntityTags(input);

    expect(first).toMatchObject({
      ok: true,
      tagIds: ["tag-existing", "tag-new"],
      requestedTagIds: ["tag-existing"],
      newTagLabels: ["Recording day"],
      resolvedTags: [{ id: "tag-new", requestedLabel: "Recording day", label: "Recording day", slug: "recording-day", created: true }],
      receiptId: `work-tags-${clientRequestId}`,
      idempotentReplay: false,
    });
    expect(transactionClient.studioTag.create).toHaveBeenCalledTimes(1);
    expect(actionItemTagCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ actionItemId: "task-1", tagId: "tag-existing" }),
        expect.objectContaining({ actionItemId: "task-1", tagId: "tag-new" }),
      ],
    });
    expect(currentSource).toMatchObject({
      lastTagReceipt: {
        id: `work-tags-${clientRequestId}`,
        requestedTagIds: ["tag-existing"],
        newTagLabels: ["Recording day"],
        tagIds: ["tag-existing", "tag-new"],
        resolvedTags: [{ requestedLabel: "Recording day" }],
        externalSideEffects: false,
      },
    });

    const replay = await replaceWorkEntityTags(input);
    expect(replay).toMatchObject({
      ok: true,
      tagIds: ["tag-existing", "tag-new"],
      requestedTagIds: ["tag-existing"],
      newTagLabels: ["Recording day"],
      idempotentReplay: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.studioTag.create).toHaveBeenCalledTimes(1);

    const conflictingReuse = await replaceWorkEntityTags({
      ...input,
      newTagLabels: ["Editing day"],
    });
    expect(conflictingReuse).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
