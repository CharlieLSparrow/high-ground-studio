import { useState, useCallback } from "react";

export type UploadState = "idle" | "requesting_url" | "uploading" | "success" | "error";

export interface UploadTask {
  id: string;
  state: UploadState;
  progressPercent: number;
  error: string | null;
  publicUrl: string | null;
  bucketPath: string | null;
}

export interface CloudStorageUploadHook {
  tasks: Record<string, UploadTask>;
  uploadFile: (taskId: string, file: File | Blob, fileName: string, fileType: string, options?: { episodeId?: string; directory?: string }) => Promise<string | null>;
  reset: (taskId: string) => void;
}

export function useCloudStorageUpload(): CloudStorageUploadHook {
  const [tasks, setTasks] = useState<Record<string, UploadTask>>({});

  const reset = useCallback((taskId: string) => {
    setTasks((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<UploadTask>) => {
    setTasks((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {
          id: taskId,
          state: "idle",
          progressPercent: 0,
          error: null,
          publicUrl: null,
          bucketPath: null,
        }),
        ...updates,
      },
    }));
  }, []);

  const uploadFile = useCallback(async (
    taskId: string,
    file: File | Blob,
    fileName: string,
    fileType: string,
    options?: { episodeId?: string; directory?: string }
  ): Promise<string | null> => {
    try {
      updateTask(taskId, { state: "requesting_url", progressPercent: 0, error: null });
      
      const presignResponse = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: fileName,
          contentType: fileType,
          episodeId: options?.episodeId,
          directory: options?.directory || "uploads",
        }),
      });

      if (!presignResponse.ok) {
        throw new Error("Failed to get upload signature from server.");
      }

      const { url, publicUrl, bucketPath } = await presignResponse.json();

      updateTask(taskId, { state: "uploading", bucketPath });

      // Mock upload for local-dev fallback
      if (url.includes("X-Goog-Signature=mock")) {
        console.warn(`[Upload ${taskId}] Mock signed URL detected. Simulating fast upload.`);
        for (let i = 0; i <= 100; i += 20) {
          updateTask(taskId, { progressPercent: i });
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        updateTask(taskId, { state: "success", publicUrl, progressPercent: 100 });
        return publicUrl;
      }

      // Client-Direct Upload using XMLHttpRequest for progress tracking
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            updateTask(taskId, { progressPercent: percentComplete });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateTask(taskId, { state: "success", publicUrl, progressPercent: 100 });
            resolve(publicUrl);
          } else {
            updateTask(taskId, { state: "error", error: `Upload failed with status: ${xhr.status}` });
            reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          updateTask(taskId, { state: "error", error: "Network error during upload." });
          reject(new Error("Network error during upload."));
        };

        xhr.open("PUT", url, true);
        xhr.setRequestHeader("Content-Type", fileType);
        xhr.send(file);
      });

    } catch (err: any) {
      updateTask(taskId, { state: "error", error: err.message || "An unknown error occurred." });
      throw err;
    }
  }, [updateTask]);

  return {
    tasks,
    uploadFile,
    reset,
  };
}
