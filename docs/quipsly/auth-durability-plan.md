# Quipsly Firebase-first auth durability plan

Status: active architecture, supersedes the old Auth.js/email-code plan.

Last updated: 2026-06-28

## Decision

Quipsly has one active authentication owner:

- Firebase / Google Identity Platform proves identity.
- Quipsly Postgres owns users, roles, Nests, access grants, memberships, and product truth.
- Patreon is an entitlement/support signal only. It must never be primary identity truth.
- Auth.js / NextAuth is not the active login path.

The durable product rule is simple: a successful login must create a useful place to work. A new user should not land in a blank lockout state.

## Current implemented path

1. `/login` uses Firebase client auth for:
   - Google sign-in.
   - Admin-created email/password users.
2. The client sends a Firebase ID token to `/api/auth/session`.
3. The server verifies the ID token with Firebase Admin.
4. Quipsly links or creates the canonical `User` by `firebaseUid` and normalized email.
5. Quipsly grants free starter access and creates the user's Home Nest.
6. Quipsly sets a secure HttpOnly `session` cookie from a Firebase session cookie.
7. Existing server code imports `auth()` from `@/auth`; that function now returns the Firebase-backed Quipsly session.

The old `/api/auth/[...nextauth]` route redirects to `/login`. It is present only as a compatibility catcher for stale bookmarks and links, not as an auth engine.

## Canonical boundaries

### Authentication

Firebase answers: "Can this browser, native app, or operator prove this identity?"

Supported now:

- Google provider.
- Email/password provider for admin-created accounts and durable test/operator identities.

Supported later:

- Apple provider for native apps.
- Password reset.
- MFA for admin/operator accounts.

### Authorization

Quipsly Postgres answers: "What can this person do?"

Canonical records:

- `User`
- `UserEmail`
- `UserRole`
- `StudioProjectAccessGrant`
- `StudioNestInvite`
- `Membership`

### Entitlement

Patreon and other billing/support providers feed reconciliation, not live login truth.

Expected flow:

- Provider webhook/event lands in app-owned provider event tables.
- Reconciliation proposes/apply membership changes.
- App-owned `Membership` rows decide entitlement.

## First-login provisioning

On successful Firebase session exchange, Quipsly must:

1. Create or link `User`.
2. Link `firebaseUid`.
3. Keep normalized email canonical.
4. Grant/ensure the `quipsly-free` membership plan.
5. Create or ensure the user's Home Nest.
6. Create or ensure the starter Home Vault document and Inbox media bin.
7. Create or ensure owner access for the Home Nest.
8. Return the user to `/projects`.

This avoids the old trap where login succeeded but the app had no useful place to put the human.

## Admin-created users

The admin users console can:

- Create/update the app-owned Quipsly user.
- Optionally create/update a Firebase email/password login identity.
- Grant access to a Nest before the user has ever signed in.
- Show whether a user is already linked to Firebase.

Important:

- Passwords entered in the admin console are never displayed back.
- Email/password is for controlled use cases such as test/operator accounts, collaborators, and recovery. Google sign-in remains the normal public front door.
- A pre-created Quipsly user without a Firebase UID is not broken. It simply has not signed in yet.

## Invited-user invariant

An invited user must be able to sign in later and attach to their pre-granted work.

Flow:

1. Admin enters email and grants Nest role.
2. Quipsly creates or updates `User`.
3. Quipsly creates `StudioProjectAccessGrant` and invite ledger state.
4. User signs in by Google or email/password.
5. Firebase UID links to the existing user by normalized email.
6. `/projects` shows assigned Nests immediately.

## Native / Mac direction

Native apps should use Firebase-backed identity:

- Prefer native Firebase/Google/Apple auth where practical.
- Send Firebase ID tokens to Quipsly APIs as bearer tokens, or exchange for a Quipsly native device session.
- Do not use copied browser cookies.
- Manual copy-token handoff is a recovery fallback, not the product path.

## Local validation checklist

Before deployment:

1. Start local Quipsly app.
2. Ensure local Postgres is reachable.
3. Sign in with the Codex test account through Firebase email/password.
4. POST Firebase ID token to `/api/auth/session`.
5. Confirm response sets `session` cookie.
6. Confirm `/projects` renders without login gate.
7. Confirm Home Nest exists.
8. Confirm `/nests/<home-nest-slug>` renders.
9. Confirm `/create?project=<home-nest-slug>` renders.
10. Confirm `/admin/users` renders for configured admin/local owner override.
11. Confirm sign-out deletes the session cookie.

## Deployment requirements

Cloud Run currently runs in the `high-ground-odyssey` Google Cloud project while Firebase identity is in `quipsly-reef`. Production session exchange will only work if one of these is true:

1. Cloud Run uses explicit Firebase Admin credentials for `quipsly-reef` via `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` secrets.
2. The Cloud Run runtime service account is granted sufficient Firebase Auth/Admin permissions in `quipsly-reef`.

Required public runtime env:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=quipsly-reef.firebaseapp.com`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=quipsly-reef`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Required server/runtime credential path:

- either explicit `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` secrets,
- or verified cross-project Application Default Credentials access.

## Forbidden regressions

- Do not reintroduce Auth.js as a primary login path.
- Do not make Patreon a login gate.
- Do not rely on Google OAuth callback routes for app identity.
- Do not create a user without giving them a Home Nest.
- Do not claim login is fixed until deployed `nest.quipsly.com` proves session exchange, `/projects`, Home Nest, admin users, and sign-out.

## Current proof

Local proof completed on 2026-06-28:

- Firebase email/password accepted the Codex test identity.
- `/api/auth/session` returned `200`.
- Response set a session cookie.
- User linked as `codex@dev.test`.
- Home Nest created as `home-codex-at-dev-test`.
- Authenticated requests opened `/projects`, `/nests/home-codex-at-dev-test`, `/create?project=home-codex-at-dev-test`, `/account/switch`, and `/admin/users` in local owner-override mode.

Production proof is still required after deploy.
