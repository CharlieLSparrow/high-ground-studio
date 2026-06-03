import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export class ProxyGenerator {
  public async generateProxyAndThumbnail(sourcePath: string): Promise<{ proxyPath: string, thumbnailPath: string }> {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(sourcePath);
      const ext = path.extname(sourcePath);
      const baseName = path.basename(sourcePath, ext);
      
      const proxyPath = path.join(dir, `${baseName}_proxy.mp4`);
      const thumbnailPath = path.join(dir, `${baseName}_thumb.png`);

      // We use fluent-ffmpeg to take a screenshot at 1 second in, and then encode a 1080p proxy.
      console.log(`🎬 Generating thumbnail for ${sourcePath}...`);
      ffmpeg(sourcePath)
        .screenshots({
          timestamps: ['1'],
          filename: path.basename(thumbnailPath),
          folder: dir,
          size: '640x360'
        })
        .on('end', () => {
          console.log(`🎬 Generating proxy for ${sourcePath}...`);
          ffmpeg(sourcePath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .size('1920x1080')
            .outputOptions(['-preset ultrafast', '-crf 28'])
            .save(proxyPath)
            .on('end', () => {
              console.log(`✅ Proxy generated: ${proxyPath}`);
              resolve({ proxyPath, thumbnailPath });
            })
            .on('error', (err) => {
              console.error(`❌ Proxy generation error: ${err.message}`);
              reject(err);
            });
        })
        .on('error', (err) => {
          console.error(`❌ Thumbnail generation error: ${err.message}`);
          reject(err);
        });
    });
  }
}
