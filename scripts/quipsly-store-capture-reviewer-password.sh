#!/usr/bin/env bash
set -euo pipefail

SERVICE="${QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_SERVICE:-quipsly-capture-reviewer}"
ACCOUNT="${QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_ACCOUNT:-codex@dev.test}"

printf 'Store Quipsly capture reviewer password in macOS Keychain\n'
printf 'Service: %s\n' "$SERVICE"
printf 'Account: %s\n' "$ACCOUNT"
printf 'Password will not be echoed.\n'

read -r -s -p "Password: " PASSWORD
printf '\n'

if [[ -z "$PASSWORD" ]]; then
  printf 'No password entered; nothing stored.\n' >&2
  exit 1
fi

security add-generic-password \
  -U \
  -s "$SERVICE" \
  -a "$ACCOUNT" \
  -w "$PASSWORD"

unset PASSWORD

printf 'Stored Keychain item for %s / %s.\n' "$SERVICE" "$ACCOUNT"
printf 'Live smoke can now use --password-keychain-service=%s --password-keychain-account=%s.\n' "$SERVICE" "$ACCOUNT"
