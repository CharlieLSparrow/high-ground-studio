import {
  DEVICE_MEDIA_PREPARATION_RECEIPT_SCHEMA,
  DeviceMediaPreparationContractError,
  deviceMediaPreparationTargetLocator,
  parseDeviceMediaPreparationReceipt,
} from "./device-media-preparation-contract";

function receipt() {
  return {
    schema: DEVICE_MEDIA_PREPARATION_RECEIPT_SCHEMA,
    libraryId: "library_12345678",
    deviceId: "device:12345678",
    folderGrantId: "grant:12345678",
    custodianNodeId: "execution_worker_12345678",
    storageScopeId: "storage_scope_12345678",
    externalFileId: "device-file:12345678",
    externalReferenceId: "reference_12345678",
    sourceRevisionId: "revision_12345678",
    observedRevisionKey: `device-metadata:${"a".repeat(64)}`,
    expectedSizeBytes: "120000000",
    targetLocator:
      "source-cache/device-folder/high-ground-odyssey/revision_12345678/device-folder-exact-browse-v1-abcdef0123456789abcd.lrv",
    contentSha256: "b".repeat(64),
    completedAt: "2026-08-08T09:00:00.000Z",
    technical: {
      durationSeconds: null,
      widthPixels: null,
      heightPixels: null,
      framesPerSecond: null,
    },
    worker: {
      executionId: "device-prep:12345678",
      buildId: "test-build",
    },
  };
}

describe("device media preparation receipt", () => {
  it("accepts an exact relative local-cache receipt", () => {
    expect(parseDeviceMediaPreparationReceipt(receipt())).toMatchObject({
      expectedSizeBytes: "120000000",
      contentSha256: "b".repeat(64),
    });
  });

  it.each([
    "/Users/operator/source.lrv",
    "../source.lrv",
    "source-cache/../source.lrv",
    "source-cache/device/source.mp4",
  ])("rejects unsafe or non-LRV replica locator %s", (targetLocator) => {
    expect(() =>
      parseDeviceMediaPreparationReceipt({ ...receipt(), targetLocator }),
    ).toThrow(DeviceMediaPreparationContractError);
  });

  it("builds one deterministic locator without a provider path", () => {
    expect(
      deviceMediaPreparationTargetLocator({
        projectSlug: "high-ground-odyssey",
        sourceRevisionId: "revision_12345678",
        observedRevisionKey: `device-metadata:${"a".repeat(64)}`,
      }),
    ).toMatch(
      /^source-cache\/device-folder\/high-ground-odyssey\/revision_12345678\/device-folder-exact-browse-v1-[a-f0-9]{20}\.lrv$/,
    );
  });

  it("rejects a version-one receipt that has no executor custody", () => {
    expect(() =>
      parseDeviceMediaPreparationReceipt({
        ...receipt(),
        schema: "quipsly-device-media-preparation-receipt-v1",
      }),
    ).toThrow("unsupported");
  });
});
