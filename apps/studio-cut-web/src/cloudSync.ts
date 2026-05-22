import {
  CLOUD_SYNC_REQUIRED_INPUT_ROLES,
  getMissingRequiredCloudSyncInputs,
  isCloudSyncJob,
  isCloudSyncReport,
  type CloudSyncExpectedInputs,
  type CloudSyncInputRole,
  type CloudSyncJob,
  type CloudSyncUploadedInput,
} from "@high-ground/studio-cut-schema";
import {
  buildSharedRoomUrl,
  sanitizeSharedRoomPart,
  sanitizeStorageFileName,
  type SharedRoomSelection,
} from "./sharedRoom.ts";

export const CLOUD_SYNC_ROLE_LABELS: Record<CloudSyncInputRole, string> = {
  homerVideo: "Homer video",
  charlieVideo: "Charlie video",
  homerAudio: "Homer clean audio",
  charlieAudio: "Charlie clean audio",
  phoneReferenceAudio: "Phone/reference audio",
  clipVideo: "Clip/screen video",
  other: "Other supplemental file",
};

export const CLOUD_SYNC_ROLE_HELP: Record<CloudSyncInputRole, string> = {
  homerVideo: "Insta360 export or other Homer camera source.",
  charlieVideo: "Canon R8 export or other Charlie camera source.",
  homerAudio: "DJI Mic 3 clean Homer audio.",
  charlieAudio: "Shure MV7i clean Charlie audio.",
  phoneReferenceAudio:
    "iPhone call recordings or equivalent sync reference. Multiple pieces are allowed and become a reference rail.",
  clipVideo: "Optional shared clip or screen material.",
  other: "Optional scratch/reference material for the future sync worker.",
};

export const CLOUD_SYNC_ROLE_ACCEPT: Record<CloudSyncInputRole, string> = {
  homerVideo: "video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v",
  charlieVideo: "video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v",
  homerAudio: "audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,.wav,.mp3,.m4a,.aac",
  charlieAudio: "audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,.wav,.mp3,.m4a,.aac",
  phoneReferenceAudio:
    "audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,.wav,.mp3,.m4a,.aac",
  clipVideo: "video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v",
  other: "video/*,audio/*,application/json,.mp4,.mov,.m4v,.wav,.mp3,.m4a,.aac,.json",
};

export function buildCloudSyncJobPath(syncJobId: string) {
  return `studioCutSyncJobs/${sanitizeCloudSyncId(syncJobId)}`;
}

export function buildCloudSyncUploadStoragePath({
  syncJobId,
  role,
  fileName,
  inputId,
}: {
  syncJobId: string;
  role: CloudSyncInputRole;
  fileName: string;
  inputId?: string;
}) {
  const sanitizedInputId = inputId ? `${sanitizeCloudSyncId(inputId)}-` : "";
  return `studioCutSyncJobs/${sanitizeCloudSyncId(
    syncJobId,
  )}/uploads/${role}/${sanitizedInputId}${sanitizeStorageFileName(fileName)}`;
}

export function buildCloudSyncOutputStoragePath({
  syncJobId,
  fileName,
}: {
  syncJobId: string;
  fileName: "source-monitor-proxy.mp4" | "episode-manifest.json" | "sync-report.json";
}) {
  return `studioCutSyncJobs/${sanitizeCloudSyncId(
    syncJobId,
  )}/outputs/${fileName}`;
}

export function createCloudSyncJob({
  syncJobId,
  roomSelection,
  title,
  createdBy,
  includeClip,
  now = new Date().toISOString(),
}: {
  syncJobId: string;
  roomSelection: SharedRoomSelection;
  title: string;
  createdBy: string;
  includeClip: boolean;
  now?: string;
}): CloudSyncJob {
  return {
    syncJobId: sanitizeCloudSyncId(syncJobId),
    projectId: sanitizeSharedRoomPart(roomSelection.projectId),
    branchId: sanitizeSharedRoomPart(roomSelection.branchId),
    title: title.trim() || roomSelection.projectId,
    createdBy,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    expectedInputs: createCloudSyncExpectedInputs(includeClip),
    uploadedInputs: [],
    outputs: {
      manifestStoragePath: buildCloudSyncOutputStoragePath({
        syncJobId,
        fileName: "episode-manifest.json",
      }),
      sourceMonitorProxyStoragePath: buildCloudSyncOutputStoragePath({
        syncJobId,
        fileName: "source-monitor-proxy.mp4",
      }),
      syncReportStoragePath: buildCloudSyncOutputStoragePath({
        syncJobId,
        fileName: "sync-report.json",
      }),
      sharedRoomUrl: buildSharedRoomUrl("https://high-ground-odyssey.web.app/", {
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
      }),
    },
  };
}

export function createCloudSyncExpectedInputs(includeClip: boolean) {
  return {
    homerVideo: true,
    charlieVideo: true,
    homerAudio: true,
    charlieAudio: true,
    phoneReferenceAudio: true,
    ...(includeClip ? { clipVideo: true } : {}),
  } satisfies CloudSyncExpectedInputs;
}

export function createCloudSyncJobId(projectId: string) {
  const base = sanitizeSharedRoomPart(projectId, "episode");
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z");
  const suffix =
    "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return sanitizeCloudSyncId(`${base}-${timestamp}-${suffix}`);
}

export function createCloudSyncInputId({
  role,
  fileName,
  orderIndex,
}: {
  role: CloudSyncInputRole;
  fileName: string;
  orderIndex?: number;
}) {
  const prefix =
    orderIndex === undefined ? role : `${role}-${String(orderIndex).padStart(2, "0")}`;
  const suffix =
    "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return sanitizeCloudSyncId(`${prefix}-${sanitizeStorageFileName(fileName)}-${suffix}`);
}

export function sanitizeCloudSyncId(value: string) {
  return (
    sanitizeSharedRoomPart(value, "sync-job")
      .replace(/^[._-]+|[._-]+$/g, "") || "sync-job"
  );
}

export function isRequiredCloudSyncSelectionComplete(
  selectedFiles: Partial<Record<CloudSyncInputRole, readonly File[]>>,
) {
  return CLOUD_SYNC_REQUIRED_INPUT_ROLES.every(
    (role) => (selectedFiles[role]?.length ?? 0) > 0,
  );
}

export function getMissingRequiredCloudSyncSelection(
  selectedFiles: Partial<Record<CloudSyncInputRole, readonly File[]>>,
) {
  return CLOUD_SYNC_REQUIRED_INPUT_ROLES.filter(
    (role) => (selectedFiles[role]?.length ?? 0) === 0,
  );
}

export function mergeCloudSyncUploadedInput(
  uploadedInputs: readonly CloudSyncUploadedInput[],
  uploadedInput: CloudSyncUploadedInput,
) {
  return [
    ...uploadedInputs.filter((input) => input.inputId !== uploadedInput.inputId),
    uploadedInput,
  ].sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      (left.orderIndex ?? 0) - (right.orderIndex ?? 0) ||
      left.fileName.localeCompare(right.fileName) ||
      left.inputId.localeCompare(right.inputId),
  );
}

export { getMissingRequiredCloudSyncInputs, isCloudSyncJob, isCloudSyncReport };
