import "server-only";

import { createHash } from "node:crypto";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { sessionMutationAccessWhere } from "@/lib/server/session-access";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const GOOGLE_CALENDAR_CONFLICT_INTENTS = [
  "PREPARE_QUIPSLY_UPDATE",
  "STOP_PROJECTING",
] as const;

export type GoogleCalendarConflictIntent =
  (typeof GOOGLE_CALENDAR_CONFLICT_INTENTS)[number];

export class GoogleCalendarConflictReviewError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function googleCalendarConflictReason(input: {
  metadataJson?: unknown;
  latestReceiptProviderStatus?: string | null;
}) {
  const reconciliation = object(object(input.metadataJson).reconciliation);
  return text(reconciliation.reason)
    || text(input.latestReceiptProviderStatus)
    || "provider-conflict-unclassified";
}

export function googleCalendarConflictVersion(input: {
  id: string;
  sourceRevision: string;
  providerEtag?: string | null;
  status: string;
  conflictState: string;
  updatedAt: Date | string;
  reason: string;
}) {
  const updatedAt = input.updatedAt instanceof Date
    ? input.updatedAt.toISOString()
    : new Date(input.updatedAt).toISOString();
  return digest(JSON.stringify({
    projectionId: input.id,
    sourceRevision: input.sourceRevision,
    providerEtag: input.providerEtag || null,
    status: input.status,
    conflictState: input.conflictState,
    updatedAt,
    reason: input.reason,
  }));
}

export function canPrepareQuipslyCalendarUpdate(input: {
  reason: string;
  providerEventId?: string | null;
  providerEtag?: string | null;
  roomStatus?: string | null;
  roomScheduledStart?: Date | string | null;
}) {
  return ["provider-version-changed", "etag-conflict"].includes(input.reason)
    && Boolean(input.providerEventId)
    && Boolean(input.providerEtag)
    && Boolean(input.roomScheduledStart)
    && input.roomStatus !== "CANCELED";
}

export async function resolveGoogleCalendarProjectionConflict(input: {
  prisma: any;
  actor: {
    id: string;
    email: string;
    primaryEmail: string;
    isStaff: boolean;
  };
  projectionId: string;
  expectedConflictVersion: string;
  intent: GoogleCalendarConflictIntent;
  occurredAt?: Date;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const providerStatus = input.intent === "PREPARE_QUIPSLY_UPDATE"
    ? "conflict-prepared-quipsly-update"
    : "conflict-projection-stopped";

  return input.prisma.$transaction(async (transaction: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      transaction,
      `google-calendar-conflict:${input.projectionId}`,
    );
    const projection = await transaction.calendarProjection.findFirst({
      where: {
        id: input.projectionId,
        sourceType: { in: ["CallRoom", "StudioEpisodeMilestone"] },
        collection: {
          status: "ACTIVE",
          connection: {
            userId: input.actor.id,
            provider: "GOOGLE",
            connectionKind: "USER_OAUTH",
            status: "VERIFIED",
          },
        },
      },
      select: {
        id: true,
        collectionId: true,
        sourceType: true,
        sourceId: true,
        sourceRevision: true,
        providerEventId: true,
        providerEtag: true,
        status: true,
        conflictState: true,
        metadataJson: true,
        updatedAt: true,
      },
    });
    if (!projection) {
      throw new GoogleCalendarConflictReviewError(
        "That Google Calendar conflict is unavailable.",
        "calendar-conflict-not-found",
        404,
      );
    }
    const collection = await transaction.calendarCollection.findUnique({
      where: { id: projection.collectionId },
      select: { connectionId: true, nestId: true },
    });
    if (!collection) {
      throw new GoogleCalendarConflictReviewError(
        "That Google Calendar selection changed before the conflict decision.",
        "calendar-conflict-collection-changed",
        409,
      );
    }

    const priorReceipt = await transaction.calendarSyncReceipt.findFirst({
      where: {
        projectionId: projection.id,
        actorUserId: input.actor.id,
        operation: "VERIFY",
        outcome: "SUCCEEDED",
        requestDigest: input.expectedConflictVersion,
        providerStatus,
      },
      orderBy: { occurredAt: "desc" },
      select: { id: true, metadataJson: true },
    });
    if (
      priorReceipt
      && projection.conflictState === "NONE"
      && projection.status === text(object(priorReceipt.metadataJson).resultStatus)
    ) {
      const priorMetadata = object(priorReceipt.metadataJson);
      return {
        projectionId: projection.id,
        receiptId: priorReceipt.id,
        intent: input.intent,
        status: text(priorMetadata.resultStatus) || projection.status,
        idempotentReplay: true,
        externalMutated: false,
      };
    }

    if (projection.conflictState === "NONE") {
      throw new GoogleCalendarConflictReviewError(
        "That conflict has already changed. Refresh before deciding.",
        "calendar-conflict-changed",
        409,
      );
    }
    const latestConflictReceipt = await transaction.calendarSyncReceipt.findFirst({
      where: { projectionId: projection.id, outcome: "CONFLICT" },
      orderBy: { occurredAt: "desc" },
      select: { providerStatus: true },
    });
    const reason = googleCalendarConflictReason({
      metadataJson: projection.metadataJson,
      latestReceiptProviderStatus: latestConflictReceipt?.providerStatus,
    });
    const conflictVersion = googleCalendarConflictVersion({
      ...projection,
      reason,
    });
    if (conflictVersion !== input.expectedConflictVersion) {
      throw new GoogleCalendarConflictReviewError(
        "Google or Quipsly changed after this conflict was shown. Refresh before deciding.",
        "calendar-conflict-version-changed",
        409,
      );
    }

    let source: {
      projectId: string | null;
      status: string;
      startsAt: Date | null;
    } | null = null;
    if (projection.sourceType === "CallRoom") {
      const room = await transaction.callRoom.findFirst({
        where: sessionMutationAccessWhere(projection.sourceId, input.actor),
        select: { id: true, projectId: true, status: true, scheduledStart: true },
      });
      if (room) {
        source = {
          projectId: room.projectId,
          status: room.status,
          startsAt: room.scheduledStart,
        };
      }
    } else {
      const milestone = await transaction.studioEpisodeMilestone.findUnique({
        where: { id: projection.sourceId },
        select: {
          status: true,
          startsAt: true,
          episodeProduction: {
            select: { project: { select: { id: true, slug: true } } },
          },
        },
      });
      if (milestone) {
        const project = milestone.episodeProduction.project;
        const access = await resolveStudioProjectAccess({
          projectSlug: project.slug,
          email: input.actor.primaryEmail,
          action: "write",
          prisma: transaction,
        });
        if (access.allowed && access.projectId === project.id) {
          source = {
            projectId: project.id,
            status: milestone.status,
            startsAt: milestone.startsAt,
          };
        }
      }
    }
    if (!source || (collection.nestId && source.projectId !== collection.nestId)) {
      throw new GoogleCalendarConflictReviewError(
        "You need current Quipsly source edit access to resolve this calendar conflict.",
        "calendar-conflict-write-forbidden",
        403,
      );
    }
    if (
      input.intent === "PREPARE_QUIPSLY_UPDATE"
      && !canPrepareQuipslyCalendarUpdate({
        reason,
        providerEventId: projection.providerEventId,
        providerEtag: projection.providerEtag,
        roomStatus: source.status,
        roomScheduledStart: source.startsAt,
      })
    ) {
      throw new GoogleCalendarConflictReviewError(
        "This conflict cannot be safely turned into a Quipsly update preview. Stop the link or check Google again.",
        "calendar-conflict-update-unavailable",
        409,
      );
    }

    const resultStatus = input.intent === "PREPARE_QUIPSLY_UPDATE"
      ? "PLANNED"
      : "REVOKED";
    const metadataJson = {
      ...object(projection.metadataJson),
      conflictReview: {
        schema: "quipsly-google-calendar-conflict-review-v1",
        intent: input.intent,
        reason,
        reviewedAt: occurredAt.toISOString(),
        actorUserId: input.actor.id,
        externalMutated: false,
        providerContentImported: false,
      },
    };
    await transaction.calendarProjection.update({
      where: { id: projection.id },
      data: {
        status: resultStatus,
        conflictState: "NONE",
        metadataJson,
      },
    });
    const receipt = await transaction.calendarSyncReceipt.create({
      data: {
        connectionId: collection.connectionId,
        collectionId: projection.collectionId,
        projectionId: projection.id,
        actorUserId: input.actor.id,
        operation: "VERIFY",
        outcome: "SUCCEEDED",
        requestDigest: conflictVersion,
        responseDigest: digest(`${projection.id}:${resultStatus}:${input.intent}`),
        providerStatus,
        externalMutated: false,
        occurredAt,
        metadataJson: {
          schema: "quipsly-google-calendar-conflict-review-receipt-v1",
          intent: input.intent,
          reason,
          resultStatus,
          providerContentImported: false,
          providerEventIdentityExposed: false,
        },
      },
    });
    return {
      projectionId: projection.id,
      receiptId: receipt.id,
      intent: input.intent,
      status: resultStatus,
      idempotentReplay: false,
      externalMutated: false,
    };
  }, { maxWait: 10_000, timeout: 20_000, isolationLevel: "Serializable" });
}
