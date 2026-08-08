import "server-only";

type ByteEvidence = {
  provider: string | null;
  externalFileId: string | null;
  sharedDriveId: string | null;
  headRevisionKey: string | null;
  sizeBytes: string | null;
  checksumSha256: string | null;
  checksumMd5: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function externalMediaByteEvidence(value: unknown): ByteEvidence {
  const evidence = record(value);
  return {
    provider: nullableText(evidence.provider),
    externalFileId: nullableText(evidence.externalFileId),
    sharedDriveId: nullableText(evidence.sharedDriveId),
    headRevisionKey: nullableText(evidence.headRevisionKey),
    sizeBytes: nullableText(evidence.sizeBytes),
    checksumSha256: nullableText(evidence.checksumSha256),
    checksumMd5: nullableText(evidence.checksumMd5),
  };
}

/**
 * Provider observations can gain duration, dimensions, or projection metadata
 * after upload. Those fields change an immutable metadata observation, but not
 * the bytes used to produce a retained proxy, visual map, or waveform.
 *
 * Reuse is intentionally conservative: both observations must name the same
 * provider file and provider byte revision, and every byte fact known on both
 * sides must agree. A missing optional checksum may be enriched later; a
 * contradictory size or checksum never crosses this boundary.
 */
export function sameExternalMediaBytes(left: unknown, right: unknown) {
  const first = externalMediaByteEvidence(left);
  const second = externalMediaByteEvidence(right);
  if (
    !first.provider ||
    first.provider !== second.provider ||
    !first.externalFileId ||
    first.externalFileId !== second.externalFileId ||
    !first.headRevisionKey ||
    first.headRevisionKey !== second.headRevisionKey
  ) {
    return false;
  }
  return (
    (!first.sharedDriveId ||
      !second.sharedDriveId ||
      first.sharedDriveId === second.sharedDriveId) &&
    (!first.sizeBytes ||
      !second.sizeBytes ||
      first.sizeBytes === second.sizeBytes) &&
    (!first.checksumSha256 ||
      !second.checksumSha256 ||
      first.checksumSha256 === second.checksumSha256) &&
    (!first.checksumMd5 ||
      !second.checksumMd5 ||
      first.checksumMd5 === second.checksumMd5)
  );
}

export function byteEquivalentRevisions<T extends { provenanceJson: unknown }>(
  current: T,
  revisions: T[],
) {
  return revisions.filter(
    (candidate) =>
      candidate === current ||
      sameExternalMediaBytes(current.provenanceJson, candidate.provenanceJson),
  );
}

type PreparedByteRevision = {
  provenanceJson: unknown;
  replicas: unknown[];
  derivatives: Array<{ kind: string }>;
};

export function preferPreparedByteEquivalentRevision<
  T extends PreparedByteRevision,
>(current: T, revisions: T[]) {
  const preparationScore = (revision: T) =>
    (revision.replicas.length ? 1 : 0) +
    (revision.derivatives.some(
      (derivative) => derivative.kind === "collaboration-proxy",
    )
      ? 2
      : 0) +
    (revision.derivatives.some(
      (derivative) => derivative.kind === "source-contact-sheet",
    )
      ? 4
      : 0);
  return byteEquivalentRevisions(current, revisions).reduce(
    (preferred, candidate) =>
      preparationScore(candidate) > preparationScore(preferred)
        ? candidate
        : preferred,
    current,
  );
}
