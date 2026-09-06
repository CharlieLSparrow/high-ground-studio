#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-audio-signal.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/LocalAudioSignalClassification.swift" \
  "$capture_root/Testing/LocalAudioSignalClassificationHarness.swift" \
  -o "$temporary_root/LocalAudioSignalClassificationHarness"

"$temporary_root/LocalAudioSignalClassificationHarness"
