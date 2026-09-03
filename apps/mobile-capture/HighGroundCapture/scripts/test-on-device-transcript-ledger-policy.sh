#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "${script_dir}/.." && pwd)"
temporary_root="$(mktemp -d /private/tmp/quipsly-transcript-ledger-policy.XXXXXX)"
trap 'rm -rf "${temporary_root}"' EXIT

xcrun swiftc \
  "${capture_root}/HighGroundCapture/OnDeviceTranscriptLedgerPolicy.swift" \
  "${capture_root}/Testing/OnDeviceTranscriptLedgerPolicyHarness.swift" \
  -o "${temporary_root}/OnDeviceTranscriptLedgerPolicyHarness"

"${temporary_root}/OnDeviceTranscriptLedgerPolicyHarness"
