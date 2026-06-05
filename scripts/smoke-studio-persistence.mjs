#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

import { getPrismaClient } from "../apps/quipsly/src/lib/prisma.ts";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const SEED_WORKSPACE = {
  id: "studio-workspace-high-ground-private",
  slug: "high-ground-private",
  name: "High Ground Private Studio",
  description: "Development seed workspace for private Studio authoring.",
  ownerLabel: "local development seed",
};

const SEED_PROJECT = {
  id: "studio-project-learning-to-lead",
  slug: "learning-to-lead",
  name: "Learning to Lead",
  description: "Development seed project for the Studio tagging loop.",
  sourceLabel: "Non-canonical Learning to Lead Studio seed",
};

const SEED_DOCUMENT = {
  id: "studio-document-learning-to-lead-seed",
  stableId: "studio-doc-learning-to-lead-seed",
  title: "Learning to Lead - Studio tagging seed",
  sourceLabel: "Non-canonical fixture based on the Learning to Lead workflow",
  sourcePath:
    "apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx",
};

const SEED_BLOCKS = [
  {
    id: "studio-block-l2l-seed-001",
    stableId: "l2l-seed-001",
    order: 1,
    title: "Leadership starts in the named moment",
    body: "Leadership starts to become visible when a young person can name what is happening, decide what is theirs to carry, and practice the next responsible action.",
    externalId: "seed:l2l:001",
  },
  {
    id: "studio-block-l2l-seed-002",
    stableId: "l2l-seed-002",
    order: 2,
    title: "Stories become structure when the source trail stays attached",
    body: "A story candidate should keep the original wording close enough that later editors can see the source, test the meaning, and decide whether it belongs in a chapter, episode, or exercise.",
    externalId: "seed:l2l:002",
  },
  {
    id: "studio-block-l2l-seed-003",
    stableId: "l2l-seed-003",
    order: 3,
    title: "Projection is an approval path, not a shortcut",
    body: "A public projection should only happen after the private span, tag, node, and review state are clear enough that no rough note accidentally becomes public truth.",
    externalId: "seed:l2l:003",
  },
];

const SEED_TAGS = [
  {
    id: "studio-tag-leadership-principle",
    slug: "leadership-principle",
    label: "leadership-principle",
    description: "Reusable leadership idea that can become teaching structure.",
    category: "meaning",
    nodeType: "principle",
  },
  {
    id: "studio-tag-story-candidate",
    slug: "story-candidate",
    label: "story-candidate",
    description: "Narrative material that may become a chapter or episode story.",
    category: "structure",
    nodeType: "story",
  },
  {
    id: "studio-tag-requires-review",
    slug: "requires-review",
    label: "requires-review",
    description: "Span needs human judgment before projection or citation.",
    category: "review",
    nodeType: "question",
  },
  {
    id: "studio-tag-projection-candidate",
    slug: "projection-candidate",
    label: "projection-candidate",
    description: "Material that may later feed a public projection.",
    category: "projection",
    nodeType: "projection_candidate",
  },
];

const SMOKE_BLOCK_STABLE_ID = "l2l-seed-001";
const SMOKE_TAG_SLUG = "leadership-principle";
const SMOKE_PHRASE = "name what is happening";

function loadDotenvIfNeeded() {
  if (process.env.DATABASE_URL || !existsSync(".env")) {
    return;
  }

  const lines = readFileSync(".env", "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? "";
}

function getDatabaseHost(databaseUrl) {
  if (!databaseUrl) {
    return null;
  }

  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

function assertLocalDatabaseTarget() {
  const databaseUrl = getDatabaseUrl();
  const host = getDatabaseHost(databaseUrl);

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Point it at a disposable local Postgres database before running this smoke test.",
    );
  }

  if (!host || !LOCAL_DATABASE_HOSTS.has(host)) {
    const target = host ? "non-local database host" : "invalid database URL";

    throw new Error(
      `Refusing to run Studio persistence smoke test against ${target}. Use localhost, 127.0.0.1, or ::1.`,
    );
  }
}

async function ensureSeedStudioData(prisma) {
  const workspace = await prisma.studioWorkspace.upsert({
    where: {
      slug: SEED_WORKSPACE.slug,
    },
    update: {
      name: SEED_WORKSPACE.name,
      description: SEED_WORKSPACE.description,
      ownerLabel: SEED_WORKSPACE.ownerLabel,
      isPrivate: true,
    },
    create: {
      ...SEED_WORKSPACE,
      isPrivate: true,
    },
  });

  const project = await prisma.studioProject.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: SEED_PROJECT.slug,
      },
    },
    update: {
      name: SEED_PROJECT.name,
      description: SEED_PROJECT.description,
      sourceLabel: SEED_PROJECT.sourceLabel,
      isPrivate: true,
    },
    create: {
      ...SEED_PROJECT,
      workspaceId: workspace.id,
      isPrivate: true,
    },
  });

  const document = await prisma.studioDocument.upsert({
    where: {
      stableId: SEED_DOCUMENT.stableId,
    },
    update: {
      projectId: project.id,
      title: SEED_DOCUMENT.title,
      sourceLabel: SEED_DOCUMENT.sourceLabel,
      sourcePath: SEED_DOCUMENT.sourcePath,
      projectionStatus: "private",
      isPrivate: true,
    },
    create: {
      ...SEED_DOCUMENT,
      projectId: project.id,
      projectionStatus: "private",
      isPrivate: true,
    },
  });

  for (const block of SEED_BLOCKS) {
    await prisma.studioDocumentBlock.upsert({
      where: {
        documentId_stableId: {
          documentId: document.id,
          stableId: block.stableId,
        },
      },
      update: {
        order: block.order,
        title: block.title,
        body: block.body,
        sourceLabel: "Studio seed fixture",
        sourcePath: SEED_DOCUMENT.sourcePath,
        externalId: block.externalId,
        projectionStatus: "private",
        isPrivate: true,
      },
      create: {
        ...block,
        documentId: document.id,
        sourceLabel: "Studio seed fixture",
        sourcePath: SEED_DOCUMENT.sourcePath,
        projectionStatus: "private",
        isPrivate: true,
      },
    });
  }

  for (const tag of SEED_TAGS) {
    await prisma.studioTag.upsert({
      where: {
        projectId_slug: {
          projectId: project.id,
          slug: tag.slug,
        },
      },
      update: {
        label: tag.label,
        description: tag.description,
        category: tag.category,
        nodeType: tag.nodeType,
        isPrivate: true,
        isActive: true,
      },
      create: {
        ...tag,
        projectId: project.id,
        isPrivate: true,
        isActive: true,
      },
    });
  }

  return { workspace, project, document };
}

async function createOrReuseSmokeRecords(prisma, project, document) {
  const block = await prisma.studioDocumentBlock.findUnique({
    where: {
      documentId_stableId: {
        documentId: document.id,
        stableId: SMOKE_BLOCK_STABLE_ID,
      },
    },
  });

  if (!block) {
    throw new Error(`Seed block ${SMOKE_BLOCK_STABLE_ID} was not found.`);
  }

  const tag = await prisma.studioTag.findUnique({
    where: {
      projectId_slug: {
        projectId: project.id,
        slug: SMOKE_TAG_SLUG,
      },
    },
  });

  if (!tag) {
    throw new Error(`Seed tag ${SMOKE_TAG_SLUG} was not found.`);
  }

  const startOffset = block.body.indexOf(SMOKE_PHRASE);

  if (startOffset < 0) {
    throw new Error(`Smoke phrase "${SMOKE_PHRASE}" was not found.`);
  }

  const endOffset = startOffset + SMOKE_PHRASE.length;
  const selectedText = block.body.slice(startOffset, endOffset);

  const taggedSpan = await prisma.studioTaggedSpan.upsert({
    where: {
      blockId_tagId_startOffset_endOffset: {
        blockId: block.id,
        tagId: tag.id,
        startOffset,
        endOffset,
      },
    },
    update: {
      selectedText,
      documentStableId: document.stableId,
      documentTitleSnapshot: document.title,
      blockStableId: block.stableId,
      blockTitleSnapshot: block.title,
      sourceLabel: block.sourceLabel ?? document.sourceLabel,
      sourcePath: block.sourcePath ?? document.sourcePath,
      sourceExternalId: block.externalId,
      projectionStatus: "private",
      isPrivate: true,
      createdByLabel: "local persistence smoke test",
    },
    create: {
      documentId: document.id,
      blockId: block.id,
      tagId: tag.id,
      startOffset,
      endOffset,
      selectedText,
      documentStableId: document.stableId,
      documentTitleSnapshot: document.title,
      blockStableId: block.stableId,
      blockTitleSnapshot: block.title,
      sourceLabel: block.sourceLabel ?? document.sourceLabel,
      sourcePath: block.sourcePath ?? document.sourcePath,
      sourceExternalId: block.externalId,
      projectionStatus: "private",
      isPrivate: true,
      createdByLabel: "local persistence smoke test",
    },
  });

  const knowledgeNode = await prisma.studioKnowledgeNode.upsert({
    where: {
      taggedSpanId: taggedSpan.id,
    },
    update: {
      tagLabel: tag.label,
      tagCategory: tag.category,
      nodeType: tag.nodeType,
      sourceText: selectedText,
      title: `${tag.label}: ${selectedText}`,
      body: selectedText,
      projectionStatus: "projection_not_approved",
      reviewStatus: "draft",
      isPrivate: true,
      documentStableId: document.stableId,
      documentTitleSnapshot: document.title,
      blockStableId: block.stableId,
      blockTitleSnapshot: block.title,
      spanStartOffset: startOffset,
      spanEndOffset: endOffset,
      sourceLabel: block.sourceLabel ?? document.sourceLabel,
      sourcePath: block.sourcePath ?? document.sourcePath,
      createdByLabel: "local persistence smoke test",
    },
    create: {
      projectId: project.id,
      documentId: document.id,
      blockId: block.id,
      taggedSpanId: taggedSpan.id,
      tagId: tag.id,
      tagLabel: tag.label,
      tagCategory: tag.category,
      nodeType: tag.nodeType,
      sourceText: selectedText,
      title: `${tag.label}: ${selectedText}`,
      body: selectedText,
      projectionStatus: "projection_not_approved",
      reviewStatus: "draft",
      isPrivate: true,
      documentStableId: document.stableId,
      documentTitleSnapshot: document.title,
      blockStableId: block.stableId,
      blockTitleSnapshot: block.title,
      spanStartOffset: startOffset,
      spanEndOffset: endOffset,
      sourceLabel: block.sourceLabel ?? document.sourceLabel,
      sourcePath: block.sourcePath ?? document.sourcePath,
      createdByLabel: "local persistence smoke test",
    },
  });

  return {
    block,
    tag,
    selectedText,
    taggedSpan,
    knowledgeNode,
  };
}

function printReport({ document, block, tag, selectedText, taggedSpan, knowledgeNode }) {
  console.log("Studio persistence smoke test passed.");
  console.log(`document stable ID: ${document.stableId}`);
  console.log(`block stable ID: ${block.stableId}`);
  console.log(`tag label: ${tag.label}`);
  console.log(`selected text: ${selectedText}`);
  console.log(`tagged span ID: ${taggedSpan.id}`);
  console.log(`knowledge node ID: ${knowledgeNode.id}`);
}

function printSchemaHint(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("does not exist") ||
    message.includes("StudioWorkspace") ||
    message.includes("P2021")
  ) {
    console.error(
      "Studio tables are not available. Run `pnpm db:push` only against a confirmed local development database, then rerun this smoke test.",
    );
  }
}

async function main() {
  loadDotenvIfNeeded();
  assertLocalDatabaseTarget();

  const prisma = getPrismaClient();

  try {
    const { project, document } = await ensureSeedStudioData(prisma);
    const records = await createOrReuseSmokeRecords(prisma, project, document);

    printReport({
      document,
      ...records,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Studio persistence smoke test failed.");
  console.error(error instanceof Error ? error.message : error);
  printSchemaHint(error);
  process.exitCode = 1;
});
