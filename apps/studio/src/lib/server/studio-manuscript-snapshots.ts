import "server-only";

import { createHash } from "node:crypto";

import type {
  Prisma,
  StudioManuscript,
  StudioManuscriptKind,
  StudioManuscriptSnapshot,
} from "@prisma/client";

import {
  createManuscriptSnapshotMetadata,
  safeManuscriptDraft,
  type ManuscriptDraft,
  type StudioManuscriptLibraryKind,
} from "@/app/manuscript/manuscript-editor-model";
import { getPrismaClient } from "@/lib/prisma";
import { normalizeStudioAuthEmail } from "@/lib/server/studio-auth-mode";

const MAX_MANUSCRIPT_DESCRIPTION_LENGTH = 500;
const MAX_MANUSCRIPT_TITLE_LENGTH = 140;
const MAX_MANUSCRIPT_LIST_LIMIT = 25;
const MAX_SNAPSHOT_DESCRIPTION_LENGTH = 500;
const MAX_SNAPSHOT_LIST_LIMIT = 25;

type StudioManuscriptRecord = StudioManuscript & {
  _count?: {
    snapshots: number;
  };
  snapshots?: StudioManuscriptSnapshotRecord[];
};
type StudioManuscriptSnapshotRecord = StudioManuscriptSnapshot;
export type StudioManuscriptSnapshotType = "manual";

export type StudioManuscriptSummary = {
  id: string;
  ownerEmail: string;
  title: string;
  description: string | null;
  sourceFileName: string | null;
  kind: StudioManuscriptLibraryKind;
  snapshotCount: number;
  latestSnapshot: StudioManuscriptSnapshotSummary | null;
  lastSnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type StudioManuscriptSnapshotSummary = {
  id: string;
  manuscriptId: string | null;
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

function normalizeManuscriptId(manuscriptId: string | null | undefined) {
  const normalized = String(manuscriptId ?? "").trim();

  return normalized || null;
}

export function normalizeStudioManuscriptLiveSlug(
  slug: string | null | undefined,
) {
  const normalized = String(slug ?? "").trim().toLowerCase();

  return normalized === "latest" ? "latest" : null;
}

export function isStudioManuscriptLiveSlug(slug: string | null | undefined) {
  return normalizeStudioManuscriptLiveSlug(slug) !== null;
}

function normalizeManuscriptTitle(title: string | null | undefined) {
  const normalized = String(title ?? "").trim();

  return (normalized || "Untitled manuscript").slice(
    0,
    MAX_MANUSCRIPT_TITLE_LENGTH,
  );
}

function normalizeManuscriptKind(kind: unknown): StudioManuscriptKind {
  return kind === "SYNTHETIC" ? "SYNTHETIC" : "WORKING";
}

function normalizeSourceFileName(sourceFileName: string | null | undefined) {
  const normalized = String(sourceFileName ?? "").trim();

  return normalized ? normalized.slice(0, 260) : null;
}

function normalizeManuscriptDescription(
  description: string | null | undefined,
) {
  const normalized = String(description ?? "").trim();

  return normalized
    ? normalized.slice(0, MAX_MANUSCRIPT_DESCRIPTION_LENGTH)
    : null;
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

function mapManuscriptSummary(
  manuscript: StudioManuscriptRecord,
): StudioManuscriptSummary {
  const latestSnapshot = manuscript.snapshots?.[0] ?? null;

  return {
    id: manuscript.id,
    ownerEmail: manuscript.ownerEmail,
    title: manuscript.title,
    description: manuscript.description,
    sourceFileName: manuscript.sourceFileName,
    kind: manuscript.kind,
    snapshotCount: manuscript._count?.snapshots ?? 0,
    latestSnapshot: latestSnapshot ? mapSnapshotSummary(latestSnapshot) : null,
    lastSnapshotAt: manuscript.lastSnapshotAt?.toISOString() ?? null,
    createdAt: manuscript.createdAt.toISOString(),
    updatedAt: manuscript.updatedAt.toISOString(),
    archivedAt: manuscript.archivedAt?.toISOString() ?? null,
  };
}

function mapSnapshotSummary(
  snapshot: StudioManuscriptSnapshotRecord,
): StudioManuscriptSnapshotSummary {
  return {
    id: snapshot.id,
    manuscriptId: snapshot.manuscriptId,
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

export async function listStudioManuscripts(input: {
  ownerEmail: string;
  limit?: number;
}): Promise<StudioManuscriptSummary[]> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();
  const take = Math.min(
    Math.max(Math.floor(input.limit ?? 10), 1),
    MAX_MANUSCRIPT_LIST_LIMIT,
  );

  const manuscripts = await prisma.studioManuscript.findMany({
    where: { ownerEmail, archivedAt: null },
    orderBy: [{ updatedAt: "desc" }],
    take,
    include: {
      _count: {
        select: { snapshots: true },
      },
      snapshots: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  return manuscripts.map(mapManuscriptSummary);
}

export async function createStudioManuscript(input: {
  ownerEmail: string;
  title: string;
  description?: string | null;
  sourceFileName?: string | null;
  kind?: StudioManuscriptLibraryKind;
}): Promise<StudioManuscriptSummary> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();

  const manuscript = await prisma.studioManuscript.create({
    data: {
      ownerEmail,
      title: normalizeManuscriptTitle(input.title),
      description: normalizeManuscriptDescription(input.description),
      sourceFileName: normalizeSourceFileName(input.sourceFileName),
      kind: normalizeManuscriptKind(input.kind),
    },
    include: {
      _count: {
        select: { snapshots: true },
      },
      snapshots: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  return mapManuscriptSummary(manuscript);
}

export async function listStudioManuscriptSnapshots(input: {
  ownerEmail: string;
  limit?: number;
  manuscriptId?: string | null;
  legacyOnly?: boolean;
}): Promise<StudioManuscriptSnapshotSummary[]> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const manuscriptId = normalizeManuscriptId(input.manuscriptId);
  const prisma = getPrismaClient();
  const take = Math.min(
    Math.max(Math.floor(input.limit ?? 10), 1),
    MAX_SNAPSHOT_LIST_LIMIT,
  );

  if (manuscriptId) {
    const manuscript = await prisma.studioManuscript.findFirst({
      where: { id: manuscriptId, ownerEmail, archivedAt: null },
      select: { id: true },
    });

    if (!manuscript) {
      return [];
    }
  }

  const snapshots = await prisma.studioManuscriptSnapshot.findMany({
    where: {
      ownerEmail,
      ...(manuscriptId ? { manuscriptId } : {}),
      ...(input.legacyOnly ? { manuscriptId: null } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return snapshots.map(mapSnapshotSummary);
}

export async function createStudioManuscriptSnapshot(input: {
  ownerEmail: string;
  draft: ManuscriptDraft;
  description?: string | null;
  manuscriptId?: string | null;
}): Promise<StudioManuscriptSnapshotSummary | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const manuscriptId = normalizeManuscriptId(input.manuscriptId);
  const prisma = getPrismaClient();
  const metadata = createManuscriptSnapshotMetadata(input.draft);

  const snapshot = await prisma.$transaction(async (tx) => {
    if (manuscriptId) {
      const manuscript = await tx.studioManuscript.findFirst({
        where: { id: manuscriptId, ownerEmail, archivedAt: null },
        select: { id: true },
      });

      if (!manuscript) {
        return null;
      }
    }

    const createdSnapshot = await tx.studioManuscriptSnapshot.create({
      data: {
        manuscriptId,
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

    if (manuscriptId) {
      await tx.studioManuscript.update({
        where: { id: manuscriptId },
        data: {
          sourceFileName: metadata.sourceFileName,
          lastSnapshotAt: createdSnapshot.updatedAt,
        },
      });
    }

    return createdSnapshot;
  });

  if (!snapshot) {
    return null;
  }

  return mapSnapshotSummary(snapshot);
}

export async function getLatestStudioManuscriptSnapshot(input: {
  ownerEmail: string;
  manuscriptId?: string | null;
}): Promise<StudioManuscriptSnapshotDetail | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const manuscriptId = normalizeManuscriptId(input.manuscriptId);
  const prisma = getPrismaClient();

  if (manuscriptId) {
    const manuscript = await prisma.studioManuscript.findFirst({
      where: { id: manuscriptId, ownerEmail, archivedAt: null },
      select: { id: true },
    });

    if (!manuscript) {
      return null;
    }
  }

  const snapshot = await prisma.studioManuscriptSnapshot.findFirst({
    where: {
      ownerEmail,
      ...(manuscriptId ? { manuscriptId } : {}),
    },
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

export async function getLatestStudioManuscriptSnapshotForLiveSlug(input: {
  slug: string;
}): Promise<StudioManuscriptSnapshotDetail | null> {
  const slug = normalizeStudioManuscriptLiveSlug(input.slug);

  if (!slug) {
    return null;
  }

  const prisma = getPrismaClient();
  const snapshot = await prisma.studioManuscriptSnapshot.findFirst({
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
