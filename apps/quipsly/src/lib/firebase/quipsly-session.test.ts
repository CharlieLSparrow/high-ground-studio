import {
  sendEmailVerification,
  signOut,
} from "firebase/auth";

import {
  cleanQuipslyCallbackUrl,
  cleanQuipslyInviteToken,
  finishQuipslyFirebaseSignIn,
  quipslyEmailActionSettings,
} from "./quipsly-session";

jest.mock("firebase/auth", () => ({
  sendEmailVerification: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("@/lib/firebase/firebase", () => ({
  auth: { name: "quipsly-auth-test" },
}));

function firebaseUser({
  emailVerified = true,
}: {
  emailVerified?: boolean;
} = {}) {
  return {
    emailVerified,
    reload: jest.fn().mockResolvedValue(undefined),
    getIdToken: jest.fn().mockResolvedValue("redacted-firebase-id-token"),
  };
}

describe("Quipsly Firebase session completion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates the server session and navigates only after Firebase verifies the user", async () => {
    const user = firebaseUser();
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    });
    const navigate = jest.fn();

    await expect(
      finishQuipslyFirebaseSignIn({
        user: user as any,
        callbackUrl: "/work",
        inviteToken: "qinv_safe-test-token",
        fetcher: fetcher as any,
        navigate,
      }),
    ).resolves.toEqual({ callbackUrl: "/work" });

    expect(user.reload).toHaveBeenCalled();
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idToken: "redacted-firebase-id-token",
        inviteToken: "qinv_safe-test-token",
      }),
    });
    expect(navigate).toHaveBeenCalledWith("/work");
  });

  it("does not let an unverified password identity claim a Quipsly account", async () => {
    const user = firebaseUser({ emailVerified: false });
    (sendEmailVerification as jest.Mock).mockResolvedValue(undefined);
    const fetcher = jest.fn();
    const navigate = jest.fn();

    await expect(
      finishQuipslyFirebaseSignIn({
        user: user as any,
        callbackUrl: "/projects",
        fetcher: fetcher as any,
        navigate,
      }),
    ).rejects.toThrow(/fresh verification link/);

    expect(sendEmailVerification).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        handleCodeInApp: false,
        url: expect.stringContaining(
          "/login?emailAction=verify&callbackUrl=%2Fprojects",
        ),
      }),
    );
    expect(signOut).toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("rejects external callbacks and malformed invite tokens", () => {
    expect(cleanQuipslyCallbackUrl("https://attacker.example")).toBe("/projects");
    expect(cleanQuipslyCallbackUrl("//attacker.example")).toBe("/projects");
    expect(cleanQuipslyCallbackUrl("/\\attacker.example")).toBe("/projects");
    expect(cleanQuipslyCallbackUrl("/today\nSet-Cookie: nope")).toBe("/projects");
    expect(cleanQuipslyCallbackUrl("/today")).toBe("/today");
    expect(cleanQuipslyInviteToken("not-an-invite")).toBe("");
    expect(cleanQuipslyInviteToken("qinv_bad token")).toBe("");
    expect(cleanQuipslyInviteToken("qinv_valid")).toBe("qinv_valid");
    expect(
      quipslyEmailActionSettings({
        origin: "https://nest.quipsly.com",
        callbackUrl: "/work",
        inviteToken: "qinv_valid",
        action: "reset",
      }),
    ).toEqual({
      url:
        "https://nest.quipsly.com/login"
        + "?emailAction=reset&callbackUrl=%2Fwork&inviteToken=qinv_valid",
      handleCodeInApp: false,
    });
  });
});
