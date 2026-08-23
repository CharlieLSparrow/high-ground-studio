import "server-only";

import {
  evaluateMediaVaultUploadQuota,
  MEDIA_VAULT_UPLOAD_RESERVATION_LANES,
  MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES,
  mediaVaultUploadQuotaLimits,
  mediaVaultUploadReservationBindingMismatch,
} from "./media-vault-upload-reservation-policy.js";

export const MEDIA_VAULT_PRESIGNED_RESERVATION_TTL_MS = 30 * 60 * 1_000;
export const MOBILE_CAPTURE_RESUMABLE_RESERVATION_TTL_MS =
  6 * 24 * 60 * 60 * 1_000;

export type MediaVaultUploadReservationLane =
  | typeof MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mobileCaptureResumable
  | typeof MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mediaVaultPresigned;

export type MediaVaultUploadReservationInput = {
  lane: MediaVaultUploadReservationLane;
  requestId: string;
  actorUserId: string;
  actorEmail: string;
  projectId: string;
  projectSlug: string;
  bucketName: string;
  objectPath: string;
  contentType: string;
  expectedSizeBytes: number;
  expiresAt: Date;
  metadataJson?: Record<string, unknown>;
};

export class MediaVaultUploadReservationError extends Error {
  status: number;
  code: string;
  retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      status: number;
      code: string;
      retryAfterSeconds?: number | null;
    },
  ) {
    super(message);
    this.name = "MediaVaultUploadReservationError";
    this.status = options.status;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

export function isSafeMediaVaultUploadRequestId(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function publicReservation(
  reservation: any,
  quota: any = null,
  idempotent = false,
) {
  return {
    id: reservation.id,
    requestId: reservation.requestId,
    lane: reservation.lane,
    status: reservation.status,
    expectedSizeBytes: Number(reservation.expectedSizeBytes),
    expiresAt:
      reservation.expiresAt instanceof Date
        ? reservation.expiresAt.toISOString()
        : new Date(reservation.expiresAt).toISOString(),
    completedAt:
      reservation.completedAt instanceof Date
        ? reservation.completedAt.toISOString()
        : reservation.completedAt
          ? new Date(reservation.completedAt).toISOString()
          : null,
    renewalCount: Number(reservation.renewalCount ?? 0),
    idempotent,
    quota,
  };
}

function errorCode(value: unknown) {
  return typeof value === "object" && value !== null && "code" in value
    ? String((value as { code?: unknown }).code || "")
    : "";
}

const RETRYABLE_TRANSACTION_CODES = new Set(["P2028", "P2034"]);

export function mediaVaultTransactionRetryDelayMs(
  error: unknown,
  attempt: number,
) {
  if (!RETRYABLE_TRANSACTION_CODES.has(errorCode(error)) || attempt >= 3)
    return null;
  return 75 * 2 ** Math.max(0, attempt);
}

async function serializable<T>(
  prisma: any,
  operation: (transaction: any) => Promise<T>,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
        // Participant uploads for one Session deliberately contend on the
        // same Nest quota lock. Give the preceding reservation time to commit
        // instead of turning normal two-party finalization into a 503.
        maxWait: 15_000,
        timeout: 30_000,
      });
    } catch (error) {
      lastError = error;
      const retryDelayMs = mediaVaultTransactionRetryDelayMs(error, attempt);
      if (retryDelayMs == null) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw lastError;
}

async function acquireQuotaLocks(
  transaction: any,
  actorUserId: string,
  projectId: string,
) {
  const lockKeys = [
    `quipsly-upload-actor:${actorUserId}`,
    `quipsly-upload-nest:${projectId}`,
  ].sort();
  for (const lockKey of lockKeys) {
    await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }
}

async function cleanupExpiredReservations(
  transaction: any,
  input: MediaVaultUploadReservationInput,
  now: Date,
) {
  const limits = mediaVaultUploadQuotaLimits();
  const scope = {
    OR: [{ actorUserId: input.actorUserId }, { projectId: input.projectId }],
  };
  await transaction.mediaVaultUploadReservation.updateMany({
    where: {
      ...scope,
      status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.active,
      expiresAt: { lte: now },
    },
    data: {
      status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.expired,
      expiredAt: now,
    },
  });
  await transaction.mediaVaultUploadReservation.updateMany({
    where: {
      ...scope,
      status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.expired,
      expiresAt: {
        lte: new Date(
          now.getTime() - limits.abandonAfterHours * 60 * 60 * 1_000,
        ),
      },
    },
    data: {
      status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.abandoned,
      abandonedAt: now,
      abandonedReason:
        "Upload capability expired without a verified completion receipt.",
    },
  });
}

function quotaNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : Number.MAX_SAFE_INTEGER;
}

async function currentQuotaUsage(
  transaction: any,
  input: MediaVaultUploadReservationInput,
  now: Date,
  excludeReservationId?: string,
) {
  const limits = mediaVaultUploadQuotaLimits();
  const rollingSince = new Date(
    now.getTime() - limits.rollingWindowHours * 60 * 60 * 1_000,
  );
  const issuanceSince = new Date(
    now.getTime() - limits.issuanceWindowMinutes * 60 * 1_000,
  );
  const exclude = excludeReservationId
    ? { id: { not: excludeReservationId } }
    : {};
  const actorRolling = await transaction.mediaVaultUploadReservation.aggregate({
    where: {
      actorUserId: input.actorUserId,
      issuedAt: { gte: rollingSince },
      ...exclude,
    },
    _sum: { expectedSizeBytes: true },
  });
  const nestRolling = await transaction.mediaVaultUploadReservation.aggregate({
    where: {
      projectId: input.projectId,
      issuedAt: { gte: rollingSince },
      ...exclude,
    },
    _sum: { expectedSizeBytes: true },
  });
  const actorIssuanceCount =
    await transaction.mediaVaultUploadReservation.count({
      where: {
        actorUserId: input.actorUserId,
        issuedAt: { gte: issuanceSince },
        ...exclude,
      },
    });
  const nestIssuanceCount = await transaction.mediaVaultUploadReservation.count(
    {
      where: {
        projectId: input.projectId,
        issuedAt: { gte: issuanceSince },
        ...exclude,
      },
    },
  );
  const actorActiveCount = await transaction.mediaVaultUploadReservation.count({
    where: {
      actorUserId: input.actorUserId,
      status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.active,
      expiresAt: { gt: now },
      ...exclude,
    },
  });
  const nestActiveCount = await transaction.mediaVaultUploadReservation.count({
    where: {
      projectId: input.projectId,
      status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.active,
      expiresAt: { gt: now },
      ...exclude,
    },
  });
  return {
    limits,
    actor: {
      rollingBytes: quotaNumber(actorRolling?._sum?.expectedSizeBytes),
      issuanceCount: quotaNumber(actorIssuanceCount),
      activeCount: quotaNumber(actorActiveCount),
    },
    nest: {
      rollingBytes: quotaNumber(nestRolling?._sum?.expectedSizeBytes),
      issuanceCount: quotaNumber(nestIssuanceCount),
      activeCount: quotaNumber(nestActiveCount),
    },
  };
}

function assertReservationInput(
  input: MediaVaultUploadReservationInput,
  now: Date,
) {
  if (
    !Object.values(MEDIA_VAULT_UPLOAD_RESERVATION_LANES).includes(input.lane)
  ) {
    throw new MediaVaultUploadReservationError(
      "Upload reservation lane is invalid.",
      {
        status: 400,
        code: "UPLOAD_RESERVATION_LANE_INVALID",
      },
    );
  }
  if (!isSafeMediaVaultUploadRequestId(input.requestId)) {
    throw new MediaVaultUploadReservationError(
      "Upload request ID must be a UUID.",
      {
        status: 400,
        code: "UPLOAD_RESERVATION_ID_INVALID",
      },
    );
  }
  if (
    !Number.isSafeInteger(input.expectedSizeBytes) ||
    input.expectedSizeBytes <= 0
  ) {
    throw new MediaVaultUploadReservationError(
      "Upload reservation size must be a positive exact integer.",
      {
        status: 400,
        code: "UPLOAD_RESERVATION_SIZE_INVALID",
      },
    );
  }
  if (
    !(input.expiresAt instanceof Date) ||
    !Number.isFinite(input.expiresAt.getTime()) ||
    input.expiresAt <= now
  ) {
    throw new MediaVaultUploadReservationError(
      "Upload reservation expiry must be in the future.",
      {
        status: 400,
        code: "UPLOAD_RESERVATION_EXPIRY_INVALID",
      },
    );
  }
}

export async function reserveMediaVaultUploadCapacity(
  input: MediaVaultUploadReservationInput & { prisma: any },
) {
  const now = new Date();
  assertReservationInput(input, now);
  const normalized = {
    ...input,
    requestId: input.requestId.trim().toLowerCase(),
    actorEmail: input.actorEmail.trim().toLowerCase(),
  };
  return serializable(input.prisma, async (transaction) => {
    await acquireQuotaLocks(
      transaction,
      normalized.actorUserId,
      normalized.projectId,
    );
    await cleanupExpiredReservations(transaction, normalized, now);

    const existing = await transaction.mediaVaultUploadReservation.findFirst({
      where: {
        lane: normalized.lane,
        actorUserId: normalized.actorUserId,
        requestId: normalized.requestId,
      },
    });
    if (existing) {
      const mismatch = mediaVaultUploadReservationBindingMismatch(
        existing,
        normalized,
      );
      if (mismatch) {
        throw new MediaVaultUploadReservationError(
          `Upload request ID is already bound to different ${mismatch} evidence.`,
          {
            status: 409,
            code: "UPLOAD_RESERVATION_BINDING_MISMATCH",
          },
        );
      }
      if (
        existing.status !== MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.active &&
        existing.status !== MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.completed
      ) {
        if (
          existing.lane !==
          MEDIA_VAULT_UPLOAD_RESERVATION_LANES.mobileCaptureResumable
        ) {
          throw new MediaVaultUploadReservationError(
            "This exact upload request expired or was abandoned. Start a fresh request with a new UUID.",
            {
              status: 410,
              code: "UPLOAD_RESERVATION_TERMINAL",
            },
          );
        }
        const renewalUsage = await currentQuotaUsage(
          transaction,
          normalized,
          now,
          existing.id,
        );
        const renewalDecision: any = evaluateMediaVaultUploadQuota({
          requestedSizeBytes: normalized.expectedSizeBytes,
          actor: renewalUsage.actor,
          nest: renewalUsage.nest,
          limits: renewalUsage.limits,
        });
        if (!renewalDecision.allowed) {
          throw new MediaVaultUploadReservationError(renewalDecision.message, {
            status: 429,
            code: renewalDecision.code,
            retryAfterSeconds: renewalDecision.retryAfterSeconds,
          });
        }
        const renewed = await transaction.mediaVaultUploadReservation.update({
          where: { id: existing.id },
          data: {
            status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.active,
            expiresAt: normalized.expiresAt,
            expiredAt: null,
            abandonedAt: null,
            abandonedReason: null,
            issuedAt: now,
            renewedAt: now,
            renewalCount: { increment: 1 },
            metadataJson: normalized.metadataJson ?? existing.metadataJson,
          },
        });
        return publicReservation(renewed, {
          actor: renewalDecision.actor,
          nest: renewalDecision.nest,
          limits: renewalUsage.limits,
        });
      }
      return publicReservation(existing, null, true);
    }

    const objectReservation =
      await transaction.mediaVaultUploadReservation.findFirst({
        where: {
          bucketName: normalized.bucketName,
          objectPath: normalized.objectPath,
        },
      });
    if (objectReservation) {
      throw new MediaVaultUploadReservationError(
        "The requested vault object is already reserved by another upload.",
        {
          status: 409,
          code: "UPLOAD_OBJECT_ALREADY_RESERVED",
        },
      );
    }

    const usage = await currentQuotaUsage(transaction, normalized, now);
    const decision: any = evaluateMediaVaultUploadQuota({
      requestedSizeBytes: normalized.expectedSizeBytes,
      actor: usage.actor,
      nest: usage.nest,
      limits: usage.limits,
    });
    if (!decision.allowed) {
      throw new MediaVaultUploadReservationError(decision.message, {
        status: 429,
        code: decision.code,
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }

    const reservation = await transaction.mediaVaultUploadReservation.create({
      data: {
        lane: normalized.lane,
        requestId: normalized.requestId,
        actorUserId: normalized.actorUserId,
        actorEmail: normalized.actorEmail,
        projectId: normalized.projectId,
        projectSlug: normalized.projectSlug,
        bucketName: normalized.bucketName,
        objectPath: normalized.objectPath,
        contentType: normalized.contentType,
        expectedSizeBytes: BigInt(normalized.expectedSizeBytes),
        status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.active,
        expiresAt: normalized.expiresAt,
        metadataJson: normalized.metadataJson ?? {},
        issuedAt: now,
      },
    });
    return publicReservation(reservation, {
      actor: decision.actor,
      nest: decision.nest,
      limits: usage.limits,
    });
  });
}

export async function completeMediaVaultUploadReservation(input: {
  prisma: any;
  lane: MediaVaultUploadReservationLane;
  actorUserId: string;
  bucketName: string;
  objectPath: string;
  completedSizeBytes: number;
  generation: string;
  completionSource: string;
  completionEvidenceJson?: Record<string, unknown>;
}) {
  if (
    !Number.isSafeInteger(input.completedSizeBytes) ||
    input.completedSizeBytes <= 0 ||
    !/^\d+$/.test(input.generation)
  ) {
    throw new MediaVaultUploadReservationError(
      "Verified object completion evidence is invalid.",
      {
        status: 409,
        code: "UPLOAD_RESERVATION_COMPLETION_INVALID",
      },
    );
  }
  return serializable(input.prisma, async (transaction) => {
    let reservation = await transaction.mediaVaultUploadReservation.findFirst({
      where: { bucketName: input.bucketName, objectPath: input.objectPath },
    });
    if (!reservation) {
      throw new MediaVaultUploadReservationError(
        "No durable upload reservation matches this completed object.",
        {
          status: 409,
          code: "UPLOAD_RESERVATION_REQUIRED",
        },
      );
    }
    await acquireQuotaLocks(
      transaction,
      reservation.actorUserId,
      reservation.projectId,
    );
    reservation = await transaction.mediaVaultUploadReservation.findFirst({
      where: { bucketName: input.bucketName, objectPath: input.objectPath },
    });
    if (
      !reservation ||
      reservation.actorUserId !== input.actorUserId ||
      reservation.lane !== input.lane ||
      Number(reservation.expectedSizeBytes) !== input.completedSizeBytes
    ) {
      throw new MediaVaultUploadReservationError(
        "Completed object does not match its actor-, lane-, and size-bound reservation.",
        {
          status: 409,
          code: "UPLOAD_RESERVATION_COMPLETION_MISMATCH",
        },
      );
    }
    if (
      reservation.status === MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.completed
    ) {
      if (
        Number(reservation.completedSizeBytes) !== input.completedSizeBytes ||
        reservation.completionGeneration !== input.generation
      ) {
        throw new MediaVaultUploadReservationError(
          "Completed reservation already has different immutable object evidence.",
          {
            status: 409,
            code: "UPLOAD_RESERVATION_COMPLETION_MISMATCH",
          },
        );
      }
      return publicReservation(reservation, null, true);
    }
    const completedAt = new Date();
    reservation = await transaction.mediaVaultUploadReservation.update({
      where: { id: reservation.id },
      data: {
        status: MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES.completed,
        completedSizeBytes: BigInt(input.completedSizeBytes),
        completionGeneration: input.generation,
        completionSource: input.completionSource,
        completionEvidenceJson: input.completionEvidenceJson ?? {},
        completedAt,
      },
    });
    return publicReservation(reservation);
  });
}
