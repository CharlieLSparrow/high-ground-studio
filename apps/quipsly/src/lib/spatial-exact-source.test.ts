import {
  resolveExactSpatialSourceMember,
  SpatialExactSourceError,
  type SpatialExactSourceRevision,
} from "./spatial-exact-source";

function revision(
  overrides: Partial<SpatialExactSourceRevision> = {},
): SpatialExactSourceRevision {
  const sha256 = "a".repeat(64);
  return {
    id: "revision_12345678",
    contentSha256: sha256,
    sizeBytes: 1_000n,
    sourceState: "checksum-bound",
    externalReference: {
      provider: "google-drive",
      fileName: "VID_20260402_080506_00_001.insv",
      mimeType: "video/mp4",
      providerLocatorJson: { externalFileId: "drive-file" },
    },
    replicas: [
      {
        locator: "/private/cache/exact-original.insv",
        generation: `sha256:${sha256}`,
        contentSha256: sha256,
        sizeBytes: 1_000n,
        mimeType: "video/mp4",
      },
    ],
    ...overrides,
  };
}

describe("exact spatial source resolution", () => {
  it("accepts a checksum-matched Drive original replica without rewriting its provider identity", () => {
    expect(
      resolveExactSpatialSourceMember({
        role: "primary-original",
        sourceRevision: revision(),
      }),
    ).toMatchObject({
      provider: "local",
      locator: "/private/cache/exact-original.insv",
      fileName: "VID_20260402_080506_00_001.insv",
      sha256: "a".repeat(64),
      requiredForRender: true,
    });
  });

  it("rejects a replica whose retained bytes do not match the source revision", () => {
    expect(() =>
      resolveExactSpatialSourceMember({
        role: "primary-original",
        sourceRevision: revision({
          replicas: [
            {
              locator: "/private/cache/changed.insv",
              generation: `sha256:${"b".repeat(64)}`,
              contentSha256: "b".repeat(64),
              sizeBytes: 1_000n,
              mimeType: "video/mp4",
            },
          ],
        }),
      }),
    ).toThrow(SpatialExactSourceError);
  });
});
