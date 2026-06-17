# Quipsly auth durability plan

## Decision

Quipsly owns the source of truth for people, access, and entitlement.

- `User` is the canonical app person record.
- `StudioProjectAccessGrant` is the canonical Nest access record.
- `Membership` is the canonical product entitlement record.
- OAuth providers prove identity, but do not define app access.
- Patreon provider events can inform entitlement reconciliation, but Patreon is not the source of truth.

## Why this exists

Login has been too fragile because too many concerns were mentally bundled together:

- Google OAuth proves identity.
- Patreon proves possible supporter status.
- Quipsly decides app access.
- The Mac app needs a durable native session.
- The embedded web editor needs a browser session.

When those are treated as one thing, a Google redirect setting or Patreon webhook delay can block the entire product. That is not acceptable for beta or production.

## Front-door policy

Email code sign-in is the durable default.

1. An admin can create or invite a user by email.
2. The user requests a one-time email code.
3. Quipsly only issues usable codes for staff, invited users, or users with active app-owned beta access.
4. Successful email-code verification creates or updates the canonical `User`.
5. Google and Patreon remain useful shortcuts or linking providers, not the only way in.

## Provider policy

Google:

- Optional convenience sign-in.
- Must keep the exact Nest callback URI registered in Google Cloud:
  `https://nest.quipsly.com/api/auth/callback/google`
- A Google OAuth failure should not block invited users from entering through email code.

Patreon:

- Supplemental beta/support signal.
- Webhooks and manual checks should reconcile into provider events, entitlement ledger rows, and app-owned `Membership` rows.
- Patreon must not be queried as the live gate every time a user tries to open the app.

Mac app:

- Native API calls should use Quipsly-owned device sessions.
- Embedded editor access should either reuse a verified web session or bootstrap from a Quipsly-owned device session.
- Mac auth should not depend on copying provider cookies or making Google work inside `WKWebView`.

## Current implementation note

The first production hardening cut adds a first-party email-code sign-in provider:

- Code requests live at `/api/auth/email-code/request`.
- Code verification uses the Auth.js `email-code` credentials provider.
- Codes are stored as HMAC hashes in `VerificationToken`.
- Resend is used when `RESEND_API_KEY` is configured.
- Development can reveal a code only outside production or when explicitly enabled with `QUIPSLY_EMAIL_LOGIN_DEV_CODES=true`.

## Next hardening targets

1. Configure production email sending.
2. Add resend/cooldown/rate-limit tracking for code requests.
3. Add an admin-visible invite status: invited, code requested, signed in, stale.
4. Let the Mac app request and exchange email codes directly.
5. Add an auth diagnostics page that checks public auth URL, provider callback URLs, email sender readiness, and current revision config.
