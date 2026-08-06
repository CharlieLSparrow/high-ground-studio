#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 || "$1" != /* ]]; then
  echo "Usage: $0 /absolute/path/to/audio" >&2
  exit 64
fi

capture_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-audible-operation.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/LocalAudibleEventAnalysis.swift" \
  "$capture_root/Testing/LocalAudibleEventAnalyzerOperation.swift" \
  -o "$temporary_root/LocalAudibleEventAnalyzerOperation"

"$temporary_root/LocalAudibleEventAnalyzerOperation" "$1"
