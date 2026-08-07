import "server-only";

import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  EXTERNAL_MEDIA_SCHEMA_VERSION,
  ExternalMediaContractError,
  normalizeAttachVerifiedExternalMediaInput,
  type AttachVerifiedExternalMediaInput,
} from "@/lib/external-media-contract";

export class ExternalMediaConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly currentRevision: number | null = null,
  ) {
    super(message);
    this.name = "ExternalMediaConflictError";
  }
}

function stableJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function safeSnapshot(input: ReturnType<typeof normalizeAttachVerifiedExternalMediaInput>, referenceId: string, revision: number, sourceRevisionId: string) {
  const file = input.verifiedFile;
  return {
    schema: EXTERNAL_MEDIA_SCHEMA_VERSION,
    referenceId,
    revision,
    projectId: input.projectId,
    connectionId: input.connectionId,
    provider: file.provider,
    connectionKey: file.connectionKey,
    externalFileId: file.externalFileId,
    sharedDriveId: file.sharedDriveId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes?.toString() ?? null,
    headRevisionKey: file.headRevisionKey,
    checksumSha256: file.checksumSha256,
    checksumMd5: file.checksumMd5,
    providerCreatedAt: file.providerCreatedAt?.toISOString() ?? null,
    providerModifiedAt: file.providerModifiedAt?.toISOString() ?? null,
    accessState: file.accessState,
    capabilityState: file.capabilityState,
    canDownload: file.canDownload,
    canReadRevisions: file.canReadRevisions,
    canCopy: file.canCopy,
    downloadRestrictionReason: file.downloadRestrictionReason,
    sourceRevisionId,
  };
}

function providerProjection(input: ReturnType<typeof normalizeAttachVerifiedExternalMediaInput>) {
  const file = input.verifiedFile;
  return {
    connectionId: input.connectionId,
    connectionKey: file.connectionKey,
    sharedDriveId: file.sharedDriveId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    headRevisionKey: file.headRevisionKey,
    checksumSha256: file.checksumSha256,
    providerCreatedAt: file.providerCreatedAt,
    providerModifiedAt: file.providerModifiedAt,
    accessState: file.accessState,
    capabilityState: file.capabilityState,
    providerLocatorJson: {
      schema: "quipsly-provider-locator-v1",
      externalFileId: file.externalFileId,
      sharedDriveId: file.sharedDriveId,
      resourceKey: file.resourceKey,
      localPath: file.localPath,
    },
    capabilitySnapshotJson: {
      schema: "quipsly-provider-capability-v1",
      canDownload: file.canDownload,
      canReadRevisions: file.canReadRevisions,
      canCopy: file.canCopy,
      downloadRestrictionReason: file.downloadRestrictionReason,
    },
  };
}

function retainedProviderProjection(reference: Prisma.StudioExternalMediaReferenceGetPayload<Record<string, never>>) {
  return {
    connectionId: reference.connectionId,
    connectionKey: reference.connectionKey,
    sharedDriveId: reference.sharedDriveId,
    fileName: reference.fileName,
    mimeType: reference.mimeType,
    sizeBytes: reference.sizeBytes,
    headRevisionKey: reference.headRevisionKey,
    checksumSha256: reference.checksumSha256,
    providerCreatedAt: reference.providerCreatedAt,
    providerModifiedAt: reference.providerModifiedAt,
    accessState: reference.accessState,
    capabilityState: reference.capabilityState,
    providerLocatorJson: reference.providerLocatorJson,
    capabilitySnapshotJson: reference.capabilitySnapshotJson,
  };
}

async function ensureProviderRevision(
  tx: Prisma.TransactionClient,
  input: ReturnType<typeof normalizeAttachVerifiedExternalMediaInput>,
  referenceId: string,
) {
  const file = input.verifiedFile;
  const identity = {
    schema: "quipsly-external-media-revision-identity-v1",
    projectId: input.projectId,
    provider: file.provider,
    externalFileId: file.externalFileId,
    sharedDriveId: file.sharedDriveId,
    headRevisionKey: file.headRevisionKey,
    sizeBytes: file.sizeBytes?.toString() ?? null,
    checksumSha256: file.checksumSha256,
    checksumMd5: file.checksumMd5,
    providerModifiedAt: file.providerModifiedAt?.toISOString() ?? null,
  };
  const identitySha256 = sha256(identity);
  const revisionKey = file.headRevisionKey ?? `metadata:${identitySha256.slice(0, 24)}`;
  const sourceState = file.checksumSha256 && file.sizeBytes && file.sizeBytes > BigInt(0)
    ? "checksum-bound"
    : file.headRevisionKey && file.checksumMd5 && file.sizeBytes && file.sizeBytes > BigInt(0)
      ? "provider-revision-bound"
      : file.headRevisionKey
        ? "provider-revision-known"
        : "provider-metadata-bound";
  const revision = await tx.studioMediaSourceRevision.upsert({
    where: { externalReferenceId_revisionKey: { externalReferenceId: referenceId, revisionKey } },
    update: {},
    create: {
      projectId: input.projectId,
      externalReferenceId: referenceId,
      revisionKey,
      identitySha256,
      contentSha256: file.checksumSha256,
      sizeBytes: file.sizeBytes,
      sourceState,
      providerModifiedAt: file.providerModifiedAt,
      verifiedAt: new Date(),
      verificationJson: {
        schema: "quipsly-external-media-verification-v1",
        state: sourceState,
        provider: file.provider,
        providerRevisionBound: Boolean(file.headRevisionKey),
        sha256Bound: Boolean(file.checksumSha256),
        providerChecksum: file.checksumMd5 ? { algorithm: "md5", value: file.checksumMd5 } : null,
        exactExecutionRule: "Resolve this provider revision, stream and SHA-256 verify exact bytes before creating a render or retained derivative.",
      },
      provenanceJson: identity,
      createdByUserId: input.actorUserId,
    },
  });
  if (revision.identitySha256 !== identitySha256) {
    throw new ExternalMediaConflictError(
      "provider-revision-conflict",
      "The provider reused a revision identity for different byte evidence. Exact-source work is held.",
    );
  }
  return revision;
}

export async function attachVerifiedExternalMediaSource(input: {
  prisma: PrismaClient;
  value: AttachVerifiedExternalMediaInput;
}): Promise<{
  reference: Prisma.StudioExternalMediaReferenceGetPayload<Record<string, never>>;
  sourceRevisionId: string;
  replayed: boolean;
}> {
  const value = normalizeAttachVerifiedExternalMediaInput(input.value);
  const requestSha256 = sha256(value);

  return input.prisma.$transaction(async (tx) => {
    const reusedRequest = await tx.studioExternalMediaReference.findFirst({
      where: {
        projectId: value.projectId,
        importedByUserId: value.actorUserId,
        clientRequestId: value.clientRequestId,
      },
      include: {
        operations: {
          where: { actorUserId: value.actorUserId, clientRequestId: value.clientRequestId },
          take: 1,
        },
      },
    });
    if (reusedRequest) {
      const receipt = reusedRequest.operations[0];
      if (!receipt || receipt.requestSha256 !== requestSha256) {
        throw new ExternalMediaConflictError(
          "request-reuse-conflict",
          "That request identity already attached a different external source.",
          reusedRequest.revision,
        );
      }
      return { reference: reusedRequest, sourceRevisionId: String((receipt.snapshotJson as { sourceRevisionId?: unknown }).sourceRevisionId ?? ""), replayed: true };
    }

    let reference = await tx.studioExternalMediaReference.findUnique({
      where: {
        projectId_provider_externalFileId: {
          projectId: value.projectId,
          provider: value.verifiedFile.provider,
          externalFileId: value.verifiedFile.externalFileId,
        },
      },
    });
    const replay = reference ? await tx.studioExternalMediaReferenceOperation.findUnique({
      where: {
        referenceId_actorUserId_clientRequestId: {
          referenceId: reference.id,
          actorUserId: value.actorUserId,
          clientRequestId: value.clientRequestId,
        },
      },
    }) : null;
    if (replay) {
      if (replay.requestSha256 !== requestSha256) {
        throw new ExternalMediaConflictError("request-reuse-conflict", "That request identity already applied different provider evidence.", reference?.revision ?? null);
      }
      return { reference: reference!, sourceRevisionId: String((replay.snapshotJson as { sourceRevisionId?: unknown }).sourceRevisionId ?? ""), replayed: true };
    }
    if (value.operation === "refresh" && !reference) {
      throw new ExternalMediaContractError("reference-not-found", "This external source is not attached to the Nest.");
    }
    if (value.operation === "refresh" && reference?.revision !== value.expectedReferenceRevision) {
      throw new ExternalMediaConflictError("stale-reference", "This external source changed on another surface.", reference?.revision ?? null);
    }

    if (!reference) {
      reference = await tx.studioExternalMediaReference.create({
        data: {
          projectId: value.projectId,
          connectionId: value.connectionId,
          provider: value.verifiedFile.provider,
          connectionKey: value.verifiedFile.connectionKey,
          externalFileId: value.verifiedFile.externalFileId,
          sharedDriveId: value.verifiedFile.sharedDriveId,
          fileName: value.verifiedFile.fileName,
          mimeType: value.verifiedFile.mimeType,
          sizeBytes: value.verifiedFile.sizeBytes,
          headRevisionKey: value.verifiedFile.headRevisionKey,
          checksumSha256: value.verifiedFile.checksumSha256,
          providerCreatedAt: value.verifiedFile.providerCreatedAt,
          providerModifiedAt: value.verifiedFile.providerModifiedAt,
          accessState: value.verifiedFile.accessState,
          capabilityState: value.verifiedFile.capabilityState,
          providerLocatorJson: {
            schema: "quipsly-provider-locator-v1",
            externalFileId: value.verifiedFile.externalFileId,
            sharedDriveId: value.verifiedFile.sharedDriveId,
            resourceKey: value.verifiedFile.resourceKey,
            localPath: value.verifiedFile.localPath,
          },
          capabilitySnapshotJson: {
            schema: "quipsly-provider-capability-v1",
            canDownload: value.verifiedFile.canDownload,
            canReadRevisions: value.verifiedFile.canReadRevisions,
            canCopy: value.verifiedFile.canCopy,
            downloadRestrictionReason: value.verifiedFile.downloadRestrictionReason,
          },
          lastVerifiedAt: new Date(),
          importedByUserId: value.actorUserId,
          importedByEmail: value.actorEmail,
          clientRequestId: value.clientRequestId,
          revision: 1,
        },
      });
      const sourceRevision = await ensureProviderRevision(tx, value, reference.id);
      await tx.studioExternalMediaReferenceOperation.create({
        data: {
          referenceId: reference.id,
          revision: 1,
          previousRevision: 0,
          operation: "attach",
          actorUserId: value.actorUserId,
          clientRequestId: value.clientRequestId,
          requestSha256,
          snapshotJson: safeSnapshot(value, reference.id, 1, sourceRevision.id),
        },
      });
      return { reference, sourceRevisionId: sourceRevision.id, replayed: false };
    }

    const sourceRevision = await ensureProviderRevision(tx, value, reference.id);
    if (stableJson(retainedProviderProjection(reference)) === stableJson(providerProjection(value))) {
      const observed = await tx.studioExternalMediaReference.updateMany({
        where: { id: reference.id, revision: reference.revision },
        data: { lastVerifiedAt: new Date() },
      });
      if (observed.count !== 1) throw new ExternalMediaConflictError("stale-reference", "This external source changed on another surface.");
      await tx.studioExternalMediaReferenceOperation.create({
        data: {
          referenceId: reference.id,
          revision: reference.revision,
          previousRevision: reference.revision,
          operation: "observe",
          actorUserId: value.actorUserId,
          clientRequestId: value.clientRequestId,
          requestSha256,
          snapshotJson: safeSnapshot(value, reference.id, reference.revision, sourceRevision.id),
        },
      });
      reference = await tx.studioExternalMediaReference.findUniqueOrThrow({ where: { id: reference.id } });
      return { reference, sourceRevisionId: sourceRevision.id, replayed: false };
    }
    const nextRevision = reference.revision + 1;
    const updated = await tx.studioExternalMediaReference.updateMany({
      where: { id: reference.id, revision: reference.revision },
      data: {
        connectionId: value.connectionId,
        connectionKey: value.verifiedFile.connectionKey,
        sharedDriveId: value.verifiedFile.sharedDriveId,
        fileName: value.verifiedFile.fileName,
        mimeType: value.verifiedFile.mimeType,
        sizeBytes: value.verifiedFile.sizeBytes,
        headRevisionKey: value.verifiedFile.headRevisionKey,
        checksumSha256: value.verifiedFile.checksumSha256,
        providerCreatedAt: value.verifiedFile.providerCreatedAt,
        providerModifiedAt: value.verifiedFile.providerModifiedAt,
        accessState: value.verifiedFile.accessState,
        capabilityState: value.verifiedFile.capabilityState,
        providerLocatorJson: {
          schema: "quipsly-provider-locator-v1",
          externalFileId: value.verifiedFile.externalFileId,
          sharedDriveId: value.verifiedFile.sharedDriveId,
          resourceKey: value.verifiedFile.resourceKey,
          localPath: value.verifiedFile.localPath,
        },
        capabilitySnapshotJson: {
          schema: "quipsly-provider-capability-v1",
          canDownload: value.verifiedFile.canDownload,
          canReadRevisions: value.verifiedFile.canReadRevisions,
          canCopy: value.verifiedFile.canCopy,
          downloadRestrictionReason: value.verifiedFile.downloadRestrictionReason,
        },
        lastVerifiedAt: new Date(),
        revision: nextRevision,
      },
    });
    if (updated.count !== 1) throw new ExternalMediaConflictError("stale-reference", "This external source changed on another surface.");
    await tx.studioExternalMediaReferenceOperation.create({
      data: {
        referenceId: reference.id,
        revision: nextRevision,
        previousRevision: reference.revision,
        operation: value.operation === "refresh" ? "refresh" : "attach-existing",
        actorUserId: value.actorUserId,
        clientRequestId: value.clientRequestId,
        requestSha256,
        snapshotJson: safeSnapshot(value, reference.id, nextRevision, sourceRevision.id),
      },
    });
    reference = await tx.studioExternalMediaReference.findUniqueOrThrow({ where: { id: reference.id } });
    return { reference, sourceRevisionId: sourceRevision.id, replayed: false };
  }, { isolationLevel: "Serializable" });
}
