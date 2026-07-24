# Quipsly Nest Local Development

Use this lane to develop and dogfood `nest.quipsly.com` without depending on
Cloud Run, production Firebase Auth, or an active Google Cloud billing account.
It is local proof only; it does not prove production deployment or TestFlight.

## Services and ports

- PostgreSQL: `127.0.0.1:5432`
- Firebase Auth emulator: `127.0.0.1:9099`
- Quipsly Nest: `127.0.0.1:3012`

Port `3012` is the repository convention for Nest so another local product can
continue using the common port `3000`.

## Check the lane before changing code

From the repository root:

```bash
pnpm quipsly:local:up
pnpm quipsly:local:doctor
```

The launcher starts or safely reuses PostgreSQL, the loopback-only Firebase Auth
emulator, and Nest. It keeps logs and process ownership receipts under
`.tmp/quipsly-local/`. The doctor verifies those services without reading or
printing credentials and confirms the retired localhost owner override cannot
re-enter runtime authorization. It also summarizes changed paths by product
surface so a Nest change is not accidentally committed with unrelated Studio,
media, iPhone, or HGO work.

Stop only the app processes started by the launcher:

```bash
pnpm quipsly:local:down
```

The stop command validates each recorded process and working directory before
sending a signal. It deliberately leaves PostgreSQL running so local notes,
tasks, goals, tags, and test accounts are preserved.

This repository is preservation-sensitive. When the doctor reports a dirty
worktree:

- stage only explicit paths for one coherent slice;
- inspect `git diff --cached` before committing;
- keep untracked work visible until its owner and purpose are understood;
- do not use broad `git add`, `git reset`, `git clean`, or checkout commands.

## 1. Start and protect the local database

From the repository root:

```bash
docker compose up -d postgres
mkdir -p .tmp/backups
pg_dump \
  --format=custom \
  --file=".tmp/backups/quipsly-local-before-schema-$(date +%Y%m%d-%H%M%S).dump" \
  postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio
pnpm db:generate
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  pnpm exec prisma migrate deploy
```

If this local volume predates migration tracking, follow
`docs/runbooks/prisma-migration-baseline.md` before running `migrate deploy`.
Preserve the backup until the work it protects has been verified in the app.

## 2. Start local Firebase Auth

In terminal A:

```bash
pnpm exec firebase emulators:start \
  --only auth \
  --project quipsly-reef \
  --config ops/firebase-auth-emulator.local.json
```

Create a local-only account from Nest's **Create account** form. Emulator users
are not production users and disappear when the emulator state is not exported.
Never reuse a production password.

## 3. Start Nest

In terminal B:

```bash
PORT=3012 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
GCLOUD_PROJECT=quipsly-reef \
GOOGLE_CLOUD_PROJECT=quipsly-reef \
pnpm dev
```

Run the final command from `apps/quipsly`. Starting Next through the root
workspace filter can bind a development server that returns 404 for every app
route with the current Next.js toolchain; the launcher always enters the app
directory first.

Open [http://127.0.0.1:3012](http://127.0.0.1:3012). Both `localhost` and
`127.0.0.1` are allowed development origins so the Next.js client and hot reload
hydrate correctly.

### Optional LAN browser surface

To inspect the responsive web UI from another browser on the same trusted
network, resolve the Mac's current LAN address and explicitly allow that one
development origin before starting Nest:

```bash
QUIPSLY_LAN_HOST="$(ipconfig getifaddr en0)"
test -n "$QUIPSLY_LAN_HOST"

PORT=3012 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
QUIPSLY_ALLOWED_DEV_ORIGINS="$QUIPSLY_LAN_HOST" \
GCLOUD_PROJECT=quipsly-reef \
GOOGLE_CLOUD_PROJECT=quipsly-reef \
pnpm dev
```

Then open `http://<the-lan-address>:3012`. `QUIPSLY_ALLOWED_DEV_ORIGINS` accepts
a comma-separated list of hostnames or addresses and is used only by the Next.js
development server.

This proves the responsive Nest web surface only. The Auth Emulator remains
bound to loopback by design, so an iPhone browser or native app cannot sign into
this lane. Do not expose the Auth Emulator to the LAN or treat a rendered signed-
out page as physical-device Capture proof.

## 4. Smoke the public and signed-in surfaces

Public route and auth-boundary smoke:

```bash
TARGET_URL=http://127.0.0.1:3012 \
  bash scripts/dev/quipsly-local-smoke.sh
```

Strict signed-in smoke, using a local emulator account:

```bash
TARGET_URL=http://127.0.0.1:3012 \
STRICT_DB=1 \
QUIPSLY_AUTH_SMOKE_EMAIL='local-user@example.test' \
QUIPSLY_AUTH_SMOKE_PASSWORD='local-emulator-password' \
QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY='local-emulator-key' \
QUIPSLY_AUTH_SMOKE_FIREBASE_EMULATOR_URL=http://127.0.0.1:9099 \
  bash scripts/dev/quipsly-local-smoke.sh
```

The strict smoke must prove Firebase login, the Quipsly session cookie, native
session validation, Home Nest onboarding, Projects, account switching, and
logout. Keep local credentials out of committed files and shell history when
they are anything other than disposable emulator values.

For a fully disposable replay, run the opt-in integration test while Nest,
PostgreSQL, and the Auth Emulator are already running:

```bash
cd apps/quipsly
QUIPSLY_LOCAL_AUTH_SMOKE=1 \
QUIPSLY_LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
QUIPSLY_LOCAL_NEST_URL=http://127.0.0.1:3012 \
QUIPSLY_LOCAL_FIREBASE_AUTH_URL=http://127.0.0.1:9099 \
  pnpm exec jest --runInBand \
  src/app/api/auth/session/local-onboarding.integration.test.ts
```

The test refuses non-loopback service origins. It creates and verifies a unique
Firebase emulator identity, operates the real HTTP session/onboarding/native
session/Projects/Home Nest/Create/logout path, and then deletes the exact
emulator identity plus its disposable database user, Home Nest, access grants,
and membership cascade. Do not point this test at shared, staging, or production
services.

## 5. Dogfood the canonical workflow

Before treating a change as useful, operate the visible app:

1. Create a note inside a Home Nest and wait for the **Saved** state.
2. Create a personal task and goal in Work.
3. Attach both records to the same Nest and apply Nest tags.
4. Link the task to the goal.
5. Verify the same records from the Home Nest, Work, Today, and global Search.
6. Refresh the browser and confirm the records persist.

A passing build without this readback is not equivalent to a working product.

## Current local limitations

- Work can create a reusable Nest tag and apply it to a task or goal in one
  operation. Vocabulary rename, alias, merge, archive/restore, and imported-keyword
  provenance still need a dedicated Nest vocabulary surface.
- Today intentionally excludes ordinary undated tasks; they remain in Work
  unless deliberately planned or elevated by attention rules.
- Production Google Calendar, transcription providers, Cloud Run, TestFlight,
  and App Store delivery require separate credentials and external proof.
