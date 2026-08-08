#!/usr/bin/env node

import { createRequire } from "node:module";

import { planGoogleDriveLibraryConform } from "../apps/quipsly/src/lib/server/google-drive-library-conform.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const databaseUrl =
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(parsedDatabase.hostname),
  "Retained Drive library conform operation refuses a non-loopback database.",
);
const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 4 }),
});

try {
  const project = await prisma.studioProject.findFirst({
    where: {
      slug: process.env.QUIPSLY_EXTERNAL_MEDIA_PROJECT || "high-ground-odyssey",
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true },
  });
  assert(project, "The retained Drive library Nest is unavailable.");
  const library = await prisma.studioExternalMediaLibrary.findFirst({
    where: {
      projectId: project.id,
      provider: "google-drive",
      ...(process.env.QUIPSLY_EXTERNAL_MEDIA_LIBRARY_ID
        ? { id: process.env.QUIPSLY_EXTERNAL_MEDIA_LIBRARY_ID }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      connection: { select: { userId: true } },
    },
  });
  assert(library, "The retained Drive library is unavailable.");
  assert(
    library.connection?.userId,
    "The retained Drive library has no connected owner.",
  );
  const plan = await planGoogleDriveLibraryConform({
    prisma,
    projectId: project.id,
    libraryId: library.id,
    actorUserId: library.connection.userId,
  });
  assert(
    plan.schema === "quipsly-google-drive-library-conform-plan-v1",
    "The retained library returned the wrong conform schema.",
  );
  assert(
    plan.summary.segmentCount > 0,
    "The retained library has no attached camera segment to inspect.",
  );
  assert(
    plan.boundaries.inspectionOnly &&
      plan.boundaries.originalsRemainInDrive &&
      plan.boundaries.preparationRequiresOneExplicitSegment &&
      plan.boundaries.providerLocatorsWithheld &&
      plan.boundaries.localPathsWithheld,
    "The retained library conform manifest crossed a source-authority boundary.",
  );
  console.log(
    JSON.stringify(
      {
        schema: "quipsly-retained-google-drive-library-conform-operation-v1",
        project: project.slug,
        library: plan.library.name,
        summary: plan.summary,
        executor: plan.executor,
        days: plan.days.map((day) => ({
          date: day.date,
          segmentCount: day.segmentCount,
          renderReadyCount: day.renderReadyCount,
          heldCount: day.heldCount,
          remainingBytes: day.remainingBytes,
          segmentStatuses: day.segments.map((segment) => ({
            title: segment.title,
            status: segment.status,
            remainingBytes: segment.remainingBytes,
            holdCount: segment.holds.length,
            holds: segment.holds,
          })),
        })),
        boundaries: plan.boundaries,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
