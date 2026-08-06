import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  buildEpisodeArtifactPayload,
  episodeTimelineContentFingerprint,
  timelineStateFromEpisodeArtifact,
} from "@/app/(app)/episode-production/episodeArtifact";
import { canonicalEpisodeProductionJson } from "@/lib/episode-production/imported-media";
import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { loadEpisodeCaptureTakeMaterialization } from "@/lib/server/episode-capture-take-materialization";
import {
  appendEpisodeTimelineSavedReceipt,
  EpisodeEditReviewLedgerError,
  publicEpisodeEditReviewReceipt,
} from "@/lib/server/episode-edit-review-ledger";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function noStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function publicInspection(
  result: NonNullable<Awaited<ReturnType<typeof loadEpisodeCaptureTakeMaterialization>>>,
) {
  const { timeline: _timeline, ...plan } = result.plan;
  return {
    ok: true,
    projectId: result.production.projectId,
    episodeProductionId: result.production.id,
    episodeSlug: result.production.slug,
    episodeTitle: result.production.title,
    productionUpdatedAt: result.production.updatedAt.toISOString(),
    captureGroupId: result.captureGroupId,
    importedMediaCount: result.importedMediaCount,
    selectedMediaCount: result.selectedMediaCount,
    sourceCount: result.sourceCount,
    transcriptJobId: result.transcriptJobId,
    plan,
  };
}

async function resolveInput(request: Request, action: "read" | "write") {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return { error: noStore({ ok: false, error: "A JSON request body is required." }, 400) } as const;
    }
  }
  const projectSlug = text(body.projectSlug) || text(url.searchParams.get("projectSlug"));
  const episodeSlug = text(body.episodeSlug) || text(url.searchParams.get("episodeSlug"));
  const captureGroupId = text(body.captureGroupId) || text(url.searchParams.get("captureGroupId"));
  if (!projectSlug || !episodeSlug) {
    return { error: noStore({ ok: false, error: "projectSlug and episodeSlug are required." }, 400) } as const;
  }
  const prisma = getPrismaClient();
  const access = await resolveEpisodeProductionAccess({
    request,
    projectSlug,
    action,
    prisma,
  });
  if (!access.allowed) {
    return { error: noStore({ ok: false, error: access.error, errorCode: access.code }, access.status) } as const;
  }
  if (!access.access.projectId) {
    return { error: noStore({ ok: false, error: "The authorized Nest has no canonical project identity." }, 409) } as const;
  }
  return {
    prisma,
    access,
    projectSlug,
    projectId: access.access.projectId,
    episodeSlug,
    captureGroupId,
    body,
  } as const;
}

export async function GET(request: Request) {
  const input = await resolveInput(request, "read");
  if ("error" in input) return input.error!;
  const result = await loadEpisodeCaptureTakeMaterialization({
    prisma: input.prisma,
    projectId: input.projectId,
    episodeSlug: input.episodeSlug,
    captureGroupId: input.captureGroupId,
    actor: input.access.actor,
  });
  if (!result) {
    return noStore({ ok: false, error: "Episode production was not found." }, 404);
  }
  return noStore(publicInspection(result));
}

export async function POST(request: Request) {
  const input = await resolveInput(request, "write");
  if ("error" in input) return input.error!;
  const clientRequestId = text(input.body.clientRequestId).toLowerCase();
  const expectedTimelineFingerprint = text(input.body.expectedTimelineFingerprint);
  if (!clientRequestId || !expectedTimelineFingerprint) {
    return noStore({
      ok: false,
      error: "clientRequestId and expectedTimelineFingerprint are required for a conflict-safe materialization.",
    }, 400);
  }

  const savedAt = new Date().toISOString();
  const inspected = await loadEpisodeCaptureTakeMaterialization({
    prisma: input.prisma,
    projectId: input.projectId,
    episodeSlug: input.episodeSlug,
    captureGroupId: input.captureGroupId,
    actor: input.access.actor,
    materializedAt: savedAt,
  });
  if (!inspected) {
    return noStore({ ok: false, error: "Episode production was not found." }, 404);
  }
  if (!inspected.plan.ok) {
    return noStore({
      ...publicInspection(inspected),
      ok: false,
      error: inspected.plan.nextAction,
      errorCode: "CAPTURE_TAKE_MATERIALIZATION_HELD",
    }, 409);
  }

  const currentFingerprint = episodeTimelineContentFingerprint(
    timelineStateFromEpisodeArtifact(inspected.production.timelineJson),
  );
  if (currentFingerprint !== expectedTimelineFingerprint) {
    return noStore({
      ...publicInspection(inspected),
      ok: false,
      error: "The episode timeline changed after inspection. Refresh before materializing this take.",
      errorCode: "CAPTURE_TAKE_TIMELINE_CONFLICT",
      currentTimelineFingerprint: currentFingerprint,
    }, 409);
  }
  const artifact = buildEpisodeArtifactPayload({
    timeline: inspected.plan.timeline,
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
    generatedFrom: "capture-take-materialization",
    savedAt,
  });
  const afterFingerprint = artifact.contentFingerprint!;

  try {
    const write = await input.prisma.$transaction(async (tx) => {
      const current = await tx.studioEpisodeProduction.findUnique({
        where: { id: inspected.production.id },
        select: {
          id: true,
          timelineJson: true,
          transcriptJson: true,
          productionJson: true,
          updatedAt: true,
        },
      });
      if (!current) return { conflict: true as const, currentFingerprint: "", receipt: null, updated: null };
      const transactionFingerprint = episodeTimelineContentFingerprint(
        timelineStateFromEpisodeArtifact(current.timelineJson),
      );
      if (
        transactionFingerprint !== expectedTimelineFingerprint
        || current.updatedAt.toISOString() !== inspected.production.updatedAt.toISOString()
      ) {
        return { conflict: true as const, currentFingerprint: transactionFingerprint, receipt: null, updated: null };
      }

      if (!inspected.plan.changed) {
        return { conflict: false as const, currentFingerprint: transactionFingerprint, receipt: null, updated: current };
      }
      const updated = await tx.studioEpisodeProduction.update({
        where: { id: current.id },
        data: {
          timelineJson: jsonValue(artifact),
          transcriptJson: jsonValue(artifact),
          productionJson: jsonValue({
            ...canonicalEpisodeProductionJson(current.productionJson, current.timelineJson),
            lastTimelineSaveAt: savedAt,
            lastCaptureTakeMaterialization: {
              captureGroupId: inspected.plan.captureGroupId,
              sourceSetFingerprintSha256: inspected.plan.sourceSetFingerprintSha256,
              status: inspected.plan.status,
              actorUserId: input.access.actor.id,
              actorEmail: input.access.actor.email,
              savedAt,
              sourceMediaUnchanged: true,
              publicationNotStarted: true,
            },
          }),
        },
      });
      const receipt = await appendEpisodeTimelineSavedReceipt({
        prisma: tx,
        episodeProductionId: current.id,
        actor: input.access.actor,
        clientRequestId,
        timelineFingerprintBeforeSha256: sha256(expectedTimelineFingerprint),
        timelineFingerprintAfterSha256: sha256(afterFingerprint),
        linkedReviewReceiptIds: [],
        saveMode: "manual",
        occurredAt: new Date(savedAt),
      });
      return { conflict: false as const, currentFingerprint: afterFingerprint, receipt, updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (write.conflict || !write.updated) {
      return noStore({
        ...publicInspection(inspected),
        ok: false,
        error: "The episode or its protected source projection changed during materialization. Refresh before retrying.",
        errorCode: "CAPTURE_TAKE_CONCURRENT_WRITE",
        currentTimelineFingerprint: write.currentFingerprint,
      }, 409);
    }

    const inspection = publicInspection(inspected);
    return noStore({
      ...inspection,
      ok: true,
      changed: inspected.plan.changed,
      plan: {
        ...inspection.plan,
        changed: false,
      },
      timelineJson: artifact,
      transcriptJson: artifact,
      timelineFingerprint: afterFingerprint,
      updatedAt: write.updated.updatedAt.toISOString(),
      editReviewReceipt: write.receipt
        ? publicEpisodeEditReviewReceipt(write.receipt)
        : null,
    });
  } catch (error) {
    if (error instanceof EpisodeEditReviewLedgerError) {
      return noStore({ ok: false, error: error.message, errorCode: error.code }, error.status);
    }
    console.error("[capture-take-materialization] failed", error);
    return noStore({ ok: false, error: "Quipsly could not materialize the Capture take." }, 500);
  }
}
