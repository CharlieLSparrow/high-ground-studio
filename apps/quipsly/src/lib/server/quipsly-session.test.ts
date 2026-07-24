/** @jest-environment node */

import { cookies } from "next/headers";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { hasQuipslyBetaAccess } from "@/lib/server/patreon-authz";
import { ensureStudioUserFromFirebaseIdentity } from "@/lib/server/studio-user-identity";
import {
  getQuipslySessionFromBearer,
  getQuipslySessionFromRequest,
} from "./quipsly-session";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/firebase/firebase-admin", () => ({
  adminAuth: {
    verifyIdToken: jest.fn(),
    verifySessionCookie: jest.fn(),
  },
}));
jest.mock("@/lib/server/patreon-authz", () => ({
  hasQuipslyBetaAccess: jest.fn(),
}));
jest.mock("@/lib/server/studio-user-identity", () => ({
  ensureStudioUserFromFirebaseIdentity: jest.fn(),
}));

const verifyIdToken = adminAuth.verifyIdToken as jest.Mock;
const ensureIdentity = ensureStudioUserFromFirebaseIdentity as jest.Mock;
const betaAccess = hasQuipslyBetaAccess as jest.Mock;
const cookieStore = cookies as jest.Mock;

describe("Quipsly Firebase session boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    betaAccess.mockResolvedValue(false);
  });

  it("binds a request to an explicitly supplied bearer token and never falls back to cookies", async () => {
    verifyIdToken.mockRejectedValue(new Error("bad token"));

    const session = await getQuipslySessionFromRequest(
      new Request("https://nest.quipsly.test/api/work", {
        headers: { authorization: "Bearer invalid" },
      }),
    );

    expect(session).toBeNull();
    expect(cookieStore).not.toHaveBeenCalled();
  });

  it("refuses an unverified Firebase email before identity reconciliation", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "firebase-user",
      email: "invited@example.test",
      email_verified: false,
    });

    const session = await getQuipslySessionFromBearer(
      new Request("https://nest.quipsly.test/api/work", {
        headers: { authorization: "Bearer unverified" },
      }),
    );

    expect(session).toBeNull();
    expect(verifyIdToken).toHaveBeenCalledWith("unverified", true);
    expect(ensureIdentity).not.toHaveBeenCalled();
  });

  it("maps a verified Firebase identity to durable Quipsly session truth", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "firebase-user",
      email: "person@example.test",
      email_verified: true,
      name: "Person",
    });
    ensureIdentity.mockResolvedValue({
      id: "quipsly-user",
      primaryEmail: "person@example.test",
      name: "Person",
      image: null,
      roles: ["CLIENT"],
      isStaff: false,
    });

    const session = await getQuipslySessionFromBearer(
      new Request("https://nest.quipsly.test/api/work", {
        headers: { authorization: "Bearer verified" },
      }),
    );

    expect(ensureIdentity).toHaveBeenCalledWith({
      firebaseUid: "firebase-user",
      email: "person@example.test",
      emailVerified: true,
      name: "Person",
      image: null,
    });
    expect(verifyIdToken).toHaveBeenCalledWith("verified", true);
    expect(session?.user).toMatchObject({
      id: "quipsly-user",
      primaryEmail: "person@example.test",
      roles: ["CLIENT"],
      isStaff: false,
      hasBetaAccess: false,
    });
  });
});
