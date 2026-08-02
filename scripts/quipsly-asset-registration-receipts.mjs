#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { Client } = requireFromQuipsly("pg");

export const APPLY_CONFIRMATION = "RECONCILE_ASSET_REGISTRATION_RECEIPTS";

export function parseAssetRegistrationReceiptArgs(argv) {
  const args = new Set(argv.filter((value) => value !== "--"));
  const confirmArg = argv.find((value) => value.startsWith("--confirm="));
  const unknown = argv.filter(
    (value) =>
      value !== "--" &&
      value !== "--apply" &&
      value !== "--allow-remote" &&
      !value.startsWith("--confirm="),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown[0]}`);
  }
  return {
    apply: args.has("--apply"),
    allowRemote: args.has("--allow-remote"),
    confirmation: confirmArg?.slice("--confirm=".length) || "",
  };
}

export function classifyAssetRegistrationDatabaseTarget(databaseUrl) {
  const parsed = new URL(String(databaseUrl || ""));
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Asset registration reconciliation requires PostgreSQL.");
  }
  const local = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  return {
    local,
    hostname: parsed.hostname,
    database: parsed.pathname.replace(/^\//, ""),
  };
}

function assertMutationAuthority(options, target) {
  if (!options.apply) return;
  if (options.confirmation !== APPLY_CONFIRMATION) {
    throw new Error(
      `Applying reconciliation requires --confirm=${APPLY_CONFIRMATION}.`,
    );
  }
  if (!target.local && !options.allowRemote) {
    throw new Error("Remote reconciliation requires --allow-remote.");
  }
}

async function inventory(client) {
  const result = await client.query(`
    SELECT
      COUNT(*)::integer AS "queuedCount",
      COUNT(*) FILTER (
        WHERE job."assetId" IS NOT NULL AND asset."id" IS NOT NULL
      )::integer AS "eligibleCount",
      COUNT(*) FILTER (
        WHERE job."assetId" IS NULL OR asset."id" IS NULL
      )::integer AS "heldCount"
    FROM "StudioWorkflowJob" AS job
    LEFT JOIN "StudioMediaAsset" AS asset ON asset."id" = job."assetId"
    WHERE job."type" = 'asset-register' AND job."status" = 'queued'
  `);
  return result.rows[0];
}

async function applyReconciliation(client, reconciledAt) {
  await client.query("BEGIN");
  try {
    await client.query(`
      SELECT job."id"
      FROM "StudioWorkflowJob" AS job
      JOIN "StudioMediaAsset" AS asset ON asset."id" = job."assetId"
      WHERE job."type" = 'asset-register' AND job."status" = 'queued'
      ORDER BY job."createdAt" ASC
      FOR UPDATE OF job
    `);
    const updated = await client.query(
      `
        UPDATE "StudioWorkflowJob" AS job
        SET
          "status" = 'completed',
          "startedAt" = COALESCE(job."startedAt", job."createdAt"),
          "completedAt" = COALESCE(job."completedAt", $1::timestamp(3)),
          "error" = NULL,
          "resultJson" = COALESCE(job."resultJson", '{}'::jsonb) || jsonb_build_object(
            'schema', 'quipsly-asset-registration-receipt-v1',
            'state', 'completed',
            'assetId', job."assetId",
            'projectId', job."projectId",
            'source', job."source",
            'completedSynchronously', true,
            'originalRemainsSourceTruth', true,
            'reconciledFromStatus', 'queued',
            'reconciledAt', $1::text
          ),
          "updatedAt" = $1::timestamp(3)
        FROM "StudioMediaAsset" AS asset
        WHERE
          job."assetId" = asset."id" AND
          job."type" = 'asset-register' AND
          job."status" = 'queued'
        RETURNING job."id"
      `,
      [reconciledAt],
    );
    await client.query("COMMIT");
    return updated.rowCount;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseAssetRegistrationReceiptArgs(argv);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const target = classifyAssetRegistrationDatabaseTarget(databaseUrl);
  assertMutationAuthority(options, target);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const before = await inventory(client);
    const reconciledAt = new Date().toISOString();
    const updatedCount = options.apply
      ? await applyReconciliation(client, reconciledAt)
      : 0;
    const after = options.apply ? await inventory(client) : before;
    const report = {
      schema: "quipsly-asset-registration-reconciliation-v1",
      mode: options.apply ? "apply" : "plan",
      target: {
        local: target.local,
        database: target.database,
      },
      before,
      updatedCount,
      after,
      boundaries: {
        onlyQueuedAssetRegisterRows: true,
        canonicalAssetRequired: true,
        sourceMediaRead: false,
        sourceMediaMutated: false,
        priorResultPreserved: true,
        dryRunByDefault: true,
      },
    };
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
