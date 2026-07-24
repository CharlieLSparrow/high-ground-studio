#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BASE_URL="${QUIPSLY_CAPTURE_REVIEWER_BASE_URL:-${BASE_URL:-https://nest.quipsly.com}}"
EMAIL="${QUIPSLY_CAPTURE_REVIEWER_EMAIL:-codex@dev.test}"
SERVICE="${QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_SERVICE:-quipsly-capture-reviewer}"
ACCOUNT="${QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_ACCOUNT:-${EMAIL}}"
CREATE_SESSION="${QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION:-1}"
OUTPUT_JSON="${QUIPSLY_CAPTURE_CONSENT_ROOM_PROOF_JSON:-/tmp/quipsly-capture-consent-room-live-proof.json}"

if [[ "${CREATE_SESSION}" != "0" && "${CREATE_SESSION}" != "1" ]]; then
  echo "ERROR: QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION must be 0 or 1." >&2
  exit 1
fi

echo "Quipsly capture consent-to-room live proof"
echo "root=${ROOT_DIR}"
echo "base_url=${BASE_URL}"
echo "email=${EMAIL}"
echo "keychain_service=${SERVICE}"
echo "keychain_account=${ACCOUNT}"
echo "create_session=${CREATE_SESSION}"
echo "output_json=${OUTPUT_JSON}"
echo

write_missing_keychain_json() {
  mkdir -p "$(dirname "${OUTPUT_JSON}")"
  node - "${OUTPUT_JSON}" "${BASE_URL}" "${EMAIL}" "${SERVICE}" "${ACCOUNT}" "${CREATE_SESSION}" <<'NODE'
const fs = require("node:fs");
const [outputJson, baseUrl, email, service, account, createSession] = process.argv.slice(2);
fs.writeFileSync(outputJson, JSON.stringify({
  ok: false,
  status: "blocked",
  blockedReason: "missing-keychain-credential",
  baseUrl,
  email,
  keychainService: service,
  keychainAccount: account,
  createSession: createSession === "1",
  providerSecretsExposed: false,
  passwordPrinted: false,
  externalMutated: false,
  recordingStarted: false,
  nextAction: "Run scripts/quipsly-store-capture-reviewer-password.sh, then rerun scripts/quipsly-capture-consent-room-live-proof.sh.",
  truth: "The consent-to-room proof did not run because the reviewer password was not available in macOS Keychain.",
}, null, 2) + "\n");
NODE
}

if ! security find-generic-password -s "${SERVICE}" -a "${ACCOUNT}" -w >/dev/null 2>&1; then
  write_missing_keychain_json
  cat >&2 <<EOF
ERROR: Reviewer password is not available in macOS Keychain.

Store it without printing the password:

  QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_SERVICE="${SERVICE}" \\
  QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_ACCOUNT="${ACCOUNT}" \\
  bash scripts/quipsly-store-capture-reviewer-password.sh

Then rerun:

  bash scripts/quipsly-capture-consent-room-live-proof.sh

EOF
  exit 2
fi

echo "== Static reviewer runway contract =="
node "${ROOT_DIR}/scripts/quipsly-capture-reviewer-runway-static-smoke.mjs"

echo
echo "== Live reviewer consent-to-room proof =="
node "${ROOT_DIR}/scripts/quipsly-capture-reviewer-session-smoke.mjs" \
  --base-url="${BASE_URL}" \
  --email="${EMAIL}" \
  --password-keychain-service="${SERVICE}" \
  --password-keychain-account="${ACCOUNT}" \
  --create-session="${CREATE_SESSION}" \
  --grant-consent=1 \
  --inspect-room-join=1 \
  --prepare-room-join=1 \
  --json | tee "${OUTPUT_JSON}"

echo
echo "Consent-to-room proof complete. Password was read from Keychain and was not printed; LiveKit token details were redacted."
