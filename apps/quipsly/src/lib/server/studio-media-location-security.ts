import "server-only";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseGcsUri, requireMediaBucketName } from "@/lib/server/gcs";

const DEFAULT_LOCAL_STUDIO_MEDIA_ROOTS = [
  path.join(tmpdir(), "quipsly-media-ingest"),
  path.join(tmpdir(), "quipsly-mobile-chunk-ingest"),
] as const;

function configuredPaths(envName: string) {
  return String(process.env[envName] || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function configuredJsonPaths(envName: string) {
  const value = String(process.env[envName] || "");
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 8) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function pathIsInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function configuredLocalStudioMediaRoots(extraEnvNames: string[] = []) {
  return [
    ...DEFAULT_LOCAL_STUDIO_MEDIA_ROOTS,
    ...configuredPaths("QUIPSLY_LOCAL_MEDIA_ROOTS"),
    ...configuredJsonPaths("QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON"),
    ...extraEnvNames.flatMap(configuredPaths),
  ]
    .filter((item) => path.isAbsolute(item))
    .map((item) => path.resolve(item))
    .filter(
      (item) =>
        item !== path.parse(item).root &&
        item !== "/Volumes" &&
        item !== "/Users",
    );
}

export type LocalStudioMediaPathResolution =
  | { kind: "allowed"; path: string }
  | { kind: "missing" }
  | { kind: "rejected" };

/**
 * Classifies a persisted local source path without collapsing a missing
 * artifact into a security rejection. That distinction matters operationally:
 * a missing retained file needs recovery or relinking, while a rejected path
 * is outside the executor's explicitly authorized storage roots.
 */
export async function classifyLocalStudioMediaPath(
  candidate: string,
  extraEnvNames: string[] = [],
): Promise<LocalStudioMediaPathResolution> {
  if (!path.isAbsolute(candidate)) return { kind: "rejected" };

  let realCandidate: string;
  try {
    realCandidate = await fs.realpath(candidate);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { kind: "missing" };
    }
    return { kind: "rejected" };
  }

  for (const configuredRoot of configuredLocalStudioMediaRoots(extraEnvNames)) {
    const realRoot = await fs
      .realpath(configuredRoot)
      .catch(() => configuredRoot);
    if (pathIsInside(realRoot, realCandidate)) {
      return { kind: "allowed", path: realCandidate };
    }
  }
  return { kind: "rejected" };
}

/**
 * Returns the canonical on-disk path only when it is inside an explicit local
 * ingest root. realpath checks prevent a symlink in an allowed folder from
 * turning an authorized media source into an arbitrary-file read.
 */
export async function resolveAllowedLocalStudioMediaPath(
  candidate: string,
  extraEnvNames: string[] = [],
) {
  const resolution = await classifyLocalStudioMediaPath(
    candidate,
    extraEnvNames,
  );
  return resolution.kind === "allowed" ? resolution.path : null;
}

export type AuthorizedMediaVaultLocation =
  | { kind: "not-gcs" }
  | { kind: "rejected-gcs"; error: string }
  | {
      kind: "gcs";
      bucketName: string;
      objectName: string;
      generation: string | null;
    };

/**
 * Service-account reads are confined to Quipsly's configured private media
 * bucket. A persisted source URI must never become a cross-bucket deputy.
 */
export function authorizeConfiguredMediaVaultLocation(
  value: string | null | undefined,
): AuthorizedMediaVaultLocation {
  const parsed = parseGcsUri(value);
  if (!parsed) return { kind: "not-gcs" };

  let configuredBucket: string;
  try {
    configuredBucket = requireMediaBucketName();
  } catch {
    return {
      kind: "rejected-gcs",
      error: "The private media vault is not configured on this server.",
    };
  }

  if (parsed.bucketName !== configuredBucket) {
    return {
      kind: "rejected-gcs",
      error: "This source is outside Quipsly's configured private media vault.",
    };
  }
  return { kind: "gcs", ...parsed };
}
