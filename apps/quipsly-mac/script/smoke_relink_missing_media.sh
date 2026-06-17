#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-1}"
APP_NAME="QuipslyMac"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_FILE="$HOME/Library/Application Support/QuipslyMac/local-episode-edits/$PROJECT_SLUG/$EPISODE_SLUG.json"
SMOKE_DIR="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
SMOKE_BACKUP_DIR="$SMOKE_DIR/session-backups"
RESULT_FILE="$SMOKE_DIR/relink-missing-media-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
LOCK_DIR="$SMOKE_DIR/episode-editor-smoke.lock"
REQUEST_ID="relink-missing-media-smoke-$(date +%s)"
FAKE_MISSING_DIR="/tmp/quipsly-missing-media/$REQUEST_ID"
BACKUP_FILE=""
HAVE_LOCK=0

mkdir -p "$SMOKE_DIR" "$SMOKE_BACKUP_DIR"
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
  local status=$?
  defaults delete "$BUNDLE_ID" quipslyMac.smokeRelinkMissingMediaRequestId >/dev/null 2>&1 || true
  defaults delete "$BUNDLE_ID" quipslyMac.smokeRelinkMissingMediaResultPath >/dev/null 2>&1 || true
  rm -rf "$FAKE_MISSING_DIR" >/dev/null 2>&1 || true
  if [ "$status" -ne 0 ] && [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    cp "$BACKUP_FILE" "$SESSION_FILE" >/dev/null 2>&1 || true
    echo "Restored relink smoke backup after failure: $BACKUP_FILE" >&2
  fi
  if [ "$HAVE_LOCK" -eq 1 ]; then
    rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

cd "$ROOT_DIR"

echo "== Quipsly Mac relink missing media smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"

if [ ! -f "$SESSION_FILE" ]; then
  echo "FAIL: missing local edit session: $SESSION_FILE" >&2
  exit 1
fi

BACKUP_FILE="$SMOKE_BACKUP_DIR/${PROJECT_SLUG}-${EPISODE_SLUG}-relink-smoke-$(date -u +%Y-%m-%dT%H-%M-%SZ).session.json"
cp "$SESSION_FILE" "$BACKUP_FILE"

node - "$SESSION_FILE" "$BACKUP_FILE" "$FAKE_MISSING_DIR" <<'NODEPREP'
const fs = require('fs');
const path = require('path');
const [sessionFile, backupPath, fakeMissingDir] = process.argv.slice(2);
const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

let changed = 0;
const relinkRequiredClips = (session.editDecisions || [])
  .filter((clip) => clip.generatedFrom !== 'quipsly-mac-premiere-deactivated-source-range');
const existingPaths = new Set(
  relinkRequiredClips
    .map((clip) => clip.localMediaPath)
    .filter((value) => typeof value === 'string' && value.length > 0)
    .filter((value) => fs.existsSync(value))
);
const missingPaths = new Set(
  relinkRequiredClips
    .map((clip) => clip.localMediaPath)
    .filter((value) => typeof value === 'string' && value.length > 0)
    .filter((value) => !fs.existsSync(value))
);

if (missingPaths.size > 0) {
  console.log(JSON.stringify({
    backupPath,
    changedClipsMadeMissing: 0,
    uniquePathsMadeMissing: 0,
    existingMissingCondition: true,
    missingUniquePaths: missingPaths.size
  }, null, 2));
  process.exit(0);
}

if (existingPaths.size === 0) {
  console.error('FAIL: no existing or missing local media paths are available for a relink smoke case.');
  process.exit(1);
}

for (const clip of relinkRequiredClips) {
  if (!existingPaths.has(clip.localMediaPath)) continue;
  clip.localMediaPath = path.join(fakeMissingDir, path.basename(clip.localMediaPath));
  clip.mediaExists = false;
  changed += 1;
}

session.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
console.log(JSON.stringify({ backupPath, changedClipsMadeMissing: changed, uniquePathsMadeMissing: existingPaths.size }, null, 2));
NODEPREP

defaults write "$BUNDLE_ID" quipslyMac.selectedSection episodeEditor
defaults write "$BUNDLE_ID" quipslyMac.editorProjectSlug "$PROJECT_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.editorEpisodeSlug "$EPISODE_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.smokeRelinkMissingMediaRequestId "$REQUEST_ID"
defaults write "$BUNDLE_ID" quipslyMac.smokeRelinkMissingMediaResultPath "$RESULT_FILE"
rm -f "$RESULT_FILE"

QUIPSLY_MAC_SMOKE_RELINK_REQUEST_ID="$REQUEST_ID" \
QUIPSLY_MAC_SMOKE_RELINK_RESULT_PATH="$RESULT_FILE" \
QUIPSLY_MAC_SMOKE_PROJECT_SLUG="$PROJECT_SLUG" \
QUIPSLY_MAC_SMOKE_EPISODE_SLUG="$EPISODE_SLUG" \
  ./script/build_and_run.sh --verify

node - "$RESULT_FILE" "$REQUEST_ID" "$SESSION_FILE" <<'NODEVERIFY'
const fs = require('fs');
const [resultFile, requestId, sessionFile] = process.argv.slice(2);
const deadline = Date.now() + 75_000;
const sessionSettleTimeoutMs = Number(process.env.QUIPSLY_RELINK_SESSION_SETTLE_TIMEOUT_MS || '45000');

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

function missingUniquePaths() {
  const session = readJson(sessionFile);
  if (!session) return -1;
  const missing = new Set(
    (session.editDecisions || [])
      .filter((clip) => clip.generatedFrom !== 'quipsly-mac-premiere-deactivated-source-range')
      .map((clip) => clip.localMediaPath)
      .filter((value) => typeof value === 'string' && value.length > 0)
      .filter((value) => !fs.existsSync(value))
  );
  return missing.size;
}

function waitForSessionRelinked(callback) {
  const waitDeadline = Date.now() + sessionSettleTimeoutMs;
  function check() {
    const remainingMissing = missingUniquePaths();
    if (remainingMissing === 0) return callback(0);
    if (Date.now() > waitDeadline) return callback(remainingMissing);
    setTimeout(check, 250);
  }
  check();
}

function poll() {
  const result = readJson(resultFile);
  if (result?.requestId === requestId) {
    console.log(JSON.stringify(result, null, 2));

    if (result.ok !== true) fail(result.message || 'Relink smoke returned non-ok result.');
    if (result.beforeMissingUniquePaths <= 0) fail('Relink smoke did not start from a missing-media condition.');
    if (result.changedClips <= 0) fail('Relink smoke did not change any clips.');
    if (result.afterMissingUniquePaths !== 0) fail('Relink smoke left missing media paths.');

    waitForSessionRelinked((remainingMissing) => {
      if (remainingMissing !== 0) fail(`Session still has ${remainingMissing} unique required missing media path(s).`);
      process.exit(0);
    });
    return;
  }

  if (Date.now() > deadline) {
    console.log(JSON.stringify(result, null, 2));
    fail('Timed out waiting for relink missing media smoke result.');
  }

  setTimeout(poll, 500);
}

poll();
NODEVERIFY

echo "PASS: Relink missing media smoke completed."
