import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assessStudioSourceTranscriptQuality,
  newStudioSourceTranscriptJob,
  parseStudioSourceTranscriptResult,
} from "../packages/quipsly-media-processing/src/studio-source-transcript.ts";
import {
  STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND,
  compileWhisperTerminologyPrompt,
  parseStudioTranscriptTerminologySnapshot,
} from "../packages/quipsly-media-processing/src/transcript-terminology.ts";
import {
  buildWhisperCliArguments,
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
      version: null,
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

function fixtureTerminology() {
  const terms = [
    { id: "term_quipsly_001", revision: 2, canonicalText: "Quipsly", aliases: ["Quip-sly"], category: "brand", pronunciationHint: "quip-slee", contextHint: "Product name", priority: 100 },
    { id: "term_homer_0001", revision: 1, canonicalText: "Homer", aliases: ["Scott Sparrow"], category: "person", pronunciationHint: null, contextHint: "High Ground Odyssey co-host", priority: 90 },
  ];
  const compiled = compileWhisperTerminologyPrompt(terms);
  const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
  return parseStudioTranscriptTerminologySnapshot({
    kind: STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND,
    projectId: "project_fixture_001",
    compiledAt: "2026-08-04T14:00:00.000Z",
    revisionToken: digest("term_quipsly_001:2\nterm_homer_0001:1"),
    termsSha256: digest(JSON.stringify(terms)),
    terms,
    providerInput: {
      provider: "openai-whisper-local",
      mode: "initial-prompt-first-window",
      promptText: compiled.promptText,
      promptSha256: digest(compiled.promptText),
      includedTermIds: compiled.includedTermIds,
      omittedTermIds: compiled.omittedTermIds,
      maxCharacters: 1_000,
    },
    boundaries: {
      vocabularyIsProviderContextNotTruth: true,
      providerEvidenceRemainsImmutable: true,
      historicalTranscriptsAreNotRewritten: true,
      measuredAccuracyRequiredBeforeDefaultRouting: true,
    },
  });
}

test("compiles a bounded deterministic Whisper prompt without turning aliases into output spellings", () => {
  const terminology = fixtureTerminology();
  assert.equal(terminology.providerInput.promptText, "Preferred spellings and names: Quipsly; Homer.");
  assert.deepEqual(terminology.providerInput.includedTermIds, ["term_quipsly_001", "term_homer_0001"]);
  assert.equal(terminology.providerInput.promptText.includes("Scott Sparrow"), false);
});

test("normalizes provider timing without inventing speakers or segment confidence", () => {
  const result = normalizeWhisperJson(fixtureWhisper());
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].confidence, null);
  assert.equal(result.words.length, 3);
  assert.equal(result.words[2].word, "Quipsly");
  assert.equal(result.words[2].speakerLabel, null);
});

test("flags physically implausible low-confidence provider output without deleting its evidence", () => {
  const raw = Buffer.from(JSON.stringify({
    language: "en",
    segments: [{
      start: 11.90,
      end: 11.98,
      text: "Heestful of the New York City",
      words: [
        { start: 11.90, end: 11.94, word: " Heestful", probability: 0.002 },
        { start: 11.94, end: 11.96, word: " of", probability: 0.09 },
        { start: 11.96, end: 11.96, word: " the", probability: 0.28 },
        { start: 11.96, end: 11.96, word: " New", probability: 0.002 },
        { start: 11.96, end: 11.98, word: " York", probability: 0.15 },
        { start: 11.98, end: 11.98, word: " City", probability: 0.13 },
      ],
    }],
  }));
  const normalized = normalizeWhisperJson(raw);
  const assessment = assessStudioSourceTranscriptQuality(normalized.segments, normalized.words);
  assert.equal(assessment.disposition, "review-required");
  assert.deepEqual(assessment.warnings, [
    "implausible-timing-density",
    "collapsed-word-timing",
    "very-low-provider-confidence",
  ]);
  assert.equal(assessment.boundaries.providerOutputRemainsInspectible, true);
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

test("worker passes the frozen terminology prompt and binds its receipt to the exact snapshot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-studio-terminology-test-"));
  try {
    const sourcePath = path.join(root, "source.wav");
    const bytes = Buffer.from("immutable-terminology-audio");
    await writeFile(sourcePath, bytes);
    const terminology = fixtureTerminology();
    const job = fixtureJob(sourcePath, bytes, { terminology });
    let providerInput = null;
    let receipt = null;
    const store = {
      claim: async () => ({ id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_terminology_001" }),
      complete: async (input) => { receipt = input.receipt; return true; },
      retry: async () => { throw new Error("unexpected retry"); },
      fail: async () => { throw new Error("unexpected fail"); },
    };
    const provider = { transcribe: async (input) => { providerInput = input; return normalizeWhisperJson(fixtureWhisper()); } };
    const result = await runOneLocalStudioTranscriptJob(store, provider, {
      executionId: "execution_terminology_001",
      buildId: "test-build",
      imageDigest: null,
      leaseMs: 60_000,
      localMediaRoot: root,
      evidenceRoot: path.join(root, "transcripts"),
      now: () => new Date("2026-08-04T14:05:00.000Z"),
    });
    assert.equal(result.disposition, "completed");
    assert.equal(providerInput.terminologyPrompt, terminology.providerInput.promptText);
    const parsed = parseStudioSourceTranscriptResult(receipt, job);
    assert.equal(parsed.provider.terminology.snapshotSha256, terminology.termsSha256);
    assert.equal(parsed.provider.terminology.promptSha256, terminology.providerInput.promptSha256);
    assert.equal(parsed.provider.terminology.termCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Whisper receives terminology once without carrying it through every decoding window", () => {
  const args = buildWhisperCliArguments({
    sourcePath: "/tmp/source.wav",
    model: "large-v3-turbo",
    language: "en",
    terminologyPrompt: "Preferred spellings and names: Quipsly; Homer.",
    device: "cpu",
    outputDirectory: "/tmp/quipsly-whisper",
  });
  assert.deepEqual(args.slice(-4), ["--language", "en", "--initial_prompt", "Preferred spellings and names: Quipsly; Homer."]);
  assert.equal(args.includes("--carry_initial_prompt"), false);
  assert.equal(args.includes("--condition_on_previous_text"), true);
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
