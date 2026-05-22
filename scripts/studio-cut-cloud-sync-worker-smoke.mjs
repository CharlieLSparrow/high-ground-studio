#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pythonCommand = process.env.PYTHON ?? "python";
const keepWorkdir = process.env.STUDIO_CUT_CLOUD_SYNC_SMOKE_KEEP_WORKDIR === "1";

const sampleRate = 48000;
const expectedReferenceDurationMs = 5000;
const expectedOffsets = {
  "homer-video": 1000,
  "charlie-video": 2000,
  "homer-audio": 1000,
  "charlie-audio": 2000,
};
const durationToleranceMs = 250;
const offsetToleranceMs = 120;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${[command, ...args].join(" ")} failed\n${output}`);
  }

  return result;
}

function requireTool(command) {
  const result = spawnSync(command, ["-version"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} is required for the cloud sync worker smoke test.`);
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileSize(filePath) {
  return (await stat(filePath)).size;
}

function createReferenceRailSamples(durationMs) {
  const totalSamples = Math.round((durationMs / 1000) * sampleRate);
  const samples = new Int16Array(totalSamples);

  for (let index = 0; index < totalSamples; index += 1) {
    const t = index / sampleRate;
    const chunk = Math.floor(t * 20);
    const amplitude = 0.12 + (((chunk * 37 + 11) % 70) / 100);
    const frequency = 120 + ((chunk * 29) % 420);
    const modulator = Math.sin(2 * Math.PI * (0.75 + (chunk % 5) * 0.17) * t);
    const carrier = Math.sin(2 * Math.PI * frequency * t);
    const value = carrier * amplitude * (0.72 + 0.22 * modulator);
    samples[index] = Math.max(-32767, Math.min(32767, Math.round(value * 32767)));
  }

  return samples;
}

function sliceSamples(samples, startMs, durationMs) {
  const start = Math.round((startMs / 1000) * sampleRate);
  const length = Math.round((durationMs / 1000) * sampleRate);
  return samples.slice(start, start + length);
}

async function writeWav(filePath, samples) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }

  await writeFile(filePath, buffer);
}

async function generateVideoWithAudio(filePath, { color, audioPath, durationSeconds }) {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=320x180:r=24:d=${durationSeconds}`,
    "-i",
    audioPath,
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "mpeg4",
    "-c:a",
    "aac",
    filePath,
  ]);
}

function uploadedInput({ inputId, role, fileName, contentType, sizeBytes, durationMs, orderIndex }) {
  return {
    inputId,
    role,
    fileName,
    storagePath: `studioCutSyncJobs/synthetic-rescue-sync/uploads/${role}/${inputId}-${fileName}`,
    contentType,
    sizeBytes,
    durationMs,
    uploadedAt: "2026-05-22T12:00:00.000Z",
    ...(orderIndex === undefined ? {} : { orderIndex }),
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findTrackOffset(trackOffsets, inputId) {
  return trackOffsets.find((offset) => offset.inputId === inputId);
}

async function main() {
  requireTool("ffmpeg");
  requireTool("ffprobe");

  const workdir = await mkdtemp(path.join(tmpdir(), "studio-cut-cloud-sync-smoke-"));
  const mediaDir = path.join(workdir, "media");
  const workerDir = path.join(workdir, "worker");
  await mkdir(mediaDir, { recursive: true });
  await mkdir(workerDir, { recursive: true });

  const files = {
    phone1: path.join(mediaDir, "phone-reference-01.wav"),
    phone2: path.join(mediaDir, "phone-reference-02.wav"),
    homerVideo: path.join(mediaDir, "homer-video.mp4"),
    charlieVideo: path.join(mediaDir, "charlie-video.mp4"),
    homerAudio: path.join(mediaDir, "homer-clean.wav"),
    charlieAudio: path.join(mediaDir, "charlie-clean.wav"),
    homerVideoAudio: path.join(mediaDir, "homer-video-audio.wav"),
    charlieVideoAudio: path.join(mediaDir, "charlie-video-audio.wav"),
  };

  try {
    const railSamples = createReferenceRailSamples(expectedReferenceDurationMs);
    await writeWav(files.phone1, sliceSamples(railSamples, 0, 2000));
    await writeWav(files.phone2, sliceSamples(railSamples, 2000, 3000));
    await writeWav(files.homerAudio, sliceSamples(railSamples, 1000, 4000));
    await writeWav(files.charlieAudio, sliceSamples(railSamples, 2000, 3000));
    await writeWav(files.homerVideoAudio, sliceSamples(railSamples, 1000, 4000));
    await writeWav(files.charlieVideoAudio, sliceSamples(railSamples, 2000, 3000));
    await generateVideoWithAudio(files.homerVideo, {
      color: "green",
      audioPath: files.homerVideoAudio,
      durationSeconds: 4,
    });
    await generateVideoWithAudio(files.charlieVideo, {
      color: "blue",
      audioPath: files.charlieVideoAudio,
      durationSeconds: 3,
    });

    const syncJobPath = path.join(workdir, "sync-job.synthetic.json");
    const localMediaMapPath = path.join(workdir, "local-media-map.synthetic.json");
    const reportPath = path.join(workdir, "sync-report.synthetic.json");

    const syncJob = {
      syncJobId: "synthetic-rescue-sync",
      projectId: "synthetic-episode",
      branchId: "main",
      title: "Synthetic Rescue Sync",
      createdBy: "agent-smoke-test",
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
      status: "uploaded",
      expectedInputs: {
        homerVideo: true,
        charlieVideo: true,
        homerAudio: true,
        charlieAudio: true,
        phoneReferenceAudio: true,
        clipVideo: false,
      },
      uploadedInputs: [
        uploadedInput({
          inputId: "phone-reference-00",
          role: "phoneReferenceAudio",
          fileName: "phone-reference-01.wav",
          contentType: "audio/wav",
          sizeBytes: await fileSize(files.phone1),
          durationMs: 2000,
          orderIndex: 0,
        }),
        uploadedInput({
          inputId: "phone-reference-01",
          role: "phoneReferenceAudio",
          fileName: "phone-reference-02.wav",
          contentType: "audio/wav",
          sizeBytes: await fileSize(files.phone2),
          durationMs: 3000,
          orderIndex: 1,
        }),
        uploadedInput({
          inputId: "homer-video",
          role: "homerVideo",
          fileName: "homer-video.mp4",
          contentType: "video/mp4",
          sizeBytes: await fileSize(files.homerVideo),
          durationMs: 4000,
        }),
        uploadedInput({
          inputId: "charlie-video",
          role: "charlieVideo",
          fileName: "charlie-video.mp4",
          contentType: "video/mp4",
          sizeBytes: await fileSize(files.charlieVideo),
          durationMs: 3000,
        }),
        uploadedInput({
          inputId: "homer-audio",
          role: "homerAudio",
          fileName: "homer-clean.wav",
          contentType: "audio/wav",
          sizeBytes: await fileSize(files.homerAudio),
          durationMs: 4000,
        }),
        uploadedInput({
          inputId: "charlie-audio",
          role: "charlieAudio",
          fileName: "charlie-clean.wav",
          contentType: "audio/wav",
          sizeBytes: await fileSize(files.charlieAudio),
          durationMs: 3000,
        }),
      ],
      outputs: {
        sharedRoomUrl: "https://high-ground-odyssey.web.app/?projectId=synthetic-episode&branchId=main",
      },
    };

    await writeJson(syncJobPath, syncJob);
    await writeJson(localMediaMapPath, {
      inputs: {
        "phone-reference-00": "media/phone-reference-01.wav",
        "phone-reference-01": "media/phone-reference-02.wav",
        "homer-video": "media/homer-video.mp4",
        "charlie-video": "media/charlie-video.mp4",
        "homer-audio": "media/homer-clean.wav",
        "charlie-audio": "media/charlie-clean.wav",
      },
    });

    const workerResult = run(pythonCommand, [
      "tools/studio-cut-cloud-sync/cloud_sync_worker.py",
      "--sync-job-json",
      syncJobPath,
      "--local-media-map",
      localMediaMapPath,
      "--workdir",
      workerDir,
      "--out",
      reportPath,
    ]);

    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const segments = report.referenceRail?.segments ?? [];
    const trackOffsets = report.trackOffsets ?? [];
    const extractedFiles = [
      "phone-reference-00.wav",
      "phone-reference-01.wav",
      "homer-video.wav",
      "charlie-video.wav",
      "homer-audio.wav",
      "charlie-audio.wav",
      "reference-rail.wav",
    ].map((fileName) => path.join(workerDir, "audio", fileName));

    assert(report.status === "ready", "sync report should have ready status");
    assert(segments.length === 2, "reference rail should contain two phone segments");
    assert(
      Math.abs((report.referenceRail?.totalDurationMs ?? 0) - expectedReferenceDurationMs) <= durationToleranceMs,
      `reference rail total duration should be near ${expectedReferenceDurationMs}ms`,
    );
    assert(trackOffsets.length === 4, "non-reference track offsets should exist");
    for (const extractedFile of extractedFiles) {
      assert(existsSync(extractedFile), `expected extracted WAV: ${extractedFile}`);
    }
    for (const [inputId, expectedOffset] of Object.entries(expectedOffsets)) {
      const trackOffset = findTrackOffset(trackOffsets, inputId);
      assert(trackOffset, `expected track offset for ${inputId}`);
      assert(
        Math.abs(trackOffset.estimatedOffsetMs - expectedOffset) <= offsetToleranceMs,
        `${inputId} estimated offset ${trackOffset.estimatedOffsetMs}ms should be near ${expectedOffset}ms`,
      );
      assert(trackOffset.confidence >= 0.45, `${inputId} confidence should be useful`);
    }
    assert(
      report.globalWarnings.every(
        (warning) => !warning.includes("Offset estimation not implemented yet"),
      ),
      "global warnings should not claim all offset estimation is unimplemented",
    );

    console.log("Studio Cut cloud sync worker smoke passed.");
    console.log(`  workdir: ${workdir}`);
    console.log(`  referenceRailSegments: ${segments.length}`);
    console.log(`  referenceRailTotalDurationMs: ${report.referenceRail.totalDurationMs}`);
    console.log(`  trackOffsets: ${trackOffsets.length}`);
    console.log(
      `  estimatedOffsets: ${Object.entries(expectedOffsets)
        .map(([inputId, expectedOffset]) => {
          const actual = findTrackOffset(trackOffsets, inputId);
          return `${inputId}=${actual?.estimatedOffsetMs ?? "missing"}ms(expected ${expectedOffset}ms)`;
        })
        .join(", ")}`,
    );
    console.log(`  extractedWavs: ${extractedFiles.length}`);
    if (workerResult.stdout.trim()) {
      console.log("  workerOutput: captured");
    }
  } finally {
    if (!keepWorkdir) {
      await rm(workdir, { recursive: true, force: true });
    } else {
      console.log(`Kept synthetic smoke workdir: ${workdir}`);
    }
  }
}

main().catch((error) => {
  console.error(`Studio Cut cloud sync worker smoke failed: ${error.message}`);
  process.exitCode = 1;
});
