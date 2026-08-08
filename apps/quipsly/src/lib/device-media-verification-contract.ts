import { createHash } from "node:crypto";

export const DEVICE_MEDIA_VERIFICATION_RECEIPT_SCHEMA =
  "quipsly-device-media-verification-receipt-v1" as const;
export const DEVICE_MEDIA_VERIFICATION_PROFILE =
  "device-folder-in-place-sha256-v1" as const;

export type DeviceMediaVerificationReceipt = {
  schema: typeof DEVICE_MEDIA_VERIFICATION_RECEIPT_SCHEMA;
  libraryId: string;
  deviceId: string;
  folderGrantId: string;
  externalFileId: string;
  externalReferenceId: string;
  sourceRevisionId: string;
  observedRevisionKey: string;
  expectedSizeBytes: string;
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

export class DeviceMediaVerificationContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DeviceMediaVerificationContractError";
  }
}

function record(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeviceMediaVerificationContractError(
      "invalid-device-media-verification-receipt",
      `${field} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum = 240) {
  if (typeof value !== "string" || !value.trim()) {
    throw new DeviceMediaVerificationContractError(
      "invalid-device-media-verification-receipt",
      `${field} is required.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new DeviceMediaVerificationContractError(
      "device-media-verification-receipt-too-large",
      `${field} is too long.`,
    );
  }
  return normalized;
}

function id(value: unknown, field: string) {
  const normalized = text(value, field, 200);
  if (!/^[A-Za-z0-9:_.-]+$/.test(normalized)) {
    throw new DeviceMediaVerificationContractError(
      "invalid-device-media-verification-identity",
      `${field} is malformed.`,
    );
  }
  return normalized;
}

function byteCount(value: unknown, field: string) {
  const normalized = text(value, field, 32);
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new DeviceMediaVerificationContractError(
      "invalid-device-media-verification-size",
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
    throw new DeviceMediaVerificationContractError(
      "invalid-device-media-verification-technical-metadata",
      `${field} must be a positive ${integer ? "integer" : "number"}.`,
    );
  }
  return value;
}

function timestamp(value: unknown, field: string) {
  const normalized = text(value, field, 80);
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DeviceMediaVerificationContractError(
      "invalid-device-media-verification-time",
      `${field} is malformed.`,
    );
  }
  return parsed.toISOString();
}

export function deviceMediaVerificationIdentity(input: {
  projectId: string;
  sourceRevisionId: string;
  observedRevisionKey: string;
}) {
  return [
    "device-media-verification-v1",
    input.projectId,
    input.sourceRevisionId,
    input.observedRevisionKey,
    DEVICE_MEDIA_VERIFICATION_PROFILE,
  ].join(":");
}

export function deviceMediaVerificationJobId(identity: string) {
  return `dmvjob_${createHash("sha256").update(identity).digest("hex").slice(0, 48)}`;
}

export function parseDeviceMediaVerificationReceipt(
  value: unknown,
): DeviceMediaVerificationReceipt {
  const input = record(value, "receipt");
  if (input.schema !== DEVICE_MEDIA_VERIFICATION_RECEIPT_SCHEMA) {
    throw new DeviceMediaVerificationContractError(
      "unsupported-device-media-verification-receipt",
      "The device media verification receipt schema is unsupported.",
    );
  }
  for (const forbidden of [
    "path",
    "sourcePath",
    "localPath",
    "locator",
    "relativeLocator",
    "targetLocator",
  ]) {
    if (Object.prototype.hasOwnProperty.call(input, forbidden)) {
      throw new DeviceMediaVerificationContractError(
        "device-media-verification-location-disclosed",
        "An in-place verification receipt must not disclose a local filesystem location.",
      );
    }
  }
  const technical = record(input.technical, "receipt.technical");
  const worker = record(input.worker, "receipt.worker");
  const contentSha256 = text(
    input.contentSha256,
    "receipt.contentSha256",
    64,
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new DeviceMediaVerificationContractError(
      "invalid-device-media-verification-checksum",
      "The in-place source SHA-256 is malformed.",
    );
  }
  return {
    schema: DEVICE_MEDIA_VERIFICATION_RECEIPT_SCHEMA,
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
