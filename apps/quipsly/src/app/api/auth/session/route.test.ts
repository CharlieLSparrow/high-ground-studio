/** @jest-environment node */

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { ensureStudioUserFromFirebaseIdentity } from "@/lib/server/studio-user-identity";

import { POST } from "./route";

jest.mock("@/lib/firebase/firebase-admin", () => ({
  adminAuth: {
    verifyIdToken: jest.fn(),
    createSessionCookie: jest.fn(),
  },
}));
jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));
jest.mock("@/lib/server/invite-login-token", () => ({
  consumeInviteLoginTokenForEmail: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-onboarding", () => ({
  ensureQuipslyStarterStateForUser: jest.fn(),
}));
jest.mock("@/lib/server/studio-user-identity", () => ({
  ensureStudioUserFromFirebaseIdentity: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySession: jest.fn(),
  QUIPSLY_SESSION_COOKIE_NAME: "quipsly_session",
}));
jest.mock("@/lib/server/quipsly-session-cookie", () => ({
  quipslySessionCookieOptions: jest.fn(),
}));

describe("Quipsly session creation error boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: "firebase-user-1",
      email: "writer@example.com",
      email_verified: true,
      firebase: { sign_in_provider: "password" },
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reports transaction-pool unavailability as service unavailable, not bad credentials", async () => {
    jest.mocked(ensureStudioUserFromFirebaseIdentity).mockRejectedValue({
      code: "P2028",
      message: "Transaction API error: Unable to start a transaction in time.",
    });

    const response = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "redacted-id-token" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Quipsly is reconnecting. Try signing in again in a moment.",
      code: "SESSION_STORAGE_UNAVAILABLE",
    });
    expect(response.headers.get("retry-after")).toBe("2");
    expect(adminAuth.createSessionCookie).not.toHaveBeenCalled();
  });

  it("classifies an unreadable request body before authentication or onboarding", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Quipsly could not read the secure sign-in request. Try again.",
      code: "INVALID_SESSION_REQUEST",
    });
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(ensureStudioUserFromFirebaseIdentity).not.toHaveBeenCalled();
    expect(adminAuth.createSessionCookie).not.toHaveBeenCalled();
  });
});
