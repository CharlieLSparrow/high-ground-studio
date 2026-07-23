#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const baselineMigrations = [
  "20260607000000_baseline_existing_schema",
  "20260608000000_add_vector_embedding",
  "20260703000000_add_coaching_capture_core",
  "20260704000000_add_coaching_request_metadata",
];

function addMatches(target, sql, expression, valueIndex = 1) {
  for (const match of sql.matchAll(expression)) {
    target.add(match[valueIndex]);
  }
}

export function collectExpectedSchema(sqlSources) {
  const expected = {
    columns: new Set(),
    constraints: new Set(),
    extensions: new Set(),
    indexes: new Set(),
    tables: new Set(),
    types: new Set(),
  };

  for (const sql of sqlSources) {
    if (/\b(?:DROP\s+(?:TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)) {
      throw new Error("Foundation baseline contains a destructive SQL statement.");
    }

    addMatches(
      expected.extensions,
      sql,
      /CREATE\s+EXTENSION(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([A-Za-z0-9_]+)"?/gi,
    );
    addMatches(expected.types, sql, /CREATE\s+TYPE\s+"([^"]+)"/gi);
    addMatches(
      expected.indexes,
      sql,
      /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"/gi,
    );
    addMatches(expected.constraints, sql, /\bCONSTRAINT\s+"([^"]+)"/gi);

    for (const match of sql.matchAll(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"\s*\(([\s\S]*?)\);/gi,
    )) {
      const [, tableName, body] = match;
      expected.tables.add(tableName);
      for (const line of body.split("\n")) {
        const columnMatch = /^\s*"([^"]+)"\s+/.exec(line);
        if (columnMatch) expected.columns.add(`${tableName}.${columnMatch[1]}`);
      }
    }

    for (const match of sql.matchAll(
      /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"/gi,
    )) {
      expected.columns.add(`${match[1]}.${match[2]}`);
    }
  }

  return expected;
}

function missingFrom(expected, actual) {
  return [...expected].filter((value) => !actual.has(value)).sort();
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const migrationRoot = resolve(scriptDirectory, "../prisma/migrations");
  const sqlSources = await Promise.all(
    baselineMigrations.map((migration) =>
      readFile(resolve(migrationRoot, migration, "migration.sql"), "utf8"),
    ),
  );
  const expected = collectExpectedSchema(sqlSources);

  const requireFromQuipsly = createRequire(
    new URL("../apps/quipsly/package.json", import.meta.url),
  );
  const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
  const prisma = new PrismaClient({
    adapter: new PrismaPg(connectionString),
    log: ["error"],
  });

  try {
    const [tableRows, columnRows, typeRows, indexRows, constraintRows, extensionRows] =
      await Promise.all([
        prisma.$queryRawUnsafe(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        ),
        prisma.$queryRawUnsafe(
          `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
        ),
        prisma.$queryRawUnsafe(
          `SELECT type.typname
             FROM pg_type AS type
             JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
            WHERE namespace.nspname = 'public'`,
        ),
        prisma.$queryRawUnsafe(
          `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
        ),
        prisma.$queryRawUnsafe(
          `SELECT constraint_record.conname
             FROM pg_constraint AS constraint_record
             JOIN pg_namespace AS namespace ON namespace.oid = constraint_record.connamespace
            WHERE namespace.nspname = 'public'`,
        ),
        prisma.$queryRawUnsafe(`SELECT extname FROM pg_extension`),
      ]);

    const actual = {
      tables: new Set(tableRows.map((row) => row.table_name)),
      columns: new Set(
        columnRows.map((row) => `${row.table_name}.${row.column_name}`),
      ),
      types: new Set(typeRows.map((row) => row.typname)),
      indexes: new Set(indexRows.map((row) => row.indexname)),
      constraints: new Set(constraintRows.map((row) => row.conname)),
      extensions: new Set(extensionRows.map((row) => row.extname)),
    };

    const missing = Object.fromEntries(
      Object.keys(expected).map((kind) => [
        kind,
        missingFrom(expected[kind], actual[kind]),
      ]),
    );
    const missingCount = Object.values(missing).reduce(
      (sum, values) => sum + values.length,
      0,
    );

    if (missingCount > 0) {
      for (const [kind, values] of Object.entries(missing)) {
        if (values.length > 0) {
          process.stderr.write(`Missing ${kind}: ${values.join(", ")}\n`);
        }
      }
      throw new Error(
        `Foundation baseline audit failed with ${missingCount} missing schema objects.`,
      );
    }

    process.stdout.write(
      `Foundation baseline ready to resolve: ${expected.tables.size} tables, ` +
        `${expected.columns.size} columns, ${expected.types.size} types, ` +
        `${expected.indexes.size} indexes, ${expected.constraints.size} constraints, ` +
        `${expected.extensions.size} extensions verified.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const isEntrypoint =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  await main();
}
