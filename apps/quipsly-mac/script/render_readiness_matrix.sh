#!/usr/bin/env bash
set -euo pipefail

REFRESH=0
if [ "${1:-}" = "--refresh" ]; then
  REFRESH=1
  shift
fi

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
if [ "$#" -gt 0 ]; then
  shift
fi

if [ "$#" -gt 0 ]; then
  EPISODES=("$@")
else
  EPISODES=(episode-1 episode-2 episode-3)
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/QuipslyMac"
REPORT_ROOT="$APP_SUPPORT/render-readiness"
REPORT_DIR="$REPORT_ROOT/$(date +%Y%m%d-%H%M%S)"
MATRIX_FILE="$REPORT_DIR/render-readiness-matrix.json"

cd "$ROOT_DIR"
mkdir -p "$REPORT_DIR"
ln -sfn "$REPORT_DIR" "$REPORT_ROOT/latest"

echo "== Quipsly Mac render readiness matrix =="
echo "Project: $PROJECT_SLUG"
echo "Report:  $REPORT_DIR"

if [ "$REFRESH" -eq 1 ]; then
  echo
  echo "-- refreshing render-prep manifests through the real app path --"
  ./script/build_and_run.sh --prepare
  export QUIPSLY_MAC_SKIP_BUILD=1
  export QUIPSLY_MAC_SMOKE_DIR="$REPORT_DIR"
  for episode in "${EPISODES[@]}"; do
    ./script/smoke_render_prep_manifest.sh "$PROJECT_SLUG" "$episode"
  done
fi

node - "$PROJECT_SLUG" "$MATRIX_FILE" "${EPISODES[@]}" <<'NODEMATRIX'
const fs = require('fs');
const os = require('os');
const path = require('path');

const [projectSlug, matrixFile, ...episodes] = process.argv.slice(2);
const appSupport = path.join(os.homedir(), 'Library/Application Support/QuipslyMac');

function manifestPath(episodeSlug) {
  return path.join(appSupport, 'render-prep', projectSlug, episodeSlug, 'manifest.json');
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isMissingSource(clip) {
  return clip.isActive && (!clip.localMediaPath || clip.localMediaExists !== true);
}

function needsProxy(clip) {
  const isVideoLike = clip.isVideoLike === true ||
    String(clip.trackId || '').toUpperCase().startsWith('V') ||
    String(clip.kind || '').toLowerCase() === 'video' ||
    String(clip.mediaKind || '').toLowerCase() === 'video';
  return clip.isActive &&
    isVideoLike &&
    clip.localMediaExists === true &&
    clip.playbackMediaExists !== true;
}

function sourceGapLabel(clip) {
  return `${clip.trackId} ${clip.mediaDisplayName || clip.name}`;
}

const rows = episodes.map((episodeSlug) => {
  const file = manifestPath(episodeSlug);
  const manifest = readJson(file);
  if (!manifest) {
    return {
      episodeSlug,
      ok: false,
      readiness: 'missing-manifest',
      manifestPath: file,
      message: `Missing render-prep manifest. Run script/render_readiness_matrix.sh --refresh ${projectSlug} ${episodeSlug}.`,
    };
  }

  const missingSourceClips = manifest.clips.filter(isMissingSource);
  const missingSourceGroups = [...new Set(missingSourceClips.map(sourceGapLabel))].sort();
  const proxyClips = manifest.clips.filter(needsProxy);
  const proxyGroups = [...new Set(proxyClips.map(sourceGapLabel))].sort();

  return {
    episodeSlug,
    ok: true,
    readiness: manifest.readiness,
    manifestPath: file,
    clipCount: manifest.clipCount,
    activeClipCount: manifest.activeClipCount,
    inactiveClipCount: manifest.inactiveClipCount,
    activeMissingSourceDecisionCount: missingSourceClips.length,
    activeMissingSourceGroupCount: missingSourceGroups.length,
    activeMissingSourceGroups: missingSourceGroups,
    activeVideoNeedsProxyDecisionCount: proxyClips.length,
    activeVideoNeedsProxyGroupCount: proxyGroups.length,
    activeVideoNeedsProxyGroups: proxyGroups.slice(0, 20),
    blockers: manifest.blockers || [],
    warnings: manifest.warnings || [],
  };
});

const summary = {
  projectSlug,
  generatedAt: new Date().toISOString(),
  rows,
  totals: {
    activeMissingSourceDecisions: rows.reduce((sum, row) => sum + (row.activeMissingSourceDecisionCount || 0), 0),
    activeMissingSourceGroups: rows.reduce((sum, row) => sum + (row.activeMissingSourceGroupCount || 0), 0),
    activeVideoNeedsProxyDecisions: rows.reduce((sum, row) => sum + (row.activeVideoNeedsProxyDecisionCount || 0), 0),
    preservedInactiveDecisions: rows.reduce((sum, row) => sum + (row.inactiveClipCount || 0), 0),
  },
};

fs.writeFileSync(matrixFile, JSON.stringify(summary, null, 2));

console.log('');
console.log('Episode   Readiness            Missing source     Needs proxy/cache   Preserved cuts');
console.log('--------  -------------------  -----------------  ------------------  --------------');
for (const row of rows) {
  const episode = row.episodeSlug.padEnd(8);
  const readiness = String(row.readiness || 'unknown').padEnd(19);
  const missing = String(row.activeMissingSourceDecisionCount ?? 'n/a').padStart(5) + ` / ${String(row.activeMissingSourceGroupCount ?? 'n/a').padEnd(5)}`;
  const proxy = String(row.activeVideoNeedsProxyDecisionCount ?? 'n/a').padStart(5) + ` / ${String(row.activeVideoNeedsProxyGroupCount ?? 'n/a').padEnd(5)}`;
  const inactive = String(row.inactiveClipCount ?? 'n/a').padStart(6);
  console.log(`${episode}  ${readiness}  ${missing}            ${proxy}             ${inactive}`);
}

console.log('');
console.log(`Wrote matrix: ${matrixFile}`);

const missingRows = rows.filter((row) => (row.activeMissingSourceDecisionCount || 0) > 0);
if (missingRows.length > 0) {
  console.log('');
  console.log('Missing source groups to resolve before final render:');
  for (const row of missingRows) {
    console.log(`- ${row.episodeSlug}: ${row.activeMissingSourceGroups.slice(0, 8).join(', ')}${row.activeMissingSourceGroups.length > 8 ? ', ...' : ''}`);
  }
}
NODEMATRIX

echo
echo "PASS: Render readiness matrix completed."
