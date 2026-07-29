/** @jest-environment node */

import { createHash } from "node:crypto";
import { adminAuth } from "@/lib/firebase/firebase-admin";
import { getPrismaClient } from "@/lib/prisma";
import {
  createMacFirebaseHandoff,
  exchangeMacFirebaseHandoff,
  MacFirebaseHandoffError,
  validateMacCallbackScheme,
  validateMacHandoffState,
} from "./mac-firebase-handoff";

jest.mock("@/lib/firebase/firebase-admin", () => ({
  adminAuth: {
    createCustomToken: jest.fn(),
    getUser: jest.fn(),
  },
}));
jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(),
}));

const createCustomToken = adminAuth.createCustomToken as jest.Mock;
const getFirebaseUser = adminAuth.getUser as jest.Mock;
const prismaFactory = getPrismaClient as jest.Mock;
const validState = "s".repeat(43);
const validCode = `qmac_${"c".repeat(43)}`;
const validVerifier = "v".repeat(43);
const validChallenge = createHash("sha256")
  .update(validVerifier)
  .digest("base64url");

function authCodeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "code-row",
    userId: "quipsly-user",
    callbackScheme: "quipslymac",
    state: validState,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    metadataJson: {
      schema: "quipsly-mac-firebase-handoff/v1",
      firebaseUid: "firebase-uid",
      codeChallenge: validChallenge,
      source: "test",
    },
    user: {
      primaryEmail: "person@example.test",
      authIdentities: [
        {
          authority: "firebase:quipsly-reef",
          subject: "firebase-uid",
          emailVerifiedAt: new Date(),
        },
      ],
    },
    ...overrides,
  };
}

function exchangePrisma(record = authCodeRecord(), consumeCount = 1) {
  const transactionClient = {
    studioNativeAuthCode: {
      findUnique: jest.fn().mockResolvedValue(record),
      updateMany: jest.fn().mockResolvedValue({ count: consumeCount }),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      (operation: (tx: typeof transactionClient) => unknown) =>
        operation(transactionClient),
    ),
  };
  prismaFactory.mockReturnValue(prisma);
  return { prisma, transactionClient };
}

describe("Quipsly Mac Firebase browser handoff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.QUIPSLY_MAC_CALLBACK_SCHEMES;
    getFirebaseUser.mockResolvedValue({
      uid: "firebase-uid",
      email: "person@example.test",
      emailVerified: true,
      disabled: false,
    });
  });

  it("requires a high-entropy state and an allowlisted callback scheme", () => {
    expect(() => validateMacHandoffState("tiny")).toThrow(
      MacFirebaseHandoffError,
    );
    expect(() => validateMacCallbackScheme("attacker")).toThrow(
      MacFirebaseHandoffError,
    );
    expect(validateMacHandoffState(validState)).toBe(validState);
    expect(validateMacCallbackScheme("QUIPSLYMAC")).toBe("quipslymac");
  });

  it("issues only a hashed five-minute code for the exact browser Firebase UID", async () => {
    const create = jest.fn().mockResolvedValue({ id: "code-row" });
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const findIdentity = jest.fn().mockResolvedValue({ id: "identity-row" });
    prismaFactory.mockReturnValue({
      userAuthIdentity: { findFirst: findIdentity },
      studioNativeAuthCode: { create, deleteMany },
    });

    const result = await createMacFirebaseHandoff({
      user: {
        id: "quipsly-user",
        firebaseUid: "firebase-uid",
        primaryEmail: "person@example.test",
        name: "Person",
      },
      callbackScheme: "quipslymac",
      state: validState,
      codeChallenge: validChallenge,
      deviceLabel: "Studio Mac",
    });

    expect(result.code).toMatch(/^qmac_[A-Za-z0-9_-]{43}$/);
    expect(findIdentity).toHaveBeenCalledWith({
      where: {
        userId: "quipsly-user",
        authority: "firebase:quipsly-reef",
        subject: "firebase-uid",
        emailVerifiedAt: { not: null },
      },
      select: { id: true },
    });
    const createData = create.mock.calls[0][0].data;
    expect(createData.codeHash).not.toContain(result.code);
    expect(createData).not.toHaveProperty("code");
    expect(createData.state).toBe(validState);
    expect(createData.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(createData.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 5 * 60 * 1_000,
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: expect.any(Date) } },
    });
  });

  it("atomically consumes the code and mints a token for the recorded Firebase UID", async () => {
    const { transactionClient } = exchangePrisma();
    createCustomToken.mockResolvedValue("firebase-custom-token");

    const result = await exchangeMacFirebaseHandoff({
      code: validCode,
      state: validState,
      codeVerifier: validVerifier,
      deviceLabel: "Studio Mac",
    });

    expect(transactionClient.studioNativeAuthCode.updateMany)
      .toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          id: "code-row",
          consumedAt: null,
        }),
      }));
    expect(createCustomToken).toHaveBeenCalledWith("firebase-uid");
    expect(result).toEqual({
      customToken: "firebase-custom-token",
      user: {
        id: "quipsly-user",
        email: "person@example.test",
      },
    });
  });

  it.each([
    ["disabled", { emailVerified: true, disabled: true }],
    ["unverified", { emailVerified: false, disabled: false }],
  ])("never mints for a %s Firebase UID", async (_label, state) => {
    exchangePrisma();
    getFirebaseUser.mockResolvedValue({
      uid: "firebase-uid",
      email: "person@example.test",
      ...state,
    });

    await expect(exchangeMacFirebaseHandoff({
      code: validCode,
      state: validState,
      codeVerifier: validVerifier,
    })).rejects.toMatchObject({
      code: "firebase-identity-unavailable",
      status: 409,
    });
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("never recreates a Firebase UID that was deleted after browser sign-in", async () => {
    exchangePrisma();
    getFirebaseUser.mockRejectedValue(
      Object.assign(new Error("user not found"), {
        code: "auth/user-not-found",
      }),
    );

    await expect(exchangeMacFirebaseHandoff({
      code: validCode,
      state: validState,
      codeVerifier: validVerifier,
    })).rejects.toMatchObject({
      code: "firebase-identity-unavailable",
      status: 409,
    });
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("refuses a callback state mismatch before consuming or minting", async () => {
    const otherState = "x".repeat(43);
    const { transactionClient } = exchangePrisma();

    await expect(exchangeMacFirebaseHandoff({
      code: validCode,
      state: otherState,
      codeVerifier: validVerifier,
    })).rejects.toMatchObject({ code: "state-mismatch", status: 401 });

    expect(transactionClient.studioNativeAuthCode.updateMany)
      .not.toHaveBeenCalled();
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("requires the PKCE verifier held only by the Mac that started sign-in", async () => {
    const { transactionClient } = exchangePrisma();

    await expect(exchangeMacFirebaseHandoff({
      code: validCode,
      state: validState,
      codeVerifier: "z".repeat(43),
    })).rejects.toMatchObject({
      code: "device-proof-mismatch",
      status: 401,
    });

    expect(transactionClient.studioNativeAuthCode.updateMany)
      .not.toHaveBeenCalled();
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("refuses an expired or previously consumed code", async () => {
    exchangePrisma(authCodeRecord({ consumedAt: new Date() }));
    await expect(exchangeMacFirebaseHandoff({
      code: validCode,
      state: validState,
      codeVerifier: validVerifier,
    })).rejects.toMatchObject({ code: "code-consumed" });

    exchangePrisma(
      authCodeRecord({ expiresAt: new Date(Date.now() - 1_000) }),
    );
    await expect(exchangeMacFirebaseHandoff({
      code: validCode,
      state: validState,
      codeVerifier: validVerifier,
    })).rejects.toMatchObject({ code: "code-expired" });
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("treats a lost conditional-update race as replay", async () => {
    exchangePrisma(authCodeRecord(), 0);

    await expect(exchangeMacFirebaseHandoff({
      code: validCode,
      state: validState,
      codeVerifier: validVerifier,
    })).rejects.toMatchObject({ code: "code-consumed", status: 409 });
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("never mints for an identity not bound to the code's Quipsly user", async () => {
    exchangePrisma(authCodeRecord({
      user: {
        primaryEmail: "person@example.test",
        authIdentities: [{
          authority: "firebase:quipsly-reef",
          subject: "other-firebase-uid",
          emailVerifiedAt: new Date(),
        }],
      },
    }));

    await expect(exchangeMacFirebaseHandoff({
      code: validCode,
      state: validState,
      codeVerifier: validVerifier,
    })).rejects.toMatchObject({ code: "firebase-identity-mismatch" });
    expect(createCustomToken).not.toHaveBeenCalled();
  });
});
