import { spawnSync, execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { Client } = requireFromQuipsly("pg");

export function assertLocalDatabaseUrl(rawValue) {
  const raw = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!raw) throw new Error("DATABASE_URL is required.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://.");
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(
      "Local schema fixtures accept only an exact loopback PostgreSQL target.",
    );
  }
  if (!url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL must select an existing local admin database.");
  }
  return url;
}

export function deriveFixtureDatabase(sourceSha) {
  const normalized = typeof sourceSha === "string" ? sourceSha.trim() : "";
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("Source SHA must be a full lowercase Git commit SHA.");
  }
  return `quipsly_fixture_${normalized.slice(0, 12)}_local`;
}

export function quoteFixtureIdentifier(identifier) {
  if (!/^quipsly_fixture_[a-z0-9_]{8,40}$/.test(identifier)) {
    throw new Error("Refusing an unsafe local fixture database identifier.");
  }
  return `"${identifier}"`;
}

export function parseFixtureReceipt(output) {
  for (const line of String(output).split("\n")) {
    try {
      const value = JSON.parse(line);
      if (value?.kind === "quipsly-schema-fixture-receipt-v1") return value;
    } catch {
      // Prisma writes ordinary progress lines around the one JSON receipt.
    }
  }
  throw new Error("Schema fixture worker did not emit its verified receipt.");
}

function parseArguments(argv) {
  let outputPath = "";
  let preserve = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--preserve") {
      preserve = true;
      continue;
    }
    if (value === "--output") {
      outputPath = argv[index + 1] ?? "";
      if (!outputPath) throw new Error("--output requires a path.");
      index += 1;
      continue;
    }
    if (value === "--help") {
      console.log(`Usage:
  DATABASE_URL=postgresql://... node scripts/quipsly-local-schema-fixture.mjs [options]

Options:
  --output <receipt.json>  Mode-0600 redacted receipt path.
  --preserve               Keep the verified fixture database for inspection.
  --help                   Show this help.

The current Git HEAD must be clean. The command accepts only loopback
PostgreSQL, creates one absent release-owned database, replays every committed
migration twice, requires zero schema diff and fixture contract checks, then
drops only that exact database after success. A failed fixture is preserved for
analysis.`);
      return { help: true, outputPath: "", preserve: false };
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return { help: false, outputPath, preserve };
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function defaultReceiptPath(sourceSha) {
  const stamp = new Date().toISOString().replaceAll(/[-:.]/g, "");
  return resolve(
    process.env.TMPDIR || "/tmp",
    `quipsly-local-schema-fixture-${sourceSha.slice(0, 12)}-${stamp}-${process.pid}.json`,
  );
}

function writeReceipt(path, receipt) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(absolute, 0o600);
  return absolute;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return;

  const databaseUrl = assertLocalDatabaseUrl(process.env.DATABASE_URL);
  const sourceSha = git("rev-parse", "HEAD");
  const dirty = git("status", "--porcelain");
  if (dirty) {
    throw new Error(
      "Local schema fixture proof requires a clean current HEAD so source and evidence cannot drift.",
    );
  }

  const fixtureDatabase = deriveFixtureDatabase(sourceSha);
  const quotedFixture = quoteFixtureIdentifier(fixtureDatabase);
  const outputPath = options.outputPath || defaultReceiptPath(sourceSha);
  if (existsSync(resolve(outputPath))) {
    throw new Error(
      `Receipt path already exists; refusing to overwrite ${resolve(outputPath)}.`,
    );
  }
  const adminDatabase = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (adminDatabase === fixtureDatabase) {
    throw new Error(
      "DATABASE_URL must not select the release-owned fixture database.",
    );
  }
  const startedAt = new Date().toISOString();
  const client = new Client({
    connectionString: databaseUrl.toString(),
    connectionTimeoutMillis: 5_000,
  });

  let created = false;
  let verified = false;
  let dropped = false;
  let workerReceipt = null;
  let failure = null;

  try {
    await client.connect();
    const existing = await client.query(
      "SELECT datname FROM pg_database WHERE datname = $1",
      [fixtureDatabase],
    );
    if (existing.rowCount !== 0) {
      throw new Error(
        `Fixture database ${fixtureDatabase} already exists; refusing to reuse or replace it.`,
      );
    }

    await client.query(
      `CREATE DATABASE ${quotedFixture} TEMPLATE template0 ENCODING 'UTF8'`,
    );
    created = true;
    console.log(`Created disposable local fixture ${fixtureDatabase}.`);

    const worker = spawnSync(
      process.execPath,
      ["scripts/quipsly-schema-fixture.mjs"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl.toString(),
          QUIPSLY_SCHEMA_FIXTURE_DATABASE: fixtureDatabase,
          QUIPSLY_SCHEMA_SOURCE_SHA: sourceSha,
        },
      },
    );
    if (worker.stdout) process.stdout.write(worker.stdout);
    if (worker.stderr) process.stderr.write(worker.stderr);
    if (worker.status !== 0) {
      throw new Error(
        worker.error?.message ??
          `Schema fixture worker failed with exit ${worker.status ?? "signal"}.`,
      );
    }

    workerReceipt = parseFixtureReceipt(worker.stdout);
    if (
      workerReceipt.sourceSha !== sourceSha
      || workerReceipt.fixtureDatabase !== fixtureDatabase
      || workerReceipt.migrateReplay !== "idempotent"
      || workerReceipt.schemaDiff !== "zero"
    ) {
      throw new Error(
        "Schema fixture receipt does not match the selected source and database.",
      );
    }
    verified = true;

    if (!options.preserve) {
      await client.query(`DROP DATABASE ${quotedFixture} WITH (FORCE)`);
      dropped = true;
      console.log(`Removed verified disposable fixture ${fixtureDatabase}.`);
    }
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    await client.end().catch(() => {});
  }

  const outcome = failure ? "FAILED" : "PASSED";
  const receiptPath = writeReceipt(outputPath, {
    schema: "quipsly-local-schema-fixture-run-v1",
    generatedAt: new Date().toISOString(),
    startedAt,
    outcome,
    source: {
      sha: sourceSha,
      cleanHeadRequired: true,
      cleanHeadVerified: true,
    },
    target: {
      boundary: "loopback-postgresql-only",
      adminDatabase,
      fixtureDatabase,
    },
    fixture: {
      created,
      verified,
      dropped,
      preservedByRequest: options.preserve,
      preservedForFailureAnalysis: Boolean(failure && created),
    },
    worker: workerReceipt,
    failure: failure ? { message: failure.message } : null,
  });
  console.log(`Local schema fixture receipt: ${receiptPath}`);

  if (failure) {
    if (created) {
      console.error(
        `Fixture ${fixtureDatabase} was preserved for failure analysis.`,
      );
    }
    throw failure;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
