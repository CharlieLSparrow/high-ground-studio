#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
shift || true
if [ "$#" -gt 0 ]; then
  EPISODES=("$@")
else
  EPISODES=(episode-1 episode-2 episode-3)
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Quipsly Mac render program plan smoke =="
echo "Project: $PROJECT_SLUG"

for episode in "${EPISODES[@]}"; do
  echo "-- $episode --"
  RESULT_FILE="${TMPDIR:-/tmp}/quipsly-render-plan-${PROJECT_SLUG}-${episode}-$$.json"
  set +e
  ./script/render_manifest_program_plan.mjs "$PROJECT_SLUG" "$episode" >"$RESULT_FILE"
  STATUS=$?
  set -e
  cat "$RESULT_FILE"
  node - "$RESULT_FILE" "$STATUS" <<'NODE'
const fs = require('fs');
const [resultFile, statusRaw] = process.argv.slice(2);
const status = Number(statusRaw);
const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
if (typeof result.ok !== 'boolean') fail('Plan result ok flag missing');
if (!result.outputPath || !fs.existsSync(result.outputPath)) fail('Program plan output path missing');
const plan = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
if (plan.schema !== 'quipsly-mac-program-render-plan-v1') fail('Program plan schema mismatch');
if (!Array.isArray(plan.videoSegments) || plan.videoSegments.length <= 0) fail('Program plan has no video segments');
if (!Array.isArray(plan.audioSegments)) fail('Program plan audio segments missing');
if (result.ok && status !== 0) fail('Ready plan returned non-zero exit');
if (!result.ok && status === 0) fail('Blocked plan returned zero exit');
if (result.videoSegmentCount !== plan.videoSegments.length) fail('Video segment count mismatch');
if (result.audioSegmentCount !== plan.audioSegments.length) fail('Audio segment count mismatch');
NODE
  rm -f "$RESULT_FILE"
done

echo

echo "PASS: Render program plan smoke completed."
