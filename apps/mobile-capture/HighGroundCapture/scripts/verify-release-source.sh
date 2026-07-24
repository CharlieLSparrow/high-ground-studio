#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "$script_dir/.." && pwd)"
project_path="$capture_root/HighGroundCapture.xcodeproj"
project_file="$project_path/project.pbxproj"
app_info_plist="$capture_root/HighGroundCapture/Info.plist"
privacy_manifest="$capture_root/HighGroundCapture/PrivacyInfo.xcprivacy"
provider_room="$capture_root/HighGroundCapture/ProviderRoomController.swift"
export_options="$capture_root/fastlane/ExportOptions.plist"
fastfile="$capture_root/fastlane/Fastfile"
gemfile="$capture_root/Gemfile"
gemfile_lock="$capture_root/Gemfile.lock"
ruby_version_file="$capture_root/.ruby-version"
fastlane_runner="$capture_root/scripts/run-fastlane.sh"
testflight_runner="$capture_root/../../../scripts/deploy-testflight.sh"
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

require_regex() {
  local file="$1"
  local expected="$2"
  local label="$3"
  grep -Eq "$expected" "$file" || fail "$label"
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

plutil -lint "$app_info_plist" >/dev/null
pass "App information property list is valid"
require_text "$project_file" "GENERATE_INFOPLIST_FILE = NO;" "App metadata uses the explicit source property list"
require_text "$project_file" "INFOPLIST_FILE = HighGroundCapture/Info.plist;" "App metadata source is configured"
require_text "$app_info_plist" "NSCameraUsageDescription" "Dependency-required camera purpose key is configured"
require_text "$app_info_plist" "only after you explicitly choose video" "Camera purpose string requires explicit video choice"
require_text "$app_info_plist" "Audio recording does not use the camera" "Camera purpose string preserves the audio boundary"
require_text "$app_info_plist" "NSMicrophoneUsageDescription" "Microphone purpose key is configured"
require_text "$app_info_plist" "after you explicitly start recording" "Microphone purpose string requires explicit capture"
require_text "$app_info_plist" "UIBackgroundModes" "Audio background mode key is configured"
/usr/libexec/PlistBuddy -c "Print :UIBackgroundModes" "$app_info_plist" | grep -q "audio" ||
  fail "Audio background mode does not contain audio"
pass "Audio background mode contains audio"
require_text "$project_file" "PRODUCT_BUNDLE_IDENTIFIER = com.highgroundodyssey.HighGroundCapture;" "Production app bundle identifier is configured"
require_text "$project_file" "PRODUCT_BUNDLE_IDENTIFIER = com.highgroundodyssey.HighGroundCapture.ShareCapture;" "Production extension bundle identifier is configured"
require_text "$provider_room" "configuration.supportsVideo = false" "The current audio-first CallKit surface keeps video disabled"

plutil -lint "$export_options" >/dev/null
require_text "$export_options" "<string>app-store-connect</string>" "Export uses the current App Store Connect method"
require_text "$export_options" "<key>manageAppVersionAndBuildNumber</key>" "Export controls build-number mutation explicitly"
require_text "$fastfile" "project: PROJECT_PATH" "Fastlane builds the real Xcode project"
require_absent_text "$fastfile" "HighGroundCapture.xcworkspace" "Fastlane no longer references a nonexistent workspace"
require_absent_text "$fastfile" "increment_build_number" "Fastlane does not silently mutate the committed build number"
require_text "$fastfile" "only_testing: DETERMINISTIC_UI_TESTS" "TestFlight runs the deterministic Capture UI scope"
require_text "$fastfile" "parallel_testing: false" "Capture UI tests run serially to avoid cloned Simulator launch noise"
require_text "$gemfile" 'ruby file: ".ruby-version"' "Capture Ruby is source-pinned"
require_regex "$gemfile" '^gem "fastlane", "[0-9]+\.[0-9]+\.[0-9]+"$' "Fastlane is directly pinned"
require_regex "$ruby_version_file" '^[0-9]+\.[0-9]+\.[0-9]+$' "Pinned Ruby version is valid"
require_regex "$gemfile_lock" '^BUNDLED WITH$' "Bundler version is locked"
require_text "$fastlane_runner" 'bundle" install --jobs 4 --retry 3' "Capture runner installs the locked dependency graph"
require_text "$fastlane_runner" 'git diff --quiet -- Gemfile Gemfile.lock .ruby-version' "Capture runner rejects dependency drift"
require_text "$testflight_runner" 'exec "${capture_runner}" beta "$@"' "TestFlight entry point uses the pinned Capture runner"
require_absent_text "$testflight_runner" "gem install bundler" "TestFlight entry point never mutates Apple system Ruby"

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
