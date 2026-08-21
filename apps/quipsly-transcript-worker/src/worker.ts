import { createHash, randomUUID } from "node:crypto";

import {
  CAPTURE_TRANSCRIPT_QUEUE_PREFIX,
  buildCaptureTranscriptDeadLetterObjectName,
  buildCaptureTranscriptManifestObjectName,
  buildCaptureTranscriptQueueObjectName,
  buildCaptureTranscriptRawObjectName,
  buildCaptureTranscriptResultObjectName,
  claimCaptureTranscriptManifest,
  completeCaptureTranscriptManifest,
  failCaptureTranscriptManifest,
  normalizeCaptureTranscriptJobId,
  parseCaptureTranscriptManifest,
  parseCaptureTranscriptQueueReceipt,
  parseCaptureTranscriptResult,
  releaseCaptureTranscriptLease,
  type CaptureTranscriptManifest,
  type CaptureTranscriptResult,
  type CaptureTranscriptSegment,
  type CaptureTranscriptWordAnchor,
} from "@high-ground/quipsly-media-processing";

import {
  TranscriptProviderError,
  type TranscriptProvider,
} from "./deepgram.js";

export type StoredJson = {
  value: unknown;
  generation: string;
};

export type StoredProviderResponse = StoredJson & {
  sizeBytes: number;
  sha256: string;
};

export type QueueObject = {
  name: string;
  generation: string;
};

export type ObjectEvidence = {
  bucketName: string;
  objectName: string;
  generation: string;
  sizeBytes: number;
  contentType: string;
  customMetadata: Record<string, string>;
};

export interface CaptureTranscriptWorkerStorage {
  listQueueObjects(limit: number): Promise<QueueObject[]>;
  loadJson(objectName: string, generation?: string): Promise<StoredJson>;
  saveJson(
    objectName: string,
    value: unknown,
    ifGenerationMatch: string,
  ): Promise<StoredJson>;
  saveJsonIfAbsent(objectName: string, value: unknown): Promise<StoredJson>;
  objectEvidence(
    objectName: string,
    generation: string,
  ): Promise<ObjectEvidence | null>;
  signedReadUrl(
    objectName: string,
    generation: string,
    expiresAt: Date,
  ): Promise<string>;
  loadProviderResponse(
    objectName: string,
  ): Promise<StoredProviderResponse | null>;
  saveProviderResponseIfAbsent(
    objectName: string,
    value: unknown,
    customMetadata: Record<string, string>,
  ): Promise<StoredProviderResponse>;
  deleteObject(
    objectName: string,
    ifGenerationMatch: string,
  ): Promise<void>;
  writeDeadLetter(
    objectName: string,
    value: unknown,
    sourceQueueGeneration: string,
  ): Promise<void>;
}

export type CaptureTranscriptWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseDurationMs: number;
  signedUrlDurationMs: number;
  now: () => Date;
};

export type CaptureTranscriptWorkerResult =
  | { disposition: "completed"; jobId: string; wordCount: number }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalTranscriptError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalTranscriptError";
    this.code = code;
  }
}

export async function runCaptureTranscriptWorker(
  storage: CaptureTranscriptWorkerStorage,
  provider: TranscriptProvider,
  options: CaptureTranscriptWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Capture transcript worker limit must be between 1 and 20.");
  }
  const queueObjects = await storage.listQueueObjects(limit);
  const results: CaptureTranscriptWorkerResult[] = [];
  const transientFailures: Error[] = [];
  for (const queueObject of queueObjects) {
    try {
      results.push(
        await processCaptureTranscriptQueueObject(
          storage,
          provider,
          options,
          queueObject,
        ),
      );
    } catch (error) {
      transientFailures.push(
        error instanceof Error
          ? error
          : new Error("Unknown capture transcript worker failure."),
      );
    }
  }
  if (transientFailures.length > 0) {
    throw new AggregateError(
      transientFailures,
      `${transientFailures.length} capture transcript job(s) need retry.`,
    );
  }
  return results;
}

export async function processCaptureTranscriptQueueObject(
  storage: CaptureTranscriptWorkerStorage,
  provider: TranscriptProvider,
  options: CaptureTranscriptWorkerOptions,
  queueObject: QueueObject,
): Promise<CaptureTranscriptWorkerResult> {
  let receipt;
  try {
    const storedQueue = await storage.loadJson(
      queueObject.name,
      queueObject.generation,
    );
    receipt = parseCaptureTranscriptQueueReceipt(storedQueue.value);
  } catch (error) {
    const pathJobId = queueObject.name.startsWith(captureTranscriptQueuePrefix())
      ? queueObject.name
          .slice(captureTranscriptQueuePrefix().length)
          .replace(/\.json$/, "")
      : "";
    const quarantineId = normalizeCaptureTranscriptJobId(pathJobId)
      || `invalid-${createHash("sha256")
        .update(queueObject.name)
        .digest("hex")
        .slice(0, 24)}`;
    return quarantineQueue(
      storage,
      queueObject,
      quarantineId,
      "queue-receipt-invalid",
      error instanceof Error ? error.message : "Invalid queue receipt.",
      options.now(),
    );
  }
  if (queueObject.name !== buildCaptureTranscriptQueueObjectName(receipt.jobId)) {
    return quarantineQueue(
      storage,
      queueObject,
      receipt.jobId,
      "queue-path-mismatch",
      "Queue object path does not match the transcript job.",
      options.now(),
    );
  }

  let storedManifest: StoredJson;
  let manifest: CaptureTranscriptManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseCaptureTranscriptManifest(
      storedManifest.value,
      receipt.jobId,
    );
    if (
      manifest.status === "queued"
      && manifest.attemptCount === 0
      && storedManifest.generation !== receipt.manifestGeneration
    ) {
      throw new Error(
        "Initial transcript manifest generation no longer matches its receipt.",
      );
    }
  } catch (error) {
    return quarantineQueue(
      storage,
      queueObject,
      receipt.jobId,
      "manifest-invalid",
      error instanceof Error ? error.message : "Invalid transcript manifest.",
      options.now(),
    );
  }

  if (manifest.status === "completed") {
    const result = await storage.loadJson(
      buildCaptureTranscriptResultObjectName(manifest.jobId),
    );
    parseCaptureTranscriptResult(result.value, manifest);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetterAndDelete(storage, queueObject, manifest);
    return {
      disposition: "terminal",
      jobId: manifest.jobId,
      code: manifest.failure!.code,
    };
  }

  const leaseId = randomUUID();
  const claimed = claimCaptureTranscriptManifest({
    manifest,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimed) {
    return { disposition: "busy", jobId: manifest.jobId };
  }
  try {
    storedManifest = await storage.saveJson(
      receipt.manifestObjectName,
      claimed,
      storedManifest.generation,
    );
    manifest = parseCaptureTranscriptManifest(
      storedManifest.value,
      receipt.jobId,
    );
  } catch (error) {
    if (isPreconditionFailure(error)) {
      return { disposition: "claim-lost", jobId: manifest.jobId };
    }
    throw error;
  }

  try {
    assertSourceEvidence(
      manifest,
      await storage.objectEvidence(
        manifest.source.objectName,
        manifest.source.generation,
      ),
    );
    const rawObjectName = buildCaptureTranscriptRawObjectName(manifest.jobId);
    let storedProvider = await storage.loadProviderResponse(rawObjectName);
    if (!storedProvider) {
      const expiresAt = new Date(
        options.now().getTime() + options.signedUrlDurationMs,
      );
      const signedUrl = await storage.signedReadUrl(
        manifest.source.objectName,
        manifest.source.generation,
        expiresAt,
      );
      let providerResponse;
      try {
        providerResponse = await provider.transcribe(
          {
            signedUrl,
            gcsUri: `gs://${manifest.source.bucketName}/${manifest.source.objectName}`,
            generation: manifest.source.generation,
          },
          manifest.provider,
        );
      } catch (error) {
        if (error instanceof TranscriptProviderError && !error.retryable) {
          throw new TerminalTranscriptError(error.code, error.message);
        }
        throw error;
      }
      // Speech-to-Text V2 accepts only a generation-less GCS URI. Rechecking
      // the immutable binding after recognition ensures a concurrent rewrite
      // can never be accepted as transcript evidence for the claimed source.
      assertSourceEvidence(
        manifest,
        await storage.objectEvidence(
          manifest.source.objectName,
          manifest.source.generation,
        ),
      );
      storedProvider = await storage.saveProviderResponseIfAbsent(
        rawObjectName,
        providerResponse.payload,
        {
          quipslyKind: "capture-transcript-provider-response-v1",
          quipslyTranscriptJobId: manifest.jobId,
          quipslySourceGeneration: manifest.source.generation,
          quipslySourceSha256: manifest.source.sha256,
          quipslyProvider: manifest.provider.name,
          quipslyProviderModel: manifest.provider.model,
        },
      );
    }

    const normalized = manifest.provider.name === "google-speech-v2"
      ? normalizeGoogleSpeechV2Response(storedProvider.value)
      : normalizeDeepgramResponse(storedProvider.value);
    const result = resultFor({
      manifest,
      storedProvider,
      normalized,
      options,
    });
    const storedResult = await storage.saveJsonIfAbsent(
      buildCaptureTranscriptResultObjectName(manifest.jobId),
      result,
    );
    const canonicalResult = parseCaptureTranscriptResult(
      storedResult.value,
      manifest,
    );
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const latestManifest = parseCaptureTranscriptManifest(
      latest.value,
      manifest.jobId,
    );
    const completed = completeCaptureTranscriptManifest({
      manifest: latestManifest,
      leaseId,
      result: canonicalResult,
      now: options.now(),
    });
    await storage.saveJson(
      receipt.manifestObjectName,
      completed,
      latest.generation,
    );
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return {
      disposition: "completed",
      jobId: manifest.jobId,
      wordCount: canonicalResult.words.length,
    };
  } catch (error) {
    if (error instanceof TerminalTranscriptError) {
      const terminal = await commitTerminalFailure(
        storage,
        receipt.manifestObjectName,
        manifest.jobId,
        leaseId,
        error,
        options.now(),
      );
      await deadLetterAndDelete(storage, queueObject, terminal);
      return {
        disposition: "terminal",
        jobId: manifest.jobId,
        code: error.code,
      };
    }
    await releaseTransientLease(
      storage,
      receipt.manifestObjectName,
      manifest.jobId,
      leaseId,
      options.now(),
    );
    throw error;
  }
}

export function normalizeDeepgramResponse(value: unknown): {
  requestId: string;
  durationSeconds: number | null;
  channels: number | null;
  words: CaptureTranscriptWordAnchor[];
  segments: CaptureTranscriptSegment[];
} {
  const payload = object(value);
  const metadata = object(payload.metadata);
  const result = object(payload.results);
  const channelRows = array(result.channels);
  const draftWords: Array<Omit<CaptureTranscriptWordAnchor, "index">> = [];

  channelRows.forEach((channelValue, channelIndex) => {
    const channel = object(channelValue);
    const alternative = object(array(channel.alternatives)[0]);
    for (const wordValue of array(alternative.words)) {
      const word = object(wordValue);
      const startSeconds = finiteNumber(word.start);
      const endSeconds = finiteNumber(word.end);
      const rawWord = text(word.word);
      const punctuatedWord = text(word.punctuated_word) || rawWord;
      if (
        startSeconds == null
        || endSeconds == null
        || startSeconds < 0
        || endSeconds < startSeconds
        || !rawWord
        || !punctuatedWord
      ) {
        continue;
      }
      draftWords.push({
        startSeconds,
        endSeconds,
        word: rawWord,
        punctuatedWord,
        confidence: confidence(word.confidence),
        speakerLabel: providerSpeakerLabel(word.speaker),
        channel: channelIndex,
      });
    }
  });
  draftWords.sort((left, right) => (
    left.startSeconds - right.startSeconds
    || left.endSeconds - right.endSeconds
    || (left.channel ?? 0) - (right.channel ?? 0)
  ));
  const words = draftWords.map((word, index) => ({ ...word, index }));
  if (words.length === 0) {
    throw new TerminalTranscriptError(
      "provider-result-empty",
      "Deepgram returned no valid word timing anchors.",
    );
  }

  const segments: CaptureTranscriptSegment[] = [];
  let startIndex = 0;
  for (let index = 1; index <= words.length; index += 1) {
    const previous = words[index - 1]!;
    const current = words[index];
    const currentTextLength = words
      .slice(startIndex, index)
      .reduce((sum, word) => sum + word.punctuatedWord.length + 1, 0);
    const boundary = !current
      || current.speakerLabel !== previous.speakerLabel
      || current.channel !== previous.channel
      || current.startSeconds - previous.endSeconds > 1.25
      || currentTextLength > 420;
    if (!boundary) continue;
    const segmentWords = words.slice(startIndex, index);
    segments.push({
      ordinal: segments.length,
      startSeconds: segmentWords[0]!.startSeconds,
      endSeconds: segmentWords.at(-1)!.endSeconds,
      text: joinPunctuatedWords(segmentWords),
      confidence: minimumConfidence(segmentWords),
      speakerLabel: segmentWords[0]!.speakerLabel,
      channel: segmentWords[0]!.channel,
      providerShape: "deepgram-word-group",
      wordStartIndex: startIndex,
      wordEndIndexExclusive: index,
    });
    startIndex = index;
  }

  const requestId = text(metadata.request_id);
  if (!requestId) {
    throw new TerminalTranscriptError(
      "provider-receipt-missing",
      "Deepgram response did not include its request ID.",
    );
  }
  return {
    requestId,
    durationSeconds: nonNegativeNumber(metadata.duration),
    channels: positiveIntegerOrNull(metadata.channels),
    words,
    segments,
  };
}

export function normalizeGoogleSpeechV2Response(value: unknown): {
  requestId: string;
  durationSeconds: number | null;
  channels: number | null;
  words: CaptureTranscriptWordAnchor[];
  segments: CaptureTranscriptSegment[];
} {
  const payload = object(value);
  const response = object(payload.response);
  const fileResults = Object.values(object(response.results));
  const draftWords: Array<Omit<CaptureTranscriptWordAnchor, "index">> = [];
  let requestId = "";
  let maximumChannel = 0;

  for (const fileValue of fileResults) {
    const file = object(fileValue);
    const metadata = object(file.metadata);
    requestId ||= text(metadata.requestId);
    const inline = object(file.inlineResult);
    const transcript = object(inline.transcript || file.transcript);
    for (const resultValue of array(transcript.results)) {
      const result = object(resultValue);
      const channel = positiveIntegerOrNull(result.channelTag);
      if (channel) maximumChannel = Math.max(maximumChannel, channel);
      const alternative = object(array(result.alternatives)[0]);
      for (const wordValue of array(alternative.words)) {
        const word = object(wordValue);
        const startSeconds = googleDurationSeconds(word.startOffset);
        const endSeconds = googleDurationSeconds(word.endOffset);
        const rawWord = text(word.word);
        if (
          startSeconds == null
          || endSeconds == null
          || endSeconds < startSeconds
          || !rawWord
        ) continue;
        draftWords.push({
          startSeconds,
          endSeconds,
          word: rawWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, "") || rawWord,
          punctuatedWord: rawWord,
          confidence: confidence(word.confidence),
          speakerLabel: providerSpeakerLabel(word.speakerLabel),
          channel,
        });
      }
    }
  }
  draftWords.sort((left, right) => (
    left.startSeconds - right.startSeconds
    || left.endSeconds - right.endSeconds
    || (left.channel ?? 0) - (right.channel ?? 0)
  ));
  const words = draftWords.map((word, index) => ({ ...word, index }));
  if (words.length === 0) {
    throw new TerminalTranscriptError(
      "provider-result-empty",
      "Google Speech returned no valid word timing anchors.",
    );
  }
  const segments: CaptureTranscriptSegment[] = [];
  let startIndex = 0;
  for (let index = 1; index <= words.length; index += 1) {
    const previous = words[index - 1]!;
    const current = words[index];
    const textLength = words
      .slice(startIndex, index)
      .reduce((sum, word) => sum + word.punctuatedWord.length + 1, 0);
    const boundary = !current
      || current.speakerLabel !== previous.speakerLabel
      || current.channel !== previous.channel
      || current.startSeconds - previous.endSeconds > 1.25
      || textLength > 420;
    if (!boundary) continue;
    const segmentWords = words.slice(startIndex, index);
    segments.push({
      ordinal: segments.length,
      startSeconds: segmentWords[0]!.startSeconds,
      endSeconds: segmentWords.at(-1)!.endSeconds,
      text: joinPunctuatedWords(segmentWords),
      confidence: minimumConfidence(segmentWords),
      speakerLabel: segmentWords[0]!.speakerLabel,
      channel: segmentWords[0]!.channel,
      providerShape: "google-speech-v2-result",
      wordStartIndex: startIndex,
      wordEndIndexExclusive: index,
    });
    startIndex = index;
  }
  requestId ||= text(payload.operationName);
  if (!requestId) {
    throw new TerminalTranscriptError(
      "provider-receipt-missing",
      "Google Speech response did not retain a request identifier.",
    );
  }
  return {
    requestId,
    durationSeconds: googleDurationSeconds(response.totalBilledDuration)
      ?? words.at(-1)!.endSeconds,
    channels: maximumChannel || null,
    words,
    segments,
  };
}

async function commitTerminalFailure(
  storage: CaptureTranscriptWorkerStorage,
  manifestObjectName: string,
  jobId: string,
  leaseId: string,
  error: TerminalTranscriptError,
  now: Date,
) {
  const latest = await storage.loadJson(manifestObjectName);
  const manifest = parseCaptureTranscriptManifest(latest.value, jobId);
  const failed = failCaptureTranscriptManifest({
    manifest,
    leaseId,
    code: error.code,
    message: error.message,
    now,
  });
  const stored = await storage.saveJson(
    manifestObjectName,
    failed,
    latest.generation,
  );
  return parseCaptureTranscriptManifest(stored.value, jobId);
}

async function releaseTransientLease(
  storage: CaptureTranscriptWorkerStorage,
  manifestObjectName: string,
  jobId: string,
  leaseId: string,
  now: Date,
) {
  try {
    const latest = await storage.loadJson(manifestObjectName);
    const manifest = parseCaptureTranscriptManifest(latest.value, jobId);
    if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) {
      return;
    }
    await storage.saveJson(
      manifestObjectName,
      releaseCaptureTranscriptLease({ manifest, leaseId, now }),
      latest.generation,
    );
  } catch {
    // A lost claim is safe: another manifest generation owns retry decisions.
  }
}

async function quarantineQueue(
  storage: CaptureTranscriptWorkerStorage,
  queueObject: QueueObject,
  jobId: string,
  code: string,
  message: string,
  now: Date,
): Promise<CaptureTranscriptWorkerResult> {
  await storage.writeDeadLetter(
    buildCaptureTranscriptDeadLetterObjectName(jobId),
    {
      kind: "quipsly-capture-transcript-dead-letter-v1",
      version: 1,
      jobId,
      code,
      message,
      failedAt: now.toISOString(),
    },
    queueObject.generation,
  );
  await storage.deleteObject(queueObject.name, queueObject.generation);
  return { disposition: "terminal", jobId, code };
}

async function deadLetterAndDelete(
  storage: CaptureTranscriptWorkerStorage,
  queueObject: QueueObject,
  manifest: CaptureTranscriptManifest,
) {
  await storage.writeDeadLetter(
    buildCaptureTranscriptDeadLetterObjectName(manifest.jobId),
    {
      kind: "quipsly-capture-transcript-dead-letter-v1",
      version: 1,
      jobId: manifest.jobId,
      manifestObjectName: buildCaptureTranscriptManifestObjectName(
        manifest.jobId,
      ),
      failure: manifest.failure,
    },
    queueObject.generation,
  );
  await storage.deleteObject(queueObject.name, queueObject.generation);
}

function assertSourceEvidence(
  manifest: CaptureTranscriptManifest,
  evidence: ObjectEvidence | null,
) {
  if (
    !evidence
    || evidence.bucketName !== manifest.source.bucketName
    || evidence.objectName !== manifest.source.objectName
    || evidence.generation !== manifest.source.generation
    || evidence.sizeBytes !== manifest.source.sizeBytes
    || evidence.contentType !== manifest.source.contentType
    || evidence.customMetadata.quipslyExpectedSha256
      !== manifest.source.sha256
    || evidence.customMetadata.quipslyExpectedSizeBytes
      !== String(manifest.source.sizeBytes)
  ) {
    throw new TerminalTranscriptError(
      "source-generation-mismatch",
      "Source object evidence no longer matches the verified recording binding.",
    );
  }
}

function resultFor(input: {
  manifest: CaptureTranscriptManifest;
  storedProvider: StoredProviderResponse;
  normalized:
    | ReturnType<typeof normalizeDeepgramResponse>
    | ReturnType<typeof normalizeGoogleSpeechV2Response>;
  options: CaptureTranscriptWorkerOptions;
}): CaptureTranscriptResult {
  return {
    kind: "quipsly-capture-transcript-result-v1",
    version: 1,
    jobId: input.manifest.jobId,
    manifestObjectName: buildCaptureTranscriptManifestObjectName(
      input.manifest.jobId,
    ),
    source: input.manifest.source,
    provider: {
      name: input.manifest.provider.name,
      model: input.manifest.provider.model,
      requestId: input.normalized.requestId,
      durationSeconds: input.normalized.durationSeconds,
      channels: input.normalized.channels,
    },
    rawProviderResponse: {
      bucketName: input.manifest.source.bucketName,
      objectName: buildCaptureTranscriptRawObjectName(input.manifest.jobId),
      generation: input.storedProvider.generation,
      sizeBytes: input.storedProvider.sizeBytes,
      sha256: input.storedProvider.sha256,
      contentType: "application/json",
    },
    segments: input.normalized.segments,
    words: input.normalized.words,
    worker: {
      executionId: input.options.executionId,
      buildId: input.options.buildId,
      imageDigest: input.options.imageDigest,
    },
    completedAt: input.options.now().toISOString(),
  };
}

function joinPunctuatedWords(words: CaptureTranscriptWordAnchor[]) {
  return words.reduce((result, word) => {
    if (!result) return word.punctuatedWord;
    return /^[,.;:!?%)\]}]/.test(word.punctuatedWord)
      ? `${result}${word.punctuatedWord}`
      : `${result} ${word.punctuatedWord}`;
  }, "");
}

function minimumConfidence(words: CaptureTranscriptWordAnchor[]) {
  const values = words
    .map((word) => word.confidence)
    .filter((value): value is number => value != null);
  return values.length > 0 ? Math.min(...values) : null;
}

function providerSpeakerLabel(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? `Speaker ${String(value).trim()}`
    : null;
}

function confidence(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function positiveIntegerOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function googleDurationSeconds(value: unknown) {
  if (typeof value !== "string" || !/^[0-9]+(?:\.[0-9]{1,9})?s$/.test(value)) {
    return null;
  }
  return nonNegativeNumber(value.slice(0, -1));
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPreconditionFailure(error: unknown) {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const code = Number(
    candidate?.code ?? candidate?.status ?? candidate?.response?.status,
  );
  return code === 409 || code === 412;
}

export function captureTranscriptQueuePrefix() {
  return `${CAPTURE_TRANSCRIPT_QUEUE_PREFIX}/`;
}
