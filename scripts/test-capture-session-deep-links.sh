#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-deep-link-test.XXXXXX")"
trap 'rm -rf "$temporary_dir"' EXIT

xcrun swiftc \
  "$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureDeepLink.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/Testing/CaptureDeepLinkHarness.swift" \
  -o "$temporary_dir/capture-deep-link-harness"

"$temporary_dir/capture-deep-link-harness"
