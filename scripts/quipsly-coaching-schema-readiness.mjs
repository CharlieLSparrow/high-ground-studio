#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { Client } = requireFromQuipsly("pg");

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json");
const warnOnly = args.has("--warn-only");

const envFiles = [
  ".env",
  ".env.local",
  "apps/quipsly/.env",
  "apps/quipsly/.env.local",
];

function parseEnvValue(raw) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadDotEnvFiles() {
  for (const file of envFiles) {
    const fullPath = join(repoRoot, file);
    if (!existsSync(fullPath)) continue;
    const text = readFileSync(fullPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (process.env[key] === undefined) process.env[key] = parseEnvValue(value);
    }
  }
}

function safeDatabaseLabel(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "unparseable-database-url";
  }
}

const tableSpecs = [
  {
    table: "CoachProfile",
    purpose: "coach identity/profile",
    requiredColumns: ["id", "userId", "timezone", "isActive", "metadataJson"],
  },
  {
    table: "ServiceOffering",
    purpose: "coaching offers and Stripe/IAP boundary",
    requiredColumns: ["id", "slug", "kind", "paymentPolicy", "durationMinutes", "priceCents", "stripePriceId"],
  },
  {
    table: "AvailabilityWindow",
    purpose: "coach availability MVP",
    requiredColumns: ["id", "coachProfileId", "timezone", "dayOfWeek", "startsAt", "endsAt", "isActive"],
  },
  {
    table: "BookingHold",
    purpose: "temporary booking holds",
    requiredColumns: ["id", "scheduledStart", "scheduledEnd", "status", "expiresAt", "convertedBookingId"],
  },
  {
    table: "CoachingBooking",
    purpose: "confirmed/requested coaching bookings",
    requiredColumns: ["id", "clientUserId", "scheduledStart", "scheduledEnd", "status", "paymentPolicy", "paymentRecordId"],
  },
  {
    table: "PaymentRecord",
    purpose: "app-owned payment evidence",
    requiredColumns: ["id", "provider", "status", "amountCents", "currency", "providerCheckoutSessionId", "providerPaymentIntentId"],
  },
  {
    table: "StripeCustomerLink",
    purpose: "Stripe customer mapping without making Stripe source of truth",
    requiredColumns: ["id", "userId", "stripeCustomerId", "livemode"],
  },
  {
    table: "StripeCheckoutSessionLedger",
    purpose: "Stripe checkout session ledger",
    requiredColumns: ["id", "bookingId", "paymentRecordId", "checkoutSessionId", "status", "livemode", "rawJson"],
  },
  {
    table: "StripeWebhookEvent",
    purpose: "Stripe webhook evidence ledger",
    requiredColumns: ["id", "externalEventId", "eventType", "verificationStatus", "processingStatus", "payloadJson"],
  },
  {
    table: "CalendarEventLink",
    purpose: "calendar receipt slots",
    requiredColumns: ["id", "bookingId", "roomId", "provider", "status", "providerEventId", "conferenceDataJson"],
  },
  {
    table: "CallRoom",
    purpose: "meeting room source of truth",
    requiredColumns: ["id", "bookingId", "purpose", "status", "provider", "providerRoomId", "recordingPolicyJson"],
  },
  {
    table: "CallParticipant",
    purpose: "meeting participants",
    requiredColumns: ["id", "roomId", "userId", "email", "role", "connectionJson"],
  },
  {
    table: "RecordingConsent",
    purpose: "explicit recording/transcription consent",
    requiredColumns: ["id", "roomId", "status", "consentText", "canRecordAudio", "canTranscribe"],
  },
  {
    table: "RecordingAsset",
    purpose: "local/provider recording asset evidence",
    requiredColumns: ["id", "roomId", "kind", "status", "storageObjectPath", "localManifestJson", "segmentsJson", "verifiedAt"],
  },
  {
    table: "UploadChunk",
    purpose: "resumable upload evidence",
    requiredColumns: ["id", "assetId", "chunkIndex", "status", "byteStart", "byteEnd", "verifiedAt"],
  },
  {
    table: "TranscriptJob",
    purpose: "transcription job queue/evidence",
    requiredColumns: ["id", "roomId", "assetId", "status", "provider", "resultJson"],
  },
  {
    table: "TranscriptSegment",
    purpose: "speaker/time-aligned transcript segments",
    requiredColumns: ["id", "transcriptJobId", "speakerLabel", "startSeconds", "endSeconds", "text"],
  },
  {
    table: "CoachingNote",
    purpose: "session notes and packet material",
    requiredColumns: ["id", "roomId", "bookingId", "kind", "body", "sourceJson"],
  },
  {
    table: "ActionItem",
    purpose: "coaching follow-up actions",
    requiredColumns: ["id", "roomId", "bookingId", "title", "status", "sourceJson"],
  },
];

loadDotEnvFiles();

const databaseUrl = process.env.DATABASE_URL;
const report = {
  ok: false,
  warnOnly,
  checkedAt: new Date().toISOString(),
  invariant:
    "Authenticated coaching/capture runtime requires app-owned Prisma tables before booking, payment, call-room, consent, recording, transcript, note, or action-item writes are trustworthy.",
  database: databaseUrl ? safeDatabaseLabel(databaseUrl) : null,
  checkedTables: tableSpecs.map((spec) => spec.table),
  missingTables: [],
  missingColumns: [],
  errors: [],
};

if (!databaseUrl) {
  report.errors.push({
    id: "missing-database-url",
    message: "DATABASE_URL is not set in the environment or local env files.",
  });
} else {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 15_000,
  });

  try {
    await client.connect();
    const tableNames = tableSpecs.map((spec) => spec.table);
    const tableResult = await client.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
      `,
      [tableNames],
    );
    const existingTables = new Set(tableResult.rows.map((row) => row.table_name));

    for (const spec of tableSpecs) {
      if (!existingTables.has(spec.table)) {
        report.missingTables.push({
          table: spec.table,
          purpose: spec.purpose,
        });
      }
    }

    if (existingTables.size > 0) {
      const columnResult = await client.query(
        `
          select table_name, column_name
          from information_schema.columns
          where table_schema = 'public'
            and table_name = any($1::text[])
        `,
        [tableNames],
      );
      const columnsByTable = new Map();
      for (const row of columnResult.rows) {
        const current = columnsByTable.get(row.table_name) ?? new Set();
        current.add(row.column_name);
        columnsByTable.set(row.table_name, current);
      }

      for (const spec of tableSpecs) {
        if (!existingTables.has(spec.table)) continue;
        const columns = columnsByTable.get(spec.table) ?? new Set();
        for (const column of spec.requiredColumns) {
          if (!columns.has(column)) {
            report.missingColumns.push({
              table: spec.table,
              column,
              purpose: spec.purpose,
            });
          }
        }
      }
    }
  } catch (error) {
    report.errors.push({
      id: "database-query-failed",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await client.end().catch(() => undefined);
  }
}

report.ok =
  report.errors.length === 0 &&
  report.missingTables.length === 0 &&
  report.missingColumns.length === 0;

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Quipsly coaching schema readiness: ${report.ok ? "PASS" : warnOnly ? "WARN" : "FAIL"}`);
  if (report.database) console.log(`Database: ${report.database}`);
  if (report.errors.length) {
    console.log("Errors:");
    for (const error of report.errors) console.log(`- ${error.id}: ${error.message}`);
  }
  if (report.missingTables.length) {
    console.log("Missing tables:");
    for (const item of report.missingTables) console.log(`- ${item.table}: ${item.purpose}`);
  }
  if (report.missingColumns.length) {
    console.log("Missing columns:");
    for (const item of report.missingColumns) console.log(`- ${item.table}.${item.column}: ${item.purpose}`);
  }
  if (!report.ok) {
    console.log("\nNext safe action: run a targeted Prisma schema sync only against the intended database, then rerun this smoke.");
  }
}

process.exit(report.ok || warnOnly ? 0 : 1);
