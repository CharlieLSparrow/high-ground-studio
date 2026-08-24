import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import {
  PodcastOutputPacketError,
  revisePodcastOutputPacketMetadata,
  selectPodcastOutputPacket,
  withdrawPodcastOutputPacket,
} from "@/lib/server/podcast-output-packet";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" ? value : Number.NaN;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = text(body?.action).toLowerCase();
    const projectId = text(body?.projectId);
    const projectSlug = text(body?.projectSlug);
    const episodeProductionId = text(body?.episodeProductionId);
    const clientRequestId = text(body?.clientRequestId);
    if (!body || !projectSlug || !episodeProductionId || !clientRequestId || !["select", "metadata", "withdraw"].includes(action)) {
      return NextResponse.json({ ok: false, code: "PODCAST_PACKET_INVALID_REQUEST", error: "Action, Nest, Episode, and stable request identity are required." }, { status: 400 });
    }
    if (action === "select" && (!text(body.assetId) || !text(body.deliveryJobId))) {
      return NextResponse.json({ ok: false, code: "PODCAST_PACKET_AUDIO_COORDINATES_REQUIRED", error: "Selecting a packet requires the exact attached asset and encoded delivery job." }, { status: 400 });
    }
    const metadata = object(body.metadata);
    if (action === "metadata" && !text(body.baseSelectionId)) {
      return NextResponse.json({ ok: false, code: "PODCAST_PACKET_METADATA_REQUEST_REQUIRED", error: "Metadata review requires the current selected packet." }, { status: 400 });
    }
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({
      request,
      ...(projectId ? { projectId } : {}),
      projectSlug,
      action: "write",
      prisma,
    });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
    const actor = { id: access.actor.id, email: access.actor.email };
    const result = action === "select"
      ? await selectPodcastOutputPacket({
          prisma,
          actor,
          projectSlug,
          episodeProductionId,
          assetId: text(body.assetId),
          deliveryJobId: text(body.deliveryJobId),
          clientRequestId,
          acknowledgements: {
            exactEncodedBytesProofListened: body.exactEncodedBytesProofListened === true,
            selectAsEpisodeEnclosureCandidate: body.selectAsEpisodeEnclosureCandidate === true,
            metadataStillRequiresReview: body.metadataStillRequiresReview === true,
          },
        })
      : action === "metadata"
        ? await revisePodcastOutputPacketMetadata({
            prisma,
            actor,
            projectSlug,
            episodeProductionId,
            baseSelectionId: text(body.baseSelectionId),
            clientRequestId,
            metadata: {
              title: text(metadata.title),
              description: text(metadata.description),
              episodeType: text(metadata.episodeType),
              episodeNumber: optionalInteger(metadata.episodeNumber),
              seasonNumber: optionalInteger(metadata.seasonNumber),
              publishAt: metadata.publishAt === null || metadata.publishAt === "" ? null : text(metadata.publishAt),
            },
          })
        : await withdrawPodcastOutputPacket({
          prisma,
          actor,
          projectSlug,
          episodeProductionId,
          clientRequestId,
          reason: text(body.reason),
        });
    return NextResponse.json(result, { status: result.idempotentReplay ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PodcastOutputPacketError ? error.status : 500;
    const code = error instanceof PodcastOutputPacketError ? error.code : "PODCAST_PACKET_OPERATION_FAILED";
    const message = error instanceof Error ? error.message : "The Episode package operation failed.";
    if (status >= 500) console.error("[podcast-output-packet] operation failed", error);
    return NextResponse.json({ ok: false, code, error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
