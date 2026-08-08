/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  planGoogleDriveMediaFolder,
  planGoogleDriveMediaLibrary,
  type GoogleDriveFolderMediaItem,
} from "@/lib/google-drive-media-package";

import {
  listExternalMediaLibraries,
  recordGoogleDriveLibraryObservation,
} from "./external-media-library";
import { disconnectGoogleDriveConnection } from "./google-drive-connection";
import { encryptGoogleDriveRefreshToken } from "./google-drive-oauth";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDatabaseSmoke =
  process.env.QUIPSLY_EXTERNAL_MEDIA_LIBRARY_DB_SMOKE === "1"
    ? describe
    : describe.skip;

if (process.env.QUIPSLY_EXTERNAL_MEDIA_LIBRARY_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for followed-library proof.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

function file(
  id: string,
  name: string,
  sizeBytes: string,
  md5Character: string,
): GoogleDriveFolderMediaItem {
  return {
    id,
    name,
    mimeType: "video/3gpp",
    sizeBytes,
    headRevisionId: null,
    md5Checksum: md5Character.repeat(32),
    resourceKey: null,
    createdTime: "2026-08-07T12:00:00.000Z",
    modifiedTime: "2026-08-07T12:00:00.000Z",
    driveId: null,
    durationSeconds: 12,
    widthPixels: 3840,
    heightPixels: 1920,
    canDownload: true,
    canCopy: true,
    canReadRevisions: true,
  };
}

function plan(files: GoogleDriveFolderMediaItem[]) {
  return planGoogleDriveMediaLibrary({
    rootFolderId: "followed_root_01",
    rootFolderName: "Homer 360 Library",
    batches: [
      planGoogleDriveMediaFolder({
        folderId: "camera_batch_01",
        folderName: "Camera batch",
        files,
      }),
    ],
  });
}

runDatabaseSmoke("followed external media library", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `library-owner-${nonce}@example.test`;
  let actorUserId = "";
  let collaboratorUserId = "";
  let workspaceId = "";
  let projectId = "";
  let connectionId = "";
  const encryptionKey = Buffer.alloc(32, 17);
  const oauthEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    QUIPSLY_APP_HOST: "http://127.0.0.1:3012",
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: "drive-client",
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "drive-secret",
    GOOGLE_DRIVE_OAUTH_STATE_SECRET: "s".repeat(48),
    GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY:
      encryptionKey.toString("base64url"),
  };

  beforeAll(async () => {
    const [actor, collaborator] = await Promise.all([
      prisma.user.create({
        data: { primaryEmail: actorEmail, name: "Library owner" },
      }),
      prisma.user.create({
        data: {
          primaryEmail: `library-collaborator-${nonce}@example.test`,
          name: "Library collaborator",
        },
      }),
    ]);
    actorUserId = actor.id;
    collaboratorUserId = collaborator.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `library-${nonce}`, name: "Followed library proof" },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `library-project-${nonce}`,
        name: "Homer 360 Library",
      },
    });
    projectId = project.id;
    const connection = await prisma.studioMediaProviderConnection.create({
      data: {
        userId: actorUserId,
        provider: "google-drive",
        providerAccountKey: `library-proof-${nonce}`,
        status: "verified",
        verifiedAt: new Date(),
        credential: {
          create: {
            encryptedPayload: encryptGoogleDriveRefreshToken(
              "followed-library-refresh-token",
              encryptionKey,
            ),
            encryptionVersion: "aes-256-gcm-drive-v1",
          },
        },
      },
    });
    connectionId = connection.id;
  });

  afterAll(async () => {
    try {
      if (workspaceId)
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (connectionId)
        await prisma.studioMediaProviderConnection.deleteMany({
          where: { id: connectionId },
        });
      await prisma.user.deleteMany({
        where: {
          id: { in: [actorUserId, collaboratorUserId].filter(Boolean) },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("refreshes evolving provider inventory without deleting missing observations", async () => {
    const original = file(
      "insv_001",
      "VID_20260807_120000_00_001.insv",
      "2000",
      "a",
    );
    const browse = file(
      "lrv_001",
      "LRV_20260807_120000_01_001.lrv",
      "200",
      "b",
    );
    const firstRequestId = randomUUID();
    const first = await recordGoogleDriveLibraryObservation({
      prisma,
      projectId,
      actorUserId,
      actorEmail,
      connectionId,
      externalRootId: "followed_root_01",
      sharedDriveId: null,
      resourceKey: "selected_resource_01",
      clientRequestId: firstRequestId,
      plan: plan([original, browse]),
      attachments: [],
    });
    expect(first).toMatchObject({
      replayed: false,
      library: {
        status: "ready",
        revision: 1,
        totalFileCount: 2,
        notObservedCount: 0,
        canRefresh: true,
      },
    });
    await expect(
      recordGoogleDriveLibraryObservation({
        prisma,
        projectId,
        actorUserId,
        actorEmail,
        connectionId,
        externalRootId: "followed_root_01",
        sharedDriveId: null,
        resourceKey: "selected_resource_01",
        clientRequestId: firstRequestId,
        plan: plan([original, browse]),
        attachments: [],
      }),
    ).resolves.toMatchObject({ replayed: true });

    const secondOriginal = file(
      "insv_002",
      "VID_20260807_120000_00_002.insv",
      "3000",
      "c",
    );
    const secondBrowse = file(
      "lrv_002",
      "LRV_20260807_120000_01_002.lrv",
      "300",
      "d",
    );
    const changedBrowse = {
      ...browse,
      sizeBytes: "240",
      md5Checksum: "e".repeat(32),
    };
    const second = await recordGoogleDriveLibraryObservation({
      prisma,
      projectId,
      actorUserId,
      actorEmail,
      connectionId,
      externalRootId: "followed_root_01",
      sharedDriveId: null,
      resourceKey: "selected_resource_01",
      clientRequestId: randomUUID(),
      plan: plan([changedBrowse, secondOriginal, secondBrowse]),
      attachments: [],
    });
    expect(second.library).toMatchObject({
      status: "attention",
      revision: 2,
      totalFileCount: 3,
      notObservedCount: 1,
    });
    const retained = await prisma.studioExternalMediaLibraryItem.findUnique({
      where: {
        libraryId_externalFileId: {
          libraryId: first.library.id,
          externalFileId: original.id,
        },
      },
    });
    expect(retained).toMatchObject({
      state: "not-observed",
      missingObservationCount: 1,
      fileName: original.name,
    });

    const third = await recordGoogleDriveLibraryObservation({
      prisma,
      projectId,
      actorUserId,
      actorEmail,
      connectionId,
      externalRootId: "followed_root_01",
      sharedDriveId: null,
      resourceKey: "selected_resource_01",
      clientRequestId: randomUUID(),
      plan: plan([original, changedBrowse, secondOriginal, secondBrowse]),
      attachments: [],
    });
    expect(third.library).toMatchObject({
      status: "ready",
      revision: 3,
      totalFileCount: 4,
      notObservedCount: 0,
    });
    await expect(
      prisma.studioExternalMediaLibraryItem.findUnique({
        where: {
          libraryId_externalFileId: {
            libraryId: first.library.id,
            externalFileId: original.id,
          },
        },
      }),
    ).resolves.toMatchObject({ state: "present", missingObservationCount: 0 });

    const operations =
      await prisma.studioExternalMediaLibraryOperation.findMany({
        where: { libraryId: first.library.id },
        orderBy: { revision: "asc" },
      });
    expect(operations).toHaveLength(3);
    expect(operations.map((operation) => operation.operation)).toEqual([
      "attach-library",
      "refresh-library",
      "refresh-library",
    ]);
    expect(operations[1].snapshotJson).toMatchObject({
      health: {
        addedCount: 2,
        changedCount: 1,
        notObservedCount: 1,
        noAutomaticDeletion: true,
      },
    });

    const collaboratorView = await listExternalMediaLibraries({
      prisma,
      projectId,
      actorUserId: collaboratorUserId,
    });
    expect(collaboratorView[0]).toMatchObject({
      canRefresh: false,
      connectedByCurrentUser: false,
      totalFileCount: 4,
    });
    expect(JSON.stringify(collaboratorView)).not.toContain("followed_root_01");
    expect(JSON.stringify(collaboratorView)).not.toContain(
      "selected_resource_01",
    );

    const collaboratorConnection =
      await prisma.studioMediaProviderConnection.create({
        data: {
          userId: collaboratorUserId,
          provider: "google-drive",
          providerAccountKey: `library-collaborator-proof-${nonce}`,
          status: "verified",
          verifiedAt: new Date(),
        },
      });
    await expect(
      recordGoogleDriveLibraryObservation({
        prisma,
        projectId,
        actorUserId: collaboratorUserId,
        actorEmail: `library-collaborator-${nonce}@example.test`,
        connectionId: collaboratorConnection.id,
        externalRootId: "followed_root_01",
        sharedDriveId: null,
        resourceKey: "collaborator_resource_01",
        clientRequestId: randomUUID(),
        plan: plan([original, changedBrowse, secondOriginal, secondBrowse]),
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: "library-connection-conflict",
      status: 409,
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (_url, init) => {
      expect(String(init?.body)).toContain("followed-library-refresh-token");
      return new Response("", { status: 200 });
    }) as typeof fetch;
    try {
      await expect(
        disconnectGoogleDriveConnection({
          prisma,
          userId: actorUserId,
          connectionId,
          clientRequestId: randomUUID(),
          requestUrl:
            "http://127.0.0.1:3012/api/media/connections/google-drive",
          environment: oauthEnvironment,
        }),
      ).resolves.toMatchObject({ connection: { status: "revoked" } });
    } finally {
      global.fetch = originalFetch;
    }
    await expect(
      prisma.studioExternalMediaLibrary.findUnique({
        where: { id: first.library.id },
        select: { status: true, revision: true },
      }),
    ).resolves.toEqual({ status: "needs-reauth", revision: 4 });
    await expect(
      prisma.studioExternalMediaLibraryOperation.findMany({
        where: { libraryId: first.library.id },
        orderBy: { revision: "asc" },
        select: { operation: true },
      }),
    ).resolves.toEqual([
      { operation: "attach-library" },
      { operation: "refresh-library" },
      { operation: "refresh-library" },
      { operation: "connection-revoked" },
    ]);
  });

  it("retains an explicitly granted file set as a least-privilege refresh manifest", async () => {
    const selectionConnection =
      await prisma.studioMediaProviderConnection.create({
        data: {
          userId: actorUserId,
          provider: "google-drive",
          providerAccountKey: `library-selection-proof-${nonce}`,
          status: "verified",
          verifiedAt: new Date(),
        },
      });
    try {
      const original = file(
        "selected_insv_001",
        "VID_20260807_130000_00_001.insv",
        "2000",
        "f",
      );
      const browse = file(
        "selected_lrv_001",
        "LRV_20260807_130000_01_001.lrv",
        "200",
        "e",
      );
      const selectedPlan = plan([original, browse]);
      selectedPlan.root = {
        id: "selected_root_02",
        name: "Explicitly selected 360 files",
      };
      const result = await recordGoogleDriveLibraryObservation({
        prisma,
        projectId,
        actorUserId,
        actorEmail,
        connectionId: selectionConnection.id,
        externalRootId: "selected_root_02",
        sharedDriveId: null,
        resourceKey: "selected_root_resource_02",
        selectionManifest: [
          {
            externalFileId: original.id,
            resourceKey: "selected_original_resource_02",
          },
          { externalFileId: browse.id, resourceKey: null },
        ],
        clientRequestId: randomUUID(),
        plan: selectedPlan,
        attachments: [],
      });
      expect(result.library).toMatchObject({
        discoveryMode: "selected-files",
        totalFileCount: 2,
        canRefresh: true,
      });
      await expect(
        prisma.studioExternalMediaLibrary.findUniqueOrThrow({
          where: { id: result.library.id },
          select: { providerLocatorJson: true },
        }),
      ).resolves.toMatchObject({
        providerLocatorJson: {
          schema: "quipsly-google-drive-library-locator-v2",
          mode: "selection-manifest",
          selections: expect.arrayContaining([
            {
              externalFileId: original.id,
              resourceKey: "selected_original_resource_02",
            },
          ]),
        },
      });
      const publicView = await listExternalMediaLibraries({
        prisma,
        projectId,
        actorUserId,
      });
      const selected = publicView.find(
        (library) => library.id === result.library.id,
      );
      expect(selected).toMatchObject({ discoveryMode: "selected-files" });
      expect(JSON.stringify(selected)).not.toContain(
        "selected_original_resource_02",
      );
      expect(JSON.stringify(selected)).not.toContain(original.id);
    } finally {
      await prisma.studioMediaProviderConnection.deleteMany({
        where: { id: selectionConnection.id },
      });
    }
  });
});
