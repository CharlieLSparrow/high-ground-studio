#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d)"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureSourcePlanProjection.swift" \
  "$capture_root/Testing/CaptureSourcePlanProjectionTests.swift" \
  -o "$temporary_root/CaptureSourcePlanProjectionTests"

"$temporary_root/CaptureSourcePlanProjectionTests"
