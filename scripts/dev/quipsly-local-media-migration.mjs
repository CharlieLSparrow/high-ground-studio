#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { createConnection } from "node:net";
import {
  access,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  stat,
  statfs,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import {
  activateLocalMediaWorkspace,
  defaultLocalMediaWorkspaceConfigPath,
  readLocalMediaWorkspaceConfig,
} from "./quipsly-local-media-workspace.mjs";

export const LOCAL_MEDIA_MIGRATION_SCHEMA =
  "quipsly-local-media-workspace-migration-v1";
export const DEFAULT_LOCAL_MEDIA_RESERVE_BYTES = 5n * 1024n * 1024n * 1024n;
const execFileAsync = promisify(execFile);

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(350, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function mediaWorkerIsRunning() {
  if (process.platform !== "darwin") return false;
  const domain = `gui/${process.getuid()}`;
  for (const label of [
    "com.quipsly.local.media-worker",
    "com.quipsly.local.transcript-worker",
  ]) {
    try {
      await execFileAsync("launchctl", ["print", `${domain}/${label}`], {
        timeout: 1_000,
      });
      return true;
    } catch {
      // A missing launchd job is the expected stopped state.
    }
  }
  return false;
}

export async function assertLocalMediaMigrationQuiescent({
  isNestPortOpen = () => portIsOpen(3012),
  isMediaWorkerRunning = () => mediaWorkerIsRunning(),
} = {}) {
  if ((await isNestPortOpen()) || (await isMediaWorkerRunning())) {
    throw new Error(
      "Stop the Quipsly local lifecycle before migrating media so no worker can observe a half-rebound locator set.",
    );
  }
  return true;
}

function pathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function safeBasename(value) {
  const normalized = path.basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.slice(-120) || "media.bin";
}

async function sha256File(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function regularFileDetails(filename) {
  const details = await lstat(filename);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Refusing non-regular media file: ${filename}`);
  }
  return details;
}

async function resolveAuthorizedSource(locator, roots) {
  if (!path.isAbsolute(locator)) {
    throw new Error("A local media locator is not absolute.");
  }
  const candidate = await realpath(locator);
  for (const configuredRoot of roots) {
    const root = await realpath(configuredRoot).catch(() => "");
    if (root && pathInside(root, candidate)) return candidate;
  }
  throw new Error(
    `A local media locator is outside the planned legacy roots: ${locator}`,
  );
}

function destinationFor(record, targetRoot) {
  const category =
    record.table === "sourceReplica" ? "replicas" : "derivatives";
  const suffix = safeBasename(record.locator);
  return path.join(
    targetRoot,
    category,
    record.contentSha256.slice(0, 2),
    `${record.contentSha256}-${suffix}`,
  );
}

async function verifyExpectedFile(filename, record) {
  const details = await regularFileDetails(filename);
  if (BigInt(details.size) !== BigInt(record.sizeBytes)) {
    throw new Error(`Media size mismatch for ${record.table}:${record.id}.`);
  }
  const digest = await sha256File(filename);
  if (digest !== record.contentSha256) {
    throw new Error(`Media SHA-256 mismatch for ${record.table}:${record.id}.`);
  }
  return { sizeBytes: BigInt(details.size), sha256: digest };
}

async function durableCopy(source, destination, record) {
  const existing = await stat(destination).catch(() => null);
  if (existing) {
    await verifyExpectedFile(destination, record);
    return { copied: false, destination };
  }
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.partial-${process.pid}-${Date.now()}`;
  try {
    await pipeline(
      createReadStream(source),
      createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    const handle = await open(temporary, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await verifyExpectedFile(temporary, record);
    await rename(temporary, destination);
    const directory = await open(path.dirname(destination), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { copied: true, destination };
}

function normalizedRecord(record) {
  if (
    !record ||
    !["sourceReplica", "derivative"].includes(record.table) ||
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.locator !== "string" ||
    !/^[a-f0-9]{64}$/.test(String(record.contentSha256 || "")) ||
    BigInt(record.sizeBytes) < 0n
  ) {
    throw new Error("A local media migration record violates its schema.");
  }
  return {
    table: record.table,
    id: record.id,
    locator: record.locator,
    contentSha256: record.contentSha256,
    sizeBytes: BigInt(record.sizeBytes),
  };
}

export async function migrateLocalMediaRecords({
  records,
  configPath = defaultLocalMediaWorkspaceConfigPath(),
  reserveBytes = DEFAULT_LOCAL_MEDIA_RESERVE_BYTES,
  now = new Date(),
} = {}) {
  const config = await readLocalMediaWorkspaceConfig({
    configPath,
    requireMounted: true,
  });
  if (!config || config.status !== "planned") {
    throw new Error(
      "A mounted planned media workspace is required for migration.",
    );
  }
  const normalized = records.map(normalizedRecord);
  const targetRoot = await realpath(config.workerMediaRoot);
  const sourceRoots = [...config.legacyReadRoots, targetRoot];
  const prepared = [];
  let missingBytes = 0n;
  for (const record of normalized) {
    const source = await resolveAuthorizedSource(record.locator, sourceRoots);
    await verifyExpectedFile(source, record);
    const destination = pathInside(targetRoot, source)
      ? source
      : destinationFor(record, targetRoot);
    if (!pathInside(targetRoot, destination)) {
      throw new Error(
        "A generated migration destination escaped the workspace.",
      );
    }
    const destinationDetails = await stat(destination).catch(() => null);
    if (destinationDetails) await verifyExpectedFile(destination, record);
    else if (source !== destination) missingBytes += record.sizeBytes;
    prepared.push({ record, source, destination });
  }
  const storage = await statfs(targetRoot);
  const availableBytes = BigInt(storage.bavail) * BigInt(storage.bsize);
  if (availableBytes < missingBytes + BigInt(reserveBytes)) {
    throw new Error(
      `The planned workspace needs ${missingBytes + BigInt(reserveBytes)} safe bytes but has ${availableBytes}.`,
    );
  }

  const mappings = [];
  let copiedBytes = 0n;
  for (const item of prepared) {
    const sourceBefore = await verifyExpectedFile(item.source, item.record);
    const result =
      item.source === item.destination
        ? { copied: false, destination: item.destination }
        : await durableCopy(item.source, item.destination, item.record);
    await verifyExpectedFile(result.destination, item.record);
    const sourceAfter = await verifyExpectedFile(item.source, item.record);
    if (
      sourceBefore.sha256 !== sourceAfter.sha256 ||
      sourceBefore.sizeBytes !== sourceAfter.sizeBytes
    ) {
      throw new Error(
        `Source changed during migration for ${item.record.table}:${item.record.id}.`,
      );
    }
    if (result.copied) copiedBytes += item.record.sizeBytes;
    mappings.push({
      table: item.record.table,
      id: item.record.id,
      priorLocator: item.record.locator,
      targetLocator: result.destination,
      contentSha256: item.record.contentSha256,
      sizeBytes: String(item.record.sizeBytes),
      copied: result.copied,
    });
  }
  const manifestSha256 = createHash("sha256")
    .update(JSON.stringify(mappings))
    .digest("hex");
  return {
    schema: LOCAL_MEDIA_MIGRATION_SCHEMA,
    targetWorkerMediaRoot: config.workerMediaRoot,
    verification: "complete",
    sourceBytesPreserved: true,
    migratedAt: now.toISOString(),
    recordCount: mappings.length,
    copiedBytes: String(copiedBytes),
    manifestSha256,
    mappings,
  };
}

export async function recordsFromPrisma(prisma) {
  const [replicas, derivatives] = await Promise.all([
    prisma.studioMediaSourceReplica.findMany({
      where: { storageProvider: "local-cache", status: "ready" },
      select: { id: true, locator: true, contentSha256: true, sizeBytes: true },
    }),
    prisma.studioMediaDerivative.findMany({
      where: { storageProvider: "local", status: "ready" },
      select: { id: true, locator: true, contentSha256: true, sizeBytes: true },
    }),
  ]);
  return [
    ...replicas.map((record) => ({ table: "sourceReplica", ...record })),
    ...derivatives.map((record) => ({ table: "derivative", ...record })),
  ];
}

export async function rebindPrismaLocators(prisma, receipt) {
  if (receipt?.schema !== LOCAL_MEDIA_MIGRATION_SCHEMA) {
    throw new Error(
      "A verified migration receipt is required for locator rebinding.",
    );
  }
  return prisma.$transaction(async (transaction) => {
    for (const mapping of receipt.mappings) {
      const model =
        mapping.table === "sourceReplica"
          ? transaction.studioMediaSourceReplica
          : transaction.studioMediaDerivative;
      const result = await model.updateMany({
        where: {
          id: mapping.id,
          locator: { in: [mapping.priorLocator, mapping.targetLocator] },
          contentSha256: mapping.contentSha256,
          sizeBytes: BigInt(mapping.sizeBytes),
        },
        data: { locator: mapping.targetLocator },
      });
      if (result.count !== 1) {
        throw new Error(
          `The canonical locator changed for ${mapping.table}:${mapping.id}.`,
        );
      }
    }
    return receipt.mappings.length;
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function main() {
  const configPath =
    argument("--config") || defaultLocalMediaWorkspaceConfigPath();
  const receiptPath =
    argument("--receipt") || `${configPath}.migration-receipt.json`;
  const databaseUrl =
    process.env.QUIPSLY_LOCAL_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
  const parsed = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("Local media migration refuses a non-loopback database.");
  }
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    await assertLocalMediaMigrationQuiescent();
    const records = await recordsFromPrisma(prisma);
    const receipt = await migrateLocalMediaRecords({ records, configPath });
    await mkdir(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      mode: 0o600,
    });
    await rebindPrismaLocators(prisma, receipt);
    await activateLocalMediaWorkspace({ receipt, configPath });
    console.log(
      JSON.stringify(
        {
          status: "active",
          recordCount: receipt.recordCount,
          copiedBytes: receipt.copiedBytes,
          sourceBytesPreserved: true,
          receiptPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await access(receiptPath).catch(() => undefined);
  }
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
