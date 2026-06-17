#!/usr/bin/env bash
set -euo pipefail

APPLY=0
if [ "${1:-}" = "--apply" ]; then
  APPLY=1
  shift
fi

REPORT_FILE="${1:-$HOME/Library/Application Support/QuipslyMac/missing-source/latest/missing-source-report.json}"
APP_SUPPORT="$HOME/Library/Application Support/QuipslyMac"

echo "== Quipsly Mac apply missing source matches =="
echo "Report: $REPORT_FILE"
echo "Mode:   $([ "$APPLY" -eq 1 ] && echo apply || echo dry-run)"

node - "$REPORT_FILE" "$APP_SUPPORT" "$APPLY" <<'NODEAPPLY'
const fs = require('fs');
const path = require('path');

const [reportFile, appSupport, applyRaw] = process.argv.slice(2);
const shouldApply = applyRaw === '1';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(reportFile)) fail(`Missing source report not found: ${reportFile}`);

const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const changes = [];

function sourceGapLabel(clip) {
  return `${clip.trackId} ${clip.mediaDisplayName || clip.name}`;
}

for (const row of report.rows || []) {
  if (!row.episodeSlug || !Array.isArray(row.groups)) continue;
  const sessionFile = path.join(appSupport, 'local-episode-edits', report.projectSlug, `${row.episodeSlug}.json`);
  if (!fs.existsSync(sessionFile)) {
    changes.push({
      episodeSlug: row.episodeSlug,
      status: 'missing-session',
      sessionFile,
    });
    continue;
  }

  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  let changed = 0;
  const groupResults = [];

  for (const group of row.groups) {
    const directMatches = Array.isArray(group.candidateMatches) ? group.candidateMatches : [];
    const continuityMatches = Array.isArray(group.continuityMatches)
      ? group.continuityMatches.map((match) => match && match.candidate).filter(Boolean)
      : [];
    const matchType = directMatches.length === 1 ? 'filename' : continuityMatches.length === 1 ? 'continuity' : null;
    const matches = directMatches.length === 1 ? directMatches : continuityMatches.length === 1 ? continuityMatches : [];

    if (matches.length !== 1) {
      continue;
    }

    const candidate = matches[0];
    if (!fs.existsSync(candidate)) {
      groupResults.push({
        label: group.label,
        status: 'candidate-missing',
        matchType,
        candidate,
      });
      continue;
    }

    let groupChanged = 0;
    for (const clip of session.clips || []) {
      const label = sourceGapLabel(clip);
      if (label !== group.label) continue;
      if (!clip.isActive) continue;

      const currentPath = String(clip.localMediaPath || '').trim();
      if (currentPath && fs.existsSync(currentPath)) continue;

      clip.localMediaPath = candidate;
      clip.mediaExists = true;
      if (!clip.mediaDisplayName) clip.mediaDisplayName = path.basename(candidate);
      if (!clip.mediaKind && /\.(mp4|mov|m4v|insv)$/i.test(candidate)) clip.mediaKind = 'video';
      if (!clip.mediaKind && /\.(wav|mp3|m4a|aac|aiff|aif)$/i.test(candidate)) clip.mediaKind = 'audio';
      groupChanged += 1;
    }

    if (groupChanged > 0) {
      changed += groupChanged;
      groupResults.push({
        label: group.label,
        status: shouldApply ? 'linked' : 'would-link',
        matchType,
        candidate,
        changedClips: groupChanged,
      });
    }
  }

  if (changed > 0 && shouldApply) {
    const backupFile = `${sessionFile}.bak-missing-source-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(sessionFile, backupFile);
    session.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
    changes.push({
      episodeSlug: row.episodeSlug,
      status: 'applied',
      changedClips: changed,
      backupFile,
      groups: groupResults,
    });
  } else if (changed > 0) {
    changes.push({
      episodeSlug: row.episodeSlug,
      status: 'dry-run',
      changedClips: changed,
      groups: groupResults,
    });
  } else {
    changes.push({
      episodeSlug: row.episodeSlug,
      status: 'no-exact-single-match',
      changedClips: 0,
      groups: groupResults,
    });
  }
}

console.log(JSON.stringify({
  ok: true,
  applied: shouldApply,
  projectSlug: report.projectSlug,
  reportFile,
  changes,
}, null, 2));
NODEAPPLY

echo
echo "PASS: Missing source match apply completed."
