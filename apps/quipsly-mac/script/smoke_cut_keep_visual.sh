#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_FILE="$HOME/Library/Application Support/QuipslyMac/local-episode-edits/$PROJECT_SLUG/$EPISODE_SLUG.json"
SMOKE_ROOT="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
SMOKE_DIR="$SMOKE_ROOT/cut-keep-visual-${PROJECT_SLUG}-${EPISODE_SLUG}-$$"
BEFORE_FILE="$SMOKE_DIR/session-before.json"
TARGET_FILE="$SMOKE_DIR/target.json"

mkdir -p "$SMOKE_DIR"

cleanup() {
  defaults delete "$BUNDLE_ID" quipslyMac.smokeEpisodeEditorSelectedClipId >/dev/null 2>&1 || true
  if [ -f "$BEFORE_FILE" ]; then
    cp "$BEFORE_FILE" "$SESSION_FILE"
  fi
}
trap cleanup EXIT

cd "$ROOT_DIR"

echo "== Quipsly Mac Cut/Keep visual smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"

if [ ! -f "$SESSION_FILE" ]; then
  echo "FAIL: missing local edit session: $SESSION_FILE" >&2
  exit 1
fi

cp "$SESSION_FILE" "$BEFORE_FILE"

node - "$SESSION_FILE" "$TARGET_FILE" <<'NODEPREP'
const fs = require('fs');
const [sessionFile, targetFile] = process.argv.slice(2);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

function naturalTrackOrder(trackId) {
  const text = String(trackId || '').toUpperCase();
  const digits = Number(text.replace(/\D/g, '') || 0);
  if (text.startsWith('V')) return 10000 + digits;
  if (text.startsWith('A')) return digits;
  return 5000 + digits;
}

function contains(clip, playhead) {
  return playhead >= Number(clip.startIn || 0) && playhead < Number(clip.startIn || 0) + Math.max(0.05, Number(clip.duration || 0));
}

function programClip(playhead, includeInactive) {
  return session.editDecisions
    .filter((clip) =>
      (String(clip.trackId).toUpperCase().startsWith('V') || String(clip.kind).toLowerCase() === 'video') &&
      contains(clip, playhead) &&
      (includeInactive || clip.isActive === true)
    )
    .sort((a, b) => naturalTrackOrder(b.trackId) - naturalTrackOrder(a.trackId))[0];
}

const candidates = session.editDecisions
  .filter((clip) =>
    clip.isActive === true &&
    (String(clip.trackId).toUpperCase().startsWith('V') || String(clip.kind).toLowerCase() === 'video') &&
    Number(clip.duration) > 0.2 &&
    (
      (typeof clip.playbackMediaPath === 'string' && fs.existsSync(clip.playbackMediaPath)) ||
      (typeof clip.localMediaPath === 'string' && fs.existsSync(clip.localMediaPath))
    )
  )
  .filter((clip) => {
    const sample = Number(clip.startIn || 0) + Math.min(0.05, Math.max(0.01, Number(clip.duration || 0) / 2));
    return programClip(sample, false)?.id === clip.id && programClip(sample, true)?.id === clip.id;
  })
  .sort((a, b) => Number(a.startIn || 0) - Number(b.startIn || 0));

const target = candidates[0];
if (!target) fail('No active video clip available for reversible Cut/Keep visual smoke.');

for (const clip of session.editDecisions) {
  if (clip.id === target.id) {
    clip.isActive = false;
    clip.editDecision = {
      ...(clip.editDecision || {}),
      active: false,
      reason: 'cut-keep-visual-smoke'
    };
  }
}

session.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
fs.writeFileSync(targetFile, JSON.stringify({
  id: target.id,
  name: target.name,
  trackId: target.trackId,
  startIn: target.startIn,
  duration: target.duration
}, null, 2));
NODEPREP

TARGET_ID="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).id" "$TARGET_FILE")"
TARGET_NAME="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).name" "$TARGET_FILE")"
echo "Target cut candidate: $TARGET_NAME ($TARGET_ID)"

defaults write "$BUNDLE_ID" quipslyMac.smokeEpisodeEditorSelectedClipId "$TARGET_ID"

QUIPSLY_MAC_SMOKE_DIR="$SMOKE_DIR" QUIPSLY_MAC_ALLOW_UNPLAYABLE_PROGRAM=1 ./script/smoke_episode_editor.sh "$PROJECT_SLUG" "$EPISODE_SLUG"

SNAPSHOT_FILE="$(find "$SMOKE_DIR" -name "episode-editor-visible-${PROJECT_SLUG}-${EPISODE_SLUG}-*.json" -print -quit)"
SCREENSHOT_FILE="$SMOKE_DIR/episode-editor-${PROJECT_SLUG}-${EPISODE_SLUG}.png"

node - "$SNAPSHOT_FILE" "$TARGET_ID" "$SESSION_FILE" "$BEFORE_FILE" "$SCREENSHOT_FILE" <<'NODEVERIFY'
const fs = require('fs');
const [snapshotFile, targetId, sessionFile, beforeFile, screenshotFile] = process.argv.slice(2);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function comparableSession(file) {
  const value = readJson(file);
  delete value.updatedAt;
  return JSON.stringify(value);
}

if (!snapshotFile || !fs.existsSync(snapshotFile)) fail('Missing visible editor snapshot for Cut/Keep visual smoke.');
if (!fs.existsSync(screenshotFile) || fs.statSync(screenshotFile).size <= 0) fail('Missing Cut/Keep visual screenshot.');

const snapshot = readJson(snapshotFile);
if (snapshot.selectedClipId !== targetId) fail(`Selected clip mismatch. Expected ${targetId}, got ${snapshot.selectedClipId}`);
if (snapshot.selectedClipIsActive !== false) fail('Selected clip was not rendered in the inactive/skipped state.');
if (snapshot.timelineVisibleInspectorControlsSchema !== 'selected-clip-visible-trim-move-controls-v3') fail('Cut/Keep visual controls schema missing.');
if (snapshot.selectedClipIsAtPlayhead !== true) fail('Inactive selected clip is not parked at the playhead.');
if (snapshot.timelineNavigatorInactiveSegments <= 0) fail('Timeline navigator did not expose inactive material.');

const activeSession = readJson(sessionFile);
const activeTarget = activeSession.clips.find((clip) => clip.id === targetId);
if (!activeTarget || activeTarget.isActive !== false) fail('Prepared session did not keep the target clip inactive during visual capture.');

const before = comparableSession(beforeFile);
const after = comparableSession(sessionFile);
if (before === after) fail('Cut/Keep smoke did not actually exercise an inactive session before restore.');

console.log(JSON.stringify({
  ok: true,
  targetClipId: targetId,
  selectedClipIsActive: snapshot.selectedClipIsActive,
  selectedClipIsAtPlayhead: snapshot.selectedClipIsAtPlayhead,
  timelineVisibleInspectorControlsSchema: snapshot.timelineVisibleInspectorControlsSchema,
  screenshot: screenshotFile,
  message: 'Inactive selected clip was rendered as a skipped Play Edit decision; cleanup will restore the original session.'
}, null, 2));
NODEVERIFY

cp "$BEFORE_FILE" "$SESSION_FILE"
rm -f "$BEFORE_FILE"

node - "$SESSION_FILE" "$TARGET_ID" <<'NODERESTORE'
const fs = require('fs');
const [sessionFile, targetId] = process.argv.slice(2);
const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
const target = session.editDecisions.find((clip) => clip.id === targetId);
if (!target || target.isActive !== true) {
  console.error('FAIL: Cut/Keep visual smoke did not restore the target clip to active.');
  process.exit(1);
}
NODERESTORE

echo "PASS: Cut/Keep visual smoke completed."
