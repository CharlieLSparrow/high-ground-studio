/** @jest-environment node */

import { createHash } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { transcriptPacketSnapshot } from "@/lib/server/coaching-packets";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { recordSucceededTranscriptWorkAction } from "@/lib/server/governed-action-runtime";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));
jest.mock("@/lib/server/governed-action-runtime", () => {
  const actual = jest.requireActual("@/lib/server/governed-action-runtime");
  return { ...actual, recordSucceededTranscriptWorkAction: jest.fn() };
});
jest.mock("@/lib/server/transcript-corrections", () => {
  class MockTranscriptCorrectionError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
  }
  return { readTranscriptCorrectionDesk: jest.fn(), TranscriptCorrectionError: MockTranscriptCorrectionError };
});

const session = { user: { id: "user-1", primaryEmail: "person@example.com", isStaff: false } };
const desk = {
  ok: true,
  roomId: "room-1",
  projectId: "project-1",
  transcriptJobId: "job-1",
  gate: { allowed: true },
  playback: { sourceId: "source-1", recordingAssetId: "asset-1" },
  segments: [{
    id: "segment-1",
    startSeconds: 3.66,
    endSeconds: 4.84,
    providerText: "Welcome, everybody.",
    providerTextSha256: "a".repeat(64),
    providerSpeakerLabel: "Speaker",
    text: "Welcome, everybody.",
    speakerLabel: "Charlie",
    acceptedCorrection: { id: "correction-1" },
  }],
};

const requestBody = {
  roomId: "room-1",
  segmentId: "segment-1",
  clientRequestId: "transcript-note-request-1",
  expectedProviderTextSha256: "a".repeat(64),
  title: "Opening observation",
  body: "This is the note we want to carry into follow-through.",
  kind: "SESSION_NOTE",
  visibility: "CLIENT_SAFE",
  surface: "ios-capture-transcript-review",
};

function reviewedAsIs(text: string, speakerLabel: string, id: string) {
  return [{
    id,
    reviewKind: "confirmed-as-is",
    providerTextSha256: createHash("sha256").update(text).digest("hex"),
    providerSpeakerLabel: speakerLabel,
    createdAt: new Date("2026-08-02T02:10:00.000Z"),
  }];
}

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/mobile/capture/transcripts/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...requestBody, ...overrides }),
  });
}

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: "transcript-note-1",
    roomId: "room-1",
    authorUserId: "user-1",
    title: "Opening observation",
    body: "This is the note we want to carry into follow-through.",
    kind: "SESSION_NOTE",
    visibility: "CLIENT_SAFE",
    createdAt: new Date("2026-08-02T02:00:00.000Z"),
    updatedAt: new Date("2026-08-02T02:00:00.000Z"),
    authorUser: { name: "Charlie", primaryEmail: "person@example.com" },
    tagLinks: [],
    _count: { revisions: 1 },
    ...overrides,
  };
}

function transaction(room: any, existing: any = null, created: any = null) {
  const tx = {
    callRoom: { findFirst: jest.fn().mockResolvedValue(room) },
    coachingNote: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(async (args: any) => created || note({ sourceJson: args.data.sourceJson })),
    },
  };
  jest.mocked(getPrismaClient).mockReturnValue({
    $transaction: jest.fn((callback: any) => callback(tx)),
    coachingNote: { findUnique: jest.fn() },
  } as any);
  return tx;
}

describe("explicit transcript-derived Session note", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(recordSucceededTranscriptWorkAction).mockResolvedValue({
      schema: "quipsly-governed-action-reference-v1",
      runId: "governed-run-1",
      actionId: "governed-action-1",
      attemptId: "governed-attempt-1",
      receiptId: "governed-receipt-1",
      capabilityId: "quipsly.session.transcript-note.materialize",
      capabilityVersion: 1,
    } as any);
  });

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates one revisioned client-safe note with exact playback provenance and no external effects", async () => {
    const tx = transaction({ id: "room-1", bookingId: "booking-1", project: { accessGrants: [] } });
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      idempotentReplay: false,
      note: {
        title: "Opening observation",
        visibility: "CLIENT_SAFE",
        revisionCount: 1,
        originLabel: "Transcript review",
        sourceAnchor: { roomId: "room-1", segmentId: "segment-1", startSeconds: 3.66, recordingAssetId: "asset-1" },
      },
      boundaries: { noteCreated: true, sourceAnchorPreserved: true, taskCreated: false, goalCreated: false, messageSent: false, externalDelivery: false, publication: false },
    });
    expect(tx.callRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "room-1" }) }));
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledWith(expect.objectContaining({ prisma: tx, roomId: "room-1" }));
    expect(tx.coachingNote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookingId: "booking-1",
        authorUserId: "user-1",
        visibility: "CLIENT_SAFE",
        sourceJson: expect.objectContaining({
          schema: "quipsly-transcript-derived-note-v1",
          providerTextSha256: "a".repeat(64),
          acceptedCorrectionId: "correction-1",
          recordingAssetId: "asset-1",
          initialVisibility: "CLIENT_SAFE",
        }),
        revisions: { create: expect.objectContaining({ revision: 1, operation: "created-from-transcript" }) },
      }),
    }));
  });

  it("fails closed when Session mutation access disappears", async () => {
    const tx = transaction(null);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "SESSION_MUTATION_ACCESS_REQUIRED" });
    expect(readTranscriptCorrectionDesk).not.toHaveBeenCalled();
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
  });

  it("requires owner, editor, or staff authority for production-team notes", async () => {
    const tx = transaction({ id: "room-1", bookingId: null, project: { accessGrants: [{ role: "VIEWER" }] } });
    const response = await POST(request({ kind: "PRODUCTION", visibility: "PROJECT_TEAM" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PROJECT_ROLE_REQUIRED" });
    expect(readTranscriptCorrectionDesk).not.toHaveBeenCalled();
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
  });

  it("rejects stale provider evidence without creating a note", async () => {
    const tx = transaction({ id: "room-1", bookingId: null, project: { accessGrants: [] } });
    const response = await POST(request({ expectedProviderTextSha256: "b".repeat(64) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "STALE_PROVIDER_EVIDENCE" });
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
  });

  it("replays the same initial request without duplicating the canonical note", async () => {
    const sourceJson = {
      schema: "quipsly-transcript-derived-note-v1",
      createdByUserId: "user-1",
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "transcript-note-request-1",
      providerTextSha256: "a".repeat(64),
      initialTitle: requestBody.title,
      initialBody: requestBody.body,
      initialKind: "SESSION_NOTE",
      initialVisibility: "CLIENT_SAFE",
      transcriptJobId: "job-1",
      startSeconds: 3.66,
      endSeconds: 4.84,
      effectiveTextSnapshot: "Welcome, everybody.",
      recordingAssetId: "asset-1",
      playbackSourceId: "source-1",
    };
    const tx = transaction(
      { id: "room-1", bookingId: null, project: { accessGrants: [] } },
      note({ sourceJson, title: "Later edited title", _count: { revisions: 2 } }),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true, note: { title: "Later edited title", revisionCount: 2 }, boundaries: { noteCreated: false } });
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
  });

  it("materializes a current packet lane item into one private canonical note", async () => {
    const providerText = "The important insight is to preserve the recording and";
    const continuationText = "wait for explicit release.";
    const sourceText = `${providerText} ${continuationText}`;
    const providerTextSha256 = createHash("sha256").update(providerText).digest("hex");
    const segments = [
      { id: "segment-1", speakerLabel: "Speaker", startSeconds: 3.66, endSeconds: 4.2, text: providerText, corrections: [], verifications: reviewedAsIs(providerText, "Speaker", "verification-1") },
      { id: "segment-2", speakerLabel: "Speaker", startSeconds: 4.2, endSeconds: 4.84, text: continuationText, corrections: [], verifications: reviewedAsIs(continuationText, "Speaker", "verification-2") },
    ];
    const summary = {
      id: "summary-1",
      kind: "SUMMARY",
      sourceJson: {
        source: "transcript-packet-builder",
        packetTemplateVersion: "quipsly-session-packet-v4",
        roomId: "room-1",
        transcriptJobId: "job-1",
        recordingAssetId: "asset-1",
        packetBuildId: "build-1",
        transcriptSnapshot: transcriptPacketSnapshot(segments),
        reviewLanes: [{
          id: "coaching-insights",
          label: "Insights and decisions",
          status: "READY_FOR_HUMAN_REVIEW",
          items: [{
            segmentId: "segment-1",
            segmentIds: ["segment-1", "segment-2"],
            sourceTextSha256: createHash("sha256").update(sourceText).digest("hex"),
            text: sourceText,
          }],
        }],
      },
      createdAt: new Date("2026-08-02T02:00:00.000Z"),
      updatedAt: new Date("2026-08-02T02:00:00.000Z"),
    };
    const packetRequestId = "packet-note-build-1-coaching-insights-segment-1";
    let createdNote: any = null;
    const tx = {
      $queryRaw: jest.fn(),
      callRoom: { findFirst: jest.fn().mockResolvedValue({ id: "room-1", bookingId: "booking-1", project: { accessGrants: [] } }) },
      coachingNote: {
        findMany: jest.fn().mockResolvedValue([summary]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async (args: any) => {
          createdNote = note({ sourceJson: args.data.sourceJson, visibility: "AUTHOR_PRIVATE" });
          return createdNote;
        }),
        update: jest.fn().mockImplementation(async (args: any) => {
          if (args.where.id === summary.id) {
            summary.sourceJson = args.data.sourceJson;
            return summary;
          }
          createdNote = { ...createdNote, sourceJson: args.data.sourceJson };
          return createdNote;
        }),
      },
      coachingNoteRevision: { update: jest.fn() },
      transcriptJob: {
        findFirst: jest.fn().mockResolvedValue({ id: "job-1", roomId: "room-1", assetId: "asset-1", status: "COMPLETED", asset: { id: "asset-1" }, segments }),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn((callback: any) => callback(tx)),
      coachingNote: { findUnique: jest.fn() },
    } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      ...desk,
      segments: [
        { ...desk.segments[0], endSeconds: 4.2, text: providerText, providerText, providerTextSha256, acceptedCorrection: null, acceptedVerification: { id: "verification-1" }, reviewStatus: "human-reviewed" },
        { ...desk.segments[0], id: "segment-2", startSeconds: 4.2, endSeconds: 4.84, text: continuationText, providerText: continuationText, providerTextSha256: createHash("sha256").update(continuationText).digest("hex"), acceptedCorrection: null, acceptedVerification: { id: "verification-2" }, reviewStatus: "human-reviewed" },
      ],
    } as any);

    const response = await POST(request({
      clientRequestId: packetRequestId,
      expectedProviderTextSha256: providerTextSha256,
      title: "Insights and decisions",
      body: "A reviewed note from this exact moment.",
      visibility: "AUTHOR_PRIVATE",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-1",
      packetBuildId: "build-1",
      packetNoteCandidateId: packetRequestId,
      packetLaneId: "coaching-insights",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      idempotentReplay: false,
      note: { visibility: "AUTHOR_PRIVATE", sourceAnchor: {
        segmentId: "segment-1",
        startSeconds: 3.66,
        endSeconds: 4.84,
        effectiveTextSnapshot: sourceText,
        sourceSpan: { segmentIds: ["segment-1", "segment-2"] },
      } },
      governance: { actionId: "governed-action-1", capabilityId: "quipsly.session.transcript-note.materialize" },
      boundaries: { packetCandidateReviewed: true, packetSnapshotRechecked: true, noteCreated: true, externalDelivery: false },
    });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(tx, "transcript-job-packet-source:job-1");
    expect(recordSucceededTranscriptWorkAction).toHaveBeenCalledWith(tx, expect.objectContaining({
      capabilityId: "quipsly.session.transcript-note.materialize",
      targetObjectType: "CoachingNote",
      targetObjectId: "transcript-note-1",
      boundaries: expect.objectContaining({ externalDelivery: false, clientFollowUpCreated: false }),
    }));
    expect(tx.coachingNote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceJson: expect.objectContaining({
          packetSummaryNoteId: "summary-1",
          packetBuildId: "build-1",
          packetNoteCandidateId: packetRequestId,
          packetLaneId: "coaching-insights",
          packetLaneLabel: "Insights and decisions",
          materializedFromPacket: true,
          segmentIds: ["segment-1", "segment-2"],
          effectiveTextSnapshot: sourceText,
          sourceSpan: expect.objectContaining({
            segmentIds: ["segment-1", "segment-2"],
            segments: [
              expect.objectContaining({ segmentId: "segment-1", providerTextSha256 }),
              expect.objectContaining({ segmentId: "segment-2", providerTextSha256: createHash("sha256").update(continuationText).digest("hex") }),
            ],
          }),
        }),
        revisions: { create: expect.objectContaining({ operation: "created-from-transcript-packet" }) },
      }),
    }));
    expect(tx.coachingNote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "summary-1" },
      data: { sourceJson: expect.objectContaining({
        noteCandidateReviewReceipts: [expect.objectContaining({
          kind: "quipsly-note-candidate-review-receipt-v1",
          decision: "ACCEPT",
          reviewedByUserId: "user-1",
          packetNoteCandidateId: packetRequestId,
          noteId: "transcript-note-1",
        })],
      }) },
    }));

    const createdSource = createdNote.sourceJson;
    const updatedSummarySource = tx.coachingNote.update.mock.calls.find((call: any[]) => call[0].where.id === "summary-1")![0].data.sourceJson;
    tx.coachingNote.findMany.mockResolvedValue([{ ...summary, sourceJson: updatedSummarySource }]);
    tx.coachingNote.findUnique.mockResolvedValue(note({ sourceJson: createdSource, visibility: "AUTHOR_PRIVATE" }));
    const replayResponse = await POST(request({
      clientRequestId: packetRequestId,
      expectedProviderTextSha256: providerTextSha256,
      decision: "ACCEPT",
      title: "Insights and decisions",
      body: "A reviewed note from this exact moment.",
      visibility: "AUTHOR_PRIVATE",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-1",
      packetBuildId: "build-1",
      packetNoteCandidateId: packetRequestId,
      packetLaneId: "coaching-insights",
    }));
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.json()).toMatchObject({ ok: true, decision: "ACCEPT", idempotentReplay: true, note: { id: "transcript-note-1" } });
    expect(tx.coachingNote.create).toHaveBeenCalledTimes(1);
    expect(tx.coachingNote.update).toHaveBeenCalledTimes(2);
  });

  it("merges a reviewed packet candidate into one existing note as an idempotent recoverable revision", async () => {
    const providerText = "Keep the editorial decision and its exact source together.";
    const providerTextSha256 = createHash("sha256").update(providerText).digest("hex");
    const segments = [{
      id: "segment-1",
      speakerLabel: "Speaker",
      startSeconds: 3.66,
      endSeconds: 4.84,
      text: providerText,
      corrections: [],
      verifications: reviewedAsIs(providerText, "Speaker", "verification-merge"),
    }];
    const packetRequestId = "packet-note-build-merge-coaching-insights-segment-1";
    const targetUpdatedAt = new Date("2026-08-03T14:00:00.000Z");
    const summary = {
      id: "summary-merge",
      kind: "SUMMARY",
      sourceJson: {
        source: "transcript-packet-builder",
        packetTemplateVersion: "quipsly-session-packet-v4",
        roomId: "room-1",
        transcriptJobId: "job-1",
        recordingAssetId: "asset-1",
        packetBuildId: "build-merge",
        transcriptSnapshot: transcriptPacketSnapshot(segments),
        reviewLanes: [{
          id: "coaching-insights",
          label: "Insights and decisions",
          status: "READY_FOR_HUMAN_REVIEW",
          items: [{ segmentId: "segment-1", sourceTextSha256: createHash("sha256").update(providerText).digest("hex"), text: providerText }],
        }],
      },
      createdAt: new Date("2026-08-03T13:00:00.000Z"),
      updatedAt: new Date("2026-08-03T13:00:00.000Z"),
    };
    const target = note({
      id: "existing-note-1",
      title: "Episode direction",
      body: "Keep the strongest editorial decisions together.",
      visibility: "AUTHOR_PRIVATE",
      sourceJson: { origin: "nest-session-notes" },
      updatedAt: targetUpdatedAt,
      _count: { revisions: 2 },
    });
    let savedSource: any = null;
    const savedTarget = () => note({
      ...target,
      title: "Episode direction",
      body: "Keep the strongest editorial decisions together.\n\nKeep the editorial decision and its exact source together.",
      sourceJson: savedSource,
      updatedAt: new Date("2026-08-03T14:01:00.000Z"),
      _count: { revisions: 3 },
    });
    const tx = {
      $queryRaw: jest.fn(),
      callRoom: { findFirst: jest.fn().mockResolvedValue({ id: "room-1", bookingId: null, project: { accessGrants: [] } }) },
      coachingNote: {
        findMany: jest.fn().mockResolvedValue([summary]),
        findUnique: jest.fn().mockImplementation(async (args: any) => args.where.id === "existing-note-1" && savedSource ? savedTarget() : null),
        findFirst: jest.fn().mockResolvedValue(target),
        create: jest.fn(),
        updateMany: jest.fn().mockImplementation(async (args: any) => { savedSource = args.data.sourceJson; return { count: 1 }; }),
        update: jest.fn().mockImplementation(async (args: any) => {
          if (args.where.id === "summary-merge") {
            summary.sourceJson = args.data.sourceJson;
            return summary;
          }
          savedSource = args.data.sourceJson;
          return savedTarget();
        }),
      },
      coachingNoteRevision: {
        findFirst: jest.fn().mockResolvedValue({ revision: 2 }),
        findUnique: jest.fn().mockResolvedValue({ noteId: "existing-note-1", operation: "merged-transcript-candidate" }),
        create: jest.fn(),
        update: jest.fn(),
      },
      transcriptJob: { findFirst: jest.fn().mockResolvedValue({ id: "job-1", roomId: "room-1", assetId: "asset-1", status: "COMPLETED", asset: { id: "asset-1" }, segments }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)), coachingNote: { findUnique: jest.fn() } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      ...desk,
      segments: [{
        ...desk.segments[0],
        text: providerText,
        providerText,
        providerTextSha256,
        acceptedCorrection: null,
        acceptedVerification: { id: "verification-merge" },
        reviewStatus: "human-reviewed",
      }],
    } as any);
    jest.mocked(recordSucceededTranscriptWorkAction).mockResolvedValue({
      schema: "quipsly-governed-action-reference-v1",
      runId: "governed-run-merge",
      actionId: "governed-action-merge",
      attemptId: "governed-attempt-merge",
      receiptId: "governed-receipt-merge",
      capabilityId: "quipsly.session.transcript-note.merge",
      capabilityVersion: 1,
    } as any);
    const mergeRequest = {
      clientRequestId: packetRequestId,
      expectedProviderTextSha256: providerTextSha256,
      decision: "MERGE",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-merge",
      packetBuildId: "build-merge",
      packetNoteCandidateId: packetRequestId,
      packetLaneId: "coaching-insights",
      mergeTargetNoteId: "existing-note-1",
      mergeExpectedUpdatedAt: targetUpdatedAt.toISOString(),
      mergedTitle: "Episode direction",
      mergedBody: "Keep the strongest editorial decisions together.\n\nKeep the editorial decision and its exact source together.",
      mergedKind: "SESSION_NOTE",
      mergedVisibility: "AUTHOR_PRIVATE",
    };

    const response = await POST(request(mergeRequest));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      decision: "MERGE",
      reviewStatus: "MERGED_INTO_NOTE",
      idempotentReplay: false,
      note: {
        id: "existing-note-1",
        revisionCount: 3,
        lastMergedSource: { sourceAnchor: { segmentId: "segment-1", effectiveTextSnapshot: providerText } },
      },
      receipt: { decision: "MERGE", noteId: "existing-note-1", mergeTargetBefore: { body: target.body } },
      governance: { actionId: "governed-action-merge", capabilityId: "quipsly.session.transcript-note.merge" },
      boundaries: { noteCreated: false, noteRevised: true, taskCreated: false, goalCreated: false, calendarMutated: false, messageSent: false },
    });
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
    expect(tx.coachingNote.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "existing-note-1",
        roomId: "room-1",
        authorUserId: "user-1",
        kind: { in: ["SESSION_NOTE", "DECISION", "PRODUCTION"] },
      }),
    }));
    expect(tx.coachingNote.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "existing-note-1", updatedAt: targetUpdatedAt }),
      data: expect.objectContaining({ sourceJson: expect.objectContaining({
        origin: "nest-session-notes",
        lastTranscriptCandidateMerge: expect.objectContaining({ decision: "MERGE", candidateSource: expect.objectContaining({ schema: "quipsly-transcript-derived-note-v1" }) }),
      }) }),
    }));
    expect(tx.coachingNoteRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 3, operation: "merged-transcript-candidate" }) }));
    expect(recordSucceededTranscriptWorkAction).toHaveBeenCalledWith(tx, expect.objectContaining({
      capabilityId: "quipsly.session.transcript-note.merge",
      targetObjectType: "CoachingNote",
      targetObjectId: "existing-note-1",
      boundaries: expect.objectContaining({ priorContentRetainedInRevision: true, externalDelivery: false }),
    }));

    tx.coachingNote.findMany.mockResolvedValue([{ ...summary }]);
    const replay = await POST(request(mergeRequest));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ ok: true, decision: "MERGE", idempotentReplay: true, note: { id: "existing-note-1" }, boundaries: { noteCreated: false, noteRevised: false } });
    expect(tx.coachingNote.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.coachingNoteRevision.create).toHaveBeenCalledTimes(1);
  });

  it("saves an internal note from provider transcript evidence without claiming human review", async () => {
    const providerText = "Keep this insight as a private note.";
    const providerTextSha256 = createHash("sha256").update(providerText).digest("hex");
    const segments = [{
      id: "segment-1",
      speakerLabel: "Speaker",
      startSeconds: 3.66,
      endSeconds: 4.84,
      text: providerText,
      corrections: [],
      verifications: [],
    }];
    const packetRequestId = "packet-note-build-provider-only-coaching-insights-segment-1";
    const summary = {
      id: "summary-provider-only",
      kind: "SUMMARY",
      sourceJson: {
        source: "transcript-packet-builder",
        packetTemplateVersion: "quipsly-session-packet-v4",
        roomId: "room-1",
        transcriptJobId: "job-1",
        recordingAssetId: "asset-1",
        packetBuildId: "build-provider-only",
        transcriptSnapshot: transcriptPacketSnapshot(segments),
        reviewLanes: [{
          id: "coaching-insights",
          label: "Insights",
          status: "READY_FOR_HUMAN_REVIEW",
          items: [{ segmentId: "segment-1", text: providerText }],
        }],
      },
      createdAt: new Date("2026-08-02T02:00:00.000Z"),
      updatedAt: new Date("2026-08-02T02:00:00.000Z"),
    };
    let createdNote: any = null;
    const tx = {
      $queryRaw: jest.fn(),
      callRoom: { findFirst: jest.fn().mockResolvedValue({ id: "room-1", bookingId: null, project: { accessGrants: [] } }) },
      coachingNote: {
        findMany: jest.fn().mockResolvedValue([summary]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async (args: any) => {
          createdNote = note({ sourceJson: args.data.sourceJson, visibility: "AUTHOR_PRIVATE" });
          return createdNote;
        }),
        update: jest.fn().mockImplementation(async (args: any) => {
          if (args.where.id === summary.id) {
            summary.sourceJson = args.data.sourceJson;
            return summary;
          }
          createdNote = { ...createdNote, sourceJson: args.data.sourceJson };
          return createdNote;
        }),
      },
      coachingNoteRevision: { update: jest.fn() },
      transcriptJob: { findFirst: jest.fn().mockResolvedValue({ id: "job-1", roomId: "room-1", assetId: "asset-1", status: "COMPLETED", asset: { id: "asset-1" }, segments }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)), coachingNote: { findUnique: jest.fn() } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      ...desk,
      segments: [{
        ...desk.segments[0],
        text: providerText,
        providerText,
        providerTextSha256,
        acceptedCorrection: null,
        acceptedVerification: null,
        reviewStatus: "provider",
      }],
    } as any);

    const response = await POST(request({
      clientRequestId: packetRequestId,
      expectedProviderTextSha256: providerTextSha256,
      title: "Insights",
      body: providerText,
      visibility: "AUTHOR_PRIVATE",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-provider-only",
      packetBuildId: "build-provider-only",
      packetNoteCandidateId: packetRequestId,
      packetLaneId: "coaching-insights",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      note: { visibility: "AUTHOR_PRIVATE" },
      boundaries: {
        humanReviewedSourceRequired: true,
        humanReviewedSourceRequiredForInternalWork: false,
        sourceReviewState: "provider-transcript",
        sourceReviewRecommended: true,
        externalDelivery: false,
      },
    });
    expect(tx.coachingNote.create).toHaveBeenCalledTimes(1);
    expect(createdNote.sourceJson).toMatchObject({ sourceReviewState: "provider-transcript", automaticallySuggested: true });
  });

  it("rejects a packet note after transcript review changes", async () => {
    const providerText = "Welcome, everybody.";
    const providerTextSha256 = createHash("sha256").update(providerText).digest("hex");
    const oldSegments = [{ id: "segment-1", speakerLabel: "Speaker", startSeconds: 3.66, endSeconds: 4.84, text: providerText, corrections: [], verifications: [] }];
    const currentSegments = [{ ...oldSegments[0], verifications: [{ id: "verification-1", reviewKind: "confirmed-as-is", providerTextSha256, providerSpeakerLabel: "Speaker", createdAt: new Date("2026-08-02T02:10:00.000Z") }] }];
    const packetRequestId = "packet-note-build-1-coaching-insights-segment-1";
    const summary = {
      id: "summary-1",
      kind: "SUMMARY",
      sourceJson: {
        source: "transcript-packet-builder", packetTemplateVersion: "quipsly-session-packet-v4", roomId: "room-1", transcriptJobId: "job-1", recordingAssetId: "asset-1", packetBuildId: "build-1",
        transcriptSnapshot: transcriptPacketSnapshot(oldSegments),
        reviewLanes: [{ id: "coaching-insights", label: "Insights", status: "READY_FOR_HUMAN_REVIEW", items: [{ segmentId: "segment-1" }] }],
      },
      createdAt: new Date("2026-08-02T02:00:00.000Z"), updatedAt: new Date("2026-08-02T02:00:00.000Z"),
    };
    const tx = {
      $queryRaw: jest.fn(),
      callRoom: { findFirst: jest.fn().mockResolvedValue({ id: "room-1", bookingId: null, project: { accessGrants: [] } }) },
      coachingNote: { findMany: jest.fn().mockResolvedValue([summary]), findUnique: jest.fn(), create: jest.fn() },
      transcriptJob: { findFirst: jest.fn().mockResolvedValue({ id: "job-1", roomId: "room-1", assetId: "asset-1", status: "COMPLETED", asset: { id: "asset-1" }, segments: currentSegments }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)), coachingNote: { findUnique: jest.fn() } } as any);
    const response = await POST(request({
      clientRequestId: packetRequestId,
      expectedProviderTextSha256: providerTextSha256,
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-1",
      packetBuildId: "build-1",
      packetNoteCandidateId: packetRequestId,
      packetLaneId: "coaching-insights",
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TRANSCRIPT_REVIEW_CHANGED" });
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
    expect(readTranscriptCorrectionDesk).not.toHaveBeenCalled();
  });
});
