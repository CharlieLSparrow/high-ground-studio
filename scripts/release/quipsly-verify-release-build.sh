#!/usr/bin/env bash
set -euo pipefail

release_context="${1:-${RELEASE_CONTEXT_DIR:-}}"

if [[ -z "${release_context}" ]]; then
  echo "Usage: $0 <materialized-release-context>" >&2
  exit 2
fi

if [[ ! -f "${release_context}/.quipsly-release-context" ]]; then
  echo "Refusing to build an unmarked release context: ${release_context}" >&2
  exit 2
fi

if [[ ! -f "${release_context}/quipsly-release-source.json" ]]; then
  echo "Release context is missing its source receipt: ${release_context}" >&2
  exit 2
fi

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
bash "${script_directory}/quipsly-verify-release-context.sh" "${release_context}"

echo "Installing the exact committed Nest release context."
(
  cd "${release_context}"
  CI=1 corepack pnpm install --frozen-lockfile
)

echo "Generating Prisma clients in the exact committed Nest release context."
(
  cd "${release_context}"
  DATABASE_URL="${DATABASE_URL:-postgresql://build:build@127.0.0.1:5432/high_ground_build}" \
    corepack pnpm db:generate
  node scripts/sync-prisma-pnpm-clients.mjs
)

# Keep results outside the upload context, including when a test fails or Jest
# exits before it can write JSON. This is the same application suite as PR CI;
# the narrower Session-evidence suite is already included in it.
test_results="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-release-tests.XXXXXX")"
echo "Testing application behavior in the exact committed Nest release context."
echo "Application test results: ${test_results}"
(
  cd "${release_context}"
  CI=1 QUIPSLY_LOCAL_DB_SMOKE=0 \
    corepack pnpm --filter quipsly test --maxWorkers=2 --json \
      --outputFile="${test_results}/jest-results.json" \
      2>&1 | tee "${test_results}/jest.log"
)

echo "Building the exact Nest production bundle with strict type checking."
(
  cd "${release_context}"
  DATABASE_URL="${DATABASE_URL:-postgresql://build:build@127.0.0.1:5432/high_ground_build}" \
  NEXT_TELEMETRY_DISABLED=1 \
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}" \
  QUIPSLY_BUILD_DIST_DIR=.next-release \
  QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=0 \
  NEXT_PUBLIC_STUDIO_COLLAB_URL="${NEXT_PUBLIC_STUDIO_COLLAB_URL:-wss://studio-collab-hm2odnvjga-uc.a.run.app}" \
  STUDIO_COLLAB_URL="${STUDIO_COLLAB_URL:-wss://studio-collab-hm2odnvjga-uc.a.run.app}" \
  NEXT_PUBLIC_FIREBASE_API_KEY="${NEXT_PUBLIC_FIREBASE_API_KEY:-AIzaSyDvcHtENDtiZCjBS46cW-qa91nHe5DjUkM}" \
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-quipsly-reef.firebaseapp.com}" \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID="${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-quipsly-reef}" \
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:-quipsly-reef.firebasestorage.app}" \
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-249115653261}" \
  NEXT_PUBLIC_FIREBASE_APP_ID="${NEXT_PUBLIC_FIREBASE_APP_ID:-1:249115653261:web:d49c566ebe99148cbddec4}" \
  NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID="${NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID:-249115653261-g6lvadv4e1a64eu50u0glkepamtq709b.apps.googleusercontent.com}" \
    corepack pnpm --filter quipsly exec next build --webpack
)

echo "PASS Exact committed Nest production build succeeded."
