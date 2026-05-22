export type SourceRole = "homer" | "charlie" | "clip" | "program";

export type ProgramState =
  | "charlie"
  | "homer"
  | "both"
  | "charlie_clip"
  | "homer_clip"
  | "both_clip"
  | "cut";

export type DecisionEvent = {
  id: string;
  projectId: string;
  branchId: string;
  sourceTimeMs: number;
  state: ProgramState;
  createdBy: string;
  createdAt: string;
  clientId?: string;
  operation?: "upsert" | "import" | "remove";
  note?: string;
  removedAt?: string;
  removedBy?: string;
};

export type DerivedSegment = {
  startSourceTimeMs: number;
  endSourceTimeMs?: number;
  state: ProgramState;
  sourceEventId: string;
};

export type EpisodeSource = {
  role: SourceRole;
  label: string;
  fileName?: string;
  notes?: string;
};

export type SourceMonitorPaneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SourceMonitorProxy = {
  url?: string;
  localPlaceholderPath?: string;
  panes: {
    homer: SourceMonitorPaneRect;
    charlie: SourceMonitorPaneRect;
    clip?: SourceMonitorPaneRect;
  };
};

export type SyncBootstrap = {
  source: "premiere";
  xmlFileName?: string;
  notes?: string;
};

export type EpisodeManifest = {
  id: string;
  title: string;
  durationMs: number;
  sources: {
    homer: EpisodeSource;
    charlie: EpisodeSource;
    clip?: EpisodeSource;
    program: EpisodeSource;
  };
  sourceMonitorProxy: SourceMonitorProxy;
  syncBootstrap: SyncBootstrap;
};

export type CloudSyncInputRole =
  | "homerVideo"
  | "charlieVideo"
  | "homerAudio"
  | "charlieAudio"
  | "phoneReferenceAudio"
  | "clipVideo"
  | "other";

export type CloudSyncJobStatus =
  | "draft"
  | "uploading"
  | "uploaded"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type CloudSyncExpectedInputs = {
  homerVideo: boolean;
  charlieVideo: boolean;
  homerAudio: boolean;
  charlieAudio: boolean;
  phoneReferenceAudio: boolean;
  clipVideo?: boolean;
  other?: boolean;
};

export type CloudSyncUploadedInput = {
  inputId: string;
  role: CloudSyncInputRole;
  storagePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationMs?: number;
  uploadedAt: string;
  orderIndex?: number;
  notes?: string;
};

export type CloudSyncJobOutputs = {
  manifestStoragePath?: string;
  sourceMonitorProxyStoragePath?: string;
  syncReportStoragePath?: string;
  syncMapStoragePath?: string;
  sharedRoomUrl?: string;
};

export type CloudSyncReportSummary = {
  confidence: number;
  warnings: string[];
  offsets: Record<string, number>;
};

export type CloudSyncJob = {
  syncJobId: string;
  projectId: string;
  branchId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: CloudSyncJobStatus;
  expectedInputs: CloudSyncExpectedInputs;
  uploadedInputs: CloudSyncUploadedInput[];
  outputs: CloudSyncJobOutputs;
  syncReportSummary?: CloudSyncReportSummary;
  errorMessage?: string;
};

export type CloudSyncReferenceRailSegment = {
  inputId: string;
  fileName: string;
  railStartMs: number;
  sourceStartMs: number;
  durationMs: number;
  confidence: number;
  gapBeforeMs?: number;
  overlapBeforeMs?: number;
  warnings: string[];
};

export type CloudSyncReferenceRail = {
  syncJobId: string;
  referenceRole: "phoneReferenceAudio";
  segments: CloudSyncReferenceRailSegment[];
  totalDurationMs: number;
  warnings: string[];
};

export type CloudSyncAnchorSummary = {
  trackStartMs: number;
  referenceStartMs: number;
  estimatedOffsetMs: number;
  score: number;
  confidence: number;
  warnings: string[];
};

export type CloudSyncTrackOffset = {
  role: CloudSyncInputRole;
  inputId: string;
  fileName: string;
  estimatedOffsetMs: number;
  confidence: number;
  driftPpm?: number;
  anchorCount?: number;
  anchorAgreementMs?: number;
  anchorSummaries?: CloudSyncAnchorSummary[];
  warnings: string[];
};

export type CloudSyncReport = {
  syncJobId: string;
  generatedAt: string;
  status: CloudSyncJobStatus;
  referenceRail: CloudSyncReferenceRail;
  trackOffsets: CloudSyncTrackOffset[];
  globalWarnings: string[];
};

export type SyncMapCanonicalTimeline = {
  durationMs: number;
  timebase: "milliseconds";
  referenceRole: "phoneReferenceAudio";
};

export type SyncMapAsset = {
  assetId: string;
  inputId: string;
  role: CloudSyncInputRole;
  fileName: string;
  originalStoragePath?: string;
  proxyStoragePath?: string;
  extractedAudioStoragePath?: string;
  timelineStartMs: number;
  assetStartMs: number;
  durationMs: number;
  estimatedOffsetMs: number;
  driftPpm?: number;
  confidence: number;
  warnings: string[];
};

export type SyncMap = {
  syncMapId: string;
  syncJobId: string;
  projectId: string;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  canonicalTimeline: SyncMapCanonicalTimeline;
  assets: SyncMapAsset[];
  referenceRail: CloudSyncReferenceRail;
  globalWarnings: string[];
};

export const SOURCE_ROLES: readonly SourceRole[] = [
  "homer",
  "charlie",
  "clip",
  "program",
] as const;

export const CLOUD_SYNC_INPUT_ROLES: readonly CloudSyncInputRole[] = [
  "homerVideo",
  "charlieVideo",
  "homerAudio",
  "charlieAudio",
  "phoneReferenceAudio",
  "clipVideo",
  "other",
] as const;

export const CLOUD_SYNC_REQUIRED_INPUT_ROLES: readonly CloudSyncInputRole[] = [
  "homerVideo",
  "charlieVideo",
  "homerAudio",
  "charlieAudio",
  "phoneReferenceAudio",
] as const;

export const CLOUD_SYNC_JOB_STATUSES: readonly CloudSyncJobStatus[] = [
  "draft",
  "uploading",
  "uploaded",
  "queued",
  "processing",
  "ready",
  "failed",
] as const;

export const PROGRAM_STATES: readonly ProgramState[] = [
  "charlie",
  "homer",
  "both",
  "charlie_clip",
  "homer_clip",
  "both_clip",
  "cut",
] as const;

export const PROGRAM_STATE_LABELS: Record<ProgramState, string> = {
  charlie: "Charlie",
  homer: "Homer",
  both: "Both",
  charlie_clip: "Charlie/Clip",
  homer_clip: "Homer/Clip",
  both_clip: "Both/Clip",
  cut: "Cut",
};

export const SOURCE_ROLE_LABELS: Record<SourceRole, string> = {
  homer: "Homer source",
  charlie: "Charlie source",
  clip: "Clip source",
  program: "Program preview",
};

export type DecisionEventParseResult = {
  events: DecisionEvent[];
  totalCount: number;
  rejectedCount: number;
};

export type EpisodeManifestParseResult =
  | { ok: true; manifest: EpisodeManifest }
  | { ok: false; reason: string };

export type CloudSyncJobParseResult =
  | { ok: true; job: CloudSyncJob }
  | { ok: false; reason: string };

export type CloudSyncReportParseResult =
  | { ok: true; report: CloudSyncReport }
  | { ok: false; reason: string };

export type SyncMapParseResult =
  | { ok: true; syncMap: SyncMap }
  | { ok: false; reason: string };

export function isProgramState(value: unknown): value is ProgramState {
  return PROGRAM_STATES.includes(value as ProgramState);
}

export function isCloudSyncInputRole(
  value: unknown,
): value is CloudSyncInputRole {
  return CLOUD_SYNC_INPUT_ROLES.includes(value as CloudSyncInputRole);
}

export function isCloudSyncJobStatus(
  value: unknown,
): value is CloudSyncJobStatus {
  return CLOUD_SYNC_JOB_STATUSES.includes(value as CloudSyncJobStatus);
}

export function isDecisionEvent(value: unknown): value is DecisionEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<DecisionEvent>;

  return (
    typeof event.id === "string" &&
    event.id.trim().length > 0 &&
    typeof event.projectId === "string" &&
    event.projectId.trim().length > 0 &&
    typeof event.branchId === "string" &&
    event.branchId.trim().length > 0 &&
    typeof event.sourceTimeMs === "number" &&
    Number.isFinite(event.sourceTimeMs) &&
    event.sourceTimeMs >= 0 &&
    isProgramState(event.state) &&
    typeof event.createdBy === "string" &&
    event.createdBy.trim().length > 0 &&
    typeof event.createdAt === "string" &&
    event.createdAt.trim().length > 0 &&
    !Number.isNaN(Date.parse(event.createdAt)) &&
    (event.clientId === undefined || typeof event.clientId === "string") &&
    (event.operation === undefined ||
      event.operation === "upsert" ||
      event.operation === "import" ||
      event.operation === "remove") &&
    (event.note === undefined || typeof event.note === "string") &&
    (event.removedAt === undefined ||
      (typeof event.removedAt === "string" &&
        event.removedAt.trim().length > 0 &&
        !Number.isNaN(Date.parse(event.removedAt)))) &&
    (event.removedBy === undefined || typeof event.removedBy === "string")
  );
}

export function parseDecisionEventsPayload(
  payload: unknown,
): DecisionEventParseResult {
  const candidateEvents = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.decisionEvents)
      ? payload.decisionEvents
      : [];

  const events = candidateEvents.filter(isDecisionEvent);

  return {
    events,
    totalCount: candidateEvents.length,
    rejectedCount: candidateEvents.length - events.length,
  };
}

export function parseEpisodeManifestPayload(
  payload: unknown,
): EpisodeManifestParseResult {
  if (!isEpisodeManifest(payload)) {
    return {
      ok: false,
      reason:
        "Manifest must include id, title, durationMs, homer/charlie/program sources, sourceMonitorProxy panes, and syncBootstrap.source=premiere.",
    };
  }

  return { ok: true, manifest: payload };
}

export function parseCloudSyncJobPayload(
  payload: unknown,
): CloudSyncJobParseResult {
  if (!isCloudSyncJob(payload)) {
    return {
      ok: false,
      reason:
        "Cloud sync job must include ids, status, expected/uploaded inputs, outputs, creator, and timestamps.",
    };
  }

  return { ok: true, job: payload };
}

export function parseCloudSyncReportPayload(
  payload: unknown,
): CloudSyncReportParseResult {
  if (!isCloudSyncReport(payload)) {
    return {
      ok: false,
      reason:
        "Cloud sync report must include syncJobId, generatedAt, status, reference rail, track offsets, and global warnings.",
    };
  }

  return { ok: true, report: payload };
}

export function parseSyncMapPayload(payload: unknown): SyncMapParseResult {
  if (!isSyncMap(payload)) {
    return {
      ok: false,
      reason:
        "Sync Map must include ids, canonical timeline, path-safe assets, reference rail, timestamps, and warnings.",
    };
  }

  return { ok: true, syncMap: payload };
}

export function isEpisodeManifest(value: unknown): value is EpisodeManifest {
  if (!isRecord(value)) {
    return false;
  }

  const manifest = value as Partial<EpisodeManifest>;

  return (
    typeof manifest.id === "string" &&
    manifest.id.trim().length > 0 &&
    typeof manifest.title === "string" &&
    manifest.title.trim().length > 0 &&
    typeof manifest.durationMs === "number" &&
    Number.isFinite(manifest.durationMs) &&
    manifest.durationMs > 0 &&
    isRecord(manifest.sources) &&
    isEpisodeSource(manifest.sources.homer, "homer") &&
    isEpisodeSource(manifest.sources.charlie, "charlie") &&
    (manifest.sources.clip === undefined ||
      isEpisodeSource(manifest.sources.clip, "clip")) &&
    isEpisodeSource(manifest.sources.program, "program") &&
    isSourceMonitorProxy(manifest.sourceMonitorProxy) &&
    isSyncBootstrap(manifest.syncBootstrap)
  );
}

export function isCloudSyncJob(value: unknown): value is CloudSyncJob {
  if (!isRecord(value)) {
    return false;
  }

  const job = value as Partial<CloudSyncJob>;

  return (
    typeof job.syncJobId === "string" &&
    job.syncJobId.trim().length > 0 &&
    typeof job.projectId === "string" &&
    job.projectId.trim().length > 0 &&
    typeof job.branchId === "string" &&
    job.branchId.trim().length > 0 &&
    typeof job.title === "string" &&
    job.title.trim().length > 0 &&
    typeof job.createdBy === "string" &&
    job.createdBy.trim().length > 0 &&
    isIsoDateString(job.createdAt) &&
    isIsoDateString(job.updatedAt) &&
    isCloudSyncJobStatus(job.status) &&
    isCloudSyncExpectedInputs(job.expectedInputs) &&
    Array.isArray(job.uploadedInputs) &&
    job.uploadedInputs.every(isCloudSyncUploadedInput) &&
    isCloudSyncJobOutputs(job.outputs) &&
    (job.syncReportSummary === undefined ||
      isCloudSyncReportSummary(job.syncReportSummary)) &&
    optionalString(job.errorMessage)
  );
}

export function isCloudSyncReport(value: unknown): value is CloudSyncReport {
  if (!isRecord(value)) {
    return false;
  }

  const report = value as Partial<CloudSyncReport>;

  return (
    typeof report.syncJobId === "string" &&
    report.syncJobId.trim().length > 0 &&
    isIsoDateString(report.generatedAt) &&
    isCloudSyncJobStatus(report.status) &&
    isCloudSyncReferenceRail(report.referenceRail) &&
    Array.isArray(report.trackOffsets) &&
    report.trackOffsets.every(isCloudSyncTrackOffset) &&
    Array.isArray(report.globalWarnings) &&
    report.globalWarnings.every((warning) => typeof warning === "string")
  );
}

export function isSyncMap(value: unknown): value is SyncMap {
  if (!isRecord(value)) {
    return false;
  }

  const syncMap = value as Partial<SyncMap>;

  return (
    typeof syncMap.syncMapId === "string" &&
    syncMap.syncMapId.trim().length > 0 &&
    typeof syncMap.syncJobId === "string" &&
    syncMap.syncJobId.trim().length > 0 &&
    typeof syncMap.projectId === "string" &&
    syncMap.projectId.trim().length > 0 &&
    typeof syncMap.branchId === "string" &&
    syncMap.branchId.trim().length > 0 &&
    isIsoDateString(syncMap.createdAt) &&
    isIsoDateString(syncMap.updatedAt) &&
    isSyncMapCanonicalTimeline(syncMap.canonicalTimeline) &&
    Array.isArray(syncMap.assets) &&
    syncMap.assets.every(isSyncMapAsset) &&
    isCloudSyncReferenceRail(syncMap.referenceRail) &&
    Array.isArray(syncMap.globalWarnings) &&
    syncMap.globalWarnings.every((warning) => typeof warning === "string")
  );
}

export function getMissingRequiredCloudSyncInputs(job: CloudSyncJob) {
  const uploadedRoles = new Set(job.uploadedInputs.map((input) => input.role));

  return CLOUD_SYNC_REQUIRED_INPUT_ROLES.filter(
    (role) => job.expectedInputs[role] && !uploadedRoles.has(role),
  );
}

export function isCloudSyncJobInputComplete(job: CloudSyncJob) {
  return getMissingRequiredCloudSyncInputs(job).length === 0;
}

export function sortDecisionEvents(events: readonly DecisionEvent[]) {
  return [...events].sort(
    (left, right) =>
      left.sourceTimeMs - right.sourceTimeMs ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

export function mergeDecisionEvents(events: readonly DecisionEvent[]) {
  const eventsById = new Map<string, DecisionEvent>();

  for (const event of events) {
    eventsById.set(event.id, event);
  }

  return sortDecisionEvents([...eventsById.values()]);
}

export function deriveSegments(events: readonly DecisionEvent[]): DerivedSegment[] {
  const sortedEvents = getActiveDecisionEvents(events);

  return sortedEvents.map((event, index) => {
    const nextEvent = sortedEvents[index + 1];
    return {
      startSourceTimeMs: event.sourceTimeMs,
      ...(nextEvent ? { endSourceTimeMs: nextEvent.sourceTimeMs } : {}),
      state: event.state,
      sourceEventId: event.id,
    };
  });
}

export function getCurrentDecisionEvent(
  events: readonly DecisionEvent[],
  sourceTimeMs: number,
) {
  let currentEvent: DecisionEvent | undefined;

  for (const event of getActiveDecisionEvents(events)) {
    if (event.sourceTimeMs <= sourceTimeMs) {
      currentEvent = event;
      continue;
    }

    break;
  }

  return currentEvent;
}

export function getActiveDecisionEvents(events: readonly DecisionEvent[]) {
  return sortDecisionEvents(events).filter(
    (event) => !isDecisionEventRemoved(event),
  );
}

export function isDecisionEventRemoved(event: DecisionEvent) {
  return Boolean(event.removedAt);
}

export function draftEpisodeManifestFromSyncMap(
  syncMap: SyncMap,
  options: {
    title?: string;
    sourceMonitorProxyUrl?: string;
    sourceMonitorProxyPlaceholderPath?: string;
    sourceMonitorProxyFileName?: string;
  } = {},
): EpisodeManifest {
  const homerAsset =
    findSyncMapAsset(syncMap, "homerVideo") ??
    findSyncMapAsset(syncMap, "homerAudio");
  const charlieAsset =
    findSyncMapAsset(syncMap, "charlieVideo") ??
    findSyncMapAsset(syncMap, "charlieAudio");
  const clipAsset = findSyncMapAsset(syncMap, "clipVideo");
  const proxyFileName =
    options.sourceMonitorProxyFileName ?? "source-monitor-proxy.pending.mp4";

  return {
    id: syncMap.projectId,
    title: options.title ?? syncMap.projectId,
    durationMs: syncMap.canonicalTimeline.durationMs,
    sources: {
      homer: syncMapAssetToEpisodeSource("homer", homerAsset),
      charlie: syncMapAssetToEpisodeSource("charlie", charlieAsset),
      ...(clipAsset
        ? { clip: syncMapAssetToEpisodeSource("clip", clipAsset) }
        : {}),
      program: {
        role: "program",
        label: "Program preview",
        fileName: proxyFileName,
        notes:
          "Drafted from Sync Map. Source-monitor proxy generation is a future worker output.",
      },
    },
    sourceMonitorProxy: {
      ...(options.sourceMonitorProxyUrl
        ? { url: options.sourceMonitorProxyUrl }
        : {
            localPlaceholderPath:
              options.sourceMonitorProxyPlaceholderPath ??
              "PENDING_SOURCE_MONITOR_PROXY",
          }),
      panes: {
        homer: { x: 0, y: 0, width: 0.5, height: 0.5 },
        charlie: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        ...(clipAsset
          ? { clip: { x: 0, y: 0.5, width: 0.5, height: 0.5 } }
          : {}),
      },
    },
    syncBootstrap: {
      source: "premiere",
      notes: `Drafted from Sync Map ${syncMap.syncMapId}. The Sync Map is the durable bridge from canonical episode timeline time to original asset-local time.`,
    },
  };
}

function isEpisodeSource(value: unknown, role: SourceRole) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.role === role &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    optionalString(value.fileName) &&
    optionalString(value.notes)
  );
}

function isSourceMonitorProxy(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  if (!optionalString(value.url) || !optionalString(value.localPlaceholderPath)) {
    return false;
  }

  if (!value.url && !value.localPlaceholderPath) {
    return false;
  }

  if (!isRecord(value.panes)) {
    return false;
  }

  return (
    isPaneRect(value.panes.homer) &&
    isPaneRect(value.panes.charlie) &&
    (value.panes.clip === undefined || isPaneRect(value.panes.clip))
  );
}

function isPaneRect(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNonNegativeNumber(value.x) &&
    isFiniteNonNegativeNumber(value.y) &&
    isFinitePositiveNumber(value.width) &&
    isFinitePositiveNumber(value.height)
  );
}

function isSyncBootstrap(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.source === "premiere" &&
    optionalString(value.xmlFileName) &&
    optionalString(value.notes)
  );
}

function isCloudSyncExpectedInputs(
  value: unknown,
): value is CloudSyncExpectedInputs {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.homerVideo === true &&
    value.charlieVideo === true &&
    value.homerAudio === true &&
    value.charlieAudio === true &&
    value.phoneReferenceAudio === true &&
    (value.clipVideo === undefined || typeof value.clipVideo === "boolean") &&
    (value.other === undefined || typeof value.other === "boolean")
  );
}

function isCloudSyncUploadedInput(
  value: unknown,
): value is CloudSyncUploadedInput {
  if (!isRecord(value)) {
    return false;
  }

  const orderIndex = value.orderIndex;

  return (
    typeof value.inputId === "string" &&
    value.inputId.trim().length > 0 &&
    isCloudSyncInputRole(value.role) &&
    typeof value.storagePath === "string" &&
    value.storagePath.trim().length > 0 &&
    typeof value.fileName === "string" &&
    value.fileName.trim().length > 0 &&
    typeof value.contentType === "string" &&
    value.contentType.trim().length > 0 &&
    isFiniteNonNegativeNumber(value.sizeBytes) &&
    (value.durationMs === undefined ||
      isFiniteNonNegativeNumber(value.durationMs)) &&
    isIsoDateString(value.uploadedAt) &&
    (orderIndex === undefined ||
      (typeof orderIndex === "number" &&
        Number.isInteger(orderIndex) &&
        orderIndex >= 0)) &&
    optionalString(value.notes)
  );
}

function isCloudSyncJobOutputs(
  value: unknown,
): value is CloudSyncJobOutputs {
  if (!isRecord(value)) {
    return false;
  }

  return (
    optionalString(value.manifestStoragePath) &&
    optionalString(value.sourceMonitorProxyStoragePath) &&
    optionalString(value.syncReportStoragePath) &&
    optionalString(value.syncMapStoragePath) &&
    optionalString(value.sharedRoomUrl)
  );
}

function isCloudSyncReportSummary(
  value: unknown,
): value is CloudSyncReportSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isConfidence(value.confidence) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string") &&
    isRecord(value.offsets) &&
    Object.values(value.offsets).every(
      (offsetMs) => typeof offsetMs === "number" && Number.isFinite(offsetMs),
    )
  );
}

function isCloudSyncReferenceRail(
  value: unknown,
): value is CloudSyncReferenceRail {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.syncJobId === "string" &&
    value.syncJobId.trim().length > 0 &&
    value.referenceRole === "phoneReferenceAudio" &&
    Array.isArray(value.segments) &&
    value.segments.every(isCloudSyncReferenceRailSegment) &&
    isFiniteNonNegativeNumber(value.totalDurationMs) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function isCloudSyncReferenceRailSegment(
  value: unknown,
): value is CloudSyncReferenceRailSegment {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.inputId === "string" &&
    value.inputId.trim().length > 0 &&
    typeof value.fileName === "string" &&
    value.fileName.trim().length > 0 &&
    isFiniteNonNegativeNumber(value.railStartMs) &&
    isFiniteNonNegativeNumber(value.sourceStartMs) &&
    isFiniteNonNegativeNumber(value.durationMs) &&
    isConfidence(value.confidence) &&
    (value.gapBeforeMs === undefined ||
      isFiniteNonNegativeNumber(value.gapBeforeMs)) &&
    (value.overlapBeforeMs === undefined ||
      isFiniteNonNegativeNumber(value.overlapBeforeMs)) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function isCloudSyncTrackOffset(
  value: unknown,
): value is CloudSyncTrackOffset {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isCloudSyncInputRole(value.role) &&
    typeof value.inputId === "string" &&
    value.inputId.trim().length > 0 &&
    typeof value.fileName === "string" &&
    value.fileName.trim().length > 0 &&
    typeof value.estimatedOffsetMs === "number" &&
    Number.isFinite(value.estimatedOffsetMs) &&
    (value.driftPpm === undefined ||
      (typeof value.driftPpm === "number" && Number.isFinite(value.driftPpm))) &&
    (value.anchorCount === undefined ||
      isFiniteNonNegativeNumber(value.anchorCount)) &&
    (value.anchorAgreementMs === undefined ||
      isFiniteNonNegativeNumber(value.anchorAgreementMs)) &&
    (value.anchorSummaries === undefined ||
      (Array.isArray(value.anchorSummaries) &&
        value.anchorSummaries.every(isCloudSyncAnchorSummary))) &&
    isConfidence(value.confidence) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function isSyncMapCanonicalTimeline(
  value: unknown,
): value is SyncMapCanonicalTimeline {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNonNegativeNumber(value.durationMs) &&
    value.timebase === "milliseconds" &&
    value.referenceRole === "phoneReferenceAudio"
  );
}

function isSyncMapAsset(value: unknown): value is SyncMapAsset {
  if (!isRecord(value)) {
    return false;
  }

  if ("localDebugPath" in value) {
    return false;
  }

  return (
    typeof value.assetId === "string" &&
    value.assetId.trim().length > 0 &&
    typeof value.inputId === "string" &&
    value.inputId.trim().length > 0 &&
    isCloudSyncInputRole(value.role) &&
    typeof value.fileName === "string" &&
    value.fileName.trim().length > 0 &&
    optionalStoragePath(value.originalStoragePath) &&
    optionalStoragePath(value.proxyStoragePath) &&
    optionalStoragePath(value.extractedAudioStoragePath) &&
    isFiniteNumber(value.timelineStartMs) &&
    isFiniteNonNegativeNumber(value.assetStartMs) &&
    isFiniteNonNegativeNumber(value.durationMs) &&
    isFiniteNumber(value.estimatedOffsetMs) &&
    (value.driftPpm === undefined ||
      (typeof value.driftPpm === "number" && Number.isFinite(value.driftPpm))) &&
    isConfidence(value.confidence) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function findSyncMapAsset(syncMap: SyncMap, role: CloudSyncInputRole) {
  return syncMap.assets.find((asset) => asset.role === role);
}

function syncMapAssetToEpisodeSource(
  role: SourceRole,
  asset: SyncMapAsset | undefined,
): EpisodeSource {
  return {
    role,
    label: SOURCE_ROLE_LABELS[role],
    fileName: asset?.fileName ?? `${role}.pending`,
    notes: asset
      ? `Drafted from Sync Map asset ${asset.assetId}; timelineStartMs=${asset.timelineStartMs}.`
      : "Drafted from Sync Map; source asset is not available yet.",
  };
}

function isCloudSyncAnchorSummary(
  value: unknown,
): value is CloudSyncAnchorSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNonNegativeNumber(value.trackStartMs) &&
    isFiniteNonNegativeNumber(value.referenceStartMs) &&
    typeof value.estimatedOffsetMs === "number" &&
    Number.isFinite(value.estimatedOffsetMs) &&
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    isConfidence(value.confidence) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function optionalStoragePath(value: unknown) {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  return (
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !value.startsWith(".") &&
    !value.includes("..") &&
    !value.includes("://") &&
    !value.toLowerCase().startsWith("file:")
  );
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFinitePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isConfidence(value: unknown) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isIsoDateString(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
