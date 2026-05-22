import {
  isEpisodeManifest,
  type EpisodeManifest,
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
    typeof metadata.sourceMonitorProxyStoragePath === "string" &&
    metadata.sourceMonitorProxyStoragePath.trim().length > 0 &&
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
    (metadata.notes === undefined || typeof metadata.notes === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
