import {
  DEFAULT_GOOGLE_DRIVE_BROWSE_BATCH_BYTES,
  selectGoogleDriveBrowsePreparationBatch,
} from "./google-drive-navigation-batch";

function candidate(id: string, bytes: bigint, retained = false) {
  return {
    revision: {
      id,
      sizeBytes: bytes,
      replicas: retained ? [{ id: `replica_${id}` }] : [],
    },
  };
}

describe("Google Drive browse preparation batch", () => {
  it("prepares retained and smallest companions within one byte budget", () => {
    const result = selectGoogleDriveBrowsePreparationBatch({
      candidates: [
        candidate("large_b", 1_900_000_000n),
        candidate("small", 102_420_828n),
        candidate("retained", 8_000_000_000n, true),
        candidate("large_a", 1_800_000_000n),
      ],
      countLimit: 12,
    });
    expect(result.selected.map(({ revision }) => revision.id)).toEqual([
      "retained",
      "small",
      "large_a",
    ]);
    expect(result.selectedTransferBytes).toBe(1_902_420_828n);
    expect(result.maximumTransferBytes).toBe(
      DEFAULT_GOOGLE_DRIVE_BROWSE_BATCH_BYTES,
    );
    expect(result.oversizedSingleSource).toBe(false);
  });

  it("allows one explicit oversized source but never batches another behind it", () => {
    const result = selectGoogleDriveBrowsePreparationBatch({
      candidates: [
        candidate("oversized", 3_000_000_000n),
        candidate("larger", 4_000_000_000n),
      ],
      countLimit: 12,
    });
    expect(result.selected.map(({ revision }) => revision.id)).toEqual([
      "oversized",
    ]);
    expect(result.oversizedSingleSource).toBe(true);
  });
});
