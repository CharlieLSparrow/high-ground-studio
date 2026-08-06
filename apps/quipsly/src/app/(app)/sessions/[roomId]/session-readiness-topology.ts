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
  participantId?: string | null;
  kind: string;
  status: string;
  fileName?: string | null;
  byteSize?: bigint | number | string | null;
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

export type SessionReadinessEndpoint = {
  id: string;
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
  sources: SessionReadinessSource[];
  attentionCount: number;
};

export type SessionReadinessTopology = {
  generatedAt: string;
  people: SessionReadinessPerson[];
  unassignedSources: SessionReadinessSource[];
  summary: {
    peopleCount: number;
    consentReadyCount: number;
    knownEndpointCount: number;
    currentPreflightCount: number;
    retainedSourceCount: number;
    verifiedSourceCount: number;
    pendingCaptureCount: number;
    attentionCount: number;
  };
  boundaries: {
    personIsNotDevice: true;
    grantIsNotPresence: true;
    callTrackIsNotRetainedSource: true;
    captureReceiptIsNotUploadedMedia: true;
    recordingAssetOwnsRetainedSourceTruth: true;
  };
};

export const EMPTY_SESSION_READINESS_TOPOLOGY: SessionReadinessTopology = {
  generatedAt: "1970-01-01T00:00:00.000Z",
  people: [],
  unassignedSources: [],
  summary: {
    peopleCount: 0,
    consentReadyCount: 0,
    knownEndpointCount: 0,
    currentPreflightCount: 0,
    retainedSourceCount: 0,
    verifiedSourceCount: 0,
    pendingCaptureCount: 0,
    attentionCount: 0,
  },
  boundaries: {
    personIsNotDevice: true,
    grantIsNotPresence: true,
    callTrackIsNotRetainedSource: true,
    captureReceiptIsNotUploadedMedia: true,
    recordingAssetOwnsRetainedSourceTruth: true,
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

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function sourceKind(kind: string): SessionReadinessSource["sourceKind"] {
  const normalized = kind.toLowerCase();
  if (normalized.includes("video")) return "video";
  if (normalized.includes("audio")) return "audio";
  if (normalized.includes("provider")) return "provider";
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

function recordingSource(recording: SessionTopologyRecordingInput): SessionReadinessSource {
  const manifest = object(recording.localManifestJson);
  const profile = sourceProfile(manifest);
  const kind = sourceKind(recording.kind);
  const byteSize = recording.byteSize == null ? null : String(recording.byteSize);
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
    verified: recording.status === "VERIFIED" && Boolean(recording.verifiedAt),
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

export function buildSessionReadinessTopology(input: {
  participants: SessionTopologyParticipantInput[];
  grants: SessionTopologyGrantInput[];
  recordings: SessionTopologyRecordingInput[];
  captures: SessionTopologyCaptureInput[];
  preflights?: SessionTopologyPreflightInput[];
  generatedAt?: Date;
}): SessionReadinessTopology {
  const generatedAt = input.generatedAt ?? new Date();
  const participantByUserId = new Map(
    input.participants.flatMap((participant) => participant.userId
      ? [[participant.userId, participant] as const]
      : []),
  );
  const recordingSources = input.recordings.map((recording) => ({
    participantId: recording.participantId ?? null,
    source: recordingSource(recording),
  }));
  const recordingCaptureIds = new Set(
    recordingSources.map(({ source }) => source.captureId).filter(Boolean),
  );
  const pendingCaptureSources = input.captures
    .filter((capture) => !recordingCaptureIds.has(capture.captureId))
    .map((capture) => ({
      participantId: participantByUserId.get(capture.actorUserId)?.id ?? null,
      source: {
        id: `capture-${capture.captureId}`,
        evidenceKind: "capture-receipt" as const,
        sourceKind: "unknown" as const,
        label: "iPhone local capture awaiting retained media",
        status: capture.status,
        clientKind: "ios",
        deviceLabel: "Quipsly Capture",
        captureId: capture.captureId,
        startedAt: iso(capture.startedAt),
        stoppedAt: iso(capture.stoppedAt),
        durationSeconds: null,
        byteSize: null,
        verified: false,
      },
    }));
  const allSources = [...recordingSources, ...pendingCaptureSources];

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
    const key = [preflight.participantId, preflight.clientInstanceId].join("\0");
    const current = latestPreflightByEndpoint.get(key);
    if (!current || (iso(current.testedAt) ?? "") < (iso(preflight.testedAt) ?? "")) {
      latestPreflightByEndpoint.set(key, preflight);
    }
  }

  const people = input.participants.map((participant) => {
    const endpoints = [...latestGrantByEndpoint.values()]
      .filter((grant) => grant.participantId === participant.id)
      .map((grant) => ({
        id: grant.id,
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
    const consent = participant.role === "OBSERVER"
      ? "not-required" as const
      : participant.consent?.recordingReady
        ? "ready" as const
        : "missing-or-stale" as const;
    const attentionCount = (consent === "missing-or-stale" ? 1 : 0)
      + preflights.filter((preflight) => preflight.status === "NEEDS_ATTENTION" && preflight.expiresAt > generatedAt.toISOString()).length
      + sources.filter((source) => source.evidenceKind === "capture-receipt" || source.status === "HELD" || source.status === "FAILED").length;
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
      sources,
      attentionCount,
    };
  });
  const assignedParticipantIds = new Set(input.participants.map((participant) => participant.id));
  const unassignedSources = allSources
    .filter((entry) => !entry.participantId || !assignedParticipantIds.has(entry.participantId))
    .map((entry) => entry.source);
  const sources = allSources.map((entry) => entry.source);
  const attentionCount = people.reduce((total, person) => total + person.attentionCount, 0)
    + unassignedSources.length;
  return {
    generatedAt: generatedAt.toISOString(),
    people,
    unassignedSources,
    summary: {
      peopleCount: people.length,
      consentReadyCount: people.filter((person) => person.consent === "ready" || person.consent === "not-required").length,
      knownEndpointCount: people.reduce((total, person) => total + person.endpoints.length, 0),
      currentPreflightCount: people.reduce((total, person) => total + person.preflights.filter((preflight) => preflight.current).length, 0),
      retainedSourceCount: recordingSources.length,
      verifiedSourceCount: sources.filter((source) => source.verified).length,
      pendingCaptureCount: pendingCaptureSources.length,
      attentionCount,
    },
    boundaries: {
      personIsNotDevice: true,
      grantIsNotPresence: true,
      callTrackIsNotRetainedSource: true,
      captureReceiptIsNotUploadedMedia: true,
      recordingAssetOwnsRetainedSourceTruth: true,
    },
  };
}
