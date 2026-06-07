import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { Storage } from "@google-cloud/storage";
import path from "node:path";
import fs from "node:fs/promises";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const BUCKET_NAME = "high-ground-raw-footage";

// Use the local GCS key from the engine
const storage = new Storage({
  keyFilename: path.resolve(__dirname, "../../gcs-key.json")
});

async function generateProxy(inputPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[Transcode] Starting 1080p proxy generation for ${path.basename(inputPath)}`);
    ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264",
        "-preset fast",
        "-crf 28",
        "-vf scale=-2:1080", // Scale to 1080p height
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart" // Optimize for web streaming
      ])
      .on("progress", (progress) => {
        if (progress.percent) {
           process.stdout.write(`\r[Transcode] ${progress.percent.toFixed(1)}% complete`);
        }
      })
      .on("end", () => {
        console.log(`\n[Transcode] Successfully generated proxy: ${path.basename(outputPath)}`);
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.error(`\n[Transcode] Error generating proxy for ${inputPath}:`, err.message);
        reject(err);
      })
      .save(outputPath);
  });
}

async function uploadToGcs(localPath: string, destinationObject: string) {
  console.log(`[Upload] Uploading ${path.basename(localPath)} to gs://${BUCKET_NAME}/${destinationObject}...`);
  const bucket = storage.bucket(BUCKET_NAME);

  await bucket.upload(localPath, {
    destination: destinationObject,
    resumable: true,
  });
  console.log(`[Upload] Completed upload of ${destinationObject}`);
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: pnpm ts-node process-media.ts <path-to-.insv>");
    process.exit(1);
  }

  const basename = path.basename(inputPath);
  const ext = path.extname(inputPath);

  if (ext.toLowerCase() !== ".insv") {
    console.warn(`[Warning] Provided file is not an .insv (${basename}). Processing anyway.`);
  }

  const proxyFileName = basename.replace(new RegExp(`${ext}$`, 'i'), '_proxy.mp4');
  const proxyPath = path.join(path.dirname(inputPath), proxyFileName);

  try {
    // 1. Generate the 1080p Web Proxy locally
    await generateProxy(inputPath, proxyPath);

    // 2. Upload the original RAW .insv
    await uploadToGcs(inputPath, basename);

    // 3. Upload the proxy MP4
    await uploadToGcs(proxyPath, `proxies/${proxyFileName}`);

    console.log(`[Success] Finished processing ${basename}`);

    // Optional: Clean up the local proxy if we don't want to keep it on the drive
    // await fs.unlink(proxyPath);

  } catch (error) {
    console.error("[Fatal Error] Failed to process media:", error);
    process.exit(1);
  }
}

main();
