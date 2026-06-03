import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export class AutoCropper {
  /**
   * Slices a 16:9 landscape video into a 9:16 vertical video by cropping the center.
   */
  public async sliceToVertical(sourcePath: string, onProgress: (progress: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(sourcePath)) {
        return reject(new Error(`Source file not found: ${sourcePath}`));
      }

      const ext = path.extname(sourcePath);
      const baseName = path.basename(sourcePath, ext);
      const outputDir = path.dirname(sourcePath);
      const outputPath = path.join(outputDir, `${baseName}_vertical${ext}`);

      console.log(`🎬 Slicing to vertical: ${sourcePath} -> ${outputPath}`);

      ffmpeg(sourcePath)
        // crop=w:h:x:y
        // w = ih*9/16, h = ih, x = (iw-ow)/2, y = 0
        .videoFilters('crop=ih*9/16:ih')
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          '-c:a copy'
        ])
        .on('progress', (progress) => {
          if (progress.percent) {
            onProgress(Math.floor(progress.percent));
          }
        })
        .on('end', () => {
          console.log(`✅ Vertical slice complete: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error(`❌ FFMPEG Error: ${err.message}`);
          reject(err);
        })
        .save(outputPath);
    });
  }
}
