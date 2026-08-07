/** @jest-environment node */

import { verifyGoogleDriveFile } from "./google-drive-source";

describe("Google Drive file verification", () => {
  it("projects provider-trusted revision and capabilities without trusting picker metadata", async () => {
    const fetchImpl = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer short-lived-token",
        "X-Goog-Drive-Resource-Keys": "file_01/picker_resource_01",
      });
      return new Response(JSON.stringify({
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
        capabilities: { canDownload: true, canCopy: false, canReadRevisions: true },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    await expect(verifyGoogleDriveFile({
      accessToken: "short-lived-token",
      connectionId: "connection_01",
      externalFileId: "file_01",
      selectedResourceKey: "picker_resource_01",
      fetchImpl,
    })).resolves.toMatchObject({
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
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
      id: "file_02",
      name: "Restricted source.mov",
      capabilities: { canDownload: false, canCopy: false, canReadRevisions: false },
    }), { status: 200 })) as typeof fetch;
    await expect(verifyGoogleDriveFile({
      accessToken: "token",
      connectionId: "connection_01",
      externalFileId: "file_02",
      fetchImpl,
    })).resolves.toMatchObject({
      accessState: "restricted",
      capabilityState: "metadata-only",
      canDownload: false,
    });
  });

  it("maps missing and unauthorized provider responses to explicit recovery states", async () => {
    await expect(verifyGoogleDriveFile({
      accessToken: "token",
      connectionId: "connection_01",
      externalFileId: "file_03",
      fetchImpl: jest.fn(async () => new Response("{}", { status: 404 })) as typeof fetch,
    })).rejects.toMatchObject({ code: "drive-file-missing", status: 404 });
    await expect(verifyGoogleDriveFile({
      accessToken: "token",
      connectionId: "connection_01",
      externalFileId: "file_03",
      fetchImpl: jest.fn(async () => new Response("{}", { status: 401 })) as typeof fetch,
    })).rejects.toMatchObject({ code: "drive-needs-reauth", status: 409 });
  });
});
