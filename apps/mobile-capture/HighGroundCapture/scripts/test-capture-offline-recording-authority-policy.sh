#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "$script_dir/.." && pwd)"
temporary_root="$(mktemp -d /private/tmp/quipsly-offline-recording-authority.XXXXXX)"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureRecordingAuthority.swift" \
  "$capture_root/Testing/CaptureOfflineRecordingAuthorityPolicyTests.swift" \
  -o "$temporary_root/CaptureOfflineRecordingAuthorityPolicyTests"

"$temporary_root/CaptureOfflineRecordingAuthorityPolicyTests"
