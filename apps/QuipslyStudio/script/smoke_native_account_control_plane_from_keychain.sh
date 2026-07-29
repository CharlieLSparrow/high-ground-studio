#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE="${QUIPSLY_NATIVE_SMOKE_KEYCHAIN_SERVICE:-quipsly-native-smoke}"
EMAIL="${QUIPSLY_NATIVE_SMOKE_EMAIL:-${QUIPSLY_AUTH_SMOKE_EMAIL:-}}"

if [[ -z "$EMAIL" ]]; then
  echo "Set QUIPSLY_NATIVE_SMOKE_EMAIL or QUIPSLY_AUTH_SMOKE_EMAIL before running this smoke." >&2
  echo "You can save the password first with ./script/save_native_smoke_credentials_to_keychain.sh." >&2
  exit 1
fi

PASSWORD="$(security find-generic-password -a "$EMAIL" -s "$SERVICE" -w 2>/dev/null || true)"

if [[ -z "$PASSWORD" ]]; then
  echo "No Keychain password found for $EMAIL in service '$SERVICE'." >&2
  echo "Run ./script/save_native_smoke_credentials_to_keychain.sh, then retry." >&2
  exit 1
fi

QUIPSLY_NATIVE_SMOKE_EMAIL="$EMAIL" \
QUIPSLY_NATIVE_SMOKE_PASSWORD="$PASSWORD" \
"$SCRIPT_DIR/smoke_native_account_control_plane.sh"

unset PASSWORD
