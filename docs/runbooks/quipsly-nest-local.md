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
the current user's machine-wide cache directory, which the launcher prints.
The state cannot live inside one worktree because the launchd labels and ports
are machine-wide. The doctor checks the actual port listener's working
directory and the lifecycle owner receipt, so a healthy Nest from a different
checkout cannot masquerade as proof for the current source. It also verifies
services without reading or printing credentials, confirms the retired
localhost owner override cannot re-enter runtime authorization, and summarizes
changed paths by product surface.

The PostgreSQL Compose project is likewise pinned to `high-ground-studio`
instead of being derived from the worktree folder name. Every checkout
therefore resolves the preserved `high-ground-db` container and
`high-ground-studio_postgres_data` volume rather than creating a shadow
database.

After changing an executable Nest input, rerun `pnpm quipsly:local:up` before a
retained product proof. The launcher hashes tracked, modified, and untracked
runtime inputs and reloads the exact launchd job when that fingerprint changes.
Do not treat a webpack hot-reload response as release evidence: a stale module
graph can keep `/api/health` green while a complex server-rendered page returns
an internal module-call error. `quipsly:local:up`, then
`quipsly:local:doctor`, establishes the source/runtime boundary cheaply.

On macOS, the detached launchd job must receive a readable Nest environment
file. The launcher uses `apps/quipsly/.env.local` when present, or an explicit
external path:

```bash
QUIPSLY_LOCAL_ENV_FILE=/absolute/path/to/quipsly-local.env \
  pnpm quipsly:local:up
```

Only the path is retained in machine-wide lifecycle state. Node parses the env
file directly; the launcher neither sources it as shell code nor prints its
values. A later restart can reuse the recorded path while it remains readable.
The readiness gate checks `/projects`, not only `/api/health`, so missing
database or application configuration fails startup visibly.

If another worktree owns the exact Quipsly launchd jobs, the launcher fails
with both source paths instead of silently reusing it. Deliberately transfer
ownership with:

```bash
bash scripts/dev/quipsly-local-up.sh --replace
pnpm quipsly:local:doctor
```

Replacement is confined to `com.quipsly.local.nest` and
`com.quipsly.local.firebase`. It leaves PostgreSQL and its canonical local
product data running. The Auth Emulator is ephemeral, so replacing it removes
unexported emulator-only accounts; recreate disposable local identities as
needed.

Stop only the app processes started by the launcher:

```bash
pnpm quipsly:local:down
```

The stop command validates each recorded process and working directory before
sending a signal. On macOS it removes only the two exact receipt-backed Quipsly
launchd labels. It deliberately leaves PostgreSQL running so local notes,
tasks, goals, and tags are preserved.

This repository is preservation-sensitive. When the doctor reports a dirty
worktree:

- stage only explicit paths for one coherent slice;
- inspect `git diff --cached` before committing;
- keep untracked work visible until its owner and purpose are understood;
- do not use broad `git add`, `git reset`, `git clean`, or checkout commands.

## 1. Start and protect the local database

From the repository root:

```bash
docker compose --project-name high-ground-studio up -d postgres
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

### Operated iPhone Simulator edit journeys

The generated mobile dogfood commands run current local Nest source, use a
disposable real Firebase identity, drive the compiled iPhone app, and prove
post-run identity/database cleanup. Their random-port Nest process uses an
isolated `.next-mobile-dogfood-*` directory, so the normal port-3012
development server can remain open. They default to the loopback PostgreSQL
database; this keeps ordinary development away from Cloud SQL:

```bash
pnpm quipsly:mobile:dogfood-task-edit
pnpm quipsly:mobile:dogfood-goal-edit
pnpm quipsly:mobile:dogfood-note-edit
```

The note journey edits one exact canonical project note, reads the temporary
title and body back through Work, restores the originals, and independently
checks the original content revision and tag set, stable block identity,
exactly two reversible operation receipts, and zero external side effects.
Every journey removes its generated project, Home Nest, grants, membership,
database user, and Firebase user, then proves both providers contain no
residue. A failed run prints only the local Nest diagnostic tail and still
removes its secret-only temporary directory.

Canonical Cloud SQL is a separate, explicit credentialed lane:

```bash
QUIPSLY_GENERATED_MOBILE_DATABASE_TARGET=canonical \
  pnpm quipsly:mobile:dogfood-note-edit
```

Do not set the canonical target casually. It requires current Google Cloud
authorization and the same cleanup/readback discipline as a production smoke.
Neither target proves a physical iPhone, a distributed TestFlight binary, or
human completion of real episode/coaching work.

## 6. Rehearse portable recovery

Create a dedicated destination Nest and follow
[`quipsly-nest-portability.md`](quipsly-nest-portability.md). Operate the
rendered **Tools → Backup and transfer** path:

1. download the source Nest JSON and record its file SHA-256;
2. validate the package into the dedicated destination;
3. require zero overwrites, source mutations, and external effects;
4. apply once and inspect Notes, Work, tags, and planning history;
5. validate and apply the same package again;
6. independently confirm stable counts, no active imported reminders, and no
   activated recurrence series.

This is the local acceptance path for the knowledge-work graph. A disaster
recovery claim still requires a separately administered environment.

## Current local limitations

- Work owns the canonical Nest vocabulary lifecycle, including explicit
  create, rename, alias, merge, archive/restore, imported-keyword provenance,
  and rollback receipts.
- Portable Nest packages intentionally exclude media bytes, Sessions,
  recordings, transcripts, credentials, and other collaborators' assignments.
- Today intentionally excludes ordinary undated tasks; they remain in Work
  unless deliberately planned or elevated by attention rules.
- Production Google Calendar, transcription providers, Cloud Run, TestFlight,
  and App Store delivery require separate credentials and external proof.
