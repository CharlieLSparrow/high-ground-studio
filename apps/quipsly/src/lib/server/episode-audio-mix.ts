import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Prisma } from "@prisma/client";
import {
  EPISODE_AUDIO_MIX_REVIEW_EVIDENCE_SCHEMA,
  buildEpisodeAudioMixBaselineTargetLocator,
  buildEpisodeAudioMixTargetLocator,
  episodeAudioMixReviewCoverage,
  newAutomaticEpisodeAudioMixProposal,
  parseEpisodeAudioMixProposal,
  parseEpisodeAudioMixResult,
  type EpisodeAudioMixProposal,
  type EpisodeAudioMixReviewEvidence,
  type EpisodeAudioMixTrack,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { loadEpisodeAudioActivityAnalysisContext } from "@/lib/server/episode-audio-activity-analysis";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

const JOB_TYPE = "episode-audio-mix";
const ROLES = new Set<EpisodeAudioMixTrack["role"]>(["dialogue-primary", "dialogue-backup", "camera-scratch", "reference", "music", "sound-effect", "program-master"]);

export class EpisodeAudioMixError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } }

export type PublicEpisodeAudioMixStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  proposalId: string | null;
  programFingerprintSha256: string | null;
  actionCount: number;
  unresolvedCount: number;
  actions: Array<{ id: string; targetAssetId: string; targetTitle: string; participantLabel: string | null; startSeconds: number; endSeconds: number; gainDb: number; reason: string; evidenceReviewReceiptIds: string[] }>;
  unresolved: Array<{ eventId: string; reason: string; involvedAssetIds: string[] }>;
  requiredReviewSecondBins: number[];
  preview: null | { assetId: string; playbackUrl: string | null; sha256: string; durationSeconds: number; integratedLufs: number; truePeakDbtp: number; baselineAssetId: string | null; baselinePlaybackUrl: string | null; baselineSha256: string | null; baselineDurationSeconds: number | null; baselineIntegratedLufs: number | null; baselineTruePeakDbtp: number | null; levelMatchedDeltaLufs: number | null; outputByteRelationship: "bit-identical" | "different" | null };
  error: string | null;
  updatedAt: string | null;
  boundaries: { sourceTracksRemainImmutable: true; automationIsProposalNotTimelineMutation: true; previewIsUnpromoted: true; playbackApprovalRequired: true };
};

export async function queueEpisodeAudioMix(input: { prisma: any; projectSlug: string; episodeProductionId: string; actorEmail: string }) {
  const context = await loadMixContext(input);
  const proposalId = `episode_mix_${randomUUID().replaceAll("-", "")}`;
  const outputAssetId = `episode_mix_asset_${randomUUID().replaceAll("-", "")}`;
  const baselineAssetId = `episode_mix_baseline_${randomUUID().replaceAll("-", "")}`;
  const provider = context.tracks[0]!.source.provider;
  if (context.tracks.some((track) => track.source.provider !== provider) || provider !== "local") throw new EpisodeAudioMixError("This release can render Episode mix previews only when every exact source is retained locally.", 409, "EPISODE_AUDIO_MIX_PROVIDER_UNSUPPORTED");
  const proposal = newAutomaticEpisodeAudioMixProposal({
    proposalId,
    createdAt: new Date().toISOString(),
    projectId: context.project.id,
    episodeProductionId: context.episode.id,
    programFingerprintSha256: context.program.fingerprintSha256!,
    activeDecisionReceiptIds: context.program.activeDecisions.map((decision) => decision.id),
    tracks: context.tracks,
    evidenceReviews: context.reviews,
    output: {
      assetId: outputAssetId,
      provider,
      locator: buildEpisodeAudioMixTargetLocator({ episodeProductionId: context.episode.id, programFingerprintSha256: context.program.fingerprintSha256!, proposalId }),
      contentType: "audio/wav",
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      channelCount: 2,
      variantKind: "episode-mix-preview",
      masteryProfileId: "apple-podcasts-dialogue-v1",
    },
    baselineOutput: {
      assetId: baselineAssetId,
      provider,
      locator: buildEpisodeAudioMixBaselineTargetLocator({ episodeProductionId: context.episode.id, programFingerprintSha256: context.program.fingerprintSha256!, proposalId }),
      contentType: "audio/wav",
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      channelCount: 2,
      variantKind: "episode-mix-baseline",
      masteryProfileId: "apple-podcasts-dialogue-v1",
    },
  });
  const saved = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-decisions:${context.episode.id}`);
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-mix:${context.episode.id}`);
    const existing = await tx.studioAssetProcessingJob.findFirst({ where: { projectId: context.project.id, assetId: context.programClockAssetId, type: JOB_TYPE, AND: [{ inputJson: { path: ["episodeProductionId"], equals: context.episode.id } }, { inputJson: { path: ["programFingerprintSha256"], equals: context.program.fingerprintSha256 } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (existing && existing.status !== "failed") {
      try {
        const current = parseEpisodeAudioMixProposal(existing.inputJson);
        if (sameProposalInputs(current, proposal)) return existing;
      } catch { /* a malformed row cannot own the current exact mix request */ }
    }
    return tx.studioAssetProcessingJob.create({ data: { id: proposal.proposalId, projectId: context.project.id, assetId: context.programClockAssetId, type: JOB_TYPE, status: "queued", requestedByEmail: input.actorEmail.toLowerCase(), inputJson: json(proposal) } });
  }, { isolationLevel: "Serializable" });
  return publicStatus(saved);
}

export async function readEpisodeAudioMix(input: { prisma: any; projectSlug: string; episodeProductionId: string }) {
  const context = await loadEpisodeAudioActivityAnalysisContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: context.project.id, type: JOB_TYPE, AND: [{ inputJson: { path: ["episodeProductionId"], equals: context.episode.id } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return row ? publicStatus(row) : emptyStatus();
}

export async function reconcileEpisodeAudioMix(input: { prisma: any; projectSlug: string; episodeProductionId: string }) {
  const context = await loadEpisodeAudioActivityAnalysisContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: context.project.id, type: JOB_TYPE, AND: [{ inputJson: { path: ["episodeProductionId"], equals: context.episode.id } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!row || row.status !== "output-ready") return row ? publicStatus(row) : emptyStatus();
  const proposal = parseEpisodeAudioMixProposal(row.inputJson);
  if (proposal.programFingerprintSha256 !== context.program.fingerprintSha256 || JSON.stringify(proposal.activeDecisionReceiptIds) !== JSON.stringify(context.program.activeDecisions.map((decision) => decision.id).sort())) throw new EpisodeAudioMixError("The Episode or its canonical audio decisions changed before mix preview registration.", 409, "EPISODE_AUDIO_MIX_PROPOSAL_STALE");
  const result = parseEpisodeAudioMixResult(record(row.resultJson).receipt, proposal);
  const currentSources = await Promise.all(proposal.tracks.map((track) => currentBinding(input.prisma, context.project.id, track.assetId, track.sourceId)));
  if (currentSources.some((source, index) => !sameBinding(source.binding, proposal.tracks[index]!.source))) throw new EpisodeAudioMixError("An exact retained source changed before mix preview registration.", 409, "EPISODE_AUDIO_MIX_SOURCE_DRIFT");
  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const verifiedOutputs = await Promise.all([
    verifyOutput(root, result.derivative, "proposal"),
    result.baselineDerivative ? verifyOutput(root, result.baselineDerivative, "baseline") : null,
  ]);
  const updated = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-mix:${context.episode.id}`);
    const proposalRegistration = await registerVerifiedOutput(tx, { projectId: context.project.id, episodeSlug: context.episode.slug, revision: proposal.revision, kind: "proposal", path: verifiedOutputs[0]!.path, derivative: result.derivative });
    const baselineRegistration = verifiedOutputs[1] && result.baselineDerivative
      ? await registerVerifiedOutput(tx, { projectId: context.project.id, episodeSlug: context.episode.slug, revision: proposal.revision, kind: "baseline", path: verifiedOutputs[1].path, derivative: result.baselineDerivative })
      : null;
    return tx.studioAssetProcessingJob.update({ where: { id: row.id }, data: { status: "completed", completedAt: new Date(result.completedAt), error: null, resultJson: json({ state: "completed", receipt: result, registration: { playbackUrl: proposalRegistration.playbackUrl, sourceId: proposalRegistration.sourceId, outputPath: proposalRegistration.outputPath, outputAssetId: result.derivative.assetId, baselinePlaybackUrl: baselineRegistration?.playbackUrl ?? null, baselineSourceId: baselineRegistration?.sourceId ?? null, baselineOutputPath: baselineRegistration?.outputPath ?? null, baselineAssetId: result.baselineDerivative?.assetId ?? null, outputIsUnpromotedPreview: true, baselineIsImmutableComparisonOnly: true } }) } });
  }, { isolationLevel: "Serializable" });
  return publicStatus(updated);
}

export async function loadEpisodeAudioMixReviewContext(input: { prisma: any; projectSlug: string; episodeProductionId: string; jobId: string }) {
  const context = await loadEpisodeAudioActivityAnalysisContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { id: input.jobId, projectId: context.project.id, type: JOB_TYPE, status: "completed", AND: [{ inputJson: { path: ["episodeProductionId"], equals: context.episode.id } }] } });
  if (!row) throw new EpisodeAudioMixError("The completed Episode mix is unavailable or no longer belongs to this Episode.", 409, "EPISODE_AUDIO_MIX_REVIEW_JOB_NOT_FOUND");
  const proposal = parseEpisodeAudioMixProposal(row.inputJson);
  const result = parseEpisodeAudioMixResult(record(row.resultJson).receipt, proposal);
  const registration = record(record(row.resultJson).registration);
  if (!proposal.baselineOutput || !result.baselineDerivative || typeof registration.playbackUrl !== "string" || typeof registration.baselinePlaybackUrl !== "string") throw new EpisodeAudioMixError("A verified matched baseline and proposal are required before review.", 409, "EPISODE_AUDIO_MIX_AB_REQUIRED");
  const currentDecisionIds = context.program.activeDecisions.map((decision) => decision.id).sort();
  if (proposal.programFingerprintSha256 !== context.program.fingerprintSha256 || stableJson(proposal.activeDecisionReceiptIds) !== stableJson(currentDecisionIds)) throw new EpisodeAudioMixError("The canonical Episode program changed after this mix was rendered. Build and review a new proposal.", 409, "EPISODE_AUDIO_MIX_REVIEW_STALE");
  const currentSources = await Promise.all(proposal.tracks.map((track) => currentBinding(input.prisma, context.project.id, track.assetId, track.sourceId)));
  if (currentSources.some((source, index) => !sameBinding(source.binding, proposal.tracks[index]!.source))) throw new EpisodeAudioMixError("An exact retained source changed after this mix was rendered.", 409, "EPISODE_AUDIO_MIX_REVIEW_SOURCE_DRIFT");
  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  await Promise.all([verifyOutput(root, result.derivative, "proposal"), verifyOutput(root, result.baselineDerivative, "baseline")]);
  return { ...context, row, proposal, result, registration };
}

async function loadMixContext(input: { prisma: any; projectSlug: string; episodeProductionId: string }) {
  const context = await loadEpisodeAudioActivityAnalysisContext(input);
  if (!context.program.fingerprintSha256 || !context.program.summary.hasProgramClock) throw new EpisodeAudioMixError("Choose one canonical program clock before creating a mix proposal.", 409, "EPISODE_AUDIO_MIX_CLOCK_REQUIRED");
  const lanes = context.map.lanes.filter((lane) => lane.mixDisposition === "include");
  if (lanes.length === 0 || lanes.some((lane) => lane.alignment !== "program-clock" && lane.alignment !== "qualified-candidate")) throw new EpisodeAudioMixError("Every included track needs qualified shared-clock alignment before mix planning.", 409, "EPISODE_AUDIO_MIX_ALIGNMENT_REQUIRED");
  const tracks = await Promise.all(lanes.map(async (lane) => {
    const programTrack = context.program.tracks.find((track) => track.assetId === lane.assetId && track.sourceId === lane.sourceId)!;
    if (!ROLES.has(programTrack.role as EpisodeAudioMixTrack["role"])) throw new EpisodeAudioMixError(`Classify ${programTrack.title} with a canonical track role before mixing.`, 409, "EPISODE_AUDIO_MIX_ROLE_REQUIRED");
    const exact = await currentBinding(input.prisma, context.project.id, lane.assetId, lane.sourceId);
    if (exact.binding.provider !== "local") throw new EpisodeAudioMixError("Cloud Episode mix rendering is not qualified in this release.", 409, "EPISODE_AUDIO_MIX_PROVIDER_UNSUPPORTED");
    return { assetId: lane.assetId, sourceId: lane.sourceId, title: lane.title, participantId: lane.participantId, participantLabel: lane.participantLabel, role: programTrack.role as EpisodeAudioMixTrack["role"], mixDisposition: "include" as const, alignment: lane.alignment as "program-clock" | "qualified-candidate", programOffsetSeconds: lane.programOffsetSeconds!, sourceDurationSeconds: lane.sourceDurationSeconds!, alignmentEvidenceJobId: lane.alignment === "program-clock" ? null : programTrack.processing.alignment.jobId, source: exact.binding };
  }));
  if (tracks.some((track) => track.alignment === "qualified-candidate" && !track.alignmentEvidenceJobId)) throw new EpisodeAudioMixError("A qualified track is missing its immutable alignment evidence receipt.", 409, "EPISODE_AUDIO_MIX_ALIGNMENT_EVIDENCE_REQUIRED");
  const analysis = await input.prisma.studioEpisodeAudioAnalysisReceipt.findFirst({ where: { episodeProductionId: context.episode.id, programFingerprintSha256: context.program.fingerprintSha256 }, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }] });
  const reviewRows = analysis ? await input.prisma.studioEpisodeAudioReviewReceipt.findMany({ where: { episodeProductionId: context.episode.id, analysisId: analysis.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 200 }) : [];
  const latestByEvent = new Map<string, any>();
  for (const row of reviewRows) if (!latestByEvent.has(String(row.eventId))) latestByEvent.set(String(row.eventId), row);
  const reviews = [...latestByEvent.values()].map(reviewEvidence);
  const programClockAssetId = tracks.find((track) => track.alignment === "program-clock")!.assetId;
  return { ...context, tracks, reviews, programClockAssetId };
}

async function currentBinding(prisma: any, projectId: string, assetId: string, sourceId: string) {
  const [asset, source] = await Promise.all([
    prisma.studioMediaAsset.findUnique({ where: { id: assetId }, include: { assetAttachments: { where: { projectId }, select: { metadataJson: true } } } }),
    prisma.studioVideoSource.findUnique({ where: { id: sourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  const attached = asset?.assetAttachments?.some((attachment: any) => String(record(attachment.metadataJson).sourceId || "") === sourceId);
  if (!asset || asset.isProxy || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attached)) throw new EpisodeAudioMixError("Mix planning requires exact originals attached to this Nest and Episode.", 409, "EPISODE_AUDIO_MIX_SOURCE_BINDING_INVALID");
  return { asset, source, binding: { assetId, ...await inspectImmutableStudioMediaSource(source.providerSourceId, asset.mimeType || "application/octet-stream") } };
}

async function verifyOutput(root: string, derivative: { locator: string; sha256: string; generation: string; sizeBytes: number }, label: "proposal" | "baseline") {
  const outputPath = await resolveAllowedLocalStudioMediaPath(path.resolve(root, derivative.locator));
  if (!outputPath) throw new EpisodeAudioMixError(`The ${label} mix escaped the authorized local media root.`, 409, "EPISODE_AUDIO_MIX_OUTPUT_PATH_INVALID");
  const [outputStat, outputEvidence] = await Promise.all([stat(outputPath), inspectImmutableStudioMediaSource(outputPath, "audio/wav")]);
  if (!outputStat.isFile() || !sameBinding(outputEvidence, derivative)) throw new EpisodeAudioMixError(`The ${label} mix no longer matches its verified output receipt.`, 409, "EPISODE_AUDIO_MIX_OUTPUT_DRIFT");
  return { path: outputPath };
}

async function registerVerifiedOutput(tx: any, input: { projectId: string; episodeSlug: string; revision: number; kind: "proposal" | "baseline"; path: string; derivative: { assetId: string; sizeBytes: number; durationSeconds: number } }) {
  let source = await tx.studioVideoSource.findFirst({ where: { providerSourceId: input.path } });
  if (!source) source = await tx.studioVideoSource.create({ data: { provider: "local-episode-audio-mix-worker", providerSourceId: input.path, url: "/api/ingest/media/pending", title: `${input.episodeSlug} mix ${input.kind}` } });
  const playbackUrl = `/api/ingest/media/${source.id}`;
  if (source.url !== playbackUrl) source = await tx.studioVideoSource.update({ where: { id: source.id }, data: { url: playbackUrl } });
  const collision = await tx.studioMediaAsset.findUnique({ where: { id: input.derivative.assetId } });
  if (collision && collision.url !== playbackUrl) throw new EpisodeAudioMixError(`The reserved ${input.kind} mix asset id is already in use.`, 409, "EPISODE_AUDIO_MIX_ASSET_COLLISION");
  if (!collision) await tx.studioMediaAsset.create({ data: { id: input.derivative.assetId, filename: `${input.episodeSlug}-mix-${input.kind}-r${input.revision}.wav`, url: playbackUrl, mimeType: "audio/wav", sizeBytes: BigInt(input.derivative.sizeBytes), isProxy: false, cloudProvider: "local", duration: input.derivative.durationSeconds, projects: { connect: { id: input.projectId } } } });
  return { sourceId: source.id as string, playbackUrl, outputPath: input.path };
}

function reviewEvidence(row: any): EpisodeAudioMixReviewEvidence { return { receiptId: String(row.id), analysisReceiptId: String(row.analysisId), eventId: String(row.eventId), decision: String(row.decision).toLowerCase().replaceAll("_", "-") as EpisodeAudioMixReviewEvidence["decision"], startSeconds: Number(row.startSeconds), endSeconds: Number(row.endSeconds), involvedAssetIds: Array.isArray(row.involvedAssetIdsJson) ? row.involvedAssetIdsJson.map(String) : [], playbackEvidenceSha256: sha256(row.playbackEvidenceJson) }; }
function sameProposalInputs(left: EpisodeAudioMixProposal, right: EpisodeAudioMixProposal) {
  return left.programFingerprintSha256 === right.programFingerprintSha256
    && stableJson(left.activeDecisionReceiptIds) === stableJson(right.activeDecisionReceiptIds)
    && stableJson(left.tracks.map((track) => track.source)) === stableJson(right.tracks.map((track) => track.source))
    && stableJson(left.evidenceReviews) === stableJson(right.evidenceReviews)
    && Boolean(left.baselineOutput) === Boolean(right.baselineOutput);
}
function publicStatus(row: any): PublicEpisodeAudioMixStatus { let proposal: EpisodeAudioMixProposal | null = null; let result: ReturnType<typeof parseEpisodeAudioMixResult> | null = null; try { proposal = parseEpisodeAudioMixProposal(row.inputJson); } catch { /* fail closed */ } try { if (proposal) result = parseEpisodeAudioMixResult(record(row.resultJson).receipt, proposal); } catch { /* fail closed */ } const declared = ["queued", "processing", "output-ready", "completed", "failed"].includes(row.status) ? row.status as PublicEpisodeAudioMixStatus["status"] : "failed"; const invalid = !proposal || (["output-ready", "completed"].includes(declared) && !result); const registration = record(record(row.resultJson).registration); const requiredReviewSecondBins = proposal && result?.baselineDerivative ? episodeAudioMixReviewCoverage(proposal, { schema: EPISODE_AUDIO_MIX_REVIEW_EVIDENCE_SCHEMA, baselineListenedSecondBins: [], proposalListenedSecondBins: [], switches: [], completedAt: new Date(0).toISOString() }).requiredSecondBins : []; const tracks = new Map(proposal?.tracks.map((track) => [track.assetId, track]) ?? []); return { jobId: String(row.id), status: invalid ? "failed" : declared, proposalId: proposal?.proposalId ?? null, programFingerprintSha256: proposal?.programFingerprintSha256 ?? null, actionCount: proposal?.actions.length ?? 0, unresolvedCount: proposal?.unresolvedEvents.length ?? 0, actions: proposal?.actions.map((action) => ({ id: action.id, targetAssetId: action.targetAssetId, targetTitle: tracks.get(action.targetAssetId)?.title ?? action.targetAssetId, participantLabel: tracks.get(action.targetAssetId)?.participantLabel ?? null, startSeconds: action.programStartSeconds, endSeconds: action.programEndSeconds, gainDb: action.gainDb, reason: action.reason, evidenceReviewReceiptIds: action.evidenceReviewReceiptIds })) ?? [], unresolved: proposal?.unresolvedEvents.map((event) => ({ eventId: event.eventId, reason: event.reason, involvedAssetIds: event.involvedAssetIds })) ?? [], requiredReviewSecondBins, preview: result ? { assetId: result.derivative.assetId, playbackUrl: typeof registration.playbackUrl === "string" ? registration.playbackUrl : null, sha256: result.derivative.sha256, durationSeconds: result.derivative.durationSeconds, integratedLufs: result.derivative.measurement.integratedLufs, truePeakDbtp: result.derivative.measurement.truePeakDbtp, baselineAssetId: result.baselineDerivative?.assetId ?? null, baselinePlaybackUrl: typeof registration.baselinePlaybackUrl === "string" ? registration.baselinePlaybackUrl : null, baselineSha256: result.baselineDerivative?.sha256 ?? null, baselineDurationSeconds: result.baselineDerivative?.durationSeconds ?? null, baselineIntegratedLufs: result.baselineDerivative?.measurement.integratedLufs ?? null, baselineTruePeakDbtp: result.baselineDerivative?.measurement.truePeakDbtp ?? null, levelMatchedDeltaLufs: result.verification.levelMatchedDeltaLufs, outputByteRelationship: result.verification.outputByteRelationship } : null, error: invalid ? "Episode mix evidence failed integrity validation." : typeof row.error === "string" ? row.error : null, updatedAt: row.updatedAt?.toISOString?.() ?? null, boundaries: publicBoundaries() }; }
function emptyStatus(): PublicEpisodeAudioMixStatus { return { jobId: null, status: "not-queued", proposalId: null, programFingerprintSha256: null, actionCount: 0, unresolvedCount: 0, actions: [], unresolved: [], requiredReviewSecondBins: [], preview: null, error: null, updatedAt: null, boundaries: publicBoundaries() }; }
function publicBoundaries(): PublicEpisodeAudioMixStatus["boundaries"] { return { sourceTracksRemainImmutable: true, automationIsProposalNotTimelineMutation: true, previewIsUnpromoted: true, playbackApprovalRequired: true }; }
function sameBinding(left: { sha256: string; generation: string; sizeBytes: number }, right: { sha256: string; generation: string; sizeBytes: number }) { return left.sha256 === right.sha256 && left.generation === right.generation && left.sizeBytes === right.sizeBytes; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function stableJson(value: unknown): string { if (value === null || value === undefined) return "null"; if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (typeof value === "object") { const row = value as Record<string, unknown>; return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`; } return JSON.stringify(value); }
function sha256(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
