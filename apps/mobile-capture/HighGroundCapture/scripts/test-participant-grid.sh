#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_directory="$(mktemp -d)"
trap 'rm -f "$test_directory/participant-grid"; rmdir "$test_directory"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureParticipantGridGeometry.swift" \
  "$capture_root/Testing/CaptureParticipantGridGeometryTests.swift" \
  -o "$test_directory/participant-grid"
"$test_directory/participant-grid"
