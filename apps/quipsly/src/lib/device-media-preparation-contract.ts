import { createHash } from "node:crypto";

export const DEVICE_MEDIA_PREPARATION_RECEIPT_SCHEMA =
  "quipsly-device-media-preparation-receipt-v1" as const;
export const DEVICE_MEDIA_PREPARATION_PROFILE =
  "device-folder-exact-browse-v1" as const;

export type DeviceMediaPreparationReceipt = {
  schema: typeof DEVICE_MEDIA_PREPARATION_RECEIPT_SCHEMA;
  libraryId: string;
  deviceId: string;
  folderGrantId: string;
  externalFileId: string;
  externalReferenceId: string;
  sourceRevisionId: string;
  observedRevisionKey: string;
  expectedSizeBytes: string;
  targetLocator: string;
  contentSha256: string;
  completedAt: string;
  technical: {
    durationSeconds: number | null;
    widthPixels: number | null;
    heightPixels: number | null;
    framesPerSecond: number | null;
  };
  worker: { executionId: string; buildId: string };
};

export class DeviceMediaPreparationContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DeviceMediaPreparationContractError";
  }
}

function record(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeviceMediaPreparationContractError(
      "invalid-device-media-preparation-receipt",
      `${field} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum = 240) {
  if (typeof value !== "string" || !value.trim()) {
    throw new DeviceMediaPreparationContractError(
      "invalid-device-media-preparation-receipt",
      `${field} is required.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new DeviceMediaPreparationContractError(
      "device-media-preparation-receipt-too-large",
      `${field} is too long.`,
    );
  }
  return normalized;
}

function id(value: unknown, field: string) {
  const normalized = text(value, field, 200);
  if (!/^[A-Za-z0-9:_.-]+$/.test(normalized)) {
    throw new DeviceMediaPreparationContractError(
      "invalid-device-media-preparation-identity",
      `${field} is malformed.`,
    );
  }
  return normalized;
}

function byteCount(value: unknown, field: string) {
  const normalized = text(value, field, 32);
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new DeviceMediaPreparationContractError(
      "invalid-device-media-preparation-size",
      `${field} must be a positive integer string.`,
    );
  }
  return BigInt(normalized).toString();
}

function mediaNumber(value: unknown, field: string, integer = false) {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isInteger(value))
  ) {
    throw new DeviceMediaPreparationContractError(
      "invalid-device-media-preparation-technical-metadata",
      `${field} must be a positive ${integer ? "integer" : "number"}.`,
    );
  }
  return value;
}

function timestamp(value: unknown, field: string) {
  const normalized = text(value, field, 80);
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DeviceMediaPreparationContractError(
      "invalid-device-media-preparation-time",
      `${field} is malformed.`,
    );
  }
  return parsed.toISOString();
}

export function deviceMediaPreparationIdentity(input: {
  projectId: string;
  sourceRevisionId: string;
  observedRevisionKey: string;
}) {
  return [
    "device-media-preparation-v1",
    input.projectId,
    input.sourceRevisionId,
    input.observedRevisionKey,
    DEVICE_MEDIA_PREPARATION_PROFILE,
  ].join(":");
}

export function deviceMediaPreparationIds(identity: string) {
  const digest = createHash("sha256").update(identity).digest("hex");
  return {
    jobId: `dmpjob_${digest.slice(0, 48)}`,
    replicaId: `dmpreplica_${digest.slice(0, 48)}`,
  };
}

export function deviceMediaPreparationTargetLocator(input: {
  projectSlug: string;
  sourceRevisionId: string;
  observedRevisionKey: string;
}) {
  const revision = createHash("sha256")
    .update(input.observedRevisionKey)
    .digest("hex")
    .slice(0, 20);
  return [
    "source-cache",
    "device-folder",
    input.projectSlug,
    input.sourceRevisionId,
    `${DEVICE_MEDIA_PREPARATION_PROFILE}-${revision}.lrv`,
  ].join("/");
}

export function parseDeviceMediaPreparationReceipt(
  value: unknown,
): DeviceMediaPreparationReceipt {
  const input = record(value, "receipt");
  if (input.schema !== DEVICE_MEDIA_PREPARATION_RECEIPT_SCHEMA) {
    throw new DeviceMediaPreparationContractError(
      "unsupported-device-media-preparation-receipt",
      "The device media preparation receipt schema is unsupported.",
    );
  }
  const technical = record(input.technical, "receipt.technical");
  const worker = record(input.worker, "receipt.worker");
  const targetLocator = text(
    input.targetLocator,
    "receipt.targetLocator",
    2_000,
  );
  if (
    targetLocator.startsWith("/") ||
    targetLocator.includes("\0") ||
    targetLocator
      .split("/")
      .some((part) => !part || part === "." || part === "..") ||
    !targetLocator.endsWith(".lrv")
  ) {
    throw new DeviceMediaPreparationContractError(
      "invalid-device-media-preparation-locator",
      "The retained device replica locator must stay beneath the dedicated worker root.",
    );
  }
  const contentSha256 = text(
    input.contentSha256,
    "receipt.contentSha256",
    64,
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new DeviceMediaPreparationContractError(
      "invalid-device-media-preparation-checksum",
      "The exact device replica SHA-256 is malformed.",
    );
  }
  return {
    schema: DEVICE_MEDIA_PREPARATION_RECEIPT_SCHEMA,
    libraryId: id(input.libraryId, "receipt.libraryId"),
    deviceId: id(input.deviceId, "receipt.deviceId"),
    folderGrantId: id(input.folderGrantId, "receipt.folderGrantId"),
    externalFileId: id(input.externalFileId, "receipt.externalFileId"),
    externalReferenceId: id(
      input.externalReferenceId,
      "receipt.externalReferenceId",
    ),
    sourceRevisionId: id(input.sourceRevisionId, "receipt.sourceRevisionId"),
    observedRevisionKey: text(
      input.observedRevisionKey,
      "receipt.observedRevisionKey",
      240,
    ),
    expectedSizeBytes: byteCount(
      input.expectedSizeBytes,
      "receipt.expectedSizeBytes",
    ),
    targetLocator,
    contentSha256,
    completedAt: timestamp(input.completedAt, "receipt.completedAt"),
    technical: {
      durationSeconds: mediaNumber(
        technical.durationSeconds,
        "receipt.technical.durationSeconds",
      ),
      widthPixels: mediaNumber(
        technical.widthPixels,
        "receipt.technical.widthPixels",
        true,
      ),
      heightPixels: mediaNumber(
        technical.heightPixels,
        "receipt.technical.heightPixels",
        true,
      ),
      framesPerSecond: mediaNumber(
        technical.framesPerSecond,
        "receipt.technical.framesPerSecond",
      ),
    },
    worker: {
      executionId: id(worker.executionId, "receipt.worker.executionId"),
      buildId: text(worker.buildId, "receipt.worker.buildId", 160),
    },
  };
}
