import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranscriptCriticalTerminologyReference,
  evaluateTranscriptCriticalTerminology,
  parseTranscriptCriticalTerminologyReference,
} from "../packages/quipsly-media-processing/src/transcript-terminology-evaluation.ts";

const words = (text) => text.split(/\s+/).map((value) => ({ text: value, startSeconds: null, endSeconds: null, speakerId: null }));
const terms = [
  { id: "term-quipsly", revision: 2, canonicalText: "Quipsly", aliases: ["Quips Lee"], category: "brand", priority: 100 },
  { id: "term-hgo", revision: 1, canonicalText: "High Ground Odyssey", aliases: ["HGO"], category: "title", priority: 90 },
  { id: "term-homer", revision: 1, canonicalText: "Homer", aliases: [], category: "person", priority: 80 },
];

test("freezes referenced and absent prompt terms without leaking metric drift", () => {
  const reference = buildTranscriptCriticalTerminologyReference({
    revisionToken: "revision-1",
    termsSha256: "a".repeat(64),
    terms,
    referenceWords: words("Welcome to Quipsly and High Ground Odyssey"),
  });
  assert.ok(reference);
  assert.equal(reference.promptTermCount, 3);
  assert.equal(reference.referenceTermCount, 2);
  assert.equal(reference.referenceOccurrenceCount, 2);
  assert.deepEqual(parseTranscriptCriticalTerminologyReference(reference), reference);
});

test("measures concept recall, preferred spelling, and prompted hallucinations separately", () => {
  const reference = buildTranscriptCriticalTerminologyReference({
    revisionToken: "revision-1",
    termsSha256: "a".repeat(64),
    terms,
    referenceWords: words("Quipsly belongs in the High Ground Odyssey workflow"),
  });
  const baseline = evaluateTranscriptCriticalTerminology(reference, words("Quips Lee belongs in the workflow and Homer agrees"));
  assert.deepEqual(baseline, {
    promptTermCount: 3,
    referenceTermCount: 2,
    referenceOccurrenceCount: 2,
    candidateMentionCount: 2,
    matchedOccurrenceCount: 1,
    missedOccurrenceCount: 1,
    falsePositiveMentionCount: 1,
    canonicalCandidateMentionCount: 1,
    conceptRecall: 0.5,
    conceptPrecision: 0.5,
    preferredSpellingRate: 0.5,
  });

  const prompted = evaluateTranscriptCriticalTerminology(reference, words("Quipsly belongs in the High Ground Odyssey workflow"));
  assert.equal(prompted?.conceptRecall, 1);
  assert.equal(prompted?.conceptPrecision, 1);
  assert.equal(prompted?.preferredSpellingRate, 1);
  assert.equal(prompted?.falsePositiveMentionCount, 0);
});

test("rejects a terminology receipt whose aggregate counts changed", () => {
  const reference = buildTranscriptCriticalTerminologyReference({ revisionToken: "revision-1", termsSha256: "a".repeat(64), terms, referenceWords: words("Quipsly") });
  assert.throws(() => parseTranscriptCriticalTerminologyReference({
    ...reference,
    referenceOccurrenceCount: reference.referenceOccurrenceCount + 1,
  }), /does not match/);
});
