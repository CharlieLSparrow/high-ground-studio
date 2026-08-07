import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  DEEPGRAM_KEYTERM_MAX_TOKENS,
  STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND,
  compileDeepgramTerminologyKeyterms,
  compileWhisperTerminologyPrompt,
  parseStudioTranscriptTerminologySnapshot,
} from "../packages/quipsly-media-processing/src/transcript-terminology.ts";

const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");

function snapshot(terms) {
  const prompt = compileWhisperTerminologyPrompt(terms);
  return parseStudioTranscriptTerminologySnapshot({
    kind: STUDIO_TRANSCRIPT_TERMINOLOGY_SNAPSHOT_KIND,
    projectId: "project_fixture_001",
    compiledAt: "2026-08-06T20:00:00.000Z",
    revisionToken: digest(terms.map((term) => `${term.id}:${term.revision}`).join("\n")),
    termsSha256: digest(JSON.stringify(terms)),
    terms,
    providerInput: {
      provider: "openai-whisper-local",
      mode: "initial-prompt-first-window",
      promptText: prompt.promptText,
      promptSha256: digest(prompt.promptText),
      includedTermIds: prompt.includedTermIds,
      omittedTermIds: prompt.omittedTermIds,
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

const terms = [
  { id: "term_quipsly_001", revision: 2, canonicalText: "Quipsly", aliases: ["Quip-sly"], category: "brand", pronunciationHint: "quip-slee", contextHint: "Product name", priority: 100 },
  { id: "term_high_ground", revision: 1, canonicalText: "High Ground Odyssey", aliases: ["HGO"], category: "title", pronunciationHint: null, contextHint: null, priority: 90 },
];

test("projects canonical terms and aliases into separate auditable keyterms", () => {
  const result = compileDeepgramTerminologyKeyterms(snapshot(terms));
  assert.deepEqual(result.keyterms, ["Quipsly", "Quip-sly", "High Ground Odyssey", "HGO"]);
  assert.equal(result.totalTokenCount, 6);
  assert.equal(result.maxTokens, DEEPGRAM_KEYTERM_MAX_TOKENS);
  assert.equal(result.snapshotSha256, digest(JSON.stringify(terms)));
  assert.deepEqual(result.omittedTermIds, []);
  assert.equal(result.boundaries.valuesRequireIndependentQueryParameters, true);
  assert.equal(result.boundaries.providerContextIsNotTranscriptTruth, true);
});

test("deduplicates aliases without losing the canonical term receipt", () => {
  const duplicated = [
    terms[0],
    { ...terms[1], aliases: ["quipsly"] },
  ];
  const result = compileDeepgramTerminologyKeyterms(snapshot(duplicated));
  assert.deepEqual(result.keyterms, ["Quipsly", "Quip-sly", "High Ground Odyssey"]);
  assert.equal(result.included[0].variant, "canonical");
});

test("rejects comma-delimited pseudo lists instead of risking a silent no-op", () => {
  const malformed = [{ ...terms[0], canonicalText: "Quipsly, Homer" }];
  assert.throws(
    () => compileDeepgramTerminologyKeyterms(snapshot(malformed)),
    /unsupported delimiter/,
  );
});
