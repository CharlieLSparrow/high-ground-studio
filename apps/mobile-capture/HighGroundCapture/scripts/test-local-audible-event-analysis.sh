#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-audible-events.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/LocalAudibleEventAnalysis.swift" \
  "$capture_root/Testing/LocalAudibleEventAnalysisHarness.swift" \
  -o "$temporary_root/LocalAudibleEventAnalysisHarness"

"$temporary_root/LocalAudibleEventAnalysisHarness"
