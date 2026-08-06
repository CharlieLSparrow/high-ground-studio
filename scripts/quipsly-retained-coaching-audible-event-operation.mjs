#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const roomId = "retained-coaching-follow-up-20260731";
const recordingAssetId = "retained-coaching-continuity-asset-20260803";
const assetId = "retained-coaching-continuity-media-20260803";
const sourceId = "retained-coaching-continuity-source-20260803";
const mutationEnabled = process.env.QUIPSLY_RETAINED_COACHING_AUDIBLE_EVENT_OPERATION === "1";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname), "Retained coaching detector operation requires loopback PostgreSQL.");
const mediaRoot = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }), log: ["error"] });

try {
  const [recording, asset, source] = await Promise.all([
    prisma.recordingAsset.findFirst({ where: { id: recordingAssetId, roomId }, select: { id: true, checksum: true, byteSize: true, durationSeconds: true, localManifestJson: true, room: { select: { project: { select: { id: true, slug: true } } } } } }),
    prisma.studioMediaAsset.findUnique({ where: { id: assetId }, select: { id: true, url: true, mimeType: true, sizeBytes: true, isProxy: true, assetAttachments: { select: { projectId: true, metadataJson: true } } } }),
    prisma.studioVideoSource.findUnique({ where: { id: sourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  const project = recording?.room?.project;
  assert.ok(recording && project && asset && source?.providerSourceId, "The retained coaching recording-to-Nest source binding is incomplete.");
  assert.equal(asset.isProxy, false);
  assert.equal(asset.url, `/api/ingest/media/${sourceId}`);
  assert.equal(source.url, asset.url);
  assert.ok(asset.assetAttachments.some((attachment) => attachment.projectId === project.id), "The retained coaching media is not attached to its Session Nest.");
  const [sourcePath, canonicalMediaRoot] = await Promise.all([
    realpath(path.resolve(source.providerSourceId)),
    realpath(mediaRoot),
  ]);
  const relative = path.relative(canonicalMediaRoot, sourcePath);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "The retained coaching source escaped the authorized local media root.");
  const bytes = await readFile(sourcePath);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sourceSha256, recording.checksum, "The retained coaching recording checksum drifted.");
  assert.equal(bytes.byteLength, Number(recording.byteSize), "The retained coaching recording size drifted.");
  assert.equal(bytes.byteLength, Number(asset.sizeBytes), "The retained coaching Studio asset size drifted.");
  const analyzer = path.join(root, "apps/mobile-capture/HighGroundCapture/scripts/run-local-audible-event-analysis.sh");
  const { stdout, stderr } = await execFileAsync(analyzer, [sourcePath], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  const raw = canonicalizeAnalyzerReceipt(parseAnalyzerReceipt(stdout));
  validateReceipt(raw, sourceSha256, bytes.byteLength);
  const latest = await prisma.studioAudibleEventAnalysisReceipt.findFirst({ where: { projectId: project.id, assetId, sourceId }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }] });
  const analysis = { ...raw, supersedesAnalysisId: latest?.id ?? null };
  const sourceBinding = { assetId, provider: "local", locator: sourcePath, generation: `sha256:${sourceSha256}`, sizeBytes: bytes.byteLength, sha256: sourceSha256, contentType: asset.mimeType || "video/mp4" };
  const requestSha256 = hashJson({ schema: "quipsly-audible-event-analysis-registration-v1", projectId: project.id, assetId, sourceId, source: sourceBinding, analysis });
  if (mutationEnabled) {
    await prisma.studioAudibleEventAnalysisReceipt.create({ data: {
      id: analysis.analysisId,
      projectId: project.id,
      assetId,
      sourceId,
      supersedesAnalysisId: analysis.supersedesAnalysisId,
      algorithm: analysis.algorithm,
      classifierIdentifier: analysis.classifierIdentifier,
      detectorConfigurationSha256: detectorConfigurationHash(analysis),
      sourceSha256,
      sourceGeneration: sourceBinding.generation,
      sourceByteCount: BigInt(bytes.byteLength),
      sourceDurationSeconds: analysis.durationSeconds,
      requestSha256,
      analysisJson: analysis,
      analyzedAt: new Date(analysis.analyzedAt),
    } });
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: mutationEnabled ? "registered" : "dry-run",
    roomId,
    projectSlug: project.slug,
    recordingAssetId,
    assetId,
    sourceId,
    analysisId: analysis.analysisId,
    supersedesAnalysisId: analysis.supersedesAnalysisId,
    durationSeconds: analysis.durationSeconds,
    suggestionCount: analysis.suggestions.length,
    suggestions: analysis.suggestions.map((suggestion) => ({ label: suggestion.displayLabel, classificationIdentifier: suggestion.classificationIdentifier, startSeconds: suggestion.startSeconds, endSeconds: suggestion.endSeconds, confidence: suggestion.confidence })),
    analyzerStderr: stderr.trim() || null,
    fixtureIsSynthetic: object(object(recording.localManifestJson).reportedSourceProfile).syntheticFixture === true,
    boundaries: { noHumanLabelCreated: true, classifierOutputIsTriageOnly: true, sourceBytesUnchanged: true, noMediaTreatmentOrEditAuthorized: true, localMutationRequiredExplicitFlag: true },
  }, null, 2)}\n`);
} finally { await prisma.$disconnect(); }

function parseAnalyzerReceipt(stdout) { const start = stdout.indexOf("{"); if (start < 0) throw new Error("The native analyzer did not emit JSON."); return JSON.parse(stdout.slice(start)); }
function canonicalizeAnalyzerReceipt(receipt) { return { ...receipt, failureCode: receipt?.failureCode ?? null, failureDetail: receipt?.failureDetail ?? null }; }
function validateReceipt(receipt, sha256, byteCount) { if (receipt?.schemaVersion !== 1 || receipt?.status !== "completed" || receipt?.algorithm !== "apple-sound-classifier-file-v1" || receipt?.classifierIdentifier !== "SNClassifierIdentifierVersion1" || receipt?.sourceSHA256 !== sha256 || receipt?.sourceByteCount !== byteCount || !Array.isArray(receipt?.suggestions) || receipt?.boundaries?.classifierOutputIsListeningTriageOnly !== true || receipt?.boundaries?.classifierScoreIsNotAudibility !== true || receipt?.boundaries?.noMediaChanged !== true || receipt?.boundaries?.noRepairOrEditAuthorized !== true || receipt?.boundaries?.humanReviewRequired !== true) throw new Error("The detector receipt is not bound to these exact immutable coaching bytes."); }
function detectorConfigurationHash(value) { return hashJson({ algorithm: value.algorithm, classifierIdentifier: value.classifierIdentifier, requestedWindowDurationSeconds: value.requestedWindowDurationSeconds, effectiveWindowDurationSeconds: value.effectiveWindowDurationSeconds, overlapFactor: value.overlapFactor, minimumCandidateConfidence: value.minimumCandidateConfidence, knownClassificationCount: value.knownClassificationCount, knownClassificationsSHA256: value.knownClassificationsSHA256 }); }
function hashJson(value) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
