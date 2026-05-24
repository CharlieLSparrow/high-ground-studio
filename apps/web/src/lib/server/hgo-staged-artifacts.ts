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
  eventCount: number;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
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

export type UpdateHgoStagedArtifactReviewResult =
  | {
      ok: true;
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

const reviewStatuses = [
  "imported",
  "needs-fixes",
  "human-review",
  "approved-for-future-staging",
  "archived",
] as const;

type HgoStagedArtifactReviewStatus = (typeof reviewStatuses)[number];

function isReviewStatus(value: string): value is HgoStagedArtifactReviewStatus {
  return reviewStatuses.includes(value as HgoStagedArtifactReviewStatus);
}

function listEvents(record: HgoStagedArtifactModel) {
  return Array.isArray(record.eventLogJson) ? record.eventLogJson : [];
}

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
    eventCount: listEvents(record).length,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    reviewedByEmail: record.reviewedByEmail,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function getPromotionReadiness({
  blockerCount,
  recommendedNextAction,
  reviewStatus,
}: {
  blockerCount: number;
  recommendedNextAction: string;
  reviewStatus: HgoStagedArtifactReviewStatus;
}) {
  if (reviewStatus === "archived") {
    return "archived";
  }

  if (
    blockerCount > 0 ||
    recommendedNextAction === "do-not-use" ||
    reviewStatus === "needs-fixes"
  ) {
    return "blocked";
  }

  if (reviewStatus === "approved-for-future-staging") {
    return "candidate";
  }

  return "review-needed";
}

function createReviewEvent({
  record,
  type,
  reviewStatus,
  promotionReadiness,
  note,
  operatorEmail,
  now,
}: {
  record: HgoStagedArtifactModel;
  type: "marked-reviewed" | "archived";
  reviewStatus: HgoStagedArtifactReviewStatus;
  promotionReadiness: string;
  note: string;
  operatorEmail: string;
  now: Date;
}) {
  const events = listEvents(record);

  return {
    eventId: `${record.recordId}-${type}-${events.length + 1}`,
    type,
    createdAt: now.toISOString(),
    reviewStatus,
    promotionReadiness,
    operatorEmail,
    note,
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

export async function markHgoStagedArtifactReviewForOwner({
  ownerEmail,
  recordId,
  reviewStatus,
  operatorEmail,
  note,
}: {
  ownerEmail: string;
  recordId: string;
  reviewStatus: string;
  operatorEmail: string;
  note?: string;
}): Promise<UpdateHgoStagedArtifactReviewResult> {
  const normalizedStatus = reviewStatus.trim();

  if (!isReviewStatus(normalizedStatus)) {
    return {
      ok: false,
      errors: [`Review status ${reviewStatus} is not supported.`],
      warnings: [],
    };
  }

  if (normalizedStatus === "archived") {
    return archiveHgoStagedArtifactForOwner({
      ownerEmail,
      recordId,
      operatorEmail,
      note,
    });
  }

  const record = await prisma.hgoStagedProjectionArtifact.findUnique({
    where: {
      ownerEmail_recordId: {
        ownerEmail,
        recordId,
      },
    },
  });

  if (!record) {
    return {
      ok: false,
      errors: ["Staged artifact record was not found."],
      warnings: [],
    };
  }

  if (record.archivedAt || record.reviewStatus === "archived") {
    return {
      ok: false,
      errors: ["Archived staged artifacts cannot be moved back into review."],
      warnings: [],
    };
  }

  const now = new Date();
  const promotionReadiness = getPromotionReadiness({
    blockerCount: record.blockerCount,
    recommendedNextAction: record.recommendedNextAction,
    reviewStatus: normalizedStatus,
  });
  const nextNote = note?.trim() || `Review status marked ${normalizedStatus}.`;
  const event = createReviewEvent({
    record,
    type: "marked-reviewed",
    reviewStatus: normalizedStatus,
    promotionReadiness,
    note: nextNote,
    operatorEmail,
    now,
  });
  const updated = await prisma.hgoStagedProjectionArtifact.update({
    where: {
      ownerEmail_recordId: {
        ownerEmail,
        recordId,
      },
    },
    data: {
      reviewStatus: normalizedStatus,
      promotionReadiness,
      note: nextNote,
      reviewedAt: now,
      reviewedByEmail: operatorEmail,
      eventLogJson: [...listEvents(record), event],
    },
  });

  return {
    ok: true,
    record: toDto(updated),
    warnings:
      promotionReadiness === "candidate"
        ? ["This is a private staging candidate only. No public page was created."]
        : [],
  };
}

export async function archiveHgoStagedArtifactForOwner({
  ownerEmail,
  recordId,
  operatorEmail,
  note,
}: {
  ownerEmail: string;
  recordId: string;
  operatorEmail: string;
  note?: string;
}): Promise<UpdateHgoStagedArtifactReviewResult> {
  const record = await prisma.hgoStagedProjectionArtifact.findUnique({
    where: {
      ownerEmail_recordId: {
        ownerEmail,
        recordId,
      },
    },
  });

  if (!record) {
    return {
      ok: false,
      errors: ["Staged artifact record was not found."],
      warnings: [],
    };
  }

  if (record.archivedAt || record.reviewStatus === "archived") {
    return {
      ok: true,
      record: toDto(record),
      warnings: ["This staged artifact was already archived."],
    };
  }

  const now = new Date();
  const nextNote = note?.trim() || "Archived private staged artifact.";
  const event = createReviewEvent({
    record,
    type: "archived",
    reviewStatus: "archived",
    promotionReadiness: "archived",
    note: nextNote,
    operatorEmail,
    now,
  });
  const updated = await prisma.hgoStagedProjectionArtifact.update({
    where: {
      ownerEmail_recordId: {
        ownerEmail,
        recordId,
      },
    },
    data: {
      reviewStatus: "archived",
      promotionReadiness: "archived",
      archivedAt: now,
      note: nextNote,
      reviewedAt: now,
      reviewedByEmail: operatorEmail,
      eventLogJson: [...listEvents(record), event],
    },
  });

  return {
    ok: true,
    record: toDto(updated),
    warnings: [],
  };
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
