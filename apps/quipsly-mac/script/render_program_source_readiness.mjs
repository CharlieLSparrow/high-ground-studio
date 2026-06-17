#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const rawArgs = process.argv.slice(2);
const positional = [];
const options = {
  download: false,
  output: null,
};

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--download') options.download = true;
  else if (arg === '--output') options.output = rawArgs[++index];
  else positional.push(arg);
}

const [projectSlug = 'high-ground-odyssey-manuscript', ...episodeArgs] = positional;
const episodeSlugs = episodeArgs.length > 0 ? episodeArgs : ['episode-1', 'episode-2', 'episode-3'];
const appSupport = join(os.homedir(), 'Library/Application Support/QuipslyMac');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = options.output || join(appSupport, 'render-readiness', projectSlug, `source-readiness-${stamp}.json`);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function allocatedBytesFor(path) {
  const result = spawnSync('/usr/bin/du', ['-skL', path], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) return null;
  const kb = Number((result.stdout || '').trim().split(/\s+/)[0]);
  return Number.isFinite(kb) ? kb * 1024 : null;
}

function symlinkTargetFor(path) {
  try {
    const lstat = lstatSync(path);
    if (!lstat.isSymbolicLink()) return null;
    const rawTarget = readlinkSync(path);
    return rawTarget.startsWith('/') ? rawTarget : resolve(dirname(path), rawTarget);
  } catch {
    return null;
  }
}

function fileProviderStateFor(path) {
  const result = spawnSync('/usr/bin/fileproviderctl', ['evaluate', path], {
    encoding: 'utf8',
    timeout: 8000,
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (!output.includes('fileproviderItems')) return null;

  const boolFor = (key) => {
    const match = output.match(new RegExp(`${key} = ([01]);`));
    return match ? match[1] === '1' : null;
  };

  return {
    commandExitCode: result.status,
    error: result.error ? result.error.message : null,
    isDownloaded: boolFor('isDownloaded'),
    isDownloading: boolFor('isDownloading'),
    isDownloadRequested: boolFor('isDownloadRequested'),
    isKeepDownloaded: boolFor('isKeepDownloaded'),
    isMostRecentVersionDownloaded: boolFor('isMostRecentVersionDownloaded'),
    isUploaded: boolFor('isUploaded'),
    effectiveContentPolicy: output.match(/Effective Content Policy: ([0-9]+)/)?.[1] || null,
  };
}

function summarizePath(path) {
  const summary = {
    path,
    exists: false,
    isSymlink: false,
    symlinkTarget: null,
    statBytes: null,
    allocatedBytes: null,
    localReadiness: 'missing',
    downloadAttempt: null,
    error: null,
  };

  try {
    if (!path || !existsSync(path)) {
      summary.error = 'path does not exist';
      return summary;
    }
    const lstat = lstatSync(path);
    summary.exists = true;
    summary.isSymlink = lstat.isSymbolicLink();
    summary.symlinkTarget = symlinkTargetFor(path);
    const stat = lstat.isSymbolicLink() && summary.symlinkTarget && existsSync(summary.symlinkTarget)
      ? lstatSync(summary.symlinkTarget)
      : lstatSync(path);
    summary.statBytes = stat.size;
    summary.allocatedBytes = allocatedBytesFor(path);

    if (summary.statBytes > 1024 * 1024) {
      summary.fileProviderState = fileProviderStateFor(summary.symlinkTarget || path);
    }

    if (summary.statBytes > 1024 * 1024 && summary.allocatedBytes !== null && summary.allocatedBytes < 1024 * 1024) {
      summary.localReadiness = 'download-needed';
    } else if (
      summary.statBytes > 1024 * 1024
      && summary.allocatedBytes !== null
      && summary.fileProviderState
      && summary.fileProviderState.isDownloaded === false
      && summary.allocatedBytes < summary.statBytes * 0.95
    ) {
      summary.localReadiness = 'partial-download';
    } else {
      summary.localReadiness = 'local';
    }
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
  }

  return summary;
}

function providerHintFor(path) {
  const normalized = String(path || '');
  if (normalized.includes('/Library/CloudStorage/GoogleDrive-')) {
    return {
      provider: 'google-drive-file-provider',
      recommendedAction: 'Reveal the file in Finder or Google Drive and choose Make available offline. Quipsly can see the file record, but Google Drive has not materialized the bytes locally.',
    };
  }
  if (normalized.includes('/Library/CloudStorage/')) {
    return {
      provider: 'macos-file-provider',
      recommendedAction: 'Reveal the file in Finder and choose the provider action that downloads or keeps it available offline.',
    };
  }
  if (normalized.includes('/Library/Mobile Documents/') || normalized.includes('/iCloud Drive/')) {
    return {
      provider: 'icloud-drive',
      recommendedAction: 'Use the download command or Finder Download Now so iCloud materializes the bytes locally.',
    };
  }
  if (normalized.includes('/Desktop/') || normalized.includes('/Documents/') || normalized.includes('/Downloads/')) {
    return {
      provider: 'macos-privacy-or-local-placeholder',
      recommendedAction: 'If Quipsly already has folder permission, reveal this file in Finder and make sure it is not an online-only provider placeholder.',
    };
  }
  if (normalized.includes('/Volumes/')) {
    return {
      provider: 'external-or-network-volume',
      recommendedAction: 'Confirm the drive is mounted and the file is locally readable before rendering.',
    };
  }
  return {
    provider: 'local-filesystem',
    recommendedAction: 'Confirm the file exists and has local bytes before rendering.',
  };
}

function effectiveFileFor(source) {
  return source.file.afterDownloadCheck || source.file;
}

function blockerProviderFor(source) {
  const file = effectiveFileFor(source);

  if (file.fileProviderState) {
    if (file.fileProviderState.isDownloading || file.fileProviderState.isDownloadRequested) {
      return {
        provider: 'macos-file-provider',
        recommendedAction: file.localReadiness === 'partial-download'
          ? 'The file has some local bytes but is not fully materialized. Proof renders may work; keep the watcher running before full draft export.'
          : 'The provider has accepted the download request. Keep the source watcher running until local bytes appear, then rerun proof/export.',
      };
    }

    return {
      provider: 'macos-file-provider',
      recommendedAction: 'This is an online-only File Provider item. Run the watcher with --request, or reveal it in Finder and choose Download Now or Make Available Offline.',
    };
  }

  return providerHintFor(file.symlinkTarget || source.mediaPath);
}

function mediaSegmentsFromPlan(plan) {
  return [
    ...(Array.isArray(plan.videoSegments) ? plan.videoSegments.map((segment) => ({ ...segment, kind: 'video' })) : []),
    ...(Array.isArray(plan.audioSegments) ? plan.audioSegments.map((segment) => ({ ...segment, kind: 'audio' })) : []),
  ].filter((segment) => typeof segment.mediaPath === 'string' && segment.mediaPath.length > 0);
}

function mergeSource(existing, segment) {
  if (segment.kind && !existing.kinds.includes(segment.kind)) existing.kinds.push(segment.kind);
  if (segment.trackId && !existing.trackIds.includes(segment.trackId)) existing.trackIds.push(segment.trackId);
  if (segment.name && !existing.names.includes(segment.name)) existing.names.push(segment.name);
  if (segment.sourceAssetId && !existing.sourceAssetIds.includes(segment.sourceAssetId)) existing.sourceAssetIds.push(segment.sourceAssetId);
  existing.segmentCount += 1;
  existing.outputRanges.push({
    outputStart: Number(segment.outputStart || 0),
    outputEnd: Number(segment.outputEnd || 0),
    sourceStart: Number(segment.sourceStart || 0),
    sourceEnd: Number(segment.sourceEnd || 0),
  });
}

function runDownloadAttempt(command, args, timeout = 10000) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024,
  });
  return {
    command,
    args,
    exitCode: result.status,
    error: result.error ? result.error.message : null,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function triggerDownload(source) {
  const downloadPath = source.file.symlinkTarget || source.mediaPath;
  const hint = source.file.fileProviderState
    ? {
      provider: 'macos-file-provider',
      recommendedAction: 'This path is backed by a macOS File Provider. Quipsly will try to request local bytes, but Finder or the provider app may still be needed for Make Available Offline.',
    }
    : providerHintFor(downloadPath);
  const attempts = [];

  if (hint.provider === 'icloud-drive') {
    attempts.push(runDownloadAttempt('/usr/bin/brctl', ['download', downloadPath], 15000));
  }

  if (hint.provider === 'google-drive-file-provider' || hint.provider === 'macos-file-provider') {
    attempts.push(runDownloadAttempt('/usr/bin/fileproviderctl', ['evaluate', downloadPath], 15000));
    attempts.push(runDownloadAttempt('/bin/dd', [`if=${downloadPath}`, 'of=/dev/null', 'bs=1', 'count=1'], 2500));
  }

  attempts.push(runDownloadAttempt('/usr/bin/open', ['-R', downloadPath], 15000));

  source.file.downloadAttempt = {
    path: downloadPath,
    provider: hint.provider,
    recommendedAction: hint.recommendedAction,
    attempts,
  };
}

const episodes = [];
for (const episodeSlug of episodeSlugs) {
  const planPath = join(appSupport, 'render-plans', projectSlug, episodeSlug, 'program-plan.json');
  if (!existsSync(planPath)) {
    episodes.push({
      episodeSlug,
      planPath,
      ok: false,
      blockers: [{ type: 'missing-program-plan', message: `Missing program plan: ${planPath}` }],
      sources: [],
    });
    continue;
  }

  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const byPath = new Map();
  for (const segment of mediaSegmentsFromPlan(plan)) {
    if (!byPath.has(segment.mediaPath)) {
      byPath.set(segment.mediaPath, {
        mediaPath: segment.mediaPath,
        kinds: [],
        trackIds: [],
        names: [],
        sourceAssetIds: [],
        segmentCount: 0,
        outputRanges: [],
        file: summarizePath(segment.mediaPath),
      });
    }
    mergeSource(byPath.get(segment.mediaPath), segment);
  }

  const sources = [...byPath.values()].sort((left, right) => String(left.names[0] || left.mediaPath).localeCompare(String(right.names[0] || right.mediaPath)));
  if (options.download) {
    for (const source of sources.filter((item) => item.file.localReadiness === 'download-needed' || item.file.localReadiness === 'partial-download')) {
      triggerDownload(source);
      source.file = {
        ...source.file,
        afterDownloadCheck: summarizePath(source.mediaPath),
      };
    }
  }

  const blockers = sources
    .filter((source) => effectiveFileFor(source).localReadiness !== 'local')
    .map((source) => {
      const file = effectiveFileFor(source);
      const provider = blockerProviderFor(source);

      return {
        type: file.localReadiness,
        mediaPath: source.mediaPath,
        resolvedPath: file.symlinkTarget || source.mediaPath,
        names: source.names,
        trackIds: source.trackIds,
        allocatedBytes: file.allocatedBytes,
        statBytes: file.statBytes,
        provider: provider.provider,
        fileProviderState: file.fileProviderState || null,
        downloadAttempt: source.file.downloadAttempt || null,
        readinessStateSource: source.file.afterDownloadCheck ? 'after-download-check' : 'initial-check',
        recommendedAction: provider.recommendedAction,
        message: file.localReadiness === 'download-needed'
          ? 'Source exists but has almost no local allocated bytes. Download it before rendering/export.'
          : file.localReadiness === 'partial-download'
            ? 'Source has some local bytes but is not fully materialized. Proof can work, but full export should wait.'
            : file.error || 'Source is not ready.',
      };
    });

  episodes.push({
    episodeSlug,
    planPath,
    ok: blockers.length === 0,
    blockers,
    sourceCount: sources.length,
    sources,
  });
}

const report = {
  schema: 'quipsly-mac-program-source-readiness-v1',
  generatedAt: new Date().toISOString(),
  projectSlug,
  episodeSlugs,
  downloadRequested: options.download,
  outputPath,
  ok: episodes.every((episode) => episode.ok),
  episodes,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  schema: report.schema,
  ok: report.ok,
  outputPath,
  episodes: episodes.map((episode) => ({
    episodeSlug: episode.episodeSlug,
    ok: episode.ok,
    sourceCount: episode.sourceCount,
    blockers: episode.blockers,
  })),
}, null, 2));

if (!report.ok) process.exitCode = 1;
