#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_SMOKE_DIR="${QUIPSLY_MAC_SMOKE_DIR:-}"

if [ -n "$PARENT_SMOKE_DIR" ]; then
  REPORT_DIR="$PARENT_SMOKE_DIR/surgery-actions-$EPISODE_SLUG"
else
  SMOKE_ROOT="${QUIPSLY_MAC_SMOKE_REPORT_ROOT:-$HOME/Library/Application Support/QuipslyMac/smoke/surgery-actions}"
  REPORT_ID="$(date +%Y%m%d-%H%M%S)"
  REPORT_DIR="$SMOKE_ROOT/$REPORT_ID"
fi

mkdir -p "$REPORT_DIR"
cd "$ROOT_DIR"

echo "== Quipsly Mac surgery action row smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"
echo "Report: $REPORT_DIR"

if [ "${QUIPSLY_MAC_SKIP_BUILD:-0}" != "1" ]; then
  echo
  echo "-- preparing Quipsly Mac bundle once --"
  ./script/build_and_run.sh --prepare
fi

export QUIPSLY_MAC_SKIP_BUILD=1
export QUIPSLY_MAC_SMOKE_DIR="$REPORT_DIR"

echo
echo "-- visible surgery action row --"
./script/smoke_episode_editor.sh "$PROJECT_SLUG" "$EPISODE_SLUG"

echo
echo "-- cut/keep operation contract --"
./script/smoke_edit_operations.sh "$PROJECT_SLUG" "$EPISODE_SLUG"

echo
echo "-- source in/out precision operation contract --"
./script/smoke_timeline_handle_trim.sh "$PROJECT_SLUG" "$EPISODE_SLUG"

echo
echo "-- split operation contract --"
./script/smoke_split_clip.sh "$PROJECT_SLUG" "$EPISODE_SLUG"

node - "$REPORT_DIR" <<'NODE'
const fs = require("fs");
const reportDir = process.argv[2];
const snapshotNames = fs.readdirSync(reportDir).filter((name) =>
  name.startsWith("episode-editor-visible-") && name.endsWith(".json")
);

if (snapshotNames.length === 0) {
  console.error("FAIL: visible editor snapshot missing from surgery action smoke.");
  process.exit(1);
}

const latestSnapshot = snapshotNames
  .map((name) => ({
    name,
    stat: fs.statSync(`${reportDir}/${name}`),
  }))
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0].name;

const snapshot = JSON.parse(fs.readFileSync(`${reportDir}/${latestSnapshot}`, "utf8"));
if (snapshot.timelineClipSurgeryActionSchema !== "selected-clip-surgery-actions-v1") {
  console.error(
    `FAIL: unexpected surgery action schema ${snapshot.timelineClipSurgeryActionSchema || "missing"}`
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      reportDir,
      snapshot: latestSnapshot,
      schema: snapshot.timelineClipSurgeryActionSchema,
      message:
        "Surgery action row was visible, and cut/keep, source boundary trim, and split operation contracts completed.",
    },
    null,
    2
  )
);
NODE

echo
echo "PASS: Surgery action row smoke completed."
