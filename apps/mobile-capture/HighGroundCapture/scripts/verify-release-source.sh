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
isolated_release_runner="$capture_root/../../../scripts/release/quipsly-capture-release-from-commit.sh"
isolated_preflight_runner="$capture_root/../../../scripts/release/quipsly-capture-preflight-from-commit.sh"
nest_evidence_contract_test="$capture_root/scripts/test-nest-source-evidence-contract.sh"
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
require_text "$app_info_plist" "UIBackgroundModes" "Call and audio background mode key is configured"
[[ "$(/usr/libexec/PlistBuddy -c "Print :ITSAppUsesNonExemptEncryption" "$app_info_plist")" == "false" ]] ||
  fail "Export compliance metadata must declare no non-exempt encryption"
pass "Export compliance metadata declares no non-exempt encryption"
/usr/libexec/PlistBuddy -c "Print :UIBackgroundModes" "$app_info_plist" | grep -q "audio" ||
  fail "Audio background mode does not contain audio"
pass "Audio background mode contains audio"
/usr/libexec/PlistBuddy -c "Print :UIBackgroundModes" "$app_info_plist" | grep -q "voip" ||
  fail "CallKit provider-room support requires the voip background mode"
pass "CallKit provider-room background mode contains voip"
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
require_text "$fastfile" 'sh("bash", SOURCE_VERIFIER)' "Release source verification preserves worktree paths containing spaces"
require_text "$fastfile" 'QUIPSLY_CAPTURE_UI_TEST_RUN_ID' "Capture UI evidence is isolated per invocation"
require_text "$fastfile" 'File.join(output_base_root, source_label, test_run_id)' "Configured Capture UI roots remain source- and run-scoped"
require_text "$fastfile" 'capture_status.empty? ? "" : "-dirty"' "Capture UI evidence labels working-tree drift"
require_text "$fastfile" 'QUIPSLY_CAPTURE_DERIVED_DATA_DIR' "Capture release can relocate Xcode DerivedData off the system volume"
require_text "$fastfile" 'source_label: source_label' "Relocated Capture DerivedData remains source-scoped"
require_text "$fastfile" 'run_id: test_run_id' "Relocated Capture UI DerivedData remains invocation-scoped"
require_text "$fastfile" 'run_id: release_run_id' "Relocated Capture archive DerivedData remains release-scoped"
require_text "$fastfile" 'derived_data_path: derived_data_path' "Capture UI and archive lanes use run-scoped DerivedData"
require_text "$fastfile" 'lane :candidate do |options|' "Capture exposes an auth-free candidate qualification lane"
require_text "$fastfile" 'receipt["candidateQualified"] = true' "Candidate receipt records deterministic UI and signed-artifact qualification"
require_text "$fastfile" 'candidate(options)' "TestFlight reuses the complete candidate qualification lane"
require_text "$fastfile" 'lane :upload_qualified do |options|' "Capture exposes a sealed-candidate upload lane"
require_text "$fastfile" 'paths = qualified_release_paths(receipt_path)' "Sealed upload re-verifies its qualified receipt"
require_text "$fastfile" 'Candidate upload was already attempted; use App Store Connect readback.' "Sealed upload refuses an ambiguous repeated provider attempt"
require_text "$fastfile" 'Digest::SHA256.file(paths[:ipa_path]).hexdigest == receipt["ipaSHA256"]' "Sealed upload binds the IPA to its qualified receipt"
require_text "$fastfile" 'sh(ARTIFACT_VERIFIER, paths[:archive_path], paths[:ipa_path])' "Sealed upload repeats packaged signature and metadata verification"
require_text "$fastfile" 'ENV["QUIPSLY_CAPTURE_RELEASE_ISOLATED"] == "1"' "TestFlight upload requires committed-source isolation"
require_text "$fastfile" 'App Store Connect API key must not be group- or world-readable.' "TestFlight requires an owner-only API credential"
require_text "$fastfile" 'Dir.mktmpdir("quipsly-capture-upload-", "/private/tmp")' "TestFlight upload stages the IPA on a space-free system path"
require_text "$fastfile" 'Digest::SHA256.file(upload_ipa_path).hexdigest == Digest::SHA256.file(paths[:ipa_path]).hexdigest' "TestFlight upload verifies the staged IPA bytes"
require_text "$fastfile" 'ENV["TMPDIR"] = "/private/tmp"' "TestFlight transporter uses a space-free temporary path"
require_text "$fastfile" 'ENV["TMPDIR"] = previous_tmpdir' "TestFlight transporter restores the operator temporary path"
require_text "$fastfile" 'FileUtils.rm_rf(upload_staging_root)' "TestFlight upload removes its temporary staging copy"
require_text "$fastfile" 'receipt["uploadPerformed"] = true' "Successful TestFlight return updates the release receipt"
require_text "$fastfile" 'unknown-until-app-store-connect-readback' "Ambiguous TestFlight attempts require provider readback"
require_text "$fastfile" 'write_release_receipt' "Release receipt updates use the atomic writer"
require_text "$fastfile" 'File.chmod(0o600, temporary_path)' "Release receipt updates preserve owner-only permissions"
require_text "$fastfile" 'physicalTestFlightInstallReadbackPerformed' "Release receipt preserves the physical-install proof boundary"
require_text "$gemfile" 'ruby file: ".ruby-version"' "Capture Ruby is source-pinned"
require_regex "$gemfile" '^gem "fastlane", "[0-9]+\.[0-9]+\.[0-9]+"$' "Fastlane is directly pinned"
require_regex "$ruby_version_file" '^[0-9]+\.[0-9]+\.[0-9]+$' "Pinned Ruby version is valid"
require_regex "$gemfile_lock" '^BUNDLED WITH$' "Bundler version is locked"
require_text "$fastlane_runner" 'bundle" install --jobs 4 --retry 3' "Capture runner installs the locked dependency graph"
require_text "$fastlane_runner" 'git diff --quiet -- Gemfile Gemfile.lock .ruby-version' "Capture runner rejects dependency drift"
require_text "$fastlane_runner" 'export DEVELOPER_DIR=' "Capture runner pins full Xcode for child diagnostics"
require_text "$isolated_release_runner" 'worktree add --detach "$worktree_path" "$source_revision"' "Capture release uses a detached committed worktree"
require_text "$isolated_release_runner" 'export QUIPSLY_CAPTURE_RELEASE_ISOLATED=1' "Capture release marks the isolated source boundary"
require_text "$isolated_release_runner" 'export QUIPSLY_CAPTURE_RELEASE_RUN_ID=' "Capture release isolates each invocation's evidence"
require_text "$isolated_release_runner" '"$capture_runner" "$lane"' "Isolated release invokes the pinned Capture runner"
require_text "$isolated_release_runner" 'candidate | release | beta | upload_qualified' "Isolated release accepts sealed-candidate upload reuse"
require_text "$isolated_preflight_runner" 'worktree add --detach "$worktree_path" "$source_revision"' "Full Capture preflight uses a detached committed worktree"
require_text "$isolated_preflight_runner" 'pnpm install --frozen-lockfile' "Full Capture preflight recreates the locked pnpm workspace graph"
require_text "$isolated_preflight_runner" 'export QUIPSLY_CAPTURE_PREFLIGHT_ISOLATED=1' "Full Capture preflight marks the isolated source boundary"
require_text "$isolated_preflight_runner" '"$preflight"' "Full Capture preflight invokes the committed contract runner"
require_text "$testflight_runner" 'exec "${release_runner}" beta "$@"' "TestFlight entry point uses committed-source isolation"
require_absent_text "$testflight_runner" "gem install bundler" "TestFlight entry point never mutates Apple system Ruby"

"$nest_evidence_contract_test"
pass "Nest source-evidence comparison contract passes"

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
