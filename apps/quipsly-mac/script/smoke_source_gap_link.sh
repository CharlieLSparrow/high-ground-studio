#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
APP_NAME="QuipslyMac"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_FILE="$HOME/Library/Application Support/QuipslyMac/local-episode-edits/$PROJECT_SLUG/$EPISODE_SLUG.json"
SMOKE_DIR="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
SMOKE_BACKUP_DIR="$SMOKE_DIR/session-backups"
REQUEST_FILE="$SMOKE_DIR/source-gap-link-request-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
RESULT_FILE="$SMOKE_DIR/source-gap-link-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
REQUEST_ID="source-gap-link-smoke-$(date +%s)"
BACKUP_FILE=""

mkdir -p "$SMOKE_DIR" "$SMOKE_BACKUP_DIR"
cd "$ROOT_DIR"

echo "== Quipsly Mac source gap link smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"

if [ ! -f "$SESSION_FILE" ]; then
  echo "FAIL: missing local edit session: $SESSION_FILE" >&2
  exit 1
fi

node - "$SESSION_FILE" "$REQUEST_FILE" <<'NODEPREP'
const fs = require('fs');
const [sessionFile, requestFile] = process.argv.slice(2);
const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

function isVideoLike(clip) {
  return String(clip.trackId || '').toUpperCase().startsWith('V')
    || String(clip.kind || '').toLowerCase() === 'video'
    || String(clip.mediaKind || '').toLowerCase() === 'video';
}

function labelFor(clip) {
  return `${clip.trackId} ${clip.mediaDisplayName || clip.name}`;
}

function exists(path) {
  return typeof path === 'string' && path.length > 0 && fs.existsSync(path);
}

const missingGroups = new Map();
for (const clip of session.editDecisions || []) {
  if (!clip.isActive) continue;
  const path = typeof clip.localMediaPath === 'string' ? clip.localMediaPath.trim() : '';
  if (path && fs.existsSync(path)) continue;
  const label = labelFor(clip);
  const row = missingGroups.get(label) || { label, count: 0 };
  row.count += 1;
  missingGroups.set(label, row);
}

const group = [...missingGroups.values()].sort((a, b) => a.label.localeCompare(b.label))[0];
if (!group) {
  console.error('FAIL: no active missing source groups exist for this episode.');
  process.exit(1);
}

const candidate = (session.editDecisions || [])
  .filter((clip) => clip.isActive && isVideoLike(clip) && exists(clip.localMediaPath))
  .sort((a, b) => (a.startIn || 0) - (b.startIn || 0))[0];

if (!candidate) {
  console.error('FAIL: no existing active local video file is available as a temporary smoke stand-in.');
  process.exit(1);
}

fs.writeFileSync(requestFile, JSON.stringify({
  groupLabel: group.label,
  beforeMatchingMissing: group.count,
  filePath: candidate.localMediaPath,
  fileName: String(candidate.localMediaPath).split('/').pop(),
  candidateClipId: candidate.id,
  candidateClipName: candidate.name,
}, null, 2));
console.log(JSON.stringify({ groupLabel: group.label, beforeMatchingMissing: group.count, filePath: candidate.localMediaPath }, null, 2));
NODEPREP

GROUP_LABEL="$(node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(r.groupLabel);" "$REQUEST_FILE")"
FILE_PATH="$(node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(r.filePath);" "$REQUEST_FILE")"
BEFORE_MATCHING="$(node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(r.beforeMatchingMissing));" "$REQUEST_FILE")"

BACKUP_FILE="$SMOKE_BACKUP_DIR/${PROJECT_SLUG}-${EPISODE_SLUG}-source-gap-link-smoke-$(date -u +%Y-%m-%dT%H-%M-%S).session.json"
cp "$SESSION_FILE" "$BACKUP_FILE"
terminate_app_before_restore() {
  osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    if ! pgrep -x "$APP_NAME" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    if ! pgrep -x "$APP_NAME" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
}

restore_session() {
  if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    terminate_app_before_restore
    cp "$BACKUP_FILE" "$SESSION_FILE" >/dev/null 2>&1 || true
  fi
}
trap restore_session EXIT

rm -f "$RESULT_FILE"
QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_REQUEST_ID="$REQUEST_ID" \
QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_RESULT_PATH="$RESULT_FILE" \
QUIPSLY_MAC_SMOKE_PROJECT_SLUG="$PROJECT_SLUG" \
QUIPSLY_MAC_SMOKE_EPISODE_SLUG="$EPISODE_SLUG" \
QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_GROUP_LABEL="$GROUP_LABEL" \
QUIPSLY_MAC_SMOKE_SOURCE_GAP_LINK_FILE_PATH="$FILE_PATH" \
  ./script/build_and_run.sh --verify

node - "$RESULT_FILE" "$REQUEST_ID" "$BEFORE_MATCHING" <<'NODEVERIFY'
const fs = require('fs');
const [resultFile, requestId, beforeMatchingRaw] = process.argv.slice(2);
const deadline = Date.now() + 75_000;
const beforeMatching = Number(beforeMatchingRaw);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function readResult() {
  if (!fs.existsSync(resultFile)) return null;
  try { return JSON.parse(fs.readFileSync(resultFile, 'utf8')); } catch { return null; }
}

function poll() {
  const result = readResult();
  if (result?.requestId === requestId) {
    console.log(JSON.stringify(result, null, 2));
    if (result.ok !== true) fail(result.message || 'Source gap link smoke returned non-ok result.');
    if (result.beforeMatchingMissing !== beforeMatching) fail(`Before matching count mismatch: ${result.beforeMatchingMissing} !== ${beforeMatching}`);
    if (result.changedClips !== beforeMatching) fail(`Changed clip count mismatch: ${result.changedClips} !== ${beforeMatching}`);
    if (result.afterMatchingMissing !== 0) fail('Source gap link left matching active source decisions unresolved.');
    process.exit(0);
  }

  if (Date.now() > deadline) {
    console.log(JSON.stringify(result, null, 2));
    fail('Timed out waiting for source gap link smoke result.');
  }

  setTimeout(poll, 500);
}

poll();
NODEVERIFY

echo "PASS: Source gap link smoke completed. Restored original session from $BACKUP_FILE"
