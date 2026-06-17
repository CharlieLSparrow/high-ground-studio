#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const rawArgs = process.argv.slice(2);
const positional = [];
const options = {
  request: false,
  intervalSeconds: 30,
  maxWaitSeconds: 0,
};

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--request' || arg === '--request-downloads' || arg === '--download') {
    options.request = true;
  } else if (arg === '--interval-seconds') {
    options.intervalSeconds = Number(rawArgs[++index] || options.intervalSeconds);
  } else if (arg === '--max-wait-seconds') {
    options.maxWaitSeconds = Number(rawArgs[++index] || options.maxWaitSeconds);
  } else {
    positional.push(arg);
  }
}

const [projectSlug = 'high-ground-odyssey-manuscript', ...episodeArgs] = positional;
const episodeSlugs = episodeArgs.length > 0 ? episodeArgs : ['episode-1', 'episode-2', 'episode-3'];
const appSupport = join(os.homedir(), 'Library/Application Support/QuipslyMac');
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const readinessScript = join(scriptRoot, 'render_program_source_readiness.mjs');
const watchRoot = join(appSupport, 'render-readiness', projectSlug, 'watch');
mkdirSync(watchRoot, { recursive: true });

function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, seconds) * 1000);
}

function blockerRows(report) {
  return (report.episodes || []).flatMap((episode) => (
    (episode.blockers || []).map((blocker) => ({
      episodeSlug: episode.episodeSlug,
      name: (blocker.names || []).join(', ') || blocker.mediaPath || 'unknown source',
      trackIds: (blocker.trackIds || []).join(', '),
      provider: blocker.provider || blocker.type || 'unknown',
      isDownloaded: blocker.fileProviderState?.isDownloaded,
      isDownloading: blocker.fileProviderState?.isDownloading,
      isDownloadRequested: blocker.fileProviderState?.isDownloadRequested,
      allocatedBytes: blocker.allocatedBytes,
      statBytes: blocker.statBytes,
      resolvedPath: blocker.resolvedPath || blocker.mediaPath || '',
      recommendedAction: blocker.recommendedAction || blocker.message || 'Make this source available locally.',
      downloadAttempt: blocker.downloadAttempt || null,
      readinessStateSource: blocker.readinessStateSource || 'unknown',
    }))
  ));
}

function compactSize(bytes) {
  if (!Number.isFinite(bytes)) return '?';
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(1)}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function runReadiness(passIndex, shouldRequestDownloads) {
  const outputPath = join(watchRoot, `source-watch-pass-${String(passIndex).padStart(4, '0')}.json`);
  const args = [
    readinessScript,
    projectSlug,
    ...episodeSlugs,
    '--output',
    outputPath,
  ];
  if (shouldRequestDownloads) args.push('--download');

  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 1024 * 1024 * 4,
  });

  if (!existsSync(outputPath)) {
    const tail = `${result.stdout || ''}\n${result.stderr || ''}`.trim().slice(-4000);
    throw new Error(`Source readiness did not write ${outputPath}.\n${tail}`);
  }

  const report = JSON.parse(readFileSync(outputPath, 'utf8'));
  return { report, outputPath, exitCode: result.status, stderr: result.stderr || '' };
}

function printStatus(passIndex, outputPath, report) {
  const rows = blockerRows(report);
  const downloading = rows.filter((row) => row.isDownloading).length;
  const requested = rows.filter((row) => row.isDownloadRequested).length;
  const downloaded = rows.filter((row) => row.isDownloaded).length;
  const total = rows.length;

  console.log(JSON.stringify({
    schema: 'quipsly-mac-source-materialization-watch-v1',
    pass: passIndex,
    ok: report.ok,
    outputPath,
    projectSlug,
    episodeSlugs,
    blockers: total,
    downloaded,
    requested,
    downloading,
  }, null, 2));

  for (const row of rows.slice(0, 12)) {
    const state = row.isDownloaded
      ? 'downloaded'
      : row.isDownloading
        ? 'downloading'
        : row.isDownloadRequested
          ? 'requested'
          : 'not requested';
    console.log(`- ${row.episodeSlug} ${row.trackIds} ${row.name}: ${state}, ${compactSize(row.allocatedBytes)} of ${compactSize(row.statBytes)} local`);
    console.log(`  ${row.resolvedPath}`);
    if (row.downloadAttempt && state === 'not requested') {
      const attempts = Array.isArray(row.downloadAttempt.attempts) ? row.downloadAttempt.attempts : [];
      const attemptSummary = attempts.map((attempt) => {
        const command = String(attempt.command || '').split('/').pop();
        return `${command}:${attempt.exitCode ?? attempt.error ?? 'unknown'}`;
      }).join(', ');
      console.log(`  request attempt did not stick (${attemptSummary || 'no attempts recorded'}). Use Finder/Drive Make Available Offline if this stays not requested.`);
    }
  }

  if (rows.length > 12) {
    console.log(`... ${rows.length - 12} more blocker(s) in ${outputPath}`);
  }
}

const startedAt = Date.now();
let passIndex = 0;
let requestedOnce = false;

while (true) {
  passIndex += 1;
  const shouldRequest = options.request && !requestedOnce;
  requestedOnce = requestedOnce || shouldRequest;

  const { report, outputPath } = runReadiness(passIndex, shouldRequest);
  printStatus(passIndex, outputPath, report);

  if (report.ok) {
    process.exit(0);
  }

  if (options.maxWaitSeconds <= 0) {
    process.exit(1);
  }

  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  if (elapsedSeconds >= options.maxWaitSeconds) {
    console.log(`Timed out after ${Math.round(elapsedSeconds)}s waiting for source materialization.`);
    process.exit(1);
  }

  sleep(Math.min(options.intervalSeconds, Math.max(1, options.maxWaitSeconds - elapsedSeconds)));
}
