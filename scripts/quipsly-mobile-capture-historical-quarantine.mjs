#!/usr/bin/env node
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

import { mobileCaptureProcessingGateFromEvidence } from "../apps/quipsly/src/lib/server/mobile-capture-processing-policy.js";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmation = args.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length) || "";
const reason = args.find((value) => value.startsWith("--reason="))?.slice("--reason=".length).trim() || "";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error("DATABASE_URL is required for the historical capture audit.");
if (apply && confirmation !== "QUARANTINE_CAPTURE_ARTIFACTS") {
  throw new Error("Apply requires --confirm=QUARANTINE_CAPTURE_ARTIFACTS.");
}
if (apply && reason.length < 20) {
  throw new Error("Apply requires --reason=... with at least 20 characters for the audit trail.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString), log: ["error"] });

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function packetTranscriptJobId(value) {
  const source = record(value);
  return source.source === "transcript-packet-builder" && typeof source.transcriptJobId === "string"
    ? source.transcriptJobId
    : null;
}

function publicAsset(asset, mediaGate, transcriptGate) {
  const manifest = record(asset.localManifestJson);
  const promotion = record(manifest.promotion);
  return {
    recordingAssetId: asset.id,
    roomId: asset.roomId,
    kind: asset.kind,
    status: asset.status,
    mediaAllowed: mediaGate.allowed,
    mediaReasonCode: mediaGate.allowed ? null : mediaGate.errorCode,
    transcriptAllowed: transcriptGate.allowed,
    transcriptReasonCode: transcriptGate.allowed ? null : transcriptGate.errorCode,
    historicalSourceId: promotion.sourceId || manifest.sourceId || null,
    historicalMediaAssetId: promotion.mediaAssetId || manifest.mediaAssetId || null,
    transcriptJobIds: asset.transcriptJobs.map((job) => job.id),
  };
}

async function main() {
  const assets = await prisma.recordingAsset.findMany({
    include: {
      room: { include: { participants: true, recordingConsents: true } },
      transcriptJobs: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const receipts = await prisma.mobileCaptureFinalizationReceipt.findMany({
    orderBy: { createdAt: "asc" },
  });
  const receiptsByAsset = new Map();
  for (const receipt of receipts) {
    if (!receipt.recordingAssetId) continue;
    const list = receiptsByAsset.get(receipt.recordingAssetId) || [];
    list.push(receipt);
    receiptsByAsset.set(receipt.recordingAssetId, list);
  }

  const held = assets.flatMap((asset) => {
    const evidence = {
      recordingAsset: asset,
      receipts: receiptsByAsset.get(asset.id) || [],
      room: asset.room,
    };
    const mediaGate = mobileCaptureProcessingGateFromEvidence({ ...evidence, transcript: false });
    const transcriptGate = mobileCaptureProcessingGateFromEvidence({ ...evidence, transcript: true });
    return mediaGate.allowed && transcriptGate.allowed ? [] : [{ asset, mediaGate, transcriptGate }];
  });
  const heldTranscriptJobIds = new Set(held.flatMap(({ asset }) => asset.transcriptJobs.map((job) => job.id)));
  const [packetNotes, packetActions] = await Promise.all([
    prisma.coachingNote.findMany({
      where: { sourceJson: { path: ["source"], equals: "transcript-packet-builder" } },
      select: { id: true, roomId: true, sourceJson: true },
    }),
    prisma.actionItem.findMany({
      where: { sourceJson: { path: ["source"], equals: "transcript-packet-builder" } },
      select: { id: true, roomId: true, sourceJson: true },
    }),
  ]);
  const quarantinedNotes = packetNotes.filter((note) => heldTranscriptJobIds.has(packetTranscriptJobId(note.sourceJson)));
  const quarantinedActions = packetActions.filter((item) => heldTranscriptJobIds.has(packetTranscriptJobId(item.sourceJson)));
  const report = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    counts: {
      recordingAssetsScanned: assets.length,
      heldRecordingAssets: held.length,
      heldTranscriptJobs: heldTranscriptJobIds.size,
      quarantinedPacketNotes: quarantinedNotes.length,
      quarantinedPacketActionItems: quarantinedActions.length,
    },
    held: held.map(({ asset, mediaGate, transcriptGate }) => publicAsset(asset, mediaGate, transcriptGate)),
    packetProjectionIds: {
      noteIds: quarantinedNotes.map((note) => note.id),
      actionItemIds: quarantinedActions.map((item) => item.id),
    },
  };

  if (apply) {
    const appliedAt = new Date().toISOString();
    await prisma.$transaction(async (tx) => {
      for (const { asset, mediaGate, transcriptGate } of held) {
        await tx.recordingAsset.update({
          where: { id: asset.id },
          data: {
            status: "HELD",
            localManifestJson: {
              ...record(asset.localManifestJson),
              processingDisposition: mediaGate.allowed ? "RELEASED" : "HELD",
              processingHoldReasonCode: mediaGate.allowed ? null : mediaGate.errorCode,
              processingHoldReason: mediaGate.allowed ? null : mediaGate.error,
              transcriptionDisposition: transcriptGate.allowed ? "RELEASED" : "HELD",
              transcriptionHoldReasonCode: transcriptGate.allowed ? null : transcriptGate.errorCode,
              transcriptionHoldReason: transcriptGate.allowed ? null : transcriptGate.error,
              historicalQuarantine: {
                version: 1,
                appliedAt,
                reason,
                source: "quipsly-mobile-capture-historical-quarantine",
                originalStatus: asset.status,
              },
            },
          },
        });
        const transcriptJobIds = asset.transcriptJobs.map((job) => job.id);
        if (transcriptJobIds.length) {
          await tx.transcriptJob.updateMany({
            where: { id: { in: transcriptJobIds }, status: { not: "HELD" } },
            data: {
              status: "HELD",
              provider: "processing-hold",
              errorMessage: transcriptGate.allowed
                ? "Historical capture quarantined pending source review."
                : transcriptGate.error,
            },
          });
        }
      }
    }, { timeout: 60_000 });
    report.applied = { appliedAt, reason };
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
