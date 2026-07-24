/** @jest-environment node */

jest.mock("@google-cloud/storage", () => ({
  Storage: jest.fn(),
}));
jest.mock("@/lib/firebase/firebase-admin", () => ({
  adminAuth: {},
}));

import { parseGcsObjectLocation } from "./account-deletion-external";

describe("account deletion GCS references", () => {
  it("parses canonical gs references without changing the object path", () => {
    expect(
      parseGcsObjectLocation({
        assetId: "asset-1",
        kind: "asset",
        provider: "gcs",
        url: "gs://quipsly-media/users/person/original.wav",
      }),
    ).toEqual({
      bucket: "quipsly-media",
      objectPath: "users/person/original.wav",
    });
  });

  it("parses both supported HTTPS storage URL forms", () => {
    expect(
      parseGcsObjectLocation({
        assetId: "asset-1",
        kind: "variant",
        provider: "GCS",
        url: "https://storage.googleapis.com/quipsly-media/proxies%2Fclip.mp4",
      }),
    ).toEqual({
      bucket: "quipsly-media",
      objectPath: "proxies/clip.mp4",
    });
    expect(
      parseGcsObjectLocation({
        assetId: "asset-1",
        kind: "variant",
        provider: "gcs",
        url: "https://quipsly-media.storage.googleapis.com/waveforms/clip.json",
      }),
    ).toEqual({
      bucket: "quipsly-media",
      objectPath: "waveforms/clip.json",
    });
  });

  it("rejects storage providers without a verified deletion adapter", () => {
    expect(() =>
      parseGcsObjectLocation({
        assetId: "asset-1",
        kind: "asset",
        provider: "local",
        url: "/Volumes/Media/private.wav",
      }),
    ).toThrow("Unsupported account-deletion storage provider");
  });
});
