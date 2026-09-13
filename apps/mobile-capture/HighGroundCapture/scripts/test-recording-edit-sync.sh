#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
capture_edit_test_dir=$(mktemp -d)
xcrun swiftc -o "${capture_edit_test_dir}/recording-edit-sync" \
  "${capture_root}/HighGroundCapture/CaptureRecordingEditHistory.swift" \
  "${capture_root}/HighGroundCapture/CaptureRecordingEditSync.swift" \
  "${capture_root}/Testing/CaptureRecordingEditSyncHarness.swift"
"${capture_edit_test_dir}/recording-edit-sync"
xcrun swiftc -o "${capture_edit_test_dir}/call-recording-scope" \
  "${capture_root}/HighGroundCapture/CaptureCallRecordingScope.swift" \
  "${capture_root}/Testing/CaptureCallRecordingScopeHarness.swift"
"${capture_edit_test_dir}/call-recording-scope"
xcrun swiftc -o "${capture_edit_test_dir}/recording-trim-position" \
  "${capture_root}/HighGroundCapture/CaptureRecordingTrimPosition.swift" \
  "${capture_root}/Testing/CaptureRecordingTrimPositionHarness.swift"
"${capture_edit_test_dir}/recording-trim-position"
xcrun swiftc -o "${capture_edit_test_dir}/recording-playback-format" \
  "${capture_root}/HighGroundCapture/CaptureRecordingPlaybackFormat.swift" \
  "${capture_root}/Testing/CaptureRecordingPlaybackFormatHarness.swift"
"${capture_edit_test_dir}/recording-playback-format"
xcrun swiftc -o "${capture_edit_test_dir}/transcript-source-binding" \
  "${capture_root}/HighGroundCapture/CaptureTranscriptSourceBinding.swift" \
  "${capture_root}/Testing/CaptureTranscriptSourceBindingHarness.swift"
"${capture_edit_test_dir}/transcript-source-binding"
