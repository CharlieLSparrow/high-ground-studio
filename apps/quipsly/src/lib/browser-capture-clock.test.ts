import {
  browserMonotonicNanoseconds,
  measureBrowserCaptureClockBurst,
  measureBrowserCaptureClockSample,
} from "./browser-capture-clock";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("browser capture clock", () => {
  test("encodes the browser monotonic clock as integer nanoseconds", () => {
    expect(browserMonotonicNanoseconds(1234.56789)).toBe("1234567890");
    expect(() => browserMonotonicNanoseconds(Number.NaN)).toThrow("monotonic clock");
  });

  test("builds an uncertainty-bearing NTP-style sample bound to the exact Session take", async () => {
    const walls = [new Date(1_000), new Date(1_024)];
    const monotonics = [100, 122];
    const runtime = {
      wallNow: () => walls.shift()!,
      monotonicNowMilliseconds: () => monotonics.shift()!,
      fetch: jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({
          ok: true,
          protocolVersion: request.protocolVersion,
          sampleId: request.sampleId,
          callRoomId: request.callRoomId,
          captureGroupId: request.captureGroupId,
          clientKind: request.clientKind,
          deviceWallSentAt: request.deviceWallSentAt,
          deviceMonotonicSentNanoseconds: request.deviceMonotonicSentNanoseconds,
          serverReceivedAt: new Date(1_010).toISOString(),
          serverSentAt: new Date(1_012).toISOString(),
        });
      }) as typeof globalThis.fetch,
    };

    const sample = await measureBrowserCaptureClockSample({
      callRoomId: "room-1",
      captureGroupId: "55555555-5555-4555-8555-555555555555",
      runtime,
    });

    expect(sample).toMatchObject({
      protocolVersion: 1,
      callRoomId: "room-1",
      captureGroupId: "55555555-5555-4555-8555-555555555555",
      clientKind: "web",
      deviceMonotonicSentNanoseconds: "100000000",
      deviceMonotonicReceivedNanoseconds: "122000000",
      networkRoundTripMilliseconds: 20,
      serverOffsetMilliseconds: -1,
      uncertaintyMilliseconds: 10,
      wallClockDiscontinuityMilliseconds: 2,
    });
  });

  test("rejects a response rebound to another capture group", async () => {
    const walls = [new Date(1_000), new Date(1_010)];
    const monotonics = [100, 110];
    await expect(measureBrowserCaptureClockSample({
      callRoomId: "room-1",
      captureGroupId: "55555555-5555-4555-8555-555555555555",
      runtime: {
        wallNow: () => walls.shift()!,
        monotonicNowMilliseconds: () => monotonics.shift()!,
        fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
          const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return jsonResponse({
            ok: true,
            protocolVersion: 1,
            sampleId: request.sampleId,
            callRoomId: "room-1",
            captureGroupId: "66666666-6666-4666-8666-666666666666",
            clientKind: "web",
            deviceWallSentAt: request.deviceWallSentAt,
            deviceMonotonicSentNanoseconds: request.deviceMonotonicSentNanoseconds,
            serverReceivedAt: new Date(1_002).toISOString(),
            serverSentAt: new Date(1_003).toISOString(),
          });
        }) as typeof globalThis.fetch,
      },
    })).rejects.toThrow("different source boundary");
  });

  test("keeps partial clock evidence and orders usable samples by measured uncertainty", async () => {
    let uuidIndex = 0;
    const sampleIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    const randomUUID = jest.spyOn(crypto, "randomUUID").mockImplementation(
      () => sampleIds[uuidIndex++] as `${string}-${string}-${string}-${string}-${string}`,
    );
    const walls = [1_000, 2_000, 3_000, 1_030, 3_020];
    const monotonics = [100, 200, 300, 130, 320];
    const runtime = {
      wallNow: () => new Date(walls.shift()!),
      monotonicNowMilliseconds: () => monotonics.shift()!,
      fetch: jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        if (request.sampleId === sampleIds[1]) throw new Error("offline sample");
        const sentAt = Date.parse(String(request.deviceWallSentAt));
        const serverReceivedAt = sentAt === 1_000 ? 1_006 : 3_004;
        const serverSentAt = sentAt === 1_000 ? 1_008 : 3_006;
        return jsonResponse({
          ok: true,
          protocolVersion: 1,
          sampleId: request.sampleId,
          callRoomId: request.callRoomId,
          captureGroupId: request.captureGroupId,
          clientKind: request.clientKind,
          deviceWallSentAt: request.deviceWallSentAt,
          deviceMonotonicSentNanoseconds: request.deviceMonotonicSentNanoseconds,
          serverReceivedAt: new Date(serverReceivedAt).toISOString(),
          serverSentAt: new Date(serverSentAt).toISOString(),
        });
      }) as typeof globalThis.fetch,
    };

    const samples = await measureBrowserCaptureClockBurst({
      callRoomId: "room-1",
      captureGroupId: "55555555-5555-4555-8555-555555555555",
      runtime,
    });

    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.sampleId)).toEqual([
      sampleIds[2],
      sampleIds[0],
    ]);
    randomUUID.mockRestore();
  });
});
