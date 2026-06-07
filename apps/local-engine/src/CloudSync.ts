import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { configuredMediaBucketName } from './MediaVaultConfig';

export class CloudSyncDaemon {
  private ingestDir: string;
  private isSyncing: boolean = false;

  constructor(ingestDir: string) {
    this.ingestDir = ingestDir;
    if (!fs.existsSync(this.ingestDir)) {
      fs.mkdirSync(this.ingestDir, { recursive: true });
    }
  }

  private realCloudVault: any[] = [];
  private lastVaultFetch: number = 0;

  private fetchCloudVault() {
    const now = Date.now();
    if (now - this.lastVaultFetch < 10000) return; // Cache for 10 seconds
    this.lastVaultFetch = now;

    try {
      const { Storage } = require('@google-cloud/storage');
      const { OAuth2Client } = require('google-auth-library');
      const { execSync } = require('child_process');
      const token = execSync('gcloud auth print-access-token').toString().trim();
      const authClient = new OAuth2Client();
      authClient.setCredentials({ access_token: token });

      const storage = new Storage({ projectId: 'high-ground-odyssey', authClient });
      const bucket = storage.bucket(configuredMediaBucketName());

      bucket.getFiles().then(([files]: any) => {
         this.realCloudVault = files.map((f: any) => {
            const meta = f.metadata;
            let hexMd5 = undefined;
            if (meta.md5Hash) {
               hexMd5 = Buffer.from(meta.md5Hash, 'base64').toString('hex');
            }
            return {
               filename: f.name,
               sizeMb: (parseInt(meta.size || '0') / (1024 * 1024)).toFixed(2),
               date: meta.timeCreated,
               md5: hexMd5
            };
         });
      }).catch((err: any) => console.error("GCS Fetch Error:", err));
    } catch (e) {
      console.error("GCS Initialization Error:", e);
    }
  }

  public getStatus() {
    this.fetchCloudVault();
    return {
      isSyncing: this.isSyncing,
      pendingFiles: this.scanLocalFiles(),
      cloudVault: this.realCloudVault
    };
  }

  private scanLocalFiles() {
    try {
      const files = fs.readdirSync(this.ingestDir);
      return files.map(file => {
        const stats = fs.statSync(path.join(this.ingestDir, file));
        return {
          filename: file,
          sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
          status: 'PENDING',
          safeToDelete: false
        };
      });
    } catch (err) {
      return [];
    }
  }

  public async triggerSync(onProgress?: (progress: number) => void) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    console.warn("CloudSyncDaemon legacy trigger is disabled. Use Mac Import to Episode for real upload/register work.");
    if (onProgress) onProgress(0);
    this.isSyncing = false;
  }
}
