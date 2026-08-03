import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranscriptEvaluationReport,
  evaluateTranscriptCandidate,
  parseTranscriptEvaluationCorpus,
} from "../packages/quipsly-media-processing/src/transcript-evaluation.ts";
import { renderTranscriptEvaluationReportHtml } from "../packages/quipsly-media-processing/src/transcript-evaluation-report-html.ts";

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
  assert.equal(report.version, 2);
  assert.equal(report.coverage.complete, false);
  assert.equal(report.workloads[0].workload, "podcast");
  assert.equal(report.workloads[0].providers[0].thresholdAssessment.status, "insufficient-evidence");

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("private coaching phrase"), false);
  assert.equal(serialized.includes("Coach Charlie"), false);
  assert.equal(serialized.includes("Client Homer"), false);
  assert.equal(serialized.includes("reviewer@example.com"), false);
  assert.equal(serialized.includes("developers.deepgram.com"), false);
});

test("requires explicit v2 workload, condition, and provider capabilities", () => {
  const corpus = fixture();
  delete corpus.windows[0].workload;
  assert.throws(() => parseTranscriptEvaluationCorpus(corpus), /window\.workload/);

  const missingCapability = fixture();
  delete missingCapability.windows[0].candidates[0].speakerAttribution;
  assert.throws(() => parseTranscriptEvaluationCorpus(missingCapability), /speakerAttribution/);
});

test("passes thresholds only after every podcast and coaching condition succeeds", () => {
  const corpus = completeFixture();
  const report = buildTranscriptEvaluationReport(corpus, "2026-08-01T18:00:00.000Z");
  assert.equal(report.coverage.complete, true);
  assert.equal(report.coverage.unclassifiedWindowCount, 0);
  assert.equal(report.workloads.length, 2);
  for (const workload of report.workloads) {
    assert.equal(workload.coverage.complete, true);
    assert.equal(workload.providers[0].thresholdAssessment.status, "pass");
    assert.equal(workload.providers[0].thresholdAssessment.cleanWordErrorRate.status, "pass");
    assert.equal(workload.providers[0].thresholdAssessment.difficultWordErrorRate.status, "pass");
    assert.equal(workload.providers[0].thresholdAssessment.speakerErrorRate.status, "pass");
  }
});

test("reports unsupported speaker and non-word timing evidence as unavailable", () => {
  const corpus = completeFixture();
  for (const window of corpus.windows) {
    Object.assign(window.candidates[0], {
      providerKey: "apple-on-device",
      providerName: "Apple SpeechTranscriber",
      model: "speech-transcriber",
      speakerAttribution: "unavailable",
      timingGranularity: "segment",
    });
  }
  const report = buildTranscriptEvaluationReport(corpus, "2026-08-01T18:00:00.000Z");
  const provider = report.workloads[0].providers[0];
  assert.equal(provider.speakerMetrics, null);
  assert.equal(provider.timingMetrics, null);
  assert.equal(provider.thresholdAssessment.speakerErrorRate.status, "insufficient-evidence");
  assert.ok(provider.thresholdAssessment.reasons.includes("speaker-attribution-unavailable"));
});

test("fails a measured threshold and fails closed on a missing provider window", () => {
  const failingCorpus = completeFixture();
  failingCorpus.windows.find((window) => window.conditions.includes("watched-clip-bleed"))
    .candidates[0].words = [word("entirely wrong", 0, "speaker-0")];
  const failingReport = buildTranscriptEvaluationReport(failingCorpus, "2026-08-01T18:00:00.000Z");
  const failingProvider = failingReport.workloads.find((entry) => entry.workload === "podcast").providers[0];
  assert.equal(failingProvider.thresholdAssessment.difficultWordErrorRate.status, "fail");
  assert.equal(failingProvider.thresholdAssessment.status, "fail");

  const missingCorpus = completeFixture();
  for (const window of missingCorpus.windows) {
    window.candidates.push({
      ...structuredClone(window.candidates[0]),
      providerKey: "second-provider",
      providerName: "Second Provider",
    });
  }
  missingCorpus.windows[0].candidates = missingCorpus.windows[0].candidates.filter((candidate) => (
    candidate.providerKey !== "second-provider"
  ));
  const missingReport = buildTranscriptEvaluationReport(missingCorpus, "2026-08-01T18:00:00.000Z");
  const missingProvider = missingReport.workloads.find((entry) => entry.workload === "podcast")
    .providers.find((provider) => provider.providerKey === "second-provider");
  assert.equal(missingProvider.missingCandidateWindowCount, 1);
  assert.equal(missingProvider.thresholdAssessment.status, "insufficient-evidence");
  assert.ok(missingProvider.thresholdAssessment.reasons.includes("provider-did-not-succeed-on-every-workload-window"));
});

test("reads legacy v1 corpora without inventing mixed-workload classification", () => {
  const corpus = fixture();
  corpus.kind = "quipsly-private-transcript-evaluation-corpus-v1";
  corpus.version = 1;
  for (const window of corpus.windows) {
    delete window.workload;
    delete window.conditions;
    for (const candidate of window.candidates) {
      delete candidate.speakerAttribution;
      delete candidate.timingGranularity;
    }
  }
  const parsed = parseTranscriptEvaluationCorpus(corpus);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.windows[0].workload, "unknown");
  const report = buildTranscriptEvaluationReport(parsed, "2026-08-01T18:00:00.000Z");
  assert.equal(report.coverage.unclassifiedWindowCount, 2);
  assert.equal(report.coverage.complete, false);
});

test("renders an accessible privacy-safe operator review without private text", () => {
  const corpus = fixture();
  for (const window of corpus.windows) {
    window.candidates[0].providerName = "<script>alert-1</script>";
  }
  const report = buildTranscriptEvaluationReport(corpus, "2026-08-01T18:00:00.000Z");
  const html = renderTranscriptEvaluationReportHtml(report);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("podcast evidence"));
  assert.ok(html.includes("coaching evidence"));
  assert.ok(html.includes("Coverage incomplete"));
  assert.equal(html.includes("private coaching phrase"), false);
  assert.equal(html.includes("reviewer@example.com"), false);
  assert.equal(html.includes("<script>alert-1</script>"), false);
  assert.ok(html.includes("&lt;script&gt;alert-1&lt;/script&gt;"));
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
    speakerAttribution: "word",
    timingGranularity: "word",
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
    kind: "quipsly-private-transcript-evaluation-corpus-v2",
    version: 2,
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
        workload: "podcast",
        conditions: ["clean-charlie-speech"],
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
        workload: "coaching",
        conditions: ["coach-client-turn-taking"],
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

function completeFixture() {
  const corpus = fixture();
  const conditions = {
    podcast: [
      "clean-charlie-speech",
      "clean-homer-speech",
      "normal-exchange",
      "overlap-or-interruption",
      "watched-clip-bleed",
      "degraded-remote-audio",
    ],
    coaching: [
      "coach-client-turn-taking",
      "names-and-domain-terms",
      "commitments-and-dates",
      "interruption-or-emotional-speech",
      "quiet-or-distant-voice",
      "noisy-or-recovery-prone-capture",
    ],
  };
  const template = corpus.windows[0];
  const digestCharacters = "abcdef0123456789";
  corpus.windows = Object.entries(conditions).flatMap(([workload, workloadConditions]) => (
    workloadConditions.map((condition, index) => ({
      ...structuredClone(template),
      windowId: `${workload}-${String(index + 1).padStart(3, "0")}`,
      sourceSha256: sha(digestCharacters[index + (workload === "coaching" ? 6 : 0)]),
      durationSeconds: 60,
      workload,
      conditions: [condition],
      reference: {
        ...structuredClone(template.reference),
        revisionId: `${workload}-reference-${index + 1}`,
        contentSha256: sha(digestCharacters[index + (workload === "coaching" ? 6 : 0) + 1]),
      },
      candidates: template.candidates.map((candidate) => ({
        ...structuredClone(candidate),
        providerReceiptSha256: sha(digestCharacters[index + (workload === "coaching" ? 6 : 0) + 2]),
        words: structuredClone(template.reference.words).map((entry, wordIndex) => ({
          ...entry,
          speakerId: wordIndex === 0 ? "speaker-0" : "speaker-1",
        })),
      })),
    }))
  ));
  return corpus;
}
