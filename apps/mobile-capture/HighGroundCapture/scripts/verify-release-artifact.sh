#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <archive.xcarchive> [app.ipa]" >&2
  exit 64
fi

archive_path="$1"
ipa_path="${2:-}"
app_path="$archive_path/Products/Applications/HighGroundCapture.app"
extension_path="$app_path/PlugIns/ShareCaptureExtension.appex"

fail() {
  echo "FAIL $*" >&2
  exit 1
}

pass() {
  echo "PASS $*"
}

require_path() {
  [[ -e "$1" ]] || fail "Missing required artifact: $1"
}

require_plist_value() {
  local plist="$1"
  local key="$2"
  local expected="$3"
  local actual
  actual="$(/usr/libexec/PlistBuddy -c "Print :$key" "$plist" 2>/dev/null || true)"
  [[ "$actual" == "$expected" ]] || fail "$key expected '$expected' but found '$actual' in $plist"
  pass "$key = $expected"
}

verify_bundle() {
  local bundle_path="$1"
  local expected_identifier="$2"
  local info_plist="$bundle_path/Info.plist"

  require_path "$bundle_path"
  require_path "$info_plist"
  plutil -lint "$info_plist" >/dev/null
  require_plist_value "$info_plist" "CFBundleIdentifier" "$expected_identifier"
  codesign --verify --strict --deep "$bundle_path"
  pass "Strict nested signature: $bundle_path"
}

verify_capture_app() {
  local capture_app="$1"
  local info_plist="$capture_app/Info.plist"
  local camera_purpose
  local microphone_purpose

  verify_bundle "$capture_app" "com.highgroundodyssey.HighGroundCapture"
  require_path "$capture_app/PrivacyInfo.xcprivacy"
  plutil -lint "$capture_app/PrivacyInfo.xcprivacy" >/dev/null
  pass "App privacy manifest is packaged and valid"

  camera_purpose="$(/usr/libexec/PlistBuddy -c "Print :NSCameraUsageDescription" "$info_plist" 2>/dev/null || true)"
  [[ "$camera_purpose" == *"explicitly choose video"* ]] || fail "Packaged camera purpose string is missing the explicit-choice boundary"
  [[ "$camera_purpose" == *"Audio recording does not use the camera"* ]] || fail "Packaged camera purpose string is missing the audio boundary"
  pass "Packaged NSCameraUsageDescription is present and bounded"

  microphone_purpose="$(/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" "$info_plist" 2>/dev/null || true)"
  [[ "$microphone_purpose" == *"explicitly start recording"* ]] || fail "Packaged microphone purpose string is missing the explicit-start boundary"
  pass "Packaged NSMicrophoneUsageDescription is present and bounded"

  /usr/libexec/PlistBuddy -c "Print :UIBackgroundModes" "$info_plist" 2>/dev/null | grep -q "audio" ||
    fail "Packaged app does not declare audio background mode"
  pass "Packaged app declares audio background mode"
}

require_path "$archive_path"
verify_capture_app "$app_path"
verify_bundle "$extension_path" "com.highgroundodyssey.HighGroundCapture.ShareCapture"

app_version="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app_path/Info.plist")"
app_build="$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$app_path/Info.plist")"
extension_version="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$extension_path/Info.plist")"
extension_build="$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$extension_path/Info.plist")"
[[ "$app_version" == "$extension_version" ]] || fail "App and extension marketing versions differ"
[[ "$app_build" == "$extension_build" ]] || fail "App and extension build numbers differ"
pass "App and extension versions match at $app_version ($app_build)"

if [[ -n "$ipa_path" ]]; then
  require_path "$ipa_path"
  ipa_extract="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-ipa.XXXXXX")"
  trap 'rm -rf "$ipa_extract"' EXIT
  ditto -x -k "$ipa_path" "$ipa_extract"
  ipa_app="$(find "$ipa_extract/Payload" -maxdepth 1 -type d -name '*.app' -print -quit)"
  [[ -n "$ipa_app" ]] || fail "IPA does not contain an application bundle"
  verify_capture_app "$ipa_app"
  verify_bundle "$ipa_app/PlugIns/ShareCaptureExtension.appex" "com.highgroundodyssey.HighGroundCapture.ShareCapture"
  pass "Exported IPA passed packaged metadata and signature inspection"
fi

pass "Quipsly Capture release artifact is internally consistent"
