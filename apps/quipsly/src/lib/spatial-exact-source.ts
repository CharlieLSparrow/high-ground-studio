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
    custodianNodeId: string | null;
    storageScopeId: string | null;
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

export function resolveExactSpatialSourceMember(input: {
  role: string;
  executionTarget: {
    custodianNodeId: string;
    storageScopeId: string;
  };
  sourceRevision: SpatialExactSourceRevision;
}) {
  const { sourceRevision } = input;
  const reference = sourceRevision.externalReference;
  const replica = sourceRevision.replicas[0];
  const locator = replica?.locator;
  const exactReplicaMatches = Boolean(
    replica &&
    replica.custodianNodeId === input.executionTarget.custodianNodeId &&
    replica.storageScopeId === input.executionTarget.storageScopeId &&
    replica.contentSha256 === sourceRevision.contentSha256 &&
    replica.sizeBytes === sourceRevision.sizeBytes &&
    replica.generation === `sha256:${sourceRevision.contentSha256}`,
  );
  if (
    !reference ||
    (input.role !== "primary-original" &&
      input.role !== "secondary-original") ||
    !reference.fileName.toLowerCase().endsWith(".insv") ||
    !exactReplicaMatches ||
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
    portability: "executor-local" as const,
    custodianNodeId: input.executionTarget.custodianNodeId,
    storageScopeId: input.executionTarget.storageScopeId,
    locator,
    generation: replica!.generation,
    sha256: sourceRevision.contentSha256,
    sizeBytes: Number(sourceRevision.sizeBytes),
    contentType: replica!.mimeType ?? reference.mimeType ?? "video/mp4",
    requiredForRender: true as const,
  };
}
