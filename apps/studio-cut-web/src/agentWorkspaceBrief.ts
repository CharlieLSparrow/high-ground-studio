import {
  getActiveDecisionEvents,
  PROGRAM_STATES,
  sortDecisionEvents,
  type CloudSyncReport,
  type ClipCandidate,
  type DecisionEvent,
  type DerivedSegment,
  type EpisodeManifest,
  type EpisodeTranscript,
  type ProgramState,
  type SyncMap,
} from "@high-ground/studio-cut-schema";
import type { PersistenceStatus } from "./persistence/decisionPersistence";
import type { SharedRoomMetadata } from "./sharedRoom";
import type { TranscriptReview } from "./transcriptReview";

export type AgentWorkspaceBrief = {
  schemaVersion: 1;
  exportedAt: string;
  purpose: string;
  room: {
    projectId: string;
    branchId: string;
    url?: string;
  };
  episode: {
    manifestLoaded: boolean;
    id?: string;
    title?: string;
    durationMs: number;
    manifest?: EpisodeManifest;
  };
  sourceTime: {
    currentSourceTimeMs: number;
    currentState?: ProgramState;
  };
  media: {
    sourceMonitorProxy: {
      loaded: boolean;
      source?: "local" | "cloud";
      fileName?: string;
      storagePath?: string;
      sizeBytes?: number;
      objectUrlPersisted: false;
      note: string;
    };
  };
  persistence: {
    mode: PersistenceStatus["mode"];
    label: string;
    detail: string;
  };
  collaboration: {
    sharedRoomLoaded: boolean;
    packageKind?: string;
    packageFingerprint?: string;
    packageIntegrityAttached: boolean;
    syncMapAttached: boolean;
    syncReportAttached: boolean;
  };
  sync: {
    status: string;
    message: string;
    syncMap?: SyncMap;
    syncReport?: CloudSyncReport;
    reportWarning?: string;
  };
  transcript: {
    loaded: boolean;
    episodeId?: string;
    segmentCount: number;
    transcript?: EpisodeTranscript;
    review?: TranscriptReview;
    note: string;
  };
  clipCandidates: {
    count: number;
    approvedCount: number;
    candidates: ClipCandidate[];
    note: string;
  };
  decisions: {
    allCount: number;
    activeCount: number;
    tombstonedCount: number;
    activeEvents: DecisionEvent[];
    tombstonedEvents: DecisionEvent[];
  };
  derivedSegments: DerivedSegment[];
  warnings: string[];
  agentOperationContract: {
    schemaVersion: 1;
    supportedOperations: Array<"addDecision" | "setRangeState" | "removeDecision">;
    validStates: ProgramState[];
    addDecisionExample: {
      op: "addDecision";
      sourceTimeMs: number;
      state: ProgramState;
      note: string;
    };
    setRangeStateExample: {
      op: "setRangeState";
      startSourceTimeMs: number;
      endSourceTimeMs: number;
      state: ProgramState;
      restoreState: ProgramState;
      note: string;
      confidence: number;
      approvalRequired: boolean;
      reason: string;
    };
    removeDecisionExample: {
      op: "removeDecision";
      id: string;
      reason: string;
    };
  };
};

export function buildAgentWorkspaceBrief({
  exportedAt,
  projectId,
  branchId,
  roomUrl,
  manifest,
  sourceDurationMs,
  currentSourceTimeMs,
  currentState,
  localProxyVideo,
  persistenceStatus,
  sharedRoomMetadata,
  syncReview,
  transcript,
  transcriptReview,
  clipCandidates = [],
  allDecisionEvents,
  derivedSegments,
  warnings,
}: {
  exportedAt: string;
  projectId: string;
  branchId: string;
  roomUrl?: string;
  manifest: EpisodeManifest | null;
  sourceDurationMs: number;
  currentSourceTimeMs: number;
  currentState?: ProgramState;
  localProxyVideo?: {
    name: string;
    sizeBytes: number;
    source: "local" | "cloud";
    storagePath?: string;
  } | null;
  persistenceStatus: PersistenceStatus;
  sharedRoomMetadata?: Pick<
    SharedRoomMetadata,
    | "packageKind"
    | "packageIntegrity"
    | "syncMapStoragePath"
    | "syncReportStoragePath"
  > | null;
  syncReview: {
    status: string;
    message: string;
    syncMap?: SyncMap;
    syncReport?: CloudSyncReport;
    reportWarning?: string;
  };
  transcript?: EpisodeTranscript | null;
  transcriptReview?: TranscriptReview | null;
  clipCandidates?: readonly ClipCandidate[];
  allDecisionEvents: readonly DecisionEvent[];
  derivedSegments: readonly DerivedSegment[];
  warnings: readonly string[];
}): AgentWorkspaceBrief {
  const sortedAllEvents = sortDecisionEvents(allDecisionEvents);
  const activeEvents = getActiveDecisionEvents(sortedAllEvents);
  const activeIds = new Set(activeEvents.map((event) => event.id));
  const tombstonedEvents = sortedAllEvents.filter(
    (event) => !activeIds.has(event.id),
  );

  return {
    schemaVersion: 1,
    exportedAt,
    purpose:
      "Agent-readable Studio Cut room context. Use this to propose transparent decision operations; do not treat media paths as uploaded source truth.",
    room: {
      projectId,
      branchId,
      ...(roomUrl ? { url: roomUrl } : {}),
    },
    episode: {
      manifestLoaded: Boolean(manifest),
      ...(manifest
        ? {
            id: manifest.id,
            title: manifest.title,
            manifest,
          }
        : {}),
      durationMs: sourceDurationMs,
    },
    sourceTime: {
      currentSourceTimeMs,
      ...(currentState ? { currentState } : {}),
    },
    media: {
      sourceMonitorProxy: {
        loaded: Boolean(localProxyVideo),
        ...(localProxyVideo
          ? {
              source: localProxyVideo.source,
              fileName: localProxyVideo.name,
              ...(localProxyVideo.source === "cloud" &&
              localProxyVideo.storagePath
                ? { storagePath: localProxyVideo.storagePath }
                : {}),
              sizeBytes: localProxyVideo.sizeBytes,
            }
          : {}),
        objectUrlPersisted: false,
        note:
          "Local object URLs and filesystem paths are intentionally omitted. Browser proxy files are never persisted through this export.",
      },
    },
    persistence: {
      mode: persistenceStatus.mode,
      label: persistenceStatus.label,
      detail: persistenceStatus.detail,
    },
    collaboration: {
      sharedRoomLoaded: Boolean(sharedRoomMetadata),
      packageKind: sharedRoomMetadata?.packageKind,
      packageFingerprint: sharedRoomMetadata?.packageIntegrity?.packageFingerprint,
      packageIntegrityAttached: Boolean(sharedRoomMetadata?.packageIntegrity),
      syncMapAttached: Boolean(
        sharedRoomMetadata?.syncMapStoragePath || syncReview.syncMap,
      ),
      syncReportAttached: Boolean(
        sharedRoomMetadata?.syncReportStoragePath || syncReview.syncReport,
      ),
    },
    sync: {
      status: syncReview.status,
      message: syncReview.message,
      ...(syncReview.syncMap ? { syncMap: syncReview.syncMap } : {}),
      ...(syncReview.syncReport ? { syncReport: syncReview.syncReport } : {}),
      ...(syncReview.reportWarning
        ? { reportWarning: syncReview.reportWarning }
        : {}),
    },
    transcript: {
      loaded: Boolean(transcript),
      ...(transcript
        ? {
            episodeId: transcript.episodeId,
            segmentCount: transcript.segments.length,
            transcript,
          }
        : { segmentCount: 0 }),
      ...(transcriptReview ? { review: transcriptReview } : {}),
      note:
        "Transcript text is exported only through this explicit agent context action. It is not uploaded with local proxy media.",
    },
    clipCandidates: {
      count: clipCandidates.length,
      approvedCount: clipCandidates.filter(
        (candidate) => candidate.status === "approved",
      ).length,
      candidates: clipCandidates.map((candidate) => ({ ...candidate })),
      note:
        "Clip candidates are semantic canonical-time ranges for future render profiles. They do not include rendered media.",
    },
    decisions: {
      allCount: sortedAllEvents.length,
      activeCount: activeEvents.length,
      tombstonedCount: tombstonedEvents.length,
      activeEvents,
      tombstonedEvents,
    },
    derivedSegments: [...derivedSegments],
    warnings: [...warnings],
    agentOperationContract: {
      schemaVersion: 1,
      supportedOperations: ["addDecision", "setRangeState", "removeDecision"],
      validStates: [...PROGRAM_STATES],
      addDecisionExample: {
        op: "addDecision",
        sourceTimeMs: 0,
        state: "both",
        note: "Initial state after agent review.",
      },
      setRangeStateExample: {
        op: "setRangeState",
        startSourceTimeMs: currentSourceTimeMs,
        endSourceTimeMs: Math.min(sourceDurationMs, currentSourceTimeMs + 5000),
        state: "cut",
        restoreState: currentState ?? "both",
        note: "Proposed inactive range; verify before applying.",
        confidence: 0.5,
        approvalRequired: true,
        reason: "Transcript gap or repeated filler cluster.",
      },
      removeDecisionExample: {
        op: "removeDecision",
        id: "decision-id-to-tombstone",
        reason: "Operator requested rollback of this semantic decision.",
      },
    },
  };
}
