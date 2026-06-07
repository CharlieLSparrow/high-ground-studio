import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { configuredMediaBucketName } from "./MediaVaultConfig";

const gcsStorage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "high-ground-odyssey",
});

const GCS_BUCKET_NAME = configuredMediaBucketName();

export type IngestJob = {
  id: string;
  filename: string;
  status: "pending" | "proxy_generating" | "uploading_raw" | "completed" | "error";
  proxyProgress: number;
  uploadProgress: number;
  isPackage?: boolean;
  sourceFiles?: string[];
  sourceGroupId?: string;
  error?: string;
};

export class IngestService {
  private jobs: IngestJob[] = [];
  public onProgress?: (jobs: IngestJob[]) => void;

  public getJobs() {
    return this.jobs;
  }

  private updateJob(id: string, updates: Partial<IngestJob>) {
    this.jobs = this.jobs.map(job => job.id === id ? { ...job, ...updates } : job);
    if (this.onProgress) this.onProgress(this.jobs);
  }

  public async startSmartIngest(sourceDir: string) {
    console.log(`🚀 IngestService: Starting Smart Ingest from ${sourceDir}`);

    // 1. Scan SD Card
    let files: string[] = [];
    try {
      files = await fs.readdir(sourceDir);
    } catch (err: any) {
      console.error(`❌ IngestService Error: Could not read ${sourceDir} - ${err.message}`);
      return;
    }

    const videoFiles = files.filter(f => f.toUpperCase().endsWith(".MP4") || f.toUpperCase().endsWith(".INSV") || f.toUpperCase().endsWith(".LRV"));

    // 2. Package Grouper
    const packages = new Map<string, string[]>();
    const standardFiles: string[] = [];

    videoFiles.forEach(f => {
      // Look for standard Insta360 naming: VID_YYYYMMDD_HHMMSS_00_XXX.insv
      const insta360Match = f.match(/^(?:VID|LRV)_(\d{8}_\d{6})_\d{2}_(.*)\.(insv|lrv)$/i);

      if (insta360Match) {
        const timestampId = insta360Match[1]; // e.g. 20230101_120000
        if (!packages.has(timestampId)) {
          packages.set(timestampId, []);
        }
        packages.get(timestampId)?.push(f);
      } else if (f.toUpperCase().endsWith(".MP4")) {
        standardFiles.push(f);
      }
    });

    // Initialize Jobs
    this.jobs = [];
    let jobIdCounter = 0;

    // Add Insta360 Packages as jobs
    for (const [timestampId, packageFiles] of packages.entries()) {
      this.jobs.push({
        id: `job_${jobIdCounter++}`,
        filename: `Insta360_Package_${timestampId}`, // Treat the whole package as one job
        status: "pending",
        proxyProgress: 0,
        uploadProgress: 0,
        isPackage: true,
        sourceFiles: packageFiles,
        sourceGroupId: timestampId
      });
    }

    // Add Standard MP4s as jobs
    for (const file of standardFiles) {
      this.jobs.push({
        id: `job_${jobIdCounter++}`,
        filename: file,
        status: "pending",
        proxyProgress: 0,
        uploadProgress: 0,
        isPackage: false
      });
    }

    if (this.onProgress) this.onProgress(this.jobs);

    const PROXY_TARGET_DIR = path.join(
      process.env.QUIPSLY_MEDIA_CACHE_DIR || path.join(process.env.HOME || process.cwd(), "Library", "Caches", "Quipsly", "LegacyIngest"),
      "proxies",
    );
    await fs.mkdir(PROXY_TARGET_DIR, { recursive: true });

    // 3. Process Jobs (Queue processing)
    for (const job of this.jobs) {
      this.updateJob(job.id, { status: "proxy_generating" });

      try {
        if (job.isPackage) {
          // --- INSTA360 PACKAGE MIGRATION ---
          console.log(`[Insta360] Processing Package: ${job.filename}`);

          this.updateJob(job.id, { proxyProgress: 100, status: "uploading_raw" });

          try {
            const bucket = gcsStorage.bucket(GCS_BUCKET_NAME);
            let uploadedCount = 0;
            const packageFiles = job.sourceFiles || [];
            const sourceGroupId = job.sourceGroupId || job.id;

            if (!packageFiles.length) {
              throw new Error("No package files were found for this Insta360 ingest job.");
            }

            for (const file of packageFiles) {
               const filePath = path.join(sourceDir, file);
               const destinationPath = `media-vault/raw/unassigned/local-ingest/${sourceGroupId}/${file}`;

               console.log(`[Insta360] ☁️ Uploading ${file} to gs://${GCS_BUCKET_NAME}/${destinationPath}...`);
               await bucket.upload(filePath, {
                 destination: destinationPath,
                 resumable: true,
                 metadata: { cacheControl: "private, max-age=3600" },
               });

               uploadedCount++;
               this.updateJob(job.id, { uploadProgress: Math.floor((uploadedCount / packageFiles.length) * 100) });
            }
          } catch(e: any) {
            console.error(`[Insta360] GCS Upload Error: ${e.message}`);
            this.updateJob(job.id, { status: "error", uploadProgress: 0, error: e.message });
            continue; // Skip to next job on error
          }

        } else {
          // --- STANDARD CAMERA FILE (REAL FFMPEG PROCESS) ---
          const sourcePath = path.join(sourceDir, job.filename);
          const proxyPath = path.join(PROXY_TARGET_DIR, job.filename.replace(/\.[^/.]+$/, "") + "_proxy.mp4");

          console.log(`[Camera] Generating standard proxy at ${proxyPath}...`);

          // Use spawn instead of exec for durability and streaming stderr
          await new Promise<void>((resolve, reject) => {
            const { spawn } = require('node:child_process');
            const ffmpeg = spawn('ffmpeg', [
              '-y', '-i', sourcePath,
              '-c:v', 'h264_videotoolbox', '-vf', 'scale=-2:720', '-b:v', '2M',
              '-c:a', 'aac', '-b:a', '128k',
              proxyPath
            ]);

            ffmpeg.stderr.on('data', (data: Buffer) => {
              // Parse time=HH:MM:SS.ms to estimate progress
              const str = data.toString();
              const timeMatch = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
              if (timeMatch) {
                 // Simplistic progress simulation since total duration requires ffprobe
                 this.updateJob(job.id, { proxyProgress: Math.min(99, this.jobs.find(j => j.id === job.id)!.proxyProgress + 5) });
              }
            });

            ffmpeg.on('close', (code: number) => {
              if (code === 0) {
                this.updateJob(job.id, { proxyProgress: 100 });
                resolve();
              } else {
                console.error(`❌ FFmpeg failed with exit code ${code}`);
                reject(new Error(`FFmpeg failed with exit code ${code}`));
              }
            });

            ffmpeg.on('error', (err: any) => {
               console.error(`❌ Failed to spawn FFmpeg: ${err.message}`);
               reject(err);
            });
          });

          this.updateJob(job.id, { status: "uploading_raw" });
          const bucket = gcsStorage.bucket(GCS_BUCKET_NAME);
          const rawObjectName = `media-vault/raw/unassigned/local-ingest/${job.id}/${job.filename}`;
          const proxyObjectName = `media-vault/proxy/unassigned/local-ingest/${job.id}/${path.basename(proxyPath)}`;
          await bucket.upload(sourcePath, {
            destination: rawObjectName,
            resumable: true,
            metadata: { cacheControl: "private, max-age=3600" },
          });
          this.updateJob(job.id, { uploadProgress: 50 });
          await bucket.upload(proxyPath, {
            destination: proxyObjectName,
            resumable: true,
            metadata: { cacheControl: "private, max-age=3600" },
          });
          this.updateJob(job.id, { uploadProgress: 100 });
        }

        this.updateJob(job.id, { uploadProgress: 100, status: "completed" });
      } catch (globalError: any) {
         console.error(`❌ Job Processing Error for ${job.filename}: ${globalError.message}`);
         this.updateJob(job.id, { status: "error", error: globalError.message });
      }
    }
  }
}
