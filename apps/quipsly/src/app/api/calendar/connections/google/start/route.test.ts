/** @jest-environment node */

import { beginGoogleCalendarOAuth } from "@/lib/server/google-calendar-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/server/google-calendar-oauth", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-oauth"),
  beginGoogleCalendarOAuth: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

describe("GET /api/calendar/connections/google/start", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends a signed-out user through Quipsly login without starting provider OAuth", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/connections/google/start"));
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/schedule");
    expect(beginGoogleCalendarOAuth).not.toHaveBeenCalled();
  });

  it("sets a short-lived callback-only HttpOnly verifier cookie", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1" } } as never);
    jest.mocked(beginGoogleCalendarOAuth).mockReturnValue({
      authorizationUrl: new URL("https://accounts.google.com/o/oauth2/v2/auth?state=signed"),
      cookieValue: "signed-verifier",
    });
    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/connections/google/start"));
    const cookie = response.headers.get("set-cookie")!;
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("accounts.google.com");
    expect(cookie).toContain("quipsly_google_calendar_oauth=signed-verifier");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/api/calendar/connections/google/callback");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
