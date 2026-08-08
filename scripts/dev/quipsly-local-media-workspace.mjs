#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  statfs,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const LOCAL_MEDIA_WORKSPACE_SCHEMA = "quipsly-local-media-workspace-v1";

export function defaultLocalMediaWorkspaceConfigPath(
  environment = process.env,
) {
  return (
    environment.QUIPSLY_LOCAL_MEDIA_WORKSPACE_CONFIG ||
    path.join(
      homedir(),
      "Library",
      "Application Support",
      "Quipsly",
      "local-media-workspace.json",
    )
  );
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function safeWorkspaceRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value.trim())) {
    throw new Error("The media workspace must be an absolute path.");
  }
  const result = path.resolve(value.trim());
  const parsed = path.parse(result);
  const home = path.resolve(homedir());
  if (
    result === parsed.root ||
    result === home ||
    result === "/Volumes" ||
    result === "/Users"
  ) {
    throw new Error(
      "Choose a dedicated Quipsly folder, not a whole volume or home directory.",
    );
  }
  return result;
}

function publicConfig(value) {
  return {
    schema: value.schema,
    status: value.status,
    workspaceRoot: value.workspaceRoot,
    workerMediaRoot: value.workerMediaRoot,
    spatialVaultRoot: value.spatialVaultRoot,
    legacyReadRoots: value.legacyReadRoots,
    revision: value.revision,
    updatedAt: value.updatedAt,
    activationReceiptSha256: value.activationReceiptSha256,
  };
}

export async function readLocalMediaWorkspaceConfig({
  configPath = defaultLocalMediaWorkspaceConfigPath(),
  requireMounted = false,
} = {}) {
  const raw = await readFile(configPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (raw === null) return null;
  const details = await lstat(configPath);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(
      "The local media workspace configuration is not a regular file.",
    );
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "The local media workspace configuration is not valid JSON.",
    );
  }
  const workspaceRoot = safeWorkspaceRoot(value.workspaceRoot);
  const workerMediaRoot = path.resolve(String(value.workerMediaRoot || ""));
  const spatialVaultRoot = path.resolve(String(value.spatialVaultRoot || ""));
  const legacyReadRoots = Array.isArray(value.legacyReadRoots)
    ? [
        ...new Set(
          value.legacyReadRoots.map((item) => path.resolve(String(item))),
        ),
      ]
    : [];
  if (
    value.schema !== LOCAL_MEDIA_WORKSPACE_SCHEMA ||
    !["planned", "active"].includes(value.status) ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.updatedAt !== "string" ||
    workerMediaRoot !== path.join(workspaceRoot, "worker-media") ||
    spatialVaultRoot !== path.join(workspaceRoot, "spatial-vault") ||
    legacyReadRoots.length > 8 ||
    legacyReadRoots.some(
      (root) =>
        !path.isAbsolute(root) ||
        root === path.parse(root).root ||
        root === workspaceRoot ||
        isInside(workspaceRoot, root) ||
        isInside(root, workspaceRoot),
    ) ||
    (value.status === "active" &&
      !/^[a-f0-9]{64}$/.test(String(value.activationReceiptSha256 || "")))
  ) {
    throw new Error(
      "The local media workspace configuration violates its schema.",
    );
  }
  if (requireMounted) {
    const [resolvedWorkspace, resolvedWorker, resolvedSpatial] =
      await Promise.all([
        realpath(workspaceRoot).catch(() => ""),
        realpath(workerMediaRoot).catch(() => ""),
        realpath(spatialVaultRoot).catch(() => ""),
      ]);
    if (
      !resolvedWorkspace ||
      !resolvedWorker ||
      !resolvedSpatial ||
      !isInside(resolvedWorkspace, resolvedWorker) ||
      !isInside(resolvedWorkspace, resolvedSpatial)
    ) {
      throw new Error(
        "The configured Quipsly media workspace is unavailable. Reconnect its volume instead of falling back to the system disk.",
      );
    }
    await Promise.all([
      access(resolvedWorker, constants.R_OK | constants.W_OK),
      access(resolvedSpatial, constants.R_OK | constants.W_OK),
    ]);
  }
  return publicConfig({
    ...value,
    workspaceRoot,
    workerMediaRoot,
    spatialVaultRoot,
    legacyReadRoots,
    activationReceiptSha256:
      typeof value.activationReceiptSha256 === "string"
        ? value.activationReceiptSha256
        : null,
  });
}

async function atomicWrite(configPath, value) {
  await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${configPath}.partial-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporaryPath, configPath);
}

export async function planLocalMediaWorkspace({
  workspaceRoot,
  legacyReadRoots: requestedLegacyReadRoots = [],
  configPath = defaultLocalMediaWorkspaceConfigPath(),
  now = new Date(),
} = {}) {
  const normalizedRoot = safeWorkspaceRoot(workspaceRoot);
  const prior = await readLocalMediaWorkspaceConfig({ configPath }).catch(
    (error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    },
  );
  const workerMediaRoot = path.join(normalizedRoot, "worker-media");
  const spatialVaultRoot = path.join(normalizedRoot, "spatial-vault");
  await Promise.all([
    mkdir(workerMediaRoot, { recursive: true, mode: 0o700 }),
    mkdir(spatialVaultRoot, { recursive: true, mode: 0o700 }),
  ]);
  const legacyReadRoots = [
    ...(prior?.status === "active" && prior.workerMediaRoot !== workerMediaRoot
      ? [prior.workerMediaRoot]
      : []),
    ...(prior?.legacyReadRoots ?? []),
    ...requestedLegacyReadRoots.map((root) => safeWorkspaceRoot(root)),
  ].filter((root, index, values) => values.indexOf(root) === index);
  if (
    legacyReadRoots.some(
      (root) =>
        root === normalizedRoot ||
        isInside(normalizedRoot, root) ||
        isInside(root, normalizedRoot),
    )
  ) {
    throw new Error(
      "A legacy read root must not contain or sit inside the new media workspace.",
    );
  }
  const next = {
    schema: LOCAL_MEDIA_WORKSPACE_SCHEMA,
    status: "planned",
    workspaceRoot: normalizedRoot,
    workerMediaRoot,
    spatialVaultRoot,
    legacyReadRoots: legacyReadRoots.slice(0, 8),
    revision: (prior?.revision ?? 0) + 1,
    updatedAt: now.toISOString(),
    activationReceiptSha256: null,
  };
  await atomicWrite(configPath, next);
  const storage = await statfs(workerMediaRoot);
  return {
    ...publicConfig(next),
    storage: {
      availableBytes: String(storage.bavail * storage.bsize),
      pathWithheldFromNest: true,
    },
  };
}

export async function activateLocalMediaWorkspace({
  receipt,
  configPath = defaultLocalMediaWorkspaceConfigPath(),
  now = new Date(),
} = {}) {
  const planned = await readLocalMediaWorkspaceConfig({
    configPath,
    requireMounted: true,
  });
  if (!planned || planned.status !== "planned") {
    throw new Error("Plan a mounted media workspace before activation.");
  }
  if (
    !receipt ||
    receipt.schema !== "quipsly-local-media-workspace-migration-v1"
  ) {
    throw new Error("Activation requires a verified media migration receipt.");
  }
  const receiptSha256 = createHash("sha256")
    .update(JSON.stringify(receipt))
    .digest("hex");
  const receiptManifestSha256 = Array.isArray(receipt.mappings)
    ? createHash("sha256")
        .update(JSON.stringify(receipt.mappings))
        .digest("hex")
    : "";
  if (
    receipt.targetWorkerMediaRoot !== planned.workerMediaRoot ||
    receipt.verification !== "complete" ||
    receipt.sourceBytesPreserved !== true ||
    !Array.isArray(receipt.mappings) ||
    receipt.recordCount !== receipt.mappings.length ||
    !/^\d+$/.test(String(receipt.copiedBytes || "")) ||
    !Number.isFinite(Date.parse(String(receipt.migratedAt || ""))) ||
    receipt.manifestSha256 !== receiptManifestSha256
  ) {
    throw new Error(
      "The media migration receipt does not authorize this workspace.",
    );
  }
  const active = {
    ...planned,
    status: "active",
    revision: planned.revision + 1,
    updatedAt: now.toISOString(),
    activationReceiptSha256: receiptSha256,
  };
  await atomicWrite(configPath, active);
  return publicConfig(active);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function main() {
  const command =
    process.argv.slice(2).find((value) => value !== "--") || "status";
  const configPath =
    argument("--config") || defaultLocalMediaWorkspaceConfigPath();
  if (command === "plan") {
    const result = await planLocalMediaWorkspace({
      workspaceRoot: argument("--workspace"),
      legacyReadRoots: argument("--legacy-root")
        ? [argument("--legacy-root")]
        : [],
      configPath,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  let config = await readLocalMediaWorkspaceConfig({ configPath });
  if (command === "resolve" && config?.status === "active") {
    config = await readLocalMediaWorkspaceConfig({
      configPath,
      requireMounted: true,
    });
  }
  if (command === "status") {
    console.log(
      JSON.stringify({ configured: Boolean(config), config }, null, 2),
    );
    return;
  }
  if (command === "resolve") {
    if (!config || config.status !== "active") return;
    const field = argument("--field");
    if (field === "workerMediaRoot") console.log(config.workerMediaRoot);
    else if (field === "spatialVaultRoot") console.log(config.spatialVaultRoot);
    else if (field === "legacyReadRootsJson")
      console.log(JSON.stringify(config.legacyReadRoots));
    else throw new Error("Resolve requires a supported --field.");
    return;
  }
  throw new Error(`Unknown local media workspace command: ${command}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
