#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const projectSlug = process.env.QUIPSLY_AUDIBLE_EVENT_PROJECT_SLUG || "high-ground-odyssey";
const episodeSlug = process.env.QUIPSLY_AUDIBLE_EVENT_EPISODE_SLUG || "episode-4-part-2";
const requestedAssetId = process.env.QUIPSLY_AUDIBLE_EVENT_ASSET_ID || "";
const mutationEnabled = process.env.QUIPSLY_RETAINED_AUDIBLE_EVENT_REVIEW_OPERATION === "1";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }), log: ["error"] });

try {
  const project = await prisma.studioProject.findFirst({ where: { slug: projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new Error(`Nest ${projectSlug} was not found.`);
  const production = await prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId: project.id, slug: episodeSlug } },
    select: { id: true, productionJson: true, updatedAt: true },
  });
  if (!production) throw new Error(`Episode ${episodeSlug} was not found in ${projectSlug}.`);
  const productionJson = object(production.productionJson);
  const importedMedia = Array.isArray(productionJson.importedMedia) ? productionJson.importedMedia.map(object) : [];
  const selectedIndex = requestedAssetId
    ? importedMedia.findIndex((entry) => text(entry.id) === requestedAssetId)
    : importedMedia.findIndex((entry) => text(entry.kind) === "audio" && localLocator(entry));
  if (selectedIndex < 0) throw new Error(requestedAssetId ? `Asset ${requestedAssetId} is not in this episode.` : "No local retained audio source was found in this episode.");
  const selected = importedMedia[selectedIndex];
  const assetId = text(selected.id);
  const sourceId = text(selected.sourceId);
  const storedLocator = localLocator(selected);
  if (!assetId || !sourceId || !storedLocator) throw new Error("The selected imported source lacks exact asset, source, or local immutable-byte identity.");
  const locator = await realpath(storedLocator);
  const sourceBytes = await readFile(locator);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const [asset, source, latestLedger] = await Promise.all([
    prisma.studioMediaAsset.findUnique({ where: { id: assetId }, select: { id: true, url: true, mimeType: true, isProxy: true, assetAttachments: { where: { projectId: project.id }, select: { id: true } } } }),
    prisma.studioVideoSource.findUnique({ where: { id: sourceId }, select: { id: true, url: true, providerSourceId: true } }),
    prisma.studioAudibleEventAnalysisReceipt.findFirst({ where: { projectId: project.id, assetId, sourceId }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }] }),
  ]);
  const registeredLocator = source?.providerSourceId
    ? await realpath(source.providerSourceId).catch(() => null)
    : null;
  if (!asset || asset.isProxy || asset.assetAttachments.length === 0 || asset.url !== `/api/ingest/media/${sourceId}` || registeredLocator !== locator || source?.url !== asset.url) throw new Error("The selected Episode media no longer has its exact original Nest source binding.");
  const analyzer = path.join(root, "apps/mobile-capture/HighGroundCapture/scripts/run-local-audible-event-analysis.sh");
  const { stdout, stderr } = await execFileAsync(analyzer, [locator], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  const receipt = canonicalizeAnalyzerReceipt(parseAnalyzerReceipt(stdout));
  validateReceipt(receipt, sourceSha256, sourceBytes.byteLength);
  const metadata = object(selected.metadata);
  const sync = object(selected.sync);
  const recordingSync = object(metadata.recordingSync);
  const reportedSourceProfile = object(recordingSync.reportedSourceProfile);
  const prior = object(reportedSourceProfile.audibleEventAnalysis);
  const supersedesAnalysisId = text(latestLedger?.id) || text(prior.analysisId) || null;
  const canonicalReceipt = { ...receipt, supersedesAnalysisId };
  const sourceBinding = {
    assetId,
    provider: "local",
    locator,
    generation: `sha256:${sourceSha256}`,
    sizeBytes: sourceBytes.byteLength,
    sha256: sourceSha256,
    contentType: asset.mimeType || "video/mp4",
  };
  const nextImportedMedia = [...importedMedia];
  nextImportedMedia[selectedIndex] = {
    ...selected,
    metadata: {
      ...metadata,
      recordingSync: {
        ...recordingSync,
        reportedSourceProfile: {
          ...reportedSourceProfile,
          audibleEventAnalysis: canonicalReceipt,
        },
      },
    },
    sync: {
      ...sync,
      recordingSync: {
        ...object(sync.recordingSync),
        reportedSourceProfile: {
          ...object(object(sync.recordingSync).reportedSourceProfile),
          audibleEventAnalysis: canonicalReceipt,
        },
      },
    },
  };
  if (mutationEnabled) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.studioEpisodeProduction.updateMany({
        where: { id: production.id, updatedAt: production.updatedAt },
        data: { productionJson: { ...productionJson, importedMedia: nextImportedMedia } },
      });
      if (changed.count !== 1) throw new Error("Episode media changed during analysis; no receipt was attached. Re-run against the new canonical state.");
      await tx.studioAudibleEventAnalysisReceipt.create({ data: {
        id: canonicalReceipt.analysisId,
        projectId: project.id,
        assetId,
        sourceId,
        supersedesAnalysisId,
        algorithm: canonicalReceipt.algorithm,
        classifierIdentifier: canonicalReceipt.classifierIdentifier,
        detectorConfigurationSha256: detectorConfigurationHash(canonicalReceipt),
        sourceSha256,
        sourceGeneration: sourceBinding.generation,
        sourceByteCount: BigInt(sourceBytes.byteLength),
        sourceDurationSeconds: canonicalReceipt.durationSeconds,
        requestSha256: hashJson({ schema: "quipsly-audible-event-analysis-registration-v1", projectId: project.id, assetId, sourceId, source: sourceBinding, analysis: canonicalReceipt }),
        analysisJson: canonicalReceipt,
        analyzedAt: new Date(canonicalReceipt.analyzedAt),
      } });
    });
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: mutationEnabled ? "attached" : "dry-run",
    projectSlug,
    episodeSlug,
    assetId,
    sourceId,
    sourceSha256,
    sourceByteCount: sourceBytes.byteLength,
    analysisId: receipt.analysisId,
    supersedesAnalysisId,
    analyzedSeconds: receipt.durationSeconds,
    suggestionCount: receipt.suggestions.length,
    suggestions: receipt.suggestions.map((suggestion) => ({ eventId: suggestion.eventId, label: suggestion.displayLabel, family: suggestion.family, startSeconds: suggestion.startSeconds, endSeconds: suggestion.endSeconds, confidence: suggestion.confidence })),
    analyzerStderr: stderr.trim() || null,
    boundaries: { sourceBytesWereReadOnly: true, receiptIsListeningTriageOnly: true, noReviewWasFabricated: true, noRepairOrEditAuthorized: true, mutationRequiresExplicitOperationFlag: true },
  }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}

function parseAnalyzerReceipt(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("The native analyzer did not emit a JSON receipt.");
  return JSON.parse(stdout.slice(start));
}
function canonicalizeAnalyzerReceipt(receipt) {
  return {
    ...receipt,
    failureCode: receipt?.failureCode ?? null,
    failureDetail: receipt?.failureDetail ?? null,
  };
}
function validateReceipt(receipt, sha256, byteCount) {
  if (
    receipt?.schemaVersion !== 1
    || receipt?.status !== "completed"
    || receipt?.algorithm !== "apple-sound-classifier-file-v1"
    || receipt?.classifierIdentifier !== "SNClassifierIdentifierVersion1"
    || receipt?.sourceSHA256 !== sha256
    || receipt?.sourceByteCount !== byteCount
    || !Array.isArray(receipt?.suggestions)
    || receipt?.boundaries?.classifierOutputIsListeningTriageOnly !== true
    || receipt?.boundaries?.classifierScoreIsNotAudibility !== true
    || receipt?.boundaries?.noMediaChanged !== true
    || receipt?.boundaries?.noRepairOrEditAuthorized !== true
    || receipt?.boundaries?.humanReviewRequired !== true
  ) throw new Error("The native analyzer receipt is not bound to these exact immutable source bytes.");
}
function localLocator(entry) {
  for (const candidate of [entry.gcsUri, entry.storageUri]) {
    const value = text(candidate);
    if (value.startsWith("/")) return value;
    if (value.startsWith("file://")) return new URL(value).pathname;
  }
  return "";
}
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function detectorConfigurationHash(value) { return hashJson({ algorithm: value.algorithm, classifierIdentifier: value.classifierIdentifier, requestedWindowDurationSeconds: value.requestedWindowDurationSeconds, effectiveWindowDurationSeconds: value.effectiveWindowDurationSeconds, overlapFactor: value.overlapFactor, minimumCandidateConfidence: value.minimumCandidateConfidence, knownClassificationCount: value.knownClassificationCount, knownClassificationsSHA256: value.knownClassificationsSHA256 }); }
function hashJson(value) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])); }
