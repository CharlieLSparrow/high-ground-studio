/** @jest-environment node */

import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { createGovernedAssistantProposalRun } from "@/lib/server/governed-action-runtime";
import {
  applyAssistantDocumentEditAction,
  commitAssistantEntityAction,
  recordAssistantNonMutatingResultAction,
  recordAssistantProposalDecisionAction,
  undoAppliedAssistantDocumentEditAction,
  undoCommittedAssistantEntityAction,
} from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn(), Schema: {}, Type: {} }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("../manuscript/manuscript-editor-model", () => ({
  createManuscriptDraftPlainText: jest.fn(() => ""),
  safeManuscriptDraft: jest.fn(() => null),
}));
jest.mock("./starterDocuments", () => ({ createStarterBlocks: jest.fn(() => []) }));

const databaseEnabled = process.env.QUIPSLY_ASSISTANT_DB_SMOKE === "1" || process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
const runLocalDatabaseSmoke = databaseEnabled ? describe : describe.skip;
if (databaseEnabled) {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the assistant mutation smoke.");
  const target = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Assistant integration tests require a local disposable database.");
  process.env.DATABASE_URL = target.href;
}

runLocalDatabaseSmoke("assistant mutation disposable database", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const writerEmail = `assistant-writer-${nonce}@example.test`;
  const outsiderEmail = `assistant-outsider-${nonce}@example.test`;
  const workspaceId = `assistant-workspace-${nonce}`;
  const projectId = `assistant-project-${nonce}`;
  const documentId = `assistant-document-${nonce}`;
  const firstBlockId = `assistant-source-block-${nonce}`;
  const secondBlockId = `assistant-second-block-${nonce}`;
  const sessionId = `assistant-session-${nonce}`;
  const actionIds = {
    rewrite: `assistant-rewrite-${nonce}`,
    conflict: `assistant-conflict-${nonce}`,
    stale: `assistant-stale-${nonce}`,
    draft: `assistant-draft-${nonce}`,
    decision: `assistant-decision-${nonce}`,
    readOnly: `assistant-read-only-${nonce}`,
    entityCreate: `assistant-entity-create-${nonce}`,
    entityStale: `assistant-entity-stale-${nonce}`,
    entityUpdate: `assistant-entity-update-${nonce}`,
  };
  const originalText = "The opening asks whether courage means certainty.";
  const rewrittenText = "The opening asks whether courage means staying present without certainty.";
  let existingEntityId = "";
  let governedRewriteActionId = "";
  let governedRewriteRunId = "";

  function signedInAs(email: string) {
    jest.mocked(auth).mockResolvedValue({ user: { id: email, email, primaryEmail: email } } as never);
  }

  beforeAll(async () => {
    signedInAs(writerEmail);
    await prisma.user.create({
      data: { id: writerEmail, primaryEmail: writerEmail },
    });
    await prisma.studioWorkspace.create({
      data: {
        id: workspaceId,
        slug: `assistant-${nonce}`,
        name: "Assistant mutation smoke",
        projects: {
          create: {
            id: projectId,
            slug: `assistant-project-${nonce}`,
            name: "High Ground Assistant Smoke",
            accessGrants: {
              create: {
                email: writerEmail,
                role: "EDITOR",
                status: "ACTIVE",
                createdByEmail: writerEmail,
              },
            },
            documents: {
              create: {
                id: documentId,
                stableId: `assistant-document-stable-${nonce}`,
                title: "Episode opening",
                blocks: {
                  create: [
                    { id: firstBlockId, stableId: `assistant-first-${nonce}`, order: 0, body: originalText },
                    { id: secondBlockId, stableId: `assistant-second-${nonce}`, order: 1, body: "A second source block remains unchanged." },
                  ],
                },
              },
            },
          },
        },
      },
    });
    await prisma.studioAssistantSession.create({
      data: { id: sessionId, projectId, documentId, ownerUserId: writerEmail, status: "ACTIVE" },
    });
    await prisma.studioAssistantAction.createMany({
      data: [
        {
          id: actionIds.rewrite,
          sessionId,
          kind: "PROPOSE_REWRITE",
          label: "Clarify courage",
          riskLevel: "HIGH",
          payloadJson: { blockId: firstBlockId, originalText, rewriteText: rewrittenText },
        },
        {
          id: actionIds.stale,
          sessionId,
          kind: "PROPOSE_REWRITE",
          label: "Stale rewrite",
          riskLevel: "HIGH",
          payloadJson: { blockId: firstBlockId, originalText, rewriteText: "This must not overwrite the newer text." },
        },
        {
          id: actionIds.conflict,
          sessionId,
          kind: "PROPOSE_REWRITE",
          label: "Rewrite second block",
          riskLevel: "HIGH",
          payloadJson: {
            blockId: secondBlockId,
            originalText: "A second source block remains unchanged.",
            rewriteText: "The second block receives an assistant revision.",
          },
        },
        {
          id: actionIds.draft,
          sessionId,
          kind: "PROPOSE_DRAFT",
          label: "Add a breathing beat",
          riskLevel: "HIGH",
          payloadJson: { targetBlockId: firstBlockId, draftText: "A short beat lets the question breathe before the conversation continues." },
        },
        {
          id: actionIds.decision,
          sessionId,
          kind: "CHECK_CONTINUITY",
          label: "Continuity review decision",
          riskLevel: "LOW",
          payloadJson: { issue: "Check the opening handoff." },
        },
        {
          id: actionIds.readOnly,
          sessionId,
          kind: "find-related-blocks",
          label: "Find related blocks",
          riskLevel: "LOW",
          payloadJson: { query: "courage" },
        },
        {
          id: actionIds.entityStale,
          sessionId,
          kind: "PROPOSE_ENTITY",
          label: "Invented theme",
          riskLevel: "MEDIUM",
          payloadJson: {
            name: "Invented certainty",
            type: "THEME_MOTIF",
            attributes: { sourceExcerpt: "These words never appeared in the manuscript." },
          },
        },
        {
          id: actionIds.entityCreate,
          sessionId,
          kind: "PROPOSE_ENTITY",
          label: "Courage theme",
          riskLevel: "MEDIUM",
          payloadJson: {
            name: "Courage without certainty",
            type: "THEME_MOTIF",
            aliases: ["uncertain courage"],
            attributes: { sourceExcerpt: originalText, relevance: "Episode opening theme" },
          },
        },
      ],
    });
    const governedRewrite = await prisma.$transaction((tx) => createGovernedAssistantProposalRun(tx, {
      projectId,
      documentId,
      assistantSessionId: sessionId,
      actorUserId: writerEmail,
      actorEmail: writerEmail,
      intent: "Clarify the exact opening without silently overwriting it.",
      sourceSurface: "assistant-mutation-integration",
      provider: "retained-fixture",
      readSet: [{ objectType: "StudioDocumentBlock", objectId: firstBlockId }],
      proposals: [{
        assistantActionId: actionIds.rewrite,
        kind: "PROPOSE_REWRITE",
        label: "Clarify courage",
        explanation: "Exercise the retained proposal, execution, and recovery lifecycle.",
        payload: { blockId: firstBlockId, originalText, rewriteText: rewrittenText },
      }],
    }));
    governedRewriteActionId = governedRewrite.actions[0]?.governedActionId ?? "";
    governedRewriteRunId = governedRewrite.runId ?? "";
    await prisma.$transaction((tx) => createGovernedAssistantProposalRun(tx, {
      projectId,
      documentId,
      assistantSessionId: sessionId,
      actorUserId: writerEmail,
      actorEmail: writerEmail,
      intent: "Find related source material now.",
      sourceSurface: "assistant-mutation-integration",
      provider: "retained-fixture",
      readSet: [{ objectType: "StudioDocumentBlock", objectId: firstBlockId }],
      proposals: [{
        assistantActionId: actionIds.readOnly,
        kind: "find-related-blocks",
        label: "Find related blocks",
        explanation: "Exercise immediate read-only work without an approval decision.",
        payload: { query: "courage" },
      }],
    }));
    const existing = await prisma.storyEntity.create({
      data: {
        projectId,
        type: "CHARACTER",
        name: "Homer",
        aliases: ["Host"],
        attributes: { sourceExcerpt: "Homer asks the opening question.", role: "host" },
      },
    });
    existingEntityId = existing.id;
    await prisma.studioAssistantAction.create({
      data: {
        id: actionIds.entityUpdate,
        sessionId,
        kind: "PROPOSE_ENTITY_UPDATE",
        label: "Update Homer",
        riskLevel: "MEDIUM",
        payloadJson: {
          entityId: existing.id,
          name: "Homer",
          type: "CHARACTER",
          aliases: ["Host", "Interviewer"],
          attributes: { sourceExcerpt: originalText, role: "host and interviewer" },
        },
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.studioAssistantSession.deleteMany({ where: { id: sessionId } });
      await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      await prisma.user.deleteMany({ where: { id: writerEmail } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("applies one exact-source rewrite, replays its receipt, and rejects a stale overwrite", async () => {
    signedInAs(writerEmail);
    const applied = await applyAssistantDocumentEditAction(actionIds.rewrite);
    const replay = await applyAssistantDocumentEditAction(actionIds.rewrite);
    const stale = await applyAssistantDocumentEditAction(actionIds.stale);

    expect(applied).toMatchObject({ ok: true, replay: false, receipt: { blockId: firstBlockId, kind: "rewrite", text: rewrittenText } });
    expect(replay).toEqual({ ...applied, replay: true });
    expect(stale).toMatchObject({ ok: false, code: "STALE_SOURCE" });
    await expect(prisma.studioDocumentBlock.findUnique({ where: { id: firstBlockId }, select: { body: true } }))
      .resolves.toEqual({ body: rewrittenText });
    await expect(prisma.studioDocumentOperation.count({ where: { documentId, operationType: "assistant-rewrite-apply" } }))
      .resolves.toBe(1);

    const undone = await undoAppliedAssistantDocumentEditAction(actionIds.rewrite);
    const undoReplay = await undoAppliedAssistantDocumentEditAction(actionIds.rewrite);
    expect(undone).toMatchObject({ ok: true, replay: false, receipt: { operationId: applied.ok ? applied.receipt.operationId : "" } });
    expect(undoReplay).toEqual({ ...undone, replay: true });
    await expect(prisma.studioDocumentBlock.findUnique({ where: { id: firstBlockId }, select: { body: true } }))
      .resolves.toEqual({ body: originalText });
    await expect(prisma.studioDocumentOperation.findFirst({
      where: { documentId, operationType: "assistant-rewrite-apply" },
      select: { status: true, revertedAt: true },
    })).resolves.toMatchObject({ status: "reverted", revertedAt: expect.any(Date) });
    await expect(prisma.governedAction.findUnique({
      where: { id: governedRewriteActionId },
      include: { attempts: { orderBy: { attemptNumber: "asc" } }, receipts: { orderBy: { createdAt: "asc" } } },
    })).resolves.toMatchObject({
      runId: governedRewriteRunId,
      capabilityId: "quipsly.writing.rewrite.propose",
      decisionPolicy: "DELEGATED",
      decisionStatus: "NOT_REQUIRED",
      status: "UNDONE",
      attempts: [
        { attemptNumber: 1, status: "SUCCEEDED", executorKind: "quipsly-writing-domain-service" },
        { attemptNumber: 2, status: "SUCCEEDED", executorKind: "quipsly-writing-recovery-domain-service" },
      ],
      receipts: [
        { kind: "EXECUTION_SUCCEEDED", newStatus: "SUCCEEDED" },
        { kind: "RECOVERY_COMPLETED", newStatus: "UNDONE" },
      ],
    });
    await expect(prisma.governedActionRun.findUnique({ where: { id: governedRewriteRunId }, select: { status: true, completedAt: true } }))
      .resolves.toMatchObject({ status: "SUCCEEDED", completedAt: expect.any(Date) });
  });

  it("refuses rollback when newer human work replaced the assistant text", async () => {
    signedInAs(writerEmail);
    await expect(applyAssistantDocumentEditAction(actionIds.conflict)).resolves.toMatchObject({ ok: true });
    await prisma.studioDocumentBlock.update({
      where: { id: secondBlockId },
      data: { body: "A human revision written after the assistant apply." },
    });

    await expect(undoAppliedAssistantDocumentEditAction(actionIds.conflict)).resolves.toMatchObject({
      ok: false,
      code: "STALE_SOURCE",
    });
    await expect(prisma.studioDocumentBlock.findUnique({ where: { id: secondBlockId }, select: { body: true } }))
      .resolves.toEqual({ body: "A human revision written after the assistant apply." });
  });

  it("inserts one deterministic draft after its exact target and denies an outsider", async () => {
    signedInAs(outsiderEmail);
    await expect(applyAssistantDocumentEditAction(actionIds.draft)).resolves.toMatchObject({ ok: false, code: "ACCESS_NOT_VERIFIED" });

    signedInAs(writerEmail);
    const [firstAttempt, secondAttempt] = await Promise.all([
      applyAssistantDocumentEditAction(actionIds.draft),
      applyAssistantDocumentEditAction(actionIds.draft),
    ]);
    const applied = firstAttempt.ok && !firstAttempt.replay ? firstAttempt : secondAttempt;
    const replay = firstAttempt.ok && firstAttempt.replay ? firstAttempt : secondAttempt;
    expect(applied).toMatchObject({ ok: true, replay: false, receipt: { kind: "draft", insertAfterBlockId: firstBlockId } });
    expect(replay).toEqual({ ...applied, replay: true });
    await expect(prisma.studioDocumentOperation.count({ where: { documentId, operationType: "assistant-draft-insert" } }))
      .resolves.toBe(1);
    const blocks = await prisma.studioDocumentBlock.findMany({
      where: { documentId },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    expect(blocks.map((block) => block.id)).toEqual([
      firstBlockId,
      `assistant-block-${actionIds.draft}`,
      secondBlockId,
    ]);

    await expect(undoAppliedAssistantDocumentEditAction(actionIds.draft)).resolves.toMatchObject({ ok: true, replay: false });
    await expect(prisma.studioDocumentBlock.findUnique({ where: { id: `assistant-block-${actionIds.draft}` } })).resolves.toBeNull();
    await expect(prisma.studioDocumentBlock.findUnique({ where: { id: secondBlockId }, select: { order: true } }))
      .resolves.toEqual({ order: 1 });
  });

  it("persists approve, undo-approval, and reject decisions without a content mutation", async () => {
    signedInAs(writerEmail);
    await expect(recordAssistantProposalDecisionAction(actionIds.decision, "approved"))
      .resolves.toMatchObject({ ok: true, replay: false, receipt: { previousStatus: "proposed", status: "approved" } });
    await expect(recordAssistantProposalDecisionAction(actionIds.decision, "proposed"))
      .resolves.toMatchObject({ ok: true, replay: false, receipt: { previousStatus: "approved", status: "proposed" } });
    await expect(recordAssistantProposalDecisionAction(actionIds.decision, "rejected"))
      .resolves.toMatchObject({ ok: true, replay: false, receipt: { previousStatus: "proposed", status: "rejected" } });
    await expect(recordAssistantProposalDecisionAction(actionIds.decision, "approved"))
      .resolves.toMatchObject({ ok: false, code: "STALE_SOURCE" });
    await expect(prisma.studioAssistantLedger.count({ where: { actionId: actionIds.decision } })).resolves.toBe(3);
  });

  it("completes read-only work with transparent evidence and no approval state", async () => {
    signedInAs(outsiderEmail);
    await expect(recordAssistantNonMutatingResultAction(actionIds.readOnly, {
      outcome: "succeeded",
      resultCount: 2,
      detail: "Two related source blocks.",
    })).resolves.toMatchObject({ ok: false, code: "ACCESS_NOT_VERIFIED" });

    signedInAs(writerEmail);
    const completed = await recordAssistantNonMutatingResultAction(actionIds.readOnly, {
      outcome: "succeeded",
      resultCount: 2,
      detail: "Two related source blocks.",
    });
    const replay = await recordAssistantNonMutatingResultAction(actionIds.readOnly, {
      outcome: "succeeded",
      resultCount: 2,
      detail: "Two related source blocks.",
    });

    expect(completed).toMatchObject({
      ok: true,
      replay: false,
      receipt: { outcome: "succeeded", resultCount: 2 },
    });
    expect(replay).toEqual({ ...completed, replay: true });
    await expect(prisma.studioAssistantAction.findUnique({
      where: { id: actionIds.readOnly },
      select: {
        status: true,
        governedAction: {
          select: {
            status: true,
            decisionPolicy: true,
            decisionStatus: true,
            approvedByUserId: true,
          },
        },
      },
    })).resolves.toEqual({
      status: "completed",
      governedAction: {
        status: "SUCCEEDED",
        decisionPolicy: "READ_ONLY",
        decisionStatus: "NOT_REQUIRED",
        approvedByUserId: null,
      },
    });
  });

  it("commits one exact-source canonical Story Bible entity and deletes only that entity on undo", async () => {
    signedInAs(writerEmail);
    await expect(recordAssistantProposalDecisionAction(actionIds.entityCreate, "approved")).resolves.toMatchObject({ ok: true });
    const committed = await commitAssistantEntityAction(actionIds.entityCreate);
    const replay = await commitAssistantEntityAction(actionIds.entityCreate);
    expect(committed).toMatchObject({ ok: true, replay: false, receipt: { operation: "created", projectId } });
    expect(replay).toEqual({ ...committed, replay: true });
    if (!committed.ok) throw new Error("Entity commit did not return its receipt.");
    await expect(prisma.storyEntity.findUnique({ where: { id: committed.receipt.entityId }, select: { name: true, attributes: true } }))
      .resolves.toMatchObject({
        name: "Courage without certainty",
        attributes: {
          _assistantActionId: actionIds.entityCreate,
          sourceDocumentId: documentId,
          sourceBlockId: firstBlockId,
          sourceExcerpt: originalText,
        },
      });

    await expect(undoCommittedAssistantEntityAction(actionIds.entityCreate)).resolves.toMatchObject({ ok: true, receipt: { operation: "created" } });
    await expect(prisma.storyEntity.findUnique({ where: { id: committed.receipt.entityId } })).resolves.toBeNull();
    await expect(prisma.storyEntity.findUnique({ where: { id: existingEntityId } })).resolves.not.toBeNull();
  });

  it("refuses to canonicalize an entity whose exact excerpt is absent from the authorized document", async () => {
    signedInAs(writerEmail);
    const before = await prisma.storyEntity.count({ where: { projectId } });

    await expect(commitAssistantEntityAction(actionIds.entityStale)).resolves.toMatchObject({
      ok: false,
      code: "STALE_SOURCE",
    });
    await expect(prisma.storyEntity.count({ where: { projectId } })).resolves.toBe(before);
  });

  it("restores the exact prior canonical entity after an approved update is undone", async () => {
    signedInAs(writerEmail);
    await expect(commitAssistantEntityAction(actionIds.entityUpdate)).resolves.toMatchObject({
      ok: true,
      receipt: { entityId: existingEntityId, operation: "updated" },
    });
    await expect(prisma.storyEntity.findUnique({ where: { id: existingEntityId }, select: { aliases: true, attributes: true } }))
      .resolves.toMatchObject({ aliases: ["Host", "Interviewer"], attributes: { role: "host and interviewer" } });

    await expect(undoCommittedAssistantEntityAction(actionIds.entityUpdate)).resolves.toMatchObject({ ok: true });
    await expect(prisma.storyEntity.findUnique({ where: { id: existingEntityId }, select: { name: true, aliases: true, attributes: true } }))
      .resolves.toEqual({
        name: "Homer",
        aliases: ["Host"],
        attributes: { sourceExcerpt: "Homer asks the opening question.", role: "host" },
      });
  });

  let fixtureOrder = 1000;
  async function isolatedRewrite(externalId: string | null = null) {
    signedInAs(writerEmail);
    const block = await prisma.studioDocumentBlock.create({ data: {
      documentId, stableId: randomUUID(), order: fixtureOrder++, body: "Keep the original thought.", externalId,
    } });
    const action = await prisma.studioAssistantAction.create({ data: {
      sessionId, kind: "PROPOSE_REWRITE", label: "Clarify my paragraph", riskLevel: "MEDIUM",
      payloadJson: { blockId: block.id, originalText: block.body, rewriteText: "A clearer thought." },
    } });
    return { block, action };
  }

  it.each(["transcript:job:segment", "annotation-evidence:quote"])("never rewrites original evidence through the assistant: %s", async (prefix) => {
    const { block, action } = await isolatedRewrite(`${prefix}:${nonce}`);
    const result = await applyAssistantDocumentEditAction(action.id);
    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_ACTION" });
    expect((await prisma.studioDocumentBlock.findUniqueOrThrow({ where: { id: block.id } })).body).toBe(block.body);
    expect(await prisma.studioAssistantLedger.count({ where: { actionId: action.id, newStatus: "applied" } })).toBe(0);
  });

  it("does not overwrite a human edit committed after the assistant read its source", async () => {
    const { block, action } = await isolatedRewrite();
    const transaction = prisma.$transaction.bind(prisma);
    let changed = false;
    const spy = jest.spyOn(prisma, "$transaction").mockImplementation(((work: any) => transaction(async (tx) => {
      const findDocument = tx.studioDocument.findFirst.bind(tx.studioDocument);
      tx.studioDocument.findFirst = (async (...args: any[]) => {
        const snapshot = await (findDocument as any)(...args);
        if (!changed) {
          changed = true;
          // A separate connection commits between the source read and write.
          await prisma.studioDocumentBlock.update({ where: { id: block.id }, data: { body: "My newer human edit." } });
        }
        return snapshot;
      }) as typeof tx.studioDocument.findFirst;
      return work(tx);
    })) as any);
    let result;
    try { result = await applyAssistantDocumentEditAction(action.id); }
    finally { spy.mockRestore(); }
    expect(changed).toBe(true);
    expect(result).toMatchObject({ ok: false, code: "STALE_SOURCE" });
    expect((await prisma.studioDocumentBlock.findUniqueOrThrow({ where: { id: block.id } })).body).toBe("My newer human edit.");
    expect(await prisma.studioAssistantLedger.count({ where: { actionId: action.id, newStatus: "applied" } })).toBe(0);
  });

  it.each(["rewrite", "draft"])("keeps human typing committed during %s undo", async (kind) => {
    const fixture = await isolatedRewrite();
    if (kind === "draft") {
      await prisma.studioAssistantAction.update({ where: { id: fixture.action.id }, data: {
        kind: "PROPOSE_DRAFT", payloadJson: { draftText: "A new paragraph." },
      } });
    }
    const applied = await applyAssistantDocumentEditAction(fixture.action.id);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error);
    const blockId = applied.receipt.blockId;
    const transaction = prisma.$transaction.bind(prisma);
    let changed = false;
    const spy = jest.spyOn(prisma, "$transaction").mockImplementation(((work: any) => transaction(async (tx) => {
      const findBlock = tx.studioDocumentBlock.findFirst.bind(tx.studioDocumentBlock);
      tx.studioDocumentBlock.findFirst = (async (...args: any[]) => {
        const snapshot = await (findBlock as any)(...args);
        if (!changed && snapshot?.id === blockId) {
          changed = true;
          await prisma.studioDocumentBlock.update({ where: { id: blockId }, data: { body: "Typing during undo." } });
        }
        return snapshot;
      }) as typeof tx.studioDocumentBlock.findFirst;
      return work(tx);
    })) as any);
    let result;
    try { result = await undoAppliedAssistantDocumentEditAction(fixture.action.id); }
    finally { spy.mockRestore(); }
    expect(changed).toBe(true);
    expect(result).toMatchObject({ ok: false, code: "STALE_SOURCE" });
    expect((await prisma.studioDocumentBlock.findUniqueOrThrow({ where: { id: blockId } })).body).toBe("Typing during undo.");
    expect(await prisma.studioAssistantLedger.count({ where: { actionId: fixture.action.id, newStatus: "undone" } })).toBe(0);
  });

  it("fulfills a writing request through POST, saves an editable block, and supports undo without approval", async () => {
    signedInAs(writerEmail);
    const { POST } = await import("@/app/api/quipsly-assistant/route");
    const originalKey = process.env.GEMINI_API_KEY;
    const originalDisabled = process.env.QUIPSLY_DISABLE_AI_PROVIDER;
    process.env.GEMINI_API_KEY = "synthetic-provider-not-called";
    delete process.env.QUIPSLY_DISABLE_AI_PROVIDER;
    jest.mocked(GoogleGenAI).mockImplementation(() => ({ models: {
      embedContent: async () => ({ embeddings: [] }),
      generateContent: async () => ({ text: JSON.stringify({ assistantMessage: "Here is the opening.", suggestions: [],
        toolIntents: [{ kind: "PROPOSE_DRAFT", label: "Write an opening", explanation: "The writer requested a paragraph.", riskLevel: "medium",
          payload: { draftText: "A small beginning can become a useful conversation." } }] }) }),
    } }) as unknown as GoogleGenAI);
    try {
      const response = await POST(new Request("http://localhost/api/quipsly-assistant", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          projectSlug: `assistant-project-${nonce}`, documentId, sessionId,
          message: "Write an opening paragraph in this page.", visibleBlocks: [{ id: firstBlockId, text: originalText }],
        }),
      }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.documentEdits).toHaveLength(1);
      const receipt = body.documentEdits[0];
      expect(body.toolIntents[0].status).toBe("applied");
      expect((await prisma.studioDocumentBlock.findUniqueOrThrow({ where: { id: receipt.blockId } })).body)
        .toBe("A small beginning can become a useful conversation.");
      const action = await prisma.studioAssistantAction.findUniqueOrThrow({ where: { id: receipt.actionId }, include: { governedAction: true } });
      expect(action.governedAction).toMatchObject({ decisionPolicy: "DELEGATED", decisionStatus: "NOT_REQUIRED", status: "SUCCEEDED" });
      expect(await undoAppliedAssistantDocumentEditAction(receipt.actionId)).toMatchObject({ ok: true });
      expect(await prisma.studioDocumentBlock.findUnique({ where: { id: receipt.blockId } })).toBeNull();
    } finally {
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
      if (originalDisabled === undefined) delete process.env.QUIPSLY_DISABLE_AI_PROVIDER; else process.env.QUIPSLY_DISABLE_AI_PROVIDER = originalDisabled;
    }
  });
});
