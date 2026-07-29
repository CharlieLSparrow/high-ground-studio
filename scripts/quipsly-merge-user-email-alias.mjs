#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const repoRoot = process.cwd();

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function applyCloudSqlProxyRewrite(env) {
  const proxyPort = env.QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT?.trim();
  if (!proxyPort || !env.DATABASE_URL) return env;

  const url = new URL(env.DATABASE_URL);
  if (!(url.searchParams.get("host") || "").startsWith("/cloudsql/")) return env;

  url.hostname = "127.0.0.1";
  url.port = proxyPort;
  url.searchParams.delete("host");
  return { ...env, DATABASE_URL: url.toString() };
}

function mergedEnv() {
  return applyCloudSqlProxyRewrite({
    ...readDotEnv(path.join(repoRoot, ".env")),
    ...readDotEnv(path.join(repoRoot, ".env.local")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env.local")),
    ...process.env,
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs(argv) {
  const result = {
    apply: false,
    canonicalEmail: "",
    aliasEmail: "",
    label: "verified alternate login",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      result.apply = true;
    } else if (arg === "--canonical-email") {
      result.canonicalEmail = normalizeEmail(argv[++index]);
    } else if (arg === "--alias-email") {
      result.aliasEmail = normalizeEmail(argv[++index]);
    } else if (arg === "--label") {
      result.label = String(argv[++index] || "").trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!result.canonicalEmail || !result.aliasEmail) {
    throw new Error(
      "Usage: node scripts/quipsly-merge-user-email-alias.mjs "
      + "--canonical-email <email> --alias-email <email> [--label <label>] [--apply]",
    );
  }
  if (result.canonicalEmail === result.aliasEmail) {
    throw new Error("Canonical and alias email must be different.");
  }
  if (!result.label) {
    throw new Error("Alias label must not be empty.");
  }

  return result;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function findForeignKeyReferencesToUser(tx, userId) {
  const columns = await tx.$queryRawUnsafe(`
    SELECT
      namespace.nspname AS "schemaName",
      relation.relname AS "tableName",
      attribute.attname AS "columnName"
    FROM pg_constraint constraint_record
    JOIN pg_class relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN LATERAL unnest(constraint_record.conkey) AS key_record(attnum) ON true
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_record.conrelid
      AND attribute.attnum = key_record.attnum
    WHERE constraint_record.contype = 'f'
      AND constraint_record.confrelid = '"User"'::regclass
    ORDER BY relation.relname, attribute.attname
  `);

  const references = [];
  for (const column of columns) {
    const table = `${quoteIdentifier(column.schemaName)}.${quoteIdentifier(column.tableName)}`;
    const sql = `SELECT count(*)::int AS count FROM ${table} WHERE ${quoteIdentifier(column.columnName)} = $1`;
    const rows = await tx.$queryRawUnsafe(sql, userId);
    const count = Number(rows[0]?.count || 0);
    if (count > 0) {
      references.push({
        table: column.tableName,
        column: column.columnName,
        count,
      });
    }
  }
  return references;
}

function createPrisma(env) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 30_000,
    }),
    log: ["error"],
  });
}

async function planOrApplyMerge(prisma, input) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${"quipsly-user-email-alias-merge"})
      )::text AS "lockState"
    `;

    const canonicalUser = await tx.user.findUnique({
      where: { primaryEmail: input.canonicalEmail },
      include: {
        authIdentities: { select: { authority: true, subject: true } },
      },
    });
    if (!canonicalUser) {
      throw new Error("Canonical user does not exist with that primary email.");
    }
    if (!canonicalUser.isActive || !canonicalUser.emailVerified) {
      throw new Error("Canonical user must be active with a verified primary account.");
    }
    if (!canonicalUser.firebaseUid && canonicalUser.authIdentities.length === 0) {
      throw new Error("Canonical user has no established authentication identity.");
    }

    const existingAlias = await tx.userEmail.findUnique({
      where: { email: input.aliasEmail },
    });
    const duplicateUser = await tx.user.findUnique({
      where: { primaryEmail: input.aliasEmail },
      include: {
        authIdentities: { select: { authority: true, subject: true } },
      },
    });

    if (existingAlias) {
      if (existingAlias.userId !== canonicalUser.id) {
        throw new Error("Alias email is already linked to a different canonical user.");
      }
      if (duplicateUser) {
        throw new Error("Alias email is both a User primary email and an existing alias.");
      }
      return {
        ok: true,
        mode: input.apply ? "apply" : "dry-run",
        status: "already-linked",
        canonicalEmail: input.canonicalEmail,
        aliasEmail: input.aliasEmail,
        foreignKeyReferences: [],
      };
    }

    if (!duplicateUser) {
      throw new Error("Alias email has no duplicate User row to merge.");
    }
    if (duplicateUser.firebaseUid || duplicateUser.authIdentities.length > 0) {
      throw new Error(
        "Duplicate user has an authentication identity; an explicit credential-transfer workflow is required.",
      );
    }

    const foreignKeyReferences = await findForeignKeyReferencesToUser(tx, duplicateUser.id);
    if (foreignKeyReferences.length > 0) {
      throw new Error(
        `Duplicate user still owns foreign-key records: ${JSON.stringify(foreignKeyReferences)}`,
      );
    }

    const result = {
      ok: true,
      mode: input.apply ? "apply" : "dry-run",
      status: input.apply ? "merged" : "ready",
      canonicalEmail: input.canonicalEmail,
      aliasEmail: input.aliasEmail,
      aliasLabel: input.label,
      preservedHistoricalEmailReferences: true,
      foreignKeyReferences,
    };

    if (!input.apply) return result;

    await tx.user.delete({ where: { id: duplicateUser.id } });
    await tx.userEmail.create({
      data: {
        userId: canonicalUser.id,
        email: input.aliasEmail,
        label: input.label,
      },
    });
    await tx.userEvent.create({
      data: {
        userId: canonicalUser.id,
        eventName: "identity.email_alias_merged_v1",
        payloadJson: {
          canonicalEmail: input.canonicalEmail,
          aliasEmail: input.aliasEmail,
          aliasLabel: input.label,
          duplicateUserCreatedAt: duplicateUser.createdAt.toISOString(),
          preservedHistoricalEmailReferences: true,
          operator: process.env.QUIPSLY_IDENTITY_MERGE_OPERATOR || "local-gcloud-operator",
        },
      },
    });

    return result;
  }, {
    isolationLevel: "Serializable",
    maxWait: 10_000,
    timeout: 60_000,
  });
}

async function main() {
  const input = parseArgs(process.argv);
  const env = mergedEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const prisma = createPrisma(env);
  try {
    const result = await planOrApplyMerge(prisma, input);
    console.log(JSON.stringify({
      ...result,
      note: input.apply
        ? "Duplicate person row was replaced atomically by an alias on the canonical person; historical email-attribution strings were preserved."
        : "No data was changed. Re-run with --apply only after reviewing this plan.",
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`QUIPSLY_USER_EMAIL_ALIAS_MERGE_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
