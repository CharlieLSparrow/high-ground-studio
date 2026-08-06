/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  bindAlreadyReleasedMobileCaptureExpectation,
  bindVerifiedMobileCaptureExpectation,
} from "./mobile-capture-source-expectation";

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
    mobileCaptureFinalizationReceipt: { findMany: jest.fn().mockResolvedValue([]) },
    recordingAsset: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}

function releasedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    uploadSessionId: input.uploadSessionId,
    recordingAssetId: input.recordingAssetId,
    metadataJson: {
      immutableUploadBinding: {
        uploadSessionId: input.uploadSessionId,
        captureId: input.captureId,
        roomId: input.roomId,
        actorUserId: input.actorUserId,
        sha256: "a".repeat(64),
        sizeBytes: 42_000,
        bucketName: "quipsly-test-media",
        objectName: "media-vault/test/source.mov",
        generation: "1785990000000",
      },
    },
    ...overrides,
  };
}

function verifiedAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: input.recordingAssetId,
    participantId: input.participantId,
    kind: "LOCAL_VIDEO",
    byteSize: 42_000n,
    checksum: "a".repeat(64),
    storageBucket: "quipsly-test-media",
    storageObjectPath: "media-vault/test/source.mov",
    localManifestJson: {
      exactBytesVerified: true,
      storageGeneration: "1785990000000",
    },
    ...overrides,
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

  it("binds a late declaration to one already released and VERIFIED source", async () => {
    const tx = transaction([expectation()]);
    tx.mobileCaptureFinalizationReceipt.findMany.mockResolvedValue([releasedReceipt()]);
    tx.recordingAsset.findFirst.mockResolvedValue(verifiedAsset());

    await expect(bindAlreadyReleasedMobileCaptureExpectation({
      transaction: tx,
      roomId: input.roomId,
      actorUserId: input.actorUserId,
      captureId: input.captureId,
    })).resolves.toEqual({
      state: "bound",
      expectationId: "expectation-1",
      revision: 2,
    });
    expect(tx.recordingAsset.findFirst).toHaveBeenCalledWith({
      where: {
        id: input.recordingAssetId,
        roomId: input.roomId,
        status: "VERIFIED",
      },
      select: {
        id: true,
        participantId: true,
        kind: true,
        byteSize: true,
        checksum: true,
        storageBucket: true,
        storageObjectPath: true,
        localManifestJson: true,
      },
    });
  });

  it("keeps a late declaration unbound when a legacy VERIFIED row lacks exact evidence", async () => {
    const tx = transaction([expectation()]);
    tx.mobileCaptureFinalizationReceipt.findMany.mockResolvedValue([releasedReceipt()]);
    tx.recordingAsset.findFirst.mockResolvedValue(verifiedAsset({
      localManifestJson: {},
    }));

    await expect(bindAlreadyReleasedMobileCaptureExpectation({
      transaction: tx,
      roomId: input.roomId,
      actorUserId: input.actorUserId,
      captureId: input.captureId,
    })).resolves.toEqual({ state: "exact-byte-evidence-incomplete" });
    expect(tx.callExpectedSource.update).not.toHaveBeenCalled();
  });

  it("fails closed when two released uploads claim one capture identity", async () => {
    const tx = transaction([expectation()]);
    tx.mobileCaptureFinalizationReceipt.findMany.mockResolvedValue([
      { uploadSessionId: input.uploadSessionId, recordingAssetId: input.recordingAssetId },
      { uploadSessionId: "c14191cd-432f-42d7-9584-f8102cf0f617", recordingAssetId: "asset-video-2" },
    ]);

    await expect(bindAlreadyReleasedMobileCaptureExpectation({
      transaction: tx,
      roomId: input.roomId,
      actorUserId: input.actorUserId,
      captureId: input.captureId,
    })).resolves.toEqual({ state: "ambiguous-upload" });
    expect(tx.callExpectedSource.update).not.toHaveBeenCalled();
  });
});
