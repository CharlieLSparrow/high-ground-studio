#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
START_SECONDS="${3:-53.56}"
DURATION_SECONDS="${4:-3}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Quipsly Mac render proof smoke =="
echo "Project:  $PROJECT_SLUG"
echo "Episode:  $EPISODE_SLUG"
echo "Window:   ${START_SECONDS}s + ${DURATION_SECONDS}s"

./script/render_manifest_program_plan.mjs "$PROJECT_SLUG" "$EPISODE_SLUG" >/dev/null
RESULT_FILE="${TMPDIR:-/tmp}/quipsly-render-proof-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
./script/render_program_proof.mjs "$PROJECT_SLUG" "$EPISODE_SLUG" \
  --start "$START_SECONDS" \
  --duration "$DURATION_SECONDS" \
  --width 426 \
  --height 240 \
  --fps 12 >"$RESULT_FILE"
cat "$RESULT_FILE"

node - "$RESULT_FILE" <<'NODE'
const fs = require('fs');
const { spawnSync } = require('child_process');
const [resultFile] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
if (result.ok !== true) fail('Proof render result was not ok');
if (!result.outputPath || !fs.existsSync(result.outputPath)) fail('Proof output is missing');
if (result.outputBytes <= 0) fail('Proof output is empty');
const ffprobe = result.ffprobe || 'ffprobe';
const probe = spawnSync(ffprobe, [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1',
  result.outputPath,
], { encoding: 'utf8', timeout: 8000 });
if (probe.status !== 0) fail(`ffprobe could not read proof output: ${probe.stderr || probe.stdout}`);
const duration = Number(probe.stdout.trim());
if (!Number.isFinite(duration) || duration < 1) fail(`Proof output duration is invalid: ${probe.stdout.trim()}`);
console.log(JSON.stringify({ ok: true, outputPath: result.outputPath, outputBytes: result.outputBytes, duration }, null, 2));
NODE
rm -f "$RESULT_FILE"

echo

echo "PASS: Render proof smoke completed."
