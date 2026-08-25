/** @jest-environment jsdom */

import {
  enqueueBrowserRecordingReceipt,
  flushBrowserRecordingReceiptOutbox,
  listBrowserRecordingReceipts,
  type BrowserRecordingReceiptPayload,
} from "./browser-recording-receipt-outbox";

const ownerA = "participant-owner-a";
const ownerB = "participant-owner-b";

function payload(
  receiptId = "4fe36dd7-a14f-46ae-ae31-e8793c839446",
): BrowserRecordingReceiptPayload {
  return {
    receiptId,
    directiveId: "bd8a43f4-b5c3-4de7-b371-d172b5ce93e5",
    state: "STARTED",
    captureId: "815e22c3-83c0-44fa-9db6-1afc07b11cff",
    clientInstanceId: "web-installation-1",
    clientKind: "web",
    deviceLabel: "Quipsly Web · MacIntel",
    detail: "Durable local source started.",
    occurredAt: "2026-08-25T03:00:00.000Z",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("browser recording receipt outbox", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("partitions pending endpoint evidence and delivery by the canonical participant", async () => {
    enqueueBrowserRecordingReceipt({
      ownerParticipantId: ownerA,
      roomId: "room-1",
      payload: payload(),
    });
    enqueueBrowserRecordingReceipt({
      ownerParticipantId: ownerB,
      roomId: "room-1",
      payload: payload("c7855c20-ce6d-42af-82f9-62d24173748f"),
    });

    expect(listBrowserRecordingReceipts(ownerA)).toHaveLength(1);
    expect(listBrowserRecordingReceipts(ownerA)[0]).toMatchObject({
      ownerParticipantId: ownerA,
      deliveryState: "pending",
    });
    expect(listBrowserRecordingReceipts(ownerB)).toHaveLength(1);
    expect(listBrowserRecordingReceipts("participant-owner-c")).toEqual([]);

    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ok: true }));
    global.fetch = fetchMock as typeof fetch;
    await flushBrowserRecordingReceiptOutbox({ ownerParticipantId: ownerB });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      receiptId: "c7855c20-ce6d-42af-82f9-62d24173748f",
    });
    expect(listBrowserRecordingReceipts(ownerA)[0]).toMatchObject({
      deliveryState: "pending",
    });
  });

  it("persists before network and replays the exact request after a lost response", async () => {
    const entry = enqueueBrowserRecordingReceipt({
      ownerParticipantId: ownerA,
      roomId: "room-1",
      payload: payload(),
    });
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock as typeof fetch;

    await expect(
      flushBrowserRecordingReceiptOutbox({ ownerParticipantId: ownerA }),
    ).resolves.toMatchObject({ pendingCount: 1, latestError: "offline" });
    expect(listBrowserRecordingReceipts(ownerA)[0]).toEqual(entry);

    await expect(
      flushBrowserRecordingReceiptOutbox({ ownerParticipantId: ownerA }),
    ).resolves.toMatchObject({ acknowledgedCount: 1, pendingCount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      fetchMock.mock.calls[0][1]?.body,
    );
    expect(listBrowserRecordingReceipts(ownerA)[0]).toMatchObject({
      deliveryState: "acknowledged",
      deliveredAt: expect.any(String),
    });
  });

  it("retains terminal protocol rejection as diagnostic evidence", async () => {
    enqueueBrowserRecordingReceipt({
      ownerParticipantId: ownerA,
      roomId: "room-1",
      payload: payload(),
    });
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          code: "RECEIPT_ID_CONFLICT",
          error: "Receipt identity conflict.",
        },
        409,
      ),
    ) as typeof fetch;

    await expect(
      flushBrowserRecordingReceiptOutbox({ ownerParticipantId: ownerA }),
    ).resolves.toMatchObject({ rejectedCount: 1, pendingCount: 0 });
    expect(listBrowserRecordingReceipts(ownerA)[0]).toMatchObject({
      deliveryState: "rejected",
      serverError: "Receipt identity conflict.",
    });
  });

  it("coalesces concurrent retry triggers for the same participant", async () => {
    enqueueBrowserRecordingReceipt({
      ownerParticipantId: ownerA,
      roomId: "room-1",
      payload: payload(),
    });
    let resolveResponse: ((value: Response) => void) | undefined;
    global.fetch = jest.fn().mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    ) as typeof fetch;

    const first = flushBrowserRecordingReceiptOutbox({
      ownerParticipantId: ownerA,
    });
    const second = flushBrowserRecordingReceiptOutbox({
      ownerParticipantId: ownerA,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveResponse?.(jsonResponse({ ok: true }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ acknowledgedCount: 1, pendingCount: 0 }),
      expect.objectContaining({ acknowledgedCount: 1, pendingCount: 0 }),
    ]);
  });

  it("fails read-only for corrupt stored bytes", () => {
    window.localStorage.setItem(
      `quipsly-recording-receipt-outbox:v1:${ownerA}:broken`,
      "{not-json",
    );

    expect(() => listBrowserRecordingReceipts(ownerA)).toThrow(
      /preserved an unreadable recording-status receipt/i,
    );
    expect(
      window.localStorage.getItem(
        `quipsly-recording-receipt-outbox:v1:${ownerA}:broken`,
      ),
    ).toBe("{not-json");
  });
});
