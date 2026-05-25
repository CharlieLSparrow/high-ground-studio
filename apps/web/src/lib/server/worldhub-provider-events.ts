import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureWorldHubProviderConnection } from "@/lib/server/worldhub-integrations";

type RecordWorldHubProviderEventInput = {
  providerKey: string;
  eventType: string;
  externalEventId?: string | null;
  idempotencyKey?: string | null;
  verificationStatus: "not_required" | "unchecked" | "verified" | "failed";
  processingStatus?: "received" | "ignored" | "queued" | "processed" | "failed";
  payloadText: string;
  payloadJson: unknown;
  occurredAt?: Date | null;
  errorMessage?: string | null;
};

function hashPayload(payloadText: string) {
  return createHash("sha256").update(payloadText, "utf8").digest("hex");
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function valueAtPath(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, value);
}

function asSummaryValue(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}

function summarizePayload(payloadJson: unknown): Prisma.InputJsonValue {
  const summary = {
    id: asSummaryValue(valueAtPath(payloadJson, ["id"])),
    type: asSummaryValue(valueAtPath(payloadJson, ["type"])),
    created: asSummaryValue(valueAtPath(payloadJson, ["created"])),
    dataObjectId: asSummaryValue(valueAtPath(payloadJson, ["data", "object", "id"])),
    dataObjectType: asSummaryValue(
      valueAtPath(payloadJson, ["data", "object", "object"]),
    ),
    resourceId: asSummaryValue(valueAtPath(payloadJson, ["data", "id"])),
    resourceType: asSummaryValue(valueAtPath(payloadJson, ["data", "type"])),
  };

  return toJsonInput(summary);
}

export function buildWorldHubProviderIdempotencyKey({
  providerKey,
  eventType,
  externalEventId,
  payloadHash,
}: {
  providerKey: string;
  eventType: string;
  externalEventId?: string | null;
  payloadHash: string;
}) {
  return [providerKey, eventType, externalEventId || payloadHash]
    .map((part) => part.trim())
    .join(":");
}

export async function recordWorldHubProviderEvent({
  providerKey,
  eventType,
  externalEventId,
  idempotencyKey,
  verificationStatus,
  processingStatus = "received",
  payloadText,
  payloadJson,
  occurredAt,
  errorMessage,
}: RecordWorldHubProviderEventInput) {
  const connection = await ensureWorldHubProviderConnection(providerKey);
  const payloadHash = hashPayload(payloadText);
  const stableIdempotencyKey =
    idempotencyKey ||
    buildWorldHubProviderIdempotencyKey({
      providerKey,
      eventType,
      externalEventId,
      payloadHash,
    });

  return prisma.worldHubProviderEvent.upsert({
    where: {
      connectionId_idempotencyKey: {
        connectionId: connection.id,
        idempotencyKey: stableIdempotencyKey,
      },
    },
    create: {
      connectionId: connection.id,
      eventType,
      externalEventId: externalEventId || null,
      idempotencyKey: stableIdempotencyKey,
      verificationStatus,
      processingStatus,
      payloadHash,
      payloadSummaryJson: summarizePayload(payloadJson),
      occurredAt: occurredAt || null,
      errorMessage: errorMessage || null,
    },
    update: {
      verificationStatus,
      processingStatus,
      payloadHash,
      payloadSummaryJson: summarizePayload(payloadJson),
      occurredAt: occurredAt || null,
      errorMessage: errorMessage || null,
      processedAt: processingStatus === "processed" ? new Date() : undefined,
    },
  });
}
