# Quipsly Mac native auth

Quipsly Mac uses a native-device session flow. Do not replace it with copied browser cookies or durable bearer tokens.

## Intended flow

1. The Mac app opens the normal Nest browser sign-in flow.
2. Nest authenticates the user with the web app session.
3. `/api/mac/session-handoff` creates a short-lived one-time code and redirects to `quipslymac://auth/session#code=...&state=...`.
4. The Mac app verifies the callback `state` and posts the one-time code to `/api/mac/session-exchange`.
5. Nest consumes the code, creates a `StudioNativeDeviceSession`, and returns:
   - short-lived access token
   - refresh token
   - device session id
   - user/profile metadata
6. The Mac app stores refresh tokens per profile in macOS Keychain and stores only the current short-lived access token for API calls.
7. The Mac app refreshes through `/api/mac/session-refresh`; refresh tokens rotate on use.

## Durable records

- `StudioNativeAuthCode`: one-time code ledger. Codes expire quickly and can be consumed once.
- `StudioNativeDeviceSession`: revocable native device session. This is the server-side truth for Mac profile access.

## Product rules

- Browser identity, native device session, and API access token are separate concepts.
- A profile switch should select a saved device session, not copy web cookies.
- Native API access should use short-lived access tokens.
- Refresh credentials live in Keychain, not UserDefaults.
- Manual recovery may paste a one-time code, never a durable bearer token.

## Current compatibility

Legacy v1 Mac bearer tokens are still accepted temporarily by `resolveMacSessionActor` so existing in-flight local sessions do not break during rollout. New sessions should use the v2 device-session flow.
