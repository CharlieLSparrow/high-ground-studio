import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import type { LocalEngineCapabilities } from './FeatureRegistry';

export type VisionLabJob = {
  id: string;
  type: 'dataset-scan' | 'annotation-review' | 'training' | 'prediction';
  status: 'idle' | 'queued' | 'running' | 'complete' | 'failed';
  label: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
};

export type VisionDatasetFileKind = 'image' | 'video' | 'metadata' | 'other';

export type VisionDatasetManifestFile = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  kind: VisionDatasetFileKind;
  sizeBytes: number;
  modifiedAt: string;
  quickFingerprint: string;
  contentSha256?: string;
};

export type VisionDatasetManifest = {
  id: string;
  datasetName: string;
  rootPath: string;
  savedManifestPath?: string;
  createdAt: string;
  fileCount: number;
  imageCount: number;
  videoCount: number;
  metadataCount: number;
  otherCount: number;
  totalBytes: number;
  files: VisionDatasetManifestFile[];
  extensionCounts: Record<string, number>;
  safety: {
    movedFiles: false;
    renamedFiles: false;
    uploadedFiles: false;
    contentHashesComputed: boolean;
    note: string;
  };
  warnings: string[];
};

export type VisionDatasetManifestSummary = {
  id: string;
  datasetName: string;
  rootPath: string;
  savedManifestPath?: string;
  createdAt: string;
  fileCount: number;
  imageCount: number;
  videoCount: number;
  totalBytes: number;
};

export type VisionLabStatus = {
  enabled: boolean;
  workflow: 'marine-biology-identification';
  activeDatasetName: string | null;
  activeDatasetPath: string | null;
  datasetCount: number;
  imageCount: number;
  annotationCount: number;
  trainingJobCount: number;
  manifest: VisionDatasetManifest | null;
  jobs: VisionLabJob[];
  suggestedRoots: string[];
  nextActions: string[];
  notes: string[];
};

export class VisionLabService {
  private activeDatasetPath: string | null = null;
  private manifest: VisionDatasetManifest | null = null;
  private jobs: VisionLabJob[] = [];

  constructor(private readonly capabilities: LocalEngineCapabilities) {}

  registerDataset(folderPath: string): VisionLabStatus {
    this.activeDatasetPath = folderPath;
    this.manifest = null;
    return this.getStatus();
  }

  async buildManifest(folderPath?: string): Promise<VisionLabStatus> {
    if (folderPath) {
      this.activeDatasetPath = folderPath;
    }

    if (!this.activeDatasetPath) {
      const failedJob: VisionLabJob = {
        id: `dataset-scan-${Date.now()}`,
        type: 'dataset-scan',
        status: 'failed',
        label: 'Build dataset manifest',
        completedAt: new Date().toISOString(),
        summary: 'No dataset folder selected.',
      };

      this.jobs = [
        failedJob,
        ...this.jobs,
      ].slice(0, 10);
      return this.getStatus();
    }

    const startedAt = new Date().toISOString();
    const jobId = `dataset-scan-${Date.now()}`;
    const runningJob: VisionLabJob = {
      id: jobId,
      type: 'dataset-scan',
      status: 'running',
      label: 'Build dataset manifest',
      startedAt,
      summary: `Scanning ${this.activeDatasetPath}`,
    };

    this.jobs = [
      runningJob,
      ...this.jobs,
    ].slice(0, 10);

    try {
      this.manifest = await this.scanFolder(this.activeDatasetPath);
      const completedAt = new Date().toISOString();
      this.jobs = this.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: 'complete',
              completedAt,
              summary: `Found ${this.manifest?.fileCount ?? 0} files and saved the manifest without moving or renaming anything.`,
            }
          : job
      );
    } catch (error: any) {
      const completedAt = new Date().toISOString();
      this.jobs = this.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: 'failed',
              completedAt,
              summary: error?.message ?? 'Failed to scan dataset folder.',
            }
          : job
      );
    }

    return this.getStatus();
  }

  async computeContentHashes(): Promise<VisionLabStatus> {
    if (!this.manifest) {
      const failedJob: VisionLabJob = {
        id: `content-hash-${Date.now()}`,
        type: 'dataset-scan',
        status: 'failed',
        label: 'Compute full content hashes',
        completedAt: new Date().toISOString(),
        summary: 'Build a dataset manifest before computing full hashes.',
      };
      this.jobs = [failedJob, ...this.jobs].slice(0, 10);
      return this.getStatus();
    }

    const jobId = `content-hash-${Date.now()}`;
    const runningJob: VisionLabJob = {
      id: jobId,
      type: 'dataset-scan',
      status: 'running',
      label: 'Compute full content hashes',
      startedAt: new Date().toISOString(),
      summary: `Hashing ${this.manifest.fileCount} files. This can take a while for large datasets.`,
    };
    this.jobs = [runningJob, ...this.jobs].slice(0, 10);

    try {
      const hashedFiles: VisionDatasetManifestFile[] = [];

      for (const file of this.manifest.files) {
        hashedFiles.push({
          ...file,
          contentSha256: await this.hashFile(file.path),
        });
      }

      this.manifest = {
        ...this.manifest,
        files: hashedFiles,
        safety: {
          ...this.manifest.safety,
          contentHashesComputed: true,
          note: 'Manifest scan plus full SHA-256 content hashes. No files were moved, renamed, uploaded, or used for training.',
        },
      };
      this.manifest.savedManifestPath = await this.persistManifest(this.manifest);

      this.jobs = this.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: 'complete',
              completedAt: new Date().toISOString(),
              summary: `Computed full SHA-256 hashes for ${this.manifest?.fileCount ?? 0} files.`,
            }
          : job
      );
    } catch (error: any) {
      this.jobs = this.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: 'failed',
              completedAt: new Date().toISOString(),
              summary: error?.message ?? 'Failed to compute content hashes.',
            }
          : job
      );
    }

    return this.getStatus();
  }

  async listSavedManifests(): Promise<VisionDatasetManifestSummary[]> {
    const manifestsDir = this.manifestsDir();

    try {
      const entries = await fs.readdir(manifestsDir, { withFileTypes: true });
      const manifests: VisionDatasetManifestSummary[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

        const manifestPath = path.join(manifestsDir, entry.name);
        try {
          const raw = await fs.readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(raw) as VisionDatasetManifest;
          manifests.push({
            id: manifest.id,
            datasetName: manifest.datasetName,
            rootPath: manifest.rootPath,
            savedManifestPath: manifest.savedManifestPath ?? manifestPath,
            createdAt: manifest.createdAt,
            fileCount: manifest.fileCount,
            imageCount: manifest.imageCount,
            videoCount: manifest.videoCount,
            totalBytes: manifest.totalBytes,
          });
        } catch {
          // Ignore malformed local manifests. Future UI can expose repair tools.
        }
      }

      return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    } catch {
      return [];
    }
  }

  getStatus(): VisionLabStatus {
    const home = os.homedir();
    const activeDatasetName = this.activeDatasetPath ? path.basename(this.activeDatasetPath) : null;

    return {
      enabled: this.capabilities.visionLab,
      workflow: 'marine-biology-identification',
      activeDatasetName,
      activeDatasetPath: this.activeDatasetPath,
      datasetCount: this.activeDatasetPath ? 1 : 0,
      imageCount: this.manifest?.imageCount ?? 0,
      annotationCount: 0,
      trainingJobCount: 0,
      manifest: this.manifest,
      jobs: this.jobs,
      suggestedRoots: [
        path.join(home, 'Pictures'),
        path.join(home, 'Downloads'),
        path.join(home, 'Desktop'),
      ],
      nextActions: this.capabilities.visionLab
        ? this.activeDatasetPath
          ? [
              this.manifest ? 'Review the dataset manifest.' : 'Create a dataset manifest before moving files.',
              'Review species or individual tags before any training run.',
              'Keep original files untouched until the manifest is inspectable.',
            ]
          : [
              'Choose a local research photo folder.',
              'Create a dataset manifest before moving files.',
              'Review species or individual tags before any training run.',
            ]
        : [
            'Enable QUIPSLY_ENABLE_VISION_LAB=1 for local research workflows.',
          ],
      notes: [
        this.manifest
          ? 'A manifest exists for this session. It uses quick file fingerprints, not full content hashes yet.'
          : 'This first pass is a native dashboard contract, not a training pipeline yet.',
        'Training will stay opt-in and local-first so research data does not leave the machine by accident.',
      ],
    };
  }

  private async scanFolder(rootPath: string): Promise<VisionDatasetManifest> {
    const maxFiles = 5000;
    const files: VisionDatasetManifestFile[] = [];
    const warnings: string[] = [];

    const visit = async (folder: string) => {
      if (files.length >= maxFiles) return;

      const entries = await fs.readdir(folder, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= maxFiles) {
          warnings.push(`Scan stopped at ${maxFiles} files. Narrow the folder or raise the scan cap for very large datasets.`);
          return;
        }

        if (entry.name === '.DS_Store' || entry.name === 'node_modules') continue;

        const fullPath = path.join(folder, entry.name);

        if (entry.isDirectory()) {
          await visit(fullPath);
          continue;
        }

        if (!entry.isFile()) continue;

        const stats = await fs.stat(fullPath);
        const relativePath = path.relative(rootPath, fullPath);
        const extension = path.extname(entry.name).replace('.', '').toLowerCase() || 'none';
        const kind = this.kindForExtension(extension);
        const modifiedAt = stats.mtime.toISOString();
        const quickFingerprint = crypto
          .createHash('sha256')
          .update(`${relativePath}:${stats.size}:${Math.round(stats.mtimeMs)}`)
          .digest('hex')
          .slice(0, 24);

        files.push({
          id: quickFingerprint,
          name: entry.name,
          path: fullPath,
          relativePath,
          extension,
          kind,
          sizeBytes: stats.size,
          modifiedAt,
          quickFingerprint,
        });
      }
    };

    await visit(rootPath);

    const extensionCounts: Record<string, number> = {};
    let imageCount = 0;
    let videoCount = 0;
    let metadataCount = 0;
    let otherCount = 0;
    let totalBytes = 0;

    for (const file of files) {
      extensionCounts[file.extension] = (extensionCounts[file.extension] ?? 0) + 1;
      totalBytes += file.sizeBytes;
      if (file.kind === 'image') imageCount += 1;
      else if (file.kind === 'video') videoCount += 1;
      else if (file.kind === 'metadata') metadataCount += 1;
      else otherCount += 1;
    }

    const createdAt = new Date().toISOString();
    const datasetName = path.basename(rootPath);
    const id = crypto
      .createHash('sha256')
      .update(`${rootPath}:${createdAt}:${files.length}`)
      .digest('hex')
      .slice(0, 16);

    const manifest: VisionDatasetManifest = {
      id,
      datasetName,
      rootPath,
      createdAt,
      fileCount: files.length,
      imageCount,
      videoCount,
      metadataCount,
      otherCount,
      totalBytes,
      files,
      extensionCounts,
      safety: {
        movedFiles: false,
        renamedFiles: false,
        uploadedFiles: false,
        contentHashesComputed: false,
        note: 'Manifest scan only. No files were moved, renamed, uploaded, or used for training.',
      },
      warnings,
    };

    manifest.savedManifestPath = await this.persistManifest(manifest);
    return manifest;
  }

  private async persistManifest(manifest: VisionDatasetManifest): Promise<string> {
    const manifestsDir = this.manifestsDir();
    await fs.mkdir(manifestsDir, { recursive: true });

    const safeDatasetName = manifest.datasetName
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'dataset';
    const manifestPath = path.join(manifestsDir, `${safeDatasetName}-${manifest.id}.json`);

    await fs.writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, savedManifestPath: manifestPath }, null, 2),
      'utf8'
    );

    return manifestPath;
  }

  private manifestsDir(): string {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Quipsly', 'VisionLab', 'manifests');
  }

  private hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private kindForExtension(extension: string): VisionDatasetFileKind {
    if (['jpg', 'jpeg', 'png', 'heic', 'heif', 'tif', 'tiff', 'webp', 'gif', 'dng', 'cr2', 'nef', 'arw', 'raw'].includes(extension)) {
      return 'image';
    }

    if (['mov', 'mp4', 'm4v', 'avi', 'mkv', 'insv'].includes(extension)) {
      return 'video';
    }

    if (['json', 'csv', 'tsv', 'txt', 'xmp', 'xml', 'yaml', 'yml'].includes(extension)) {
      return 'metadata';
    }

    return 'other';
  }
}
