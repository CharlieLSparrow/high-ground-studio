/** @jest-environment node */

import type { PrismaClient } from "@prisma/client";

import { attachVerifiedExternalMediaSource } from "./external-media-source";
import { getGoogleDriveAccess } from "./google-drive-connection";
import { recordGoogleDriveLibraryObservation } from "./external-media-library";
import { attachGoogleDriveFilesToNest } from "./google-drive-source";
import { createMediaSourceSet } from "./source-story";

jest.mock("./external-media-source", () => ({
  attachVerifiedExternalMediaSource: jest.fn(),
}));
jest.mock("./google-drive-connection", () => ({
  getGoogleDriveAccess: jest.fn(),
}));
jest.mock("./external-media-library", () => ({
  recordGoogleDriveLibraryObservation: jest.fn(),
}));
jest.mock("./source-story", () => ({
  createMediaSourceSet: jest.fn(),
}));

const getAccess = jest.mocked(getGoogleDriveAccess);
const attachExternal = jest.mocked(attachVerifiedExternalMediaSource);
const recordLibrary = jest.mocked(recordGoogleDriveLibraryObservation);
const createSourceSet = jest.mocked(createMediaSourceSet);

describe("Google Drive selected-file package attachment", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  beforeEach(() => {
    createSourceSet.mockResolvedValue({
      sourceSet: { id: "source_set_01" },
      replayed: false,
    } as Awaited<ReturnType<typeof createMediaSourceSet>>);
  });

  it("creates one source-clock unit and binds every explicitly verified package member", async () => {
    getAccess.mockResolvedValue({
      accessToken: "short-lived-token",
      connection: { id: "connection_01" },
    } as Awaited<ReturnType<typeof getGoogleDriveAccess>>);
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const id = new URL(String(url)).pathname.split("/").pop();
      const shared = {
        mimeType: "video/3gpp",
        parents: ["batch_folder_01"],
        capabilities: {
          canDownload: true,
          canCopy: true,
          canReadRevisions: true,
        },
      };
      const files = {
        insv_01: {
          ...shared,
          id: "insv_01",
          name: "VID_20260402_080506_00_001.insv",
          size: "29871493438",
          md5Checksum: "a".repeat(32),
        },
        lrv_01: {
          ...shared,
          id: "lrv_01",
          name: "LRV_20260402_080506_01_001.lrv",
          size: "1911738680",
          md5Checksum: "b".repeat(32),
          videoMediaMetadata: { durationMillis: "120000" },
        },
      } as const;
      const file = files[id as keyof typeof files];
      return new Response(JSON.stringify(file ?? {}), {
        status: file ? 200 : 404,
      });
    }) as typeof fetch;

    const sourceUnitUpsert = jest.fn(async () => ({ id: "source_unit_01" }));
    const prisma = {
      studioSourceUnit: { upsert: sourceUnitUpsert },
      studioExternalMediaLibrary: { findUnique: jest.fn(async () => null) },
    } as unknown as PrismaClient;
    attachExternal.mockImplementation(
      async ({ value }) =>
        ({
          reference: { id: `reference_${value.verifiedFile.externalFileId}` },
          sourceRevisionId: `revision_${value.verifiedFile.externalFileId}`,
          replayed: false,
        }) as Awaited<ReturnType<typeof attachVerifiedExternalMediaSource>>,
    );
    recordLibrary.mockResolvedValue({
      replayed: false,
      library: {
        id: "library_01",
        name: "Homer 360 Library",
        discoveryMode: "selected-files",
      },
    } as Awaited<ReturnType<typeof recordGoogleDriveLibraryObservation>>);

    const result = await attachGoogleDriveFilesToNest({
      prisma,
      projectId: "project_01",
      actorUserId: "user_01",
      actorEmail: "creator@example.test",
      connectionId: "connection_01",
      selections: [{ externalFileId: "insv_01" }, { externalFileId: "lrv_01" }],
      libraryRootId: "drive_root_01",
      libraryRootName: "Homer 360 Library",
      libraryRootResourceKey: "root_resource_01",
      clientRequestId: "019f7c9d-a1b2-7c3d-8e4f-0123456789ab",
      requestUrl: "http://127.0.0.1:3012/nests/high-ground-odyssey/story",
    });

    expect(result).toMatchObject({
      attachedCount: 2,
      sourceUnitCount: 1,
      replayedCount: 0,
      plan: { readySegmentCount: 1, heldSegmentCount: 0 },
      library: { id: "library_01", discoveryMode: "selected-files" },
    });
    expect(sourceUnitUpsert).toHaveBeenCalledTimes(1);
    expect(sourceUnitUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: "insta360-drive-segment",
          sourceUrl: "https://drive.google.com/file/d/lrv_01/view",
        }),
      }),
    );
    expect(attachExternal).toHaveBeenCalledTimes(2);
    expect(createSourceSet).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user_01",
        value: expect.objectContaining({
          kind: "insta360-360",
          sourceClockRevisionId: "revision_lrv_01",
          members: expect.arrayContaining([
            expect.objectContaining({
              sourceRevisionId: "revision_insv_01",
              requiredForRender: true,
            }),
            expect.objectContaining({
              sourceRevisionId: "revision_lrv_01",
              requiredForRender: false,
            }),
          ]),
          metadata: expect.objectContaining({
            providerRevisionsPinned: true,
            exactMembersVerifiedLocally: false,
            originalRemainsInDrive: true,
          }),
        }),
      }),
    );
    expect(recordLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRootId: "drive_root_01",
        resourceKey: "root_resource_01",
        selectionManifest: [
          { externalFileId: "insv_01", resourceKey: null },
          { externalFileId: "lrv_01", resourceKey: null },
        ],
        plan: expect.objectContaining({
          root: { id: "drive_root_01", name: "Homer 360 Library" },
        }),
      }),
    );
    const attachedValues = attachExternal.mock.calls.map(
      ([call]) => call.value,
    );
    expect(attachedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceUnitId: "source_unit_01",
          verifiedFile: expect.objectContaining({
            externalFileId: "insv_01",
            mediaProjection: "dual-fisheye",
          }),
        }),
        expect.objectContaining({
          sourceUnitId: "source_unit_01",
          verifiedFile: expect.objectContaining({
            externalFileId: "lrv_01",
            mediaProjection: "dual-fisheye",
            projectionMetadata: expect.objectContaining({
              stitched: false,
              cameraViewLayout: "dual-fisheye",
            }),
          }),
        }),
      ]),
    );
  });

  it("unions a later Picker grant with the retained least-privilege manifest", async () => {
    getAccess.mockResolvedValue({
      accessToken: "short-lived-token",
      connection: { id: "connection_01" },
    } as Awaited<ReturnType<typeof getGoogleDriveAccess>>);
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const id = new URL(String(url)).pathname.split("/").pop();
      const shared = {
        mimeType: "video/3gpp",
        parents: ["batch_folder_02"],
        capabilities: {
          canDownload: true,
          canCopy: true,
          canReadRevisions: true,
        },
      };
      const files = {
        retained_lrv_02: {
          ...shared,
          id: "retained_lrv_02",
          name: "LRV_20260402_080506_01_002.lrv",
          size: "1911738680",
          md5Checksum: "c".repeat(32),
        },
        added_insv_02: {
          ...shared,
          id: "added_insv_02",
          name: "VID_20260402_080506_00_002.insv",
          size: "29871493438",
          md5Checksum: "d".repeat(32),
        },
      } as const;
      const selected = files[id as keyof typeof files];
      return new Response(JSON.stringify(selected ?? {}), {
        status: selected ? 200 : 404,
      });
    }) as typeof fetch;
    const prisma = {
      studioSourceUnit: {
        upsert: jest.fn(async () => ({ id: "source_unit_02" })),
      },
      studioExternalMediaLibrary: {
        findUnique: jest.fn(async () => ({
          connectionId: "connection_01",
          providerLocatorJson: {
            schema: "quipsly-google-drive-library-locator-v2",
            mode: "selection-manifest",
            selections: [
              {
                externalFileId: "retained_lrv_02",
                resourceKey: "retained_resource_02",
              },
            ],
          },
        })),
      },
    } as unknown as PrismaClient;
    attachExternal.mockImplementation(
      async ({ value }) =>
        ({
          reference: { id: `reference_${value.verifiedFile.externalFileId}` },
          sourceRevisionId: `revision_${value.verifiedFile.externalFileId}`,
          replayed: false,
        }) as Awaited<ReturnType<typeof attachVerifiedExternalMediaSource>>,
    );
    recordLibrary.mockResolvedValue({
      replayed: false,
      library: { id: "library_02", discoveryMode: "selected-files" },
    } as Awaited<ReturnType<typeof recordGoogleDriveLibraryObservation>>);

    await attachGoogleDriveFilesToNest({
      prisma,
      projectId: "project_01",
      actorUserId: "user_01",
      actorEmail: "creator@example.test",
      connectionId: "connection_01",
      selections: [{ externalFileId: "added_insv_02" }],
      libraryRootId: "drive_root_02",
      libraryRootName: "Growing 360 Library",
      clientRequestId: "019f7c9d-a1b2-7c3d-8e4f-1123456789ab",
      requestUrl: "http://127.0.0.1:3012/nests/high-ground-odyssey/story",
    });

    expect(recordLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionManifest: [
          {
            externalFileId: "retained_lrv_02",
            resourceKey: "retained_resource_02",
          },
          { externalFileId: "added_insv_02", resourceKey: null },
        ],
        plan: expect.objectContaining({
          totalFiles: 2,
          readySegmentCount: 1,
          heldSegmentCount: 0,
        }),
      }),
    );
  });

  it("attaches ready siblings while retaining incomplete packages only as library observations", async () => {
    getAccess.mockResolvedValue({
      accessToken: "short-lived-token",
      connection: { id: "connection_01" },
    } as Awaited<ReturnType<typeof getGoogleDriveAccess>>);
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const id = new URL(String(url)).pathname.split("/").pop();
      const shared = {
        mimeType: "video/3gpp",
        capabilities: {
          canDownload: true,
          canCopy: true,
          canReadRevisions: true,
        },
      };
      const files = {
        ready_insv: {
          ...shared,
          id: "ready_insv",
          parents: ["ready_batch"],
          name: "VID_20260225_163604_00_005.insv",
          size: "31422861624",
          md5Checksum: "e".repeat(32),
        },
        ready_lrv: {
          ...shared,
          id: "ready_lrv",
          parents: ["ready_batch"],
          name: "LRV_20260225_163604_01_005.lrv",
          size: "1911738674",
          md5Checksum: "f".repeat(32),
          videoMediaMetadata: { durationMillis: "120000" },
        },
        syncing_lrv: {
          ...shared,
          id: "syncing_lrv",
          parents: ["syncing_batch"],
          name: "LRV_20260114_145426_01_027.lrv",
          size: "0",
          md5Checksum: "0".repeat(32),
        },
      } as const;
      const selected = files[id as keyof typeof files];
      return new Response(JSON.stringify(selected ?? {}), {
        status: selected ? 200 : 404,
      });
    }) as typeof fetch;

    const sourceUnitUpsert = jest.fn(async () => ({
      id: "source_unit_ready",
    }));
    const prisma = {
      studioSourceUnit: { upsert: sourceUnitUpsert },
      studioExternalMediaLibrary: { findUnique: jest.fn(async () => null) },
    } as unknown as PrismaClient;
    attachExternal.mockImplementation(
      async ({ value }) =>
        ({
          reference: { id: `reference_${value.verifiedFile.externalFileId}` },
          sourceRevisionId: `revision_${value.verifiedFile.externalFileId}`,
          replayed: false,
        }) as Awaited<ReturnType<typeof attachVerifiedExternalMediaSource>>,
    );
    recordLibrary.mockResolvedValue({
      replayed: false,
      library: { id: "library_partial", status: "attention" },
    } as Awaited<ReturnType<typeof recordGoogleDriveLibraryObservation>>);

    const result = await attachGoogleDriveFilesToNest({
      prisma,
      projectId: "project_01",
      actorUserId: "user_01",
      actorEmail: "creator@example.test",
      connectionId: "connection_01",
      selections: [
        { externalFileId: "ready_insv" },
        { externalFileId: "ready_lrv" },
        { externalFileId: "syncing_lrv" },
      ],
      libraryRootId: "mixed_drive_root",
      libraryRootName: "Mixed camera library",
      clientRequestId: "019f7c9d-a1b2-7c3d-8e4f-2123456789ab",
      requestUrl: "http://127.0.0.1:3012/nests/high-ground-odyssey/story",
    });

    expect(result).toMatchObject({
      attachedCount: 2,
      sourceUnitCount: 1,
      sourceSetCount: 1,
      observedHeldSegmentCount: 1,
      plan: { readySegmentCount: 1, heldSegmentCount: 1 },
    });
    expect(sourceUnitUpsert).toHaveBeenCalledTimes(1);
    expect(attachExternal).toHaveBeenCalledTimes(2);
    expect(
      attachExternal.mock.calls.map(
        ([call]) => call.value.verifiedFile.externalFileId,
      ),
    ).toEqual(["ready_lrv", "ready_insv"]);
    expect(recordLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ heldSegmentCount: 1 }),
        attachments: expect.arrayContaining([
          expect.objectContaining({ externalFileId: "ready_lrv" }),
          expect.objectContaining({ externalFileId: "ready_insv" }),
        ]),
      }),
    );
    expect(recordLibrary.mock.calls[0]?.[0].attachments).toHaveLength(2);
  });
});
