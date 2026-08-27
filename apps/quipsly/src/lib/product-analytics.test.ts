import {
  analyticsSurfaceForPath,
  isQuipslyProductEventName,
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
});
