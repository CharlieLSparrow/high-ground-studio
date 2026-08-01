/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/session-client-follow-up", () => {
  const actual = jest.requireActual("@/lib/server/session-client-follow-up");
  return {
    ...actual,
    acknowledgeClientFollowUp: jest.fn(),
    createClientFollowUpDraft: jest.fn(),
    readClientFollowUp: jest.fn(),
    releaseClientFollowUp: jest.fn(),
    revokeClientFollowUp: jest.fn(),
    updateClientFollowUpDraft: jest.fn(),
  };
});

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  acknowledgeClientFollowUp,
  ClientFollowUpError,
  createClientFollowUpDraft,
  readClientFollowUp,
  releaseClientFollowUp,
  revokeClientFollowUp,
  updateClientFollowUpDraft,
} from "@/lib/server/session-client-follow-up";

import { GET, POST } from "./route";

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);
const mockedRead = jest.mocked(readClientFollowUp);
const mockedCreate = jest.mocked(createClientFollowUpDraft);
const mockedRelease = jest.mocked(releaseClientFollowUp);
const mockedRevoke = jest.mocked(revokeClientFollowUp);
const mockedAcknowledge = jest.mocked(acknowledgeClientFollowUp);
const mockedUpdate = jest.mocked(updateClientFollowUpDraft);

const ACTOR = {
  id: "coach-1",
  email: "coach@example.test",
  primaryEmail: "coach@example.test",
  isStaff: false,
};
const REQUEST_ID = "41b1e8d2-9c4c-430d-af2e-8c912c127193";

function context() {
  return { params: Promise.resolve({ roomId: "room-1" }) };
}

function request(method: "GET" | "POST", body?: unknown) {
  return new Request("http://localhost/api/sessions/room-1/client-follow-up", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Session client follow-up route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.mockReturnValue({ marker: "prisma" } as never);
    mockedSession.mockResolvedValue({ user: ACTOR } as never);
  });

  it("requires authentication before reading private follow-up state", async () => {
    mockedSession.mockResolvedValue(null);

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    expect(mockedPrisma).not.toHaveBeenCalled();
    expect(mockedRead).not.toHaveBeenCalled();
  });

  it("reads the assigned actor's private projection with no shared caching", async () => {
    mockedRead.mockResolvedValue({
      role: "COACH",
      output: null,
      eligible: { notes: [], goals: [], tasks: [] },
    } as never);

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      role: "COACH",
      output: null,
    });
    expect(mockedRead).toHaveBeenCalledWith(
      { marker: "prisma" },
      { roomId: "room-1", actor: ACTOR },
    );
  });

  it("creates a private draft without claiming release or an external action", async () => {
    mockedCreate.mockResolvedValue({
      output: { id: "follow-up-1", status: "DRAFT", revision: 1 },
      idempotentReplay: false,
    } as never);

    const response = await POST(
      request("POST", {
        action: "CREATE_DRAFT",
        clientRequestId: REQUEST_ID,
        title: "After our session",
        intro: "A short review.",
        nextSessionFocus: "Check the first experiment.",
        noteIds: ["note-1"],
        goalIds: ["goal-1"],
        taskIds: ["task-1"],
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      output: { id: "follow-up-1", status: "DRAFT" },
      boundaries: {
        releasedToClient: false,
        externalMessageSent: false,
        providerCalendarMutated: false,
        publicationPerformed: false,
      },
    });
    expect(mockedCreate).toHaveBeenCalledWith(
      { marker: "prisma" },
      {
        roomId: "room-1",
        actor: ACTOR,
        draft: {
          clientRequestId: REQUEST_ID,
          title: "After our session",
          intro: "A short review.",
          nextSessionFocus: "Check the first experiment.",
          noteIds: ["note-1"],
          goalIds: ["goal-1"],
          taskIds: ["task-1"],
        },
      },
    );
  });

  it("routes release and intended-client readback through separate explicit actions", async () => {
    mockedRelease.mockResolvedValue({
      output: { id: "follow-up-1", status: "RELEASED", revision: 2 },
      idempotentReplay: false,
    } as never);
    mockedAcknowledge.mockResolvedValue({
      output: { id: "follow-up-1", status: "RELEASED", revision: 2 },
      idempotentReplay: false,
    } as never);

    const releaseResponse = await POST(
      request("POST", {
        action: "RELEASE",
        clientRequestId: REQUEST_ID,
        outputId: "follow-up-1",
        expectedRevision: 1,
      }),
      context(),
    );
    const acknowledgeResponse = await POST(
      request("POST", {
        action: "ACKNOWLEDGE_OPEN",
        clientRequestId: "b607c9a4-94dd-40df-a8d6-7a1ae22d97e1",
        outputId: "follow-up-1",
      }),
      context(),
    );

    expect(await releaseResponse.json()).toMatchObject({
      boundaries: {
        releasedInApp: true,
        recipientUserIdImmutable: true,
        externalMessageSent: false,
      },
    });
    expect(await acknowledgeResponse.json()).toMatchObject({
      boundaries: {
        recipientConfirmedOpen: true,
        externalMessageSent: false,
      },
    });
    expect(mockedRelease).toHaveBeenCalledWith(
      { marker: "prisma" },
      expect.objectContaining({
        roomId: "room-1",
        outputId: "follow-up-1",
        expectedRevision: 1,
      }),
    );
    expect(mockedAcknowledge).toHaveBeenCalledWith(
      { marker: "prisma" },
      expect.objectContaining({
        roomId: "room-1",
        outputId: "follow-up-1",
      }),
    );
    expect(mockedRevoke).not.toHaveBeenCalled();
  });

  it("revises only the current private draft without claiming release", async () => {
    mockedUpdate.mockResolvedValue({
      output: { id: "follow-up-1", status: "DRAFT", revision: 2 },
      idempotentReplay: false,
    } as never);

    const response = await POST(
      request("POST", {
        action: "UPDATE_DRAFT",
        clientRequestId: REQUEST_ID,
        outputId: "follow-up-1",
        expectedRevision: 1,
        title: "Revised after our session",
        intro: "A clearer review.",
        nextSessionFocus: "Check the revised experiment.",
        noteIds: ["note-1"],
        goalIds: ["goal-1"],
        taskIds: ["task-1"],
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      output: { id: "follow-up-1", status: "DRAFT", revision: 2 },
      boundaries: {
        privateDraftRevised: true,
        releasedToClient: false,
        externalMessageSent: false,
        providerCalendarMutated: false,
        publicationPerformed: false,
      },
    });
    expect(mockedUpdate).toHaveBeenCalledWith(
      { marker: "prisma" },
      {
        roomId: "room-1",
        outputId: "follow-up-1",
        actor: ACTOR,
        expectedRevision: 1,
        draft: expect.objectContaining({
          clientRequestId: REQUEST_ID,
          title: "Revised after our session",
        }),
      },
    );
  });

  it("fails closed with a concealed domain error and no cacheable body", async () => {
    mockedRead.mockRejectedValue(
      new ClientFollowUpError(
        404,
        "FOLLOW_UP_UNAVAILABLE",
        "This account does not have an available coaching follow-up for that Session.",
      ),
    );

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      ok: false,
      code: "FOLLOW_UP_UNAVAILABLE",
      error:
        "This account does not have an available coaching follow-up for that Session.",
    });
  });
});
