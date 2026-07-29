# Quipsly Mac native auth

Quipsly Studio for Mac uses the same Firebase person as Nest and Quipsly
Capture. Do not replace this flow with copied browser cookies, email-only
account matching, an embedded Google login, or a second Quipsly identity
system.

## Production flow

1. The Mac app generates 256 bits of random `state` and a separate PKCE
   verifier. Only the verifier and the Nest origin are stored in the
   device-local Keychain.
2. The app opens the normal Nest system-browser flow at
   `/api/mac/session-handoff`. The request contains the allowlisted
   `quipslymac` callback scheme, `state`, and the SHA-256 PKCE challenge.
3. Nest authenticates through its normal Firebase/Google web session. If the
   browser is unsigned, Nest redirects through `/login` and preserves only the
   relative handoff callback.
4. Nest proves that the browser session's immutable Firebase UID is already
   bound to the canonical Quipsly user through the verified
   `firebase:quipsly-reef` identity row.
5. Nest writes a five-minute `StudioNativeAuthCode` containing hashes and
   identity metadata, then opens:

   ```text
   quipslymac://auth/session#code=<one-time-code>&state=<state>&expiresAt=<iso-date>
   ```

6. The Mac accepts only that exact scheme, host, path, and fragment shape. It
   rejects query-string credentials, duplicates, short values, expired
   callbacks, and state mismatches.
7. The Mac posts the code, state, and device-only PKCE verifier to
   `/api/mac/session-exchange`.
8. Nest atomically consumes the code, verifies the state, callback allowlist,
   expiry, PKCE proof, canonical user, and exact Firebase UID. Concurrent or
   replayed exchanges fail closed.
9. Firebase Admin confirms that the UID still exists, is enabled, and still has
   a verified email before it creates a custom token. A stale database binding
   can therefore never recreate a deleted Firebase account.
10. The Mac
   exchanges it directly with Firebase for the ordinary ID token and rotating
   refresh token used by Capture and native Nest APIs.
11. The Mac calls `/api/mac/session-check` before saving anything. It stores
    only the verified refresh token in the device-bound macOS data-protection
    Keychain; the ID token remains memory-only.

## Durable records

- `UserAuthIdentity`: canonical binding between one Quipsly user and the
  verified Firebase UID. Email is display/recovery data, not the merge key.
- `StudioNativeAuthCode`: one-time handoff ledger. Codes expire after five
  minutes and conditional consumption permits exactly one successful exchange.
- Firebase refresh-token state: Firebase remains the revocation and credential
  authority for the Mac session. Existing `StudioNativeDeviceSession` rows are
  retained for legacy compatibility but are not created by the Google/Firebase
  handoff.

## Product rules

- Google/Firebase is the primary user-facing sign-in path. Email/password is an
  explicitly disclosed recovery and diagnostics path.
- A matching email must never substitute for a matching verified Firebase UID.
- The callback code must never appear in a URL query, referrer, log, analytics
  payload, UserDefaults, or a copy/paste recovery UI.
- Handoff and exchange responses are `no-store`; the handoff page uses a
  restrictive CSP and `no-referrer`.
- The Mac must verify the returned Firebase bearer against Nest before
  committing the refresh token.
- Disconnecting this Mac deletes both current data-protection-keychain records
  and any older legacy-keychain copies. Upgrades migrate legacy records only
  after a protected write succeeds.
- Native API calls use short-lived Firebase ID tokens and retry once after a
  refresh on `401`.

## Runtime requirements

- The Mac target must register `quipslymac` in its signed `Info.plist` and route
  `NSApplicationDelegate.application(_:open:)` into the same
  `QuipslyNativeAccountStore` used by the visible workspace.
- Production Nest must expose Firebase client config, handoff, exchange, and
  session-check routes.
- The Cloud Run runtime identity must be able to sign Firebase custom tokens.
  Prefer a narrowly scoped runtime service account. When Application Default
  Credentials cannot sign locally, grant only the documented service-account
  token-signing permission to the actual runtime identity rather than shipping
  a private key.
- Preview hosts may exercise the flow, but the Mac accepts HTTP only for exact
  loopback hosts. Every non-loopback Nest origin must be HTTPS.

## Verification contract

Automated proof:

- route tests cover unsigned login continuation, exact-UID handoff, malformed
  input rejection, safe retry, JSON enforcement, PKCE exchange, and replay
  errors;
- server tests cover expiry, callback/state/PKCE mismatches, identity mismatch,
  and atomic one-time consumption;
- Swift tests cover the exact custom-URL parser and reject query tokens,
  duplicates, low entropy, wrong routes, and expiry;
- the signed app's final `Info.plist` and Team identifier are read back from the
  built `.app`.

Operational proof:

1. Begin sign-in from the signed Mac app.
2. Choose a real Google account in the system browser.
3. Confirm the callback returns to the app without copy/paste.
4. Confirm `/api/mac/session-check` reports that same account and only its
   authorized Nests.
5. Relaunch and prove refresh survives while browser cookies are absent.
6. Disconnect and prove the saved session is gone.
7. Sign in as a separate account and prove private projects do not cross the
   identity boundary.
