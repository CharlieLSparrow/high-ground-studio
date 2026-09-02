#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-loudness.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/LocalLoudnessAnalysis.swift" \
  "$capture_root/Testing/LocalLoudnessAnalysisHarness.swift" \
  -o "$temporary_root/LocalLoudnessAnalysisHarness"

"$temporary_root/LocalLoudnessAnalysisHarness"
