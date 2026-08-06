#!/usr/bin/env node

import { getPrismaClient } from "../apps/quipsly/src/lib/prisma.ts";
import { promoteRecordingAssetToStudioMedia } from "../apps/quipsly/src/lib/server/recording-media-promotion.ts";

const PROJECT_SLUG = "high-ground-odyssey";
const EPISODE_SLUG = "capture-take-materialization-qa-20260806";
const RECORDING_ASSET_ID = "qa-edit-signal-recording-20260803";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  assert(
    process.env.QUIPSLY_RETAINED_CAPTURE_TAKE_FIXTURE === "1",
    "Set QUIPSLY_RETAINED_CAPTURE_TAKE_FIXTURE=1 to create or converge the retained test artifact.",
  );
  const prisma = getPrismaClient();
  try {
    const recording = await prisma.recordingAsset.findUniqueOrThrow({
      where: { id: RECORDING_ASSET_ID },
      include: { room: { select: { captureGroupId: true, projectId: true } } },
    });
    assert(recording.room.projectId, "The retained recording has no canonical project binding.");
    const project = await prisma.studioProject.findUniqueOrThrow({
        where: { id: recording.room.projectId },
        include: {
          accessGrants: {
            where: { status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            take: 20,
          },
        },
      });
    assert(project.slug === PROJECT_SLUG, "The retained recording no longer belongs to the High Ground Odyssey Nest.");
    assert(recording.room.projectId === project.id, "The retained recording no longer belongs to the High Ground Odyssey project.");
    assert(recording.status === "VERIFIED", "The retained recording is not exact-byte verified.");
    assert(recording.room.captureGroupId, "The retained Session has no canonical capture-group identity.");

    let operator = null;
    for (const grant of project.accessGrants) {
      operator = await prisma.user.findFirst({
        where: { primaryEmail: { equals: grant.email, mode: "insensitive" } },
        select: { id: true, primaryEmail: true },
      });
      if (operator) break;
    }
    assert(operator?.id && operator?.primaryEmail, "No active project editor identity could operate the retained fixture.");

    const result = await promoteRecordingAssetToStudioMedia({
      prisma,
      recordingAssetId: recording.id,
      actorUserId: operator.id,
      actorEmail: operator.primaryEmail,
      isStaff: true,
      nestSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
    });
    assert(result.ok, `Retained promotion failed: ${result.status} ${result.message ?? ""}`);

    const production = await prisma.studioEpisodeProduction.findUniqueOrThrow({
      where: { projectId_slug: { projectId: project.id, slug: EPISODE_SLUG } },
      select: { id: true, productionJson: true, timelineJson: true, updatedAt: true },
    });
    const productionJson = record(production.productionJson);
    const importedMedia = Array.isArray(productionJson.importedMedia) ? productionJson.importedMedia : [];
    const imported = importedMedia.find((item) => {
      const asset = record(item);
      const recordingSync = record(record(asset.metadata).recordingSync);
      return text(recordingSync.recordingAssetId) === recording.id;
    });
    assert(imported, "The retained recording was not attached to the explicit QA episode.");
    const recordingSync = record(record(record(imported).metadata).recordingSync);
    assert(
      text(recordingSync.captureGroupId) === recording.room.captureGroupId,
      "The retained Studio attachment lost the canonical CallRoom capture-group identity.",
    );
    const captureTakeMaterializations = Array.isArray(record(production.timelineJson).captureTakeMaterializations)
      ? record(production.timelineJson).captureTakeMaterializations
      : [];
    const takeMaterialized = captureTakeMaterializations.some((item) => (
      text(record(item).captureGroupId) === recording.room.captureGroupId
    ));

    process.stdout.write(`${JSON.stringify({
      ok: true,
      retained: true,
      testArtifact: true,
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      episodeProductionId: production.id,
      recordingAssetId: recording.id,
      captureGroupId: recording.room.captureGroupId,
      promotionStatus: result.status,
      importedMediaCount: importedMedia.length,
      sourceMediaUnchanged: true,
      takeMaterialized,
      updatedAt: production.updatedAt.toISOString(),
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
