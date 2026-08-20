import { verifyCaptureRecoveryLineage } from "@/lib/episode-production/capture-recovery-lineage";

// Canonical, side-effect-free Session source and endpoint readiness projection.
// UI and native API surfaces must share this calculation rather than infer
// safety independently from partial recording or upload fields.

export type SessionTopologyParticipantInput = {
  id: string;
  userId?: string | null;
  label: string;
  role: string;
  isCurrentActor: boolean;
  consent: {
    recordingReady: boolean;
    canRecordVideo: boolean;
    transcriptionReady: boolean;
  } | null;
};

export type SessionTopologyGrantInput = {
  id: string;
  participantId: string;
  clientInstanceId?: string | null;
  clientKind: string;
  deviceLabel?: string | null;
  issuedAt: Date | string;
  expiresAt: Date | string;
};

export type SessionTopologyRecordingInput = {
  id: string;
  roomId?: string | null;
  participantId?: string | null;
  kind: string;
  status: string;
  fileName?: string | null;
  byteSize?: bigint | number | string | null;
  checksum?: string | null;
  storageBucket?: string | null;
  storageObjectPath?: string | null;
  durationSeconds?: number | null;
  verifiedAt?: Date | string | null;
  recordedStartedAt?: Date | string | null;
  recordedStoppedAt?: Date | string | null;
  localManifestJson?: unknown;
};

export type SessionTopologyCaptureInput = {
  captureId: string;
  actorUserId: string;
  status: "START_AND_STOP_RECEIVED" | "START_ONLY" | "STOP_ONLY";
  startedAt: Date | string | null;
  stoppedAt: Date | string | null;
  lastReceivedAt: Date | string;
};

export type SessionTopologyFinalizationInput = {
  uploadSessionId: string;
  captureId: string;
  roomId?: string | null;
  actorUserId?: string | null;
  recordingAssetId?: string | null;
  processingDisposition: string;
  transcriptDisposition: string;
  releaseReason?: string | null;
  releasedAt?: Date | string | null;
  metadataJson?: unknown;
  updatedAt: Date | string;
};

export type SessionTopologyPreflightInput = {
  id: string;
  governedActionId?: string | null;
  participantId: string;
  clientInstanceId: string;
  clientKind: string;
  deviceLabel?: string | null;
  microphoneLabel: string;
  cameraLabel?: string | null;
  outputLabel?: string | null;
  cameraWanted: boolean;
  status: string;
  audioSignalState: string;
  privateSamplePlaybackComplete: boolean;
  playbackDecision: string;
  issueCodes: string[];
  testedAt: Date | string;
  expiresAt: Date | string;
};

export type SessionTopologyEndpointQueueInput = {
  id: string;
  participantId: string;
  clientInstanceId: string;
  clientKind: string;
  deviceLabel?: string | null;
  queueRevision: bigint | number | string;
  queueState: string;
  localSourceCount: number;
  pendingSourceCount: number;
  failedSourceCount: number;
  observedCaptureIds: string[];
  recordingAssetIds: string[];
  latestLocalMutationAt: Date | string;
  reconciledAt: Date | string;
  createdAt: Date | string;
};

export type SessionTopologyExpectedSourceInput = {
  id: string;
  participantId?: string | null;
  label: string;
  sourceKind: string;
  retentionRole: string;
  status: string;
  expectedClientKind?: string | null;
  expectedDeviceLabel?: string | null;
  recordingAssetId?: string | null;
  captureId?: string | null;
  revision: number;
  latestReason?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type SessionReadinessEndpoint = {
  id: string;
  clientInstanceId: string | null;
  clientKind: string;
  deviceLabel: string;
  preparedAt: string;
  leaseExpiresAt: string;
  leaseActive: boolean;
  truth: "join-grant-receipt";
};

export type SessionReadinessSource = {
  id: string;
  evidenceKind: "recording-asset" | "capture-receipt";
  sourceKind: "audio" | "video" | "provider" | "unknown";
  label: string;
  status: string;
  clientKind: string;
  deviceLabel: string;
  captureId: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  durationSeconds: number | null;
  byteSize: string | null;
  verified: boolean;
  planDisposition?: {
    status: "waived" | "canceled";
    expectationId: string;
    revision: number;
    reason: string;
    updatedAt: string;
  } | null;
  serverRetention: {
    state:
      | "CAPTURE_AWAITING_MEDIA"
      | "CAPTURE_PLAN_RESOLVED"
      | "SERVER_COPY_PENDING"
      | "SERVER_COPY_VERIFIED_HELD"
      | "SERVER_COPY_VERIFIED_RELEASED"
      | "FINALIZATION_RECEIPT_MISSING";
    uploadSessionId: string | null;
    exactBytesVerified: boolean;
    processingDisposition: string | null;
    transcriptDisposition: string | null;
    updatedAt: string | null;
  };
};

export type SessionReadinessPreflight = {
  id: string;
  governedActionId: string | null;
  clientInstanceId: string;
  clientKind: string;
  deviceLabel: string;
  microphoneLabel: string;
  cameraLabel: string | null;
  outputLabel: string | null;
  cameraWanted: boolean;
  status: "READY" | "NEEDS_ATTENTION";
  audioSignalState: string;
  privateSamplePlaybackComplete: boolean;
  playbackDecision: string;
  issueCodes: string[];
  testedAt: string;
  expiresAt: string;
  current: boolean;
};

export type SessionReadinessEndpointQueue = {
  id: string;
  clientInstanceId: string;
  clientKind: string;
  deviceLabel: string;
  queueRevision: string;
  queueState: "NOT_EMPTY" | "DRAINED";
  localSourceCount: number;
  pendingSourceCount: number;
  failedSourceCount: number;
  observedCaptureIds: string[];
  recordingAssetIds: string[];
  latestLocalMutationAt: string;
  reconciledAt: string;
};

export type SessionReadinessExpectedSource = {
  id: string;
  participantId: string | null;
  participantLabel: string | null;
  label: string;
  sourceKind: "audio" | "video" | "screen" | "provider" | "other";
  retentionRole: "required-master" | "optional-master" | "sync-witness" | "backup";
  status: "active" | "waived" | "canceled";
  expectedClientKind: string | null;
  expectedDeviceLabel: string | null;
  recordingAssetId: string | null;
  captureId: string | null;
  revision: number;
  latestReason: string | null;
  fulfillment:
    | "fulfilled"
    | "bound-source-pending"
    | "bound-source-invalid"
    | "candidate-review"
    | "missing"
    | "waived"
    | "canceled";
  blocking: boolean;
  candidateSources: Array<{
    id: string;
    label: string;
    deviceLabel: string;
    serverSafe: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type SessionReadinessPerson = {
  id: string;
  label: string;
  role: string;
  isCurrentActor: boolean;
  consent: "ready" | "missing-or-stale" | "not-required";
  videoConsent: boolean;
  transcriptionConsent: boolean;
  endpoints: SessionReadinessEndpoint[];
  preflights: SessionReadinessPreflight[];
  endpointQueues: SessionReadinessEndpointQueue[];
  sources: SessionReadinessSource[];
  attentionCount: number;
};

export type SessionReadinessTopology = {
  generatedAt: string;
  people: SessionReadinessPerson[];
  expectedSources: SessionReadinessExpectedSource[];
  unassignedSources: SessionReadinessSource[];
  summary: {
    peopleCount: number;
    consentReadyCount: number;
    knownEndpointCount: number;
    currentPreflightCount: number;
    retainedSourceCount: number;
    verifiedSourceCount: number;
    pendingCaptureCount: number;
    endpointQueueCount: number;
    drainedEndpointCount: number;
    plannedSourceCount: number;
    requiredPlannedSourceCount: number;
    fulfilledRequiredPlannedSourceCount: number;
    missingRequiredPlannedSourceCount: number;
    attentionCount: number;
  };
  exitReadiness: {
    state:
      | "NO_CAPTURE_EVIDENCE"
      | "RECORDING_PLAN_REQUIRED"
      | "PLANNED_SOURCE_INCOMPLETE"
      | "SERVER_COPY_INCOMPLETE"
      | "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED"
      | "SAFE_TO_LEAVE";
    label: string;
    detail: string;
    requiredSourceCount: number;
    serverSafeRequiredSourceCount: number;
    pendingCaptureCount: number;
    safeForServerObservedSources: boolean;
    endpointQueueCount: number;
    drainedEndpointCount: number;
    allEndpointQueuesConfirmedEmpty: boolean;
    requiredPlannedSourceCount: number;
    fulfilledRequiredPlannedSourceCount: number;
    safeForPlannedSources: boolean;
    safeToLeaveAllEndpoints: boolean;
  };
  boundaries: {
    personIsNotDevice: true;
    grantIsNotPresence: true;
    callTrackIsNotRetainedSource: true;
    captureReceiptIsNotUploadedMedia: true;
    recordingAssetOwnsRetainedSourceTruth: true;
    serverCopyDoesNotProveEndpointQueueEmpty: true;
    observedSourceDoesNotProvePlannedSourceComplete: true;
  };
};

export const EMPTY_SESSION_READINESS_TOPOLOGY: SessionReadinessTopology = {
  generatedAt: "1970-01-01T00:00:00.000Z",
  people: [],
  expectedSources: [],
  unassignedSources: [],
  summary: {
    peopleCount: 0,
    consentReadyCount: 0,
    knownEndpointCount: 0,
    currentPreflightCount: 0,
    retainedSourceCount: 0,
    verifiedSourceCount: 0,
    pendingCaptureCount: 0,
    endpointQueueCount: 0,
    drainedEndpointCount: 0,
    plannedSourceCount: 0,
    requiredPlannedSourceCount: 0,
    fulfilledRequiredPlannedSourceCount: 0,
    missingRequiredPlannedSourceCount: 0,
    attentionCount: 0,
  },
  exitReadiness: {
    state: "NO_CAPTURE_EVIDENCE",
    label: "No retained capture evidence",
    detail: "Quipsly cannot tell any recording endpoint that it is safe to leave.",
    requiredSourceCount: 0,
    serverSafeRequiredSourceCount: 0,
    pendingCaptureCount: 0,
    endpointQueueCount: 0,
    drainedEndpointCount: 0,
    safeForServerObservedSources: false,
    allEndpointQueuesConfirmedEmpty: false,
    requiredPlannedSourceCount: 0,
    fulfilledRequiredPlannedSourceCount: 0,
    safeForPlannedSources: false,
    safeToLeaveAllEndpoints: false,
  },
  boundaries: {
    personIsNotDevice: true,
    grantIsNotPresence: true,
    callTrackIsNotRetainedSource: true,
    captureReceiptIsNotUploadedMedia: true,
    recordingAssetOwnsRetainedSourceTruth: true,
    serverCopyDoesNotProveEndpointQueueEmpty: true,
    observedSourceDoesNotProvePlannedSourceComplete: true,
  },
};

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function scalar(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function sourceKind(kind: string): SessionReadinessSource["sourceKind"] {
  const normalized = kind.toLowerCase();
  if (normalized.includes("provider") || normalized === "server_mix") return "provider";
  if (normalized.includes("video")) return "video";
  if (normalized.includes("audio")) return "audio";
  return "unknown";
}

function sourceProfile(manifestValue: unknown) {
  const manifest = object(manifestValue);
  return object(manifest.reportedSourceProfile);
}

function sourceClientKind(profile: Record<string, unknown>) {
  const explicit = text(profile.clientKind).toLowerCase();
  if (explicit) return explicit;
  return text(profile.deviceModelIdentifier) ? "ios" : "unknown";
}

function sourceDeviceLabel(profile: Record<string, unknown>, kind: SessionReadinessSource["sourceKind"]) {
  const explicit = text(profile.deviceLabel);
  if (explicit) return explicit;
  const model = text(profile.deviceModelIdentifier);
  const route = text(profile.audioRouteName);
  const camera = text(profile.cameraPosition);
  if (model && kind === "video") return `${model}${camera ? ` · ${camera} camera` : ""}`;
  if (model) return `${model}${route ? ` · ${route}` : ""}`;
  if (sourceClientKind(profile) === "web") return "Quipsly Web retained source";
  return "Source device not reported";
}

function expectedSourceKind(value: string): SessionReadinessExpectedSource["sourceKind"] {
  const normalized = value.toLowerCase();
  if (["audio", "video", "screen", "provider"].includes(normalized)) {
    return normalized as SessionReadinessExpectedSource["sourceKind"];
  }
  return "other";
}

function expectedSourceRole(value: string): SessionReadinessExpectedSource["retentionRole"] {
  const normalized = value.toLowerCase().replaceAll("_", "-");
  if (["required-master", "optional-master", "sync-witness", "backup"].includes(normalized)) {
    return normalized as SessionReadinessExpectedSource["retentionRole"];
  }
  return "required-master";
}

function expectedSourceStatus(value: string): SessionReadinessExpectedSource["status"] {
  const normalized = value.toLowerCase();
  if (normalized === "waived" || normalized === "canceled") return normalized;
  return "active";
}

function sourceMatchesExpectedKind(
  expected: SessionReadinessExpectedSource["sourceKind"],
  source: SessionReadinessSource,
) {
  if (expected === "other") return source.sourceKind === "unknown";
  return source.sourceKind === expected;
}

function recordingSource(
  recording: SessionTopologyRecordingInput,
  finalization: SessionTopologyFinalizationInput | null,
): SessionReadinessSource {
  const manifest = object(recording.localManifestJson);
  const profile = sourceProfile(manifest);
  const kind = sourceKind(recording.kind);
  const byteSize = recording.byteSize == null ? null : String(recording.byteSize);
  const checksum = text(recording.checksum).toLowerCase();
  const storageGeneration = text(manifest.storageGeneration);
  const numericByteSize = Number(recording.byteSize);
  const assetExactBytesVerified = recording.status === "VERIFIED"
    && Boolean(recording.verifiedAt)
    && manifest.exactBytesVerified === true
    && /^[a-f0-9]{64}$/.test(checksum)
    && Number.isFinite(numericByteSize)
    && numericByteSize > 0
    && Boolean(text(recording.storageBucket))
    && Boolean(text(recording.storageObjectPath))
    && Boolean(storageGeneration);
  const immutableBinding = object(object(finalization?.metadataJson).immutableUploadBinding);
  const bindingSha256 = text(immutableBinding.sha256).toLowerCase();
  const bindingByteSize = scalar(immutableBinding.sizeBytes);
  const manifestCaptureId = text(manifest.captureId).toLowerCase();
  const receiptCaptureId = text(finalization?.captureId).toLowerCase();
  const nativeReceiptMatchesAsset = Boolean(finalization)
    && text(immutableBinding.uploadSessionId) === text(finalization?.uploadSessionId)
    && Boolean(receiptCaptureId)
    && text(immutableBinding.captureId).toLowerCase() === receiptCaptureId
    && (!manifestCaptureId || manifestCaptureId === receiptCaptureId)
    && Boolean(text(immutableBinding.roomId))
    && Boolean(text(immutableBinding.actorUserId))
    && bindingSha256 === checksum
    && bindingByteSize === byteSize
    && text(immutableBinding.bucketName) === text(recording.storageBucket)
    && text(immutableBinding.objectName) === text(recording.storageObjectPath)
    && text(immutableBinding.generation) === storageGeneration;
  const recoveryLineage = verifyCaptureRecoveryLineage({
    roomId: text(recording.roomId) || text(finalization?.roomId) || "",
    recordingAsset: {
      id: recording.id,
      status: recording.status,
      byteSize: recording.byteSize,
      storageBucket: recording.storageBucket,
      storageObjectPath: recording.storageObjectPath,
      checksum: recording.checksum,
      verifiedAt: recording.verifiedAt,
      localManifestJson: recording.localManifestJson,
    },
    finalization: finalization ? {
      uploadSessionId: finalization.uploadSessionId,
      captureId: finalization.captureId,
      roomId: finalization.roomId,
      actorUserId: finalization.actorUserId,
      processingDisposition: finalization.processingDisposition,
      releaseReason: finalization.releaseReason,
      releasedAt: finalization.releasedAt,
      metadataJson: finalization.metadataJson,
    } : null,
  });
  const exactReceiptMatchesAsset = recoveryLineage ? recoveryLineage.valid : nativeReceiptMatchesAsset;
  const exactBytesVerified = assetExactBytesVerified && exactReceiptMatchesAsset;
  const processingDisposition = finalization ? text(finalization.processingDisposition).toUpperCase() : null;
  const transcriptDisposition = finalization ? text(finalization.transcriptDisposition).toUpperCase() : null;
  const retentionState = !assetExactBytesVerified
    ? "SERVER_COPY_PENDING" as const
    : !finalization
      ? "FINALIZATION_RECEIPT_MISSING" as const
      : !exactReceiptMatchesAsset
        ? "SERVER_COPY_PENDING" as const
      : processingDisposition === "RELEASED"
        ? "SERVER_COPY_VERIFIED_RELEASED" as const
        : "SERVER_COPY_VERIFIED_HELD" as const;
  return {
    id: recording.id,
    evidenceKind: "recording-asset",
    sourceKind: kind,
    label: text(recording.fileName) || `${kind === "unknown" ? "Retained" : kind} source`,
    status: recording.status,
    clientKind: sourceClientKind(profile),
    deviceLabel: sourceDeviceLabel(profile, kind),
    captureId: text(manifest.captureId) || null,
    startedAt: iso(recording.recordedStartedAt),
    stoppedAt: iso(recording.recordedStoppedAt),
    durationSeconds: Number.isFinite(recording.durationSeconds) ? recording.durationSeconds ?? null : null,
    byteSize,
    verified: exactBytesVerified,
    planDisposition: null,
    serverRetention: {
      state: retentionState,
      uploadSessionId: finalization?.uploadSessionId ?? null,
      exactBytesVerified,
      processingDisposition,
      transcriptDisposition,
      updatedAt: iso(finalization?.updatedAt),
    },
  };
}

function endpointKey(grant: SessionTopologyGrantInput) {
  const instanceId = text(grant.clientInstanceId);
  return instanceId
    ? [grant.participantId, "instance", instanceId].join("\0")
    : [
        grant.participantId,
        "unidentified-instance",
        grant.clientKind.toLowerCase(),
        text(grant.deviceLabel).toLowerCase(),
      ].join("\0");
}

function queueEndpointKey(participantId: string, clientInstanceId: string) {
  return [participantId, clientInstanceId].join("\0");
}

export function buildSessionReadinessTopology(input: {
  participants: SessionTopologyParticipantInput[];
  grants: SessionTopologyGrantInput[];
  recordings: SessionTopologyRecordingInput[];
  captures: SessionTopologyCaptureInput[];
  finalizations?: SessionTopologyFinalizationInput[];
  preflights?: SessionTopologyPreflightInput[];
  endpointQueues?: SessionTopologyEndpointQueueInput[];
  expectedSources?: SessionTopologyExpectedSourceInput[];
  generatedAt?: Date;
}): SessionReadinessTopology {
  const generatedAt = input.generatedAt ?? new Date();
  const participantByUserId = new Map(
    input.participants.flatMap((participant) => participant.userId
      ? [[participant.userId, participant] as const]
      : []),
  );
  const participantById = new Map(input.participants.map((participant) => [participant.id, participant]));
  const latestFinalizationByRecordingAssetId = new Map<string, SessionTopologyFinalizationInput>();
  for (const finalization of input.finalizations ?? []) {
    const recordingAssetId = text(finalization.recordingAssetId);
    if (!recordingAssetId) continue;
    const current = latestFinalizationByRecordingAssetId.get(recordingAssetId);
    if (!current || (iso(current.updatedAt) ?? "") < (iso(finalization.updatedAt) ?? "")) {
      latestFinalizationByRecordingAssetId.set(recordingAssetId, finalization);
    }
  }
  const recordingSources = input.recordings.map((recording) => ({
    participantId: recording.participantId ?? null,
    source: recordingSource(
      recording,
      latestFinalizationByRecordingAssetId.get(recording.id) ?? null,
    ),
  }));
  const recordingCaptureIds = new Set(
    recordingSources.map(({ source }) => source.captureId?.toLowerCase() ?? null).filter(Boolean),
  );
  const expectedSourcesByCaptureId = new Map<string, SessionTopologyExpectedSourceInput[]>();
  for (const expectation of input.expectedSources ?? []) {
    const captureId = text(expectation.captureId).toLowerCase();
    if (!captureId) continue;
    expectedSourcesByCaptureId.set(
      captureId,
      [...(expectedSourcesByCaptureId.get(captureId) ?? []), expectation],
    );
  }
  const resolvedPlanByCaptureId = new Map<string, {
    status: "waived" | "canceled";
    expectationId: string;
    revision: number;
    reason: string;
    updatedAt: string;
  }>();
  for (const [captureId, expectations] of expectedSourcesByCaptureId) {
    if (expectations.some((expectation) => expectedSourceStatus(expectation.status) === "active")) continue;
    const resolution = expectations
      .filter((expectation) => {
        const status = expectedSourceStatus(expectation.status);
        return (status === "waived" || status === "canceled") && Boolean(text(expectation.latestReason));
      })
      .sort((left, right) => {
        if (left.revision !== right.revision) return right.revision - left.revision;
        return (iso(right.updatedAt) ?? "").localeCompare(iso(left.updatedAt) ?? "");
      })[0];
    if (!resolution) continue;
    resolvedPlanByCaptureId.set(captureId, {
      status: expectedSourceStatus(resolution.status) as "waived" | "canceled",
      expectationId: resolution.id,
      revision: resolution.revision,
      reason: text(resolution.latestReason),
      updatedAt: iso(resolution.updatedAt) ?? generatedAt.toISOString(),
    });
  }
  const captureReceiptSources = input.captures
    .filter((capture) => !recordingCaptureIds.has(capture.captureId.toLowerCase()))
    .map((capture) => {
      const planDisposition = resolvedPlanByCaptureId.get(capture.captureId.toLowerCase()) ?? null;
      return {
        participantId: participantByUserId.get(capture.actorUserId)?.id ?? null,
        source: {
        id: `capture-${capture.captureId}`,
        evidenceKind: "capture-receipt" as const,
        sourceKind: "unknown" as const,
        label: planDisposition
          ? "Interrupted iPhone capture kept as resolved evidence"
          : "iPhone local capture awaiting retained media",
        status: capture.status,
        clientKind: "ios",
        deviceLabel: "Quipsly Capture",
        captureId: capture.captureId,
        startedAt: iso(capture.startedAt),
        stoppedAt: iso(capture.stoppedAt),
        durationSeconds: null,
        byteSize: null,
        verified: false,
        planDisposition,
        serverRetention: {
          state: planDisposition ? "CAPTURE_PLAN_RESOLVED" as const : "CAPTURE_AWAITING_MEDIA" as const,
          uploadSessionId: null,
          exactBytesVerified: false,
          processingDisposition: null,
          transcriptDisposition: null,
          updatedAt: null,
        },
      },
      };
    });
  const pendingCaptureSources = captureReceiptSources.filter(({ source }) => (
    source.serverRetention.state === "CAPTURE_AWAITING_MEDIA"
  ));
  const allSources = [...recordingSources, ...captureReceiptSources];
  const boundSourceIds = new Set(
    (input.expectedSources ?? [])
      .map((expectation) => text(expectation.recordingAssetId))
      .filter(Boolean),
  );
  const expectedSources = (input.expectedSources ?? []).map((expectation): SessionReadinessExpectedSource => {
    const sourceKindValue = expectedSourceKind(expectation.sourceKind);
    const retentionRole = expectedSourceRole(expectation.retentionRole);
    const status = expectedSourceStatus(expectation.status);
    const expectedClientKind = text(expectation.expectedClientKind).toLowerCase() || null;
    const recordingAssetId = text(expectation.recordingAssetId) || null;
    const boundEntry = recordingAssetId
      ? recordingSources.find((entry) => entry.source.id === recordingAssetId) ?? null
      : null;
    const boundSource = boundEntry?.source ?? null;
    const candidates = recordingSources
      .filter((entry) => !boundSourceIds.has(entry.source.id))
      .filter((entry) => !expectation.participantId || entry.participantId === expectation.participantId)
      .filter((entry) => sourceMatchesExpectedKind(sourceKindValue, entry.source))
      .filter((entry) => !expectedClientKind
        || (expectedClientKind === "external" ? entry.source.clientKind === "unknown" : entry.source.clientKind === expectedClientKind))
      .map((entry) => ({
        id: entry.source.id,
        label: entry.source.label,
        deviceLabel: entry.source.deviceLabel,
        serverSafe: entry.source.serverRetention.state === "SERVER_COPY_VERIFIED_RELEASED",
      }));
    const fulfillment = status === "waived"
      ? "waived" as const
      : status === "canceled"
        ? "canceled" as const
        : boundSource && !sourceMatchesExpectedKind(sourceKindValue, boundSource)
          ? "bound-source-invalid" as const
          : boundSource?.serverRetention.state === "SERVER_COPY_VERIFIED_RELEASED"
            ? "fulfilled" as const
            : boundSource
              ? "bound-source-pending" as const
              : candidates.length > 0
                ? "candidate-review" as const
                : "missing" as const;
    return {
      id: expectation.id,
      participantId: expectation.participantId ?? null,
      participantLabel: expectation.participantId ? participantById.get(expectation.participantId)?.label ?? null : null,
      label: text(expectation.label) || "Planned retained source",
      sourceKind: sourceKindValue,
      retentionRole,
      status,
      expectedClientKind,
      expectedDeviceLabel: text(expectation.expectedDeviceLabel) || null,
      recordingAssetId,
      captureId: text(expectation.captureId) || null,
      revision: Number.isSafeInteger(expectation.revision) && expectation.revision > 0 ? expectation.revision : 1,
      latestReason: text(expectation.latestReason) || null,
      fulfillment,
      blocking: status === "active" && retentionRole === "required-master" && fulfillment !== "fulfilled",
      candidateSources: candidates,
      createdAt: iso(expectation.createdAt) ?? generatedAt.toISOString(),
      updatedAt: iso(expectation.updatedAt) ?? generatedAt.toISOString(),
    };
  }).sort((left, right) => {
    if (left.blocking !== right.blocking) return left.blocking ? -1 : 1;
    if (left.retentionRole !== right.retentionRole) return left.retentionRole.localeCompare(right.retentionRole);
    return left.createdAt.localeCompare(right.createdAt);
  });

  const latestGrantByEndpoint = new Map<string, SessionTopologyGrantInput>();
  for (const grant of input.grants) {
    const key = endpointKey(grant);
    const current = latestGrantByEndpoint.get(key);
    if (!current || (iso(current.issuedAt) ?? "") < (iso(grant.issuedAt) ?? "")) {
      latestGrantByEndpoint.set(key, grant);
    }
  }

  const latestPreflightByEndpoint = new Map<string, SessionTopologyPreflightInput>();
  for (const preflight of input.preflights ?? []) {
    const key = queueEndpointKey(preflight.participantId, preflight.clientInstanceId);
    const current = latestPreflightByEndpoint.get(key);
    if (!current || (iso(current.testedAt) ?? "") < (iso(preflight.testedAt) ?? "")) {
      latestPreflightByEndpoint.set(key, preflight);
    }
  }

  const latestQueueByEndpoint = new Map<string, SessionTopologyEndpointQueueInput>();
  for (const queue of input.endpointQueues ?? []) {
    const key = queueEndpointKey(queue.participantId, queue.clientInstanceId);
    const current = latestQueueByEndpoint.get(key);
    if (!current || BigInt(queue.queueRevision) > BigInt(current.queueRevision)) {
      latestQueueByEndpoint.set(key, queue);
    }
  }

  const people = input.participants.map((participant) => {
    const endpoints = [...latestGrantByEndpoint.values()]
      .filter((grant) => grant.participantId === participant.id)
      .map((grant) => ({
        id: grant.id,
        clientInstanceId: text(grant.clientInstanceId) || null,
        clientKind: grant.clientKind.toLowerCase() || "unknown",
        deviceLabel: text(grant.deviceLabel) || (grant.clientKind.toLowerCase() === "ios" ? "Quipsly Capture" : "Quipsly Web"),
        preparedAt: iso(grant.issuedAt) ?? generatedAt.toISOString(),
        leaseExpiresAt: iso(grant.expiresAt) ?? generatedAt.toISOString(),
        leaseActive: (iso(grant.expiresAt) ?? "") > generatedAt.toISOString(),
        truth: "join-grant-receipt" as const,
      }))
      .sort((left, right) => right.preparedAt.localeCompare(left.preparedAt));
    const sources = allSources
      .filter((entry) => entry.participantId === participant.id)
      .map((entry) => entry.source)
      .sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
    const preflights = [...latestPreflightByEndpoint.values()]
      .filter((preflight) => preflight.participantId === participant.id)
      .map((preflight): SessionReadinessPreflight => {
        const testedAt = iso(preflight.testedAt) ?? generatedAt.toISOString();
        const expiresAt = iso(preflight.expiresAt) ?? generatedAt.toISOString();
        const status = preflight.status === "READY" ? "READY" as const : "NEEDS_ATTENTION" as const;
        return {
          id: preflight.id,
          governedActionId: text(preflight.governedActionId) || null,
          clientInstanceId: preflight.clientInstanceId,
          clientKind: preflight.clientKind.toLowerCase() || "unknown",
          deviceLabel: text(preflight.deviceLabel) || (preflight.clientKind.toLowerCase() === "ios" ? "Quipsly Capture" : "Quipsly Web"),
          microphoneLabel: text(preflight.microphoneLabel) || "Microphone not identified",
          cameraLabel: text(preflight.cameraLabel) || null,
          outputLabel: text(preflight.outputLabel) || null,
          cameraWanted: preflight.cameraWanted,
          status,
          audioSignalState: text(preflight.audioSignalState) || "inactive",
          privateSamplePlaybackComplete: preflight.privateSamplePlaybackComplete,
          playbackDecision: text(preflight.playbackDecision) || "not-reported",
          issueCodes: Array.isArray(preflight.issueCodes) ? preflight.issueCodes.map(String) : [],
          testedAt,
          expiresAt,
          current: status === "READY" && expiresAt > generatedAt.toISOString(),
        };
      })
      .sort((left, right) => right.testedAt.localeCompare(left.testedAt));
    const endpointQueues = [...latestQueueByEndpoint.values()]
      .filter((queue) => queue.participantId === participant.id)
      .map((queue): SessionReadinessEndpointQueue => ({
        id: queue.id,
        clientInstanceId: queue.clientInstanceId,
        clientKind: queue.clientKind.toLowerCase() || "unknown",
        deviceLabel: text(queue.deviceLabel) || (queue.clientKind.toLowerCase() === "ios" ? "Quipsly Capture" : "Quipsly Web"),
        queueRevision: String(queue.queueRevision),
        queueState: queue.queueState === "DRAINED" ? "DRAINED" : "NOT_EMPTY",
        localSourceCount: queue.localSourceCount,
        pendingSourceCount: queue.pendingSourceCount,
        failedSourceCount: queue.failedSourceCount,
        observedCaptureIds: queue.observedCaptureIds.map((id) => id.toLowerCase()),
        recordingAssetIds: queue.recordingAssetIds,
        latestLocalMutationAt: iso(queue.latestLocalMutationAt) ?? generatedAt.toISOString(),
        reconciledAt: iso(queue.reconciledAt) ?? generatedAt.toISOString(),
      }))
      .sort((left, right) => right.reconciledAt.localeCompare(left.reconciledAt));
    const consent = participant.role === "OBSERVER"
      ? "not-required" as const
      : participant.consent?.recordingReady
        ? "ready" as const
        : "missing-or-stale" as const;
    const attentionCount = (consent === "missing-or-stale" ? 1 : 0)
      + preflights.filter((preflight) => preflight.status === "NEEDS_ATTENTION" && preflight.expiresAt > generatedAt.toISOString()).length
      + endpointQueues.filter((queue) => queue.queueState !== "DRAINED").length
      + sources.filter((source) => source.serverRetention.state === "CAPTURE_AWAITING_MEDIA" || source.status === "HELD" || source.status === "FAILED").length;
    return {
      id: participant.id,
      label: participant.label,
      role: participant.role,
      isCurrentActor: participant.isCurrentActor,
      consent,
      videoConsent: participant.consent?.canRecordVideo === true,
      transcriptionConsent: participant.consent?.transcriptionReady === true,
      endpoints,
      preflights,
      endpointQueues,
      sources,
      attentionCount,
    };
  });
  const assignedParticipantIds = new Set(input.participants.map((participant) => participant.id));
  const unassignedSources = allSources
    .filter((entry) => !entry.participantId || !assignedParticipantIds.has(entry.participantId))
    .map((entry) => entry.source);
  const sources = allSources.map((entry) => entry.source);
  const requiredSources = sources.filter((source) => (
    source.sourceKind !== "provider"
    && source.serverRetention.state !== "CAPTURE_PLAN_RESOLVED"
  ));
  const serverSafeRequiredSources = requiredSources.filter((source) => (
    source.serverRetention.state === "SERVER_COPY_VERIFIED_RELEASED"
  ));
  const safeForServerObservedSources = requiredSources.length > 0
    && pendingCaptureSources.length === 0
    && serverSafeRequiredSources.length === requiredSources.length;
  const requiredPlannedSources = expectedSources.filter((expectation) => (
    expectation.status === "active" && expectation.retentionRole === "required-master"
  ));
  const fulfilledRequiredPlannedSources = requiredPlannedSources.filter((expectation) => (
    expectation.fulfillment === "fulfilled"
  ));
  const safeForPlannedSources = requiredPlannedSources.length > 0
    && fulfilledRequiredPlannedSources.length === requiredPlannedSources.length;
  const requiredEndpointQueueKeys = new Set<string>(latestQueueByEndpoint.keys());
  for (const grant of latestGrantByEndpoint.values()) {
    if ((iso(grant.expiresAt) ?? "") <= generatedAt.toISOString()) continue;
    const instanceId = text(grant.clientInstanceId);
    requiredEndpointQueueKeys.add(instanceId
      ? queueEndpointKey(grant.participantId, instanceId)
      : endpointKey(grant));
  }
  for (const preflight of latestPreflightByEndpoint.values()) {
    if ((iso(preflight.expiresAt) ?? "") <= generatedAt.toISOString()) continue;
    requiredEndpointQueueKeys.add(queueEndpointKey(preflight.participantId, preflight.clientInstanceId));
  }
  const drainedEndpointQueues = [...latestQueueByEndpoint.entries()]
    .filter(([key, queue]) => requiredEndpointQueueKeys.has(key) && queue.queueState === "DRAINED")
    .map(([, queue]) => queue);
  const endpointOwnedRequiredSources = requiredSources.filter((source) => (
    source.clientKind === "web" || source.clientKind === "ios" || source.clientKind === "macos" || Boolean(source.captureId)
  ));
  const drainedCaptureIds = new Set(drainedEndpointQueues.flatMap((queue) => queue.observedCaptureIds));
  const drainedRecordingAssetIds = new Set(drainedEndpointQueues.flatMap((queue) => queue.recordingAssetIds));
  const endpointSourcesCovered = endpointOwnedRequiredSources.every((source) => (
    Boolean(source.captureId && drainedCaptureIds.has(source.captureId.toLowerCase()))
    && (source.evidenceKind !== "recording-asset" || drainedRecordingAssetIds.has(source.id))
  ));
  const allEndpointQueuesConfirmedEmpty = requiredEndpointQueueKeys.size > 0
    && drainedEndpointQueues.length === requiredEndpointQueueKeys.size
    && endpointSourcesCovered;
  const safeToLeaveAllEndpoints = safeForPlannedSources && safeForServerObservedSources && allEndpointQueuesConfirmedEmpty;
  const plannedSourceFields = {
    requiredPlannedSourceCount: requiredPlannedSources.length,
    fulfilledRequiredPlannedSourceCount: fulfilledRequiredPlannedSources.length,
    safeForPlannedSources,
  };
  const exitReadiness = requiredPlannedSources.length > 0 && !safeForPlannedSources
    ? {
          state: "PLANNED_SOURCE_INCOMPLETE" as const,
          label: "A planned master is missing or incomplete",
          detail: `${fulfilledRequiredPlannedSources.length} of ${requiredPlannedSources.length} required planned master${requiredPlannedSources.length === 1 ? " is" : "s are"} bound to exact verified, released bytes. Review missing sources or explicitly waive a changed plan with a reason.`,
          requiredSourceCount: requiredSources.length,
          serverSafeRequiredSourceCount: serverSafeRequiredSources.length,
          pendingCaptureCount: pendingCaptureSources.length,
          endpointQueueCount: requiredEndpointQueueKeys.size,
          drainedEndpointCount: drainedEndpointQueues.length,
          safeForServerObservedSources,
          allEndpointQueuesConfirmedEmpty,
          safeToLeaveAllEndpoints: false,
          ...plannedSourceFields,
        }
    : !safeForServerObservedSources && (requiredSources.length > 0 || pendingCaptureSources.length > 0)
      ? {
          state: "SERVER_COPY_INCOMPLETE" as const,
          label: "Do not close recording devices yet",
          detail: `${serverSafeRequiredSources.length} of ${requiredSources.length} server-observed required masters are verified and released${pendingCaptureSources.length ? `; ${pendingCaptureSources.length} stopped capture${pendingCaptureSources.length === 1 ? " is" : "s are"} still awaiting retained media` : ""}. Keep browser and Capture upload recovery available.`,
          requiredSourceCount: requiredSources.length,
          serverSafeRequiredSourceCount: serverSafeRequiredSources.length,
          pendingCaptureCount: pendingCaptureSources.length,
          endpointQueueCount: requiredEndpointQueueKeys.size,
          drainedEndpointCount: drainedEndpointQueues.length,
          safeForServerObservedSources: false,
          allEndpointQueuesConfirmedEmpty: false,
          safeToLeaveAllEndpoints: false,
          ...plannedSourceFields,
        }
    : requiredPlannedSources.length === 0
      ? {
          state: "RECORDING_PLAN_REQUIRED" as const,
          label: "Confirm the retained-source plan",
          detail: "Quipsly can report observed files and queues, but no active required master is declared. Add the intended audio/video masters before relying on a global Safe to leave decision.",
          requiredSourceCount: requiredSources.length,
          serverSafeRequiredSourceCount: serverSafeRequiredSources.length,
          pendingCaptureCount: pendingCaptureSources.length,
          endpointQueueCount: requiredEndpointQueueKeys.size,
          drainedEndpointCount: drainedEndpointQueues.length,
          safeForServerObservedSources,
          allEndpointQueuesConfirmedEmpty,
          safeToLeaveAllEndpoints: false,
          ...plannedSourceFields,
        }
    : safeToLeaveAllEndpoints
    ? {
        state: "SAFE_TO_LEAVE" as const,
        label: "Safe to leave every reconciled recording endpoint",
        detail: `Every server-observed required master is byte-verified and released. The latest durable snapshot from all ${requiredEndpointQueueKeys.size} recording installation${requiredEndpointQueueKeys.size === 1 ? "" : "s"} reports an empty local recovery queue and covers this exact source set.`,
        requiredSourceCount: requiredSources.length,
        serverSafeRequiredSourceCount: serverSafeRequiredSources.length,
        pendingCaptureCount: pendingCaptureSources.length,
        endpointQueueCount: requiredEndpointQueueKeys.size,
        drainedEndpointCount: drainedEndpointQueues.length,
        safeForServerObservedSources: true,
        allEndpointQueuesConfirmedEmpty: true,
        safeToLeaveAllEndpoints: true,
        ...plannedSourceFields,
      }
    : safeForServerObservedSources
    ? {
        state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED" as const,
        label: "Server copy complete · check each recording device",
        detail: `Every server-observed required master has exact verified bytes and a released finalization receipt. ${drainedEndpointQueues.length} of ${requiredEndpointQueueKeys.size || "the required"} recording endpoint queue${requiredEndpointQueueKeys.size === 1 ? " is" : "s are"} durably reconciled against this source set.`,
        requiredSourceCount: requiredSources.length,
        serverSafeRequiredSourceCount: serverSafeRequiredSources.length,
        pendingCaptureCount: pendingCaptureSources.length,
        endpointQueueCount: requiredEndpointQueueKeys.size,
        drainedEndpointCount: drainedEndpointQueues.length,
        safeForServerObservedSources: true,
        allEndpointQueuesConfirmedEmpty: false,
        safeToLeaveAllEndpoints: false,
        ...plannedSourceFields,
      }
    : {
          state: "NO_CAPTURE_EVIDENCE" as const,
          label: "No retained capture evidence",
          detail: "No retained master or stopped local capture is visible to Nest. Quipsly cannot tell any recording endpoint that it is safe to leave.",
          requiredSourceCount: 0,
          serverSafeRequiredSourceCount: 0,
          pendingCaptureCount: 0,
          endpointQueueCount: requiredEndpointQueueKeys.size,
          drainedEndpointCount: drainedEndpointQueues.length,
          safeForServerObservedSources: false,
          allEndpointQueuesConfirmedEmpty: false,
          safeToLeaveAllEndpoints: false,
          ...plannedSourceFields,
        };
  const attentionCount = people.reduce((total, person) => total + person.attentionCount, 0)
    + unassignedSources.filter((source) => source.serverRetention.state !== "CAPTURE_PLAN_RESOLVED").length
    + expectedSources.filter((expectation) => expectation.blocking).length;
  return {
    generatedAt: generatedAt.toISOString(),
    people,
    expectedSources,
    unassignedSources,
    summary: {
      peopleCount: people.length,
      consentReadyCount: people.filter((person) => person.consent === "ready" || person.consent === "not-required").length,
      knownEndpointCount: people.reduce((total, person) => total + person.endpoints.length, 0),
      currentPreflightCount: people.reduce((total, person) => total + person.preflights.filter((preflight) => preflight.current).length, 0),
      retainedSourceCount: recordingSources.length,
      verifiedSourceCount: sources.filter((source) => source.verified).length,
      pendingCaptureCount: pendingCaptureSources.length,
      endpointQueueCount: requiredEndpointQueueKeys.size,
      drainedEndpointCount: drainedEndpointQueues.length,
      plannedSourceCount: expectedSources.filter((expectation) => expectation.status !== "canceled").length,
      requiredPlannedSourceCount: requiredPlannedSources.length,
      fulfilledRequiredPlannedSourceCount: fulfilledRequiredPlannedSources.length,
      missingRequiredPlannedSourceCount: requiredPlannedSources.length - fulfilledRequiredPlannedSources.length,
      attentionCount,
    },
    exitReadiness,
    boundaries: {
      personIsNotDevice: true,
      grantIsNotPresence: true,
      callTrackIsNotRetainedSource: true,
      captureReceiptIsNotUploadedMedia: true,
      recordingAssetOwnsRetainedSourceTruth: true,
      serverCopyDoesNotProveEndpointQueueEmpty: true,
      observedSourceDoesNotProvePlannedSourceComplete: true,
    },
  };
}
