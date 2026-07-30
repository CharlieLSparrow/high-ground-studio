import { createRequire } from "node:module";
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const fixtureDatabase = requiredFixtureDatabase(
  process.env.QUIPSLY_SCHEMA_FIXTURE_DATABASE,
);
const sourceSha = requiredText(
  process.env.QUIPSLY_SCHEMA_SOURCE_SHA,
  "QUIPSLY_SCHEMA_SOURCE_SHA",
);
const databaseUrl = requiredText(process.env.DATABASE_URL, "DATABASE_URL");
const adminUrl = new URL(databaseUrl);
adminUrl.searchParams.delete("schema");
const fixtureUrl = new URL(adminUrl);
fixtureUrl.pathname = `/${fixtureDatabase}`;
fixtureUrl.searchParams.set("schema", "public");

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { Client } = requireFromQuipsly("pg");
let verified = false;

try {
  migrate(fixtureUrl.toString());
  migrate(fixtureUrl.toString());

  const client = new Client({ connectionString: fixtureUrl.toString() });
  await client.connect();
  try {
    const expectedMigrations = (
      await readdir(new URL("../prisma/migrations/", import.meta.url), {
        withFileTypes: true,
      })
    ).filter((entry) => entry.isDirectory()).length;
    const migrations = await client.query(
      `
        SELECT "migration_name", "finished_at", "rolled_back_at"
        FROM "public"."_prisma_migrations"
        ORDER BY "started_at"
      `,
    );
    if (
      migrations.rows.length !== expectedMigrations
      || migrations.rows.some((row) => !row.finished_at || row.rolled_back_at)
    ) {
      throw new Error(
        `Expected ${expectedMigrations} completed migrations; `
          + `found ${migrations.rows.length}.`,
      );
    }

    const columns = await client.query(
      `
        SELECT "table_name", "column_name", "is_nullable", "data_type"
        FROM information_schema.columns
        WHERE "table_schema" = $1
          AND (
            ("table_name" = 'TranscriptJob' AND "column_name" = ANY($2))
            OR
            ("table_name" = 'TranscriptWord' AND "column_name" = ANY($3))
          )
        ORDER BY "table_name", "column_name"
      `,
      [
        "public",
        [
          "processingManifestObject",
          "processingResultObject",
          "sourceGeneration",
          "sourceSha256",
          "providerRequestId",
          "providerResponseObject",
          "workerBuildId",
        ],
        [
          "id",
          "transcriptJobId",
          "segmentId",
          "providerWordIndex",
          "startSeconds",
          "endSeconds",
          "word",
          "punctuatedWord",
        ],
      ],
    );
    if (columns.rows.length !== 15) {
      throw new Error(
        `Transcript fixture is missing required columns: `
          + `expected 15, found ${columns.rows.length}.`,
      );
    }

    const constraints = await client.query(
      `
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          rc.delete_rule,
          rc.update_rule
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.referential_constraints rc
          ON rc.constraint_schema = tc.constraint_schema
          AND rc.constraint_name = tc.constraint_name
        WHERE tc.table_schema = $1
          AND tc.table_name = 'TranscriptWord'
        ORDER BY tc.constraint_name
      `,
      ["public"],
    );
    const foreignKeys = constraints.rows.filter(
      (row) => row.constraint_type === "FOREIGN KEY",
    );
    if (
      foreignKeys.length !== 2
      || foreignKeys.some(
        (row) => row.delete_rule !== "CASCADE" || row.update_rule !== "CASCADE",
      )
    ) {
      throw new Error(
        "TranscriptWord must have two cascading foreign-key constraints.",
      );
    }

    const indexes = await client.query(
      `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = 'TranscriptWord'
        ORDER BY indexname
      `,
      ["public"],
    );
    const uniqueProviderIndex = indexes.rows.some(
      (row) =>
        row.indexname
          === "TranscriptWord_transcriptJobId_providerWordIndex_key"
        && String(row.indexdef).includes("UNIQUE"),
    );
    if (!uniqueProviderIndex) {
      throw new Error(
        "TranscriptWord is missing its stable provider-word identity index.",
      );
    }

    verified = true;
    console.log(JSON.stringify({
      schemaVersion: 1,
      kind: "quipsly-schema-fixture-receipt-v1",
      sourceSha,
      fixtureDatabase,
      migrationCount: migrations.rows.length,
      requiredColumnCount: columns.rows.length,
      foreignKeyCount: foreignKeys.length,
      indexCount: indexes.rows.length,
      migrateReplay: "idempotent",
      transcriptContract: "verified",
    }));
  } finally {
    await client.end();
  }
} finally {
  if (verified) {
    // Clean up a same-named schema left by the pre-database fixture design.
    // The identifier is release-tool-owned and validated above.
    const cleanup = new Client({ connectionString: adminUrl.toString() });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${fixtureDatabase}" CASCADE`);
      console.log(JSON.stringify({
        kind: "quipsly-schema-legacy-fixture-cleanup-v1",
        fixtureDatabase,
        droppedLegacySchemaAfterVerification: true,
      }));
    } finally {
      await cleanup.end();
    }
  }
}

function migrate(url) {
  const result = spawnSync(
    "pnpm",
    [
      "prisma",
      "migrate",
      "deploy",
      "--schema=prisma/schema.prisma",
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(
      `Prisma fixture migration failed with exit ${result.status ?? "signal"}.`,
    );
  }
}

function requiredFixtureDatabase(value) {
  const normalized = requiredText(
    value,
    "QUIPSLY_SCHEMA_FIXTURE_DATABASE",
  );
  if (
    !/^quipsly_fixture_[a-z0-9_]{8,40}$/.test(normalized)
    || normalized === "public"
  ) {
    throw new Error(
      "Fixture database must be an isolated quipsly_fixture_* identifier.",
    );
  }
  return normalized;
}

function requiredText(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}
