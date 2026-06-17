#!/usr/bin/env bash
set -euo pipefail

APPLY=0
if [ "${1:-}" = "--apply" ]; then
  APPLY=1
  shift
fi

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
MAX_COPY_MB="${QUIPSLY_PLAYBACK_CACHE_MAX_COPY_MB:-750}"
APP_SUPPORT="$HOME/Library/Application Support/QuipslyMac"

echo "== Quipsly Mac playback cache linker =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"
echo "Mode:    $([ "$APPLY" -eq 1 ] && echo apply || echo dry-run)"
echo "Max copy fallback: ${MAX_COPY_MB}MB"
echo "Large-file strategy: symlink"

node - "$APP_SUPPORT" "$PROJECT_SLUG" "$EPISODE_SLUG" "$APPLY" "$MAX_COPY_MB" <<'NODECACHE'
const fs = require('fs');
const path = require('path');

const [appSupport, projectSlug, episodeSlug, applyRaw, maxCopyMbRaw] = process.argv.slice(2);
const shouldApply = applyRaw === '1';
const maxCopyBytes = Number(maxCopyMbRaw || 750) * 1024 * 1024;
const sessionFile = path.join(appSupport, 'local-episode-edits', projectSlug, `${episodeSlug}.json`);
const cacheRoot = path.join(appSupport, 'playback-cache', projectSlug, episodeSlug);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function sanitize(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function isVideoLike(clip) {
  return String(clip.trackId || '').toUpperCase().startsWith('V') ||
    String(clip.kind || '').toLowerCase() === 'video' ||
    String(clip.mediaKind || '').toLowerCase() === 'video';
}

if (!fs.existsSync(sessionFile)) fail(`Missing local session: ${sessionFile}`);
const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
const groups = new Map();

for (const clip of session.clips || []) {
  if (!clip.isActive || !isVideoLike(clip)) continue;
  if (!clip.localMediaPath || !fs.existsSync(clip.localMediaPath)) continue;
  if (clip.playbackMediaPath && fs.existsSync(clip.playbackMediaPath)) continue;

  const key = `${clip.sourceAssetId}|${clip.localMediaPath}`;
  if (!groups.has(key)) {
    const ext = path.extname(clip.localMediaPath) || '.mp4';
    const cachePath = path.join(cacheRoot, `${sanitize(clip.sourceAssetId || clip.id)}${ext}`);
    groups.set(key, {
      sourceAssetId: clip.sourceAssetId,
      sourcePath: clip.localMediaPath,
      cachePath,
      displayName: clip.mediaDisplayName || clip.name,
      decisionCount: 0,
      sizeBytes: fs.statSync(clip.localMediaPath).size,
      status: 'pending',
    });
  }

  groups.get(key).decisionCount += 1;
}

const actions = [];
let changedClips = 0;
let sessionChanged = false;

if (shouldApply) {
  fs.mkdirSync(cacheRoot, { recursive: true });
}

for (const group of groups.values()) {
  const action = { ...group };
  action.sizeMb = Math.round(group.sizeBytes / 1024 / 1024);
  delete action.sizeBytes;

  if (!shouldApply) {
    action.status = 'would-cache';
    action.method = group.sizeBytes > maxCopyBytes ? 'symlink-large-source' : 'hard-link-or-copy';
    actions.push(action);
    continue;
  }

  if (!fs.existsSync(group.cachePath)) {
    if (group.sizeBytes > maxCopyBytes) {
      fs.symlinkSync(group.sourcePath, group.cachePath);
      action.status = 'cached';
      action.method = 'symlink';
    } else {
      try {
        fs.linkSync(group.sourcePath, group.cachePath);
        action.status = 'cached';
        action.method = 'hard-link';
      } catch {
        fs.copyFileSync(group.sourcePath, group.cachePath);
        action.status = 'cached';
        action.method = 'copy';
      }
    }
  } else {
    action.status = 'already-cached';
    action.method = 'existing-file';
  }

  for (const clip of session.clips || []) {
    if (!clip.isActive || !isVideoLike(clip)) continue;
    if (clip.sourceAssetId !== group.sourceAssetId) continue;
    if (clip.localMediaPath !== group.sourcePath) continue;
    if (clip.playbackMediaPath === group.cachePath) continue;
    clip.playbackMediaPath = group.cachePath;
    changedClips += 1;
    sessionChanged = true;
  }

  actions.push(action);
}

let backupFile = null;
if (shouldApply && sessionChanged) {
  backupFile = `${sessionFile}.bak-playback-cache-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(sessionFile, backupFile);
  session.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  applied: shouldApply,
  projectSlug,
  episodeSlug,
  sessionFile,
  cacheRoot,
  backupFile,
  changedClips,
  groups: actions,
}, null, 2));
NODECACHE

echo
echo "PASS: Playback cache linker completed."
