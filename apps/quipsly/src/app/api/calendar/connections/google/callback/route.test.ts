/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  encryptGoogleRefreshToken,
  exchangeGoogleCalendarCode,
  listOwnedGoogleCalendars,
  validateGoogleCalendarOAuthCallback,
} from "@/lib/server/google-calendar-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-oauth", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-oauth"),
  encryptGoogleRefreshToken: jest.fn(),
  exchangeGoogleCalendarCode: jest.fn(),
  listOwnedGoogleCalendars: jest.fn(),
  validateGoogleCalendarOAuthCallback: jest.fn(),
}));

const CALLBACK =
  "https://nest.quipsly.com/api/calendar/connections/google/callback";

function callbackRequest(query = "code=provider-code&state=signed-state") {
  return new Request(`${CALLBACK}?${query}`, {
    headers: { cookie: "quipsly_google_calendar_oauth=signed-cookie" },
  });
}

function redirectState(response: Response) {
  return new URL(response.headers.get("location")!).searchParams.get("calendar");
}

function transactionFixture(existing: { id: string; userId: string } | null = null) {
  const transaction = {
    calendarConnection: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({ id: "connection-1" }),
      update: jest.fn().mockResolvedValue({ id: existing?.id ?? "connection-1" }),
    },
    calendarOAuthCredential: {
      upsert: jest.fn().mockResolvedValue({ id: "credential-1" }),
    },
    calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-1" }) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
  return { prisma, transaction };
}

describe("GET /api/calendar/connections/google/callback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("clears callback state and redirects signed-out users without provider or database access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await GET(callbackRequest());

    expect(response.status).toBe(303);
    expect(redirectState(response)).toBe("signed-out");
    expect(response.headers.get("set-cookie")).toContain(
      "quipsly_google_calendar_oauth=",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(validateGoogleCalendarOAuthCallback).not.toHaveBeenCalled();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("handles provider denial and missing callback material without token exchange", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1" },
    } as never);

    const denied = await GET(callbackRequest("error=access_denied"));
    const expired = await GET(new Request(CALLBACK));

    expect(redirectState(denied)).toBe("permission-denied");
    expect(redirectState(expired)).toBe("expired");
    expect(exchangeGoogleCalendarCode).not.toHaveBeenCalled();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("stores only the encrypted refresh token and writes non-mutating verification evidence", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    jest.mocked(validateGoogleCalendarOAuthCallback).mockReturnValue({
      verifier: "pkce-verifier",
      config: { encryptionKey: Buffer.alloc(32, 7) },
    } as never);
    jest.mocked(exchangeGoogleCalendarCode).mockResolvedValue({
      accessToken: "short-lived-access-token",
      refreshToken: "provider-refresh-token",
      grantedScopes: [
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        "https://www.googleapis.com/auth/calendar.events.owned",
      ],
    });
    jest.mocked(listOwnedGoogleCalendars).mockResolvedValue([
      {
        id: "primary@example.com",
        summary: "Primary calendar",
        primary: true,
        accessRole: "owner",
        timeZone: "America/Denver",
      },
    ]);
    jest.mocked(encryptGoogleRefreshToken).mockReturnValue("encrypted-payload");
    const { transaction } = transactionFixture();

    const response = await GET(callbackRequest());

    expect(response.status).toBe(303);
    expect(redirectState(response)).toBe("connected");
    expect(exchangeGoogleCalendarCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: "provider-code", verifier: "pkce-verifier" }),
    );
    expect(encryptGoogleRefreshToken).toHaveBeenCalledWith(
      "provider-refresh-token",
      Buffer.alloc(32, 7),
    );
    expect(transaction.calendarOAuthCredential.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ encryptedPayload: "encrypted-payload" }),
        update: expect.objectContaining({
          encryptedPayload: "encrypted-payload",
          encryptionVersion: "aes-256-gcm-v1",
        }),
      }),
    );
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "user-1",
        operation: "VERIFY",
        outcome: "SUCCEEDED",
        externalMutated: false,
        metadataJson: expect.objectContaining({
          credentialStoredEncrypted: true,
          ownedCalendarCount: 1,
        }),
      }),
    });
    const persisted = JSON.stringify(transaction.calendarOAuthCredential.upsert.mock.calls);
    expect(persisted).not.toContain("provider-refresh-token");
    expect(persisted).not.toContain("short-lived-access-token");
  });

  it("refuses to attach a Google account already owned by another Quipsly user", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    jest.mocked(validateGoogleCalendarOAuthCallback).mockReturnValue({
      verifier: "pkce-verifier",
      config: { encryptionKey: Buffer.alloc(32, 7) },
    } as never);
    jest.mocked(exchangeGoogleCalendarCode).mockResolvedValue({
      accessToken: "short-lived-access-token",
      refreshToken: "provider-refresh-token",
      grantedScopes: [],
    });
    jest.mocked(listOwnedGoogleCalendars).mockResolvedValue([
      {
        id: "primary@example.com",
        summary: "Primary calendar",
        primary: true,
        accessRole: "owner",
        timeZone: "America/Denver",
      },
    ]);
    jest.mocked(encryptGoogleRefreshToken).mockReturnValue("encrypted-payload");
    const { transaction } = transactionFixture({
      id: "connection-other",
      userId: "user-other",
    });

    const response = await GET(callbackRequest());

    expect(redirectState(response)).toBe("provider-account-already-connected");
    expect(transaction.calendarConnection.create).not.toHaveBeenCalled();
    expect(transaction.calendarConnection.update).not.toHaveBeenCalled();
    expect(transaction.calendarOAuthCredential.upsert).not.toHaveBeenCalled();
    expect(transaction.calendarSyncReceipt.create).not.toHaveBeenCalled();
  });

  it("returns a stable failure state when the provider has no owned primary calendar", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    jest.mocked(validateGoogleCalendarOAuthCallback).mockReturnValue({
      verifier: "pkce-verifier",
      config: { encryptionKey: Buffer.alloc(32, 7) },
    } as never);
    jest.mocked(exchangeGoogleCalendarCode).mockResolvedValue({
      accessToken: "short-lived-access-token",
      refreshToken: "provider-refresh-token",
      grantedScopes: [],
    });
    jest.mocked(listOwnedGoogleCalendars).mockResolvedValue([
      {
        id: "secondary@example.com",
        summary: "Secondary calendar",
        primary: false,
        accessRole: "owner",
        timeZone: "America/Denver",
      },
    ]);

    const response = await GET(callbackRequest());

    expect(redirectState(response)).toBe("no-owned-calendar");
    expect(getPrismaClient).not.toHaveBeenCalled();
  });
});
