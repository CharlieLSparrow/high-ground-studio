/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA } from "@/lib/device-media-folder-contract";

import { observeDeviceMediaFolderForNest } from "./device-media-folder";
import { registerDeviceMediaPreparation } from "./device-media-preparation";
import { registerDeviceMediaVerification } from "./device-media-verification";
import { listExternalMediaLibraries } from "./external-media-library";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDatabaseSmoke =
  process.env.QUIPSLY_DEVICE_MEDIA_FOLDER_DB_SMOKE === "1"
    ? describe
    : describe.skip;

if (process.env.QUIPSLY_DEVICE_MEDIA_FOLDER_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for device-folder proof.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDatabaseSmoke("device media folder canonical observation", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `device-folder-${nonce}@example.test`;
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";

  function observation(lrvSize = "120000000") {
    return {
      schema: DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA,
      deviceId: `device:${nonce}`,
      folderGrantId: `grant:${nonce}`,
      root: {
        id: `device-folder:${"a".repeat(56)}${nonce}`,
        name: "Homer Drive for desktop",
      },
      batches: [
        {
          id: `device-batch:${"b".repeat(56)}${nonce}`,
          name: "VID_20260808_080000_00_001_001-Original",
          files: [
            {
              id: `device-file:${"c".repeat(56)}${nonce}`,
              name: "VID_20260808_080000_00_001.insv",
              mimeType: "video/mp4",
              sizeBytes: "4200000000",
              createdTime: "2026-08-08T08:00:00.000Z",
              modifiedTime: "2026-08-08T08:03:00.000Z",
              durationSeconds: 180,
              widthPixels: 7680,
              heightPixels: 3840,
            },
            {
              id: `device-file:${"d".repeat(56)}${nonce}`,
              name: "LRV_20260808_080000_11_001.lrv",
              mimeType: "video/mp4",
              sizeBytes: lrvSize,
              createdTime: "2026-08-08T08:00:00.000Z",
              modifiedTime: "2026-08-08T08:03:00.000Z",
              durationSeconds: 180,
              widthPixels: 1920,
              heightPixels: 960,
            },
          ],
        },
      ],
    };
  }

  beforeAll(async () => {
    const actor = await prisma.user.create({
      data: { primaryEmail: actorEmail, name: "Device folder operator" },
    });
    actorUserId = actor.id;
    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `device-folder-${nonce}`,
        name: "Device folder smoke",
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `device-folder-project-${nonce}`,
        name: "High Ground Odyssey",
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    try {
      if (projectId)
        await prisma.studioMediaSourceSet.deleteMany({ where: { projectId } });
      if (workspaceId)
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId)
        await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("attaches complete packages while retaining every path only on the Mac", async () => {
    const clientRequestId = randomUUID();
    const first = await observeDeviceMediaFolderForNest({
      prisma,
      projectId,
      actorUserId,
      actorEmail,
      clientRequestId,
      observation: observation(),
    });

    expect(first).toMatchObject({
      attachedCount: 2,
      sourceUnitCount: 1,
      sourceSetCount: 0,
      exactByteVerificationPending: true,
      localPathWithheld: true,
      library: {
        provider: "quipsly-device-folder",
        revision: 1,
        status: "ready",
        canRefresh: true,
        connectionState: "device-authorized",
        discoveryMode: "device-folder-scan",
      },
      preparation: {
        totalCandidates: 1,
        exactReplicaReadyCount: 0,
        proxyReadyCount: 0,
        originalBytesWillBeCopied: false,
        localPathsWithheld: true,
      },
      verification: {
        totalCandidates: 2,
        exactVerifiedCount: 0,
        sourceSetCount: 0,
        originalBytesWillBeCopied: false,
        localPathsWithheld: true,
      },
    });
    await expect(
      observeDeviceMediaFolderForNest({
        prisma,
        projectId,
        actorUserId,
        actorEmail,
        clientRequestId,
        observation: observation(),
      }),
    ).resolves.toMatchObject({ libraryReplayed: true });

    const [references, sourceUnit, sourceSetCount, libraries] =
      await Promise.all([
        prisma.studioExternalMediaReference.findMany({
          where: { projectId, provider: "quipsly-device-folder" },
        }),
        prisma.studioSourceUnit.findFirstOrThrow({
          where: { projectId, kind: "insta360-device-segment" },
        }),
        prisma.studioMediaSourceSet.count({ where: { projectId } }),
        listExternalMediaLibraries({ prisma, projectId, actorUserId }),
      ]);
    expect(references).toHaveLength(2);
    expect(
      references.every((reference) => reference.connectionId === null),
    ).toBe(true);
    const durableLocators = JSON.stringify(
      references.map((reference) => reference.providerLocatorJson),
    );
    expect(durableLocators).not.toContain("/Users/");
    expect(durableLocators).not.toContain("/Volumes/");
    expect(sourceUnit.sourceUrl).toBeNull();
    expect(sourceUnit.sourcePath).toBeNull();
    expect(sourceSetCount).toBe(0);
    expect(libraries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "quipsly-device-folder",
          canRefresh: true,
          connectionId: null,
        }),
      ]),
    );

    const candidate = first.preparation.candidates[0]!;
    const prepared = await registerDeviceMediaPreparation({
      prisma,
      projectId,
      actorUserId,
      actorEmail,
      clientRequestId: randomUUID(),
      receipt: {
        schema: "quipsly-device-media-preparation-receipt-v1",
        libraryId: candidate.libraryId,
        deviceId: candidate.deviceId,
        folderGrantId: candidate.folderGrantId,
        externalFileId: candidate.externalFileId,
        externalReferenceId: candidate.externalReferenceId,
        sourceRevisionId: candidate.sourceRevisionId,
        observedRevisionKey: candidate.observedRevisionKey,
        expectedSizeBytes: candidate.expectedSizeBytes,
        targetLocator: candidate.targetLocator,
        contentSha256: "e".repeat(64),
        completedAt: "2026-08-08T09:00:00.000Z",
        technical: {
          durationSeconds: 180,
          widthPixels: 1920,
          heightPixels: 960,
          framesPerSecond: 29.97,
        },
        worker: {
          executionId: `device-prep:${nonce}`,
          buildId: "integration-test",
        },
      },
    });
    expect(prepared).toMatchObject({
      state: "ready",
      replica: { status: "ready", localPathWithheld: true },
      proxy: { state: "queued" },
      originalRemainsOnAuthorizedDevice: true,
    });
    const [replica, revision, proxyJob, preparedLibraries] = await Promise.all([
      prisma.studioMediaSourceReplica.findFirstOrThrow({
        where: { sourceRevisionId: candidate.sourceRevisionId },
      }),
      prisma.studioMediaSourceRevision.findUniqueOrThrow({
        where: { id: candidate.sourceRevisionId },
      }),
      prisma.studioWorkflowJob.findFirstOrThrow({
        where: {
          projectId,
          type: "external-source-proxy",
          status: "queued",
        },
      }),
      listExternalMediaLibraries({ prisma, projectId, actorUserId }),
    ]);
    expect(replica.locator).toBe(candidate.targetLocator);
    expect(replica.locator).not.toContain("/Users/");
    expect(revision.contentSha256).toBe("e".repeat(64));
    expect(revision.sourceState).toBe("checksum-bound");
    expect(proxyJob.inputJson).toMatchObject({
      source: { provider: "quipsly-device-folder" },
    });
    expect(preparedLibraries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: candidate.libraryId,
          navigationHealth: expect.objectContaining({
            eligibleMemberCount: 2,
            exactVerifiedMemberCount: 1,
            sourceUnitCount: 1,
            completeSourceSetCount: 0,
            eligibleSourceCount: 1,
            retainedBrowseCount: 1,
            proxyReadyCount: 0,
            browseReadyCount: 0,
          }),
        }),
      ]),
    );

    const originalCandidate = first.verification.candidates.find(
      (item) => item.memberRole === "primary-original",
    )!;
    const verified = await registerDeviceMediaVerification({
      prisma,
      projectId,
      actorUserId,
      actorEmail,
      clientRequestId: randomUUID(),
      receipt: {
        schema: "quipsly-device-media-verification-receipt-v1",
        libraryId: originalCandidate.libraryId,
        deviceId: originalCandidate.deviceId,
        folderGrantId: originalCandidate.folderGrantId,
        externalFileId: originalCandidate.externalFileId,
        externalReferenceId: originalCandidate.externalReferenceId,
        sourceRevisionId: originalCandidate.sourceRevisionId,
        observedRevisionKey: originalCandidate.observedRevisionKey,
        expectedSizeBytes: originalCandidate.expectedSizeBytes,
        contentSha256: "f".repeat(64),
        completedAt: "2026-08-08T09:05:00.000Z",
        technical: {
          durationSeconds: 180,
          widthPixels: 7680,
          heightPixels: 3840,
          framesPerSecond: 29.97,
        },
        worker: {
          executionId: `device-verify:${nonce}`,
          buildId: "integration-test",
        },
      },
    });
    expect(verified).toMatchObject({
      state: "verified",
      sourceSet: { state: "bound", completeness: "complete" },
      exactSourceVerifiedInPlace: true,
      originalRemainsOnAuthorizedDevice: true,
      localPathWithheld: true,
    });
    const [sourceSet, originalRevision, originalReplicas, verifiedLibraries] =
      await Promise.all([
        prisma.studioMediaSourceSet.findFirstOrThrow({
          where: { projectId },
          include: { members: true },
        }),
        prisma.studioMediaSourceRevision.findUniqueOrThrow({
          where: { id: originalCandidate.sourceRevisionId },
        }),
        prisma.studioMediaSourceReplica.count({
          where: { sourceRevisionId: originalCandidate.sourceRevisionId },
        }),
        listExternalMediaLibraries({ prisma, projectId, actorUserId }),
      ]);
    expect(sourceSet.members).toHaveLength(2);
    expect(sourceSet.sourceClockRevisionId).toBe(candidate.sourceRevisionId);
    expect(originalRevision.contentSha256).toBe("f".repeat(64));
    expect(originalRevision.verificationJson).toMatchObject({
      exactSourceVerifiedInPlace: true,
      localPathWithheld: true,
    });
    expect(originalReplicas).toBe(0);
    expect(verifiedLibraries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: candidate.libraryId,
          navigationHealth: expect.objectContaining({
            exactVerifiedMemberCount: 2,
            completeSourceSetCount: 1,
          }),
        }),
      ]),
    );

    const second = await observeDeviceMediaFolderForNest({
      prisma,
      projectId,
      actorUserId,
      actorEmail,
      clientRequestId: randomUUID(),
      observation: observation("0"),
    });
    expect(second).toMatchObject({
      attachedCount: 0,
      library: { revision: 2, status: "attention", heldSegmentCount: 1 },
    });
    expect(
      await prisma.studioExternalMediaReference.count({
        where: { projectId, provider: "quipsly-device-folder" },
      }),
    ).toBe(2);
  });
});
