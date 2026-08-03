import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SAMPLE_RATE = 8_000;
const CHANNEL_COUNT = 1;
const BITS_PER_SAMPLE = 16;
const DURATION_SECONDS = 80;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const DATA_BYTE_COUNT = SAMPLE_RATE * DURATION_SECONDS * CHANNEL_COUNT * BYTES_PER_SAMPLE;
const SOURCE_PATH = path.join(
  os.tmpdir(),
  "quipsly-media-ingest",
  "quipsly-retained-coaching-continuity-source.wav",
);

function buildPCMSource() {
  const headerByteCount = 44;
  const buffer = Buffer.alloc(headerByteCount + DATA_BYTE_COUNT);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + DATA_BYTE_COUNT, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNEL_COUNT, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNEL_COUNT * BYTES_PER_SAMPLE, 28);
  buffer.writeUInt16LE(CHANNEL_COUNT * BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(DATA_BYTE_COUNT, 40);

  // A quiet deterministic tone around the cited interval makes manual
  // playback visibly and audibly time-bound without representing real speech.
  const toneStartSample = 60 * SAMPLE_RATE;
  const toneEndSample = 75 * SAMPLE_RATE;
  for (let sample = toneStartSample; sample < toneEndSample; sample += 1) {
    const value = Math.round(Math.sin((sample / SAMPLE_RATE) * Math.PI * 2 * 220) * 1_400);
    buffer.writeInt16LE(value, 44 + (sample * BYTES_PER_SAMPLE));
  }
  return buffer;
}

const identityBuffer = buildPCMSource();

export const RETAINED_COACHING_CONTINUITY_SOURCE = Object.freeze({
  path: SOURCE_PATH,
  fileName: path.basename(SOURCE_PATH),
  contentType: "audio/wav",
  durationSeconds: DURATION_SECONDS,
  byteSize: identityBuffer.byteLength,
  sha256: createHash("sha256").update(identityBuffer).digest("hex"),
});

export async function materializeRetainedCoachingContinuitySource() {
  await mkdir(path.dirname(SOURCE_PATH), { recursive: true, mode: 0o700 });
  await writeFile(SOURCE_PATH, buildPCMSource(), { mode: 0o600 });
  return RETAINED_COACHING_CONTINUITY_SOURCE;
}
