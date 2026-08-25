/** @jest-environment node */

jest.mock("@/lib/firebase/firebase-admin", () => ({
  adminAuth: { verifyIdToken: jest.fn() },
}));
jest.mock("@/lib/server/studio-user-identity", () => ({
  ensureStudioUserFromFirebaseIdentity: jest.fn(),
}));

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { ensureStudioUserFromFirebaseIdentity } from "@/lib/server/studio-user-identity";

import {
  verifyBearerToken,
} from "./firebase-auth";

describe("Firebase bearer identity boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("classifies Firebase rejection as an authentication failure", async () => {
    jest.mocked(adminAuth.verifyIdToken).mockRejectedValue(
      new Error("token expired"),
    );

    await expect(
      verifyBearerToken(
        new Request("http://localhost", {
          headers: { authorization: "Bearer expired" },
        }),
      ),
    ).rejects.toMatchObject({
      code: "QUIPSLY_FIREBASE_BEARER_INVALID",
    });
    expect(ensureStudioUserFromFirebaseIdentity).not.toHaveBeenCalled();
  });

  it("preserves database availability failures after Firebase succeeds", async () => {
    const databaseTimeout = new Error(
      "Connection terminated due to connection timeout",
    );
    jest.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: "firebase-client-1",
      email: "client@example.test",
      email_verified: true,
      firebase: { sign_in_provider: "password" },
    } as never);
    jest.mocked(ensureStudioUserFromFirebaseIdentity).mockRejectedValue(
      databaseTimeout,
    );

    await expect(
      verifyBearerToken(
        new Request("http://localhost", {
          headers: { authorization: "Bearer valid" },
        }),
      ),
    ).rejects.toBe(databaseTimeout);
  });
});
