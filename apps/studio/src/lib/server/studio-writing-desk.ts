import type { ProjectionStatus } from "@high-ground/studio-domain";

import { getPrismaClient } from "@/lib/prisma";
import {
  canWriteStudioDevData,
  getStudioDatabaseHost,
  getStudioDatabaseUrl,
} from "@/lib/server/studio-persistence-guard";

const WRITING_DESK_ROUTE = "/write";

const WRITING_WORKSPACE = {
  id: "studio-workspace-high-ground-private",
  slug: "high-ground-private",
  name: "High Ground Private Studio",
  description: "Development seed workspace for private Studio authoring.",
  ownerLabel: "local development seed",
};

const WRITING_PROJECT = {
  id: "studio-project-learning-to-lead",
  slug: "learning-to-lead",
  name: "Learning to Lead",
  description: "Development seed project for the Studio writing desk.",
  sourceLabel: "Studio writing desk draft fixture",
};

const WRITING_DOCUMENT = {
  id: "studio-document-learning-to-lead-writing-desk-draft",
  stableId: "studio-doc-learning-to-lead-writing-desk-draft",
  title: "Learning to Lead - Studio writing desk draft",
  sourceLabel: "Studio writing desk draft fixture - private draft material",
  sourcePath: null,
};

const WRITING_BLOCKS = [
  {
    id: "studio-block-l2l-writing-draft-001",
    stableId: "l2l-writing-draft-001",
    order: 1,
    title: "Chapter working block",
    body: "Start a private Learning to Lead draft here. This is Studio draft material, not canonical manuscript text.",
    externalId: "draft:l2l:writing:001",
  },
  {
    id: "studio-block-l2l-writing-draft-002",
    stableId: "l2l-writing-draft-002",
    order: 2,
    title: "Story and scene notes",
    body: "Use this block to sketch story movement, examples, and connective tissue before anything is promoted into a manuscript workflow.",
    externalId: "draft:l2l:writing:002",
  },
  {
    id: "studio-block-l2l-writing-draft-003",
    stableId: "l2l-writing-draft-003",
    order: 3,
    title: "Open questions",
    body: "Track unresolved book questions, chapter tensions, source needs, and review notes here.",
    externalId: "draft:l2l:writing:003",
  },
] as const;

const WRITING_BLOCK_STABLE_IDS = new Set<string>(
  WRITING_BLOCKS.map((block) => block.stableId),
);

type StudioWritingPrisma = ReturnType<typeof getPrismaClient>;

type WritingDocumentRecord = {
  id: string;
  stableId: string;
  title: string;
  sourceLabel: string | null;
  sourcePath: string | null;
  projectionStatus: string;
  createdAt: Date;
  updatedAt: Date;
  blocks: Array<{
    stableId: string;
    order: number;
    title: string | null;
    body: string;
    sourceLabel: string | null;
    sourcePath: string | null;
    externalId: string | null;
    projectionStatus: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export type StudioWritingDeskPersistenceState = {
  mode: "database" | "fallback";
  canWrite: boolean;
  message: string;
};

export type StudioWritingDeskBlock = {
  id: string;
  order: number;
  title: string;
  body: string;
  sourceLabel?: string;
  sourcePath?: string;
  externalId?: string;
  projectionStatus: ProjectionStatus;
  createdAt: string;
  updatedAt: string;
};

export type StudioWritingDeskDocument = {
  id: string;
  title: string;
  sourceLabel: string;
  sourcePath?: string;
  projectionStatus: ProjectionStatus;
  createdAt: string;
  updatedAt: string;
  blocks: StudioWritingDeskBlock[];
};

export type StudioWritingDeskData = {
  document: StudioWritingDeskDocument;
  persistence: StudioWritingDeskPersistenceState;
};

export type UpdateWritingDeskBlockInput = {
  documentStableId: string;
  blockStableId: string;
  title: string;
  body: string;
};

export type StudioWritingDeskActionResult = {
  ok: boolean;
  message: string;
  blockStableId?: string;
  savedAt?: string;
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

function mapDocument(document: WritingDocumentRecord): StudioWritingDeskDocument {
  return {
    id: document.stableId,
    title: document.title,
    sourceLabel: document.sourceLabel ?? WRITING_DOCUMENT.sourceLabel,
    sourcePath: document.sourcePath ?? undefined,
    projectionStatus: toProjectionStatus(document.projectionStatus),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    blocks: document.blocks.map((block) => ({
      id: block.stableId,
      order: block.order,
      title: block.title ?? "Untitled draft block",
      body: block.body,
      sourceLabel: block.sourceLabel ?? undefined,
      sourcePath: block.sourcePath ?? undefined,
      externalId: block.externalId ?? undefined,
      projectionStatus: toProjectionStatus(block.projectionStatus),
      createdAt: block.createdAt.toISOString(),
      updatedAt: block.updatedAt.toISOString(),
    })),
  };
}

function fallbackData(message: string): StudioWritingDeskData {
  const createdAt = "2026-05-18T00:00:00.000Z";

  return {
    document: {
      id: WRITING_DOCUMENT.stableId,
      title: WRITING_DOCUMENT.title,
      sourceLabel: WRITING_DOCUMENT.sourceLabel,
      projectionStatus: "draft",
      createdAt,
      updatedAt: createdAt,
      blocks: WRITING_BLOCKS.map((block) => ({
        id: block.stableId,
        order: block.order,
        title: block.title,
        body: block.body,
        sourceLabel: WRITING_DOCUMENT.sourceLabel,
        externalId: block.externalId,
        projectionStatus: "draft",
        createdAt,
        updatedAt: createdAt,
      })),
    },
    persistence: {
      mode: "fallback",
      canWrite: false,
      message,
    },
  };
}

function normalizeTitle(value: string) {
  return value.trim().slice(0, 160);
}

function normalizeBody(value: string) {
  return value.slice(0, 30000);
}

async function ensureWritingDeskDraftData(prisma: StudioWritingPrisma) {
  const workspace = await prisma.studioWorkspace.upsert({
    where: {
      slug: WRITING_WORKSPACE.slug,
    },
    update: {
      name: WRITING_WORKSPACE.name,
      description: WRITING_WORKSPACE.description,
      ownerLabel: WRITING_WORKSPACE.ownerLabel,
      isPrivate: true,
    },
    create: {
      ...WRITING_WORKSPACE,
      isPrivate: true,
    },
  });

  const project = await prisma.studioProject.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: WRITING_PROJECT.slug,
      },
    },
    update: {
      name: WRITING_PROJECT.name,
      isPrivate: true,
    },
    create: {
      ...WRITING_PROJECT,
      workspaceId: workspace.id,
      isPrivate: true,
    },
  });

  const document = await prisma.studioDocument.upsert({
    where: {
      stableId: WRITING_DOCUMENT.stableId,
    },
    update: {
      projectId: project.id,
      title: WRITING_DOCUMENT.title,
      sourceLabel: WRITING_DOCUMENT.sourceLabel,
      sourcePath: WRITING_DOCUMENT.sourcePath,
      projectionStatus: "draft",
      isPrivate: true,
    },
    create: {
      ...WRITING_DOCUMENT,
      projectId: project.id,
      projectionStatus: "draft",
      isPrivate: true,
    },
  });

  await Promise.all(
    WRITING_BLOCKS.map((block) =>
      prisma.studioDocumentBlock.upsert({
        where: {
          documentId_stableId: {
            documentId: document.id,
            stableId: block.stableId,
          },
        },
        update: {
          order: block.order,
          sourceLabel: WRITING_DOCUMENT.sourceLabel,
          sourcePath: WRITING_DOCUMENT.sourcePath,
          externalId: block.externalId,
          projectionStatus: "draft",
          isPrivate: true,
        },
        create: {
          ...block,
          documentId: document.id,
          sourceLabel: WRITING_DOCUMENT.sourceLabel,
          sourcePath: WRITING_DOCUMENT.sourcePath,
          projectionStatus: "draft",
          isPrivate: true,
        },
      }),
    ),
  );
}

export function getStudioWritingDeskRoute() {
  return WRITING_DESK_ROUTE;
}

export async function loadStudioWritingDeskData(): Promise<StudioWritingDeskData> {
  if (!getStudioDatabaseUrl()) {
    return fallbackData(
      "DATABASE_URL is not set, so the writing desk is showing a read-only draft fixture.",
    );
  }

  if (!canWriteStudioDevData()) {
    const host = getStudioDatabaseHost();

    return fallbackData(
      host
        ? `DATABASE_URL points at ${host}, so writing desk database writes are disabled. Use a local database to persist draft blocks.`
        : "DATABASE_URL is not a valid local database URL, so the writing desk is read-only.",
    );
  }

  let prisma: StudioWritingPrisma;

  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.error("Studio writing desk Prisma client initialization failed.", error);
    return fallbackData(
      "The writing desk could not initialize Prisma, so the draft fixture is read-only.",
    );
  }

  try {
    await ensureWritingDeskDraftData(prisma);

    const document = await prisma.studioDocument.findUnique({
      where: {
        stableId: WRITING_DOCUMENT.stableId,
      },
      include: {
        blocks: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!document || document.blocks.length === 0) {
      return fallbackData(
        "The local database is reachable, but the writing desk draft is missing.",
      );
    }

    return {
      document: mapDocument(document),
      persistence: {
        mode: "database",
        canWrite: true,
        message:
          "Loaded from local Studio persistence. Saves update private draft block rows only.",
      },
    };
  } catch (error) {
    console.error("Studio writing desk load failed.", error);
    return fallbackData(
      "The writing desk local draft could not be loaded. Sync the schema against a safe local database before saving.",
    );
  }
}

export async function updateStudioWritingDeskBlock(
  input: UpdateWritingDeskBlockInput,
): Promise<StudioWritingDeskActionResult> {
  if (!canWriteStudioDevData()) {
    return {
      ok: false,
      message:
        "Writing desk saves are disabled unless DATABASE_URL points at a local development database.",
    };
  }

  if (input.documentStableId !== WRITING_DOCUMENT.stableId) {
    return {
      ok: false,
      message: "Writing desk can only update the private draft document.",
    };
  }

  if (!WRITING_BLOCK_STABLE_IDS.has(input.blockStableId)) {
    return {
      ok: false,
      message: "Writing desk can only update deterministic draft blocks.",
    };
  }

  const title = normalizeTitle(input.title);
  const body = normalizeBody(input.body);

  if (!body.trim()) {
    return {
      ok: false,
      message: "Draft block body cannot be empty.",
    };
  }

  const prisma = getPrismaClient();

  try {
    await ensureWritingDeskDraftData(prisma);

    const updatedBlock = await prisma.$transaction(async (tx) => {
      const document = await tx.studioDocument.findUnique({
        where: {
          stableId: WRITING_DOCUMENT.stableId,
        },
      });

      if (!document) {
        throw new Error("Writing desk draft document not found.");
      }

      const block = await tx.studioDocumentBlock.findUnique({
        where: {
          documentId_stableId: {
            documentId: document.id,
            stableId: input.blockStableId,
          },
        },
      });

      if (!block || block.sourceLabel !== WRITING_DOCUMENT.sourceLabel) {
        throw new Error("Writing desk draft block not found.");
      }

      const updated = await tx.studioDocumentBlock.update({
        where: {
          id: block.id,
        },
        data: {
          title: title || null,
          body,
          projectionStatus: "draft",
          isPrivate: true,
        },
      });

      await tx.studioDocument.update({
        where: {
          id: document.id,
        },
        data: {
          projectionStatus: "draft",
          isPrivate: true,
        },
      });

      return updated;
    });

    return {
      ok: true,
      message: "Draft block saved.",
      blockStableId: input.blockStableId,
      savedAt: updatedBlock.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("Studio writing desk save failed.", error);

    return {
      ok: false,
      message: "The writing desk could not save that draft block.",
    };
  }
}
