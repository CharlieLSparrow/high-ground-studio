import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  parseDeviceMediaFolderObservation,
  planDeviceMediaFolderObservation,
} from "@/lib/device-media-folder-contract";
import { attachVerifiedExternalMediaSource } from "@/lib/server/external-media-source";
import { recordDeviceFolderLibraryObservation } from "@/lib/server/external-media-library";

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

function publicPlan(
  plan: ReturnType<typeof planDeviceMediaFolderObservation>,
) {
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
  observation: unknown;
}) {
  const observation = parseDeviceMediaFolderObservation(input.observation);
  const plan = planDeviceMediaFolderObservation(observation);
  const attached: Array<{
    externalFileId: string;
    externalReferenceId: string;
    sourceUnitId: string;
    replayed: boolean;
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
            schema: "quipsly-device-insta360-segment-v1",
            provider: "quipsly-device-folder",
            libraryRootName: plan.root.name,
            folderName: batch.folder.name,
            captureBatchKey: batch.folder.captureBatchKey,
            captureKey: segment.captureKey,
            segment: segment.segment,
            packageStatus: segment.status,
            requiredMemberRoles: ["primary-original", "browse-proxy"],
            observedMemberRoles: segment.members.map((member) => member.role),
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
            schema: "quipsly-device-insta360-segment-v1",
            provider: "quipsly-device-folder",
            libraryRootName: plan.root.name,
            folderName: batch.folder.name,
            captureBatchKey: batch.folder.captureBatchKey,
            captureKey: segment.captureKey,
            segment: segment.segment,
            packageStatus: segment.status,
            requiredMemberRoles: ["primary-original", "browse-proxy"],
            observedMemberRoles: segment.members.map((member) => member.role),
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
    clientRequestId: input.clientRequestId,
    plan,
    attachments: attached,
  });
  return {
    plan: publicPlan(plan),
    attachedCount: attached.length,
    sourceUnitCount: new Set(attached.map((item) => item.sourceUnitId)).size,
    replayedCount: attached.filter((item) => item.replayed).length,
    sourceSetCount: 0,
    exactByteVerificationPending: attached.length > 0,
    library: library.library,
    libraryReplayed: library.replayed,
    localPathWithheld: true as const,
  };
}
