#!/usr/bin/env bash
set -euo pipefail

# Local production-readiness preflight for the Quipsly iOS capture lane.
#
# This is intentionally narrow. It proves the mobile capture app can build,
# privacy metadata is valid, and the web/mobile contract still parses.
#
# Optional env:
#   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
#   BASE_URL=http://127.0.0.1:3000
#   RUN_ROUTE_SMOKE=1
#   RUN_COACHING_PAYMENT_SMOKE=1
#   RUN_LIVE_PUBLIC_INTEGRATION_SMOKE=1
#   LIVE_PUBLIC_INTEGRATION_STRICT=1
#   RUN_GENERATED_AUTH_SMOKE=1
#   RUN_NATIVE_AUTH_CONTRACT_SMOKE=1
#   RUN_CAPTURE_REVIEWER_SESSION_SMOKE=1
#   RUN_CAPTURE_LIVE_REVIEWER_PROOF=1
#   RUN_CAPTURE_CONSENT_ROOM_LIVE_PROOF=1
#   RUN_COACHING_GENERATED_AUTH_SMOKE=1
#   RUN_LIVEKIT_ARTIFACT_DOCTOR=1
#   RUN_LIVEKIT_PROBE=1
#   LIVEKIT_TIMEOUT_SECONDS=900

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="${ROOT_DIR}/apps/mobile-capture/HighGroundCapture"
PRIVACY_MANIFEST="${IOS_DIR}/HighGroundCapture/PrivacyInfo.xcprivacy"
XCODE_PROJECT="${IOS_DIR}/HighGroundCapture.xcodeproj"
SCHEME="HighGroundCapture"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

if [[ ! -d "${DEVELOPER_DIR}" ]]; then
  echo "ERROR: DEVELOPER_DIR does not exist: ${DEVELOPER_DIR}" >&2
  echo "Set DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer." >&2
  exit 1
fi

echo "Quipsly mobile capture preflight"
echo "root=${ROOT_DIR}"
echo "developer_dir=${DEVELOPER_DIR}"

echo
echo "== Privacy manifest =="
plutil -lint "${PRIVACY_MANIFEST}"

echo
echo "== Quipsly TypeScript =="
"${ROOT_DIR}/node_modules/.bin/tsc" --noEmit --project "${ROOT_DIR}/apps/quipsly/tsconfig.json"

echo
echo "== Mobile capture contract syntax =="
node --check "${ROOT_DIR}/scripts/quipsly-mobile-capture-contract-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-mobile-capture-native-auth-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-mobile-capture-native-auth-smoke.test.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-capture-reviewer-session-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-capture-reviewer-runway-static-smoke.mjs"
bash -n "${ROOT_DIR}/scripts/quipsly-capture-live-reviewer-proof.sh"
bash -n "${ROOT_DIR}/scripts/quipsly-capture-consent-room-live-proof.sh"
node --check "${ROOT_DIR}/scripts/quipsly-mobile-capture-generated-auth-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-mobile-capture-session-evidence.test.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-coaching-generated-auth-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-coaching-lifecycle-static-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-coaching-scheduling-static-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-coaching-payment-contract-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-coaching-public-handoff-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-media-vault-contract-smoke.mjs"
node --check "${ROOT_DIR}/scripts/verify-cloud-bucket.test.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-mobile-capture-session-context-static-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-recording-podcast-attachment-static-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-admin-user-management-static-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-ios-native-auth-static-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-ios-capture-app-store-static-smoke.mjs"
node --check "${ROOT_DIR}/scripts/quipsly-ios-coordinated-podcast-capture.test.mjs"
node --check "${ROOT_DIR}/scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs"
node --check "${ROOT_DIR}/scripts/hgo-quipsly-public-integration-smoke.mjs"
node "${ROOT_DIR}/scripts/quipsly-admin-user-management-static-smoke.mjs"
node --test "${ROOT_DIR}/scripts/quipsly-mobile-capture-native-auth-smoke.test.mjs"
node "${ROOT_DIR}/scripts/quipsly-capture-reviewer-runway-static-smoke.mjs"
node "${ROOT_DIR}/scripts/quipsly-coaching-lifecycle-static-smoke.mjs"
node "${ROOT_DIR}/scripts/quipsly-coaching-scheduling-static-smoke.mjs"
node "${ROOT_DIR}/scripts/quipsly-coaching-payment-contract-smoke.mjs" --static-only --json
node "${ROOT_DIR}/scripts/quipsly-media-vault-contract-smoke.mjs"
node --test "${ROOT_DIR}/scripts/verify-cloud-bucket.test.mjs"
node "${ROOT_DIR}/scripts/quipsly-mobile-capture-session-context-static-smoke.mjs"
node "${ROOT_DIR}/scripts/quipsly-recording-podcast-attachment-static-smoke.mjs"
node "${ROOT_DIR}/scripts/quipsly-ios-native-auth-static-smoke.mjs"
node "${ROOT_DIR}/scripts/quipsly-ios-capture-app-store-static-smoke.mjs"
node "${ROOT_DIR}/scripts/quipsly-ios-coordinated-podcast-capture.test.mjs"
node "${ROOT_DIR}/scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs"

echo
echo "== Mobile capture ingestion idempotency =="
TS_NODE_PROJECT="${ROOT_DIR}/apps/quipsly/tsconfig.json" \
TS_NODE_TRANSPILE_ONLY=1 \
  node --experimental-strip-types --import "${ROOT_DIR}/scripts/register-ts-extension-loader.mjs" \
  "${ROOT_DIR}/scripts/quipsly-mobile-capture-ingestion-idempotency.test.mjs"

echo
echo "== Mobile capture session evidence =="
TS_NODE_PROJECT="${ROOT_DIR}/apps/quipsly/tsconfig.json" \
TS_NODE_TRANSPILE_ONLY=1 \
  node --experimental-strip-types --import "${ROOT_DIR}/scripts/register-ts-extension-loader.mjs" \
  "${ROOT_DIR}/scripts/quipsly-mobile-capture-session-evidence.test.mjs"

if [[ "${RUN_ROUTE_SMOKE:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
  echo
  echo "== Mobile capture route smoke (${BASE_URL}) =="
  node "${ROOT_DIR}/scripts/quipsly-mobile-capture-contract-smoke.mjs" --base-url="${BASE_URL}" --json
fi

if [[ "${RUN_COACHING_PAYMENT_SMOKE:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
  echo
  echo "== Coaching payment route smoke (${BASE_URL}) =="
  node "${ROOT_DIR}/scripts/quipsly-coaching-payment-contract-smoke.mjs" --base-url="${BASE_URL}" --json
fi

if [[ "${RUN_COACHING_LIFECYCLE_DB_SMOKE:-0}" == "1" ]]; then
  echo
  echo "== Coaching lifecycle local DB smoke =="
  node "${ROOT_DIR}/scripts/quipsly-coaching-local-lifecycle-db-smoke.mjs" --json
fi

if [[ "${RUN_PUBLIC_COACHING_HANDOFF_SMOKE:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-${QUIPSLY_PUBLIC_COACHING_BASE_URL:-http://127.0.0.1:3000}}"
  echo
  echo "== Public coaching handoff route smoke (${BASE_URL}) =="
  node "${ROOT_DIR}/scripts/quipsly-coaching-public-handoff-smoke.mjs" --base-url="${BASE_URL}" --json
fi

if [[ "${RUN_LIVE_PUBLIC_INTEGRATION_SMOKE:-0}" == "1" ]]; then
  echo
  echo "== Live HGO/Quipsly public integration smoke =="
  LIVE_PUBLIC_ARGS=(--json)
  if [[ "${LIVE_PUBLIC_INTEGRATION_STRICT:-0}" != "1" ]]; then
    LIVE_PUBLIC_ARGS+=(--warn-only)
  fi
  node "${ROOT_DIR}/scripts/hgo-quipsly-public-integration-smoke.mjs" "${LIVE_PUBLIC_ARGS[@]}"
fi

if [[ "${RUN_GENERATED_AUTH_SMOKE:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
  echo
  echo "== Mobile capture generated-auth smoke (${BASE_URL}) =="
  node "${ROOT_DIR}/scripts/quipsly-mobile-capture-generated-auth-smoke.mjs" --base-url="${BASE_URL}"
fi

if [[ "${RUN_NATIVE_AUTH_CONTRACT_SMOKE:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
  echo
  echo "== Mobile capture reviewer/native auth contract smoke (${BASE_URL}) =="
  node "${ROOT_DIR}/scripts/quipsly-mobile-capture-native-auth-smoke.mjs" --base-url="${BASE_URL}" --json
fi

if [[ "${RUN_CAPTURE_REVIEWER_SESSION_SMOKE:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
  echo
  echo "== Capture reviewer visible-session smoke (${BASE_URL}) =="
  node "${ROOT_DIR}/scripts/quipsly-capture-reviewer-session-smoke.mjs" --base-url="${BASE_URL}" --json
fi

if [[ "${RUN_CAPTURE_LIVE_REVIEWER_PROOF:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-https://nest.quipsly.com}"
  export QUIPSLY_CAPTURE_REVIEWER_BASE_URL="${QUIPSLY_CAPTURE_REVIEWER_BASE_URL:-${BASE_URL}}"
  echo
  echo "== Capture live reviewer proof (${QUIPSLY_CAPTURE_REVIEWER_BASE_URL}) =="
  "${ROOT_DIR}/scripts/quipsly-capture-live-reviewer-proof.sh"
fi

if [[ "${RUN_CAPTURE_CONSENT_ROOM_LIVE_PROOF:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-https://nest.quipsly.com}"
  export QUIPSLY_CAPTURE_REVIEWER_BASE_URL="${QUIPSLY_CAPTURE_REVIEWER_BASE_URL:-${BASE_URL}}"
  echo
  echo "== Capture consent-to-room live proof (${QUIPSLY_CAPTURE_REVIEWER_BASE_URL}) =="
  "${ROOT_DIR}/scripts/quipsly-capture-consent-room-live-proof.sh"
fi

if [[ "${RUN_COACHING_GENERATED_AUTH_SMOKE:-0}" == "1" ]]; then
  BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
  echo
  echo "== Coaching generated-auth runway smoke (${BASE_URL}) =="
  node "${ROOT_DIR}/scripts/quipsly-coaching-generated-auth-smoke.mjs" --base-url="${BASE_URL}"
fi

echo
echo "== Provider room static contract =="
node "${ROOT_DIR}/scripts/quipsly-mobile-provider-room-static-smoke.mjs"

if [[ "${RUN_LIVEKIT_ARTIFACT_DOCTOR:-0}" == "1" ]]; then
  echo
  echo "== LiveKit artifact doctor =="
  "${ROOT_DIR}/scripts/quipsly-livekit-artifact-doctor.sh"
fi

echo
echo "== LiveKit provider-room dependency and iOS simulator build =="
"${IOS_DIR}/scripts/validate-livekit-provider-room.sh" --build-simulator

if [[ "${RUN_LIVEKIT_PROBE:-0}" == "1" ]]; then
  echo
  echo "== LiveKit Swift dependency probe =="
  TIMEOUT_SECONDS="${LIVEKIT_TIMEOUT_SECONDS:-900}" "${ROOT_DIR}/scripts/quipsly-livekit-swift-probe.sh"
fi

echo
echo "OK: Quipsly mobile capture preflight completed."
