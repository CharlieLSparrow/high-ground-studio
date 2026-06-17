#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const [projectSlug, episodeSlug, exportPath] = process.argv.slice(2);

if (!projectSlug || !episodeSlug || !exportPath) {
  console.error("Usage: publish_to_worldhub.mjs <projectSlug> <episodeSlug> <exportPath>");
  process.exit(1);
}

if (!existsSync(exportPath)) {
  console.error(`Export path does not exist: ${exportPath}`);
  process.exit(1);
}

const audioPath = exportPath.replace(/\.mp4$/, '.mp3');
const hasAudio = existsSync(audioPath);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = join(dirname(exportPath), `${episodeSlug}-publish-report-${stamp}.json`);

const report = {
  schema: 'quipsly-mac-publish-report-v1',
  generatedAt: new Date().toISOString(),
  projectSlug,
  episodeSlug,
  exportPath,
  audioPath: hasAudio ? audioPath : null,
  reportPath,
  ok: false,
  message: 'Initializing publish pipeline...',
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`Publishing ${episodeSlug} from project ${projectSlug}...`);
console.log(`Video Export: ${exportPath}`);
if (hasAudio) {
  console.log(`Audio Export: ${audioPath}`);
}

// In a real implementation, this would chunk the files and stream them to Vercel Blob or AWS S3.
// For now, we will hit the local Next.js API to trigger the background distribution jobs.
const apiEndpoint = process.env.QUIPSLY_API_URL || 'http://localhost:3000/api/distribution/trigger';

const payload = {
  projectSlug,
  episodeSlug,
  videoUrl: `local://${exportPath}`,
  audioUrl: hasAudio ? `local://${audioPath}` : null,
  platforms: ['youtube', 'spotify', 'apple_podcasts', 'meta'],
};

console.log(`Triggering distribution API at ${apiEndpoint}...`);
const curlResult = spawnSync('curl', [
  '-X', 'POST',
  apiEndpoint,
  '-H', 'Content-Type: application/json',
  '-d', JSON.stringify(payload)
], { encoding: 'utf8' });

report.curlExitCode = curlResult.status;
report.curlStdout = curlResult.stdout;
report.curlStderr = curlResult.stderr;

if (curlResult.status === 0) {
  report.ok = true;
  report.message = 'Successfully triggered distribution pipeline.';
  console.log('Publish triggered successfully.');
} else {
  report.message = `Failed to trigger distribution API. HTTP status unknown, curl exit code ${curlResult.status}`;
  console.error('Publish failed.');
  console.error(curlResult.stderr);
}

writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  process.exit(1);
}
