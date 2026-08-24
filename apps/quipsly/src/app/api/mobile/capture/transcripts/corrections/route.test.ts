/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { acknowledgeTranscriptCorrectionImpact } from "@/lib/server/transcript-corrections";
import { readSessionTranscriptCorrectionDesk } from "@/lib/server/session-transcript-correction-desk";
import { approveTranscriptEvaluationWindow, readTranscriptEvaluationReadiness } from "@/lib/server/transcript-evaluation-windows";
import { readTranscriptEvaluationCandidates } from "@/lib/server/transcript-evaluation-candidates";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn(() => ({ marker: "prisma" })) }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/session-transcript-correction-desk", () => ({ readSessionTranscriptCorrectionDesk: jest.fn() }));
jest.mock("@/lib/server/transcript-corrections", () => {
  class MockTranscriptCorrectionError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
  }
  return {
    acknowledgeTranscriptCorrectionImpact: jest.fn(),
    attributeTranscriptSpeaker: jest.fn(),
    confirmTranscriptSegmentAsIs: jest.fn(),
    createTranscriptCorrection: jest.fn(),
    reviewTranscriptCorrectionProposal: jest.fn(),
    TranscriptCorrectionError: MockTranscriptCorrectionError,
  };
});
jest.mock("@/lib/server/transcript-evaluation-windows", () => {
  class MockTranscriptEvaluationWindowError extends Error {
    constructor(message: string, public code = "INVALID", public status = 400) { super(message); }
  }
  return {
    approveTranscriptEvaluationWindow: jest.fn(),
    readTranscriptEvaluationReadiness: jest.fn(),
    TranscriptEvaluationWindowError: MockTranscriptEvaluationWindowError,
  };
});
jest.mock("@/lib/server/transcript-evaluation-candidates", () => ({ readTranscriptEvaluationCandidates: jest.fn() }));

const session = { user: { id: "user-1", primaryEmail: "producer@example.com", isStaff: false } };

describe("transcript correction and accuracy-corpus route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not read private transcript state when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await GET(new Request("http://localhost/api/mobile/capture/transcripts/corrections?callRoomId=room-1"));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(readSessionTranscriptCorrectionDesk).not.toHaveBeenCalled();
    expect(readTranscriptEvaluationReadiness).not.toHaveBeenCalled();
  });

  it("adds private corpus readiness to the canonical correction desk", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(readSessionTranscriptCorrectionDesk).mockResolvedValue({ ok: true, roomId: "room-1", segments: [] } as any);
    jest.mocked(readTranscriptEvaluationReadiness).mockResolvedValue({ eligible: false, blockers: [{ code: "REVIEW_REQUIRED", detail: "Listen first." }], approvedWindows: [] } as any);
    jest.mocked(readTranscriptEvaluationCandidates).mockResolvedValue({ candidates: [{ id: "candidate-1", outcome: "succeeded" }] } as any);
    const response = await GET(new Request("http://localhost/api/mobile/capture/transcripts/corrections?callRoomId=room-1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, evaluation: { eligible: false, blockers: [{ code: "REVIEW_REQUIRED" }], candidates: [{ id: "candidate-1" }] } });
    expect(readTranscriptEvaluationReadiness).toHaveBeenCalledWith(expect.objectContaining({ roomId: "room-1", actor: { id: "user-1", email: "producer@example.com", isStaff: false } }));
  });

  it("keeps an exact-source correction desk bound to one RecordingAsset and suppresses room-wide scorecards", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(readSessionTranscriptCorrectionDesk).mockResolvedValue({ ok: true, roomId: "room-1", transcriptJobId: "job-backup", segments: [] } as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/transcripts/corrections?callRoomId=room-1&recordingAssetId=asset-backup"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      transcriptJobId: "job-backup",
      evaluation: null,
      focusedSource: { recordingAssetId: "asset-backup", roomWideEvaluationSuppressed: true },
    });
    expect(readSessionTranscriptCorrectionDesk).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      recordingAssetId: "asset-backup",
    }));
    expect(readTranscriptEvaluationReadiness).not.toHaveBeenCalled();
    expect(readTranscriptEvaluationCandidates).not.toHaveBeenCalled();
  });

  it("approves a classified evaluation window through an explicit idempotent operation", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(approveTranscriptEvaluationWindow).mockResolvedValue({ ok: true, idempotentReplay: false, window: { id: "window-1" } } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/corrections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "approve-evaluation-window",
        roomId: "room-1",
        clientRequestId: "evaluation-window-request-1",
        workload: "podcast",
        conditions: ["normal-exchange"],
        sourcePlaybackEvidence: { schema: "quipsly-complete-source-playback-v1", playbackSourceId: "source-1", durationSeconds: 60, listenedSecondBins: [0], completedAt: "2026-08-03T18:00:00.000Z" },
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: false, window: { id: "window-1" } });
    expect(approveTranscriptEvaluationWindow).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      clientRequestId: "evaluation-window-request-1",
      workload: "podcast",
      conditions: ["normal-exchange"],
      sourcePlaybackEvidence: expect.objectContaining({ schema: "quipsly-complete-source-playback-v1", playbackSourceId: "source-1" }),
      actor: { id: "user-1", email: "producer@example.com", isStaff: false },
    }));
  });

  it("routes an explicit owner-confirmed downstream impact resolution", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(acknowledgeTranscriptCorrectionImpact).mockResolvedValue({ ok: true, idempotentReplay: false } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/corrections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "acknowledge-transcript-impact",
        roomId: "room-1",
        transcriptJobId: "job-1",
        segmentId: "segment-1",
        artifactKind: "task",
        artifactId: "task-1",
        clientRequestId: "impact-review-task-1",
        expectedArtifactUpdatedAt: "2026-08-06T18:00:00.000Z",
        expectedAcceptedCorrectionId: "correction-1",
        expectedEffectiveText: "Publish on Thursday.",
        expectedEffectiveSpeakerLabel: "Charlie",
        confirmedContentStillValid: true,
      }),
    }));
    expect(response.status).toBe(200);
    expect(acknowledgeTranscriptCorrectionImpact).toHaveBeenCalledWith(expect.objectContaining({
      prisma: { marker: "prisma" },
      actor: { id: "user-1", email: "producer@example.com", isStaff: false },
      artifactKind: "task",
      artifactId: "task-1",
      expectedEffectiveText: "Publish on Thursday.",
      confirmedContentStillValid: true,
    }));
  });
});
