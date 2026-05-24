import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildHgoStagedArtifactStoreRecordInput,
  type HgoStagedArtifactStoreRecordInput,
} from "@/lib/hgo/staged-artifact-store-record";

export type HgoStagedArtifactRecordDto = {
  id: string;
  ownerEmail: string;
  recordId: string;
  artifactId: string;
  projectionId: string;
  projectionSlug: string;
  projectionTitle: string;
  projectionStatus: string;
  projectionVisibility: string;
  sourceBridgeVersion: string | null;
  artifactStatus: string;
  recommendedNextAction: string;
  reviewStatus: string;
  promotionReadiness: string;
  artifactHash: string;
  blockerCount: number;
  warningCount: number;
  containsRealContent: string;
  note: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveHgoStagedArtifactResult =
  | {
      ok: true;
      created: boolean;
      record: HgoStagedArtifactRecordDto;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };

type HgoStagedArtifactModel = Awaited<
  ReturnType<typeof prisma.hgoStagedProjectionArtifact.findFirst>
> extends infer T
  ? NonNullable<T>
  : never;

function toDto(record: HgoStagedArtifactModel): HgoStagedArtifactRecordDto {
  return {
    id: record.id,
    ownerEmail: record.ownerEmail,
    recordId: record.recordId,
    artifactId: record.artifactId,
    projectionId: record.projectionId,
    projectionSlug: record.projectionSlug,
    projectionTitle: record.projectionTitle,
    projectionStatus: record.projectionStatus,
    projectionVisibility: record.projectionVisibility,
    sourceBridgeVersion: record.sourceBridgeVersion,
    artifactStatus: record.artifactStatus,
    recommendedNextAction: record.recommendedNextAction,
    reviewStatus: record.reviewStatus,
    promotionReadiness: record.promotionReadiness,
    artifactHash: record.artifactHash,
    blockerCount: record.blockerCount,
    warningCount: record.warningCount,
    containsRealContent: record.containsRealContent,
    note: record.note,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toCreateData(
  input: HgoStagedArtifactStoreRecordInput,
): Prisma.HgoStagedProjectionArtifactCreateInput {
  return {
    ownerUserId: input.ownerUserId,
    ownerEmail: input.ownerEmail,
    recordId: input.recordId,
    artifactVersion: input.artifactVersion,
    artifactId: input.artifactId,
    projectionId: input.projectionId,
    projectionSlug: input.projectionSlug,
    projectionTitle: input.projectionTitle,
    projectionStatus: input.projectionStatus,
    projectionVisibility: input.projectionVisibility,
    sourceBridgeVersion: input.sourceBridgeVersion,
    artifactStatus: input.artifactStatus,
    recommendedNextAction: input.recommendedNextAction,
    reviewStatus: input.reviewStatus,
    promotionReadiness: input.promotionReadiness,
    artifactHash: input.artifactHash,
    artifactJson: input.artifactJson,
    artifactSummaryJson: input.artifactSummaryJson,
    eventLogJson: input.eventLogJson,
    blockerCount: input.blockerCount,
    warningCount: input.warningCount,
    containsRealContent: input.containsRealContent,
    note: input.note,
  };
}

export async function listHgoStagedArtifactsForOwner({
  ownerEmail,
  includeArchived = false,
  take = 25,
}: {
  ownerEmail: string;
  includeArchived?: boolean;
  take?: number;
}) {
  const records = await prisma.hgoStagedProjectionArtifact.findMany({
    where: {
      ownerEmail,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ updatedAt: "desc" }],
    take,
  });

  return records.map(toDto);
}

export async function saveHgoStagedArtifactForOwner({
  artifactJson,
  ownerEmail,
  ownerUserId,
  note,
}: {
  artifactJson: string;
  ownerEmail: string;
  ownerUserId?: string;
  note?: string;
}): Promise<SaveHgoStagedArtifactResult> {
  const built = buildHgoStagedArtifactStoreRecordInput({
    artifactJson,
    ownerEmail,
    ownerUserId,
    note,
  });

  if (!built.ok) {
    return built;
  }

  const existing = await prisma.hgoStagedProjectionArtifact.findUnique({
    where: {
      ownerEmail_artifactHash: {
        ownerEmail,
        artifactHash: built.record.artifactHash,
      },
    },
  });

  if (existing) {
    return {
      ok: true,
      created: false,
      record: toDto(existing),
      warnings: [
        ...built.warnings,
        "This staged artifact was already saved for this operator.",
      ],
    };
  }

  const record = await prisma.hgoStagedProjectionArtifact.create({
    data: toCreateData(built.record),
  });

  return {
    ok: true,
    created: true,
    record: toDto(record),
    warnings: built.warnings,
  };
}
