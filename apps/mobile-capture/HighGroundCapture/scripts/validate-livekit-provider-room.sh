#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
APP_DIR="$ROOT/apps/mobile-capture/HighGroundCapture"
PROJECT="$APP_DIR/HighGroundCapture.xcodeproj"
SCHEME="HighGroundCapture"
DEVELOPER_DIR_VALUE="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
PACKAGE_CACHE="${QUIPSLY_LIVEKIT_SPM_CACHE:-/tmp/quipsly-livekit-xcframework-spm}"
DERIVED_DATA_PATH="${QUIPSLY_CAPTURE_DERIVED_DATA_PATH:-/private/tmp/quipsly-capture-derived-data}"
RESOLVE_TIMEOUT_SECONDS="${RESOLVE_TIMEOUT_SECONDS:-900}"
BUILD_TIMEOUT_SECONDS="${BUILD_TIMEOUT_SECONDS:-1200}"
LIVEKIT_SWIFT_VERSION="${LIVEKIT_SWIFT_VERSION:-2.16.0}"
RUN_BUILD=0
BUILD_DESTINATION="${QUIPSLY_CAPTURE_BUILD_DESTINATION:-generic/platform=iOS Simulator}"

usage() {
  cat <<'EOF'
Usage: validate-livekit-provider-room.sh [--build-simulator] [--help]

Validates that HighGroundCapture is wired as a real LiveKit provider-room
client. It uses full Xcode through DEVELOPER_DIR without changing global
xcode-select.

Default:
  - confirm the Xcode project references the LiveKit Swift package
  - resolve Swift Package dependencies with a bounded timeout

Options:
  --build-simulator   After dependency resolution, run a bounded simulator build.

Environment:
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  QUIPSLY_LIVEKIT_SPM_CACHE=/tmp/quipsly-livekit-xcframework-spm
  QUIPSLY_CAPTURE_DERIVED_DATA_PATH=/private/tmp/quipsly-capture-derived-data
  RESOLVE_TIMEOUT_SECONDS=900
  BUILD_TIMEOUT_SECONDS=1200
  QUIPSLY_CAPTURE_BUILD_DESTINATION='generic/platform=iOS Simulator'
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-simulator)
      RUN_BUILD=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  python3 - "$timeout_seconds" "$@" <<'PY'
import subprocess
import sys

timeout = int(sys.argv[1])
cmd = sys.argv[2:]

try:
    process = subprocess.Popen(cmd)
except FileNotFoundError as error:
    print(f"ERROR: command not found: {cmd[0]}", file=sys.stderr)
    raise SystemExit(127) from error

try:
    raise SystemExit(process.wait(timeout=timeout))
except subprocess.TimeoutExpired:
    print(f"ERROR: command timed out after {timeout}s: {' '.join(cmd)}", file=sys.stderr)
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    raise SystemExit(124)
PY
}

quarantine_incomplete_package_cache() {
  local checkout_root="$PACKAGE_CACHE/checkouts"
  local incomplete_checkout=""
  [[ -d "$checkout_root" ]] || return 0
  incomplete_checkout="$({
    find "$checkout_root" -mindepth 1 -maxdepth 1 -type d \
      ! -exec test -f '{}/Package.swift' \; -print -quit
  } 2>/dev/null || true)"
  [[ -n "$incomplete_checkout" ]] || return 0

  local quarantine_path="${PACKAGE_CACHE}.incomplete.$(date -u +%Y%m%dT%H%M%SZ).$$"
  echo "WARN: Swift package cache has an incomplete checkout: $incomplete_checkout" >&2
  echo "WARN: Moving the recoverable cache aside before dependency resolution: $quarantine_path" >&2
  mv "$PACKAGE_CACHE" "$quarantine_path"
}

if [[ ! -d "$DEVELOPER_DIR_VALUE" ]]; then
  echo "ERROR: Full Xcode developer directory not found: $DEVELOPER_DIR_VALUE" >&2
  echo "Install Xcode or set DEVELOPER_DIR to the full Xcode developer directory." >&2
  exit 1
fi

if [[ ! -f "$PROJECT/project.pbxproj" ]]; then
  echo "ERROR: Missing Xcode project: $PROJECT" >&2
  exit 1
fi

if ! grep -q 'https://github.com/livekit/client-sdk-swift-xcframework.git' "$PROJECT/project.pbxproj"; then
  echo "ERROR: HighGroundCapture is missing the LiveKit Swift xcframework package reference." >&2
  exit 1
fi

if ! grep -q 'productName = LiveKit;' "$PROJECT/project.pbxproj"; then
  echo "ERROR: HighGroundCapture is missing the LiveKit product dependency." >&2
  exit 1
fi

if ! grep -q "version = ${LIVEKIT_SWIFT_VERSION};" "$PROJECT/project.pbxproj"; then
  echo "ERROR: HighGroundCapture is not pinned to reviewed LiveKit ${LIVEKIT_SWIFT_VERSION}." >&2
  exit 1
fi

quarantine_incomplete_package_cache

echo "Validating HighGroundCapture LiveKit provider-room linkage"
echo "Project: $PROJECT"
echo "Xcode:   $DEVELOPER_DIR_VALUE"
echo "Cache:   $PACKAGE_CACHE"
echo "Derived: $DERIVED_DATA_PATH"
echo "Resolve timeout: ${RESOLVE_TIMEOUT_SECONDS}s"
echo "Package: https://github.com/livekit/client-sdk-swift-xcframework.git @ ${LIVEKIT_SWIFT_VERSION}"
if [[ "$RUN_BUILD" == "1" ]]; then
  echo "Build destination: $BUILD_DESTINATION"
  echo "Build timeout: ${BUILD_TIMEOUT_SECONDS}s"
fi
echo

DEVELOPER_DIR="$DEVELOPER_DIR_VALUE" run_with_timeout "$RESOLVE_TIMEOUT_SECONDS" xcodebuild \
  -resolvePackageDependencies \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -clonedSourcePackagesDirPath "$PACKAGE_CACHE"

echo
echo "PASS LiveKit package dependencies resolved for HighGroundCapture."

if [[ "$RUN_BUILD" == "1" ]]; then
  echo
  echo "Building HighGroundCapture for simulator..."
  DEVELOPER_DIR="$DEVELOPER_DIR_VALUE" run_with_timeout "$BUILD_TIMEOUT_SECONDS" xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -destination "$BUILD_DESTINATION" \
    -clonedSourcePackagesDirPath "$PACKAGE_CACHE" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    CODE_SIGNING_ALLOWED=NO \
    build
  echo
  echo "PASS HighGroundCapture simulator build completed with LiveKit linked."
fi

echo "Next proof: join a Nest-issued room packet on simulator/device."
