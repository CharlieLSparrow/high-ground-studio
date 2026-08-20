/** @jest-environment node */

import {
  sendSessionInvitationEmail,
  sessionInvitationJoinUrl,
} from "./session-invitation-email";

jest.mock("server-only", () => ({}));

describe("Session invitation email", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY;
  const originalFrom = process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM;
  const originalSiteUrl = process.env.QUIPSLY_SITE_URL;

  beforeEach(() => {
    process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY = "re_test";
    process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM =
      "Quipsly <sessions@quipsly.example>";
    delete process.env.QUIPSLY_SITE_URL;
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
});
