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

APP_SUPPORT="$HOME/Library/Application Support/QuipslyMac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_ROOT="$APP_SUPPORT/missing-source"
REPORT_DIR="$REPORT_ROOT/$(date +%Y%m%d-%H%M%S)"
REPORT_FILE="$REPORT_DIR/missing-source-report.json"

mkdir -p "$REPORT_DIR"
ln -sfn "$REPORT_DIR" "$REPORT_ROOT/latest"
cd "$ROOT_DIR"

echo "== Quipsly Mac missing source report =="
echo "Project: $PROJECT_SLUG"
echo "Report:  $REPORT_DIR"

if [ "$REFRESH" -eq 1 ]; then
  echo
  echo "-- refreshing render-prep manifests before source report --"
  ./script/build_and_run.sh --prepare
  export QUIPSLY_MAC_SKIP_BUILD=1
  export QUIPSLY_MAC_SMOKE_DIR="$REPORT_DIR"
  for episode in "${EPISODES[@]}"; do
    ./script/smoke_render_prep_manifest.sh "$PROJECT_SLUG" "$episode"
  done
fi

node - "$PROJECT_SLUG" "$REPORT_FILE" "${EPISODES[@]}" <<'NODEREPORT'
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const [projectSlug, reportFile, ...episodes] = process.argv.slice(2);
const appSupport = path.join(os.homedir(), 'Library/Application Support/QuipslyMac');
const shouldSearch = process.env.QUIPSLY_MISSING_SOURCE_SEARCH === '1';
const searchRoots = (process.env.QUIPSLY_MISSING_SOURCE_ROOTS || [
  path.join(os.homedir(), 'Desktop/Podcast'),
  path.join(os.homedir(), 'Library/CloudStorage'),
  path.join(os.homedir(), 'Movies'),
  path.join(os.homedir(), 'Downloads'),
].join(':')).split(':').filter(Boolean);

function manifestPath(episodeSlug) {
  return path.join(appSupport, 'render-prep', projectSlug, episodeSlug, 'manifest.json');
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function plausibleFileName(name) {
  const clean = String(name || '').trim();
  if (!/\.(mp4|mov|m4v|wav|mp3|m4a|aac|aiff|aif|insv)$/i.test(clean)) return null;
  if (/^video clip \d+$/i.test(clean)) return null;
  return clean;
}

function sourceGapLabel(clip) {
  return `${clip.trackId} ${clip.mediaDisplayName || clip.name}`;
}

function sourceGapName(clip) {
  return clip.mediaDisplayName || clip.name;
}

function spotlightSearch(fileName) {
  if (!shouldSearch || !fileName) return [];
  const matches = [];

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    const result = spawnSync('/usr/bin/mdfind', ['-onlyin', root, '-name', fileName], {
      encoding: 'utf8',
      timeout: 4000,
      maxBuffer: 1024 * 1024,
    });

    if (result.status === 0 && result.stdout.trim()) {
      for (const line of result.stdout.trim().split(/\n+/)) {
        if (!line) continue;
        if (path.basename(line).toLowerCase() !== fileName.toLowerCase()) continue;
        if (line.includes('/Adobe/Common/Peak Files/')) continue;
        if (line.includes('/Adobe/Common/Media Cache Files/')) continue;
        if (/\.(pek|cfa)$/i.test(line)) continue;
        if (!matches.includes(line)) matches.push(line);
      }
    }
  }

  return matches.slice(0, 12);
}

function nearlyEqual(left, right, tolerance = 0.08) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance;
}

function clipEditStart(clip) {
  return Number(clip.editStart ?? clip.startIn ?? 0);
}

function clipEditEnd(clip) {
  return Number(clip.editEnd ?? (clipEditStart(clip) + Number(clip.duration || 0)));
}

function continuityMatchesForGroup(group, clips) {
  const matches = new Map();
  const missingClips = group.clips || [];

  for (const missing of missingClips) {
    for (const candidate of clips) {
      if (candidate === missing) continue;
      if (candidate.trackId !== missing.trackId) continue;
      if (!candidate.localMediaPath || candidate.localMediaExists !== true) continue;

      const candidatePath = candidate.localMediaPath;
      const candidateName = candidate.mediaDisplayName || candidate.name;
      const afterSource = nearlyEqual(candidate.sourceStart, missing.sourceEnd);
      const afterTimeline = nearlyEqual(clipEditStart(candidate), clipEditEnd(missing));
      const beforeSource = nearlyEqual(candidate.sourceEnd, missing.sourceStart);
      const beforeTimeline = nearlyEqual(clipEditEnd(candidate), clipEditStart(missing));

      if (!((afterSource && afterTimeline) || (beforeSource && beforeTimeline))) continue;

      const key = candidatePath;
      if (!matches.has(key)) {
        matches.set(key, {
          candidate: candidatePath,
          candidateName,
          reason: afterSource
            ? 'same-track source/timeline continuation after missing clip'
            : 'same-track source/timeline continuation before missing clip',
          evidence: [],
        });
      }

      matches.get(key).evidence.push({
        missingName: missing.name,
        missingTrackId: missing.trackId,
        missingEditStart: clipEditStart(missing),
        missingEditEnd: clipEditEnd(missing),
        missingSourceStart: missing.sourceStart,
        missingSourceEnd: missing.sourceEnd,
        neighborName: candidate.name,
        neighborEditStart: clipEditStart(candidate),
        neighborEditEnd: clipEditEnd(candidate),
        neighborSourceStart: candidate.sourceStart,
        neighborSourceEnd: candidate.sourceEnd,
      });
    }
  }

  return [...matches.values()].slice(0, 8);
}

const rows = [];

for (const episodeSlug of episodes) {
  const file = manifestPath(episodeSlug);
  const manifest = readJson(file);
  if (!manifest) {
    rows.push({
      episodeSlug,
      status: 'missing-manifest',
      manifestPath: file,
      groups: [],
    });
    continue;
  }

  const missingClips = manifest.clips.filter((clip) =>
    clip.isActive && (!clip.localMediaPath || clip.localMediaExists !== true)
  );
  const byGroup = new Map();

  for (const clip of missingClips) {
    const key = sourceGapLabel(clip);
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        label: key,
        trackId: clip.trackId,
        name: sourceGapName(clip),
        originalName: clip.name,
        mediaDisplayName: clip.mediaDisplayName || null,
        sourceAssetIds: new Set(),
        decisionCount: 0,
        sourceStarts: [],
        sourceEnds: [],
        knownPaths: new Set(),
        clips: [],
      });
    }

    const group = byGroup.get(key);
    group.clips.push(clip);
    group.decisionCount += 1;
    group.sourceAssetIds.add(clip.sourceAssetId);
    if (group.sourceStarts.length < 6) group.sourceStarts.push(clip.sourceStart);
    if (group.sourceEnds.length < 6) group.sourceEnds.push(clip.sourceEnd);
    if (clip.localMediaPath) group.knownPaths.add(clip.localMediaPath);
  }

  const groups = [...byGroup.values()].map((group) => {
    const candidateFileName = plausibleFileName(group.name);
    const continuityMatches = continuityMatchesForGroup(group, manifest.clips);
    return {
      label: group.label,
      trackId: group.trackId,
      name: group.name,
      originalName: group.originalName,
      mediaDisplayName: group.mediaDisplayName,
      candidateFileName,
      decisionCount: group.decisionCount,
      sourceAssetIds: [...group.sourceAssetIds].sort(),
      sourceStarts: group.sourceStarts,
      sourceEnds: group.sourceEnds,
      knownPaths: [...group.knownPaths].sort(),
      candidateMatches: spotlightSearch(candidateFileName),
      continuityMatches,
      nextAction: candidateFileName
        ? 'Locate this file or rerun with QUIPSLY_MISSING_SOURCE_SEARCH=1 to use Spotlight.'
        : continuityMatches.length === 1
          ? 'Review the continuity candidate. It is based on same-track source/timeline continuation, not filename metadata.'
        : 'Premiere rescue did not preserve a filename here. Relink manually or improve the importer metadata from the .prproj packet.',
    };
  });

  rows.push({
    episodeSlug,
    status: groups.length === 0 ? 'source-clean' : 'needs-source',
    manifestPath: file,
    missingDecisionCount: missingClips.length,
    missingGroupCount: groups.length,
    groups,
  });
}

const report = {
  projectSlug,
  generatedAt: new Date().toISOString(),
  searched: shouldSearch,
  searchRoots: shouldSearch ? searchRoots : [],
  rows,
};

fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

console.log('');
for (const row of rows) {
  if (row.status === 'missing-manifest') {
    console.log(`${row.episodeSlug}: missing render-prep manifest`);
    continue;
  }

  console.log(`${row.episodeSlug}: ${row.missingDecisionCount || 0} missing active decision(s), ${row.missingGroupCount || 0} source group(s)`);
  for (const group of row.groups) {
    const found = group.candidateMatches.length > 0 ? ` found=${group.candidateMatches.length}` : '';
    const continuity = group.continuityMatches.length > 0 ? ` continuity=${group.continuityMatches.length}` : '';
    console.log(`  - ${group.label}: ${group.decisionCount} decision(s), candidate=${group.candidateFileName || 'none'}${found}${continuity}`);
  }
}

console.log('');
console.log(`Wrote report: ${reportFile}`);
if (!shouldSearch) {
  console.log('Optional Spotlight search: QUIPSLY_MISSING_SOURCE_SEARCH=1 script/missing_source_report.sh ...');
}
if (!process.argv.includes('--refresh')) {
  console.log('Freshness tip: script/missing_source_report.sh --refresh ... rebuilds render-prep manifests first.');
}
NODEREPORT

echo
echo "PASS: Missing source report completed."
