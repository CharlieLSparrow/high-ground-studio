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
  DeepgramTranscriptProvider,
  TranscriptProviderError,
} from "../apps/quipsly-transcript-worker/src/deepgram.ts";
import {
  GoogleSpeechV2TranscriptProvider,
} from "../apps/quipsly-transcript-worker/src/google-speech.ts";
import {
  normalizeDeepgramResponse,
  normalizeGoogleSpeechV2Response,
  processCaptureTranscriptQueueObject,
} from "../apps/quipsly-transcript-worker/src/worker.ts";

const jobId = "transcript_job_001";
const sourceSha256 = "a".repeat(64);
const now = "2026-07-30T18:30:00.000Z";

function providerSource() {
  return {
    signedUrl: "https://storage.example/source",
    gcsUri: "gs://quipsly-media/media-vault/recordings/capture/audio.m4a",
    generation: "101",
  };
}

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

function googleSpeechPayload() {
  return {
    operationName: "projects/high-ground-odyssey/locations/us-central1/operations/op-001",
    response: {
      totalBilledDuration: "3.2s",
      results: {
        "gs://quipsly-media/media-vault/recordings/capture/audio.m4a": {
          metadata: { requestId: "google-request-001" },
          inlineResult: {
            transcript: {
              results: [{
                channelTag: 1,
                alternatives: [{
                  transcript: "Hello world. Reply.",
                  words: [
                    { word: "Hello", startOffset: "0.1s", endOffset: "0.5s", confidence: 0.99, speakerLabel: "1" },
                    { word: "world.", startOffset: "0.55s", endOffset: "1s", confidence: 0.97, speakerLabel: "1" },
                    { word: "Reply.", startOffset: "2.5s", endOffset: "3s", confidence: 0.95, speakerLabel: "2" },
                  ],
                }],
              }],
            },
          },
        },
      },
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
      diarizeModel: "v2",
      multichannel: false,
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

  async transcribe(source, request) {
    this.calls.push({ source, request });
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

test("non-diarized provider words remain source-bindable without invented labels", () => {
  const payload = deepgramPayload();
  for (const word of payload.results.channels[0].alternatives[0].words) {
    delete word.speaker;
  }
  const normalized = normalizeDeepgramResponse(payload);
  assert.deepEqual(normalized.words.map((word) => word.speakerLabel), [null, null, null]);
  assert.deepEqual(normalized.segments.map((segment) => segment.speakerLabel), [null, null]);
});

test("normalizes Google Speech word anchors without losing timeline evidence", () => {
  const normalized = normalizeGoogleSpeechV2Response(googleSpeechPayload());
  assert.equal(normalized.requestId, "google-request-001");
  assert.equal(normalized.durationSeconds, 3.2);
  assert.equal(normalized.channels, 1);
  assert.deepEqual(
    normalized.segments.map((segment) => [
      segment.providerShape,
      segment.speakerLabel,
      segment.text,
    ]),
    [
      ["google-speech-v2-result", "Speaker 1", "Hello world."],
      ["google-speech-v2-result", "Speaker 2", "Reply."],
    ],
  );
});

test("Google Speech uses workload identity, GCS batch input, and polls its receipt", async () => {
  const requests = [];
  const payload = googleSpeechPayload();
  const provider = new GoogleSpeechV2TranscriptProvider({
    projectId: "high-ground-odyssey",
    location: "us-central1",
    authClient: {
      async getRequestHeaders() {
        return { Authorization: "Bearer workload-token" };
      },
    },
    pollIntervalMs: 1,
    fetchImplementation: async (url, init) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1) {
        return new Response(JSON.stringify({ name: payload.operationName }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ done: true, response: payload.response }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const request = {
    ...fixture().manifest.provider,
    name: "google-speech-v2",
    model: "latest_long",
    version: null,
    diarizeModel: null,
    terminology: null,
  };
  const result = await provider.transcribe(providerSource(), request);
  assert.equal(result.requestId, payload.operationName);
  assert.equal(requests.length, 2);
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.files[0].uri, providerSource().gcsUri);
  assert.equal(body.config.features.enableWordTimeOffsets, true);
  assert.equal(body.config.features.enableWordConfidence, undefined);
  assert.equal(body.config.features.diarizationConfig != null, true);
  assert.equal(
    new Headers(requests[0].init.headers).get("authorization"),
    "Bearer workload-token",
  );
});

test("new batch requests use the versioned diarizer without the deprecated boolean", async () => {
  let requestedUrl = "";
  const provider = new DeepgramTranscriptProvider("test-key", async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(deepgramPayload()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  await provider.transcribe(providerSource(), fixture().manifest.provider);
  const query = new URL(requestedUrl).searchParams;
  assert.equal(query.get("diarize_model"), "v2");
  assert.equal(query.has("diarize"), false);
  assert.equal(query.has("multichannel"), false);
});

test("isolated requests skip diarization and submit each frozen keyterm separately", async () => {
  let requestedUrl = "";
  const provider = new DeepgramTranscriptProvider("test-key", async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(deepgramPayload()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const request = {
    ...fixture().manifest.provider,
    version: "2026-05-01.0",
    diarize: false,
    diarizeModel: null,
    terminology: {
      provider: "deepgram",
      mode: "nova-3-keyterm-repeated-parameter",
      snapshotSha256: "b".repeat(64),
      keyterms: ["Quipsly", "High Ground Odyssey"],
      included: [
        { termId: "term_quipsly_001", variant: "canonical", text: "Quipsly", tokenCount: 1 },
        { termId: "term_hgo_0000001", variant: "canonical", text: "High Ground Odyssey", tokenCount: 3 },
      ],
      omittedTermIds: [],
      totalTokenCount: 4,
      maxTokens: 500,
      boundaries: {
        valuesRequireIndependentQueryParameters: true,
        noWeightsApplied: true,
        providerContextIsNotTranscriptTruth: true,
      },
    },
  };
  await provider.transcribe(providerSource(), request);
  const query = new URL(requestedUrl).searchParams;
  assert.equal(query.get("version"), "2026-05-01.0");
  assert.equal(query.has("diarize"), false);
  assert.equal(query.has("diarize_model"), false);
  assert.deepEqual(query.getAll("keyterm"), ["Quipsly", "High Ground Odyssey"]);
});

test("legacy manifests preserve the deprecated request for exact replay", async () => {
  const legacy = structuredClone(fixture().manifest);
  delete legacy.provider.diarizeModel;
  delete legacy.provider.multichannel;
  const parsed = parseCaptureTranscriptManifest(legacy, jobId);
  assert.equal(parsed.provider.diarizeModel, null);
  assert.equal(parsed.provider.multichannel, false);

  let requestedUrl = "";
  const provider = new DeepgramTranscriptProvider("test-key", async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(deepgramPayload()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  await provider.transcribe(providerSource(), parsed.provider);
  const query = new URL(requestedUrl).searchParams;
  assert.equal(query.get("diarize"), "true");
  assert.equal(query.has("diarize_model"), false);
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
  assert.match(provider.calls[0].source.signedUrl, /generation=101/);
  assert.equal(provider.calls[0].source.signedUrl.includes("signature=secret"), true);
  assert.equal(
    provider.calls[0].source.gcsUri,
    "gs://quipsly-media/media-vault/recordings/capture/audio.m4a",
  );
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

test("Google worker uses its GCS source without minting a signed media URL", async () => {
  const storage = new FakeStorage();
  const { queueObjectName, manifestObjectName } = fixture();
  const manifestRow = storage.rows.get(manifestObjectName);
  manifestRow.value = parseCaptureTranscriptManifest({
    ...manifestRow.value,
    provider: {
      ...manifestRow.value.provider,
      name: "google-speech-v2",
      model: "chirp_3",
      version: null,
      diarizeModel: null,
      terminology: null,
    },
  }, jobId);
  const calls = [];
  const provider = {
    async transcribe(source, request) {
      calls.push({ source, request });
      return {
        payload: googleSpeechPayload(),
        requestId: googleSpeechPayload().operationName,
      };
    },
  };
  const result = await processCaptureTranscriptQueueObject(
    storage,
    provider,
    options,
    { name: queueObjectName, generation: "1" },
  );
  assert.equal(result.disposition, "completed");
  assert.equal(storage.signedUrls.length, 0);
  assert.equal(calls[0].source.signedUrl, "");
  assert.equal(
    calls[0].source.gcsUri,
    "gs://quipsly-media/media-vault/recordings/capture/audio.m4a",
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
