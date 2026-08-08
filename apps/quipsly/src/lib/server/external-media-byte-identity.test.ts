import {
  preferPreparedByteEquivalentRevision,
  sameExternalMediaBytes,
} from "./external-media-byte-identity";

const base = {
  schema: "quipsly-external-media-revision-identity-v1",
  provider: "google-drive",
  externalFileId: "lrv_file_004",
  sharedDriveId: null,
  headRevisionKey: "drive-head-004",
  sizeBytes: "102420828",
  checksumSha256: null,
  checksumMd5: "d".repeat(32),
};

describe("external media byte identity", () => {
  it("allows descriptive metadata enrichment without weakening byte checks", () => {
    expect(
      sameExternalMediaBytes(
        { ...base, durationSeconds: null, widthPixels: null },
        { ...base, durationSeconds: 81.76, widthPixels: 1664 },
      ),
    ).toBe(true);
    expect(
      sameExternalMediaBytes(base, {
        ...base,
        sizeBytes: "102420829",
      }),
    ).toBe(false);
    expect(
      sameExternalMediaBytes(base, {
        ...base,
        checksumMd5: "e".repeat(32),
      }),
    ).toBe(false);
    expect(
      sameExternalMediaBytes(base, {
        ...base,
        headRevisionKey: "drive-head-005",
      }),
    ).toBe(false);
  });

  it("keeps a prepared byte-equivalent revision browse-ready", () => {
    const prepared = {
      id: "revision_prepared",
      provenanceJson: { ...base, durationSeconds: null },
      replicas: [{ id: "replica" }],
      derivatives: [
        { kind: "collaboration-proxy" },
        { kind: "source-contact-sheet" },
      ],
    };
    const enriched = {
      id: "revision_enriched",
      provenanceJson: { ...base, durationSeconds: 81.76 },
      replicas: [],
      derivatives: [],
    };
    expect(
      preferPreparedByteEquivalentRevision(enriched, [enriched, prepared]).id,
    ).toBe(prepared.id);
  });
});
