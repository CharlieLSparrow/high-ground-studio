import { getStudioCutFirebaseApp } from "../firebase/studioCutFirebase";
import {
  buildSharedRoomMetadataPath,
  isSharedRoomMetadata,
  type SharedRoomMetadata,
} from "../sharedRoom";
import type { StudioCutFirebaseConfig } from "../studioCutConfig";
import { getErrorMessage } from "./decisionPersistence";

export type SharedRoomUploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
};

export type SharedRoomStore = {
  roomMetadataPath: string;
  subscribeToRoomMetadata: (
    onMetadata: (metadata: SharedRoomMetadata | null) => void,
    onError: (error: unknown) => void,
  ) => () => void;
  saveRoomMetadata: (metadata: SharedRoomMetadata) => Promise<void>;
  uploadSourceMonitorProxy: (
    file: File,
    storagePath: string,
    onProgress: (progress: SharedRoomUploadProgress) => void,
  ) => Promise<string>;
  getSourceMonitorProxyDownloadUrl: (storagePath: string) => Promise<string>;
};

export async function createSharedRoomStore({
  firebaseConfig,
  projectId,
  branchId,
}: {
  firebaseConfig: StudioCutFirebaseConfig;
  projectId: string;
  branchId: string;
}): Promise<SharedRoomStore> {
  const firestore = await import("firebase/firestore");
  const storage = await import("firebase/storage");
  const app = getStudioCutFirebaseApp(firebaseConfig);
  const db = firestore.getFirestore(app);
  const storageService = storage.getStorage(app);
  const roomMetadataPath = buildSharedRoomMetadataPath(projectId, branchId);
  const roomMetadataRef = firestore.doc(
    db,
    "studioCutProjects",
    projectId,
    "branches",
    branchId,
    "room",
    "meta",
  );

  function subscribeToRoomMetadata(
    onMetadata: (metadata: SharedRoomMetadata | null) => void,
    onError: (error: unknown) => void,
  ) {
    return firestore.onSnapshot(
      roomMetadataRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onMetadata(null);
          return;
        }

        const value = snapshot.data();

        if (!isSharedRoomMetadata(value)) {
          onError(
            new Error(
              `Room metadata exists at ${roomMetadataPath} but does not match the Studio Cut room shape.`,
            ),
          );
          return;
        }

        onMetadata(value);
      },
      onError,
    );
  }

  async function saveRoomMetadata(metadata: SharedRoomMetadata) {
    await firestore.setDoc(roomMetadataRef, serializeRoomMetadata(metadata), {
      merge: true,
    });
  }

  async function uploadSourceMonitorProxy(
    file: File,
    storagePath: string,
    onProgress: (progress: SharedRoomUploadProgress) => void,
  ) {
    const proxyRef = storage.ref(storageService, storagePath);
    const uploadTask = storage.uploadBytesResumable(proxyRef, file, {
      contentType: file.type || "video/mp4",
      customMetadata: {
        studioCutKind: "source-monitor-proxy",
      },
    });

    return new Promise<string>((resolve, reject) => {
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
        (error) => reject(error),
        () => {
          storage
            .getDownloadURL(uploadTask.snapshot.ref)
            .then(resolve)
            .catch(reject);
        },
      );
    });
  }

  async function getSourceMonitorProxyDownloadUrl(storagePath: string) {
    const proxyRef = storage.ref(storageService, storagePath);

    try {
      return await storage.getDownloadURL(proxyRef);
    } catch (error) {
      throw new Error(
        `Could not load shared source-monitor proxy from Storage: ${getErrorMessage(
          error,
        )}`,
      );
    }
  }

  return {
    roomMetadataPath,
    subscribeToRoomMetadata,
    saveRoomMetadata,
    uploadSourceMonitorProxy,
    getSourceMonitorProxyDownloadUrl,
  };
}

function serializeRoomMetadata(metadata: SharedRoomMetadata) {
  return {
    projectId: metadata.projectId,
    branchId: metadata.branchId,
    title: metadata.title,
    manifest: metadata.manifest,
    sourceMonitorProxyStoragePath: metadata.sourceMonitorProxyStoragePath,
    sourceMonitorProxyFileName: metadata.sourceMonitorProxyFileName,
    sourceMonitorProxyContentType: metadata.sourceMonitorProxyContentType,
    sourceMonitorProxySizeBytes: metadata.sourceMonitorProxySizeBytes,
    createdBy: metadata.createdBy,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    ...(metadata.notes ? { notes: metadata.notes } : {}),
  };
}
