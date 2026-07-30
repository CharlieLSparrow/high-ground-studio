/** @jest-environment node */

import { auth } from "@/auth";
import {
  createMacFirebaseHandoff,
  MacFirebaseHandoffError,
  validateMacCallbackScheme,
  validateMacCodeChallenge,
  validateMacHandoffState,
} from "@/lib/server/mac-firebase-handoff";
import { GET } from "./route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
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
    createMacFirebaseHandoff: jest.fn(),
    MacFirebaseHandoffError: TestHandoffError,
    validateMacCallbackScheme: jest.fn((value: unknown) => {
      if (value !== "quipslymac") {
        throw new TestHandoffError("invalid-callback-scheme", "bad scheme");
      }
      return value;
    }),
    validateMacCodeChallenge: jest.fn((value: unknown) => {
      if (String(value ?? "").length !== 43) {
        throw new TestHandoffError("invalid-code-challenge", "bad challenge");
      }
      return String(value);
    }),
    validateMacHandoffState: jest.fn((value: unknown) => {
      if (String(value ?? "").length !== 43) {
        throw new TestHandoffError("invalid-state", "bad state");
      }
      return String(value);
    }),
  };
});

const browserSession = auth as jest.Mock;
const createHandoff = createMacFirebaseHandoff as jest.Mock;
const state = "s".repeat(43);
const challenge = "c".repeat(43);
const originalCloudRunServiceHost =
  process.env.QUIPSLY_LEGACY_STUDIO_HOST;

function handoffRequest(extra = "") {
  return new Request(
    "https://nest.quipsly.test/api/mac/session-handoff"
      + `?native=1&callbackScheme=quipslymac&state=${state}`
      + `&codeChallenge=${challenge}&deviceLabel=Studio${extra}`,
  );
}

describe("Mac browser handoff route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUIPSLY_LEGACY_STUDIO_HOST =
      "studio-hm2odnvjga-uc.a.run.app";
  });

  afterAll(() => {
    if (originalCloudRunServiceHost === undefined) {
      delete process.env.QUIPSLY_LEGACY_STUDIO_HOST;
    } else {
      process.env.QUIPSLY_LEGACY_STUDIO_HOST =
        originalCloudRunServiceHost;
    }
  });

  it("redirects an unsigned browser through the normal Quipsly login and preserves the native request", async () => {
    browserSession.mockResolvedValue(null);

    const response = await GET(handoffRequest());

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toContain(
      "/api/mac/session-handoff?native=1",
    );
    expect(location.searchParams.get("callbackUrl")).toContain(
      `codeChallenge=${challenge}`,
    );
  });

  it("uses the verified forwarded Cloud Run host instead of the internal listener origin", async () => {
    browserSession.mockResolvedValue(null);
    const internalRequest = new Request(
      "http://0.0.0.0:8080/api/mac/session-handoff"
        + `?native=1&callbackScheme=quipslymac&state=${state}`
        + `&codeChallenge=${challenge}&deviceLabel=Studio`,
      {
        headers: {
          "x-forwarded-host":
            "quipsly-preview---studio-hm2odnvjga-uc.a.run.app",
          "x-forwarded-proto": "https",
        },
      },
    );

    const response = await GET(internalRequest);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(
      "https://quipsly-preview---studio-hm2odnvjga-uc.a.run.app",
    );
    expect(location.pathname).toBe("/login");
  });

  it("rejects an untrusted forwarded host instead of creating an open redirect", async () => {
    browserSession.mockResolvedValue(null);
    const response = await GET(new Request(
      "http://0.0.0.0:8080/api/mac/session-handoff"
        + `?native=1&callbackScheme=quipslymac&state=${state}`
        + `&codeChallenge=${challenge}&deviceLabel=Studio`,
      {
        headers: {
          "x-forwarded-host":
            "attacker-preview---other-service-uc.a.run.app",
          "x-forwarded-proto": "https",
        },
      },
    ));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain(
      "could not verify the public sign-in address",
    );
  });

  it("returns a no-store fragment callback for the exact signed-in Firebase UID", async () => {
    browserSession.mockResolvedValue({
      user: {
        id: "quipsly-user",
        firebaseUid: "firebase-uid",
        primaryEmail: "person@example.test",
        name: "Person",
      },
    });
    createHandoff.mockResolvedValue({
      code: `qmac_${"q".repeat(43)}`,
      state,
      callbackScheme: "quipslymac",
      expiresAt: "2030-01-01T00:00:00.000Z",
      user: { email: "person@example.test", name: "Person" },
    });

    const response = await GET(handoffRequest());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'nonce-",
    );
    expect(response.headers.get("content-security-policy")).not.toContain(
      "script-src 'unsafe-inline'",
    );
    expect(html).toContain("quipslymac://auth/session#");
    expect(html).toContain("code=qmac_");
    expect(html).not.toContain("firebase-uid");
    expect(createHandoff).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ firebaseUid: "firebase-uid" }),
      callbackScheme: "quipslymac",
      state,
      codeChallenge: challenge,
    }));
  });

  it("rejects malformed native parameters before reading browser identity", async () => {
    const response = await GET(new Request(
      "https://nest.quipsly.test/api/mac/session-handoff"
        + "?native=1&callbackScheme=attacker&state=tiny&codeChallenge=tiny",
    ));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Start sign-in again");
    expect(browserSession).not.toHaveBeenCalled();
    expect(validateMacCallbackScheme).toHaveBeenCalled();
    expect(validateMacHandoffState).not.toHaveBeenCalled();
    expect(validateMacCodeChallenge).not.toHaveBeenCalled();
  });

  it("renders a safe retry page when identity binding fails", async () => {
    browserSession.mockResolvedValue({
      user: {
        id: "quipsly-user",
        firebaseUid: "firebase-uid",
        primaryEmail: "person@example.test",
        name: "Person",
      },
    });
    createHandoff.mockRejectedValue(new MacFirebaseHandoffError(
      "firebase-identity-mismatch",
      "Choose the account again.",
      409,
    ));

    const response = await GET(handoffRequest());

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("Choose the account again.");
  });
});
