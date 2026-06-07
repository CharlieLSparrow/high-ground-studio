import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
  log: ["error"],
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(__dirname, "../ops/quipsly-production-core-additive.sql");

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarTag = "";

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1] ?? "";

    if (!inSingleQuote && !inDoubleQuote && !dollarTag && char === "-" && next === "-") {
      const lineEnd = sql.indexOf("\n", index);
      if (lineEnd === -1) break;
      index = lineEnd;
      current += "\n";
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "$") {
      const rest = sql.slice(index);
      const match = /^\$[A-Za-z0-9_]*\$/.exec(rest);
      if (match) {
        const tag = match[0];
        if (!dollarTag) {
          dollarTag = tag;
          current += tag;
          index += tag.length - 1;
          continue;
        }
        if (dollarTag === tag) {
          dollarTag = "";
          current += tag;
          index += tag.length - 1;
          continue;
        }
      }
    }

    if (!dollarTag && !inDoubleQuote && char === "'" && sql[index - 1] !== "\\") {
      inSingleQuote = !inSingleQuote;
    } else if (!dollarTag && !inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
    }

    if (!dollarTag && !inSingleQuote && !inDoubleQuote && char === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function executeStatement(index, statement) {
  const label = statement
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 90) ?? `statement ${index + 1}`;

  process.stdout.write(`Applying production-core schema ${index + 1}: ${label}\n`);
  await prisma.$executeRawUnsafe(statement);
}

async function verifyRequiredTables() {
  const requiredTables = [
    "StudioNestInvite",
    "StudioAssetAttachment",
    "StudioAssetVariant",
    "StudioAssetProcessingJob",
    "StudioSourceUnit",
    "StudioDocumentOperation",
    "StudioProductionRoom",
    "StudioTimelineVersion",
    "StudioOutputPacket",
    "StudioPublishAttempt",
    "StudioPublishedArtifact",
    "StudioWorkflowJob",
  ];

  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${requiredTables})
  `;

  const existing = new Set(rows.map((row) => row.table_name));
  const missing = requiredTables.filter((tableName) => !existing.has(tableName));
  if (missing.length) {
    throw new Error(`Production core schema sync incomplete. Missing tables: ${missing.join(", ")}`);
  }

  process.stdout.write(`Production core schema ready: ${requiredTables.length} tables verified.\n`);
}

async function main() {
  const sql = await readFile(sqlPath, "utf8");
  const statements = splitSqlStatements(sql);
  process.stdout.write(`Quipsly production-core schema sync starting: ${statements.length} statements.\n`);

  for (let index = 0; index < statements.length; index += 1) {
    await executeStatement(index, statements[index]);
  }

  await verifyRequiredTables();
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
