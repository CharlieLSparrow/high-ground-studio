#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASC_KEY_PATH="${APP_STORE_CONNECT_API_KEY_PATH:-${XDG_CONFIG_HOME:-${HOME}/.config}/quipsly/credentials/app-store-connect/quipsly-release-automation.json}"
TESTER_EMAIL="${QUIPSLY_CAPTURE_TESTER_EMAIL:-shomers@icloud.com}"
BASE_URL="${QUIPSLY_REHEARSAL_BASE_URL:-https://nest.quipsly.com}"
OUTPUT_PATH="${QUIPSLY_HGO_REHEARSAL_PREFLIGHT_OUTPUT:-/private/tmp/quipsly-hgo-rehearsal-preflight-current.json}"

usage() {
  cat <<'USAGE'
Quipsly High Ground Odyssey rehearsal live preflight

Usage:
  scripts/quipsly-hgo-rehearsal-live-preflight.sh [--output <receipt.json>]

The preflight is read-only outside the local Mac UI. It verifies the current
TestFlight build/public link, exact production rehearsal Room and Watch media,
and the signed canonical Mac app. Opening Episode Capture Setup does not grant
permissions, join, record, upload, publish, or mutate consent.

Environment:
  APP_STORE_CONNECT_API_KEY_PATH  Fastlane App Store Connect JSON key.
  QUIPSLY_CAPTURE_TESTER_EMAIL    Named tester readback; defaults to Scott.
  QUIPSLY_REHEARSAL_BASE_URL      Defaults to https://nest.quipsly.com.
  QUIPSLY_HGO_REHEARSAL_PREFLIGHT_OUTPUT
                                  Default receipt path.
USAGE
}

while (($#)); do
  case "$1" in
    --output)
      [[ $# -ge 2 ]] || {
        echo "--output requires a value." >&2
        exit 2
      }
      OUTPUT_PATH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$ASC_KEY_PATH" ]]; then
  echo "App Store Connect key JSON not found at the configured path." >&2
  exit 2
fi
if [[ "$BASE_URL" != https://* ]]; then
  echo "QUIPSLY_REHEARSAL_BASE_URL must be HTTPS." >&2
  exit 2
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-hgo-preflight.XXXXXX")"
cleanup() {
  if [[ -n "${WORK_DIR:-}" && -d "$WORK_DIR" ]]; then
    rm -rf -- "$WORK_DIR"
  fi
}
trap cleanup EXIT

mkdir -p "$(dirname "$OUTPUT_PATH")"

run_logged() {
  local label="$1"
  shift
  if "$@" >"$WORK_DIR/${label}.log" 2>&1; then
    return 0
  fi
  echo "Preflight step failed: ${label}" >&2
  sed -n '1,240p' "$WORK_DIR/${label}.log" >&2
  return 1
}

run_logged testflight-public \
  node "$ROOT_DIR/scripts/release/quipsly-testflight-public-link-readback.mjs" \
  --output "$WORK_DIR/testflight-public.json"

run_logged app-store \
  env \
  APP_STORE_CONNECT_API_KEY_PATH="$ASC_KEY_PATH" \
  QUIPSLY_CAPTURE_TESTER_EMAIL="$TESTER_EMAIL" \
  node "$ROOT_DIR/scripts/release/quipsly-app-store-connect-readback.mjs" \
  --build 12 \
  --expect-tester-state INVITED,ACCEPTED,INSTALLED \
  --output "$WORK_DIR/app-store.json"

run_logged rehearsal-plan \
  env \
  QUIPSLY_REHEARSAL_APPLY=0 \
  QUIPSLY_REHEARSAL_BASE_URL="$BASE_URL" \
  QUIPSLY_REHEARSAL_OUTPUT_JSON="$WORK_DIR/rehearsal.json" \
  bash "$ROOT_DIR/scripts/quipsly-live-prepare-hgo-testflight-rehearsal.sh"

run_logged native-watch \
  node "$ROOT_DIR/scripts/quipsly-verify-hgo-native-watch.mjs" \
  --base-url "$BASE_URL" \
  --output "$WORK_DIR/watch.json"

run_logged mac-app \
  "$ROOT_DIR/apps/QuipslyStudio/script/studioctl.sh" verify-app
cp "$WORK_DIR/mac-app.log" "$WORK_DIR/mac-app.txt"

run_logged native-account-smoke \
  "$ROOT_DIR/apps/QuipslyStudio/script/smoke_native_account_control.sh"
cp "$WORK_DIR/native-account-smoke.log" "$WORK_DIR/native-account-smoke.json"

run_logged capture-launcher-smoke \
  "$ROOT_DIR/apps/QuipslyStudio/script/smoke_capture_setup_launcher.sh"
cp "$WORK_DIR/capture-launcher-smoke.log" "$WORK_DIR/capture-launcher-smoke.json"

run_logged mac-state \
  "$ROOT_DIR/apps/QuipslyStudio/script/agentctl.sh" state
cp "$WORK_DIR/mac-state.log" "$WORK_DIR/mac-state.json"

node "$ROOT_DIR/scripts/quipsly-hgo-rehearsal-preflight.mjs" \
  --app-store "$WORK_DIR/app-store.json" \
  --public-link "$WORK_DIR/testflight-public.json" \
  --rehearsal "$WORK_DIR/rehearsal.json" \
  --watch "$WORK_DIR/watch.json" \
  --mac-app "$WORK_DIR/mac-app.txt" \
  --mac-account "$WORK_DIR/mac-state.json" \
  --native-account-smoke "$WORK_DIR/native-account-smoke.json" \
  --capture-launcher-smoke "$WORK_DIR/capture-launcher-smoke.json" \
  --output "$OUTPUT_PATH"

echo "rehearsalPreflightReceipt=$OUTPUT_PATH"
