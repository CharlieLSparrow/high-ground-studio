/** @jest-environment node */

import { createHash, randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import {
  canonicalDocumentNoteSelect,
  editCanonicalDocumentNoteInTransaction,
  projectCanonicalDocumentNote,
} from "./canonical-document-note-edit";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;

if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the canonical document note edit smoke.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("canonical document note editing local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `document-note-edit-${nonce}@example.test`;
  const outsiderEmail = `document-note-outsider-${nonce}@example.test`;
  let actorUserId = "";
  let outsiderUserId = "";
  let workspaceId = "";
  let projectId = "";
  let classificationTagId = "";
  let passageTagId = "";

  beforeAll(async () => {
    const [actor, outsider] = await Promise.all([
      prisma.user.create({
        data: { primaryEmail: actorEmail, name: "Document note editor" },
      }),
      prisma.user.create({
        data: { primaryEmail: outsiderEmail, name: "Document note outsider" },
      }),
    ]);
    actorUserId = actor.id;
    outsiderUserId = outsider.id;

    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `document-note-edit-${nonce}`,
        name: "Document note edit smoke",
      },
    });
    workspaceId = workspace.id;

    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `document-note-edit-${nonce}`,
        name: "High Ground Odyssey",
      },
    });
    projectId = project.id;

    const [classificationTag, passageTag] = await Promise.all([
      prisma.studioTag.create({
        data: {
          projectId,
          slug: `episode-prep-${nonce}`,
          label: "Episode prep",
        },
      }),
      prisma.studioTag.create({
        data: {
          projectId,
          slug: `listener-question-${nonce}`,
          label: "Listener question",
        },
      }),
    ]);
    classificationTagId = classificationTag.id;
    passageTagId = passageTag.id;

    await prisma.studioProjectAccessGrant.create({
      data: {
        projectId,
        email: actorEmail,
        role: "EDITOR",
        status: "ACTIVE",
        createdByUserId: actorUserId,
        createdByEmail: actorEmail,
      },
    });
  });

  afterAll(async () => {
    try {
      if (workspaceId) {
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      }
      if (actorUserId || outsiderUserId) {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: [actorUserId, outsiderUserId].filter(Boolean),
            },
          },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createAnchoredNote(label: string) {
    const documentId = `document-note-${label}-${randomUUID()}`;
    const titleBlockId = `document-note-title-${randomUUID()}`;
    const bodyBlockId = `document-note-body-${randomUUID()}`;
    const titleBlockStableId = `document-note-title-stable-${randomUUID()}`;
    const bodyBlockStableId = `document-note-body-stable-${randomUUID()}`;
    const body =
      "Opening thought: keep the quiet question anchored for Homer.";
    const anchorText = "quiet question";
    const anchorStart = body.indexOf(anchorText);
    const document = await prisma.studioDocument.create({
      data: {
        id: documentId,
        projectId,
        stableId: `document-note-stable-${randomUUID()}`,
        title: "Episode opening",
        sourceLabel: "document-kind:note;origin:document-note-edit-smoke",
        blocks: {
          create: [
            {
              id: titleBlockId,
              stableId: titleBlockStableId,
              order: 0,
              title: "Note Title",
              body: "Episode opening",
              sourceLabel:
                "document-kind:note;origin:document-note-edit-smoke",
            },
            {
              id: bodyBlockId,
              stableId: bodyBlockStableId,
              order: 1,
              title: "Note Body",
              body,
              sourceLabel:
                "document-kind:note;origin:document-note-edit-smoke",
            },
          ],
        },
        tagLinks: {
          create: {
            tagId: classificationTagId,
            createdByUserId: actorUserId,
            sourceJson: {
              schema: "quipsly-record-tag-link-v1",
              fixture: "document-note-edit-smoke",
            },
          },
        },
      },
    });

    const [classificationSpan, passageSpan] = await Promise.all([
      prisma.studioTaggedSpan.create({
        data: {
          documentId,
          blockId: bodyBlockId,
          tagId: classificationTagId,
          startOffset: 0,
          endOffset: body.length,
          selectedText: body,
          documentStableId: document.stableId,
          documentTitleSnapshot: document.title,
          blockStableId: bodyBlockStableId,
          blockTitleSnapshot: "Note Body",
          sourceLabel:
            "document-kind:note;origin:document-note-edit-smoke",
        },
      }),
      prisma.studioTaggedSpan.create({
        data: {
          documentId,
          blockId: bodyBlockId,
          tagId: passageTagId,
          startOffset: anchorStart,
          endOffset: anchorStart + anchorText.length,
          selectedText: anchorText,
          documentStableId: document.stableId,
          documentTitleSnapshot: document.title,
          blockStableId: bodyBlockStableId,
          blockTitleSnapshot: "Note Body",
          sourceLabel:
            "document-kind:note;origin:document-note-edit-smoke",
        },
      }),
    ]);
    const passageTag = await prisma.studioTag.findUniqueOrThrow({
      where: { id: passageTagId },
    });
    const knowledgeNode = await prisma.studioKnowledgeNode.create({
      data: {
        projectId,
        documentId,
        blockId: bodyBlockId,
        taggedSpanId: passageSpan.id,
        tagId: passageTag.id,
        tagLabel: passageTag.label,
        tagCategory: passageTag.category,
        nodeType: passageTag.nodeType,
        sourceText: anchorText,
        title: "Listener question evidence",
        body: "Reviewed evidence must retain exact source text while its safe offset follows the block.",
        reviewStatus: "reviewed",
        documentStableId: document.stableId,
        documentTitleSnapshot: document.title,
        blockStableId: bodyBlockStableId,
        blockTitleSnapshot: "Note Body",
        spanStartOffset: anchorStart,
        spanEndOffset: anchorStart + anchorText.length,
        sourceLabel:
          "document-kind:note;origin:document-note-edit-smoke",
      },
    });

    return {
      documentId,
      titleBlockId,
      bodyBlockId,
      body,
      anchorText,
      anchorStart,
      classificationSpanId: classificationSpan.id,
      passageSpanId: passageSpan.id,
      knowledgeNodeId: knowledgeNode.id,
    };
  }

  async function loadSnapshot(documentId: string) {
    const record = await prisma.studioDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: canonicalDocumentNoteSelect,
    });
    return projectCanonicalDocumentNote(record);
  }

  it("atomically preserves stable blocks, classification, tags, and partial anchors and exactly replays one protected edit", async () => {
    const fixture = await createAnchoredNote("safe");
    const before = await loadSnapshot(fixture.documentId);
    const prefix = "Before we begin. ";
    const nextBody = `${prefix}${fixture.body}`;
    const requestId = randomUUID();
    const input = {
      actorUserId,
      actorEmail,
      documentId: fixture.documentId,
      expectedContentRevision: before.contentRevision,
      clientRequestId: requestId,
      title: "Episode opening rhythm",
      blocks: before.blocks.map((block) => ({
        id: block.id,
        stableId: block.stableId,
        body: block.id === fixture.bodyBlockId ? nextBody : block.body,
      })),
    };

    const first = await editCanonicalDocumentNoteInTransaction(input, prisma);
    const replay = await editCanonicalDocumentNoteInTransaction(input, prisma);
    expect(first).toMatchObject({
      ok: true,
      idempotentReplay: false,
      note: {
        id: fixture.documentId,
        title: "Episode opening rhythm",
        blocks: [{
          id: fixture.bodyBlockId,
          body: nextBody,
        }],
      },
      changedBlockIds: expect.arrayContaining([
        fixture.titleBlockId,
        fixture.bodyBlockId,
      ]),
    });
    expect(first.ok ? first.receiptId : "").toBe(
      `document-note-edit-${createHash("sha256")
        .update(`${actorUserId}|${fixture.documentId}|${requestId}`)
        .digest("hex")
        .slice(0, 32)}`,
    );
    expect(replay).toEqual({
      ...first,
      idempotentReplay: true,
    });

    const saved = await prisma.studioDocument.findUniqueOrThrow({
      where: { id: fixture.documentId },
      include: {
        blocks: { orderBy: { order: "asc" } },
        tagLinks: true,
        taggedSpans: { orderBy: { startOffset: "asc" } },
        knowledgeNodes: true,
        documentOperations: {
          where: { operationType: "document-note-content-edit" },
        },
      },
    });
    expect(saved.title).toBe("Episode opening rhythm");
    expect(saved.blocks.map((block) => ({
      id: block.id,
      stableId: block.stableId,
      order: block.order,
      body: block.body,
    }))).toEqual([
      {
        id: fixture.titleBlockId,
        stableId: expect.any(String),
        order: 0,
        body: "Episode opening rhythm",
      },
      {
        id: fixture.bodyBlockId,
        stableId: before.blocks[0]?.stableId,
        order: 1,
        body: nextBody,
      },
    ]);
    expect(saved.tagLinks).toHaveLength(1);
    expect(saved.tagLinks[0]?.tagId).toBe(classificationTagId);

    const classificationSpan = saved.taggedSpans.find(
      (span) => span.id === fixture.classificationSpanId,
    );
    const passageSpan = saved.taggedSpans.find(
      (span) => span.id === fixture.passageSpanId,
    );
    expect(classificationSpan).toMatchObject({
      startOffset: 0,
      endOffset: nextBody.length,
      selectedText: nextBody,
      documentTitleSnapshot: "Episode opening rhythm",
    });
    expect(passageSpan).toMatchObject({
      startOffset: fixture.anchorStart + prefix.length,
      endOffset:
        fixture.anchorStart + prefix.length + fixture.anchorText.length,
      selectedText: fixture.anchorText,
      documentTitleSnapshot: "Episode opening rhythm",
    });
    expect(saved.knowledgeNodes).toEqual([
      expect.objectContaining({
        id: fixture.knowledgeNodeId,
        sourceText: fixture.anchorText,
        spanStartOffset: fixture.anchorStart + prefix.length,
        spanEndOffset:
          fixture.anchorStart + prefix.length + fixture.anchorText.length,
        reviewStatus: "reviewed",
        documentTitleSnapshot: "Episode opening rhythm",
      }),
    ]);
    expect(saved.documentOperations).toHaveLength(1);
    expect(saved.documentOperations[0]).toMatchObject({
      id: first.ok ? first.receiptId : "",
      groupId: `document-note-edit:${requestId}`,
      actorEmail,
      origin: "human",
      status: "applied",
      reversible: true,
      beforeJson: {
        title: "Episode opening",
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: fixture.bodyBlockId,
            body: fixture.body,
          }),
        ]),
      },
      afterJson: {
        schema: "quipsly-document-note-edit-v1",
        acknowledged: {
          title: "Episode opening rhythm",
          contentRevision: first.ok
            ? first.note.contentRevision
            : expect.any(String),
        },
        anchorsPreserved: true,
        tagsChanged: false,
        structureChanged: false,
        sourceMutated: false,
        externalSideEffects: false,
      },
    });

    const stale = await editCanonicalDocumentNoteInTransaction({
      ...input,
      clientRequestId: randomUUID(),
      title: "Stale overwrite",
    }, prisma);
    expect(stale).toMatchObject({
      ok: false,
      code: "CONFLICT",
      current: {
        title: "Episode opening rhythm",
        contentRevision: first.ok
          ? first.note.contentRevision
          : expect.any(String),
      },
    });

    const denied = await editCanonicalDocumentNoteInTransaction({
      ...input,
      actorUserId: outsiderUserId,
      actorEmail: outsiderEmail,
      expectedContentRevision: first.ok
        ? first.note.contentRevision
        : before.contentRevision,
      clientRequestId: randomUUID(),
      title: "Cross-account overwrite",
    }, prisma);
    expect(denied).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(loadSnapshot(fixture.documentId)).resolves.toMatchObject({
      title: "Episode opening rhythm",
      blocks: [{ body: nextBody }],
    });
  });

  it("fails closed before replacing a complete anchored passage", async () => {
    const fixture = await createAnchoredNote("anchor-review");
    const before = await loadSnapshot(fixture.documentId);
    const nextBody = fixture.body.replace(
      fixture.anchorText,
      "entirely different premise",
    );
    const result = await editCanonicalDocumentNoteInTransaction({
      actorUserId,
      actorEmail,
      documentId: fixture.documentId,
      expectedContentRevision: before.contentRevision,
      clientRequestId: randomUUID(),
      title: before.title,
      blocks: before.blocks.map((block) => ({
        id: block.id,
        stableId: block.stableId,
        body: nextBody,
      })),
    }, prisma);

    expect(result).toMatchObject({
      ok: false,
      code: "ANCHOR_REVIEW_REQUIRED",
      error: expect.stringContaining("quiet question"),
    });
    await expect(loadSnapshot(fixture.documentId)).resolves.toMatchObject({
      title: "Episode opening",
      contentRevision: before.contentRevision,
      blocks: [{ body: fixture.body }],
    });
    await expect(prisma.studioDocumentOperation.count({
      where: {
        documentId: fixture.documentId,
        operationType: "document-note-content-edit",
      },
    })).resolves.toBe(0);
  });
});
