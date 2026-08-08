import "server-only";

const GIBIBYTE = 1024n * 1024n * 1024n;
export const DEFAULT_GOOGLE_DRIVE_BROWSE_BATCH_BYTES = (5n * GIBIBYTE) / 2n;
const MAX_GOOGLE_DRIVE_BROWSE_BATCH_BYTES = 32n * GIBIBYTE;

export function googleDriveBrowseBatchByteLimit(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const configured = environment.QUIPSLY_DRIVE_LIBRARY_BATCH_MAX_BYTES?.trim();
  if (!configured || !/^\d+$/.test(configured)) {
    return DEFAULT_GOOGLE_DRIVE_BROWSE_BATCH_BYTES;
  }
  const value = BigInt(configured);
  return value >= 64n * 1024n * 1024n &&
    value <= MAX_GOOGLE_DRIVE_BROWSE_BATCH_BYTES
    ? value
    : DEFAULT_GOOGLE_DRIVE_BROWSE_BATCH_BYTES;
}

type BrowsePreparationCandidate = {
  revision: {
    id: string;
    sizeBytes: bigint | null;
    replicas: unknown[];
  };
};

function transferBytes(candidate: BrowsePreparationCandidate) {
  return candidate.revision.replicas.length
    ? 0n
    : (candidate.revision.sizeBytes ?? 0n);
}

/**
 * Batch preparation is deliberately cost-shaped rather than inventory-shaped.
 * It starts with retained and smaller browse companions, then stops before a
 * second large LRV silently turns one click into a multi-gigabyte transfer.
 * A single source larger than the reviewed batch budget is still returned so
 * the user can make progress one explicit segment at a time; per-file limits
 * and executor capacity checks remain authoritative downstream.
 */
export function selectGoogleDriveBrowsePreparationBatch<
  T extends BrowsePreparationCandidate,
>(input: {
  candidates: T[];
  countLimit: number;
  environment?: NodeJS.ProcessEnv;
}) {
  const maximumTransferBytes = googleDriveBrowseBatchByteLimit(
    input.environment,
  );
  const ordered = input.candidates
    .map((candidate, index) => ({
      candidate,
      index,
      transferBytes: transferBytes(candidate),
    }))
    .sort((left, right) => {
      if (left.transferBytes !== right.transferBytes) {
        return left.transferBytes < right.transferBytes ? -1 : 1;
      }
      return left.index - right.index;
    });
  const selected: T[] = [];
  let selectedTransferBytes = 0n;
  let oversizedSingleSource = false;
  for (const entry of ordered) {
    if (selected.length >= input.countLimit) break;
    if (
      selected.length > 0 &&
      selectedTransferBytes + entry.transferBytes > maximumTransferBytes
    ) {
      continue;
    }
    if (selected.length === 0 && entry.transferBytes > maximumTransferBytes) {
      oversizedSingleSource = true;
    }
    selected.push(entry.candidate);
    selectedTransferBytes += entry.transferBytes;
  }
  return {
    selected,
    selectedTransferBytes,
    maximumTransferBytes,
    oversizedSingleSource,
  };
}
