#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "$script_dir/.." && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-nest-evidence-tests.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/Testing/CaptureDeviceVocabularyHarnessStub.swift" \
  "$capture_root/HighGroundCapture/CaptureNestSourceEvidenceContract.swift" \
  "$capture_root/Testing/CaptureNestSourceEvidenceContractTests.swift" \
  -o "$temporary_root/CaptureNestSourceEvidenceContractTests"

"$temporary_root/CaptureNestSourceEvidenceContractTests"
