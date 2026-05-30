import "server-only";

import { createHash } from "node:crypto";

import type { Prisma, StudioContentWorkspaceSnapshot } from "@prisma/client";

import {
  CONTENT_STUDIO_SCHEMA_VERSION,
  normalizeContentStudioWorkspace,
  parseContentStudioPacket,
  type ContentStudioWorkspace,
} from "@/app/content-studio/content-studio-model";
import { getPrismaClient } from "@/lib/prisma";
import { normalizeStudioAuthEmail } from "@/lib/server/studio-auth-mode";

const MAX_CONTENT_STUDIO_DESCRIPTION_LENGTH = 500;
const MAX_CONTENT_STUDIO_TITLE_LENGTH = 140;
const MAX_CONTENT_STUDIO_SNAPSHOT_LIMIT = 25;

type StudioContentWorkspaceSnapshotRecord = StudioContentWorkspaceSnapshot;

export type StudioContentWorkspaceSnapshotSummary = {
  id: string;
  ownerEmail: string;
  title: string;
  description: string | null;
  schemaVersion: number;
  contentHash: string | null;
  projectCount: number;
  activeCount: number;
  readyCount: number;
  blockedCount: number;
  clientUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioContentWorkspaceSnapshotDetail =
  StudioContentWorkspaceSnapshotSummary & {
    workspace: ContentStudioWorkspace;
  };

function normalizeOwnerEmail(email: string) {
  return normalizeStudioAuthEmail(email);
}

function normalizeTitle(title: string | null | undefined) {
  const normalized = String(title ?? "").trim();

  return (normalized || "Content Studio workspace").slice(
    0,
    MAX_CONTENT_STUDIO_TITLE_LENGTH,
  );
}

function normalizeDescription(description: string | null | undefined) {
  const normalized = String(description ?? "").trim();

  return normalized
    ? normalized.slice(0, MAX_CONTENT_STUDIO_DESCRIPTION_LENGTH)
    : null;
}

function parseClientUpdatedAt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createWorkspaceContentHash(workspace: ContentStudioWorkspace) {
  return createHash("sha256").update(JSON.stringify(workspace)).digest("hex");
}

function countWorkspaceState(workspace: ContentStudioWorkspace) {
  return workspace.projects.reduce(
    (summary, project) => {
      summary.projectCount += 1;

      if (project.status === "active") {
        summary.activeCount += 1;
      }

      if (project.status === "ready") {
        summary.readyCount += 1;
      }

      if (project.status === "blocked") {
        summary.blockedCount += 1;
      }

      return summary;
    },
    {
      projectCount: 0,
      activeCount: 0,
      readyCount: 0,
      blockedCount: 0,
    },
  );
}

function mapSnapshotSummary(
  snapshot: StudioContentWorkspaceSnapshotRecord,
): StudioContentWorkspaceSnapshotSummary {
  return {
    id: snapshot.id,
    ownerEmail: snapshot.ownerEmail,
    title: snapshot.title,
    description: snapshot.description,
    schemaVersion: snapshot.schemaVersion,
    contentHash: snapshot.contentHash,
    projectCount: snapshot.projectCount,
    activeCount: snapshot.activeCount,
    readyCount: snapshot.readyCount,
    blockedCount: snapshot.blockedCount,
    clientUpdatedAt: snapshot.clientUpdatedAt?.toISOString() ?? null,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

function parseWorkspaceJson(value: unknown): ContentStudioWorkspace {
  const result = parseContentStudioPacket(value);

  if (result.ok) {
    return result.workspace;
  }

  throw new Error(
    `Stored Content Studio workspace failed validation: ${result.errors.join(" ")}`,
  );
}

export function safeContentStudioWorkspaceInput(value: unknown) {
  const packetResult = parseContentStudioPacket(value);

  if (packetResult.ok) {
    return {
      workspace: packetResult.workspace,
      warnings: packetResult.warnings,
    };
  }

  const workspace = normalizeContentStudioWorkspace(value);

  if (workspace) {
    return {
      workspace,
      warnings: ["Received raw workspace JSON."],
    };
  }

  return {
    workspace: null,
    warnings: [],
    errors: packetResult.errors,
  };
}

export async function listStudioContentWorkspaceSnapshots(input: {
  ownerEmail: string;
  limit?: number;
}): Promise<StudioContentWorkspaceSnapshotSummary[]> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();
  const take = Math.min(
    Math.max(Math.floor(input.limit ?? 10), 1),
    MAX_CONTENT_STUDIO_SNAPSHOT_LIMIT,
  );

  const snapshots = await prisma.studioContentWorkspaceSnapshot.findMany({
    where: { ownerEmail },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return snapshots.map(mapSnapshotSummary);
}

export async function createStudioContentWorkspaceSnapshot(input: {
  ownerEmail: string;
  workspace: ContentStudioWorkspace;
  title?: string | null;
  description?: string | null;
}): Promise<StudioContentWorkspaceSnapshotSummary> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();
  const counts = countWorkspaceState(input.workspace);

  const snapshot = await prisma.studioContentWorkspaceSnapshot.create({
    data: {
      ownerEmail,
      title: normalizeTitle(input.title),
      description: normalizeDescription(input.description),
      schemaVersion: CONTENT_STUDIO_SCHEMA_VERSION,
      workspaceJson: input.workspace as unknown as Prisma.InputJsonValue,
      contentHash: createWorkspaceContentHash(input.workspace),
      clientUpdatedAt: parseClientUpdatedAt(input.workspace.updatedAt),
      ...counts,
    },
  });

  return mapSnapshotSummary(snapshot);
}

export async function getLatestStudioContentWorkspaceSnapshot(input: {
  ownerEmail: string;
}): Promise<StudioContentWorkspaceSnapshotDetail | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();

  const snapshot = await prisma.studioContentWorkspaceSnapshot.findFirst({
    where: { ownerEmail },
    orderBy: { updatedAt: "desc" },
  });

  if (!snapshot) {
    return null;
  }

  return {
    ...mapSnapshotSummary(snapshot),
    workspace: parseWorkspaceJson(snapshot.workspaceJson),
  };
}

export async function getStudioContentWorkspaceSnapshot(input: {
  ownerEmail: string;
  snapshotId: string;
}): Promise<StudioContentWorkspaceSnapshotDetail | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const snapshotId = input.snapshotId.trim();

  if (!snapshotId) {
    return null;
  }

  const prisma = getPrismaClient();

  const snapshot = await prisma.studioContentWorkspaceSnapshot.findFirst({
    where: {
      id: snapshotId,
      ownerEmail,
    },
  });

  if (!snapshot) {
    return null;
  }

  return {
    ...mapSnapshotSummary(snapshot),
    workspace: parseWorkspaceJson(snapshot.workspaceJson),
  };
}
