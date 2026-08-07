/** @jest-environment node */

import {
  readGoogleDriveMediaFolder,
  readGoogleDriveMediaSelection,
  verifyGoogleDriveFile,
} from "./google-drive-source";

describe("Google Drive file verification", () => {
  it("projects provider-trusted revision and capabilities without trusting picker metadata", async () => {
    const fetchImpl = jest.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer short-lived-token",
          "X-Goog-Drive-Resource-Keys": "file_01/picker_resource_01",
        });
        return new Response(
          JSON.stringify({
            id: "file_01",
            name: "Homer 360 source.insv",
            mimeType: "application/octet-stream",
            size: "8400000000",
            headRevisionId: "revision_17",
            md5Checksum: "a".repeat(32),
            createdTime: "2026-08-01T10:00:00.000Z",
            modifiedTime: "2026-08-07T10:00:00.000Z",
            driveId: "shared_drive_01",
            resourceKey: "provider_resource_02",
            capabilities: {
              canDownload: true,
              canCopy: false,
              canReadRevisions: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    ) as typeof fetch;

    await expect(
      verifyGoogleDriveFile({
        accessToken: "short-lived-token",
        connectionId: "connection_01",
        externalFileId: "file_01",
        selectedResourceKey: "picker_resource_01",
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      provider: "google-drive",
      connectionKey: "google-drive:connection_01",
      externalFileId: "file_01",
      resourceKey: "provider_resource_02",
      fileName: "Homer 360 source.insv",
      sizeBytes: "8400000000",
      headRevisionKey: "revision_17",
      checksumMd5: "a".repeat(32),
      accessState: "available",
      capabilityState: "downloadable",
      canReadRevisions: true,
    });
  });

  it("retains metadata-only files but does not claim they can execute", async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "file_02",
            name: "Restricted source.mov",
            capabilities: {
              canDownload: false,
              canCopy: false,
              canReadRevisions: false,
            },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;
    await expect(
      verifyGoogleDriveFile({
        accessToken: "token",
        connectionId: "connection_01",
        externalFileId: "file_02",
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      accessState: "restricted",
      capabilityState: "metadata-only",
      canDownload: false,
    });
  });

  it("maps missing and unauthorized provider responses to explicit recovery states", async () => {
    await expect(
      verifyGoogleDriveFile({
        accessToken: "token",
        connectionId: "connection_01",
        externalFileId: "file_03",
        fetchImpl: jest.fn(
          async () => new Response("{}", { status: 404 }),
        ) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "drive-file-missing", status: 404 });
    await expect(
      verifyGoogleDriveFile({
        accessToken: "token",
        connectionId: "connection_01",
        externalFileId: "file_03",
        fetchImpl: jest.fn(
          async () => new Response("{}", { status: 401 }),
        ) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "drive-needs-reauth", status: 409 });
  });

  it("lists a selected shared-drive folder and plans each INSV/LRV segment independently", async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request) => {
      const value = new URL(String(url));
      if (value.pathname.endsWith("/folder_01")) {
        return new Response(
          JSON.stringify({
            id: "folder_01",
            name: "VID_20260402_080506_00_001_002-Original",
            mimeType: "application/vnd.google-apps.folder",
            driveId: "shared_drive_01",
            capabilities: { canDownload: true },
          }),
          { status: 200 },
        );
      }
      expect(value.searchParams.get("q")).toBe(
        "'folder_01' in parents and trashed = false",
      );
      expect(value.searchParams.get("includeItemsFromAllDrives")).toBe("true");
      return new Response(
        JSON.stringify({
          files: [
            {
              id: "insv_01",
              name: "VID_20260402_080506_00_001.insv",
              mimeType: "video/3gpp",
              size: "2000",
              md5Checksum: "a".repeat(32),
              capabilities: { canDownload: true },
            },
            {
              id: "lrv_01",
              name: "LRV_20260402_080506_01_001.lrv",
              mimeType: "video/3gpp",
              size: "200",
              md5Checksum: "b".repeat(32),
              capabilities: { canDownload: true },
            },
            {
              id: "insv_02",
              name: "VID_20260402_080506_00_002.insv",
              mimeType: "video/3gpp",
              size: "0",
              md5Checksum: "c".repeat(32),
              capabilities: { canDownload: true },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const result = await readGoogleDriveMediaFolder({
      accessToken: "token",
      connectionId: "connection_01",
      folderId: "folder_01",
      fetchImpl,
    });
    expect(result.plan).toMatchObject({
      status: "partial",
      readySegmentCount: 1,
      heldSegmentCount: 1,
      batches: [
        expect.objectContaining({
          segments: [
            expect.objectContaining({
              segment: "001",
              status: "ready-to-attach",
            }),
            expect.objectContaining({
              segment: "002",
              status: "held-incomplete",
            }),
          ],
        }),
      ],
    });
  });

  it("routes folders away from the one-file attachment path", async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "folder_02",
            name: "Camera originals",
            mimeType: "application/vnd.google-apps.folder",
            capabilities: { canDownload: true },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;
    await expect(
      verifyGoogleDriveFile({
        accessToken: "token",
        connectionId: "connection_01",
        externalFileId: "folder_02",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "drive-folder-requires-package-workflow",
      status: 409,
    });
  });

  it("groups explicitly selected INSV and LRV files without relying on inherited folder scope", async () => {
    const fetchMock = jest.fn(
      async (url: string | URL | Request, _init?: RequestInit) => {
        const id = new URL(String(url)).pathname.split("/").pop();
        const files = {
          insv_01: {
            id: "insv_01",
            name: "VID_20260402_080506_00_001.insv",
            mimeType: "video/3gpp",
            size: "29871493438",
            md5Checksum: "a".repeat(32),
            capabilities: { canDownload: true, canReadRevisions: true },
          },
          lrv_01: {
            id: "lrv_01",
            name: "LRV_20260402_080506_01_001.lrv",
            mimeType: "video/3gpp",
            size: "1911738680",
            md5Checksum: "b".repeat(32),
            capabilities: { canDownload: true, canReadRevisions: true },
          },
        } as const;
        return new Response(JSON.stringify(files[id as keyof typeof files]), {
          status: files[id as keyof typeof files] ? 200 : 404,
        });
      },
    );
    const fetchImpl = fetchMock as typeof fetch;

    const plan = await readGoogleDriveMediaSelection({
      accessToken: "token",
      connectionId: "connection_01",
      selections: [
        { externalFileId: "insv_01", resourceKey: "insv_resource" },
        { externalFileId: "lrv_01", resourceKey: "lrv_resource" },
      ],
      fetchImpl,
    });

    expect(plan).toMatchObject({
      root: { name: "Google Picker selection" },
      status: "ready",
      readySegmentCount: 1,
      heldSegmentCount: 0,
      batches: [
        expect.objectContaining({
          segments: [
            expect.objectContaining({
              segment: "001",
              status: "ready-to-attach",
              members: expect.arrayContaining([
                expect.objectContaining({
                  id: "insv_01",
                  role: "primary-original",
                }),
                expect.objectContaining({
                  id: "lrv_01",
                  role: "browse-proxy",
                }),
              ]),
            }),
          ],
        }),
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[1]?.headers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "X-Goog-Drive-Resource-Keys": "insv_01/insv_resource",
        }),
        expect.objectContaining({
          "X-Goog-Drive-Resource-Keys": "lrv_01/lrv_resource",
        }),
      ]),
    );
  });

  it("rejects a selected-file package that contains no recognized Insta360 media", async () => {
    await expect(
      readGoogleDriveMediaSelection({
        accessToken: "token",
        connectionId: "connection_01",
        selections: [{ externalFileId: "notes_01" }],
        fetchImpl: jest.fn(
          async () =>
            new Response(
              JSON.stringify({
                id: "notes_01",
                name: "notes.txt",
                mimeType: "text/plain",
                size: "12",
                capabilities: { canDownload: true },
              }),
              { status: 200 },
            ),
        ) as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "drive-selection-no-insta360-media",
      status: 409,
    });
  });

  it("inspects one library root so a creator need not select every capture batch", async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request) => {
      const value = new URL(String(url));
      if (value.pathname.endsWith("/root_folder")) {
        return new Response(
          JSON.stringify({
            id: "root_folder",
            name: "Insta360",
            mimeType: "application/vnd.google-apps.folder",
          }),
          { status: 200 },
        );
      }
      const query = value.searchParams.get("q");
      if (query === "'root_folder' in parents and trashed = false") {
        return new Response(
          JSON.stringify({
            files: [
              {
                id: "batch_folder",
                name: "VID_20260507_180459_00_080_082-Original",
                mimeType: "application/vnd.google-apps.folder",
                capabilities: { canDownload: true },
              },
            ],
          }),
          { status: 200 },
        );
      }
      expect(query).toBe("'batch_folder' in parents and trashed = false");
      return new Response(
        JSON.stringify({
          files: [
            {
              id: "insv_080",
              name: "VID_20260507_180459_00_080.insv",
              mimeType: "video/3gpp",
              size: "40631456066",
              capabilities: { canDownload: true },
            },
            {
              id: "lrv_080",
              name: "LRV_20260507_180459_01_080.lrv",
              mimeType: "video/3gpp",
              size: "1013633338",
              capabilities: { canDownload: true },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const result = await readGoogleDriveMediaFolder({
      accessToken: "token",
      connectionId: "connection_01",
      folderId: "root_folder",
      fetchImpl,
    });
    expect(result.plan).toMatchObject({
      root: { id: "root_folder", name: "Insta360" },
      status: "partial",
      readySegmentCount: 1,
      heldSegmentCount: 2,
      batches: [
        expect.objectContaining({
          folder: expect.objectContaining({ id: "batch_folder" }),
          segments: expect.arrayContaining([
            expect.objectContaining({
              segment: "080",
              status: "ready-to-attach",
            }),
          ]),
        }),
      ],
    });
  });
});
