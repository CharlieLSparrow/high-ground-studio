#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  DEEPGRAM_TRANSCRIPT_MODEL,
  OPENAI_DIARIZED_TRANSCRIPT_MODEL,
  QUIPSLY_TRANSCRIPT_PROVIDER_ADAPTER_VERSION,
  deepgramEvaluationRequestConfig,
  normalizeDeepgramEvaluationWords,
  normalizeOpenAIDiarizedEvaluationWords,
  openAIDiarizedEvaluationRequestConfig,
} from "../packages/quipsly-media-processing/src/transcript-provider-adapters.ts";

const options = parseArguments(process.argv.slice(2));
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
  : openAIDiarizedEvaluationRequestConfig({ language: options.language });
const evidenceDirectory = options.dryRun ? null : resolve(options.evidenceDir);
if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });

const selectedWindows = runnerInput.windows.slice(0, options.limit || runnerInput.windows.length);
const results = [];
for (const window of selectedWindows) {
  const receiptPath = evidenceDirectory
    ? resolve(evidenceDirectory, `${safeFile(options.runKey)}-${safeFile(window.windowId)}.provider.json`)
    : null;
  let receipt = receiptPath ? await readExistingReceipt(receiptPath, window, options) : null;
  if (!receipt) {
    const source = await downloadVerifiedSource(baseUrl, bearerToken, window);
    if (options.dryRun) {
      results.push({
        windowId: window.windowId,
        sourceSha256: window.source.sha256,
        sourceBytes: source.bytes.byteLength,
        outcome: "validated-only",
      });
      continue;
    }
    receipt = await invokeProvider({ options, requestConfig, policy, window, source });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
  const appendResult = await fetchJson(`${baseUrl}/api/transcript-evaluation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operation: "append-candidate",
      windowId: window.windowId,
      clientRequestId: stableRequestId(options.runKey, window.windowId),
      runKey: options.runKey,
      requestConfig: receipt.requestConfig,
      rawResponse: receipt.rawResponse,
      policy: receipt.policy,
      candidate: receipt.candidate,
    }),
  });
  results.push({
    windowId: window.windowId,
    sourceSha256: window.source.sha256,
    outcome: receipt.candidate.outcome,
    candidateId: appendResult.candidate?.id ?? null,
    idempotentReplay: appendResult.idempotentReplay === true,
    rawResponseSha256: sha256Json(receipt.rawResponse),
    elapsedMilliseconds: receipt.candidate.elapsedMilliseconds,
  });
}
const summary = {
  kind: "quipsly-transcript-provider-run-summary-v1",
  version: 1,
  roomId: runnerInput.roomId,
  corpusRevisionSha256: runnerInput.corpusRevisionSha256,
  provider: options.provider,
  runKey: options.runKey,
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

async function invokeProvider({ options, requestConfig, policy, window, source }) {
  const startedAt = Date.now();
  let rawResponse;
  let providerRequestId = null;
  try {
    if (options.provider === "deepgram") {
      const apiKey = requiredEnvironment("DEEPGRAM_API_KEY");
      const url = new URL(requestConfig.endpoint);
      for (const [key, value] of Object.entries(requestConfig)) {
        if (key === "endpoint") continue;
        url.searchParams.set(key, String(value));
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
    return receipt({
      options,
      requestConfig,
      policy,
      window,
      rawResponse: rawResponse ?? failure,
      providerRequestId,
      elapsedMilliseconds: Date.now() - startedAt,
      candidate: {
        providerKey: options.provider === "deepgram" ? "deepgram-batch" : "openai-diarized",
        providerName: options.provider === "deepgram" ? "Deepgram batch" : "OpenAI diarized transcription",
        model: options.provider === "deepgram"
          ? `${DEEPGRAM_TRANSCRIPT_MODEL}@${requestConfig.version}+diarizer-${requestConfig.diarize_model}`
          : OPENAI_DIARIZED_TRANSCRIPT_MODEL,
        speakerAttribution: options.provider === "deepgram" ? "word" : "segment",
        timingGranularity: options.provider === "deepgram" ? "word" : "unavailable",
        outcome: "failed",
        errorCode: failure.errorCode,
        retryable: failure.retryable,
      },
    });
  }
}

function receipt({ options, requestConfig, policy, window, rawResponse, providerRequestId, elapsedMilliseconds, candidate }) {
  return {
    kind: "quipsly-private-transcript-provider-receipt-v1",
    version: 1,
    runKey: options.runKey,
    windowId: window.windowId,
    windowKeySha256: window.windowKeySha256,
    sourceSha256: window.source.sha256,
    referenceContentSha256: window.reference.contentSha256,
    requestConfig,
    policy,
    rawResponse,
    candidate: {
      ...candidate,
      adapterVersion: QUIPSLY_TRANSCRIPT_PROVIDER_ADAPTER_VERSION,
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

async function readExistingReceipt(path, window, options) {
  try {
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (
      existing.kind !== "quipsly-private-transcript-provider-receipt-v1"
      || existing.runKey !== options.runKey
      || existing.windowId !== window.windowId
      || existing.windowKeySha256 !== window.windowKeySha256
      || existing.sourceSha256 !== window.source.sha256
      || existing.referenceContentSha256 !== window.reference.contentSha256
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
  if (window.source.startSeconds !== 0 || Math.abs(window.source.endSeconds - window.source.durationSeconds) > 0.01) {
    throw new Error("This runner version accepts complete-source windows only; it will not silently ignore in/out points.");
  }
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
    estimatedCostUsdPerHour: null,
    limit: 0,
    dryRun: false,
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
    else if (argument === "--estimated-cost-usd-per-hour") parsed.estimatedCostUsdPerHour = Number(args[++index]);
    else if (argument === "--limit") parsed.limit = Number(args[++index]);
    else if (argument === "--dry-run") parsed.dryRun = true;
    else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  QUIPSLY_BEARER_TOKEN=... OPENAI_API_KEY=... pnpm quipsly:transcript:providers:run --provider openai --room-id ROOM --base-url https://nest.quipsly.com --run-key RUN --policy POLICY.json --evidence-dir PRIVATE_DIR --output SUMMARY.json",
        "  QUIPSLY_BEARER_TOKEN=... DEEPGRAM_API_KEY=... pnpm quipsly:transcript:providers:run --provider deepgram --deepgram-model-version EXACT_VERSION ...",
        "",
        "Use --dry-run to authenticate, export, download, and SHA-verify sources without calling a provider or mutating Nest.",
        "Provider and Quipsly credentials are read only from environment variables and never from command arguments.",
        "Raw provider results are create-once mode-0600 receipts in --evidence-dir before Nest append, enabling crash-safe replay.",
        "",
      ].join("\n"));
      process.exit(0);
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (parsed.provider !== "deepgram" && parsed.provider !== "openai") throw new Error("--provider must be deepgram or openai.");
  if (!parsed.roomId && !parsed.input) throw new Error("Choose --room-id or --input.");
  if (!parsed.baseUrl || !parsed.runKey || !parsed.policy) throw new Error("--base-url, --run-key, and --policy are required.");
  if (!parsed.dryRun && !parsed.evidenceDir) throw new Error("--evidence-dir is required for crash-safe provider execution.");
  if (parsed.provider === "deepgram" && !parsed.deepgramModelVersion) throw new Error("--deepgram-model-version is required and must be exact.");
  if (parsed.limit && (!Number.isSafeInteger(parsed.limit) || parsed.limit < 1)) throw new Error("--limit must be a positive integer.");
  if (parsed.estimatedCostUsdPerHour !== null && (!Number.isFinite(parsed.estimatedCostUsdPerHour) || parsed.estimatedCostUsdPerHour < 0)) throw new Error("--estimated-cost-usd-per-hour must be non-negative.");
  safeFile(parsed.runKey);
  return parsed;
}
