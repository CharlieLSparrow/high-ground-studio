import "server-only";

import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { SourceStoryConflictError } from "@/lib/server/source-story";
import { SourceStoryContractError, stableSourceStoryJson } from "@/lib/source-story-contract";

type Database = PrismaClient | Prisma.TransactionClient;
export type SourceCollectionScope = "personal" | "project";
export type SourceCollectionTarget =
  | { kind: "source-set"; id: string }
  | { kind: "external"; id: string }
  | { kind: "asset"; id: string };

const collectionInclude = {
  items: { orderBy: [{ sortOrder: "asc" }, { targetKey: "asc" }] },
} satisfies Prisma.StudioSourceCollectionInclude;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanId(value: string, label: string) {
  const clean = value.trim();
  if (!clean || clean.length > 200) throw new SourceStoryContractError("invalid-identity", `${label} is malformed.`);
  return clean;
}

function cleanText(value: string | undefined, label: string, maximum: number, required = false) {
  const clean = (value ?? "").trim().replace(/\r\n/g, "\n");
  if (required && !clean) throw new SourceStoryContractError("missing-text", `${label} is required.`);
  if (clean.length > maximum) throw new SourceStoryContractError("text-too-long", `${label} is too long.`);
  return clean;
}

function cleanRequestId(value: string) {
  const clean = cleanId(value, "clientRequestId");
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(clean)) {
    throw new SourceStoryContractError("invalid-request-id", "The collection request identity is malformed.");
  }
  return clean;
}

function slugFrom(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!slug) throw new SourceStoryContractError("invalid-collection-slug", "The collection needs a usable title.");
  return slug;
}

function cleanScope(value: string | undefined): SourceCollectionScope {
  if (!value || value === "personal") return "personal";
  if (value === "project") return "project";
  throw new SourceStoryContractError("invalid-collection-scope", "The collection scope must be personal or shared with this Nest.");
}

function targetKey(target: SourceCollectionTarget) {
  return `${target.kind}:${target.id}`;
}

function parseTarget(kind: string, id: string): SourceCollectionTarget {
  const clean = cleanId(id, "sourceId");
  if (kind === "source-set" || kind === "external" || kind === "asset") return { kind, id: clean };
  throw new SourceStoryContractError("invalid-source-kind", "That source kind cannot be filed in a collection.");
}

function collectionSnapshot(collection: {
  id: string;
  projectId: string;
  ownerUserId: string;
  scope: string;
  slug: string;
  title: string;
  description: string;
  color: string | null;
  revision: number;
  archivedAt: Date | null;
  items: Array<{ id: string; targetKey: string; sortOrder: number; note: string }>;
}) {
  return {
    schema: "quipsly-source-collection-v1" as const,
    id: collection.id,
    projectId: collection.projectId,
    ownerUserId: collection.ownerUserId,
    scope: collection.scope as SourceCollectionScope,
    slug: collection.slug,
    title: collection.title,
    description: collection.description,
    color: collection.color,
    revision: collection.revision,
    archivedAt: collection.archivedAt?.toISOString() ?? null,
    items: collection.items
      .map(({ id, targetKey: key, sortOrder, note }) => ({ id, targetKey: key, sortOrder, note }))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.targetKey.localeCompare(right.targetKey)),
  };
}

function prismaJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function requireTargetInProject(db: Database, projectId: string, target: SourceCollectionTarget) {
  if (target.kind === "source-set") {
    const row = await db.studioMediaSourceSet.findFirst({ where: { id: target.id, projectId }, select: { id: true } });
    if (!row) throw new SourceStoryContractError("source-project-mismatch", "That camera package is unavailable in this Nest.");
    return;
  }
  if (target.kind === "external") {
    const row = await db.studioExternalMediaReference.findFirst({ where: { id: target.id, projectId }, select: { id: true } });
    if (!row) throw new SourceStoryContractError("source-project-mismatch", "That connected source is unavailable in this Nest.");
    return;
  }
  const row = await db.studioMediaAsset.findFirst({
    where: {
      id: target.id,
      OR: [
        { projects: { some: { id: projectId } } },
        { mediaBin: { projectId } },
        { assetAttachments: { some: { projectId } } },
      ],
    },
    select: { id: true },
  });
  if (!row) throw new SourceStoryContractError("source-project-mismatch", "That Quipsly media source is unavailable in this Nest.");
}

function targetColumns(target: SourceCollectionTarget) {
  return {
    sourceSetId: target.kind === "source-set" ? target.id : null,
    externalReferenceId: target.kind === "external" ? target.id : null,
    mediaAssetId: target.kind === "asset" ? target.id : null,
  };
}

function canMutateCollection(collection: { scope: string; ownerUserId: string }, actorUserId: string) {
  return collection.scope === "project" || collection.ownerUserId === actorUserId;
}

export async function readSourceCollections(prisma: PrismaClient, input: { projectId: string; actorUserId: string }) {
  const collections = await prisma.studioSourceCollection.findMany({
    where: {
      projectId: input.projectId,
      archivedAt: null,
      OR: [{ scope: "project" }, { scope: "personal", ownerUserId: input.actorUserId }],
    },
    orderBy: [{ scope: "asc" }, { updatedAt: "desc" }, { title: "asc" }],
    include: collectionInclude,
  });
  return collections.map((collection) => ({
    ...collectionSnapshot(collection),
    canEdit: canMutateCollection(collection, input.actorUserId),
    updatedAt: collection.updatedAt.toISOString(),
  }));
}

export async function createSourceCollection(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  clientRequestId: string;
  title: string;
  description?: string;
  scope?: string;
  color?: string | null;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const title = cleanText(input.title, "Collection title", 120, true);
  const description = cleanText(input.description, "Collection description", 2_000);
  const scope = cleanScope(input.scope);
  const color = cleanText(input.color ?? "", "Collection color", 40) || null;
  const slug = slugFrom(title);
  const request = { schema: "quipsly-source-collection-create-v1", projectId, actorUserId, clientRequestId, title, description, scope, color, slug };
  const requestSha256 = sha256(stableSourceStoryJson(request));

  return input.prisma.$transaction(async (tx) => {
    const replay = await tx.studioSourceCollection.findUnique({
      where: { projectId_createdByUserId_clientRequestId: { projectId, createdByUserId: actorUserId, clientRequestId } },
      include: { ...collectionInclude, operations: { where: { revision: 1 }, take: 1 } },
    });
    if (replay) {
      if (replay.operations[0]?.requestSha256 !== requestSha256) {
        throw new SourceStoryConflictError("request-reuse-conflict", "That request identity already created a different source collection.", replay.revision);
      }
      return { collection: collectionSnapshot(replay), replayed: true };
    }
    const slugConflict = await tx.studioSourceCollection.findUnique({
      where: { projectId_ownerUserId_slug: { projectId, ownerUserId: actorUserId, slug } },
      select: { id: true },
    });
    if (slugConflict) throw new SourceStoryConflictError("collection-slug-conflict", "You already have a source collection with that title.");
    const collection = await tx.studioSourceCollection.create({
      data: {
        projectId,
        ownerUserId: actorUserId,
        scope,
        slug,
        title,
        description,
        color,
        clientRequestId,
        createdByUserId: actorUserId,
      },
      include: collectionInclude,
    });
    const snapshot = collectionSnapshot(collection);
    await tx.studioSourceCollectionOperation.create({
      data: {
        collectionId: collection.id,
        revision: 1,
        previousRevision: 0,
        operation: "create-collection",
        actorUserId,
        clientRequestId,
        requestSha256,
        snapshotJson: prismaJson(snapshot),
      },
    });
    return { collection: snapshot, replayed: false };
  }, { isolationLevel: "Serializable" });
}

async function replayedOperation(tx: Prisma.TransactionClient, input: {
  collectionId: string;
  actorUserId: string;
  clientRequestId: string;
  requestSha256: string;
}) {
  const operation = await tx.studioSourceCollectionOperation.findUnique({
    where: {
      collectionId_actorUserId_clientRequestId: {
        collectionId: input.collectionId,
        actorUserId: input.actorUserId,
        clientRequestId: input.clientRequestId,
      },
    },
  });
  if (!operation) return null;
  if (operation.requestSha256 !== input.requestSha256) {
    throw new SourceStoryConflictError("request-reuse-conflict", "That request identity already changed the collection differently.", operation.revision);
  }
  const current = await tx.studioSourceCollection.findUniqueOrThrow({ where: { id: input.collectionId }, include: collectionInclude });
  return { collection: collectionSnapshot(current), replayed: true, unchanged: false };
}

export async function addSourceToCollection(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  collectionId: string;
  expectedRevision: number;
  clientRequestId: string;
  sourceKind: string;
  sourceId: string;
  note?: string;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const collectionId = cleanId(input.collectionId, "collectionId");
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const target = parseTarget(input.sourceKind, input.sourceId);
  const note = cleanText(input.note, "Source filing note", 2_000);
  const request = { schema: "quipsly-source-collection-add-v1", projectId, actorUserId, collectionId, expectedRevision: input.expectedRevision, clientRequestId, target, note };
  const requestSha256 = sha256(stableSourceStoryJson(request));

  return input.prisma.$transaction(async (tx) => {
    const replay = await replayedOperation(tx, { collectionId, actorUserId, clientRequestId, requestSha256 });
    if (replay) return replay;
    const collection = await tx.studioSourceCollection.findFirst({ where: { id: collectionId, projectId }, include: collectionInclude });
    if (!collection || collection.archivedAt) throw new SourceStoryContractError("collection-unavailable", "That source collection is unavailable.");
    if (!canMutateCollection(collection, actorUserId)) throw new SourceStoryContractError("collection-owner-required", "Only the owner can change this personal collection.");
    if (collection.revision !== input.expectedRevision) throw new SourceStoryConflictError("stale-collection-revision", "The collection changed on another device. Refresh before filing this source.", collection.revision);
    await requireTargetInProject(tx, projectId, target);
    const key = targetKey(target);
    if (collection.items.some((item) => item.targetKey === key)) {
      return { collection: collectionSnapshot(collection), replayed: false, unchanged: true };
    }
    await tx.studioSourceCollectionItem.create({
      data: {
        collectionId,
        targetKey: key,
        ...targetColumns(target),
        sortOrder: collection.items.length,
        note,
        addedByUserId: actorUserId,
      },
    });
    const revision = collection.revision + 1;
    const updated = await tx.studioSourceCollection.update({
      where: { id: collectionId },
      data: { revision, updatedByUserId: actorUserId },
      include: collectionInclude,
    });
    const snapshot = collectionSnapshot(updated);
    await tx.studioSourceCollectionOperation.create({
      data: { collectionId, revision, previousRevision: collection.revision, operation: "add-source", actorUserId, clientRequestId, requestSha256, snapshotJson: prismaJson(snapshot) },
    });
    return { collection: snapshot, replayed: false, unchanged: false };
  }, { isolationLevel: "Serializable" });
}

export async function removeSourceFromCollection(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  collectionId: string;
  expectedRevision: number;
  clientRequestId: string;
  sourceKind: string;
  sourceId: string;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const collectionId = cleanId(input.collectionId, "collectionId");
  const clientRequestId = cleanRequestId(input.clientRequestId);
  const target = parseTarget(input.sourceKind, input.sourceId);
  const request = { schema: "quipsly-source-collection-remove-v1", projectId, actorUserId, collectionId, expectedRevision: input.expectedRevision, clientRequestId, target };
  const requestSha256 = sha256(stableSourceStoryJson(request));

  return input.prisma.$transaction(async (tx) => {
    const replay = await replayedOperation(tx, { collectionId, actorUserId, clientRequestId, requestSha256 });
    if (replay) return replay;
    const collection = await tx.studioSourceCollection.findFirst({ where: { id: collectionId, projectId }, include: collectionInclude });
    if (!collection || collection.archivedAt) throw new SourceStoryContractError("collection-unavailable", "That source collection is unavailable.");
    if (!canMutateCollection(collection, actorUserId)) throw new SourceStoryContractError("collection-owner-required", "Only the owner can change this personal collection.");
    if (collection.revision !== input.expectedRevision) throw new SourceStoryConflictError("stale-collection-revision", "The collection changed on another device. Refresh before removing this source.", collection.revision);
    const key = targetKey(target);
    const item = collection.items.find((candidate) => candidate.targetKey === key);
    if (!item) return { collection: collectionSnapshot(collection), replayed: false, unchanged: true };
    await tx.studioSourceCollectionItem.delete({ where: { id: item.id } });
    const remaining = collection.items.filter((candidate) => candidate.id !== item.id);
    for (const [sortOrder, candidate] of remaining.entries()) {
      if (candidate.sortOrder !== sortOrder) await tx.studioSourceCollectionItem.update({ where: { id: candidate.id }, data: { sortOrder } });
    }
    const revision = collection.revision + 1;
    const updated = await tx.studioSourceCollection.update({ where: { id: collectionId }, data: { revision, updatedByUserId: actorUserId }, include: collectionInclude });
    const snapshot = collectionSnapshot(updated);
    await tx.studioSourceCollectionOperation.create({
      data: { collectionId, revision, previousRevision: collection.revision, operation: "remove-source", actorUserId, clientRequestId, requestSha256, snapshotJson: prismaJson(snapshot) },
    });
    return { collection: snapshot, replayed: false, unchanged: false };
  }, { isolationLevel: "Serializable" });
}
