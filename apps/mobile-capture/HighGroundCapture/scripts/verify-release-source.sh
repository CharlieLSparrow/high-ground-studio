#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "$script_dir/.." && pwd)"
project_path="$capture_root/HighGroundCapture.xcodeproj"
project_file="$project_path/project.pbxproj"
privacy_manifest="$capture_root/HighGroundCapture/PrivacyInfo.xcprivacy"
provider_room="$capture_root/HighGroundCapture/ProviderRoomController.swift"
export_options="$capture_root/fastlane/ExportOptions.plist"
fastfile="$capture_root/fastlane/Fastfile"
developer_dir="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

fail() {
  echo "FAIL $*" >&2
  exit 1
}

pass() {
  echo "PASS $*"
}

require_text() {
  local file="$1"
  local expected="$2"
  local label="$3"
  grep -Fq "$expected" "$file" || fail "$label"
  pass "$label"
}

require_absent_text() {
  local file="$1"
  local forbidden="$2"
  local label="$3"
  if grep -Fq "$forbidden" "$file"; then
    fail "$label"
  fi
  pass "$label"
}

[[ -d "$developer_dir" ]] || fail "Full Xcode developer directory is unavailable at $developer_dir"
export DEVELOPER_DIR="$developer_dir"
xcodebuild -version
pass "Full Xcode is available"

plutil -lint "$privacy_manifest" >/dev/null
pass "Privacy manifest is valid"
require_text "$privacy_manifest" "<false/>" "Privacy manifest declares no tracking"
require_text "$privacy_manifest" "NSPrivacyCollectedDataTypeAudioData" "Privacy manifest declares audio data"
require_text "$privacy_manifest" "NSPrivacyAccessedAPICategoryDiskSpace" "Privacy manifest declares disk-space API use"
require_text "$privacy_manifest" "E174.1" "Privacy manifest declares the capture storage reason"

require_text "$project_file" "INFOPLIST_KEY_NSCameraUsageDescription" "Dependency-required camera purpose key is configured"
require_text "$project_file" "only after you explicitly choose video" "Camera purpose string requires explicit video choice"
require_text "$project_file" "Audio recording does not use the camera" "Camera purpose string preserves the audio boundary"
require_text "$project_file" "INFOPLIST_KEY_NSMicrophoneUsageDescription" "Microphone purpose key is configured"
require_text "$project_file" "after you explicitly start recording" "Microphone purpose string requires explicit capture"
require_text "$project_file" "INFOPLIST_KEY_UIBackgroundModes = audio;" "Audio background mode is configured"
require_text "$project_file" "PRODUCT_BUNDLE_IDENTIFIER = com.highgroundodyssey.HighGroundCapture;" "Production app bundle identifier is configured"
require_text "$project_file" "PRODUCT_BUNDLE_IDENTIFIER = com.highgroundodyssey.HighGroundCapture.ShareCapture;" "Production extension bundle identifier is configured"
require_text "$provider_room" "configuration.supportsVideo = false" "The current audio-first CallKit surface keeps video disabled"

plutil -lint "$export_options" >/dev/null
require_text "$export_options" "<string>app-store-connect</string>" "Export uses the current App Store Connect method"
require_text "$export_options" "<key>manageAppVersionAndBuildNumber</key>" "Export controls build-number mutation explicitly"
require_text "$fastfile" "project: PROJECT_PATH" "Fastlane builds the real Xcode project"
require_absent_text "$fastfile" "HighGroundCapture.xcworkspace" "Fastlane no longer references a nonexistent workspace"
require_absent_text "$fastfile" "increment_build_number" "Fastlane does not silently mutate the committed build number"

app_settings="$(
  xcodebuild \
    -project "$project_path" \
    -target HighGroundCapture \
    -configuration Release \
    -showBuildSettings
)"
extension_settings="$(
  xcodebuild \
    -project "$project_path" \
    -target ShareCaptureExtension \
    -configuration Release \
    -showBuildSettings
)"

setting_value() {
  local settings="$1"
  local key="$2"
  awk -F ' = ' -v key="$key" '$1 ~ "^[[:space:]]*" key "$" { print $2; exit }' <<<"$settings"
}

app_version="$(setting_value "$app_settings" MARKETING_VERSION)"
app_build="$(setting_value "$app_settings" CURRENT_PROJECT_VERSION)"
extension_version="$(setting_value "$extension_settings" MARKETING_VERSION)"
extension_build="$(setting_value "$extension_settings" CURRENT_PROJECT_VERSION)"

[[ -n "$app_version" && -n "$app_build" ]] || fail "Could not resolve the app version from Release build settings"
[[ "$app_version" == "$extension_version" ]] || fail "App and extension marketing versions differ"
[[ "$app_build" == "$extension_build" ]] || fail "App and extension build numbers differ"
pass "App and extension versions match at $app_version ($app_build)"

echo "PASS Quipsly Capture release source is internally consistent"
