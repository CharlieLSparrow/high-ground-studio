/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  appendTranscriptEvaluationCandidate,
  appendTranscriptEvaluationCorrectionObservation,
  exportTranscriptEvaluationRunnerInput,
  readTranscriptEvaluationCandidates,
} from "@/lib/server/transcript-evaluation-candidates";
import {
  claimTranscriptEvaluationRun,
  completeTranscriptEvaluationRun,
  queueTranscriptTerminologyEvaluationRun,
  readTranscriptEvaluationRuns,
} from "@/lib/server/transcript-evaluation-runs";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn(() => ({ marker: "prisma" })) }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/transcript-evaluation-candidates", () => {
  class MockTranscriptEvaluationCandidateError extends Error {
    constructor(message: string, public code = "INVALID", public status = 400) { super(message); }
  }
  return {
    appendTranscriptEvaluationCandidate: jest.fn(),
    appendTranscriptEvaluationCorrectionObservation: jest.fn(),
    exportTranscriptEvaluationRunnerInput: jest.fn(),
    readTranscriptEvaluationCandidates: jest.fn(),
    TranscriptEvaluationCandidateError: MockTranscriptEvaluationCandidateError,
  };
});
jest.mock("@/lib/server/transcript-evaluation-runs", () => {
  class MockTranscriptEvaluationRunError extends Error {
    constructor(message: string, public code = "INVALID_RUN", public status = 400) { super(message); }
  }
  return {
    claimTranscriptEvaluationRun: jest.fn(),
    completeTranscriptEvaluationRun: jest.fn(),
    failTranscriptEvaluationRun: jest.fn(),
    heartbeatTranscriptEvaluationRun: jest.fn(),
    queueTranscriptTerminologyEvaluationRun: jest.fn(),
    readTranscriptEvaluationRuns: jest.fn(),
    retryTranscriptEvaluationRun: jest.fn(),
    TranscriptEvaluationRunError: MockTranscriptEvaluationRunError,
  };
});
const session = { user: { id: "user-1", primaryEmail: "producer@example.test", isStaff: false } };

describe("private transcript evaluation API", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects signed-out reads before accessing Prisma", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const result = await GET(new Request("http://localhost/api/transcript-evaluation?roomId=room-1"));
    expect(result.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns the privacy-safe candidate projection by default", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(readTranscriptEvaluationCandidates).mockResolvedValue({ schema: "candidate-v1", windowCount: 1, candidates: [] } as any);
    const result = await GET(new Request("http://localhost/api/transcript-evaluation?roomId=room-1"));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ ok: true, windowCount: 1, candidates: [] });
    expect(readTranscriptEvaluationCandidates).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      actor: { id: "user-1", email: "producer@example.test", isStaff: false },
    }));
  });

  it("makes private runner input an explicit no-store attachment", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(exportTranscriptEvaluationRunnerInput).mockResolvedValue({ kind: "runner-input-v1", windows: [] } as any);
    const result = await GET(new Request("http://localhost/api/transcript-evaluation?roomId=room-1&view=runner-input"));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("content-disposition")).toContain("quipsly-transcript-runner-room-1.json");
    expect(exportTranscriptEvaluationRunnerInput).toHaveBeenCalled();
  });

  it("reads safe run state and routes queue, claim, and completion explicitly", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(readTranscriptEvaluationRuns).mockResolvedValue({ schema: "run-v1", runs: [{ id: "run-1", status: "QUEUED" }] } as any);
    const runs = await GET(new Request("http://localhost/api/transcript-evaluation?roomId=room-1&view=runs"));
    expect(runs.status).toBe(200);
    expect(await runs.json()).toMatchObject({ ok: true, runs: [{ id: "run-1", status: "QUEUED" }] });

    jest.mocked(queueTranscriptTerminologyEvaluationRun).mockResolvedValue({ ok: true, run: { id: "run-1" } } as any);
    const queued = await POST(new Request("http://localhost/api/transcript-evaluation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "queue-terminology-run", roomId: "room-1", requestId: "019f0000-0000-7000-8000-000000000001", windowIds: ["window-1"] }),
    }));
    expect(queued.status).toBe(201);
    expect(queueTranscriptTerminologyEvaluationRun).toHaveBeenCalledWith(expect.objectContaining({ roomId: "room-1", windowIds: ["window-1"] }));

    jest.mocked(claimTranscriptEvaluationRun).mockResolvedValue({ ok: true, lease: { token: "private-lease" } } as any);
    await POST(new Request("http://localhost/api/transcript-evaluation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "claim-run", workerId: "worker-1", leaseSeconds: 600 }),
    }));
    expect(claimTranscriptEvaluationRun).toHaveBeenCalledWith(expect.objectContaining({ workerId: "worker-1", leaseSeconds: 600 }));

    jest.mocked(completeTranscriptEvaluationRun).mockResolvedValue({ ok: true, run: { id: "run-1", status: "COMPLETED" } } as any);
    await POST(new Request("http://localhost/api/transcript-evaluation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "complete-run", runId: "run-1", leaseToken: "019f0000-0000-7000-8000-000000000002" }),
    }));
    expect(completeTranscriptEvaluationRun).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1", leaseToken: "019f0000-0000-7000-8000-000000000002" }));
  });

  it("routes immutable candidate and correction receipts explicitly", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(appendTranscriptEvaluationCandidate).mockResolvedValue({ ok: true, candidate: { id: "candidate-1" } } as any);
    const candidate = await POST(new Request("http://localhost/api/transcript-evaluation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "append-candidate",
        windowId: "window-1",
        clientRequestId: "request-1",
        runKey: "run-1",
        requestConfig: { model: "model-1" },
        rawResponse: { text: "private" },
        policy: { sourceUrl: "https://example.test/policy" },
        candidate: { outcome: "succeeded" },
      }),
    }));
    expect(candidate.status).toBe(201);
    expect(appendTranscriptEvaluationCandidate).toHaveBeenCalledWith(expect.objectContaining({
      windowId: "window-1",
      runKey: "run-1",
      rawResponse: { text: "private" },
    }));

    jest.mocked(appendTranscriptEvaluationCorrectionObservation).mockResolvedValue({ ok: true, observationId: "observation-1" } as any);
    const correction = await POST(new Request("http://localhost/api/transcript-evaluation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "append-correction-observation",
        candidateId: "candidate-1",
        clientRequestId: "correction-1",
        elapsedMilliseconds: 1000,
        operationCount: 1,
        observedAt: "2026-08-03T18:00:00.000Z",
        observation: { surface: "desk" },
      }),
    }));
    expect(correction.status).toBe(201);
    expect(appendTranscriptEvaluationCorrectionObservation).toHaveBeenCalledWith(expect.objectContaining({ candidateId: "candidate-1", operationCount: 1 }));
  });

  it("rejects oversized bodies before parsing or writing", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    const result = await POST(new Request("http://localhost/api/transcript-evaluation", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "2300001" },
      body: "{}",
    }));
    expect(result.status).toBe(413);
    expect(appendTranscriptEvaluationCandidate).not.toHaveBeenCalled();
  });
});
