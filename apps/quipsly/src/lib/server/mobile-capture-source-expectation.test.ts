/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { bindVerifiedMobileCaptureExpectation } from "./mobile-capture-source-expectation";

function expectation(overrides: Record<string, unknown> = {}) {
  return {
    id: "expectation-1",
    roomId: "room-1",
    participantId: "participant-1",
    label: "Scott iPhone video",
    sourceKind: "VIDEO",
    retentionRole: "REQUIRED_MASTER",
    status: "ACTIVE",
    expectedClientKind: "ios",
    expectedDeviceLabel: "iPhone 16",
    recordingAssetId: null,
    captureId: "2a32f19d-8770-4c35-a157-96884d566e82",
    revision: 1,
    latestReason: null,
    ...overrides,
  };
}

function transaction(rows: unknown[]) {
  return {
    callExpectedSource: {
      findMany: jest.fn().mockResolvedValue(rows),
      update: jest.fn().mockImplementation(async ({ data }) => expectation({ ...data })),
    },
    callExpectedSourceRevision: { create: jest.fn().mockResolvedValue({ id: "revision-2" }) },
  };
}

const input = {
  roomId: "room-1",
  participantId: "participant-1",
  actorUserId: "user-1",
  captureId: "2a32f19d-8770-4c35-a157-96884d566e82",
  uploadSessionId: "8fb5f3ca-2898-41fc-b84d-0b6fcb2f9c6c",
  sourceType: "video",
  recordingAssetId: "asset-video-1",
};

describe("verified mobile Capture source-plan binding", () => {
  it("does nothing when the capture was never declared", async () => {
    const tx = transaction([]);
    await expect(bindVerifiedMobileCaptureExpectation({ transaction: tx, ...input }))
      .resolves.toEqual({ state: "not-declared" });
    expect(tx.callExpectedSource.update).not.toHaveBeenCalled();
  });

  it("fails closed when duplicate capture declarations make ownership ambiguous", async () => {
    const tx = transaction([expectation(), expectation({ id: "expectation-2" })]);
    await expect(bindVerifiedMobileCaptureExpectation({ transaction: tx, ...input }))
      .resolves.toEqual({ state: "ambiguous" });
    expect(tx.callExpectedSource.update).not.toHaveBeenCalled();
  });

  it("refuses a source-kind or participant mismatch", async () => {
    const tx = transaction([expectation({ sourceKind: "AUDIO" })]);
    await expect(bindVerifiedMobileCaptureExpectation({ transaction: tx, ...input }))
      .resolves.toEqual({ state: "mismatch" });
    expect(tx.callExpectedSource.update).not.toHaveBeenCalled();
  });

  it("binds the exact verified source and appends a deterministic revision", async () => {
    const tx = transaction([expectation()]);
    await expect(bindVerifiedMobileCaptureExpectation({ transaction: tx, ...input }))
      .resolves.toEqual({ state: "bound", expectationId: "expectation-1", revision: 2 });
    expect(tx.callExpectedSource.update).toHaveBeenCalledWith({
      where: { id: "expectation-1" },
      data: expect.objectContaining({ recordingAssetId: "asset-video-1", revision: 2 }),
    });
    expect(tx.callExpectedSourceRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "BIND",
        revision: 2,
        actorUserId: "user-1",
      }),
    });
    const revision = tx.callExpectedSourceRevision.create.mock.calls[0][0].data;
    expect(revision.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(revision.reason).toMatch(/captureId matched/i);
  });
});
