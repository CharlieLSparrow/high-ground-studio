#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_ROOT="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
SMOKE_DIR="$SMOKE_ROOT/playback-mode-badges-${PROJECT_SLUG}-${EPISODE_SLUG}-$$"
RESULT_FILE="$SMOKE_DIR/playback-mode-results.json"

mkdir -p "$SMOKE_DIR"

cleanup() {
  defaults write "$BUNDLE_ID" quipslyMac.editorMonitorMode edit >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$ROOT_DIR"

echo "== Quipsly Mac playback mode badge smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"

if [ "${QUIPSLY_MAC_SKIP_BUILD:-0}" != "1" ]; then
  ./script/build_and_run.sh --prepare
fi
export QUIPSLY_MAC_SKIP_BUILD=1

rm -f "$RESULT_FILE"
printf '[' >"$RESULT_FILE"
FIRST=1

for mode in edit all; do
  MODE_DIR="$SMOKE_DIR/$mode"
  mkdir -p "$MODE_DIR"
  defaults write "$BUNDLE_ID" quipslyMac.editorMonitorMode "$mode"

  echo "-- playback mode: $mode --"
  QUIPSLY_MAC_SMOKE_DIR="$MODE_DIR" ./script/smoke_episode_editor.sh "$PROJECT_SLUG" "$EPISODE_SLUG"

  SNAPSHOT_FILE="$(find "$MODE_DIR" -name "episode-editor-visible-${PROJECT_SLUG}-${EPISODE_SLUG}-*.json" -print -quit)"
  if [ -z "$SNAPSHOT_FILE" ] || [ ! -f "$SNAPSHOT_FILE" ]; then
    echo "FAIL: missing playback-mode snapshot for $mode" >&2
    exit 1
  fi

  if [ "$FIRST" -eq 0 ]; then
    printf ',' >>"$RESULT_FILE"
  fi
  FIRST=0

  node - "$SNAPSHOT_FILE" <<'NODEMODE' >>"$RESULT_FILE"
const fs = require('fs');
const snapshot = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify({
  playbackMode: snapshot.playbackMode,
  schema: snapshot.timelinePlaybackModeSchema,
  explanation: snapshot.timelinePlaybackModeExplanation,
  programClipAtPlayhead: snapshot.programClipAtPlayhead,
  programClipHasPlayableMedia: snapshot.programClipHasPlayableMedia,
}));
NODEMODE
done

printf ']' >>"$RESULT_FILE"

node - "$RESULT_FILE" <<'NODEVERIFY'
const fs = require('fs');
const [resultFile] = process.argv.slice(2);
const results = JSON.parse(fs.readFileSync(resultFile, 'utf8'));

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const byMode = Object.fromEntries(results.map((entry) => [entry.playbackMode, entry]));
for (const mode of ['edit', 'all']) {
  if (!byMode[mode]) fail(`Missing playback-mode result: ${mode}`);
  if (byMode[mode].schema !== 'visible-play-edit-play-all-contract-v1') fail(`Playback schema missing for ${mode}`);
  if (typeof byMode[mode].explanation !== 'string' || byMode[mode].explanation.length < 8) fail(`Playback explanation missing for ${mode}`);
  if (!byMode[mode].programClipAtPlayhead) fail(`No program clip at playhead for ${mode}`);
}

if (!/skips/i.test(byMode.edit.explanation)) fail('Play Edit explanation does not say it skips inactive cuts.');
if (!/inactive|omitted|source/i.test(byMode.all.explanation)) fail('Play All explanation does not say it includes recovered source or omitted ranges.');

console.log(JSON.stringify({
  ok: true,
  message: 'Playback mode badge is visible and snapshot-proven for both Play Edit and Play All.',
  results
}, null, 2));
NODEVERIFY

echo "PASS: Playback mode badge smoke completed."
