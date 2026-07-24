import { useState, useCallback, useRef } from "react";

export type UploadState = "idle" | "requesting_url" | "uploading" | "success" | "error";

export interface UploadTask {
  id: string;
  state: UploadState;
  progressPercent: number;
  error: string | null;
  publicUrl: string | null;
  bucketPath: string | null;
  uploadCapability: string | null;
  uploadRequestId: string | null;
  uploadReservationId: string | null;
}

type CloudStorageUploadOptions = {
  episodeId?: string;
  directory?: string;
  projectSlug?: string;
  nestSlug?: string;
  uploadRequestId?: string;
};

export interface CloudStorageUploadHook {
  tasks: Record<string, UploadTask>;
  uploadFile: (taskId: string, file: File | Blob, fileName: string, fileType: string, options?: CloudStorageUploadOptions) => Promise<string | null>;
  reset: (taskId: string) => void;
}

export function useCloudStorageUpload(): CloudStorageUploadHook {
  const [tasks, setTasks] = useState<Record<string, UploadTask>>({});
  const uploadRequestIds = useRef<Record<string, string>>({});

  const reset = useCallback((taskId: string) => {
    delete uploadRequestIds.current[taskId];
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
          uploadCapability: null,
          uploadRequestId: null,
          uploadReservationId: null,
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
    options?: CloudStorageUploadOptions
  ): Promise<string | null> => {
    try {
      const uploadRequestId = options?.uploadRequestId
        || uploadRequestIds.current[taskId]
        || globalThis.crypto.randomUUID();
      uploadRequestIds.current[taskId] = uploadRequestId;
      updateTask(taskId, {
        state: "requesting_url",
        progressPercent: 0,
        error: null,
        uploadRequestId,
      });
      
      const presignResponse = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: fileName,
          contentType: fileType,
          sizeBytes: file.size,
          uploadRequestId,
          episodeId: options?.episodeId,
          directory: options?.directory,
          projectSlug: options?.projectSlug,
          nestSlug: options?.nestSlug,
        }),
      });

      if (!presignResponse.ok) {
        throw new Error("Failed to get upload signature from server.");
      }

      const {
        url,
        gcsUri,
        bucketPath,
        uploadCapability,
        uploadReservation,
        requiredUploadHeaders,
      } = await presignResponse.json();

      updateTask(taskId, {
        state: "uploading",
        bucketPath,
        uploadCapability,
        uploadReservationId: uploadReservation?.id ?? null,
      });

      // Mock upload for local-dev fallback
      if (url.includes("X-Goog-Signature=mock")) {
        console.warn(`[Upload ${taskId}] Mock signed URL detected. Simulating fast upload.`);
        for (let i = 0; i <= 100; i += 20) {
          updateTask(taskId, { progressPercent: i });
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        updateTask(taskId, { state: "success", publicUrl: gcsUri, progressPercent: 100 });
        return gcsUri;
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
            updateTask(taskId, { state: "success", publicUrl: gcsUri, progressPercent: 100 });
            resolve(gcsUri);
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
        if (requiredUploadHeaders?.["X-Goog-If-Generation-Match"] === "0") {
          xhr.setRequestHeader("X-Goog-If-Generation-Match", "0");
        }
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
