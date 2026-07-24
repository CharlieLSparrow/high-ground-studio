// @ts-nocheck

import { runCoachingCaptureTranscriptJob } from "./capture-transcripts";
import {
  buildCoachingPacketFromTranscriptJob,
  isUnreviewedTranscriptActionItem,
} from "./coaching-packets";
import { coachingTranscriptReleaseGate } from "./transcript-release-gate";
import { createCoachingStorageClient } from "./gcs-storage";

jest.mock("./transcript-release-gate", () => ({
  coachingTranscriptReleaseGate: jest.fn(),
}));
jest.mock("./gcs-storage", () => ({
  createCoachingStorageClient: jest.fn(),
}));

const mockedReleaseGate = jest.mocked(coachingTranscriptReleaseGate);
const mockedStorageClient = jest.mocked(createCoachingStorageClient);

function completedJob() {
  return {
    id: "transcript-web-1",
    roomId: "room-1",
    assetId: "asset-1",
    provider: "deepgram",
    language: "en",
    status: "COMPLETED",
    room: { bookingId: "booking-1", booking: { id: "booking-1" } },
    asset: {
      id: "asset-1",
      roomId: "room-1",
      status: "VERIFIED",
      storageBucket: "bucket-1",
      storageObjectPath: "recordings/asset-1.m4a",
      byteSize: 128,
    },
    segments: [{
      id: "segment-1",
      speakerLabel: "Charlie",
      startSeconds: 12,
      endSeconds: 18,
      text: "I will send the episode outline before next time.",
      confidence: 0.98,
    }],
  };
}

describe("web transcript and packet review boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReleaseGate.mockResolvedValue({
      allowed: true,
      evidenceKind: "NORMALIZED_FINALIZATION",
    });
  });

  it("rejects held media before storage download or transcript provider use", async () => {
    mockedReleaseGate.mockResolvedValue({
      allowed: false,
      evidenceKind: "HELD",
      errorCode: "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED",
      error: "Transcript processing awaits reviewed release.",
    });
    const update = jest.fn(async ({ data }) => ({ id: "transcript-web-1", ...data }));
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({
          ...completedJob(),
          status: "QUEUED",
          segments: [],
        }),
        update,
      },
    };
    const providerFetch = jest.spyOn(globalThis, "fetch");

    const result = await runCoachingCaptureTranscriptJob({
      prisma,
      transcriptJobId: "transcript-web-1",
      requestedByUserId: "coach-1",
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: 409,
      errorCode: "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED",
      explicitReleaseRequired: true,
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "HELD", provider: "processing-hold" }),
    }));
    expect(mockedStorageClient).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
    providerFetch.mockRestore();
  });

  it("does not report an already-completed transcript as reusable after its release is held", async () => {
    mockedReleaseGate.mockResolvedValue({
      allowed: false,
      evidenceKind: "HELD",
      errorCode: "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED",
      error: "Transcript processing awaits reviewed release.",
    });
    const update = jest.fn(async ({ data }) => ({ id: "transcript-web-1", ...data }));
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(completedJob()),
        update,
      },
    };

    const result = await runCoachingCaptureTranscriptJob({
      prisma,
      transcriptJobId: "transcript-web-1",
      requestedByUserId: "coach-1",
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: 409,
      errorCode: "CAPTURE_TRANSCRIPT_EXPLICIT_RELEASE_REQUIRED",
      explicitReleaseRequired: true,
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "HELD", provider: "processing-hold" }),
    }));
    expect(mockedStorageClient).not.toHaveBeenCalled();
  });

  it("holds a failed transcript version with segments before provider work can replace its IDs", async () => {
    const update = jest.fn(async ({ data }) => ({ id: "transcript-web-1", ...data }));
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue({ ...completedJob(), status: "FAILED" }),
        update,
      },
      $transaction: jest.fn(),
    };
    const providerFetch = jest.spyOn(globalThis, "fetch");
    const result = await runCoachingCaptureTranscriptJob({ prisma, transcriptJobId: "transcript-web-1", requestedByUserId: "coach-1" });
    expect(result).toEqual(expect.objectContaining({ ok: false, status: 409, errorCode: "TRANSCRIPT_VERSION_IMMUTABLE", createNewVersion: true, recordingAssetId: "asset-1" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "HELD" }) }));
    expect(mockedStorageClient).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    providerFetch.mockRestore();
  });

  it("persists correlated review candidates and creates zero ActionItem rows", async () => {
    const createNote = jest.fn(async ({ data }) => ({
      id: data.kind === "SUMMARY" ? "summary-1" : `highlight-${data.sourceJson.segmentId}`,
      ...data,
    }));
    const createActionItem = jest.fn();
    const prisma = {
      transcriptJob: { findUnique: jest.fn().mockResolvedValue(completedJob()) },
      coachingNote: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: createNote,
      },
      actionItem: { create: createActionItem },
    };

    const result = await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: "transcript-web-1",
      authorUserId: "coach-1",
    });

    const summary = createNote.mock.calls.find(([call]) => call.data.kind === "SUMMARY")[0].data;
    expect(summary.sourceJson).toEqual(expect.objectContaining({
      source: "transcript-packet-builder",
      transcriptJobId: "transcript-web-1",
      recordingAssetId: "asset-1",
      roomId: "room-1",
      packetBuildId: expect.any(String),
      actionCandidates: [expect.objectContaining({
        kind: "quipsly-transcript-action-candidate-v1",
        transcriptJobId: "transcript-web-1",
        recordingAssetId: "asset-1",
        roomId: "room-1",
        packetBuildId: expect.any(String),
        segmentId: "segment-1",
        humanApprovalRequired: true,
        committedActionItemId: null,
      })],
      packetBrief: expect.objectContaining({
        kind: "quipsly-transcript-packet-brief-v1",
        candidateOnly: true,
        humanApprovalRequired: true,
        sections: expect.arrayContaining([
          expect.objectContaining({ id: "commitments", itemCount: 1 }),
        ]),
      }),
    }));
    expect(createActionItem).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      actionCandidateCount: 1,
      actionItemCount: 0,
      actionItemIds: [],
    }));
  });

  it("quarantines candidate ActionItems from both packet source names", () => {
    expect(isUnreviewedTranscriptActionItem({
      sourceJson: { source: "transcript-packet-builder", candidate: true },
    })).toBe(true);
    expect(isUnreviewedTranscriptActionItem({
      sourceJson: { source: "web-transcript-packet-builder", candidate: true },
    })).toBe(true);
    expect(isUnreviewedTranscriptActionItem({
      sourceJson: { source: "transcript-packet-builder", candidate: false },
    })).toBe(false);
  });
});
