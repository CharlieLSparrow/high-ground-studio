import assert from "node:assert/strict";
import test from "node:test";

import { planTranscriptRouting } from "../packages/quipsly-media-processing/src/transcript-routing.ts";

const SHA = "a".repeat(64);
const TERM_SHA = "b".repeat(64);

function baseInput(topology) {
  return {
    source: {
      sourceId: "source_12345678",
      sha256: SHA,
      sizeBytes: 1_024,
      topology,
    },
    language: "en-US",
    cloudProcessing: "allowed",
    providers: {
      appleOnDeviceAvailable: true,
      deepgramAvailable: true,
      deepgramModelVersion: "2026-05-01.0",
      openAIAvailable: true,
    },
    terminologySnapshotSha256: TERM_SHA,
    includeEvaluationComparisons: true,
  };
}

test("isolated participant audio uses source identity instead of diarization", () => {
  const plan = planTranscriptRouting(baseInput({
    kind: "participant-isolated",
    participantId: "participant_scott",
    participantLabel: "Scott Sparrow",
  }));

  assert.equal(plan.speakerIdentityAuthority.kind, "source-binding");
  assert.equal(plan.primaryAttempt.provider, "apple-speech-on-device");
  assert.equal(plan.primaryAttempt.speakerAttribution, "source-binding");
  assert.equal(plan.primaryAttempt.configuration.audioTimeRange, true);
  assert.deepEqual(
    plan.comparisonAttempts.map((attempt) => attempt.provider),
    ["deepgram", "openai-transcribe"],
  );
  assert.equal(plan.comparisonAttempts[0].configuration.diarize, false);
});

test("mixed-room audio selects pinned diarization and honest comparisons", () => {
  const plan = planTranscriptRouting(baseInput({
    kind: "mixed-room",
    expectedSpeakerCount: 2,
  }));

  assert.equal(plan.speakerIdentityAuthority.kind, "provider-candidate");
  assert.equal(plan.primaryAttempt.provider, "deepgram");
  assert.equal(plan.primaryAttempt.model, "nova-3@2026-05-01.0");
  assert.equal(plan.primaryAttempt.configuration.diarizeModel, "v2");
  assert.equal(plan.primaryAttempt.terminology.mode, "keyterm-snapshot");
  assert.deepEqual(
    plan.comparisonAttempts.map((attempt) => attempt.provider),
    ["openai-transcribe", "openai-diarized"],
  );
  assert.equal(plan.comparisonAttempts[1].timingGranularity, "segment");
  assert.equal(plan.comparisonAttempts[1].terminology.mode, "none");
});

test("privacy-forbidden mixed audio fails instead of inventing speakers", () => {
  const input = baseInput({ kind: "mixed-room", expectedSpeakerCount: 2 });
  input.cloudProcessing = "forbidden";
  assert.throws(
    () => planTranscriptRouting(input),
    /requires an allowed diarization-capable provider/,
  );
});

test("release routing refuses a moving Deepgram model alias", () => {
  const input = baseInput({ kind: "unknown" });
  input.providers.deepgramModelVersion = "latest";
  input.providers.appleOnDeviceAvailable = false;
  assert.throws(
    () => planTranscriptRouting(input),
    /requires an exact model version/,
  );
});
