import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { SourceStoryTimelineBinding, TimelineClip, TimelineState } from "@high-ground/quipsly-domain";

import {
  buildEpisodeArtifactPayload,
  episodeTimelineContentFingerprint,
  normalizeEpisodeArtifact,
  timelineStateFromEpisodeArtifact,
  type EpisodeImportedMediaAsset,
} from "@/app/(app)/episode-production/episodeArtifact";

import {
  SOURCE_STORY_SCHEMA_VERSION,
  SourceStoryContractError,
  normalizeCreateMediaSourceSetInput,
  normalizeCreateSourceStoryCardInput,
  normalizeRebindSourceStoryCardInput,
  normalizePromoteSourceStoryCardInput,
  normalizeStoryReframeRecipe,
  normalizeWithdrawSourceStoryTimelinePlacementInput,
  stableSourceStoryJson,
  storyCardPurposes,
  storyCardStatuses,
  type CreateSourceStoryCardInput,
  type CreateMediaSourceSetInput,
  type RebindSourceStoryCardInput,
  type PromoteSourceStoryCardInput,
  type WithdrawSourceStoryTimelinePlacementInput,
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

export async function createMediaSourceSet(input: {
  prisma: PrismaClient;
  actorUserId: string;
  value: CreateMediaSourceSetInput;
}) {
  const value = normalizeCreateMediaSourceSetInput(input.value);
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const requestSha256 = sha256(stableSourceStoryJson(value));

  return input.prisma.$transaction(async (tx) => {
    const replay = await tx.studioMediaSourceSet.findUnique({
      where: {
        projectId_createdByUserId_clientRequestId: {
          projectId: value.projectId,
          createdByUserId: actorUserId,
          clientRequestId: value.clientRequestId,
        },
      },
      include: { members: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] } },
    });
    if (replay) {
      const metadata = jsonRecord(replay.metadataJson);
      if (metadata?.requestSha256 !== requestSha256) {
        throw new SourceStoryConflictError("request-reuse-conflict", "That request identity already created a different source set.");
      }
      return { sourceSet: replay, replayed: true };
    }

    const revisions = await tx.studioMediaSourceRevision.findMany({
      where: { projectId: value.projectId, id: { in: value.members.map((member) => member.sourceRevisionId) } },
      select: {
        id: true,
        identitySha256: true,
        contentSha256: true,
        sizeBytes: true,
        durationSeconds: true,
        sourceState: true,
      },
    });
    if (revisions.length !== value.members.length) {
      throw new SourceStoryContractError("source-set-project-mismatch", "At least one source-set member is unavailable in this Nest.");
    }
    const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
    const clock = revisionById.get(value.sourceClockRevisionId);
    if (!clock) throw new SourceStoryContractError("source-clock-mismatch", "The source clock is unavailable in this Nest.");
    if (!clock.durationSeconds || clock.durationSeconds <= 0) {
      throw new SourceStoryContractError("source-clock-duration-missing", "The source clock needs verified duration before it can drive selections.");
    }
    const browseMember = value.members.find((member) => member.role === "browse-proxy");
    if (value.kind === "insta360-360" && (!browseMember || browseMember.sourceRevisionId !== value.sourceClockRevisionId)) {
      throw new SourceStoryContractError("insta360-browse-clock-required", "An Insta360 set must use its equirectangular browse member as the source clock.");
    }
    if (value.kind === "insta360-360" && !value.members.some((member) => member.role === "primary-original")) {
      throw new SourceStoryContractError("insta360-original-required", "An Insta360 set requires at least one exact original member.");
    }
    for (const member of value.members) {
      const revision = revisionById.get(member.sourceRevisionId)!;
      if (!revision.contentSha256 || !revision.sizeBytes || revision.sizeBytes <= BigInt(0)) {
        throw new SourceStoryContractError("source-set-member-unverified", "Every source-set member needs an exact checksum and byte count.");
      }
    }

    const identityManifest = {
      schema: "quipsly-media-source-set-v1",
      projectId: value.projectId,
      kind: value.kind,
      captureKey: value.captureKey,
      sourceClockRevisionId: value.sourceClockRevisionId,
      members: value.members.map((member) => {
        const revision = revisionById.get(member.sourceRevisionId)!;
        return {
          ...member,
          revisionIdentitySha256: revision.identitySha256,
          contentSha256: revision.contentSha256,
          sizeBytes: revision.sizeBytes!.toString(),
        };
      }),
    };
    const identitySha256 = sha256(stableSourceStoryJson(identityManifest));
    const existing = await tx.studioMediaSourceSet.findUnique({
      where: { projectId_identitySha256: { projectId: value.projectId, identitySha256 } },
      include: { members: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] } },
    });
    if (existing) return { sourceSet: existing, replayed: true };

    const sourceSet = await tx.studioMediaSourceSet.create({
      data: {
        projectId: value.projectId,
        kind: value.kind,
        captureKey: value.captureKey,
        displayName: value.displayName,
        identitySha256,
        sourceClockRevisionId: value.sourceClockRevisionId,
        completeness: "complete",
        metadataJson: {
          schema: "quipsly-media-source-set-metadata-v1",
          requestSha256,
          manifest: identityManifest,
          descriptive: value.metadata as Prisma.InputJsonValue,
        },
        clientRequestId: value.clientRequestId,
        createdByUserId: actorUserId,
        members: {
          create: value.members.map((member) => {
            const revision = revisionById.get(member.sourceRevisionId)!;
            return {
              sourceRevisionId: member.sourceRevisionId,
              role: member.role,
              ordinal: member.ordinal,
              requiredForRender: member.requiredForRender,
              memberIdentitySha256: sha256(stableSourceStoryJson({
                setIdentitySha256: identitySha256,
                ...member,
                revisionIdentitySha256: revision.identitySha256,
                contentSha256: revision.contentSha256,
              })),
              metadataJson: { sourceState: revision.sourceState },
            };
          }),
        },
      },
      include: { members: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] } },
    });
    return { sourceSet, replayed: false };
  }, { isolationLevel: "Serializable" });
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
    const source = value.mediaAssetId
      ? await ensureAssetRevision({
        db: tx,
        projectId: value.projectId,
        mediaAssetId: value.mediaAssetId,
        actorUserId,
      })
      : await (async () => {
        const revision = await tx.studioMediaSourceRevision.findFirst({
          where: {
            id: value.sourceRevisionId!,
            projectId: value.projectId,
            externalReferenceId: value.externalReferenceId!,
          },
          include: {
            externalReference: { select: { id: true } },
            derivatives: {
              where: { kind: "collaboration-proxy", status: "ready" },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, durationSeconds: true },
            },
          },
        });
        if (!revision?.externalReference) {
          throw new SourceStoryContractError("external-source-mismatch", "That external source revision is unavailable in this Nest.");
        }
        if (!revision.derivatives[0]) {
          throw new SourceStoryContractError("external-proxy-required", "A verified collaboration proxy is required before marking source-clock ranges.");
        }
        const derivativeDuration = revision.derivatives[0].durationSeconds;
        return {
          asset: null,
          revision: {
            ...revision,
            durationSeconds: revision.durationSeconds ?? derivativeDuration,
          },
        };
      })();
    if (source.revision.durationSeconds !== null && value.endSeconds > source.revision.durationSeconds + 0.001) {
      throw new SourceStoryContractError("range-past-source", "The out point is beyond the registered source duration.");
    }
    const sourceSet = value.sourceSetId ? await tx.studioMediaSourceSet.findFirst({
      where: {
        id: value.sourceSetId,
        projectId: value.projectId,
        sourceClockRevisionId: source.revision.id,
        members: { some: { sourceRevisionId: source.revision.id } },
      },
      select: { id: true, identitySha256: true, kind: true, completeness: true },
    }) : null;
    if (value.sourceSetId && !sourceSet) {
      throw new SourceStoryContractError("source-set-clock-mismatch", "That source set does not use this exact revision as its viewing clock.");
    }

    const selectorJson = {
      schema: "quipsly-media-time-selector-v1",
      sourceRevisionId: source.revision.id,
      sourceIdentitySha256: source.revision.identitySha256,
      sourceSetId: sourceSet?.id ?? null,
      sourceSetIdentitySha256: sourceSet?.identitySha256 ?? null,
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
        sourceSetId: sourceSet?.id ?? null,
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

function episodeFingerprintSha256(timeline: TimelineState) {
  return sha256(episodeTimelineContentFingerprint(timeline));
}

function episodeEndSeconds(timeline: TimelineState) {
  return timeline.clips.reduce((end, clip) => Math.max(end, clip.startIn + Math.max(clip.duration, 0.05)), 0);
}

function prismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sourceStoryPublicPlacement<T extends {
  createdAt: Date;
  updatedAt: Date;
  withdrawnAt: Date | null;
}>(placement: T) {
  return {
    ...placement,
    createdAt: placement.createdAt.toISOString(),
    updatedAt: placement.updatedAt.toISOString(),
    withdrawnAt: placement.withdrawnAt?.toISOString() ?? null,
  };
}

export async function promoteSourceStoryCardToEpisode(input: {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  value: PromoteSourceStoryCardInput;
}) {
  const value = normalizePromoteSourceStoryCardInput(input.value);
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const actorEmail = cleanText(input.actorEmail, "actorEmail", 320, true).toLowerCase();
  const requestSha256 = sha256(stableSourceStoryJson(value));

  return input.prisma.$transaction(async (tx) => {
    const replay = await tx.studioStoryTimelinePlacement.findUnique({
      where: {
        episodeProductionId_createdByUserId_clientRequestId: {
          episodeProductionId: value.episodeProductionId,
          createdByUserId: actorUserId,
          clientRequestId: value.clientRequestId,
        },
      },
      include: { operations: { where: { revision: 1 }, take: 1 } },
    });
    if (replay) {
      if (replay.operations[0]?.requestSha256 !== requestSha256) {
        throw new SourceStoryConflictError("request-reuse-conflict", "That request identity already promoted a different Story card.", replay.revision);
      }
      return { placement: sourceStoryPublicPlacement(replay), replayed: true };
    }

    const episode = await tx.studioEpisodeProduction.findFirst({
      where: { id: value.episodeProductionId, projectId: value.projectId },
      include: { project: { select: { slug: true } } },
    });
    if (!episode) throw new SourceStoryContractError("episode-project-mismatch", "That Episode is unavailable in this Nest.");

    const currentArtifact = normalizeEpisodeArtifact(episode.timelineJson);
    const timeline = timelineStateFromEpisodeArtifact(episode.timelineJson);
    const beforeFingerprint = episodeFingerprintSha256(timeline);
    if (beforeFingerprint !== value.expectedTimelineFingerprint) {
      throw new SourceStoryConflictError("stale-episode-timeline", "The Episode timeline changed before this card could be promoted.");
    }

    const card = await tx.studioStoryCard.findFirst({
      where: { id: value.cardId, projectId: value.projectId, archivedAt: null },
      include: {
        sourceRange: {
          include: {
            sourceSet: { select: { id: true, kind: true, identitySha256: true, completeness: true } },
            sourceRevision: {
              include: {
                mediaAsset: { select: { id: true, filename: true, url: true, mimeType: true, sizeBytes: true, duration: true } },
                externalReference: { select: { id: true, provider: true, fileName: true, mimeType: true, accessState: true } },
                derivatives: {
                  where: { kind: "collaboration-proxy", status: "ready" },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { id: true, profile: true, contentSha256: true, sizeBytes: true, mimeType: true, durationSeconds: true },
                },
              },
            },
          },
        },
      },
    });
    if (!card?.sourceRange) throw new SourceStoryContractError("story-card-source-missing", "That Story card no longer resolves to an immutable source range.");
    const range = card.sourceRange;
    const revision = range.sourceRevision;
    if (!revision.contentSha256 || !SHA256.test(revision.contentSha256)) {
      throw new SourceStoryContractError("source-checksum-required", "The exact Story source must be checksum-verified before timeline promotion.");
    }
    if (!(revision.sourceState === "available" || revision.sourceState === "checksum-bound")) {
      throw new SourceStoryContractError("source-unavailable", "The exact Story source is not currently available for editing.");
    }
    const derivative = revision.derivatives[0] ?? null;
    if (revision.externalReference && !derivative) {
      throw new SourceStoryContractError("external-proxy-required", "A verified collaboration proxy is required before an external Story source can enter an Episode.");
    }
    if (!revision.mediaAsset && !revision.externalReference) {
      throw new SourceStoryContractError("source-resolution-missing", "The retained Story source has no resolvable asset or provider reference.");
    }
    if (range.sourceSet && range.sourceSet.completeness !== "complete") {
      throw new SourceStoryContractError("source-set-incomplete", "Complete the multi-file camera package before timeline promotion.");
    }

    let originBoardPlacement: { id: string; boardId: string } | null = null;
    if (value.originBoardPlacementId) {
      originBoardPlacement = await tx.studioStoryBoardPlacement.findFirst({
        where: {
          id: value.originBoardPlacementId,
          boardId: value.originBoardId!,
          cardId: card.id,
          board: { projectId: value.projectId, archivedAt: null },
        },
        select: { id: true, boardId: true },
      });
      if (!originBoardPlacement) throw new SourceStoryContractError("board-placement-mismatch", "That card is no longer in the selected Story board position.");
    } else if (value.originBoardId) {
      const board = await tx.studioStoryBoard.findFirst({ where: { id: value.originBoardId, projectId: value.projectId, archivedAt: null }, select: { id: true } });
      if (!board) throw new SourceStoryContractError("board-project-mismatch", "That Story board is unavailable in this Nest.");
    }

    const duration = Math.max(0.05, range.endSeconds - range.startSeconds);
    const episodeStartSeconds = value.placementMode === "append"
      ? episodeEndSeconds(timeline)
      : value.episodeStartSeconds!;
    const placementId = randomUUID();
    const clipId = `source-story:${placementId}`;
    const importedAssetId = `source-story-source:${revision.id}`;
    const promotedAt = new Date().toISOString();
    const reframeRecipe = normalizeStoryReframeRecipe(
      range.reframeRecipeJson as Parameters<typeof normalizeStoryReframeRecipe>[0],
      { startSeconds: range.startSeconds, endSeconds: range.endSeconds },
    );
    const sourceStory: SourceStoryTimelineBinding = {
      schema: "quipsly-source-story-timeline-binding-v1",
      placementId,
      cardId: card.id,
      cardStableId: card.stableId,
      cardRevision: card.revision,
      sourceRangeId: range.id,
      selectorSha256: range.selectorSha256,
      sourceRevisionId: revision.id,
      sourceIdentitySha256: revision.identitySha256,
      sourceContentSha256: revision.contentSha256,
      sourceSetId: range.sourceSet?.id ?? null,
      sourceSetIdentitySha256: range.sourceSet?.identitySha256 ?? null,
      externalReferenceId: revision.externalReference?.id ?? null,
      browseDerivative: derivative ? {
        id: derivative.id,
        profile: derivative.profile,
        contentSha256: derivative.contentSha256,
        sizeBytes: derivative.sizeBytes.toString(),
        mimeType: derivative.mimeType,
      } : null,
      reframeRecipe,
      promotedAt,
      promotedByUserId: actorUserId,
      promotedByEmail: actorEmail,
      boundaries: {
        sourceMediaUnchanged: true,
        browseDerivativeIsNotOriginal: true,
        sourceClockPreserved: true,
        finalRenderMustResolveExactSource: true,
        publicationNotStarted: true,
      },
    };
    const transforms = reframeRecipe?.keyframes.map((keyframe, index) => ({
      id: `${clipId}:reframe:${index}`,
      timeOffset: Math.max(0, keyframe.sourceSeconds - range.startSeconds),
      scale: keyframe.fieldOfViewDegrees,
      x: keyframe.panDegrees,
      y: keyframe.tiltDegrees,
      rotation: keyframe.rollDegrees,
      easing: keyframe.interpolation === "ease" ? "ease-in-out" as const : "linear" as const,
    })) ?? [];
    const clip: TimelineClip = {
      id: clipId,
      assetId: importedAssetId,
      sourceId: revision.id,
      kind: "video",
      trackId: value.trackId,
      startIn: episodeStartSeconds,
      duration,
      sourceStart: range.startSeconds,
      sourceEnd: range.endSeconds,
      name: card.title,
      color: "#7c3aed",
      transforms,
      generatedFrom: "quipsly-source-story-promotion-v1",
      sourceStory,
    };
    const nextTimeline: TimelineState = { ...timeline, clips: [...timeline.clips, clip] };
    const afterFingerprint = episodeFingerprintSha256(nextTimeline);
    const playbackUrl = derivative
      ? `/api/media/derivatives/${encodeURIComponent(derivative.id)}`
      : revision.mediaAsset!.url;
    const importedMedia: EpisodeImportedMediaAsset = {
      id: importedAssetId,
      sourceId: revision.id,
      projectSlug: episode.project.slug,
      episodeSlug: episode.slug,
      originalName: revision.externalReference?.fileName ?? revision.mediaAsset?.filename ?? card.title,
      contentType: derivative?.mimeType ?? revision.mediaAsset?.mimeType ?? revision.externalReference?.mimeType ?? "video/mp4",
      size: Number(derivative?.sizeBytes ?? revision.mediaAsset?.sizeBytes ?? BigInt(0)),
      kind: "video",
      is360: Boolean(reframeRecipe || range.sourceSet?.kind === "insta360-360"),
      originalFormat: revision.externalReference?.fileName.split(".").pop()?.toLowerCase() ?? revision.mediaAsset?.filename.split(".").pop()?.toLowerCase() ?? "",
      bucketName: "",
      objectName: derivative?.id ?? revision.mediaAsset?.id ?? revision.id,
      gcsUri: "",
      playbackUrl,
      importedAt: promotedAt,
      source: "source-story",
      importRole: "story-select",
      metadata: { sourceStory: prismaJson(sourceStory) as Record<string, unknown> },
      sync: { status: "synced", anchorTimelineSeconds: episodeStartSeconds, targetClipId: clipId, source: "source-story-promotion", syncedAt: promotedAt },
      proxy: derivative ? {
        status: "external-preview",
        proxyUrl: playbackUrl,
        proxyAssetId: derivative.id,
        sourceId: revision.id,
        profile: derivative.profile,
        sourceOriginalPreserved: true,
        immutableObjectEvidence: { contentSha256: derivative.contentSha256, sizeBytes: derivative.sizeBytes.toString() },
        note: "Collaboration proxy only; final render resolves the exact retained source binding.",
      } : { status: "not-required", sourceOriginalPreserved: true },
    };
    const priorImported = currentArtifact?.importedMedia ?? [];
    const nextImported = [...priorImported.filter((asset) => asset.id !== importedAssetId), importedMedia];
    const artifact = buildEpisodeArtifactPayload({
      timeline: nextTimeline,
      projectSlug: episode.project.slug,
      episodeSlug: episode.slug,
      generatedFrom: "quipsly-source-story-promotion-v1",
      savedAt: promotedAt,
      source: "quipsly-editor",
    });
    artifact.importedMedia = nextImported;
    const priorProduction = jsonRecord(episode.productionJson) ?? {};
    const productionJson = {
      ...priorProduction,
      episodeProductionPayloadVersion: 1,
      projectSlug: artifact.projectSlug,
      episodeSlug: episode.slug,
      importedMedia: nextImported,
      timelineClips: artifact.timelineClips,
      lastSourceStoryPromotion: {
        placementId,
        cardId: card.id,
        clipId,
        promotedAt,
        sourceMediaUnchanged: true,
        publicationNotStarted: true,
      },
    };
    const sourceSnapshot = {
      schema: "quipsly-source-story-promotion-snapshot-v1",
      card: { id: card.id, stableId: card.stableId, revision: card.revision, title: card.title, purpose: card.purpose },
      range: { id: range.id, selectorSha256: range.selectorSha256, startSeconds: range.startSeconds, endSeconds: range.endSeconds },
      sourceStory,
      importedMedia,
    };

    await tx.studioEpisodeProduction.update({
      where: { id: episode.id },
      data: { timelineJson: prismaJson(artifact), transcriptJson: prismaJson(artifact), productionJson: prismaJson(productionJson) },
    });
    const placement = await tx.studioStoryTimelinePlacement.create({
      data: {
        id: placementId,
        projectId: value.projectId,
        episodeProductionId: episode.id,
        cardId: card.id,
        sourceRangeId: range.id,
        originBoardId: value.originBoardId,
        originBoardPlacementId: originBoardPlacement?.id ?? null,
        clipId,
        trackId: value.trackId,
        episodeStartSeconds,
        durationSeconds: duration,
        timelineFingerprintBeforeSha256: beforeFingerprint,
        timelineFingerprintAfterSha256: afterFingerprint,
        sourceSnapshotJson: prismaJson(sourceSnapshot),
        timelineClipJson: prismaJson(clip),
        clientRequestId: value.clientRequestId,
        createdByUserId: actorUserId,
        createdByEmail: actorEmail,
        updatedByUserId: actorUserId,
        operations: { create: {
          revision: 1,
          previousRevision: 0,
          operation: "promote",
          actorUserId,
          clientRequestId: value.clientRequestId,
          requestSha256,
          snapshotJson: prismaJson({ sourceSnapshot, beforeFingerprint, afterFingerprint, episodeUpdatedAt: promotedAt }),
        } },
      },
    });
    return { placement: sourceStoryPublicPlacement(placement), replayed: false, episode: { id: episode.id, slug: episode.slug, timelineFingerprint: afterFingerprint } };
  }, { isolationLevel: "Serializable" });
}

export async function withdrawSourceStoryTimelinePlacement(input: {
  prisma: PrismaClient;
  actorUserId: string;
  value: WithdrawSourceStoryTimelinePlacementInput;
}) {
  const value = normalizeWithdrawSourceStoryTimelinePlacementInput(input.value);
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const requestSha256 = sha256(stableSourceStoryJson(value));

  return input.prisma.$transaction(async (tx) => {
    const placement = await tx.studioStoryTimelinePlacement.findFirst({
      where: { id: value.placementId, projectId: value.projectId },
      include: {
        episodeProduction: { include: { project: { select: { slug: true } } } },
        operations: { where: { actorUserId, clientRequestId: value.clientRequestId }, take: 1 },
      },
    });
    if (!placement) throw new SourceStoryContractError("timeline-placement-missing", "That Story timeline placement is unavailable in this Nest.");
    const replay = placement.operations[0];
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new SourceStoryConflictError("request-reuse-conflict", "That request identity already changed this placement differently.", placement.revision);
      return { placement: sourceStoryPublicPlacement(placement), replayed: true };
    }
    if (placement.revision !== value.expectedRevision) throw new SourceStoryConflictError("stale-timeline-placement", "That timeline placement changed before it could be withdrawn.", placement.revision);
    if (placement.status !== "active") throw new SourceStoryConflictError("timeline-placement-not-active", "That Story clip is already withdrawn.", placement.revision);

    const episode = placement.episodeProduction;
    const currentArtifact = normalizeEpisodeArtifact(episode.timelineJson);
    const timeline = timelineStateFromEpisodeArtifact(episode.timelineJson);
    const beforeFingerprint = episodeFingerprintSha256(timeline);
    if (beforeFingerprint !== value.expectedTimelineFingerprint) throw new SourceStoryConflictError("stale-episode-timeline", "The Episode timeline changed before this Story clip could be withdrawn.");
    if (!timeline.clips.some((clip) => clip.id === placement.clipId)) throw new SourceStoryConflictError("timeline-clip-missing", "The canonical Episode no longer contains this placement clip.", placement.revision);

    const nextTimeline = { ...timeline, clips: timeline.clips.filter((clip) => clip.id !== placement.clipId) };
    const storedClip = jsonRecord(placement.timelineClipJson);
    const importedAssetId = typeof storedClip?.assetId === "string" ? storedClip.assetId : "";
    const assetStillUsed = nextTimeline.clips.some((clip) => clip.assetId === importedAssetId);
    const nextImported = (currentArtifact?.importedMedia ?? []).filter((asset) => assetStillUsed || asset.id !== importedAssetId);
    const withdrawnAt = new Date().toISOString();
    const artifact = buildEpisodeArtifactPayload({
      timeline: nextTimeline,
      projectSlug: episode.project.slug,
      episodeSlug: episode.slug,
      generatedFrom: "quipsly-source-story-withdrawal-v1",
      savedAt: withdrawnAt,
      source: "quipsly-editor",
    });
    artifact.importedMedia = nextImported;
    const priorProduction = jsonRecord(episode.productionJson) ?? {};
    const productionJson = {
      ...priorProduction,
      importedMedia: nextImported,
      timelineClips: artifact.timelineClips,
      lastSourceStoryWithdrawal: { placementId: placement.id, clipId: placement.clipId, withdrawnAt, sourceMediaUnchanged: true, publicationNotStarted: true },
    };
    const afterFingerprint = episodeFingerprintSha256(nextTimeline);
    const nextRevision = placement.revision + 1;
    await tx.studioEpisodeProduction.update({ where: { id: episode.id }, data: { timelineJson: prismaJson(artifact), transcriptJson: prismaJson(artifact), productionJson: prismaJson(productionJson) } });
    const updated = await tx.studioStoryTimelinePlacement.update({
      where: { id: placement.id },
      data: {
        status: "withdrawn",
        revision: nextRevision,
        timelineFingerprintAfterSha256: afterFingerprint,
        withdrawnAt: new Date(withdrawnAt),
        updatedByUserId: actorUserId,
        operations: { create: {
          revision: nextRevision,
          previousRevision: placement.revision,
          operation: "withdraw",
          actorUserId,
          clientRequestId: value.clientRequestId,
          requestSha256,
          snapshotJson: prismaJson({ beforeFingerprint, afterFingerprint, clipId: placement.clipId, withdrawnAt }),
        } },
      },
    });
    return { placement: sourceStoryPublicPlacement(updated), replayed: false, episode: { id: episode.id, slug: episode.slug, timelineFingerprint: afterFingerprint } };
  }, { isolationLevel: "Serializable" });
}

export async function readSourceStoryWorkspace(prisma: PrismaClient, projectId: string) {
  const derivativeSelect = {
    id: true,
    kind: true,
    profile: true,
    sizeBytes: true,
    mimeType: true,
    durationSeconds: true,
    widthPixels: true,
    heightPixels: true,
    framesPerSecond: true,
    createdAt: true,
  } as const;
  const [boards, cards, externalSources, externalProxyJobs, sourceSets, episodes, timelinePlacements] = await Promise.all([
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
                    sourceSet: { select: { id: true, kind: true, captureKey: true, displayName: true, identitySha256: true, completeness: true } },
                    sourceRevision: {
                      include: {
                        mediaAsset: { select: { id: true, filename: true, url: true, mimeType: true, duration: true, thumbnailUrl: true } },
                        externalReference: { select: { id: true, provider: true, fileName: true, mimeType: true, accessState: true, capabilityState: true, lastVerifiedAt: true } },
                        derivatives: { where: { kind: "collaboration-proxy", status: "ready" }, orderBy: { createdAt: "desc" }, take: 1, select: derivativeSelect },
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
            sourceSet: { select: { id: true, kind: true, captureKey: true, displayName: true, identitySha256: true, completeness: true } },
            sourceRevision: {
              include: {
                mediaAsset: { select: { id: true, filename: true, url: true, mimeType: true, duration: true, thumbnailUrl: true } },
                externalReference: { select: { id: true, provider: true, fileName: true, mimeType: true, accessState: true, capabilityState: true, lastVerifiedAt: true } },
                derivatives: { where: { kind: "collaboration-proxy", status: "ready" }, orderBy: { createdAt: "desc" }, take: 1, select: derivativeSelect },
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
            durationSeconds: true,
            widthPixels: true,
            heightPixels: true,
            framesPerSecond: true,
            derivatives: { where: { kind: "collaboration-proxy", status: "ready" }, orderBy: { createdAt: "desc" }, take: 1, select: derivativeSelect },
          },
        },
      },
    }),
    prisma.studioWorkflowJob.findMany({
      where: { projectId, type: "external-source-proxy", source: "source-story.external-proxy" },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { id: true, status: true, inputJson: true, resultJson: true, error: true, updatedAt: true },
    }),
    prisma.studioMediaSourceSet.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { displayName: "asc" }],
      take: 500,
      select: {
        id: true,
        kind: true,
        captureKey: true,
        displayName: true,
        identitySha256: true,
        completeness: true,
        createdAt: true,
        sourceClockRevision: {
          select: {
            id: true,
            durationSeconds: true,
            widthPixels: true,
            heightPixels: true,
            framesPerSecond: true,
            externalReference: { select: { id: true, fileName: true, provider: true } },
            derivatives: { where: { kind: "collaboration-proxy", status: "ready" }, orderBy: { createdAt: "desc" }, take: 1, select: derivativeSelect },
          },
        },
        members: {
          orderBy: [{ role: "asc" }, { ordinal: "asc" }],
          select: {
            id: true,
            role: true,
            ordinal: true,
            requiredForRender: true,
            memberIdentitySha256: true,
            sourceRevision: {
              select: {
                id: true,
                contentSha256: true,
                sizeBytes: true,
                durationSeconds: true,
                sourceState: true,
                externalReference: { select: { id: true, provider: true, fileName: true, mimeType: true, accessState: true } },
              },
            },
          },
        },
      },
    }),
    prisma.studioEpisodeProduction.findMany({
      where: { projectId },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      take: 500,
      select: { id: true, slug: true, title: true, status: true, timelineJson: true, updatedAt: true },
    }),
    prisma.studioStoryTimelinePlacement.findMany({
      where: { projectId },
      orderBy: [{ updatedAt: "desc" }, { episodeStartSeconds: "asc" }],
      take: 1_000,
      select: {
        id: true,
        episodeProductionId: true,
        cardId: true,
        sourceRangeId: true,
        originBoardId: true,
        originBoardPlacementId: true,
        clipId: true,
        trackId: true,
        episodeStartSeconds: true,
        durationSeconds: true,
        status: true,
        revision: true,
        timelineFingerprintBeforeSha256: true,
        timelineFingerprintAfterSha256: true,
        createdByEmail: true,
        withdrawnAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const publicDerivative = (derivative: {
    id: string;
    kind: string;
    profile: string;
    sizeBytes: bigint;
    mimeType: string;
    durationSeconds: number | null;
    widthPixels: number | null;
    heightPixels: number | null;
    framesPerSecond: number | null;
    createdAt: Date;
  } | undefined) => derivative ? {
    ...derivative,
    sizeBytes: derivative.sizeBytes.toString(),
    createdAt: derivative.createdAt.toISOString(),
    playbackUrl: `/api/media/derivatives/${encodeURIComponent(derivative.id)}`,
  } : null;
  const jobBySourceRevisionId = new Map<string, { id: string; status: string; failureCode: string | null; updatedAt: string }>();
  for (const job of externalProxyJobs) {
    const manifest = jsonRecord(job.inputJson);
    const source = jsonRecord(manifest?.source);
    const sourceRevisionId = typeof source?.sourceRevisionId === "string" ? source.sourceRevisionId : "";
    if (!sourceRevisionId || jobBySourceRevisionId.has(sourceRevisionId)) continue;
    const result = jsonRecord(job.resultJson);
    const failure = jsonRecord(result?.failure);
    jobBySourceRevisionId.set(sourceRevisionId, {
      id: job.id,
      status: job.status,
      failureCode: typeof failure?.code === "string" ? failure.code : null,
      updatedAt: job.updatedAt.toISOString(),
    });
  }
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
      sourceSet: card.sourceRange.sourceSet,
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
        collaborationProxy: publicDerivative(card.sourceRange.sourceRevision.derivatives[0]),
      },
    } : null,
  });
  type CardRow = (typeof cards)[number];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  return {
    schema: SOURCE_STORY_SCHEMA_VERSION,
    episodes: episodes.map((episode) => {
      const timeline = timelineStateFromEpisodeArtifact(episode.timelineJson);
      return {
        id: episode.id,
        slug: episode.slug,
        title: episode.title,
        status: episode.status,
        updatedAt: episode.updatedAt.toISOString(),
        timelineFingerprint: episodeFingerprintSha256(timeline),
        timelineDurationSeconds: episodeEndSeconds(timeline),
        clipCount: timeline.clips.length,
      };
    }),
    timelinePlacements: timelinePlacements.map((placement) => ({
      ...placement,
      withdrawnAt: placement.withdrawnAt?.toISOString() ?? null,
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
    })),
    sourceSets: sourceSets.map((sourceSet) => ({
      id: sourceSet.id,
      kind: sourceSet.kind,
      captureKey: sourceSet.captureKey,
      displayName: sourceSet.displayName,
      identitySha256: sourceSet.identitySha256,
      completeness: sourceSet.completeness,
      createdAt: sourceSet.createdAt.toISOString(),
      sourceClockRevision: {
        id: sourceSet.sourceClockRevision.id,
        durationSeconds: sourceSet.sourceClockRevision.durationSeconds,
        widthPixels: sourceSet.sourceClockRevision.widthPixels,
        heightPixels: sourceSet.sourceClockRevision.heightPixels,
        framesPerSecond: sourceSet.sourceClockRevision.framesPerSecond,
        externalReference: sourceSet.sourceClockRevision.externalReference,
        collaborationProxy: publicDerivative(sourceSet.sourceClockRevision.derivatives[0]),
      },
      members: sourceSet.members.map((member) => ({
        ...member,
        sourceRevision: {
          ...member.sourceRevision,
          sizeBytes: member.sourceRevision.sizeBytes?.toString() ?? null,
        },
      })),
    })),
    externalSources: externalSources.map(({ revisions, ...source }) => ({
      ...source,
      sizeBytes: source.sizeBytes?.toString() ?? null,
      providerCreatedAt: source.providerCreatedAt?.toISOString() ?? null,
      providerModifiedAt: source.providerModifiedAt?.toISOString() ?? null,
      lastVerifiedAt: source.lastVerifiedAt?.toISOString() ?? null,
      latestSourceRevision: revisions[0] ? {
        ...revisions[0],
        derivatives: undefined,
        sizeBytes: revisions[0].sizeBytes?.toString() ?? null,
        verifiedAt: revisions[0].verifiedAt?.toISOString() ?? null,
        collaborationProxy: publicDerivative(revisions[0].derivatives[0]),
        proxyJob: jobBySourceRevisionId.get(revisions[0].id) ?? null,
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
