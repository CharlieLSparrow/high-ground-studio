/** @jest-environment node */

import { reconcileCaptureTranscriptFollowThrough } from "./capture-transcript-follow-through";
import {
  authorizeCaptureTranscriptFollowThroughWorker,
  runCaptureTranscriptFollowThroughMaintenance,
} from "./capture-transcript-follow-through-worker";

jest.mock("server-only", () => ({}));
jest.mock("./capture-transcript-follow-through", () => ({
  reconcileCaptureTranscriptFollowThrough: jest.fn(),
}));

describe("capture transcript follow-through worker", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires the exact scheduler identity and immutable Cloud Run audience", async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({
      email: "quipsly-transcript-follow-through@example.iam.gserviceaccount.com",
      emailVerified: true,
    });
    const environment = {
      CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_SERVICE_ACCOUNT: "quipsly-transcript-follow-through@example.iam.gserviceaccount.com",
      CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_AUDIENCE: "https://studio-example.run.app",
    };
    await expect(authorizeCaptureTranscriptFollowThroughWorker({
      authorization: "Bearer token-1",
      environment,
      verifyIdToken,
    })).resolves.toBe("authorized");
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "token-1",
      audience: "https://studio-example.run.app",
    });
    await expect(authorizeCaptureTranscriptFollowThroughWorker({
      authorization: "Bearer token-1",
      environment: { ...environment, CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_AUDIENCE: "http://127.0.0.1" },
      verifyIdToken,
    })).resolves.toBe("not-configured");
  });

  it("prioritizes unfinished transcripts, heals interrupted completions, and keeps candidate work private", async () => {
    const findMany = jest.fn()
      .mockResolvedValueOnce([{ id: "job-running" }])
      .mockResolvedValueOnce([{ id: "job-held" }])
      .mockResolvedValueOnce([{ id: "job-completed" }, { id: "job-running" }]);
    const prisma = { transcriptJob: { findMany } };
    jest.mocked(reconcileCaptureTranscriptFollowThrough)
      .mockResolvedValueOnce({ transcriptJobId: "job-running", transcriptStatus: "completed", packetStatus: "ready", packetBuildId: "packet-1", reusedExistingPacket: false })
      .mockResolvedValueOnce({ transcriptJobId: "job-completed", transcriptStatus: "completed", packetStatus: "ready", packetBuildId: "packet-2", reusedExistingPacket: true })
      .mockResolvedValueOnce({ transcriptJobId: "job-held", transcriptStatus: "held", packetStatus: "waiting", packetBuildId: null, reusedExistingPacket: false });

    await expect(runCaptureTranscriptFollowThroughMaintenance({ prisma, limit: 3 })).resolves.toMatchObject({
      scanned: 3,
      ready: 2,
      waiting: 1,
      held: 0,
      failed: 0,
      boundaries: {
        ordinarySessionWorkCreated: true,
        candidateOnly: false,
        canonicalAccessApplied: true,
        authorPrivate: false,
        automaticAssignment: true,
        automaticSharing: true,
        automaticExternalDelivery: false,
        externalSideEffects: false,
      },
    });
    expect(findMany.mock.calls[2]?.[0].where).toMatchObject({
      status: "COMPLETED",
      NOT: { resultJson: { path: ["followThrough", "packetStatus"], equals: "ready" } },
    });
    expect(jest.mocked(reconcileCaptureTranscriptFollowThrough).mock.calls.map((call) => call[0].transcriptJobId))
      .toEqual(["job-running", "job-completed", "job-held"]);
  });

  it("reports one retryable failure without losing other work", async () => {
    const prisma = { transcriptJob: { findMany: jest.fn().mockResolvedValueOnce([{ id: "job-1" }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]) } };
    jest.mocked(reconcileCaptureTranscriptFollowThrough).mockRejectedValue(new Error("temporary"));
    await expect(runCaptureTranscriptFollowThroughMaintenance({ prisma })).resolves.toMatchObject({
      scanned: 1,
      failed: 1,
      held: 1,
      results: [{ transcriptJobId: "job-1", retryable: true }],
    });
  });
});
