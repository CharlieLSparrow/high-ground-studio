import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import type { VerifiedExternalMediaFile } from "@/lib/external-media-contract";
import {
  planGoogleDriveMediaFolder,
  planGoogleDriveMediaLibrary,
  type GoogleDriveFolderMediaItem,
  type GoogleDriveMediaLibraryPlan,
} from "@/lib/google-drive-media-package";
import { attachVerifiedExternalMediaSource } from "@/lib/server/external-media-source";
import { getGoogleDriveAccess } from "@/lib/server/google-drive-connection";
import { GoogleDriveOAuthError } from "@/lib/server/google-drive-oauth";

type GoogleDriveFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  headRevisionId?: string;
  md5Checksum?: string;
  createdTime?: string;
  modifiedTime?: string;
  driveId?: string;
  resourceKey?: string;
  parents?: string[];
  trashed?: boolean;
  capabilities?: {
    canDownload?: boolean;
    canCopy?: boolean;
    canReadRevisions?: boolean;
  };
};

type GoogleDriveFileList = {
  nextPageToken?: string;
  files?: GoogleDriveFile[];
};

const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const MAX_FOLDER_ITEMS = 5_000;
const MAX_PICKER_FILES = 200;

export class GoogleDriveSourceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleDriveSourceError";
  }
}

function providerError(status: number) {
  if (status === 401)
    return new GoogleDriveSourceError(
      "Google Drive access expired. Reconnect it and try again.",
      "drive-needs-reauth",
      409,
    );
  if (status === 403)
    return new GoogleDriveSourceError(
      "Google Drive did not grant access to that file.",
      "drive-file-restricted",
      403,
    );
  if (status === 404)
    return new GoogleDriveSourceError(
      "That Drive file is unavailable or was not selected for Quipsly.",
      "drive-file-missing",
      404,
    );
  return new GoogleDriveSourceError(
    "Google Drive could not verify that file.",
    `drive-http-${status}`,
    502,
  );
}

function fileId(value: string, field = "Drive file") {
  const result = value.trim();
  if (!result || result.length > 512 || !/^[a-zA-Z0-9._-]+$/.test(result)) {
    throw new GoogleDriveSourceError(
      `${field} identity is malformed.`,
      "invalid-drive-file-id",
      400,
    );
  }
  return result;
}

function resourceKey(value: string | null | undefined) {
  const result = value?.trim() || null;
  if (result && (result.length > 512 || !/^[a-zA-Z0-9._-]+$/.test(result))) {
    throw new GoogleDriveSourceError(
      "The selected Drive resource key is malformed.",
      "invalid-drive-resource-key",
      400,
    );
  }
  return result;
}

function googleDriveFileFields() {
  return "id,name,mimeType,size,headRevisionId,md5Checksum,createdTime,modifiedTime,driveId,resourceKey,parents,trashed,capabilities(canDownload,canCopy,canReadRevisions)";
}

function verifiedFile(input: {
  file: GoogleDriveFile;
  expectedId: string;
  connectionId: string;
  selectedResourceKey?: string | null;
}) {
  const file = input.file;
  if (!file.id || file.id !== input.expectedId || !file.name?.trim()) {
    throw new GoogleDriveSourceError(
      "Google Drive returned incomplete file identity.",
      "invalid-drive-file-response",
      502,
    );
  }
  if (file.trashed)
    throw new GoogleDriveSourceError(
      "That Drive file is in the trash.",
      "drive-file-trashed",
      409,
    );
  if (file.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
    throw new GoogleDriveSourceError(
      "Choose a media file, or use the Insta360 folder workflow.",
      "drive-folder-requires-package-workflow",
      409,
    );
  }
  const canDownload = file.capabilities?.canDownload === true;
  return {
    provider: "google-drive",
    connectionKey: `google-drive:${input.connectionId}`,
    externalFileId: file.id,
    sharedDriveId: file.driveId ?? null,
    resourceKey: file.resourceKey ?? input.selectedResourceKey ?? null,
    fileName: file.name.trim(),
    mimeType: file.mimeType?.trim() || null,
    sizeBytes: file.size ?? null,
    headRevisionKey:
      file.headRevisionId ??
      (file.md5Checksum ? `md5:${file.md5Checksum}` : null),
    checksumMd5: file.md5Checksum ?? null,
    providerCreatedAt: file.createdTime ?? null,
    providerModifiedAt: file.modifiedTime ?? null,
    accessState: canDownload ? "available" : "restricted",
    capabilityState: canDownload ? "downloadable" : "metadata-only",
    canDownload,
    canReadRevisions: file.capabilities?.canReadRevisions === true,
    canCopy: file.capabilities?.canCopy === true,
    downloadRestrictionReason: canDownload
      ? null
      : "Google Drive reports that this file cannot be downloaded by the connected account.",
  } satisfies VerifiedExternalMediaFile;
}

function folderItem(file: GoogleDriveFile): GoogleDriveFolderMediaItem {
  if (!file.id || !file.name?.trim()) {
    throw new GoogleDriveSourceError(
      "Google Drive returned an incomplete folder member.",
      "invalid-drive-folder-member",
      502,
    );
  }
  return {
    id: file.id,
    name: file.name.trim(),
    mimeType: file.mimeType?.trim() || null,
    sizeBytes: file.size ?? null,
    headRevisionId: file.headRevisionId ?? null,
    md5Checksum: file.md5Checksum ?? null,
    resourceKey: file.resourceKey ?? null,
    createdTime: file.createdTime ?? null,
    modifiedTime: file.modifiedTime ?? null,
    driveId: file.driveId ?? null,
    canDownload: file.capabilities?.canDownload === true,
    canCopy: file.capabilities?.canCopy === true,
    canReadRevisions: file.capabilities?.canReadRevisions === true,
  };
}

function selectedFolderItem(
  file: VerifiedExternalMediaFile,
): GoogleDriveFolderMediaItem {
  return {
    id: file.externalFileId,
    name: file.fileName,
    mimeType: file.mimeType ?? null,
    sizeBytes:
      file.sizeBytes === null || file.sizeBytes === undefined
        ? null
        : String(file.sizeBytes),
    headRevisionId: file.headRevisionKey ?? null,
    md5Checksum: file.checksumMd5 ?? null,
    resourceKey: file.resourceKey ?? null,
    createdTime:
      file.providerCreatedAt instanceof Date
        ? file.providerCreatedAt.toISOString()
        : (file.providerCreatedAt ?? null),
    modifiedTime:
      file.providerModifiedAt instanceof Date
        ? file.providerModifiedAt.toISOString()
        : (file.providerModifiedAt ?? null),
    driveId: file.sharedDriveId ?? null,
    canDownload: file.canDownload,
    canCopy: file.canCopy,
    canReadRevisions: file.canReadRevisions,
  };
}

function stableUuid(value: string) {
  const hex = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = "8";
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function sourceUnitSlug(folderId: string, segmentKey: string) {
  return `drive-360-${createHash("sha256").update(`${folderId}:${segmentKey}`).digest("hex").slice(0, 32)}`;
}

function publicGoogleDriveMediaBatchPlan(
  plan: GoogleDriveMediaLibraryPlan["batches"][number],
) {
  return {
    schema: plan.schema,
    folder: {
      name: plan.folder.name,
      captureBatchKey: plan.folder.captureBatchKey,
      expectedSegments: plan.folder.expectedSegments,
    },
    status: plan.status,
    segments: plan.segments.map((segment) => ({
      key: segment.key,
      captureKey: segment.captureKey,
      displayName: segment.displayName,
      capturedAt: segment.capturedAt,
      segment: segment.segment,
      status: segment.status,
      reasons: segment.reasons,
      totalSizeBytes: segment.totalSizeBytes,
      members: segment.members.map((member) => ({
        name: member.name,
        role: member.role,
        channel: member.channel,
        mimeType: member.mimeType,
        sizeBytes: member.sizeBytes,
        modifiedTime: member.modifiedTime,
        canDownload: member.canDownload,
      })),
    })),
    unrecognizedFiles: plan.unrecognizedFiles.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    })),
    totalFiles: plan.totalFiles,
    totalSizeBytes: plan.totalSizeBytes,
    readySegmentCount: plan.readySegmentCount,
    heldSegmentCount: plan.heldSegmentCount,
  };
}

export function publicGoogleDriveMediaPackagePlan(
  plan: GoogleDriveMediaLibraryPlan,
) {
  return {
    schema: plan.schema,
    root: { name: plan.root.name },
    status: plan.status,
    batches: plan.batches.map(publicGoogleDriveMediaBatchPlan),
    totalFiles: plan.totalFiles,
    totalSizeBytes: plan.totalSizeBytes,
    readySegmentCount: plan.readySegmentCount,
    heldSegmentCount: plan.heldSegmentCount,
  };
}

async function listGoogleDriveFolderChildren(input: {
  fetchImpl: typeof fetch;
  accessToken: string;
  folderId: string;
  resourceKey?: string | null;
}) {
  const files: GoogleDriveFolderMediaItem[] = [];
  let pageToken = "";
  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
    ...(input.resourceKey
      ? {
          "X-Goog-Drive-Resource-Keys": `${input.folderId}/${input.resourceKey}`,
        }
      : {}),
  };
  do {
    const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
    listUrl.searchParams.set(
      "q",
      `'${input.folderId}' in parents and trashed = false`,
    );
    listUrl.searchParams.set("spaces", "drive");
    listUrl.searchParams.set("pageSize", "1000");
    listUrl.searchParams.set("supportsAllDrives", "true");
    listUrl.searchParams.set("includeItemsFromAllDrives", "true");
    listUrl.searchParams.set(
      "fields",
      `nextPageToken,files(${googleDriveFileFields()})`,
    );
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
    const response = await input.fetchImpl(listUrl, { headers });
    if (!response.ok) throw providerError(response.status);
    const page = (await response
      .json()
      .catch(() => null)) as GoogleDriveFileList | null;
    if (!page || !Array.isArray(page.files)) {
      throw new GoogleDriveSourceError(
        "Google Drive returned an invalid folder listing.",
        "invalid-drive-folder-list",
        502,
      );
    }
    files.push(...page.files.map(folderItem));
    if (files.length > MAX_FOLDER_ITEMS) {
      throw new GoogleDriveSourceError(
        `That folder has more than ${MAX_FOLDER_ITEMS.toLocaleString()} direct items. Split it into capture batches before attaching.`,
        "drive-folder-too-large",
        409,
      );
    }
    pageToken = page.nextPageToken?.trim() || "";
  } while (pageToken);
  return files;
}

async function readGoogleDriveFileMetadata(input: {
  accessToken: string;
  externalFileId: string;
  selectedResourceKey?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const selectedFileId = fileId(
    input.externalFileId,
    "The selected Drive file",
  );
  const selectedResourceKey = resourceKey(input.selectedResourceKey);
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(selectedFileId)}`,
  );
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", googleDriveFileFields());
  const response = await (input.fetchImpl ?? fetch)(url, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
      ...(selectedResourceKey
        ? {
            "X-Goog-Drive-Resource-Keys": `${selectedFileId}/${selectedResourceKey}`,
          }
        : {}),
    },
  });
  if (!response.ok) throw providerError(response.status);
  const file = (await response
    .json()
    .catch(() => null)) as GoogleDriveFile | null;
  return {
    file: file ?? {},
    selectedFileId,
    selectedResourceKey,
  };
}

export async function verifyGoogleDriveFile(input: {
  accessToken: string;
  connectionId: string;
  externalFileId: string;
  selectedResourceKey?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<VerifiedExternalMediaFile> {
  const metadata = await readGoogleDriveFileMetadata(input);
  return verifiedFile({
    file: metadata.file,
    expectedId: metadata.selectedFileId,
    connectionId: input.connectionId,
    selectedResourceKey: metadata.selectedResourceKey,
  });
}

export async function readGoogleDriveMediaFolder(input: {
  accessToken: string;
  connectionId: string;
  folderId: string;
  selectedResourceKey?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const selectedFolderId = fileId(input.folderId, "The selected Drive folder");
  const selectedResourceKey = resourceKey(input.selectedResourceKey);
  const fetchImpl = input.fetchImpl ?? fetch;
  const metadataUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(selectedFolderId)}`,
  );
  metadataUrl.searchParams.set("supportsAllDrives", "true");
  metadataUrl.searchParams.set("fields", googleDriveFileFields());
  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
    ...(selectedResourceKey
      ? {
          "X-Goog-Drive-Resource-Keys": `${selectedFolderId}/${selectedResourceKey}`,
        }
      : {}),
  };
  const metadataResponse = await fetchImpl(metadataUrl, { headers });
  if (!metadataResponse.ok) throw providerError(metadataResponse.status);
  const folder = (await metadataResponse
    .json()
    .catch(() => null)) as GoogleDriveFile | null;
  if (!folder?.id || folder.id !== selectedFolderId || !folder.name?.trim()) {
    throw new GoogleDriveSourceError(
      "Google Drive returned incomplete folder identity.",
      "invalid-drive-folder-response",
      502,
    );
  }
  if (folder.trashed)
    throw new GoogleDriveSourceError(
      "That Drive folder is in the trash.",
      "drive-folder-trashed",
      409,
    );
  if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
    throw new GoogleDriveSourceError(
      "Choose an Insta360 source folder for this workflow.",
      "drive-folder-required",
      409,
    );
  }

  const files = await listGoogleDriveFolderChildren({
    fetchImpl,
    accessToken: input.accessToken,
    folderId: selectedFolderId,
    resourceKey: folder.resourceKey ?? selectedResourceKey,
  });

  const directBatch = planGoogleDriveMediaFolder({
    folderId: selectedFolderId,
    folderName: folder.name.trim(),
    files: files.filter(
      (file) => file.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE,
    ),
  });
  const childFolders = files.filter(
    (file) => file.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  );
  if (childFolders.length > 200) {
    throw new GoogleDriveSourceError(
      "That library contains more than 200 direct capture folders. Split it into smaller library roots before attaching.",
      "drive-library-too-large",
      409,
    );
  }
  const batches =
    directBatch.segments.length || childFolders.length === 0
      ? [directBatch]
      : await Promise.all(
          childFolders.map(async (child) => {
            const childFiles = await listGoogleDriveFolderChildren({
              fetchImpl,
              accessToken: input.accessToken,
              folderId: child.id,
              resourceKey: child.resourceKey,
            });
            if (
              childFiles.some(
                (file) => file.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE,
              )
            ) {
              throw new GoogleDriveSourceError(
                "Nested library folders are deeper than Quipsly's reviewed intake boundary. Choose the capture-library folder that directly contains camera batches.",
                "drive-library-depth-unsupported",
                409,
              );
            }
            return planGoogleDriveMediaFolder({
              folderId: child.id,
              folderName: child.name,
              files: childFiles,
            });
          }),
        );
  if (
    batches.reduce((total, batch) => total + batch.totalFiles, 0) >
    MAX_FOLDER_ITEMS
  ) {
    throw new GoogleDriveSourceError(
      `That library contains more than ${MAX_FOLDER_ITEMS.toLocaleString()} media files. Split it into smaller library roots before attaching.`,
      "drive-library-too-large",
      409,
    );
  }

  return {
    folder: {
      id: selectedFolderId,
      name: folder.name.trim(),
      resourceKey: folder.resourceKey ?? selectedResourceKey,
      driveId: folder.driveId ?? null,
    },
    plan: planGoogleDriveMediaLibrary({
      rootFolderId: selectedFolderId,
      rootFolderName: folder.name.trim(),
      batches,
    }),
  };
}

export async function readGoogleDriveMediaSelection(input: {
  accessToken: string;
  connectionId: string;
  selections: Array<{
    externalFileId: string;
    resourceKey?: string | null;
  }>;
  fetchImpl?: typeof fetch;
}) {
  if (!input.selections.length) {
    throw new GoogleDriveSourceError(
      "Choose at least one Insta360 INSV or LRV file.",
      "drive-selection-empty",
      400,
    );
  }
  if (input.selections.length > MAX_PICKER_FILES) {
    throw new GoogleDriveSourceError(
      `Choose no more than ${MAX_PICKER_FILES} files at once. Attach another batch after this one finishes.`,
      "drive-selection-too-large",
      409,
    );
  }
  const uniqueSelections = new Map<
    string,
    { externalFileId: string; resourceKey: string | null }
  >();
  for (const selection of input.selections) {
    const externalFileId = fileId(
      selection.externalFileId,
      "A selected Drive file",
    );
    const selectedResourceKey = resourceKey(selection.resourceKey);
    const current = uniqueSelections.get(externalFileId);
    if (
      current &&
      current.resourceKey &&
      selectedResourceKey &&
      current.resourceKey !== selectedResourceKey
    ) {
      throw new GoogleDriveSourceError(
        "Google Picker returned conflicting identities for one selected file.",
        "drive-selection-conflict",
        400,
      );
    }
    uniqueSelections.set(externalFileId, {
      externalFileId,
      resourceKey: current?.resourceKey ?? selectedResourceKey,
    });
  }

  const selectedFiles = new Map<string, GoogleDriveFolderMediaItem[]>();
  const selections = [...uniqueSelections.values()];
  for (let index = 0; index < selections.length; index += 8) {
    const window = selections.slice(index, index + 8);
    const verified = await Promise.all(
      window.map((selection) =>
        readGoogleDriveFileMetadata({
          accessToken: input.accessToken,
          externalFileId: selection.externalFileId,
          selectedResourceKey: selection.resourceKey,
          fetchImpl: input.fetchImpl,
        }),
      ),
    );
    for (const metadata of verified) {
      const exact = verifiedFile({
        file: metadata.file,
        expectedId: metadata.selectedFileId,
        connectionId: input.connectionId,
        selectedResourceKey: metadata.selectedResourceKey,
      });
      const parentKey =
        metadata.file.parents?.filter(Boolean).sort()[0] ??
        `picker:unparented:${input.connectionId}`;
      const group = selectedFiles.get(parentKey) ?? [];
      group.push(selectedFolderItem(exact));
      selectedFiles.set(parentKey, group);
    }
  }

  const batches = [...selectedFiles.entries()].map(([parentId, files], index) =>
    planGoogleDriveMediaFolder({
      folderId: parentId,
      folderName:
        selectedFiles.size === 1
          ? "Selected Insta360 files"
          : `Selected Insta360 files ${index + 1}`,
      files,
    }),
  );
  if (!batches.some((batch) => batch.segments.length)) {
    throw new GoogleDriveSourceError(
      "None of those files match an Insta360 INSV or LRV camera segment. Choose the original and low-resolution companion files together.",
      "drive-selection-no-insta360-media",
      409,
    );
  }
  return planGoogleDriveMediaLibrary({
    rootFolderId: `picker:${input.connectionId}`,
    rootFolderName: "Google Picker selection",
    batches,
  });
}

export async function inspectGoogleDriveFolderForNest(input: {
  prisma: PrismaClient;
  actorUserId: string;
  connectionId: string;
  folderId: string;
  resourceKey?: string | null;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
}) {
  const access = await getGoogleDriveAccess({
    prisma: input.prisma,
    userId: input.actorUserId,
    connectionId: input.connectionId,
    requestUrl: input.requestUrl,
    environment: input.environment,
  });
  const result = await readGoogleDriveMediaFolder({
    accessToken: access.accessToken,
    connectionId: access.connection.id,
    folderId: input.folderId,
    selectedResourceKey: input.resourceKey,
  });
  return { plan: publicGoogleDriveMediaPackagePlan(result.plan) };
}

export async function attachGoogleDriveFolderToNest(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  connectionId: string;
  folderId: string;
  resourceKey?: string | null;
  clientRequestId: string;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
}) {
  const access = await getGoogleDriveAccess({
    prisma: input.prisma,
    userId: input.actorUserId,
    connectionId: input.connectionId,
    requestUrl: input.requestUrl,
    environment: input.environment,
  });
  const folder = await readGoogleDriveMediaFolder({
    accessToken: access.accessToken,
    connectionId: access.connection.id,
    folderId: input.folderId,
    selectedResourceKey: input.resourceKey,
  });
  return attachGoogleDriveMediaPlanToNest({
    ...input,
    connectionId: access.connection.id,
    plan: folder.plan,
    sourceIdentity: (batch) => batch.folder.id,
    sourceUrl: (batch) =>
      `https://drive.google.com/drive/folders/${encodeURIComponent(batch.folder.id)}`,
  });
}

async function attachGoogleDriveMediaPlanToNest(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  connectionId: string;
  clientRequestId: string;
  plan: GoogleDriveMediaLibraryPlan;
  sourceIdentity(batch: GoogleDriveMediaLibraryPlan["batches"][number]): string;
  sourceUrl(
    batch: GoogleDriveMediaLibraryPlan["batches"][number],
    segment: GoogleDriveMediaLibraryPlan["batches"][number]["segments"][number],
  ): string;
}) {
  const attached: Array<{
    referenceId: string;
    sourceRevisionId: string;
    sourceUnitId: string;
    replayed: boolean;
  }> = [];
  for (const batch of input.plan.batches) {
    for (const segment of batch.segments.filter(
      (candidate) => candidate.members.length > 0,
    )) {
      const slug = sourceUnitSlug(input.sourceIdentity(batch), segment.key);
      const metadata = {
        schema: "quipsly-google-drive-insta360-segment-v1",
        provider: "google-drive",
        libraryRootName: input.plan.root.name,
        folderName: batch.folder.name,
        captureBatchKey: batch.folder.captureBatchKey,
        captureKey: segment.captureKey,
        segment: segment.segment,
        packageStatus: segment.status,
        reasons: segment.reasons,
        expectedMemberRoles: ["primary-original", "browse-proxy"],
        members: segment.members.map((member) => ({
          name: member.name,
          role: member.role,
          channel: member.channel,
          sizeBytes: member.sizeBytes,
        })),
        originalRemainsInDrive: true,
      };
      const sourceUnit = await input.prisma.studioSourceUnit.upsert({
        where: { projectId_slug: { projectId: input.projectId, slug } },
        update: {
          title: segment.displayName,
          capturedAt: new Date(segment.capturedAt),
          metadataJson: metadata,
        },
        create: {
          projectId: input.projectId,
          slug,
          kind: "insta360-drive-segment",
          title: segment.displayName,
          sourceUrl: input.sourceUrl(batch, segment),
          capturedAt: new Date(segment.capturedAt),
          metadataJson: metadata,
          createdByEmail: input.actorEmail,
        },
      });
      for (const member of segment.members) {
        const result = await attachVerifiedExternalMediaSource({
          prisma: input.prisma,
          value: {
            projectId: input.projectId,
            actorUserId: input.actorUserId,
            actorEmail: input.actorEmail,
            sourceUnitId: sourceUnit.id,
            connectionId: input.connectionId,
            clientRequestId: stableUuid(
              `${input.clientRequestId}:${member.id}`,
            ),
            operation: "attach",
            verifiedFile: {
              ...verifiedFile({
                file: {
                  id: member.id,
                  name: member.name,
                  mimeType: member.mimeType ?? undefined,
                  size: member.sizeBytes ?? undefined,
                  headRevisionId: member.headRevisionId ?? undefined,
                  md5Checksum: member.md5Checksum ?? undefined,
                  createdTime: member.createdTime ?? undefined,
                  modifiedTime: member.modifiedTime ?? undefined,
                  driveId: member.driveId ?? undefined,
                  resourceKey: member.resourceKey ?? undefined,
                  capabilities: {
                    canDownload: member.canDownload,
                    canCopy: member.canCopy,
                    canReadRevisions: member.canReadRevisions,
                  },
                },
                expectedId: member.id,
                connectionId: input.connectionId,
                selectedResourceKey: member.resourceKey,
              }),
              mediaProjection:
                member.role === "browse-proxy"
                  ? "equirectangular"
                  : "dual-fisheye",
              projectionMetadata: {
                schema: "quipsly-insta360-drive-member-v1",
                sourceUnitId: sourceUnit.id,
                captureKey: segment.captureKey,
                segment: segment.segment,
                memberRole: member.role,
                channel: member.channel,
                folderName: batch.folder.name,
              },
            },
          },
        });
        attached.push({
          referenceId: result.reference.id,
          sourceRevisionId: result.sourceRevisionId,
          sourceUnitId: sourceUnit.id,
          replayed: result.replayed,
        });
      }
    }
  }
  return {
    plan: publicGoogleDriveMediaPackagePlan(input.plan),
    attachedCount: attached.length,
    sourceUnitCount: new Set(attached.map((value) => value.sourceUnitId)).size,
    replayedCount: attached.filter((value) => value.replayed).length,
  };
}

export async function attachGoogleDriveFilesToNest(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  connectionId: string;
  selections: Array<{
    externalFileId: string;
    resourceKey?: string | null;
  }>;
  clientRequestId: string;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
}) {
  const access = await getGoogleDriveAccess({
    prisma: input.prisma,
    userId: input.actorUserId,
    connectionId: input.connectionId,
    requestUrl: input.requestUrl,
    environment: input.environment,
  });
  const plan = await readGoogleDriveMediaSelection({
    accessToken: access.accessToken,
    connectionId: access.connection.id,
    selections: input.selections,
  });
  return attachGoogleDriveMediaPlanToNest({
    ...input,
    connectionId: access.connection.id,
    plan,
    sourceIdentity: (batch) => batch.folder.id,
    sourceUrl: (_batch, segment) => {
      const browse = segment.members.find(
        (member) => member.role === "browse-proxy",
      );
      const member = browse ?? segment.members[0];
      return member
        ? `https://drive.google.com/file/d/${encodeURIComponent(member.id)}/view`
        : "https://drive.google.com/drive/my-drive";
    },
  });
}

export async function attachGoogleDriveFileToNest(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  connectionId: string;
  externalFileId: string;
  resourceKey?: string | null;
  clientRequestId: string;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
}) {
  const access = await getGoogleDriveAccess({
    prisma: input.prisma,
    userId: input.actorUserId,
    connectionId: input.connectionId,
    requestUrl: input.requestUrl,
    environment: input.environment,
  });
  const verifiedFile = await verifyGoogleDriveFile({
    accessToken: access.accessToken,
    connectionId: access.connection.id,
    externalFileId: input.externalFileId,
    selectedResourceKey: input.resourceKey,
  });
  return attachVerifiedExternalMediaSource({
    prisma: input.prisma,
    value: {
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      connectionId: access.connection.id,
      clientRequestId: input.clientRequestId,
      operation: "attach",
      verifiedFile,
    },
  });
}

export function googleDriveSourceErrorResponse(error: unknown) {
  if (
    error instanceof GoogleDriveSourceError ||
    error instanceof GoogleDriveOAuthError
  ) {
    return {
      status: error.status,
      body: { error: error.message, errorCode: error.code },
    };
  }
  return null;
}
