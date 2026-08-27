/** @jest-environment node */

import {
  sendTransactionalEmail,
  transactionalEmailReadiness,
  transactionalSessionUrl,
} from "./transactional-email-transport";

jest.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.restoreAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    QUIPSLY_SITE_URL: "https://nest.quipsly.com",
    QUIPSLY_SESSION_INVITATION_RESEND_API_KEY: "re_test-key",
    QUIPSLY_SESSION_INVITATION_EMAIL_FROM: "invites@notify.quipsly.com",
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("transactional email transport", () => {
  it("builds only a trusted canonical Session URL", () => {
    expect(transactionalSessionUrl("room / 1")?.toString()).toBe(
      "https://nest.quipsly.com/sessions/room%20%2F%201?mode=live",
    );
    process.env.QUIPSLY_SITE_URL = "http://nest.quipsly.com";
    expect(transactionalSessionUrl("room-1")).toBeNull();
  });

  it("reports provider and origin readiness without exposing configuration", () => {
    expect(transactionalEmailReadiness()).toEqual({
      available: true,
      status: "AVAILABLE",
    });
    delete process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY;
    expect(transactionalEmailReadiness()).toEqual({
      available: false,
      status: "EMAIL_NOT_CONFIGURED",
    });
  });

  it("sends a privacy-bounded operational message with provider idempotency", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "provider-message-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(sendTransactionalEmail({
      recipientEmail: "CLIENT@Example.com",
      recipientName: "Chris",
      counterpartName: "Casey",
      roomId: "room-1",
      roomTitle: "Focused coaching",
      scheduledStart: new Date("2026-08-28T18:00:00.000Z"),
      timezone: "America/Denver",
      kind: "SESSION_REMINDER_24H",
      idempotencyKey: "txn-email/one",
    })).resolves.toEqual({
      ok: true,
      provider: "resend",
      providerMessageId: "provider-message-1",
    });

    const [, request] = fetchMock.mock.calls[0]!;
    expect(request?.headers).toMatchObject({
      "idempotency-key": "txn-email/one",
    });
    const body = JSON.parse(String(request?.body));
    expect(body.to).toEqual(["client@example.com"]);
    expect(body.text).toContain("https://nest.quipsly.com/sessions/room-1?mode=live");
    expect(body).not.toHaveProperty("cc");
    expect(body).not.toHaveProperty("bcc");
  });

  it("never sends synthetic local recipients", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    await expect(sendTransactionalEmail({
      recipientEmail: "client@dev.test",
      roomId: "room-1",
      roomTitle: "Local acceptance",
      scheduledStart: new Date("2026-08-28T18:00:00.000Z"),
      timezone: "UTC",
      kind: "BOOKING_CONFIRMED",
      idempotencyKey: "txn-email/local",
    })).resolves.toMatchObject({ ok: false, code: "LOCAL_TEST_RECIPIENT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
