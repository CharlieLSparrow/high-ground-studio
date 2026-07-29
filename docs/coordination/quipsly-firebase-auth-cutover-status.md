# Quipsly Firebase Auth Cutover Status

Updated: 2026-06-29 after Firebase admin-role hotfix promotion, Google OAuth repair proof, generated native app proof, and cleanup sweep

## 2026-06-29 current top-line status

Nest auth is no longer blocked on Google OAuth redirect configuration.

Current proof:

- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --google-oauth-browser-smoke`: pass.
- `node scripts/quipsly-identity-integrity-audit.mjs`: pass with `0` hard issues and `0` warnings.
- `node scripts/quipsly-clean-generated-smoke-artifacts.mjs`: dry-run pass with `0` generated users and `0` generated Home Nests.
- `scripts/quipsly-live-native-account-app-smoke.sh`: pass. A generated native test user signed into the rebuilt QuipslyStudio Account workbench, saved a native refresh session, verified with Nest, received free-tier/Home Nest truth, cleared local native state, and cleaned generated Firebase/Postgres artifacts.
- `apps/QuipslyStudio/script/build_and_run.sh --verify`: pass after adding `clear_email` support to the native account agent command.
- Human report: Charlie reached signed-in `https://nest.quipsly.com/projects`.

Current caveat:

- Codex-controlled browser tabs do not inherit Charlie's personal Chrome session. Use generated auth smokes as repeatable proof, and use Charlie's browser only for human usability checks.
- The sections below are chronological history. Some older entries intentionally preserve the blocker text that was true at that moment; use this top-line status and `docs/coordination/quipsly-auth-completion-audit.md` for current truth.

## 2026-06-29 production Firebase admin-role promotion proof

Current live revision:

- Cloud Run service: `studio`
- Production URL: `https://nest.quipsly.com`
- Revision receiving 100% traffic: `studio-00338-xef`
- Preview/live tag: `quipsly-firebase-auth`
- Image tag: `firebase-admin-role-20260629-115714`
- Image URI: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:firebase-admin-role-20260629-115714`

Proof passed before and after promotion:

- Operator readiness: `node scripts/quipsly-auth-readiness.mjs --operator-only` passed.
- Preview route smoke passed against `https://quipsly-firebase-auth---studio-hm2odnvjga-uc.a.run.app`.
- Preview generated invited-user smoke passed into `marine-biology-research`.
- Preview generated self-serve signup smoke passed with free-tier onboarding and Home Nest creation.
- Preview generated admin smoke passed; a generated app-owned `OWNER` user reached `/admin/users:200`.
- Live route smoke passed against `https://nest.quipsly.com`.
- Live generated invited-user smoke passed into `marine-biology-research`.
- Live generated self-serve signup smoke passed with free-tier onboarding and Home Nest creation.
- Live generated admin smoke passed; a generated app-owned `OWNER` user reached `/admin/users:200`.
- Generated smoke cleanup removed generated Firebase users, Quipsly users, Home Nests, grants, invites, and memberships after successful runs.
- Live generated self-serve/native bearer smoke passed through `scripts/quipsly-live-self-serve-account-smoke.sh`. It verified generated Firebase account creation, Quipsly session creation, free-tier onboarding, Home Nest, `/projects`, `/create`, `/api/mac/session-check`, `/api/mac/mobile-context`, and cleanup.

Fresh Google OAuth retest after operator gcloud work:

- A clean browser automation pass from `https://nest.quipsly.com/login?callbackUrl=/projects` still reaches Google's `redirect_uri_mismatch` page after the operator gcloud commands.
- The failing redirect URI is still:

```text
https://quipsly-reef.firebaseapp.com/__/auth/handler
```

This means the deployed Quipsly app, Firebase Admin runtime, Postgres identity flow, invite flow, self-serve email/password flow, free-tier onboarding, Home Nest creation, and admin-role authorization are working. The remaining Google sign-in blocker is still the Google Auth Platform OAuth client redirect allowlist.

## 2026-06-29 production Firebase auth cleanup-smoke promotion proof

Current live revision:

- Cloud Run service: `studio`
- Production URL: `https://nest.quipsly.com`
- Revision receiving 100% traffic: `studio-00335-jeg`
- Preview/live tag: `quipsly-firebase-auth`
- Image tag: `firebase-auth-20260629-110035`
- Image URI: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:firebase-auth-20260629-110035`

Proof passed before and after promotion:

- Operator readiness: `node scripts/quipsly-auth-readiness.mjs --operator-only` passed after `gcloud auth login --project high-ground-odyssey` and `gcloud auth application-default login --project high-ground-odyssey`.
- Preview route smoke passed against `https://quipsly-firebase-auth---studio-hm2odnvjga-uc.a.run.app`.
- Preview generated invited-user smoke passed into `marine-biology-research`.
- Preview generated self-serve signup smoke passed with free-tier onboarding and Home Nest creation.
- Live route smoke passed against `https://nest.quipsly.com`.
- Live generated invited-user smoke passed into `marine-biology-research`.
- Live generated self-serve signup smoke passed with free-tier onboarding and Home Nest creation.
- Generated smoke cleanup removed generated Firebase users, Quipsly users, Home Nests, grants, invites, and memberships after successful runs.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --route-only` passed.
- `node scripts/quipsly-firebase-auth-config-check.mjs` passed for Firebase authorized domains and enabled Google provider.
- `node scripts/quipsly-identity-integrity-audit.mjs` passed with `0` hard issues and `0` warnings.
- Cloud Run env inspection confirmed `QUIPSLY_OWNER_OVERRIDE` is not present on the live service.

Current remaining blocker:

- Chrome-visible Google login still reaches Google's `redirect_uri_mismatch` page.
- The app is correctly using Firebase's handler URI:

```text
https://quipsly-reef.firebaseapp.com/__/auth/handler
```

- The remaining fix is in Google Auth Platform / OAuth client configuration, not Quipsly app code or Firebase Admin runtime.
- Opened handoff target in Chrome:

```text
https://console.cloud.google.com/auth/clients/659427658635-h633re67ab05kmgnpkcnq5rdhhb4umqn.apps.googleusercontent.com?project=high-ground-odyssey&authuser=charlie%40highgroundodyssey.com
```

Add the Firebase handler URI above to the OAuth client's Authorized redirect URIs, save, then retest `https://nest.quipsly.com/login?callbackUrl=/projects` with `Sign in with Google`.

Important boundary:

- Email/password self-serve and invited-user login are live and smoke-proven.
- Google login is still blocked by the manual OAuth redirect list until the console client is fixed.
- Do not reintroduce NextAuth or `/api/auth/callback/google` as an active sign-in path; those routes are intentionally quarantined to the Firebase-first `/login` door.

## 2026-06-29 public login free-account creation hardening

Current local login update:

- `/login` now treats email/password as a first-class public auth path, not only an admin-created account hatch.
- The login card has explicit modes:
  - Sign in.
  - Create account.
  - Password reset.
- Create-account mode uses Firebase client email/password creation, then posts the Firebase ID token to the existing Quipsly `/api/auth/session` endpoint.
- Because `/api/auth/session` already runs the Quipsly identity and starter-onboarding path, new email/password users converge into:
  - app-owned `User`
  - `firebaseUid` link
  - free-tier `Membership`
  - private Home Nest
  - normal `/projects` landing
- Login error copy now maps common Firebase failures to calmer, actionable messages, including the Google OAuth redirect misconfiguration case.

Important boundary:

- This does not replace the required Google OAuth console fix.
- It does remove Google as the only self-serve front door while that external console fix is pending.
- This path still depends on Firebase Email/Password provider being enabled in the active Firebase project.
- Added `scripts/quipsly-generated-self-serve-account-smoke.mjs` to prove generated email/password account creation, Quipsly session creation, Home Nest/free-tier onboarding, signed-in routes, native bearer-token session check, and cleanup.
- Local script validation passed:
  - `node --check scripts/quipsly-generated-self-serve-account-smoke.mjs`
  - `corepack pnpm --filter quipsly exec tsc --noEmit --incremental false`
  - `TARGET_URL=http://127.0.0.1:3025 scripts/dev/quipsly-local-smoke.sh`
  - `QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-public-auth-boundary-smoke.mjs`
- Added `/api/auth/firebase-admin-preflight` as a sanitized Firebase Admin health check. It performs a harmless Admin SDK lookup for a known-nonexistent user and returns either:
  - `200` with `firebaseAdminReachable: true` when Firebase Admin credentials can reach Firebase.
  - `503` with `Firebase Admin credential unavailable` when ADC/server credentials are stale.
- Credentialed self-serve smoke now checks `/api/auth/firebase-admin-preflight` before creating any generated Firebase user.
- The local blocker is ADC/Firebase Admin reauth state (`invalid_rapt`), not the `/login` UI, TypeScript compile, or generated-signup script.
- The self-serve smoke cleanup path now falls back to Firebase REST account deletion when Firebase Admin credentials are stale, so future generated signup runs can clean their own Firebase users without printing tokens or passwords.
- `scripts/quipsly-clean-generated-smoke-artifacts.mjs` now includes both `codex-invite-xxxxxxxx@dev.test` and `codex-signup-xxxxxxxx@dev.test` generated identities.
- `scripts/release/quipsly-hotfix-deploy.sh` now supports `RUN_GENERATED_SELF_SERVE_SMOKE=1` for local, preview, and live hotfix validation. Remote self-serve smoke uses the deployed database secret and Cloud SQL Auth Proxy pattern so cleanup is aimed at Cloud Run's real database instead of a stale local `.env`.
- Release/cleanup validation passed:
  - `bash -n scripts/release/quipsly-hotfix-deploy.sh`
  - `bash -n scripts/dev/quipsly-local-smoke.sh`
  - `node --check scripts/quipsly-generated-self-serve-account-smoke.mjs`
  - `node --check scripts/quipsly-clean-generated-smoke-artifacts.mjs`
  - `node --check scripts/quipsly-public-auth-boundary-smoke.mjs`
  - `TARGET_URL=http://127.0.0.1:3025 scripts/dev/quipsly-local-smoke.sh`
- `corepack pnpm --filter quipsly exec tsc --noEmit --incremental false`: pass.
- Local `/api/auth/firebase-admin-preflight` currently returns `503` with `Firebase Admin credential unavailable`, as expected while ADC is stale.
- Generated self-serve smoke now correctly reports the local Firebase Admin preflight blocker before signup: `Server Firebase Admin preflight failed before signup. Refresh ADC or provide server Firebase Admin credentials before creating generated users.`
- Local route/public auth smoke now requires `/api/auth/firebase-admin-preflight` to return structured JSON. Local stale ADC passes as a known `blocked-by-server-credentials` state instead of a route/middleware failure.
- `/admin/auth-diagnostics` now includes a "Firebase Admin live proof" section that makes the same harmless Admin SDK sentinel-user lookup as the preflight route. This separates "env vars look configured" from "the server can actually reach Firebase."
- `/admin/auth-diagnostics` safe smoke commands now include:
  - `curl -i <origin>/api/auth/firebase-admin-preflight`
  - `node scripts/quipsly-generated-self-serve-account-smoke.mjs`
- Hotfix deploy lane now sets `CLOUDSDK_CORE_DISABLE_PROMPTS=1`, runs a noninteractive `gcloud auth print-access-token` preflight before typecheck/build/deploy, and adds `--quiet` to Cloud Build submit.
- Added `scripts/quipsly-auth-readiness.mjs` as the consolidated operator preflight for auth work. It checks noninteractive gcloud user auth, Application Default Credentials, Firebase-first public route contracts, Firebase Admin preflight status, native session route shape, and generated-smoke cleanup dry-run readiness without printing tokens, cookies, passwords, database URLs, or secret values. The script also supports `--operator-only` for the narrow post-reauth check that skips app-route and cleanup layers.
- `scripts/quipsly-auth-readiness.mjs` also supports `--route-only` for scoped public route contract proof without gcloud/ADC. In route-only mode, a structured Firebase Admin `503` counts as sanitized route-shape proof, not as credential health or auth completion.
- `scripts/release/quipsly-hotfix-deploy.sh` now calls `scripts/quipsly-auth-readiness.mjs --operator-only` by default before typecheck, local smoke, Cloud Build, Secret Manager, Artifact Registry, or Cloud Run operations. This keeps the deploy lane and standalone readiness command on one shared truth source.
- Current deploy blocker: gcloud user auth requires reauthentication. The hotfix lane now fails before build with the recovery commands:
  - `gcloud auth login --project high-ground-odyssey`
  - `gcloud auth application-default login --project high-ground-odyssey`
- Latest local validation:
  - `corepack pnpm --filter quipsly exec tsc --noEmit --incremental false`: pass.
  - `TARGET_URL=http://127.0.0.1:3025 scripts/dev/quipsly-local-smoke.sh`: pass.
  - `QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-public-auth-boundary-smoke.mjs`: pass.
- Generated-artifact dry run found `0` local DB candidates after cleanup.

Latest readiness command validation:

- `node --check scripts/quipsly-auth-readiness.mjs`: pass.
- `node scripts/quipsly-auth-readiness.mjs --operator-only`: correctly exits nonzero while this machine still needs `gcloud auth login --project high-ground-odyssey` and `gcloud auth application-default login --project high-ground-odyssey`. Route and cleanup layers are intentionally skipped in this mode.
- `RUN_TYPECHECK=0 RUN_LOCAL_SMOKE=0 SKIP_CLOUD_BUILD=1 PROMOTE=0 PROJECT_ID=high-ground-odyssey bash scripts/release/quipsly-hotfix-deploy.sh`: correctly stops at the shared operator-only readiness gate before typecheck, local smoke, Cloud Build, Artifact Registry, Cloud Run, or promotion work. This proves the targeted hotfix lane now fails before expensive deploy work when Google reauth is required.
- `QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-auth-readiness.mjs`: correctly exits nonzero because gcloud user auth, Application Default Credentials, and local Firebase Admin credentials are blocked by noninteractive reauth/stale ADC. Local route contract checks pass, including `/login`, `/api/auth/session`, legacy Auth.js quarantine, Firebase client config, native session-check, and generated-smoke cleanup dry-run with `0` candidate generated users.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com QUIPSLY_AUTH_READINESS_SKIP_CLEANUP_DRY_RUN=1 node scripts/quipsly-auth-readiness.mjs`: correctly exits nonzero because production is not yet on the latest local Firebase-first route contract. Production `/api/auth/firebase-admin-preflight` still redirects to `/login?callbackUrl=%2Fprojects` instead of returning structured JSON, so the next safe production move is reauth plus targeted hotfix deploy/smoke.
- Added `docs/coordination/quipsly-auth-completion-audit.md` as the requirement-by-requirement proof checklist for the active auth goal. This is the source for deciding whether auth is actually complete after reauth/deploy/smoke, while this status file remains the historical work log.
- Strengthened `scripts/quipsly-firebase-auth-smoke.mjs` so logout proof requires the `/api/auth/session` DELETE response to send a session-cookie clearing header, not only return HTTP 200. This makes the credentialed smoke closer to the active goal's "logout is proven" requirement.
- Validation after the logout-smoke hardening:
  - `node --check scripts/quipsly-firebase-auth-smoke.mjs`: pass.
  - `bash -n scripts/dev/quipsly-local-smoke.sh`: pass.
  - `TARGET_URL=http://127.0.0.1:3025 scripts/dev/quipsly-local-smoke.sh`: pass, with Firebase Admin preflight still classified as `blocked-by-server-credentials`.
  - `node scripts/quipsly-auth-readiness.mjs --operator-only`: still exits nonzero because gcloud user auth and ADC need reauth.
- Added signed-out calm-route coverage:
  - `scripts/quipsly-public-auth-boundary-smoke.mjs` now verifies `/projects` does not return framework/server error output and either renders calm Nest/onboarding copy or redirects to the canonical `/login?callbackUrl=/projects` entry point.
  - `scripts/dev/quipsly-local-smoke.sh` now verifies local `/projects` onboarding copy, `/account/switch` no-session copy, and `/admin/users` invite-console route rendering.
  - `scripts/quipsly-public-auth-boundary-smoke.mjs` and `scripts/quipsly-auth-readiness.mjs` now also verify `/admin/users` and `/account/switch` signed-out boundary behavior. Production must show the Nest sign-in gate or canonical login redirect. Localhost may report `local-owner-override` when `QUIPSLY_OWNER_OVERRIDE=true`, but that state is explicitly not counted as production auth proof.
  - This is intentionally route-boundary proof, not a claim that credentialed login/onboarding is complete.
- Validation after the signed-out/admin route smoke hardening:
  - `node --check scripts/quipsly-public-auth-boundary-smoke.mjs`: pass.
  - `node --check scripts/quipsly-auth-readiness.mjs`: pass.
  - `bash -n scripts/dev/quipsly-local-smoke.sh`: pass.
  - `TARGET_URL=http://127.0.0.1:3025 scripts/dev/quipsly-local-smoke.sh`: pass.
  - `QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-public-auth-boundary-smoke.mjs`: pass, with `/account/switch` labeled `local-owner-override`.
  - `QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com node scripts/quipsly-public-auth-boundary-smoke.mjs`: still exits nonzero because live production `/login` does not yet expose create-account/password-reset copy from the local Firebase-first contract.
  - `QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 QUIPSLY_AUTH_READINESS_SKIP_CLEANUP_DRY_RUN=1 node scripts/quipsly-auth-readiness.mjs`: still exits nonzero because gcloud user auth, ADC, and local Firebase Admin credentials are blocked; route checks now include signed-out `/admin/users` and `/account/switch` boundary classification.
  - `node scripts/quipsly-auth-readiness.mjs --operator-only`: still exits nonzero because gcloud user auth and ADC need reauth.
- Added production owner-override guardrails:
  - `scripts/release/quipsly-hotfix-deploy.sh` now refuses to start if the operator environment or `EXTRA_UPDATE_ENV_VARS` would set `QUIPSLY_OWNER_OVERRIDE=true`.
  - `scripts/release/quipsly-release-preflight.sh` now fails if the Cloud Run service env already has `QUIPSLY_OWNER_OVERRIDE=true`.
  - This preserves the distinction between local development owner override and real Firebase/Postgres-backed production auth.
- Added scoped route-only readiness:
  - `QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-auth-readiness.mjs --route-only` can prove local public route contracts without gcloud/ADC noise.
  - Route-only is intentionally not a substitute for full readiness, credentialed smoke, preview proof, or production proof.
- Validation after route-only readiness:
  - `node --check scripts/quipsly-auth-readiness.mjs`: pass.
  - `bash -n scripts/dev/quipsly-local-smoke.sh`: pass.
  - `bash -n scripts/release/quipsly-hotfix-deploy.sh`: pass.
  - `bash -n scripts/release/quipsly-release-preflight.sh`: pass.
  - `QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 node scripts/quipsly-auth-readiness.mjs --route-only`: pass. Local `/account/switch` reports `local-owner-override`; Firebase Admin preflight reports `structured-credential-blocker`.
- `QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com node scripts/quipsly-auth-readiness.mjs --route-only`: still exits nonzero because production `/login` lacks create-account/password-reset and production `/api/auth/firebase-admin-preflight` redirects instead of returning structured JSON.
- `node scripts/quipsly-auth-readiness.mjs --operator-only`: still exits nonzero because gcloud user auth and ADC need reauth.
- Added `scripts/quipsly-identity-integrity-audit.mjs` as a read-only Postgres audit for the app-owned identity layer. It checks normalized duplicate primary emails, duplicate aliases across users, primary/alias collisions across users, duplicate Firebase UIDs, normalized duplicate Nest grants/invites, active grants without matching app users, orphaned live invites, and Firebase-linked users missing Home Nest/free tier. Output is redacted by default; `--show-emails` is local-operator-only. Full auth readiness now runs this audit by default except in `--operator-only` and `--route-only` modes.

## 2026-06-29 local native account control-plane hardening

Current local QuipslyStudio auth-control update:

- Added an agent-safe `/native_account` command route to the local QuipslyStudio AgentServer.
- Added mounted-editor handling for native account actions:
  - `status`
  - `configure`
  - `config`
  - `check_saved`
  - `sign_in`
  - `clear`
- Added command-receipt redaction for sensitive values before and after editor-loop delivery.
- `password`, `token`, `secret`, `cookie`, `authorization`, `private`, credential, and API-key-shaped command values must show as `[redacted]` in agent receipts.
- The native Account workbench still stores refresh tokens in Keychain and verifies with Nest through `/api/mac/session-check`; the agent route only makes that existing path testable without OS mouse/cookie hacks.

Local validation:

- `apps/QuipslyStudio/script/build_and_run.sh --verify`: pass.
- `apps/QuipslyStudio/script/smoke_native_account_control_plane.sh`: pass.
- The smoke proves:
  - AgentServer health.
  - Account workbench opens.
  - `/native_account` reaches the mounted editor loop.
  - Fake password-shaped input is redacted from command receipts.
  - Fake password-shaped input is not stored in native account state.
  - Firebase client config is reachable from `https://nest.quipsly.com`.
  - Native account state surfaces redacted proof fields.
- Credentialed native sign-in was not run in this pass because no `QUIPSLY_NATIVE_SMOKE_EMAIL` / `QUIPSLY_NATIVE_SMOKE_PASSWORD` or `QUIPSLY_AUTH_SMOKE_EMAIL` / `QUIPSLY_AUTH_SMOKE_PASSWORD` were present in the environment.
- To prove the full native saved-session path without printing secrets, set those env vars in the shell environment, then run `apps/QuipslyStudio/script/smoke_native_account_control_plane.sh`. The script will verify Firebase email/password sign-in, Keychain saved-session refresh, `/api/mac/session-check`, Home Nest truth, and `freeTierStatus: ACTIVE`.
- Added Keychain-backed helper scripts for credentialed native smoke without shell-history password exposure:
  - `apps/QuipslyStudio/script/save_native_smoke_credentials_to_keychain.sh`
  - `apps/QuipslyStudio/script/smoke_native_account_control_plane_from_keychain.sh`
- Safe-failure proof passed with a missing test Keychain service: the wrapper reported no credential found and did not print a password.
- Preferred native credential proof flow:
  1. `cd apps/QuipslyStudio`
  2. `QUIPSLY_NATIVE_SMOKE_EMAIL=<safe-test-email> ./script/save_native_smoke_credentials_to_keychain.sh`
  3. `QUIPSLY_NATIVE_SMOKE_EMAIL=<safe-test-email> ./script/smoke_native_account_control_plane_from_keychain.sh`

Current manual Google chooser blocker:

- Chrome-visible Google login currently reaches Google's `redirect_uri_mismatch` page.
- Failing redirect URI: `https://quipsly-reef.firebaseapp.com/__/auth/handler`.
- OAuth client ID shown by Google: `659427658635-h633re67ab05kmgnpkcnq5rdhhb4umqn.apps.googleusercontent.com`.
- The app is now using the Firebase handler as intended; the remaining blocker is the Google Auth Platform client configuration.
- Required manual console action: in Google Cloud project `high-ground-odyssey`, open the OAuth client above and add authorized redirect URI `https://quipsly-reef.firebaseapp.com/__/auth/handler`.
- Console access note: Chrome landed on a "Verify it's you" page for `charlie@highgroundodyssey.com`; `charlielsparrow@gmail.com` did not have sufficient permissions on `high-ground-odyssey`.
- Auth is not complete until this redirect is added and the real browser Google chooser path is re-smoked.

## 2026-06-29 production Firebase auth native-onboarding promotion proof

Current live revision:

- Cloud Run service: `studio`
- Production URL: `https://nest.quipsly.com`
- Revision receiving 100% traffic: `studio-00330-wic`
- Preview/live tag: `quipsly-firebase-auth`
- Image tag: `firebase-native-onboarding-20260629-060816`
- Cloud Build ID: `433f3976-f0c5-47b5-b779-eb61adf0527a`
- Image URI: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:firebase-native-onboarding-20260629-060816`

Changes promoted in this hotfix:

- `/api/mac/session-check` now uses the same starter-onboarding helper as browser session creation.
- Native Firebase bearer-token checks now guarantee and return a redacted onboarding receipt:
  - `freePlanSlug`
  - `freeMembershipStatus`
  - `freeMembershipCreated`
  - `homeNestSlug`
- QuipslyStudio native account state and agent payloads now surface free-tier status after session verification.
- Native control-plane smoke now requires `freeTierStatus`, so the Mac app path cannot silently prove identity while missing starter account truth.

Validation before promotion:

- `corepack pnpm --filter quipsly exec tsc --noEmit --incremental false`: pass.
- `node --check scripts/quipsly-firebase-auth-smoke.mjs`: pass.
- `node --check scripts/quipsly-public-auth-boundary-smoke.mjs`: pass.
- `bash -n scripts/dev/quipsly-local-smoke.sh`: pass.
- `bash -n apps/QuipslyStudio/script/smoke_native_account_control_plane.sh`: pass.
- `apps/QuipslyStudio/script/build_and_run.sh --verify`: pass.
- `apps/QuipslyStudio/script/smoke_native_account_control_plane.sh`: pass.
- `scripts/dev/quipsly-local-smoke.sh` against `http://127.0.0.1:3025`: pass.
- Local generated invited-user smoke against `http://127.0.0.1:3025`: pass, including native session-check free-tier onboarding assertions.

Preview proof:

- Preview URL: `https://quipsly-firebase-auth---studio-hm2odnvjga-uc.a.run.app`.
- Preview revision before promotion: `studio-00330-wic`.
- Route smoke passed:
  - `/login?callbackUrl=%2Fprojects` includes Google sign-in.
  - `/login?callbackUrl=%2Fprojects&inviteToken=qinv_testtoken` includes invite-mode copy.
  - `/api/health` and `/api/healthz` return `ok:true`.
  - unauthenticated `/api/auth/session` returns `401`.
  - legacy `/api/auth/signin` redirects to `/login?callbackUrl=%2Fprojects`.
  - legacy `/api/auth/callback/google` redirects to `/login?callbackUrl=%2Fprojects`.
- Structured public auth boundary smoke passed.
- Generated invited-user smoke passed against preview:
  - Safe generated identity used the `@dev.test` domain.
  - Firebase email/password login: pass.
  - Quipsly session cookie: pass.
  - Native bearer-token session check: pass.
  - Native session-check free-tier onboarding receipt: pass.
  - Home Nest auto-create: pass.
  - Free-tier onboarding status: `ACTIVE`.
  - Expected invited Nest: `marine-biology-research`.
  - Invite acceptance: pass.
  - Checked routes: `/api/auth/session`, `/projects`, `/account/switch`, `/nests/<home-nest>`, `/create?project=<home-nest>`.
  - Logout and generated-artifact cleanup: pass.

Production proof after promotion:

- Production route smoke passed on `https://nest.quipsly.com`.
- Structured public auth boundary smoke passed on `https://nest.quipsly.com`.
- Production generated invited-user smoke passed on `https://nest.quipsly.com`:
  - Safe generated identity used the `@dev.test` domain.
  - Firebase email/password login: pass.
  - Quipsly session cookie: pass.
  - Native bearer-token session check: pass.
  - Native session-check free-tier onboarding receipt: pass.
  - Home Nest auto-create: pass.
  - Free-tier onboarding status: `ACTIVE`.
  - Expected invited Nest: `marine-biology-research`.
  - Invite acceptance: pass.
  - Checked routes: `/api/auth/session`, `/projects`, `/account/switch`, `/nests/<home-nest>`, `/create?project=<home-nest>`.
  - Logout and generated-artifact cleanup: pass.
- Cloud Run error check for `studio-00330-wic` after promotion returned no fresh error entries.

Important deploy/smoke finding:

- A manual generated-invite smoke against a remote preview can create invites in the wrong database if it uses local `.env` instead of the deployed `studio-database-url` secret.
- Remote generated-invite smoke must use `scripts/release/quipsly-hotfix-deploy.sh` or the same pattern:
  - read `studio-database-url` from Secret Manager without printing it,
  - read `studio-auth-secret` into a `0600` temp file without printing it,
  - run Cloud SQL Auth Proxy with `--quota-project high-ground-odyssey`,
  - set `QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT`,
  - run `scripts/quipsly-generated-invited-user-smoke.mjs`,
  - remove temporary token/auth files.
- Do not interpret a failed remote generated-invite smoke as product auth failure until the smoke setup target database and auth-secret source have been verified.

Cleanup:

- Local/generated smoke cleanup removed `11` old `codex-invite-xxxxxxxx@dev.test` users, `9` matching generated Home Nests, `26` generated grants, `11` generated invites, and `10` Firebase generated users; one Firebase user was already absent.

Remaining manual hardening:

- Browser-visible Google chooser should still be checked by Charlie with a real Google account after confirming the classic Google OAuth client redirect list includes `https://quipsly-reef.firebaseapp.com/__/auth/handler`.
- Native Mac happy-path UX should still be checked with a real saved session in Keychain.
- Auth is not complete until those two human-visible paths are proven, but the backend browser-session, invite, starter onboarding, and native bearer-token paths are now live-smoked.

## 2026-06-29 production Firebase auth admin-repair promotion proof

Current live revision:

- Cloud Run service: `studio`
- Production URL: `https://nest.quipsly.com`
- Revision receiving 100% traffic: `studio-00327-kes`
- Preview/live tag: `quipsly-firebase-auth`
- Image tag: `firebase-auth-admin-repair-20260629-053753`
- Cloud Build ID: `dd95f4aa-9c92-462a-ae2b-0347c7fdf979`

Changes promoted in this hotfix:

- `/admin/users` can repair missing starter state for old app-owned users.
- Admin create/update and starter-repair paths search both `User.primaryEmail` and `UserAlias.email` before creating or repairing state.
- The app-owned identity invariant is now explicit in code and docs: one real email must not fork into duplicate Quipsly users during admin/invite recovery.

Validation before promotion:

- `REGION=us-central1 PROJECT_ID=high-ground-odyssey scripts/release/quipsly-release-preflight.sh`: pass.
- `corepack pnpm --filter quipsly exec tsc --noEmit --incremental false`: pass.
- `node --check scripts/quipsly-firebase-auth-smoke.mjs`: pass.
- `node --check scripts/quipsly-public-auth-boundary-smoke.mjs`: pass.
- `bash -n scripts/dev/quipsly-local-smoke.sh`: pass.
- `scripts/dev/quipsly-local-smoke.sh` against `http://127.0.0.1:3025`: pass.
- `QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com node scripts/quipsly-public-auth-boundary-smoke.mjs`: pass before the new deploy.
- `node scripts/quipsly-firebase-auth-config-check.mjs`: pass with `manualRedirectListCheckRequired: true`.

Preview proof:

- Preview URL: `https://quipsly-firebase-auth---studio-hm2odnvjga-uc.a.run.app`.
- Preview revision before promotion: `studio-00326-nel`, then no-build promote redeployed the same image as `studio-00327-kes`.
- Route smoke passed:
  - `/login?callbackUrl=%2Fprojects` includes Google sign-in.
  - `/login?callbackUrl=%2Fprojects&inviteToken=qinv_testtoken` includes invite-mode copy.
  - `/api/health` and `/api/healthz` return `ok:true`.
  - unauthenticated `/api/auth/session` returns `401`.
  - legacy `/api/auth/signin` redirects to `/login?callbackUrl=%2Fprojects`.
  - legacy `/api/auth/callback/google` redirects to `/login?callbackUrl=%2Fprojects`.
- Generated invited-user smoke passed against preview:
  - Safe generated identity used the `@dev.test` domain.
  - Firebase email/password login: pass.
  - Quipsly session cookie: pass.
  - Native bearer-token session check: pass.
  - Home Nest auto-create: pass.
  - Expected invited Nest: `marine-biology-research`.
  - Invite acceptance: pass.
  - Checked routes: `/api/auth/session`, `/projects`, `/account/switch`, `/nests/<home-nest>`, `/create?project=<home-nest>`.
  - Logout and generated-artifact cleanup: pass.

Production proof after promotion:

- Production route smoke passed on `https://nest.quipsly.com`.
- Production generated invited-user smoke passed on `https://nest.quipsly.com`:
  - Safe generated identity used the `@dev.test` domain.
  - Firebase email/password login: pass.
  - Quipsly session cookie: pass.
  - Native bearer-token session check: pass.
  - Home Nest auto-create: pass.
  - Expected invited Nest: `marine-biology-research`.
  - Invite acceptance: pass.
  - Checked routes: `/api/auth/session`, `/projects`, `/account/switch`, `/nests/<home-nest>`, `/create?project=<home-nest>`.
  - Logout and generated-artifact cleanup: pass.

Remaining manual hardening:

- Browser-visible Google chooser should still be checked by Charlie with a real Google account after confirming the classic Google OAuth client redirect list includes `https://quipsly-reef.firebaseapp.com/__/auth/handler`.
- Native Mac happy-path UX should still be checked with a real saved session in Keychain.

## 2026-06-29 earlier production Firebase auth promotion proof

Earlier live revision:

- Cloud Run service: `studio`
- Production URL: `https://nest.quipsly.com`
- Revision receiving 100% traffic: `studio-00324-qim`
- Preview/live tag: `quipsly-firebase-auth`
- Image tag: `firebase-auth-clean-smoke-20260629-025755`

Validation before promotion:

- `bash -n scripts/release/quipsly-hotfix-deploy.sh`: pass.
- `node --check scripts/quipsly-generated-invited-user-smoke.mjs`: pass.
- `node --check scripts/quipsly-invited-user-smoke-setup.mjs`: pass.
- `node --check scripts/quipsly-firebase-auth-smoke.mjs`: pass.
- `corepack pnpm --filter quipsly exec tsc --noEmit --incremental false`: pass.
- Build ID for the current promoted image: `74def4b3-8fe9-4121-a505-757e307578a3`.
- Cloud Build uploaded `1611` files / `289.4 MiB`; still worth future pipeline slimming.

Preview proof:

- Preview URL: `https://quipsly-firebase-auth---studio-hm2odnvjga-uc.a.run.app`.
- Route smoke passed:
  - `/login?callbackUrl=%2Fprojects` includes Google sign-in.
  - `/login?callbackUrl=%2Fprojects&inviteToken=qinv_testtoken` includes invite-mode copy.
  - `/api/health` and `/api/healthz` return `ok:true`.
  - unauthenticated `/api/auth/session` returns `401`.
  - legacy `/api/auth/signin` redirects to `/login?callbackUrl=%2Fprojects`.
  - legacy `/api/auth/callback/google` redirects to `/login?callbackUrl=%2Fprojects`.
- Generated invited-user smoke passed against preview:
  - Safe generated identity used the `@dev.test` domain.
  - Firebase email/password login: pass.
  - Quipsly session cookie: pass.
  - Native bearer-token session check: pass.
  - Home Nest auto-create: pass.
  - Expected invited Nest: `marine-biology-research`.
  - Invite acceptance: pass.
  - Checked routes: `/api/auth/session`, `/projects`, `/account/switch`, `/nests/<home-nest>`, `/create?project=<home-nest>`.
  - Logout: pass.

Production proof after promotion:

- Production route smoke passed on `https://nest.quipsly.com`.
- Production generated invited-user smoke passed on `https://nest.quipsly.com`:
  - Safe generated identity used the `@dev.test` domain.
  - Firebase email/password login: pass.
  - Quipsly session cookie: pass.
  - Native bearer-token session check: pass.
  - Home Nest auto-create: pass.
  - Expected invited Nest: `marine-biology-research`.
  - Invite acceptance: pass.
  - Checked routes: `/api/auth/session`, `/projects`, `/account/switch`, `/nests/<home-nest>`, `/create?project=<home-nest>`.
  - Logout: pass.
- Generated smoke cleanup passed on preview and production:
  - The generated Firebase user was deleted.
  - The generated Quipsly user was deleted.
  - The generated Home Nest was deleted.
  - Related generated grants and invites were deleted.

Browser-visible proof after production promotion:

- Chrome opened `https://nest.quipsly.com/projects` and correctly showed the signed-out Nest explainer before login.
- Chrome opened `https://nest.quipsly.com/login?callbackUrl=/projects` and showed the Firebase-first controls: Google sign-in, support link, and direct email/password sign-in.
- Chrome signed in through the visible email/password form using the safe operator account.
- Browser landed at `/projects` with the app shell.
- The Projects page now anchors Home Vault to the signed-in actor's own Home Nest:
  - Expected visible Home Vault: `Codex Home Nest`.
  - Generated smoke Home Nest did not appear inside the Home Vault section.
- Browser sign-out returned to the signed-out Nest explainer.

Production smoke-artifact cleanup:

- Added `scripts/quipsly-clean-generated-smoke-artifacts.mjs`.
- Dry-run found `5` old generated `codex-invite-xxxxxxxx@dev.test` users and `5` matching generated Home Nests.
- Apply cleanup deleted:
  - `5` generated Quipsly users.
  - `5` generated Firebase users.
  - `5` generated Home Nests.
  - `12` generated access grants.
  - `4` generated invites.
- Browser reload after cleanup found `0` generated eight-hex smoke email mentions on `/projects`.

Deploy harness hardening added during this proof:

- Remote generated invite smoke reads production `DATABASE_URL` and `AUTH_SECRET` through Secret Manager without printing values.
- `AUTH_SECRET` is passed to local smoke setup through a `0600` temp file so exact Secret Manager bytes are preserved.
- Cloud SQL socket-style production DB URLs are tested locally through Cloud SQL Auth Proxy and rewritten to loopback only inside the smoke process.
- Generated smoke DB setup now uses a longer Prisma connection timeout and retries safe setup phases to avoid false negatives from proxy/DB startup latency.
- Temporary auth-secret files are removed on success and error branches.
- Generated smoke cleanup is on by default. Set `QUIPSLY_GENERATED_SMOKE_KEEP_ARTIFACTS=1` only when preserving failed artifacts is intentionally useful.

Remaining manual hardening:

- Browser-visible Google chooser should still be checked by Charlie with a real account.
- Native Mac happy-path UX should still be checked with a real saved session in Keychain.
- Auth is no longer blocked on the generated invite, Home Nest, production session, or native bearer-token smoke paths.

## 2026-06-29 local invited-user acceptance proof

- Credentialed local invited-user smoke passed with a generated safe `@dev.test` user.
- Reusable generated invite smoke now exists:
  - `scripts/quipsly-generated-invited-user-smoke.mjs`
  - It creates a safe `@dev.test` Firebase user, creates/updates the Quipsly user/access grant/invite, writes the raw invite token only to a private temp file, runs Firebase auth smoke with invite acceptance, then deletes the temp token file.
  - It picks preferred proof Nests in order: `marine-biology-research`, `high-ground-odyssey`, `welcome-to-quipsly-beta`, then latest available Nest.
- The hotfix deploy lane can run this proof with `RUN_GENERATED_INVITE_SMOKE=1`.
- The smoke did not print passwords, Firebase ID tokens, cookies, private keys, or raw invite tokens.
- Local target Nest used: `high-ground-odyssey`.
- Local DB did not contain `marine-biology-research`, so local invite proof used an existing local Nest instead of faking the Marine Biology fixture.
- The first attempted local target at `3025` exposed why health-only discovery is not enough: a server can return `/api/health` while app-shell or native routes are not ready yet.
- Smoke discovery now requires app-surface routes, and Firebase auth smoke requires `/api/mac/session-check` to exist unless `QUIPSLY_AUTH_SMOKE_SKIP_NATIVE_SESSION_CHECK=1` is explicitly set.

Evidence from the passing generated invite smoke:

- Firebase email/password login: pass.
- `/api/auth/session` session cookie creation: pass.
- `acceptedInvite`: pass.
- Home Nest auto-create: pass.
- Expected invited Nest visible: `high-ground-odyssey`.
- `/projects`: `200`.
- `/account/switch`: `200`.
- `/nests/<home-nest>`: `200`.
- `/create?project=<home-nest>`: `200`.
- `/api/mac/session-check` bearer-token check: pass.
- Logout: pass.

Validation:

```bash
node --check scripts/quipsly-firebase-auth-smoke.mjs
bash -n scripts/dev/quipsly-local-smoke.sh
corepack pnpm --filter quipsly exec tsc --noEmit --incremental false
scripts/dev/quipsly-local-smoke.sh
```

All passed locally.

## 2026-06-29 invite-aware login and session cleanup

- `/login` now understands `inviteToken=qinv_...` as invite context and displays clear "Invite mode" language.
- Invite links are explicitly non-authoritative in the UI: the URL does not grant access by itself.
- `/api/auth/session` now accepts an optional invite token only after Firebase verifies the user ID token.
- Invite acceptance now requires the invite token email to match the Firebase-verified Quipsly email before the invite can be marked accepted.
- The previous token consumer shape that could activate an invite by token alone was replaced with `consumeInviteLoginTokenForEmail(...)`.
- Logout now reads the configured `QUIPSLY_SESSION_COOKIE_NAME` instead of a string literal before attempting Firebase token revocation.
- Local route smoke now asserts the invite-mode copy so regressions are caught before browser/manual testing.
- Added admin-only `/admin/auth-diagnostics` as a redacted auth health surface:
  - Firebase public config presence.
  - Firebase Admin/server credential signal.
  - Quipsly app truth signals: database env presence, auth secret presence, configured admin count, session cookie constant.
  - Legacy route and invite-safety expectations.
  - Safe smoke commands with no secret values.
- Invited-user smoke tooling now matches the app token format:
  - `scripts/quipsly-invited-user-smoke-setup.mjs` creates HMAC invite hashes with `AUTH_SECRET` / `NEXTAUTH_SECRET`, matching production app code.
  - The setup script can write the raw invite token to a local `0600` file via `QUIPSLY_INVITE_SMOKE_TOKEN_FILE`; stdout remains redacted.
  - `scripts/quipsly-firebase-auth-smoke.mjs` can read `QUIPSLY_AUTH_SMOKE_INVITE_TOKEN_FILE` or `QUIPSLY_AUTH_SMOKE_INVITE_TOKEN` and assert `acceptedInvite` after Firebase sign-in.
  - This preserves the invariant: token possession is not identity proof; Firebase-verified email must match the invite email.

Validation:

```bash
corepack pnpm --filter quipsly exec tsc --noEmit --incremental false
scripts/dev/quipsly-local-smoke.sh
node --check scripts/quipsly-firebase-auth-smoke.mjs
node --check scripts/quipsly-invited-user-smoke-setup.mjs
```

All commands passed locally. Route smoke discovered the Quipsly dev server at `http://127.0.0.1:3025`.

Full invite-token acceptance smoke was not run in this shell because the required DB/auth smoke environment variables were not loaded. Do not fake this proof; run it only with credentials supplied through environment variables or secret-managed shell setup.

Current interpretation:

- Invite links now help the user land in the right flow without becoming an auth bypass.
- Firebase remains the identity proof.
- Existing Quipsly access grants remain the authorization truth.
- Admin diagnostics now give a calm place to inspect auth configuration shape without exposing credentials.
- A live browser Google check and production smoke are still required before calling the full auth goal complete.

## 2026-06-29 native command/access update

- QuipslyStudio native build/run verification passed again through `apps/QuipslyStudio/script/build_and_run.sh --verify`.
- Root cause for the stuck native command path was not Firebase token exchange. Cached `/health` and `/state` stayed responsive while main-actor routes such as `/playback` timed out because SwiftUI render/status paths were synchronously reading publication-ready manifest files from disk.
- Hot-path publication readiness checks now avoid synchronous manifest reads from `/Volumes/*`. External-drive package truth must be checked by explicit validators, not the UI render loop.
- HTTP command queue draining now treats HTTP semantic commands as app-level commands so a stale SwiftUI consumer id cannot strand them.
- Local native command proof now passes:
  - `GET /playback?mode=edit&action=pause` responds within the 5 second smoke window.
  - `GET /left_workbench?mode=account` changes `/state.leftWorkbenchMode` from `inspector` to `account`.
  - `/state.agentPendingCommandCount` returns to `0`.
  - `/state.agentLastCommandReceipt.status` becomes `handled_by_editor_loop`.
  - `GET /seek?time=12.3` plus `GET /focus_timeline` both drain through the editor loop; `/state.playhead` advances and `/state.lastMediaAction` reports the timeline focus.
- Native Account workbench UX/status proof now also passes locally:
  - Account workbench text clearly separates native Firebase email/password from browser Google login.
  - `/state.nativeAccount` exposes redacted account readiness fields: base URL, configured-email presence/domain, saved-session presence, verified status, Home Nest slug/name, visible project slugs/count, staff flag, status/error message, and a truth note.
  - `/state.nativeAccount` does not expose passwords, Firebase ID tokens, refresh tokens, cookies, or private keys.
  - Current local app state has no saved native session in Keychain, so `isVerified=false` is expected until a human/operator signs in or saves a session.
- Repeatable local smoke added and passing:
  - `apps/QuipslyStudio/script/smoke_native_account_control_plane.sh`
  - Proves `/health`, `/left_workbench?mode=account`, command drain, handled receipt, and redacted `nativeAccount` proof fields.

Current interpretation:

- The local native app now has a working semantic command loop and redacted Account status for Codex/operator testing.
- This removes the prior "Account workbench command delivery is unproven" blocker.
- Keep the distinction clear: native command delivery and Account workbench state echo are locally proven; browser-visible Google account chooser should still be checked from the actual user-facing UI.

## 2026-06-28 continuation notes

- Local route smoke now auto-discovers the running Quipsly dev server instead of assuming `127.0.0.1:3012`.
- `scripts/dev/quipsly-local-smoke.sh` passed against `http://127.0.0.1:3025` after the discovery update.
- `scripts/quipsly-firebase-auth-smoke.mjs` also discovers a reachable local Quipsly base URL when `QUIPSLY_AUTH_SMOKE_BASE_URL` is not supplied.
- QuipslyStudio native build/run verification passed through `apps/QuipslyStudio/script/build_and_run.sh --verify`.
- The native AgentServer `/commands` endpoint was moved off the main actor and now returns quickly with the command catalog.
- Prior native-app blocker resolved locally on 2026-06-29: `/left_workbench?mode=account` now acknowledges, drains through the mounted editor loop, updates `leftWorkbenchMode=account`, and returns `agentPendingCommandCount=0` with a handled receipt.

## Current direction

Quipsly auth is moving Firebase-first:

- Firebase `quipsly-reef` proves identity.
- Quipsly Postgres owns app truth: `User`, roles, memberships, Nests, access grants, Home Nests, and documents.
- Auth.js / NextAuth is retired as the active login path.
- Patreon must not become identity truth.

## Local code state

Current source has:

- Firebase-backed `/login` for Google and email/password users.
- Server session boundary in `apps/quipsly/src/lib/server/quipsly-session.ts`.
- `/api/auth/session` creates Firebase session cookies from ID tokens.
- Firebase identity linking via `ensureStudioUserFromFirebaseIdentity(...)`.
- Automatic free plan + Home Nest onboarding.
- Admin-created Firebase email/password user support.
- Legacy `/api/auth/signin` traps removed from active app links.
- Reusable auth smoke script: `scripts/quipsly-firebase-auth-smoke.mjs`.
- Reusable invited-user setup smoke script: `scripts/quipsly-invited-user-smoke-setup.mjs`.

## Local proof collected

Typecheck passes:

```bash
corepack pnpm --filter quipsly exec tsc --noEmit --incremental false
```

Local route smoke and Firebase session smoke passed against `http://localhost:3025`:

- `/login`
- `/api/health`
- `/api/healthz`
- unauthenticated `/api/auth/session` returns `401`
- legacy `/api/auth/signin` redirects to `/login?callbackUrl=%2Fprojects`
- legacy `/api/auth/callback/google` redirects to `/login?callbackUrl=%2Fprojects`
- Firebase email/password sign-in creates a Quipsly session cookie
- `/projects`, `/admin/users`, `/account/switch`, Home Nest, `/create`, and logout all pass for the Codex operator identity

## Live service state

Cloud Run service: `studio`
Project: `high-ground-odyssey`
Region: `us-central1`
Runtime service account: `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`
Firebase project: `quipsly-reef`

Runtime IAM/env updates already applied:

- `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com` has `roles/firebaseauth.admin` on `quipsly-reef`.
- Cloud Run has `FIREBASE_PROJECT_ID=quipsly-reef`.
- Cloud Run has the required `NEXT_PUBLIC_FIREBASE_*` public env vars.
- Cloud Run still has `DATABASE_URL` mounted from `studio-database-url`.
- Cloud Run has `QUIPSLY_ADMIN_EMAILS` configured for the Codex operator smoke account; Charlie remains covered by the code fallback.

Historical earlier Firebase-first proof before the later `quipsly-firebase-auth` promotion.

Previous live revision before the 2026-06-29 `quipsly-firebase-auth` promotion:

- Cloud Run revision: `studio-00315-rex`
- Traffic: `100%`
- Preview/live tag: `quipsly-hotfix`
- Build ID: `2a2123b2-8528-4b0f-af95-a97baa76914a`
- Image tag: `hotfix-20260628-185658`

Preview smoke passed before promotion:

- route smoke passed on `https://quipsly-hotfix---studio-hm2odnvjga-uc.a.run.app`
- Firebase operator smoke passed on the same preview URL
- native Firebase bearer-token session check passed on the same preview URL

Production smoke passed after promotion:

- route smoke passed on `https://nest.quipsly.com`
- Firebase operator smoke passed for the Codex operator identity
- native Firebase bearer-token session check passed on `https://nest.quipsly.com`
- legacy `/api/auth/signin` redirects to `https://nest.quipsly.com/login?callbackUrl=%2Fprojects`
- legacy `/api/auth/callback/google` redirects to `https://nest.quipsly.com/login?callbackUrl=%2Fprojects`
- no fresh Cloud Run error logs were returned for revision `studio-00315-rex` during the smoke window

Invited-user proof passed against production:

- Safe test identity: `codex-invite-smoke@dev.test`
- Target Nest: `marine-biology-research`
- Quipsly user/access grant existed before sign-in.
- `firebaseUidLinkedBeforeSignIn: false`
- Live Firebase session smoke passed with `QUIPSLY_AUTH_SMOKE_EXPECT_ADMIN=0`.
- `/projects` included `marine-biology-research`.
- A Home Nest was created for the invited user.
- `firebaseUidLinkedAfterSignIn: true`
- Grant remained `VIEWER` / `ACTIVE`.

## Current blockers

No blocker remains for the Firebase email/password operator path, first-session onboarding, Home Nest creation, or invited-user linking.

2026-06-29 browser-visible Google sign-in update:

- Fixed Firebase Auth authorized domains: `nest.quipsly.com` is now present on `quipsly-reef`.
- Created/enabled the Firebase Google provider config for `google.com` using the existing secret-backed OAuth client material.
- Chrome no longer fails with `auth/unauthorized-domain`.
- Chrome no longer fails with `auth/operation-not-allowed`.
- Current remaining browser-visible Google blocker is Google OAuth `redirect_uri_mismatch`.
- The required redirect URI shown by Google is `https://quipsly-reef.firebaseapp.com/__/auth/handler`.
- Add that URI to the Google Auth Platform web OAuth client that backs `studio-google-client-id`.
- The Chrome console account used during this check did not have project-console access to `high-ground-odyssey`; terminal `gcloud` was authenticated as `charlie@highgroundodyssey.com` and could update Firebase config.
- API attempts to access/enable `clientauthconfig.googleapis.com` for classic OAuth client mutation were denied even after `roles/serviceusage.serviceUsageConsumer` was added, so the redirect URI repair remains a console task unless a better Google Auth Platform API path is found.
- Unauthenticated production route smoke still passes: `/api/health` returns `200`, `/login` returns `200`, `/api/auth/session` returns clean unauthenticated `401`, and legacy `/api/auth/signin` plus `/api/auth/callback/google` redirect to `/login?callbackUrl=%2Fprojects`.
- Chrome retest still reaches Google and fails with `Error 400: redirect_uri_mismatch`, proving the remaining failure is the Google Auth Platform OAuth client redirect list, not Firebase authorized domains or the Firebase Google provider.
- `/admin/auth-diagnostics` now includes a Google browser sign-in callout with the required Firebase authorized domain, exact Google OAuth redirect URI, and the manual console checklist.
- Generated production invited-user smoke passed after starting Cloud SQL Proxy with `--quota-project high-ground-odyssey`.
- Generated invited-user proof covered:
  - Firebase password user creation.
  - Quipsly app user creation before sign-in.
  - `marine-biology-research` VIEWER access grant.
  - Invite token acceptance during Firebase session creation.
  - `firebaseUidLinkedBeforeSignIn: false`.
  - Firebase login.
  - Quipsly session cookie creation.
  - `/api/mac/session-check` native bearer-token check.
  - Home Nest creation for the generated user.
  - `/projects`, `/account/switch`, generated Home Nest, and generated `/create` access.
  - Logout.
  - Cleanup of generated invite, grants, Home Nest, Quipsly user, and Firebase user.

Remaining hardening work:

1. Browser-visible Google sign-in needs the Google Auth Platform redirect URI repair above, then a Chrome retest through the real Google account chooser.
2. Native Mac auth now has a deployed backend Firebase bearer-token route: `/api/mac/session-check`. Local, preview, and production authenticated smoke passed against it. QuipslyStudio local semantic command delivery is now proven for Account workbench, playback, seek, and timeline focus. Account workbench state echo is now redacted and agent-readable. A final signed-in native-session UX check should verify the happy path after a real saved session exists in Keychain.
3. The hotfix Cloud Build lane needed `E2_HIGHCPU_32` to avoid exit `137` during Next/Turbopack build.
4. Build logs still show Gemini API key warnings during static generation; these are noisy but non-blocking.
5. Operator production DB scripts need Cloud SQL Auth Proxy with `--quota-project high-ground-odyssey` when using local ADC, because the Firebase project and database project are separate.
6. `scripts/quipsly-firebase-auth-config-check.mjs` checks Firebase authorized domains and Google provider state without printing client secrets; it cannot verify the classic Google OAuth client redirect URI.

## Current smoke commands

Do not print passwords or tokens. Provide smoke credentials through environment variables only.

```bash
# Local auth smoke.
QUIPSLY_AUTH_SMOKE_BASE_URL=http://localhost:3025 \
QUIPSLY_AUTH_SMOKE_EMAIL=<operator email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<operator password> \
node scripts/quipsly-firebase-auth-smoke.mjs

# Live operator smoke.
QUIPSLY_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com \
QUIPSLY_AUTH_SMOKE_EMAIL=<operator email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<operator password> \
node scripts/quipsly-firebase-auth-smoke.mjs

# Live non-admin invited-user smoke.
QUIPSLY_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com \
QUIPSLY_AUTH_SMOKE_EMAIL=<invited @dev.test email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<invited password> \
QUIPSLY_AUTH_SMOKE_EXPECT_ADMIN=0 \
QUIPSLY_AUTH_SMOKE_EXPECT_PROJECT_SLUG=marine-biology-research \
node scripts/quipsly-firebase-auth-smoke.mjs

# Production DB operator setup requires Cloud SQL Auth Proxy.
/tmp/cloud-sql-proxy-quipsly \
  --quota-project high-ground-odyssey \
  --port 15432 \
  high-ground-odyssey:us-central1:studio-postgres

# Local native Account/control-plane smoke.
cd apps/QuipslyStudio
./script/smoke_native_account_control_plane.sh
```

## Completion criteria for this cutover

- Local smoke passes with Firebase email/password operator identity. DONE.
- Preview smoke passes before promotion. DONE.
- Live smoke passes after promotion. DONE.
- Brand-new Firebase users can start in a Home Nest. DONE for email/password smoke; Google browser path still needs Charlie-visible confirmation.
- Invited users link by email to existing access grants. DONE.
- Admin user management can create/update users and grant Nests. CLI/operator proof DONE; browser UI polish remains.
- No active app links send users into `/api/auth/signin`. DONE.
- No OAuthAccountNotLinked, redirect_uri_mismatch, auth 500, blank first-user state, or 400/null session exchange remains. CLI smoke shows none; continue watching browser/manual Google path.
- Native session route accepts Firebase bearer tokens and returns user, Home Nest, and visible projects. LOCAL, PREVIEW, AND PRODUCTION BACKEND SMOKE DONE. QuipslyStudio local command delivery and redacted Account workbench state are now proven; signed-in native-session UX verification remains.

## 2026-06-28 continuation notes

Local route smoke now auto-discovers the active dev URL and passed against `http://127.0.0.1:3025`.

QuipslyStudio native app build/launch verification passed through:

```bash
cd apps/QuipslyStudio
./script/build_and_run.sh --verify
```

Agent command catalog proof:

- `GET /commands` returns `status=ok`
- `commandCount=206`
- `/left_workbench` is present in the command list

Native Account workbench command proof now passes locally:

- Before command: `leftWorkbenchMode=inspector`, `agentCommandExecutorRegistered=true`.
- Command: `GET /left_workbench?mode=account` returns `status=left_workbench_commanded`.
- After command: `leftWorkbenchMode=account`, `agentPendingCommandCount=0`.
- Receipt: `status=handled_by_editor_loop`, `mode=view-drain`.

Additional finding resolved:

- Cached/non-UI endpoints such as `/commands` and `/state` remained responsive during the failure.
- Main-actor routes timed out because SwiftUI render/status paths were synchronously opening publication manifest files from disk.
- External-drive manifest reads are now kept off the UI/status hot path; explicit validators own that proof.

Current interpretation:

- The native AgentServer observation and command paths are no longer split for the tested routes.
- Do not regress this by adding synchronous file IO back into SwiftUI render/status paths.

## 2026-06-29 stale OAuth guidance cleanup

- `docs/coordination/google-oauth-redirect-uri-fix.md` now reflects the Firebase-first Nest architecture.
- The active Google OAuth redirect URI for Nest is `https://quipsly-reef.firebaseapp.com/__/auth/handler`.
- The old `https://nest.quipsly.com/api/auth/callback/google` path is documented as a compatibility/quarantine redirect only, not an OAuth client configuration target.
- This cleanup is intentionally small but important: future agents should not resurrect the retired NextAuth callback while trying to fix `redirect_uri_mismatch`.
- `scripts/quipsly-firebase-auth-config-check.mjs` now prints the Google Auth Platform console URL and `manualRedirectListCheckRequired: true` so `ok: true` is not mistaken for proof that the classic OAuth client redirect list has been repaired.
- `scripts/quipsly-public-auth-boundary-smoke.mjs` now provides a no-secret public smoke for `/login`, unauthenticated `/api/auth/session`, quarantined legacy auth routes, public Firebase client config, and unauthenticated native session-check.
- This new public smoke is intentionally not a replacement for credentialed login smoke; it is a fast guard against wrong-route regressions before operator/invited-user tests.
- `scripts/dev/quipsly-local-smoke.sh` now runs the structured public auth boundary smoke as part of local route smoke, so local and production checks share the same Firebase-first route expectations.
- The public auth boundary smoke also fails if the rendered `/login` page includes retired Auth.js route references such as `/api/auth/signin` or `/api/auth/callback/google`.
- `/api/auth/session` now returns a redacted onboarding receipt after session creation: `freePlanSlug`, `freeMembershipStatus`, `freeMembershipCreated`, and `homeNestSlug`.
- `scripts/quipsly-firebase-auth-smoke.mjs` now asserts that the free-tier onboarding receipt exists, reports `ACTIVE`, and matches the Home Nest returned by the session response.
- `/admin/auth-diagnostics` now includes a read-only "Current actor onboarding truth" panel. It checks the signed-in admin's app-owned User row, Firebase UID link, active `quipsly-free` membership, and active Home Nest access grant without creating or repairing records as a side effect.

## 2026-06-29 shared starter onboarding helper

- Starter account truth now lives in `apps/quipsly/src/lib/server/quipsly-onboarding.ts`.
- `ensureQuipslyStarterStateForUser()` owns the `quipsly-free` membership and Home Nest invariant.
- `/api/auth/session` uses the shared helper after Firebase identity verification.
- `/admin/users` create/update actions use the same helper, so admin-created users get free starter access and a Home Nest before first sign-in.
- `/admin/users` managed-user rows now show whether each user has active free-tier starter access and a Home Nest grant.
- `/admin/users` now offers a targeted "Repair free tier + Home Nest" action for existing app-owned users whose starter state predates the shared helper.
- Admin and Nest invite/grant paths use the same helper after creating/updating the app-owned User record, so invited users are not left as half-created app users while waiting for Firebase UID linking.
- `/admin/users` create/update and repair paths now search both `User.primaryEmail` and `UserAlias.email` before creating or repairing state. This preserves the app-owned identity invariant: one real email must not fork into duplicate Quipsly users just because it first appeared as an alias.
- Diagnostics remain read-only: onboarding creation belongs to login/admin/invite flows, not `/admin/auth-diagnostics`.

Validation after this slice:

```bash
corepack pnpm --filter quipsly exec tsc --noEmit --incremental false
node --check scripts/quipsly-firebase-auth-smoke.mjs
node --check scripts/quipsly-public-auth-boundary-smoke.mjs
bash -n scripts/dev/quipsly-local-smoke.sh
QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com node scripts/quipsly-public-auth-boundary-smoke.mjs
node scripts/quipsly-firebase-auth-config-check.mjs
```

All passed. The Firebase config checker still reports `manualRedirectListCheckRequired: true` because the classic Google OAuth web-client redirect URI list must be verified in Google Auth Platform.
