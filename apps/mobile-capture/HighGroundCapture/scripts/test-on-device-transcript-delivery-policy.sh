#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "${script_dir}/.." && pwd)"
binary="$(mktemp -t quipsly-transcript-delivery-policy.XXXXXX)"
trap 'rm -f "${binary}"' EXIT

xcrun swiftc \
  "${capture_root}/HighGroundCapture/OnDeviceTranscriptDeliveryPolicy.swift" \
  "${capture_root}/Testing/OnDeviceTranscriptDeliveryPolicyHarness.swift" \
  -o "${binary}"
"${binary}"

xcrun swiftc -swift-version 6 -strict-concurrency=complete \
  "${capture_root}/HighGroundCapture/CaptureAsyncDeadline.swift" \
  "${capture_root}/Testing/CaptureAsyncDeadlineHarness.swift" \
  -o "${binary}"
"${binary}"
