#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_ROOT="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
SMOKE_DIR="$SMOKE_ROOT/timeline-density-${PROJECT_SLUG}-${EPISODE_SLUG}-$$"
RESULT_FILE="$SMOKE_DIR/density-results.json"

mkdir -p "$SMOKE_DIR"

cleanup() {
  defaults write "$BUNDLE_ID" quipslyMac.editorTimelineDensity normal >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$ROOT_DIR"

echo "== Quipsly Mac timeline density smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"

./script/build_and_run.sh --prepare
export QUIPSLY_MAC_SKIP_BUILD=1

rm -f "$RESULT_FILE"
printf '[' >"$RESULT_FILE"
FIRST=1

for density in overview normal surgery; do
  MODE_DIR="$SMOKE_DIR/$density"
  mkdir -p "$MODE_DIR"
  defaults write "$BUNDLE_ID" quipslyMac.editorTimelineDensity "$density"

  echo "-- density: $density --"
  QUIPSLY_MAC_SMOKE_DIR="$MODE_DIR" ./script/smoke_episode_editor.sh "$PROJECT_SLUG" "$EPISODE_SLUG"

  SNAPSHOT_FILE="$(find "$MODE_DIR" -name "episode-editor-visible-${PROJECT_SLUG}-${EPISODE_SLUG}-*.json" -print -quit)"
  if [ -z "$SNAPSHOT_FILE" ] || [ ! -f "$SNAPSHOT_FILE" ]; then
    echo "FAIL: missing density snapshot for $density" >&2
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
  density: snapshot.timelineDensity,
  rowHeight: snapshot.timelineDensityRowHeight,
  rulerHeight: snapshot.timelineDensityRulerHeight,
  pixelsPerSecond: snapshot.timelineDensityPixelsPerSecond,
  schema: snapshot.timelineDensityControlsSchema,
  selectedClipTrackId: snapshot.selectedClipTrackId,
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

const byDensity = Object.fromEntries(results.map((entry) => [entry.density, entry]));
for (const density of ['overview', 'normal', 'surgery']) {
  if (!byDensity[density]) fail(`Missing density result: ${density}`);
  if (byDensity[density].schema !== 'overview-normal-surgery-density-v1') fail(`Density schema missing for ${density}`);
  if (typeof byDensity[density].rowHeight !== 'number' || byDensity[density].rowHeight <= 0) fail(`Invalid row height for ${density}`);
  if (typeof byDensity[density].rulerHeight !== 'number' || byDensity[density].rulerHeight <= 0) fail(`Invalid ruler height for ${density}`);
  if (typeof byDensity[density].pixelsPerSecond !== 'number' || byDensity[density].pixelsPerSecond <= 0) fail(`Invalid pixelsPerSecond for ${density}`);
}

if (!(byDensity.overview.rowHeight < byDensity.normal.rowHeight && byDensity.normal.rowHeight < byDensity.surgery.rowHeight)) {
  fail('Density row heights are not ordered overview < normal < surgery.');
}

if (!(byDensity.overview.pixelsPerSecond < byDensity.normal.pixelsPerSecond && byDensity.normal.pixelsPerSecond < byDensity.surgery.pixelsPerSecond)) {
  fail('Density pixels-per-second scale is not ordered overview < normal < surgery.');
}

console.log(JSON.stringify({
  ok: true,
  message: 'Timeline density modes produce distinct row and scale geometry.',
  results
}, null, 2));
NODEVERIFY

echo "PASS: Timeline density smoke completed."
