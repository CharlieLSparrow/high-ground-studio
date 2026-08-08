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
import { readSpatialRenderReadiness } from "@/lib/server/spatial-render-readiness";
import { requireSourceStoryAccess } from "@/lib/server/source-story-access";
import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";
import {
  attachGoogleDriveFolderToNest,
  attachGoogleDriveFilesToNest,
  attachGoogleDriveFileToNest,
  googleDriveSourceErrorResponse,
  inspectGoogleDriveFolderForNest,
  refreshGoogleDriveLibraryForNest,
} from "@/lib/server/google-drive-source";
import {
  ExternalMediaLibraryError,
  listExternalMediaLibraries,
} from "@/lib/server/external-media-library";
import { DeviceMediaFolderContractError } from "@/lib/device-media-folder-contract";
import { DeviceMediaPreparationContractError } from "@/lib/device-media-preparation-contract";
import { DeviceMediaVerificationContractError } from "@/lib/device-media-verification-contract";
import { observeDeviceMediaFolderForNest } from "@/lib/server/device-media-folder";
import {
  DeviceMediaPreparationError,
  registerDeviceMediaPreparation,
} from "@/lib/server/device-media-preparation";
import {
  DeviceMediaVerificationError,
  registerDeviceMediaVerification,
} from "@/lib/server/device-media-verification";
import {
  ExternalSourceProxyRequestError,
  requestExternalSourceProxy,
} from "@/lib/server/external-source-proxy";
import {
  GoogleDriveSourceMaterializationRequestError,
  requestGoogleDriveSourceMaterialization,
} from "@/lib/server/google-drive-source-materialization";
import {
  GoogleDriveLibraryNavigationError,
  prepareGoogleDriveLibraryNavigation,
} from "@/lib/server/google-drive-library-navigation";
import {
  GoogleDriveSourceConformError,
  planGoogleDriveSourceUnitConform,
  requestGoogleDriveSourceUnitConform,
} from "@/lib/server/google-drive-source-conform";
import {
  GoogleDriveLibraryConformError,
  planGoogleDriveLibraryConform,
} from "@/lib/server/google-drive-library-conform";
import {
  SourceVisualOverviewRequestError,
  requestSourceVisualOverview,
} from "@/lib/server/source-visual-overview";
import {
  SourceAudioNavigationRequestError,
  requestSourceAudioNavigation,
} from "@/lib/server/source-audio-navigation";
import {
  SourceStoryConflictError,
  arrangeStoryBoard,
  arrangeStoryBoardSections,
  archiveStoryBoardSection,
  createSourceStoryCard,
  createMediaSourceSet,
  createStoryBoard,
  createStoryBoardSection,
  openStoryBoardSectionWriting,
  readSourceStoryWorkspace,
  promoteSourceStoryCardToEpisode,
  repositionSourceStoryTimelinePlacement,
  rebindSourceStoryCard,
  reorderStoryBoard,
  updateSourceStoryCard,
  updateStoryBoardSection,
  withdrawSourceStoryTimelinePlacement,
} from "@/lib/server/source-story";
import {
  addSourceToCollection,
  createSourceCollection,
  readSourceCollections,
  removeSourceFromCollection,
} from "@/lib/server/source-collections";
import {
  SpatialRenderQueueError,
  queueSpatialReframe,
  registerSpatialReframeResult,
} from "@/lib/server/spatial-render-job";

export const dynamic = "force-dynamic";

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as T;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SourceStoryContractError(
      "invalid-list",
      "The supplied identity list is malformed.",
    );
  }
  return value as string[];
}

function googleDriveSelections(value: unknown) {
  if (!Array.isArray(value)) {
    throw new SourceStoryContractError(
      "invalid-drive-selection",
      "The selected Drive file list is malformed.",
    );
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new SourceStoryContractError(
        "invalid-drive-selection",
        "A selected Drive file identity is malformed.",
      );
    }
    const selection = item as Record<string, unknown>;
    return {
      externalFileId: text(selection.externalFileId),
      resourceKey: text(selection.resourceKey) || null,
    };
  });
}

function sourceSetMembers(value: unknown) {
  if (!Array.isArray(value))
    throw new SourceStoryContractError(
      "invalid-source-set-members",
      "The source-set member list is malformed.",
    );
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new SourceStoryContractError(
        "invalid-source-set-member",
        "A source-set member is malformed.",
      );
    }
    const member = item as Record<string, unknown>;
    return {
      sourceRevisionId: text(member.sourceRevisionId),
      role: text(member.role) as MediaSourceSetMemberRole,
      ordinal:
        member.ordinal === undefined ? undefined : Number(member.ordinal),
      requiredForRender:
        member.requiredForRender === undefined
          ? undefined
          : member.requiredForRender === true,
    };
  });
}

function boardPlacements(value: unknown): StoryBoardPlacementIntent[] {
  if (!Array.isArray(value))
    throw new SourceStoryContractError(
      "invalid-board-arrangement",
      "The board arrangement is malformed.",
    );
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new SourceStoryContractError(
        "invalid-board-placement",
        "A board placement is malformed.",
      );
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
    throw new SourceStoryContractError(
      "invalid-status",
      "The story card status is unsupported.",
    );
  }
  return candidate;
}

function purposeFrom(value: unknown): StoryCardPurpose {
  const candidate = text(value) as StoryCardPurpose;
  if (!candidate) return "select";
  if (!storyCardPurposes.includes(candidate)) {
    throw new SourceStoryContractError(
      "invalid-purpose",
      "The story purpose is unsupported.",
    );
  }
  return candidate;
}

function errorResponse(error: unknown) {
  const driveError = googleDriveSourceErrorResponse(error);
  if (driveError)
    return NextResponse.json(driveError.body, { status: driveError.status });
  if (error instanceof SourceStoryConflictError) {
    return NextResponse.json(
      {
        error: error.message,
        errorCode: error.code,
        currentRevision: error.currentRevision,
      },
      { status: 409 },
    );
  }
  if (error instanceof ExternalMediaLibraryError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof DeviceMediaFolderContractError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof DeviceMediaPreparationContractError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: 400 },
    );
  }
  if (error instanceof DeviceMediaPreparationError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof DeviceMediaVerificationContractError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: 400 },
    );
  }
  if (error instanceof DeviceMediaVerificationError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof SourceStoryContractError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: 400 },
    );
  }
  if (error instanceof ExternalSourceProxyRequestError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof GoogleDriveSourceMaterializationRequestError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof GoogleDriveLibraryNavigationError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof GoogleDriveSourceConformError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof GoogleDriveLibraryConformError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof SourceVisualOverviewRequestError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof SourceAudioNavigationRequestError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  if (error instanceof SpatialRenderQueueError) {
    return NextResponse.json(
      { error: error.message, errorCode: error.code },
      { status: error.status },
    );
  }
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? Number((error as { status: number }).status)
      : 500;
  const safeStatus = status === 401 || status === 404 ? status : 500;
  if (safeStatus === 500) console.error("[source-story] request failed", error);
  return NextResponse.json(
    {
      error:
        safeStatus === 500
          ? "The source workspace could not complete that operation."
          : (error as Error).message,
    },
    { status: safeStatus },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const actor = await requireSourceStoryAccess(request, slug, "read");
    const executorNodeId = new URL(request.url).searchParams.get(
      "executorNodeId",
    );
    const [
      workspace,
      sourceCollections,
      externalMediaLibraries,
      spatialRenderReadiness,
    ] = await Promise.all([
      readSourceStoryWorkspace(
        getPrismaClient(),
        actor.projectId,
        executorNodeId,
      ),
      readSourceCollections(getPrismaClient(), {
        projectId: actor.projectId,
        actorUserId: actor.userId,
      }),
      listExternalMediaLibraries({
        prisma: getPrismaClient(),
        projectId: actor.projectId,
        actorUserId: actor.userId,
        executorNodeId,
      }),
      readSpatialRenderReadiness(),
    ]);
    return NextResponse.json(
      jsonSafe({
        ok: true,
        workspace: {
          ...workspace,
          sourceCollections,
          externalMediaLibraries,
        },
        spatialRenderReadiness,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const actor = await requireSourceStoryAccess(request, slug, "write");
    const body = (await request.json()) as Record<string, unknown>;
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
    } else if (action === "attach-google-drive-files") {
      operation = await attachGoogleDriveFilesToNest({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        connectionId: text(body.connectionId),
        selections: googleDriveSelections(body.selections),
        libraryRootId: text(body.libraryRootId) || null,
        libraryRootName: text(body.libraryRootName) || null,
        libraryRootResourceKey: text(body.libraryRootResourceKey) || null,
        existingLibraryId: text(body.existingLibraryId) || null,
        clientRequestId: text(body.clientRequestId),
        requestUrl: request.url,
      });
    } else if (action === "inspect-google-drive-folder") {
      operation = await inspectGoogleDriveFolderForNest({
        prisma,
        actorUserId: actor.userId,
        connectionId: text(body.connectionId),
        folderId: text(body.folderId),
        resourceKey: text(body.resourceKey) || null,
        requestUrl: request.url,
      });
    } else if (action === "attach-google-drive-folder") {
      operation = await attachGoogleDriveFolderToNest({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        connectionId: text(body.connectionId),
        folderId: text(body.folderId),
        resourceKey: text(body.resourceKey) || null,
        clientRequestId: text(body.clientRequestId),
        requestUrl: request.url,
      });
    } else if (action === "refresh-google-drive-library") {
      operation = await refreshGoogleDriveLibraryForNest({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        libraryId: text(body.libraryId),
        clientRequestId: text(body.clientRequestId),
        requestUrl: request.url,
      });
    } else if (action === "observe-device-media-folder") {
      operation = await observeDeviceMediaFolderForNest({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        executorNodeId: text(body.executorNodeId),
        storageScopeId: text(body.storageScopeId),
        observation: body.observation,
      });
    } else if (action === "register-device-media-preparation") {
      operation = await registerDeviceMediaPreparation({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        receipt: body.receipt,
      });
    } else if (action === "register-device-media-verification") {
      operation = await registerDeviceMediaVerification({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        receipt: body.receipt,
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
        executorNodeId: text(body.executorNodeId) || null,
        retryFailed: body.retryFailed === true,
      });
    } else if (action === "prepare-google-drive-source") {
      operation = await requestGoogleDriveSourceMaterialization({
        prisma,
        projectId: actor.projectId,
        referenceId: text(body.referenceId),
        sourceRevisionId: text(body.sourceRevisionId),
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        executorTarget:
          (await readLocalExecutorTarget(
            prisma,
            text(body.executorNodeId) || null,
          )) ?? undefined,
        retryFailed: body.retryFailed === true,
      });
    } else if (action === "prepare-google-drive-library-navigation") {
      operation = await prepareGoogleDriveLibraryNavigation({
        prisma,
        projectId: actor.projectId,
        libraryId: text(body.libraryId),
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        limit: body.limit === undefined ? undefined : Number(body.limit),
        retryFailed: body.retryFailed === true,
        executorNodeId: text(body.executorNodeId) || null,
      });
    } else if (action === "plan-google-drive-source-conform") {
      operation = await planGoogleDriveSourceUnitConform({
        prisma,
        projectId: actor.projectId,
        sourceUnitId: text(body.sourceUnitId),
        actorUserId: actor.userId,
        executorNodeId: text(body.executorNodeId) || null,
      });
    } else if (action === "plan-google-drive-library-conform") {
      operation = await planGoogleDriveLibraryConform({
        prisma,
        projectId: actor.projectId,
        libraryId: text(body.libraryId),
        actorUserId: actor.userId,
        executorNodeId: text(body.executorNodeId) || null,
      });
    } else if (action === "prepare-google-drive-source-conform") {
      operation = await requestGoogleDriveSourceUnitConform({
        prisma,
        projectId: actor.projectId,
        sourceUnitId: text(body.sourceUnitId),
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        expectedRemainingBytes: text(body.expectedRemainingBytes),
        executorNodeId: text(body.executorNodeId) || null,
        retryFailed: body.retryFailed === true,
      });
    } else if (action === "request-source-visual-overview") {
      operation = await requestSourceVisualOverview({
        prisma,
        projectId: actor.projectId,
        sourceRevisionId: text(body.sourceRevisionId),
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        executorNodeId: text(body.executorNodeId) || null,
        retryFailed: body.retryFailed === true,
      });
    } else if (action === "request-source-audio-navigation") {
      operation = await requestSourceAudioNavigation({
        prisma,
        projectId: actor.projectId,
        sourceRevisionId: text(body.sourceRevisionId),
        actorUserId: actor.userId,
        actorEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        executorNodeId: text(body.executorNodeId) || null,
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
          metadata:
            body.metadata &&
            typeof body.metadata === "object" &&
            !Array.isArray(body.metadata)
              ? (body.metadata as Record<string, unknown>)
              : {},
        },
      });
    } else if (action === "create-source-collection") {
      operation = await createSourceCollection({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        clientRequestId: text(body.clientRequestId),
        title: text(body.title),
        description: text(body.description),
        scope: text(body.scope) || "personal",
        color: text(body.color) || null,
      });
    } else if (action === "add-source-to-collection") {
      operation = await addSourceToCollection({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        collectionId: text(body.collectionId),
        expectedRevision: Number(body.expectedRevision),
        clientRequestId: text(body.clientRequestId),
        sourceKind: text(body.sourceKind),
        sourceId: text(body.sourceId),
        note: text(body.note),
      });
    } else if (action === "remove-source-from-collection") {
      operation = await removeSourceFromCollection({
        prisma,
        projectId: actor.projectId,
        actorUserId: actor.userId,
        collectionId: text(body.collectionId),
        expectedRevision: Number(body.expectedRevision),
        clientRequestId: text(body.clientRequestId),
        sourceKind: text(body.sourceKind),
        sourceId: text(body.sourceId),
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
          expectedBoardRevision:
            body.expectedBoardRevision === null ||
            body.expectedBoardRevision === undefined
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
          reframeRecipe:
            body.reframeRecipe && typeof body.reframeRecipe === "object"
              ? (body.reframeRecipe as StoryReframeRecipe)
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
          reframeRecipe:
            body.reframeRecipe && typeof body.reframeRecipe === "object"
              ? (body.reframeRecipe as StoryReframeRecipe)
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
    } else if (action === "create-board-section") {
      operation = await createStoryBoardSection({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          boardId: text(body.boardId),
          expectedBoardRevision: Number(body.expectedBoardRevision),
          clientRequestId: text(body.clientRequestId),
          title: text(body.title),
          synopsis: text(body.synopsis),
        },
      });
    } else if (action === "update-board-section") {
      operation = await updateStoryBoardSection({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          boardId: text(body.boardId),
          sectionId: text(body.sectionId),
          expectedRevision: Number(body.expectedRevision),
          clientRequestId: text(body.clientRequestId),
          title: text(body.title),
          synopsis: text(body.synopsis),
        },
      });
    } else if (action === "arrange-board-sections") {
      operation = await arrangeStoryBoardSections({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          boardId: text(body.boardId),
          expectedBoardRevision: Number(body.expectedBoardRevision),
          clientRequestId: text(body.clientRequestId),
          orderedSectionIds: stringArray(body.orderedSectionIds),
        },
      });
    } else if (action === "archive-board-section") {
      operation = await archiveStoryBoardSection({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          boardId: text(body.boardId),
          sectionId: text(body.sectionId),
          expectedBoardRevision: Number(body.expectedBoardRevision),
          expectedSectionRevision: Number(body.expectedSectionRevision),
          clientRequestId: text(body.clientRequestId),
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
          episodeStartSeconds:
            body.episodeStartSeconds === null ||
            body.episodeStartSeconds === undefined
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
    } else if (action === "reposition-timeline-placement") {
      operation = await repositionSourceStoryTimelinePlacement({
        prisma,
        actorUserId: actor.userId,
        value: {
          projectId: actor.projectId,
          placementId: text(body.placementId),
          expectedRevision: Number(body.expectedRevision),
          expectedTimelineFingerprint: text(body.expectedTimelineFingerprint),
          clientRequestId: text(body.clientRequestId),
          episodeStartSeconds: Number(body.episodeStartSeconds),
          trackId: text(body.trackId),
        },
      });
    } else if (action === "queue-spatial-reframe") {
      const profile = text(body.profile);
      if (profile !== "spatial-proof-720p24" && profile !== "spatial-flat-4k24")
        throw new SourceStoryContractError(
          "invalid-spatial-render-profile",
          "Choose a supported spatial render profile.",
        );
      operation = await queueSpatialReframe({
        prisma,
        projectId: actor.projectId,
        timelinePlacementId: text(body.timelinePlacementId),
        profile,
        requestedByUserId: actor.userId,
        requestedByEmail: actor.email,
        clientRequestId: text(body.clientRequestId),
        localMediaRoot: localSpatialVaultRoot(),
        executorNodeId:
          typeof body.executorNodeId === "string" ? body.executorNodeId : null,
      });
    } else if (action === "register-spatial-reframe") {
      operation = await registerSpatialReframeResult({
        prisma,
        projectId: actor.projectId,
        jobId: text(body.jobId),
        authorizedRoot: localSpatialVaultRoot(),
      });
    } else {
      return NextResponse.json(
        { error: "Choose a supported source-story action." },
        { status: 400 },
      );
    }

    const [workspace, sourceCollections] = await Promise.all([
      readSourceStoryWorkspace(
        prisma,
        actor.projectId,
        typeof body.executorNodeId === "string" ? body.executorNodeId : null,
      ),
      readSourceCollections(prisma, {
        projectId: actor.projectId,
        actorUserId: actor.userId,
      }),
    ]);
    return NextResponse.json(
      jsonSafe({
        ok: true,
        operation,
        workspace: { ...workspace, sourceCollections },
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function localSpatialVaultRoot() {
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT?.trim()
  ) {
    throw new SpatialRenderQueueError(
      "spatial-local-renderer-unavailable",
      "This executor has no local spatial render vault configured.",
      503,
    );
  }
  return path.resolve(
    process.env.QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT?.trim() ||
      path.join(os.homedir(), "Movies", "Quipsly Media Vault"),
  );
}
