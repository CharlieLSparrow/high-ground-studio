#!/usr/bin/env bash
set -euo pipefail

SERVICE="${QUIPSLY_NATIVE_SMOKE_KEYCHAIN_SERVICE:-quipsly-native-smoke}"
EMAIL="${QUIPSLY_NATIVE_SMOKE_EMAIL:-${QUIPSLY_AUTH_SMOKE_EMAIL:-}}"

if [[ -z "$EMAIL" ]]; then
  printf "Native smoke email: " >&2
  IFS= read -r EMAIL
fi

if [[ -z "$EMAIL" ]]; then
  echo "No email supplied. Aborting." >&2
  exit 1
fi

printf "Firebase password for %s: " "$EMAIL" >&2
stty -echo
IFS= read -r PASSWORD
stty echo
printf "\n" >&2

if [[ -z "$PASSWORD" ]]; then
  echo "No password supplied. Aborting without changing Keychain." >&2
  exit 1
fi

security add-generic-password \
  -U \
  -a "$EMAIL" \
  -s "$SERVICE" \
  -w "$PASSWORD" \
  >/dev/null

unset PASSWORD

echo "Saved native smoke credential for $EMAIL in macOS Keychain service '$SERVICE'." >&2
echo "Run ./script/smoke_native_account_control_plane_from_keychain.sh to test without printing the password." >&2
