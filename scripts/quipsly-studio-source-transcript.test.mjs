import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  newStudioSourceTranscriptJob,
  parseStudioSourceTranscriptResult,
} from "../packages/quipsly-media-processing/src/studio-source-transcript.ts";
import {
  normalizeWhisperJson,
  runOneLocalStudioTranscriptJob,
} from "../apps/quipsly-media-processor/src/local-studio-transcript-worker.ts";

function fixtureJob(sourcePath, bytes, overrides = {}) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return newStudioSourceTranscriptJob({
    jobId: "studio_transcript_fixture_001",
    transcriptJobId: "transcript_fixture_001",
    projectId: "project_fixture_001",
    episodeProductionId: "episode_fixture_001",
    episodeSlug: "episode-8",
    sourceId: "source_fixture_001",
    requestedByEmail: "charlie@quipsly.com",
    queuedAt: "2026-08-04T14:00:00.000Z",
    source: {
      assetId: "asset_fixture_001",
      provider: "local",
      locator: sourcePath,
      generation: `sha256:${sha256}`,
      sha256,
      sizeBytes: bytes.length,
      contentType: "audio/wav",
    },
    authorization: {
      kind: "participant-consent-confirmed",
      statementVersion: "quipsly-studio-transcription-authorization-v1",
      accepted: true,
      acceptedAt: "2026-08-04T14:00:00.000Z",
      acceptedByEmail: "charlie@quipsly.com",
      importRole: "spine-audio",
      purpose: "episode-production-transcription-and-review",
    },
    provider: {
      name: "openai-whisper-local",
      model: "large-v3-turbo",
      language: "en",
      wordTimestamps: true,
      speakerDiarization: false,
    },
    ...overrides,
  });
}

function fixtureWhisper() {
  return Buffer.from(JSON.stringify({
    language: "en",
    text: "Welcome to Quipsly.",
    segments: [{
      start: 0.2,
      end: 1.4,
      text: "Welcome to Quipsly.",
      words: [
        { start: 0.2, end: 0.7, word: " Welcome", probability: 0.98 },
        { start: 0.72, end: 0.9, word: " to", probability: 0.96 },
        { start: 0.92, end: 1.4, word: " Quipsly.", probability: 0.88 },
      ],
    }],
  }));
}

test("normalizes provider timing without inventing speakers or segment confidence", () => {
  const result = normalizeWhisperJson(fixtureWhisper());
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].confidence, null);
  assert.equal(result.words.length, 3);
  assert.equal(result.words[2].word, "Quipsly");
  assert.equal(result.words[2].speakerLabel, null);
});

test("expands a provider segment to retain an outlying timed word without interpolation", () => {
  const raw = Buffer.from(JSON.stringify({
    language: "en",
    segments: [{
      start: 1,
      end: 2,
      text: "Exact timing",
      words: [
        { start: 0.92, end: 1.4, word: " Exact", probability: 0.9 },
        { start: 1.42, end: 2.08, word: " timing", probability: 0.8 },
      ],
    }],
  }));
  const result = normalizeWhisperJson(raw);
  assert.equal(result.segments[0].startSeconds, 0.92);
  assert.equal(result.segments[0].endSeconds, 2.08);
  assert.equal(result.words[0].startSeconds, 0.92);
  assert.equal(result.words[1].endSeconds, 2.08);
});

test("worker retains raw evidence and emits a source-bound output-ready receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-studio-transcript-test-"));
  try {
    const sourcePath = path.join(root, "source.wav");
    const bytes = Buffer.from("immutable-audio-fixture");
    await writeFile(sourcePath, bytes);
    const job = fixtureJob(sourcePath, bytes);
    let receipt = null;
    const store = {
      claim: async () => ({ id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_fixture_001" }),
      complete: async (input) => { receipt = input.receipt; return true; },
      retry: async () => { throw new Error("unexpected retry"); },
      fail: async () => { throw new Error("unexpected fail"); },
    };
    const provider = { transcribe: async () => normalizeWhisperJson(fixtureWhisper()) };
    const result = await runOneLocalStudioTranscriptJob(store, provider, {
      executionId: "execution_fixture_001",
      buildId: "test-build",
      imageDigest: null,
      leaseMs: 60_000,
      localMediaRoot: root,
      evidenceRoot: path.join(root, "transcripts"),
      now: () => new Date("2026-08-04T14:05:00.000Z"),
    });
    assert.deepEqual(result, { disposition: "completed", jobId: job.jobId, segmentCount: 1, wordCount: 3 });
    const parsed = parseStudioSourceTranscriptResult(receipt, job);
    assert.equal(parsed.coverage.confidenceWordCount, 3);
    assert.equal(parsed.coverage.speakerLabeledWordCount, 0);
    assert.equal(parsed.boundaries.completeSourceRead, true);
    assert.equal(parsed.boundaries.createsNoTasksGoalsOrEdits, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("worker fails closed when source bytes no longer match the queued receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-studio-transcript-drift-"));
  try {
    const sourcePath = path.join(root, "source.wav");
    const original = Buffer.from("original-bytes");
    const job = fixtureJob(sourcePath, original);
    await writeFile(sourcePath, Buffer.from("changed-bytes"));
    let failure = null;
    const store = {
      claim: async () => ({ id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_fixture_002" }),
      complete: async () => { throw new Error("unexpected complete"); },
      retry: async () => { throw new Error("unexpected retry"); },
      fail: async (input) => { failure = input; return true; },
    };
    const result = await runOneLocalStudioTranscriptJob(store, { transcribe: async () => normalizeWhisperJson(fixtureWhisper()) }, {
      executionId: "execution_fixture_002",
      buildId: "test-build",
      imageDigest: null,
      leaseMs: 60_000,
      localMediaRoot: root,
      evidenceRoot: path.join(root, "transcripts"),
      now: () => new Date("2026-08-04T14:05:00.000Z"),
    });
    assert.equal(result.disposition, "failed");
    assert.equal(result.code, "studio-transcript-source-byte-mismatch");
    assert.equal(failure.code, "studio-transcript-source-byte-mismatch");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
