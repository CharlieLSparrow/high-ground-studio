#!/usr/bin/env bash
set -euo pipefail

CAPTURE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(git -C "$CAPTURE_ROOT" rev-parse --show-toplevel)"
PROJECT_PATH="$CAPTURE_ROOT/HighGroundCapture.xcodeproj"
SCHEME="HighGroundCapture"
DEVICE_NAME="${QUIPSLY_CAPTURE_SCREENSHOT_DEVICE:-iPhone 17 Pro Max}"
DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export DEVELOPER_DIR

SOURCE_REVISION="$(git -C "$REPO_ROOT" rev-parse HEAD)"
SOURCE_SHORT="${SOURCE_REVISION:0:12}"
RUN_ID="${QUIPSLY_CAPTURE_SCREENSHOT_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
OUTPUT_ROOT="${QUIPSLY_CAPTURE_SCREENSHOT_DIR:-/tmp/quipsly-capture-app-store-drafts/$SOURCE_SHORT/$RUN_ID}"
RESULT_BUNDLE="$OUTPUT_ROOT/QuipslyCapture-AppStore-Drafts.xcresult"
ATTACHMENT_DIRECTORY="$OUTPUT_ROOT/xcresult-attachments"
DERIVED_DATA="$OUTPUT_ROOT/DerivedData"
METADATA_PATH="$REPO_ROOT/release/app-store/quipsly-capture/en-US.json"

DEVICE_ID="$(
  xcrun simctl list devices available --json |
    node -e '
      let input = "";
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const name = process.argv[1];
        const devices = Object.values(JSON.parse(input).devices).flat();
        const match = devices.find((device) => device.name === name && device.isAvailable);
        if (!match) process.exit(2);
        process.stdout.write(match.udid);
      });
    ' "$DEVICE_NAME"
)" || {
  echo "FAIL No available simulator named $DEVICE_NAME." >&2
  echo "Available devices:" >&2
  xcrun simctl list devices available >&2
  exit 1
}

mkdir -p "$OUTPUT_ROOT"
xcrun simctl boot "$DEVICE_ID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$DEVICE_ID" -b
xcrun simctl status_bar "$DEVICE_ID" override \
  --dataNetwork wifi \
  --wifiMode active \
  --wifiBars 3 \
  --cellularMode active \
  --cellularBars 4 \
  --batteryState charged \
  --batteryLevel 100

clear_status_bar() {
  xcrun simctl status_bar "$DEVICE_ID" clear >/dev/null 2>&1 || true
}
trap clear_status_bar EXIT

echo "INFO Capturing private-data-safe draft screenshots on $DEVICE_NAME ($DEVICE_ID)."
echo "INFO Evidence root: $OUTPUT_ROOT"
xcodebuild test \
  -quiet \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  -resultBundlePath "$RESULT_BUNDLE" \
  -only-testing:HighGroundCaptureUITests/CaptureAppStoreScreenshotUITests/testCapturePrivateDataSafeDrafts \
  -parallel-testing-enabled NO \
  COMPILER_INDEX_STORE_ENABLE=NO

mkdir -p "$ATTACHMENT_DIRECTORY"
xcrun xcresulttool export attachments \
  --path "$RESULT_BUNDLE" \
  --output-path "$ATTACHMENT_DIRECTORY"

SOURCE_DIRTY_ARGUMENT=()
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain -- apps/mobile-capture/HighGroundCapture release/app-store/quipsly-capture)" ]]; then
  SOURCE_DIRTY_ARGUMENT=(--source-dirty)
fi

node "$CAPTURE_ROOT/scripts/app-store-draft-screenshots.mjs" \
  --metadata "$METADATA_PATH" \
  --manifest "$ATTACHMENT_DIRECTORY/manifest.json" \
  --exported-directory "$ATTACHMENT_DIRECTORY" \
  --output-directory "$OUTPUT_ROOT" \
  --source-revision "$SOURCE_REVISION" \
  "${SOURCE_DIRTY_ARGUMENT[@]}" \
  --result-bundle "$RESULT_BUNDLE" \
  --device-name "$DEVICE_NAME" \
  --device-id "$DEVICE_ID"
