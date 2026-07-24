#!/usr/bin/env node

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
const sqlPath = resolve(__dirname, "../ops/quipsly-coaching-capture-additive.sql");

const requiredTables = [
  "CoachProfile",
  "ServiceOffering",
  "AvailabilityWindow",
  "BookingHold",
  "CoachingBooking",
  "PaymentRecord",
  "StripeCustomerLink",
  "StripeCheckoutSessionLedger",
  "StripeWebhookEvent",
  "CalendarEventLink",
  "CallRoom",
  "CaptureRoomStateReceipt",
  "MobileCaptureFinalizationReceipt",
  "MobileCaptureEpisodeAttachment",
  "MediaVaultUploadReservation",
  "CallParticipant",
  "RecordingConsent",
  "RecordingAsset",
  "UploadChunk",
  "TranscriptJob",
  "TranscriptSegment",
  "CoachingNote",
  "ActionItem",
];

const requiredColumns = new Map([
  ["CoachProfile", ["id", "userId", "timezone", "isActive", "metadataJson"]],
  ["ServiceOffering", ["id", "slug", "kind", "paymentPolicy", "durationMinutes", "priceCents", "stripePriceId"]],
  ["AvailabilityWindow", ["id", "coachProfileId", "timezone", "dayOfWeek", "startsAt", "endsAt", "isActive"]],
  ["BookingHold", ["id", "scheduledStart", "scheduledEnd", "status", "expiresAt", "convertedBookingId"]],
  ["CoachingBooking", ["id", "clientUserId", "scheduledStart", "scheduledEnd", "status", "paymentPolicy", "paymentRecordId"]],
  ["PaymentRecord", ["id", "provider", "status", "amountCents", "currency", "providerCheckoutSessionId", "providerPaymentIntentId"]],
  ["StripeCustomerLink", ["id", "userId", "stripeCustomerId", "livemode"]],
  ["StripeCheckoutSessionLedger", ["id", "bookingId", "paymentRecordId", "checkoutSessionId", "status", "livemode", "rawJson"]],
  ["StripeWebhookEvent", ["id", "externalEventId", "eventType", "verificationStatus", "processingStatus", "payloadJson"]],
  ["CalendarEventLink", ["id", "bookingId", "roomId", "provider", "status", "providerEventId", "conferenceDataJson"]],
  ["CallRoom", ["id", "bookingId", "purpose", "status", "provider", "providerRoomId", "recordingPolicyJson"]],
  ["CaptureRoomStateReceipt", ["receiptId", "sequence", "roomId", "captureId", "actorUserId", "captureOwnerUserId", "action", "occurredAt", "receivedAt", "outcome", "stateApplied", "roomStatusBefore", "roomStatusAfter", "httpStatus", "actorConsentId", "consentVersion", "staffCrashCompensation", "metadataJson"]],
  ["MobileCaptureFinalizationReceipt", ["uploadSessionId", "captureId", "roomId", "actorUserId", "startReceiptId", "consentVersion", "processingDisposition", "transcriptDisposition", "holdReasonCode", "transcriptHoldReasonCode", "recordingAssetId", "releasedByUserId", "releasedAt", "transcriptReleasedByUserId", "transcriptReleasedAt", "metadataJson"]],
  ["MobileCaptureEpisodeAttachment", ["uploadSessionId", "productionId", "mediaAssetId", "sourceId", "createdAt"]],
  ["MediaVaultUploadReservation", ["id", "lane", "requestId", "actorUserId", "actorEmail", "projectId", "projectSlug", "bucketName", "objectPath", "contentType", "expectedSizeBytes", "status", "expiresAt", "expiredAt", "abandonedAt", "completedAt", "completedSizeBytes", "completionGeneration", "completionSource", "issuedAt", "renewedAt", "renewalCount", "createdAt", "updatedAt"]],
  ["CallParticipant", ["id", "roomId", "userId", "email", "role", "connectionJson"]],
  ["RecordingConsent", ["id", "roomId", "status", "consentText", "canRecordAudio", "canTranscribe"]],
  ["RecordingAsset", ["id", "roomId", "kind", "status", "storageObjectPath", "localManifestJson", "segmentsJson", "verifiedAt"]],
  ["UploadChunk", ["id", "assetId", "chunkIndex", "status", "byteStart", "byteEnd", "verifiedAt"]],
  ["TranscriptJob", ["id", "roomId", "assetId", "status", "provider", "resultJson"]],
  ["TranscriptSegment", ["id", "transcriptJobId", "speakerLabel", "startSeconds", "endSeconds", "text"]],
  ["CoachingNote", ["id", "roomId", "bookingId", "kind", "body", "sourceJson"]],
  ["ActionItem", ["id", "roomId", "bookingId", "title", "status", "sourceJson"]],
]);

const requiredIndexes = [
  "MediaVaultUploadReservation_lane_actorUserId_requestId_key",
  "MediaVaultUploadReservation_bucketName_objectPath_key",
  "MediaVaultUploadReservation_actorUserId_issuedAt_idx",
  "MediaVaultUploadReservation_projectId_issuedAt_idx",
  "MediaVaultUploadReservation_actorUserId_status_expiresAt_idx",
  "MediaVaultUploadReservation_projectId_status_expiresAt_idx",
  "MediaVaultUploadReservation_status_expiresAt_idx",
];

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
    ?.slice(0, 100) ?? `statement ${index + 1}`;

  process.stdout.write(`Applying coaching/capture schema ${index + 1}: ${label}\n`);
  await prisma.$executeRawUnsafe(statement);
}

async function verifyRequiredSchema() {
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${requiredTables})
  `;
  const existingTables = new Set(rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));
  if (missingTables.length) {
    throw new Error(`Coaching/capture schema sync incomplete. Missing tables: ${missingTables.join(", ")}`);
  }

  const columnRows = await prisma.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${requiredTables})
  `;
  const columnsByTable = new Map();
  for (const row of columnRows) {
    const current = columnsByTable.get(row.table_name) ?? new Set();
    current.add(row.column_name);
    columnsByTable.set(row.table_name, current);
  }

  const missingColumns = [];
  for (const [tableName, columns] of requiredColumns.entries()) {
    const actual = columnsByTable.get(tableName) ?? new Set();
    for (const column of columns) {
      if (!actual.has(column)) missingColumns.push(`${tableName}.${column}`);
    }
  }
  if (missingColumns.length) {
    throw new Error(`Coaching/capture schema sync incomplete. Missing columns: ${missingColumns.join(", ")}`);
  }

  const indexRows = await prisma.$queryRaw`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'MediaVaultUploadReservation'
  `;
  const existingIndexes = new Set(indexRows.map((row) => row.indexname));
  const missingIndexes = requiredIndexes.filter((indexName) => !existingIndexes.has(indexName));
  if (missingIndexes.length) {
    throw new Error(`Coaching/capture schema sync incomplete. Missing indexes: ${missingIndexes.join(", ")}`);
  }

  process.stdout.write(`Coaching/capture schema ready: ${requiredTables.length} tables and ${requiredIndexes.length} upload reservation indexes verified.\n`);
}

async function main() {
  const sql = await readFile(sqlPath, "utf8");
  const statements = splitSqlStatements(sql);
  process.stdout.write(`Quipsly coaching/capture schema sync starting: ${statements.length} statements.\n`);

  for (let index = 0; index < statements.length; index += 1) {
    await executeStatement(index, statements[index]);
  }

  await verifyRequiredSchema();
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
