import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  DeviceMediaFolderContractError,
  parseDeviceMediaFolderObservation,
  planDeviceMediaFolderObservation,
} from "@/lib/device-media-folder-contract";
import { deviceMediaPreparationTargetLocator } from "@/lib/device-media-preparation-contract";
import { attachVerifiedExternalMediaSource } from "@/lib/server/external-media-source";
import { recordDeviceFolderLibraryObservation } from "@/lib/server/external-media-library";
import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function sourceUnitSlug(rootId: string, segmentKey: string) {
  return `device-360-${createHash("sha256")
    .update(`${rootId}:${segmentKey}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function publicPlan(plan: ReturnType<typeof planDeviceMediaFolderObservation>) {
  return {
    schema: plan.schema,
    root: { name: plan.root.name },
    status: plan.status,
    totalFiles: plan.totalFiles,
    totalSizeBytes: plan.totalSizeBytes,
    readySegmentCount: plan.readySegmentCount,
    heldSegmentCount: plan.heldSegmentCount,
    batches: plan.batches.map((batch) => ({
      folder: {
        name: batch.folder.name,
        captureBatchKey: batch.folder.captureBatchKey,
        expectedSegments: batch.folder.expectedSegments,
      },
      status: batch.status,
      totalFiles: batch.totalFiles,
      totalSizeBytes: batch.totalSizeBytes,
      readySegmentCount: batch.readySegmentCount,
      heldSegmentCount: batch.heldSegmentCount,
      segments: batch.segments.map((segment) => ({
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
          durationSeconds: member.durationSeconds,
          widthPixels: member.widthPixels,
          heightPixels: member.heightPixels,
        })),
      })),
    })),
  };
}

export async function observeDeviceMediaFolderForNest(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  executorNodeId: string;
  storageScopeId: string;
  observation: unknown;
}) {
  const observation = parseDeviceMediaFolderObservation(input.observation);
  const plan = planDeviceMediaFolderObservation(observation);
  const executorTarget = await readLocalExecutorTarget(
    input.prisma,
    input.executorNodeId,
  );
  if (
    !executorTarget ||
    executorTarget.storageScopeId !== input.storageScopeId
  ) {
    throw new DeviceMediaFolderContractError(
      "device-media-executor-unavailable",
      "The Mac media workspace following this folder is offline or has changed. Restart its local worker and try again.",
      409,
    );
  }
  const project = await input.prisma.studioProject.findUniqueOrThrow({
    where: { id: input.projectId },
    select: { slug: true },
  });
  const attached: Array<{
    externalFileId: string;
    externalReferenceId: string;
    sourceUnitId: string;
    replayed: boolean;
  }> = [];
  const preparationCandidates: Array<{
    libraryId?: string;
    deviceId: string;
    folderGrantId: string;
    custodianNodeId: string;
    storageScopeId: string;
    externalFileId: string;
    externalReferenceId: string;
    sourceRevisionId: string;
    observedRevisionKey: string;
    expectedSizeBytes: string;
    fileName: string;
    captureKey: string;
    capturedAt: string;
    targetLocator: string;
  }> = [];
  const verificationCandidates: Array<{
    libraryId?: string;
    deviceId: string;
    folderGrantId: string;
    custodianNodeId: string;
    storageScopeId: string;
    sourceUnitId: string;
    externalFileId: string;
    externalReferenceId: string;
    sourceRevisionId: string;
    observedRevisionKey: string;
    expectedSizeBytes: string;
    fileName: string;
    captureKey: string;
    capturedAt: string;
    memberRole: "browse-proxy" | "primary-original" | "secondary-original";
    channel: string | null;
  }> = [];

  for (const batch of plan.batches) {
    for (const segment of batch.segments.filter(
      (candidate) => candidate.status === "ready-to-attach",
    )) {
      const sourceUnit = await input.prisma.studioSourceUnit.upsert({
        where: {
          projectId_slug: {
            projectId: input.projectId,
            slug: sourceUnitSlug(observation.root.id, segment.key),
          },
        },
        update: {
          title: segment.displayName,
          capturedAt: new Date(segment.capturedAt),
          metadataJson: {
            schema: "quipsly-device-insta360-segment-v2",
            provider: "quipsly-device-folder",
            libraryRootName: plan.root.name,
            folderName: batch.folder.name,
            captureBatchKey: batch.folder.captureBatchKey,
            captureKey: segment.captureKey,
            segment: segment.segment,
            packageStatus: segment.status,
            requiredMemberRoles: ["primary-original", "browse-proxy"],
            observedMemberRoles: segment.members.map((member) => member.role),
            custodianNodeId: executorTarget.nodeId,
            storageScopeId: executorTarget.storageScopeId,
            originalRemainsOnAuthorizedDevice: true,
            localPathWithheld: true,
          },
        },
        create: {
          projectId: input.projectId,
          slug: sourceUnitSlug(observation.root.id, segment.key),
          kind: "insta360-device-segment",
          title: segment.displayName,
          sourceUrl: null,
          capturedAt: new Date(segment.capturedAt),
          metadataJson: {
            schema: "quipsly-device-insta360-segment-v2",
            provider: "quipsly-device-folder",
            libraryRootName: plan.root.name,
            folderName: batch.folder.name,
            captureBatchKey: batch.folder.captureBatchKey,
            captureKey: segment.captureKey,
            segment: segment.segment,
            packageStatus: segment.status,
            requiredMemberRoles: ["primary-original", "browse-proxy"],
            observedMemberRoles: segment.members.map((member) => member.role),
            custodianNodeId: executorTarget.nodeId,
            storageScopeId: executorTarget.storageScopeId,
            originalRemainsOnAuthorizedDevice: true,
            localPathWithheld: true,
          },
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
            connectionId: null,
            clientRequestId: stableUuid(
              `${input.clientRequestId}:${member.id}`,
            ),
            operation: "attach",
            verifiedFile: {
              provider: "quipsly-device-folder",
              connectionKey: `quipsly-device-folder:${observation.deviceId}:${observation.folderGrantId}`,
              externalFileId: member.id,
              fileName: member.name,
              mimeType: member.mimeType,
              sizeBytes: member.sizeBytes,
              headRevisionKey: member.headRevisionId,
              durationSeconds: member.durationSeconds,
              widthPixels: member.widthPixels,
              heightPixels: member.heightPixels,
              mediaProjection: "dual-fisheye",
              projectionMetadata: {
                schema: "quipsly-device-insta360-member-v1",
                captureKey: segment.captureKey,
                segment: segment.segment,
                memberRole: member.role,
                channel: member.channel,
                stitched: false,
                cameraViewLayout: "dual-fisheye",
                exactBytesResolveOnAuthorizedDevice: true,
              },
              providerCreatedAt: member.createdTime,
              providerModifiedAt: member.modifiedTime,
              accessState: "available",
              capabilityState: "metadata-only",
              canDownload: false,
              canReadRevisions: false,
              canCopy: false,
              downloadRestrictionReason:
                "Exact bytes remain behind a user-authorized security-scoped folder grant on the originating Mac.",
            },
          },
        });
        attached.push({
          externalFileId: member.id,
          externalReferenceId: result.reference.id,
          sourceUnitId: sourceUnit.id,
          replayed: result.replayed,
        });
        verificationCandidates.push({
          deviceId: observation.deviceId,
          folderGrantId: observation.folderGrantId,
          custodianNodeId: executorTarget.nodeId,
          storageScopeId: executorTarget.storageScopeId,
          sourceUnitId: sourceUnit.id,
          externalFileId: member.id,
          externalReferenceId: result.reference.id,
          sourceRevisionId: result.canonicalSourceRevisionId,
          observedRevisionKey: member.headRevisionId!,
          expectedSizeBytes: member.sizeBytes!,
          fileName: member.name,
          captureKey: segment.captureKey,
          capturedAt: segment.capturedAt,
          memberRole: member.role,
          channel: member.channel,
        });
        if (member.role === "browse-proxy") {
          preparationCandidates.push({
            deviceId: observation.deviceId,
            folderGrantId: observation.folderGrantId,
            custodianNodeId: executorTarget.nodeId,
            storageScopeId: executorTarget.storageScopeId,
            externalFileId: member.id,
            externalReferenceId: result.reference.id,
            sourceRevisionId: result.canonicalSourceRevisionId,
            observedRevisionKey: member.headRevisionId!,
            expectedSizeBytes: member.sizeBytes!,
            fileName: member.name,
            captureKey: segment.captureKey,
            capturedAt: segment.capturedAt,
            targetLocator: deviceMediaPreparationTargetLocator({
              projectSlug: project.slug,
              sourceRevisionId: result.canonicalSourceRevisionId,
              observedRevisionKey: member.headRevisionId!,
            }),
          });
        }
      }
    }
  }

  const library = await recordDeviceFolderLibraryObservation({
    prisma: input.prisma,
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    externalRootId: observation.root.id,
    deviceId: observation.deviceId,
    folderGrantId: observation.folderGrantId,
    custodianNodeId: executorTarget.nodeId,
    storageScopeId: executorTarget.storageScopeId,
    clientRequestId: input.clientRequestId,
    plan,
    attachments: attached,
  });
  const readiness = await input.prisma.studioMediaSourceRevision.findMany({
    where: {
      id: {
        in: verificationCandidates.map(
          (candidate) => candidate.sourceRevisionId,
        ),
      },
    },
    select: {
      id: true,
      replicas: {
        where: {
          storageProvider: "local-cache",
          status: "ready",
          custodianNodeId: executorTarget.nodeId,
          storageScopeId: executorTarget.storageScopeId,
        },
        select: { id: true },
        take: 1,
      },
      derivatives: {
        where: {
          kind: "collaboration-proxy",
          status: "ready",
          custodianNodeId: executorTarget.nodeId,
          storageScopeId: executorTarget.storageScopeId,
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  const readinessByRevision = new Map(
    readiness.map((revision) => [revision.id, revision]),
  );
  const verificationJobs = await input.prisma.studioWorkflowJob.findMany({
    where: {
      projectId: input.projectId,
      type: "device-media-verification",
      status: "output-ready",
      AND: [
        {
          inputJson: {
            path: ["custodianNodeId"],
            equals: executorTarget.nodeId,
          },
        },
        {
          inputJson: {
            path: ["storageScopeId"],
            equals: executorTarget.storageScopeId,
          },
        },
      ],
    },
    select: { inputJson: true },
  });
  const candidateRevisionIds = new Set(
    verificationCandidates.map((candidate) => candidate.sourceRevisionId),
  );
  const verifiedRevisionIds = new Set(
    verificationJobs.flatMap((job) => {
      const intent = object(job.inputJson);
      return intent.custodianNodeId === executorTarget.nodeId &&
        intent.storageScopeId === executorTarget.storageScopeId &&
        typeof intent.sourceRevisionId === "string" &&
        candidateRevisionIds.has(intent.sourceRevisionId)
        ? [intent.sourceRevisionId]
        : [];
    }),
  );
  for (const revision of readiness) {
    if (revision.replicas.length) verifiedRevisionIds.add(revision.id);
  }
  const sourceSets = verifiedRevisionIds.size
    ? await input.prisma.studioMediaSourceSet.findMany({
        where: {
          projectId: input.projectId,
          members: {
            some: { sourceRevisionId: { in: [...verifiedRevisionIds] } },
          },
        },
        select: {
          id: true,
          members: { select: { sourceRevisionId: true } },
        },
      })
    : [];
  const sourceSetCount = sourceSets.filter((sourceSet) =>
    sourceSet.members.every((member) =>
      verifiedRevisionIds.has(member.sourceRevisionId),
    ),
  ).length;
  const exactVerifiedCount = verificationCandidates.filter((candidate) =>
    verifiedRevisionIds.has(candidate.sourceRevisionId),
  ).length;
  return {
    plan: publicPlan(plan),
    attachedCount: attached.length,
    sourceUnitCount: new Set(attached.map((item) => item.sourceUnitId)).size,
    replayedCount: attached.filter((item) => item.replayed).length,
    sourceSetCount,
    exactByteVerificationPending:
      verificationCandidates.length > exactVerifiedCount,
    library: library.library,
    libraryReplayed: library.replayed,
    preparation: {
      schema: "quipsly-device-media-preparation-plan-v2" as const,
      mode: "explicit-browse-copy" as const,
      totalCandidates: preparationCandidates.length,
      exactReplicaReadyCount: preparationCandidates.filter(
        (candidate) =>
          readinessByRevision.get(candidate.sourceRevisionId)?.replicas.length,
      ).length,
      proxyReadyCount: preparationCandidates.filter(
        (candidate) =>
          readinessByRevision.get(candidate.sourceRevisionId)?.derivatives
            .length,
      ).length,
      candidates: preparationCandidates.map((candidate) => ({
        ...candidate,
        libraryId: library.library.id,
        exactReplicaReady: Boolean(
          readinessByRevision.get(candidate.sourceRevisionId)?.replicas.length,
        ),
        proxyReady: Boolean(
          readinessByRevision.get(candidate.sourceRevisionId)?.derivatives
            .length,
        ),
      })),
      originalBytesWillBeCopied: false as const,
      localPathsWithheld: true as const,
    },
    verification: {
      schema: "quipsly-device-media-verification-plan-v2" as const,
      mode: "in-place-read-only" as const,
      totalCandidates: verificationCandidates.length,
      exactVerifiedCount,
      sourceSetCount,
      candidates: verificationCandidates.map((candidate) => ({
        ...candidate,
        libraryId: library.library.id,
        exactBytesVerified: verifiedRevisionIds.has(candidate.sourceRevisionId),
      })),
      originalBytesWillBeCopied: false as const,
      localPathsWithheld: true as const,
    },
    localPathWithheld: true as const,
  };
}
