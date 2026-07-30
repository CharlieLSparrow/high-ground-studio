import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CAPTURE_TRANSCRIPT_QUEUE_KIND,
  buildCaptureTranscriptManifestObjectName,
  buildCaptureTranscriptQueueObjectName,
  buildCaptureTranscriptRawObjectName,
  buildCaptureTranscriptResultObjectName,
  newCaptureTranscriptManifest,
  parseCaptureTranscriptManifest,
  parseCaptureTranscriptResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import {
  TranscriptProviderError,
} from "../apps/quipsly-transcript-worker/src/deepgram.ts";
import {
  normalizeDeepgramResponse,
  processCaptureTranscriptQueueObject,
} from "../apps/quipsly-transcript-worker/src/worker.ts";

const jobId = "transcript_job_001";
const sourceSha256 = "a".repeat(64);
const now = "2026-07-30T18:30:00.000Z";

function deepgramPayload() {
  return {
    metadata: {
      request_id: "deepgram-request-001",
      duration: 4.2,
      channels: 1,
    },
    results: {
      channels: [{
        alternatives: [{
          words: [
            {
              word: "hello",
              punctuated_word: "Hello",
              start: 0.1,
              end: 0.5,
              confidence: 0.99,
              speaker: 0,
            },
            {
              word: "world",
              punctuated_word: "world!",
              start: 0.55,
              end: 1.0,
              confidence: 0.97,
              speaker: 0,
            },
            {
              word: "reply",
              punctuated_word: "Reply.",
              start: 2.5,
              end: 3.0,
              confidence: 0.95,
              speaker: 1,
            },
          ],
        }],
      }],
    },
  };
}

function fixture() {
  const manifest = newCaptureTranscriptManifest({
    jobId,
    actorUserId: "actor_001",
    actorEmail: "charlie@example.com",
    source: {
      bucketName: "quipsly-media",
      objectName: "media-vault/recordings/capture/audio.m4a",
      generation: "101",
      sizeBytes: 2_048,
      sha256: sourceSha256,
      contentType: "audio/m4a",
      roomId: "room_0001",
      recordingAssetId: "recording_001",
    },
    provider: {
      name: "deepgram",
      model: "nova-3",
      language: "en-US",
      smartFormat: true,
      punctuate: true,
      diarize: true,
      utterances: true,
      paragraphs: true,
    },
    queuedAt: now,
    updatedAt: now,
  });
  const manifestObjectName = buildCaptureTranscriptManifestObjectName(jobId);
  const queueObjectName = buildCaptureTranscriptQueueObjectName(jobId);
  const queue = {
    kind: CAPTURE_TRANSCRIPT_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: "1",
    enqueuedAt: now,
  };
  return { manifest, manifestObjectName, queueObjectName, queue };
}

class FakeStorage {
  constructor({ sourceGeneration = "101", priorProviderPayload = null } = {}) {
    const value = fixture();
    this.rows = new Map([
      [value.manifestObjectName, { value: value.manifest, generation: "1" }],
      [value.queueObjectName, { value: value.queue, generation: "1" }],
    ]);
    this.sourceGeneration = sourceGeneration;
    this.deleted = [];
    this.deadLetters = [];
    this.signedUrls = [];
    if (priorProviderPayload) {
      this.rows.set(
        buildCaptureTranscriptRawObjectName(jobId),
        this.providerRow(priorProviderPayload, "7"),
      );
    }
  }

  async listQueueObjects() {
    return [{ name: fixture().queueObjectName, generation: "1" }];
  }

  async loadJson(name, generation) {
    const row = this.rows.get(name);
    if (!row || (generation && generation !== row.generation)) {
      throw Object.assign(new Error("not found"), { code: 404 });
    }
    return structuredClone(row);
  }

  async saveJson(name, value, ifGenerationMatch) {
    const row = this.rows.get(name);
    if (!row || row.generation !== String(ifGenerationMatch)) {
      throw Object.assign(new Error("precondition"), { code: 412 });
    }
    const next = {
      value: structuredClone(value),
      generation: String(Number(row.generation) + 1),
    };
    this.rows.set(name, next);
    return structuredClone(next);
  }

  async saveJsonIfAbsent(name, value) {
    if (!this.rows.has(name)) {
      this.rows.set(name, { value: structuredClone(value), generation: "1" });
    }
    return structuredClone(this.rows.get(name));
  }

  async objectEvidence(name) {
    return {
      bucketName: "quipsly-media",
      objectName: name,
      generation: this.sourceGeneration,
      sizeBytes: 2_048,
      contentType: "audio/m4a",
      customMetadata: {
        quipslyExpectedSha256: sourceSha256,
        quipslyExpectedSizeBytes: "2048",
      },
    };
  }

  async signedReadUrl(name, generation) {
    const url = `https://storage.example/${name}?generation=${generation}&signature=secret`;
    this.signedUrls.push(url);
    return url;
  }

  async loadProviderResponse(name) {
    const row = this.rows.get(name);
    return row ? structuredClone(row) : null;
  }

  async saveProviderResponseIfAbsent(name, value) {
    if (!this.rows.has(name)) {
      this.rows.set(name, this.providerRow(value, "1"));
    }
    return structuredClone(this.rows.get(name));
  }

  providerRow(value, generation) {
    const bytes = Buffer.from(JSON.stringify(value));
    return {
      value: structuredClone(value),
      generation,
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  async deleteObject(name, generation) {
    const row = this.rows.get(name);
    if (row?.generation === String(generation)) this.rows.delete(name);
    this.deleted.push({ name, generation });
  }

  async writeDeadLetter(name, value, sourceQueueGeneration) {
    this.deadLetters.push({ name, value, sourceQueueGeneration });
  }
}

class FakeProvider {
  constructor() {
    this.calls = [];
  }

  async transcribe(sourceUrl, request) {
    this.calls.push({ sourceUrl, request });
    return {
      payload: deepgramPayload(),
      requestId: "deepgram-request-001",
    };
  }
}

const options = {
  executionId: "execution_001",
  buildId: "build_001",
  imageDigest: "sha256:transcript-worker",
  leaseDurationMs: 60_000,
  signedUrlDurationMs: 60_000,
  now: () => new Date("2026-07-30T18:31:00.000Z"),
};

test("normalizes stable word anchors and speaker-aware playback segments", () => {
  const normalized = normalizeDeepgramResponse(deepgramPayload());
  assert.deepEqual(normalized.words.map((word) => word.index), [0, 1, 2]);
  assert.deepEqual(
    normalized.segments.map((segment) => [
      segment.ordinal,
      segment.wordStartIndex,
      segment.wordEndIndexExclusive,
      segment.text,
    ]),
    [
      [0, 0, 2, "Hello world!"],
      [1, 2, 3, "Reply."],
    ],
  );
});

test("worker stores provider evidence, completes once, and retires queue", async () => {
  const storage = new FakeStorage();
  const provider = new FakeProvider();
  const { queueObjectName, manifestObjectName } = fixture();
  const result = await processCaptureTranscriptQueueObject(
    storage,
    provider,
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.deepEqual(result, {
    disposition: "completed",
    jobId,
    wordCount: 3,
  });
  assert.equal(provider.calls.length, 1);
  assert.match(provider.calls[0].sourceUrl, /generation=101/);
  assert.equal(provider.calls[0].sourceUrl.includes("signature=secret"), true);
  assert.equal(storage.rows.has(queueObjectName), false);
  const completed = parseCaptureTranscriptManifest(
    storage.rows.get(manifestObjectName).value,
    jobId,
  );
  assert.equal(completed.status, "completed");
  assert.equal(completed.attemptCount, 1);
  const receipt = parseCaptureTranscriptResult(
    storage.rows.get(buildCaptureTranscriptResultObjectName(jobId)).value,
    completed,
  );
  assert.equal(receipt.words.length, 3);
  assert.equal(receipt.rawProviderResponse.generation, "1");
  assert.equal(
    JSON.stringify(receipt).includes("signature=secret"),
    false,
  );
});

test("transient provider failure releases and retries without invalidating queue receipt", async () => {
  const storage = new FakeStorage();
  let calls = 0;
  const provider = {
    async transcribe() {
      calls += 1;
      if (calls === 1) {
        throw new TranscriptProviderError({
          code: "provider-http-429",
          message: "rate limited",
          retryable: true,
          httpStatus: 429,
        });
      }
      return { payload: deepgramPayload(), requestId: "deepgram-request-001" };
    },
  };
  const { queueObjectName, manifestObjectName } = fixture();
  await assert.rejects(
    processCaptureTranscriptQueueObject(
      storage,
      provider,
      options,
      { name: queueObjectName, generation: "1" },
    ),
    /rate limited/,
  );
  let manifest = parseCaptureTranscriptManifest(
    storage.rows.get(manifestObjectName).value,
    jobId,
  );
  assert.equal(manifest.status, "queued");
  assert.equal(manifest.attemptCount, 1);

  const result = await processCaptureTranscriptQueueObject(
    storage,
    provider,
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.equal(result.disposition, "completed");
  manifest = parseCaptureTranscriptManifest(
    storage.rows.get(manifestObjectName).value,
    jobId,
  );
  assert.equal(manifest.attemptCount, 2);
});

test("worker resumes a stored provider receipt without another billable request", async () => {
  const storage = new FakeStorage({ priorProviderPayload: deepgramPayload() });
  const provider = new FakeProvider();
  const { queueObjectName } = fixture();
  const result = await processCaptureTranscriptQueueObject(
    storage,
    provider,
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.equal(result.disposition, "completed");
  assert.equal(provider.calls.length, 0);
});

test("source generation drift fails terminal and dead-letters the queue", async () => {
  const storage = new FakeStorage({ sourceGeneration: "102" });
  const provider = new FakeProvider();
  const { queueObjectName, manifestObjectName } = fixture();
  const result = await processCaptureTranscriptQueueObject(
    storage,
    provider,
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.deepEqual(result, {
    disposition: "terminal",
    jobId,
    code: "source-generation-mismatch",
  });
  assert.equal(provider.calls.length, 0);
  assert.equal(storage.deadLetters.length, 1);
  assert.equal(
    parseCaptureTranscriptManifest(
      storage.rows.get(manifestObjectName).value,
      jobId,
    ).status,
    "failed-terminal",
  );
});
