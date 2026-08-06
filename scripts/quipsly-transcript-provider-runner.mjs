#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  DEEPGRAM_TRANSCRIPT_MODEL,
  LOCAL_WHISPER_EVALUATION_ADAPTER_VERSION,
  LOCAL_WHISPER_TRANSCRIPT_PROVIDER,
  OPENAI_DIARIZED_TRANSCRIPT_MODEL,
  QUIPSLY_TRANSCRIPT_PROVIDER_ADAPTER_VERSION,
  deepgramEvaluationRequestConfig,
  localWhisperEvaluationRequestConfig,
  normalizeDeepgramEvaluationWords,
  normalizeLocalWhisperEvaluationWords,
  normalizeOpenAIDiarizedEvaluationWords,
  openAIDiarizedEvaluationRequestConfig,
} from "../packages/quipsly-media-processing/src/transcript-provider-adapters.ts";

const options = parseArguments(process.argv.slice(2));
const execFileAsync = promisify(execFile);
const policy = JSON.parse(await readFile(resolve(options.policy), "utf8"));
validatePolicy(policy);
const bearerToken = requiredEnvironment("QUIPSLY_BEARER_TOKEN");
const baseUrl = new URL(options.baseUrl).origin;
const runnerInput = options.input
  ? JSON.parse(await readFile(resolve(options.input), "utf8"))
  : await fetchJson(`${baseUrl}/api/transcript-evaluation?roomId=${encodeURIComponent(options.roomId)}&view=runner-input`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
validateRunnerInput(runnerInput, options.roomId || null);

const requestConfig = options.provider === "deepgram"
  ? deepgramEvaluationRequestConfig({ modelVersion: options.deepgramModelVersion, language: options.language })
  : options.provider === "openai"
    ? openAIDiarizedEvaluationRequestConfig({ language: options.language })
    : localWhisperEvaluationRequestConfig({
        model: options.whisperModel,
        language: options.language,
        device: options.whisperDevice,
      });
const evidenceDirectory = options.dryRun ? null : resolve(options.evidenceDir);
if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });

const selectedWindows = runnerInput.windows.slice(0, options.limit || runnerInput.windows.length);
const results = [];
for (const window of selectedWindows) {
  const arms = experimentArms(options, window);
  const existingReceipts = new Map();
  for (const arm of arms) {
    const receiptPath = evidenceDirectory
      ? resolve(evidenceDirectory, receiptFileName(options.runKey, window.windowId, arm.name))
      : null;
    const receipt = receiptPath
      ? await readExistingReceipt(receiptPath, window, options, arm)
      : null;
    existingReceipts.set(arm.name, { receiptPath, receipt });
  }
  const needsSource = options.dryRun || [...existingReceipts.values()].some((value) => !value.receipt);
  const originalSource = needsSource ? await downloadVerifiedSource(baseUrl, bearerToken, window) : null;
  const source = originalSource ? await createDeterministicEvaluationDerivative(originalSource, window) : null;
  if (options.dryRun) {
    results.push({
      windowId: window.windowId,
      sourceSha256: window.source.sha256,
      sourceBytes: originalSource.bytes.byteLength,
      derivativeSha256: source.derivative.sha256,
      derivativeBytes: source.bytes.byteLength,
      derivativeDurationSeconds: source.derivative.durationSeconds,
      arms: arms.map((arm) => arm.name),
      outcome: "validated-only",
    });
    continue;
  }
  for (const arm of arms) {
    const stored = existingReceipts.get(arm.name);
    let receipt = stored.receipt;
    if (!receipt) {
      receipt = await invokeProvider({
        options,
        requestConfig: requestConfigForArm(requestConfig, window, arm),
        policy,
        window,
        source,
        arm,
      });
      await writeFile(stored.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    }
    const armRunKey = runKeyForArm(options.runKey, arm.name);
    const appendResult = await fetchJson(`${baseUrl}/api/transcript-evaluation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        operation: "append-candidate",
        windowId: window.windowId,
        clientRequestId: stableRequestId(armRunKey, window.windowId),
        runKey: armRunKey,
        requestConfig: receipt.requestConfig,
        rawResponse: receipt.rawResponse,
        policy: receipt.policy,
        candidate: receipt.candidate,
      }),
    });
    results.push({
      windowId: window.windowId,
      arm: arm.name,
      comparisonKey: receipt.requestConfig.terminologyExperiment?.comparisonKey ?? null,
      sourceSha256: window.source.sha256,
      derivativeSha256: receipt.sourceDerivative.sha256,
      outcome: receipt.candidate.outcome,
      candidateId: appendResult.candidate?.id ?? null,
      idempotentReplay: appendResult.idempotentReplay === true,
      rawResponseSha256: sha256Json(receipt.rawResponse),
      elapsedMilliseconds: receipt.candidate.elapsedMilliseconds,
    });
  }
}
const summary = {
  kind: "quipsly-transcript-provider-run-summary-v1",
  version: 1,
  roomId: runnerInput.roomId,
  corpusRevisionSha256: runnerInput.corpusRevisionSha256,
  provider: options.provider,
  runKey: options.runKey,
  experiment: options.terminologyExperiment ? "terminology" : null,
  requestConfig,
  dryRun: options.dryRun,
  windowCount: results.length,
  results,
  privacy: "Provider keys, transcript text, raw provider output, policy URLs, and reviewer identities are excluded. Raw evidence is stored only in the protected evidence directory and Nest private ledger.",
};
if (options.output) {
  await writeFile(resolve(options.output), `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.stdout.write(`${resolve(options.output)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function invokeProvider({ options, requestConfig, policy, window, source, arm }) {
  const startedAt = Date.now();
  let rawResponse;
  let providerRequestId = null;
  try {
    if (options.provider === "deepgram") {
      const apiKey = requiredEnvironment("DEEPGRAM_API_KEY");
      const url = new URL(requestConfig.endpoint);
      for (const [key, value] of Object.entries(requestConfig)) {
        if (key === "endpoint" || key === "terminology") continue;
        url.searchParams.set(key, String(value));
      }
      for (const keyterm of requestConfig.terminology?.nativeKeyterms ?? []) {
        url.searchParams.append("keyterm", keyterm);
      }
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "content-type": source.contentType,
        },
        body: source.bytes,
      });
      providerRequestId = response.headers.get("x-request-id") || response.headers.get("dg-request-id");
      rawResponse = await providerBody(response, "deepgram");
      const words = normalizeDeepgramEvaluationWords(rawResponse);
      return receipt({
        options,
        requestConfig,
        policy,
        window,
        rawResponse,
        providerRequestId,
        elapsedMilliseconds: Date.now() - startedAt,
        candidate: {
          sourceDerivative: source.derivative,
          providerKey: "deepgram-batch",
          providerName: "Deepgram batch",
          model: `${DEEPGRAM_TRANSCRIPT_MODEL}@${requestConfig.version}+diarizer-${requestConfig.diarize_model}`,
          speakerAttribution: "word",
          timingGranularity: "word",
          outcome: "succeeded",
          words,
        },
      });
    }

    if (options.provider === "local-whisper") {
      const rawResponse = await invokeLocalWhisper({
        options,
        source,
        prompt: requestConfig.terminology?.prompt ?? null,
      });
      const words = normalizeLocalWhisperEvaluationWords(rawResponse);
      return receipt({
        options,
        requestConfig,
        policy,
        window,
        rawResponse,
        providerRequestId: null,
        elapsedMilliseconds: Date.now() - startedAt,
        candidate: {
          sourceDerivative: source.derivative,
          providerKey: LOCAL_WHISPER_TRANSCRIPT_PROVIDER,
          providerName: "OpenAI Whisper local",
          model: requestConfig.model,
          adapterVersion: LOCAL_WHISPER_EVALUATION_ADAPTER_VERSION,
          speakerAttribution: "unavailable",
          timingGranularity: "word",
          outcome: "succeeded",
          words,
        },
      });
    }

    const apiKey = requiredEnvironment("OPENAI_API_KEY");
    const form = new FormData();
    form.append("file", new Blob([source.bytes], { type: source.contentType }), source.fileName);
    form.append("model", requestConfig.model);
    form.append("response_format", requestConfig.response_format);
    form.append("chunking_strategy", requestConfig.chunking_strategy);
    form.append("language", requestConfig.language);
    const response = await fetch(requestConfig.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    providerRequestId = response.headers.get("x-request-id");
    rawResponse = await providerBody(response, "openai");
    const words = normalizeOpenAIDiarizedEvaluationWords(rawResponse);
    return receipt({
      options,
      requestConfig,
      policy,
      window,
      rawResponse,
      providerRequestId,
      elapsedMilliseconds: Date.now() - startedAt,
      candidate: {
        sourceDerivative: source.derivative,
        providerKey: "openai-diarized",
        providerName: "OpenAI diarized transcription",
        model: OPENAI_DIARIZED_TRANSCRIPT_MODEL,
        speakerAttribution: "segment",
        timingGranularity: "unavailable",
        outcome: "succeeded",
        words,
      },
    });
  } catch (error) {
    const failure = sanitizeFailure(error, options.provider, providerRequestId);
    const identity = providerIdentity(options, requestConfig);
    return receipt({
      options,
      requestConfig,
      policy,
      window,
      rawResponse: rawResponse ?? failure,
      providerRequestId,
      elapsedMilliseconds: Date.now() - startedAt,
      candidate: {
        sourceDerivative: source.derivative,
        ...identity,
        outcome: "failed",
        errorCode: failure.errorCode,
        retryable: failure.retryable,
      },
    });
  }
}

async function invokeLocalWhisper({ options, source, prompt }) {
  const workingDirectory = await mkdtemp(join(tmpdir(), "quipsly-evaluation-whisper-"));
  const sourcePath = join(workingDirectory, "window.wav");
  const outputPath = join(workingDirectory, "window.json");
  try {
    await writeFile(sourcePath, source.bytes, { flag: "wx", mode: 0o600 });
    const args = [
      sourcePath,
      "--model", options.whisperModel,
      "--device", options.whisperDevice,
      "--output_dir", workingDirectory,
      "--output_format", "json",
      "--verbose", "False",
      "--word_timestamps", "True",
      "--condition_on_previous_text", "False",
      "--fp16", options.whisperDevice === "cpu" ? "False" : "True",
    ];
    if (options.language) args.push("--language", options.language);
    if (prompt) args.push("--initial_prompt", prompt);
    await execFileAsync(options.whisperExecutable, args, { maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(await readFile(outputPath, "utf8"));
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

function providerIdentity(options, requestConfig) {
  if (options.provider === "deepgram") {
    return {
      providerKey: "deepgram-batch",
      providerName: "Deepgram batch",
      model: `${DEEPGRAM_TRANSCRIPT_MODEL}@${requestConfig.version}+diarizer-${requestConfig.diarize_model}`,
      adapterVersion: QUIPSLY_TRANSCRIPT_PROVIDER_ADAPTER_VERSION,
      speakerAttribution: "word",
      timingGranularity: "word",
    };
  }
  if (options.provider === "local-whisper") {
    return {
      providerKey: LOCAL_WHISPER_TRANSCRIPT_PROVIDER,
      providerName: "OpenAI Whisper local",
      model: requestConfig.model,
      adapterVersion: LOCAL_WHISPER_EVALUATION_ADAPTER_VERSION,
      speakerAttribution: "unavailable",
      timingGranularity: "word",
    };
  }
  return {
    providerKey: "openai-diarized",
    providerName: "OpenAI diarized transcription",
    model: OPENAI_DIARIZED_TRANSCRIPT_MODEL,
    adapterVersion: QUIPSLY_TRANSCRIPT_PROVIDER_ADAPTER_VERSION,
    speakerAttribution: "segment",
    timingGranularity: "unavailable",
  };
}

function experimentArms(options, window) {
  if (!options.terminologyExperiment) return [{ name: "single" }];
  const experiment = window?.terminologyExperiment;
  if (
    experiment?.schema !== "quipsly-transcript-terminology-experiment-v1"
    || !/^[a-f0-9]{64}$/.test(experiment.termsSha256 ?? "")
    || !Array.isArray(experiment.terms)
    || experiment.terms.length !== experiment.promptTermCount
    || experiment.promptTermCount < 1
  ) {
    throw new Error(`Window ${window.windowId} has no valid frozen terminology experiment.`);
  }
  if (experiment.terms.length > 100) {
    throw new Error(`Window ${window.windowId} exceeds the provider-safe 100-term experiment limit.`);
  }
  return [{ name: "baseline" }, { name: "project-terminology" }];
}

function requestConfigForArm(baseConfig, window, arm) {
  if (arm.name === "single") return baseConfig;
  const experiment = window.terminologyExperiment;
  const terms = experiment.terms.map((term) => String(term.canonicalText ?? "").trim()).filter(Boolean);
  if (terms.length !== experiment.promptTermCount) {
    throw new Error(`Window ${window.windowId} has incomplete canonical terminology text.`);
  }
  if (arm.name === "baseline") {
    return {
      ...baseConfig,
      terminology: {
        mode: "none",
        snapshotSha256: experiment.termsSha256,
        termCount: 0,
        nativeKeyterms: [],
        prompt: null,
      },
    };
  }
  const prompt = terms.join(", ");
  return {
    ...baseConfig,
    terminology: {
      mode: "project-snapshot",
      snapshotSha256: experiment.termsSha256,
      termCount: experiment.promptTermCount,
      nativeKeyterms: terms,
      prompt,
      promptSha256: createHash("sha256").update(prompt, "utf8").digest("hex"),
    },
  };
}

function runKeyForArm(runKey, armName) {
  return armName === "single" ? runKey : `${runKey}-${armName}`;
}

function receiptFileName(runKey, windowId, armName) {
  const suffix = armName === "single" ? "" : `-${safeFile(armName)}`;
  return `${safeFile(runKey)}-${safeFile(windowId)}${suffix}.provider.json`;
}

function receipt({ options, requestConfig, policy, window, rawResponse, providerRequestId, elapsedMilliseconds, candidate }) {
  const sourceDerivative = candidate.sourceDerivative;
  const candidateWithoutDerivative = { ...candidate };
  delete candidateWithoutDerivative.sourceDerivative;
  return {
    kind: "quipsly-private-transcript-provider-receipt-v1",
    version: 1,
    runKey: runKeyForArm(
      options.runKey,
      options.terminologyExperiment
        ? requestConfig.terminology.mode === "none" ? "baseline" : "project-terminology"
        : "single",
    ),
    windowId: window.windowId,
    windowKeySha256: window.windowKeySha256,
    sourceSha256: window.source.sha256,
    referenceContentSha256: window.reference.contentSha256,
    sourceDerivative,
    requestConfig: {
      provider: requestConfig,
      inputMedia: sourceDerivative,
      ...(options.terminologyExperiment ? {
        terminologyExperiment: {
          schema: "quipsly-transcript-terminology-experiment-v1",
          comparisonKey: options.runKey,
          arm: requestConfig.terminology.mode === "none" ? "baseline" : "project-terminology",
          termsSha256: requestConfig.terminology.snapshotSha256,
        },
      } : {}),
    },
    policy,
    rawResponse,
    candidate: {
      ...candidateWithoutDerivative,
      adapterVersion: candidateWithoutDerivative.adapterVersion ?? QUIPSLY_TRANSCRIPT_PROVIDER_ADAPTER_VERSION,
      providerRequestId,
      completedAt: new Date().toISOString(),
      elapsedMilliseconds,
      estimatedCostUsd: options.estimatedCostUsdPerHour == null
        ? null
        : options.estimatedCostUsdPerHour * window.source.durationSeconds / 3600,
      ...(candidate.outcome === "succeeded" ? { correction: null } : {}),
    },
  };
}

async function readExistingReceipt(path, window, options, arm) {
  try {
    const existing = JSON.parse(await readFile(path, "utf8"));
    const expectedRunKey = runKeyForArm(options.runKey, arm.name);
    const expectedProviderKey = options.provider === "deepgram"
      ? "deepgram-batch"
      : options.provider === "openai"
        ? "openai-diarized"
        : LOCAL_WHISPER_TRANSCRIPT_PROVIDER;
    const experiment = existing.requestConfig?.terminologyExperiment;
    if (
      existing.kind !== "quipsly-private-transcript-provider-receipt-v1"
      || existing.runKey !== expectedRunKey
      || existing.windowId !== window.windowId
      || existing.windowKeySha256 !== window.windowKeySha256
      || existing.sourceSha256 !== window.source.sha256
      || existing.referenceContentSha256 !== window.reference.contentSha256
      || !/^[a-f0-9]{64}$/.test(existing.sourceDerivative?.sha256 ?? "")
      || existing.sourceDerivative?.originalSourceSha256 !== window.source.sha256
      || Math.abs(Number(existing.sourceDerivative?.startSeconds) - Number(window.source.startSeconds)) > 0.01
      || Math.abs(Number(existing.sourceDerivative?.endSeconds) - Number(window.source.endSeconds)) > 0.01
      || JSON.stringify(existing.requestConfig?.inputMedia) !== JSON.stringify(existing.sourceDerivative)
      || existing.candidate?.providerKey !== expectedProviderKey
      || (options.terminologyExperiment && (
        experiment?.schema !== "quipsly-transcript-terminology-experiment-v1"
        || experiment?.comparisonKey !== options.runKey
        || experiment?.arm !== arm.name
        || experiment?.termsSha256 !== window.terminologyExperiment?.termsSha256
      ))
      || (!options.terminologyExperiment && experiment != null)
    ) {
      throw new Error(`Existing provider receipt does not match current immutable evidence: ${path}`);
    }
    return existing;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

async function downloadVerifiedSource(baseUrl, token, window) {
  validateSourceWindow(window.source);
  const response = await fetch(new URL(window.source.protectedPlaybackUrl, baseUrl), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Protected source download failed with HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== window.source.sha256) throw new Error(`Protected source hash mismatch for ${window.windowId}.`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const extension = contentType.includes("wav") ? "wav" : contentType.includes("mpeg") ? "mp3" : contentType.includes("mp4") ? "mp4" : "media";
  return { bytes, contentType, fileName: `${window.windowId}.${extension}` };
}

async function createDeterministicEvaluationDerivative(source, window) {
  const range = validateSourceWindow(window.source);
  const workingDirectory = await mkdtemp(join(tmpdir(), "quipsly-transcript-window-"));
  const sourceExtension = extname(source.fileName) || ".media";
  const sourcePath = join(workingDirectory, `source${sourceExtension}`);
  const derivativePath = join(workingDirectory, "window-mono-16khz.wav");
  try {
    await writeFile(sourcePath, source.bytes, { flag: "wx", mode: 0o600 });
    await execFileAsync(process.env.QUIPSLY_FFMPEG_PATH?.trim() || "ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      "-i", sourcePath,
      "-ss", range.startSeconds.toFixed(4),
      "-t", range.durationSeconds.toFixed(4),
      "-map", "0:a:0",
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "pcm_s16le",
      "-map_metadata", "-1",
      "-fflags", "+bitexact",
      "-flags:a", "+bitexact",
      derivativePath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    const probe = await execFileAsync(process.env.QUIPSLY_FFPROBE_PATH?.trim() || "ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
      "-of", "json",
      derivativePath,
    ], { maxBuffer: 1024 * 1024 });
    const metadata = JSON.parse(probe.stdout);
    const stream = metadata.streams?.[0] ?? {};
    const durationSeconds = Number(metadata.format?.duration);
    if (
      stream.codec_name !== "pcm_s16le"
      || Number(stream.sample_rate) !== 16_000
      || Number(stream.channels) !== 1
      || !Number.isFinite(durationSeconds)
      || Math.abs(durationSeconds - range.durationSeconds) > 0.075
    ) {
      throw new Error("The deterministic evaluation derivative failed its codec, channel, sample-rate, or duration probe.");
    }
    const bytes = new Uint8Array(await readFile(derivativePath));
    return {
      bytes,
      contentType: "audio/wav",
      fileName: `${window.windowId}.mono-16khz.wav`,
      derivative: {
        schema: "quipsly-transcript-evaluation-derivative-v1",
        originalSourceSha256: window.source.sha256,
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
        durationSeconds: Number(durationSeconds.toFixed(4)),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.byteLength,
        codec: "pcm_s16le",
        sampleRateHz: 16_000,
        channelCount: 1,
        ffmpegArgumentsVersion: "mono-16khz-pcm-v1",
      },
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

function validateSourceWindow(source) {
  const startSeconds = Number(source?.startSeconds);
  const endSeconds = Number(source?.endSeconds);
  const durationSeconds = Number(source?.durationSeconds);
  if (
    !Number.isFinite(startSeconds)
    || !Number.isFinite(endSeconds)
    || !Number.isFinite(durationSeconds)
    || startSeconds < 0
    || endSeconds <= startSeconds
    || Math.abs((endSeconds - startSeconds) - durationSeconds) > 0.01
    || durationSeconds < 60
    || durationSeconds > 180
  ) {
    throw new Error("Runner input must contain an exact, internally consistent 60–180 second source window.");
  }
  return { startSeconds, endSeconds, durationSeconds };
}

async function providerBody(response, provider) {
  const body = await response.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = { nonJsonBodyExcerpt: body.slice(0, 8_000) }; }
  if (!response.ok) {
    const error = new Error(`${provider} returned HTTP ${response.status}.`);
    error.providerStatus = response.status;
    error.providerBody = parsed;
    throw error;
  }
  return parsed;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `Request failed with HTTP ${response.status}.`);
  return body;
}

function sanitizeFailure(error, provider, requestId) {
  const status = Number(error?.providerStatus);
  return {
    errorCode: `${provider}-${Number.isInteger(status) ? `http-${status}` : "adapter-failure"}`,
    retryable: Number.isInteger(status) ? status === 408 || status === 409 || status === 429 || status >= 500 : false,
    providerRequestId: requestId,
    message: error instanceof Error ? error.message.slice(0, 500) : "Provider adapter failed.",
    providerBody: error?.providerBody ?? null,
  };
}

function validateRunnerInput(input, expectedRoomId) {
  if (input?.kind !== "quipsly-private-transcript-evaluation-runner-input-v1" || input?.version !== 1 || !Array.isArray(input.windows)) {
    throw new Error("Input is not a Quipsly private transcript runner bundle.");
  }
  if (expectedRoomId && input.roomId !== expectedRoomId) throw new Error("Runner input room does not match --room-id.");
  if (!input.windows.length) throw new Error("Runner input has no approved windows.");
}

function validatePolicy(policy) {
  const required = ["capturedAt", "sourceUrl", "trainingUsage", "retentionMode"];
  if (!policy || typeof policy !== "object" || required.some((field) => typeof policy[field] !== "string" || !policy[field])) {
    throw new Error("--policy must name capturedAt, sourceUrl, trainingUsage, and retentionMode.");
  }
  new URL(policy.sourceUrl);
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableRequestId(runKey, windowId) {
  const digest = createHash("sha256").update(`${runKey}\0${windowId}`).digest("hex").slice(0, 32);
  return `provider-candidate-${digest}`;
}

function safeFile(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(value)) throw new Error("Run and window IDs must be safe file identifiers.");
  return value;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required and is never accepted as a command-line argument.`);
  return value;
}

function parseArguments(args) {
  const parsed = {
    provider: "",
    roomId: "",
    input: "",
    baseUrl: "",
    runKey: "",
    policy: "",
    evidenceDir: "",
    output: "",
    language: "",
    deepgramModelVersion: "",
    whisperExecutable: process.env.QUIPSLY_LOCAL_WHISPER_EXECUTABLE?.trim()
      || "/opt/homebrew/Caskroom/miniconda/base/bin/whisper",
    whisperModel: process.env.QUIPSLY_LOCAL_WHISPER_MODEL?.trim() || "large-v3-turbo",
    whisperDevice: process.env.QUIPSLY_LOCAL_WHISPER_DEVICE?.trim() || "cpu",
    estimatedCostUsdPerHour: null,
    limit: 0,
    dryRun: false,
    terminologyExperiment: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--provider") parsed.provider = args[++index] ?? "";
    else if (argument === "--room-id") parsed.roomId = args[++index] ?? "";
    else if (argument === "--input") parsed.input = args[++index] ?? "";
    else if (argument === "--base-url") parsed.baseUrl = args[++index] ?? "";
    else if (argument === "--run-key") parsed.runKey = args[++index] ?? "";
    else if (argument === "--policy") parsed.policy = args[++index] ?? "";
    else if (argument === "--evidence-dir") parsed.evidenceDir = args[++index] ?? "";
    else if (argument === "--output") parsed.output = args[++index] ?? "";
    else if (argument === "--language") parsed.language = args[++index] ?? "";
    else if (argument === "--deepgram-model-version") parsed.deepgramModelVersion = args[++index] ?? "";
    else if (argument === "--whisper-executable") parsed.whisperExecutable = args[++index] ?? "";
    else if (argument === "--whisper-model") parsed.whisperModel = args[++index] ?? "";
    else if (argument === "--whisper-device") parsed.whisperDevice = args[++index] ?? "";
    else if (argument === "--estimated-cost-usd-per-hour") parsed.estimatedCostUsdPerHour = Number(args[++index]);
    else if (argument === "--limit") parsed.limit = Number(args[++index]);
    else if (argument === "--dry-run") parsed.dryRun = true;
    else if (argument === "--terminology-experiment") parsed.terminologyExperiment = true;
    else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  QUIPSLY_BEARER_TOKEN=... OPENAI_API_KEY=... pnpm quipsly:transcript:providers:run --provider openai --room-id ROOM --base-url https://nest.quipsly.com --run-key RUN --policy POLICY.json --evidence-dir PRIVATE_DIR --output SUMMARY.json",
        "  QUIPSLY_BEARER_TOKEN=... DEEPGRAM_API_KEY=... pnpm quipsly:transcript:providers:run --provider deepgram --deepgram-model-version EXACT_VERSION ...",
        "  QUIPSLY_BEARER_TOKEN=... pnpm quipsly:transcript:providers:run --provider local-whisper --terminology-experiment ...",
        "",
        "Use --dry-run to authenticate, export, download, and SHA-verify sources without calling a provider or mutating Nest.",
        "Provider and Quipsly credentials are read only from environment variables and never from command arguments.",
        "Raw provider results are create-once mode-0600 receipts in --evidence-dir before Nest append, enabling crash-safe replay.",
        "",
      ].join("\n"));
      process.exit(0);
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (!["deepgram", "openai", "local-whisper"].includes(parsed.provider)) throw new Error("--provider must be deepgram, openai, or local-whisper.");
  if (!parsed.roomId && !parsed.input) throw new Error("Choose --room-id or --input.");
  if (!parsed.baseUrl || !parsed.runKey || !parsed.policy) throw new Error("--base-url, --run-key, and --policy are required.");
  if (!parsed.dryRun && !parsed.evidenceDir) throw new Error("--evidence-dir is required for crash-safe provider execution.");
  if (parsed.provider === "deepgram" && !parsed.deepgramModelVersion) throw new Error("--deepgram-model-version is required and must be exact.");
  if (parsed.terminologyExperiment && parsed.provider === "openai") {
    throw new Error("OpenAI diarized transcription does not support prompt terminology; use Deepgram Nova-3 or local-whisper for a matched terminology experiment.");
  }
  if (parsed.provider === "local-whisper") {
    if (!parsed.whisperExecutable) throw new Error("A local Whisper executable is required.");
    if (!/^[A-Za-z0-9._-]{2,100}$/.test(parsed.whisperModel)) throw new Error("The local Whisper model is invalid.");
    if (!/^[A-Za-z0-9._-]{2,30}$/.test(parsed.whisperDevice)) throw new Error("The local Whisper device is invalid.");
  }
  if (parsed.limit && (!Number.isSafeInteger(parsed.limit) || parsed.limit < 1)) throw new Error("--limit must be a positive integer.");
  if (parsed.estimatedCostUsdPerHour !== null && (!Number.isFinite(parsed.estimatedCostUsdPerHour) || parsed.estimatedCostUsdPerHour < 0)) throw new Error("--estimated-cost-usd-per-hour must be non-negative.");
  safeFile(parsed.runKey);
  return parsed;
}
