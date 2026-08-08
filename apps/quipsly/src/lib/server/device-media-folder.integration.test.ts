/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA } from "@/lib/device-media-folder-contract";

import { observeDeviceMediaFolderForNest } from "./device-media-folder";
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

    const [references, sourceUnit, sourceSetCount, libraries] = await Promise.all([
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
    expect(references.every((reference) => reference.connectionId === null)).toBe(
      true,
    );
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
