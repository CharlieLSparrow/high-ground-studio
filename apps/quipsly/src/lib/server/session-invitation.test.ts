/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  cleanSessionInvitationToken,
  createSessionInvitationToken,
  hashSessionInvitationToken,
  maskInvitationEmail,
  sessionInvitationExpiry,
  sessionInvitationRole,
} from "./session-invitation";

describe("Session invitation token policy", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeEach(() => { process.env.AUTH_SECRET = "unit-test-session-invitation-secret"; });
  afterAll(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  it("creates opaque one-time-link material and stores only a stable HMAC", () => {
    const invitation = createSessionInvitationToken();
    expect(invitation.token).toMatch(/^qsinv_[A-Za-z0-9_-]+$/);
    expect(invitation.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(invitation.tokenHash).toBe(hashSessionInvitationToken(invitation.token));
    expect(invitation.tokenHash).not.toContain(invitation.token);
  });

  it("rejects malformed and oversized token input", () => {
    expect(cleanSessionInvitationToken("qsinv_short")).toBe("");
    expect(cleanSessionInvitationToken("qsinv_bad token________________________________")).toBe("");
    expect(cleanSessionInvitationToken(`qsinv_${"a".repeat(180)}`)).toBe("");
  });

  it("uses purpose-aware safe roles and bounded expirations", () => {
    expect(sessionInvitationRole("HOST", "PODCAST")).toBe("GUEST");
    expect(sessionInvitationRole("", "COACHING")).toBe("CLIENT");
    expect(sessionInvitationRole("PRODUCER", "PODCAST")).toBe("PRODUCER");
    const now = new Date("2026-08-04T12:00:00.000Z");
    expect(sessionInvitationExpiry(0, now).toISOString()).toBe("2026-08-04T13:00:00.000Z");
    expect(sessionInvitationExpiry(10000, now).toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });

  it("masks recipient identity in the lobby", () => {
    expect(maskInvitationEmail("Scott.Homer@example.test")).toBe("s••••••@example.test");
  });
});
