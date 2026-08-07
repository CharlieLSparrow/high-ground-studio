#!/usr/bin/env node

import { createRequire } from "node:module";

import { buildPortableNestExport } from "../apps/quipsly/src/lib/server/nest-portable-export.ts";
import { validateNestBundle } from "../apps/quipsly/src/lib/nest-portability.ts";

const PROJECT_SLUG = "high-ground-odyssey-manuscript";
const ACTOR_USER_ID = "cmrxlfx7y0006nlxl2tdgysjh";
const CARD_ID = "0241e22a-ed33-44b0-aef2-ffcde24c12fd";
const SOURCE_SET_ID = "cmsjgd5k60006zkxlnzdm3h2e";
const BOARD_ID = "52996a24-e0ba-4ad7-be07-7e9a481168fc";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopbackDatabase(value) {
  const url = new URL(String(value || ""));
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Retained Episode 5 portability operation refuses a non-loopback database.",
  );
  return url.toString();
}

const databaseUrl = requireLoopbackDatabase(
  process.env.QUIPSLY_LOCAL_DATABASE_URL || process.env.DATABASE_URL,
);
const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }),
});

try {
  const [project, actor] = await Promise.all([
    prisma.studioProject.findFirst({
      where: { slug: PROJECT_SLUG },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: ACTOR_USER_ID },
      select: { id: true, primaryEmail: true },
    }),
  ]);
  assert(project, `Retained Nest ${PROJECT_SLUG} is unavailable.`);
  assert(actor, `Retained actor ${ACTOR_USER_ID} is unavailable.`);

  const bundle = await buildPortableNestExport(prisma, {
    projectId: project.id,
    actorUserId: actor.id,
  });
  const validation = validateNestBundle(bundle);
  assert(validation.ok, validation.ok ? "" : validation.error);

  const card = validation.bundle.sourceStory.cards.find(
    (candidate) => candidate.id === CARD_ID,
  );
  const sourceSet = validation.bundle.sourceStory.sourceSets.find(
    (candidate) => candidate.id === SOURCE_SET_ID,
  );
  const board = validation.bundle.sourceStory.boards.find(
    (candidate) => candidate.id === BOARD_ID,
  );
  assert(card, `Episode 5 source card ${CARD_ID} was not exported.`);
  assert(sourceSet, `Episode 5 source set ${SOURCE_SET_ID} was not exported.`);
  assert(board, `Episode 5 board ${BOARD_ID} was not exported.`);
  assert(
    card.sourceRangeId &&
      validation.bundle.sourceStory.sourceRanges.some(
        (range) => range.id === card.sourceRangeId,
      ),
    "Episode 5 source card lost its exact source range.",
  );
  assert(
    board.sections.some(
      (section) =>
        section.documentId &&
        validation.bundle.notes.some(
          (document) => document.id === section.documentId,
        ),
    ),
    "Episode 5 board lost its linked writing document.",
  );
  assert(
    validation.bundle.boundaries.mediaBytesIncluded === false &&
      validation.bundle.boundaries.providerCredentialsIncluded === false &&
      validation.bundle.boundaries.providerLocatorsIncluded === false &&
      validation.bundle.boundaries.restoredSourceReferencesAvailable === false,
    "The retained package crossed a media or provider-authority boundary.",
  );

  console.log(
    JSON.stringify(
      {
        schema: "quipsly-retained-episode5-nest-portability-operation-v1",
        sourceNest: project.slug,
        actor: actor.primaryEmail,
        manifestSha256: validation.bundle.manifestSha256,
        counts: {
          tags: validation.bundle.tags.length,
          documents: validation.bundle.notes.length,
          tasks: validation.bundle.tasks.length,
          goals: validation.bundle.goals.length,
          sourceRevisions:
            validation.bundle.sourceStory.sourceRevisions.length,
          sourceSets: validation.bundle.sourceStory.sourceSets.length,
          sourceRanges: validation.bundle.sourceStory.sourceRanges.length,
          storyCards: validation.bundle.sourceStory.cards.length,
          storyBoards: validation.bundle.sourceStory.boards.length,
        },
        retainedEpisode5: {
          cardId: card.id,
          sourceRangeId: card.sourceRangeId,
          sourceSetId: sourceSet.id,
          boardId: board.id,
          linkedWritingSections: board.sections.filter(
            (section) => section.documentId,
          ).length,
        },
        boundaries: {
          mediaBytesIncluded: false,
          providerCredentialsIncluded: false,
          providerLocatorsIncluded: false,
          restoredSourceReferencesAvailable: false,
          externalSideEffects: false,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
