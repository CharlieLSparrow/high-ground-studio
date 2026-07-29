# Google OAuth redirect URI fix for Quipsly Nest

Date: 2026-06-29

## 2026-06-29 current evidence

Live Quipsly auth is deployed and healthy for Firebase email/password, generated self-serve signup, generated invited-user login, app-owned Home Nest creation, free-tier onboarding, Firebase Admin preflight, route smoke, legacy Auth.js route quarantine, Google-provider redirect acceptance, and generated native-app saved-session proof.

Current live revision:

- `https://nest.quipsly.com`
- Cloud Run revision `studio-00338-xef`
- Image tag `firebase-admin-role-20260629-115714`
- Live generated invited-user smoke passed.
- Live generated self-serve signup smoke passed.
- Live generated admin smoke passed; an app-owned generated `OWNER` user reached `/admin/users:200`.
- Live generated self-serve/native bearer smoke passed through `scripts/quipsly-live-self-serve-account-smoke.sh`, including `/api/mac/session-check` and `/api/mac/mobile-context`.

Current Chrome-visible Google result:

- Fresh browser automation after the Google OAuth Console fix no longer shows `redirect_uri_mismatch`.
- Repeatable proof command:

```bash
node scripts/quipsly-google-oauth-browser-smoke.mjs
```

- Current command classification: `google-provider-accepted`.
- The provider accepts Firebase's redirect handler:

```text
https://quipsly-reef.firebaseapp.com/__/auth/handler
```

That means Quipsly is correctly using Firebase's hosted handler and the Google Auth Platform OAuth client now allows it.

Current config-script result:

- `node scripts/quipsly-firebase-auth-config-check.mjs`: `ok: true`
- Firebase authorized domains include `nest.quipsly.com`.
- Firebase Google provider exists and is enabled.
- The script still reports `googleOAuthClient.manualRedirectListCheckRequired: true` because the classic OAuth client redirect URI list must be checked in Google Auth Platform / Clients.

## Historical symptom before the Console fix

Google sign-in from Nest used to reach Google, then fail with:

- `Access blocked: This app's request is invalid`
- `Error 400: redirect_uri_mismatch`

As of the current proof above, `node scripts/quipsly-google-oauth-browser-smoke.mjs` classifies the provider path as `google-provider-accepted`.

## Current architecture

Quipsly Nest no longer uses NextAuth as the Google OAuth provider.

The active browser login path is Firebase-first:

1. The user opens `https://nest.quipsly.com/login?callbackUrl=/projects`.
2. The login page calls Firebase Auth with Google as the identity provider.
3. Google redirects back to Firebase's hosted auth handler.
4. Quipsly receives a Firebase ID token.
5. `/api/auth/session` verifies the Firebase token, creates the Quipsly server session cookie, links or creates the app-owned User row by email, grants the free starter state, and ensures the user's Home Nest exists.

That means the Google Auth Platform redirect URI is **not** the old NextAuth callback.

## Google Cloud Console change now in place

In the Google Cloud project `high-ground-odyssey`, edit the OAuth 2.0 Web client used by Firebase Auth for Quipsly. The client ID is stored in the `studio-google-client-id` Secret Manager secret.

The OAuth client now needs to retain this exact Authorized redirect URI:

```text
https://quipsly-reef.firebaseapp.com/__/auth/handler
```

Useful Console entry point:

```text
https://console.cloud.google.com/auth/clients?project=high-ground-odyssey
```

Use a browser account with project-console access if this ever regresses. Terminal `gcloud` access does not guarantee the Chrome profile has permission to edit OAuth clients.

## What not to add for Nest

Do **not** add this as the active Quipsly Nest Google OAuth redirect:

```text
https://nest.quipsly.com/api/auth/callback/google
```

That was the old NextAuth callback. Quipsly keeps `/api/auth/signin` and `/api/auth/callback/google` only as quarantine redirects back to `/login` so old bookmarks do not strand users.

## Safe checks

Check Firebase authorized domains and Firebase's Google provider state without printing secrets:

```bash
node scripts/quipsly-firebase-auth-config-check.mjs
```

Expected healthy output includes:

- `ok: true`
- `authorizedDomains.missing: []`
- `googleProvider.exists: true`
- `googleProvider.enabled: true`
- `googleProvider.clientIdSet: true`
- `googleProvider.clientSecretSet: true`
- `googleOAuthClient.requiredRedirectUri: "https://quipsly-reef.firebaseapp.com/__/auth/handler"`

This script cannot verify the classic Google OAuth client's redirect URI list. That remaining check lives in Google Auth Platform / Clients.

## Browser retest

After the OAuth client is saved, retest:

```text
https://nest.quipsly.com/login?callbackUrl=/projects
```

Click `Sign in with Google`.

The non-credentialed command-line retest is:

```bash
node scripts/quipsly-google-oauth-browser-smoke.mjs
```

Passing outcomes:

- Google account chooser or consent appears.
- `node scripts/quipsly-google-oauth-browser-smoke.mjs` exits `0` with `classification: "google-provider-accepted"`.
- The browser returns to `/projects`.
- `/projects` shows the signed-in user's Home Nest and any granted Nests.

Failing outcomes and likely layer:

- `auth/unauthorized-domain`: Firebase Auth authorized domains are missing `nest.quipsly.com`.
- `auth/operation-not-allowed`: Firebase Auth Google provider is disabled or missing.
- `redirect_uri_mismatch`: Google Auth Platform OAuth client is missing `https://quipsly-reef.firebaseapp.com/__/auth/handler`.

## CLI smoke after browser repair

Do not print passwords or tokens. Pass smoke credentials through environment variables only.

```bash
QUIPSLY_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com \
QUIPSLY_AUTH_SMOKE_EMAIL=<operator email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<operator password> \
node scripts/quipsly-firebase-auth-smoke.mjs
```

Generated invited-user smoke can validate invite creation, first sign-in linking, Home Nest creation, and cleanup without using real customer accounts:

```bash
/tmp/cloud-sql-proxy-quipsly \
  --quota-project high-ground-odyssey \
  --port 15432 \
  high-ground-odyssey:us-central1:studio-postgres

QUIPSLY_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com \
DATABASE_URL=<production database URL via local secure env> \
node scripts/quipsly-generated-invited-user-smoke.mjs
```

Never paste or commit the production database URL. Use the local secure environment that already supplies it.

## Why this matters

This is the exact seam that prevents another multi-day auth spiral:

- Firebase Auth proves identity.
- Quipsly Postgres owns user, Nest, role, invitation, membership, and creative-work truth.
- Google OAuth configuration must point at Firebase's handler.
- Old NextAuth callback routes are compatibility redirects only, not active login architecture.
