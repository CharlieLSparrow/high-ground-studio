import { GcsCaptureProxyWorkerStorage } from "./gcs-storage.js";
import { FfmpegCaptureProxyTranscoder } from "./transcoder.js";
import { runCaptureProxyWorker } from "./worker.js";
import { runEpisodeCloudProxyWorker } from "./episode-cloud-worker.js";
import { FfmpegAudioAlignmentAnalyzer } from "./audio-alignment-ffmpeg.js";
import { runAudioAlignmentCloudWorker } from "./audio-alignment-cloud-worker.js";
import { FfmpegAudioMasteringEngine } from "./audio-mastering-ffmpeg.js";
import { runAudioMasteryCloudWorker } from "./audio-mastery-cloud-worker.js";
import { runDialogueRepairCloudWorker } from "./dialogue-repair-cloud-worker.js";
import { FfmpegAudioSignalProfiler } from "./audio-signal-profile-ffmpeg.js";
import { runAudioSignalProfileCloudWorker } from "./audio-signal-profile-cloud-worker.js";
import { FfmpegAudioSpectralAnalyzer } from "./audio-spectral-evidence-ffmpeg.js";
import { runAudioSpectralCloudWorker } from "./audio-spectral-cloud-worker.js";
import { FfmpegInterruptionRepairEngine } from "./interruption-repair-ffmpeg.js";
import { runInterruptionRepairWorker } from "./interruption-repair-worker.js";
import { FfmpegSessionAudioAuditionEngine } from "./session-audio-audition-ffmpeg.js";
import { runSessionAudioAuditionWorker } from "./session-audio-audition-worker.js";
import { FfmpegSessionRecordingShareRenderer } from "./session-recording-share-ffmpeg.js";
import { runSessionRecordingShareCloudWorker } from "./session-recording-share-cloud-worker.js";

const bucketName = requiredEnv("QUIPSLY_MEDIA_BUCKET");
const buildId = requiredEnv("QUIPSLY_WORKER_BUILD_ID");
const executionId =
  process.env.CLOUD_RUN_EXECUTION?.trim() ||
  process.env.HOSTNAME?.trim() ||
  "local-execution";
const imageDigest = process.env.QUIPSLY_WORKER_IMAGE_DIGEST?.trim() || null;
const jobLimit = boundedInteger(
  process.env.QUIPSLY_MEDIA_PROCESSOR_JOB_LIMIT,
  2,
  1,
  20,
);
const leaseDurationMs = boundedInteger(
  process.env.QUIPSLY_MEDIA_PROCESSOR_LEASE_MS,
  6 * 60 * 60 * 1_000,
  60_000,
  7 * 24 * 60 * 60 * 1_000,
);

const startedAt = Date.now();
try {
  const storage = new GcsCaptureProxyWorkerStorage(bucketName);
  const transcoder = new FfmpegCaptureProxyTranscoder();
  const failures: Array<{ lane: string; reason: string }> = [];
  const runLane = async <Result>(
    lane: string,
    operation: () => Promise<Result[]>,
  ): Promise<Result[]> => {
    try {
      return await operation();
    } catch (error) {
      failures.push({
        lane,
        reason: error instanceof Error ? error.message : "unknown",
      });
      return [];
    }
  };
  const workerOptions = {
    executionId,
    buildId,
    imageDigest,
    leaseDurationMs,
    now: () => new Date(),
  };
  const captureResults = await runLane("capture-proxy", () =>
    runCaptureProxyWorker(storage, transcoder, workerOptions, jobLimit),
  );
  const episodeResults = await runLane("episode-proxy", () =>
    runEpisodeCloudProxyWorker(storage, transcoder, workerOptions, jobLimit),
  );
  const alignmentResults = await runLane("audio-alignment", () =>
    runAudioAlignmentCloudWorker(
      storage,
      new FfmpegAudioAlignmentAnalyzer(),
      workerOptions,
      jobLimit,
    ),
  );
  const masteryResults = await runLane("audio-mastery", () =>
    runAudioMasteryCloudWorker(
      storage,
      new FfmpegAudioMasteringEngine(),
      workerOptions,
      jobLimit,
    ),
  );
  const dialogueRepairResults = await runLane("dialogue-repair", () =>
    runDialogueRepairCloudWorker(
      storage,
      new FfmpegAudioMasteringEngine(),
      workerOptions,
      jobLimit,
    ),
  );
  const signalProfileResults = await runLane("audio-signal-profile", () =>
    runAudioSignalProfileCloudWorker(
      storage,
      new FfmpegAudioSignalProfiler(),
      workerOptions,
      jobLimit,
    ),
  );
  const spectralResults = await runLane("audio-spectral-evidence", () =>
    runAudioSpectralCloudWorker(
      storage,
      new FfmpegAudioSpectralAnalyzer(),
      workerOptions,
      jobLimit,
    ),
  );
  const interruptionRepairResults = await runLane("interruption-repair", () =>
    runInterruptionRepairWorker(
      storage,
      new FfmpegInterruptionRepairEngine(),
      workerOptions,
      jobLimit,
    ),
  );
  const sessionAudioAuditionResults = await runLane(
    "session-audio-audition",
    () =>
      runSessionAudioAuditionWorker(
        storage,
        new FfmpegSessionAudioAuditionEngine(),
        workerOptions,
        jobLimit,
      ),
  );
  const sessionRecordingShareResults = await runLane(
    "session-recording-share",
    () =>
      runSessionRecordingShareCloudWorker(
        storage,
        new FfmpegSessionRecordingShareRenderer(),
        workerOptions,
        jobLimit,
      ),
  );
  console.log(
    JSON.stringify({
      severity: failures.length ? "ERROR" : "INFO",
      message: failures.length
        ? "Quipsly media processor completed with lanes needing retry."
        : "Quipsly media processor completed.",
      executionId,
      buildId,
      elapsedMs: Date.now() - startedAt,
      resultCount:
        captureResults.length +
        episodeResults.length +
        alignmentResults.length +
        masteryResults.length +
        dialogueRepairResults.length +
        signalProfileResults.length +
        spectralResults.length +
        interruptionRepairResults.length +
        sessionAudioAuditionResults.length +
        sessionRecordingShareResults.length,
      captureResults,
      episodeResults,
      alignmentResults,
      masteryResults,
      dialogueRepairResults,
      signalProfileResults,
      spectralResults,
      interruptionRepairResults,
      sessionAudioAuditionResults,
      sessionRecordingShareResults,
      failures,
    }),
  );
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      severity: "ERROR",
      message: "Quipsly capture proxy processor needs retry.",
      executionId,
      buildId,
      elapsedMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : "unknown",
    }),
  );
  process.exitCode = 1;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = raw == null || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}
