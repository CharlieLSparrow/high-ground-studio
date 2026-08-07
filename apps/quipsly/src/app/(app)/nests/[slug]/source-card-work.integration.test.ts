/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

import { createNestQuickWorkAction } from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_SOURCE_CARD_WORK_DB_SMOKE === "1" ? describe : describe.skip;

if (process.env.QUIPSLY_SOURCE_CARD_WORK_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the source-card Work smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("source-card to canonical Work local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `source-card-work-${nonce}@quipsly.test`;
  const projectSlug = `source-card-work-${nonce}`;
  const clientRequestId = randomUUID();
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";
  let tagId = "";
  let assetId = "";
  let cardId = "";
  let boardId = "";
  let taskId = "";

  beforeAll(async () => {
    const actor = await prisma.user.create({ data: { primaryEmail: actorEmail, name: "Source-card Work QA" } });
    actorUserId = actor.id;
    jest.mocked(auth).mockResolvedValue({ user: { id: actorUserId, primaryEmail: actorEmail } } as never);
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `workspace-${nonce}`, name: "Source-card Work QA" } });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: projectSlug, name: "Source-card Work QA" } });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.create({
      data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail },
    });
    const tag = await prisma.studioTag.create({ data: { projectId, slug: `episode-${nonce}`, label: "Episode" } });
    tagId = tag.id;
    const asset = await prisma.studioMediaAsset.create({
      data: {
        filename: "source-card-work.mp4",
        url: `/source-card-work/${nonce}.mp4`,
        mimeType: "video/mp4",
        duration: 60,
        projects: { connect: { id: projectId } },
      },
    });
    assetId = asset.id;
    const sourceRevision = await prisma.studioMediaSourceRevision.create({
      data: {
        projectId,
        mediaAssetId: assetId,
        revisionKey: `source-card-work-${nonce}`,
        identitySha256: "1".repeat(64),
        contentSha256: "2".repeat(64),
        durationSeconds: 60,
        createdByUserId: actorUserId,
      },
    });
    const sourceSet = await prisma.studioMediaSourceSet.create({
      data: {
        projectId,
        kind: "insta360-package",
        captureKey: `VID_${nonce}`,
        displayName: "Episode 5 segment 4",
        identitySha256: "3".repeat(64),
        sourceClockRevisionId: sourceRevision.id,
        clientRequestId: randomUUID(),
        createdByUserId: actorUserId,
      },
    });
    const range = await prisma.studioSourceRange.create({
      data: {
        projectId,
        sourceRevisionId: sourceRevision.id,
        sourceSetId: sourceSet.id,
        selectorSha256: "4".repeat(64),
        startSeconds: 12.25,
        endSeconds: 24.5,
        createdByUserId: actorUserId,
      },
    });
    const card = await prisma.studioStoryCard.create({
      data: {
        projectId,
        sourceRangeId: range.id,
        stableId: `source-card-work:${nonce}`,
        title: "Lake reveal",
        revision: 3,
        clientRequestId: randomUUID(),
        createdByUserId: actorUserId,
      },
    });
    cardId = card.id;
    await prisma.studioStoryCardTagLink.create({
      data: { cardId, tagId, createdByUserId: actorUserId, sourceJson: { source: "source-card-work-smoke" } },
    });
    const board = await prisma.studioStoryBoard.create({
      data: {
        projectId,
        clientRequestId: randomUUID(),
        slug: `insta360-selects-${nonce}`,
        title: "Insta360 selects",
        revision: 11,
        createdByUserId: actorUserId,
      },
    });
    boardId = board.id;
    await prisma.studioStoryBoardSection.create({
      data: { boardId, key: "episode-open", title: "Episode Open", sortOrder: 0, createdByUserId: actorUserId },
    });
    await prisma.studioStoryBoardPlacement.create({
      data: { boardId, cardId, groupKey: "episode-open", laneKey: "b-roll", sortOrder: 0, createdByUserId: actorUserId },
    });
  });

  afterAll(async () => {
    if (taskId) await prisma.actionItem.deleteMany({ where: { id: taskId } });
    if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
    if (assetId) await prisma.studioMediaAsset.deleteMany({ where: { id: assetId } });
    if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
    if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
    await prisma.$disconnect();
  });

  it("materializes and exactly replays one tagged task plus immutable evidence", async () => {
    const input = {
      projectSlug,
      entityKind: "TASK" as const,
      title: "Review the lake reveal reframe",
      body: "Approve camera direction before conform.",
      clientRequestId,
      tagIds: [tagId],
      newTagLabels: [],
      sourceCardId: cardId,
      sourceBoardId: boardId,
    };
    const first = await createNestQuickWorkAction(input);
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, externalSideEffects: false });
    if (!first.ok) throw new Error(first.error);
    taskId = first.entityId;
    const replay = await createNestQuickWorkAction(input);
    expect(replay).toMatchObject({ ok: true, entityId: taskId, idempotentReplay: true });

    const persisted = await prisma.actionItem.findUnique({
      where: { id: taskId },
      include: { evidenceReceipts: true, tagLinks: true },
    });
    expect(persisted?.sourceJson).toMatchObject({
      sourceCardAnchor: {
        storyCardId: cardId,
        sourceRangeId: expect.any(String),
        boardId,
        startSeconds: 12.25,
        endSeconds: 24.5,
        selectorSha256: "4".repeat(64),
        sourceRevisionIdentitySha256: "1".repeat(64),
        immutableSourceRange: true,
        externalSideEffects: false,
      },
    });
    expect(persisted?.evidenceReceipts).toHaveLength(1);
    expect(persisted?.evidenceReceipts[0]).toMatchObject({ kind: "SOURCE_CARD_ANCHOR", actorUserId });
    expect(persisted?.tagLinks).toHaveLength(1);
    expect(persisted?.tagLinks[0].tagId).toBe(tagId);
  });
});
