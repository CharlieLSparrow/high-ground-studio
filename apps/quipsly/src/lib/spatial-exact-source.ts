export type SpatialExactSourceRevision = {
  id: string;
  contentSha256: string | null;
  sizeBytes: bigint | null;
  sourceState: string;
  externalReference: null | {
    provider: string;
    fileName: string;
    mimeType?: string | null;
    providerLocatorJson: unknown;
  };
  replicas: Array<{
    locator: string;
    generation: string;
    contentSha256: string;
    sizeBytes: bigint;
    mimeType?: string | null;
  }>;
};

export class SpatialExactSourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SpatialExactSourceError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function resolveExactSpatialSourceMember(input: {
  role: string;
  sourceRevision: SpatialExactSourceRevision;
}) {
  const { sourceRevision } = input;
  const reference = sourceRevision.externalReference;
  const replica = sourceRevision.replicas[0];
  const localFileLocator = record(reference?.providerLocatorJson).localPath;
  const locator = replica?.locator ?? localFileLocator;
  const exactReplicaMatches = Boolean(
    replica &&
    replica.contentSha256 === sourceRevision.contentSha256 &&
    replica.sizeBytes === sourceRevision.sizeBytes &&
    replica.generation === `sha256:${sourceRevision.contentSha256}`,
  );
  const trustedLocalFile = Boolean(
    reference &&
    reference.provider === "local-file-vault" &&
    typeof localFileLocator === "string",
  );
  if (
    !reference ||
    (input.role !== "primary-original" &&
      input.role !== "secondary-original") ||
    !reference.fileName.toLowerCase().endsWith(".insv") ||
    (!exactReplicaMatches && !trustedLocalFile) ||
    typeof locator !== "string" ||
    !sourceRevision.contentSha256 ||
    sourceRevision.sizeBytes === null ||
    sourceRevision.sizeBytes <= 0n ||
    (sourceRevision.sourceState !== "available" &&
      sourceRevision.sourceState !== "checksum-bound")
  ) {
    throw new SpatialExactSourceError(
      "spatial-exact-source-unavailable",
      `Exact render member ${sourceRevision.id} is unavailable or no longer checksum-bound.`,
    );
  }
  return {
    sourceRevisionId: sourceRevision.id,
    role: input.role as "primary-original" | "secondary-original",
    fileName: reference.fileName,
    provider: "local" as const,
    locator,
    generation: replica?.generation ?? `sha256:${sourceRevision.contentSha256}`,
    sha256: sourceRevision.contentSha256,
    sizeBytes: Number(sourceRevision.sizeBytes),
    contentType: replica?.mimeType ?? reference.mimeType ?? "video/mp4",
    requiredForRender: true as const,
  };
}
