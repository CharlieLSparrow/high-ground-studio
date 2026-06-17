#!/usr/bin/env bash
set -euo pipefail

BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_ROOT="${QUIPSLY_MAC_SMOKE_REPORT_ROOT:-$HOME/Library/Application Support/QuipslyMac/smoke/dashboard-proof-trail}"
REPORT_ID="${QUIPSLY_MAC_SMOKE_REPORT_ID:-$(date +%Y%m%d-%H%M%S)}"
REPORT_DIR="${QUIPSLY_MAC_SMOKE_DIR:-$REPORT_ROOT/$REPORT_ID}"
RESULT_FILE="$REPORT_DIR/dashboard-proof-trail.json"
SCREENSHOT="$REPORT_DIR/dashboard-proof-trail.png"
REQUEST_ID="dashboard-proof-trail-smoke-$(date +%s)"

mkdir -p "$REPORT_DIR"
ln -sfn "$REPORT_DIR" "$REPORT_ROOT/latest"

cd "$ROOT_DIR"

echo "== Quipsly Mac Dashboard proof trail smoke =="
echo "Report: $REPORT_DIR"

defaults write "$BUNDLE_ID" quipslyMac.selectedSection dashboard
defaults write "$BUNDLE_ID" quipslyMac.smokeDashboardProofTrailRequestId "$REQUEST_ID"
defaults write "$BUNDLE_ID" quipslyMac.smokeDashboardProofTrailResultPath "$RESULT_FILE"
rm -f "$RESULT_FILE" "$SCREENSHOT"

./script/build_and_run.sh --verify

node - "$RESULT_FILE" "$REQUEST_ID" <<'NODE'
const fs = require('fs');
const [resultFile, requestId] = process.argv.slice(2);
const deadline = Date.now() + 30_000;

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

    if (result.view !== 'DashboardView') fail(`Unexpected view: ${result.view}`);
    if (result.proofTrailPanel !== 'visible') fail('Proof trail panel marker missing.');
    if (result.latestReportExists !== true) fail('Latest report folder is not visible to the app.');
    if (result.latestLogExists !== true) fail('Latest suite log is not visible to the app.');
    if (!String(result.latestReportPath || '').endsWith('/episode-local-suite/latest')) fail(`Unexpected latest report path: ${result.latestReportPath}`);
    if (result.copiedPasteboardPath !== result.latestReportPath) fail('Copy path action did not put the latest report path on the pasteboard.');
    if (result.suiteStatus !== 'Passed') fail(`Expected last suite to be Passed, got: ${result.suiteStatus}`);
    if (Number(result.episodeScreenshotCount || 0) < 3) fail(`Expected at least three episode screenshots, got: ${result.episodeScreenshotCount}`);
    if (Number(result.resultFileCount || 0) < 10) fail(`Expected multiple suite result files, got: ${result.resultFileCount}`);
    if (!String(result.lastLogLine || '').includes('PASS: Quipsly Mac local Episode Editor suite completed.')) fail(`Unexpected last log line: ${result.lastLogLine}`);
    if (!Array.isArray(result.buttonLabels) || !result.buttonLabels.includes('Copy path')) fail('Expected proof trail button labels missing.');

    process.exit(0);
  }

  if (Date.now() > deadline) {
    console.log(JSON.stringify(result, null, 2));
    fail('Timed out waiting for Dashboard proof trail smoke result.');
  }

  setTimeout(poll, 500);
}

poll();
NODE

sleep 1
screencapture -x "$SCREENSHOT"

echo "Screenshot: $SCREENSHOT"
echo "PASS: Dashboard proof trail smoke completed."
