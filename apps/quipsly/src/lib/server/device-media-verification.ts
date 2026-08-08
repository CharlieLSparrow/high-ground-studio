import "server-only";

import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  DEVICE_MEDIA_VERIFICATION_PROFILE,
  deviceMediaVerificationIdentity,
  deviceMediaVerificationJobId,
  parseDeviceMediaVerificationReceipt,
} from "@/lib/device-media-verification-contract";
import { externalMediaMemberRole } from "@/lib/external-media-contract";
import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";
import { createMediaSourceSet } from "@/lib/server/source-story";

export const DEVICE_MEDIA_VERIFICATION_JOB_TYPE = "device-media-verification";
export const DEVICE_MEDIA_VERIFICATION_JOB_SOURCE =
  "source-story.device-media-verification";

export class DeviceMediaVerificationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DeviceMediaVerificationError";
  }
}

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

async function bindVerifiedDeviceSourceSet(input: {
  prisma: PrismaClient;
  projectId: string;
  libraryId: string;
  sourceUnitId: string;
  actorUserId: string;
}) {
  const [sourceUnit, items] = await Promise.all([
    input.prisma.studioSourceUnit.findFirst({
      where: {
        id: input.sourceUnitId,
        projectId: input.projectId,
        kind: "insta360-device-segment",
      },
      select: { id: true, title: true, metadataJson: true },
    }),
    input.prisma.studioExternalMediaLibraryItem.findMany({
      where: {
        libraryId: input.libraryId,
        sourceUnitId: input.sourceUnitId,
        state: "present",
        externalReferenceId: { not: null },
      },
      orderBy: [{ fileName: "asc" }, { id: "asc" }],
      include: {
        externalReference: {
          include: {
            revisions: { orderBy: { createdAt: "desc" }, take: 12 },
          },
        },
      },
    }),
  ]);
  if (!sourceUnit || items.length < 2) {
    return { state: "awaiting-members" as const, sourceSet: null };
  }
  const members = items.flatMap((item) => {
    const revision = item.externalReference?.revisions.find(
      (candidate) => candidate.revisionKey === item.observedRevisionKey,
    );
    const role = externalMediaMemberRole(
      object(revision?.projectionJson).memberRole,
    );
    return revision && role
      ? [
          {
            item,
            revision,
            role,
            channel: object(revision.projectionJson).channel,
          },
        ]
      : [];
  });
  if (
    members.length !== items.length ||
    members.some(
      ({ revision }) =>
        !revision.contentSha256 ||
        !revision.sizeBytes ||
        revision.sizeBytes <= 0n,
    )
  ) {
    return { state: "awaiting-members" as const, sourceSet: null };
  }
  const browse = members.find(({ role }) => role === "browse-proxy");
  if (!browse || !browse.revision.durationSeconds) {
    return { state: "awaiting-clock" as const, sourceSet: null };
  }
  if (!members.some(({ role }) => role === "primary-original")) {
    return { state: "awaiting-members" as const, sourceSet: null };
  }
  const metadata = object(sourceUnit.metadataJson);
  const captureKey =
    typeof metadata.captureKey === "string" && metadata.captureKey
      ? metadata.captureKey
      : sourceUnit.id;
  const ordered = [...members].sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      String(left.channel ?? "").localeCompare(String(right.channel ?? "")) ||
      left.item.fileName.localeCompare(right.item.fileName),
  );
  const created = await createMediaSourceSet({
    prisma: input.prisma,
    actorUserId: input.actorUserId,
    value: {
      projectId: input.projectId,
      clientRequestId: stableUuid(
        `device-source-set:${input.sourceUnitId}:${ordered
          .map(({ revision }) => revision.id)
          .join(":")}`,
      ),
      kind: "insta360-360",
      captureKey,
      displayName: sourceUnit.title,
      sourceClockRevisionId: browse.revision.id,
      members: ordered.map(({ revision, role }, ordinal) => ({
        sourceRevisionId: revision.id,
        role,
        ordinal,
        requiredForRender: role !== "browse-proxy",
      })),
      metadata: {
        schema: "quipsly-device-insta360-source-set-v1",
        sourceUnitId: input.sourceUnitId,
        exactMembersVerifiedInPlace: true,
        originalRemainsOnAuthorizedDevice: true,
        localPathsWithheld: true,
      },
    },
  });
  return { state: "bound" as const, sourceSet: created.sourceSet };
}

export async function registerDeviceMediaVerification(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  receipt: unknown;
}) {
  const receipt = parseDeviceMediaVerificationReceipt(input.receipt);
  const executorTarget = await readLocalExecutorTarget(
    input.prisma,
    receipt.custodianNodeId,
  );
  if (
    !executorTarget ||
    executorTarget.storageScopeId !== receipt.storageScopeId
  ) {
    throw new DeviceMediaVerificationError(
      "device-media-executor-unavailable",
      "The Mac media workspace that verified these bytes is offline or has changed. Restart its local worker and retry from that Mac.",
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
          items: {
            where: { externalFileId: receipt.externalFileId },
            take: 1,
          },
        },
      });
      if (!library) {
        throw new DeviceMediaVerificationError(
          "device-library-authority-required",
          "Only the Mac account that granted this followed folder can verify its source bytes.",
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
        throw new DeviceMediaVerificationError(
          "device-library-grant-mismatch",
          "The in-place verification belongs to a different Mac folder grant.",
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
        throw new DeviceMediaVerificationError(
          "device-library-observation-changed",
          "The followed folder changed while its bytes were being verified. Refresh it before retrying.",
          409,
        );
      }
      const source = await tx.studioMediaSourceRevision.findFirst({
        where: {
          id: receipt.sourceRevisionId,
          projectId: input.projectId,
          sourceUnitId: item.sourceUnitId,
          externalReferenceId: receipt.externalReferenceId,
        },
        include: { externalReference: true },
      });
      const role = externalMediaMemberRole(
        object(source?.projectionJson).memberRole,
      );
      if (
        !source?.externalReference ||
        source.externalReference.provider !== "quipsly-device-folder" ||
        source.revisionKey !== receipt.observedRevisionKey ||
        source.sizeBytes?.toString() !== receipt.expectedSizeBytes ||
        !source.sourceUnitId ||
        !role
      ) {
        throw new DeviceMediaVerificationError(
          "device-source-mismatch",
          "This receipt does not match a current Insta360 package member in the followed folder.",
          409,
        );
      }
      if (
        source.contentSha256 &&
        source.contentSha256 !== receipt.contentSha256
      ) {
        throw new DeviceMediaVerificationError(
          "device-source-checksum-conflict",
          "These bytes conflict with the immutable checksum already bound to this source revision.",
          409,
        );
      }
      const identity = deviceMediaVerificationIdentity({
        projectId: input.projectId,
        sourceRevisionId: source.id,
        observedRevisionKey: source.revisionKey,
        custodianNodeId: receipt.custodianNodeId,
        storageScopeId: receipt.storageScopeId,
      });
      const jobId = deviceMediaVerificationJobId(identity);
      const jobIntent = {
        schema: "quipsly-device-media-verification-job-v1",
        profile: DEVICE_MEDIA_VERIFICATION_PROFILE,
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
        memberRole: role,
        pathWithheld: true,
      };
      const existingJob = await tx.studioWorkflowJob.findUnique({
        where: { id: jobId },
      });
      if (
        existingJob &&
        JSON.stringify(existingJob.inputJson) !== JSON.stringify(jobIntent)
      ) {
        throw new DeviceMediaVerificationError(
          "device-verification-job-conflict",
          "The durable verification identity is already bound to different source intent.",
          409,
        );
      }
      const now = new Date(receipt.completedAt);
      const replayed = Boolean(existingJob);
      const resultJson = {
        state: "output-ready",
        receipt,
        requestedBy: {
          actorUserId: input.actorUserId,
          actorEmail: input.actorEmail,
          clientRequestId: input.clientRequestId,
        },
        exactSourceVerifiedInPlace: true,
        originalRemainsOnAuthorizedDevice: true,
        localPathWithheld: true,
      } satisfies Prisma.InputJsonValue;
      const job = await tx.studioWorkflowJob.upsert({
        where: { id: jobId },
        create: {
          id: jobId,
          projectId: input.projectId,
          type: DEVICE_MEDIA_VERIFICATION_JOB_TYPE,
          source: DEVICE_MEDIA_VERIFICATION_JOB_SOURCE,
          status: "output-ready",
          priority: 58,
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
      if (!replayed) {
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
              schema: "quipsly-device-media-in-place-verification-v1",
              state: "checksum-bound",
              provider: "quipsly-device-folder",
              providerRevisionKey: source.revisionKey,
              sha256Bound: true,
              exactSizeBytes: receipt.expectedSizeBytes,
              completedAt: receipt.completedAt,
              memberRole: role,
              custodianNodeId: receipt.custodianNodeId,
              storageScopeId: receipt.storageScopeId,
              exactSourceVerifiedInPlace: true,
              originalRemainsOnAuthorizedDevice: true,
              localPathWithheld: true,
            },
          },
        });
      }
      return {
        sourceUnitId: source.sourceUnitId,
        job,
        replayed,
      };
    },
    { isolationLevel: "Serializable" },
  );

  const binding = await bindVerifiedDeviceSourceSet({
    prisma: input.prisma,
    projectId: input.projectId,
    libraryId: receipt.libraryId,
    sourceUnitId: retained.sourceUnitId,
    actorUserId: input.actorUserId,
  });
  return {
    state: "verified" as const,
    verificationJobId: retained.job.id,
    sourceSet: {
      state: binding.state,
      id: binding.sourceSet?.id ?? null,
      completeness: binding.sourceSet?.completeness ?? null,
    },
    replayed: retained.replayed,
    exactSourceVerifiedInPlace: true as const,
    originalRemainsOnAuthorizedDevice: true as const,
    localPathWithheld: true as const,
  };
}
