import assert from "node:assert/strict";
import test from "node:test";

import { parseAudioSignalProfile } from "./audio-signal-profile.js";

function fixture() {
  return {
    schemaVersion: 1,
    algorithm: "quipsly-audio-signal-window-v1",
    sampleRate: 48_000,
    channelCount: 2,
    analyzedFrameCount: 960_000,
    durationSeconds: 20,
    windowDurationSeconds: 20,
    rmsDbfs: -23,
    samplePeakDbfs: -23,
    clippedFrameCount: 0,
    clippedFrameFraction: 0,
    nearSilentFrameFraction: 0,
    leftRmsDbfs: -23,
    rightRmsDbfs: -23,
    stereoBalanceDb: 0,
    signalStatus: "signal-present",
    thresholds: {
      clippingAmplitude: 0.999,
      nearSilenceDbfs: -72,
      possibleDropoutMinimumSeconds: 0.25,
      surroundingSignalDbfs: -45,
      stereoImbalanceDb: 12,
    },
    waveform: [{ startSeconds: 0, durationSeconds: 20, rmsDbfs: -23, samplePeakDbfs: -23, clippedFrameCount: 0 }],
    frequencyProfile: null,
    loudness: {
      schemaVersion: 1,
      algorithm: "itu-r-bs.1770-5-integrated-v1",
      standard: "ITU-R BS.1770-5",
      status: "measured",
      sampleRate: 48_000,
      channelCount: 2,
      analyzedFrameCount: 960_000,
      measurementBlockDurationSeconds: 0.4,
      measurementBlockStepSeconds: 0.1,
      measurementBlockCount: 197,
      absoluteGatedBlockCount: 197,
      relativeGatedBlockCount: 197,
      absoluteGateLufs: -70,
      relativeGateLufs: -33,
      integratedLoudnessLufs: -23,
      maximumMomentaryLoudnessLufs: -23,
    },
    observations: [],
  };
}

test("accepts source-bound BS.1770 loudness evidence", () => {
  assert.deepEqual(parseAudioSignalProfile(fixture()).loudness, fixture().loudness);
});

test("rejects loudness evidence measured from different decoded bytes", () => {
  const profile = fixture();
  profile.loudness.analyzedFrameCount -= 1;
  assert.throws(() => parseAudioSignalProfile(profile), /does not match the decoded source/i);
});
