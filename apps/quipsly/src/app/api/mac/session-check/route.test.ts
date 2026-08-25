/** @jest-environment node */

jest.mock("@/lib/server/native-session-context", () => ({
  buildNativeSessionContext: jest.fn(),
}));
jest.mock("@/lib/server/firebase-auth", () => {
  class FirebaseBearerAuthenticationError extends Error {
    readonly code = "QUIPSLY_FIREBASE_BEARER_INVALID";
  }

  return {
    FirebaseBearerAuthenticationError,
    isFirebaseBearerAuthenticationError: (error: unknown) => (
      Boolean(error)
      && typeof error === "object"
      && (error as { code?: unknown }).code === "QUIPSLY_FIREBASE_BEARER_INVALID"
    ),
  };
});

import { buildNativeSessionContext } from "@/lib/server/native-session-context";
import { FirebaseBearerAuthenticationError } from "@/lib/server/firebase-auth";

import { GET } from "./route";

const mockedNativeContext = jest.mocked(buildNativeSessionContext);

describe("native session-check failure boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps invalid Firebase credentials an authentication response", async () => {
    mockedNativeContext.mockRejectedValue(new FirebaseBearerAuthenticationError());

    const response = await GET(new Request("http://localhost/api/mac/session-check"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: false,
      code: "NATIVE_SESSION_AUTHENTICATION_REQUIRED",
    });
  });

  it("reports a connection timeout as retryable service unavailability", async () => {
    mockedNativeContext.mockRejectedValue(
      new Error("Connection terminated due to connection timeout"),
    );

    const response = await GET(new Request("http://localhost/api/mac/session-check"));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      authenticated: true,
      retryable: true,
      code: "QUIPSLY_SERVICE_UNAVAILABLE",
      error: "Quipsly is having trouble opening your account. Trying again should fix it.",
    });
  });

  it("does not relabel an unknown server failure as bad credentials", async () => {
    mockedNativeContext.mockRejectedValue(new Error("unexpected projection failure"));

    const response = await GET(new Request("http://localhost/api/mac/session-check"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      retryable: true,
      code: "NATIVE_SESSION_CHECK_FAILED",
    });
  });
});
