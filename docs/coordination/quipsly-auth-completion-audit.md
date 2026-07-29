# Quipsly Auth Completion Audit

Last updated: 2026-06-29

Purpose: prevent another "login feels fixed" false finish. This file turns the active auth goal into concrete proof requirements.

## Completion rule

Do not call Quipsly auth complete until every required proof below is green against current code and current deployed state.

Green means current evidence from a command, route, browser smoke, app smoke, or production artifact. Intent, old sprint memory, docs-only status, and "probably works" do not count.

## Current blocker summary

The Firebase-first auth hotfix is now deployed live and smoke-proven for route contracts, generated invited users, generated self-serve signup, generated app-owned admin access, Google-provider redirect acceptance, and generated native-app saved-session flow.

Current live proof:

- `https://nest.quipsly.com` serves Cloud Run revision `studio-00338-xef` at 100% traffic.
- Image tag: `firebase-admin-role-20260629-115714`.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --route-only`: pass.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --google-oauth-browser-smoke`: pass.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --route-only --google-oauth-browser-smoke`: pass.
- `QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-auth-readiness.mjs --route-only`: pass for local route contracts. Local `/account/switch` reports `local-owner-override`, and local Firebase Admin preflight reports a structured local credential blocker; those are not production auth proof.
- Preview and live generated invited-user smoke: pass.
- Preview and live generated self-serve signup smoke: pass.
- Live generated self-serve + native bearer smoke: pass. A generated user created a Firebase identity, Quipsly session, free tier, Home Nest, `/projects`, `/create`, `/api/mac/session-check`, and `/api/mac/mobile-context`, then cleaned generated artifacts.
- Preview and live generated admin smoke: pass. Generated app-owned `OWNER` users reached `/admin/users:200` and were cleaned up afterward.
- Live admin user-management browser smoke: pass. A generated app-owned `OWNER` used `/admin/users` to create/update a generated Firebase-linked target user, grant `EDITOR` access to `marine-biology-research`, revoke that access, verify target free tier/Home Nest/final revoked grant, and clean all generated artifacts.
- Live native account app smoke: pass through `scripts/quipsly-live-native-account-app-smoke.sh`. A generated `codex-native-xxxxxxxx@dev.test` Firebase user signed into the rebuilt QuipslyStudio Account workbench, saved a native refresh session, verified through Nest, received free-tier/Home Nest truth, cleared the native saved session, and cleaned generated Firebase/Postgres artifacts.
- QuipslyStudio rebuilt and relaunched through `apps/QuipslyStudio/script/build_and_run.sh --verify` after adding agent `clear_email` support for generated native-smoke cleanup.
- `node scripts/quipsly-identity-integrity-audit.mjs`: pass with `0` hard issues and `0` warnings.
- `node scripts/quipsly-clean-generated-smoke-artifacts.mjs`: dry-run pass with `0` generated users and `0` generated Home Nests.
- Cloud Run env inspection: `QUIPSLY_OWNER_OVERRIDE` is not present.
- Human report: Charlie reached signed-in `https://nest.quipsly.com/projects` after the Google OAuth redirect fix. Codex-controlled browser tabs do not inherit that human session, so generated and route smokes remain the repeatable proof lane.

Current remaining follow-ups:

- Human-admin smoke is still useful: have Charlie open `/admin/users`, create or inspect a safe user, grant/revoke access, and confirm the UI feels manageable. Generated admin browser smoke already proves the mechanics.
- Keep `scripts/quipsly-live-native-account-app-smoke.sh` in the auth runbook and run it after native-account changes. It requires the QuipslyStudio AgentServer to be running.
- Commit/deploy decisions should be made separately from this proof: the live web auth route is green; the new native-smoke harness and QuipslyStudio `clear_email` cleanup are local source changes until committed and released through the appropriate lane.

## Required proof checklist

| Area | Required proof | Current evidence | Status |
| --- | --- | --- | --- |
| Operator readiness | `node scripts/quipsly-auth-readiness.mjs --operator-only` exits `0` | Passed after operator ran `gcloud auth login --project high-ground-odyssey` and `gcloud auth application-default login --project high-ground-odyssey` | Green |
| Local route contract | `QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-auth-readiness.mjs` shows app route checks pass | Local `/login`, `/projects` calm boundary, `/account/switch` calm boundary, `/api/auth/session`, legacy quarantine, Firebase client config, native session-check, and cleanup dry-run have passed; gcloud/ADC/Admin preflight still block full green | Partial |
| Scoped route-only proof | `QUIPSLY_AUTH_READINESS_BASE_URL=<origin> node scripts/quipsly-auth-readiness.mjs --route-only` proves public route contract without requiring gcloud/ADC | Passed against `https://nest.quipsly.com` after promotion. Checks `/login`, `/projects`, `/admin/users`, `/account/switch`, legacy quarantine, Firebase client config, Firebase Admin preflight, and native unauthenticated route shape. | Green-live |
| App-owned identity integrity | `node scripts/quipsly-identity-integrity-audit.mjs` exits `0`, and full readiness includes the same read-only audit unless explicitly skipped | Current operator DB audit passed with `0` hard issues and `0` warnings. Output is redacted by default and does not print secrets. | Green |
| Credentialed local session smoke | `STRICT_DB=1 TARGET_URL=http://127.0.0.1:3025 scripts/dev/quipsly-local-smoke.sh` or `QUIPSLY_AUTH_SMOKE_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-firebase-auth-smoke.mjs` proves Firebase login, session cookie creation, `/projects`, `/account/switch`, Home Nest, `/create`, native bearer-token session, admin route when expected, and logout cookie clearing | Script coverage exists. Local credentialed proof still depends on a running local app, local DB/Firebase Admin health, and safe smoke credentials. This does not block the current live email/password/generated-user proof. | Partial-local |
| Public login UI | `/login` shows Google sign-in, create account, password reset, and no retired Auth.js links | Live route smoke passed against `https://nest.quipsly.com/login?callbackUrl=%2Fprojects`. | Green-live |
| Signed-out calm routes | Signed-out `/projects`, `/account/switch`, and protected admin routes render a calm landing/sign-in path or canonical login redirect, not framework/database errors | Live route smoke passed for `/projects`, `/admin/users`, and `/account/switch`; signed-out traffic sees calm Nest/sign-in boundaries. | Green-live |
| Production owner override forbidden | Cloud Run must not run with `QUIPSLY_OWNER_OVERRIDE=true`, and hotfix deploy must refuse to set it | Hotfix deploy guard exists, and live Cloud Run env inspection confirmed `QUIPSLY_OWNER_OVERRIDE` is not present. | Green-live |
| Legacy Auth.js quarantine | `/api/auth/signin` and `/api/auth/callback/google` redirect to `/login?callbackUrl=/projects` | Local and production route checks pass | Green |
| Firebase Admin reachability | `/api/auth/firebase-admin-preflight` returns structured `200` healthy, or structured `503` only when documenting a credential blocker | Live readiness reports Firebase Admin credentials can reach Firebase. | Green-live |
| Email/password self-serve | Generated `codex-signup-xxxxxxxx@dev.test` user can create Firebase identity, create Quipsly session, get Home Nest/free tier, verify routes, and cleanup | Preview and live generated self-serve signup smokes passed and cleaned generated artifacts. `scripts/quipsly-live-self-serve-account-smoke.sh` also passed against live after checking native bearer context. | Green-live |
| Invited-user path | Generated invited `@dev.test` user can accept invite and see assigned Nest | Preview and live generated invited-user smokes passed into `marine-biology-research` and cleaned generated artifacts. | Green-live |
| Admin-created user path | Admin-created or admin-repaired email/password user can sign in and converge to one Quipsly user by email/Firebase UID | `scripts/quipsly-live-admin-user-management-browser-smoke.sh` passed against live. It created a generated target through `/admin/users` with Firebase password, Firebase UID, free tier, and Home Nest, then cleaned it. | Green-live-generated |
| Google-created user path | Real Google chooser signs in through Firebase and links/upserts the same Quipsly user by email | `node scripts/quipsly-google-oauth-browser-smoke.mjs` now classifies live Google as `google-provider-accepted`, and Charlie reported successful signed-in access to Nest. Codex-controlled tabs do not inherit Charlie's human browser session, so generated smokes remain the repeatable proof lane. | Green-human-reported |
| New user starter state | Brand-new valid user lands in `/projects` with free tier + Home Nest visible | Live generated self-serve signup smoke passed; generated user received free-tier onboarding and Home Nest. | Green-live |
| Account switching | Signed-in user can open `/account/switch` and see expected account/Nest context | Live generated invited-user and self-serve smokes checked `/account/switch:200`. | Green-live-generated |
| Admin users | Charlie/admin can create/update users, grant Nest access, and see pending/access state clearly | `scripts/quipsly-live-admin-user-management-browser-smoke.sh` passed against live using a generated app-owned `OWNER`; the browser flow created/updated a user, granted access, revoked access, verified DB truth, and cleaned generated artifacts. Human Charlie browser proof is still useful after Google OAuth is repaired. | Green-live-generated |
| Admin users local route | Local `/admin/users` renders the beta invite/user console before deploy | Local route smoke now checks `User + Invite Console` and invite copy; this is route-render proof only, not credentialed admin authorization proof | Green-local |
| Native Mac auth | Mac/native bearer-token or saved-session path verifies through `/api/mac/session-check` and surfaces starter account state | `scripts/quipsly-live-self-serve-account-smoke.sh` passed against live with generated Firebase credentials. `scripts/quipsly-live-native-account-app-smoke.sh` also passed against the rebuilt QuipslyStudio app: generated native Firebase sign-in, saved-session refresh, Nest verification, Home Nest/free-tier truth, local native-session clear, and generated artifact cleanup. | Green-live-generated-app |
| Production preview | Preview tagged Cloud Run revision passes route smoke and generated auth smoke before promotion | Preview revision passed route smoke, generated invited-user smoke, and generated self-serve signup smoke before promotion. | Green |
| Production live | `https://nest.quipsly.com` passes route smoke, generated self-serve/invite smoke, and browser-visible login after promotion | Full live readiness with Google OAuth browser smoke passed. Generated self-serve, invited-user, admin, native bearer, and native app smokes passed. Charlie reported successful signed-in access to Nest. | Green-live |
| Secret safety | Logs and reports do not print passwords, cookies, Firebase tokens, private keys, database URLs, or raw secrets | Readiness and generated smoke scripts are designed to redact/suppress; must be preserved in every smoke log | Ongoing |

## Future auth hotfix deploy/smoke sequence

Use this only when another auth hotfix needs to be built/deployed. It is not the current blocker after revision `studio-00338-xef`.

Before deploy:

```bash
node scripts/quipsly-auth-readiness.mjs --operator-only
```

If green, run a preview auth hotfix deploy:

```bash
IMAGE_TAG="firebase-auth-$(date +%Y%m%d-%H%M%S)" \
PREVIEW_TAG="quipsly-firebase-auth" \
SOURCE_SHA="firebase-auth-local" \
REGION=us-central1 \
PROJECT_ID=high-ground-odyssey \
RUN_TYPECHECK=1 \
RUN_LOCAL_SMOKE=1 \
LOCAL_TARGET_URL=http://127.0.0.1:3025 \
RUN_AUTH_SMOKE=auto \
RUN_GENERATED_INVITE_SMOKE=1 \
RUN_GENERATED_SELF_SERVE_SMOKE=1 \
QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=1 \
PROMOTE=0 \
bash scripts/release/quipsly-hotfix-deploy.sh
```

Promote only after preview route smoke and generated smoke pass.

## Repeatable live admin user-management proof

Run this when you need to prove the admin console can mutate real app-owned user/access state without using Charlie's account:

```bash
scripts/quipsly-live-admin-user-management-browser-smoke.sh
```

The script:

- Reads the production database URL from Secret Manager without printing it.
- Starts Cloud SQL Auth Proxy when the URL uses a Cloud SQL socket host.
- Creates generated `@dev.test` Firebase/Postgres users only.
- Drives the real `/admin/users` browser UI.
- Creates/updates a target user with Firebase password.
- Grants and revokes Nest access.
- Verifies Firebase UID, free tier, Home Nest, and final revoked grant.
- Deletes generated Firebase users, app users, Home Nests, memberships, grants, and invites.

## Repeatable live self-serve/native proof

Run this when you need to prove a brand-new user can create an account and use the native bearer-token API path without using Charlie's account:

```bash
scripts/quipsly-live-self-serve-account-smoke.sh
```

The script:

- Reads the production database URL from Secret Manager without printing it.
- Starts Cloud SQL Auth Proxy when the URL uses a Cloud SQL socket host.
- Creates only generated `codex-signup-xxxxxxxx@dev.test` Firebase users.
- Creates a Quipsly session, free-tier membership, and Home Nest through the live app.
- Checks signed-in `/projects`, Home Nest page, and `/create`.
- Checks `/api/mac/session-check` and `/api/mac/mobile-context` with a Firebase bearer token.
- Deletes generated Firebase user, app user, Home Nest, free membership, grants, and invites.

## Production promotion rule

Promote the exact preview tag that passed smoke. Do not rebuild between preview proof and production promotion unless there is a new defect fix and a new preview proof.

## Human/browser checks still required

Automated generated smoke is necessary but not enough. Before calling the goal complete, also verify:

- Real browser Google sign-in no longer hits `redirect_uri_mismatch`. Human-reported pass on 2026-06-29; repeat if auth changes.
- `node scripts/quipsly-google-oauth-browser-smoke.mjs` exits `0`, proving Google accepts Firebase's redirect handler.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --route-only --google-oauth-browser-smoke` exits `0`.
- Charlie can reach `/projects`. Human-reported pass on 2026-06-29; repeat if auth changes.
- Charlie can reach `/admin/users`.
- A safe invited test user can sign in and see the invited Nest.
- The Mac app native account flow can establish or verify a saved session without manual cookie copying. Generated app proof passed through `scripts/quipsly-live-native-account-app-smoke.sh`; repeat after native account changes.

## Repeatable live native app proof

Run this when you need to prove the native QuipslyStudio Account workbench can sign in and verify through Nest without using Charlie's account:

```bash
scripts/quipsly-live-native-account-app-smoke.sh
```

The script:

- Requires a running QuipslyStudio AgentServer at `http://127.0.0.1:8080` unless `QUIPSLY_AGENT_URL` overrides it.
- Reads the production database URL from Secret Manager without printing it.
- Starts Cloud SQL Auth Proxy when the URL uses a Cloud SQL socket host.
- Creates only generated `codex-native-xxxxxxxx@dev.test` Firebase users.
- Drives the native Account workbench through `/native_account`.
- Verifies generated Firebase email/password sign-in, Keychain/native saved-session refresh, `/api/mac/session-check`, free-tier truth, Home Nest truth, and visible project shape.
- Clears the native saved session and generated email from the rebuilt app.
- Deletes generated Firebase user, app user, Home Nest, free membership, grants, and invites.

## If something fails

Do not patch randomly. Classify the failing layer first:

1. Operator auth: gcloud/ADC cannot mint tokens.
2. Provider config: Google OAuth/Firebase handler is rejected.
3. Server credentials: Firebase Admin preflight fails.
4. App route contract: login/session/quarantine routes are wrong.
5. App database truth: user, alias, membership, grant, Home Nest, or invite state is wrong.
6. Native session: Mac app cannot exchange or verify a Firebase-backed session.
7. Deploy drift: production revision does not contain the local route contract.

Then fix that layer only.

## App-owned identity integrity audit

Run this before declaring Firebase auth safe:

```bash
node scripts/quipsly-identity-integrity-audit.mjs
```

The audit is read-only and redacts emails/user identifiers by default. It fails on identity conflicts that would make Firebase-first auth unsafe:

- Two `User.primaryEmail` values that normalize to the same email.
- The same alias email attached to different users.
- One email acting as a primary email for one user and an alias for another user.
- Duplicate non-null Firebase UIDs.
- Duplicate normalized access grants or live invites for the same Nest.
- Active Nest access grants whose email has no matching app-owned User primary email or alias.
- Live or accepted Nest invites that do not have the matching app user and active grant needed by the invite-first flow.
- Firebase-linked active users missing an active Quipsly Free membership.
- Firebase-linked active users missing the expected private Home Nest or matching active OWNER grant.

Use `--show-emails` only for local operator debugging. Do not paste that output into public logs.

## 2026-06-29 admin operability hardening

Added an Auth flight deck to `/admin/users` so the admin console now shows the current Quipsly admin actor, links the account switcher, links auth diagnostics, and explains the durable split: Firebase proves sign-in while Quipsly/Postgres owns users, roles, Home Nests, grants, memberships, and app data.

Validation run after the patch:

- `node scripts/quipsly-identity-integrity-audit.mjs` -> pass, `hardIssues: 0`, `warnings: 0`.
- `corepack pnpm --filter quipsly typecheck` -> pass.

Current status: live browser login is human-confirmed by Charlie, generated/native smoke paths are available for repeatable agent proof, and the remaining product hardening is admin workflow smoke plus release/commit hygiene for the local source changes.

## 2026-06-29 profile vault hardening

Updated `/account/switch` from a narrow account switcher into a safer Profile Vault surface. It still does not store passwords and does not impersonate users. It explains the three intended testing/operator lanes:

- Charlie/admin: manage users, repair starter state, verify Nests, inspect auth health.
- Invited collaborator: prove pre-granted email access lands on `/projects` with the assigned Nest visible.
- Generated smoke user: Codex-safe temporary Firebase/app users created by scripts and auto-cleaned after proof.

It also links `/admin/users` and `/admin/auth-diagnostics` so account switching, user management, and diagnostics are one visible operator loop.

Validation run after the patch:

- `corepack pnpm --filter quipsly typecheck` -> pass.
- `node scripts/quipsly-identity-integrity-audit.mjs` -> pass, `hardIssues: 0`, `warnings: 0`.

## 2026-06-29 consolidated runbook and profile validation

Created `docs/coordination/quipsly-firebase-auth-runbook.md` as the current operator source of truth for the Firebase-first architecture, golden flows, safety invariants, validation commands, deploy checks, and troubleshooting map.

Validation run after adding the runbook and Profile Vault UI:

- `corepack pnpm --filter quipsly typecheck` -> pass.
- `node scripts/quipsly-identity-integrity-audit.mjs` -> pass, `hardIssues: 0`, `warnings: 0`.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs` -> pass. Legacy Auth.js signin/callback traps remain quarantined, Firebase Admin preflight passes, signed-out route boundaries are calm, and generated smoke cleanup dry-run reports zero candidates.

Note: the production readiness command above did not launch the optional Google OAuth browser smoke; earlier proof with `--google-oauth-browser-smoke` showed Google provider acceptance after the Console fix.

## 2026-06-29 live admin user-management browser smoke

Ran the live generated admin user-management browser smoke against `https://nest.quipsly.com`:

- `scripts/quipsly-live-admin-user-management-browser-smoke.sh` -> pass.

What it proved without printing secrets/tokens/passwords/cookies/database URLs:

- Generated temporary Firebase/app admin could create a real Quipsly session.
- `/admin/users` loaded as an admin surface.
- Admin UI created/updated a generated managed user.
- Admin UI granted `marine-biology-research` access to the generated managed user as `EDITOR`.
- Admin UI revoked that generated access.
- DB verification showed the generated managed user was Firebase-linked, had free tier, had a Home Nest, and ended with the Marine Biology grant in `REVOKED` state.
- Cleanup removed generated invites, grants, Home Nests, memberships, users, and Firebase users.

Follow-up validation:

- `node scripts/quipsly-clean-generated-smoke-artifacts.mjs` -> dry-run pass with zero generated smoke leftovers.
- `node scripts/quipsly-identity-integrity-audit.mjs` -> pass, `hardIssues: 0`, `warnings: 0`.

This is current proof that the deployed admin user-management path can create/update users, grant/revoke Nest access, preserve starter state, and clean up generated test users without DB spelunking.

## 2026-06-29 legacy auth drift cleanup

Audited the remaining legacy Auth.js surface. Current source confirms `@/auth` is now a Firebase-first Quipsly session helper: `auth()` delegates to `getQuipslySession()`, while `signIn()` routes to `/login`. The remaining `/api/auth/[...nextauth]` catch-all is a quarantine trap, not an auth provider.

Cleanup changes:

- Added an explicit source comment to `/api/auth/[...nextauth]/route.ts` explaining that the catch-all exists only as a legacy trap for stale Auth.js links and callbacks.
- Updated `scripts/dev/quipsly-local-smoke.sh` to expect the new `/account/switch` Profile Vault copy.
- Updated a stale test comment in `scripts/access-control.test.mjs` from NextAuth wording to Firebase-backed Quipsly session wording.

Validation run after cleanup:

- `corepack pnpm --filter quipsly typecheck` -> pass.
- `bash -n scripts/dev/quipsly-local-smoke.sh scripts/release/quipsly-hotfix-deploy.sh scripts/release/quipsly-deploy-preview.sh` -> pass.
- `node scripts/quipsly-identity-integrity-audit.mjs` -> pass, `hardIssues: 0`, `warnings: 0`.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --google-oauth-browser-smoke` -> pass, including `google-provider-accepted`.

Current interpretation: legacy Auth.js entrypoints remain intentionally quarantined and are covered by route smoke. They are not required for Quipsly login.

## 2026-06-29 local route smoke after Profile Vault update

Attempted local smoke on `127.0.0.1:3012`; no server was listening. Next reported an existing Quipsly dev server on `3025`, so the smoke was rerun against the actual local process.

- `TARGET_URL=http://127.0.0.1:3025 bash scripts/dev/quipsly-local-smoke.sh` -> pass.

Evidence:

- `/login` includes Google sign-in, create account, and password reset.
- Invite-mode login copy is present and states the link does not grant access by itself.
- `/projects` local signed-out/owner-override route contract is healthy.
- `/account/switch` now includes `Quipsly profile vault` and `No current session`.
- `/admin/users` loads the local admin console copy.
- `/api/health` and `/api/healthz` return `ok:true`.
- `/api/auth/session` returns `401` when unauthenticated.
- `/api/auth/signin` and `/api/auth/callback/google` both quarantine-redirect to `/login?callbackUrl=/projects`.
- Structured public auth boundary smoke passed. Firebase Admin preflight is still reported as a structured local credential blocker in that public-boundary subcheck, so local route behavior is proven but local Firebase Admin parity remains a follow-up.

## 2026-06-29 local Firebase Admin parity restored

After the Profile Vault smoke update, local smoke initially reported a structured Firebase Admin credential blocker from the already-running Next dev process on `3025`. Terminal-level ADC and gcloud user auth were available, and a standalone Node Firebase Admin preflight against `quipsly-reef` succeeded. The local dev server was stale, so it was restarted on `3025`.

Validation after restart:

- `TARGET_URL=http://127.0.0.1:3025 bash scripts/dev/quipsly-local-smoke.sh` -> pass.
- `curl http://127.0.0.1:3025/api/auth/firebase-admin-preflight` -> pass, `firebaseAdminReachable: true`, `proof: expected-user-not-found`.
- `QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-auth-readiness.mjs --route-only` -> pass, including Firebase Admin preflight.

Interpretation: local route contracts and local Firebase Admin preflight are both currently green. If this regresses while terminal ADC still works, restart the Next dev server before changing auth code.

## 2026-06-29 refreshed generated live acceptance smokes

Ran the two core generated live acceptance smokes against `https://nest.quipsly.com`:

- `scripts/quipsly-live-self-serve-account-smoke.sh` -> pass.
- `scripts/quipsly-live-invited-user-smoke.sh` -> pass.

Self-serve proof:

- Generated Firebase/app user could sign in.
- Quipsly created a Home Nest.
- Free tier status was `ACTIVE`.
- Native session check passed.
- Mobile native context passed.
- `/api/auth/session`, `/projects`, Home Nest route, and `/create?project=<home-nest>` returned expected authenticated behavior.
- Generated Firebase/app artifacts were cleaned up.

Invited-user proof:

- Generated invited email received `marine-biology-research` access before sign-in.
- First Firebase sign-in linked the app user.
- Invite acceptance passed.
- Free tier onboarding was `ACTIVE`.
- Home Nest was created.
- Assigned Nest was visible through the authenticated session path.
- Logout cleared session cookie.
- Generated Firebase/app artifacts were cleaned up.

Follow-up validation:

- `node scripts/quipsly-clean-generated-smoke-artifacts.mjs` -> dry-run pass with zero generated smoke leftovers.
- `node scripts/quipsly-identity-integrity-audit.mjs` -> pass, `hardIssues: 0`, `warnings: 0`.

## 2026-06-29 refreshed native app and production override proof

Ran the live generated native account app smoke:

- `scripts/quipsly-live-native-account-app-smoke.sh` -> pass.

Proof:

- Generated native app user authenticated against `https://nest.quipsly.com`.
- Native app credentialed smoke reported saved session, verified session, `freeTierStatus: ACTIVE`, Home Nest present, visible project count, and session cleared after smoke.
- Generated Firebase/app/native artifacts were cleaned up.

Follow-up cleanup:

- `node scripts/quipsly-clean-generated-smoke-artifacts.mjs` -> dry-run pass with zero generated smoke leftovers.
- `node scripts/quipsly-identity-integrity-audit.mjs` -> pass, `hardIssues: 0`, `warnings: 0`.

Production owner override check:

- `gcloud run services describe studio --project=high-ground-odyssey --region=us-central1 --format=json` showed `QUIPSLY_OWNER_OVERRIDE` absent from the deployed service environment.
- 100% production traffic is on revision tag `quipsly-firebase-auth`.

Interpretation: native session flow is currently smoke-proven, and production is not relying on owner override.
