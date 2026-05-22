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

const expectedReferenceDurationMs = 5000;
const durationToleranceMs = 250;

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

async function generateAudio(filePath, { frequency, durationSeconds }) {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:duration=${durationSeconds}:sample_rate=48000`,
    "-ac",
    "1",
    "-ar",
    "48000",
    filePath,
  ]);
}

async function generateVideoWithAudio(filePath, { color, frequency, durationSeconds }) {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=320x180:r=24:d=${durationSeconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:duration=${durationSeconds}:sample_rate=48000`,
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
  };

  try {
    await generateAudio(files.phone1, { frequency: 440, durationSeconds: 2 });
    await generateAudio(files.phone2, { frequency: 550, durationSeconds: 3 });
    await generateVideoWithAudio(files.homerVideo, {
      color: "green",
      frequency: 220,
      durationSeconds: 5,
    });
    await generateVideoWithAudio(files.charlieVideo, {
      color: "blue",
      frequency: 330,
      durationSeconds: 5,
    });
    await generateAudio(files.homerAudio, { frequency: 660, durationSeconds: 5 });
    await generateAudio(files.charlieAudio, { frequency: 770, durationSeconds: 5 });

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
          durationMs: 5000,
        }),
        uploadedInput({
          inputId: "charlie-video",
          role: "charlieVideo",
          fileName: "charlie-video.mp4",
          contentType: "video/mp4",
          sizeBytes: await fileSize(files.charlieVideo),
          durationMs: 5000,
        }),
        uploadedInput({
          inputId: "homer-audio",
          role: "homerAudio",
          fileName: "homer-clean.wav",
          contentType: "audio/wav",
          sizeBytes: await fileSize(files.homerAudio),
          durationMs: 5000,
        }),
        uploadedInput({
          inputId: "charlie-audio",
          role: "charlieAudio",
          fileName: "charlie-clean.wav",
          contentType: "audio/wav",
          sizeBytes: await fileSize(files.charlieAudio),
          durationMs: 5000,
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

    console.log("Studio Cut cloud sync worker smoke passed.");
    console.log(`  workdir: ${workdir}`);
    console.log(`  referenceRailSegments: ${segments.length}`);
    console.log(`  referenceRailTotalDurationMs: ${report.referenceRail.totalDurationMs}`);
    console.log(`  trackOffsets: ${trackOffsets.length}`);
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
