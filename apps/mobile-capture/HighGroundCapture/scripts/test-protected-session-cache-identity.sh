#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "$script_dir/.." && pwd)"
temporary_root="$(mktemp -d /private/tmp/quipsly-session-cache-identity.XXXXXX)"
trap 'rm -rf "$temporary_root"' EXIT

xcrun swiftc \
  "$capture_root/HighGroundCapture/ProtectedSessionCacheIdentity.swift" \
  "$capture_root/Testing/ProtectedSessionCacheIdentityTests.swift" \
  -o "$temporary_root/ProtectedSessionCacheIdentityTests"

"$temporary_root/ProtectedSessionCacheIdentityTests"
