/** @jest-environment node */

import {
  formatSessionInvitationSchedule,
  sendSessionInvitationEmail,
  sessionInvitationEmailReadiness,
  sessionInvitationJoinUrl,
} from "./session-invitation-email";

jest.mock("server-only", () => ({}));

describe("Session invitation email", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY;
  const originalFrom = process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM;
  const originalSiteUrl = process.env.QUIPSLY_SITE_URL;
  const originalDeliveryMode =
    process.env.QUIPSLY_SESSION_INVITATION_DELIVERY_MODE;

  beforeEach(() => {
    process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY = "re_test";
    process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM =
      "Quipsly <sessions@quipsly.example>";
    delete process.env.QUIPSLY_SITE_URL;
    delete process.env.QUIPSLY_SESSION_INVITATION_DELIVERY_MODE;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    if (originalApiKey === undefined)
      delete process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY;
    else process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined)
      delete process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM;
    else process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM = originalFrom;
    if (originalSiteUrl === undefined) delete process.env.QUIPSLY_SITE_URL;
    else process.env.QUIPSLY_SITE_URL = originalSiteUrl;
    if (originalDeliveryMode === undefined)
      delete process.env.QUIPSLY_SESSION_INVITATION_DELIVERY_MODE;
    else
      process.env.QUIPSLY_SESSION_INVITATION_DELIVERY_MODE =
        originalDeliveryMode;
  });

  it("builds a same-origin local invitation URL without trusting a different path", () => {
    expect(
      sessionInvitationJoinUrl({
        requestUrl: "http://127.0.0.1:3012/api/sessions/room-1/invitations",
        invitePath:
          "/sessions/join?token=qsinv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
      }),
    ).toBe(
      "http://127.0.0.1:3012/sessions/join?token=qsinv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
    );
    expect(
      sessionInvitationJoinUrl({
        requestUrl: "http://127.0.0.1:3012/api/sessions/room-1/invitations",
        invitePath:
          "https://attacker.example/sessions/join?token=qsinv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
      }),
    ).toBeNull();
  });

  it("reports only actionable email readiness without exposing provider configuration", () => {
    expect(
      sessionInvitationEmailReadiness(
        "http://127.0.0.1:3012/api/sessions/room-1/invitations",
      ),
    ).toEqual({ available: true, status: "AVAILABLE" });

    delete process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY;
    expect(
      sessionInvitationEmailReadiness(
        "http://127.0.0.1:3012/api/sessions/room-1/invitations",
      ),
    ).toEqual({ available: false, status: "EMAIL_NOT_CONFIGURED" });
  });

  it("formats the Session instant in its canonical scheduling timezone", () => {
    expect(
      formatSessionInvitationSchedule(
        new Date("2026-08-20T18:00:00.000Z"),
        "America/Denver",
      ),
    ).toBe("Thursday, August 20, 2026 at 12:00 PM MDT · America/Denver");
    expect(
      formatSessionInvitationSchedule(
        new Date("2026-08-20T18:00:00.000Z"),
        "Not/A_Timezone",
      ),
    ).toBe("Thursday, August 20, 2026 at 6:00 PM UTC · UTC");
  });

  it("makes the isolated local receipt adapter actionable without provider credentials", () => {
    delete process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY;
    delete process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM;
    process.env.QUIPSLY_SESSION_INVITATION_DELIVERY_MODE = "local-receipt";

    expect(
      sessionInvitationEmailReadiness(
        "http://127.0.0.1:3022/api/sessions/room-1/invitations",
      ),
    ).toEqual({ available: true, status: "AVAILABLE" });
    expect(
      sessionInvitationEmailReadiness(
        "https://nest.quipsly.com/api/sessions/room-1/invitations",
      ),
    ).toEqual({ available: false, status: "EMAIL_NOT_CONFIGURED" });
  });

  it("sends one recipient with provider idempotency and no hidden recipients", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-provider-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    await expect(
      sendSessionInvitationEmail({
        recipientEmail: " Client@Example.Test ",
        recipientName: "Client",
        hostName: "Coach",
        roomTitle: "Values Session",
        scheduledStart: new Date("2026-08-20T18:00:00.000Z"),
        timezone: "America/Denver",
        joinUrl:
          "https://nest.quipsly.com/sessions/join?token=qsinv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
        idempotencyKey: "session-invitation/receipt-1",
      }),
    ).resolves.toEqual({
      ok: true,
      provider: "resend",
      providerMessageId: "email-provider-1",
    });

    const [, options] = jest.mocked(globalThis.fetch).mock.calls[0];
    expect(options?.headers).toMatchObject({
      "idempotency-key": "session-invitation/receipt-1",
      "user-agent": "Quipsly/1.0 session-invitations",
    });
    const body = JSON.parse(String(options?.body));
    expect(body.to).toEqual(["client@example.test"]);
    expect(body.cc).toBeUndefined();
    expect(body.bcc).toBeUndefined();
    expect(body.text).toContain("phone, tablet, or desktop");
    expect(body.text).toContain("Quipsly Capture on iPhone or iPad");
    expect(body.text).toContain(
      "Thursday, August 20, 2026 at 12:00 PM MDT · America/Denver",
    );
    expect(body.html).toContain("America/Denver");
    expect(body.text).not.toContain("verifies the invited email");
    expect(body.text).not.toContain("laptop");
    expect(body.text).toContain("never starts recording");
  });

  it("turns provider rate limiting into a retryable, human-readable result", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Too many requests" }), {
        status: 429,
        headers: { "retry-after": "2" },
      }),
    ) as typeof fetch;

    await expect(
      sendSessionInvitationEmail({
        recipientEmail: "client@example.test",
        roomTitle: "Session",
        joinUrl:
          "https://nest.quipsly.com/sessions/join?token=qsinv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
        idempotencyKey: "session-invitation/receipt-2",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSeconds: 2,
    });
  });

  it("refuses reserved local recipients before any provider request", async () => {
    globalThis.fetch = jest.fn() as typeof fetch;

    await expect(
      sendSessionInvitationEmail({
        recipientEmail: "fresh-client@dev.test",
        roomTitle: "Local acceptance Session",
        joinUrl:
          "http://127.0.0.1:3012/sessions/join?token=qsinv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
        idempotencyKey: "session-invitation/local-receipt",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "LOCAL_TEST_RECIPIENT",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("records any loopback lab invitation without contacting a provider", async () => {
    process.env.QUIPSLY_SESSION_INVITATION_DELIVERY_MODE = "local-receipt";
    globalThis.fetch = jest.fn() as typeof fetch;

    await expect(
      sendSessionInvitationEmail({
        recipientEmail: "client@example.com",
        roomTitle: "Local recovery rehearsal",
        joinUrl:
          "http://127.0.0.1:3022/sessions/join?token=qsinv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
        idempotencyKey: "session-invitation/local-lab-receipt",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "LOCAL_TEST_RECIPIENT",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("cannot activate the local receipt adapter for a public origin", async () => {
    process.env.QUIPSLY_SESSION_INVITATION_DELIVERY_MODE = "local-receipt";
    delete process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY;
    delete process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM;
    globalThis.fetch = jest.fn() as typeof fetch;

    await expect(
      sendSessionInvitationEmail({
        recipientEmail: "client@example.com",
        roomTitle: "Public invitation",
        joinUrl:
          "https://nest.quipsly.com/sessions/join?token=qsinv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
        idempotencyKey: "session-invitation/public-origin",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
