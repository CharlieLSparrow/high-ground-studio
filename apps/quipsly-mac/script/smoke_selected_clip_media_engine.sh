#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
SOURCE_PATH="${3:-/Users/wall-e/Desktop/Podcast/2/Be a Goldfish.mp4}"
APP_NAME="QuipslyMac"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULT_FILE="$HOME/Library/Application Support/QuipslyMac/smoke/selected-clip-media-engine.json"
REQUEST_ID="selected-clip-engine-smoke-$(date +%s)"
SMOKE_DIR="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
LOCK_DIR="$SMOKE_DIR/episode-editor-smoke.lock"
HAVE_LOCK=0

cd "$ROOT_DIR"

echo "== Quipsly Mac selected clip Media Engine smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"
echo "Source:  $SOURCE_PATH"

if [ ! -f "$SOURCE_PATH" ]; then
  echo "FAIL: source file does not exist: $SOURCE_PATH" >&2
  exit 1
fi

node - <<'NODE'
const net = require('net');
const socket = net.createConnection(4000, '127.0.0.1');
socket.setTimeout(1500);
socket.on('connect', () => {
  socket.destroy();
  process.exit(0);
});
socket.on('timeout', () => {
  console.error('FAIL: local engine did not respond on port 4000.');
  socket.destroy();
  process.exit(1);
});
socket.on('error', (error) => {
  console.error(`FAIL: local engine is not reachable: ${error.code || error.message}`);
  process.exit(1);
});
NODE

mkdir -p "$(dirname "$RESULT_FILE")"
mkdir -p "$SMOKE_DIR"
for _ in $(seq 1 120); do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    HAVE_LOCK=1
    break
  fi
  sleep 0.5
done

if [ "$HAVE_LOCK" -ne 1 ]; then
  echo "FAIL: Could not acquire Episode Editor smoke lock: $LOCK_DIR" >&2
  exit 1
fi

rm -f "$RESULT_FILE"

defaults write "$BUNDLE_ID" quipslyMac.selectedSection episodeEditor
defaults write "$BUNDLE_ID" quipslyMac.editorProjectSlug "$PROJECT_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.editorEpisodeSlug "$EPISODE_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.smokeSelectedClipEngineRequestId "$REQUEST_ID"
defaults write "$BUNDLE_ID" quipslyMac.smokeSelectedClipMediaPath "$SOURCE_PATH"

cleanup() {
  defaults delete "$BUNDLE_ID" quipslyMac.smokeSelectedClipEngineRequestId >/dev/null 2>&1 || true
  defaults delete "$BUNDLE_ID" quipslyMac.smokeSelectedClipMediaPath >/dev/null 2>&1 || true
  if [ "$HAVE_LOCK" -eq 1 ]; then
    rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

./script/build_and_run.sh --verify

node - "$RESULT_FILE" "$REQUEST_ID" <<'NODE'
const fs = require('fs');
const [resultFile, requestId] = process.argv.slice(2);
const deadline = Date.now() + 75_000;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function readResult() {
  if (!fs.existsSync(resultFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  } catch {
    return null;
  }
}

function poll() {
  const result = readResult();
  if (result?.requestId === requestId) {
    if (result.ok === true) {
      if (!result.jumpedToClipId || !result.targetClipPlayable || !result.programClipHasPlayableMedia) {
        console.log(JSON.stringify(result, null, 2));
        fail('Selected clip proxy exists, but the editor did not jump to a playable monitor preview.');
      }
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    if (result.failed === true) {
      console.log(JSON.stringify(result, null, 2));
      fail(result.message || 'Selected clip Media Engine smoke failed.');
    }
  }

  if (Date.now() > deadline) {
    console.log(JSON.stringify(result, null, 2));
    fail('Timed out waiting for selected clip Media Engine smoke result.');
  }

  setTimeout(poll, 500);
}

poll();
NODE

echo "PASS: Selected clip Media Engine smoke completed."
