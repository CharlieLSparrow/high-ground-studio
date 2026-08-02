/** @jest-environment node */

jest.mock("@/lib/server/account-deletion-executor", () => ({
  executeAccountDeletion: jest.fn(),
}));

import { executeAccountDeletion } from "@/lib/server/account-deletion-executor";

import { GET, POST } from "./route";

const mockedExecute = jest.mocked(executeAccountDeletion);
const sharedSecret = "s".repeat(32);
const plan = {
  schemaVersion: 1 as const,
  requestId: "request-1",
  approvedByUserId: "staff-1",
  approvedAt: "2026-08-01T00:00:00.000Z",
  confirmation: "DELETE request-1",
  exportDisposition: "not-requested" as const,
  scope: "automated-empty-or-private-account" as const,
};

function request(
  secret = sharedSecret,
  body: unknown = { requestId: "request-1", plan },
) {
  return new Request(
    "https://worker.example.test/api/internal/account-deletion/execute",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quipsly-account-deletion-worker-secret": secret,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("internal account deletion worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_MODE = "true";
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET = sharedSecret;
  });

  afterEach(() => {
    delete process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_MODE;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET;
  });

  it("fails before execution when worker mode or defense-in-depth authorization is absent", async () => {
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_MODE = "false";
    expect((await POST(request())).status).toBe(503);
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_MODE = "true";
    expect((await POST(request("wrong"))).status).toBe(403);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it("reports configuration booleans without provider secret values", async () => {
    process.env.QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED = "true";
    process.env.QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS = "quipsly-media";
    process.env.DATABASE_URL = "postgresql://secret";
    process.env.FIREBASE_PROJECT_ID = "quipsly-reef";
    process.env.QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY = "resend-secret";
    process.env.QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM =
      "Quipsly <account@notify.quipsly.com>";
    const response = await GET(request());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.checks).toEqual({
      workerMode: true,
      executorEnabled: true,
      databaseConfigured: true,
      firebaseProjectConfigured: true,
      storageBucketAllowlistConfigured: true,
      resendConfigured: true,
      senderConfigured: true,
      senderValid: true,
    });
    expect(payload.senderDomain).toBe("notify.quipsly.com");
    expect(JSON.stringify(payload)).not.toContain("resend-secret");
    delete process.env.QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS;
    delete process.env.DATABASE_URL;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM;
  });

  it("binds the exact approved plan to the exact request", async () => {
    expect(
      (await POST(request(sharedSecret, { requestId: "other", plan }))).status,
    ).toBe(400);
    mockedExecute.mockResolvedValue({
      schemaVersion: 1,
      outcome: "completed",
      requestId: "request-1",
    } as never);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith({
      requestId: "request-1",
      plan,
    });
  });
});
