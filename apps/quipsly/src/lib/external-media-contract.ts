export const EXTERNAL_MEDIA_SCHEMA_VERSION =
  "quipsly-external-media-v1" as const;

export const externalMediaAccessStates = [
  "available",
  "restricted",
  "missing",
  "revoked",
] as const;
export type ExternalMediaAccessState =
  (typeof externalMediaAccessStates)[number];

export const externalMediaCapabilityStates = [
  "downloadable",
  "metadata-only",
  "needs-reauth",
  "unavailable",
] as const;
export type ExternalMediaCapabilityState =
  (typeof externalMediaCapabilityStates)[number];

export const externalMediaMemberRoles = [
  "browse-proxy",
  "primary-original",
  "secondary-original",
] as const;
export type ExternalMediaMemberRole = (typeof externalMediaMemberRoles)[number];

export function externalMediaMemberRole(
  value: unknown,
): ExternalMediaMemberRole | null {
  // Early Drive fixtures called the canonical original "full-original".
  // Normalize it at projection boundaries so persisted history stays readable
  // while every current camera/package surface speaks the same role language.
  if (value === "full-original") return "primary-original";
  return externalMediaMemberRoles.includes(value as ExternalMediaMemberRole)
    ? (value as ExternalMediaMemberRole)
    : null;
}

export type VerifiedExternalMediaFile = {
  provider: string;
  connectionKey: string;
  externalFileId: string;
  sharedDriveId?: string | null;
  resourceKey?: string | null;
  localPath?: string | null;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: string | number | bigint | null;
  headRevisionKey?: string | null;
  checksumSha256?: string | null;
  checksumMd5?: string | null;
  durationSeconds?: number | null;
  widthPixels?: number | null;
  heightPixels?: number | null;
  framesPerSecond?: number | null;
  mediaProjection?: "flat" | "equirectangular" | "dual-fisheye";
  projectionMetadata?: Record<string, unknown>;
  providerCreatedAt?: string | Date | null;
  providerModifiedAt?: string | Date | null;
  accessState: ExternalMediaAccessState;
  capabilityState: ExternalMediaCapabilityState;
  canDownload: boolean;
  canReadRevisions: boolean;
  canCopy: boolean;
  downloadRestrictionReason?: string | null;
};

export type AttachVerifiedExternalMediaInput = {
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  sourceUnitId?: string | null;
  connectionId?: string | null;
  clientRequestId: string;
  expectedReferenceRevision?: number | null;
  operation: "attach" | "refresh";
  verifiedFile: VerifiedExternalMediaFile;
};

export class ExternalMediaContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExternalMediaContractError";
  }
}

function text(value: unknown, field: string, max: number, required = false) {
  if (typeof value !== "string") {
    if (!required && (value === null || value === undefined)) return "";
    throw new ExternalMediaContractError(
      "invalid-text",
      `${field} must be text.`,
    );
  }
  const normalized = value.trim();
  if (required && !normalized)
    throw new ExternalMediaContractError(
      "required-text",
      `${field} is required.`,
    );
  if (normalized.length > max)
    throw new ExternalMediaContractError(
      "text-too-long",
      `${field} is too long.`,
    );
  return normalized;
}

function opaqueId(value: unknown, field: string) {
  const normalized = text(value, field, 512, true);
  if (!/^[a-zA-Z0-9._:@/-]+$/.test(normalized)) {
    throw new ExternalMediaContractError(
      "invalid-id",
      `${field} is malformed.`,
    );
  }
  return normalized;
}

function requestId(value: unknown) {
  const normalized = text(value, "clientRequestId", 64, true).toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalized,
    )
  ) {
    throw new ExternalMediaContractError(
      "invalid-request-id",
      "The request identity must be a UUID.",
    );
  }
  return normalized;
}

function checksum(value: unknown, field: string, length: number) {
  const normalized = text(value, field, length, false).toLowerCase();
  if (!normalized) return null;
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(normalized)) {
    throw new ExternalMediaContractError(
      "invalid-checksum",
      `${field} is malformed.`,
    );
  }
  return normalized;
}

function byteCount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed =
      typeof value === "bigint" ? value : BigInt(value as string | number);
    if (parsed < BigInt(0)) throw new Error("negative");
    return parsed;
  } catch {
    throw new ExternalMediaContractError(
      "invalid-size",
      "sizeBytes must be a non-negative integer.",
    );
  }
}

function date(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    value instanceof Date ? value : new Date(text(value, field, 80, true));
  if (!Number.isFinite(parsed.getTime()))
    throw new ExternalMediaContractError(
      "invalid-date",
      `${field} is malformed.`,
    );
  return parsed;
}

function finiteMediaNumber(value: unknown, field: string, integer = false) {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isInteger(value))
  ) {
    throw new ExternalMediaContractError(
      "invalid-media-metadata",
      `${field} must be a positive ${integer ? "integer" : "number"}.`,
    );
  }
  return value;
}

export function normalizeAttachVerifiedExternalMediaInput(
  value: AttachVerifiedExternalMediaInput,
) {
  const file = value.verifiedFile;
  if (!externalMediaAccessStates.includes(file.accessState)) {
    throw new ExternalMediaContractError(
      "invalid-access-state",
      "The provider access state is unsupported.",
    );
  }
  if (!externalMediaCapabilityStates.includes(file.capabilityState)) {
    throw new ExternalMediaContractError(
      "invalid-capability-state",
      "The provider capability state is unsupported.",
    );
  }
  if (value.operation !== "attach" && value.operation !== "refresh") {
    throw new ExternalMediaContractError(
      "invalid-operation",
      "The external media operation is unsupported.",
    );
  }
  const expectedReferenceRevision = value.expectedReferenceRevision ?? null;
  if (
    value.operation === "refresh" &&
    (!Number.isInteger(expectedReferenceRevision) ||
      Number(expectedReferenceRevision) < 1)
  ) {
    throw new ExternalMediaContractError(
      "missing-reference-revision",
      "The current external reference revision is required for refresh.",
    );
  }
  if (value.operation === "attach" && expectedReferenceRevision !== null) {
    throw new ExternalMediaContractError(
      "unexpected-reference-revision",
      "A first attachment cannot claim an existing reference revision.",
    );
  }
  if (
    file.capabilityState === "downloadable" &&
    (!file.canDownload || file.accessState !== "available")
  ) {
    throw new ExternalMediaContractError(
      "capability-contradiction",
      "Downloadable media must have available access and download capability.",
    );
  }
  if (
    file.mediaProjection &&
    !(["flat", "equirectangular", "dual-fisheye"] as const).includes(
      file.mediaProjection,
    )
  ) {
    throw new ExternalMediaContractError(
      "invalid-media-projection",
      "The media projection is unsupported.",
    );
  }
  const provider = opaqueId(file.provider.toLowerCase(), "provider");
  const localPath = text(file.localPath, "localPath", 4_096) || null;
  if (
    localPath &&
    (provider !== "local-file-vault" ||
      !localPath.startsWith("/") ||
      localPath.includes("\0") ||
      localPath.split("/").includes(".."))
  ) {
    throw new ExternalMediaContractError(
      "invalid-local-locator",
      "Only the trusted local-file-vault adapter may retain an absolute local source path.",
    );
  }
  return {
    schema: EXTERNAL_MEDIA_SCHEMA_VERSION,
    projectId: opaqueId(value.projectId, "projectId"),
    actorUserId: opaqueId(value.actorUserId, "actorUserId"),
    actorEmail: text(value.actorEmail, "actorEmail", 320, true).toLowerCase(),
    sourceUnitId: value.sourceUnitId
      ? opaqueId(value.sourceUnitId, "sourceUnitId")
      : null,
    connectionId: value.connectionId
      ? opaqueId(value.connectionId, "connectionId")
      : null,
    clientRequestId: requestId(value.clientRequestId),
    expectedReferenceRevision,
    operation: value.operation,
    verifiedFile: {
      provider,
      connectionKey: opaqueId(file.connectionKey, "connectionKey"),
      externalFileId: opaqueId(file.externalFileId, "externalFileId"),
      sharedDriveId: file.sharedDriveId
        ? opaqueId(file.sharedDriveId, "sharedDriveId")
        : null,
      resourceKey: file.resourceKey
        ? opaqueId(file.resourceKey, "resourceKey")
        : null,
      localPath,
      fileName: text(file.fileName, "fileName", 1_024, true),
      mimeType: text(file.mimeType, "mimeType", 255) || null,
      sizeBytes: byteCount(file.sizeBytes),
      headRevisionKey: file.headRevisionKey
        ? opaqueId(file.headRevisionKey, "headRevisionKey")
        : null,
      checksumSha256: checksum(file.checksumSha256, "checksumSha256", 64),
      checksumMd5: checksum(file.checksumMd5, "checksumMd5", 32),
      durationSeconds: finiteMediaNumber(
        file.durationSeconds,
        "durationSeconds",
      ),
      widthPixels: finiteMediaNumber(file.widthPixels, "widthPixels", true),
      heightPixels: finiteMediaNumber(file.heightPixels, "heightPixels", true),
      framesPerSecond: finiteMediaNumber(
        file.framesPerSecond,
        "framesPerSecond",
      ),
      mediaProjection: file.mediaProjection ?? "flat",
      projectionMetadata:
        file.projectionMetadata &&
        typeof file.projectionMetadata === "object" &&
        !Array.isArray(file.projectionMetadata)
          ? file.projectionMetadata
          : {},
      providerCreatedAt: date(file.providerCreatedAt, "providerCreatedAt"),
      providerModifiedAt: date(file.providerModifiedAt, "providerModifiedAt"),
      accessState: file.accessState,
      capabilityState: file.capabilityState,
      canDownload: file.canDownload,
      canReadRevisions: file.canReadRevisions,
      canCopy: file.canCopy,
      downloadRestrictionReason:
        text(
          file.downloadRestrictionReason,
          "downloadRestrictionReason",
          1_000,
        ) || null,
    },
  };
}
