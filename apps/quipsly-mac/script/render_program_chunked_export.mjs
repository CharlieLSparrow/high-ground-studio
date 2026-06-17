#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const rawArgs = process.argv.slice(2);
const positional = [];
const options = {
  width: 1280,
  height: 720,
  fps: 24,
  chunkSeconds: 60,
  maxChunks: null,
  startChunk: 0,
  onlyChunk: null,
  chunkTimeoutMs: 180000,
  dryRun: false,
  output: null,
};

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--width') options.width = Number(rawArgs[++index]);
  else if (arg === '--height') options.height = Number(rawArgs[++index]);
  else if (arg === '--fps') options.fps = Number(rawArgs[++index]);
  else if (arg === '--chunk-seconds') options.chunkSeconds = Number(rawArgs[++index]);
  else if (arg === '--max-chunks') options.maxChunks = Number(rawArgs[++index]);
  else if (arg === '--start-chunk') options.startChunk = Number(rawArgs[++index]);
  else if (arg === '--only-chunk') options.onlyChunk = Number(rawArgs[++index]);
  else if (arg === '--chunk-timeout-ms') options.chunkTimeoutMs = Number(rawArgs[++index]);
  else if (arg === '--output') options.output = rawArgs[++index];
  else if (arg === '--dry-run') options.dryRun = true;
  else positional.push(arg);
}

const [projectSlug = 'high-ground-odyssey-manuscript', episodeSlug = 'episode-2'] = positional;
const appSupport = join(os.homedir(), 'Library/Application Support/QuipslyMac');
const planPath = join(appSupport, 'render-plans', projectSlug, episodeSlug, 'program-plan.json');
const renderBaseRoot = process.env.QUIPSLY_MAC_RENDER_OUTPUT_ROOT || join(appSupport, 'renders');
const renderRoot = join(renderBaseRoot, projectSlug, episodeSlug);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = options.output || join(renderRoot, `${episodeSlug}-chunked-draft-export-${stamp}.mp4`);
const reportPath = `${outputPath}.json`;
const chunkRoot = join(renderRoot, `${episodeSlug}-chunks-${stamp}`);
const chunkListPath = join(chunkRoot, 'chunks.ffconcat');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function fmt(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : '0';
}

function shellQuoteForConcat(path) {
  return String(path).replace(/'/g, "'\\''");
}

function resolveTool(envName, commandName) {
  if (process.env[envName]) return process.env[envName];
  const result = spawnSync('/bin/zsh', ['-lc', `command -v ${commandName}`], { encoding: 'utf8' });
  const found = result.stdout.trim();
  if (result.status === 0 && found) return found;
  return commandName;
}

if (!Number.isFinite(options.width) || options.width <= 0) fail('Invalid --width value.');
if (!Number.isFinite(options.height) || options.height <= 0) fail('Invalid --height value.');
if (!Number.isFinite(options.fps) || options.fps <= 0) fail('Invalid --fps value.');
if (!Number.isFinite(options.chunkSeconds) || options.chunkSeconds < 5 || options.chunkSeconds > 600) fail('Invalid --chunk-seconds value; use 5-600.');
if (options.maxChunks !== null && (!Number.isFinite(options.maxChunks) || options.maxChunks <= 0)) fail('Invalid --max-chunks value.');
if (!Number.isInteger(options.startChunk) || options.startChunk < 0) fail('Invalid --start-chunk value; use a zero-based chunk index.');
if (options.onlyChunk !== null && (!Number.isInteger(options.onlyChunk) || options.onlyChunk < 0)) fail('Invalid --only-chunk value; use a zero-based chunk index.');
if (!Number.isFinite(options.chunkTimeoutMs) || options.chunkTimeoutMs < 1000) fail('Invalid --chunk-timeout-ms value.');
if (!existsSync(planPath)) fail(`Missing program plan: ${planPath}. Run script/render_manifest_program_plan.mjs ${projectSlug} ${episodeSlug}`);

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
if (plan.schema !== 'quipsly-mac-program-render-plan-v1') fail(`Unsupported program plan schema: ${plan.schema}`);
if (plan.ok !== true) fail(`Program plan is not export-ready: ${(plan.blockers || []).map((blocker) => blocker.reason || blocker).join('; ')}`);

const duration = Number(plan.renderedProgramDuration || plan.programDuration || 0);
if (!Number.isFinite(duration) || duration <= 0) fail('Program plan has no rendered duration.');

mkdirSync(chunkRoot, { recursive: true });
mkdirSync(dirname(outputPath), { recursive: true });

const allChunks = [];
for (let start = 0, index = 0; start < duration - 0.02; start += options.chunkSeconds, index += 1) {
  const chunkDuration = Math.min(options.chunkSeconds, duration - start);
  allChunks.push({
    index,
    start,
    duration: chunkDuration,
    outputPath: join(chunkRoot, `chunk-${String(index).padStart(4, '0')}.mp4`),
  });
}

let chunks = allChunks.filter((chunk) => chunk.index >= options.startChunk);
if (options.onlyChunk !== null) {
  chunks = allChunks.filter((chunk) => chunk.index === options.onlyChunk);
}
if (options.maxChunks !== null) {
  chunks = chunks.slice(0, options.maxChunks);
}
if (chunks.length <= 0) {
  fail(`No chunks selected. Total chunks: ${allChunks.length}; startChunk=${options.startChunk}; onlyChunk=${options.onlyChunk}; maxChunks=${options.maxChunks}`);
}

function intersection(leftStart, leftEnd, rightStart, rightEnd) {
  const start = Math.max(Number(leftStart || 0), Number(rightStart || 0));
  const end = Math.min(Number(leftEnd || 0), Number(rightEnd || 0));
  if (end - start <= 0.001) return null;
  return { start, end, duration: end - start };
}

function fileSummary(mediaPath) {
  const summary = {
    mediaPath,
    exists: false,
    isSymlink: false,
    symlinkTarget: null,
    lstatBytes: null,
    statBytes: null,
    allocatedBytes: null,
    localReadiness: 'unknown',
    error: null,
  };
  if (!mediaPath) {
    summary.error = 'missing mediaPath';
    return summary;
  }
  try {
    if (!existsSync(mediaPath)) {
      summary.error = 'path does not exist';
      return summary;
    }
    summary.exists = true;
    const lstat = lstatSync(mediaPath);
    summary.isSymlink = lstat.isSymbolicLink();
    summary.lstatBytes = lstat.size;
    if (summary.isSymlink) {
      summary.symlinkTarget = readlinkSync(mediaPath);
    }
    summary.statBytes = statSync(mediaPath).size;
    const du = spawnSync('/usr/bin/du', ['-skL', mediaPath], { encoding: 'utf8', timeout: 5000 });
    if (du.status === 0) {
      const allocatedKb = Number((du.stdout || '').trim().split(/\s+/)[0]);
      if (Number.isFinite(allocatedKb)) summary.allocatedBytes = allocatedKb * 1024;
    }
    if (summary.statBytes > 1024 * 1024 && summary.allocatedBytes !== null && summary.allocatedBytes < 1024 * 1024) {
      summary.localReadiness = 'download-needed';
    } else if (summary.exists) {
      summary.localReadiness = 'local';
    }
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
  }
  return summary;
}

function sourceRangeForOverlap(segment, overlap) {
  const sourceStart = Number(segment.sourceStart || 0) + (overlap.start - Number(segment.outputStart || 0));
  return {
    sourceStart,
    sourceEnd: sourceStart + overlap.duration,
  };
}

function uniqueSourceSummariesForChunk(chunk) {
  const outputStart = chunk.start;
  const outputEnd = chunk.start + chunk.duration;
  const segments = [
    ...(Array.isArray(plan.videoSegments) ? plan.videoSegments.map((segment) => ({ ...segment, kind: 'video' })) : []),
    ...(Array.isArray(plan.audioSegments) ? plan.audioSegments.map((segment) => ({ ...segment, kind: 'audio' })) : []),
  ];
  const rangesBySource = new Map();

  for (const segment of segments) {
    const overlap = intersection(segment.outputStart, segment.outputEnd, outputStart, outputEnd);
    if (!overlap) continue;
    const key = `${segment.kind}:${segment.trackId || ''}:${segment.mediaPath || ''}`;
    const sourceRange = sourceRangeForOverlap(segment, overlap);
    if (!rangesBySource.has(key)) {
      rangesBySource.set(key, {
        kind: segment.kind,
        clipIds: [],
        sourceAssetIds: [],
        names: [],
        trackId: segment.trackId || null,
        mediaPath: segment.mediaPath || null,
        file: fileSummary(segment.mediaPath || null),
        outputRanges: [],
        sourceRanges: [],
      });
    }
    const summary = rangesBySource.get(key);
    if (segment.clipId && !summary.clipIds.includes(segment.clipId)) summary.clipIds.push(segment.clipId);
    if (segment.sourceAssetId && !summary.sourceAssetIds.includes(segment.sourceAssetId)) summary.sourceAssetIds.push(segment.sourceAssetId);
    if (segment.name && !summary.names.includes(segment.name)) summary.names.push(segment.name);
    summary.outputRanges.push({
      outputStart: overlap.start,
      outputEnd: overlap.end,
      duration: overlap.duration,
    });
    summary.sourceRanges.push({
      sourceStart: sourceRange.sourceStart,
      sourceEnd: sourceRange.sourceEnd,
      duration: overlap.duration,
    });
  }

  return [...rangesBySource.values()].sort((left, right) => {
    const leftKind = left.kind === 'video' ? 0 : 1;
    const rightKind = right.kind === 'video' ? 0 : 1;
    return leftKind - rightKind || String(left.trackId || '').localeCompare(String(right.trackId || '')) || String(left.mediaPath || '').localeCompare(String(right.mediaPath || ''));
  });
}

const chunkSourceSummaries = chunks.map((chunk) => ({
  chunkIndex: chunk.index,
  chunkStart: chunk.start,
  chunkEnd: chunk.start + chunk.duration,
  duration: chunk.duration,
  sources: uniqueSourceSummariesForChunk(chunk),
}));

const report = {
  schema: 'quipsly-mac-program-chunked-export-v1',
  generatedAt: new Date().toISOString(),
  dryRun: options.dryRun,
  projectSlug,
  episodeSlug,
  planPath,
  outputPath,
  reportPath,
  chunkRoot,
  chunkListPath,
  width: options.width,
  height: options.height,
  fps: options.fps,
  chunkSeconds: options.chunkSeconds,
  totalChunkCount: allChunks.length,
  startChunk: options.startChunk,
  onlyChunk: options.onlyChunk,
  maxChunks: options.maxChunks,
  chunkTimeoutMs: options.chunkTimeoutMs,
  programDuration: duration,
  chunkCount: chunks.length,
  chunks,
  chunkSourceSummaries,
  ok: false,
};

writeFileSync(reportPath, JSON.stringify({ ...report, message: 'Chunked draft export initialized.' }, null, 2));
console.log(JSON.stringify({
  schema: report.schema,
  projectSlug,
  episodeSlug,
  outputPath,
  reportPath,
  chunkCount: chunks.length,
  totalChunkCount: allChunks.length,
  startChunk: options.startChunk,
  onlyChunk: options.onlyChunk,
  message: 'Chunked draft export initialized.',
}, null, 2));

if (options.dryRun) {
  report.ok = true;
  report.message = 'Dry run only; no chunks rendered.';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const renderer = new URL('./render_program_proof.mjs', import.meta.url).pathname;
for (const [selectedIndex, chunk] of chunks.entries()) {
  report.currentChunk = chunk.index;
  report.currentSelectedChunk = selectedIndex;
  report.message = `Rendering selected chunk ${selectedIndex + 1}/${chunks.length} (absolute chunk ${chunk.index + 1}/${allChunks.length}).`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    schema: report.schema,
    projectSlug,
    episodeSlug,
    currentChunk: chunk.index,
    currentSelectedChunk: selectedIndex,
    chunkCount: chunks.length,
    totalChunkCount: allChunks.length,
    start: chunk.start,
    duration: chunk.duration,
    outputPath: chunk.outputPath,
    sourceCount: chunkSourceSummaries.find((summary) => summary.chunkIndex === chunk.index)?.sources.length || 0,
    message: report.message,
  }, null, 2));

  const result = spawnSync(process.execPath, [
    renderer,
    projectSlug,
    episodeSlug,
    '--start', fmt(chunk.start),
    '--duration', fmt(chunk.duration),
    '--width', String(options.width),
    '--height', String(options.height),
    '--fps', String(options.fps),
    '--output', chunk.outputPath,
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 30,
    timeout: options.chunkTimeoutMs,
    env: {
      ...process.env,
      QUIPSLY_RENDER_SKIP_STREAM_PROBES: '1',
    },
  });

  chunk.exitCode = result.status;
  chunk.error = result.error ? result.error.message : null;
  chunk.timedOut = result.error && result.error.code === 'ETIMEDOUT';
  chunk.stderrTail = (result.stderr || '').split('\n').slice(-12).join('\n');
  chunk.stdoutTail = (result.stdout || '').split('\n').slice(-12).join('\n');
  chunk.outputBytes = existsSync(chunk.outputPath) ? statSync(chunk.outputPath).size : 0;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (result.status !== 0 || chunk.outputBytes <= 0) {
    report.ok = false;
    report.failedChunk = chunk.index;
    report.message = chunk.timedOut ? `Chunk ${chunk.index} timed out after ${options.chunkTimeoutMs}ms.` : `Chunk ${chunk.index} failed.`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

writeFileSync(
  chunkListPath,
  ['ffconcat version 1.0', ...chunks.map((chunk) => `file '${shellQuoteForConcat(chunk.outputPath)}'`)].join('\n') + '\n'
);

const ffmpeg = resolveTool('FFMPEG_PATH', 'ffmpeg');
const concatResult = spawnSync(ffmpeg, [
  '-hide_banner',
  '-nostdin',
  '-y',
  '-f', 'concat',
  '-safe', '0',
  '-i', chunkListPath,
  '-c', 'copy',
  '-movflags', '+faststart',
  outputPath,
], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });

report.concatExitCode = concatResult.status;
report.concatStderrTail = (concatResult.stderr || '').split('\n').slice(-30).join('\n');
report.outputBytes = existsSync(outputPath) ? statSync(outputPath).size : 0;
report.ok = concatResult.status === 0 && report.outputBytes > 0;
report.message = report.ok ? 'Chunked draft export complete.' : 'Chunk concat failed.';

if (report.ok) {
  const audioPath = outputPath.replace(/\.mp4$/, '.mp3');
  const extractResult = spawnSync(ffmpeg, [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i', outputPath,
    '-q:a', '0',
    '-map', 'a',
    audioPath,
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });

  report.audioExtractExitCode = extractResult.status;
  report.audioExtractStderrTail = (extractResult.stderr || '').split('\n').slice(-30).join('\n');
  report.audioBytes = existsSync(audioPath) ? statSync(audioPath).size : 0;
  report.audioPath = audioPath;
  if (extractResult.status === 0 && report.audioBytes > 0) {
    report.message = 'Chunked draft export and audio extraction complete.';
  } else {
    report.message = 'Chunked draft export complete, but audio extraction failed.';
  }
}

writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
