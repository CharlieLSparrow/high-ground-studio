import { createHash } from "node:crypto";

import {
  planGoogleDriveMediaFolder,
  planGoogleDriveMediaLibrary,
  type GoogleDriveFolderMediaItem,
  type GoogleDriveMediaLibraryPlan,
} from "@/lib/google-drive-media-package";

export const DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA =
  "quipsly-device-media-folder-observation-v1" as const;

export type DeviceMediaFolderObservation = {
  schema: typeof DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA;
  deviceId: string;
  folderGrantId: string;
  root: { id: string; name: string };
  batches: Array<{
    id: string;
    name: string;
    files: Array<{
      id: string;
      name: string;
      mimeType: string | null;
      sizeBytes: string;
      createdTime: string | null;
      modifiedTime: string;
      durationSeconds: number | null;
      widthPixels: number | null;
      heightPixels: number | null;
    }>;
  }>;
};

export class DeviceMediaFolderContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DeviceMediaFolderContractError";
  }
}

function record(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeviceMediaFolderContractError(
      "invalid-device-folder-observation",
      `${field} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new DeviceMediaFolderContractError(
      "invalid-device-folder-observation",
      `${field} is required.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new DeviceMediaFolderContractError(
      "device-folder-observation-too-large",
      `${field} is too long.`,
    );
  }
  return normalized;
}

function opaqueId(value: unknown, field: string) {
  const normalized = text(value, field, 160);
  if (!/^[a-zA-Z0-9._:-]+$/.test(normalized)) {
    throw new DeviceMediaFolderContractError(
      "invalid-device-folder-identity",
      `${field} is malformed.`,
    );
  }
  return normalized;
}

function displayName(value: unknown, field: string) {
  const normalized = text(value, field, 240);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("\0")
  ) {
    throw new DeviceMediaFolderContractError(
      "device-folder-path-disallowed",
      `${field} must be a single display name, not a filesystem path.`,
    );
  }
  return normalized;
}

function nullableText(value: unknown, field: string, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, field, maximum);
}

function timestamp(value: unknown, field: string, required: boolean) {
  if (!required && (value === null || value === undefined || value === ""))
    return null;
  const normalized = text(value, field, 80);
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DeviceMediaFolderContractError(
      "invalid-device-folder-time",
      `${field} is malformed.`,
    );
  }
  return parsed.toISOString();
}

function positiveNumber(value: unknown, field: string, integer = false) {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isInteger(value))
  ) {
    throw new DeviceMediaFolderContractError(
      "invalid-device-folder-media-metadata",
      `${field} must be a positive ${integer ? "integer" : "number"}.`,
    );
  }
  return value;
}

function byteCount(value: unknown, field: string) {
  const normalized = text(value, field, 32);
  if (!/^\d+$/.test(normalized)) {
    throw new DeviceMediaFolderContractError(
      "invalid-device-folder-size",
      `${field} must be a non-negative integer string.`,
    );
  }
  return BigInt(normalized).toString();
}

function revisionKey(file: {
  id: string;
  sizeBytes: string;
  modifiedTime: string;
}) {
  return `device-metadata:${createHash("sha256")
    .update(`${file.id}:${file.sizeBytes}:${file.modifiedTime}`)
    .digest("hex")}`;
}

export function parseDeviceMediaFolderObservation(
  value: unknown,
): DeviceMediaFolderObservation {
  const input = record(value, "observation");
  if (input.schema !== DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA) {
    throw new DeviceMediaFolderContractError(
      "unsupported-device-folder-observation",
      "The device folder observation schema is unsupported.",
    );
  }
  const rootInput = record(input.root, "observation.root");
  if (!Array.isArray(input.batches) || input.batches.length > 1_000) {
    throw new DeviceMediaFolderContractError(
      "device-folder-observation-too-large",
      "A device folder observation may contain at most 1,000 capture folders.",
    );
  }
  let totalFiles = 0;
  const batches = input.batches.map((candidate, batchIndex) => {
    const batch = record(candidate, `observation.batches[${batchIndex}]`);
    if (!Array.isArray(batch.files)) {
      throw new DeviceMediaFolderContractError(
        "invalid-device-folder-observation",
        `observation.batches[${batchIndex}].files must be a list.`,
      );
    }
    totalFiles += batch.files.length;
    if (totalFiles > 20_000) {
      throw new DeviceMediaFolderContractError(
        "device-folder-observation-too-large",
        "A device folder observation may contain at most 20,000 files.",
      );
    }
    return {
      id: opaqueId(batch.id, `observation.batches[${batchIndex}].id`),
      name: displayName(
        batch.name,
        `observation.batches[${batchIndex}].name`,
      ),
      files: batch.files.map((candidateFile, fileIndex) => {
        const file = record(
          candidateFile,
          `observation.batches[${batchIndex}].files[${fileIndex}]`,
        );
        return {
          id: opaqueId(
            file.id,
            `observation.batches[${batchIndex}].files[${fileIndex}].id`,
          ),
          name: displayName(
            file.name,
            `observation.batches[${batchIndex}].files[${fileIndex}].name`,
          ),
          mimeType: nullableText(
            file.mimeType,
            `observation.batches[${batchIndex}].files[${fileIndex}].mimeType`,
            160,
          ),
          sizeBytes: byteCount(
            file.sizeBytes,
            `observation.batches[${batchIndex}].files[${fileIndex}].sizeBytes`,
          ),
          createdTime: timestamp(
            file.createdTime,
            `observation.batches[${batchIndex}].files[${fileIndex}].createdTime`,
            false,
          ),
          modifiedTime: timestamp(
            file.modifiedTime,
            `observation.batches[${batchIndex}].files[${fileIndex}].modifiedTime`,
            true,
          )!,
          durationSeconds: positiveNumber(
            file.durationSeconds,
            `observation.batches[${batchIndex}].files[${fileIndex}].durationSeconds`,
          ),
          widthPixels: positiveNumber(
            file.widthPixels,
            `observation.batches[${batchIndex}].files[${fileIndex}].widthPixels`,
            true,
          ),
          heightPixels: positiveNumber(
            file.heightPixels,
            `observation.batches[${batchIndex}].files[${fileIndex}].heightPixels`,
            true,
          ),
        };
      }),
    };
  });
  const observation = {
    schema: DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA,
    deviceId: opaqueId(input.deviceId, "observation.deviceId"),
    folderGrantId: opaqueId(
      input.folderGrantId,
      "observation.folderGrantId",
    ),
    root: {
      id: opaqueId(rootInput.id, "observation.root.id"),
      name: displayName(rootInput.name, "observation.root.name"),
    },
    batches,
  } satisfies DeviceMediaFolderObservation;
  const ids = new Set<string>();
  for (const batch of observation.batches) {
    if (ids.has(batch.id))
      throw new DeviceMediaFolderContractError(
        "duplicate-device-folder-identity",
        "The observation repeats a capture-folder identity.",
      );
    ids.add(batch.id);
    for (const file of batch.files) {
      if (ids.has(file.id))
        throw new DeviceMediaFolderContractError(
          "duplicate-device-folder-identity",
          "The observation repeats a file identity.",
        );
      ids.add(file.id);
    }
  }
  return observation;
}

export function planDeviceMediaFolderObservation(
  observation: DeviceMediaFolderObservation,
): GoogleDriveMediaLibraryPlan {
  return planGoogleDriveMediaLibrary({
    rootFolderId: observation.root.id,
    rootFolderName: observation.root.name,
    batches: observation.batches.map((batch) =>
      planGoogleDriveMediaFolder({
        folderId: batch.id,
        folderName: batch.name,
        files: batch.files.map(
          (file): GoogleDriveFolderMediaItem => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            headRevisionId: revisionKey(file),
            md5Checksum: null,
            resourceKey: null,
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            driveId: null,
            durationSeconds: file.durationSeconds,
            widthPixels: file.widthPixels,
            heightPixels: file.heightPixels,
            canDownload: true,
            canCopy: false,
            canReadRevisions: false,
          }),
        ),
      }),
    ),
  });
}
