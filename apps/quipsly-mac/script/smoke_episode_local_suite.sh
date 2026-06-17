#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
SELECTED_CLIP_SOURCE="${QUIPSLY_SELECTED_CLIP_SOURCE:-$HOME/Desktop/Podcast/2/Be a Goldfish.mp4}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_ROOT="${QUIPSLY_MAC_SMOKE_REPORT_ROOT:-$HOME/Library/Application Support/QuipslyMac/smoke/episode-local-suite}"
REPORT_ID="${QUIPSLY_MAC_SMOKE_REPORT_ID:-$(date +%Y%m%d-%H%M%S)}"
REPORT_DIR="${QUIPSLY_MAC_SMOKE_DIR:-$REPORT_ROOT/$REPORT_ID}"

cd "$ROOT_DIR"

mkdir -p "$REPORT_DIR"
ln -sfn "$REPORT_DIR" "$REPORT_ROOT/latest"
export QUIPSLY_MAC_SMOKE_DIR="$REPORT_DIR"
LOG_FILE="$REPORT_DIR/suite.log"

cat >"$REPORT_DIR/metadata.json" <<JSON
{
  "projectSlug": "$PROJECT_SLUG",
  "reportId": "$REPORT_ID",
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reportDir": "$REPORT_DIR"
}
JSON

exec > >(tee "$LOG_FILE") 2>&1

echo "== Quipsly Mac local Episode Editor suite =="
echo "Project: $PROJECT_SLUG"
echo "Report: $REPORT_DIR"

echo
echo "-- preparing Quipsly Mac bundle once --"
./script/build_and_run.sh --prepare
export QUIPSLY_MAC_SKIP_BUILD=1

for episode in episode-1 episode-2 episode-3; do
  echo
  echo "-- $episode: relink missing media --"
  ./script/smoke_relink_missing_media.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: native edit operations --"
  ./script/smoke_edit_operations.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: cut/keep visual state --"
  ./script/smoke_cut_keep_visual.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: timeline handle trims --"
  ./script/smoke_timeline_handle_trim.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: split clip operation --"
  ./script/smoke_split_clip.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: timeline move --"
  ./script/smoke_timeline_move.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: timeline undo/redo --"
  ./script/smoke_timeline_undo_redo.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: motion inspector metadata --"
  ./script/smoke_motion_inspector.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: playback modes --"
  ./script/smoke_playback_modes.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: monitor wall semantics --"
  ./script/smoke_monitor_wall.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: render-prep manifest --"
  ./script/smoke_render_prep_manifest.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: source gap manual link contract --"
  ./script/smoke_source_gap_link.sh "$PROJECT_SLUG" "$episode"

  echo
  echo "-- $episode: visible editor/monitor wall --"
  ./script/smoke_episode_editor.sh "$PROJECT_SLUG" "$episode"
done

echo
echo "-- episode-1..3: renderer-facing program plans --"
./script/smoke_render_program_plan.sh "$PROJECT_SLUG" episode-1 episode-2 episode-3

echo
echo "-- episode-2: timeline density modes --"
./script/smoke_timeline_density_modes.sh "$PROJECT_SLUG" episode-2

echo
echo "-- episode-2: playback mode badges --"
./script/smoke_playback_mode_badges.sh "$PROJECT_SLUG" episode-2

echo
echo "-- episode-2: surgery action row contract --"
./script/smoke_surgery_actions.sh "$PROJECT_SLUG" episode-2

if [ -f "$SELECTED_CLIP_SOURCE" ]; then
  echo
  echo "-- episode-2: selected clip Media Engine proxy path --"
  ./script/smoke_selected_clip_media_engine.sh "$PROJECT_SLUG" episode-2 "$SELECTED_CLIP_SOURCE"
else
  echo
  echo "WARN: selected clip source not found, skipping Media Engine selected clip smoke: $SELECTED_CLIP_SOURCE" >&2
fi

if /usr/bin/log show --last 10m --style compact --predicate 'process == "QuipslyMac"' | rg -q 'Fatal error|crashed|failed to demangle|Publishing changes from within view updates|uncaught|exception|EXC_|assertion failure|SwiftUI.*cycle|Invalid Configuration'; then
  echo "FAIL: suspicious QuipslyMac runtime log entry found" >&2
  /usr/bin/log show --last 10m --style compact --predicate 'process == "QuipslyMac"' | rg 'Fatal error|crashed|failed to demangle|Publishing changes from within view updates|uncaught|exception|EXC_|assertion failure|SwiftUI.*cycle|Invalid Configuration' >&2 || true
  exit 1
fi

echo
echo "PASS: Quipsly Mac local Episode Editor suite completed."
echo "Report: $REPORT_DIR"
