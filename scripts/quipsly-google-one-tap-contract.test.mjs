import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const oneTapSource = readFileSync(
  "apps/quipsly/src/app/(marketing)/components/GoogleOneTap.tsx",
  "utf8",
);
const loginSource = readFileSync(
  "apps/quipsly/src/app/(marketing)/login/LoginClient.tsx",
  "utf8",
);
const sessionSource = readFileSync(
  "apps/quipsly/src/lib/firebase/quipsly-session.ts",
  "utf8",
);
const serverSessionRoute = readFileSync(
  "apps/quipsly/src/app/api/auth/session/route.ts",
  "utf8",
);
const sessionCookieSource = readFileSync(
  "apps/quipsly/src/lib/server/quipsly-session-cookie.ts",
  "utf8",
);
const marketingLayout = readFileSync(
  "apps/quipsly/src/app/(marketing)/layout.tsx",
  "utf8",
);
const capturePlist = readFileSync(
  "apps/mobile-capture/HighGroundCapture/HighGroundCapture/Info.plist",
  "utf8",
);
const dockerfile = readFileSync("apps/quipsly/Dockerfile", "utf8");
const cloudBuild = readFileSync("cloudbuild.quipsly-web.yaml", "utf8");

test("Google One Tap uses the official GIS library and Firebase credential exchange", () => {
  assert.match(oneTapSource, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(oneTapSource, /GoogleAuthProvider\.credential\(response\.credential\)/);
  assert.match(oneTapSource, /signInWithCredential\(auth, credential\)/);
  assert.match(oneTapSource, /finishQuipslyFirebaseSignIn/);
  assert.match(sessionSource, /fetcher\("\/api\/auth\/session"/);
});

test("One Tap keeps deliberate sign-in and privacy-safe fallbacks", () => {
  assert.match(oneTapSource, /auto_select:\s*false/);
  assert.match(oneTapSource, /use_fedcm_for_prompt:\s*true/);
  assert.match(oneTapSource, /itp_support:\s*true/);
  assert.match(oneTapSource, /googleIdentity\.renderButton/);
  assert.match(oneTapSource, /text:\s*"continue_with"/);
  assert.match(oneTapSource, /auth\/account-exists-with-different-credential/);
  assert.match(loginSource, /Continue with Google/);
  assert.match(loginSource, /Forgot password\?/);
  assert.match(loginSource, /Create account/);
  assert.match(marketingLayout, /<GoogleOneTap \/>/);
});

test("marketing One Tap hands off one first-party session without global device logout", () => {
  assert.match(oneTapSource, /setPersistence\(auth, inMemoryPersistence\)/);
  assert.match(sessionCookieSource, /QUIPSLY_SESSION_COOKIE_DOMAIN = "\.quipsly\.com"/);
  assert.match(serverSessionRoute, /quipslySessionCookieOptions\(req,/);
  assert.doesNotMatch(
    serverSessionRoute,
    /revokeRefreshTokens/,
    "ordinary browser sign-out must not revoke Capture or other device refresh tokens",
  );
});

test("web, iOS, local, and release builds share the same public web client", () => {
  const sourceClientId = oneTapSource.match(
    /DEFAULT_GOOGLE_WEB_CLIENT_ID\s*=\s*"([^"]+)"/,
  )?.[1];
  const plistClientId = capturePlist.match(
    /<key>GIDServerClientID<\/key>\s*<string>([^<]+)<\/string>/,
  )?.[1];

  assert.ok(sourceClientId, "One Tap source must declare its public client ID.");
  assert.equal(sourceClientId, plistClientId);
  assert.match(dockerfile, /ARG NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
  assert.match(dockerfile, /ENV NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
  assert.match(cloudBuild, /--build-arg NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
});
