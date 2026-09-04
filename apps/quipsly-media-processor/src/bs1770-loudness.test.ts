import assert from "node:assert/strict";
import test from "node:test";

import { Bs1770LoudnessAnalyzer } from "./bs1770-loudness.js";

type ToneSegment = { durationSeconds: number; peakDbfs: number | null };

function analyzeStereoTone(sampleRate: number, segments: ToneSegment[]) {
  const analyzer = new Bs1770LoudnessAnalyzer(sampleRate, 2);
  const chunkCapacity = 4_096;
  let absoluteFrame = 0;
  for (const segment of segments) {
    let remaining = Math.round(segment.durationSeconds * sampleRate);
    const amplitude = segment.peakDbfs === null ? 0 : 10 ** (segment.peakDbfs / 20);
    while (remaining > 0) {
      const chunkFrames = Math.min(chunkCapacity, remaining);
      const buffer = Buffer.allocUnsafe(chunkFrames * 2 * 4);
      for (let index = 0; index < chunkFrames; index += 1) {
        const sample = amplitude * Math.sin(2 * Math.PI * 1_000 * (absoluteFrame + index) / sampleRate);
        buffer.writeFloatLE(sample, index * 8);
        buffer.writeFloatLE(sample, index * 8 + 4);
      }
      analyzer.consumeInterleavedFloat32(buffer);
      absoluteFrame += chunkFrames;
      remaining -= chunkFrames;
    }
  }
  return analyzer.result();
}

function closeTo(actual: number | null, expected: number, tolerance = 0.1) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) <= tolerance, `expected ${expected} ±${tolerance}, received ${actual}`);
}

test("matches the EBU -23 dBFS stereo calibration case", () => {
  const result = analyzeStereoTone(48_000, [{ durationSeconds: 20, peakDbfs: -23 }]);
  assert.equal(result.status, "measured");
  closeTo(result.integratedLoudnessLufs, -23);
  closeTo(result.maximumMomentaryLoudnessLufs, -23);
  assert.equal(result.measurementBlockCount, 197);
});

test("applies the relative and absolute BS.1770 gates", () => {
  const relative = analyzeStereoTone(48_000, [
    { durationSeconds: 10, peakDbfs: -36 },
    { durationSeconds: 60, peakDbfs: -23 },
    { durationSeconds: 10, peakDbfs: -36 },
  ]);
  closeTo(relative.integratedLoudnessLufs, -23);
  assert.ok(relative.relativeGatedBlockCount < relative.absoluteGatedBlockCount);

  const absolute = analyzeStereoTone(48_000, [
    { durationSeconds: 10, peakDbfs: -72 },
    { durationSeconds: 10, peakDbfs: -36 },
    { durationSeconds: 60, peakDbfs: -23 },
    { durationSeconds: 10, peakDbfs: -36 },
    { durationSeconds: 10, peakDbfs: -72 },
  ]);
  closeTo(absolute.integratedLoudnessLufs, -23);
  assert.ok(absolute.absoluteGatedBlockCount < absolute.measurementBlockCount);
});

test("derives K-weighting at 44.1 kHz and declines to invent short-source loudness", () => {
  closeTo(analyzeStereoTone(44_100, [{ durationSeconds: 20, peakDbfs: -23 }]).integratedLoudnessLufs, -23);
  const tooShort = analyzeStereoTone(48_000, [{ durationSeconds: 0.2, peakDbfs: -23 }]);
  assert.equal(tooShort.status, "insufficient-duration");
  assert.equal(tooShort.integratedLoudnessLufs, null);
});

test("represents complete digital silence without emitting non-finite loudness", () => {
  const silent = analyzeStereoTone(48_000, [
    { durationSeconds: 2, peakDbfs: null },
  ]);
  assert.equal(silent.status, "below-absolute-gate");
  assert.equal(silent.measurementBlockCount, 17);
  assert.equal(silent.absoluteGatedBlockCount, 0);
  assert.equal(silent.relativeGatedBlockCount, 0);
  assert.equal(silent.relativeGateLufs, null);
  assert.equal(silent.integratedLoudnessLufs, null);
  assert.equal(silent.maximumMomentaryLoudnessLufs, null);
});

test("preserves exact frame identity while declining unsupported layouts", () => {
  const analyzer = new Bs1770LoudnessAnalyzer(48_000, 6);
  analyzer.consumeInterleavedFloat32(Buffer.alloc(48_000 * 6 * 4));
  const result = analyzer.result();
  assert.equal(result.status, "unsupported-channel-layout");
  assert.equal(result.analyzedFrameCount, 48_000);
  assert.equal(result.integratedLoudnessLufs, null);
});
