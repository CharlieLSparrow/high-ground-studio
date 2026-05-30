"use server";

import fs from "fs/promises";
import path from "path";
import os from "os";

type MediaFile = {
  name: string;
  sourcePath: string;
  type: "video" | "photo" | "audio" | "unknown";
  sizeMb: string;
  proposedDestination: string;
};

// Default paths if user hasn't specified
const DEFAULT_SOURCE = path.join(os.homedir(), "Ingest");
const DEFAULT_DEST = path.join(os.homedir(), "MediaLibrary");

const EXT_MAP: Record<string, MediaFile["type"]> = {
  ".mp4": "video",
  ".mov": "video",
  ".insv": "video", // Insta360
  ".jpg": "photo",
  ".jpeg": "photo",
  ".png": "photo",
  ".raw": "photo",
  ".wav": "audio",
  ".mp3": "audio",
};

export async function scanDirectory(sourcePath: string = DEFAULT_SOURCE, destPath: string = DEFAULT_DEST) {
  try {
    // Ensure folders exist for the prototype
    await fs.mkdir(sourcePath, { recursive: true });
    await fs.mkdir(destPath, { recursive: true });

    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    const mediaFiles: MediaFile[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const type = EXT_MAP[ext] || "unknown";
        
        if (type === "unknown") continue;

        const fullPath = path.join(sourcePath, entry.name);
        const stats = await fs.stat(fullPath);
        
        // Group by Year/Month
        const date = new Date(stats.mtime);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        
        const proposedDestDir = path.join(destPath, year, month, type);
        const proposedDestination = path.join(proposedDestDir, entry.name);

        mediaFiles.push({
          name: entry.name,
          sourcePath: fullPath,
          type,
          sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
          proposedDestination,
        });
      }
    }

    return { success: true, files: mediaFiles, sourcePath, destPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function organizeMedia(files: MediaFile[], dryRun: boolean = true) {
  const results = [];
  
  for (const file of files) {
    try {
      const destDir = path.dirname(file.proposedDestination);
      
      if (!dryRun) {
        await fs.mkdir(destDir, { recursive: true });
        // Use copy + delete (or just rename)
        await fs.copyFile(file.sourcePath, file.proposedDestination);
        await fs.unlink(file.sourcePath);
      }
      
      results.push({ ...file, status: "success" });
    } catch (err: any) {
      results.push({ ...file, status: "error", error: err.message });
    }
  }

  return { success: true, results, dryRun };
}
