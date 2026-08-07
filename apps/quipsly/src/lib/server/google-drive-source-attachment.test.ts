/** @jest-environment node */

import type { PrismaClient } from "@prisma/client";

import { attachVerifiedExternalMediaSource } from "./external-media-source";
import { getGoogleDriveAccess } from "./google-drive-connection";
import { attachGoogleDriveFilesToNest } from "./google-drive-source";

jest.mock("./external-media-source", () => ({
  attachVerifiedExternalMediaSource: jest.fn(),
}));
jest.mock("./google-drive-connection", () => ({
  getGoogleDriveAccess: jest.fn(),
}));

const getAccess = jest.mocked(getGoogleDriveAccess);
const attachExternal = jest.mocked(attachVerifiedExternalMediaSource);

describe("Google Drive selected-file package attachment", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
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
    } as unknown as PrismaClient;
    attachExternal.mockImplementation(
      async ({ value }) =>
        ({
          reference: { id: `reference_${value.verifiedFile.externalFileId}` },
          sourceRevisionId: `revision_${value.verifiedFile.externalFileId}`,
          replayed: false,
        }) as Awaited<ReturnType<typeof attachVerifiedExternalMediaSource>>,
    );

    const result = await attachGoogleDriveFilesToNest({
      prisma,
      projectId: "project_01",
      actorUserId: "user_01",
      actorEmail: "creator@example.test",
      connectionId: "connection_01",
      selections: [{ externalFileId: "insv_01" }, { externalFileId: "lrv_01" }],
      clientRequestId: "019f7c9d-a1b2-7c3d-8e4f-0123456789ab",
      requestUrl: "http://127.0.0.1:3012/nests/high-ground-odyssey/story",
    });

    expect(result).toMatchObject({
      attachedCount: 2,
      sourceUnitCount: 1,
      replayedCount: 0,
      plan: { readySegmentCount: 1, heldSegmentCount: 0 },
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
});
