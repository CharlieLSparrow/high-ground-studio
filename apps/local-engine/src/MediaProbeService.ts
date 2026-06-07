import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { calmError, classifyMediaToolError } from './LocalEngineErrors';

export type MediaProbeStream = {
  index: number;
  kind: string;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;
  channels?: number;
};

export type MediaProbeResult = {
  ok: boolean;
  source: 'ffprobe' | 'ffmpeg-fallback' | 'safe-error';
  path: string;
  durationSeconds?: number;
  formatName?: string;
  sizeBytes?: number;
  bitrate?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  streams: MediaProbeStream[];
  warnings: string[];
  error?: string;
  errorCode?: string;
  errorDetail?: string;
  recoverable?: boolean;
};

type ExecResult = {
  stdout: string;
  stderr: string;
};

function execFileSafe(command: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30000, maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function fileKind(filePath: string): Promise<'file' | 'directory' | 'missing'> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return 'directory';
    if (stat.isFile()) return 'file';
    return 'missing';
  } catch {
    return 'missing';
  }
}

function parseNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFps(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim() || value === '0/0') return undefined;

  const [rawNumerator, rawDenominator] = value.split('/');
  const numerator = Number(rawNumerator);
  const denominator = Number(rawDenominator ?? '1');

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return undefined;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function normalizeProbeStream(stream: Record<string, unknown>, index: number): MediaProbeStream {
  return {
    index: parseNumber(stream.index) ?? index,
    kind: String(stream.codec_type ?? 'unknown'),
    codec: typeof stream.codec_name === 'string' ? stream.codec_name : undefined,
    width: parseNumber(stream.width),
    height: parseNumber(stream.height),
    fps: parseFps(stream.avg_frame_rate) ?? parseFps(stream.r_frame_rate),
    sampleRate: parseNumber(stream.sample_rate),
    channels: parseNumber(stream.channels),
  };
}

function ffprobeCandidates() {
  const candidates = new Set<string>();
  if (process.env.FFPROBE_PATH) candidates.add(process.env.FFPROBE_PATH);

  const ffmpegDir = path.dirname(ffmpegInstaller.path);
  candidates.add(path.join(ffmpegDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'));
  candidates.add('ffprobe');

  return Array.from(candidates);
}

async function runFfprobe(filePath: string): Promise<MediaProbeResult> {
  let lastError = '';

  for (const command of ffprobeCandidates()) {
    try {
      const { stdout } = await execFileSafe(command, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);

      const parsed = JSON.parse(stdout) as {
        streams?: Array<Record<string, unknown>>;
        format?: Record<string, unknown>;
      };
      const streams = (parsed.streams ?? []).map(normalizeProbeStream);
      const hasAudio = streams.some((stream) => stream.kind === 'audio');
      const hasVideo = streams.some((stream) => stream.kind === 'video');

      return {
        ok: true,
        source: 'ffprobe',
        path: filePath,
        durationSeconds: parseNumber(parsed.format?.duration),
        formatName: typeof parsed.format?.format_name === 'string' ? parsed.format.format_name : undefined,
        sizeBytes: parseNumber(parsed.format?.size),
        bitrate: parseNumber(parsed.format?.bit_rate),
        hasAudio,
        hasVideo,
        streams,
        warnings: [],
      };
    } catch (error: any) {
      lastError = String(error?.stderr || error?.message || error);
    }
  }

  throw new Error(lastError || 'ffprobe is not available.');
}

function parseFfmpegFallback(output: string, filePath: string): MediaProbeResult {
  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(output);
  const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : undefined;

  const streams: MediaProbeStream[] = [];
  const streamLines = output.split('\n').filter((line) => line.includes('Stream #'));

  streamLines.forEach((line, index) => {
    const isVideo = /\bVideo:\s*([^,\s]+)/.exec(line);
    const isAudio = /\bAudio:\s*([^,\s]+)/.exec(line);
    const sizeMatch = /,\s*(\d{2,5})x(\d{2,5})/.exec(line);
    const fpsMatch = /,\s*([\d.]+)\s*fps/.exec(line);
    const sampleRateMatch = /,\s*(\d+)\s*Hz/.exec(line);

    if (isVideo || isAudio) {
      streams.push({
        index,
        kind: isVideo ? 'video' : 'audio',
        codec: isVideo?.[1] ?? isAudio?.[1],
        width: sizeMatch ? Number(sizeMatch[1]) : undefined,
        height: sizeMatch ? Number(sizeMatch[2]) : undefined,
        fps: fpsMatch ? Number(fpsMatch[1]) : undefined,
        sampleRate: sampleRateMatch ? Number(sampleRateMatch[1]) : undefined,
      });
    }
  });

  return {
    ok: streams.length > 0 || durationSeconds != null,
    source: 'ffmpeg-fallback',
    path: filePath,
    durationSeconds,
    hasAudio: streams.some((stream) => stream.kind === 'audio'),
    hasVideo: streams.some((stream) => stream.kind === 'video'),
    streams,
    warnings: ['ffprobe was unavailable, so Quipsly used ffmpeg stderr parsing. Metadata may be incomplete.'],
    error: streams.length > 0 || durationSeconds != null ? undefined : 'Could not read media metadata from ffmpeg output.',
  };
}

async function runFfmpegFallback(filePath: string): Promise<MediaProbeResult> {
  try {
    await execFileSafe(ffmpegInstaller.path, ['-hide_banner', '-i', filePath]);
    return {
      ok: false,
      source: 'ffmpeg-fallback',
      path: filePath,
      hasAudio: false,
      hasVideo: false,
      streams: [],
      warnings: ['ffmpeg returned without metadata output.'],
      error: 'Could not read media metadata.',
    };
  } catch (error: any) {
    const output = String(error?.stderr || error?.stdout || error?.message || '');
    return parseFfmpegFallback(output, filePath);
  }
}

export async function probeMediaFile(filePath: string): Promise<MediaProbeResult> {
  const kind = await fileKind(filePath);

  if (kind === 'missing') {
    return {
      ok: false,
      source: 'safe-error',
      path: filePath,
      hasAudio: false,
      hasVideo: false,
      streams: [],
      warnings: [],
      ...calmError('missing-file', 'File not found. Choose the file again or reconnect the drive it lives on.', filePath),
    };
  }

  if (kind === 'directory') {
    return {
      ok: false,
      source: 'safe-error',
      path: filePath,
      hasAudio: false,
      hasVideo: false,
      streams: [],
      warnings: ['Folder import is queued. Per-file probing will run when folder expansion is implemented.'],
      ...calmError('selected-folder', 'Selected item is a folder. Folder expansion is not ready in this path yet, so this import was held safely.', filePath),
    };
  }

  try {
    return await runFfprobe(filePath);
  } catch (probeError) {
    const fallback = await runFfmpegFallback(filePath);
    if (fallback.ok) return fallback;
    return {
      ...fallback,
      ...classifyMediaToolError(probeError, 'media-probe-failed'),
      warnings: [
        ...fallback.warnings,
        'ffprobe failed and ffmpeg fallback did not produce usable metadata.',
      ],
    };
  }
}
