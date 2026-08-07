import "server-only";

import type { PrismaClient } from "@prisma/client";

import type { VerifiedExternalMediaFile } from "@/lib/external-media-contract";
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
  trashed?: boolean;
  capabilities?: {
    canDownload?: boolean;
    canCopy?: boolean;
    canReadRevisions?: boolean;
  };
};

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
  if (status === 401) return new GoogleDriveSourceError("Google Drive access expired. Reconnect it and try again.", "drive-needs-reauth", 409);
  if (status === 403) return new GoogleDriveSourceError("Google Drive did not grant access to that file.", "drive-file-restricted", 403);
  if (status === 404) return new GoogleDriveSourceError("That Drive file is unavailable or was not selected for Quipsly.", "drive-file-missing", 404);
  return new GoogleDriveSourceError("Google Drive could not verify that file.", `drive-http-${status}`, 502);
}

export async function verifyGoogleDriveFile(input: {
  accessToken: string;
  connectionId: string;
  externalFileId: string;
  selectedResourceKey?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<VerifiedExternalMediaFile> {
  const fileId = input.externalFileId.trim();
  if (!fileId || fileId.length > 512 || !/^[a-zA-Z0-9._-]+$/.test(fileId)) {
    throw new GoogleDriveSourceError("The selected Drive file identity is malformed.", "invalid-drive-file-id", 400);
  }
  const resourceKey = input.selectedResourceKey?.trim() || null;
  if (resourceKey && (resourceKey.length > 512 || !/^[a-zA-Z0-9._-]+$/.test(resourceKey))) {
    throw new GoogleDriveSourceError("The selected Drive resource key is malformed.", "invalid-drive-resource-key", 400);
  }
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,mimeType,size,headRevisionId,md5Checksum,createdTime,modifiedTime,driveId,resourceKey,trashed,capabilities(canDownload,canCopy,canReadRevisions)");
  const response = await (input.fetchImpl ?? fetch)(url, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
      ...(resourceKey ? { "X-Goog-Drive-Resource-Keys": `${fileId}/${resourceKey}` } : {}),
    },
  });
  if (!response.ok) throw providerError(response.status);
  const file = await response.json().catch(() => null) as GoogleDriveFile | null;
  if (!file?.id || file.id !== fileId || !file.name?.trim()) {
    throw new GoogleDriveSourceError("Google Drive returned incomplete file identity.", "invalid-drive-file-response", 502);
  }
  if (file.trashed) {
    throw new GoogleDriveSourceError("That Drive file is in the trash.", "drive-file-trashed", 409);
  }
  const canDownload = file.capabilities?.canDownload === true;
  return {
    provider: "google-drive",
    connectionKey: `google-drive:${input.connectionId}`,
    externalFileId: file.id,
    sharedDriveId: file.driveId ?? null,
    resourceKey: file.resourceKey ?? resourceKey,
    fileName: file.name.trim(),
    mimeType: file.mimeType?.trim() || null,
    sizeBytes: file.size ?? null,
    headRevisionKey: file.headRevisionId ?? null,
    checksumMd5: file.md5Checksum ?? null,
    providerCreatedAt: file.createdTime ?? null,
    providerModifiedAt: file.modifiedTime ?? null,
    accessState: canDownload ? "available" : "restricted",
    capabilityState: canDownload ? "downloadable" : "metadata-only",
    canDownload,
    canReadRevisions: file.capabilities?.canReadRevisions === true,
    canCopy: file.capabilities?.canCopy === true,
    downloadRestrictionReason: canDownload ? null : "Google Drive reports that this file cannot be downloaded by the connected account.",
  };
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
  if (error instanceof GoogleDriveSourceError || error instanceof GoogleDriveOAuthError) {
    return { status: error.status, body: { error: error.message, errorCode: error.code } };
  }
  return null;
}
