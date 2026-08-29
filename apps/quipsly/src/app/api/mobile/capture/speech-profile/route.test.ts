/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const requestId = "11111111-1111-4111-8111-111111111111";

function profile() {
  return {
    userId: "actor-1",
    adaptationEnabled: true,
    revision: 5,
    terms: [{
      id: "term-1",
      text: "Homer Sparrow",
      count: 3,
      isActive: true,
      updatedAt: new Date("2026-08-29T10:00:00.000Z"),
    }],
  };
}

describe("mobile speech recognition profile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("authenticates before reading a private speech profile", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(new Request("http://localhost/api/mobile/capture/speech-profile"));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("reads only the signed-in person's profile", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "actor-1" } } as never);
    const findUnique = jest.fn().mockResolvedValue(profile());
    jest.mocked(getPrismaClient).mockReturnValue({
      voiceRecognitionPreference: { findUnique },
    } as never);

    const response = await GET(new Request("http://localhost/api/mobile/capture/speech-profile"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "actor-1" } }));
    expect(payload).toMatchObject({
      ok: true,
      schema: "quipsly-voice-recognition-profile-v1",
      profile: {
        exists: true,
        revision: 5,
        adaptationEnabled: true,
        learnedPhrases: [{ text: "Homer Sparrow", count: 3 }],
      },
    });
  });

  it("applies an idempotent learned phrase inside the actor boundary", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "actor-1" } } as never);
    const tx = {
      voiceRecognitionOperation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: requestId }),
      },
      voiceRecognitionPreference: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ revision: 4 })
          .mockResolvedValueOnce(profile()),
        upsert: jest.fn().mockResolvedValue({ userId: "actor-1" }),
        update: jest.fn().mockResolvedValue({ revision: 5 }),
      },
      voiceRecognitionTerm: {
        upsert: jest.fn().mockResolvedValue({ id: "term-1" }),
      },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await POST(new Request("http://localhost/api/mobile/capture/speech-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRequestId: requestId,
        operationKind: "learn-phrase",
        phrase: "Homer Sparrow",
        weight: 3,
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.voiceRecognitionTerm.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        preferenceUserId_normalizedText: {
          preferenceUserId: "actor-1",
          normalizedText: "homer sparrow",
        },
      },
      update: expect.objectContaining({ count: { increment: 3 }, isActive: true }),
    }));
    expect(tx.voiceRecognitionOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ preferenceUserId: "actor-1", resultingRevision: 5 }),
    }));
    expect(payload).toMatchObject({ ok: true, idempotentReplay: false, profile: { revision: 5 } });
  });

  it("rejects reuse of a mutation identity across accounts or payloads", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "actor-1" } } as never);
    const tx = {
      voiceRecognitionOperation: {
        findUnique: jest.fn().mockResolvedValue({
          id: requestId,
          preferenceUserId: "other-user",
          payloadHash: "different",
        }),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as never);

    const response = await POST(new Request("http://localhost/api/mobile/capture/speech-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRequestId: requestId,
        operationKind: "set-adaptation",
        adaptationEnabled: true,
      }),
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "REQUEST_ID_CONFLICT" });
  });

  it("bootstraps legacy iPhone terms without reviving a term forgotten elsewhere", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "actor-1" } } as never);
    const preferenceUpdate = jest.fn().mockResolvedValue({ revision: 9 });
    const termCreate = jest.fn();
    const termUpdate = jest.fn();
    const tx = {
      voiceRecognitionOperation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: requestId }),
      },
      voiceRecognitionPreference: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ revision: 8 })
          .mockResolvedValueOnce({ ...profile(), revision: 9, adaptationEnabled: false, terms: [] }),
        upsert: jest.fn().mockResolvedValue({ userId: "actor-1" }),
        update: preferenceUpdate,
      },
      voiceRecognitionTerm: {
        findUnique: jest.fn().mockResolvedValue({ id: "forgotten-term", isActive: false }),
        create: termCreate,
        update: termUpdate,
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as never);

    const response = await POST(new Request("http://localhost/api/mobile/capture/speech-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRequestId: requestId,
        operationKind: "bootstrap",
        adaptationEnabled: true,
        phrases: ["Homer Sparrow"],
      }),
    }));

    expect(response.status).toBe(200);
    expect(preferenceUpdate).toHaveBeenCalledTimes(1);
    expect(preferenceUpdate).toHaveBeenCalledWith({
      where: { userId: "actor-1" },
      data: { revision: { increment: 1 } },
    });
    expect(termCreate).not.toHaveBeenCalled();
    expect(termUpdate).not.toHaveBeenCalled();
  });
});
