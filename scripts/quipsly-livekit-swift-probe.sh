#!/usr/bin/env bash
set -euo pipefail

# Resolve the LiveKit Swift SDK outside the real iOS app project.
#
# Why this exists:
# - HighGroundCapture should not carry half-installed SwiftPM package metadata.
# - LiveKit package metadata can resolve while binary artifact downloads still hang.
# - This script gives us repeatable evidence before wiring LiveKit into the app.
#
# Usage:
#   scripts/quipsly-livekit-swift-probe.sh
#
# Optional env:
#   LIVEKIT_SWIFT_VERSION=2.15.1
#   TIMEOUT_SECONDS=900
#   PROBE_DIR=/tmp/quipsly-livekit-probe
#   RUN_BUILD=1
#   KEEP_WORKDIR=1

LIVEKIT_SWIFT_VERSION="${LIVEKIT_SWIFT_VERSION:-2.15.1}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-900}"
PROBE_DIR="${PROBE_DIR:-${TMPDIR:-/tmp}/quipsly-livekit-probe}"
RUN_BUILD="${RUN_BUILD:-0}"
KEEP_WORKDIR="${KEEP_WORKDIR:-0}"

if ! command -v swift >/dev/null 2>&1; then
  echo "ERROR: swift is not available on PATH." >&2
  exit 127
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required for timeout-controlled probing." >&2
  exit 127
fi

if [[ "${KEEP_WORKDIR}" != "1" ]]; then
  rm -rf "${PROBE_DIR}"
fi

mkdir -p "${PROBE_DIR}/Sources/LiveKitProbe"

cat > "${PROBE_DIR}/Package.swift" <<SWIFT
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LiveKitProbe",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "LiveKitProbe", targets: ["LiveKitProbe"])
    ],
    dependencies: [
        .package(url: "https://github.com/livekit/client-sdk-swift.git", exact: "${LIVEKIT_SWIFT_VERSION}")
    ],
    targets: [
        .target(name: "LiveKitProbe", dependencies: [.product(name: "LiveKit", package: "client-sdk-swift")])
    ]
)
SWIFT

cat > "${PROBE_DIR}/Sources/LiveKitProbe/LiveKitProbe.swift" <<'SWIFT'
import LiveKit

public struct LiveKitProbe {
    public init() {}
    public func makeRoom() -> Room { Room() }
}
SWIFT

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  python3 - "$timeout_seconds" "$@" <<'PY'
import subprocess
import sys

timeout_seconds = int(sys.argv[1])
cmd = sys.argv[2:]
print("+ " + " ".join(cmd), flush=True)
try:
    result = subprocess.run(
        cmd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout_seconds,
    )
    if result.stdout:
        print(result.stdout, end="")
    sys.exit(result.returncode)
except subprocess.TimeoutExpired as exc:
    if exc.stdout:
        data = exc.stdout
        if isinstance(data, bytes):
            data = data.decode(errors="replace")
        print(data, end="")
    print(f"TIMEOUT: command did not finish within {timeout_seconds}s", file=sys.stderr)
    sys.exit(124)
PY
}

echo "LiveKit Swift probe"
echo "version=${LIVEKIT_SWIFT_VERSION}"
echo "probe_dir=${PROBE_DIR}"
echo "timeout_seconds=${TIMEOUT_SECONDS}"

cd "${PROBE_DIR}"

run_with_timeout "${TIMEOUT_SECONDS}" swift package resolve

if [[ "${RUN_BUILD}" == "1" ]]; then
  run_with_timeout "${TIMEOUT_SECONDS}" swift build
fi

echo "OK: LiveKit Swift dependency probe completed."
