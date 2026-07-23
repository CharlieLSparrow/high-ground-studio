# Deploy Captain runbook

Last updated: 2026-06-29

Status: active operating pattern

## Mission

Deploy Captain owns release mechanics so Codex can keep building product during long waits.

This lane should run builds, schema syncs, Cloud Run deploys, and smoke checks. It should not make product changes unless specifically assigned.

## Current production surfaces

- Quipsly Nest app service: `studio`
- Region: `us-central1`
- Primary app URL: `https://nest.quipsly.com`
- Cloud Run fallback URL: `https://studio-hm2odnvjga-uc.a.run.app`
- Artifact repository: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio`
- Runtime Cloud SQL instance: `high-ground-odyssey:us-central1:studio-postgres`
- Runtime service account: `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`

## Runtime lane split

Deploy Captain is responsible for the Nest Web release lane only unless explicitly assigned otherwise.

- Nest Web: `apps/quipsly`, Cloud Run service `studio`, built inside Linux Cloud Build.
- Quipsly Mac: `apps/quipsly-mac`, native SwiftPM/macOS app, never part of the web Cloud Build context.
- Local Engine: `apps/local-engine`, local Node/WebSocket media worker, never part of the web Cloud Build context.
- Static app assets: currently bundled from `apps/quipsly/public`; do not exclude them from production web deploys until they have moved to object storage/CDN.

See `docs/quipsly/runtime-lanes-and-deploy.md` for the product/runtime boundary.

## Hard rules

- Never print secret values.
- Do not use `prisma db push --accept-data-loss` without explicit Codex/user approval.
- If broad Prisma db-push reports unrelated enum or unique-constraint drift, stop and ask for a narrow migration/sync plan.
- Product code changes belong to feature lanes. Deploy Captain reports failures with exact command, build id, error, and proposed fix.
- Cloud Build deploy steps currently may fail if the Cloud Build compute service account lacks Cloud Run permissions. Local authenticated `gcloud run deploy` is acceptable until IAM is fixed.
- Treat `gcloud run services update --set-secrets` as a full secret environment rewrite. Include every required mounted secret, not only the new one being added.
- Preserve existing Cloud Run env vars, secrets, Cloud SQL bindings, service account, and custom-domain assumptions when deploying a new image. Do not "simplify" a deploy command by dropping runtime config.
- Prefer preview/no-traffic deploy plus smoke before promotion unless Codex/user explicitly asks for a direct live rollout.

## 2026-06-07 pain update

Tonight's release failures were mostly release-mechanics failures, not product failures. Carry these lessons forward:

1. Preserve secrets on Cloud Run deploy.
   - `--set-secrets` replaces the secret env mapping with exactly what is passed.
   - If adding one secret such as `GEMINI_API_KEY`, include all required secrets in the command.
   - Use `gcloud run services describe studio --region=us-central1 --format=yaml` to inspect current env/secrets before changing them.
   - Never print secret values. It is safe to print secret names such as `studio-gemini-api-key`.

2. Do not use broad Prisma push as the default beta fix.
   - Broad `prisma db push` can collide with unrelated enum drift, unique constraints, or partially deployed additive work.
   - Broad push is acceptable only when Codex/user explicitly approves it and the diff is understood.
   - If the app needs one missing table/column, use the targeted schema sync pattern below.

3. Use targeted schema sync for live drift.
   - Add SQL or a narrow Node script that only creates/patches the specific additive shape needed.
   - Run it as a Cloud Run Job using the live service account, Cloud SQL binding, and `DATABASE_URL` secret.
   - Prefer `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
   - After execution, smoke the exact live route that failed. Do not assume the schema job fixed the app.

4. Google OAuth redirect must match the live app host.
   - For Nest auth, Google OAuth must include the `nest.quipsly.com` callback URL used by the app.
   - Keep `AUTH_URL=https://nest.quipsly.com` and `AUTH_TRUST_HOST=true` aligned with the deployed host.
   - If login loops, callback mismatch errors, or redirect-to-marketing behavior appears, inspect OAuth redirect configuration before debugging manuscript/editor code.

5. Chrome smoke is required for auth/session-sensitive routes.
   - CLI curl is enough for static routes and health endpoints.
   - Use Chrome for signed-in flows, admin tools, invite flows, and routes that depend on browser cookies.
   - Minimum Chrome smoke after a Nest deploy:
     - Open `https://nest.quipsly.com/projects`.
     - Confirm the app shell appears, not the marketing site.
     - Open `https://nest.quipsly.com/admin/users`.
     - Confirm only one top nav is visible.
     - Invite a safe test email to a known Nest and confirm no foreign-key error.
     - Open the assigned Nest/project and confirm it is visible after refresh.

6. Cloud Build context bloat is a release blocker.
   - Before `.gcloudignore` cleanup, `gcloud meta list-files-for-upload .` estimated `5700` files / `566.4 MiB`.
   - The biggest accidental upload was `apps/quipsly-mac/.build` at about `450.5 MiB`.
   - After ignoring local build products and non-deploy workspaces, upload estimate is `942` files / `113.5 MiB`.
   - If deploys become slow again, measure context size before blaming Cloud Build itself.

## 2026-06-28 Firebase auth hotfix update

Firebase-first auth uses a targeted hotfix lane when login is broken. Do not wait behind the full beta manifest release train to recover auth.

The hotfix deploy lane is intentionally noninteractive. It sets `CLOUDSDK_CORE_DISABLE_PROMPTS=1` and preflights `gcloud auth print-access-token` before typecheck/build/deploy so auth reauthentication failures do not hang mid-release.

Before starting an auth deploy, run the consolidated readiness check:

```bash
QUIPSLY_AUTH_READINESS_BASE_URL=https://nest.quipsly.com \
node scripts/quipsly-auth-readiness.mjs
```

This check does not print tokens, cookies, passwords, database URLs, or secret values. It verifies noninteractive gcloud user auth, Application Default Credentials, Firebase-first public route contracts, Firebase Admin preflight shape, native session route shape, and generated-smoke cleanup dry-run readiness. If it reports `blocked`, fix that layer before starting an expensive build. The point is to fail before Cloud Build, not forty minutes into a deploy.

If the only question is whether this machine is ready to operate Google Cloud after reauth, use the operator-only form:

```bash
node scripts/quipsly-auth-readiness.mjs --operator-only
```

That intentionally skips app-route checks and generated cleanup. It is the quick answer to "can this terminal deploy/smoke yet?"

If the only question is whether a local, preview, or live URL matches the public Firebase-first route contract, use the route-only form:

```bash
QUIPSLY_AUTH_READINESS_BASE_URL=http://127.0.0.1:3025 \
node scripts/quipsly-auth-readiness.mjs --route-only
```

Route-only skips gcloud/ADC and generated cleanup. A structured Firebase Admin `503` is acceptable in this mode because it proves the route shape and sanitized error boundary, not credential health. Do not use route-only as proof that auth is complete; it is a scoped public-boundary check.

Full readiness also runs a read-only app-owned identity integrity audit:

```bash
node scripts/quipsly-identity-integrity-audit.mjs
```

This checks for duplicate normalized emails, alias collisions, duplicate Firebase UIDs, duplicate normalized Nest grants/invites, active access grants without matching app users, orphaned live invites, and Firebase-linked users missing Home Nest/free tier before login is declared safe. It redacts emails by default. Do not use `--show-emails` in shared logs.

The targeted hotfix deploy lane runs this operator-only readiness gate by default before typecheck, local smoke, Cloud Build, Secret Manager, Artifact Registry, or Cloud Run operations. Do not disable it unless Codex/user explicitly accepts the risk for a one-off diagnostic run.

Production owner override is forbidden:

- `QUIPSLY_OWNER_OVERRIDE=true` is a localhost-only development wrench for keeping app surfaces inspectable while auth is under construction.
- It is not auth proof, not a beta access system, and not a Cloud Run recovery mechanism.
- `scripts/release/quipsly-hotfix-deploy.sh` refuses to start if the operator environment or `EXTRA_UPDATE_ENV_VARS` would set `QUIPSLY_OWNER_OVERRIDE=true`.
- `scripts/release/quipsly-release-preflight.sh` fails if the Cloud Run service already has `QUIPSLY_OWNER_OVERRIDE=true`.
- If a signed-out local smoke reports `local-owner-override`, treat that as a labeled development state. It does not satisfy production auth acceptance.

Use `docs/coordination/quipsly-auth-completion-audit.md` as the source checklist before declaring auth complete. The cutover status log records work history; the completion audit records the remaining proof obligations.

Current auth-front-door expectation:

- `/login` must support Google sign-in, email/password sign-in, email/password free-account creation, and password reset copy.
- Email/password creation is not a separate Quipsly account system. It creates a Firebase user, then `/api/auth/session` creates/links the app-owned Quipsly user, free tier, and Home Nest.
- Smoke copy should not describe email/password as admin-created only.
- If Google OAuth is blocked by `redirect_uri_mismatch`, do not treat that as total auth failure until email/password creation/sign-in and session onboarding have been checked.
- `/api/auth/firebase-admin-preflight` is the sanitized Firebase Admin reachability check. It must not expose users or credentials; it only proves the server can make an Admin SDK call.
- `/admin/auth-diagnostics` includes a matching admin-only "Firebase Admin live proof" section for human operators. Use it to distinguish missing/stale server Firebase credentials from Google OAuth redirect issues.
- Use `scripts/quipsly-generated-self-serve-account-smoke.mjs` to prove a disposable public email/password signup path. It creates a `codex-signup-xxxxxxxx@dev.test` Firebase user through Identity Toolkit, calls Quipsly `/api/auth/session`, verifies Home Nest/free-tier onboarding and signed-in routes, checks native bearer-token session shape, then cleans up generated artifacts.
- The self-serve signup smoke calls `/api/auth/firebase-admin-preflight` before creating a generated Firebase user. If the preflight returns `503`, fix server credentials before rerunning instead of creating test users.
- If this smoke fails locally with `Firebase Admin credential unavailable` and `invalid_rapt`, refresh Application Default Credentials before blaming product code:

```bash
gcloud auth application-default login --project high-ground-odyssey
```

- The self-serve signup smoke has a REST cleanup fallback for its current generated Firebase user, but broad cleanup of older generated signup leftovers still requires healthy Firebase Admin credentials or console cleanup.

Use:

```bash
IMAGE_TAG="firebase-auth-$(date +%Y%m%d-%H%M%S)" \
PREVIEW_TAG="quipsly-firebase-auth" \
SOURCE_SHA="firebase-auth-local" \
REGION=us-central1 \
PROJECT_ID=high-ground-odyssey \
RUN_TYPECHECK=1 \
RUN_LOCAL_SMOKE=1 \
LOCAL_TARGET_URL=http://localhost:3025 \
QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=1 \
RUN_GENERATED_INVITE_SMOKE=1 \
RUN_GENERATED_SELF_SERVE_SMOKE=1 \
QUIPSLY_ADMIN_EMAILS=<operator email list> \
QUIPSLY_AUTH_SMOKE_EMAIL=<operator email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<operator password> \
bash scripts/release/quipsly-hotfix-deploy.sh
```

Rules for this lane:

- Preview first, always.
- Smoke the preview before promotion.
- Promote the exact smoked tag with `gcloud run services update-traffic ... --to-tags=quipsly-firebase-auth=100`.
- Smoke live immediately after promotion.
- Keep `QUIPSLY_ADMIN_EMAILS` explicit for operator accounts; Charlie is still covered by code fallback, but Codex/operator smoke is not.
- Do not print operator passwords, Firebase tokens, cookies, service-account keys, or database URLs.
- `scripts/quipsly-firebase-auth-smoke.mjs` supports admin/operator smoke by default and normal invited-user smoke with `QUIPSLY_AUTH_SMOKE_EXPECT_ADMIN=0`.
- `scripts/quipsly-invited-user-smoke-setup.mjs` only mutates `@dev.test` users and is for proving invited-user linking.
- `RUN_GENERATED_INVITE_SMOKE=1` makes the hotfix deploy lane run `scripts/quipsly-generated-invited-user-smoke.mjs` against local, preview, and live targets. It generates a safe `@dev.test` Firebase user, writes the raw invite token only to a private temp file, and deletes that file after the smoke.
- `RUN_GENERATED_SELF_SERVE_SMOKE=1` makes the hotfix deploy lane run `scripts/quipsly-generated-self-serve-account-smoke.mjs` against local, preview, and live targets. It creates a generated `codex-signup-xxxxxxxx@dev.test` Firebase email/password user, proves Quipsly session creation plus free-tier/Home Nest onboarding, checks signed-in routes and native bearer-token session shape, then deletes generated artifacts.
- For remote preview/live targets, generated self-serve smoke reads the deployed `studio-database-url` secret and uses Cloud SQL Auth Proxy when needed, so cleanup targets the same database used by Cloud Run.
- Invite login links are navigation/context, not identity proof. `/login?inviteToken=qinv_...` must explain Invite mode, and `/api/auth/session` may only accept an invite after Firebase verifies the same invited email.
- `scripts/dev/quipsly-local-smoke.sh` must keep asserting the invite-mode copy so this does not regress silently.
- For credentialed invited-user smoke, have `scripts/quipsly-invited-user-smoke-setup.mjs` write the raw invite token to a private `0600` file with `QUIPSLY_INVITE_SMOKE_TOKEN_FILE`, then pass that path to `scripts/quipsly-firebase-auth-smoke.mjs` as `QUIPSLY_AUTH_SMOKE_INVITE_TOKEN_FILE`. Do not print the raw invite token.
- `/admin/auth-diagnostics` is the admin-only redacted health surface for this lane. Use it for configuration shape and route-contract sanity, not as proof of completed Google chooser or production smoke.
- Do not discover a Quipsly auth smoke target by `/api/health` alone. A partial/stale dev target can answer health while `/projects` or `/api/mac/session-check` is missing. Current smoke discovery must require the app shell and, unless explicitly skipped, native session-check route shape.
- Legacy `/api/auth/signin` and `/api/auth/callback/google` must redirect to the public app host `/login?callbackUrl=%2Fprojects`; never accept `0.0.0.0:8080` redirects as "mostly fine."
- `/api/mac/session-check` is the native Firebase bearer-token proof route. Unauthenticated preview smoke should return `401`; authenticated `scripts/quipsly-firebase-auth-smoke.mjs` should report `nativeSessionCheck: pass`.
- The hotfix Cloud Build config currently uses `E2_HIGHCPU_32`; `E2_HIGHCPU_8` hit exit `137` during Next/Turbopack build.
- If local operator scripts need production DB access, use Cloud SQL Auth Proxy with `--quota-project high-ground-odyssey`; the Firebase project is `quipsly-reef`, but the database project is `high-ground-odyssey`.

## 2026-06-29 Firebase auth promotion evidence and generated invite smoke rules

Production auth was promoted through the targeted hotfix lane with the current cleanup-smoke image:

- Image tag: `firebase-auth-clean-smoke-20260629-025755`
- Preview/live tag: `quipsly-firebase-auth`
- Production revision: `studio-00324-qim`
- Production URL: `https://nest.quipsly.com`
- Build ID: `74def4b3-8fe9-4121-a505-757e307578a3`

Required proof passed before and after promotion:

- Route smoke on preview.
- Generated `@dev.test` invited-user smoke on preview.
- Route smoke on production.
- Generated `@dev.test` invited-user smoke on production.
- Generated smoke artifact cleanup on preview and production.
- Chrome-visible email/password login and sign-out on production.

The generated invited-user smoke proved:

- Firebase email/password login.
- Quipsly session cookie creation.
- Native bearer-token session check.
- Home Nest auto-creation.
- Invite acceptance into `marine-biology-research`.
- `/projects`, `/account/switch`, `/nests/<home-nest>`, and `/create?project=<home-nest>`.
- Logout.
- Cleanup deleted the generated Firebase user, generated Quipsly user, generated Home Nest, generated grants, and generated invite after the smoke completed.

The browser-visible production check proved:

- Signed-out `/projects` shows the Nest sign-in explainer.
- `/login?callbackUrl=/projects` shows Google sign-in and direct email/password sign-in.
- Safe operator email/password login lands on `/projects`.
- Home Vault is actor-specific for admin/operator users and no longer chooses another user's generated Home Nest.
- Sign-out returns to the signed-out Nest explainer.

Operational lessons:

- Do not print or shell-expand `AUTH_SECRET`.
- For remote generated invite smoke, read `studio-auth-secret` from Secret Manager into a `0600` temp file and pass it as `AUTH_SECRET_FILE`.
- Passing `AUTH_SECRET` through command substitution can strip significant trailing newline bytes and cause invite-token HMAC mismatches.
- The production `DATABASE_URL` secret uses a Cloud SQL socket-style URL. Local smoke must run Cloud SQL Auth Proxy and rewrite the socket URL to loopback only inside the smoke process.
- The hotfix script now supports `GENERATED_INVITE_SMOKE_DB_TIMEOUT_MS` for remote Prisma connection latency. Default is `30000`.
- Generated smoke retries safe DB setup phases, but it does not retry away a failed invite-acceptance assertion. If `inviteAcceptance` fails, treat it as an auth logic issue.
- Temporary invite-token and auth-secret files must be removed on success and error branches.
- Generated smoke cleanup is on by default. Use `QUIPSLY_GENERATED_SMOKE_KEEP_ARTIFACTS=1` only when intentionally preserving failed artifacts for debugging.
- Use `scripts/quipsly-clean-generated-smoke-artifacts.mjs` for old generated-smoke cleanup. It is dry-run by default and only targets `codex-invite-xxxxxxxx@dev.test` users plus matching generated Home Nests.

Admin starter-repair hotfix promoted later the same day:

- Image tag: `firebase-auth-admin-repair-20260629-053753`
- Preview/live tag: `quipsly-firebase-auth`
- Production revision: `studio-00327-kes`
- Cloud Build ID: `dd95f4aa-9c92-462a-ae2b-0347c7fdf979`
- Production URL: `https://nest.quipsly.com`
- Proof passed: local route smoke, local generated invited-user smoke, preview route smoke, preview generated invited-user smoke into `marine-biology-research`, production route smoke, production generated invited-user smoke into `marine-biology-research`, and generated cleanup after each generated smoke.
- Payload: `/admin/users` targeted starter repair plus alias-safe admin create/update/repair lookup. Firebase proof, admin-created users, invites, and repairs must converge into one app-owned user by email rather than creating duplicate people.

Native onboarding hotfix promoted later the same day:

- Image tag: `firebase-native-onboarding-20260629-060816`
- Preview/live tag: `quipsly-firebase-auth`
- Production revision: `studio-00330-wic`
- Cloud Build ID: `433f3976-f0c5-47b5-b779-eb61adf0527a`
- Production URL: `https://nest.quipsly.com`
- Payload: `/api/mac/session-check` now uses shared starter onboarding and returns redacted free-tier/Home Nest onboarding receipt. QuipslyStudio native account state and native smoke now require `freeTierStatus`.
- Proof passed: local typecheck, route smoke, generated invited-user smoke with native onboarding assertion, QuipslyStudio build/run verify, native account control-plane smoke, preview route smoke, preview generated invited-user smoke, production route smoke, production generated invited-user smoke, generated cleanup, and Cloud Run error check with no fresh `studio-00330-wic` errors.

Remote generated-invite smoke trap:

- Do not run `scripts/quipsly-generated-invited-user-smoke.mjs` directly against a remote preview/live URL while using local `.env` `DATABASE_URL`.
- Cloud Run uses `studio-database-url` and `studio-auth-secret` from Secret Manager. Local `.env` may point at a different database, which creates a valid-looking invite that the deployed app will never see.
- Use `scripts/release/quipsly-hotfix-deploy.sh` with `RUN_GENERATED_INVITE_SMOKE=1` for preview/live auth releases. It reads the deployed DB/auth secrets without printing values, starts Cloud SQL Auth Proxy with `--quota-project high-ground-odyssey`, rewrites the socket URL to loopback inside the smoke process, and cleans up generated users.
- If a direct manual remote smoke is unavoidable, first prove the setup side is using the same Secret Manager-backed DB target and auth secret as Cloud Run. Otherwise an `acceptedInvite` failure may be a test-target mismatch, not app auth failure.

No-build promote command shape:

```bash
IMAGE_TAG="firebase-auth-clean-smoke-20260629-025755" \
PREVIEW_TAG="quipsly-firebase-auth" \
SOURCE_SHA="firebase-auth-clean-smoke" \
REGION=us-central1 \
PROJECT_ID=high-ground-odyssey \
RUN_TYPECHECK=0 \
RUN_LOCAL_SMOKE=0 \
RUN_GENERATED_INVITE_SMOKE=1 \
QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=1 \
SKIP_CLOUD_BUILD=1 \
PROMOTE=1 \
bash scripts/release/quipsly-hotfix-deploy.sh
```

## 2026-06-29 native-app auth/control-plane lesson

When validating QuipslyStudio or native Mac auth, separate these layers:

1. Cached AgentServer health/state endpoints.
2. Main-actor command endpoints.
3. Firebase/backend session exchange routes.
4. Human-visible Account workbench UX.

Observed failure:

- `/health`, `/commands`, and cached `/state` were responsive.
- `/playback` and other main-actor routes timed out.
- This looked like native auth or command-bus failure, but the sampled main thread was blocked in SwiftUI render/status work while opening publication-ready manifest files from disk.

Operating rule:

- Do not perform synchronous file IO from SwiftUI render/status paths, especially against `/Volumes/*`.
- External-drive export/package truth belongs to explicit validators and review-board scripts, not always-on UI/status refresh.
- If native app auth/control looks stuck, smoke both a cached endpoint and a main-actor endpoint before touching Firebase/OAuth again.

Useful local smoke:

```bash
cd apps/QuipslyStudio
./script/build_and_run.sh --verify

curl --max-time 5 -fsS 'http://127.0.0.1:8080/health'
curl --max-time 5 -fsS 'http://127.0.0.1:8080/playback?mode=edit&action=pause'
curl --max-time 5 -fsS 'http://127.0.0.1:8080/left_workbench?mode=account'
sleep 1.2
./script/agentctl.sh state

# Preferred repeatable native Account/control-plane check.
./script/smoke_native_account_control_plane.sh
```

Native account command hardening added 2026-06-29:

- Use `GET /native_account?action=config|check_saved|sign_in|clear|status` for agent-driven Account workbench checks.
- Sensitive command values are redacted from AgentServer receipts before and after the mounted editor drains the command.
- For credentialed native smoke, pass credentials only through environment variables:
  - `QUIPSLY_NATIVE_SMOKE_EMAIL`
  - `QUIPSLY_NATIVE_SMOKE_PASSWORD`
  - or the existing `QUIPSLY_AUTH_SMOKE_EMAIL` / `QUIPSLY_AUTH_SMOKE_PASSWORD`
- Do not paste passwords into terminal commands, docs, screenshots, or deploy logs.
- Credential-free smoke still proves route registration, command drain, redaction, and Firebase client config reachability.
- Preferred local credential workflow uses macOS Keychain instead of shell-history passwords:

```bash
cd apps/QuipslyStudio
QUIPSLY_NATIVE_SMOKE_EMAIL=<safe-test-email> ./script/save_native_smoke_credentials_to_keychain.sh
QUIPSLY_NATIVE_SMOKE_EMAIL=<safe-test-email> ./script/smoke_native_account_control_plane_from_keychain.sh
```

- The save script prompts for the password with terminal echo disabled, stores it under Keychain service `quipsly-native-smoke`, and does not print it.
- The from-Keychain smoke reads the password only into the subprocess environment for `smoke_native_account_control_plane.sh`.
- Use `QUIPSLY_NATIVE_SMOKE_KEYCHAIN_SERVICE=<service-name>` if a separate test credential slot is needed.

Current Google chooser console blocker:

- If Chrome Google login shows `redirect_uri_mismatch`, verify the OAuth web client contains:
  - `https://quipsly-reef.firebaseapp.com/__/auth/handler`
- Current Google client to check:
  - `659427658635-h633re67ab05kmgnpkcnq5rdhhb4umqn.apps.googleusercontent.com`
- The app should use the Firebase handler; do not "fix" this by reintroducing Auth.js callback paths.

Passing native command proof includes:

- `leftWorkbenchMode=account`
- `agentPendingCommandCount=0`
- `agentLastCommandReceipt.status=handled_by_editor_loop`

## Standard app image build

Preferred path: use the Quipsly web deploy script. It stages a complete web-only context and deploys the new image without rewriting Cloud Run env/secrets.

Before spending time on Cloud Build, run the local release preflight:

```bash
REGION=us-central1 PROJECT_ID=high-ground-odyssey scripts/release/quipsly-release-preflight.sh
```

This catches expired `gcloud` auth, missing Cloud Run access, dirty working trees, release script syntax errors, and missing service visibility before a long deploy starts.

Do not use `local-engine-uploader@high-ground-odyssey.iam.gserviceaccount.com` as the deploy account. It can authenticate to the project for local/media workflows, but it does not have Cloud Run or Cloud Build deploy visibility. A real deploy captain account must at minimum pass `scripts/release/quipsly-release-preflight.sh`, including `run.services.get` on the `studio` Cloud Run service and Cloud Build access.

```bash
TAG="quipsly-live-$(date +%Y%m%d-%H%M%S)"
IMAGE_TAG="$TAG" scripts/quipsly-web-deploy.sh
```

For build-only/manual image workflows, use the Quipsly-named image-only Cloud Build config:

```bash
TAG="quipsly-live-$(date +%Y%m%d-%H%M%S)"
gcloud builds submit \
  --config cloudbuild.quipsly-web.yaml \
  --substitutions _IMAGE_TAG="$TAG",_NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app,_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app .
```

Expected output:

- Cloud Build status `SUCCESS`
- Image exists at `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:$TAG`
- Build route list includes the feature route being shipped when applicable.

## Standard local authenticated deploy

```bash
IMAGE="us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:$TAG"
gcloud run deploy studio \
  --image="$IMAGE" \
  --region=us-central1 \
  --add-cloudsql-instances=high-ground-odyssey:us-central1:studio-postgres \
  --update-env-vars=NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app,STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app \
  --quiet
```

Expected output:

- New `studio-*` revision deployed.
- 100 percent traffic routed to the new revision.

## Required studio runtime secrets

When updating secret mounts, include the full set.

Firebase-first auth note:

- `quipsly-reef` is the active Firebase identity project.
- The Nest Cloud Run service runs in `high-ground-odyssey`.
- Preferred production session exchange uses cross-project IAM: grant `roles/firebaseauth.admin` on `quipsly-reef` to `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`.
- Explicit Firebase Admin private-key secrets are fallback only. Do not add long-lived Firebase private keys if the runtime service account IAM path works.
- Do not deploy Firebase-first auth unless `/api/auth/session` can verify Firebase tokens and create Firebase session cookies in the target runtime.

```bash
--set-secrets=AUTH_SECRET=studio-auth-secret:latest,GOOGLE_CLIENT_SECRET=studio-google-client-secret:latest,STUDIO_ALLOWED_EMAILS=studio-allowed-emails:latest,DATABASE_URL=studio-database-url:latest,GEMINI_API_KEY=studio-gemini-api-key:latest,PATREON_CLIENT_ID=studio-patreon-client-id:latest,PATREON_CLIENT_SECRET=studio-patreon-client-secret:latest,NEXTAUTH_SECRET=studio-nextauth-secret:latest,PATREON_WEBHOOK_SECRET=studio-patreon-webhook-secret:latest,PATREON_RECONCILE_SECRET=studio-patreon-reconcile-secret:latest
```

Runtime env should also include:

```bash
FIREBASE_PROJECT_ID=quipsly-reef
AUTH_URL=https://nest.quipsly.com
AUTH_TRUST_HOST=true
STUDIO_AUTH_MODE=allowlist
GOOGLE_CLIENT_ID=659427658635-h633re67ab05kmgnpkcnq5rdhhb4umqn.apps.googleusercontent.com
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=quipsly-reef.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=quipsly-reef
NEXT_PUBLIC_FIREBASE_API_KEY=<public Firebase web API key>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<quipsly reef storage bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<public Firebase sender id>
NEXT_PUBLIC_FIREBASE_APP_ID=<public Firebase app id>
NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app
STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app
```

Current Firebase-first production setup evidence:

- `studio` Cloud Run has `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_*` env vars set as literals.
- `studio` Cloud Run preserves `DATABASE_URL` as the `studio-database-url` secret.
- `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com` has `roles/firebaseauth.admin` on `quipsly-reef`.
- Do not treat missing `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` as a blocker when the IAM path is verified.
- Firebase Auth project config must include `nest.quipsly.com` in authorized domains.
- Firebase Auth Google provider `google.com` must exist and be enabled.
- The Google Auth Platform web OAuth client behind `studio-google-client-id` must include this authorized redirect URI:

```text
https://quipsly-reef.firebaseapp.com/__/auth/handler
```

- If Chrome Google sign-in says `auth/unauthorized-domain`, fix Firebase Auth authorized domains.
- If Chrome Google sign-in says `auth/operation-not-allowed`, create/enable the Firebase Google provider.
- If Google says `redirect_uri_mismatch`, fix the Google Auth Platform OAuth client redirect URI above.
- Check the first two layers without printing secrets:

```bash
node scripts/quipsly-firebase-auth-config-check.mjs
```

- The script can return `ok: true` while browser Google login is still blocked by `redirect_uri_mismatch`, because Google Auth Platform OAuth redirect URI lists are outside the Firebase Identity Toolkit config API it checks.
- Treat `googleOAuthClient.manualRedirectListCheckRequired: true` as intentional. It means a human/operator still has to verify the web OAuth client redirect list in the console URL printed by the script.

- Admins can also open `/admin/auth-diagnostics` in Quipsly. The page is redacted and shows the exact Firebase handler URI required by Google Auth Platform.
- `/admin/auth-diagnostics` also includes read-only current-actor onboarding truth: app-owned User row, Firebase UID link, active `quipsly-free` membership, and active Home Nest access grant. This panel must not create records; missing rows are diagnostic evidence, not a reason for the diagnostics page to mutate state.

Manual OAuth redirect repair checklist:

1. Open Google Auth Platform clients for the `high-ground-odyssey` project:

```text
https://console.cloud.google.com/auth/clients?project=high-ground-odyssey
```

2. Use a browser account with project console access. Terminal access alone is not enough if Chrome is logged into a different Google account.
3. Open the Web OAuth client used by the `studio-google-client-id` Secret Manager secret.
4. Add this exact authorized redirect URI:

```text
https://quipsly-reef.firebaseapp.com/__/auth/handler
```

5. Save.
6. Retest `https://nest.quipsly.com/login?callbackUrl=/projects` -> `Sign in with Google`.
7. Success boundary is either the Google chooser/consent screen or a completed return to `/projects`. Failure boundary should no longer be `auth/unauthorized-domain`, `auth/operation-not-allowed`, or `redirect_uri_mismatch`.

Observed 2026-06-29 failure sequence:

- Before Firebase config repair: `auth/unauthorized-domain`.
- After adding `nest.quipsly.com`: `auth/operation-not-allowed`.
- After enabling Firebase Google provider: Google `redirect_uri_mismatch`.
- Remaining repair: add the Firebase handler URI above to the OAuth client.

Local development dependency note:

- The local Firebase login smoke can pass while session creation fails if Postgres is unavailable.
- `/api/auth/session` should return `503 Quipsly database unavailable` for local DB outages, not `401 Unauthorized`.
- `/api/auth/session` should return `503 Firebase Admin credential unavailable` when local ADC or production runtime identity cannot mint Firebase session cookies.
- If Docker Desktop hangs or logs image-store input/output errors, repair Docker/Postgres before diagnosing auth code.
- If `gcloud` reports `Reauthentication failed. cannot prompt during non-interactive execution`, run `gcloud auth login` before deploy/promotion. Do not interpret that as a Cloud Build or app-code failure.
- When running local scripts against the production Cloud SQL socket URL with Cloud SQL Proxy, pass `--quota-project high-ground-odyssey`.
- Without that flag, local ADC may make Cloud SQL Proxy charge the Firebase project (`quipsly-reef`) and fail with `Cloud SQL Admin API has not been used in project quipsly-reef`.

Auth smoke after deploy:

Public no-secret boundary smoke:

```bash
QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com \
node scripts/quipsly-public-auth-boundary-smoke.mjs
```

This smoke does not log in. It proves the public auth surface is sane before credentialed tests:

- `/login` renders the Firebase-first login page.
- `/login` does not render retired Auth.js route references.
- `/api/auth/session` returns clean unauthenticated `401`.
- legacy `/api/auth/signin` redirects to `/login?callbackUrl=/projects`.
- legacy `/api/auth/callback/google` redirects to `/login?callbackUrl=/projects`.
- `/api/mac/firebase-client-config` returns public Firebase client config.
- `/api/mac/session-check` returns clean unauthenticated `401`.

It does not prove Google browser login, email/password login, invited-user linking, Home Nest creation, or native saved-session UX.

Credentialed Firebase smoke:

```bash
QUIPSLY_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com \
QUIPSLY_AUTH_SMOKE_EMAIL=<operator email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<operator password> \
node scripts/quipsly-firebase-auth-smoke.mjs
```

This smoke proves Firebase email/password login, Quipsly session-cookie creation, `/api/auth/session`, Home Nest creation/visibility, free-tier onboarding receipt, route access, optional invite acceptance, optional native bearer-token session check, and logout.

Starter account invariant:

- Preauthorized/admin-created users are not authenticated until Firebase proves identity.
- They should still be starter-ready: app-owned User row, active `quipsly-free` membership, and private Home Nest access.
- Shared implementation: `apps/quipsly/src/lib/server/quipsly-onboarding.ts`.
- Call `ensureQuipslyStarterStateForUser()` from trusted onboarding surfaces only: Firebase session creation, admin user create/update, and invite/grant creation.
- Do not call it from read-only diagnostics pages or broad access-check helpers.
- `/admin/users` should show starter readiness directly on managed-user rows: Firebase link state, free-tier membership state, and Home Nest grant state.
- If an older app-owned user is missing starter state, use the targeted `/admin/users` repair action for that user. Do not add side effects to diagnostics or access-check helpers to hide old data drift.
- Admin create/update and starter-repair actions should search both `User.primaryEmail` and `UserAlias.email` before creating or repairing state. This prevents the same human email from becoming two app-owned Quipsly users during invite/admin recovery.

Scripted operator smoke:

```bash
QUIPSLY_AUTH_SMOKE_BASE_URL=https://nest.quipsly.com \
QUIPSLY_AUTH_SMOKE_EMAIL=<operator email> \
QUIPSLY_AUTH_SMOKE_PASSWORD=<operator password> \
node scripts/quipsly-firebase-auth-smoke.mjs
```

Local scripted smoke:

- `scripts/dev/quipsly-local-smoke.sh` now discovers common Quipsly dev ports before falling back to the historical `127.0.0.1:3012`.

Generated invited-user production smoke:

- Use this when you need authenticated production proof without a human password.
- It creates a generated `codex-invite-xxxxxxxx@dev.test` Firebase user, app user, invite, access grant, Home Nest, session, native session check, and then cleans all generated artifacts.
- Required setup:
  - production `DATABASE_URL` from `studio-database-url`,
  - `AUTH_SECRET_FILE` from `studio-auth-secret`,
  - `NEXT_PUBLIC_FIREBASE_API_KEY` from Cloud Run public env,
  - Cloud SQL Proxy pointed at the instance from the DB URL with `--quota-project high-ground-odyssey`,
  - `QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT` matching the proxy port.

```bash
node scripts/quipsly-generated-invited-user-smoke.mjs
```
- `scripts/quipsly-firebase-auth-smoke.mjs` also discovers a reachable local base URL when `QUIPSLY_AUTH_SMOKE_BASE_URL` is omitted.
- Still pass `QUIPSLY_AUTH_SMOKE_BASE_URL` explicitly for preview/live smokes so production proof cannot accidentally hit a local server.

Manual smoke:

1. Open `https://nest.quipsly.com/login`.
2. Sign in with the Codex/operator test identity or Google.
3. Confirm `/api/auth/session` can create a server session.
4. Confirm `/projects` opens without the sign-in gate.
5. Confirm the user has a Home Nest.
6. Confirm `/create?project=<home-nest-slug>` opens.
7. Confirm `/admin/users` works for a configured admin.
8. Confirm sign-out removes the session and the next `/projects` visit shows the sign-in gate.

## Narrow schema sync pattern

Use this when one additive feature needs tables and broad Prisma db-push is unsafe due unrelated drift.

1. Add a narrow script under `scripts/`.
2. Copy it into `ops/prisma-migrate.Dockerfile`.
3. Build a schema image:

```bash
TAG="quipsly-schema-$(date +%Y%m%d-%H%M%S)"
gcloud builds submit \
  --config cloudbuild.prisma-migrate.yaml \
  --substitutions _IMAGE_TAG="$TAG" .
```

4. Deploy and execute a Cloud Run Job:

```bash
IMAGE="us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-migrate:$TAG"
gcloud run jobs deploy quipsly-schema-sync \
  --image="$IMAGE" \
  --region=us-central1 \
  --service-account=studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com \
  --set-cloudsql-instances=high-ground-odyssey:us-central1:studio-postgres \
  --set-secrets=DATABASE_URL=studio-database-url:latest \
  --command=node \
  --args=scripts/<script-name>.mjs \
  --tasks=1 \
  --max-retries=0 \
  --quiet

gcloud run jobs execute quipsly-schema-sync --region=us-central1 --wait
```

After a schema job:

```bash
gcloud run jobs executions list --job=quipsly-schema-sync --region=us-central1 --limit=3
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="quipsly-schema-sync"' --limit=50 --format='value(textPayload)'
```

Expected:

- Job execution succeeds.
- Logs do not print secrets.
- The previously failing live route no longer reports missing table/column errors.

## Quipsly production-core schema sync

The production-core pass added first-class tables for Nest invites, asset attachments, source units, document operations, production rooms, timeline versions, output packets, publish attempts, published artifacts, workflow jobs, and native Mac auth/session handoff. A green readiness response is therefore also the preflight check for `/api/mac/session-exchange`, `/api/mac/session-refresh`, and `/api/mac/session-check`.

Do not deploy app code that depends on these tables until the live database passes:

```bash
curl -sS https://nest.quipsly.com/api/production-core/readiness
```

Expected ready response:

```json
{
  "ok": true,
  "status": "ready"
}
```

If the response says `needs-schema-sync`, run the targeted schema job:

```bash
TAG="quipsly-production-core-schema-$(date +%Y%m%d-%H%M%S)"
gcloud builds submit \
  --config cloudbuild.prisma-migrate.yaml \
  --substitutions _IMAGE_TAG="$TAG" .

IMAGE="us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-migrate:$TAG"
gcloud run jobs deploy quipsly-production-core-schema-sync \
  --image="$IMAGE" \
  --region=us-central1 \
  --service-account=studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com \
  --set-cloudsql-instances=high-ground-odyssey:us-central1:studio-postgres \
  --set-secrets=DATABASE_URL=studio-database-url:latest \
  --command=node \
  --args=scripts/quipsly-production-core-schema-sync.mjs \
  --tasks=1 \
  --max-retries=0 \
  --quiet

gcloud run jobs execute quipsly-production-core-schema-sync --region=us-central1 --wait
```

Then verify:

```bash
curl -sS https://nest.quipsly.com/api/production-core/readiness
```

The schema script applies only `ops/quipsly-production-core-additive.sql`. It does not run broad `prisma db push`, does not drop tables, and does not print secret values.

## Smoke checklist

Run these after deploy:

```bash
PREVIEW_URL=<preview-or-live-url> HOST_HEADER=nest.quipsly.com bash scripts/release/quipsly-smoke-preview.sh
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://nest.quipsly.com
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://quipsly.com/quipsly-app-icon.png
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://studio-hm2odnvjga-uc.a.run.app/projects
```

Expected:

- `https://nest.quipsly.com/projects 200`
- Quipsly static assets return `200`
- Studio fallback `/projects` returns a non-500 status.
- `quipsly-smoke-preview.sh` passes `/api/production-core/readiness` and confirms `/api/mac/session-check` returns an expected unauthenticated `401`, not a `500`.

Then run a Chrome smoke for anything auth, admin, invite, editor, or chat related. Curl cannot prove those flows.

## Context-size check

Run this before starting a release if upload time feels suspicious:

```bash
tmp=/tmp/quipsly-gcloud-upload.txt
gcloud meta list-files-for-upload . > "$tmp"
python3 - "$tmp" <<'PY'
import os, sys
count = 0
total = 0
for raw in open(sys.argv[1]):
    p = raw.strip()
    if p and os.path.isfile(p):
        count += 1
        total += os.path.getsize(p)
print(f"files={count}")
print(f"mib={total/1024/1024:.1f}")
PY
```

If it is much higher than roughly `115 MiB`, inspect large included folders before deploying:

```bash
python3 - "$tmp" <<'PY'
import os, sys, collections
sizes = collections.Counter()
for raw in open(sys.argv[1]):
    p = raw.strip()
    if p and os.path.isfile(p):
        sizes[p.split(os.sep, 1)[0]] += os.path.getsize(p)
for name, size in sizes.most_common(20):
    print(f"{size/1024/1024:8.1f} MiB  {name}")
PY
```

## Pipeline improvement backlog

- Keep full-repo Cloud Build context near the current `113.5 MiB` measured upload estimate; investigate if it grows materially.
- Prefer `scripts/quipsly-web-deploy.sh` for Nest Web releases so Mac/local-engine artifacts cannot enter the release context.
- Do not use assetless/partial public deploy contexts. If public assets make deploys too slow, move them to GCS/CDN first.
- Fix Cloud Build service account IAM for Cloud Run deploy or remove the broken deploy step from `cloudbuild.studio.deploy.yaml`.
- Split schema jobs into smaller docker contexts so additive DB syncs do not pay the full app build tax.
- Add a release report template under `docs/coordination/antigravity-reports/AG-Deploy-Captain.md`.

## Native Mac auth/control smoke note

Do not treat backend `/api/mac/session-check` success as proof that the native QuipslyStudio auth UI is usable.

Required native command smoke:

```bash
cd apps/QuipslyStudio
./script/build_and_run.sh --verify
/usr/bin/curl --max-time 5 -fsS 'http://127.0.0.1:8080/left_workbench?mode=account'
./script/agentctl.sh state
```

Expected proof:

- `leftWorkbenchMode` becomes `account`
- `agentPendingCommandCount` returns to `0`
- `agentLastCommandReceipt.status` is handled/delivered, not only queued
- Account/session UI can then call the live backend session-check route

Known failure as of 2026-06-28:

- Cached endpoints `/commands` and `/state` are responsive.
- UI-mutating endpoints that wait on `Task { @MainActor }` can time out.
- `/left_workbench?mode=account` can acknowledge while still leaving `/state.leftWorkbenchMode=inspector`.

Treat that as a native command-server architecture blocker, not a Firebase backend blocker.
