#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "$script_dir/.." && pwd)"
temporary_root="$(mktemp -d /private/tmp/quipsly-auth-response-decoder.XXXXXX)"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/AuthResponseDecoder.swift" \
  "$capture_root/Testing/AuthResponseDecoderTests.swift" \
  -o "$temporary_root/AuthResponseDecoderTests"

"$temporary_root/AuthResponseDecoderTests"
