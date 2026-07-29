# Quipsly Firebase-first auth runbook

Last updated: 2026-06-29

## Current architecture

Firebase Auth proves sign-in. Quipsly/Postgres owns the product account.

The durable identity key is normalized email. Firebase UID is a linked proof, not the source of app truth.

Quipsly-owned state includes:

- `User` and email aliases.
- app roles such as `OWNER`.
- Home Nest creation.
- free starter membership.
- Nest/project access grants.
- invite ledger records.
- Patreon/support entitlement inputs.
- publishing receipts and creative work.

Do not reintroduce legacy Auth.js as a required login path. If a legacy route remains, it must be harmless, quarantined, or compatibility-only.

## Operator surfaces

- `/login`: normal Firebase/Google sign-in and email/password sign-in.
- `/projects`: post-login landing page. A new user should see their Home Nest.
- `/admin/users`: Charlie/admin user, invite, grant, revoke, repair, and auth flight deck.
- `/account/switch`: Profile Vault for real account switching. This does not store passwords and does not impersonate.
- `/admin/auth-diagnostics`: redacted Firebase/Admin/session diagnostic surface.

## Golden flows

### New Google user

1. User opens `/login`.
2. Firebase proves the Google account.
3. Quipsly creates or links `User` by normalized email.
4. Quipsly links Firebase UID when available.
5. Quipsly creates free starter state.
6. Quipsly creates or verifies Home Nest.
7. User lands on `/projects`.

### Invited collaborator

1. Admin grants Nest access to normalized email in `/admin/users` or `/nests/[slug]/access`.
2. Quipsly creates the app-owned `User` if missing.
3. Quipsly creates a `StudioProjectAccessGrant`.
4. Optional invite link carries context, not authority.
5. User signs in with Firebase using the invited email.
6. Quipsly links the session to the app-owned user.
7. User lands on `/projects` with the assigned Nest visible.

### Codex/generated smoke user

1. Script creates a generated Firebase test user and app user.
2. Script verifies login/session/native route behavior.
3. Script verifies Home Nest/free tier/access shape.
4. Script clears native/browser test session where applicable.
5. Script deletes generated Firebase/app artifacts.

Generated smoke users should be temporary and recognizable. Do not use human collaborator accounts for automated destructive smoke cleanup.

## Required safety invariants

- Never print secrets, tokens, cookies, passwords, raw session values, or database URLs.
- Never use `QUIPSLY_OWNER_OVERRIDE=true` in production.
- Never make Patreon the identity source of truth.
- Never treat an invite link as authority by itself. Firebase must prove the email.
- Never mutate publishing accounts as part of auth testing.
- Never claim external publication without a platform receipt or URL.

## Validation commands

Run from `/Users/wall-e/Dev/high-ground-studio`.

```bash
corepack pnpm --filter quipsly typecheck
node scripts/quipsly-identity-integrity-audit.mjs
node scripts/quipsly-clean-generated-smoke-artifacts.mjs
QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --google-oauth-browser-smoke
```

For local route contracts:

```bash
QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-auth-readiness.mjs --route-only
TARGET_URL=http://127.0.0.1:3025 bash scripts/dev/quipsly-local-smoke.sh
```

The Quipsly dev server may already be running on `3025`. If `3012` refuses the connection, check the active Next.js dev server message before diagnosing auth.

For native app account smoke:

```bash
scripts/quipsly-live-native-account-app-smoke.sh
```

For deployed admin user-management proof:

```bash
scripts/quipsly-live-admin-user-management-browser-smoke.sh
```

That script uses generated `@dev.test` Firebase/app users, proves `/admin/users` can create/update a managed user, grant Nest access, revoke that access, verify Home Nest/free tier/grant state, and clean up generated artifacts. It must not print generated passwords, Firebase tokens, session cookies, or database URLs.

## Deployment checks

Before a production auth deploy:

1. Typecheck passes.
2. Identity audit passes.
3. Generated cleanup dry run is clean or understood.
4. Firebase client config endpoint is redacted and healthy.
5. Firebase Admin preflight returns structured safe JSON.
6. Legacy auth traps are harmless.
7. Production Cloud Run does not have owner override enabled.
8. `/login`, `/projects`, `/admin/users`, `/account/switch`, and `/admin/auth-diagnostics` load with expected auth boundaries.
9. Generated admin user-management browser smoke passes, or the reason it is skipped is explicitly recorded.

## Troubleshooting map

### Google says redirect URI mismatch

Fix the Google OAuth/Firebase provider console configuration. Do not patch around this in app code unless the app is genuinely sending the wrong redirect URI.

Check:

- Firebase project ownership/account.
- Google OAuth web client.
- Authorized redirect URI for the Firebase handler.
- Current app origin.

### `/projects` works but admin users does not

Check:

- signed-in email normalization.
- `QUIPSLY_ADMIN_EMAILS`.
- app `UserRole` includes `OWNER` if needed.
- `/admin/auth-diagnostics`.

### Invited user cannot see Nest

Check:

- normalized invited email matches Firebase email.
- `StudioProjectAccessGrant` is active.
- project slug is correct.
- app user was created/linked.
- user signed in with the invited email, not a different Google account.

### Native app says session missing

Check:

- app is using the native account flow, not the old embedded OAuth dance.
- saved session exists and verifies.
- `/api/mac/session-check` is reachable.
- generated native app smoke passes.

### Local Firebase Admin preflight returns 503 but terminal ADC works

Check terminal credentials first:

```bash
gcloud auth application-default print-access-token >/dev/null
gcloud auth print-access-token >/dev/null
```

If those pass, run a standalone Firebase Admin preflight from the repo shell. If that succeeds but `http://127.0.0.1:3025/api/auth/firebase-admin-preflight` still returns `Firebase Admin credential unavailable`, restart the Next dev server. A long-running dev process can hold stale credential state after ADC repair.

## Known remaining hardening

- Keep reducing legacy Auth.js surface area until it is plainly compatibility-only or gone.
- Keep auth hotfix deploys separate from giant unrelated Studio release builds.
- Keep local Firebase Admin setup aligned with production so local and deployed proof tiers stay comparable.
- Keep admin UX focused on account truth: who is signed in, what user exists, what access is granted, and what safe action comes next.
