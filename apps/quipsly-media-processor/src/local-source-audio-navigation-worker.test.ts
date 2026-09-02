import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { newSourceAudioNavigationJob } from "@high-ground/quipsly-media-processing";

import {
  runOneLocalSourceAudioNavigationJob,
  type LocalSourceAudioNavigationClaim,
  type LocalSourceAudioNavigationStore,
  type ResolvedSourceAudioNavigationInput,
  type SourceAudioNavigationAnalyzer,
} from "./local-source-audio-navigation-worker.js";

const CUSTODIAN_NODE_ID = "execution_worker_12345678";
const STORAGE_SCOPE_ID = "storage_scope_12345678";

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function analyzedProfile() {
  return {
    media: {
      container: "mov,mp4,m4a,3gp,3g2,mj2",
      codec: "aac",
      sampleRate: 48_000,
      channelCount: 2,
      durationSeconds: 1,
    },
    audioSignal: {
      schemaVersion: 1 as const,
      algorithm: "quipsly-audio-signal-window-v1" as const,
      sampleRate: 48_000,
      channelCount: 2,
      analyzedFrameCount: 48_000,
      durationSeconds: 1,
      windowDurationSeconds: 1,
      rmsDbfs: -20,
      samplePeakDbfs: -2,
      clippedFrameCount: 0,
      clippedFrameFraction: 0,
      nearSilentFrameFraction: 0,
      leftRmsDbfs: -20,
      rightRmsDbfs: -21,
      stereoBalanceDb: -1,
      signalStatus: "signal-present" as const,
      thresholds: {
        clippingAmplitude: 0.999,
        nearSilenceDbfs: -72,
        possibleDropoutMinimumSeconds: 0.25,
        surroundingSignalDbfs: -45,
        stereoImbalanceDb: 12,
      },
      waveform: [
        {
          startSeconds: 0,
          durationSeconds: 1,
          rmsDbfs: -20,
          samplePeakDbfs: -2,
          clippedFrameCount: 0,
        },
      ],
      frequencyProfile: {
        algorithm: "quipsly-audio-broad-band-rms-v1" as const,
        completeDecode: true as const,
        downmixPolicy: "ffmpeg-default-mono-v1" as const,
        windowDurationSeconds: 1,
        analyzedFrameCount: 48_000,
        bands: [
          {
            id: "speech" as const,
            label: "Speech",
            minimumHz: 500,
            maximumHz: 2_000,
          },
        ],
        overallBandRmsDbfs: [-22],
        windows: [
          {
            startSeconds: 0,
            durationSeconds: 1,
            bandRmsDbfs: [-22],
          },
        ],
        boundaries: {
          broadBandsAreNotARepairSpectrogram: true as const,
          measurementsAreNotEqDecisions: true as const,
          stereoIsDownmixedForFrequencyOverview: true as const,
        },
      },
      loudness: null,
      observations: [],
    },
    ffmpegVersion: "7.1",
  };
}

test("source audio navigation worker completely decodes exact proxy bytes without changing them", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-source-audio-navigation-"),
  );
  try {
    const inputPath = path.join(root, "proxy.mp4");
    const bytes = Buffer.from("retained audio navigation proxy");
    await writeFile(inputPath, bytes, { mode: 0o600 });
    const job = newSourceAudioNavigationJob({
      jobId: "sanjob_12345678",
      projectId: "project_12345678",
      projectSlug: "homer-source-room",
      actorUserId: "user_12345678",
      actorEmail: "homer@example.com",
      queuedAt: "2026-08-07T12:00:00.000Z",
      source: {
        sourceRevisionId: "revision_12345678",
        identitySha256: "a".repeat(64),
        expectedContentSha256: "b".repeat(64),
      },
      input: {
        derivativeId: "proxy_12345678",
        provider: "local",
        locator: inputPath,
        generation: `sha256:${sha256(bytes)}`,
        contentSha256: sha256(bytes),
        sizeBytes: bytes.byteLength,
        contentType: "video/mp4",
        durationSeconds: 1,
      },
    });
    const claim: LocalSourceAudioNavigationClaim = {
      id: job.jobId,
      inputJson: job,
      attempt: 1,
      executionId: "worker_12345678",
      custodianNodeId: CUSTODIAN_NODE_ID,
      storageScopeId: STORAGE_SCOPE_ID,
    };
    const resolved: ResolvedSourceAudioNavigationInput = {
      projectId: job.projectId,
      sourceRevisionId: job.source.sourceRevisionId,
      sourceIdentitySha256: job.source.identitySha256,
      sourceContentSha256: job.source.expectedContentSha256,
      derivativeId: job.input.derivativeId,
      locator: inputPath,
      generation: job.input.generation,
      contentSha256: job.input.contentSha256,
      sizeBytes: job.input.sizeBytes,
      mimeType: job.input.contentType,
      durationSeconds: job.input.durationSeconds,
      status: "ready",
      storageProvider: "local",
    };
    const receipts: Array<
      Parameters<LocalSourceAudioNavigationStore["complete"]>[0]["receipt"]
    > = [];
    const store: LocalSourceAudioNavigationStore = {
      claim: async () => claim,
      resolve: async () => resolved,
      complete: async (input) => {
        receipts.push(input.receipt);
        return true;
      },
      retry: async () => true,
      fail: async () => true,
    };
    const analyzer: SourceAudioNavigationAnalyzer = {
      analyze: async () => analyzedProfile(),
    };
    const before = await stat(inputPath);
    const result = await runOneLocalSourceAudioNavigationJob(store, analyzer, {
      executionId: claim.executionId,
      custodianNodeId: CUSTODIAN_NODE_ID,
      storageScopeId: STORAGE_SCOPE_ID,
      buildId: "build-1",
      leaseMs: 60_000,
      localMediaRoot: root,
      now: () => new Date("2026-08-07T12:00:10.000Z"),
    });
    assert.deepEqual(result, {
      disposition: "completed",
      jobId: job.jobId,
      windowCount: 1,
    });
    assert.equal(receipts[0]?.boundaries.inputDerivativeRemainsUnchanged, true);
    assert.equal(
      receipts[0]?.audioSignal.frequencyProfile?.bands[0]?.id,
      "speech",
    );
    assert.equal((await stat(inputPath)).size, before.size);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source audio navigation worker fails before decode when proxy bytes drift", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-source-audio-navigation-drift-"),
  );
  try {
    const inputPath = path.join(root, "proxy.mp4");
    await writeFile(inputPath, Buffer.from("changed bytes"));
    const job = newSourceAudioNavigationJob({
      jobId: "sanjob_87654321",
      projectId: "project_87654321",
      projectSlug: "homer-source-room",
      actorUserId: "user_87654321",
      actorEmail: "homer@example.com",
      queuedAt: "2026-08-07T12:00:00.000Z",
      source: {
        sourceRevisionId: "revision_87654321",
        identitySha256: "a".repeat(64),
        expectedContentSha256: "b".repeat(64),
      },
      input: {
        derivativeId: "proxy_87654321",
        provider: "local",
        locator: inputPath,
        generation: `sha256:${"c".repeat(64)}`,
        contentSha256: "c".repeat(64),
        sizeBytes: 100,
        contentType: "video/mp4",
        durationSeconds: 1,
      },
    });
    let failure = "";
    let decoded = false;
    const store: LocalSourceAudioNavigationStore = {
      claim: async () => ({
        id: job.jobId,
        inputJson: job,
        attempt: 1,
        executionId: "worker_87654321",
        custodianNodeId: CUSTODIAN_NODE_ID,
        storageScopeId: STORAGE_SCOPE_ID,
      }),
      resolve: async () => ({
        projectId: job.projectId,
        sourceRevisionId: job.source.sourceRevisionId,
        sourceIdentitySha256: job.source.identitySha256,
        sourceContentSha256: job.source.expectedContentSha256,
        derivativeId: job.input.derivativeId,
        locator: inputPath,
        generation: job.input.generation,
        contentSha256: job.input.contentSha256,
        sizeBytes: job.input.sizeBytes,
        mimeType: job.input.contentType,
        durationSeconds: job.input.durationSeconds,
        status: "ready",
        storageProvider: "local",
      }),
      complete: async () => true,
      retry: async () => true,
      fail: async (input) => {
        failure = input.code;
        return true;
      },
    };
    const analyzer: SourceAudioNavigationAnalyzer = {
      analyze: async () => {
        decoded = true;
        return analyzedProfile();
      },
    };
    const result = await runOneLocalSourceAudioNavigationJob(store, analyzer, {
      executionId: "worker_87654321",
      custodianNodeId: CUSTODIAN_NODE_ID,
      storageScopeId: STORAGE_SCOPE_ID,
      buildId: "build-1",
      leaseMs: 60_000,
      localMediaRoot: root,
      now: () => new Date("2026-08-07T12:00:10.000Z"),
    });
    assert.deepEqual(result, {
      disposition: "failed",
      jobId: job.jobId,
      code: "source-audio-navigation-byte-mismatch",
    });
    assert.equal(failure, "source-audio-navigation-byte-mismatch");
    assert.equal(decoded, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
