#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d)"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureTranscriptAudioAttention.swift" \
  "$capture_root/Testing/CaptureTranscriptAudioAttentionHarness.swift" \
  -o "$temporary_root/CaptureTranscriptAudioAttentionHarness"

"$temporary_root/CaptureTranscriptAudioAttentionHarness"
