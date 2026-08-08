import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

import { sha256File } from "./transcoder.js";

const { Pool } = pg;

export const LOCAL_MEDIA_AVAILABILITY_SCHEMA =
  "quipsly-local-media-availability-v1" as const;

type ArtifactKind = "replica" | "derivative";
type ArtifactStatus = "ready" | "missing" | "invalid";

export type LocalMediaArtifactInspection = {
  state: ArtifactStatus | "verification-pending";
  reason:
    | "available"
    | "content-verification-pending"
    | "file-missing"
    | "path-outside-workspace"
    | "not-a-regular-file"
    | "size-mismatch"
    | "checksum-mismatch"
    | "inspection-failed";
  observedSizeBytes: number | null;
  observedSha256: string | null;
  checkedAt: Date;
  contentVerifiedAt: Date | null;
};

export type LocalMediaArtifactCandidate = {
  id: string;
  artifactKind: ArtifactKind;
  locator: string;
  contentSha256: string;
  sizeBytes: string | number | bigint;
  status: string;
  availabilityCheckedAt: Date | null;
  contentVerifiedAt: Date | null;
};

export type LocalMediaReconciliationResult = {
  disposition: "idle" | "reconciled";
  checked: number;
  ready: number;
  missing: number;
  invalid: number;
  verificationPending: number;
  contentHashes: number;
};

export type LocalMediaReconcilerOptions = {
  localMediaRoot: string;
  authorizedRoots?: string[];
  batchSize?: number;
  intervalMs?: number;
  contentVerificationMaxAgeMs?: number;
  maxContentHashesPerRun?: number;
  now?: () => Date;
};

type QueryablePool = Pick<InstanceType<typeof Pool>, "query">;

export async function inspectLocalMediaArtifact(input: {
  localMediaRoot: string;
  authorizedRoots?: string[];
  locator: string;
  expectedSizeBytes: number | bigint | string;
  expectedSha256: string;
  verifyContent: boolean;
  checkedAt?: Date;
}): Promise<LocalMediaArtifactInspection> {
  const checkedAt = input.checkedAt ?? new Date();
  const workspaceRoots = [
    input.localMediaRoot,
    ...(input.authorizedRoots ?? []),
  ].map((root) => path.resolve(root));
  const workspaceRoot = workspaceRoots[0]!;
  const candidatePath = path.isAbsolute(input.locator)
    ? path.resolve(input.locator)
    : path.resolve(workspaceRoot, input.locator);
  const resolvedRoots = await Promise.all(
    workspaceRoots.map(async (root) => ({
      configured: root,
      resolved: await realpath(root).catch(() => root),
    })),
  );
  const containingRoot = resolvedRoots.find(
    (root) =>
      pathIsWithin(root.configured, candidatePath) ||
      pathIsWithin(root.resolved, candidatePath),
  );
  if (!containingRoot) {
    return inspection("invalid", "path-outside-workspace", checkedAt);
  }

  let workspaceRealPath: string;
  let candidateRealPath: string;
  try {
    [workspaceRealPath, candidateRealPath] = await Promise.all([
      Promise.resolve(containingRoot.resolved),
      realpath(candidatePath),
    ]);
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return inspection("missing", "file-missing", checkedAt);
    }
    return inspection("invalid", "inspection-failed", checkedAt);
  }
  if (!pathIsWithin(workspaceRealPath, candidateRealPath)) {
    return inspection("invalid", "path-outside-workspace", checkedAt);
  }

  let details;
  try {
    details = await stat(candidateRealPath);
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return inspection("missing", "file-missing", checkedAt);
    }
    return inspection("invalid", "inspection-failed", checkedAt);
  }
  if (!details.isFile()) {
    return inspection("invalid", "not-a-regular-file", checkedAt, details.size);
  }
  const expectedSize = Number(input.expectedSizeBytes);
  if (!Number.isSafeInteger(expectedSize) || details.size !== expectedSize) {
    return inspection("invalid", "size-mismatch", checkedAt, details.size);
  }
  if (!input.verifyContent) {
    return inspection("ready", "available", checkedAt, details.size);
  }
  try {
    const observedSha256 = await sha256File(candidateRealPath);
    if (observedSha256 !== input.expectedSha256.toLowerCase()) {
      return inspection(
        "invalid",
        "checksum-mismatch",
        checkedAt,
        details.size,
        observedSha256,
      );
    }
    return {
      state: "ready",
      reason: "available",
      observedSizeBytes: details.size,
      observedSha256,
      checkedAt,
      contentVerifiedAt: checkedAt,
    };
  } catch {
    return inspection("invalid", "inspection-failed", checkedAt, details.size);
  }
}

export class LocalMediaArtifactReconciler {
  private lastRunAt = 0;

  constructor(
    private readonly pool: QueryablePool,
    private readonly options: LocalMediaReconcilerOptions,
  ) {}

  async maybeRun(force = false): Promise<LocalMediaReconciliationResult> {
    const now = (this.options.now ?? (() => new Date()))();
    const intervalMs = Math.max(1_000, this.options.intervalMs ?? 30_000);
    if (!force && now.getTime() - this.lastRunAt < intervalMs) {
      return emptyResult();
    }
    this.lastRunAt = now.getTime();
    const candidates = await this.candidates(
      Math.min(200, Math.max(1, this.options.batchSize ?? 50)),
    );
    if (!candidates.length) return emptyResult();

    const result: LocalMediaReconciliationResult = {
      disposition: "reconciled",
      checked: 0,
      ready: 0,
      missing: 0,
      invalid: 0,
      verificationPending: 0,
      contentHashes: 0,
    };
    const maxHashes = Math.max(0, this.options.maxContentHashesPerRun ?? 1);
    const staleBefore = new Date(
      now.getTime() -
        Math.max(
          60_000,
          this.options.contentVerificationMaxAgeMs ?? 7 * 24 * 60 * 60 * 1_000,
        ),
    );

    for (const candidate of candidates) {
      const recoveryNeedsHash = ["missing", "invalid"].includes(
        candidate.status,
      );
      const periodicHashNeeded =
        !candidate.contentVerifiedAt ||
        candidate.contentVerifiedAt < staleBefore;
      const hashWanted = recoveryNeedsHash || periodicHashNeeded;
      const verifyContent = hashWanted && result.contentHashes < maxHashes;
      const inspected = await inspectLocalMediaArtifact({
        localMediaRoot: this.options.localMediaRoot,
        authorizedRoots: this.options.authorizedRoots,
        locator: candidate.locator,
        expectedSizeBytes: candidate.sizeBytes,
        expectedSha256: candidate.contentSha256,
        verifyContent,
        checkedAt: now,
      });
      if (verifyContent && inspected.observedSha256) result.contentHashes += 1;
      const effectiveInspection =
        recoveryNeedsHash && inspected.state === "ready" && !verifyContent
          ? {
              ...inspected,
              state: "verification-pending" as const,
              reason: "content-verification-pending" as const,
            }
          : inspected;
      await this.record(candidate, effectiveInspection);
      result.checked += 1;
      if (effectiveInspection.state === "ready") result.ready += 1;
      else if (effectiveInspection.state === "missing") result.missing += 1;
      else if (effectiveInspection.state === "invalid") result.invalid += 1;
      else result.verificationPending += 1;
    }
    return result;
  }

  private async candidates(limit: number) {
    const response = await this.pool.query<LocalMediaArtifactCandidate>({
      text: `
        SELECT * FROM (
          SELECT "id", 'replica'::text AS "artifactKind", "locator", "contentSha256",
            "sizeBytes", "status", "availabilityCheckedAt", "contentVerifiedAt", "createdAt"
          FROM "StudioMediaSourceReplica"
          WHERE "storageProvider"='local-cache' AND "status" IN ('ready','missing','invalid')
          UNION ALL
          SELECT "id", 'derivative'::text AS "artifactKind", "locator", "contentSha256",
            "sizeBytes", "status", "availabilityCheckedAt", "contentVerifiedAt", "createdAt"
          FROM "StudioMediaDerivative"
          WHERE "storageProvider"='local' AND "status" IN ('ready','missing','invalid')
        ) AS artifacts
        ORDER BY
          CASE WHEN "status" IN ('missing','invalid') THEN 0 ELSE 1 END,
          "availabilityCheckedAt" ASC NULLS FIRST,
          "createdAt" ASC
        LIMIT $1
      `,
      values: [limit],
    });
    return response.rows;
  }

  private async record(
    candidate: LocalMediaArtifactCandidate,
    inspected: LocalMediaArtifactInspection,
  ) {
    const table =
      candidate.artifactKind === "replica"
        ? '"StudioMediaSourceReplica"'
        : '"StudioMediaDerivative"';
    const priorStatus = candidate.status;
    const status =
      inspected.state === "verification-pending"
        ? priorStatus
        : inspected.state;
    const unavailableAt =
      status === "ready"
        ? null
        : priorStatus === "ready"
          ? inspected.checkedAt
          : undefined;
    const evidence = {
      schema: LOCAL_MEDIA_AVAILABILITY_SCHEMA,
      state: inspected.state,
      reason: inspected.reason,
      checkedAt: inspected.checkedAt.toISOString(),
      contentVerifiedAt: inspected.contentVerifiedAt?.toISOString() ?? null,
      expectedSizeBytes: String(candidate.sizeBytes),
      observedSizeBytes: inspected.observedSizeBytes,
      pathWithheld: true,
    };
    const values: unknown[] = [
      candidate.id,
      status,
      inspected.checkedAt,
      inspected.contentVerifiedAt,
      JSON.stringify(evidence),
    ];
    const unavailableExpression =
      unavailableAt === null
        ? '"unavailableAt"=NULL'
        : unavailableAt instanceof Date
          ? '"unavailableAt"=$6'
          : '"unavailableAt"="unavailableAt"';
    if (unavailableAt instanceof Date) values.push(unavailableAt);
    await this.pool.query({
      text: `
        UPDATE ${table}
        SET "status"=$2,
          "availabilityCheckedAt"=$3,
          "contentVerifiedAt"=COALESCE($4,"contentVerifiedAt"),
          ${unavailableExpression},
          "verificationJson"=COALESCE("verificationJson", '{}'::jsonb)
            || jsonb_build_object('localAvailability',$5::jsonb)
        WHERE "id"=$1
      `,
      values,
    });
  }
}

function inspection(
  state: ArtifactStatus,
  reason: LocalMediaArtifactInspection["reason"],
  checkedAt: Date,
  observedSizeBytes: number | null = null,
  observedSha256: string | null = null,
): LocalMediaArtifactInspection {
  return {
    state,
    reason,
    observedSizeBytes,
    observedSha256,
    checkedAt,
    contentVerifiedAt: null,
  };
}

function pathIsWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function nodeErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
}

function emptyResult(): LocalMediaReconciliationResult {
  return {
    disposition: "idle",
    checked: 0,
    ready: 0,
    missing: 0,
    invalid: 0,
    verificationPending: 0,
    contentHashes: 0,
  };
}
