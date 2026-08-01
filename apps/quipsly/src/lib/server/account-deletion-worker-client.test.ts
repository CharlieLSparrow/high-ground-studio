/** @jest-environment node */

jest.mock("googleapis", () => ({ google: { auth: { GoogleAuth: jest.fn() } } }));

import { google } from "googleapis";

import {
  accountDeletionWorkerConfiguration,
  invokeAccountDeletionWorker,
} from "./account-deletion-worker-client";

const originalFetch = global.fetch;
const sharedSecret = "x".repeat(32);
const plan = {
  schemaVersion: 1 as const,
  requestId: "request-1",
  approvedByUserId: "staff-1",
  approvedAt: "2026-08-01T00:00:00.000Z",
  confirmation: "DELETE request-1",
  exportDisposition: "not-requested" as const,
  scope: "automated-empty-or-private-account" as const,
};

describe("account deletion worker client configuration", () => {
  it("fails closed until the dedicated worker, URL, and secret are explicit", () => {
    expect(accountDeletionWorkerConfiguration({})).toMatchObject({
      enabled: false,
      workerOrigin: null,
      sharedSecretConfigured: false,
    });
    expect(
      accountDeletionWorkerConfiguration({
        QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED: "true",
        QUIPSLY_ACCOUNT_DELETION_WORKER_URL: "http://worker.example.test",
        QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET: "x".repeat(32),
      }),
    ).toMatchObject({ enabled: false, reason: "Account deletion worker URL must use HTTPS." });
  });

  it("normalizes one HTTPS worker origin and never exposes the shared secret", () => {
    const configuration = accountDeletionWorkerConfiguration({
      QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED: "true",
      QUIPSLY_ACCOUNT_DELETION_WORKER_URL: "https://worker.example.test/ignored?value=secret",
      QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET: "x".repeat(32),
    });
    expect(configuration).toEqual({
      enabled: true,
      workerOrigin: "https://worker.example.test",
      endpoint: "https://worker.example.test/api/internal/account-deletion/execute",
      sharedSecretConfigured: true,
      reason: null,
    });
    expect(JSON.stringify(configuration)).not.toContain("x".repeat(32));
  });
});

describe("account deletion worker invocation", () => {
  const getRequestHeaders = jest.fn();
  const getIdTokenClient = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED = "true";
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_URL = "https://worker.example.test";
    process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET = sharedSecret;
    getRequestHeaders.mockResolvedValue(
      new Headers({ authorization: "Bearer identity-token" }),
    );
    getIdTokenClient.mockResolvedValue({ getRequestHeaders });
    jest.mocked(google.auth.GoogleAuth).mockImplementation(
      () => ({ getIdTokenClient }) as never,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_URL;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET;
  });

  it("binds one exact plan to Cloud Run identity and defense-in-depth authorization", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      receipt: {
        schemaVersion: 1,
        outcome: "completed",
        requestId: "request-1",
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const receipt = await invokeAccountDeletionWorker({ requestId: "request-1", plan });

    expect(receipt.requestId).toBe("request-1");
    expect(getIdTokenClient).toHaveBeenCalledWith("https://worker.example.test");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://worker.example.test/api/internal/account-deletion/execute",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer identity-token",
          "x-quipsly-account-deletion-worker-secret": sharedSecret,
        }),
        body: JSON.stringify({ requestId: "request-1", plan }),
      }),
    );
  });

  it("rejects a successful HTTP response with a mismatched receipt", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      receipt: {
        schemaVersion: 1,
        outcome: "completed",
        requestId: "other-request",
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(
      invokeAccountDeletionWorker({ requestId: "request-1", plan }),
    ).rejects.toThrow("mismatched receipt");
  });
});
