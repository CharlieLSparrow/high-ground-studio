/** @jest-environment node */

import {
  beginGoogleDriveOAuth,
  decryptGoogleDriveRefreshToken,
  encryptGoogleDriveRefreshToken,
  GOOGLE_DRIVE_FILE_SCOPE,
  getGoogleDriveProviderReadiness,
  googleDriveOAuthRedirectUrl,
  normalizeGoogleDriveReturnTo,
  validateGoogleDriveOAuthCallback,
} from "./google-drive-oauth";

const encryptionKey = Buffer.alloc(32, 7).toString("base64url");
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  QUIPSLY_APP_HOST: "http://127.0.0.1:3012",
  GOOGLE_DRIVE_OAUTH_CLIENT_ID: "drive-client",
  GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "drive-secret",
  GOOGLE_DRIVE_OAUTH_STATE_SECRET: "s".repeat(48),
  GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY: encryptionKey,
  GOOGLE_DRIVE_PICKER_API_KEY: "picker-key",
  GOOGLE_DRIVE_PICKER_APP_ID: "123456789",
};

describe("Google Drive user OAuth", () => {
  it("reports OAuth and Picker readiness without exposing configuration values", () => {
    expect(
      getGoogleDriveProviderReadiness("http://127.0.0.1:3012", environment),
    ).toEqual({
      schema: "quipsly-google-drive-provider-readiness-v1",
      oauthConfigured: true,
      pickerConfigured: true,
      ready: true,
    });
    const missingOAuth = { ...environment };
    delete missingOAuth.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
    expect(
      getGoogleDriveProviderReadiness("http://127.0.0.1:3012", missingOAuth),
    ).toMatchObject({
      oauthConfigured: false,
      pickerConfigured: true,
      ready: false,
    });
  });

  it("uses PKCE, selected-file scope, and a same-origin return path", () => {
    const started = beginGoogleDriveOAuth({
      userId: "user_01",
      requestUrl:
        "http://127.0.0.1:3012/api/media/connections/google-drive/start",
      returnTo: "/nests/high-ground-odyssey/story?drive=connect",
      environment,
      now: new Date("2026-08-07T20:00:00.000Z"),
    });
    expect(started.authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(started.authorizationUrl.searchParams.get("scope")).toContain(
      GOOGLE_DRIVE_FILE_SCOPE,
    );
    expect(
      started.authorizationUrl.searchParams.get("code_challenge_method"),
    ).toBe("S256");
    expect(started.authorizationUrl.searchParams.get("access_type")).toBe(
      "offline",
    );

    const callback = validateGoogleDriveOAuthCallback({
      state: started.authorizationUrl.searchParams.get("state")!,
      cookieValue: started.cookieValue,
      userId: "user_01",
      requestUrl:
        "http://127.0.0.1:3012/api/media/connections/google-drive/callback",
      environment,
      now: new Date("2026-08-07T20:05:00.000Z"),
    });
    expect(callback.returnTo).toBe(
      "/nests/high-ground-odyssey/story?drive=connect",
    );
    expect(callback.verifier.length).toBeGreaterThan(40);
  });

  it("returns callbacks to the configured public origin instead of a reconstructed host", () => {
    expect(
      googleDriveOAuthRedirectUrl({
        requestUrl:
          "http://localhost:3012/api/media/connections/google-drive/callback",
        returnTo: "/nests/high-ground-odyssey/story",
        state: "connected",
        environment,
      }).toString(),
    ).toBe(
      "http://127.0.0.1:3012/nests/high-ground-odyssey/story?drive=connected",
    );
  });

  it("rejects cross-origin, protocol-relative, and changed-user callbacks", () => {
    expect(() =>
      normalizeGoogleDriveReturnTo("https://attacker.example/steal"),
    ).toThrow("return destination");
    expect(() =>
      normalizeGoogleDriveReturnTo("//attacker.example/steal"),
    ).toThrow("return destination");
    expect(() =>
      normalizeGoogleDriveReturnTo("/api/media/connections/google-drive"),
    ).toThrow("return destination");
    const started = beginGoogleDriveOAuth({
      userId: "user_01",
      requestUrl: "http://127.0.0.1:3012",
      environment,
    });
    expect(() =>
      validateGoogleDriveOAuthCallback({
        state: started.authorizationUrl.searchParams.get("state")!,
        cookieValue: started.cookieValue,
        userId: "user_02",
        requestUrl: "http://127.0.0.1:3012",
        environment,
      }),
    ).toThrow("changed accounts");
  });

  it("encrypts refresh credentials with an authenticated domain boundary", () => {
    const key = Buffer.from(encryptionKey, "base64url");
    const encrypted = encryptGoogleDriveRefreshToken(
      "durable-refresh-secret",
      key,
    );
    expect(encrypted).not.toContain("durable-refresh-secret");
    expect(decryptGoogleDriveRefreshToken(encrypted, key)).toBe(
      "durable-refresh-secret",
    );
    expect(() =>
      decryptGoogleDriveRefreshToken(`${encrypted.slice(0, -1)}x`, key),
    ).toThrow("could not be read");
  });
});
