/** @jest-environment node */

import {
  exchangeMacFirebaseHandoff,
  MacFirebaseHandoffError,
} from "@/lib/server/mac-firebase-handoff";
import { POST } from "./route";

jest.mock("@/lib/server/mac-firebase-handoff", () => {
  class TestHandoffError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    exchangeMacFirebaseHandoff: jest.fn(),
    MacFirebaseHandoffError: TestHandoffError,
  };
});

const exchangeHandoff = exchangeMacFirebaseHandoff as jest.Mock;

describe("Mac browser handoff exchange route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires JSON without touching the one-time-code boundary", async () => {
    const response = await POST(new Request(
      "https://nest.quipsly.test/api/mac/session-exchange",
      { method: "POST", body: "not-json" },
    ));

    expect(response.status).toBe(415);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(exchangeHandoff).not.toHaveBeenCalled();
  });

  it("rejects oversized exchanges before parsing or consuming a code", async () => {
    const response = await POST(new Request(
      "https://nest.quipsly.test/api/mac/session-exchange",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ padding: "x".repeat(17 * 1024) }),
      },
    ));

    expect(response.status).toBe(413);
    expect(exchangeHandoff).not.toHaveBeenCalled();
  });

  it("passes code, state, and device-only PKCE proof to the atomic exchange", async () => {
    exchangeHandoff.mockResolvedValue({
      customToken: "firebase-custom-token",
      user: { id: "quipsly-user", email: "person@example.test" },
    });
    const body = {
      code: `qmac_${"q".repeat(43)}`,
      state: "s".repeat(43),
      codeVerifier: "v".repeat(43),
      deviceLabel: "Studio Mac",
    };

    const response = await POST(new Request(
      "https://nest.quipsly.test/api/mac/session-exchange",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      customToken: "firebase-custom-token",
    });
    expect(exchangeHandoff).toHaveBeenCalledWith(body);
  });

  it("preserves fail-closed replay errors", async () => {
    exchangeHandoff.mockRejectedValue(new MacFirebaseHandoffError(
      "code-consumed",
      "Already used.",
      409,
    ));

    const response = await POST(new Request(
      "https://nest.quipsly.test/api/mac/session-exchange",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: `qmac_${"q".repeat(43)}`,
          state: "s".repeat(43),
          codeVerifier: "v".repeat(43),
        }),
      },
    ));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "code-consumed",
      error: "Already used.",
    });
  });
});
