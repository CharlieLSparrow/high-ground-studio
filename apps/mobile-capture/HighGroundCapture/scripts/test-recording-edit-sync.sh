#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
capture_edit_test_dir=$(mktemp -d)
xcrun swiftc -o "${capture_edit_test_dir}/recording-edit-sync" \
  "${capture_root}/HighGroundCapture/CaptureRecordingEditSync.swift" \
  "${capture_root}/Testing/CaptureRecordingEditSyncHarness.swift"
"${capture_edit_test_dir}/recording-edit-sync"
