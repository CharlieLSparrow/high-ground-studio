#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-call-audio.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureAudioSoundCheckModel.swift" \
  "$capture_root/HighGroundCapture/ProviderRoomCallAudioEvidence.swift" \
  "$capture_root/Testing/ProviderRoomCallAudioEvidenceHarness.swift" \
  -o "$temporary_root/ProviderRoomCallAudioEvidenceHarness"

"$temporary_root/ProviderRoomCallAudioEvidenceHarness"
