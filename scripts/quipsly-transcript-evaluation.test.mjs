import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranscriptEvaluationReport,
  evaluateTranscriptCandidate,
  parseTranscriptEvaluationCorpus,
} from "../packages/quipsly-media-processing/src/transcript-evaluation.ts";

const sha = (character) => character.repeat(64);
const word = (text, startSeconds, speakerId) => ({
  text,
  startSeconds,
  endSeconds: startSeconds == null ? null : startSeconds + 0.4,
  speakerId,
});

test("computes edit-distance WER and exact matched-word timing", () => {
  const metrics = evaluateTranscriptCandidate(
    [
      word("Hello", 0, "Charlie"),
      word("there", 1, "Charlie"),
      word("brave", 2, "Homer"),
      word("world", 3, "Homer"),
    ],
    [
      word("hello", 0.1, "speaker-7"),
      word("their", 1.1, "speaker-7"),
      word("world", 3.2, "speaker-9"),
      word("today", 4, "speaker-9"),
    ],
  );
  assert.deepEqual(metrics.words, {
    referenceWordCount: 4,
    candidateWordCount: 4,
    substitutions: 1,
    deletions: 1,
    insertions: 1,
    wordErrorCount: 3,
    wordErrorRate: 0.75,
  });
  assert.equal(metrics.timing.timedWordMatches, 2);
  assert.ok(Math.abs(metrics.timing.meanAbsoluteStartDriftMilliseconds - 150) < 0.001);
  assert.ok(Math.abs(metrics.timing.p95AbsoluteStartDriftMilliseconds - 200) < 0.001);
});

test("maps anonymous provider speakers before measuring confusion", () => {
  const metrics = evaluateTranscriptCandidate(
    [
      word("one", 0, "Charlie"),
      word("two", 1, "Charlie"),
      word("three", 2, "Homer"),
      word("four", 3, "Homer"),
    ],
    [
      word("one", 0, "speaker-7"),
      word("two", 1, "speaker-7"),
      word("three", 2, "speaker-9"),
      word("four", 3, "speaker-7"),
    ],
  );
  assert.deepEqual(metrics.speakers, {
    referenceSpeakerWordMatches: 4,
    candidateSpeakerAttributedMatches: 4,
    speakerConfusions: 1,
    speakerMisses: 0,
    speakerErrorRate: 0.25,
  });
});

test("builds a privacy-safe, version-separated provider report", () => {
  const corpus = fixture();
  const report = buildTranscriptEvaluationReport(
    parseTranscriptEvaluationCorpus(corpus),
    "2026-08-01T18:00:00.000Z",
  );
  assert.equal(report.providers.length, 1);
  const provider = report.providers[0];
  assert.equal(provider.attemptedWindowCount, 2);
  assert.equal(provider.succeededWindowCount, 1);
  assert.equal(provider.failedWindowCount, 1);
  assert.equal(provider.failureCodes[0].code, "provider-timeout");
  assert.equal(provider.failureCodes[0].retryableCount, 1);
  assert.equal(provider.correctionObservationCount, 1);
  assert.equal(provider.correctionElapsedMilliseconds, 42_000);
  assert.equal(provider.costObservationCount, 1);
  assert.equal(provider.estimatedCostUsd, 0.02);
  assert.equal(report.interpretation.universalProviderScore, false);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("private coaching phrase"), false);
  assert.equal(serialized.includes("Coach Charlie"), false);
  assert.equal(serialized.includes("Client Homer"), false);
  assert.equal(serialized.includes("reviewer@example.com"), false);
  assert.equal(serialized.includes("developers.deepgram.com"), false);
});

test("refuses machine transcript drafts as evaluation truth", () => {
  const corpus = fixture();
  corpus.windows[0].reference.approvalStatus = "machine-draft";
  assert.throws(
    () => parseTranscriptEvaluationCorpus(corpus),
    /explicitly human-approved/,
  );
});

function fixture() {
  const identity = {
    providerKey: "deepgram-batch",
    providerName: "Deepgram",
    model: "nova-3",
    adapterVersion: "quipsly-deepgram-v1",
    requestConfigSha256: sha("a"),
  };
  const policy = {
    receiptSha256: sha("b"),
    capturedAt: "2026-08-01T16:00:00.000Z",
    sourceUrl: "https://developers.deepgram.com/docs/data-privacy",
    trainingUsage: "opted-out",
    retentionMode: "time-limited",
    retentionDays: 0,
    processingRegion: "us",
  };
  const reference = {
    approvalStatus: "human-approved",
    revisionId: "human-reference-v1",
    contentSha256: sha("c"),
    approvedAt: "2026-08-01T16:30:00.000Z",
    approvedBy: "reviewer@example.com",
    words: [
      word("private coaching phrase", 0, "Coach Charlie"),
      word("follow through", 1, "Client Homer"),
    ],
  };
  return {
    kind: "quipsly-private-transcript-evaluation-corpus-v1",
    version: 1,
    corpusId: "high-ground-private-corpus",
    revisionId: "corpus-revision-001",
    purpose: "mixed",
    createdAt: "2026-08-01T17:00:00.000Z",
    createdBy: "evaluation-operator@example.com",
    consentReceiptSha256: sha("d"),
    windows: [
      {
        windowId: "podcast-window-001",
        sourceSha256: sha("e"),
        durationSeconds: 60,
        reference,
        candidates: [{
          ...identity,
          outcome: "succeeded",
          completedAt: "2026-08-01T17:10:00.000Z",
          elapsedMilliseconds: 30_000,
          estimatedCostUsd: 0.02,
          policy,
          providerReceiptSha256: sha("f"),
          words: [
            word("private coaching phrase", 0.1, "speaker-0"),
            word("follow through", 1.1, "speaker-1"),
          ],
          correction: {
            observedAt: "2026-08-01T17:20:00.000Z",
            reviewerId: "reviewer@example.com",
            elapsedMilliseconds: 42_000,
            operationCount: 2,
          },
        }],
      },
      {
        windowId: "coaching-window-001",
        sourceSha256: sha("1"),
        durationSeconds: 30,
        reference: {
          ...reference,
          revisionId: "human-reference-v2",
          contentSha256: sha("2"),
        },
        candidates: [{
          ...identity,
          outcome: "failed",
          completedAt: "2026-08-01T17:11:00.000Z",
          elapsedMilliseconds: 180_000,
          estimatedCostUsd: null,
          policy,
          errorCode: "provider-timeout",
          retryable: true,
        }],
      },
    ],
  };
}
