import type {
  CloudSyncJob,
  CloudSyncUploadedInput,
} from "@high-ground/studio-cut-schema";
import {
  buildCloudSyncJobPath,
  isCloudSyncJob,
  mergeCloudSyncUploadedInput,
} from "../cloudSync";
import { getStudioCutFirebaseApp } from "../firebase/studioCutFirebase";
import type { StudioCutFirebaseConfig } from "../studioCutConfig";

export type CloudSyncUploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
};

export type CloudSyncStore = {
  syncJobPath: string;
  subscribeToSyncJob: (
    onJob: (job: CloudSyncJob | null) => void,
    onError: (error: unknown) => void,
  ) => () => void;
  saveSyncJob: (job: CloudSyncJob) => Promise<void>;
  updateSyncJob: (job: CloudSyncJob) => Promise<void>;
  uploadInput: (
    file: File,
    storagePath: string,
    onProgress: (progress: CloudSyncUploadProgress) => void,
  ) => Promise<void>;
  appendUploadedInput: (
    syncJobId: string,
    uploadedInput: CloudSyncUploadedInput,
  ) => Promise<CloudSyncJob>;
  getOutputArtifactText: (
    storagePath: string,
    artifactKind: string,
  ) => Promise<string>;
};

export async function createCloudSyncStore({
  firebaseConfig,
  syncJobId,
}: {
  firebaseConfig: StudioCutFirebaseConfig;
  syncJobId: string;
}): Promise<CloudSyncStore> {
  const firestore = await import("firebase/firestore");
  const storage = await import("firebase/storage");
  const app = getStudioCutFirebaseApp(firebaseConfig);
  const db = firestore.getFirestore(app);
  const storageService = storage.getStorage(app);
  const syncJobPath = buildCloudSyncJobPath(syncJobId);
  const syncJobRef = firestore.doc(db, "studioCutSyncJobs", syncJobId);

  function subscribeToSyncJob(
    onJob: (job: CloudSyncJob | null) => void,
    onError: (error: unknown) => void,
  ) {
    return firestore.onSnapshot(
      syncJobRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onJob(null);
          return;
        }

        const value = snapshot.data();

        if (!isCloudSyncJob(value)) {
          onError(
            new Error(
              `Cloud sync job exists at ${syncJobPath} but does not match the Studio Cut sync job shape.`,
            ),
          );
          return;
        }

        onJob(value);
      },
      onError,
    );
  }

  async function saveSyncJob(job: CloudSyncJob) {
    await firestore.setDoc(syncJobRef, serializeCloudSyncJob(job), {
      merge: true,
    });
  }

  async function updateSyncJob(job: CloudSyncJob) {
    await saveSyncJob(job);
  }

  async function appendUploadedInput(
    _syncJobId: string,
    uploadedInput: CloudSyncUploadedInput,
  ) {
    const snapshot = await firestore.getDoc(syncJobRef);
    const currentValue = snapshot.data();

    if (!isCloudSyncJob(currentValue)) {
      throw new Error(`Cloud sync job ${syncJobPath} is missing or invalid.`);
    }

    const updatedJob: CloudSyncJob = {
      ...currentValue,
      uploadedInputs: mergeCloudSyncUploadedInput(
        currentValue.uploadedInputs,
        uploadedInput,
      ),
      updatedAt: new Date().toISOString(),
    };

    await updateSyncJob(updatedJob);

    return updatedJob;
  }

  async function uploadInput(
    file: File,
    storagePath: string,
    onProgress: (progress: CloudSyncUploadProgress) => void,
  ) {
    const uploadRef = storage.ref(storageService, storagePath);
    const uploadTask = storage.uploadBytesResumable(uploadRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: {
        studioCutKind: "cloud-sync-input",
      },
    });

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const percent =
            snapshot.totalBytes > 0
              ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
              : 0;

          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            percent,
          });
        },
        reject,
        () => resolve(),
      );
    });
  }

  async function getOutputArtifactText(
    storagePath: string,
    artifactKind: string,
  ) {
    const outputRef = storage.ref(storageService, storagePath);

    try {
      const bytes = await storage.getBytes(outputRef, 10 * 1024 * 1024);

      return new TextDecoder("utf-8").decode(bytes);
    } catch (error) {
      throw new Error(
        `Could not load cloud sync ${artifactKind} from Storage: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    syncJobPath,
    subscribeToSyncJob,
    saveSyncJob,
    updateSyncJob,
    uploadInput,
    appendUploadedInput,
    getOutputArtifactText,
  };
}

function serializeCloudSyncJob(job: CloudSyncJob) {
  return {
    syncJobId: job.syncJobId,
    projectId: job.projectId,
    branchId: job.branchId,
    title: job.title,
    createdBy: job.createdBy,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    expectedInputs: job.expectedInputs,
    uploadedInputs: job.uploadedInputs,
    outputs: job.outputs,
    ...(job.syncReportSummary
      ? { syncReportSummary: job.syncReportSummary }
      : {}),
    ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
  };
}
