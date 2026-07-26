#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  LONG_SOURCE_QUEUE_CONTRACT,
  buildLongSourceQueueObjectName,
  claimLongSourceVerification,
  newLongSourceQueuedState,
  parseLongSourceQueueReceipt,
  parseLongSourceWorkerManifest,
} from "../packages/quipsly-capture-verification/src/index.ts";
import {
  processLongSourceQueueObject,
  runLongSourceWorker,
} from "../apps/quipsly-media-verifier/src/worker.ts";

const uploadSessionId = "9d8c0c81-847f-4e16-96d0-26b494c890aa";
const manifestObjectName =
  `media-vault/control/mobile-capture-resumable/${uploadSessionId}.json`;
const queueObjectName = buildLongSourceQueueObjectName(uploadSessionId);
const expectedSizeBytes = 3 * 1024 * 1024 * 1024;
const sha256 = createHash("sha256").update("fixture").digest("hex");
const consentVersion = createHash("sha256").update("consent").digest("hex");
const objectName =
  `media-vault/recordings/mobile/room/participant/${uploadSessionId}/source.mov`;
const queuedAt = "2026-07-26T22:00:00.000Z";

function queueReceipt() {
  return {
    kind: LONG_SOURCE_QUEUE_CONTRACT,
    version: 1,
    uploadSessionId,
    manifestObjectName,
    manifestGeneration: "5",
    enqueuedAt: queuedAt,
  };
}

function manifest() {
  return {
    kind: "quipsly-mobile-capture-gcs-resumable-v2",
    version: 2,
    status: "verifying",
    uploadSessionId,
    sourceType: "video",
    expectedSizeBytes,
    sha256,
    contentType: "video/quicktime",
    bucketName: "private-media",
    objectName,
    actorUserId: "actor-1",
    projectId: "project-1",
    projectSlug: "high-ground-odyssey",
    recordingConsentId: "consent-1",
    captureId: uploadSessionId,
    startReceiptId: "start-1",
    consentVersion,
    processingDisposition: "eligible",
    roomReadinessBindingVersion: 1,
    updatedAt: queuedAt,
    longSourceVerification: newLongSourceQueuedState({
      uploadSessionId,
      objectGeneration: "19",
      queuedAt,
    }),
  };
}

function sourceEvidence(overrides = {}) {
  return {
    bucketName: "private-media",
    objectName,
    generation: "19",
    sizeBytes: expectedSizeBytes,
    contentType: "video/quicktime",
    crc32c: "crc-fixture",
    md5Hash: "md5-fixture",
    customMetadata: {
      quipslyContract: "quipsly-mobile-capture-gcs-resumable-v2",
      quipslyUploadSessionId: uploadSessionId,
      quipslyActorUserId: "actor-1",
      quipslyProjectId: "project-1",
      quipslyProjectSlug: "high-ground-odyssey",
      quipslyRecordingConsentId: "consent-1",
      quipslyCaptureId: uploadSessionId,
      quipslyStartReceiptId: "start-1",
      quipslyConsentVersion: consentVersion,
      quipslyProcessingDisposition: "eligible",
      quipslyRoomReadinessBindingVersion: "1",
      quipslyExpectedSizeBytes: String(expectedSizeBytes),
      quipslyExpectedSha256: sha256,
    },
    ...overrides,
  };
}

class FakeStorage {
  constructor({
    hash = { sha256, streamedBytes: expectedSizeBytes },
    evidence = sourceEvidence(),
    transientHashError = null,
    failFirstSavePrecondition = false,
  } = {}) {
    this.objects = new Map([
      [
        queueObjectName,
        { value: queueReceipt(), generation: "7" },
      ],
      [
        manifestObjectName,
        { value: manifest(), generation: "5" },
      ],
    ]);
    this.hash = hash;
    this.evidence = evidence;
    this.transientHashError = transientHashError;
    this.failFirstSavePrecondition = failFirstSavePrecondition;
    this.hashCalls = 0;
    this.deadLetters = [];
  }

  async listQueueObjects(limit) {
    return [...this.objects.entries()]
      .filter(([name]) => name.startsWith(`${queueObjectName.slice(0, -41)}`))
      .slice(0, limit)
      .map(([name, stored]) => ({ name, generation: stored.generation }));
  }

  async loadJson(name, generation) {
    const stored = this.objects.get(name);
    if (!stored || (generation && stored.generation !== generation)) {
      const error = new Error("not found");
      error.code = 404;
      throw error;
    }
    return structuredClone(stored);
  }

  async saveJson(name, value, ifGenerationMatch) {
    if (this.failFirstSavePrecondition) {
      this.failFirstSavePrecondition = false;
      const error = new Error("precondition");
      error.code = 412;
      throw error;
    }
    const stored = this.objects.get(name);
    if (!stored || stored.generation !== String(ifGenerationMatch)) {
      const error = new Error("precondition");
      error.code = 412;
      throw error;
    }
    const next = {
      value: structuredClone(value),
      generation: String(Number(stored.generation) + 1),
    };
    this.objects.set(name, next);
    return structuredClone(next);
  }

  async sourceObjectEvidence() {
    return structuredClone(this.evidence);
  }

  async hashSourceObject() {
    this.hashCalls += 1;
    if (this.transientHashError) throw this.transientHashError;
    return structuredClone(this.hash);
  }

  async deleteObject(name, generation) {
    const stored = this.objects.get(name);
    if (stored?.generation === String(generation)) this.objects.delete(name);
  }

  async writeDeadLetter(name, value, sourceQueueGeneration) {
    this.deadLetters.push({ name, value, sourceQueueGeneration });
  }
}

const options = {
  executionId: "execution-1",
  buildId: "committed-sha",
  imageDigest: "sha256:image",
  leaseDurationMs: 86_400_000,
  now: () => new Date("2026-07-26T22:05:00.000Z"),
};

test("queue and manifest parsers reject path and authority drift", () => {
  assert.equal(
    parseLongSourceQueueReceipt(queueReceipt()).uploadSessionId,
    uploadSessionId,
  );
  assert.throws(
    () =>
      parseLongSourceQueueReceipt({
        ...queueReceipt(),
        manifestObjectName: "../private/source",
      }),
    /invalid/,
  );
  assert.equal(
    parseLongSourceWorkerManifest(manifest(), uploadSessionId)
      .roomReadinessBindingVersion,
    1,
  );
  assert.throws(
    () =>
      parseLongSourceWorkerManifest(
        { ...manifest(), startReceiptId: null },
        uploadSessionId,
      ),
    /invalid/,
  );
});

test("expired claims are recoverable while active claims are not duplicated", () => {
  const queued = manifest().longSourceVerification;
  const first = claimLongSourceVerification({
    state: queued,
    leaseId: "lease-1",
    executionId: "execution-1",
    now: new Date("2026-07-26T22:05:00.000Z"),
    leaseDurationMs: 60_000,
  });
  assert.ok(first);
  assert.equal(
    claimLongSourceVerification({
      state: first,
      leaseId: "lease-2",
      executionId: "execution-2",
      now: new Date("2026-07-26T22:05:30.000Z"),
      leaseDurationMs: 60_000,
    }),
    null,
  );
  const recovered = claimLongSourceVerification({
    state: first,
    leaseId: "lease-2",
    executionId: "execution-2",
    now: new Date("2026-07-26T22:06:01.000Z"),
    leaseDurationMs: 60_000,
  });
  assert.equal(recovered?.lease?.attempt, 2);
});

test("worker verifies one immutable generation and removes queue only after commit", async () => {
  const storage = new FakeStorage();
  const result = await processLongSourceQueueObject(
    storage,
    options,
    { name: queueObjectName, generation: "7" },
  );
  assert.deepEqual(result, {
    disposition: "verified",
    uploadSessionId,
    streamedBytes: expectedSizeBytes,
  });
  assert.equal(storage.hashCalls, 1);
  assert.equal(storage.objects.has(queueObjectName), false);
  const stored = storage.objects.get(manifestObjectName).value;
  assert.equal(stored.longSourceVerification.status, "bytes-verified");
  assert.equal(
    stored.longSourceVerification.evidence.computedSha256,
    sha256,
  );
  assert.equal(stored.longSourceVerification.evidence.generation, "19");
});

test("lost manifest claim never hashes or deletes the durable queue", async () => {
  const storage = new FakeStorage({ failFirstSavePrecondition: true });
  const result = await processLongSourceQueueObject(
    storage,
    options,
    { name: queueObjectName, generation: "7" },
  );
  assert.equal(result.disposition, "claim-lost");
  assert.equal(storage.hashCalls, 0);
  assert.equal(storage.objects.has(queueObjectName), true);
});

test("stale queue generation is quarantined and can be recreated by Nest", async () => {
  const storage = new FakeStorage();
  storage.objects.get(queueObjectName).value.manifestGeneration = "4";
  const results = await runLongSourceWorker(storage, options, 8);
  assert.deepEqual(results, [{
    disposition: "terminal",
    uploadSessionId,
    code: "queue-manifest-generation-mismatch",
  }]);
  assert.equal(storage.hashCalls, 0);
  assert.equal(storage.deadLetters.length, 1);
  assert.equal(storage.objects.has(queueObjectName), false);
  assert.equal(
    storage.objects.get(manifestObjectName).value.longSourceVerification.status,
    "queued",
  );
});

test("hash mismatch is terminal, dead-lettered, and never byte-verified", async () => {
  const storage = new FakeStorage({
    hash: {
      sha256: createHash("sha256").update("wrong").digest("hex"),
      streamedBytes: expectedSizeBytes,
    },
  });
  const result = await processLongSourceQueueObject(
    storage,
    options,
    { name: queueObjectName, generation: "7" },
  );
  assert.equal(result.disposition, "terminal");
  assert.equal(result.code, "sha256-mismatch");
  assert.equal(storage.deadLetters.length, 1);
  assert.equal(storage.objects.has(queueObjectName), false);
  assert.equal(
    storage.objects.get(manifestObjectName).value.longSourceVerification.status,
    "failed-terminal",
  );
  assert.equal(
    storage.objects.get(manifestObjectName).value.failure.retryable,
    false,
  );
});

test("source metadata drift is terminal before any source bytes are read", async () => {
  const evidence = sourceEvidence();
  evidence.customMetadata.quipslyProjectId = "different-project";
  const storage = new FakeStorage({ evidence });
  const result = await processLongSourceQueueObject(
    storage,
    options,
    { name: queueObjectName, generation: "7" },
  );
  assert.equal(result.disposition, "terminal");
  assert.equal(result.code, "source-object-metadata-mismatch");
  assert.equal(storage.hashCalls, 0);
  assert.equal(storage.deadLetters.length, 1);
});

test("transient stream failure keeps queue and releases its claim for immediate retry", async () => {
  const storage = new FakeStorage({
    transientHashError: new Error("temporary GCS reset"),
  });
  await assert.rejects(
    () => runLongSourceWorker(storage, options, 8),
    /need retry/,
  );
  assert.equal(storage.objects.has(queueObjectName), true);
  assert.equal(
    storage.objects.get(manifestObjectName).value.longSourceVerification.status,
    "queued",
  );
  assert.equal(storage.deadLetters.length, 0);
});
