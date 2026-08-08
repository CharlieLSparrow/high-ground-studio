import {
  DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA,
  DeviceMediaFolderContractError,
  parseDeviceMediaFolderObservation,
  planDeviceMediaFolderObservation,
} from "./device-media-folder-contract";

function observation(overrides: Record<string, unknown> = {}) {
  return {
    schema: DEVICE_MEDIA_FOLDER_OBSERVATION_SCHEMA,
    deviceId: "device:11111111-1111-4111-8111-111111111111",
    folderGrantId: "22222222-2222-4222-8222-222222222222",
    root: { id: `device-folder:${"a".repeat(64)}`, name: "Insta360" },
    batches: [
      {
        id: `device-batch:${"b".repeat(64)}`,
        name: "VID_20260128_173606_00_025_027-Original",
        files: [
          {
            id: `device-file:${"c".repeat(64)}`,
            name: "VID_20260128_173606_00_025.insv",
            mimeType: "video/mp4",
            sizeBytes: "4200000000",
            createdTime: "2026-01-28T17:36:06.000Z",
            modifiedTime: "2026-01-28T18:00:00.000Z",
            durationSeconds: null,
            widthPixels: null,
            heightPixels: null,
          },
          {
            id: `device-file:${"d".repeat(64)}`,
            name: "LRV_20260128_173606_11_025.lrv",
            mimeType: "video/mp4",
            sizeBytes: "120000000",
            createdTime: "2026-01-28T17:36:06.000Z",
            modifiedTime: "2026-01-28T18:00:00.000Z",
            durationSeconds: 180,
            widthPixels: 1920,
            heightPixels: 960,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("device media folder observation", () => {
  it("plans a complete local Insta360 package without accepting a path", () => {
    const parsed = parseDeviceMediaFolderObservation(observation());
    const plan = planDeviceMediaFolderObservation(parsed);

    expect(plan.totalFiles).toBe(2);
    expect(plan.readySegmentCount).toBe(1);
    expect(plan.heldSegmentCount).toBe(2);
    expect(plan.batches[0]?.segments[0]).toMatchObject({
      segment: "025",
      status: "ready-to-attach",
    });
    expect(JSON.stringify(parsed)).not.toContain("/Users/");
  });

  it("rejects a filesystem path disguised as a display name", () => {
    expect(() =>
      parseDeviceMediaFolderObservation(
        observation({
          root: {
            id: `device-folder:${"a".repeat(64)}`,
            name: "/Users/charlie/Google Drive/Insta360",
          },
        }),
      ),
    ).toThrow(DeviceMediaFolderContractError);
  });

  it("rejects repeated opaque identities", () => {
    const value = observation();
    const batch = value.batches[0]!;
    batch.files[1]!.id = batch.files[0]!.id;
    expect(() => parseDeviceMediaFolderObservation(value)).toThrow(
      "repeats a file identity",
    );
  });

  it("holds a zero-byte browse companion instead of attaching it", () => {
    const value = observation();
    value.batches[0]!.files[1]!.sizeBytes = "0";
    const plan = planDeviceMediaFolderObservation(
      parseDeviceMediaFolderObservation(value),
    );
    expect(plan.readySegmentCount).toBe(0);
    expect(plan.batches[0]?.segments[0]).toMatchObject({
      status: "held-syncing",
    });
  });
});
