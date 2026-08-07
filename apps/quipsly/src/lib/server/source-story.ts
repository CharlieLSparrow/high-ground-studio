import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  SOURCE_STORY_SCHEMA_VERSION,
  SourceStoryContractError,
  normalizeCreateSourceStoryCardInput,
  normalizeRebindSourceStoryCardInput,
  stableSourceStoryJson,
  storyCardPurposes,
  storyCardStatuses,
  type CreateSourceStoryCardInput,
  type RebindSourceStoryCardInput,
  type StoryCardPurpose,
  type StoryCardStatus,
} from "@/lib/source-story-contract";

type Database = PrismaClient | Prisma.TransactionClient;

const SHA256 = /^[0-9a-f]{64}$/;

export class SourceStoryConflictError extends Error {
  readonly code: string;
  readonly currentRevision: number | null;

  constructor(code: string, message: string, currentRevision: number | null = null) {
    super(message);
    this.name = "SourceStoryConflictError";
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanText(value: unknown, field: string, maxLength: number, required = false) {
  if (typeof value !== "string") throw new SourceStoryContractError("invalid-text", `${field} must be text.`);
  const text = value.trim();
  if (required && !text) throw new SourceStoryContractError("required-text", `${field} is required.`);
  if (text.length > maxLength) throw new SourceStoryContractError("text-too-long", `${field} is too long.`);
  return text;
}

function cleanId(value: unknown, field: string) {
  const id = cleanText(value, field, 200, true);
  if (!/^[a-zA-Z0-9:_-]+$/.test(id)) throw new SourceStoryContractError("invalid-id", `${field} is malformed.`);
  return id;
}

function cleanClientRequestId(value: unknown) {
  const id = cleanText(value, "clientRequestId", 64, true).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new SourceStoryContractError("invalid-request-id", "The request identity must be a UUID.");
  }
  return id;
}

function cleanKey(value: unknown, fallback: string) {
  const source = typeof value === "string" && value.trim() ? value.trim() : fallback;
  const key = source.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!key) throw new SourceStoryContractError("invalid-key", "A stable board key is required.");
  return key;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function storedRequestSha256(value: unknown) {
  const record = jsonRecord(value);
  const candidate = typeof record?.requestSha256 === "string" ? record.requestSha256.toLowerCase() : "";
  return SHA256.test(candidate) ? candidate : null;
}

function jsonByteCount(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function checksumInRecord(value: unknown): string | null {
  const record = jsonRecord(value);
  if (!record) return null;
  for (const key of ["sha256", "checksumSha256", "contentSha256"]) {
    const candidate = typeof record[key] === "string" ? record[key].trim().toLowerCase() : "";
    if (SHA256.test(candidate)) return candidate;
  }
  const generation = typeof record.generation === "string" ? record.generation.trim().toLowerCase() : "";
  return generation.startsWith("sha256:") && SHA256.test(generation.slice(7)) ? generation.slice(7) : null;
}

function exactAssetChecksum(input: {
  assetUrl: string;
  assetSizeBytes: bigint | null;
  attachments: Array<{ id: string; role: string | null; metadataJson: unknown }>;
}) {
  if (!input.assetSizeBytes || input.assetSizeBytes <= BigInt(0)) return null;
  for (const attachment of input.attachments) {
    const root = jsonRecord(attachment.metadataJson);
    if (!root) continue;
    const declaredPlaybackUrl = typeof root.playbackUrl === "string" ? root.playbackUrl : null;
    if (declaredPlaybackUrl && declaredPlaybackUrl !== input.assetUrl) continue;
    // `source` frequently describes the original behind a proxy. Only an
    // output/direct registration whose own byte count matches this exact asset
    // can verify this StudioMediaAsset's bytes.
    for (const candidate of [jsonRecord(root.output), jsonRecord(root.asset), root]) {
      if (!candidate) continue;
      const checksumSha256 = checksumInRecord(candidate);
      const sizeBytes = jsonByteCount(candidate.sizeBytes);
      if (!checksumSha256 || sizeBytes !== input.assetSizeBytes) continue;
      return {
        checksumSha256,
        attachmentId: attachment.id,
        attachmentRole: attachment.role,
        sizeBytes: sizeBytes.toString(),
      };
    }
  }
  return null;
}

function finiteAssetNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function parseResolution(value: string | null | undefined) {
  const match = value?.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
  if (!match) return { widthPixels: null, heightPixels: null };
  const widthPixels = Number(match[1]);
  const heightPixels = Number(match[2]);
  return widthPixels > 0 && heightPixels > 0
    ? { widthPixels, heightPixels }
    : { widthPixels: null, heightPixels: null };
}

function cardSnapshot(input: {
  id: string;
  projectId: string;
  sourceRangeId: string | null;
  stableId: string;
  title: string;
  synopsis: string;
  notes: string;
  purpose: string;
  status: string;
  visibility: string;
  revision: number;
  archivedAt: Date | null;
  tagIds: string[];
}) {
  return {
    schema: SOURCE_STORY_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    sourceRangeId: input.sourceRangeId,
    stableId: input.stableId,
    title: input.title,
    synopsis: input.synopsis,
    notes: input.notes,
    purpose: input.purpose,
    status: input.status,
    visibility: input.visibility,
    revision: input.revision,
    archivedAt: input.archivedAt?.toISOString() ?? null,
    tagIds: [...input.tagIds].sort(),
  };
}

function boardSnapshot(input: {
  id: string;
  projectId: string;
  episodeProductionId: string | null;
  slug: string;
  title: string;
  description: string | null;
  kind: string;
  layout: string;
  revision: number;
  placements: Array<{ cardId: string; groupKey: string; laneKey: string; sortOrder: number }>;
}) {
  return {
    schema: SOURCE_STORY_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    episodeProductionId: input.episodeProductionId,
    slug: input.slug,
    title: input.title,
    description: input.description,
    kind: input.kind,
    layout: input.layout,
    revision: input.revision,
    placements: [...input.placements]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.cardId.localeCompare(right.cardId)),
  };
}

async function checkedTagIds(db: Database, projectId: string, tagIds: string[]) {
  const unique = [...new Set(tagIds)].sort();
  if (!unique.length) return [];
  const tags = await db.studioTag.findMany({
    where: { id: { in: unique }, projectId, isActive: true },
    select: { id: true },
  });
  if (tags.length !== unique.length) {
    throw new SourceStoryContractError("invalid-tag-scope", "At least one tag is unavailable in this Nest.");
  }
  return tags.map((tag) => tag.id).sort();
}

async function requireAssetInProject(db: Database, projectId: string, mediaAssetId: string) {
  const asset = await db.studioMediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: {
      id: true,
      filename: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      duration: true,
      resolution: true,
      fps: true,
      isProxy: true,
      rawAssetId: true,
      updatedAt: true,
      projects: { where: { id: projectId }, select: { id: true } },
      mediaBin: { select: { projectId: true } },
      assetAttachments: {
        where: { projectId },
        select: { id: true, role: true, metadataJson: true },
      },
    },
  });
  const attached = Boolean(
    asset
    && (asset.projects.length || asset.mediaBin?.projectId === projectId || asset.assetAttachments.length),
  );
  if (!asset || !attached) {
    throw new SourceStoryContractError("asset-project-mismatch", "This media source is unavailable in the selected Nest.");
  }
  return asset;
}

async function ensureAssetRevision(input: {
  db: Database;
  projectId: string;
  mediaAssetId: string;
  actorUserId: string;
}) {
  const asset = await requireAssetInProject(input.db, input.projectId, input.mediaAssetId);
  const sizeBytes = asset.sizeBytes && asset.sizeBytes >= BigInt(0) ? asset.sizeBytes : null;
  const checksumEvidence = exactAssetChecksum({
    assetUrl: asset.url,
    assetSizeBytes: sizeBytes,
    attachments: asset.assetAttachments,
  });
  const contentSha256 = checksumEvidence?.checksumSha256 ?? null;
  const revisionKey = `quipsly-asset-v2:${asset.id}:${asset.updatedAt.toISOString()}:${contentSha256?.slice(0, 12) ?? "unverified"}`;
  const registrySnapshot = {
    schema: "quipsly-media-asset-revision-v2",
    assetId: asset.id,
    revisionKey,
    filename: asset.filename,
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes?.toString() ?? null,
    durationSeconds: finiteAssetNumber(asset.duration),
    resolution: asset.resolution,
    framesPerSecond: finiteAssetNumber(asset.fps),
    isProxy: asset.isProxy,
    rawAssetId: asset.rawAssetId,
    updatedAt: asset.updatedAt.toISOString(),
    checksumEvidence,
  };
  const identitySha256 = sha256(stableSourceStoryJson({ projectId: input.projectId, registrySnapshot }));
  const dimensions = parseResolution(asset.resolution);
  const sourceState = contentSha256 && sizeBytes && sizeBytes > BigInt(0)
    ? "checksum-bound"
    : "identity-unverified";

  const revision = await input.db.studioMediaSourceRevision.upsert({
    where: { projectId_identitySha256: { projectId: input.projectId, identitySha256 } },
    update: {},
    create: {
      projectId: input.projectId,
      mediaAssetId: asset.id,
      revisionKey,
      identitySha256,
      contentSha256,
      sizeBytes,
      durationSeconds: finiteAssetNumber(asset.duration),
      framesPerSecond: finiteAssetNumber(asset.fps),
      ...dimensions,
      sourceState,
      verifiedAt: sourceState === "checksum-bound" ? new Date() : null,
      verificationJson: {
        schema: "quipsly-media-source-verification-v2",
        state: sourceState,
        checksumEvidence,
        claim: sourceState === "checksum-bound"
          ? "A retained checksum and byte count bind this registered source. Executors must still verify bytes before use."
          : "This revision binds registered identity and metadata only. Exact-source export remains held until bytes and checksum are verified.",
      },
      provenanceJson: registrySnapshot,
      createdByUserId: input.actorUserId,
    },
  });
  return { asset, revision };
}

export async function createStoryBoard(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  clientRequestId: string;
  title: string;
  description?: string;
  slug?: string;
  kind?: string;
  episodeProductionId?: string | null;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = cleanClientRequestId(input.clientRequestId);
  const title = cleanText(input.title, "Title", 200, true);
  const description = cleanText(input.description ?? "", "Description", 10_000) || null;
  const slug = cleanKey(input.slug, title);
  const kind = cleanKey(input.kind, "story");
  const episodeProductionId = input.episodeProductionId ? cleanId(input.episodeProductionId, "episodeProductionId") : null;

  return input.prisma.$transaction(async (tx) => {
    const replay = await tx.studioStoryBoard.findUnique({
      where: {
        projectId_createdByUserId_clientRequestId: {
          projectId,
          createdByUserId: actorUserId,
          clientRequestId,
        },
      },
      include: { placements: { orderBy: { sortOrder: "asc" } } },
    });
    if (replay) {
      const sameRequest = replay.slug === slug
        && replay.title === title
        && replay.description === description
        && replay.kind === kind
        && replay.episodeProductionId === episodeProductionId;
      if (!sameRequest) {
        throw new SourceStoryConflictError(
          "request-reuse-conflict",
          "That saved request identity already created a different board.",
          replay.revision,
        );
      }
      return { board: replay, replayed: true };
    }
    const existing = await tx.studioStoryBoard.findUnique({
      where: { projectId_slug: { projectId, slug } },
      include: { placements: { orderBy: { sortOrder: "asc" } } },
    });
    if (existing) {
      const sameIdentity = existing.title === title
        && existing.description === description
        && existing.kind === kind
        && existing.episodeProductionId === episodeProductionId;
      if (!sameIdentity) {
        throw new SourceStoryConflictError(
          "board-slug-conflict",
          "That board address already belongs to a different board in this Nest.",
          existing.revision,
        );
      }
      return { board: existing, replayed: true };
    }
    if (episodeProductionId) {
      const episode = await tx.studioEpisodeProduction.findFirst({ where: { id: episodeProductionId, projectId }, select: { id: true } });
      if (!episode) throw new SourceStoryContractError("episode-project-mismatch", "The Episode is unavailable in this Nest.");
    }
    const boardId = randomUUID();
    const board = await tx.studioStoryBoard.create({
      data: {
        id: boardId,
        projectId,
        episodeProductionId,
        clientRequestId,
        slug,
        title,
        description,
        kind,
        revision: 1,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        operations: {
          create: {
            revision: 1,
            previousRevision: 0,
            operation: "create-board",
            actorUserId,
            clientRequestId,
            snapshotJson: boardSnapshot({
              id: boardId,
              projectId,
              episodeProductionId,
              slug,
              title,
              description,
              kind,
              layout: "board",
              revision: 1,
              placements: [],
            }),
          },
        },
      },
      include: { placements: { orderBy: { sortOrder: "asc" } } },
    });
    return { board, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export async function createSourceStoryCard(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  value: CreateSourceStoryCardInput;
}) {
  const value = normalizeCreateSourceStoryCardInput(input.value);
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const actorEmail = cleanText(input.actorEmail, "actorEmail", 320, true).toLowerCase();
  const requestSha256 = sha256(stableSourceStoryJson(value));

  return input.prisma.$transaction(async (tx) => {
    const existing = await tx.studioStoryCard.findUnique({
      where: {
        projectId_createdByUserId_clientRequestId: {
          projectId: value.projectId,
          createdByUserId: actorUserId,
          clientRequestId: value.clientRequestId,
        },
      },
      include: {
        tags: { select: { tagId: true } },
        sourceRange: true,
        revisions: {
          where: { actorUserId, clientRequestId: value.clientRequestId },
          take: 1,
          select: { snapshotJson: true },
        },
      },
    });
    if (existing) {
      if (storedRequestSha256(existing.revisions[0]?.snapshotJson) !== requestSha256) {
        throw new SourceStoryConflictError(
          "request-reuse-conflict",
          "That saved request identity already created a different story card.",
          existing.revision,
        );
      }
      const placementOperation = await tx.studioStoryBoardOperation.findFirst({
        where: {
          actorUserId,
          clientRequestId: value.clientRequestId,
          operation: "place-card",
          board: { projectId: value.projectId },
        },
        select: { revision: true },
      });
      return { card: existing, replayed: true, boardRevision: placementOperation?.revision ?? null };
    }

    // Prisma interactive transactions share one connection. Keep operations
    // sequential so a validation failure cannot roll back while another query
    // is still trying to use the closed transaction.
    const tags = await checkedTagIds(tx, value.projectId, value.tagIds);
    const source = await ensureAssetRevision({
      db: tx,
      projectId: value.projectId,
      mediaAssetId: value.mediaAssetId,
      actorUserId,
    });
    if (source.revision.durationSeconds !== null && value.endSeconds > source.revision.durationSeconds + 0.001) {
      throw new SourceStoryContractError("range-past-source", "The out point is beyond the registered source duration.");
    }

    const selectorJson = {
      schema: "quipsly-media-time-selector-v1",
      sourceRevisionId: source.revision.id,
      sourceIdentitySha256: source.revision.identitySha256,
      startSeconds: value.startSeconds,
      endSeconds: value.endSeconds,
      clock: "source",
      reframeRecipe: value.reframeRecipe,
    };
    const selectorSha256 = sha256(stableSourceStoryJson(selectorJson));
    const range = await tx.studioSourceRange.upsert({
      where: {
        sourceRevisionId_selectorSha256: {
          sourceRevisionId: source.revision.id,
          selectorSha256,
        },
      },
      update: {},
      create: {
        projectId: value.projectId,
        sourceRevisionId: source.revision.id,
        selectorSha256,
        startSeconds: value.startSeconds,
        endSeconds: value.endSeconds,
        selectorJson,
        reframeRecipeJson: value.reframeRecipe ?? undefined,
        createdByUserId: actorUserId,
      },
    });

    const cardId = randomUUID();
    const stableId = `story-card:${value.projectId}:${cardId}`;
    const snapshot = cardSnapshot({
      id: cardId,
      projectId: value.projectId,
      sourceRangeId: range.id,
      stableId,
      title: value.title,
      synopsis: value.synopsis,
      notes: value.notes,
      purpose: value.purpose,
      status: "candidate",
      visibility: "project",
      revision: 1,
      archivedAt: null,
      tagIds: tags,
    });
    const card = await tx.studioStoryCard.create({
      data: {
        id: cardId,
        projectId: value.projectId,
        sourceRangeId: range.id,
        stableId,
        title: value.title,
        synopsis: value.synopsis,
        notes: value.notes,
        purpose: value.purpose,
        status: "candidate",
        visibility: "project",
        clientRequestId: value.clientRequestId,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        revisions: {
          create: {
            revision: 1,
            operation: "create-card",
            actorUserId,
            clientRequestId: value.clientRequestId,
            snapshotJson: { ...snapshot, actorEmail, requestSha256 },
          },
        },
        tags: {
          create: tags.map((tagId) => ({
            tagId,
            createdByUserId: actorUserId,
            sourceJson: { schema: SOURCE_STORY_SCHEMA_VERSION, source: "human-card-create" },
          })),
        },
      },
      include: { tags: { select: { tagId: true } }, sourceRange: true },
    });

    let boardRevision: number | null = null;
    if (value.boardId) {
      const board = await tx.studioStoryBoard.findFirst({
        where: { id: value.boardId, projectId: value.projectId, archivedAt: null },
        include: { placements: { orderBy: { sortOrder: "asc" } } },
      });
      if (!board) throw new SourceStoryContractError("board-project-mismatch", "The board is unavailable in this Nest.");
      if (board.revision !== value.expectedBoardRevision) {
        throw new SourceStoryConflictError("stale-board", "The board changed while this card was being placed.", board.revision);
      }
      const sortOrder = board.placements.length;
      await tx.studioStoryBoardPlacement.create({
        data: {
          boardId: board.id,
          cardId: card.id,
          groupKey: value.groupKey,
          laneKey: value.laneKey,
          sortOrder,
          createdByUserId: actorUserId,
        },
      });
      boardRevision = board.revision + 1;
      const placements = [
        ...board.placements.map((placement) => ({
          cardId: placement.cardId,
          groupKey: placement.groupKey,
          laneKey: placement.laneKey,
          sortOrder: placement.sortOrder,
        })),
        { cardId: card.id, groupKey: value.groupKey, laneKey: value.laneKey, sortOrder },
      ];
      const updated = await tx.studioStoryBoard.updateMany({
        where: { id: board.id, revision: board.revision },
        data: { revision: boardRevision, updatedByUserId: actorUserId },
      });
      if (updated.count !== 1) throw new SourceStoryConflictError("stale-board", "The board changed while this card was being placed.");
      await tx.studioStoryBoardOperation.create({
        data: {
          boardId: board.id,
          revision: boardRevision,
          previousRevision: board.revision,
          operation: "place-card",
          actorUserId,
          clientRequestId: value.clientRequestId,
          snapshotJson: boardSnapshot({ ...board, revision: boardRevision, placements }),
        },
      });
    }
    return { card, replayed: false, boardRevision };
  }, { isolationLevel: "Serializable" });
}

export async function updateSourceStoryCard(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  cardId: string;
  expectedRevision: number;
  clientRequestId: string;
  title: string;
  synopsis: string;
  notes: string;
  purpose: StoryCardPurpose;
  status: StoryCardStatus;
  tagIds: string[];
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const cardId = cleanId(input.cardId, "cardId");
  const clientRequestId = cleanClientRequestId(input.clientRequestId);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new SourceStoryContractError("invalid-revision", "The current card revision is required.");
  }
  if (!storyCardPurposes.includes(input.purpose)) throw new SourceStoryContractError("invalid-purpose", "The story purpose is unsupported.");
  if (!storyCardStatuses.includes(input.status)) throw new SourceStoryContractError("invalid-status", "The card status is unsupported.");
  const title = cleanText(input.title, "Title", 200, true);
  const synopsis = cleanText(input.synopsis, "Synopsis", 10_000);
  const notes = cleanText(input.notes, "Notes", 50_000);
  const requestSha256 = sha256(stableSourceStoryJson({
    projectId,
    actorUserId,
    cardId,
    expectedRevision: input.expectedRevision,
    title,
    synopsis,
    notes,
    purpose: input.purpose,
    status: input.status,
    tagIds: [...new Set(input.tagIds)].sort(),
  }));

  return input.prisma.$transaction(async (tx) => {
    const replay = await tx.studioStoryCardRevision.findUnique({
      where: { cardId_actorUserId_clientRequestId: { cardId, actorUserId, clientRequestId } },
      select: { revision: true, snapshotJson: true },
    });
    if (replay) {
      if (storedRequestSha256(replay.snapshotJson) !== requestSha256) {
        throw new SourceStoryConflictError(
          "request-reuse-conflict",
          "That saved request identity already applied a different card revision.",
          replay.revision,
        );
      }
      const card = await tx.studioStoryCard.findFirst({ where: { id: cardId, projectId }, include: { tags: true } });
      if (!card) throw new SourceStoryContractError("card-project-mismatch", "The story card is unavailable in this Nest.");
      return { card, replayed: true };
    }
    const card = await tx.studioStoryCard.findFirst({
      where: { id: cardId, projectId, archivedAt: null },
      include: { tags: true },
    });
    const tags = await checkedTagIds(
      tx,
      projectId,
      input.tagIds.map((tagId) => cleanId(tagId, "tagId")),
    );
    if (!card) throw new SourceStoryContractError("card-project-mismatch", "The story card is unavailable in this Nest.");
    if (card.revision !== input.expectedRevision) {
      throw new SourceStoryConflictError("stale-card", "This card changed on another surface.", card.revision);
    }
    const nextRevision = card.revision + 1;
    const updated = await tx.studioStoryCard.updateMany({
      where: { id: card.id, revision: card.revision },
      data: { title, synopsis, notes, purpose: input.purpose, status: input.status, revision: nextRevision, updatedByUserId: actorUserId },
    });
    if (updated.count !== 1) throw new SourceStoryConflictError("stale-card", "This card changed on another surface.");
    await tx.studioStoryCardTagLink.deleteMany({ where: { cardId: card.id } });
    if (tags.length) {
      await tx.studioStoryCardTagLink.createMany({
        data: tags.map((tagId) => ({
          cardId: card.id,
          tagId,
          createdByUserId: actorUserId,
          sourceJson: { schema: SOURCE_STORY_SCHEMA_VERSION, source: "human-card-update" },
        })),
      });
    }
    await tx.studioStoryCardRevision.create({
      data: {
        cardId: card.id,
        revision: nextRevision,
        operation: "update-card",
        actorUserId,
        clientRequestId,
        snapshotJson: {
          ...cardSnapshot({ ...card, title, synopsis, notes, purpose: input.purpose, status: input.status, revision: nextRevision, tagIds: tags }),
          requestSha256,
        },
      },
    });
    const result = await tx.studioStoryCard.findUniqueOrThrow({ where: { id: card.id }, include: { tags: true } });
    return { card: result, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export async function rebindSourceStoryCard(input: {
  prisma: PrismaClient;
  actorUserId: string;
  value: RebindSourceStoryCardInput;
}) {
  const value = normalizeRebindSourceStoryCardInput(input.value);
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const requestSha256 = sha256(stableSourceStoryJson({ ...value, actorUserId }));

  return input.prisma.$transaction(async (tx) => {
    const replay = await tx.studioStoryCardRevision.findUnique({
      where: {
        cardId_actorUserId_clientRequestId: {
          cardId: value.cardId,
          actorUserId,
          clientRequestId: value.clientRequestId,
        },
      },
      select: { revision: true, snapshotJson: true },
    });
    if (replay) {
      if (storedRequestSha256(replay.snapshotJson) !== requestSha256) {
        throw new SourceStoryConflictError(
          "request-reuse-conflict",
          "That saved request identity already applied a different source repair.",
          replay.revision,
        );
      }
      const card = await tx.studioStoryCard.findFirst({
        where: { id: value.cardId, projectId: value.projectId },
        include: { tags: true, sourceRange: true },
      });
      if (!card) throw new SourceStoryContractError("card-project-mismatch", "The story card is unavailable in this Nest.");
      return { card, replayed: true, previousSourceRangeId: value.expectedSourceRangeId };
    }

    const card = await tx.studioStoryCard.findFirst({
      where: { id: value.cardId, projectId: value.projectId, archivedAt: null },
      include: { tags: true, sourceRange: true },
    });
    if (!card) throw new SourceStoryContractError("card-project-mismatch", "The story card is unavailable in this Nest.");
    if (card.revision !== value.expectedRevision) {
      throw new SourceStoryConflictError("stale-card", "This card changed on another surface.", card.revision);
    }
    if (card.sourceRangeId !== value.expectedSourceRangeId) {
      throw new SourceStoryConflictError("stale-source-range", "This card's source changed on another surface.", card.revision);
    }

    const source = await ensureAssetRevision({
      db: tx,
      projectId: value.projectId,
      mediaAssetId: value.replacementMediaAssetId,
      actorUserId,
    });
    if (source.revision.durationSeconds !== null && value.endSeconds > source.revision.durationSeconds + 0.001) {
      throw new SourceStoryContractError("range-past-source", "The out point is beyond the registered replacement source duration.");
    }
    const selectorJson = {
      schema: "quipsly-media-time-selector-v1",
      sourceRevisionId: source.revision.id,
      sourceIdentitySha256: source.revision.identitySha256,
      startSeconds: value.startSeconds,
      endSeconds: value.endSeconds,
      clock: "source",
      reframeRecipe: value.reframeRecipe,
    };
    const selectorSha256 = sha256(stableSourceStoryJson(selectorJson));
    const range = await tx.studioSourceRange.upsert({
      where: {
        sourceRevisionId_selectorSha256: {
          sourceRevisionId: source.revision.id,
          selectorSha256,
        },
      },
      update: {},
      create: {
        projectId: value.projectId,
        sourceRevisionId: source.revision.id,
        selectorSha256,
        startSeconds: value.startSeconds,
        endSeconds: value.endSeconds,
        selectorJson,
        reframeRecipeJson: value.reframeRecipe ?? undefined,
        createdByUserId: actorUserId,
      },
    });
    if (range.id === card.sourceRangeId) {
      throw new SourceStoryConflictError("source-already-current", "This exact source revision and range are already current.", card.revision);
    }

    const nextRevision = card.revision + 1;
    const updated = await tx.studioStoryCard.updateMany({
      where: { id: card.id, projectId: value.projectId, revision: card.revision, sourceRangeId: value.expectedSourceRangeId },
      data: { sourceRangeId: range.id, revision: nextRevision, updatedByUserId: actorUserId },
    });
    if (updated.count !== 1) throw new SourceStoryConflictError("stale-card", "This card changed on another surface.");

    const tagIds = card.tags.map((link) => link.tagId).sort();
    await tx.studioStoryCardRevision.create({
      data: {
        cardId: card.id,
        revision: nextRevision,
        operation: "rebind-source",
        actorUserId,
        clientRequestId: value.clientRequestId,
        snapshotJson: {
          ...cardSnapshot({ ...card, sourceRangeId: range.id, revision: nextRevision, tagIds }),
          requestSha256,
          sourceRebind: {
            schema: "quipsly-story-card-source-rebind-v1",
            reason: value.reason,
            previousSourceRangeId: card.sourceRangeId,
            replacementSourceRangeId: range.id,
            replacementSourceRevisionId: source.revision.id,
            replacementMediaAssetId: source.asset.id,
            replacementSourceState: source.revision.sourceState,
            sourceMutated: false,
            placementsMutated: false,
          },
        },
      },
    });
    const result = await tx.studioStoryCard.findUniqueOrThrow({
      where: { id: card.id },
      include: { tags: true, sourceRange: true },
    });
    return { card: result, replayed: false, previousSourceRangeId: card.sourceRangeId };
  }, { isolationLevel: "Serializable" });
}

export async function reorderStoryBoard(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  boardId: string;
  expectedRevision: number;
  orderedCardIds: string[];
  clientRequestId: string;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const boardId = cleanId(input.boardId, "boardId");
  const clientRequestId = cleanClientRequestId(input.clientRequestId);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) throw new SourceStoryContractError("invalid-revision", "The current board revision is required.");
  if (!Array.isArray(input.orderedCardIds) || input.orderedCardIds.length > 2_000) throw new SourceStoryContractError("invalid-order", "The board order is malformed.");
  const orderedCardIds = input.orderedCardIds.map((id) => cleanId(id, "cardId"));
  if (new Set(orderedCardIds).size !== orderedCardIds.length) throw new SourceStoryContractError("duplicate-card", "A card appears more than once in the requested order.");
  const requestSha256 = sha256(stableSourceStoryJson({
    projectId,
    actorUserId,
    boardId,
    expectedRevision: input.expectedRevision,
    orderedCardIds,
  }));

  return input.prisma.$transaction(async (tx) => {
    const replay = await tx.studioStoryBoardOperation.findUnique({
      where: { boardId_actorUserId_clientRequestId: { boardId, actorUserId, clientRequestId } },
    });
    if (replay) {
      if (storedRequestSha256(replay.snapshotJson) !== requestSha256) {
        throw new SourceStoryConflictError(
          "request-reuse-conflict",
          "That saved request identity already applied a different board order.",
          replay.revision,
        );
      }
      return { revision: replay.revision, replayed: true };
    }
    const board = await tx.studioStoryBoard.findFirst({
      where: { id: boardId, projectId, archivedAt: null },
      include: { placements: { orderBy: { sortOrder: "asc" } } },
    });
    if (!board) throw new SourceStoryContractError("board-project-mismatch", "The board is unavailable in this Nest.");
    if (board.revision !== input.expectedRevision) throw new SourceStoryConflictError("stale-board", "The board changed on another surface.", board.revision);
    const currentIds = board.placements.map((placement) => placement.cardId).sort();
    if (stableSourceStoryJson([...orderedCardIds].sort()) !== stableSourceStoryJson(currentIds)) {
      throw new SourceStoryConflictError("order-set-mismatch", "The requested order does not contain the board's exact current card set.", board.revision);
    }
    for (const [sortOrder, cardId] of orderedCardIds.entries()) {
      await tx.studioStoryBoardPlacement.updateMany({ where: { boardId, cardId }, data: { sortOrder } });
    }
    const nextRevision = board.revision + 1;
    const updated = await tx.studioStoryBoard.updateMany({
      where: { id: board.id, revision: board.revision },
      data: { revision: nextRevision, updatedByUserId: actorUserId },
    });
    if (updated.count !== 1) throw new SourceStoryConflictError("stale-board", "The board changed on another surface.");
    const placementByCard = new Map(board.placements.map((placement) => [placement.cardId, placement]));
    const placements = orderedCardIds.map((cardId, sortOrder) => {
      const placement = placementByCard.get(cardId)!;
      return { cardId, groupKey: placement.groupKey, laneKey: placement.laneKey, sortOrder };
    });
    await tx.studioStoryBoardOperation.create({
      data: {
        boardId: board.id,
        revision: nextRevision,
        previousRevision: board.revision,
        operation: "reorder-cards",
        actorUserId,
        clientRequestId,
        snapshotJson: {
          ...boardSnapshot({ ...board, revision: nextRevision, placements }),
          requestSha256,
        },
      },
    });
    return { revision: nextRevision, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export async function readSourceStoryWorkspace(prisma: PrismaClient, projectId: string) {
  const [boards, cards, externalSources] = await Promise.all([
    prisma.studioStoryBoard.findMany({
      where: { projectId, archivedAt: null },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      include: {
        placements: {
          orderBy: { sortOrder: "asc" },
          include: {
            card: {
              include: {
                tags: { include: { tag: { select: { id: true, label: true, slug: true, isActive: true } } } },
                sourceRange: {
                  include: {
                    sourceRevision: {
                      include: {
                        mediaAsset: { select: { id: true, filename: true, url: true, mimeType: true, duration: true, thumbnailUrl: true } },
                        externalReference: { select: { id: true, provider: true, fileName: true, mimeType: true, accessState: true, capabilityState: true, lastVerifiedAt: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.studioStoryCard.findMany({
      where: { projectId, archivedAt: null },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      include: {
        tags: { include: { tag: { select: { id: true, label: true, slug: true, isActive: true } } } },
        sourceRange: {
          include: {
            sourceRevision: {
              include: {
                mediaAsset: { select: { id: true, filename: true, url: true, mimeType: true, duration: true, thumbnailUrl: true } },
                externalReference: { select: { id: true, provider: true, fileName: true, mimeType: true, accessState: true, capabilityState: true, lastVerifiedAt: true } },
              },
            },
          },
        },
      },
    }),
    prisma.studioExternalMediaReference.findMany({
      where: { projectId },
      orderBy: [{ updatedAt: "desc" }, { fileName: "asc" }],
      take: 500,
      select: {
        id: true,
        provider: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        headRevisionKey: true,
        providerCreatedAt: true,
        providerModifiedAt: true,
        accessState: true,
        capabilityState: true,
        lastVerifiedAt: true,
        revision: true,
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            revisionKey: true,
            identitySha256: true,
            contentSha256: true,
            sizeBytes: true,
            sourceState: true,
            verifiedAt: true,
          },
        },
      },
    }),
  ]);
  const projectCard = (card: (typeof cards)[number]) => ({
    id: card.id,
    stableId: card.stableId,
    title: card.title,
    synopsis: card.synopsis,
    notes: card.notes,
    purpose: card.purpose,
    status: card.status,
    visibility: card.visibility,
    revision: card.revision,
    updatedAt: card.updatedAt.toISOString(),
    tags: card.tags
      .map((link) => link.tag)
      .filter((tag) => tag.isActive)
      .map(({ id, label, slug }) => ({ id, label, slug })),
    sourceRange: card.sourceRange ? {
      id: card.sourceRange.id,
      startSeconds: card.sourceRange.startSeconds,
      endSeconds: card.sourceRange.endSeconds,
      selectorSha256: card.sourceRange.selectorSha256,
      reframeRecipe: card.sourceRange.reframeRecipeJson,
      sourceRevision: {
        id: card.sourceRange.sourceRevision.id,
        revisionKey: card.sourceRange.sourceRevision.revisionKey,
        identitySha256: card.sourceRange.sourceRevision.identitySha256,
        contentSha256: card.sourceRange.sourceRevision.contentSha256,
        sizeBytes: card.sourceRange.sourceRevision.sizeBytes?.toString() ?? null,
        durationSeconds: card.sourceRange.sourceRevision.durationSeconds,
        sourceState: card.sourceRange.sourceRevision.sourceState,
        verifiedAt: card.sourceRange.sourceRevision.verifiedAt?.toISOString() ?? null,
        mediaAsset: card.sourceRange.sourceRevision.mediaAsset,
        externalReference: card.sourceRange.sourceRevision.externalReference ? {
          ...card.sourceRange.sourceRevision.externalReference,
          lastVerifiedAt: card.sourceRange.sourceRevision.externalReference.lastVerifiedAt?.toISOString() ?? null,
        } : null,
      },
    } : null,
  });
  type CardRow = (typeof cards)[number];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  return {
    schema: SOURCE_STORY_SCHEMA_VERSION,
    externalSources: externalSources.map(({ revisions, ...source }) => ({
      ...source,
      sizeBytes: source.sizeBytes?.toString() ?? null,
      providerCreatedAt: source.providerCreatedAt?.toISOString() ?? null,
      providerModifiedAt: source.providerModifiedAt?.toISOString() ?? null,
      lastVerifiedAt: source.lastVerifiedAt?.toISOString() ?? null,
      latestSourceRevision: revisions[0] ? {
        ...revisions[0],
        sizeBytes: revisions[0].sizeBytes?.toString() ?? null,
        verifiedAt: revisions[0].verifiedAt?.toISOString() ?? null,
      } : null,
    })),
    cards: cards.map(projectCard),
    boards: boards.map((board) => ({
      id: board.id,
      slug: board.slug,
      title: board.title,
      description: board.description,
      kind: board.kind,
      layout: board.layout,
      revision: board.revision,
      episodeProductionId: board.episodeProductionId,
      updatedAt: board.updatedAt.toISOString(),
      placements: board.placements.map((placement) => ({
        id: placement.id,
        cardId: placement.cardId,
        groupKey: placement.groupKey,
        laneKey: placement.laneKey,
        sortOrder: placement.sortOrder,
        card: projectCard((cardById.get(placement.cardId) ?? placement.card) as CardRow),
      })),
    })),
  };
}
