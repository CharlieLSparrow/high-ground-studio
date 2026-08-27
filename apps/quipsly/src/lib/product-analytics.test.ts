import {
  analyticsSurfaceForPath,
  buildAnalyticsConsentCookie,
  isQuipslyProductEventName,
  parseAnalyticsConsentCookie,
  privacySafeAnalyticsPath,
  sanitizeProductEventParameters,
} from "./product-analytics";

describe("product analytics privacy boundary", () => {
  it("never sends resource ids or query strings as page paths", () => {
    expect(privacySafeAnalyticsPath("/sessions/cms-private-room?email=person@example.com"))
      .toBe("/sessions/:session");
    expect(privacySafeAnalyticsPath("/nests/home-charlie-local-at-quipsly-test"))
      .toBe("/nests/:nest");
    expect(privacySafeAnalyticsPath("/coaching/book/charlie?token=secret"))
      .toBe("/coaching/book/:coach");
  });

  it("collapses unknown dynamic paths instead of forwarding their values", () => {
    expect(privacySafeAnalyticsPath("/research/a-sensitive-manuscript-title"))
      .toBe("/research/:other");
  });

  it("accepts only the fixed event and parameter taxonomy", () => {
    expect(isQuipslyProductEventName("call_joined")).toBe(true);
    expect(isQuipslyProductEventName("person@example.com")).toBe(false);
    expect(sanitizeProductEventParameters({
      surface: "session_workspace",
      client_kind: "browser",
      email: "person@example.com",
      room_id: "private-room",
      has_video: true,
    })).toEqual({
      surface: "session_workspace",
      client_kind: "browser",
      has_video: true,
    });
  });

  it("derives a bounded surface from a redacted path", () => {
    expect(analyticsSurfaceForPath("/sessions/private-room")).toBe("session_workspace");
    expect(analyticsSurfaceForPath("/coaching/book/private-coach")).toBe("booking_page");
  });

  it("shares one explicit analytics choice across Quipsly web hosts", () => {
    expect(buildAnalyticsConsentCookie({
      consent: "granted",
      hostname: "nest.quipsly.com",
      secure: true,
    })).toBe(
      "quipsly_analytics_consent=granted; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.quipsly.com; Secure",
    );
    expect(buildAnalyticsConsentCookie({
      consent: "denied",
      hostname: "127.0.0.1",
      secure: false,
    })).toBe(
      "quipsly_analytics_consent=denied; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });

  it("reads only an exact granted or denied consent cookie", () => {
    expect(parseAnalyticsConsentCookie(
      "theme=calm; quipsly_analytics_consent=denied; other=value",
    )).toBe("denied");
    expect(parseAnalyticsConsentCookie(
      "quipsly_analytics_consent=surprise",
    )).toBeNull();
  });
});
