import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { calmError, classifyMediaToolError } from './LocalEngineErrors';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export type ProxyGenerationResult = {
  rawPath: string;
  proxyPath?: string;
  thumbnailPath?: string;
  durationSeconds?: number;
  kind: 'audio' | 'video' | 'unknown';
  fingerprint: string;
  cacheDir: string;
  warnings: string[];
  error?: string;
  errorCode?: string;
  errorDetail?: string;
  recoverable?: boolean;
};

function safeFilePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'media';
}

function parseDurationSeconds(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cacheRoot() {
  return process.env.QUIPSLY_MEDIA_CACHE_DIR
    || path.join(os.homedir(), 'Library', 'Caches', 'Quipsly', 'Media');
}

export async function fingerprintMediaSource(sourcePath: string) {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(sourcePath);
  } catch (error: any) {
    throw Object.assign(new Error('File not found. Choose the file again or reconnect the drive it lives on.'), {
      result: {
        rawPath: sourcePath,
        kind: 'unknown',
        fingerprint: '',
        cacheDir: '',
        warnings: [],
        ...calmError('missing-file', 'File not found. Choose the file again or reconnect the drive it lives on.', error?.message || sourcePath),
      } satisfies ProxyGenerationResult,
    });
  }
  const hash = crypto.createHash('sha256');
  hash.update(path.resolve(sourcePath));
  hash.update(String(stat.size));
  hash.update(String(stat.mtimeMs));
  return {
    fingerprint: hash.digest('hex').slice(0, 24),
    sizeBytes: stat.size,
  };
}

function probeDuration(sourcePath: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(sourcePath, (error, metadata) => {
      if (error) {
        resolve(undefined);
        return;
      }

      resolve(parseDurationSeconds(String(metadata.format?.duration ?? '')));
    });
  });
}

export class ProxyGenerator {
  public async generateProxyAndThumbnail(sourcePath: string): Promise<ProxyGenerationResult> {
    const absoluteSourcePath = path.resolve(sourcePath);
    const warnings: string[] = [];
    let fingerprint = '';
    try {
      fingerprint = (await fingerprintMediaSource(absoluteSourcePath)).fingerprint;
    } catch (error: any) {
      if (error?.result) return error.result;
      return {
        rawPath: absoluteSourcePath,
        kind: 'unknown',
        fingerprint: '',
        cacheDir: '',
        warnings,
        ...calmError('missing-file', 'File not found. Choose the file again or reconnect the drive it lives on.', error?.message || sourcePath),
      };
    }
    const ext = path.extname(absoluteSourcePath).toLowerCase();
    const baseName = safeFilePart(path.basename(absoluteSourcePath, ext));
    const outputDir = path.join(cacheRoot(), fingerprint);
    const proxyPath = path.join(outputDir, `${baseName}.proxy.mp4`);
    const thumbnailPath = path.join(outputDir, `${baseName}.thumb.jpg`);

    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (error: any) {
      return {
        rawPath: absoluteSourcePath,
        kind: 'unknown',
        fingerprint,
        cacheDir: outputDir,
        warnings,
        ...calmError('proxy-generation-failed', 'Quipsly could not create its media cache folder. Check disk permissions and free space, then retry.', error?.message),
      };
    }

    if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].includes(ext)) {
      warnings.push('Audio file detected. Quipsly did not generate a video proxy, but kept the raw path ready for timeline sync.');
      return {
        rawPath: absoluteSourcePath,
        durationSeconds: await probeDuration(absoluteSourcePath),
        kind: 'audio',
        fingerprint,
        cacheDir: outputDir,
        warnings,
      };
    }

    return new Promise((resolve, reject) => {
      let durationSeconds: number | undefined;

      ffmpeg.ffprobe(absoluteSourcePath, (probeError, metadata) => {
        if (probeError) {
          warnings.push(`ffprobe metadata was incomplete: ${probeError.message}`);
        } else {
          durationSeconds = parseDurationSeconds(String(metadata.format?.duration ?? ''));
        }

        // We use fluent-ffmpeg to take a screenshot at 1 second in, and then encode a lightweight 1080p proxy.
        console.log(`🎬 Generating thumbnail for ${absoluteSourcePath}...`);
        ffmpeg(absoluteSourcePath)
        .screenshots({
          timestamps: ['1'],
          filename: path.basename(thumbnailPath),
          folder: outputDir,
          size: '640x360'
        })
        .on('end', () => {
          console.log(`🎬 Generating proxy for ${absoluteSourcePath}...`);
          ffmpeg(absoluteSourcePath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .size('1920x1080')
            .outputOptions(['-preset ultrafast', '-crf 28'])
            .save(proxyPath)
            .on('end', () => {
              console.log(`✅ Proxy generated: ${proxyPath}`);
              resolve({
                rawPath: absoluteSourcePath,
                proxyPath,
                thumbnailPath,
                durationSeconds,
                kind: 'video',
                fingerprint,
                cacheDir: outputDir,
                warnings,
              });
            })
            .on('error', (err) => {
              const calm = classifyMediaToolError(err, 'proxy-generation-failed');
              console.error(`❌ Proxy generation error: ${err.message}`);
              reject(Object.assign(err, {
                result: {
                  rawPath: absoluteSourcePath,
                  thumbnailPath,
                  durationSeconds,
                  kind: 'video',
                  fingerprint,
                  cacheDir: outputDir,
                  warnings,
                  ...calm,
                } satisfies ProxyGenerationResult,
              }));
            });
        })
        .on('error', (err) => {
          const calm = classifyMediaToolError(err, 'proxy-generation-failed');
          console.error(`❌ Thumbnail generation error: ${err.message}`);
          reject(Object.assign(err, {
            result: {
              rawPath: absoluteSourcePath,
              durationSeconds,
              kind: 'video',
              fingerprint,
              cacheDir: outputDir,
              warnings,
              ...calm,
            } satisfies ProxyGenerationResult,
          }));
        });
      });
    });
  }
}
