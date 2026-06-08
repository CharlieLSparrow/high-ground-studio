# Quipsly Mac auth handoff stabilization - 2026-06-07

## What changed

- Mac sign-in now has one primary path: normal browser sign-in -> `/api/mac/session-handoff` -> `quipslymac://auth/session#code=...` -> `/api/mac/session-exchange` -> saved Mac device session.
- Embedded WKWebView editor routes now use `/api/mac/web-session` to convert the native Mac access token into a short-lived HTTP-only web-session cookie before loading `/editor`, `/create`, or other Nest app routes.
- Local unsigned development builds store native session credentials in `~/Library/Application Support/QuipslyMac/nest-session-vault.json` with user-only permissions to avoid ad-hoc Keychain prompt loops.
- Non-debug builds keep the same profile-vault API but use macOS Keychain as the storage backend.
- Manual code copy remains only as an advanced recovery path. It is not the normal sign-in workflow.

## Morning test path

1. If a stale macOS Keychain modal is still visible, dismiss it manually once. The current dev build should no longer call Keychain for Nest session storage.
2. Relaunch Quipsly Mac through `apps/quipsly-mac/script/build_and_run.sh --verify` or the existing app icon after the script has rebuilt `dist/QuipslyMac.app`.
3. Open `Nest Session`.
4. Click `Sign in with browser`.
5. Sign in normally on `nest.quipsly.com`.
6. On the `Opening Quipsly Mac` handoff page, approve macOS opening Quipsly Mac if prompted.
7. Confirm `Nest Session` shows a verified email.
8. Open `Episode Editor`; it should load the real embedded editor instead of the Nest marketing/sign-in card.

## Known fallback

If the custom scheme prompt does not fire, use the handoff page's manual recovery drawer, copy the one-time code, paste it into `Nest Session -> Advanced recovery fallback`, and exchange it. That should still produce the same device session.

## Do not resurrect

- Do not use copied durable browser tokens.
- Do not make WKWebView OAuth the primary sign-in path.
- Do not make local debug development depend on Keychain. Non-debug signed builds should use the Keychain backend.
- Do not treat a saved token as signed in until `/api/mac/session-check` verifies it.
