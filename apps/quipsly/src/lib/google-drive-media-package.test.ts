import {
  planGoogleDriveMediaFolder,
  planGoogleDriveMediaLibrary,
  type GoogleDriveFolderMediaItem,
} from "./google-drive-media-package";

function file(
  name: string,
  sizeBytes: string,
  id = name,
): GoogleDriveFolderMediaItem {
  return {
    id,
    name,
    mimeType: "video/3gpp",
    sizeBytes,
    headRevisionId: null,
    md5Checksum: "a".repeat(32),
    resourceKey: null,
    createdTime: "2026-08-07T10:00:00.000Z",
    modifiedTime: "2026-06-24T06:00:00.000Z",
    driveId: "shared-drive-1",
    durationSeconds: 60,
    widthPixels: 2880,
    heightPixels: 1440,
    canDownload: true,
    canCopy: true,
    canReadRevisions: true,
  };
}

describe("Google Drive Insta360 package planning", () => {
  it("turns a real multi-segment folder topology into independent source-clock packages", () => {
    const plan = planGoogleDriveMediaFolder({
      folderId: "folder-1",
      folderName: "VID_20260402_080506_00_001_004-Original",
      files: [
        file("VID_20260402_080506_00_001.insv", "29871493438"),
        file("LRV_20260402_080506_01_001.lrv", "1911738680"),
        file("VID_20260402_080506_00_002.insv", "28790411583"),
        file("LRV_20260402_080506_01_002.lrv", "1912262969"),
        file("VID_20260402_080506_00_003.insv", "27982483775"),
        file("LRV_20260402_080506_01_003.lrv", "1912262969"),
        file("VID_20260402_080506_00_004.insv", "1222300003"),
        file("LRV_20260402_080506_01_004.lrv", "102420828"),
      ],
    });
    expect(plan.status).toBe("ready");
    expect(plan.readySegmentCount).toBe(4);
    expect(plan.folder.expectedSegments).toEqual(["001", "002", "003", "004"]);
    expect(plan.segments).toHaveLength(4);
    expect(plan.segments[0]).toMatchObject({
      captureKey: "VID_20260402_080506_001",
      segment: "001",
      status: "ready-to-attach",
      members: [
        expect.objectContaining({
          role: "browse-proxy",
          name: "LRV_20260402_080506_01_001.lrv",
        }),
        expect.objectContaining({
          role: "primary-original",
          name: "VID_20260402_080506_00_001.insv",
        }),
      ],
    });
  });

  it("assigns stable primary and secondary roles to paired INSV originals", () => {
    const plan = planGoogleDriveMediaFolder({
      folderId: "paired-folder",
      folderName: "VID_20260402_080506_00_001_001-Original",
      files: [
        file("VID_20260402_080506_00_001.insv", "1000"),
        file("VID_20260402_080506_01_001.insv", "1000"),
        file("LRV_20260402_080506_02_001.lrv", "100"),
      ],
    });
    expect(plan.segments[0]?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "00", role: "primary-original" }),
        expect.objectContaining({
          channel: "01",
          role: "secondary-original",
        }),
      ]),
    );
  });

  it("holds empty uploads and missing expected pairs without inventing a continuous clock", () => {
    const plan = planGoogleDriveMediaFolder({
      folderId: "folder-2",
      folderName: "VID_20260114_145426_00_025_027-Original",
      files: [file("LRV_20260114_145426_01_027.lrv", "0")],
    });
    expect(plan.status).toBe("partial");
    expect(plan.readySegmentCount).toBe(0);
    expect(plan.heldSegmentCount).toBe(3);
    expect(
      plan.segments.map((segment) => [segment.segment, segment.status]),
    ).toEqual([
      ["025", "held-incomplete"],
      ["026", "held-incomplete"],
      ["027", "held-incomplete"],
    ]);
    expect(plan.segments[2].reasons).toEqual(
      expect.arrayContaining([
        "The exact INSV original is missing.",
        "At least one file is empty or still syncing.",
      ]),
    );
  });

  it("retains unrecognized files outside the camera package contract", () => {
    const plan = planGoogleDriveMediaFolder({
      folderId: "folder-3",
      folderName: "Homer selects",
      files: [file("notes.txt", "120")],
    });
    expect(plan.status).toBe("empty");
    expect(plan.segments).toEqual([]);
    expect(plan.unrecognizedFiles).toEqual([
      expect.objectContaining({ name: "notes.txt" }),
    ]);
  });

  it("aggregates a library root without collapsing independent capture batches", () => {
    const first = planGoogleDriveMediaFolder({
      folderId: "batch-a",
      folderName: "VID_20260225_163604_00_005_007-Original",
      files: [
        file("VID_20260225_163604_00_005.insv", "1000"),
        file("LRV_20260225_163604_01_005.lrv", "100"),
      ],
    });
    const second = planGoogleDriveMediaFolder({
      folderId: "batch-b",
      folderName: "VID_20260117_094111_00_030_032-Original",
      files: [],
    });
    const library = planGoogleDriveMediaLibrary({
      rootFolderId: "root",
      rootFolderName: "Homer 360 library",
      batches: [first, second],
    });
    expect(library).toMatchObject({
      status: "partial",
      totalFiles: 2,
      readySegmentCount: 1,
      heldSegmentCount: 5,
      batches: [
        expect.objectContaining({
          folder: expect.objectContaining({ id: "batch-b" }),
        }),
        expect.objectContaining({
          folder: expect.objectContaining({ id: "batch-a" }),
        }),
      ],
    });
  });
});
