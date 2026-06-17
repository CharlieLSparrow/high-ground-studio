#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_FILE="$HOME/Library/Application Support/QuipslyMac/local-episode-edits/$PROJECT_SLUG/$EPISODE_SLUG.json"
SMOKE_DIR="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
RESULT_FILE="$SMOKE_DIR/timeline-undo-redo-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
BEFORE_FILE="$SMOKE_DIR/timeline-undo-redo-before-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
LOCK_DIR="$SMOKE_DIR/episode-editor-smoke.lock"
REQUEST_ID="timeline-undo-redo-smoke-$(date +%s)"
HAVE_LOCK=0

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

cleanup() {
  if [ "$HAVE_LOCK" -eq 1 ]; then
    rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "$ROOT_DIR"

echo "== Quipsly Mac timeline undo/redo smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"

if [ ! -f "$SESSION_FILE" ]; then
  echo "FAIL: missing local edit session: $SESSION_FILE" >&2
  exit 1
fi

cp "$SESSION_FILE" "$BEFORE_FILE"

defaults write "$BUNDLE_ID" quipslyMac.selectedSection episodeEditor
defaults write "$BUNDLE_ID" quipslyMac.editorProjectSlug "$PROJECT_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.editorEpisodeSlug "$EPISODE_SLUG"
rm -f "$RESULT_FILE"

QUIPSLY_MAC_SMOKE_TIMELINE_UNDO_REDO_REQUEST_ID="$REQUEST_ID" \
QUIPSLY_MAC_SMOKE_TIMELINE_UNDO_REDO_RESULT_PATH="$RESULT_FILE" \
QUIPSLY_MAC_SMOKE_PROJECT_SLUG="$PROJECT_SLUG" \
QUIPSLY_MAC_SMOKE_EPISODE_SLUG="$EPISODE_SLUG" \
  ./script/build_and_run.sh --verify

node - "$RESULT_FILE" "$REQUEST_ID" "$SESSION_FILE" "$BEFORE_FILE" <<'NODEVERIFY'
const fs = require('fs');
const [resultFile, requestId, sessionFile, beforeFile] = process.argv.slice(2);
const deadline = Date.now() + 45_000;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function comparableSession(file) {
  const value = readJson(file);
  if (!value) return null;
  delete value.updatedAt;
  return JSON.stringify(value);
}

function poll() {
  const result = readJson(resultFile);
  if (result?.requestId === requestId) {
    console.log(JSON.stringify(result, null, 2));

    if (result.ok !== true) fail(result.message || 'Timeline undo/redo smoke returned non-ok result.');
    if (!result.targetClipId) fail('No target clip was selected.');
    if (!String(result.targetTrackId || '').toUpperCase().startsWith('V')) fail(`Timeline undo/redo smoke target is not a V* track: ${result.targetTrackId}`);
    if (result.movedStartIn === result.beforeStartIn) fail('Timeline move did not change startIn.');
    if (result.undoWorked !== true) fail('Undo did not restore startIn.');
    if (result.redoWorked !== true) fail('Redo did not reapply startIn.');
    if (result.restoredCleanly !== true) fail('Final restore did not return to original state.');
    if (result.restoredStartIn !== result.beforeStartIn) fail('Restored startIn does not match beforeStartIn.');

    const before = comparableSession(beforeFile);
    const after = comparableSession(sessionFile);
    if (!before || !after) fail('Could not reload before/after session JSON.');
    if (before !== after) fail('Session differs after timeline undo/redo smoke restore.');

    process.exit(0);
  }

  if (Date.now() > deadline) {
    console.log(JSON.stringify(result, null, 2));
    fail('Timed out waiting for timeline undo/redo smoke result.');
  }

  setTimeout(poll, 500);
}

poll();
NODEVERIFY

echo "PASS: Timeline undo/redo smoke completed."
