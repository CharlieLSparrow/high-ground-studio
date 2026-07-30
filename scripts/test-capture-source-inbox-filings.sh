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
  -D SOURCE_INBOX_FILING_HARNESS \
  -parse-as-library \
  "$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureSourceInbox.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/Testing/SourceInboxFilingOutboxHarness.swift" \
  -o "$temporary_directory/source-inbox-filing-harness"

"$temporary_directory/source-inbox-filing-harness"
