import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  EPISODE_AUDIO_MIX_CONTRACT_VERSION,
  EPISODE_AUDIO_MIX_RESULT_KIND,
  assessAudioMastery,
  newAudioMasteryProposal,
  parseEpisodeAudioMixProposal,
  parseEpisodeAudioMixResult,
  type AudioMasteryMeasurement,
  type AudioMasterySourceBinding,
  type EpisodeAudioMixOutput,
  type EpisodeAudioMixProposal,
  type EpisodeAudioMixResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { FfmpegAudioMasteringEngine } from "./audio-mastering-ffmpeg.js";
import { EpisodeAudioMixRenderError, FfmpegEpisodeAudioMixRenderer } from "./episode-audio-mix-ffmpeg.js";
import { ProxyTranscodeError, sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "episode-audio-mix";

export type LocalEpisodeAudioMixClaim = { id: string; inputJson: unknown; attempt: number; executionId: string };
export interface LocalEpisodeAudioMixStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalEpisodeAudioMixClaim | null>;
  complete(input: { claim: LocalEpisodeAudioMixClaim; receipt: EpisodeAudioMixResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalEpisodeAudioMixClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalEpisodeAudioMixClaim; code: string; message: string; now: Date }): Promise<boolean>;
}
export interface LocalEpisodeAudioMixRenderer {
  renderUnmasteredPreview: FfmpegEpisodeAudioMixRenderer["renderUnmasteredPreview"];
  encodePcm24: FfmpegEpisodeAudioMixRenderer["encodePcm24"];
}
export interface LocalEpisodeAudioMixMasteringEngine {
  measure(inputPath: string, input: { source: AudioMasterySourceBinding; profileId: EpisodeAudioMixProposal["output"]["masteryProfileId"]; measurementId?: string; measuredAt?: string }): Promise<AudioMasteryMeasurement>;
  renderLoudnessMaster(inputPath: string, outputPath: string, input: { proposal: ReturnType<typeof newAudioMasteryProposal>; measurement: AudioMasteryMeasurement }): Promise<unknown>;
}
export type LocalEpisodeAudioMixWorkerOptions = { executionId: string; buildId: string; imageDigest: string | null; leaseMs: number; localMediaRoot: string; now: () => Date };
export type LocalEpisodeAudioMixWorkerResult = { disposition: "idle" } | { disposition: "completed" | "claim-lost" | "retry" | "failed"; jobId: string; code?: string; previewSha256?: string };

class TerminalEpisodeAudioMixError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "TerminalEpisodeAudioMixError"; } }

export async function runOneLocalEpisodeAudioMixJob(store: LocalEpisodeAudioMixStore, renderer: LocalEpisodeAudioMixRenderer, mastery: LocalEpisodeAudioMixMasteringEngine, options: LocalEpisodeAudioMixWorkerOptions): Promise<LocalEpisodeAudioMixWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let proposal: EpisodeAudioMixProposal;
  try { proposal = parseEpisodeAudioMixProposal(claim.inputJson); }
  catch (error) { await store.fail({ claim, code: "episode-mix-proposal-invalid", message: message(error), now: options.now() }); return { disposition: "failed", jobId: claim.id, code: "episode-mix-proposal-invalid" }; }
  if (proposal.output.provider !== "local" || proposal.tracks.some((track) => track.source.provider !== "local")) {
    await store.fail({ claim, code: "episode-mix-provider-unsupported", message: "The local Episode mix worker accepts local retained sources and targets only.", now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "episode-mix-provider-unsupported" };
  }
  let workRoot = "";
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const sourcePaths = new Map<string, string>();
    for (const track of proposal.tracks) sourcePaths.set(track.assetId, await authorizedPath(root, track.source.locator, "source"));
    const outputPath = await authorizedTarget(root, proposal.output.locator);
    const baselineOutputPath = proposal.baselineOutput ? await authorizedTarget(root, proposal.baselineOutput.locator) : null;
    await Promise.all([rm(outputPath, { force: true }), baselineOutputPath ? rm(baselineOutputPath, { force: true }) : Promise.resolve()]);
    workRoot = await mkdtemp(path.join(tmpdir(), `quipsly-episode-mix-${claim.id}-`));
    const proposed = await renderMasteredVariant({ renderer, mastery, proposal, renderProposal: proposal, output: proposal.output, outputPath, unmasteredPath: path.join(workRoot, "proposal-unmastered.wav"), sourcePaths, now: options.now });
    const baseline = proposal.baselineOutput && baselineOutputPath
      ? await renderMasteredVariant({ renderer, mastery, proposal, renderProposal: { ...proposal, actions: [] }, output: proposal.baselineOutput, outputPath: baselineOutputPath, unmasteredPath: path.join(workRoot, "baseline-unmastered.wav"), sourcePaths, now: options.now })
      : null;
    const levelMatchedDeltaLufs = baseline ? Math.round(Math.abs(proposed.derivative.measurement.integratedLufs - baseline.derivative.measurement.integratedLufs) * 1_000_000) / 1_000_000 : null;
    if (levelMatchedDeltaLufs !== null && levelMatchedDeltaLufs > 0.2) throw new TerminalEpisodeAudioMixError("episode-mix-comparison-not-level-matched", "The baseline and proposed mix are not close enough in integrated loudness for an honest A/B comparison.");
    const outputByteRelationship = baseline ? baseline.derivative.sha256 === proposed.derivative.sha256 && baseline.derivative.sizeBytes === proposed.derivative.sizeBytes ? "bit-identical" as const : "different" as const : null;
    if (baseline && (proposal.actions.length === 0 ? outputByteRelationship !== "bit-identical" : outputByteRelationship !== "different")) throw new TerminalEpisodeAudioMixError("episode-mix-output-relationship-invalid", proposal.actions.length === 0 ? "The no-op proposal did not remain bit-identical to its baseline." : "The declared gain automation did not change the proposed output bytes.");
    const receipt = parseEpisodeAudioMixResult({
      kind: EPISODE_AUDIO_MIX_RESULT_KIND,
      version: EPISODE_AUDIO_MIX_CONTRACT_VERSION,
      jobId: claim.id,
      completedAt: options.now().toISOString(),
      proposal,
      derivative: proposed.derivative,
      baselineDerivative: baseline?.derivative ?? null,
      verification: { exactSourcesVerifiedBeforeAndAfter: true, outputCompletelyDecoded: true, durationDeltaSeconds: proposed.durationDeltaSeconds, integratedLoudnessPasses: true, truePeakPasses: true, originalTracksRemainSourceTruth: true, baselineOutputCompletelyDecoded: baseline ? true : null, baselineDurationDeltaSeconds: baseline?.durationDeltaSeconds ?? null, levelMatchedDeltaLufs, levelMatchedWithinPointTwoLu: baseline ? true : null, outputByteRelationship, outputRelationshipMatchesProposal: baseline ? true : null },
      renderer: { ffmpegVersion: proposed.ffmpegVersion, executionId: claim.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: claim.attempt },
      boundaries: { outputIsUnpromotedPreview: true, proposalAndSourcesRemainImmutable: true, playbackReviewRequiredBeforePromotion: true },
    }, proposal);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed ? { disposition: "completed", jobId: claim.id, previewSha256: receipt.derivative.sha256 } : { disposition: "claim-lost", jobId: claim.id };
  } catch (error) {
    const terminal = error instanceof TerminalEpisodeAudioMixError || (error instanceof EpisodeAudioMixRenderError && !error.retryable) || (error instanceof ProxyTranscodeError && !error.retryable);
    const code = error instanceof TerminalEpisodeAudioMixError || error instanceof EpisodeAudioMixRenderError || error instanceof ProxyTranscodeError ? error.code : "episode-mix-worker-retry";
    await (terminal ? store.fail.bind(store) : store.retry.bind(store))({ claim, code, message: message(error), now: options.now() });
    return { disposition: terminal ? "failed" : "retry", jobId: claim.id, code };
  } finally {
    if (workRoot) await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function renderMasteredVariant(input: { renderer: LocalEpisodeAudioMixRenderer; mastery: LocalEpisodeAudioMixMasteringEngine; proposal: EpisodeAudioMixProposal; renderProposal: EpisodeAudioMixProposal | unknown; output: EpisodeAudioMixOutput; outputPath: string; unmasteredPath: string; sourcePaths: ReadonlyMap<string, string>; now: () => Date }) {
  const raw = await input.renderer.renderUnmasteredPreview({ proposal: input.renderProposal, sourcePathsByAssetId: input.sourcePaths, outputPath: input.unmasteredPath });
  const rawSource = await bindingFor(input.output.assetId, input.unmasteredPath, "audio/wav");
  const sourceMeasurement = await input.mastery.measure(input.unmasteredPath, { source: rawSource, profileId: input.output.masteryProfileId, measurementId: `mix_measure_source_${randomUUID().replaceAll("-", "")}`, measuredAt: input.now().toISOString() });
  const masteringProposal = newAudioMasteryProposal({ proposalId: `mix_master_${randomUUID().replaceAll("-", "")}`, createdAt: input.now().toISOString(), measurement: sourceMeasurement, profileId: input.output.masteryProfileId });
  if (masteringProposal.action === "render-loudness-master") await input.mastery.renderLoudnessMaster(input.unmasteredPath, input.outputPath, { proposal: masteringProposal, measurement: sourceMeasurement });
  else await input.renderer.encodePcm24(input.unmasteredPath, input.outputPath);
  const outputSource = await bindingFor(input.output.assetId, input.outputPath, "audio/wav", input.output.locator);
  const outputMeasurement = await input.mastery.measure(input.outputPath, { source: outputSource, profileId: input.output.masteryProfileId, measurementId: `mix_measure_output_${randomUUID().replaceAll("-", "")}`, measuredAt: input.now().toISOString() });
  if (!assessAudioMastery(outputMeasurement, input.output.masteryProfileId).passes) throw new TerminalEpisodeAudioMixError("episode-mix-mastery-verification-failed", `The rendered ${input.output.variantKind} failed independent loudness or true-peak verification.`);
  const expectedDurationSeconds = Math.max(...input.proposal.tracks.map((track) => Math.max(0, track.programOffsetSeconds) + Math.max(0, track.sourceDurationSeconds + Math.min(0, track.programOffsetSeconds))));
  const durationDeltaSeconds = Math.round(Math.abs(expectedDurationSeconds - outputMeasurement.durationSeconds) * 1_000_000) / 1_000_000;
  return { ffmpegVersion: raw.ffmpegVersion, durationDeltaSeconds, derivative: { ...outputSource, variantKind: input.output.variantKind, codec: "pcm_s24le" as const, sampleRateHz: 48_000 as const, channelCount: 2 as const, durationSeconds: outputMeasurement.durationSeconds, measurement: outputMeasurement } };
}

export class PostgresLocalEpisodeAudioMixStore implements LocalEpisodeAudioMixStore {
  constructor(private readonly pool: InstanceType<typeof Pool>) {}
  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({ text: `SELECT "id", "inputJson", "resultJson" FROM "StudioAssetProcessingJob" WHERE "type" = $1 AND "inputJson"->'output'->>'provider' = 'local' AND ("status" = 'queued' OR ("status" = 'processing' AND "updatedAt" < $2)) ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`, values: [JOB_TYPE, new Date(input.now.getTime() - input.leaseMs)] });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const attempt = Math.max(0, Number(record(record(row.resultJson).lease).attempt) || 0) + 1;
      const updated = await client.query({ text: `UPDATE "StudioAssetProcessingJob" SET "status" = 'processing', "startedAt" = COALESCE("startedAt", $2), "updatedAt" = $2, "error" = NULL, "resultJson" = $3::jsonb WHERE "id" = $1 RETURNING "id", "inputJson"`, values: [row.id, input.now, JSON.stringify({ state: "processing", lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() }, originalSourcesRemainTruth: true })] });
      await client.query("COMMIT");
      return { id: updated.rows[0].id, inputJson: updated.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  async complete(input: { claim: LocalEpisodeAudioMixClaim; receipt: EpisodeAudioMixResult; now: Date }) { const result = await this.pool.query({ text: `UPDATE "StudioAssetProcessingJob" SET "status" = 'output-ready', "updatedAt" = $3, "completedAt" = NULL, "error" = NULL, "resultJson" = $4::jsonb WHERE "id" = $1 AND "status" = 'processing' AND "resultJson"->'lease'->>'executionId' = $2`, values: [input.claim.id, input.claim.executionId, input.now, JSON.stringify({ state: "output-ready", receipt: input.receipt })] }); return result.rowCount === 1; }
  retry(input: { claim: LocalEpisodeAudioMixClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalEpisodeAudioMixClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }
  private async release(input: { claim: LocalEpisodeAudioMixClaim; code: string; message: string; now: Date }, status: "queued" | "failed") { const result = await this.pool.query({ text: `UPDATE "StudioAssetProcessingJob" SET "status" = $3::text, "updatedAt" = $4::timestamp(3), "completedAt" = CASE WHEN $3::text = 'failed' THEN $4::timestamp(3) ELSE NULL::timestamp END, "error" = $5, "resultJson" = $6::jsonb WHERE "id" = $1 AND "status" = 'processing' AND "resultJson"->'lease'->>'executionId' = $2`, values: [input.claim.id, input.claim.executionId, status, input.now, `${input.code}: ${input.message}`.slice(0, 4_000), JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt }, originalSourcesRemainTruth: true })] }); return result.rowCount === 1; }
}

export function newLocalEpisodeAudioMixRuntime(input: { pool: InstanceType<typeof Pool>; localMediaRoot: string; leaseMs: number; buildId: string }) { return { store: new PostgresLocalEpisodeAudioMixStore(input.pool), renderer: new FfmpegEpisodeAudioMixRenderer(), mastery: new FfmpegAudioMasteringEngine(), options: { executionId: randomUUID(), buildId: input.buildId, imageDigest: null, leaseMs: input.leaseMs, localMediaRoot: input.localMediaRoot, now: () => new Date() } satisfies LocalEpisodeAudioMixWorkerOptions }; }

async function authorizedRoot(configuredRoot: string) { const temporaryRoot = await realpath(tmpdir()); const resolved = path.resolve(configuredRoot); await mkdir(resolved, { recursive: true, mode: 0o700 }); const root = await realpath(resolved); if (root === temporaryRoot || !inside(temporaryRoot, root)) throw new TerminalEpisodeAudioMixError("episode-mix-root-rejected", "Local mix root must be a dedicated directory below the operating-system temporary directory."); return root; }
async function authorizedPath(root: string, locator: string, kind: "source" | "target") { const resolved = kind === "source" ? await realpath(locator).catch(() => "") : path.resolve(locator); if (!resolved || !inside(root, resolved)) throw new TerminalEpisodeAudioMixError(`episode-mix-${kind}-path-rejected`, `The local mix ${kind} escaped the authorized media root.`); return resolved; }
async function authorizedTarget(root: string, locator: string) { const requested = path.isAbsolute(locator) ? path.resolve(locator) : path.resolve(root, locator); if (!requested.endsWith(".wav")) throw new TerminalEpisodeAudioMixError("episode-mix-target-path-rejected", "The local mix target must be a WAV below the authorized media root."); await mkdir(path.dirname(requested), { recursive: true, mode: 0o700 }); const target = path.join(await realpath(path.dirname(requested)), path.basename(requested)); if (!inside(root, target)) throw new TerminalEpisodeAudioMixError("episode-mix-target-path-rejected", "The local mix target escaped the authorized media root."); return target; }
async function bindingFor(assetId: string, localPath: string, contentType: string, locator = localPath): Promise<AudioMasterySourceBinding> { const file = await stat(localPath); const sha256 = await sha256File(localPath); return { assetId, provider: "local", locator, generation: `sha256:${sha256}`, sha256, sizeBytes: file.size, contentType }; }
function inside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : String(error); }
