import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isCloudSyncJob,
  isCloudSyncJobInputComplete,
  isCloudSyncReport,
} from "../packages/studio-cut-schema/src/index.ts";
import {
  buildCloudSyncJobPath,
  buildCloudSyncOutputStoragePath,
  buildCloudSyncUploadStoragePath,
  createCloudSyncInputId,
  createCloudSyncExpectedInputs,
  createCloudSyncJob,
  getMissingRequiredCloudSyncInputs,
  mergeCloudSyncUploadedInput,
} from "../apps/studio-cut-web/src/cloudSync.ts";

const roomSelection = {
  projectId: "Episode 004",
  branchId: "Main Cut",
};

function uploadedInput(role, fileName = `${role}.placeholder`) {
  const inputId = `${role}-${fileName}`.replace(/[^a-zA-Z0-9._-]/g, "-");

  return {
    inputId,
    role,
    storagePath: `studioCutSyncJobs/episode-004/uploads/${role}/${inputId}-${fileName}`,
    fileName,
    contentType: role.endsWith("Video") ? "video/mp4" : "audio/wav",
    sizeBytes: 1024,
    durationMs: 1000,
    uploadedAt: "2026-05-22T12:00:00.000Z",
  };
}

test("cloud sync job shape supports required inputs and optional clip", () => {
  const job = createCloudSyncJob({
    syncJobId: "Episode 004 Raw Intake",
    roomSelection,
    title: "Episode 004",
    createdBy: "charlie@highgroundodyssey.com",
    includeClip: true,
    now: "2026-05-22T12:00:00.000Z",
  });

  assert.equal(job.syncJobId, "episode-004-raw-intake");
  assert.equal(job.projectId, "episode-004");
  assert.equal(job.branchId, "main-cut");
  assert.equal(job.expectedInputs.clipVideo, true);
  assert.equal(isCloudSyncJob(job), true);
  assert.deepEqual(getMissingRequiredCloudSyncInputs(job), [
    "homerVideo",
    "charlieVideo",
    "homerAudio",
    "charlieAudio",
    "phoneReferenceAudio",
  ]);

  assert.deepEqual(createCloudSyncExpectedInputs(false), {
    homerVideo: true,
    charlieVideo: true,
    homerAudio: true,
    charlieAudio: true,
    phoneReferenceAudio: true,
  });
});

test("cloud sync input completeness allows multiple reference pieces", () => {
  const job = {
    ...createCloudSyncJob({
      syncJobId: "episode-004",
      roomSelection,
      title: "Episode 004",
      createdBy: "charlie@highgroundodyssey.com",
      includeClip: true,
      now: "2026-05-22T12:00:00.000Z",
    }),
    uploadedInputs: [
      uploadedInput("homerVideo"),
      uploadedInput("charlieVideo"),
      uploadedInput("homerAudio"),
      uploadedInput("charlieAudio"),
      uploadedInput("phoneReferenceAudio", "phone-part-2.m4a"),
    ],
  };

  assert.equal(isCloudSyncJobInputComplete(job), true);

  const completeJob = {
    ...job,
    uploadedInputs: [
      ...job.uploadedInputs,
      { ...uploadedInput("phoneReferenceAudio", "phone-part-1.m4a"), orderIndex: 0 },
      { ...uploadedInput("phoneReferenceAudio", "phone-part-2.m4a"), orderIndex: 1 },
    ],
  };

  assert.equal(isCloudSyncJobInputComplete(completeJob), true);
  assert.equal(
    completeJob.uploadedInputs.filter(
      (input) => input.role === "phoneReferenceAudio",
    ).length,
    3,
  );
});

test("cloud sync storage paths sanitize ids and uploaded file names", () => {
  assert.equal(
    buildCloudSyncJobPath("../Episode 004 Raw Intake"),
    "studioCutSyncJobs/episode-004-raw-intake",
  );
  assert.equal(
    buildCloudSyncUploadStoragePath({
      syncJobId: "../Episode 004 Raw Intake",
      role: "homerVideo",
      fileName: "../../Homer Camera Export 004.MOV",
      inputId: "Homer Video 01",
    }),
    "studioCutSyncJobs/episode-004-raw-intake/uploads/homerVideo/homer-video-01-homer-camera-export-004.mov",
  );
  assert.equal(
    buildCloudSyncOutputStoragePath({
      syncJobId: "../Episode 004 Raw Intake",
      fileName: "sync-report.json",
    }),
    "studioCutSyncJobs/episode-004-raw-intake/outputs/sync-report.json",
  );
});

test("cloud sync uploaded inputs upsert by input id, not role", () => {
  const oldHomer = uploadedInput("homerVideo", "old.mp4");
  const newHomer = {
    ...uploadedInput("homerVideo", "new.mp4"),
    inputId: oldHomer.inputId,
  };

  assert.deepEqual(
    mergeCloudSyncUploadedInput(
      [oldHomer, uploadedInput("charlieVideo")],
      newHomer,
    ).map((input) => `${input.role}:${input.fileName}`),
    ["charlieVideo:charlieVideo.placeholder", "homerVideo:new.mp4"],
  );
});

test("cloud sync report validates reference rail and track offsets", () => {
  const report = {
    syncJobId: "episode-004-raw-intake",
    generatedAt: "2026-05-22T12:30:00.000Z",
    status: "ready",
    referenceRail: {
      syncJobId: "episode-004-raw-intake",
      referenceRole: "phoneReferenceAudio",
      segments: [
        {
          inputId: "phone-part-1",
          fileName: "phone-part-1.m4a",
          railStartMs: 0,
          sourceStartMs: 0,
          durationMs: 5000,
          confidence: 0.5,
          warnings: [],
        },
        {
          inputId: "phone-part-2",
          fileName: "phone-part-2.m4a",
          railStartMs: 5000,
          sourceStartMs: 0,
          durationMs: 7000,
          confidence: 0.5,
          gapBeforeMs: 0,
          warnings: [],
        },
      ],
      totalDurationMs: 12000,
      warnings: [],
    },
    trackOffsets: [
      {
        inputId: "homer-video",
        role: "homerVideo",
        fileName: "homer.mp4",
        estimatedOffsetMs: 0,
        confidence: 0.8,
        warnings: [],
      },
      {
        inputId: "phone-part-1",
        role: "phoneReferenceAudio",
        fileName: "phone.m4a",
        estimatedOffsetMs: 0,
        driftPpm: 0,
        confidence: 0.9,
        warnings: [],
      },
    ],
    globalWarnings: [],
  };

  assert.equal(isCloudSyncReport(report), true);
  assert.equal(
    isCloudSyncReport({
      ...report,
      referenceRail: {
        ...report.referenceRail,
        segments: [
          { ...report.referenceRail.segments[0], confidence: 1.2 },
        ],
      },
    }),
    false,
  );
});

test("cloud sync input ids are stable path-safe identifiers", () => {
  const inputId = createCloudSyncInputId({
    role: "phoneReferenceAudio",
    fileName: "../Phone Piece 01.M4A",
    orderIndex: 0,
  });

  assert.match(inputId, /^phonereferenceaudio-00-phone-piece-01\.m4a-[a-z0-9]+$/);
  assert.doesNotMatch(inputId, /\//);
});

test("cloud sync job advertises shared room URL for link-only collaboration", () => {
  const job = createCloudSyncJob({
    syncJobId: "episode-004",
    roomSelection,
    title: "Episode 004",
    createdBy: "charlie@highgroundodyssey.com",
    includeClip: false,
    now: "2026-05-22T12:00:00.000Z",
  });

  assert.equal(
    job.outputs.sharedRoomUrl,
    "https://high-ground-odyssey.web.app/?projectId=episode-004&branchId=main-cut",
  );
});
