import { NextResponse } from "next/server";
import os from "node:os";
import path from "node:path";

import { getPrismaClient } from "@/lib/prisma";
import {
  SourceStoryContractError,
  storyCardPurposes,
  storyCardStatuses,
  type StoryCardPurpose,
  type StoryCardStatus,
  type MediaSourceSetMemberRole,
  type StoryBoardPlacementIntent,
  type StoryReframeRecipe,
} from "@/lib/source-story-contract";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readSpatialRenderReadiness } from "@/lib/server/spatial-render-readiness";
import {
  attachGoogleDriveFileToNest,
  googleDriveSourceErrorResponse,
} from "@/lib/server/google-drive-source";
import {
  ExternalSourceProxyRequestError,
  requestExternalSourceProxy,
} from "@/lib/server/external-source-proxy";
import {
  SourceStoryConflictError,
  arrangeStoryBoard,
  createSourceStoryCard,
  createMediaSourceSet,
  createStoryBoard,
  openStoryBoardSectionWriting,
  readSourceStoryWorkspace,
  promoteSourceStoryCardToEpisode,
  rebindSourceStoryCard,
  reorderStoryBoard,
  updateSourceStoryCard,
  withdrawSourceStoryTimelinePlacement,
} from "@/lib/server/source-story";
import { SpatialRenderQueueError, queueSpatialReframe, registerSpatialReframeResult } from "@/lib/server/spatial-render-job";
import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  type StudioProjectAccessAction,
} from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";

type Actor = {
  userId: string;
  email: string;
  projectId: string;
};

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => (
    typeof item === "bigint" ? item.toString() : item
  ))) as T;
}

async function requireAccess(request: Request, projectSlug: string, action: StudioProjectAccessAction): Promise<Actor> {
  const session = await getQuipslySessionFromRequest(request);
  const email = normalizeAccessEmail(session?.user.primaryEmail || session?.user.email);
  if (!session?.user.id || !email) {
    throw Object.assign(new Error("Sign in to open this source workspace."), { status: 401 });
  }
  const prisma = getPrismaClient();
  const project = await findStudioProjectForAccess(projectSlug, prisma);
  if (!project) throw Object.assign(new Error("This source workspace is unavailable."), { status: 404 });
  const access = await resolveStudioProjectAccess({ projectSlug, email, action, prisma });
  if (!access.allowed || !access.projectId) {
    throw Object.assign(new Error("This source workspace is unavailable."), { status: 404 });
  }
  return { userId: session.user.id, email, projectId: access.projectId };
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SourceStoryContractError("invalid-list", "The supplied identity list is malformed.");
  }
  return value as string[];
}

function sourceSetMembers(value: unknown) {
  if (!Array.isArray(value)) throw new SourceStoryContractError("invalid-source-set-members", "The source-set member list is malformed.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new SourceStoryContractError("invalid-source-set-member", "A source-set member is malformed.");
    }
    const member = item as Record<string, unknown>;
    return {
      sourceRevisionId: text(member.sourceRevisionId),
      role: text(member.role) as MediaSourceSetMemberRole,
      ordinal: member.ordinal === undefined ? undefined : Number(member.ordinal),
      requiredForRender: member.requiredForRender === undefined ? undefined : member.requiredForRender === true,
    };
  });
}

function boardPlacements(value: unknown): StoryBoardPlacementIntent[] {
  if (!Array.isArray(value)) throw new SourceStoryContractError("invalid-board-arrangement", "The board arrangement is malformed.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new SourceStoryContractError("invalid-board-placement", "A board placement is malformed.");
    }
    const placement = item as Record<string, unknown>;
    return {
      cardId: text(placement.cardId),
      groupKey: text(placement.groupKey) || undefined,
      laneKey: text(placement.laneKey) || undefined,
    };
  });
}

function statusFrom(value: unknown): StoryCardStatus {
  const candidate = text(value) as StoryCardStatus;
  if (!storyCardStatuses.includes(candidate)) {
    throw new SourceStoryContractError("invalid-status", "The story card status is unsupported.");
  }
  return candidate;
}

function purposeFrom(value: unknown): StoryCardPurpose {
  const candidate = text(value) as StoryCardPurpose;
  if (!candidate) return "select";
  if (!storyCardPurposes.includes(candidate)) {
    throw new SourceStoryContractError("invalid-purpose", "The story purpose is unsupported.");
  }
  return candidate;
}

function errorResponse(error: unknown) {
  const driveError = googleDriveSourceErrorResponse(error);
  if (driveError) return NextResponse.json(driveError.body, { status: driveError.status });
  if (error instanceof SourceStoryConflictError) {
    return NextResponse.json({ error: error.message, errorCode: error.code, currentRevision: error.currentRevision }, { status: 409 });
  }
  if (error instanceof SourceStoryContractError) {
    return NextResponse.json({ error: error.message, errorCode: error.code }, { status: 400 });
  }
  if (error instanceof ExternalSourceProxyRequestError) {
    return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
  }
  if (error instanceof SpatialRenderQueueError) {
    return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
  }
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? Number((error as { status: number }).status)
    : 500;
  const safeStatus = status === 401 || status === 404 ? status : 500;
  if (safeStatus === 500) console.error("[source-story] request failed", error);
  return NextResponse.json({
    error: safeStatus === 500 ? "The source workspace could not complete that operation." : (error as Error).message,
  }, { status: safeStatus });
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const actor = await requireAccess(request, slug, "read");
    const [workspace, spatialRenderReadiness] = await Promise.all([
      readSourceStoryWorkspace(getPrismaClient(), actor.projectId),
      readSpatialRenderReadiness(),
    ]);
    return NextResponse.json(jsonSafe({ ok: true, workspace, spatialRenderReadiness }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const actor = await requireAccess(request, slug, "write");
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action);
    const prisma = getPrismaClient();
    let operation: unknown;

    if (action === "attach-google-drive-source") {
      operation = await attachGoogleDriveFileToNest({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        connectionId: text(body.connectionId),
        externalFileId: text(body.externalFileId),
        resourceKey: text(body.resourceKey) || null,
        clientRequestId: text(body.clientRequestId),
        requestUrl: request.url,
      });
    } else if (action === "request-external-proxy") {
      operation = await requestExternalSourceProxy({
        prisma,
        projectId: actor.projectId,
        referenceId: text(body.referenceId),
        sourceRevisionId: text(body.sourceRevisionId),
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        retryFailed: body.retryFailed === true,
      });
    } else if (action === "create-source-set") {
      operation = await createMediaSourceSet({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          clientRequestId: text(body.clientRequestId),
          kind: text(body.kind) as "insta360-360" | "camera-package",
          captureKey: text(body.captureKey),
          displayName: text(body.displayName),
          sourceClockRevisionId: text(body.sourceClockRevisionId),
          members: sourceSetMembers(body.members),
          metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata as Record<string, unknown>
            : {},
        },
      });
    } else if (action === "create-board") {
      operation = await createStoryBoard({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        clientRequestId: text(body.clientRequestId),
        title: text(body.title),
        description: text(body.description),
        slug: text(body.slug) || undefined,
        kind: text(body.kind) || undefined,
        episodeProductionId: text(body.episodeProductionId) || null,
      });
    } else if (action === "create-card") {
      operation = await createSourceStoryCard({
        prisma,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        value: {
          projectId: actor.projectId,
          mediaAssetId: text(body.mediaAssetId) || null,
          sourceRevisionId: text(body.sourceRevisionId) || null,
          sourceSetId: text(body.sourceSetId) || null,
          externalReferenceId: text(body.externalReferenceId) || null,
          boardId: text(body.boardId) || null,
          expectedBoardRevision: body.expectedBoardRevision === null || body.expectedBoardRevision === undefined
            ? null
            : Number(body.expectedBoardRevision),
          clientRequestId: text(body.clientRequestId),
          title: text(body.title),
          synopsis: text(body.synopsis),
          notes: text(body.notes),
          purpose: purposeFrom(body.purpose),
          startSeconds: Number(body.startSeconds),
          endSeconds: Number(body.endSeconds),
          groupKey: text(body.groupKey) || undefined,
          laneKey: text(body.laneKey) || undefined,
          tagIds: stringArray(body.tagIds),
          reframeRecipe: body.reframeRecipe && typeof body.reframeRecipe === "object"
            ? body.reframeRecipe as StoryReframeRecipe
            : null,
        },
      });
    } else if (action === "update-card") {
      operation = await updateSourceStoryCard({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        cardId: text(body.cardId),
        expectedRevision: Number(body.expectedRevision),
        clientRequestId: text(body.clientRequestId),
        title: text(body.title),
        synopsis: text(body.synopsis),
        notes: text(body.notes),
        purpose: purposeFrom(body.purpose),
        status: statusFrom(body.status),
        tagIds: stringArray(body.tagIds),
      });
    } else if (action === "rebind-card-source") {
      operation = await rebindSourceStoryCard({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          cardId: text(body.cardId),
          expectedRevision: Number(body.expectedRevision),
          expectedSourceRangeId: text(body.expectedSourceRangeId),
          replacementMediaAssetId: text(body.replacementMediaAssetId),
          clientRequestId: text(body.clientRequestId),
          startSeconds: Number(body.startSeconds),
          endSeconds: Number(body.endSeconds),
          reason: text(body.reason),
          reframeRecipe: body.reframeRecipe && typeof body.reframeRecipe === "object"
            ? body.reframeRecipe as StoryReframeRecipe
            : null,
        },
      });
    } else if (action === "reorder-board") {
      operation = await reorderStoryBoard({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        boardId: text(body.boardId),
        expectedRevision: Number(body.expectedRevision),
        orderedCardIds: stringArray(body.orderedCardIds),
        clientRequestId: text(body.clientRequestId),
      });
    } else if (action === "arrange-board") {
      operation = await arrangeStoryBoard({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          boardId: text(body.boardId),
          expectedRevision: Number(body.expectedRevision),
          clientRequestId: text(body.clientRequestId),
          placements: boardPlacements(body.placements),
        },
      });
    } else if (action === "open-section-writing") {
      operation = await openStoryBoardSectionWriting({
        prisma,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        value: {
          projectId: actor.projectId,
          boardId: text(body.boardId),
          sectionKey: text(body.sectionKey),
          expectedRevision: Number(body.expectedRevision),
          clientRequestId: text(body.clientRequestId),
        },
      });
    } else if (action === "promote-card-to-episode") {
      operation = await promoteSourceStoryCardToEpisode({
        prisma,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        value: {
          projectId: actor.projectId,
          episodeProductionId: text(body.episodeProductionId),
          cardId: text(body.cardId),
          originBoardId: text(body.originBoardId) || null,
          originBoardPlacementId: text(body.originBoardPlacementId) || null,
          clientRequestId: text(body.clientRequestId),
          expectedTimelineFingerprint: text(body.expectedTimelineFingerprint),
          placementMode: text(body.placementMode) as "append" | "at-time",
          episodeStartSeconds: body.episodeStartSeconds === null || body.episodeStartSeconds === undefined
            ? null
            : Number(body.episodeStartSeconds),
          trackId: text(body.trackId) || "V1",
        },
      });
    } else if (action === "withdraw-timeline-placement") {
      operation = await withdrawSourceStoryTimelinePlacement({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          placementId: text(body.placementId),
          expectedRevision: Number(body.expectedRevision),
          expectedTimelineFingerprint: text(body.expectedTimelineFingerprint),
          clientRequestId: text(body.clientRequestId),
        },
      });
    } else if (action === "queue-spatial-reframe") {
      const profile = text(body.profile);
      if (profile !== "spatial-proof-720p24" && profile !== "spatial-flat-4k24") throw new SourceStoryContractError("invalid-spatial-render-profile", "Choose a supported spatial render profile.");
      operation = await queueSpatialReframe({
        prisma,
        projectId: actor.projectId,
        timelinePlacementId: text(body.timelinePlacementId),
        profile,
        requestedByUserId: actor.userId,
        requestedByEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        localMediaRoot: localSpatialVaultRoot(),
      });
    } else if (action === "register-spatial-reframe") {
      operation = await registerSpatialReframeResult({ prisma, projectId: actor.projectId, jobId: text(body.jobId), authorizedRoot: localSpatialVaultRoot() });
    } else {
      return NextResponse.json({ error: "Choose a supported source-story action." }, { status: 400 });
    }

    const workspace = await readSourceStoryWorkspace(prisma, actor.projectId);
    return NextResponse.json(jsonSafe({ ok: true, operation, workspace }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function localSpatialVaultRoot() {
  if (process.env.NODE_ENV === "production" && !process.env.QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT?.trim()) {
    throw new SpatialRenderQueueError("spatial-local-renderer-unavailable", "This executor has no local spatial render vault configured.", 503);
  }
  return path.resolve(process.env.QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT?.trim() || path.join(os.homedir(), "Movies", "Quipsly Media Vault"));
}
