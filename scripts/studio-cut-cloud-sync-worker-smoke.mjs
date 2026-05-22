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
const durationToleranceMs = 250;

const scenarios = [
  {
    name: "short",
    referenceDurationMs: 5000,
    referencePiecesMs: [2000, 3000],
    offsetToleranceMs: 120,
    minimumAnchorCount: 1,
    tracks: {
      "homer-video": { role: "homerVideo", offsetMs: 1000, durationMs: 4000 },
      "charlie-video": { role: "charlieVideo", offsetMs: 2000, durationMs: 3000 },
      "homer-audio": { role: "homerAudio", offsetMs: 1000, durationMs: 4000 },
      "charlie-audio": { role: "charlieAudio", offsetMs: 2000, durationMs: 3000 },
    },
  },
  {
    name: "long",
    referenceDurationMs: 90000,
    referencePiecesMs: [30000, 30000, 30000],
    offsetToleranceMs: 220,
    minimumAnchorCount: 2,
    tracks: {
      "homer-video": { role: "homerVideo", offsetMs: 7000, durationMs: 60000 },
      "charlie-video": { role: "charlieVideo", offsetMs: 15000, durationMs: 55000 },
      "homer-audio": { role: "homerAudio", offsetMs: 7000, durationMs: 60000 },
      "charlie-audio": { role: "charlieAudio", offsetMs: 15000, durationMs: 55000 },
    },
  },
];

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
    "pcm_s16le",
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

function findSyncMapAsset(syncMap, inputId) {
  return (syncMap.assets ?? []).find((asset) => asset.inputId === inputId);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

async function runScenario(rootWorkdir, scenario) {
  const scenarioDir = path.join(rootWorkdir, scenario.name);
  const mediaDir = path.join(scenarioDir, "media");
  const workerDir = path.join(scenarioDir, "worker");
  await mkdir(mediaDir, { recursive: true });
  await mkdir(workerDir, { recursive: true });

  const railSamples = createReferenceRailSamples(scenario.referenceDurationMs);
  const localMediaInputs = {};
  const uploadedInputs = [];
  let referenceStartMs = 0;

  for (const [index, durationMs] of scenario.referencePiecesMs.entries()) {
    const inputId = `phone-reference-${String(index).padStart(2, "0")}`;
    const fileName = `${inputId}.wav`;
    const filePath = path.join(mediaDir, fileName);
    await writeWav(filePath, sliceSamples(railSamples, referenceStartMs, durationMs));
    localMediaInputs[inputId] = `media/${fileName}`;
    uploadedInputs.push(
      uploadedInput({
        inputId,
        role: "phoneReferenceAudio",
        fileName,
        contentType: "audio/wav",
        sizeBytes: await fileSize(filePath),
        durationMs,
        orderIndex: index,
      }),
    );
    referenceStartMs += durationMs;
  }

  for (const [inputId, track] of Object.entries(scenario.tracks)) {
    const audioFileName = `${inputId}.wav`;
    const audioPath = path.join(mediaDir, audioFileName);
    await writeWav(
      audioPath,
      sliceSamples(railSamples, track.offsetMs, track.durationMs),
    );

    let fileName = audioFileName;
    let filePath = audioPath;
    let contentType = "audio/wav";

    if (track.role.endsWith("Video")) {
      fileName = `${inputId}.mov`;
      filePath = path.join(mediaDir, fileName);
      contentType = "video/quicktime";
      await generateVideoWithAudio(filePath, {
        color: inputId.includes("homer") ? "green" : "blue",
        audioPath,
        durationSeconds: track.durationMs / 1000,
      });
    }

    localMediaInputs[inputId] = `media/${fileName}`;
    uploadedInputs.push(
      uploadedInput({
        inputId,
        role: track.role,
        fileName,
        contentType,
        sizeBytes: await fileSize(filePath),
        durationMs: track.durationMs,
      }),
    );
  }

  const syncJobPath = path.join(scenarioDir, "sync-job.synthetic.json");
  const localMediaMapPath = path.join(scenarioDir, "local-media-map.synthetic.json");
  const reportPath = path.join(scenarioDir, "sync-report.synthetic.json");
  const syncMapPath = path.join(scenarioDir, "sync-map.synthetic.json");

  await writeJson(syncJobPath, {
    syncJobId: `synthetic-rescue-sync-${scenario.name}`,
    projectId: `synthetic-episode-${scenario.name}`,
    branchId: "main",
    title: `Synthetic Rescue Sync ${scenario.name}`,
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
    uploadedInputs,
    outputs: {
      sharedRoomUrl: `https://high-ground-odyssey.web.app/?projectId=synthetic-episode-${scenario.name}&branchId=main`,
    },
  });
  await writeJson(localMediaMapPath, { inputs: localMediaInputs });

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
    "--out-sync-map",
    syncMapPath,
  ]);

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const syncMap = JSON.parse(await readFile(syncMapPath, "utf8"));
  const segments = report.referenceRail?.segments ?? [];
  const trackOffsets = report.trackOffsets ?? [];
  const extractedFiles = [
    ...uploadedInputs.map((input) => `${input.inputId}.wav`),
    "reference-rail.wav",
  ].map((fileName) => path.join(workerDir, "audio", fileName));

  assert(report.status === "ready", `${scenario.name}: sync report should be ready`);
  assert(syncMap.syncJobId === report.syncJobId, `${scenario.name}: sync map should match report job id`);
  assert(
    segments.length === scenario.referencePiecesMs.length,
    `${scenario.name}: reference rail should contain all phone segments`,
  );
  assert(
    Math.abs((report.referenceRail?.totalDurationMs ?? 0) - scenario.referenceDurationMs) <= durationToleranceMs,
    `${scenario.name}: reference rail total duration should be near ${scenario.referenceDurationMs}ms`,
  );
  assert(trackOffsets.length === 4, `${scenario.name}: non-reference track offsets should exist`);
  assert(existsSync(syncMapPath), `${scenario.name}: sync map should be written`);
  assert(
    Math.abs((syncMap.canonicalTimeline?.durationMs ?? 0) - scenario.referenceDurationMs) <= durationToleranceMs,
    `${scenario.name}: sync map canonical duration should be near ${scenario.referenceDurationMs}ms`,
  );
  assert(
    syncMap.canonicalTimeline?.referenceRole === "phoneReferenceAudio",
    `${scenario.name}: sync map should use phoneReferenceAudio as reference role`,
  );
  assert(
    (syncMap.referenceRail?.segments ?? []).length === scenario.referencePiecesMs.length,
    `${scenario.name}: sync map should embed multi-piece reference rail`,
  );
  const syncMapJson = JSON.stringify(syncMap);
  for (const localPathFragment of [scenarioDir, mediaDir, workerDir]) {
    assert(
      !syncMapJson.includes(localPathFragment),
      `${scenario.name}: sync map should not contain local temp path ${localPathFragment}`,
    );
  }
  for (const extractedFile of extractedFiles) {
    assert(existsSync(extractedFile), `${scenario.name}: expected extracted WAV: ${extractedFile}`);
  }
  for (const [inputId, expected] of Object.entries(scenario.tracks)) {
    const trackOffset = findTrackOffset(trackOffsets, inputId);
    const syncMapAsset = findSyncMapAsset(syncMap, inputId);
    assert(trackOffset, `${scenario.name}: expected track offset for ${inputId}`);
    assert(syncMapAsset, `${scenario.name}: expected sync map asset for ${inputId}`);
    assert(
      Math.abs(trackOffset.estimatedOffsetMs - expected.offsetMs) <= scenario.offsetToleranceMs,
      `${scenario.name}: ${inputId} estimated offset ${trackOffset.estimatedOffsetMs}ms should be near ${expected.offsetMs}ms`,
    );
    assert(
      Math.abs(syncMapAsset.timelineStartMs - expected.offsetMs) <= scenario.offsetToleranceMs,
      `${scenario.name}: ${inputId} sync map timelineStartMs ${syncMapAsset.timelineStartMs}ms should be near ${expected.offsetMs}ms`,
    );
    assert(
      syncMapAsset.assetStartMs === 0,
      `${scenario.name}: ${inputId} sync map assetStartMs should start at 0 for v0`,
    );
    assert(
      typeof syncMapAsset.confidence === "number",
      `${scenario.name}: ${inputId} sync map asset should include confidence`,
    );
    assert(
      typeof syncMapAsset.originalStoragePath === "string" &&
        syncMapAsset.originalStoragePath.startsWith("studioCutSyncJobs/"),
      `${scenario.name}: ${inputId} sync map asset should keep path-safe storage metadata`,
    );
    assert(
      trackOffset.anchorCount >= scenario.minimumAnchorCount,
      `${scenario.name}: ${inputId} should have at least ${scenario.minimumAnchorCount} anchor(s)`,
    );
    assert(
      trackOffset.confidence >= 0.35,
      `${scenario.name}: ${inputId} confidence should be useful`,
    );
    assert(
      typeof trackOffset.driftPpm === "number",
      `${scenario.name}: ${inputId} should include driftPpm`,
    );
    if (scenario.minimumAnchorCount >= 2) {
      assert(
        typeof trackOffset.anchorAgreementMs === "number",
        `${scenario.name}: ${inputId} should include anchorAgreementMs`,
      );
      assert(
        Array.isArray(trackOffset.anchorSummaries) &&
          trackOffset.anchorSummaries.length >= scenario.minimumAnchorCount,
        `${scenario.name}: ${inputId} should include anchor summaries`,
      );
    }
  }
  assert(
    report.globalWarnings.every(
      (warning) => !warning.includes("Offset estimation not implemented yet"),
    ),
    `${scenario.name}: global warnings should not claim all offset estimation is unimplemented`,
  );

  return {
    name: scenario.name,
    referenceRailSegments: segments.length,
    referenceRailTotalDurationMs: report.referenceRail.totalDurationMs,
    trackOffsets,
    syncMapAssets: syncMap.assets.length,
    extractedWavCount: extractedFiles.length,
    workerOutputCaptured: Boolean(workerResult.stdout.trim()),
  };
}

async function main() {
  requireTool("ffmpeg");
  requireTool("ffprobe");

  const workdir = await mkdtemp(path.join(tmpdir(), "studio-cut-cloud-sync-smoke-"));
  try {
    const results = [];
    for (const scenario of scenarios) {
      results.push(await runScenario(workdir, scenario));
    }

    console.log("Studio Cut cloud sync worker smoke passed.");
    console.log(`  workdir: ${workdir}`);
    for (const result of results) {
      console.log(`  scenario: ${result.name}`);
      console.log(`    referenceRailSegments: ${result.referenceRailSegments}`);
      console.log(`    referenceRailTotalDurationMs: ${result.referenceRailTotalDurationMs}`);
      console.log(
        `    estimatedOffsets: ${Object.entries(scenarios.find((scenario) => scenario.name === result.name).tracks)
          .map(([inputId, expected]) => {
            const actual = findTrackOffset(result.trackOffsets, inputId);
            return `${inputId}=${actual?.estimatedOffsetMs ?? "missing"}ms(expected ${expected.offsetMs}ms, anchors ${actual?.anchorCount ?? 0})`;
          })
          .join(", ")}`,
      );
      console.log(`    syncMapAssets: ${result.syncMapAssets}`);
      console.log(`    extractedWavs: ${result.extractedWavCount}`);
      if (result.workerOutputCaptured) {
        console.log("    workerOutput: captured");
      }
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
