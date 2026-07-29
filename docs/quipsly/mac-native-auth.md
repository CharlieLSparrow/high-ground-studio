# Quipsly native auth direction

Status: active direction, replacing manual browser-token handoff as the product path.

Last updated: 2026-07-05

## Decision

Quipsly native apps should authenticate through the same Firebase-first identity system as the web app.

Firebase proves identity. Quipsly Postgres owns access.

## Preferred native flow

1. The Mac/iOS app signs in through Firebase-supported native auth:
   - Google now.
   - Email/password for admin-created/test/operator accounts.
   - Apple later.
2. The native app obtains a Firebase ID token.
3. Native API calls send `Authorization: Bearer <Firebase ID token>`.
4. Quipsly server verifies the bearer token with Firebase Admin.
5. Server links/resolves the canonical Quipsly `User`.
6. Server authorizes Nests, assets, documents, and publishing actions through app-owned records.

This path is already aligned with `verifyBearerToken` and the Firebase-backed Quipsly session boundary.

## Current iOS capture implementation

`apps/mobile-capture/HighGroundCapture` now follows the Firebase-first path without depending on the retired native handoff endpoints.

- `LoginView.swift` exposes an email/password reviewer/operator login surface.
- `AuthManager.swift` fetches public Firebase client configuration from `/api/mac/firebase-client-config`.
- It signs in through Firebase Identity Toolkit `accounts:signInWithPassword`.
- It stores the Firebase ID token, refresh token, expiry, email, and display name in Keychain.
- It refreshes expired ID tokens through `securetoken.googleapis.com/v1/token`.
- It verifies the Quipsly app session through `/api/mac/session-check` using `Authorization: Bearer <Firebase ID token>`.
- Native capture APIs continue sending Firebase bearer tokens, so the server remains the source of truth for Quipsly user, Home Nest, access, sessions, recordings, transcripts, and packets.

Guardrail:

```bash
node scripts/quipsly-ios-native-auth-static-smoke.mjs
```

This smoke is part of `scripts/quipsly-mobile-capture-preflight.sh`. It fails if the iOS capture login path reintroduces `/api/mac/session-handoff`, `/api/mac/session-exchange`, or `ASWebAuthenticationSession` as the product login path.

## Optional device-session layer

A Quipsly native device session may still be useful later for:

- profile vaults,
- revocable long-lived native sessions,
- offline-friendly refresh behavior,
- per-device audit/revocation,
- app-store/native UX polish.

If built, it must be Firebase-backed:

1. Native app proves identity with Firebase.
2. Quipsly exchanges that proof for a revocable `StudioNativeDeviceSession`.
3. Device sessions map back to a canonical Quipsly `User`.

Do not build device sessions as a second identity system.

## What is retired

The old browser-copy/manual handoff approach is not the primary product path.

Retired as primary:

- copying durable browser tokens,
- depending on Google inside `WKWebView`,
- using manual handoff as the normal Mac sign-in flow,
- accepting stale Auth.js sessions as native truth.

Allowed only as recovery/development fallback:

- one-time short-lived handoff codes,
- local debugging helpers,
- explicit operator-only diagnostics.

## Product rule

Native sign-in must feel boring:

- sign in,
- choose account/profile,
- see assigned Nests,
- sync/edit/upload with the same access rules as web.

If the native app needs special auth behavior, it should extend the Firebase-first boundary, not bypass it.
