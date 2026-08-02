import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";

export class EpisodeRoomCreationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid-input"
      | "not-found"
      | "request-conflict"
      | "episode-conflict"
      | "source-conflict",
    readonly status = 400,
  ) {
    super(message);
    this.name = "EpisodeRoomCreationError";
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 180);
}

function cleanSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

type SourceBlock = {
  id: string;
  stableId: string;
  order: number;
  title: string | null;
  body: string;
  sourceLabel: string | null;
  sourcePath: string | null;
  externalId: string | null;
};

function sourceSnapshot(input: {
  sourceProjectId: string;
  sourceProjectSlug: string;
  document: {
    id: string;
    stableId: string;
    title: string;
    sourceLabel: string | null;
    sourcePath: string | null;
    updatedAt: Date;
  };
  blocks: SourceBlock[];
}) {
  return {
    schema: "quipsly-episode-room-source-snapshot-v1",
    sourceProjectId: input.sourceProjectId,
    sourceProjectSlug: input.sourceProjectSlug,
    sourceDocumentId: input.document.id,
    sourceDocumentStableId: input.document.stableId,
    sourceDocumentTitle: input.document.title,
    sourceDocumentUpdatedAt: input.document.updatedAt.toISOString(),
    sourceDocumentLabel: input.document.sourceLabel,
    sourceDocumentPath: input.document.sourcePath,
    blocks: input.blocks.map((block) => ({
      id: block.id,
      stableId: block.stableId,
      order: block.order,
      title: block.title,
      body: block.body,
      sourceLabel: block.sourceLabel,
      sourcePath: block.sourcePath,
      externalId: block.externalId,
    })),
  };
}

function projectEpisodeRoom(row: {
  id: string;
  slug: string;
  title: string;
  status: string;
  documentId: string;
  productionJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const sourceImport = record(record(row.productionJson).sourceImport);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    documentId: row.documentId,
    sourceImport: {
      sourceProjectSlug: typeof sourceImport.sourceProjectSlug === "string" ? sourceImport.sourceProjectSlug : null,
      sourceDocumentId: typeof sourceImport.sourceDocumentId === "string" ? sourceImport.sourceDocumentId : null,
      sourceDocumentTitle: typeof sourceImport.sourceDocumentTitle === "string" ? sourceImport.sourceDocumentTitle : null,
      sourceContentSha256: typeof sourceImport.sourceContentSha256 === "string" ? sourceImport.sourceContentSha256 : null,
      sourceBlockCount: typeof sourceImport.sourceBlockCount === "number" ? sourceImport.sourceBlockCount : null,
      importedAt: typeof sourceImport.importedAt === "string" ? sourceImport.importedAt : null,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const productionSelect = {
  id: true,
  slug: true,
  title: true,
  status: true,
  documentId: true,
  productionJson: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StudioEpisodeProductionSelect;

export async function createEpisodeRoomFromManuscript(input: {
  prisma: PrismaClient;
  targetProjectId: string;
  targetProjectSlug: string;
  sourceProjectId: string;
  sourceProjectSlug: string;
  sourceDocumentId: string;
  episodeSlug: string;
  title: string;
  actor: { id?: string | null; email: string };
  clientRequestId: string;
}) {
  const actorEmail = normalizeAccessEmail(input.actor.email);
  const title = cleanTitle(input.title);
  const episodeSlug = cleanSlug(input.episodeSlug);
  const clientRequestId = input.clientRequestId.trim().slice(0, 160);
  if (!actorEmail || !title || !episodeSlug || !clientRequestId || !input.sourceDocumentId.trim()) {
    throw new EpisodeRoomCreationError(
      "Source manuscript, episode title, slug, actor, and request identity are required.",
      "invalid-input",
    );
  }
  const requestIdentity = {
    targetProjectId: input.targetProjectId,
    sourceProjectId: input.sourceProjectId,
    sourceDocumentId: input.sourceDocumentId,
    episodeSlug,
    title,
  };
  const requestDigest = sha256(requestIdentity);
  const groupId = `episode-room-create:${clientRequestId}`;

  return input.prisma.$transaction(async (tx) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `quipsly:episode-room-create:${input.targetProjectId}:${input.sourceDocumentId}`,
    );

    const replay = await tx.studioDocumentOperation.findFirst({
      where: {
        projectId: input.targetProjectId,
        groupId,
        operationType: "episode-room-source-import",
        actorEmail,
      },
      orderBy: { createdAt: "asc" },
      select: { payloadJson: true },
    });
    if (replay) {
      const payload = record(replay.payloadJson);
      if (payload.requestDigest !== requestDigest) {
        throw new EpisodeRoomCreationError(
          "That request identity was already used for a different Episode Room.",
          "request-conflict",
          409,
        );
      }
      const productionId = typeof payload.episodeProductionId === "string" ? payload.episodeProductionId : "";
      const existing = productionId
        ? await tx.studioEpisodeProduction.findUnique({ where: { id: productionId }, select: productionSelect })
        : null;
      if (!existing) {
        throw new EpisodeRoomCreationError("The prior Episode Room receipt no longer resolves.", "source-conflict", 409);
      }
      return { episode: projectEpisodeRoom(existing), replayed: true };
    }

    const [targetProject, sourceProject, sourceDocument] = await Promise.all([
      tx.studioProject.findUnique({ where: { id: input.targetProjectId }, select: { id: true, slug: true } }),
      tx.studioProject.findUnique({ where: { id: input.sourceProjectId }, select: { id: true, slug: true } }),
      tx.studioDocument.findFirst({
        where: { id: input.sourceDocumentId, projectId: input.sourceProjectId, personalOwnerUserId: null },
        select: {
          id: true,
          stableId: true,
          title: true,
          sourceLabel: true,
          sourcePath: true,
          updatedAt: true,
          blocks: {
            where: { archivedAt: null },
            orderBy: { order: "asc" },
            select: {
              id: true,
              stableId: true,
              order: true,
              title: true,
              body: true,
              sourceLabel: true,
              sourcePath: true,
              externalId: true,
            },
          },
        },
      }),
    ]);
    if (!targetProject || targetProject.slug !== input.targetProjectSlug
      || !sourceProject || sourceProject.slug !== input.sourceProjectSlug
      || !sourceDocument) {
      throw new EpisodeRoomCreationError("The target Nest or source manuscript was not found.", "not-found", 404);
    }
    if (!sourceDocument.blocks.length) {
      throw new EpisodeRoomCreationError("The selected manuscript has no active blocks to import.", "invalid-input");
    }

    const snapshot = sourceSnapshot({
      sourceProjectId: input.sourceProjectId,
      sourceProjectSlug: input.sourceProjectSlug,
      document: sourceDocument,
      blocks: sourceDocument.blocks,
    });
    const sourceContentSha256 = sha256(snapshot);
    const existingProduction = await tx.studioEpisodeProduction.findUnique({
      where: { projectId_slug: { projectId: input.targetProjectId, slug: episodeSlug } },
      select: productionSelect,
    });
    if (existingProduction) {
      const existingSource = record(record(existingProduction.productionJson).sourceImport);
      if (existingSource.sourceDocumentId !== sourceDocument.id) {
        throw new EpisodeRoomCreationError(
          "That episode slug already belongs to a different source manuscript.",
          "episode-conflict",
          409,
        );
      }
      return { episode: projectEpisodeRoom(existingProduction), replayed: true };
    }

    const destinationStableId = `episode-room-document-${sha256({ targetProjectId: input.targetProjectId, sourceDocumentId: sourceDocument.id }).slice(0, 32)}`;
    const destinationConflict = await tx.studioDocument.findUnique({
      where: { stableId: destinationStableId },
      select: { id: true },
    });
    if (destinationConflict) {
      throw new EpisodeRoomCreationError(
        "A working manuscript already exists without a matching Episode Room receipt. Review it before retrying.",
        "source-conflict",
        409,
      );
    }

    const importedAt = new Date();
    const destination = await tx.studioDocument.create({
      data: {
        projectId: input.targetProjectId,
        stableId: destinationStableId,
        title,
        sourceLabel: `document-kind:episode-room-manuscript;source-project:${input.sourceProjectSlug};source-document:${sourceDocument.id}`,
        sourcePath: `/nests/${encodeURIComponent(input.sourceProjectSlug)}?view=notes`,
        projectionStatus: "private",
        isPrivate: true,
      },
      select: { id: true, stableId: true },
    });
    await tx.studioDocumentBlock.createMany({
      data: sourceDocument.blocks.map((block) => ({
        documentId: destination.id,
        stableId: `episode-room-block-${sha256({ destinationStableId, sourceBlockId: block.id }).slice(0, 32)}`,
        order: block.order,
        title: block.title,
        body: block.body,
        sourceLabel: `Imported source block · ${sourceDocument.title}`,
        sourcePath: `/create?project=${encodeURIComponent(input.sourceProjectSlug)}&document=${encodeURIComponent(sourceDocument.id)}`,
        externalId: `studio-source-block:${block.id}`,
        projectionStatus: "private",
        isPrivate: true,
      })),
    });
    const destinationBlocks = await tx.studioDocumentBlock.findMany({
      where: { documentId: destination.id },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });
    const sourceImport = {
      schema: "quipsly-episode-room-source-import-v1",
      sourceProjectId: input.sourceProjectId,
      sourceProjectSlug: input.sourceProjectSlug,
      sourceDocumentId: sourceDocument.id,
      sourceDocumentStableId: sourceDocument.stableId,
      sourceDocumentTitle: sourceDocument.title,
      sourceDocumentUpdatedAt: sourceDocument.updatedAt.toISOString(),
      sourceContentSha256,
      sourceBlockCount: sourceDocument.blocks.length,
      destinationDocumentId: destination.id,
      destinationDocumentStableId: destination.stableId,
      importedAt: importedAt.toISOString(),
      importedByUserId: input.actor.id || null,
      importedByEmail: actorEmail,
      sourceMutated: false,
      externalSideEffects: false,
    };
    const production = await tx.studioEpisodeProduction.create({
      data: {
        projectId: input.targetProjectId,
        documentId: destination.id,
        slug: episodeSlug,
        title,
        boundaryLabel: title,
        boundaryKind: "episode",
        boundaryStartBlockId: destinationBlocks[0]?.id,
        boundaryEndBlockId: destinationBlocks.at(-1)?.id,
        boundaryStartOrder: destinationBlocks[0]?.order,
        boundaryEndOrder: destinationBlocks.at(-1)?.order,
        status: "draft",
        productionJson: {
          source: "quipsly-episode-room-source-import",
          projectSlug: input.targetProjectSlug,
          episodeSlug,
          title,
          sourceImport,
        },
      },
      select: productionSelect,
    });
    await tx.studioDocumentOperation.create({
      data: {
        projectId: input.targetProjectId,
        documentId: destination.id,
        groupId,
        actorEmail,
        origin: "human",
        operationType: "episode-room-source-import",
        status: "applied",
        afterJson: {
          episodeProductionId: production.id,
          destinationDocumentId: destination.id,
          destinationBlockCount: destinationBlocks.length,
          sourceContentSha256,
        },
        payloadJson: {
          ...sourceImport,
          schema: "quipsly-episode-room-create-receipt-v1",
          clientRequestId,
          requestDigest,
          episodeProductionId: production.id,
          targetProjectId: input.targetProjectId,
          targetProjectSlug: input.targetProjectSlug,
          audienceBoundary: "target-nest-active-access",
          providerCalendarMutated: false,
          recordingStarted: false,
          publicationCreated: false,
        },
        reversible: true,
      },
    });
    return { episode: projectEpisodeRoom(production), replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
