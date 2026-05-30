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
  packageIntegrity?: SharedRoomPackageIntegrity;
  generatedByWorkerVersion?: string;
  packageCreatedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
};

export type PackageArtifactIntegrity = {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  storagePath?: string;
};

export type SharedRoomPackageIntegrity = {
  manifest: PackageArtifactIntegrity;
  sourceMonitorProxy: PackageArtifactIntegrity;
  syncMap: PackageArtifactIntegrity;
  syncReport?: PackageArtifactIntegrity;
  packageFingerprint: string;
};

export type GeneratedPackagePreflightCheckStatus =
  | "ready"
  | "blocked"
  | "waiting"
  | "optional";

export type GeneratedPackagePreflightCheck = {
  id: string;
  label: string;
  status: GeneratedPackagePreflightCheckStatus;
  detail: string;
};

export type GeneratedPackagePreflight = {
  status: "ready" | "blocked" | "waiting";
  canPublish: boolean;
  checks: GeneratedPackagePreflightCheck[];
  targetRoom?: SharedRoomSelection;
  errors: string[];
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

export function buildPackageFingerprintSeed({
  manifestSha256,
  sourceMonitorProxySha256,
  syncMapSha256,
  syncReportSha256,
}: {
  manifestSha256: string;
  sourceMonitorProxySha256: string;
  syncMapSha256: string;
  syncReportSha256?: string;
}) {
  return [
    `manifest:${manifestSha256}`,
    `sourceMonitorProxy:${sourceMonitorProxySha256}`,
    `syncMap:${syncMapSha256}`,
    `syncReport:${syncReportSha256 ?? "none"}`,
  ].join("|");
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

export function buildGeneratedPackagePreflight({
  roomSelection,
  manifest,
  syncMap,
  syncReport,
  proxyFileName,
  proxySizeBytes,
}: {
  roomSelection: SharedRoomSelection;
  manifest?: EpisodeManifest;
  syncMap?: SyncMap;
  syncReport?: CloudSyncReport;
  proxyFileName?: string;
  proxySizeBytes?: number;
}): GeneratedPackagePreflight {
  const errors: string[] = [];
  const targetRoom =
    manifest && syncMap
      ? {
          projectId: sanitizeSharedRoomPart(manifest.id),
          branchId: sanitizeSharedRoomPart(syncMap.branchId),
        }
      : undefined;
  const missingFiles = [
    !manifest ? "manifest" : "",
    !proxyFileName ? "source-monitor proxy" : "",
    !syncMap ? "Sync Map" : "",
  ].filter(Boolean);
  const checks: GeneratedPackagePreflightCheck[] = [
    {
      id: "files",
      label: "Generated files",
      status: missingFiles.length === 0 ? "ready" : "waiting",
      detail:
        missingFiles.length === 0
          ? "Manifest, source-monitor proxy, and Sync Map are selected."
          : `Waiting for ${missingFiles.join(", ")}.`,
    },
  ];

  if (manifest && syncMap) {
    const compatibility = validateGeneratedPackageCompatibility({
      manifest,
      syncMap,
      ...(syncReport ? { syncReport } : {}),
    });

    errors.push(...compatibility.errors);
    checks.push({
      id: "compatibility",
      label: "Manifest and Sync Map",
      status: compatibility.ok ? "ready" : "blocked",
      detail: compatibility.ok
        ? `Durations match within tolerance at ${manifest.durationMs}ms.`
        : compatibility.errors.join(" "),
    });
  } else {
    checks.push({
      id: "compatibility",
      label: "Manifest and Sync Map",
      status: "waiting",
      detail: "Select both files to validate project id, duration, and path safety.",
    });
  }

  if (targetRoom) {
    const roomMatchesPackage =
      targetRoom.projectId === sanitizeSharedRoomPart(roomSelection.projectId) &&
      targetRoom.branchId === sanitizeSharedRoomPart(roomSelection.branchId);

    if (!roomMatchesPackage) {
      errors.push(
        `Current room is ${roomSelection.projectId} / ${roomSelection.branchId}; package targets ${targetRoom.projectId} / ${targetRoom.branchId}.`,
      );
    }

    checks.push({
      id: "room",
      label: "Room target",
      status: roomMatchesPackage ? "ready" : "blocked",
      detail: roomMatchesPackage
        ? `Publishing to ${targetRoom.projectId} / ${targetRoom.branchId}.`
        : `Switch Collaboration Mode to ${targetRoom.projectId} / ${targetRoom.branchId}.`,
    });
  } else {
    checks.push({
      id: "room",
      label: "Room target",
      status: "waiting",
      detail: "Select manifest and Sync Map to confirm the target room.",
    });
  }

  checks.push({
    id: "proxy",
    label: "Proxy upload",
    status: proxyFileName ? "ready" : "waiting",
    detail: proxyFileName
      ? `${sanitizeStorageFileName(proxyFileName)} will be uploaded as the browser source-monitor proxy${
          typeof proxySizeBytes === "number" && Number.isFinite(proxySizeBytes)
            ? ` (${proxySizeBytes} bytes selected)`
            : ""
        }.`
      : "Select the generated source-monitor MP4/MOV/M4V.",
  });

  checks.push({
    id: "sync-report",
    label: "Sync report",
    status: syncReport ? "ready" : "optional",
    detail: syncReport
      ? `Attached report for ${syncReport.syncJobId}.`
      : "Optional, but useful for diagnostics and agent review.",
  });

  const hasBlockingCheck = checks.some((check) => check.status === "blocked");
  const hasWaitingCheck = checks.some((check) => check.status === "waiting");
  const status = hasBlockingCheck ? "blocked" : hasWaitingCheck ? "waiting" : "ready";

  return {
    status,
    canPublish: status === "ready",
    checks,
    ...(targetRoom ? { targetRoom } : {}),
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
    (metadata.packageIntegrity === undefined ||
      isSharedRoomPackageIntegrity(metadata.packageIntegrity)) &&
    (metadata.generatedByWorkerVersion === undefined ||
      (typeof metadata.generatedByWorkerVersion === "string" &&
        metadata.generatedByWorkerVersion.trim().length > 0)) &&
    (metadata.packageCreatedAt === undefined ||
      (typeof metadata.packageCreatedAt === "string" &&
        !Number.isNaN(Date.parse(metadata.packageCreatedAt)))) &&
    (metadata.notes === undefined || typeof metadata.notes === "string")
  );
}

export function isSharedRoomPackageIntegrity(
  value: unknown,
): value is SharedRoomPackageIntegrity {
  if (!isRecord(value)) {
    return false;
  }

  const integrity = value as Partial<SharedRoomPackageIntegrity>;

  return (
    isPackageArtifactIntegrity(integrity.manifest) &&
    isPackageArtifactIntegrity(integrity.sourceMonitorProxy) &&
    isPackageArtifactIntegrity(integrity.syncMap) &&
    (integrity.syncReport === undefined ||
      isPackageArtifactIntegrity(integrity.syncReport)) &&
    isSha256Hex(integrity.packageFingerprint)
  );
}

export function isPackageArtifactIntegrity(
  value: unknown,
): value is PackageArtifactIntegrity {
  if (!isRecord(value)) {
    return false;
  }

  const artifact = value as Partial<PackageArtifactIntegrity>;

  return (
    typeof artifact.fileName === "string" &&
    artifact.fileName.trim().length > 0 &&
    typeof artifact.sizeBytes === "number" &&
    Number.isFinite(artifact.sizeBytes) &&
    artifact.sizeBytes >= 0 &&
    isSha256Hex(artifact.sha256) &&
    (artifact.storagePath === undefined ||
      isSafeSharedRoomStoragePath(artifact.storagePath))
  );
}

export function isSha256Hex(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
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
