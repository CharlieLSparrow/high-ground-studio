import fs from "fs/promises";
import path from "path";

/**
 * StorageAdapter abstracts file uploads.
 * Currently uses LocalStorageProvider for speed, but can easily be swapped
 * for an GCSStorageProvider when moving to production, preventing technical debt.
 */
export interface StorageProvider {
  uploadFile(filename: string, buffer: Buffer, mimeType: string): Promise<string>;
}

export class LocalStorageProvider implements StorageProvider {
  async uploadFile(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
    const uploadsDir = path.join(process.cwd(), "public/uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, buffer);

    return `/uploads/${filename}`;
  }
}

export class GCSStorageProvider implements StorageProvider {
  async uploadFile(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
    throw new Error("GCS Upload not yet configured. Set GOOGLE_CLOUD_BUCKET_NAME in environment.");
    // const bucket = gcsClient.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);
    // const file = bucket.file(filename);
    // await file.save(buffer, { contentType: mimeType });
    // return `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/${filename}`;
  }
}

// Factory to return the correct provider based on env
export function getStorageProvider(): StorageProvider {
  if (process.env.NODE_ENV === "production" && process.env.GOOGLE_CLOUD_BUCKET_NAME) {
    return new GCSStorageProvider();
  }
  return new LocalStorageProvider();
}
