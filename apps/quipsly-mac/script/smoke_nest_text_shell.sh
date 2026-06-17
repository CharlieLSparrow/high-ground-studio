#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="com.quipsly.mac"
cd "$ROOT_DIR"

echo "== Quipsly Mac Nest/Text shell smoke =="

defaults write "$BUNDLE_ID" quipslyMac.selectedSection dashboard
defaults write "$BUNDLE_ID" quipslyMac.editorProjectSlug "high-ground-odyssey-manuscript"

./script/build_and_run.sh --verify

click_nav_item() {
  local title="$1"
  /usr/bin/osascript <<APPLESCRIPT
tell application "Quipsly Mac" to activate
delay 0.5
tell application "System Events"
  tell process "QuipslyMac"
    click menu item "$title" of menu "Navigate" of menu bar 1
  end tell
end tell
APPLESCRIPT
}

wait_for_section() {
  local expected="$1"
  for _ in $(seq 1 80); do
    section="$(defaults read "$BUNDLE_ID" quipslyMac.selectedSection 2>/dev/null || true)"
    if [[ "$section" == "$expected" ]]; then
      echo "PASS: selected $expected"
      return 0
    fi
    sleep 0.25
  done

  echo "FAIL: expected selectedSection=$expected but saw ${section:-<unset>}" >&2
  return 1
}

click_nav_item "The Nest"
wait_for_section "nestProjects"

click_nav_item "Text Editor"
wait_for_section "manuscriptEditor"

echo "PASS: Nest/Text shell navigation is wired."
