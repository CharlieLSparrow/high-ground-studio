/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  addBlockComment,
  createNamedDocumentCheckpointAction,
  exportPortableDocumentAction,
  listNamedDocumentCheckpointsAction,
  pastePlainTextBlocksAction,
  restoreNamedDocumentCheckpointAction,
  restorePortableDocumentAction,
} from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn(), Schema: {}, Type: {} }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/server/bi-directional-sync", () => ({ syncBlocksToQuipslyNote: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../manuscript/manuscript-editor-model", () => ({
  createManuscriptDraftPlainText: jest.fn(() => ""),
  safeManuscriptDraft: jest.fn(() => null),
}));
jest.mock("./starterDocuments", () => ({ createStarterBlocks: jest.fn(() => []) }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_DOCUMENT_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_DOCUMENT_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the document safety smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("writing checkpoint and portable restore disposable database", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const writerEmail = `document-writer-${nonce}@example.test`;
  const outsiderEmail = `document-outsider-${nonce}@example.test`;
  const workspaceId = `document-workspace-${nonce}`;
  const projectId = `document-project-${nonce}`;
  const projectSlug = `document-project-${nonce}`;
  const documentId = `document-${nonce}`;
  const firstBlockId = `document-block-a-${nonce}`;
  const secondBlockId = `document-block-b-${nonce}`;
  const tagId = `document-tag-${nonce}`;
  const spanId = `document-span-${nonce}`;
  const sourceUnitId = `document-source-${nonce}`;
  const annotationId = `document-annotation-${nonce}`;
  const citationId = `document-citation-${nonce}`;
  const originalBody = "Preserved evidence supports a deliberate coaching follow-through.";

  function signedInAs(email: string) {
    jest.mocked(auth).mockResolvedValue({ user: { id: email, email, primaryEmail: email } } as never);
  }

  beforeAll(async () => {
    signedInAs(writerEmail);
    await prisma.studioWorkspace.create({ data: { id: workspaceId, slug: `document-${nonce}`, name: "Document safety smoke" } });
    await prisma.studioProject.create({
      data: {
        id: projectId,
        workspaceId,
        slug: projectSlug,
        name: "Document safety Nest",
        accessGrants: { create: { email: writerEmail, role: "EDITOR", status: "ACTIVE", createdByEmail: writerEmail } },
      },
    });
    await prisma.studioDocument.create({
      data: {
        id: documentId,
        projectId,
        stableId: `document-stable-${nonce}`,
        title: "Coaching evidence draft",
        sourceLabel: "document-kind:draft",
        blocks: {
          create: [
            { id: firstBlockId, stableId: `block-a-stable-${nonce}`, order: 0, title: "Evidence", body: originalBody },
            { id: secondBlockId, stableId: `block-b-stable-${nonce}`, order: 1, title: "Next move", body: "Turn the insight into one named task." },
          ],
        },
      },
    });
    await prisma.studioTag.create({ data: { id: tagId, projectId, slug: `evidence-${nonce}`, label: "Evidence", category: "meaning" } });
    await prisma.studioTaggedSpan.create({
      data: {
        id: spanId,
        documentId,
        blockId: firstBlockId,
        tagId,
        startOffset: 0,
        endOffset: 18,
        selectedText: "Preserved evidence",
        documentStableId: `document-stable-${nonce}`,
        documentTitleSnapshot: "Coaching evidence draft",
        blockStableId: `block-a-stable-${nonce}`,
        blockTitleSnapshot: "Evidence",
      },
    });
    await prisma.studioSourceUnit.create({
      data: { id: sourceUnitId, projectId, slug: `source-${nonce}`, kind: "note", title: "Coaching source", immutableText: "Preserved evidence" },
    });
    await prisma.studioSourceAnnotation.create({
      data: {
        id: annotationId,
        projectId,
        sourceUnitId,
        documentId,
        blockId: firstBlockId,
        kind: "claim",
        visibility: "project",
        body: "Use this evidence.",
        selectorKind: "text-quote",
        startOffset: 0,
        endOffset: 18,
        exactText: "Preserved evidence",
      },
    });
    await prisma.studioSourceAnnotationUse.create({
      data: {
        id: citationId,
        annotationId,
        projectId,
        documentId,
        blockId: firstBlockId,
        useKind: "evidence",
        citationKey: `source-${nonce}`,
        quoteSnapshot: "Preserved evidence",
        citationLabel: "Coaching source",
        sourceJson: { sourceMutated: false },
      },
    });
  });

  afterAll(async () => {
    await prisma.studioWorkspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("checkpoints, exports, restores, and preserves exact identity and citation anchors", async () => {
    signedInAs(writerEmail);
    const noteBody = "Keep this exact coaching insight attached to its source passage.";
    const passage = "deliberate coaching";
    const passageStart = originalBody.indexOf(passage);
    const commentResult = await addBlockComment(
      firstBlockId,
      passageStart,
      passageStart + passage.length,
      passage,
      noteBody,
    );
    expect(commentResult).toMatchObject({
      ok: true,
      state: "persisted",
      reused: false,
    });
    if (!commentResult.ok) throw new Error("Passage note failed.");
    expect(commentResult.operationId).toBeTruthy();

    const checkpointResult = await createNamedDocumentCheckpointAction(documentId, "Coaching source pass approved");
    expect(checkpointResult).toMatchObject({
      ok: true,
      checkpoint: { name: "Coaching source pass approved", blockCount: 2, spanCount: 2, citationCount: 1 },
    });
    if (!checkpointResult.ok || !checkpointResult.checkpoint) throw new Error("Checkpoint failed.");

    const exportResult = await exportPortableDocumentAction(documentId);
    expect(exportResult).toMatchObject({ ok: true });
    if (!exportResult.ok || !exportResult.bundleJson) throw new Error("Export failed.");
    const exported = JSON.parse(exportResult.bundleJson);
    expect(exported).toMatchObject({
      schemaVersion: "quipsly-document-export-v1",
      snapshot: { document: { id: documentId } },
      integrity: { blockCount: 2, spanCount: 2, citationCount: 1 },
    });
    expect(exported.snapshot.blocks[0]).toMatchObject({
      id: firstBlockId,
      spans: expect.arrayContaining([
        expect.objectContaining({ id: commentResult.commentId, tagSlug: "comment", selectedText: passage, noteBody }),
      ]),
      citations: [{ id: citationId }],
    });

    const laterBlockId = `document-later-${nonce}`;
    await prisma.studioDocumentBlock.update({ where: { id: firstBlockId }, data: { body: "A later edit that should be reversible." } });
    await prisma.studioDocumentBlock.create({
      data: { id: laterBlockId, documentId, stableId: `document-later-stable-${nonce}`, order: 2, body: "A later block should be archived, not deleted." },
    });

    const restoreResult = await restoreNamedDocumentCheckpointAction(documentId, checkpointResult.checkpoint.id);
    expect(restoreResult).toMatchObject({
      ok: true,
      receipt: { restoredFrom: "checkpoint", blockCount: 2, spanCount: 2, citationCount: 1 },
    });
    const restoredBlocks = await prisma.studioDocumentBlock.findMany({ where: { documentId }, orderBy: { order: "asc" } });
    expect(restoredBlocks.find((block) => block.id === firstBlockId)?.body).toBe(originalBody);
    expect(restoredBlocks.find((block) => block.id === laterBlockId)?.archivedAt).toBeInstanceOf(Date);
    expect(await prisma.studioSourceAnnotationUse.findUnique({ where: { id: citationId } })).toMatchObject({
      annotationId,
      documentId,
      blockId: firstBlockId,
      quoteSnapshot: "Preserved evidence",
    });
    expect(await prisma.studioTaggedSpan.findUnique({ where: { id: spanId } })).toMatchObject({
      blockId: firstBlockId,
      selectedText: "Preserved evidence",
    });
    expect(await prisma.studioTaggedSpan.findUnique({ where: { id: commentResult.commentId } })).toMatchObject({
      blockId: firstBlockId,
      selectedText: passage,
      noteBody,
    });

    await prisma.studioDocumentBlock.update({ where: { id: secondBlockId }, data: { body: "A second temporary mutation." } });
    const portableRestore = await restorePortableDocumentAction(documentId, exportResult.bundleJson);
    expect(portableRestore).toMatchObject({ ok: true, receipt: { restoredFrom: "portable-export", blockCount: 2 } });
    expect(await prisma.studioDocumentBlock.findUnique({ where: { id: secondBlockId } })).toMatchObject({ body: "Turn the insight into one named task.", archivedAt: null });

    const restoreOperations = await prisma.studioDocumentOperation.findMany({
      where: { documentId, operationType: { in: ["document-checkpoint-restore", "document-portable-restore"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(restoreOperations).toHaveLength(2);
    expect(restoreOperations.every((operation) => operation.beforeJson && operation.afterJson && operation.reversible)).toBe(true);
  });

  it("rejects tampered exports and separate-account reads without changing content", async () => {
    signedInAs(writerEmail);
    const exportResult = await exportPortableDocumentAction(documentId);
    if (!exportResult.ok || !exportResult.bundleJson) throw new Error("Export failed.");
    const tampered = JSON.parse(exportResult.bundleJson);
    tampered.snapshot.blocks[0].body = "Tampered bytes";
    const before = await prisma.studioDocumentBlock.findUnique({ where: { id: firstBlockId }, select: { body: true } });
    await expect(restorePortableDocumentAction(documentId, JSON.stringify(tampered))).resolves.toMatchObject({
      ok: false,
      code: "INVALID_EXPORT",
    });
    expect(await prisma.studioDocumentBlock.findUnique({ where: { id: firstBlockId }, select: { body: true } })).toEqual(before);

    signedInAs(outsiderEmail);
    await expect(listNamedDocumentCheckpointsAction(documentId)).resolves.toMatchObject({
      ok: false,
      code: "ACCESS_NOT_VERIFIED",
    });
  });

  it("persists ordinary multi-paragraph paste atomically and refuses to split a cited block", async () => {
    signedInAs(writerEmail);
    const plainBefore = await prisma.studioDocumentBlock.findUniqueOrThrow({ where: { id: secondBlockId }, select: { body: true } });
    const pasted = await pastePlainTextBlocksAction(
      secondBlockId,
      ["Name the action.", "Assign one owner.", "Schedule the follow-up."],
      0,
      plainBefore.body.length,
    );
    expect(pasted).toMatchObject({
      ok: true,
      currentBlock: { id: secondBlockId, text: "Name the action." },
      newBlocks: [{ text: "Assign one owner." }, { text: "Schedule the follow-up." }],
    });
    if (!pasted.ok) throw new Error("Atomic paste failed.");
    expect(pasted.newBlocks.every((block) => !block.id.startsWith("pending-"))).toBe(true);
    const pastedIds = [secondBlockId, ...pasted.newBlocks.map((block) => block.id)];
    expect(await prisma.studioDocumentBlock.findMany({ where: { id: { in: pastedIds } }, orderBy: { order: "asc" }, select: { id: true, body: true, archivedAt: true } })).toEqual([
      { id: secondBlockId, body: "Name the action.", archivedAt: null },
      { id: pasted.newBlocks[0].id, body: "Assign one owner.", archivedAt: null },
      { id: pasted.newBlocks[1].id, body: "Schedule the follow-up.", archivedAt: null },
    ]);
    expect(await prisma.studioDocumentOperation.findUnique({ where: { id: pasted.operationId } })).toMatchObject({
      operationType: "paste-split-blocks",
      reversible: true,
    });

    const citedBefore = await prisma.studioDocumentBlock.findUniqueOrThrow({ where: { id: firstBlockId }, select: { body: true } });
    await expect(pastePlainTextBlocksAction(firstBlockId, ["One", "Two"], 0, citedBefore.body.length)).resolves.toMatchObject({
      ok: false,
      code: "PROTECTED_BLOCK",
    });
    expect(await prisma.studioDocumentBlock.findUnique({ where: { id: firstBlockId }, select: { body: true } })).toEqual(citedBefore);
  });
});
