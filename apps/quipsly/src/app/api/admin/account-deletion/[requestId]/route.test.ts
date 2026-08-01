/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/account-deletion-worker-client", () => ({
  accountDeletionWorkerConfiguration: jest.fn(() => ({ enabled: true })),
  invokeAccountDeletionWorker: jest.fn(),
}));
jest.mock("@/lib/server/account-deletion-inventory", () => ({
  buildAccountDeletionInventory: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { buildAccountDeletionInventory } from "@/lib/server/account-deletion-inventory";
import { invokeAccountDeletionWorker } from "@/lib/server/account-deletion-worker-client";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedExecute = jest.mocked(invokeAccountDeletionWorker);
const mockedInventory = jest.mocked(buildAccountDeletionInventory);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);

const context = {
  params: Promise.resolve({ requestId: "request-1" }),
};

function request(method: "GET" | "POST", body?: unknown) {
  return new Request("http://localhost/api/admin/account-deletion/request-1", {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("account deletion operator route", () => {
  const findUnique = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.mockReturnValue({
      userAccountDeletionRequest: { findUnique },
    } as never);
    mockedSession.mockResolvedValue({
      user: {
        id: "staff-1",
        primaryEmail: "operator@example.test",
        isStaff: true,
      },
    } as never);
  });

  it("rejects a signed-in non-staff actor before database access", async () => {
    mockedSession.mockResolvedValue({
      user: { id: "user-1", isStaff: false },
    } as never);

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(403);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("previews the fail-closed inventory and exact confirmation phrase", async () => {
    findUnique.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
      status: "READY_FOR_DELETION",
      requestedAt: new Date("2026-07-24T12:00:00.000Z"),
      updatedAt: new Date("2026-07-24T12:00:00.000Z"),
      executions: [],
    });
    mockedInventory.mockResolvedValue({
      schemaVersion: 1,
      capturedAt: "2026-07-24T12:00:00.000Z",
      subject: {
        userId: "user-1",
        primaryEmail: "person@example.test",
        firebaseUid: "firebase-1",
        isActive: true,
        allEmails: ["person@example.test"],
      },
      homeNests: [],
      blockers: [],
      eligibleForAutomatedExecution: true,
    });

    const response = await GET(request("GET"), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      request: { id: "request-1", status: "READY_FOR_DELETION" },
      inventory: { eligibleForAutomatedExecution: true },
      controls: {
        confirmationPhrase: "DELETE request-1",
        canExecute: true,
        supportedScope: "automated-empty-or-private-account",
      },
    });
  });

  it("requires the exact destructive confirmation", async () => {
    const response = await POST(
      request("POST", {
        confirmation: "delete request-1",
        exportDisposition: "not-requested",
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it("binds execution approval to the authenticated staff actor", async () => {
    mockedExecute.mockResolvedValue({
      schemaVersion: 1,
      outcome: "completed",
      requestId: "request-1",
    } as never);

    const response = await POST(
      request("POST", {
        confirmation: "DELETE request-1",
        exportDisposition: "delivered",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith({
      requestId: "request-1",
      plan: expect.objectContaining({
        requestId: "request-1",
        approvedByUserId: "staff-1",
        confirmation: "DELETE request-1",
        exportDisposition: "delivered",
        scope: "automated-empty-or-private-account",
      }),
    });
  });
});
