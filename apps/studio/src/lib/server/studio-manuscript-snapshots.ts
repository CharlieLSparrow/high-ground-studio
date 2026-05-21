import "server-only";

import { createHash } from "node:crypto";

import type { Prisma, StudioManuscriptSnapshot } from "@prisma/client";

import {
  createManuscriptSnapshotMetadata,
  safeManuscriptDraft,
  type ManuscriptDraft,
} from "@/app/manuscript/manuscript-editor-model";
import { getPrismaClient } from "@/lib/prisma";
import { normalizeStudioAuthEmail } from "@/lib/server/studio-auth-mode";

const MAX_SNAPSHOT_DESCRIPTION_LENGTH = 500;
const MAX_SNAPSHOT_LIST_LIMIT = 25;

type StudioManuscriptSnapshotRecord = StudioManuscriptSnapshot;
export type StudioManuscriptSnapshotType = "manual";

export type StudioManuscriptSnapshotSummary = {
  id: string;
  ownerEmail: string;
  snapshotType: StudioManuscriptSnapshotType;
  title: string;
  description: string | null;
  schemaVersion: number;
  sourceFileName: string | null;
  contentHash: string | null;
  clientUpdatedAt: string | null;
  wordCount: number;
  characterCount: number;
  blockCount: number;
  structureCount: number;
  citedQuoteCount: number;
  quoteReviewCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StudioManuscriptSnapshotDetail =
  StudioManuscriptSnapshotSummary & {
    draft: ManuscriptDraft;
  };

function normalizeOwnerEmail(email: string) {
  return normalizeStudioAuthEmail(email);
}

function normalizeDescription(description: string | null | undefined) {
  const normalized = String(description ?? "").trim();

  return normalized
    ? normalized.slice(0, MAX_SNAPSHOT_DESCRIPTION_LENGTH)
    : null;
}

function parseClientUpdatedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createSnapshotContentHash(draft: ManuscriptDraft) {
  return createHash("sha256").update(JSON.stringify(draft)).digest("hex");
}

function mapSnapshotSummary(
  snapshot: StudioManuscriptSnapshotRecord,
): StudioManuscriptSnapshotSummary {
  return {
    id: snapshot.id,
    ownerEmail: snapshot.ownerEmail,
    snapshotType: "manual",
    title: snapshot.title,
    description: snapshot.description,
    schemaVersion: snapshot.schemaVersion,
    sourceFileName: snapshot.sourceFileName,
    contentHash: snapshot.contentHash,
    clientUpdatedAt: snapshot.clientUpdatedAt?.toISOString() ?? null,
    wordCount: snapshot.wordCount,
    characterCount: snapshot.characterCount,
    blockCount: snapshot.blockCount,
    structureCount: snapshot.structureCount,
    citedQuoteCount: snapshot.citedQuoteCount,
    quoteReviewCount: snapshot.quoteReviewCount,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

export async function listStudioManuscriptSnapshots(input: {
  ownerEmail: string;
  limit?: number;
}): Promise<StudioManuscriptSnapshotSummary[]> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();
  const take = Math.min(
    Math.max(Math.floor(input.limit ?? 10), 1),
    MAX_SNAPSHOT_LIST_LIMIT,
  );

  const snapshots = await prisma.studioManuscriptSnapshot.findMany({
    where: { ownerEmail },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return snapshots.map(mapSnapshotSummary);
}

export async function createStudioManuscriptSnapshot(input: {
  ownerEmail: string;
  draft: ManuscriptDraft;
  description?: string | null;
}): Promise<StudioManuscriptSnapshotSummary> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();
  const metadata = createManuscriptSnapshotMetadata(input.draft);

  const snapshot = await prisma.studioManuscriptSnapshot.create({
    data: {
      ownerEmail,
      title: metadata.title,
      description: normalizeDescription(input.description),
      schemaVersion: metadata.schemaVersion,
      sourceFileName: metadata.sourceFileName,
      draftJson: input.draft as unknown as Prisma.InputJsonValue,
      contentHash: createSnapshotContentHash(input.draft),
      clientUpdatedAt: parseClientUpdatedAt(metadata.clientUpdatedAt),
      wordCount: metadata.words,
      characterCount: metadata.characters,
      blockCount: metadata.blocks,
      structureCount: metadata.structureRegions,
      citedQuoteCount: metadata.citedQuotations,
      quoteReviewCount: metadata.quoteReviews,
    },
  });

  return mapSnapshotSummary(snapshot);
}

export async function getLatestStudioManuscriptSnapshot(input: {
  ownerEmail: string;
}): Promise<StudioManuscriptSnapshotDetail | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();

  const snapshot = await prisma.studioManuscriptSnapshot.findFirst({
    where: { ownerEmail },
    orderBy: { updatedAt: "desc" },
  });

  if (!snapshot) {
    return null;
  }

  const draft = safeManuscriptDraft(snapshot.draftJson);

  if (!draft) {
    throw new Error("Stored manuscript snapshot failed draft validation.");
  }

  return {
    ...mapSnapshotSummary(snapshot),
    draft,
  };
}

export async function getStudioManuscriptSnapshot(input: {
  ownerEmail: string;
  snapshotId: string;
}): Promise<StudioManuscriptSnapshotDetail | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const snapshotId = input.snapshotId.trim();

  if (!snapshotId) {
    return null;
  }

  const prisma = getPrismaClient();

  const snapshot = await prisma.studioManuscriptSnapshot.findFirst({
    where: { id: snapshotId, ownerEmail },
  });

  if (!snapshot) {
    return null;
  }

  const draft = safeManuscriptDraft(snapshot.draftJson);

  if (!draft) {
    throw new Error("Stored manuscript snapshot failed draft validation.");
  }

  return {
    ...mapSnapshotSummary(snapshot),
    draft,
  };
}
