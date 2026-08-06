import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION,
  STUDIO_SOURCE_TRANSCRIPT_PROCESSING_TYPES,
  STUDIO_SOURCE_TRANSCRIPT_RESULT_KIND,
  parseStudioSourceTranscriptJob,
  parseStudioSourceTranscriptResult,
  type StudioSourceTranscriptJob,
  type StudioSourceTranscriptResult,
  type StudioSourceTranscriptSegment,
  type StudioSourceTranscriptWord,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { sha256File } from "./transcoder.js";

const { Pool } = pg;

export type LocalStudioTranscriptClaim = { id: string; inputJson: unknown; attempt: number; executionId: string };

export interface LocalStudioTranscriptStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalStudioTranscriptClaim | null>;
  complete(input: { claim: LocalStudioTranscriptClaim; receipt: StudioSourceTranscriptResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalStudioTranscriptClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalStudioTranscriptClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export type LocalStudioTranscriptProviderResult = {
  raw: Buffer;
  language: string | null;
  segments: StudioSourceTranscriptSegment[];
  words: StudioSourceTranscriptWord[];
};

export interface LocalStudioTranscriber {
  transcribe(input: { sourcePath: string; model: string; language: string | null; terminologyPrompt: string | null }): Promise<LocalStudioTranscriptProviderResult>;
}

export type LocalStudioTranscriptWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  evidenceRoot: string;
  now: () => Date;
};

export type LocalStudioTranscriptWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; segmentCount: number; wordCount: number }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalStudioTranscriptError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = "TerminalStudioTranscriptError"; }
}

export async function runOneLocalStudioTranscriptJob(
  store: LocalStudioTranscriptStore,
  transcriber: LocalStudioTranscriber,
  options: LocalStudioTranscriptWorkerOptions,
): Promise<LocalStudioTranscriptWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: StudioSourceTranscriptJob;
  try {
    job = parseStudioSourceTranscriptJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({ claim, code: "studio-transcript-job-invalid", message: errorMessage(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "studio-transcript-job-invalid" };
  }
  if (job.source.provider !== "local") {
    await store.fail({ claim, code: "studio-transcript-provider-unsupported", message: "The local transcript worker accepts local media only.", now: options.now() });
    return { disposition: "failed", jobId: job.jobId, code: "studio-transcript-provider-unsupported" };
  }
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const sourcePath = await authorizedSource(root, job.source.locator);
    const before = await inspectSource(sourcePath);
    assertSource(job, before);
    const providerResult = await transcriber.transcribe({
      sourcePath,
      model: job.provider.model,
      language: job.provider.language,
      terminologyPrompt: job.terminology?.providerInput.promptText || null,
    });
    if (!providerResult.segments.length || !providerResult.words.length) {
      throw new TerminalStudioTranscriptError("studio-transcript-empty", "Whisper returned no usable timed transcript words.");
    }
    const after = await inspectSource(sourcePath);
    assertSource(job, after);
    if (before.sha256 !== after.sha256 || before.sizeBytes !== after.sizeBytes) {
      throw new TerminalStudioTranscriptError("studio-transcript-source-drift", "The immutable source changed during transcription.");
    }
    const evidence = await retainRawEvidence(options.evidenceRoot, job.jobId, providerResult.raw);
    const firstSegment = providerResult.segments[0];
    const lastSegment = providerResult.segments.at(-1)!;
    const receipt = parseStudioSourceTranscriptResult({
      kind: STUDIO_SOURCE_TRANSCRIPT_RESULT_KIND,
      version: STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION,
      jobId: job.jobId,
      transcriptJobId: job.transcriptJobId,
      completedAt: options.now().toISOString(),
      source: job.source,
      language: providerResult.language,
      provider: {
        name: "openai-whisper-local",
        model: job.provider.model,
        rawEvidenceSha256: evidence.sha256,
        rawEvidenceSizeBytes: evidence.sizeBytes,
        rawEvidenceLocator: evidence.locator,
        terminology: job.terminology ? {
          snapshotSha256: job.terminology.termsSha256,
          promptSha256: job.terminology.providerInput.promptSha256,
          termCount: job.terminology.providerInput.includedTermIds.length,
          promptCharacterCount: job.terminology.providerInput.promptText.length,
          mode: job.terminology.providerInput.mode,
        } : null,
        capabilities: {
          segmentTiming: "provider",
          wordTiming: "provider",
          wordConfidence: "provider",
          segmentConfidence: "unavailable",
          speakerDiarization: "unavailable",
          alternatives: "unavailable",
        },
      },
      segments: providerResult.segments,
      words: providerResult.words,
      coverage: {
        segmentCount: providerResult.segments.length,
        wordCount: providerResult.words.length,
        timedWordCount: providerResult.words.length,
        confidenceWordCount: providerResult.words.filter((word) => word.confidence != null).length,
        speakerLabeledWordCount: 0,
        transcriptStartSeconds: firstSegment.startSeconds,
        transcriptEndSeconds: lastSegment.endSeconds,
      },
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: claim.attempt,
      },
      boundaries: {
        ...job.boundaries,
        completeSourceRead: true,
        providerEvidenceRetained: true,
      },
    }, job);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed
      ? { disposition: "completed", jobId: job.jobId, segmentCount: receipt.segments.length, wordCount: receipt.words.length }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    const terminal = error instanceof TerminalStudioTranscriptError;
    const code = terminal ? error.code : "studio-transcript-worker-retry";
    const operation = terminal ? store.fail.bind(store) : store.retry.bind(store);
    await operation({ claim, code, message: errorMessage(error), now: options.now() });
    return { disposition: terminal ? "failed" : "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalStudioTranscriptStore implements LocalStudioTranscriptStore {
  private readonly pool: InstanceType<typeof Pool>;
  constructor(pool: InstanceType<typeof Pool>) { this.pool = pool; }

  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({
        text: `
          SELECT "id", "inputJson", "resultJson"
          FROM "StudioAssetProcessingJob"
          WHERE "type" = ANY($1::text[])
            AND "inputJson"->'source'->>'provider' = 'local'
            AND ("status" = 'queued' OR ("status" = 'processing' AND "updatedAt" < $2))
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        values: [[...STUDIO_SOURCE_TRANSCRIPT_PROCESSING_TYPES], new Date(input.now.getTime() - input.leaseMs)],
      });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const previousLease = record(record(row.resultJson).lease);
      const attempt = Math.max(0, Number(previousLease.attempt) || 0) + 1;
      const updated = await client.query({
        text: `
          UPDATE "StudioAssetProcessingJob"
          SET "status" = 'processing', "startedAt" = COALESCE("startedAt", $2),
              "updatedAt" = $2, "error" = NULL, "resultJson" = $3::jsonb
          WHERE "id" = $1
          RETURNING "id", "inputJson"
        `,
        values: [row.id, input.now, JSON.stringify({
          state: "processing",
          lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() },
          originalRemainsSourceTruth: true,
        })],
      });
      await client.query("COMMIT");
      return { id: updated.rows[0].id, inputJson: updated.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async complete(input: { claim: LocalStudioTranscriptClaim; receipt: StudioSourceTranscriptResult; now: Date }) {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioAssetProcessingJob"
        SET "status" = 'output-ready', "updatedAt" = $3, "completedAt" = NULL,
            "error" = NULL, "resultJson" = $4::jsonb
        WHERE "id" = $1 AND "status" = 'processing'
          AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [input.claim.id, input.claim.executionId, input.now, JSON.stringify({ state: "output-ready", receipt: input.receipt })],
    });
    return result.rowCount === 1;
  }

  retry(input: { claim: LocalStudioTranscriptClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalStudioTranscriptClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }

  private async release(input: { claim: LocalStudioTranscriptClaim; code: string; message: string; now: Date }, status: "queued" | "failed") {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioAssetProcessingJob"
        SET "status" = $3::text, "updatedAt" = $4::timestamp(3),
            "completedAt" = CASE WHEN $3::text = 'failed' THEN $4::timestamp(3) ELSE NULL END,
            "error" = $5, "resultJson" = $6::jsonb
        WHERE "id" = $1 AND "status" = 'processing'
          AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [
        input.claim.id,
        input.claim.executionId,
        status,
        input.now,
        `${input.code}: ${input.message}`.slice(0, 4_000),
        JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt }, originalRemainsSourceTruth: true }),
      ],
    });
    return result.rowCount === 1;
  }
}

export class WhisperCliStudioTranscriber implements LocalStudioTranscriber {
  private readonly executable: string;
  private readonly device: string;
  constructor(executable: string, device: string) { this.executable = executable; this.device = device; }

  async transcribe(input: { sourcePath: string; model: string; language: string | null; terminologyPrompt: string | null }) {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "quipsly-studio-whisper-"));
    const outputPath = path.join(outputDirectory, `${path.basename(input.sourcePath, path.extname(input.sourcePath))}.json`);
    try {
      const args = buildWhisperCliArguments({ ...input, device: this.device, outputDirectory });
      const stderr = await runProcess(this.executable, args);
      const raw = await readFile(outputPath).catch(() => { throw new Error(`Whisper produced no JSON output: ${stderr.slice(-800)}`); });
      return normalizeWhisperJson(raw);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }
}

export function buildWhisperCliArguments(input: {
  sourcePath: string;
  model: string;
  language: string | null;
  terminologyPrompt: string | null;
  device: string;
  outputDirectory: string;
}) {
  const args = [
    input.sourcePath,
    "--model", input.model,
    "--device", input.device,
    "--output_dir", input.outputDirectory,
    "--output_format", "json",
    "--verbose", "False",
    "--word_timestamps", "True",
    "--condition_on_previous_text", "False",
    "--fp16", input.device === "cpu" ? "False" : "True",
  ];
  if (input.language) args.push("--language", input.language);
  if (input.terminologyPrompt) args.push("--initial_prompt", input.terminologyPrompt);
  return args;
}

export function normalizeWhisperJson(raw: Buffer): LocalStudioTranscriptProviderResult {
  const root = record(JSON.parse(raw.toString("utf8")));
  const providerSegments = Array.isArray(root.segments) ? root.segments : [];
  const segments: StudioSourceTranscriptSegment[] = [];
  const words: StudioSourceTranscriptWord[] = [];
  for (const [providerIndex, value] of providerSegments.entries()) {
    const row = record(value);
    const startSeconds = number(row.start);
    const endSeconds = number(row.end);
    const text = string(row.text);
    if (startSeconds == null || endSeconds == null || endSeconds < startSeconds || !text) continue;
    const wordStartIndex = words.length;
    const providerWords = Array.isArray(row.words) ? row.words : [];
    for (const providerWord of providerWords) {
      const wordRow = record(providerWord);
      const wordStart = number(wordRow.start);
      const wordEnd = number(wordRow.end);
      const punctuatedWord = string(wordRow.word);
      if (wordStart == null || wordEnd == null || wordEnd < wordStart || !punctuatedWord) continue;
      const lexicalWord = punctuatedWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’]+$/gu, "") || punctuatedWord;
      const probability = number(wordRow.probability);
      words.push({
        index: words.length,
        segmentOrdinal: segments.length,
        startSeconds: wordStart,
        endSeconds: wordEnd,
        word: lexicalWord,
        punctuatedWord,
        confidence: probability == null ? null : Math.max(0, Math.min(1, probability)),
        speakerLabel: null,
      });
    }
    if (words.length === wordStartIndex) continue;
    const segmentWords = words.slice(wordStartIndex);
    const normalizedStartSeconds = Math.min(startSeconds, ...segmentWords.map((word) => word.startSeconds));
    const normalizedEndSeconds = Math.max(endSeconds, ...segmentWords.map((word) => word.endSeconds));
    segments.push({
      ordinal: segments.length,
      // Whisper occasionally emits a word a few frames outside its enclosing
      // segment. Expand the segment to the provider word envelope rather than
      // clipping or inventing word time; the raw response remains retained.
      startSeconds: normalizedStartSeconds,
      endSeconds: normalizedEndSeconds,
      text,
      confidence: null,
      speakerLabel: null,
      wordStartIndex,
      wordEndIndexExclusive: words.length,
    });
  }
  if (!segments.length || !words.length) throw new TerminalStudioTranscriptError("studio-transcript-empty", "Whisper returned no usable timed words.");
  return { raw, language: string(root.language) || null, segments, words };
}

export function newLocalStudioTranscriptRuntime(input: {
  pool: InstanceType<typeof Pool>;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
  executable: string;
  device: string;
}) {
  return {
    store: new PostgresLocalStudioTranscriptStore(input.pool),
    transcriber: new WhisperCliStudioTranscriber(input.executable, input.device),
    options: {
      executionId: randomUUID(),
      buildId: input.buildId,
      imageDigest: null,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      evidenceRoot: path.join(input.localMediaRoot, "transcripts", "studio"),
      now: () => new Date(),
    } satisfies LocalStudioTranscriptWorkerOptions,
  };
}

async function authorizedRoot(configuredRoot: string) {
  const temporaryRoot = await realpath(tmpdir());
  await mkdir(path.resolve(configuredRoot), { recursive: true, mode: 0o700 });
  const root = await realpath(path.resolve(configuredRoot));
  if (root === temporaryRoot || !pathIsInside(temporaryRoot, root)) throw new TerminalStudioTranscriptError("studio-transcript-root-rejected", "Local transcript root must be a dedicated directory below the operating-system temporary directory.");
  return root;
}
async function authorizedSource(root: string, locator: string) {
  const source = await realpath(locator).catch(() => "");
  if (!source || !pathIsInside(root, source)) throw new TerminalStudioTranscriptError("studio-transcript-source-path-rejected", "Local transcript source escaped the authorized media root.");
  return source;
}
async function inspectSource(sourcePath: string) {
  const source = await stat(sourcePath);
  if (!source.isFile() || source.size <= 0) throw new TerminalStudioTranscriptError("studio-transcript-source-unavailable", "Local transcript source is empty or unavailable.");
  return { sizeBytes: source.size, sha256: await sha256File(sourcePath) };
}
function assertSource(job: StudioSourceTranscriptJob, evidence: { sizeBytes: number; sha256: string }) {
  if (evidence.sizeBytes !== job.source.sizeBytes || evidence.sha256 !== job.source.sha256 || job.source.generation !== `sha256:${evidence.sha256}`) {
    throw new TerminalStudioTranscriptError("studio-transcript-source-byte-mismatch", "Local source no longer matches the queued immutable byte receipt.");
  }
}
async function retainRawEvidence(root: string, jobId: string, raw: Buffer) {
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const directory = path.join(root, jobId);
  const locator = path.join(directory, `provider-${sha256}.json`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { await writeFile(locator, raw, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (record(error).code !== "EEXIST") throw error;
    const current = await readFile(locator);
    if (createHash("sha256").update(current).digest("hex") !== sha256 || current.length !== raw.length) {
      throw new TerminalStudioTranscriptError("studio-transcript-evidence-conflict", "Existing provider evidence does not match the completed provider response.");
    }
  }
  return { sha256, sizeBytes: raw.length, locator };
}
async function runProcess(executable: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    let stderr = "";
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16_000); });
    child.on("error", reject);
    child.on("exit", (code, signal) => code === 0 ? resolve(stderr) : reject(new Error(`Whisper exited ${code ?? signal}: ${stderr.slice(-1_200)}`)));
  });
}
function pathIsInside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function errorMessage(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Local Studio transcription failed."; }
