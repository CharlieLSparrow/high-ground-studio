import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import {
  mobileVoiceWritingBodyBlockId,
  mobileVoiceWritingContentHash,
  mobileVoiceWritingDocumentId,
  mobileVoiceWritingOperationId,
  mobileVoiceWritingSource,
  validateMobileVoiceWriting,
  type MobileVoiceWritingInput,
} from "@/lib/server/mobile-voice-writing";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

async function requestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function currentVoiceRevision(document: any) {
  const operation = document?.documentOperations?.[0];
  if (!operation || operation.operationType !== "mobile-voice-writing-sync") {
    return { serverRevision: null, operation: null };
  }
  const after = record(operation.afterJson);
  const serverRevision = Number(after.serverRevision);
  return {
    serverRevision: Number.isSafeInteger(serverRevision) && serverRevision >= 1
      ? serverRevision
      : null,
    operation,
  };
}

function publicDraft(document: any, serverRevision: number, input: MobileVoiceWritingInput) {
  const bodyBlock = document.blocks?.find((block: any) => block.id === mobileVoiceWritingBodyBlockId(input.draftId));
  return {
    documentId: document.id,
    projectId: document.projectId,
    projectName: document.project?.name || "My Nest",
    title: document.title,
    body: bodyBlock?.body || input.body,
    localRevision: input.localRevision,
    serverRevision,
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const actorUserId = String(session?.user?.id || "").trim();
  const actorEmail = String(session?.user?.primaryEmail || session?.user?.email || "")
    .trim()
    .toLowerCase();
  if (!actorUserId || !actorEmail) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before syncing private writing." },
      { status: 401 },
    );
  }

  const validation = validateMobileVoiceWriting(await requestBody(request));
  if (!validation.ok) {
    return NextResponse.json(validation, { status: 400 });
  }
  const input = validation.value;
  const prisma = getPrismaClient() as any;
  const home = await ensureHomeNestForEmail(actorEmail, prisma);
  const documentId = mobileVoiceWritingDocumentId(input.draftId);
  const titleBlockId = `${documentId}-title`;
  const bodyBlockId = mobileVoiceWritingBodyBlockId(input.draftId);
  const operationId = mobileVoiceWritingOperationId(input.draftId, input.localRevision);
  const contentHash = mobileVoiceWritingContentHash(input);
  const source = mobileVoiceWritingSource(input, actorUserId);

  const commit = () => prisma.$transaction(async (tx: any) => {
    const existing = await tx.studioDocument.findUnique({
      where: { id: documentId },
      include: {
        project: { select: { name: true } },
        blocks: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] },
        documentOperations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
      },
    });

    if (!existing) {
      if (input.expectedServerRevision !== 0) return { kind: "conflict" as const, document: null, serverRevision: 0 };
      const document = await tx.studioDocument.create({
        data: {
          id: documentId,
          projectId: home.id,
          personalOwnerUserId: actorUserId,
          stableId: documentId,
          title: input.title,
          sourceLabel: "document-kind:note;origin:ios-voice-writing",
          projectionStatus: "private",
          isPrivate: true,
          blocks: {
            create: [
              {
                id: titleBlockId,
                stableId: `${documentId}-title`,
                order: 0,
                title: "Note Title",
                body: input.title,
                sourceLabel: "document-kind:note;origin:ios-voice-writing",
                projectionStatus: "private",
                isPrivate: true,
              },
              {
                id: bodyBlockId,
                stableId: `${documentId}-body`,
                order: 1,
                body: input.body,
                sourceLabel: "document-kind:note;origin:ios-voice-writing",
                projectionStatus: "private",
                isPrivate: true,
              },
            ],
          },
          documentOperations: {
            create: {
              id: operationId,
              projectId: home.id,
              groupId: input.draftId,
              actorEmail,
              origin: "ios-capture",
              operationType: "mobile-voice-writing-sync",
              status: "applied",
              beforeJson: null,
              afterJson: {
                title: input.title,
                body: input.body,
                contentHash,
                serverRevision: input.localRevision,
              },
              payloadJson: source,
              reversible: true,
            },
          },
        },
        include: {
          project: { select: { name: true } },
          blocks: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] },
          documentOperations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
        },
      });
      return { kind: "saved" as const, document, serverRevision: input.localRevision, idempotentReplay: false };
    }

    if (
      existing.personalOwnerUserId !== actorUserId
      || existing.projectId !== home.id
      || !String(existing.sourceLabel || "").includes("origin:ios-voice-writing")
    ) {
      return { kind: "forbidden" as const };
    }

    const current = currentVoiceRevision(existing);
    const exactOperation = await tx.studioDocumentOperation.findUnique({ where: { id: operationId } });
    if (exactOperation) {
      const exactAfter = record(exactOperation.afterJson);
      if (exactAfter.contentHash !== contentHash) return { kind: "identity-conflict" as const };
      return {
        kind: "saved" as const,
        document: existing,
        serverRevision: Number(exactAfter.serverRevision) || input.localRevision,
        idempotentReplay: true,
      };
    }

    if (current.serverRevision === null || current.serverRevision !== input.expectedServerRevision) {
      return {
        kind: "conflict" as const,
        document: existing,
        serverRevision: current.serverRevision,
      };
    }

    const beforeBody = existing.blocks.find((block: any) => block.id === bodyBlockId)?.body || "";
    await tx.studioDocument.update({
      where: { id: documentId },
      data: {
        title: input.title,
        blocks: {
          update: [
            { where: { id: titleBlockId }, data: { body: input.title } },
            { where: { id: bodyBlockId }, data: { body: input.body } },
          ],
        },
        documentOperations: {
          create: {
            id: operationId,
            projectId: home.id,
            groupId: input.draftId,
            actorEmail,
            origin: "ios-capture",
            operationType: "mobile-voice-writing-sync",
            status: "applied",
            beforeJson: {
              title: existing.title,
              body: beforeBody,
              serverRevision: current.serverRevision,
            },
            afterJson: {
              title: input.title,
              body: input.body,
              contentHash,
              serverRevision: input.localRevision,
            },
            payloadJson: source,
            reversible: true,
          },
        },
      },
    });
    const document = await tx.studioDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: {
        project: { select: { name: true } },
        blocks: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] },
        documentOperations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
      },
    });
    return { kind: "saved" as const, document, serverRevision: input.localRevision, idempotentReplay: false };
  }, { isolationLevel: "Serializable" });

  let result;
  try {
    result = await commit();
  } catch (error) {
    const code = record(error).code;
    if (code !== "P2002" && code !== "P2034") throw error;
    result = await commit();
  }

  if (result.kind === "forbidden") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_FORBIDDEN", error: "That private writing identity belongs to a different account." },
      { status: 404 },
    );
  }
  if (result.kind === "identity-conflict") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_IDENTITY_CONFLICT", error: "That retry identity already belongs to different writing. Your iPhone copy is unchanged." },
      { status: 409 },
    );
  }
  if (result.kind === "conflict") {
    return NextResponse.json(
      {
        ok: false,
        code: "VOICE_WRITING_CONFLICT",
        error: "This note changed somewhere else. Your complete iPhone draft is still protected.",
        serverRevision: result.serverRevision,
        current: result.document && result.serverRevision
          ? publicDraft(result.document, result.serverRevision, input)
          : null,
      },
      { status: 409 },
    );
  }

  revalidatePath("/work");
  revalidatePath("/library");
  return NextResponse.json({
    ok: true,
    schema: "quipsly-mobile-voice-writing-v1",
    draft: publicDraft(result.document, result.serverRevision, input),
    idempotentReplay: result.idempotentReplay,
    nextAction: "Writing saved privately to My Nest.",
  });
}
