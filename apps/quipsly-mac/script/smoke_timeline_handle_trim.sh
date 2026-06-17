#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_FILE="$HOME/Library/Application Support/QuipslyMac/local-episode-edits/$PROJECT_SLUG/$EPISODE_SLUG.json"
SMOKE_DIR="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
RESULT_FILE="$SMOKE_DIR/timeline-handle-trim-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
BEFORE_FILE="$SMOKE_DIR/timeline-handle-trim-before-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
LOCK_DIR="$SMOKE_DIR/episode-editor-smoke.lock"
REQUEST_ID="timeline-handle-trim-smoke-$(date +%s)"
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

echo "== Quipsly Mac timeline handle trim smoke =="
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

QUIPSLY_MAC_SMOKE_TIMELINE_HANDLE_TRIM_REQUEST_ID="$REQUEST_ID" \
QUIPSLY_MAC_SMOKE_TIMELINE_HANDLE_TRIM_RESULT_PATH="$RESULT_FILE" \
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

function approx(left, right) {
  return Math.abs(Number(left) - Number(right)) <= 0.000001;
}

function poll() {
  const result = readJson(resultFile);
  if (result?.requestId === requestId) {
    console.log(JSON.stringify(result, null, 2));

    if (result.ok !== true) fail(result.message || 'Timeline handle trim smoke returned non-ok result.');
    if (!result.targetClipId) fail('No target clip was selected.');
    if (!String(result.targetTrackId || '').toUpperCase().startsWith('V')) fail(`Target clip is not a V* track: ${result.targetTrackId}`);
    if (result.beforeClipCount !== result.changedInClipCount) fail('Source-in handle trim changed the clip count.');
    if (result.beforeClipCount !== result.changedOutClipCount) fail('Source-out handle trim changed the clip count.');
    if (result.beforeClipCount !== result.restoredClipCount) fail('Restore changed the clip count.');
    if (result.sourceInWorked !== true) fail('Source-in handle trim did not report success.');
    if (result.sourceOutWorked !== true) fail('Source-out handle trim did not report success.');
    if (result.precisionSourceInWorked !== true) fail('Precision source-in trim sequence did not report success.');
    if (result.precisionSourceOutWorked !== true) fail('Precision source-out trim sequence did not report success.');
    const expectedSourceInDeltas = [0.1, 1, 10, -0.1, -1, -10];
    const expectedSourceOutDeltas = [-0.1, -1, -10, 0.1, 1, 10];
    if (JSON.stringify(result.precisionSourceInDeltas) !== JSON.stringify(expectedSourceInDeltas)) fail(`Unexpected precisionSourceInDeltas: ${JSON.stringify(result.precisionSourceInDeltas)}`);
    if (JSON.stringify(result.precisionSourceOutDeltas) !== JSON.stringify(expectedSourceOutDeltas)) fail(`Unexpected precisionSourceOutDeltas: ${JSON.stringify(result.precisionSourceOutDeltas)}`);
    if (!Array.isArray(result.precisionSourceInStarts) || result.precisionSourceInStarts.length !== expectedSourceInDeltas.length) fail('Missing precisionSourceInStarts sequence.');
    if (!Array.isArray(result.precisionSourceOutEnds) || result.precisionSourceOutEnds.length !== expectedSourceOutDeltas.length) fail('Missing precisionSourceOutEnds sequence.');
    let expectedSourceStart = Number(result.beforeSourceStart);
    for (let index = 0; index < expectedSourceInDeltas.length; index += 1) {
      expectedSourceStart = Math.max(0, Math.min(Number(result.beforeSourceEnd) - 0.05, expectedSourceStart + expectedSourceInDeltas[index]));
      if (!approx(result.precisionSourceInStarts[index], expectedSourceStart)) fail(`Precision source-in ${index} expected ${expectedSourceStart}, got ${result.precisionSourceInStarts[index]}`);
    }
    let expectedSourceEnd = Number(result.beforeSourceEnd);
    for (let index = 0; index < expectedSourceOutDeltas.length; index += 1) {
      expectedSourceEnd = Math.max(Number(result.beforeSourceStart) + 0.05, expectedSourceEnd + expectedSourceOutDeltas[index]);
      if (!approx(result.precisionSourceOutEnds[index], expectedSourceEnd)) fail(`Precision source-out ${index} expected ${expectedSourceEnd}, got ${result.precisionSourceOutEnds[index]}`);
    }
    if (result.restoredCleanly !== true) fail('Handle trim restore did not report clean restoration.');
    if (!approx(result.changedInSourceStart, result.beforeSourceStart + result.sourceInDelta)) fail('Source-in handle did not move by the expected delta.');
    if (!approx(result.changedOutSourceEnd, result.beforeSourceEnd + result.sourceOutDelta)) fail('Source-out handle did not move by the expected delta.');
    if (!approx(result.restoredSourceStart, result.beforeSourceStart)) fail('sourceStart was not restored.');
    if (!approx(result.restoredSourceEnd, result.beforeSourceEnd)) fail('sourceEnd was not restored.');
    if (!approx(result.restoredDuration, result.beforeDuration)) fail('duration was not restored.');

    const before = comparableSession(beforeFile);
    const after = comparableSession(sessionFile);
    if (!before || !after) fail('Could not reload before/after session JSON.');
    if (before !== after) fail('Session differs after reversible timeline handle trim smoke restore.');

    process.exit(0);
  }

  if (Date.now() > deadline) {
    console.log(JSON.stringify(result, null, 2));
    fail('Timed out waiting for timeline handle trim smoke result.');
  }

  setTimeout(poll, 500);
}

poll();
NODEVERIFY

echo "PASS: Timeline handle trim smoke completed."
