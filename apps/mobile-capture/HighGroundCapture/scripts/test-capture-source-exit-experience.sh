#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-source-exit.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureSourceExitExperience.swift" \
  "$capture_root/Testing/CaptureSourceExitExperienceHarness.swift" \
  -o "$temporary_root/CaptureSourceExitExperienceHarness"

"$temporary_root/CaptureSourceExitExperienceHarness"
