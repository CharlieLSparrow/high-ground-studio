import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import {
  canonicalEpisodeProductionJson,
} from "@/lib/episode-production/imported-media";
import {
  planExistingEpisodeProductionEnsure,
} from "@/lib/episode-production/episode-production-ensure";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import {
  appendEpisodeTimelineSavedReceipt,
  EpisodeEditReviewLedgerError,
  publicEpisodeEditReviewReceipt,
} from "@/lib/server/episode-edit-review-ledger";
import { lookupStudioProjectDocument, projectConfig } from "../../(app)/create/projectConfig";
import { EPISODE_ARTIFACT_CURRENT_VERSION } from "../../(app)/episode-production/episodeArtifact";

const EPISODE_ARTIFACT_PAYLOAD_VERSION = EPISODE_ARTIFACT_CURRENT_VERSION;

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function addPayloadVersion(value: unknown) {
  const record = asRecord(value) ?? {};
  const nextVersion = record.payloadVersion;
  const parsedVersion = typeof nextVersion === "string" ? Number.parseInt(nextVersion, 10) : typeof nextVersion === "number" ? nextVersion : EPISODE_ARTIFACT_PAYLOAD_VERSION;

  return {
    ...record,
    payloadVersion: Number.isFinite(parsedVersion) ? parsedVersion : EPISODE_ARTIFACT_PAYLOAD_VERSION,
  };
}

function payloadContentFingerprint(value: unknown) {
  const record = asRecord(value);
  return typeof record?.contentFingerprint === "string" ? record.contentFingerprint : "";
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function publicProductionJson(
  productionJson: unknown,
  timelineJson: unknown,
) {
  return canonicalEpisodeProductionJson(
    productionJson,
    timelineJson,
  );
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function isUniqueConstraintError(error: unknown) {
  return asRecord(error)?.code === "P2002";
}

function fallback(
  projectSlug: string,
  episodeSlug: string,
  title: string,
  message: string,
  details: {
    status?: string;
    actorEmail?: string | null;
    accessRole?: string | null;
    accessSource?: string | null;
    accessCode?: string | null;
  } = {},
) {
  return {
    ok: true,
    mode: "fallback",
    id: `fallback-${projectSlug}-${episodeSlug}`,
    projectSlug,
    slug: episodeSlug,
    title,
    boundaryLabel: title,
    status: details.status ?? "fallback",
    message,
    actorEmail: details.actorEmail ?? null,
    accessRole: details.accessRole ?? null,
    accessSource: details.accessSource ?? null,
    accessCode: details.accessCode ?? null,
    recordingRoomJson: null,
    timelineJson: null,
    transcriptJson: null,
    productionJson: null,
    updatedAt: new Date().toISOString(),
  };
}

async function ensureProjectAndDocument(prisma: ReturnType<typeof getPrismaClient>, projectSlug: string) {
  return lookupStudioProjectDocument(prisma, projectConfig(projectSlug).slug);
}

async function ensureProduction(body: any, request: Request) {
  const projectSlug = typeof body.projectSlug === "string" ? body.projectSlug.trim() : "";
  const episodeSlug = body.episodeSlug ?? "current-episode";
  const title = body.title ?? body.boundaryLabel ?? humanizeSlug(episodeSlug);
  const boundaryLabel = body.boundaryLabel ?? title;
  const action = body.action ?? "ensure";

  if (!projectSlug) {
    return fallback("missing-project", episodeSlug, title, "Choose a Nest/project before using episode production.");
  }

  let prisma: ReturnType<typeof getPrismaClient>;
  try {
    prisma = getPrismaClient();
  } catch {
    return fallback(projectSlug, episodeSlug, title, "DATABASE_URL is not available in this runtime.");
  }

  try {
    const access = await resolveEpisodeProductionAccess({
      request,
      projectSlug,
      action: "write",
      prisma,
    });

    if (!access.allowed) {
      return fallback(projectSlug, episodeSlug, title, access.error, {
        status: access.status === 401 ? "auth-required" : "access-denied",
        actorEmail: access.actor.email,
        accessRole: access.access?.role ?? null,
        accessSource: access.access?.source ?? access.actor.source,
        accessCode: access.code,
      });
    }

    const { project, document } = await ensureProjectAndDocument(prisma, projectSlug);
    const where = { projectId_slug: { projectId: project.id, slug: episodeSlug } };
    const existing = await prisma.studioEpisodeProduction.findUnique({ where });

    async function updateExistingProduction(
      current: typeof existing,
    ) {
      if (!current) {
        throw new Error(
          "Cannot ensure a missing episode production.",
        );
      }
      const identityPatch =
        planExistingEpisodeProductionEnsure(
          current,
          {
            title,
            boundaryLabel,
            boundaryKind:
              body.boundaryKind ?? "episode",
            boundaryStartBlockId:
              body.boundaryStartBlockId
              ?? undefined,
            boundaryEndBlockId:
              body.boundaryEndBlockId
              ?? undefined,
            boundaryStartOrder:
              body.boundaryStartOrder
              ?? undefined,
            boundaryEndOrder:
              body.boundaryEndOrder
              ?? undefined,
          },
        );
      if (!identityPatch) {
        return current;
      }
      return prisma.studioEpisodeProduction.update({
        where: { id: current.id },
        data: identityPatch,
      });
    }

    async function createProduction() {
      return prisma.studioEpisodeProduction.create({
        data: {
          projectId: project.id,
          documentId: document.id,
          slug: episodeSlug,
          title,
          boundaryLabel,
          boundaryKind: body.boundaryKind ?? "episode",
          boundaryStartBlockId: body.boundaryStartBlockId ?? undefined,
          boundaryEndBlockId: body.boundaryEndBlockId ?? undefined,
          boundaryStartOrder: body.boundaryStartOrder ?? undefined,
          boundaryEndOrder: body.boundaryEndOrder ?? undefined,
          productionJson: {
            ...(body.productionJson ?? {}),
            source: "quipsly-api-episode-production.create",
            projectSlug,
            episodeSlug,
            title,
          },
        },
      });
    }

    let production = existing
      ? action === "ensure"
        ? await updateExistingProduction(existing)
        : existing
      : null;

    if (!production) {
      try {
        production = await createProduction();
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        const racedExisting = await prisma.studioEpisodeProduction.findUnique({ where });
        if (!racedExisting) {
          throw error;
        }

        production = action === "ensure"
          ? await updateExistingProduction(racedExisting)
          : racedExisting;
      }
    }

    return {
      ok: true,
      mode: "database",
      id: production.id,
      projectSlug,
      documentId: document.id,
      slug: production.slug,
      title: production.title,
      boundaryLabel: production.boundaryLabel,
      status: production.status,
      actorEmail: access.actor.email,
      accessRole: access.access.role,
      accessSource: access.access.source,
      accessCode: null,
      recordingRoomJson: production.recordingRoomJson ?? null,
      timelineJson: production.timelineJson ?? null,
      transcriptJson: production.transcriptJson ?? null,
      productionJson: publicProductionJson(
        production.productionJson,
        production.timelineJson,
      ),
      updatedAt: production.updatedAt.toISOString(),
    };
  } catch (error) {
    console.warn("Episode production API fallback.", error);
    return fallback(projectSlug, episodeSlug, title, "StudioEpisodeProduction could not be written.");
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = body.action ?? "ensure";
  const state = await ensureProduction(body, request);

  if (state.mode !== "database") {
    return NextResponse.json(state);
  }

  if (action === "save-recording-room") {
    const prisma = getPrismaClient();
    const currentForMerge = await prisma.studioEpisodeProduction.findUnique({
      where: { id: state.id },
      select: { productionJson: true, timelineJson: true },
    });

    if (body.expectedUpdatedAt) {
      const current = await prisma.studioEpisodeProduction.findUnique({
        where: { id: state.id },
        select: { updatedAt: true, recordingRoomJson: true, timelineJson: true, transcriptJson: true, productionJson: true }
      });
      if (current && current.updatedAt.toISOString() !== body.expectedUpdatedAt) {
        return NextResponse.json({ 
          ...state,
          ok: false, 
          mode: "conflict", 
          message: "Concurrent edit detected.",
          recordingRoomJson: current.recordingRoomJson ?? null,
          timelineJson: current.timelineJson ?? null,
          transcriptJson: current.transcriptJson ?? null,
          productionJson: publicProductionJson(
            current.productionJson,
            current.timelineJson,
          ),
          updatedAt: current.updatedAt.toISOString(),
        }, { status: 409 });
      }
    }

    const nextRecordingRoom = addPayloadVersion(body.packageJson);
    const updated = await prisma.studioEpisodeProduction.update({
      where: { id: state.id },
      data: {
        recordingRoomJson: nextRecordingRoom,
        productionJson: jsonValue({
          ...publicProductionJson(
            currentForMerge?.productionJson,
            currentForMerge?.timelineJson,
          ),
          lastRecordingPackageAt: new Date().toISOString(),
          projectSlug: state.projectSlug,
          episodeSlug: state.slug,
        }),
      },
    });

    return NextResponse.json({
      ...state,
      recordingRoomJson: nextRecordingRoom,
      timelineJson: state.timelineJson,
      transcriptJson: state.transcriptJson,
      productionJson: updated.productionJson ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    });
  }

  if (action === "save-timeline") {
    const prisma = getPrismaClient();
    const saveAccess = await resolveEpisodeProductionAccess({ request, projectSlug: state.projectSlug, action: "write", prisma });
    if (!saveAccess.allowed) {
      return NextResponse.json({ ...state, ok: false, mode: "conflict", message: saveAccess.error, errorCode: saveAccess.code }, { status: saveAccess.status });
    }
    const timelinePayload = addPayloadVersion(body.timelineJson);
    const transcriptPayload = addPayloadVersion(body.transcriptJson);
    const saveOccurredAt = new Date();
    const saveRequestId = typeof body.editReviewSaveRequestId === "string" ? body.editReviewSaveRequestId : "";
    const beforeSha256 = typeof body.timelineFingerprintBeforeSha256 === "string" ? body.timelineFingerprintBeforeSha256 : "";
    const afterSha256 = typeof body.timelineFingerprintAfterSha256 === "string" ? body.timelineFingerprintAfterSha256 : "";
    const linkedReviewReceiptIds = Array.isArray(body.editReviewReceiptIds)
      ? body.editReviewReceiptIds.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const saveMode = body.editReviewSaveMode === "manual" ? "manual" : "auto";
    const incomingFingerprint = payloadContentFingerprint(timelinePayload);
    if (saveRequestId) {
      const expectedBeforeFingerprint = typeof body.expectedTimelineFingerprint === "string"
        ? body.expectedTimelineFingerprint
        : incomingFingerprint;
      if (!incomingFingerprint || sha256Text(expectedBeforeFingerprint) !== beforeSha256 || sha256Text(incomingFingerprint) !== afterSha256) {
        return NextResponse.json({ ...state, ok: false, mode: "conflict", message: "The timeline-save receipt does not match the submitted timeline bytes.", errorCode: "TIMELINE_SAVE_RECEIPT_BINDING_INVALID" }, { status: 400 });
      }
    }

    let write;
    try {
      write = await prisma.$transaction(async (tx) => {
        const currentForMerge = await tx.studioEpisodeProduction.findUnique({
          where: { id: state.id },
          select: { updatedAt: true, recordingRoomJson: true, timelineJson: true, transcriptJson: true, productionJson: true },
        });
        const currentFingerprint = payloadContentFingerprint(currentForMerge?.timelineJson);
        const fingerprintConflict = Boolean(body.expectedTimelineFingerprint && currentFingerprint && currentFingerprint !== body.expectedTimelineFingerprint);
        const timestampConflict = Boolean(!body.expectedTimelineFingerprint && body.expectedUpdatedAt && currentForMerge && currentForMerge.updatedAt.toISOString() !== body.expectedUpdatedAt);
        const exactReplay = Boolean(saveRequestId && currentFingerprint && currentFingerprint === incomingFingerprint);
        if (currentForMerge && exactReplay) {
          const receipt = await appendEpisodeTimelineSavedReceipt({
            prisma: tx,
            episodeProductionId: state.id,
            actor: saveAccess.actor,
            clientRequestId: saveRequestId,
            timelineFingerprintBeforeSha256: beforeSha256,
            timelineFingerprintAfterSha256: afterSha256,
            linkedReviewReceiptIds,
            saveMode,
            occurredAt: saveOccurredAt,
          });
          return { conflict: false as const, current: currentForMerge, receipt, updated: currentForMerge };
        }
        if (fingerprintConflict || timestampConflict || !currentForMerge) {
          return { conflict: true as const, current: currentForMerge, receipt: null, updated: null };
        }
        const updated = await tx.studioEpisodeProduction.update({
          where: { id: state.id },
          data: {
            timelineJson: timelinePayload,
            transcriptJson: transcriptPayload,
            productionJson: jsonValue({
              ...publicProductionJson(currentForMerge.productionJson, currentForMerge.timelineJson),
              lastTimelineSaveAt: saveOccurredAt.toISOString(),
              projectSlug: state.projectSlug,
              episodeSlug: state.slug,
            }),
          },
        });
        const receipt = saveRequestId && beforeSha256 && afterSha256
          ? await appendEpisodeTimelineSavedReceipt({
            prisma: tx,
            episodeProductionId: state.id,
            actor: saveAccess.actor,
            clientRequestId: saveRequestId,
            timelineFingerprintBeforeSha256: beforeSha256,
            timelineFingerprintAfterSha256: afterSha256,
            linkedReviewReceiptIds,
            saveMode,
            occurredAt: saveOccurredAt,
          })
          : null;
        return { conflict: false as const, current: currentForMerge, receipt, updated };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof EpisodeEditReviewLedgerError) {
        return NextResponse.json({ ...state, ok: false, mode: "conflict", message: error.message, errorCode: error.code }, { status: error.status });
      }
      throw error;
    }

    if (write.conflict || !write.updated) {
      const currentForMerge = write.current;
      return NextResponse.json({
        ...state,
        ok: false,
        mode: "conflict",
        message: body.expectedTimelineFingerprint ? "Timeline edit conflict detected. Refresh before overwriting this cut." : "Concurrent edit detected.",
        recordingRoomJson: currentForMerge?.recordingRoomJson ?? null,
        timelineJson: currentForMerge?.timelineJson ?? null,
        transcriptJson: currentForMerge?.transcriptJson ?? null,
        productionJson: publicProductionJson(currentForMerge?.productionJson, currentForMerge?.timelineJson),
        updatedAt: currentForMerge?.updatedAt?.toISOString() ?? state.updatedAt,
      }, { status: 409 });
    }

    return NextResponse.json({
      ...state,
      recordingRoomJson: state.recordingRoomJson,
      timelineJson: timelinePayload,
      transcriptJson: transcriptPayload,
      productionJson: write.updated.productionJson ?? null,
      updatedAt: write.updated.updatedAt.toISOString(),
      editReviewReceipt: write.receipt ? publicEpisodeEditReviewReceipt(write.receipt) : null,
    });
  }

  return NextResponse.json(state);
}
