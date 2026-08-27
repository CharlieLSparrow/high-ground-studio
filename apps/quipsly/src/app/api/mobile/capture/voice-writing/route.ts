import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import {
  mobileVoiceWritingBodyBlockId,
  mobileVoiceWritingContentHash,
  mobileVoiceWritingDraftIdFromDocumentId,
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

function voiceWritingBody(document: any, draftId: string) {
  return document.blocks?.find((block: any) => block.id === mobileVoiceWritingBodyBlockId(draftId))?.body || "";
}

function voiceWritingContentRevision(document: any, draftId: string) {
  return mobileVoiceWritingContentHash({
    title: String(document?.title || "Voice note"),
    body: voiceWritingBody(document, draftId),
  });
}

function publicDraft(document: any, serverRevision: number, input: MobileVoiceWritingInput) {
  const body = voiceWritingBody(document, input.draftId) || input.body;
  return {
    draftId: input.draftId,
    documentId: document.id,
    projectId: document.projectId,
    projectName: document.project?.name || "My Nest",
    title: document.title,
    body,
    localRevision: input.localRevision,
    serverRevision,
    contentRevision: mobileVoiceWritingContentHash({ title: document.title, body }),
    localRecordingId: input.localRecordingId,
    transcriptClientRequestId: input.transcriptClientRequestId,
    sourceSha256: input.sourceSha256,
    callRoomId: input.callRoomId,
    updatedAt: document.updatedAt.toISOString(),
  };
}

function publicStoredDraft(document: any) {
  const draftId = mobileVoiceWritingDraftIdFromDocumentId(String(document.id || ""));
  if (!draftId) return null;
  const operation = document.documentOperations?.[0];
  const source = record(operation?.payloadJson);
  const current = currentVoiceRevision(document);
  const body = voiceWritingBody(document, draftId);
  return {
    draftId,
    documentId: document.id,
    projectId: document.projectId,
    projectName: document.project?.name || "My Nest",
    title: document.title,
    body,
    localRevision: current.serverRevision ?? 1,
    serverRevision: current.serverRevision ?? 1,
    contentRevision: mobileVoiceWritingContentHash({ title: document.title, body }),
    localRecordingId: String(source.localRecordingId || draftId),
    transcriptClientRequestId: String(source.transcriptClientRequestId || draftId),
    sourceSha256: String(source.sourceSha256 || "").toLowerCase(),
    callRoomId: typeof source.callRoomId === "string" ? source.callRoomId : null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const actorUserId = String(session?.user?.id || "").trim();
  if (!actorUserId) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before loading private writing." },
      { status: 401 },
    );
  }

  const requestedDraftId = String(new URL(request.url).searchParams.get("draftId") || "").trim().toLowerCase();
  if (requestedDraftId && !mobileVoiceWritingDraftIdFromDocumentId(mobileVoiceWritingDocumentId(requestedDraftId))) {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_ID_INVALID", error: "That private writing identity is invalid." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const documents = await prisma.studioDocument.findMany({
    where: {
      personalOwnerUserId: actorUserId,
      sourceLabel: { contains: "origin:ios-voice-writing", mode: "insensitive" },
      ...(requestedDraftId ? { id: mobileVoiceWritingDocumentId(requestedDraftId) } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: requestedDraftId ? 1 : 250,
    include: {
      project: { select: { name: true } },
      blocks: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] },
      documentOperations: {
        where: { operationType: "mobile-voice-writing-sync" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  });
  const drafts = documents.map(publicStoredDraft).filter(Boolean);
  return NextResponse.json({
    ok: true,
    schema: "quipsly-mobile-voice-writing-list-v1",
    drafts,
    nextAction: null,
  });
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
      if (voiceWritingContentRevision(existing, input.draftId) !== contentHash) {
        return {
          kind: "conflict" as const,
          document: existing,
          serverRevision: currentVoiceRevision(existing).serverRevision,
        };
      }
      return {
        kind: "saved" as const,
        document: existing,
        serverRevision: Number(exactAfter.serverRevision) || input.localRevision,
        idempotentReplay: true,
      };
    }

    const currentContentRevision = voiceWritingContentRevision(existing, input.draftId);
    const contentRevisionMatches = input.expectedContentRevision
      ? currentContentRevision === input.expectedContentRevision
      : current.serverRevision !== null && current.serverRevision === input.expectedServerRevision;
    if (!contentRevisionMatches) {
      return {
        kind: "conflict" as const,
        document: existing,
        serverRevision: current.serverRevision,
      };
    }

    const beforeBody = voiceWritingBody(existing, input.draftId);
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
        current: result.document
          ? publicDraft(result.document, result.serverRevision ?? input.expectedServerRevision, input)
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
