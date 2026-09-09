#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "$script_dir/.." && pwd)"
test_dir="$(mktemp -d /private/tmp/quipsly-coaching-work-save.XXXXXX)"
trap 'rm -rf "$test_dir"' EXIT
xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureCoachingWorkSave.swift" \
  "$capture_root/HighGroundCapture/CaptureTranscriptWorkDraft.swift" \
  "$capture_root/HighGroundCapture/CoachingScheduleUpdate.swift" \
  "$capture_root/Testing/CaptureCoachingWorkSaveTests.swift" \
  -o "$test_dir/CoachingWorkSaveTests"
"$test_dir/CoachingWorkSaveTests"
