import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  createResearchStudioHandoff,
  RESEARCH_STUDIO_HANDOFF_KIND,
  RESEARCH_STUDIO_HANDOFF_SCHEMA,
} from "../apps/quipsly/src/lib/server/research-studio-handoff.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes("--apply");
const ACTOR_EMAIL = "dev@quipsly.com";
const PROJECT_SLUG = "quipsly-local-dogfood";
const EPISODE_SOURCE_PATHS = [
  "docs/quipsly/episode-4-audio-publication-goal.md",
  "apps/QuipslyStudio/reports/episode-4-charlie-transcript-sanity-summary.md",
];

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertLocalDatabase(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing to dogfood against non-local database host ${url.hostname}.`);
  }
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function main() {
  assertLocalDatabase(DATABASE_URL);
  if (!APPLY) {
    console.log(JSON.stringify({ ready: true, applyRequired: true, localOnly: true, episodeHandoffs: 2 }, null, 2));
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL), log: ["error"] });
  try {
    const actor = await prisma.user.findUniqueOrThrow({ where: { primaryEmail: ACTOR_EMAIL } });
    const project = await prisma.studioProject.findFirstOrThrow({
      where: { slug: PROJECT_SLUG },
      orderBy: { updatedAt: "desc" },
    });
    const annotations = await prisma.studioSourceAnnotation.findMany({
      where: {
        projectId: project.id,
        visibility: "project",
        status: "active",
        sourceUnit: { sourcePath: { in: EPISODE_SOURCE_PATHS } },
      },
      include: {
        sourceUnit: { select: { sourcePath: true, immutableText: true } },
        revisions: { orderBy: { revision: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    });
    if (annotations.length !== EPISODE_SOURCE_PATHS.length) {
      throw new Error(`Expected ${EPISODE_SOURCE_PATHS.length} episode annotations; found ${annotations.length}.`);
    }

    const results = [];
    for (const annotation of annotations) {
      const first = await createResearchStudioHandoff(prisma, {
        annotationId: annotation.id,
        projectId: project.id,
        actorUserId: actor.id,
        actorEmail: ACTOR_EMAIL,
        expectedUpdatedAt: annotation.updatedAt,
      });
      if (!first.ok) throw new Error(`Handoff failed (${first.code}): ${first.message}`);
      const retry = await createResearchStudioHandoff(prisma, {
        annotationId: annotation.id,
        projectId: project.id,
        actorUserId: actor.id,
        actorEmail: ACTOR_EMAIL,
        expectedUpdatedAt: annotation.updatedAt,
      });
      if (!retry.ok || retry.packetId !== first.packetId || !retry.reused) {
        throw new Error(`Handoff retry did not reuse ${first.packetId}.`);
      }

      const packet = await prisma.studioOutputPacket.findUniqueOrThrow({ where: { id: first.packetId } });
      const payload = objectValue(packet.packetJson);
      const source = objectValue(payload.source);
      const pinned = objectValue(payload.annotation);
      const writing = objectValue(payload.writing);
      const safety = objectValue(payload.safety);
      const sourceText = annotation.sourceUnit.immutableText ?? "";
      const verified = Boolean(
        packet.kind === RESEARCH_STUDIO_HANDOFF_KIND
        && packet.status === "ready-for-studio"
        && payload.schema === RESEARCH_STUDIO_HANDOFF_SCHEMA
        && source.contentSha256 === sha256(sourceText)
        && source.immutable === true
        && pinned.id === annotation.id
        && pinned.revision === annotation.revisions.at(-1)?.revision
        && pinned.exactText === annotation.exactText
        && safety.sourceMutated === false
        && safety.mediaMutated === false
        && safety.privateWritingDisclosed === false
        && safety.publishAuthorized === false
        && writing.privateUseCount === 1
        && Array.isArray(writing.publicUses)
        && writing.publicUses.length === 0
      );
      if (!verified) throw new Error(`Persisted Studio readback failed for ${annotation.id}.`);

      results.push({
        sourcePath: annotation.sourceUnit.sourcePath,
        annotationId: annotation.id,
        annotationRevision: first.revision,
        packetId: first.packetId,
        packetSlug: first.packetSlug,
        sourceFingerprint: source.contentSha256,
        privateWritingUseCount: writing.privateUseCount,
        privateWritingDisclosed: false,
        sourceMutated: false,
        mediaMutated: false,
        publishAuthorized: false,
        persistedReadback: true,
        retryReused: true,
      });
    }

    const packetCount = await prisma.studioOutputPacket.count({
      where: { projectId: project.id, kind: RESEARCH_STUDIO_HANDOFF_KIND },
    });
    if (packetCount !== results.length) {
      throw new Error(`Expected ${results.length} canonical handoff packets; found ${packetCount}.`);
    }

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      projectSlug: PROJECT_SLUG,
      packetCount,
      handoffs: results,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
