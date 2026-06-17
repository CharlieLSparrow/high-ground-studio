import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
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

    async function updateExistingProduction(id: string, currentProductionJson: unknown) {
      return prisma.studioEpisodeProduction.update({
          where: { id },
          data: {
            title,
            boundaryLabel,
            boundaryKind: body.boundaryKind ?? "episode",
            boundaryStartBlockId: body.boundaryStartBlockId ?? undefined,
            boundaryEndBlockId: body.boundaryEndBlockId ?? undefined,
            boundaryStartOrder: body.boundaryStartOrder ?? undefined,
            boundaryEndOrder: body.boundaryEndOrder ?? undefined,
            productionJson: {
              ...(asRecord(currentProductionJson) ?? {}),
              ...(body.productionJson ?? {}),
              source: "quipsly-api-episode-production.ensure",
              projectSlug,
              episodeSlug,
              title,
            },
          },
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
        ? await updateExistingProduction(existing.id, existing.productionJson)
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
          ? await updateExistingProduction(racedExisting.id, racedExisting.productionJson)
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
      productionJson: production.productionJson ?? null,
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
      select: { productionJson: true },
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
          productionJson: current.productionJson ?? null,
          updatedAt: current.updatedAt.toISOString(),
        }, { status: 409 });
      }
    }

    const nextRecordingRoom = addPayloadVersion(body.packageJson);
    const updated = await prisma.studioEpisodeProduction.update({
      where: { id: state.id },
      data: {
        recordingRoomJson: nextRecordingRoom,
        productionJson: {
          ...(asRecord(currentForMerge?.productionJson) ?? {}),
          lastRecordingPackageAt: new Date().toISOString(),
          projectSlug: state.projectSlug,
          episodeSlug: state.slug,
        },
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
    const currentForMerge = await prisma.studioEpisodeProduction.findUnique({
      where: { id: state.id },
      select: { updatedAt: true, recordingRoomJson: true, timelineJson: true, transcriptJson: true, productionJson: true },
    });

    if (body.expectedTimelineFingerprint) {
      const currentFingerprint = payloadContentFingerprint(currentForMerge?.timelineJson);
      if (currentFingerprint && currentFingerprint !== body.expectedTimelineFingerprint) {
        return NextResponse.json({ 
          ...state,
          ok: false, 
          mode: "conflict", 
          message: "Timeline edit conflict detected. Refresh before overwriting this cut.",
          recordingRoomJson: currentForMerge?.recordingRoomJson ?? null,
          timelineJson: currentForMerge?.timelineJson ?? null,
          transcriptJson: currentForMerge?.transcriptJson ?? null,
          productionJson: currentForMerge?.productionJson ?? null,
          updatedAt: currentForMerge?.updatedAt?.toISOString() ?? state.updatedAt,
        }, { status: 409 });
      }
    } else if (body.expectedUpdatedAt && currentForMerge && currentForMerge.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      return NextResponse.json({ 
        ...state,
        ok: false, 
        mode: "conflict", 
        message: "Concurrent edit detected.",
        recordingRoomJson: currentForMerge.recordingRoomJson ?? null,
        timelineJson: currentForMerge.timelineJson ?? null,
        transcriptJson: currentForMerge.transcriptJson ?? null,
        productionJson: currentForMerge.productionJson ?? null,
        updatedAt: currentForMerge.updatedAt.toISOString(),
      }, { status: 409 });
    }

    const timelinePayload = addPayloadVersion(body.timelineJson);
    const transcriptPayload = addPayloadVersion(body.transcriptJson);
    const updated = await prisma.studioEpisodeProduction.update({
      where: { id: state.id },
      data: {
        timelineJson: timelinePayload,
        transcriptJson: transcriptPayload,
        productionJson: {
          ...(asRecord(currentForMerge?.productionJson) ?? {}),
          lastTimelineSaveAt: new Date().toISOString(),
          projectSlug: state.projectSlug,
          episodeSlug: state.slug,
        },
      },
    });

    return NextResponse.json({
      ...state,
      recordingRoomJson: state.recordingRoomJson,
      timelineJson: timelinePayload,
      transcriptJson: transcriptPayload,
      productionJson: updated.productionJson ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    });
  }

  return NextResponse.json(state);
}
