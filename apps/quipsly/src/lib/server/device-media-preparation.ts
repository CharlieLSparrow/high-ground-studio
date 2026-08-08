import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  DEVICE_MEDIA_PREPARATION_PROFILE,
  deviceMediaPreparationIdentity,
  deviceMediaPreparationIds,
  deviceMediaPreparationTargetLocator,
  parseDeviceMediaPreparationReceipt,
} from "@/lib/device-media-preparation-contract";
import { externalMediaMemberRole } from "@/lib/external-media-contract";
import { requestExternalSourceProxy } from "@/lib/server/external-source-proxy";
import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";

export const DEVICE_MEDIA_PREPARATION_JOB_TYPE = "device-media-preparation";
export const DEVICE_MEDIA_PREPARATION_JOB_SOURCE =
  "source-story.device-media-preparation";

export class DeviceMediaPreparationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DeviceMediaPreparationError";
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sameIntent(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function registerDeviceMediaPreparation(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  receipt: unknown;
}) {
  const receipt = parseDeviceMediaPreparationReceipt(input.receipt);
  const executorTarget = await readLocalExecutorTarget(
    input.prisma,
    receipt.custodianNodeId,
  );
  if (
    !executorTarget ||
    executorTarget.storageScopeId !== receipt.storageScopeId
  ) {
    throw new DeviceMediaPreparationError(
      "device-media-executor-unavailable",
      "The Mac media workspace that prepared these bytes is offline or has changed. Restart its local worker and retry from that Mac.",
      409,
    );
  }
  const retained = await input.prisma.$transaction(
    async (tx) => {
      const library = await tx.studioExternalMediaLibrary.findFirst({
        where: {
          id: receipt.libraryId,
          projectId: input.projectId,
          provider: "quipsly-device-folder",
          createdByUserId: input.actorUserId,
        },
        include: {
          project: { select: { slug: true } },
          items: {
            where: { externalFileId: receipt.externalFileId },
            take: 1,
          },
        },
      });
      if (!library) {
        throw new DeviceMediaPreparationError(
          "device-library-authority-required",
          "Only the Mac account that granted this followed folder can register its local bytes.",
          403,
        );
      }
      const locator = object(library.providerLocatorJson);
      if (
        locator.deviceId !== receipt.deviceId ||
        locator.folderGrantId !== receipt.folderGrantId ||
        locator.custodianNodeId !== receipt.custodianNodeId ||
        locator.storageScopeId !== receipt.storageScopeId
      ) {
        throw new DeviceMediaPreparationError(
          "device-library-grant-mismatch",
          "The local preparation receipt belongs to a different Mac folder grant.",
          409,
        );
      }
      const item = library.items[0];
      if (
        !item ||
        item.state !== "present" ||
        item.externalReferenceId !== receipt.externalReferenceId ||
        item.observedRevisionKey !== receipt.observedRevisionKey ||
        item.sizeBytes?.toString() !== receipt.expectedSizeBytes
      ) {
        throw new DeviceMediaPreparationError(
          "device-library-observation-changed",
          "The followed folder changed after this preparation began. Refresh it before retrying.",
          409,
        );
      }
      const source = await tx.studioMediaSourceRevision.findFirst({
        where: {
          id: receipt.sourceRevisionId,
          projectId: input.projectId,
          externalReferenceId: receipt.externalReferenceId,
        },
        include: {
          externalReference: true,
          replicas: {
            where: {
              storageProvider: "local-cache",
              status: "ready",
              custodianNodeId: receipt.custodianNodeId,
              storageScopeId: receipt.storageScopeId,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      const memberRole = externalMediaMemberRole(
        object(source?.projectionJson).memberRole,
      );
      if (
        !source?.externalReference ||
        source.externalReference.provider !== "quipsly-device-folder" ||
        source.revisionKey !== receipt.observedRevisionKey ||
        source.sizeBytes?.toString() !== receipt.expectedSizeBytes ||
        memberRole !== "browse-proxy"
      ) {
        throw new DeviceMediaPreparationError(
          "device-browse-source-mismatch",
          "This receipt does not match the currently attached Insta360 browsing member.",
          409,
        );
      }
      const expectedLocator = deviceMediaPreparationTargetLocator({
        projectSlug: library.project.slug,
        sourceRevisionId: source.id,
        observedRevisionKey: source.revisionKey,
      });
      if (receipt.targetLocator !== expectedLocator) {
        throw new DeviceMediaPreparationError(
          "device-replica-locator-mismatch",
          "The Mac retained this replica outside the server-authorized worker location.",
          409,
        );
      }
      if (
        source.contentSha256 &&
        source.contentSha256 !== receipt.contentSha256
      ) {
        throw new DeviceMediaPreparationError(
          "device-source-checksum-conflict",
          "These bytes conflict with the immutable checksum already bound to this source revision.",
          409,
        );
      }
      if (
        source.replicas[0] &&
        (source.replicas[0].contentSha256 !== receipt.contentSha256 ||
          source.replicas[0].sizeBytes.toString() !==
            receipt.expectedSizeBytes ||
          source.replicas[0].locator !== expectedLocator)
      ) {
        throw new DeviceMediaPreparationError(
          "device-replica-conflict",
          "A retained local replica is already bound to different exact-byte evidence.",
          409,
        );
      }
      const identity = deviceMediaPreparationIdentity({
        projectId: input.projectId,
        sourceRevisionId: source.id,
        observedRevisionKey: source.revisionKey,
        custodianNodeId: receipt.custodianNodeId,
        storageScopeId: receipt.storageScopeId,
      });
      const ids = deviceMediaPreparationIds(identity);
      const jobIntent = {
        schema: "quipsly-device-media-preparation-job-v1",
        profile: DEVICE_MEDIA_PREPARATION_PROFILE,
        projectId: input.projectId,
        libraryId: library.id,
        deviceId: receipt.deviceId,
        folderGrantId: receipt.folderGrantId,
        custodianNodeId: receipt.custodianNodeId,
        storageScopeId: receipt.storageScopeId,
        externalFileId: receipt.externalFileId,
        externalReferenceId: receipt.externalReferenceId,
        sourceRevisionId: source.id,
        observedRevisionKey: source.revisionKey,
        expectedSizeBytes: receipt.expectedSizeBytes,
        target: {
          provider: "local-cache",
          custodianNodeId: receipt.custodianNodeId,
          storageScopeId: receipt.storageScopeId,
          locator: expectedLocator,
        },
      };
      const existingJob = await tx.studioWorkflowJob.findUnique({
        where: { id: ids.jobId },
      });
      if (existingJob && !sameIntent(existingJob.inputJson, jobIntent)) {
        throw new DeviceMediaPreparationError(
          "device-preparation-job-conflict",
          "The durable preparation identity is already bound to different source intent.",
          409,
        );
      }
      const now = new Date(receipt.completedAt);
      const resultJson = {
        state: "output-ready",
        receipt,
        requestedBy: {
          actorUserId: input.actorUserId,
          actorEmail: input.actorEmail,
          clientRequestId: input.clientRequestId,
        },
        originalRemainsOnAuthorizedDevice: true,
        localPathWithheld: true,
      } satisfies Prisma.InputJsonValue;
      const job = await tx.studioWorkflowJob.upsert({
        where: { id: ids.jobId },
        create: {
          id: ids.jobId,
          projectId: input.projectId,
          type: DEVICE_MEDIA_PREPARATION_JOB_TYPE,
          source: DEVICE_MEDIA_PREPARATION_JOB_SOURCE,
          status: "output-ready",
          priority: 59,
          inputJson: jobIntent,
          resultJson,
          requestedByEmail: input.actorEmail,
          startedAt: now,
          completedAt: now,
        },
        update: {
          status: "output-ready",
          error: null,
          resultJson,
          completedAt: now,
        },
      });
      const generation = `sha256:${receipt.contentSha256}`;
      const replica = await tx.studioMediaSourceReplica.upsert({
        where: { id: ids.replicaId },
        create: {
          id: ids.replicaId,
          projectId: input.projectId,
          sourceRevisionId: source.id,
          workflowJobId: job.id,
          custodianNodeId: receipt.custodianNodeId,
          storageScopeId: receipt.storageScopeId,
          storageProvider: "local-cache",
          locator: expectedLocator,
          generation,
          contentSha256: receipt.contentSha256,
          sizeBytes: BigInt(receipt.expectedSizeBytes),
          mimeType: source.externalReference.mimeType ?? "video/mp4",
          status: "ready",
          availabilityCheckedAt: now,
          contentVerifiedAt: now,
          verificationJson: {
            schema: "quipsly-device-media-replica-verification-v1",
            sourceRevisionId: source.id,
            observedRevisionKey: source.revisionKey,
            exactSizeBytes: receipt.expectedSizeBytes,
            contentSha256: receipt.contentSha256,
            completedAt: receipt.completedAt,
            worker: receipt.worker,
            custodianNodeId: receipt.custodianNodeId,
            storageScopeId: receipt.storageScopeId,
          },
          provenanceJson: {
            schema: "quipsly-device-media-replica-provenance-v1",
            libraryId: library.id,
            deviceId: receipt.deviceId,
            folderGrantId: receipt.folderGrantId,
            custodianNodeId: receipt.custodianNodeId,
            storageScopeId: receipt.storageScopeId,
            externalFileId: receipt.externalFileId,
            profile: DEVICE_MEDIA_PREPARATION_PROFILE,
            localPathWithheld: true,
            originalRemainsOnAuthorizedDevice: true,
          },
          createdByUserId: input.actorUserId,
        },
        update: {
          status: "ready",
          availabilityCheckedAt: now,
          contentVerifiedAt: now,
          unavailableAt: null,
        },
      });
      await tx.studioMediaSourceRevision.update({
        where: { id: source.id },
        data: {
          contentSha256: receipt.contentSha256,
          sourceState: "checksum-bound",
          verifiedAt: now,
          durationSeconds:
            receipt.technical.durationSeconds ?? source.durationSeconds,
          widthPixels: receipt.technical.widthPixels ?? source.widthPixels,
          heightPixels: receipt.technical.heightPixels ?? source.heightPixels,
          framesPerSecond:
            receipt.technical.framesPerSecond ?? source.framesPerSecond,
          verificationJson: {
            schema: "quipsly-device-media-source-verification-v1",
            state: "checksum-bound",
            provider: "quipsly-device-folder",
            providerRevisionKey: source.revisionKey,
            sha256Bound: true,
            exactReplicaId: replica.id,
            custodianNodeId: receipt.custodianNodeId,
            storageScopeId: receipt.storageScopeId,
            exactSizeBytes: receipt.expectedSizeBytes,
            completedAt: receipt.completedAt,
            localPathWithheld: true,
          },
        },
      });
      return { source, job, replica, replayed: Boolean(source.replicas[0]) };
    },
    { isolationLevel: "Serializable" },
  );

  const proxy = await requestExternalSourceProxy({
    prisma: input.prisma,
    projectId: input.projectId,
    referenceId: receipt.externalReferenceId,
    sourceRevisionId: receipt.sourceRevisionId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    clientRequestId: input.clientRequestId,
    executorNodeId: receipt.custodianNodeId,
  });
  return {
    state: "ready" as const,
    replica: {
      id: retained.replica.id,
      status: retained.replica.status,
      contentVerifiedAt:
        retained.replica.contentVerifiedAt?.toISOString() ?? null,
      localPathWithheld: true as const,
    },
    proxy: {
      state: proxy.state,
      jobId: proxy.job?.id ?? null,
      derivativeId: proxy.derivative?.id ?? null,
    },
    replayed: retained.replayed,
    originalRemainsOnAuthorizedDevice: true as const,
  };
}
