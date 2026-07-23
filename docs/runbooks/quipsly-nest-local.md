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
pnpm --filter quipsly dev
```

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
pnpm --filter quipsly dev
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
