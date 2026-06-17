#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const rawArgs = process.argv.slice(2);
const positional = [];
const options = {
  start: 0,
  duration: 8,
  width: 640,
  height: 360,
  fps: 24,
  dryRun: false,
  full: false,
  confirmLongRender: false,
  output: null,
};

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--start') options.start = Number(rawArgs[++index]);
  else if (arg === '--duration') options.duration = Number(rawArgs[++index]);
  else if (arg === '--width') options.width = Number(rawArgs[++index]);
  else if (arg === '--height') options.height = Number(rawArgs[++index]);
  else if (arg === '--fps') options.fps = Number(rawArgs[++index]);
  else if (arg === '--output') options.output = rawArgs[++index];
  else if (arg === '--dry-run') options.dryRun = true;
  else if (arg === '--full') options.full = true;
  else if (arg === '--confirm-long-render') options.confirmLongRender = true;
  else positional.push(arg);
}

const [projectSlug = 'high-ground-odyssey-manuscript', episodeSlug = 'episode-1'] = positional;
const appSupport = join(os.homedir(), 'Library/Application Support/QuipslyMac');
const planPath = join(appSupport, 'render-plans', projectSlug, episodeSlug, 'program-plan.json');
const renderBaseRoot = process.env.QUIPSLY_MAC_RENDER_OUTPUT_ROOT || join(appSupport, 'renders');
const renderRoot = join(renderBaseRoot, projectSlug, episodeSlug);
const outputPath = options.output || join(renderRoot, `${episodeSlug}-${options.full ? 'draft-export' : 'proof'}-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`);
const reportPath = `${outputPath}.json`;
const filterScriptPath = `${outputPath}.filter_complex.txt`;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function fmt(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : '0';
}

function resolveTool(envName, commandName) {
  if (process.env[envName]) return process.env[envName];
  const result = spawnSync('/bin/zsh', ['-lc', `command -v ${commandName}`], { encoding: 'utf8' });
  const found = result.stdout.trim();
  if (result.status === 0 && found) return found;
  return commandName;
}

function allocatedBytesFor(mediaPath) {
  const result = spawnSync('/usr/bin/du', ['-skL', mediaPath], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) return null;
  const allocatedKb = Number((result.stdout || '').trim().split(/\s+/)[0]);
  return Number.isFinite(allocatedKb) ? allocatedKb * 1024 : null;
}

function localMediaReadiness(mediaPath) {
  if (!existsSync(mediaPath)) {
    return {
      ok: false,
      reason: 'missing',
      message: `Media source does not exist: ${mediaPath}`,
    };
  }
  const size = statSync(mediaPath).size;
  const allocatedBytes = allocatedBytesFor(mediaPath);
  if (size > 1024 * 1024 && allocatedBytes !== null && allocatedBytes < 1024 * 1024) {
    return {
      ok: false,
      reason: 'download-needed',
      size,
      allocatedBytes,
      message: `Media source appears to be a cloud placeholder or sparse file with no local bytes yet: ${mediaPath}. Download it locally before rendering.`,
    };
  }
  return {
    ok: true,
    reason: 'local',
    size,
    allocatedBytes,
  };
}

const ffmpeg = resolveTool('FFMPEG_PATH', 'ffmpeg');
const ffprobe = resolveTool('FFPROBE_PATH', 'ffprobe');
const skipAllStreamProbes = process.env.QUIPSLY_RENDER_SKIP_STREAM_PROBES === '1';
const skipStreamProbeForFullRender = options.full && process.env.QUIPSLY_RENDER_FULL_PROBE_STREAMS !== '1';

function ffprobeStreams(mediaPath) {
  const defaultTimeout = options.full ? 45000 : 8000;
  const timeout = Number(process.env.QUIPSLY_RENDER_FFPROBE_TIMEOUT_MS || defaultTimeout);
  const result = spawnSync(ffprobe, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type',
    '-of', 'json',
    mediaPath,
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout });
  if (result.error) return { audio: false, video: false, error: result.error.message };
  if (result.status !== 0) return { audio: false, video: false, error: result.stderr.trim() || result.stdout.trim() };
  try {
    const json = JSON.parse(result.stdout);
    const types = new Set((json.streams || []).map((stream) => stream.codec_type));
    return { audio: types.has('audio'), video: types.has('video'), error: null };
  } catch (error) {
    return { audio: false, video: false, error: error.message };
  }
}

function intersection(segment, start, end) {
  const segmentStart = Number(segment.outputStart || 0);
  const segmentEnd = Number(segment.outputEnd || segmentStart + Number(segment.duration || 0));
  const hitStart = Math.max(segmentStart, start);
  const hitEnd = Math.min(segmentEnd, end);
  if (hitEnd - hitStart <= 0.02) return null;
  return { start: hitStart, end: hitEnd, duration: hitEnd - hitStart };
}

function addInput(args, mediaPath, sourceStart, duration) {
  args.push('-ss', fmt(Math.max(0, sourceStart)), '-t', fmt(duration), '-i', mediaPath);
  return inputIndex++;
}

function clampedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function firstMotionKeyframe(segment) {
  const keyframes = segment.motion && Array.isArray(segment.motion.keyframes) ? segment.motion.keyframes : [];
  return keyframes[0] || null;
}

function videoFilterFor(input, label, segment) {
  const keyframe = firstMotionKeyframe(segment);
  const scale = keyframe ? clampedNumber(keyframe.scale, 1, 1, 8) : 1;
  const x = keyframe ? clampedNumber(keyframe.x, 0, -options.width * 4, options.width * 4) : 0;
  const y = keyframe ? clampedNumber(keyframe.y, 0, -options.height * 4, options.height * 4) : 0;
  const hasMotion = scale > 1.001 || Math.abs(x) > 0.5 || Math.abs(y) > 0.5;

  if (!hasMotion) {
    return `[${input}:v:0]setpts=PTS-STARTPTS,scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps},format=yuv420p[${label}]`;
  }

  const scaledWidth = Math.max(options.width, Math.round(options.width * scale));
  const scaledHeight = Math.max(options.height, Math.round(options.height * scale));
  const cropX = Math.round(Math.min(scaledWidth - options.width, Math.max(0, ((scaledWidth - options.width) / 2) - x)));
  const cropY = Math.round(Math.min(scaledHeight - options.height, Math.max(0, ((scaledHeight - options.height) / 2) - y)));

  return `[${input}:v:0]setpts=PTS-STARTPTS,scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2,scale=${scaledWidth}:${scaledHeight},crop=${options.width}:${options.height}:${cropX}:${cropY},setsar=1,fps=${options.fps},format=yuv420p[${label}]`;
}

if (!Number.isFinite(options.start) || options.start < 0) fail('Invalid --start value.');
if (!options.full && (!Number.isFinite(options.duration) || options.duration <= 0)) fail('Invalid --duration value.');
if (!Number.isFinite(options.width) || !Number.isFinite(options.height) || options.width <= 0 || options.height <= 0) fail('Invalid proof dimensions.');
if (!existsSync(planPath)) fail(`Missing program plan: ${planPath}. Run script/render_manifest_program_plan.mjs ${projectSlug} ${episodeSlug}`);

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
if (plan.schema !== 'quipsly-mac-program-render-plan-v1') fail(`Unsupported program plan schema: ${plan.schema}`);
if (plan.ok !== true) fail(`Program plan is not export-ready: ${(plan.blockers || []).map((blocker) => blocker.reason || blocker).join('; ')}`);
if (options.full) {
  options.start = 0;
  options.duration = Number(plan.renderedProgramDuration || plan.programDuration || 0);
}
if (!Number.isFinite(options.duration) || options.duration <= 0) fail('Invalid render duration.');
if (options.duration > 120 && !options.confirmLongRender && !options.dryRun) {
  fail('Long renders require --confirm-long-render. Use proof windows for quick checks.');
}

const proofStart = options.start;
const proofEnd = options.start + options.duration;
const videoSegments = (plan.videoSegments || []).filter((segment) => intersection(segment, proofStart, proofEnd));
const audioSegments = (plan.audioSegments || []).filter((segment) => intersection(segment, proofStart, proofEnd));
if (videoSegments.length === 0) fail(`No video segments overlap proof window ${fmt(proofStart)}-${fmt(proofEnd)}.`);

mkdirSync(dirname(outputPath), { recursive: true });

const args = ['-hide_banner', '-nostdin', '-y'];
let inputIndex = 0;
const filterParts = [];
const videoLabels = [];
const audioLabels = [];
const probeCache = new Map();
let cursor = proofStart;
let syntheticVideoIndex = 0;

function streamsFor(mediaPath) {
  if (skipAllStreamProbes || skipStreamProbeForFullRender) {
    return { audio: true, video: true, error: null, skipped: true };
  }
  if (!probeCache.has(mediaPath)) probeCache.set(mediaPath, ffprobeStreams(mediaPath));
  return probeCache.get(mediaPath);
}

for (const segment of videoSegments.sort((left, right) => left.outputStart - right.outputStart)) {
  const hit = intersection(segment, proofStart, proofEnd);
  if (!hit) continue;
  if (hit.start > cursor + 0.02) {
    const gapDuration = hit.start - cursor;
    const label = `vgap${syntheticVideoIndex++}`;
    filterParts.push(`color=c=black:s=${options.width}x${options.height}:r=${options.fps}:d=${fmt(gapDuration)}[${label}]`);
    videoLabels.push(label);
  }

  const localReadiness = localMediaReadiness(segment.mediaPath);
  if (!localReadiness.ok) fail(`Video source is not locally renderable (${localReadiness.reason}): ${localReadiness.message}`);
  const streams = streamsFor(segment.mediaPath);
  if (streams.error) fail(`Could not inspect video source streams: ${segment.mediaPath} (${streams.error})`);
  if (!streams.video) fail(`Video source has no video stream: ${segment.mediaPath}${streams.error ? ` (${streams.error})` : ''}`);
  const sourceStart = Number(segment.sourceStart || 0) + (hit.start - Number(segment.outputStart || 0));
  const input = addInput(args, segment.mediaPath, sourceStart, hit.duration);
  const label = `v${videoLabels.length}`;
  filterParts.push(videoFilterFor(input, label, segment));
  videoLabels.push(label);
  cursor = hit.end;
}

if (cursor < proofEnd - 0.02) {
  const label = `vgap${syntheticVideoIndex++}`;
  filterParts.push(`color=c=black:s=${options.width}x${options.height}:r=${options.fps}:d=${fmt(proofEnd - cursor)}[${label}]`);
  videoLabels.push(label);
}

if (videoLabels.length === 1) {
  filterParts.push(`[${videoLabels[0]}]null[vout]`);
} else {
  filterParts.push(`${videoLabels.map((label) => `[${label}]`).join('')}concat=n=${videoLabels.length}:v=1:a=0[vout]`);
}

for (const segment of audioSegments.sort((left, right) => left.outputStart - right.outputStart)) {
  const hit = intersection(segment, proofStart, proofEnd);
  if (!hit || !existsSync(segment.mediaPath)) continue;
  const localReadiness = localMediaReadiness(segment.mediaPath);
  if (!localReadiness.ok) fail(`Audio source is not locally renderable (${localReadiness.reason}): ${localReadiness.message}`);
  const streams = streamsFor(segment.mediaPath);
  if (streams.error) fail(`Could not inspect audio source streams: ${segment.mediaPath} (${streams.error})`);
  if (!streams.audio) continue;
  const sourceStart = Number(segment.sourceStart || 0) + (hit.start - Number(segment.outputStart || 0));
  const input = addInput(args, segment.mediaPath, sourceStart, hit.duration);
  const label = `a${audioLabels.length}`;
  const delayMs = Math.max(0, Math.round((hit.start - proofStart) * 1000));
  filterParts.push(`[${input}:a:0]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs}[${label}]`);
  audioLabels.push(label);
}

if (audioLabels.length === 0) {
  filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=${fmt(options.duration)}[aout]`);
} else if (audioLabels.length === 1) {
  filterParts.push(`[${audioLabels[0]}]atrim=0:${fmt(options.duration)},asetpts=PTS-STARTPTS[aout]`);
} else {
  filterParts.push(`${audioLabels.map((label) => `[${label}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,atrim=0:${fmt(options.duration)},asetpts=PTS-STARTPTS[aout]`);
}

const filterComplex = filterParts.join(';');
const useFilterComplexScript = options.full || filterComplex.length > 16000;
if (useFilterComplexScript) {
  writeFileSync(filterScriptPath, filterComplex);
  args.push('-filter_complex_script', filterScriptPath);
} else {
  args.push('-filter_complex', filterComplex);
}

args.push(
  '-map', '[vout]',
  '-map', '[aout]',
  '-t', fmt(options.duration),
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-crf', '30',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-movflags', '+faststart',
  outputPath,
);

const report = {
  schema: 'quipsly-mac-program-proof-render-v1',
  generatedAt: new Date().toISOString(),
  dryRun: options.dryRun,
  full: options.full,
  confirmedLongRender: options.confirmLongRender,
  projectSlug,
  episodeSlug,
  planPath,
  outputPath,
  proofStart,
  proofDuration: options.duration,
  dimensions: { width: options.width, height: options.height, fps: options.fps },
  videoFragments: videoLabels.length,
  audioFragments: audioLabels.length,
  motionFragments: videoSegments.filter((segment) => firstMotionKeyframe(segment)).length,
  ffmpeg,
  ffprobe,
  ffprobeTimeoutMs: Number(process.env.QUIPSLY_RENDER_FFPROBE_TIMEOUT_MS || (options.full ? 45000 : 8000)),
  streamProbeMode: skipAllStreamProbes ? 'path-only-env' : (skipStreamProbeForFullRender ? 'path-only-full-render' : 'ffprobe'),
  filterComplexMode: useFilterComplexScript ? 'script-file' : 'inline',
  filterComplexScriptPath: useFilterComplexScript ? filterScriptPath : null,
};

if (options.dryRun) {
  report.ok = true;
  report.commandPreview = [ffmpeg, ...args.slice(0, 40), args.length > 40 ? `... ${args.length - 40} more args` : ''].filter(Boolean);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const result = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
report.exitCode = result.status;
report.ok = result.status === 0 && existsSync(outputPath) && statSync(outputPath).size > 0;
report.outputBytes = existsSync(outputPath) ? statSync(outputPath).size : 0;
report.stderrTail = (result.stderr || '').split('\n').slice(-30).join('\n');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
