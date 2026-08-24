/** @jest-environment node */

import {
  sessionProtectedPlaybackBinding,
  sessionProtectedPlaybackReceiptReleased,
} from "./session-protected-playback";

const roomId = "room-1";
const recordingAssetId = "asset-1";
const sha256 = "a".repeat(64);

function asset() {
  return {
    id: recordingAssetId,
    roomId,
    status: "VERIFIED",
    verifiedAt: new Date("2026-08-24T12:00:00.000Z"),
    contentType: "audio/mp4",
    byteSize: BigInt(4096),
    checksum: sha256,
    storageBucket: "private-media",
    storageObjectPath: "mobile/room-1/source.m4a",
    localManifestJson: {
      exactBytesVerified: true,
      storageGeneration: "1742",
    },
  };
}

function receipt() {
  return {
    roomId,
    recordingAssetId,
    uploadSessionId: "upload-1",
    processingDisposition: "RELEASED",
    metadataJson: {
      immutableUploadBinding: {
        roomId,
        sha256,
        sizeBytes: 4096,
        bucketName: "private-media",
        objectName: "mobile/room-1/source.m4a",
        generation: "1742",
      },
    },
  };
}

describe("Session protected playback binding", () => {
  it("binds the exact released immutable generation", () => {
    expect(sessionProtectedPlaybackBinding({ roomId, asset: asset(), receipt: receipt() })).toEqual({
      schema: "quipsly-session-protected-playback-v1",
      roomId,
      recordingAssetId,
      url: "/api/sessions/room-1/recordings/asset-1/media",
      sha256,
      byteSize: 4096,
      bucketName: "private-media",
      objectName: "mobile/room-1/source.m4a",
      generation: "1742",
      contentType: "audio/mp4",
      kind: "audio",
    });
  });

  it("accepts only a released receipt for the exact room, source, and upload", () => {
    expect(sessionProtectedPlaybackReceiptReleased({ roomId, recordingAssetId, receipt: receipt() })).toBe(true);
    expect(sessionProtectedPlaybackReceiptReleased({
      roomId,
      recordingAssetId,
      receipt: { ...receipt(), uploadSessionId: null },
    })).toBe(false);
    expect(sessionProtectedPlaybackReceiptReleased({
      roomId,
      recordingAssetId,
      receipt: { ...receipt(), recordingAssetId: "other" },
    })).toBe(false);
  });

  it.each([
    ["missing verified-at", { verifiedAt: null }, {}],
    ["checksum drift", {}, { metadataJson: { immutableUploadBinding: { ...receipt().metadataJson.immutableUploadBinding, sha256: "b".repeat(64) } } }],
    ["generation drift", { localManifestJson: { exactBytesVerified: true, storageGeneration: "1743" } }, {}],
    ["vault drift", { storageObjectPath: "other/source.m4a" }, {}],
  ])("fails closed for %s", (_label, assetPatch, receiptPatch) => {
    expect(sessionProtectedPlaybackBinding({
      roomId,
      asset: { ...asset(), ...assetPatch },
      receipt: { ...receipt(), ...receiptPatch },
    })).toBeNull();
  });
});
