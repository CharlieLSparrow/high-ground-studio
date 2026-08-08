import {
  parseDeviceMediaVerificationReceipt,
  DeviceMediaVerificationContractError,
} from "./device-media-verification-contract";

const valid = {
  schema: "quipsly-device-media-verification-receipt-v2",
  libraryId: "library_1",
  deviceId: "device:1",
  folderGrantId: "grant:1",
  custodianNodeId: "execution_worker_12345678",
  storageScopeId: "storage_scope_12345678",
  externalFileId: "file:1",
  externalReferenceId: "reference_1",
  sourceRevisionId: "revision_1",
  observedRevisionKey: "revision:observed:1",
  expectedSizeBytes: "4200000000",
  contentSha256: "A".repeat(64),
  completedAt: "2026-08-08T09:00:00.000Z",
  technical: {
    durationSeconds: 180,
    widthPixels: 7680,
    heightPixels: 3840,
    framesPerSecond: 29.97,
  },
  worker: { executionId: "verify:1", buildId: "test" },
};

describe("device media verification receipts", () => {
  it("normalizes exact in-place evidence without accepting a path", () => {
    expect(parseDeviceMediaVerificationReceipt(valid)).toMatchObject({
      contentSha256: "a".repeat(64),
      expectedSizeBytes: "4200000000",
      technical: { durationSeconds: 180 },
    });
  });

  it.each([
    "path",
    "sourcePath",
    "localPath",
    "locator",
    "relativeLocator",
    "targetLocator",
  ])("rejects disclosed local field %s", (field) => {
    expect(() =>
      parseDeviceMediaVerificationReceipt({
        ...valid,
        [field]: "/Volumes/source",
      }),
    ).toThrow(DeviceMediaVerificationContractError);
  });

  it("rejects a malformed digest", () => {
    expect(() =>
      parseDeviceMediaVerificationReceipt({ ...valid, contentSha256: "nope" }),
    ).toThrow("SHA-256");
  });

  it("rejects zero bytes and invalid technical metadata", () => {
    expect(() =>
      parseDeviceMediaVerificationReceipt({ ...valid, expectedSizeBytes: "0" }),
    ).toThrow("positive integer");
    expect(() =>
      parseDeviceMediaVerificationReceipt({
        ...valid,
        technical: { ...valid.technical, widthPixels: 1.5 },
      }),
    ).toThrow("positive integer");
  });

  it("rejects a version-one receipt that has no executor custody", () => {
    expect(() =>
      parseDeviceMediaVerificationReceipt({
        ...valid,
        schema: "quipsly-device-media-verification-receipt-v1",
      }),
    ).toThrow("unsupported");
  });
});
