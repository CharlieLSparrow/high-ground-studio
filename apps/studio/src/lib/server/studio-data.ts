import type {
  KnowledgeNode,
  ProjectionStatus,
  StudioBlock,
  StudioDocument,
  StudioTag,
  StudioTagApplication,
} from "@high-ground/studio-domain";
import {
  createKnowledgeNodeFromTaggedSpan,
  createSpanSnapshot,
  createTagApplication,
} from "@high-ground/studio-domain";

import { getPrismaClient } from "@/lib/prisma";

const SEED_CREATED_AT = "2026-05-16T00:00:00.000Z";
const STUDIO_ROUTE = "/";

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
] as const;

export type StudioPersistenceState = {
  mode: "database" | "fallback";
  canWrite: boolean;
  message: string;
};

export type StudioWorkbenchData = {
  document: StudioDocument;
  tags: StudioTag[];
  tagApplications: StudioTagApplication[];
  knowledgeNodes: KnowledgeNode[];
  persistence: StudioPersistenceState;
};

export type CreateTaggedSpanInput = {
  documentStableId: string;
  blockStableId: string;
  tagId: string;
  startOffset: number;
  endOffset: number;
};

export type StudioWriteActor = {
  actorLabel: string;
};

export type StudioActionResult = {
  ok: boolean;
  message: string;
};

type StudioPrisma = ReturnType<typeof getPrismaClient>;

type BlockWithDocument = {
  id: string;
  stableId: string;
  order: number;
  title: string | null;
  body: string;
  sourceLabel: string | null;
  sourcePath: string | null;
  externalId: string | null;
  projectionStatus: string;
  document: {
    id: string;
    stableId: string;
    title: string;
    sourceLabel: string | null;
    sourcePath: string | null;
    projectionStatus: string;
    projectId: string;
  };
};

type TagRecord = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  category: string;
  nodeType: string;
};

type TaggedSpanRecord = {
  id: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  documentStableId: string;
  documentTitleSnapshot: string;
  blockStableId: string;
  blockTitleSnapshot: string | null;
  sourceLabel: string | null;
  sourcePath: string | null;
  projectionStatus: string;
  createdByLabel: string | null;
  createdAt: Date;
  tag: TagRecord;
};

type KnowledgeNodeRecord = {
  id: string;
  title: string;
  body: string;
  nodeType: string;
  sourceText: string;
  tagId: string;
  tagLabel: string;
  projectionStatus: string;
  documentStableId: string;
  documentTitleSnapshot: string;
  blockStableId: string;
  blockTitleSnapshot: string | null;
  spanStartOffset: number;
  spanEndOffset: number;
  sourceLabel: string | null;
  sourcePath: string | null;
  createdAt: Date;
  updatedAt: Date;
  taggedSpanId: string;
  tag: TagRecord;
};

function isProjectionStatus(value: string): value is ProjectionStatus {
  return [
    "private",
    "draft",
    "review",
    "approved",
    "published",
    "not_public",
    "projection_not_approved",
  ].includes(value);
}

function toProjectionStatus(value: string): ProjectionStatus {
  return isProjectionStatus(value) ? value : "private";
}

function toTagCategory(value: string): StudioTag["category"] {
  return ["meaning", "structure", "source", "projection", "review"].includes(
    value,
  )
    ? (value as StudioTag["category"])
    : "meaning";
}

function toNodeType(value: string): StudioTag["nodeType"] {
  return [
    "principle",
    "story",
    "quote",
    "question",
    "projection_candidate",
    "source_note",
  ].includes(value)
    ? (value as StudioTag["nodeType"])
    : "source_note";
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? "";
}

function getDatabaseHost() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

function isLocalDatabaseTarget() {
  const host = getDatabaseHost();

  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function canWriteStudioDevData() {
  return process.env.NODE_ENV !== "production" && isLocalDatabaseTarget();
}

function mapTag(tag: TagRecord): StudioTag {
  return {
    id: tag.id,
    label: tag.label,
    description: tag.description ?? undefined,
    category: toTagCategory(tag.category),
    nodeType: toNodeType(tag.nodeType),
  };
}

function mapBlock(block: BlockWithDocument): StudioBlock {
  return {
    id: block.stableId,
    documentId: block.document.stableId,
    order: block.order,
    title: block.title ?? undefined,
    body: block.body,
    sourceLabel: block.sourceLabel ?? block.document.sourceLabel ?? undefined,
    sourcePath: block.sourcePath ?? block.document.sourcePath ?? undefined,
    externalId: block.externalId ?? undefined,
    projectionStatus: toProjectionStatus(block.projectionStatus),
  };
}

function mapTaggedSpan(span: TaggedSpanRecord): StudioTagApplication {
  const tag = mapTag(span.tag);
  const createdAt = span.createdAt.toISOString();

  return {
    id: span.id,
    documentId: span.documentStableId,
    blockId: span.blockStableId,
    span: {
      id: span.id,
      documentId: span.documentStableId,
      blockId: span.blockStableId,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      text: span.selectedText,
    },
    tag,
    provenance: {
      documentId: span.documentStableId,
      documentTitle: span.documentTitleSnapshot,
      blockId: span.blockStableId,
      blockTitle: span.blockTitleSnapshot ?? undefined,
      sourceLabel: span.sourceLabel ?? undefined,
      sourcePath: span.sourcePath ?? undefined,
      spanStartOffset: span.startOffset,
      spanEndOffset: span.endOffset,
      selectedText: span.selectedText,
      tagId: tag.id,
      tagLabel: tag.label,
      createdAt,
    },
    projectionStatus: toProjectionStatus(span.projectionStatus),
    createdAt,
    createdByLabel: span.createdByLabel ?? undefined,
  };
}

function mapKnowledgeNode(node: KnowledgeNodeRecord): KnowledgeNode {
  const createdAt = node.createdAt.toISOString();

  return {
    id: node.id,
    title: node.title,
    body: node.body,
    nodeType: toNodeType(node.nodeType) ?? "source_note",
    sourceTagApplicationId: node.taggedSpanId,
    sourceText: node.sourceText,
    tagId: node.tagId,
    tagLabel: node.tagLabel,
    projectionStatus: toProjectionStatus(node.projectionStatus),
    provenance: {
      documentId: node.documentStableId,
      documentTitle: node.documentTitleSnapshot,
      blockId: node.blockStableId,
      blockTitle: node.blockTitleSnapshot ?? undefined,
      sourceLabel: node.sourceLabel ?? undefined,
      sourcePath: node.sourcePath ?? undefined,
      spanStartOffset: node.spanStartOffset,
      spanEndOffset: node.spanEndOffset,
      selectedText: node.sourceText,
      tagId: node.tagId,
      tagLabel: node.tagLabel,
      createdAt,
    },
    createdAt,
    updatedAt: node.updatedAt.toISOString(),
  };
}

function getFallbackDocument(): StudioDocument {
  return {
    id: SEED_DOCUMENT.stableId,
    title: SEED_DOCUMENT.title,
    sourceLabel: SEED_DOCUMENT.sourceLabel,
    sourcePath: SEED_DOCUMENT.sourcePath,
    workspaceId: SEED_WORKSPACE.slug,
    projectId: SEED_PROJECT.slug,
    projectionStatus: "private",
    blocks: SEED_BLOCKS.map((block) => ({
      id: block.stableId,
      documentId: SEED_DOCUMENT.stableId,
      order: block.order,
      title: block.title,
      body: block.body,
      sourceLabel: "Studio seed fixture",
      sourcePath: SEED_DOCUMENT.sourcePath,
      externalId: block.externalId,
      projectionStatus: "private",
    })),
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  };
}

function getFallbackTags(): StudioTag[] {
  return SEED_TAGS.map((tag) => ({
    id: tag.id,
    label: tag.label,
    description: tag.description,
    category: tag.category,
    nodeType: tag.nodeType,
  }));
}

function fallbackData(message: string): StudioWorkbenchData {
  return {
    document: getFallbackDocument(),
    tags: getFallbackTags(),
    tagApplications: [],
    knowledgeNodes: [],
    persistence: {
      mode: "fallback",
      canWrite: false,
      message,
    },
  };
}

export function getStudioRoute() {
  return STUDIO_ROUTE;
}

export async function ensureSeedStudioData(prisma: StudioPrisma) {
  if (!canWriteStudioDevData()) {
    return { seeded: false };
  }

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

  await Promise.all(
    SEED_BLOCKS.map((block) =>
      prisma.studioDocumentBlock.upsert({
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
      }),
    ),
  );

  await Promise.all(
    SEED_TAGS.map((tag) =>
      prisma.studioTag.upsert({
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
      }),
    ),
  );

  return { seeded: true };
}

export async function listStudioDocumentBlocks(documentStableId: string) {
  const prisma = getPrismaClient();

  const blocks = await prisma.studioDocumentBlock.findMany({
    where: {
      document: {
        stableId: documentStableId,
      },
    },
    include: {
      document: true,
    },
    orderBy: {
      order: "asc",
    },
  });

  return blocks.map(mapBlock);
}

export async function listStudioTags(projectSlug: string) {
  const prisma = getPrismaClient();

  const tags = await prisma.studioTag.findMany({
    where: {
      project: {
        slug: projectSlug,
      },
      isActive: true,
    },
    orderBy: {
      label: "asc",
    },
  });

  return tags.map(mapTag);
}

export async function listStudioTaggedSpans(documentStableId: string) {
  const prisma = getPrismaClient();

  const spans = await prisma.studioTaggedSpan.findMany({
    where: {
      documentStableId,
    },
    include: {
      tag: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return spans.map(mapTaggedSpan);
}

export async function listStudioKnowledgeNodes(documentStableId: string) {
  const prisma = getPrismaClient();

  const nodes = await prisma.studioKnowledgeNode.findMany({
    where: {
      documentStableId,
    },
    include: {
      tag: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return nodes.map(mapKnowledgeNode);
}

export async function loadStudioWorkbenchData(): Promise<StudioWorkbenchData> {
  if (!getDatabaseUrl()) {
    return fallbackData(
      "DATABASE_URL is not set, so Studio is showing the dev fixture without persistence.",
    );
  }

  let prisma: StudioPrisma;

  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.error("Studio Prisma client initialization failed.", error);
    return fallbackData(
      "Studio could not initialize Prisma, so writes are disabled.",
    );
  }

  try {
    await ensureSeedStudioData(prisma);

    const document = await prisma.studioDocument.findUnique({
      where: {
        stableId: SEED_DOCUMENT.stableId,
      },
      include: {
        blocks: {
          orderBy: {
            order: "asc",
          },
        },
        project: {
          include: {
            tags: {
              where: {
                isActive: true,
              },
              orderBy: {
                label: "asc",
              },
            },
          },
        },
      },
    });

    if (!document) {
      return fallbackData(
        "Studio persistence is reachable, but the dev seed document is not present.",
      );
    }

    if (document.blocks.length === 0 || document.project.tags.length === 0) {
      return fallbackData(
        "Studio persistence is reachable, but the seed blocks or tags are missing.",
      );
    }

    const [taggedSpans, knowledgeNodes] = await Promise.all([
      prisma.studioTaggedSpan.findMany({
        where: {
          documentId: document.id,
        },
        include: {
          tag: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.studioKnowledgeNode.findMany({
        where: {
          documentId: document.id,
        },
        include: {
          tag: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    return {
      document: {
        id: document.stableId,
        title: document.title,
        sourceLabel: document.sourceLabel ?? undefined,
        sourcePath: document.sourcePath ?? undefined,
        workspaceId: SEED_WORKSPACE.slug,
        projectId: document.project.slug,
        projectionStatus: toProjectionStatus(document.projectionStatus),
        blocks: document.blocks.map((block) =>
          mapBlock({
            ...block,
            document,
          }),
        ),
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      },
      tags: document.project.tags.map(mapTag),
      tagApplications: taggedSpans.map(mapTaggedSpan),
      knowledgeNodes: knowledgeNodes.map(mapKnowledgeNode),
      persistence: {
        mode: "database",
        canWrite: canWriteStudioDevData(),
        message: canWriteStudioDevData()
          ? "Loaded from local development database."
          : "Loaded from database with writes disabled because the target does not look local.",
      },
    };
  } catch (error) {
    console.error("Studio persistence load failed.", error);
    return fallbackData(
      "Studio persistence is not ready; run schema sync against a safe local database before using durable tagging.",
    );
  }
}

export async function createStudioTaggedSpanWithNode(
  input: CreateTaggedSpanInput,
  actor: StudioWriteActor,
): Promise<StudioActionResult> {
  if (!canWriteStudioDevData()) {
    return {
      ok: false,
      message:
        "Studio writes are disabled unless DATABASE_URL points at a local development database.",
    };
  }

  const prisma = getPrismaClient();
  const createdByLabel = actor.actorLabel.trim() || "signed-in Studio user";

  try {
    await ensureSeedStudioData(prisma);

    await prisma.$transaction(async (tx) => {
      const document = await tx.studioDocument.findUnique({
        where: {
          stableId: input.documentStableId,
        },
      });

      if (!document) {
        throw new Error("Studio document not found.");
      }

      const block = await tx.studioDocumentBlock.findUnique({
        where: {
          documentId_stableId: {
            documentId: document.id,
            stableId: input.blockStableId,
          },
        },
      });

      if (!block) {
        throw new Error("Studio document block not found.");
      }

      const tag = await tx.studioTag.findUnique({
        where: {
          id: input.tagId,
        },
      });

      if (!tag || tag.projectId !== document.projectId || !tag.isActive) {
        throw new Error("Studio tag not found.");
      }

      const span = createSpanSnapshot({
        documentId: document.stableId,
        block: {
          id: block.stableId,
          body: block.body,
        },
        startOffset: input.startOffset,
        endOffset: input.endOffset,
      });

      const createdAt = new Date();
      const createdAtText = createdAt.toISOString();
      const domainTag = mapTag(tag);
      const application = createTagApplication({
        id: "pending",
        document: {
          id: document.stableId,
          title: document.title,
          sourceLabel: document.sourceLabel ?? undefined,
          sourcePath: document.sourcePath ?? undefined,
        },
        block: {
          id: block.stableId,
          title: block.title ?? undefined,
          sourceLabel: block.sourceLabel ?? undefined,
          sourcePath: block.sourcePath ?? undefined,
        },
        span,
        tag: domainTag,
        createdAt: createdAtText,
        createdByLabel,
        projectionStatus: "private",
      });
      const node = createKnowledgeNodeFromTaggedSpan({
        id: "pending",
        application,
        createdAt: createdAtText,
        projectionStatus: "projection_not_approved",
      });

      const taggedSpan =
        (await tx.studioTaggedSpan.findUnique({
          where: {
            blockId_tagId_startOffset_endOffset: {
              blockId: block.id,
              tagId: tag.id,
              startOffset: input.startOffset,
              endOffset: input.endOffset,
            },
          },
        })) ??
        (await tx.studioTaggedSpan.create({
          data: {
            documentId: document.id,
            blockId: block.id,
            tagId: tag.id,
            startOffset: input.startOffset,
            endOffset: input.endOffset,
            selectedText: span.text,
            documentStableId: document.stableId,
            documentTitleSnapshot: document.title,
            blockStableId: block.stableId,
            blockTitleSnapshot: block.title,
            sourceLabel: block.sourceLabel ?? document.sourceLabel,
            sourcePath: block.sourcePath ?? document.sourcePath,
            sourceExternalId: block.externalId,
            projectionStatus: "private",
            isPrivate: true,
            createdByLabel,
            createdAt,
          },
        }));

      await tx.studioKnowledgeNode.upsert({
        where: {
          taggedSpanId: taggedSpan.id,
        },
        update: {},
        create: {
          projectId: document.projectId,
          documentId: document.id,
          blockId: block.id,
          taggedSpanId: taggedSpan.id,
          tagId: tag.id,
          tagLabel: tag.label,
          tagCategory: tag.category,
          nodeType: tag.nodeType,
          sourceText: span.text,
          title: node.title,
          body: node.body,
          projectionStatus: "projection_not_approved",
          reviewStatus: "draft",
          isPrivate: true,
          documentStableId: document.stableId,
          documentTitleSnapshot: document.title,
          blockStableId: block.stableId,
          blockTitleSnapshot: block.title,
          spanStartOffset: input.startOffset,
          spanEndOffset: input.endOffset,
          sourceLabel: block.sourceLabel ?? document.sourceLabel,
          sourcePath: block.sourcePath ?? document.sourcePath,
          createdByLabel,
          createdAt,
        },
      });
    });

    return {
      ok: true,
      message: "Tagged span and knowledge node persisted.",
    };
  } catch (error) {
    console.error("Studio tag persistence failed.", error);

    return {
      ok: false,
      message:
        error instanceof RangeError
          ? error.message
          : "Studio could not persist that tag application.",
    };
  }
}
