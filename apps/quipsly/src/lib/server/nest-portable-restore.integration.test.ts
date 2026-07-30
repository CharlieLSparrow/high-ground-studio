/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { validateNestBundle } from "@/lib/nest-portability";
import { buildPortableNestExport } from "./nest-portable-export";
import { applyNestRestore, buildNestRestorePlan } from "./nest-portable-restore";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the portable Nest restore smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("portable Nest export and restore local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `nest-portable-${nonce}@example.test`;
  const otherEmail = `nest-portable-other-${nonce}@example.test`;
  let actorUserId = "";
  let otherUserId = "";
  let workspaceId = "";
  let sourceProjectId = "";
  let targetProjectId = "";
  let sourceTagId = "";
  let sourceTaskId = "";
  let otherTaskId = "";
  let sourceGoalId = "";
  let sourcePlanBlockId = "";
  let sourcePersonalDraftId = "";
  const restoredTaskIds: string[] = [];
  const restoredGoalIds: string[] = [];
  const restoredPlanBlockIds: string[] = [];

  beforeAll(async () => {
    const [actor, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Portable Nest owner" } }),
      prisma.user.create({ data: { primaryEmail: otherEmail, name: "Other collaborator" } }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `nest-portable-${nonce}`, name: "Portable Nest smoke", isPrivate: true },
    });
    workspaceId = workspace.id;
    const [source, target] = await Promise.all([
      prisma.studioProject.create({
        data: {
          workspaceId,
          slug: `portable-source-${nonce}`,
          name: "Portable source",
          description: "Source project for exact restore proof.",
          sourceLabel: "nest-kind:writing",
          isPrivate: true,
        },
      }),
      prisma.studioProject.create({
        data: {
          workspaceId,
          slug: `portable-target-${nonce}`,
          name: "Portable target",
          sourceLabel: "nest-kind:writing",
          isPrivate: true,
        },
      }),
    ]);
    sourceProjectId = source.id;
    targetProjectId = target.id;
    const sourceTag = await prisma.studioTag.create({
      data: {
        projectId: sourceProjectId,
        slug: "proof-listen",
        label: "Proof listen",
        category: "review",
        nodeType: "source_note",
        isPrivate: true,
      },
    });
    sourceTagId = sourceTag.id;
    await prisma.studioTagAlias.create({
      data: {
        projectId: sourceProjectId,
        tagId: sourceTag.id,
        slug: "old-proof",
        label: "Old proof",
        createdByUserId: actorUserId,
        provenanceJson: { source: "explicit rename" },
      },
    });
    await prisma.studioTagAlias.create({
      data: {
        projectId: sourceProjectId,
        tagId: sourceTag.id,
        slug: "proofing",
        label: "Proofing",
        createdByUserId: actorUserId,
        provenanceJson: { source: "historical collision" },
      },
    });
    await prisma.studioTagRevision.create({
      data: {
        tagId: sourceTag.id,
        revision: 1,
        operation: "created",
        actorUserId,
        snapshotJson: { label: "Proof listen" },
      },
    });
    await prisma.studioTag.create({
      data: {
        projectId: sourceProjectId,
        slug: "proofing",
        label: "Proofing canonical",
        category: "review",
        nodeType: "source_note",
        isPrivate: true,
      },
    });
    await prisma.studioTag.create({
      data: {
        projectId: targetProjectId,
        slug: "proof-listen",
        label: "Different destination meaning",
        category: "meaning",
        nodeType: "principle",
        isPrivate: false,
      },
    });

    const note = await prisma.studioDocument.create({
      data: {
        projectId: sourceProjectId,
        stableId: `portable-note-${nonce}`,
        title: "Episode proof note",
        sourceLabel: "document-kind:note;origin:integration-smoke",
        projectionStatus: "private",
        isPrivate: true,
      },
    });
    const body = "Listen to the full episode before delivery.";
    const noteBlock = await prisma.studioDocumentBlock.create({
      data: {
        documentId: note.id,
        stableId: `portable-note-block-${nonce}`,
        order: 0,
        body,
        sourceLabel: "document-kind:note;origin:integration-smoke",
        projectionStatus: "private",
        isPrivate: true,
      },
    });
    await prisma.studioTaggedSpan.create({
      data: {
        documentId: note.id,
        blockId: noteBlock.id,
        tagId: sourceTag.id,
        startOffset: 0,
        endOffset: 6,
        selectedText: "Listen",
        documentStableId: note.stableId,
        documentTitleSnapshot: note.title,
        blockStableId: noteBlock.stableId,
        projectionStatus: "private",
        isPrivate: true,
        createdByLabel: actorEmail,
      },
    });
    await prisma.studioDocumentTagLink.create({
      data: {
        documentId: note.id,
        tagId: sourceTag.id,
        createdByUserId: actorUserId,
        sourceJson: { source: "integration-smoke", documentLevel: true },
      },
    });

    const personalDraft = await prisma.studioDocument.create({
      data: {
        projectId: sourceProjectId,
        personalOwnerUserId: actorUserId,
        stableId: `portable-personal-evidence-${nonce}`,
        title: "Private evidence response",
        sourceLabel: "Quipsly evidence draft",
        sourcePath: "docs/research/private-evidence.md",
        projectionStatus: "private",
        isPrivate: true,
      },
    });
    sourcePersonalDraftId = personalDraft.id;
    await prisma.studioDocumentBlock.createMany({
      data: [
        {
          documentId: personalDraft.id,
          stableId: `portable-personal-evidence-block-${nonce}`,
          order: 1,
          title: "Pinned source evidence",
          body: "> Immutable source excerpt",
          sourceLabel: "Quipsly evidence draft",
          projectionStatus: "private",
          isPrivate: true,
        },
        {
          documentId: personalDraft.id,
          stableId: `portable-personal-response-block-${nonce}`,
          order: 2,
          title: "Response",
          body: "Actor-owned interpretation.",
          sourceLabel: "Quipsly evidence draft",
          projectionStatus: "private",
          isPrivate: true,
        },
      ],
    });

    const [task, otherTask, goal] = await Promise.all([
      prisma.actionItem.create({
        data: {
          projectId: sourceProjectId,
          assignedUserId: actorUserId,
          title: "Proof-listen the episode",
          detail: "Use headphones and take notes.",
          dueAt: new Date("2026-07-25T18:00:00.000Z"),
          sourceJson: { source: "human" },
        },
      }),
      prisma.actionItem.create({
        data: {
          projectId: sourceProjectId,
          assignedUserId: otherUserId,
          title: "Other person's assignment must be excluded",
        },
      }),
      prisma.goal.create({
        data: {
          projectId: sourceProjectId,
          ownerUserId: actorUserId,
          title: "Publish a trustworthy episode",
          description: "Finish the proof-listen before delivery.",
          targetAt: new Date("2026-07-26T18:00:00.000Z"),
          sourceJson: { source: "human" },
        },
      }),
    ]);
    sourceTaskId = task.id;
    otherTaskId = otherTask.id;
    sourceGoalId = goal.id;
    await Promise.all([
      prisma.actionItemTagLink.create({ data: { actionItemId: task.id, tagId: sourceTag.id, createdByUserId: actorUserId } }),
      prisma.goalTagLink.create({ data: { goalId: goal.id, tagId: sourceTag.id, createdByUserId: actorUserId } }),
      prisma.taskReminder.create({
        data: {
          id: `portable-reminder-${nonce}`,
          actionItemId: task.id,
          ownerUserId: actorUserId,
          remindAt: new Date("2026-07-25T17:00:00.000Z"),
          sourceJson: { source: "human" },
        },
      }),
      prisma.goalProgressReceipt.create({
        data: {
          goalId: goal.id,
          actorUserId,
          kind: "check-in",
          progressPercent: 25,
          note: "Rough cut is ready.",
          occurredAt: new Date("2026-07-24T20:00:00.000Z"),
          evidenceJson: { source: "human review" },
        },
      }),
      prisma.goalTaskLink.create({
        data: {
          goalId: goal.id,
          actionItemId: task.id,
          relationship: "CONTRIBUTES",
          createdByUserId: actorUserId,
          sourceJson: { explicit: true },
        },
      }),
    ]);
    const plan = await prisma.workPlanBlock.create({
      data: {
        ownerUserId: actorUserId,
        actionItemId: task.id,
        startsAt: new Date("2026-07-25T19:00:00.000Z"),
        endsAt: new Date("2026-07-25T19:50:00.000Z"),
        timezone: "America/Denver",
        sourceJson: { source: "human plan" },
      },
    });
    sourcePlanBlockId = plan.id;
  });

  afterAll(async () => {
    try {
      await prisma.workPlanBlock.deleteMany({
        where: {
          id: { in: [sourcePlanBlockId, ...restoredPlanBlockIds].filter(Boolean) },
        },
      });
      await prisma.goal.deleteMany({
        where: { id: { in: [sourceGoalId, ...restoredGoalIds].filter(Boolean) } },
      });
      await prisma.actionItem.deleteMany({
        where: { id: { in: [sourceTaskId, otherTaskId, ...restoredTaskIds].filter(Boolean) } },
      });
      if (sourceProjectId || targetProjectId) {
        await prisma.studioProject.deleteMany({
          where: { id: { in: [sourceProjectId, targetProjectId].filter(Boolean) } },
        });
      }
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      await prisma.user.deleteMany({
        where: { id: { in: [actorUserId, otherUserId].filter(Boolean) } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("round-trips owner notes, tags, tasks, goals, links, and safe planning history without overwrites", async () => {
    const exported = await buildPortableNestExport(prisma, {
      projectId: sourceProjectId,
      actorUserId,
      exportedAt: new Date("2026-07-24T21:00:00.000Z"),
    });
    expect(exported.tags).toEqual(expect.arrayContaining([expect.objectContaining({
        slug: "proof-listen",
        aliases: expect.arrayContaining([
          expect.objectContaining({ slug: "old-proof" }),
          expect.objectContaining({ slug: "proofing" }),
        ]),
      })]));
    expect(exported).toMatchObject({
      tasks: [{ id: sourceTaskId, reminderSnapshot: { status: "ACTIVE" } }],
      goals: [{ id: sourceGoalId, progressReceipts: [{ progressPercent: 25 }] }],
      goalTaskLinks: [{ relationship: "CONTRIBUTES" }],
      planBlocks: [{ id: sourcePlanBlockId, status: "PLANNED" }],
      boundaries: {
        actorScopedWork: true,
        collaboratorAssignmentsIncluded: false,
        remindersRestoredActive: false,
        planBlocksRestoreAsCanceled: true,
      },
    });
    expect(exported.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Episode proof note",
        blocks: [expect.objectContaining({
          spans: [expect.objectContaining({ selectedText: "Listen" })],
        })],
      }),
      expect.objectContaining({
        id: sourcePersonalDraftId,
        title: "Private evidence response",
        sourceLabel: "Quipsly evidence draft",
        personal: true,
        blocks: [
          expect.objectContaining({ title: "Pinned source evidence" }),
          expect.objectContaining({ title: "Response" }),
        ],
      }),
    ]));
    expect(exported.tasks.some((task) => task.id === otherTaskId)).toBe(false);

    const validation = validateNestBundle(exported);
    if (!validation.ok) throw new Error(validation.error);
    const before = await buildNestRestorePlan(prisma, {
      projectId: targetProjectId,
      actorUserId,
      bundle: validation.bundle,
    });
    expect(before).toMatchObject({
      tagCreates: 2,
      tagSlugCollisions: 1,
      aliasCreates: 1,
      aliasesDeferred: 1,
      noteCreates: 2,
      documentTagLinkCreates: 1,
      taskCreates: 1,
      goalCreates: 1,
      progressReceiptCreates: 1,
      goalTaskLinkCreates: 1,
      planBlockCreates: 1,
      remindersDeferred: 1,
      planBlocksCanceledForSafety: 1,
      overwrites: 0,
      sourceMutations: 0,
      externalSideEffects: 0,
    });

    const first = await applyNestRestore(prisma, {
      projectId: targetProjectId,
      actorUserId,
      actorEmail,
      bundle: validation.bundle,
    });
    restoredTaskIds.push(...Object.values(first.restoredTaskIds));
    restoredGoalIds.push(...Object.values(first.restoredGoalIds));
    restoredPlanBlockIds.push(...Object.values(first.restoredPlanBlockIds));
    await expect(
      prisma.studioDocument.findUniqueOrThrow({
        where: {
          id: first.restoredNoteDocumentIds[sourcePersonalDraftId],
        },
        select: {
          personalOwnerUserId: true,
          sourceLabel: true,
          sourcePath: true,
          blocks: {
            orderBy: { order: "asc" },
            select: { title: true, body: true },
          },
        },
      }),
    ).resolves.toMatchObject({
      personalOwnerUserId: actorUserId,
      sourceLabel: expect.stringContaining("Quipsly evidence draft"),
      sourcePath: "docs/research/private-evidence.md",
      blocks: [
        {
          title: "Pinned source evidence",
          body: "> Immutable source excerpt",
        },
        {
          title: "Response",
          body: "Actor-owned interpretation.",
        },
      ],
    });
    await prisma.studioTag.update({
      where: { id: first.restoredTagIds[sourceTagId] },
      data: { label: "Destination owner edit" },
    });
    const second = await applyNestRestore(prisma, {
      projectId: targetProjectId,
      actorUserId,
      actorEmail,
      bundle: validation.bundle,
    });
    const after = await buildNestRestorePlan(prisma, {
      projectId: targetProjectId,
      actorUserId,
      bundle: validation.bundle,
    });
    expect(after).toMatchObject({
      tagCreates: 0,
      tagReuses: 2,
      aliasCreates: 0,
      aliasReuses: 1,
      aliasesDeferred: 1,
      noteCreates: 0,
      noteReuses: 2,
      documentTagLinkCreates: 0,
      taskCreates: 0,
      taskReuses: 1,
      goalCreates: 0,
      goalReuses: 1,
      progressReceiptCreates: 0,
      goalTaskLinkCreates: 0,
      planBlockCreates: 0,
      planBlockReuses: 1,
      overwrites: 0,
    });
    expect(second.restoredTaskIds).toEqual(first.restoredTaskIds);
    expect(second.restoredGoalIds).toEqual(first.restoredGoalIds);
    expect(second.restoredNoteDocumentIds).toEqual(first.restoredNoteDocumentIds);

    const restoredTaskId = first.restoredTaskIds[sourceTaskId];
    const restoredGoalId = first.restoredGoalIds[sourceGoalId];
    const restoredPlanId = first.restoredPlanBlockIds[sourcePlanBlockId];
    const exportedEpisodeNote = exported.notes.find(
      (portableNote) => portableNote.title === "Episode proof note",
    );
    if (!exportedEpisodeNote) throw new Error("portable episode note missing");
    const [task, goal, planBlock, note, reminderCount, targetTags] = await Promise.all([
      prisma.actionItem.findUnique({
        where: { id: restoredTaskId },
        include: { tagLinks: { include: { tag: true } } },
      }),
      prisma.goal.findUnique({
        where: { id: restoredGoalId },
        include: {
          tagLinks: { include: { tag: true } },
          progressReceipts: true,
          taskLinks: true,
        },
      }),
      prisma.workPlanBlock.findUnique({ where: { id: restoredPlanId } }),
      prisma.studioDocument.findUnique({
        where: { id: first.restoredNoteDocumentIds[exportedEpisodeNote.id] },
        include: { tagLinks: { include: { tag: true } }, blocks: { include: { taggedSpans: true } } },
      }),
      prisma.taskReminder.count({ where: { actionItemId: restoredTaskId } }),
      prisma.studioTag.findMany({
        where: { projectId: targetProjectId },
        include: { aliases: true },
        orderBy: { label: "asc" },
      }),
    ]);
    expect(task).toMatchObject({
      projectId: targetProjectId,
      assignedUserId: actorUserId,
      title: "Proof-listen the episode",
      tagLinks: [{ tag: { label: "Destination owner edit" } }],
      sourceJson: {
        reminderRestoredActive: false,
        recurrenceRestoredActive: false,
        overwroteExisting: false,
        externalSideEffects: false,
      },
    });
    expect(goal).toMatchObject({
      projectId: targetProjectId,
      ownerUserId: actorUserId,
      title: "Publish a trustworthy episode",
      progressReceipts: [{ progressPercent: 25 }],
      taskLinks: [{ actionItemId: restoredTaskId, relationship: "CONTRIBUTES" }],
    });
    expect(planBlock).toMatchObject({
      ownerUserId: actorUserId,
      actionItemId: restoredTaskId,
      status: "CANCELED",
      sourceJson: {
        originalStatus: "PLANNED",
        restoredCanceledForSafety: true,
        externalCalendarMutated: false,
        notificationScheduled: false,
      },
    });
    expect(note).toMatchObject({
      projectId: targetProjectId,
      title: "Episode proof note",
      projectionStatus: "private",
      isPrivate: true,
      tagRevision: 1,
      tagLinks: [{ tag: { label: "Destination owner edit" } }],
      blocks: [{ body: "Listen to the full episode before delivery.", taggedSpans: [{ selectedText: "Listen" }] }],
    });
    expect(reminderCount).toBe(0);
    expect(targetTags).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "proof-listen", label: "Different destination meaning" }),
      expect.objectContaining({
        slug: expect.stringMatching(/^proof-listen-restored-/),
        label: "Destination owner edit",
        aliases: [expect.objectContaining({ slug: "old-proof" })],
      }),
      expect.objectContaining({ slug: "proofing", label: "Proofing canonical" }),
    ]));
    expect(first.boundaries).toMatchObject({
      overwroteExisting: false,
      sourceMutated: false,
      remindersRestoredActive: false,
      recurrenceRestoredActive: false,
      planBlocksRestoredCanceled: true,
      externalSideEffects: false,
    });
    expect(first.receipt.integrityRecomputed).toBe(true);
  });
});
