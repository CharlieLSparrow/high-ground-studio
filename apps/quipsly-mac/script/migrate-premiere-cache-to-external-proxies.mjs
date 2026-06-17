#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PROJECT = 'high-ground-odyssey-manuscript';
const DEFAULT_EPISODES = ['episode-1', 'episode-2', 'episode-3'];
const DEFAULT_WORKSPACE = '/Volumes/My Passport/Quipsly Media Workspace';
const DEFAULT_MIN_BYTES = 1024 * 1024 * 1024;

function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseList(value, fallback) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeSegment(value, fallback = 'item') {
  const safe = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return safe || fallback;
}

function sessionPath(projectSlug, episodeSlug) {
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'QuipslyMac',
    'local-episode-edits',
    projectSlug,
    `${episodeSlug}.json`,
  );
}

function sourceOriginalPath(workspace, projectSlug, episodeSlug, sourceAssetId, fileName) {
  return path.join(
    workspace,
    'source-originals',
    safeSegment(projectSlug, 'project'),
    safeSegment(episodeSlug, 'episode'),
    safeSegment(sourceAssetId, 'source'),
    safeSegment(fileName, 'media'),
  );
}

function proxyPath(workspace, projectSlug, episodeSlug, sourceAssetId, originalPath) {
  const extension = path.extname(originalPath);
  const stem = safeSegment(path.basename(originalPath, extension), 'media');
  return path.join(
    workspace,
    'media-cache',
    'proxies',
    safeSegment(projectSlug, 'project'),
    safeSegment(episodeSlug, 'episode'),
    safeSegment(sourceAssetId, 'source'),
    `${stem}.proxy.mp4`,
  );
}

async function fileSize(filePath) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

async function sourceInfo(filePath) {
  try {
    const linkStat = await lstat(filePath);
    const targetPath = linkStat.isSymbolicLink() ? await realpath(filePath).catch(() => '') : '';
    return {
      isSymlink: linkStat.isSymbolicLink(),
      targetPath,
      sizeBytes: await fileSize(filePath),
    };
  } catch {
    return {
      isSymlink: false,
      targetPath: '',
      sizeBytes: 0,
    };
  }
}

async function sameSize(left, right) {
  const [leftSize, rightSize] = await Promise.all([fileSize(left), fileSize(right)]);
  return leftSize > 0 && leftSize === rightSize;
}

async function moveAcrossVolumes(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    if (await sameSize(source, destination)) {
      await unlink(source);
      return 'deduplicated-existing-destination';
    }
    throw new Error(`Destination already exists with a different size: ${destination}`);
  }

  try {
    await rename(source, destination);
    return 'renamed';
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    if (!(await sameSize(source, destination))) {
      throw new Error(`Copied file size did not match for ${destination}`);
    }
    await unlink(source);
    return 'copied-and-removed-source';
  }
}

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';
}

function proxyOptions() {
  return {
    height: process.env.QUIPSLY_PROXY_HEIGHT || '540',
    videoCodec: process.env.QUIPSLY_PROXY_VIDEO_CODEC || 'libx264',
    preset: process.env.QUIPSLY_PROXY_PRESET || 'ultrafast',
    crf: process.env.QUIPSLY_PROXY_CRF || '34',
    audioBitrate: process.env.QUIPSLY_PROXY_AUDIO_BITRATE || '96k',
  };
}

async function generateProxy(original, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) return 'existing';

  const tempPath = `${destination}.partial-${process.pid}.mp4`;
  if (existsSync(tempPath)) await unlink(tempPath);
  const proxy = proxyOptions();

  await run(ffmpegPath(), [
    '-hide_banner',
    '-y',
    '-i',
    original,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    `scale=-2:${proxy.height}`,
    '-c:v',
    proxy.videoCodec,
    '-preset',
    proxy.preset,
    '-crf',
    proxy.crf,
    '-c:a',
    'aac',
    '-b:a',
    proxy.audioBitrate,
    '-movflags',
    '+faststart',
    tempPath,
  ]);
  await rename(tempPath, destination);
  return 'generated';
}

async function collectTargetsAsync(session, minBytes) {
  const rawTargets = [];
  const seen = new Map();
  for (const clip of session.clips || []) {
    const playbackMediaPath = String(clip.playbackMediaPath || '').trim();
    if (!playbackMediaPath) continue;
    if (!playbackMediaPath.includes('/Library/Application Support/QuipslyMac/playback-cache/')) continue;
    if (playbackMediaPath.endsWith('.proxy.mp4')) continue;
    let target = seen.get(playbackMediaPath);
    if (!target) {
      target = {
        playbackMediaPath,
        sourceAssetId: clip.sourceAssetId || createHash('sha1').update(playbackMediaPath).digest('hex').slice(0, 16),
        mediaDisplayName: clip.mediaDisplayName || clip.name || path.basename(playbackMediaPath),
        clipCount: 0,
        trackIds: new Set(),
      };
      seen.set(playbackMediaPath, target);
    }
    target.clipCount += 1;
    if (clip.trackId) target.trackIds.add(clip.trackId);
  }

  for (const target of seen.values()) {
    const sizeBytes = await fileSize(target.playbackMediaPath);
    if (sizeBytes >= minBytes) {
      rawTargets.push({
        ...target,
        trackIds: [...target.trackIds].sort(),
        sizeBytes,
      });
    }
  }

  return rawTargets.sort((left, right) => right.sizeBytes - left.sizeBytes);
}

function updateSessionClips(session, oldPlaybackPath, originalPath, newProxyPath) {
  let changed = 0;
  for (const clip of session.clips || []) {
    if (clip.playbackMediaPath !== oldPlaybackPath) continue;
    if (originalPath) {
      clip.localMediaPath = originalPath;
    }
    clip.playbackMediaPath = newProxyPath;
    clip.mediaExists = true;
    changed += 1;
  }
  return changed;
}

function byteLabel(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit < 2 ? 0 : 1)} ${units[unit]}`;
}

async function acquireWorkspaceLock(workspace) {
  const lockDir = path.join(workspace, 'locks');
  await mkdir(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, 'premiere-cache-external-proxy.lock');
  let handle;
  try {
    handle = await open(lockPath, 'wx');
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Proxy migration already appears to be running. Lock: ${lockPath}. If no migration is active, remove that stale lock and try again.`);
    }
    throw error;
  }

  await handle.writeFile(`${JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    command: process.argv.join(' '),
  }, null, 2)}\n`);

  return async () => {
    try {
      await handle.close();
    } finally {
      await unlink(lockPath).catch(() => {});
    }
  };
}

async function main() {
  const apply = hasFlag('--apply');
  const skipProxy = hasFlag('--skip-proxy');
  const deferOriginalCopy = hasFlag('--defer-original-copy');
  const projectSlug = argValue('--project', DEFAULT_PROJECT);
  const episodes = parseList(argValue('--episodes', ''), DEFAULT_EPISODES);
  const workspace = path.resolve(argValue('--workspace', DEFAULT_WORKSPACE));
  const minBytes = parseInteger(argValue('--min-bytes', ''), DEFAULT_MIN_BYTES);
  const limit = parseInteger(argValue('--limit', ''), 0);
  const manifest = {
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    projectSlug,
    episodes,
    workspace,
    minBytes,
    skipProxy,
    deferOriginalCopy,
    startedAt: new Date().toISOString(),
    changedSessions: [],
    targets: [],
    errors: [],
  };

  if (!existsSync(workspace) && apply) {
    await mkdir(workspace, { recursive: true });
  }

  const releaseLock = apply ? await acquireWorkspaceLock(workspace) : async () => {};
  try {
  for (const episodeSlug of episodes) {
    const file = sessionPath(projectSlug, episodeSlug);
    if (!existsSync(file)) {
      manifest.errors.push({ episodeSlug, error: `Session file not found: ${file}` });
      manifest.ok = false;
      continue;
    }

    const session = JSON.parse(await readFile(file, 'utf8'));
    let targets = await collectTargetsAsync(session, minBytes);
    if (limit > 0) targets = targets.slice(0, limit);

    let changedClips = 0;
    let changedTargets = 0;
    for (const target of targets) {
      const originalPath = sourceOriginalPath(workspace, projectSlug, episodeSlug, target.sourceAssetId, path.basename(target.playbackMediaPath));
      const newProxyPath = proxyPath(workspace, projectSlug, episodeSlug, target.sourceAssetId, target.playbackMediaPath);
      const info = await sourceInfo(target.playbackMediaPath);
      const record = {
        episodeSlug,
        sourceAssetId: target.sourceAssetId,
        oldPlaybackPath: target.playbackMediaPath,
        oldPlaybackIsSymlink: info.isSymlink,
        oldPlaybackSymlinkTarget: info.targetPath,
        originalPath,
        proxyPath: newProxyPath,
        sizeBytes: target.sizeBytes,
        sizeLabel: byteLabel(target.sizeBytes),
        clipCount: target.clipCount,
        trackIds: target.trackIds,
        move: 'not-run',
        proxy: 'not-run',
        changedClips: 0,
      };

      manifest.targets.push(record);
      if (!apply) continue;

      try {
        if (skipProxy) {
          record.proxy = 'skipped';
        } else {
          record.proxy = await generateProxy(target.playbackMediaPath, newProxyPath);
        }

        let linkedOriginalPath = '';
        if (deferOriginalCopy) {
          record.move = 'deferred-source-original-copy';
        } else if (!existsSync(originalPath)) {
          record.move = await moveAcrossVolumes(target.playbackMediaPath, originalPath);
          linkedOriginalPath = originalPath;
        } else if (existsSync(target.playbackMediaPath) && await sameSize(target.playbackMediaPath, originalPath)) {
          await unlink(target.playbackMediaPath);
          record.move = 'deduplicated-existing-destination';
          linkedOriginalPath = originalPath;
        } else {
          record.move = 'using-existing-destination';
          linkedOriginalPath = originalPath;
        }

        record.changedClips = updateSessionClips(
          session,
          target.playbackMediaPath,
          linkedOriginalPath,
          skipProxy ? (linkedOriginalPath || target.playbackMediaPath) : newProxyPath,
        );
        changedClips += record.changedClips;
        changedTargets += 1;
      } catch (error) {
        record.error = error?.message || String(error);
        manifest.errors.push({ episodeSlug, sourceAssetId: target.sourceAssetId, error: record.error });
        manifest.ok = false;
      }
    }

    if (apply && changedClips > 0) {
      const backup = `${file}.backup-before-external-proxy-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await copyFile(file, backup);
      session.updatedAt = new Date().toISOString();
      await writeFile(file, `${JSON.stringify(session, null, 2)}\n`);
      manifest.changedSessions.push({ episodeSlug, changedTargets, changedClips, backup });
    }
  }

  manifest.completedAt = new Date().toISOString();
  const manifestDir = path.join(workspace, 'manifests');
  if (apply) await mkdir(manifestDir, { recursive: true });
  const manifestPath = apply
    ? path.join(manifestDir, `premiere-cache-external-proxy-${Date.now()}.json`)
    : path.join(os.tmpdir(), `premiere-cache-external-proxy-dry-run-${Date.now()}.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify({
    ok: manifest.ok,
    mode: manifest.mode,
    targetCount: manifest.targets.length,
    targetBytes: byteLabel(manifest.targets.reduce((sum, target) => sum + target.sizeBytes, 0)),
    changedSessions: manifest.changedSessions,
    errorCount: manifest.errors.length,
    manifestPath,
  }, null, 2));
  } finally {
    await releaseLock();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
