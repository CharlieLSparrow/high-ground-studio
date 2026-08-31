#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-attention.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/CaptureAttentionDiagnostics.swift" \
  "$capture_root/Testing/CaptureAttentionPresentationTests.swift" \
  -o "$temporary_root/CaptureAttentionPresentationTests"

"$temporary_root/CaptureAttentionPresentationTests"
