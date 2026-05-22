import {
  isEpisodeManifest,
  type EpisodeManifest,
  type SyncMap,
  type CloudSyncReport,
} from "@high-ground/studio-cut-schema";

export type SharedRoomSelection = {
  projectId: string;
  branchId: string;
};

export type SharedRoomMetadata = {
  projectId: string;
  branchId: string;
  title: string;
  manifest: EpisodeManifest;
  sourceMonitorProxyStoragePath: string;
  sourceMonitorProxyFileName: string;
  sourceMonitorProxyContentType: string;
  sourceMonitorProxySizeBytes: number;
  packageKind?: "prepared_proxy" | "rescue_sync_generated";
  syncJobId?: string;
  manifestStoragePath?: string;
  syncMapStoragePath?: string;
  syncReportStoragePath?: string;
  generatedByWorkerVersion?: string;
  packageCreatedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
};

export function buildSharedRoomMetadataPath(
  projectId: string,
  branchId: string,
) {
  return `studioCutProjects/${sanitizeSharedRoomPart(
    projectId,
  )}/branches/${sanitizeSharedRoomPart(branchId)}/room/meta`;
}

export function buildSourceMonitorProxyStoragePath({
  projectId,
  branchId,
  fileName,
}: {
  projectId: string;
  branchId: string;
  fileName: string;
}) {
  return `studioCutProjects/${sanitizeSharedRoomPart(
    projectId,
  )}/branches/${sanitizeSharedRoomPart(
    branchId,
  )}/source-monitor-proxy/${sanitizeStorageFileName(fileName)}`;
}

export function buildGeneratedPackageStoragePath({
  syncJobId,
  fileName,
}: {
  syncJobId: string;
  fileName: string;
}) {
  return `studioCutSyncJobs/${sanitizeSharedRoomPart(
    syncJobId,
  )}/outputs/${sanitizeStorageFileName(fileName)}`;
}

export function parseSharedRoomQuery(
  search: string,
  fallback: SharedRoomSelection,
): SharedRoomSelection {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const projectId = sanitizeSharedRoomPart(
    params.get("projectId") ?? "",
    fallback.projectId,
  );
  const branchId = sanitizeSharedRoomPart(
    params.get("branchId") ?? "",
    fallback.branchId,
  );

  return { projectId, branchId };
}

export function buildSharedRoomUrl(
  baseHref: string,
  roomSelection: SharedRoomSelection,
) {
  const url = new URL(baseHref);

  url.searchParams.set("projectId", sanitizeSharedRoomPart(roomSelection.projectId));
  url.searchParams.set("branchId", sanitizeSharedRoomPart(roomSelection.branchId));

  return url.toString();
}

export function sanitizeSharedRoomPart(value: string, fallback = "room") {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

export function sanitizeStorageFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[/\\]+/g, "-")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "") || "source-monitor-proxy.mp4"
  );
}

export function validateGeneratedPackageCompatibility({
  manifest,
  syncMap,
  syncReport,
}: {
  manifest: EpisodeManifest;
  syncMap: SyncMap;
  syncReport?: CloudSyncReport;
}) {
  const errors: string[] = [];
  const manifestProjectId = sanitizeSharedRoomPart(manifest.id);
  const syncMapProjectId = sanitizeSharedRoomPart(syncMap.projectId);
  const durationDeltaMs = Math.abs(
    manifest.durationMs - syncMap.canonicalTimeline.durationMs,
  );

  if (manifestProjectId !== syncMapProjectId) {
    errors.push(
      `Manifest id ${manifest.id} does not match Sync Map projectId ${syncMap.projectId}.`,
    );
  }

  if (durationDeltaMs > 1000) {
    errors.push(
      `Manifest duration differs from Sync Map canonical duration by ${durationDeltaMs}ms.`,
    );
  }

  if (syncReport && syncReport.syncJobId !== syncMap.syncJobId) {
    errors.push(
      `Sync report job ${syncReport.syncJobId} does not match Sync Map job ${syncMap.syncJobId}.`,
    );
  }

  if (hasUnsafeManifestLocalReference(manifest)) {
    errors.push(
      "Manifest includes a local filesystem/blob reference. Use the worker-generated manifest with a proxy file name only.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function isSharedRoomMetadata(
  value: unknown,
): value is SharedRoomMetadata {
  if (!isRecord(value)) {
    return false;
  }

  const metadata = value as Partial<SharedRoomMetadata>;

  return (
    typeof metadata.projectId === "string" &&
    metadata.projectId.trim().length > 0 &&
    typeof metadata.branchId === "string" &&
    metadata.branchId.trim().length > 0 &&
    typeof metadata.title === "string" &&
    metadata.title.trim().length > 0 &&
    isEpisodeManifest(metadata.manifest) &&
    isSafeSharedRoomStoragePath(metadata.sourceMonitorProxyStoragePath) &&
    typeof metadata.sourceMonitorProxyFileName === "string" &&
    metadata.sourceMonitorProxyFileName.trim().length > 0 &&
    typeof metadata.sourceMonitorProxyContentType === "string" &&
    metadata.sourceMonitorProxyContentType.trim().length > 0 &&
    typeof metadata.sourceMonitorProxySizeBytes === "number" &&
    Number.isFinite(metadata.sourceMonitorProxySizeBytes) &&
    metadata.sourceMonitorProxySizeBytes >= 0 &&
    typeof metadata.createdBy === "string" &&
    metadata.createdBy.trim().length > 0 &&
    typeof metadata.createdAt === "string" &&
    !Number.isNaN(Date.parse(metadata.createdAt)) &&
    typeof metadata.updatedAt === "string" &&
    !Number.isNaN(Date.parse(metadata.updatedAt)) &&
    (metadata.packageKind === undefined ||
      metadata.packageKind === "prepared_proxy" ||
      metadata.packageKind === "rescue_sync_generated") &&
    (metadata.syncJobId === undefined ||
      (typeof metadata.syncJobId === "string" &&
        metadata.syncJobId.trim().length > 0)) &&
    (metadata.manifestStoragePath === undefined ||
      isSafeSharedRoomStoragePath(metadata.manifestStoragePath)) &&
    (metadata.syncMapStoragePath === undefined ||
      isSafeSharedRoomStoragePath(metadata.syncMapStoragePath)) &&
    (metadata.syncReportStoragePath === undefined ||
      isSafeSharedRoomStoragePath(metadata.syncReportStoragePath)) &&
    (metadata.generatedByWorkerVersion === undefined ||
      (typeof metadata.generatedByWorkerVersion === "string" &&
        metadata.generatedByWorkerVersion.trim().length > 0)) &&
    (metadata.packageCreatedAt === undefined ||
      (typeof metadata.packageCreatedAt === "string" &&
        !Number.isNaN(Date.parse(metadata.packageCreatedAt)))) &&
    (metadata.notes === undefined || typeof metadata.notes === "string")
  );
}

export function isSafeSharedRoomStoragePath(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    (value.startsWith("studioCutProjects/") ||
      value.startsWith("studioCutSyncJobs/")) &&
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !value.includes("..") &&
    !value.includes("://") &&
    !value.toLowerCase().startsWith("file:") &&
    !value.toLowerCase().startsWith("blob:")
  );
}

function hasUnsafeManifestLocalReference(manifest: EpisodeManifest) {
  const proxy = manifest.sourceMonitorProxy;
  const localPlaceholderPath = proxy.localPlaceholderPath;
  const url = proxy.url;

  return (
    isUnsafeLocalReference(localPlaceholderPath) ||
    isUnsafeLocalReference(url) ||
    Object.values(manifest.sources).some(
      (source) =>
        isUnsafeLocalReference(source?.fileName) ||
        isUnsafeLocalReference(source?.notes),
    )
  );
}

function isUnsafeLocalReference(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    normalized.startsWith("/") ||
    normalized.startsWith("file:") ||
    normalized.startsWith("blob:") ||
    normalized.includes("/private/") ||
    normalized.includes("/users/") ||
    normalized.includes("\\")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
