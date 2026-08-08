export type LocalExecutorStorageProjection = {
  status: "measured" | "unavailable";
  safeAvailableBytes: string | null;
  availableBytes: string | null;
  reserveBytes: string | null;
  measuredAt: string | null;
  workspaceMode: "durable" | "temporary" | "unknown";
  localPathWithheld: true;
};

export type ExternalMediaLibraryNavigationHealth = {
  eligibleSourceCount: number;
  retainedBrowseCount: number;
  proxyReadyCount: number;
  visualReadyCount: number;
  audioReadyCount: number;
  browseReadyCount: number;
  remainingCount: number;
  nextBatchCount: number;
  nextBatchTransferBytes: string;
  nextBatchFits: boolean | null;
  nextBatchShortfallBytes: string;
  pendingTransferBytes: string;
  executorStorage: LocalExecutorStorageProjection;
  inventoryTruncated: boolean;
  captureDays: Array<{
    date: string | null;
    eligibleSourceCount: number;
    browseReadyCount: number;
    pendingTransferBytes: string;
  }>;
};

export type ExternalMediaLibraryProjection = {
  id: string;
  name: string;
  provider?: "google-drive";
  status: string;
  revision: number;
  totalFileCount: number;
  totalSizeBytes: string;
  readySegmentCount: number;
  heldSegmentCount: number;
  heldSegments?: Array<{
    batchName: string;
    displayName: string;
    segment: string;
    status: string;
    reasons: string[];
    observedMemberCount: number;
  }>;
  heldSegmentsOmittedCount?: number;
  notObservedCount: number;
  lastCheckedAt: string;
  lastSuccessfulRefreshAt?: string;
  canRefresh: boolean;
  connectionId?: string | null;
  connectionState: string;
  connectedByCurrentUser: boolean;
  discoveryMode?: "folder-scan" | "selected-files";
  navigationHealth?: ExternalMediaLibraryNavigationHealth;
};
