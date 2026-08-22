/** @jest-environment jsdom */

import {
  acknowledgeBrowserRecordingDirective,
  issueBrowserRecordingDirective,
  readBrowserRecordingDirective,
} from "./browser-recording-directive";

jest.mock("@/lib/browser-client-instance", () => ({
  browserClientInstanceId: () => "browser-installation-1",
}));

describe("browser recording directive client", () => {
  const originalFetch = global.fetch;
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reads the latest private coordination intent", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          directive: { id: "directive-1", action: "START" },
        }),
      }) as typeof fetch;
    expect(await readBrowserRecordingDirective("room 1")).toMatchObject({
      id: "directive-1",
      action: "START",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/sessions/room%201/recording-directive",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("issues one explicit controller action", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          directive: { id: "directive-1", action: "STOP" },
        }),
      }) as typeof fetch;
    await issueBrowserRecordingDirective("room-1", "STOP");
    expect(
      JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body)),
    ).toMatchObject({
      action: "STOP",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("retries the exact durable endpoint receipt identity", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      }) as typeof fetch;
    const input = {
      roomId: "room-1",
      directiveId: "directive-1",
      state: "STARTED" as const,
      captureId: "capture-1",
    };
    await acknowledgeBrowserRecordingDirective(input);
    await acknowledgeBrowserRecordingDirective(input);
    const first = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[0][1].body),
    );
    const second = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[1][1].body),
    );
    expect(first).toMatchObject({
      clientInstanceId: "browser-installation-1",
      clientKind: "web",
      state: "STARTED",
      captureId: "capture-1",
    });
    expect(second.receiptId).toBe(first.receiptId);
  });
});
