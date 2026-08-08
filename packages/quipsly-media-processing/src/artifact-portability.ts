export const EXECUTOR_LOCAL_ARTIFACT_PORTABILITY = "executor-local" as const;
export const PORTABLE_OBJECT_ARTIFACT_PORTABILITY =
  "portable-object-storage" as const;

export type ExecutorLocalArtifactAuthority = {
  portability: typeof EXECUTOR_LOCAL_ARTIFACT_PORTABILITY;
  custodianNodeId: string;
  storageScopeId: string;
};

export type PortableObjectArtifactAuthority = {
  portability: typeof PORTABLE_OBJECT_ARTIFACT_PORTABILITY;
  custodianNodeId: null;
  storageScopeId: null;
};

export type ArtifactPortabilityAuthority =
  | ExecutorLocalArtifactAuthority
  | PortableObjectArtifactAuthority;

const SAFE_ID = /^[A-Za-z0-9:_-]{8,200}$/;

export function parseExecutorLocalArtifactAuthority(
  value: unknown,
  name = "artifact",
): ExecutorLocalArtifactAuthority {
  const row = record(value);
  const custodianNodeId = text(row.custodianNodeId);
  const storageScopeId = text(row.storageScopeId);
  if (
    row.portability !== EXECUTOR_LOCAL_ARTIFACT_PORTABILITY ||
    !SAFE_ID.test(custodianNodeId) ||
    !SAFE_ID.test(storageScopeId)
  ) {
    throw new Error(`${name} is not bound to an exact executor storage scope.`);
  }
  return {
    portability: EXECUTOR_LOCAL_ARTIFACT_PORTABILITY,
    custodianNodeId,
    storageScopeId,
  };
}

export function sameExecutorLocalArtifactAuthority(
  left: ExecutorLocalArtifactAuthority,
  right: ExecutorLocalArtifactAuthority,
) {
  return (
    left.custodianNodeId === right.custodianNodeId &&
    left.storageScopeId === right.storageScopeId
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
