#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-quipsly-reef}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

failures=0

pass() {
  printf "PASS %s\n" "$1"
}

fail() {
  printf "FAIL %s\n" "$1" >&2
  failures=$((failures + 1))
}

account="$(gcloud config get-value account 2>/dev/null || true)"
if [[ -n "${account}" ]]; then
  pass "Selected gcloud account: ${account}"
else
  fail "No selected gcloud account."
fi

if gcloud auth print-access-token >/dev/null 2>&1; then
  pass "gcloud user credentials can mint an access token."
else
  fail "gcloud user credentials cannot mint an access token."
fi

if gcloud auth application-default print-access-token >/dev/null 2>&1; then
  pass "Application Default Credentials can mint an access token."
else
  fail "Application Default Credentials cannot mint an access token."
fi

if gcloud projects describe "${PROJECT_ID}" --format="value(projectId)" >/dev/null 2>&1; then
  pass "Can access deploy project ${PROJECT_ID}."
else
  fail "Cannot access deploy project ${PROJECT_ID}."
fi

if gcloud projects describe "${FIREBASE_PROJECT_ID}" --format="value(projectId)" >/dev/null 2>&1; then
  pass "Can access Firebase project ${FIREBASE_PROJECT_ID}."
else
  fail "Cannot access Firebase project ${FIREBASE_PROJECT_ID}."
fi

if (
  cd "${REPO_ROOT}"
  FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID}" node --input-type=module <<'NODE'
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) process.exit(2);

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

try {
  await getAuth().listUsers(1);
} catch (error) {
  const safeCode = error?.errorInfo?.code ?? error?.code ?? "unknown";
  console.error(`Firebase Admin authorization check failed (${safeCode}).`);
  process.exit(1);
}
NODE
); then
  pass "Application Default Credentials can call Firebase Admin for ${FIREBASE_PROJECT_ID}."
else
  fail "Application Default Credentials cannot call Firebase Admin for ${FIREBASE_PROJECT_ID}."
fi

if [[ "${failures}" -gt 0 ]]; then
  cat >&2 <<'EOF'

Reauth required before Quipsly auth cutover can be deployed or locally smoked.

Run:

  gcloud auth login --update-adc --brief
  gcloud auth application-default set-quota-project quipsly-reef

Then verify:

  bash scripts/release/quipsly-gcloud-auth-check.sh

This script never prints tokens or secrets.
EOF
  exit 1
fi

printf "\nQuipsly gcloud/ADC auth is ready.\n"
