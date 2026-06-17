#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_FILE="$HOME/Library/Application Support/QuipslyMac/local-episode-edits/$PROJECT_SLUG/$EPISODE_SLUG.json"
SMOKE_DIR="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
RESULT_FILE="$SMOKE_DIR/render-prep-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
LOCK_DIR="$SMOKE_DIR/episode-editor-smoke.lock"
REQUEST_ID="render-prep-smoke-$(date +%s)-$$"
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

echo "== Quipsly Mac render-prep smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"

if [ ! -f "$SESSION_FILE" ]; then
  echo "FAIL: missing local edit session: $SESSION_FILE" >&2
  exit 1
fi

defaults write "$BUNDLE_ID" quipslyMac.selectedSection episodeEditor
defaults write "$BUNDLE_ID" quipslyMac.editorProjectSlug "$PROJECT_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.editorEpisodeSlug "$EPISODE_SLUG"
rm -f "$RESULT_FILE"

QUIPSLY_MAC_SMOKE_RENDER_PREP_REQUEST_ID="$REQUEST_ID" \
QUIPSLY_MAC_SMOKE_RENDER_PREP_RESULT_PATH="$RESULT_FILE" \
QUIPSLY_MAC_SMOKE_PROJECT_SLUG="$PROJECT_SLUG" \
QUIPSLY_MAC_SMOKE_EPISODE_SLUG="$EPISODE_SLUG" \
  ./script/build_and_run.sh --verify

node - "$RESULT_FILE" "$REQUEST_ID" <<'NODEVERIFY'
const fs = require('fs');
const [resultFile, requestId] = process.argv.slice(2);
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

function poll() {
  const result = readJson(resultFile);
  if (result?.requestId === requestId) {
    console.log(JSON.stringify(result, null, 2));

    if (result.ok !== true) fail(result.message || 'Render-prep smoke returned non-ok result.');
    if (!result.manifestExists) fail('Render-prep manifest was not written.');
    if (!result.manifestPath || !fs.existsSync(result.manifestPath)) fail(`Manifest path does not exist: ${result.manifestPath}`);
    if (!Number.isFinite(result.decisionCount) || result.decisionCount <= 0) fail('Manifest has no edit decisions.');
    if (!Number.isFinite(result.activeDecisionCount) || result.activeDecisionCount <= 0) fail('Manifest has no active Play Edit decisions.');
    if (result.includedDecisionCount !== result.activeDecisionCount) fail('Play Edit included decision count does not match active decisions.');
    if (result.skippedDecisionCount !== result.inactiveDecisionCount) fail('Skipped decision count does not match inactive preserved decisions.');
    if (!Array.isArray(result.videoTrackIds) || result.videoTrackIds.length === 0) fail('Manifest has no video tracks.');
    if (!Array.isArray(result.audioTrackIds) || result.audioTrackIds.length === 0) fail('Manifest has no audio tracks.');
    if (result.outputMode !== 'play-edit') fail(`Unexpected output mode: ${result.outputMode}`);
    if (result.inactivePolicy !== 'preserve-in-manifest-skip-in-output') fail(`Unexpected inactive policy: ${result.inactivePolicy}`);

    const manifest = readJson(result.manifestPath);
    if (!manifest) fail('Could not parse render-prep manifest JSON.');
    if (manifest.schemaVersion !== 1) fail(`Unexpected manifest schemaVersion: ${manifest.schemaVersion}`);
    if (manifest.projectSlug !== result.projectSlug) fail('Manifest projectSlug does not match smoke result.');
    if (manifest.episodeSlug !== result.episodeSlug) fail('Manifest episodeSlug does not match smoke result.');
    if (manifest.outputPlan?.mode !== 'play-edit') fail('Manifest output plan is not Play Edit.');
    if (!Array.isArray(manifest.decisions) || manifest.decisions.length !== result.decisionCount) fail('Manifest decision array does not match decisionCount.');
    if (!manifest.decisions.some((decision) => decision.renderDisposition === 'play-edit-included')) fail('Manifest has no included Play Edit decisions.');
    if (result.inactiveDecisionCount > 0 && !manifest.decisions.some((decision) => decision.renderDisposition === 'preserved-skipped')) {
      fail('Manifest reports inactive decisions but no preserved-skipped decision entries.');
    }

    process.exit(0);
  }

  if (Date.now() > deadline) {
    console.log(JSON.stringify(result, null, 2));
    fail('Timed out waiting for render-prep smoke result.');
  }

  setTimeout(poll, 500);
}

poll();
NODEVERIFY

echo "PASS: Render-prep manifest smoke completed."
