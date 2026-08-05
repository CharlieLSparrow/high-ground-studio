#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-sound-check.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureAudioSoundCheckModel.swift" \
  "$capture_root/Testing/CaptureAudioSoundCheckModelHarness.swift" \
  -o "$temporary_root/CaptureAudioSoundCheckModelHarness"

"$temporary_root/CaptureAudioSoundCheckModelHarness"
