#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="com.quipsly.mac"
PROJECT_SLUG="high-ground-odyssey-manuscript"
EPISODE_SLUG="${1:-episode-2}"

case "$EPISODE_SLUG" in
  episode-1) MENU_TITLE="Open Episode 1" ;;
  episode-2) MENU_TITLE="Open Episode 2" ;;
  episode-3) MENU_TITLE="Open Episode 3" ;;
  episode-4) MENU_TITLE="Open Episode 4" ;;
  *)
    echo "FAIL: unsupported native command smoke episode: $EPISODE_SLUG" >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR"

echo "== Quipsly Mac native command smoke =="
echo "Menu command: $MENU_TITLE"

# Seed deliberately bad route state. The native Episode menu should be an
# explicit project+episode command, not a partial-text-field hostage.
defaults write "$BUNDLE_ID" quipslyMac.selectedSection assumptions
defaults write "$BUNDLE_ID" quipslyMac.editorProjectSlug "bad-partial-route"
defaults write "$BUNDLE_ID" quipslyMac.editorEpisodeSlug "episode-x"

./script/build_and_run.sh --verify

/usr/bin/osascript <<APPLESCRIPT
tell application "Quipsly Mac" to activate
delay 0.5
tell application "System Events"
  tell process "QuipslyMac"
    click menu item "$MENU_TITLE" of menu "Episode" of menu bar 1
  end tell
end tell
APPLESCRIPT

for _ in $(seq 1 80); do
  section="$(defaults read "$BUNDLE_ID" quipslyMac.selectedSection 2>/dev/null || true)"
  project="$(defaults read "$BUNDLE_ID" quipslyMac.editorProjectSlug 2>/dev/null || true)"
  episode="$(defaults read "$BUNDLE_ID" quipslyMac.editorEpisodeSlug 2>/dev/null || true)"

  if [[ "$section" == "episodeEditor" && "$project" == "$PROJECT_SLUG" && "$episode" == "$EPISODE_SLUG" ]]; then
    echo "PASS: native menu command selected $PROJECT_SLUG / $EPISODE_SLUG"
    exit 0
  fi

  sleep 0.25
done

echo "FAIL: native menu command did not set expected route." >&2
echo "section=$section" >&2
echo "project=$project" >&2
echo "episode=$episode" >&2
exit 1
