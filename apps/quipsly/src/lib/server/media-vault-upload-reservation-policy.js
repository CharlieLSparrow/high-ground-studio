export const MEDIA_VAULT_UPLOAD_RESERVATION_LANES = Object.freeze({
  mobileCaptureResumable: "MOBILE_CAPTURE_RESUMABLE",
  mediaVaultPresigned: "MEDIA_VAULT_PRESIGNED",
});

export const MEDIA_VAULT_UPLOAD_RESERVATION_STATUSES = Object.freeze({
  active: "ACTIVE",
  completed: "COMPLETED",
  expired: "EXPIRED",
  abandoned: "ABANDONED",
});

const GIB = 1024 * 1024 * 1024;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function mediaVaultUploadQuotaLimits(environment = process.env) {
  return Object.freeze({
    rollingWindowHours: boundedInteger(
      environment.QUIPSLY_UPLOAD_ROLLING_WINDOW_HOURS,
      24,
      1,
      24 * 30,
    ),
    issuanceWindowMinutes: boundedInteger(
      environment.QUIPSLY_UPLOAD_ISSUANCE_WINDOW_MINUTES,
      60,
      1,
      24 * 60,
    ),
    actorRollingBytes: boundedInteger(
      environment.QUIPSLY_UPLOAD_ACTOR_ROLLING_BYTES,
      20 * GIB,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    nestRollingBytes: boundedInteger(
      environment.QUIPSLY_UPLOAD_NEST_ROLLING_BYTES,
      100 * GIB,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    actorIssuanceLimit: boundedInteger(
      environment.QUIPSLY_UPLOAD_ACTOR_ISSUANCE_LIMIT,
      30,
      1,
      100_000,
    ),
    nestIssuanceLimit: boundedInteger(
      environment.QUIPSLY_UPLOAD_NEST_ISSUANCE_LIMIT,
      150,
      1,
      1_000_000,
    ),
    actorActiveLimit: boundedInteger(
      environment.QUIPSLY_UPLOAD_ACTOR_ACTIVE_LIMIT,
      5,
      1,
      10_000,
    ),
    nestActiveLimit: boundedInteger(
      environment.QUIPSLY_UPLOAD_NEST_ACTIVE_LIMIT,
      25,
      1,
      100_000,
    ),
    abandonAfterHours: boundedInteger(
      environment.QUIPSLY_UPLOAD_ABANDON_AFTER_HOURS,
      24,
      1,
      24 * 30,
    ),
  });
}

export function mediaVaultUploadReservationBindingMismatch(existing, requested) {
  const comparisons = [
    ["lane", existing?.lane, requested?.lane],
    ["requestId", existing?.requestId, requested?.requestId],
    ["actorUserId", existing?.actorUserId, requested?.actorUserId],
    ["actorEmail", String(existing?.actorEmail || "").toLowerCase(), String(requested?.actorEmail || "").toLowerCase()],
    ["projectId", existing?.projectId, requested?.projectId],
    ["projectSlug", existing?.projectSlug, requested?.projectSlug],
    ["bucketName", existing?.bucketName, requested?.bucketName],
    ["objectPath", existing?.objectPath, requested?.objectPath],
    ["contentType", existing?.contentType, requested?.contentType],
    ["expectedSizeBytes", Number(existing?.expectedSizeBytes), Number(requested?.expectedSizeBytes)],
  ];
  const mismatch = comparisons.find(([, current, next]) => current !== next);
  return mismatch ? String(mismatch[0]) : null;
}

function denied(dimension, metric, code, message, retryAfterSeconds) {
  return {
    allowed: false,
    dimension,
    metric,
    code,
    message,
    retryAfterSeconds,
  };
}

/**
 * Pure quota evaluation. Usage values describe already-issued reservations;
 * the requested bytes/reservation are added exactly once when allowed.
 */
export function evaluateMediaVaultUploadQuota({ requestedSizeBytes, actor, nest, limits }) {
  const requested = Number(requestedSizeBytes);
  if (!Number.isSafeInteger(requested) || requested <= 0) {
    return denied("request", "bytes", "UPLOAD_RESERVATION_SIZE_INVALID", "Upload reservation size must be a positive exact integer.", 0);
  }

  if (Number(actor.rollingBytes || 0) + requested > limits.actorRollingBytes) {
    return denied("actor", "rolling-bytes", "UPLOAD_ACTOR_ROLLING_BYTES_EXCEEDED", "This account has reached its rolling upload byte allowance.", limits.rollingWindowHours * 3600);
  }
  if (Number(nest.rollingBytes || 0) + requested > limits.nestRollingBytes) {
    return denied("nest", "rolling-bytes", "UPLOAD_NEST_ROLLING_BYTES_EXCEEDED", "This Nest has reached its rolling upload byte allowance.", limits.rollingWindowHours * 3600);
  }
  if (Number(actor.issuanceCount || 0) + 1 > limits.actorIssuanceLimit) {
    return denied("actor", "issuance-rate", "UPLOAD_ACTOR_ISSUANCE_RATE_EXCEEDED", "This account is requesting upload capabilities too quickly.", limits.issuanceWindowMinutes * 60);
  }
  if (Number(nest.issuanceCount || 0) + 1 > limits.nestIssuanceLimit) {
    return denied("nest", "issuance-rate", "UPLOAD_NEST_ISSUANCE_RATE_EXCEEDED", "This Nest is requesting upload capabilities too quickly.", limits.issuanceWindowMinutes * 60);
  }
  if (Number(actor.activeCount || 0) + 1 > limits.actorActiveLimit) {
    return denied("actor", "active-reservations", "UPLOAD_ACTOR_ACTIVE_RESERVATIONS_EXCEEDED", "Finish or let an existing account upload reservation expire before starting another.", 60);
  }
  if (Number(nest.activeCount || 0) + 1 > limits.nestActiveLimit) {
    return denied("nest", "active-reservations", "UPLOAD_NEST_ACTIVE_RESERVATIONS_EXCEEDED", "Finish or let an existing Nest upload reservation expire before starting another.", 60);
  }

  return {
    allowed: true,
    actor: {
      rollingBytes: Number(actor.rollingBytes || 0) + requested,
      issuanceCount: Number(actor.issuanceCount || 0) + 1,
      activeCount: Number(actor.activeCount || 0) + 1,
    },
    nest: {
      rollingBytes: Number(nest.rollingBytes || 0) + requested,
      issuanceCount: Number(nest.issuanceCount || 0) + 1,
      activeCount: Number(nest.activeCount || 0) + 1,
    },
  };
}
