import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import {
  ensureHomeNestForEmail,
  listProjectsVisibleToEmail,
} from "@/lib/server/home-nest";
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
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";

const ON_DEVICE_TRANSCRIPT_PROVIDER = "apple-speech-transcriber-on-device";
const SOURCELESS_WRITING_VERSION = "2";

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

function voiceWritingRichText(document: any) {
  const operation = document?.documentOperations?.[0];
  if (!operation || operation.operationType !== "mobile-voice-writing-sync") return null;
  const richText = record(operation.afterJson).richText
    ?? record(operation.payloadJson).richText
    ?? null;
  if (!richText) return null;

  // A shared Nest member can edit the canonical note through the ordinary
  // document editor without having access to the author's private recording
  // metadata. That edit deliberately changes the document blocks rather than
  // impersonating a mobile voice-writing revision. Never return formatting
  // ranges captured for older words alongside the newly edited body: the
  // owner receives the canonical text as plain rich text and can keep writing
  // without stale ranges or an accidental overwrite.
  const draftId = mobileVoiceWritingDraftIdFromDocumentId(String(document?.id || ""));
  if (!draftId || record(richText).text !== voiceWritingBody(document, draftId)) {
    return null;
  }
  return richText;
}

function voiceWritingContentRevision(document: any, draftId: string) {
  return mobileVoiceWritingContentHash({
    title: String(document?.title || "Untitled"),
    body: voiceWritingBody(document, draftId),
    richText: voiceWritingRichText(document),
  });
}

function publicTag(tag: any) {
  return {
    id: String(tag?.id || ""),
    projectId: String(tag?.projectId || ""),
    slug: String(tag?.slug || ""),
    label: String(tag?.label || ""),
    isActive: tag?.isActive !== false,
  };
}

function voiceWritingTags(document: any) {
  return (document?.tagLinks || [])
    .map((link: any) => publicTag(link?.tag))
    .filter((tag: any) => tag.id && tag.projectId && tag.slug && tag.label);
}

function availableVoiceWritingTags(document: any) {
  return (document?.project?.tags || [])
    .map(publicTag)
    .filter((tag: any) => tag.id && tag.projectId && tag.slug && tag.label && tag.isActive);
}

function voiceWritingDestination(project: any, homeProjectId?: string | null) {
  return {
    id: String(project?.id || ""),
    name: String(project?.name || "Nest"),
    slug: String(project?.slug || ""),
    role: String(project?.role || "EDITOR"),
    isHome: Boolean(homeProjectId && project?.id === homeProjectId),
  };
}

function voiceWritingDocumentInclude() {
  return {
    project: {
      select: {
        name: true,
        slug: true,
        tags: {
          where: { isActive: true, mergedIntoTagId: null },
          orderBy: [{ label: "asc" }, { id: "asc" }],
          select: { id: true, projectId: true, slug: true, label: true, isActive: true },
        },
      },
    },
    blocks: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] },
    tagLinks: {
      orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
      select: {
        tag: { select: { id: true, projectId: true, slug: true, label: true, isActive: true } },
      },
    },
    documentOperations: {
      where: { operationType: "mobile-voice-writing-sync" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
    },
  };
}

function publicDraft(document: any, serverRevision: number, input: MobileVoiceWritingInput) {
  const body = voiceWritingBody(document, input.draftId) || input.body;
  const richText = voiceWritingRichText(document);
  return {
    draftId: input.draftId,
    documentId: document.id,
    projectId: document.projectId,
    projectName: document.project?.name || "My Nest",
    projectSlug: document.project?.slug || "",
    visibility: document.isPrivate === false ? "nest" : "personal",
    title: document.title,
    body,
    richText,
    localRevision: input.localRevision,
    serverRevision,
    contentRevision: mobileVoiceWritingContentHash({ title: document.title, body, richText }),
    writingOrigin: input.writingOrigin,
    localRecordingId: input.localRecordingId,
    transcriptClientRequestId: input.transcriptClientRequestId,
    sourceSha256: input.sourceSha256,
    callRoomId: input.callRoomId,
    sources: input.sources,
    tagRevision: Number(document.tagRevision) || 0,
    tags: voiceWritingTags(document),
    availableTags: availableVoiceWritingTags(document),
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
  const richText = voiceWritingRichText(document);
  const legacySource = {
    localRecordingId: typeof source.localRecordingId === "string" ? source.localRecordingId : null,
    transcriptClientRequestId: typeof source.transcriptClientRequestId === "string" ? source.transcriptClientRequestId : null,
    sourceSha256: typeof source.sourceSha256 === "string" ? source.sourceSha256.toLowerCase() : null,
    callRoomId: typeof source.callRoomId === "string" ? source.callRoomId : null,
  };
  const hasLegacySource = Boolean(
    legacySource.localRecordingId
      && legacySource.transcriptClientRequestId
      && legacySource.sourceSha256,
  );
  const sources = Array.isArray(source.sources)
    ? source.sources
    : hasLegacySource ? [legacySource] : [];
  return {
    draftId,
    documentId: document.id,
    projectId: document.projectId,
    projectName: document.project?.name || "My Nest",
    projectSlug: document.project?.slug || "",
    visibility: document.isPrivate === false ? "nest" : "personal",
    title: document.title,
    body,
    richText,
    localRevision: current.serverRevision ?? 1,
    serverRevision: current.serverRevision ?? 1,
    contentRevision: mobileVoiceWritingContentHash({ title: document.title, body, richText }),
    writingOrigin: source.writingOrigin === "typed" ? "typed" : "recorded",
    ...legacySource,
    sources,
    tagRevision: Number(document.tagRevision) || 0,
    tags: voiceWritingTags(document),
    availableTags: availableVoiceWritingTags(document),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function transcriptRequestIdsForDrafts(drafts: any[]) {
  return Array.from(new Set(drafts.flatMap((draft: any) => (
    Array.isArray(draft?.sources) ? draft.sources : []
  )).map((source: any) => String(source?.transcriptClientRequestId || "").trim().toLowerCase())
    .filter(Boolean)));
}

function publicVoiceTranscript(job: any) {
  const providerRequestId = String(job?.providerRequestId || "");
  const transcriptClientRequestId = providerRequestId.startsWith("apple-speech:")
    ? providerRequestId.slice("apple-speech:".length)
    : "";
  const roomId = typeof job?.roomId === "string" ? job.roomId : null;
  const recordingAssetId = typeof job?.assetId === "string" ? job.assetId : null;
  return {
    transcriptClientRequestId,
    transcriptJobId: String(job?.id || ""),
    roomId,
    recordingAssetId,
    mediaUrl: roomId && recordingAssetId
      ? `/api/sessions/${encodeURIComponent(roomId)}/recordings/${encodeURIComponent(recordingAssetId)}/media`
      : null,
    language: typeof job?.language === "string" ? job.language : null,
    completedAt: job?.completedAt?.toISOString?.() ?? job?.completedAt ?? null,
    segments: (job?.segments || []).map((segment: any) => {
      const accepted = segment?.corrections?.[0] ?? null;
      return {
        id: String(segment?.id || ""),
        startSeconds: Number(segment?.startSeconds) || 0,
        endSeconds: Number(segment?.endSeconds) || 0,
        text: String(accepted?.correctedText || segment?.text || ""),
        speakerLabel: accepted?.correctedSpeakerLabel ?? segment?.speakerLabel ?? null,
        providerText: String(segment?.text || ""),
        providerSpeakerLabel: segment?.speakerLabel ?? null,
        acceptedCorrectionId: typeof accepted?.id === "string" ? accepted.id : null,
      };
    }).filter((segment: any) => segment.id && segment.text),
  };
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const actorUserId = String(session?.user?.id || "").trim();
  const actorEmail = String(session?.user?.primaryEmail || session?.user?.email || "")
    .trim()
    .toLowerCase();
  if (!actorUserId || !actorEmail) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before loading writing." },
      { status: 401 },
    );
  }

  const requestedDraftId = String(new URL(request.url).searchParams.get("draftId") || "").trim().toLowerCase();
  if (requestedDraftId && !mobileVoiceWritingDraftIdFromDocumentId(mobileVoiceWritingDocumentId(requestedDraftId))) {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_ID_INVALID", error: "That writing identity is invalid." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const [documents, visibleProjects] = await Promise.all([
    prisma.studioDocument.findMany({
    where: {
      personalOwnerUserId: actorUserId,
      AND: [
        { sourceLabel: { contains: "origin:ios-voice-writing", mode: "insensitive" } },
        { NOT: { sourceLabel: { contains: "state:deleted", mode: "insensitive" } } },
      ],
      ...(requestedDraftId ? { id: mobileVoiceWritingDocumentId(requestedDraftId) } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: requestedDraftId ? 1 : 250,
      include: voiceWritingDocumentInclude(),
    }),
    listProjectsVisibleToEmail(actorEmail, prisma),
  ]);
  const supportsSourcelessWriting = request.headers.get("x-quipsly-writing-version") === SOURCELESS_WRITING_VERSION;
  const storedDrafts = documents.map(publicStoredDraft).filter(Boolean) as any[];
  const drafts = supportsSourcelessWriting
    ? storedDrafts
    : storedDrafts
      .filter((draft: any) => draft.sources.length > 0)
      .map((draft: any) => ({
        ...draft,
        localRecordingId: draft.sources[0].localRecordingId,
        transcriptClientRequestId: draft.sources[0].transcriptClientRequestId,
        sourceSha256: draft.sources[0].sourceSha256,
        callRoomId: draft.sources[0].callRoomId,
      }));
  const transcriptRequestIds = requestedDraftId ? transcriptRequestIdsForDrafts(drafts) : [];
  const transcriptJobs = transcriptRequestIds.length
    ? await prisma.transcriptJob.findMany({
      where: {
        requestedBy: actorUserId,
        provider: ON_DEVICE_TRANSCRIPT_PROVIDER,
        status: "COMPLETED",
        providerRequestId: {
          in: transcriptRequestIds.map((requestId) => `apple-speech:${requestId}`),
        },
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        roomId: true,
        assetId: true,
        language: true,
        providerRequestId: true,
        completedAt: true,
        segments: {
          orderBy: [{ startSeconds: "asc" }, { id: "asc" }],
          select: {
            id: true,
            startSeconds: true,
            endSeconds: true,
            text: true,
            speakerLabel: true,
            corrections: {
              where: { status: "accepted" },
              orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { id: true, correctedText: true, correctedSpeakerLabel: true },
            },
          },
        },
      },
    })
    : [];
  const writableProjects = visibleProjects.filter((project: any) => (
    project.role === "OWNER" || project.role === "EDITOR"
  ));
  const homeProject = writableProjects.find((project: any) => (
    String(project.sourceLabel || "").includes("nest-kind:home")
  )) ?? null;
  const requestedDocument = requestedDraftId ? documents[0] : null;
  return NextResponse.json({
    ok: true,
    schema: "quipsly-mobile-voice-writing-list-v1",
    drafts,
    homeProject: homeProject ? {
      id: homeProject.id,
      name: homeProject.name || "My Nest",
      slug: homeProject.slug || "",
    } : null,
    destinations: writableProjects.map((project: any) => (
      voiceWritingDestination(project, homeProject?.id)
    )),
    availableTags: requestedDocument
      ? availableVoiceWritingTags(requestedDocument)
      : [],
    transcripts: transcriptJobs.map(publicVoiceTranscript),
    nextAction: null,
  });
}

export async function PATCH(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const actorUserId = String(session?.user?.id || "").trim();
  const actorEmail = String(session?.user?.primaryEmail || session?.user?.email || "")
    .trim()
    .toLowerCase();
  if (!actorUserId || !actorEmail) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before organizing writing." },
      { status: 401 },
    );
  }

  const input = record(await requestBody(request));
  const draftId = String(input.draftId || "").trim().toLowerCase();
  const destinationProjectId = String(input.destinationProjectId || "").trim();
  const expectedProjectId = String(input.expectedProjectId || "").trim();
  const requestedVisibility = input.visibility === "nest"
    ? "nest"
    : input.visibility === "personal" ? "personal" : null;
  const clientRequestId = String(input.clientRequestId || "").trim().toLowerCase();
  if (!mobileVoiceWritingDraftIdFromDocumentId(mobileVoiceWritingDocumentId(draftId))
    || !destinationProjectId
    || !expectedProjectId
    || (Object.prototype.hasOwnProperty.call(input, "visibility") && !requestedVisibility)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_MOVE_INVALID", error: "Choose one current writing, one writable Nest, and who can open it." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const documentId = mobileVoiceWritingDocumentId(draftId);
  const operationId = `${documentId}-move-${clientRequestId}`;
  const move = () => prisma.$transaction(async (tx: any) => {
    const document = await tx.studioDocument.findFirst({
      where: {
        id: documentId,
        personalOwnerUserId: actorUserId,
        sourceLabel: { contains: "origin:ios-voice-writing", mode: "insensitive" },
        NOT: { sourceLabel: { contains: "state:deleted", mode: "insensitive" } },
      },
      include: voiceWritingDocumentInclude(),
    });
    if (!document) return { kind: "missing" as const };

    const exactOperation = await tx.studioDocumentOperation.findUnique({ where: { id: operationId } });
    if (exactOperation) {
      const payload = record(exactOperation.payloadJson);
      if (payload.documentId !== documentId
        || payload.destinationProjectId !== destinationProjectId
        || (requestedVisibility && payload.visibility !== requestedVisibility)) {
        return { kind: "identity-conflict" as const };
      }
      return { kind: "moved" as const, document, idempotentReplay: true, previousProjectId: expectedProjectId };
    }
    if (document.projectId !== expectedProjectId) {
      return { kind: "stale" as const, document };
    }
    const currentVisibility = document.isPrivate === false ? "nest" : "personal";
    const visibility = requestedVisibility ?? currentVisibility;
    if (document.projectId === destinationProjectId && currentVisibility === visibility) {
      return { kind: "moved" as const, document, idempotentReplay: true, previousProjectId: document.projectId };
    }

    const destination = await tx.studioProject.findUnique({
      where: { id: destinationProjectId },
      select: { id: true, slug: true, name: true, sourceLabel: true },
    });
    if (!destination) return { kind: "destination-missing" as const };
    const access = await resolveStudioProjectAccess({
      projectSlug: destination.slug,
      projectId: destination.id,
      email: actorEmail,
      action: "write",
      prisma: tx,
    });
    if (!access.allowed) return { kind: "destination-forbidden" as const };
    if (visibility === "nest"
      && String(destination.sourceLabel || "").includes("nest-kind:home")) {
      return { kind: "home-private" as const };
    }

    const previousProjectId = document.projectId;
    const changesProject = previousProjectId !== destination.id;
    const nextTagRevision = changesProject
      ? Number(document.tagRevision || 0) + 1
      : Number(document.tagRevision || 0);
    await tx.studioDocument.update({
      where: { id: documentId },
      data: {
        projectId: destination.id,
        isPrivate: visibility === "personal",
        projectionStatus: visibility === "personal" ? "private" : "draft",
        ...(changesProject ? {
          tagRevision: { increment: 1 },
          tagLinks: { deleteMany: {} },
        } : {}),
        blocks: {
          updateMany: {
            where: {},
            data: {
              isPrivate: visibility === "personal",
              projectionStatus: visibility === "personal" ? "private" : "draft",
            },
          },
        },
        documentOperations: {
          create: {
            id: operationId,
            projectId: destination.id,
            groupId: draftId,
            actorEmail,
            origin: "ios-capture",
            operationType: "mobile-voice-writing-organize",
            status: "applied",
            beforeJson: {
              projectId: previousProjectId,
              visibility: currentVisibility,
              tagRevision: document.tagRevision,
            },
            afterJson: {
              projectId: destination.id,
              visibility,
              tagRevision: nextTagRevision,
            },
            payloadJson: { documentId, destinationProjectId, visibility, clientRequestId },
            reversible: true,
          },
        },
      },
    });
    const movedDocument = await tx.studioDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: voiceWritingDocumentInclude(),
    });
    return { kind: "moved" as const, document: movedDocument, idempotentReplay: false, previousProjectId };
  }, { isolationLevel: "Serializable" });

  let result;
  try {
    result = await move();
  } catch (error) {
    const code = record(error).code;
    if (code !== "P2002" && code !== "P2034") throw error;
    result = await move();
  }

  if (result.kind === "missing") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_NOT_FOUND", error: "This writing is not available." },
      { status: 404 },
    );
  }
  if (result.kind === "destination-missing") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_DESTINATION_NOT_FOUND", error: "That Nest is no longer available." },
      { status: 404 },
    );
  }
  if (result.kind === "destination-forbidden") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_DESTINATION_FORBIDDEN", error: "Editor access is required to file writing in that Nest." },
      { status: 403 },
    );
  }
  if (result.kind === "home-private") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_HOME_PRIVATE", error: "My Nest is private. Choose another Nest to share this writing." },
      { status: 400 },
    );
  }
  if (result.kind === "identity-conflict") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_MOVE_IDENTITY_CONFLICT", error: "That move identity already belongs to another destination." },
      { status: 409 },
    );
  }
  if (result.kind === "stale") {
    return NextResponse.json(
      {
        ok: false,
        code: "VOICE_WRITING_MOVE_CONFLICT",
        error: "This writing moved somewhere else. Quipsly refreshed its current Nest instead of guessing.",
        current: publicStoredDraft(result.document),
      },
      { status: 409 },
    );
  }

  revalidatePath("/library");
  revalidatePath(`/writing/${draftId}`);
  revalidatePath(`/nests/${result.document.project?.slug || ""}`);
  return NextResponse.json({
    ok: true,
    schema: "quipsly-mobile-voice-writing-organize-v2",
    draft: publicStoredDraft(result.document),
    idempotentReplay: result.idempotentReplay,
    previousProjectId: result.previousProjectId,
    visibility: result.document.isPrivate === false ? "nest" : "personal",
    nextAction: null,
  });
}

export async function DELETE(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const actorUserId = String(session?.user?.id || "").trim();
  const actorEmail = String(session?.user?.primaryEmail || session?.user?.email || "")
    .trim()
    .toLowerCase();
  if (!actorUserId || !actorEmail) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before deleting writing." },
      { status: 401 },
    );
  }
  const input = record(await requestBody(request));
  const draftId = String(input.draftId || "").trim().toLowerCase();
  const clientRequestId = String(input.clientRequestId || "").trim().toLowerCase();
  if (!mobileVoiceWritingDraftIdFromDocumentId(mobileVoiceWritingDocumentId(draftId))
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_DELETE_INVALID", error: "The writing identity is invalid." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const documentId = mobileVoiceWritingDocumentId(draftId);
  const result = await prisma.$transaction(async (tx: any) => {
    const document = await tx.studioDocument.findFirst({
      where: {
        id: documentId,
        personalOwnerUserId: actorUserId,
        sourceLabel: { contains: "origin:ios-voice-writing", mode: "insensitive" },
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        sourceLabel: true,
      },
    });
    if (!document) return { kind: "missing" as const };
    if (String(document.sourceLabel || "").toLowerCase().includes("state:deleted")) {
      return { kind: "deleted" as const, idempotentReplay: true };
    }
    const sourceLabel = `${String(document.sourceLabel || "document-kind:note;origin:ios-voice-writing")};state:deleted`;
    await tx.studioDocument.update({
      where: { id: document.id },
      data: {
        sourceLabel,
        documentOperations: {
          create: {
            id: `${documentId}-delete-${clientRequestId}`,
            projectId: document.projectId,
            groupId: draftId,
            actorEmail,
            origin: "quipsly-writing",
            operationType: "mobile-voice-writing-delete",
            status: "applied",
            beforeJson: { sourceLabel: document.sourceLabel, title: document.title },
            afterJson: { sourceLabel, state: "deleted" },
            payloadJson: { clientRequestId, actorUserId },
            reversible: true,
          },
        },
      },
    });
    return { kind: "deleted" as const, idempotentReplay: false };
  });
  if (result.kind === "missing") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_NOT_FOUND", error: "This writing is not available." },
      { status: 404 },
    );
  }
  revalidatePath("/library");
  revalidatePath(`/writing/${draftId}`);
  return NextResponse.json({
    ok: true,
    schema: "quipsly-mobile-voice-writing-delete-v1",
    draftId,
    sourceAudioDeleted: false,
    idempotentReplay: result.idempotentReplay,
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
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before syncing writing." },
      { status: 401 },
    );
  }

  const validation = validateMobileVoiceWriting(await requestBody(request));
  if (!validation.ok) {
    return NextResponse.json(validation, { status: 400 });
  }
  const input = validation.value;
  if (input.sources.length === 0
    && request.headers.get("x-quipsly-writing-version") !== SOURCELESS_WRITING_VERSION) {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_VERSION_REQUIRED", error: "Update Quipsly before creating writing without a recording." },
      { status: 426 },
    );
  }
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
        project: {
          select: {
            name: true,
            slug: true,
            tags: {
              where: { isActive: true, mergedIntoTagId: null },
              orderBy: [{ label: "asc" }, { id: "asc" }],
              select: { id: true, projectId: true, slug: true, label: true, isActive: true },
            },
          },
        },
        blocks: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] },
        tagLinks: {
          orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
          select: {
            tag: { select: { id: true, projectId: true, slug: true, label: true, isActive: true } },
          },
        },
        documentOperations: {
          where: { operationType: "mobile-voice-writing-sync" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        },
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
                richText: input.richText,
                contentHash,
                serverRevision: input.localRevision,
              },
              payloadJson: source,
              reversible: true,
            },
          },
        },
        include: {
          project: {
            select: {
              name: true,
              slug: true,
              tags: {
                where: { isActive: true, mergedIntoTagId: null },
                orderBy: [{ label: "asc" }, { id: "asc" }],
                select: { id: true, projectId: true, slug: true, label: true, isActive: true },
              },
            },
          },
          blocks: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] },
          tagLinks: {
            orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
            select: {
              tag: { select: { id: true, projectId: true, slug: true, label: true, isActive: true } },
            },
          },
          documentOperations: {
            where: { operationType: "mobile-voice-writing-sync" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
      });
      return { kind: "saved" as const, document, serverRevision: input.localRevision, idempotentReplay: false };
    }

    if (
      existing.personalOwnerUserId !== actorUserId
      || !String(existing.sourceLabel || "").includes("origin:ios-voice-writing")
    ) {
      return { kind: "forbidden" as const };
    }
    if (String(existing.sourceLabel || "").toLowerCase().includes("state:deleted")) {
      return { kind: "deleted" as const };
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
            projectId: existing.projectId,
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
              richText: input.richText,
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
        project: {
          select: {
            name: true,
            slug: true,
            tags: {
              where: { isActive: true, mergedIntoTagId: null },
              orderBy: [{ label: "asc" }, { id: "asc" }],
              select: { id: true, projectId: true, slug: true, label: true, isActive: true },
            },
          },
        },
        blocks: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] },
        tagLinks: {
          orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
          select: {
            tag: { select: { id: true, projectId: true, slug: true, label: true, isActive: true } },
          },
        },
        documentOperations: {
          where: { operationType: "mobile-voice-writing-sync" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        },
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
      { ok: false, code: "VOICE_WRITING_FORBIDDEN", error: "That writing identity belongs to a different account." },
      { status: 404 },
    );
  }
  if (result.kind === "deleted") {
    return NextResponse.json(
      { ok: false, code: "VOICE_WRITING_NOT_FOUND", error: "This writing is no longer available." },
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
    homeProject: { id: home.id, name: home.name || "My Nest", slug: home.slug || "" },
    availableTags: availableVoiceWritingTags(result.document),
    idempotentReplay: result.idempotentReplay,
    nextAction: result.document.isPrivate === false
      ? `Writing saved to ${result.document.project?.name || "your Nest"} and shared with Nest members.`
      : `Writing saved to ${result.document.project?.name || "your Nest"}. Only you can open it.`,
  });
}
