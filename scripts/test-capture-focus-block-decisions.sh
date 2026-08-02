#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_directory="$(mktemp -d)"

cleanup() {
  case "$temporary_directory" in
    /tmp/*|/var/folders/*) rm -rf -- "$temporary_directory" ;;
    *) echo "Refusing to remove unexpected temporary path: $temporary_directory" >&2 ;;
  esac
}
trap cleanup EXIT

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
xcrun swiftc \
  -D FOCUS_BLOCK_DECISION_HARNESS \
  -parse-as-library \
  "$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture/FocusBlockDecisionOutbox.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/Testing/FocusBlockDecisionOutboxHarness.swift" \
  -o "$temporary_directory/focus-block-decision-harness"

"$temporary_directory/focus-block-decision-harness"
