/** @jest-environment node */

import {
  beginGoogleCalendarOAuth,
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  GOOGLE_CALENDAR_LIST_SCOPE,
  GOOGLE_OWNED_EVENTS_SCOPE,
  GoogleCalendarOAuthError,
  googleProviderAccountKey,
  validateGoogleCalendarOAuthCallback,
} from "./google-calendar-oauth";

const environment = {
  NODE_ENV: "test",
  QUIPSLY_APP_HOST: "http://127.0.0.1:3012",
  GOOGLE_CALENDAR_OAUTH_CLIENT_ID: "calendar-client.apps.googleusercontent.com",
  GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET: "private-client-secret",
  GOOGLE_CALENDAR_OAUTH_STATE_SECRET: "state-secret-with-at-least-thirty-two-bytes",
  GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
} as NodeJS.ProcessEnv;

describe("Google Calendar OAuth boundary", () => {
  it("starts an offline, incremental, PKCE-protected authorization request", () => {
    const started = beginGoogleCalendarOAuth({
      userId: "user-1",
      requestUrl: "http://127.0.0.1:3012/api/calendar/connections/google/start",
      environment,
      now: new Date("2026-08-02T00:00:00.000Z"),
    });
    const url = started.authorizationUrl;

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      GOOGLE_CALENDAR_LIST_SCOPE,
      GOOGLE_OWNED_EVENTS_SCOPE,
    ]);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:3012/api/calendar/connections/google/callback",
    );
    expect(started.cookieValue).not.toContain("user-1");
  });

  it("binds callback state to the signed-in Quipsly user, nonce, verifier, and expiry", () => {
    const now = new Date("2026-08-02T00:00:00.000Z");
    const started = beginGoogleCalendarOAuth({
      userId: "user-1",
      requestUrl: "http://127.0.0.1:3012/api/calendar/connections/google/start",
      environment,
      now,
    });
    const state = started.authorizationUrl.searchParams.get("state")!;

    expect(validateGoogleCalendarOAuthCallback({
      state,
      cookieValue: started.cookieValue,
      userId: "user-1",
      requestUrl: "http://127.0.0.1:3012/api/calendar/connections/google/callback",
      environment,
      now: new Date("2026-08-02T00:09:59.000Z"),
    }).verifier.length).toBeGreaterThan(40);

    expect(() => validateGoogleCalendarOAuthCallback({
      state,
      cookieValue: started.cookieValue,
      userId: "user-2",
      requestUrl: "http://127.0.0.1:3012/api/calendar/connections/google/callback",
      environment,
      now,
    })).toThrow(GoogleCalendarOAuthError);

    expect(() => validateGoogleCalendarOAuthCallback({
      state,
      cookieValue: `${started.cookieValue}tampered`,
      userId: "user-1",
      requestUrl: "http://127.0.0.1:3012/api/calendar/connections/google/callback",
      environment,
      now,
    })).toThrow(GoogleCalendarOAuthError);

    expect(() => validateGoogleCalendarOAuthCallback({
      state,
      cookieValue: started.cookieValue,
      userId: "user-1",
      requestUrl: "http://127.0.0.1:3012/api/calendar/connections/google/callback",
      environment,
      now: new Date("2026-08-02T00:10:01.000Z"),
    })).toThrow(GoogleCalendarOAuthError);
  });

  it("encrypts refresh tokens with authenticated encryption and rejects the wrong key", () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptGoogleRefreshToken("refresh-token-secret", key);

    expect(encrypted).not.toContain("refresh-token-secret");
    expect(decryptGoogleRefreshToken(encrypted, key)).toBe("refresh-token-secret");
    expect(() => decryptGoogleRefreshToken(encrypted, Buffer.alloc(32, 8))).toThrow(
      GoogleCalendarOAuthError,
    );
  });

  it("uses a stable digest rather than a provider email as the account key", () => {
    const key = googleProviderAccountKey("Person@Example.com");
    expect(key).toMatch(/^google:[a-f0-9]{64}$/);
    expect(key).toBe(googleProviderAccountKey(" person@example.com "));
    expect(key).not.toContain("person@example.com");
  });

  it("fails closed when credential-protection configuration is absent or weak", () => {
    expect(() => beginGoogleCalendarOAuth({
      userId: "user-1",
      requestUrl: "http://127.0.0.1:3012/api/calendar/connections/google/start",
      environment: { ...environment, GOOGLE_CALENDAR_OAUTH_STATE_SECRET: "short" },
    })).toThrow("state protection");

    expect(() => beginGoogleCalendarOAuth({
      userId: "user-1",
      requestUrl: "http://127.0.0.1:3012/api/calendar/connections/google/start",
      environment: { ...environment, GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY: "not-32-bytes" },
    })).toThrow("credential protection");
  });
});
