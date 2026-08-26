/** @jest-environment jsdom */

import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";

jest.mock("@/lib/browser-client-instance", () => ({
  browserClientInstanceId: () => "web-installation",
}));
jest.mock("@/lib/browser-source-vault", () => ({
  listBrowserSourceLedgersForParticipant: jest.fn(),
}));

import { listBrowserSourceLedgersForParticipant } from "@/lib/browser-source-vault";

import { buildBrowserEndpointQueueSnapshot, publishBrowserEndpointQueue } from "./browser-endpoint-queue";

function ledger(overrides: Partial<BrowserSourceCaptureLedger>): BrowserSourceCaptureLedger {
  return {
    kind: "quipsly-browser-source-capture-v1",
    version: 1,
    captureId: "2f10f251-2bc8-4c35-a98f-c76127ae4b76",
    captureGroupId: "02878899-33af-4d5c-a7b9-d52df81a86f6",
    uploadSessionId: "f48d11ce-96f3-4ed4-bacc-5e698ac97a4e",
    callRoomId: "room-1",
    participantId: "participant-1",
    recordingConsentId: "consent-1",
    episodeSlug: null,
    fileName: "source.webm",
    opfsFileName: "source.webm",
    contentType: "audio/webm",
    sourceType: "audio",
    sourceProfile: {
      contractKind: "quipsly-browser-source-capture-v1",
      schemaVersion: 4,
      clientKind: "web",
      sourceKind: "audio",
      quality: "studio-source",
      browserMimeType: "audio/webm",
      deviceId: "mic-1",
      deviceLabel: "Shure MV7i",
      trackSettings: {},
      monotonicStartedNanoseconds: "1",
      monotonicStoppedNanoseconds: "2",
      clockSamples: [],
      processing: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      headphonesAttested: true,
      localVault: "opfs",
      localRetentionRequired: true,
    },
    state: "stopped",
    startedAt: "2026-08-06T18:00:00.000Z",
    stoppedAt: "2026-08-06T18:01:00.000Z",
    sizeBytes: 1024,
    uploadedBytes: 0,
    sha256: "abc",
    chunks: [],
    startReceiptId: "start",
    stopReceiptId: "stop",
    startReceiptPersisted: true,
    stopReceiptPersisted: true,
    serverRecordingAssetId: null,
    serverTranscriptJobId: null,
    failureReason: null,
    updatedAt: "2026-08-06T18:01:00.000Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("browser endpoint queue snapshot", () => {
  const participantId = "participant-1";
  const queueKey = "quipsly-endpoint-queue:v3:participant-1:room-1:02878899-33af-4d5c-a7b9-d52df81a86f6";
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it("stays not empty until the exact local ledger has a verified server asset", () => {
    expect(buildBrowserEndpointQueueSnapshot([ledger({})], "web-installation"))?.toMatchObject({
      queueState: "NOT_EMPTY",
      pendingSourceCount: 1,
      recordingAssetIds: [],
    });
    expect(buildBrowserEndpointQueueSnapshot([ledger({ state: "verified", serverRecordingAssetId: "asset-1" })], "web-installation"))?.toMatchObject({
      queueState: "DRAINED",
      pendingSourceCount: 0,
      observedCaptureIds: ["2f10f251-2bc8-4c35-a98f-c76127ae4b76"],
      recordingAssetIds: ["asset-1"],
    });
  });

  it("stays not empty while verified media still owes its durable STOP receipt", () => {
    expect(buildBrowserEndpointQueueSnapshot([
      ledger({
        state: "verified",
        serverRecordingAssetId: "asset-1",
        stopReceiptPersisted: false,
      }),
    ], "web-installation"))?.toMatchObject({
      queueState: "NOT_EMPTY",
      pendingSourceCount: 1,
      failedSourceCount: 0,
      recordingAssetIds: ["asset-1"],
    });
  });

  it("keeps held and failed sources visible as failed local work", () => {
    expect(buildBrowserEndpointQueueSnapshot([ledger({ state: "held" })], "web-installation"))?.toMatchObject({
      queueState: "NOT_EMPTY",
      pendingSourceCount: 0,
      failedSourceCount: 1,
    });
  });

  it("persists and replays the exact pending request when the first response is lost", async () => {
    jest.mocked(listBrowserSourceLedgersForParticipant).mockResolvedValue([
      ledger({ state: "verified", serverRecordingAssetId: "asset-1" }),
    ]);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, endpointQueues: [] }))
      .mockRejectedValueOnce(new Error("response lost after server commit"))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        endpointQueue: { queueRevision: "1", queueState: "DRAINED" },
      }));
    global.fetch = fetchMock;

    await expect(publishBrowserEndpointQueue({ callRoomId: "room-1", captureGroupId: "02878899-33af-4d5c-a7b9-d52df81a86f6", participantId }))
      .rejects.toThrow("response lost");
    expect(listBrowserSourceLedgersForParticipant).toHaveBeenCalledWith({ callRoomId: "room-1", participantId });
    const durablePending = JSON.parse(window.localStorage.getItem(queueKey) || "null");
    expect(durablePending).toMatchObject({
      version: 2,
      lastRevision: "1",
      pending: { fingerprint: expect.any(String), queueRevision: "1", requestId: expect.any(String), reconciledAt: expect.any(String) },
    });

    await expect(publishBrowserEndpointQueue({ callRoomId: "room-1", captureGroupId: "02878899-33af-4d5c-a7b9-d52df81a86f6", participantId }))
      .resolves.toMatchObject({ acknowledged: true, unchanged: false });

    const firstPost = JSON.parse(fetchMock.mock.calls[1][1].body);
    const replayPost = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(replayPost).toEqual(firstPost);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(window.localStorage.getItem(queueKey) || "null"))
      .toMatchObject({ acknowledgedFingerprint: expect.any(String), lastRevision: "1", pending: null });
  });

  it("repairs a corrupt local revision from server readback before advancing", async () => {
    jest.mocked(listBrowserSourceLedgersForParticipant).mockResolvedValue([
      ledger({ state: "verified", serverRecordingAssetId: "asset-1" }),
    ]);
    window.localStorage.setItem(
      queueKey,
      JSON.stringify({ version: 2, lastRevision: "corrupt", pending: { nope: true } }),
    );
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        endpointQueues: [{ clientInstanceId: "web-installation", queueRevision: "7" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        endpointQueue: { queueRevision: "8", queueState: "DRAINED" },
      }));
    global.fetch = fetchMock;

    await publishBrowserEndpointQueue({ callRoomId: "room-1", captureGroupId: "02878899-33af-4d5c-a7b9-d52df81a86f6", participantId });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ queueRevision: "8" });
  });

  it("does not read or publish a queue without an exact participant owner", async () => {
    global.fetch = jest.fn();

    await expect(publishBrowserEndpointQueue({
      callRoomId: "room-1",
      captureGroupId: "02878899-33af-4d5c-a7b9-d52df81a86f6",
      participantId: " ",
    })).resolves.toBeNull();

    expect(listBrowserSourceLedgersForParticipant).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
