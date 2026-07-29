# Quipsly auth completion matrix

Last updated: 2026-06-29

## Verdict

Firebase-first Quipsly auth is production-usable and smoke-proven for the core beta workflows.

Do not reintroduce Auth.js as a required login provider. `@/auth` is now a Quipsly session helper backed by Firebase session cookies and app-owned Postgres identity.

## Evidence matrix

| Requirement | Current status | Evidence |
| --- | --- | --- |
| Email is durable identity key | Green | Generated self-serve, invited-user, admin, and native smokes all create/link by normalized email and clean up by generated email. |
| Firebase proves sign-in | Green | `/api/auth/session` verifies Firebase ID tokens; live generated smokes use Firebase login/session creation. |
| Quipsly/Postgres owns app account truth | Green | User, Home Nest, free membership, grants, and roles are verified through DB-backed smokes and `quipsly-identity-integrity-audit.mjs`. |
| Google login accepted | Green | `quipsly-auth-readiness.mjs --google-oauth-browser-smoke` reports `google-provider-accepted`. |
| New user gets free tier and Home Nest | Green | `quipsly-live-self-serve-account-smoke.sh` proves `freeTierStatus: ACTIVE` and Home Nest route access. |
| Invited user flow | Green | `quipsly-live-invited-user-smoke.sh` proves pre-grant, first sign-in link, invite acceptance, Home Nest, and assigned Nest visibility. |
| Admin user management | Green | `quipsly-live-admin-user-management-browser-smoke.sh` proves admin page load, generated user create/update, Nest grant, revoke, DB verification, and cleanup. |
| Safe account switching/profile vault | Green-local | `/account/switch` local route smoke proves Profile Vault surface. Deployed account switching is route-smoked and auth-safe; latest Profile Vault copy awaits next release if not deployed. |
| Agent/test-user access | Green | Generated self-serve, invited, admin, and native smoke scripts create temporary users, prove behavior, and clean up. |
| Native app/session flow | Green | `quipsly-live-native-account-app-smoke.sh` proves native saved session, verified state, free tier, Home Nest, visible project count, and cleanup. |
| Legacy Auth.js cannot hijack login | Green | `/api/auth/signin` and `/api/auth/callback/google` quarantine-redirect to `/login?callbackUrl=/projects`; `/api/auth/[...nextauth]` is documented as a trap route. |
| Firebase config does not leak secrets | Green | Readiness checks verify public config route; smokes suppress tokens, passwords, cookies, DB URLs, and private values. |
| Firebase Admin preflight | Green | Production readiness and local route-only readiness both pass Firebase Admin preflight. |
| Local auth route behavior | Green | `TARGET_URL=http://127.0.0.1:3025 bash scripts/dev/quipsly-local-smoke.sh` passes after dev server restart. |
| Deployed auth route behavior | Green | `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --google-oauth-browser-smoke` passes. |
| Production owner override disabled | Green | Cloud Run service `studio` has no `QUIPSLY_OWNER_OVERRIDE` env var; `ownerOverrideTrue: false`. |
| Auth hotfix deploy lane | Green | `scripts/release/quipsly-hotfix-deploy.sh` exists, blocks owner override, runs operator readiness before expensive work, deploys preview/no-traffic first, and supports generated smoke gates. |
| External publishing/account mutation avoided | Green | Auth smokes only mutate generated Firebase/app users and clean them up. No platform publishing actions are part of auth validation. |

## Current proof commands

Run from `/Users/wall-e/Dev/high-ground-studio`.

```bash
corepack pnpm --filter quipsly typecheck
TARGET_URL=http://127.0.0.1:3025 bash scripts/dev/quipsly-local-smoke.sh
QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-auth-readiness.mjs --route-only
QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --google-oauth-browser-smoke
scripts/quipsly-live-self-serve-account-smoke.sh
scripts/quipsly-live-invited-user-smoke.sh
scripts/quipsly-live-admin-user-management-browser-smoke.sh
scripts/quipsly-live-native-account-app-smoke.sh
node scripts/quipsly-clean-generated-smoke-artifacts.mjs
node scripts/quipsly-identity-integrity-audit.mjs
```

## Remaining non-blocking follow-ups

- Commit and release the local Profile Vault/admin-flight-deck copy improvements.
- Continue reducing old Auth.js naming once the compatibility trap has served its purpose.
- Keep `web` service auth/domain scripts separate from the Nest Firebase-first auth lane unless HighGroundOdyssey.com auth is intentionally migrated.
- Keep generated smoke cleanup in the deploy runbook so temporary test users do not become mystery ghosts.
