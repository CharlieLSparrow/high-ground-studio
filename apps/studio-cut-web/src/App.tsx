import {
  type ChangeEvent,
  type CSSProperties,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CLOUD_SYNC_INPUT_ROLES,
  CLOUD_SYNC_REQUIRED_INPUT_ROLES,
  deriveSegments,
  getCurrentDecisionEvent,
  isCloudSyncJobInputComplete,
  isDecisionEvent,
  mergeDecisionEvents,
  PROGRAM_STATE_LABELS,
  PROGRAM_STATES,
  parseCloudSyncReportPayload,
  parseEpisodeManifestPayload,
  parseDecisionEventsPayload,
  parseSyncMapPayload,
  sortDecisionEvents,
  SOURCE_ROLE_LABELS,
  type CloudSyncInputRole,
  type CloudSyncJob,
  type CloudSyncReport,
  type CloudSyncUploadedInput,
  type DecisionEvent,
  type DerivedSegment,
  type EpisodeManifest,
  type ProgramState,
  type SourceRole,
  type SyncMap,
} from "@high-ground/studio-cut-schema";
import {
  buildCloudSyncUploadStoragePath,
  CLOUD_SYNC_ROLE_ACCEPT,
  CLOUD_SYNC_ROLE_HELP,
  CLOUD_SYNC_ROLE_LABELS,
  createCloudSyncInputId,
  createCloudSyncJob,
  createCloudSyncJobId,
  getMissingRequiredCloudSyncSelection,
  isRequiredCloudSyncSelectionComplete,
} from "./cloudSync";
import {
  useDecisionPersistence,
  type StudioCutRoomSelection,
} from "./hooks/useDecisionPersistence";
import {
  useStudioCutAuth,
  type StudioCutAuthStatus,
} from "./hooks/useStudioCutAuth";
import type {
  CollaboratorPresence,
  PersistenceStatus,
} from "./persistence/decisionPersistence";
import {
  createCloudSyncStore,
  type CloudSyncUploadProgress,
} from "./persistence/cloudSyncPersistence";
import {
  createSharedRoomStore,
  type SharedRoomUploadProgress,
} from "./persistence/sharedRoomPersistence";
import {
  buildGeneratedPackageStoragePath,
  buildSharedRoomUrl,
  buildSourceMonitorProxyStoragePath,
  parseSharedRoomQuery,
  sanitizeSharedRoomPart,
  validateGeneratedPackageCompatibility,
  type SharedRoomMetadata,
} from "./sharedRoom";
import { getStudioCutRuntimeConfig } from "./studioCutConfig";

const DEFAULT_SOURCE_DURATION_MS = 60 * 60 * 1000;
const EPISODE_MANIFEST_STORAGE_KEY =
  "high-ground-studio.studio-cut.episode-manifest.v1";
const EPISODE_MANIFEST_BASELINE_STORAGE_KEY =
  "high-ground-studio.studio-cut.episode-manifest-baseline.v1";
const DECISION_HISTORY_STORAGE_KEY =
  "high-ground-studio.studio-cut.decision-history.v1";
const LOCAL_CHECKPOINTS_STORAGE_KEY =
  "high-ground-studio.studio-cut.local-checkpoints.v1";
const SELECTED_ROOM_STORAGE_KEY =
  "high-ground-studio.studio-cut.selected-room.v1";
const LOCAL_PROXY_VIDEO_ACCEPT =
  "video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v";
const PLAYBACK_TICK_MS = 250;
const VIDEO_SEEK_DRIFT_TOLERANCE_MS = 350;
const SMALL_SCRUB_STEP_MS = 1000;
const LARGE_SCRUB_STEP_MS = 10000;
const MAX_DECISION_HISTORY_ENTRIES = 40;
const MAX_LOCAL_CHECKPOINTS = 12;
const PRESENCE_UPDATE_INTERVAL_MS = 5000;
const STALE_PRESENCE_MS = 30000;

const STATE_KEYBOARD_SHORTCUTS: Record<string, ProgramState> = {
  "1": "charlie",
  "2": "homer",
  "3": "both",
  "4": "charlie_clip",
  "5": "homer_clip",
  "6": "both_clip",
  x: "cut",
};

const KEYBOARD_SHORTCUT_LEGEND = [
  { key: "1", label: "Charlie" },
  { key: "2", label: "Homer" },
  { key: "3", label: "Both" },
  { key: "4", label: "Charlie/Clip" },
  { key: "5", label: "Homer/Clip" },
  { key: "6", label: "Both/Clip" },
  { key: "X", label: "Cut" },
  { key: "Space", label: "Play/Pause" },
  { key: "Left/Right", label: "Scrub 1s" },
  { key: "Shift+Left/Right", label: "Scrub 10s" },
  { key: "Cmd/Ctrl+Z", label: "Undo" },
  { key: "Cmd/Ctrl+Shift+Z", label: "Redo" },
  { key: "Delete", label: "Remove active/latest" },
];

type LocalProxyVideo = {
  id: string;
  name: string;
  sizeBytes: number;
  objectUrl: string;
  source: "local" | "cloud";
  storagePath?: string;
  durationMs?: number;
};

type SourcePaneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ProxyPreviewRole = Exclude<SourceRole, "program">;

type DecisionHistoryEntry = {
  id: string;
  label: string;
  before: DecisionEvent[];
  after: DecisionEvent[];
  createdAt: string;
};

type DecisionHistoryState = {
  undoStack: DecisionHistoryEntry[];
  redoStack: DecisionHistoryEntry[];
  lastAction: string;
};

type PaneRectField = keyof SourcePaneRect;

type LocalDecisionCheckpoint = {
  id: string;
  label: string;
  episodeId?: string;
  projectId: string;
  branchId: string;
  createdAt: string;
  decisionEvents: DecisionEvent[];
};

type SharedRoomUploadState = {
  status: "idle" | "uploading" | "success" | "error";
  progressPercent: number;
  message: string;
  shareUrl: string;
};

type CloudSyncRoleUploadState = {
  status: "idle" | "selected" | "uploading" | "uploaded" | "error";
  progressPercent: number;
  message: string;
  storagePath?: string;
};

type CloudSyncIntakeMessage = {
  tone: "info" | "success" | "error";
  text: string;
};

type CloudSyncSelectedFile = {
  inputId: string;
  file: File;
  orderIndex?: number;
};

type CloudSyncSelectedFiles = Partial<
  Record<CloudSyncInputRole, CloudSyncSelectedFile[]>
>;

type RescueSyncPackageSelection = {
  manifestFile?: File;
  manifest?: EpisodeManifest;
  proxyFile?: File;
  syncMapFile?: File;
  syncMap?: SyncMap;
  syncReportFile?: File;
  syncReport?: CloudSyncReport;
  message: CloudSyncIntakeMessage;
};

type SyncReviewState = {
  status: "idle" | "not_attached" | "loading" | "loaded" | "error";
  message: string;
  syncMap?: SyncMap;
  syncReport?: CloudSyncReport;
  loadedAt?: string;
  reportWarning?: string;
};

const STATE_ACCENTS: Record<ProgramState, string> = {
  charlie: "#7db2ff",
  homer: "#91de72",
  both: "#f0c96a",
  charlie_clip: "#72d6ff",
  homer_clip: "#79ddb0",
  both_clip: "#ffb66b",
  cut: "#ff7474",
};

const MONITOR_COPY: Record<SourceRole, string> = {
  homer: "Insta360 4K source proxy with reframing padding.",
  charlie: "Canon R8 source proxy with synced clean audio available later.",
  clip: "Shared clip source for watch-together material.",
  program: "Semantic preview of the active program state.",
};

export function App() {
  const config = useMemo(getStudioCutRuntimeConfig, []);
  const { status: authStatus, signIn, signOut } = useStudioCutAuth(config);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal semantic multicam editor</p>
          <h1>Studio Cut</h1>
        </div>
        <div className="session-meta" aria-label="Project and auth metadata">
          <span>{config.projectId}</span>
          <span>{config.branchId}</span>
          <span className={`auth-badge ${authStatus.mode}`}>
            {authStatus.label}
          </span>
        </div>
      </header>

      <PrototypeNotice authStatus={authStatus} />

      {authStatus.isEditorAllowed ? (
        <EditorWorkspace createdBy={authStatus.userEmail} />
      ) : (
        <AuthGatePanel
          authStatus={authStatus}
          onSignIn={signIn}
          onSignOut={signOut}
        />
      )}
    </div>
  );
}

function EditorWorkspace({ createdBy }: { createdBy?: string }) {
  const runtimeConfig = useMemo(getStudioCutRuntimeConfig, []);
  const sessionId = useMemo(createSessionId, []);
  const [selectedRoom, setSelectedRoom] = useState<StudioCutRoomSelection>(() =>
    loadInitialRoomSelection(runtimeConfig),
  );
  const [roomDraft, setRoomDraft] =
    useState<StudioCutRoomSelection>(selectedRoom);
  const [sourceTimeMs, setSourceTimeMs] = useState(0);
  const [isProgramPlaying, setIsProgramPlaying] = useState(false);
  const [episodeManifest, setEpisodeManifest] = useState<EpisodeManifest | null>(
    loadStoredEpisodeManifest,
  );
  const [importedEpisodeManifestBaseline, setImportedEpisodeManifestBaseline] =
    useState<EpisodeManifest | null>(loadStoredEpisodeManifestBaseline);
  const [localProxyVideo, setLocalProxyVideo] =
    useState<LocalProxyVideo | null>(null);
  const [localProxyFile, setLocalProxyFile] = useState<File | null>(null);
  const [sharedRoomMetadata, setSharedRoomMetadata] =
    useState<SharedRoomMetadata | null>(null);
  const [syncReview, setSyncReview] = useState<SyncReviewState>({
    status: "idle",
    message:
      "Open a Rescue Sync shared room to review attached Sync Map and sync report metadata.",
  });
  const [sharedRoomUploadState, setSharedRoomUploadState] =
    useState<SharedRoomUploadState>({
      status: "idle",
      progressPercent: 0,
      message: "",
      shareUrl: "",
    });
  const [rescueSyncPackage, setRescueSyncPackage] =
    useState<RescueSyncPackageSelection>({
      message: {
        tone: "info",
        text: "Select the manifest, source-monitor proxy, Sync Map, and optional sync report generated by the local Rescue Sync worker.",
      },
    });
  const [cloudSyncTitle, setCloudSyncTitle] = useState("");
  const [cloudSyncIncludeClip, setCloudSyncIncludeClip] = useState(true);
  const [cloudSyncFiles, setCloudSyncFiles] = useState<CloudSyncSelectedFiles>(
    {},
  );
  const [cloudSyncUploadStates, setCloudSyncUploadStates] = useState<
    Record<CloudSyncInputRole, CloudSyncRoleUploadState>
  >(createInitialCloudSyncUploadStates);
  const [cloudSyncJob, setCloudSyncJob] = useState<CloudSyncJob | null>(null);
  const [cloudSyncMessage, setCloudSyncMessage] =
    useState<CloudSyncIntakeMessage>({
      tone: "info",
      text: "Select raw episode assets, then explicitly upload when cloud rules are ready.",
    });
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryState>(
    loadStoredDecisionHistory,
  );
  const [localCheckpoints, setLocalCheckpoints] = useState<
    LocalDecisionCheckpoint[]
  >(loadStoredLocalCheckpoints);
  const [note, setNote] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);
  const proxyVideoInputRef = useRef<HTMLInputElement>(null);
  const rescueManifestInputRef = useRef<HTMLInputElement>(null);
  const rescueProxyInputRef = useRef<HTMLInputElement>(null);
  const rescueSyncMapInputRef = useRef<HTMLInputElement>(null);
  const rescueSyncReportInputRef = useRef<HTMLInputElement>(null);
  const proxyVideoRef = useRef<HTMLVideoElement>(null);
  const latestPresenceRef = useRef<{
    currentSourceTimeMs: number;
    currentState?: ProgramState;
  }>({ currentSourceTimeMs: 0 });
  const {
    config,
    roomSelection,
    decisionEvents,
    collaborators,
    status,
    createDecision,
    removeDecision,
    clearDecisions,
    replaceDecisionEvents,
    importDecisionEvents,
    exportDecisionEvents,
    updatePresence,
  } = useDecisionPersistence(createdBy, selectedRoom, sessionId);

  const sortedEvents = useMemo(
    () => sortDecisionEvents(decisionEvents),
    [decisionEvents],
  );
  const derivedSegments = useMemo(
    () => deriveSegments(sortedEvents),
    [sortedEvents],
  );
  const sourceDurationMs =
    episodeManifest?.durationMs ??
    localProxyVideo?.durationMs ??
    DEFAULT_SOURCE_DURATION_MS;
  const currentEvent = useMemo(
    () => getCurrentDecisionEvent(sortedEvents, sourceTimeMs),
    [sortedEvents, sourceTimeMs],
  );
  const currentSegment = useMemo(
    () => getSegmentAtSourceTime(derivedSegments, sourceTimeMs, sourceDurationMs),
    [derivedSegments, sourceDurationMs, sourceTimeMs],
  );
  const latestEventId = sortedEvents[sortedEvents.length - 1]?.id;
  const currentState = currentEvent?.state;
  const canUndoDecisionChange = decisionHistory.undoStack.length > 0;
  const canRedoDecisionChange = decisionHistory.redoStack.length > 0;
  const playbackModeLabel = isProgramPlaying
    ? "Program Playback"
    : "Source Scrub";
  const playbackModeDescription = isProgramPlaying
    ? "Play is simulating program playback and skipping Cut spans."
    : "Scrub controls use source time and show every span, including Cut.";
  const cutDecisionCount = sortedEvents.filter(
    (event) => event.state === "cut",
  ).length;
  const exportFileNamePreview = getDecisionExportFileName(episodeManifest, {
    projectId: roomSelection.projectId,
    branchId: roomSelection.branchId,
  });
  const readinessWarnings = useMemo(
    () =>
      buildEpisodeReadinessWarnings({
        manifest: episodeManifest,
        events: sortedEvents,
      }),
    [episodeManifest, sortedEvents],
  );

  useEffect(() => {
    saveStoredEpisodeManifest(episodeManifest);
  }, [episodeManifest]);

  useEffect(() => {
    saveStoredRoomSelection(selectedRoom);
  }, [selectedRoom]);

  useEffect(() => {
    if (!config.firebaseConfig) {
      setSharedRoomMetadata(null);
      return;
    }

    let isStale = false;
    let unsubscribe: (() => void) | undefined;

    setSharedRoomMetadata(null);

    void createSharedRoomStore({
      firebaseConfig: config.firebaseConfig,
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
    })
      .then((store) => {
        if (isStale) {
          return;
        }

        unsubscribe = store.subscribeToRoomMetadata(
          (metadata) => {
            if (isStale) {
              return;
            }

            setSharedRoomMetadata(metadata);

            if (!metadata) {
              setSharedRoomUploadState({
                status: "idle",
                progressPercent: 0,
                message:
                  "No shared room package exists yet for this project/branch.",
                shareUrl: buildCurrentSharedRoomUrl(roomSelection),
              });
              return;
            }

            setSharedRoomUploadState((currentState) =>
              currentState.status === "uploading"
                ? currentState
                : {
                    status: "success",
                    progressPercent: 100,
                    message:
                      "Shared room package is loaded for this project/branch.",
                    shareUrl: buildCurrentSharedRoomUrl(roomSelection),
                  },
            );
            setEpisodeManifest(metadata.manifest);
            setImportedEpisodeManifestBaseline(
              cloneEpisodeManifest(metadata.manifest),
            );
            setSourceTimeMs((currentSourceTimeMs) =>
              clampSourceTime(currentSourceTimeMs, metadata.manifest.durationMs),
            );
            setLocalProxyFile(null);
            void store
              .getSourceMonitorProxyDownloadUrl(
                metadata.sourceMonitorProxyStoragePath,
              )
              .then((downloadUrl) => {
                if (isStale) {
                  return;
                }

                setLocalProxyVideo({
                  id: `cloud-${metadata.sourceMonitorProxyStoragePath}-${metadata.updatedAt}`,
                  name: metadata.sourceMonitorProxyFileName,
                  sizeBytes: metadata.sourceMonitorProxySizeBytes,
                  objectUrl: downloadUrl,
                  source: "cloud",
                  storagePath: metadata.sourceMonitorProxyStoragePath,
                });
                setImportMessage(
                  `Loaded shared room "${metadata.title}" from Firestore and Firebase Storage.`,
                );
              })
              .catch((error: unknown) => {
                if (isStale) {
                  return;
                }

                const message =
                  error instanceof Error ? error.message : String(error);
                setImportMessage(message);
                setSharedRoomUploadState((currentState) => ({
                  ...currentState,
                  status: "error",
                  message,
                }));
              });
          },
          (error) => {
            const message = error instanceof Error ? error.message : String(error);
            setImportMessage(`Shared room load failed: ${message}`);
          },
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setImportMessage(`Shared room adapter failed: ${message}`);
      });

    return () => {
      isStale = true;
      unsubscribe?.();
    };
  }, [
    config.firebaseConfig,
    roomSelection.branchId,
    roomSelection.projectId,
  ]);

  useEffect(() => {
    if (!config.firebaseConfig) {
      setSyncReview({
        status: "idle",
        message:
          "Sync review loads attached room metadata in cloud mode. Local-only mode can still preview selected package files before publish.",
      });
      return;
    }

    if (!sharedRoomMetadata) {
      setSyncReview({
        status: "not_attached",
        message: "No shared room metadata is loaded for this project/branch.",
      });
      return;
    }

    if (!sharedRoomMetadata.syncMapStoragePath) {
      setSyncReview({
        status: "not_attached",
        message:
          "This shared room has no Sync Map attached. Prepared proxy rooms can still be edited, but original-asset render handoff needs a Sync Map.",
      });
      return;
    }

    let isStale = false;
    const syncMapStoragePath = sharedRoomMetadata.syncMapStoragePath;
    const syncReportStoragePath = sharedRoomMetadata.syncReportStoragePath;

    setSyncReview({
      status: "loading",
      message: "Loading attached Sync Map and sync report metadata.",
    });

    void createSharedRoomStore({
      firebaseConfig: config.firebaseConfig,
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
    })
      .then(async (store) => {
        const syncMapText = await store.getGeneratedPackageArtifactText(
          syncMapStoragePath,
          "Sync Map",
        );
        const syncMapPayload = JSON.parse(syncMapText) as unknown;
        const syncMapResult = parseSyncMapPayload(syncMapPayload);

        if (!syncMapResult.ok) {
          throw new Error(syncMapResult.reason);
        }

        let syncReport: CloudSyncReport | undefined;
        let reportWarning: string | undefined;

        if (syncReportStoragePath) {
          try {
            const syncReportText = await store.getGeneratedPackageArtifactText(
              syncReportStoragePath,
              "sync report",
            );
            const syncReportPayload = JSON.parse(syncReportText) as unknown;
            const syncReportResult = parseCloudSyncReportPayload(syncReportPayload);

            if (!syncReportResult.ok) {
              throw new Error(syncReportResult.reason);
            }

            syncReport = syncReportResult.report;
          } catch (error) {
            reportWarning = `Sync report attached but could not be loaded: ${
              error instanceof Error ? error.message : String(error)
            }`;
          }
        }

        if (isStale) {
          return;
        }

        setSyncReview({
          status: "loaded",
          syncMap: syncMapResult.syncMap,
          ...(syncReport ? { syncReport } : {}),
          ...(reportWarning ? { reportWarning } : {}),
          loadedAt: new Date().toISOString(),
          message: reportWarning ?? "Attached Sync Map metadata loaded.",
        });
      })
      .catch((error: unknown) => {
        if (isStale) {
          return;
        }

        setSyncReview({
          status: "error",
          message: `Sync review load failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      });

    return () => {
      isStale = true;
    };
  }, [
    config.firebaseConfig,
    roomSelection.branchId,
    roomSelection.projectId,
    sharedRoomMetadata,
  ]);

  useEffect(() => {
    saveStoredEpisodeManifestBaseline(importedEpisodeManifestBaseline);
  }, [importedEpisodeManifestBaseline]);

  useEffect(() => {
    saveStoredDecisionHistory(decisionHistory);
  }, [decisionHistory]);

  useEffect(() => {
    saveStoredLocalCheckpoints(localCheckpoints);
  }, [localCheckpoints]);

  useEffect(() => {
    const videoToRevoke = localProxyVideo;

    return () => {
      if (videoToRevoke?.source === "local") {
        URL.revokeObjectURL(videoToRevoke.objectUrl);
      }
    };
  }, [localProxyVideo]);

  useEffect(() => {
    setSourceTimeMs((currentSourceTimeMs) =>
      clampSourceTime(currentSourceTimeMs, sourceDurationMs),
    );
  }, [sourceDurationMs]);

  useEffect(() => {
    const video = proxyVideoRef.current;

    if (!video || !localProxyVideo) {
      return;
    }

    const driftMs = Math.abs(video.currentTime * 1000 - sourceTimeMs);

    if (!isProgramPlaying || driftMs > VIDEO_SEEK_DRIFT_TOLERANCE_MS) {
      seekProxyVideo(sourceTimeMs);
    }
  }, [isProgramPlaying, localProxyVideo, sourceTimeMs]);

  useEffect(() => {
    if (!isProgramPlaying) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSourceTimeMs((currentSourceTimeMs) => {
        const measuredProxySourceTimeMs =
          localProxyVideo && proxyVideoRef.current
            ? getProxyVideoSourceTime(proxyVideoRef.current)
            : undefined;
        const candidateSourceTimeMs =
          measuredProxySourceTimeMs === undefined
            ? currentSourceTimeMs + PLAYBACK_TICK_MS
            : Math.max(currentSourceTimeMs, measuredProxySourceTimeMs);
        const nextSourceTimeMs = skipCutSourceTime(
          derivedSegments,
          clampSourceTime(candidateSourceTimeMs, sourceDurationMs),
          sourceDurationMs,
        );

        if (nextSourceTimeMs === undefined) {
          stopProgramPlayback();
          return currentSourceTimeMs;
        }

        if (nextSourceTimeMs >= sourceDurationMs) {
          stopProgramPlayback();
          return sourceDurationMs;
        }

        if (
          Math.abs(nextSourceTimeMs - candidateSourceTimeMs) >
          VIDEO_SEEK_DRIFT_TOLERANCE_MS
        ) {
          seekProxyVideo(nextSourceTimeMs);
        }

        return nextSourceTimeMs;
      });
    }, PLAYBACK_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [derivedSegments, isProgramPlaying, localProxyVideo, sourceDurationMs]);

  useEffect(() => {
    latestPresenceRef.current = {
      currentSourceTimeMs: sourceTimeMs,
      ...(currentState ? { currentState } : {}),
    };
  }, [currentState, sourceTimeMs]);

  useEffect(() => {
    updatePresence(latestPresenceRef.current);
    const intervalId = window.setInterval(() => {
      updatePresence(latestPresenceRef.current);
    }, PRESENCE_UPDATE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [updatePresence]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if (shouldIgnoreKeyboardShortcut(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          redoDecisionChange();
        } else {
          undoDecisionChange();
        }

        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoDecisionChange();
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removeCurrentOrLatestDecision();
        return;
      }

      const shortcutState = STATE_KEYBOARD_SHORTCUTS[event.key.toLowerCase()];

      if (shortcutState) {
        event.preventDefault();
        addDecision(shortcutState);
        return;
      }

      if (
        !isButtonTarget(event.target) &&
        (event.key === " " || event.code === "Space")
      ) {
        event.preventDefault();
        toggleProgramPlayback();
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const stepMs = event.shiftKey ? LARGE_SCRUB_STEP_MS : SMALL_SCRUB_STEP_MS;
        scrubToSourceTime(sourceTimeMs + direction * stepMs);
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);

    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  });

  function setClampedSourceTime(nextValue: number) {
    setSourceTimeMs(clampSourceTime(nextValue, sourceDurationMs));
  }

  function applyRoomSelection() {
    const nextRoom = normalizeRoomSelection(roomDraft, runtimeConfig);

    setRoomDraft(nextRoom);

    if (
      nextRoom.projectId === selectedRoom.projectId &&
      nextRoom.branchId === selectedRoom.branchId
    ) {
      return;
    }

    stopProgramPlayback();
    setSelectedRoom(nextRoom);
    setDecisionHistory(createEmptyDecisionHistory());
    setSharedRoomUploadState({
      status: "idle",
      progressPercent: 0,
      message: "",
      shareUrl: buildCurrentSharedRoomUrl(nextRoom),
    });
    updateBrowserRoomUrl(nextRoom);
    setImportMessage(
      `Switched collaboration room to ${nextRoom.projectId} / ${nextRoom.branchId}.`,
    );
  }

  function scrubToSourceTime(nextValue: number) {
    stopProgramPlayback();
    setClampedSourceTime(nextValue);
  }

  function toggleProgramPlayback() {
    if (isProgramPlaying) {
      stopProgramPlayback();
      return;
    }

    const playableSourceTimeMs = skipCutSourceTime(
      derivedSegments,
      sourceTimeMs,
      sourceDurationMs,
    );

    if (playableSourceTimeMs === undefined) {
      setIsProgramPlaying(false);
      return;
    }

    setSourceTimeMs(playableSourceTimeMs);
    seekProxyVideo(playableSourceTimeMs);
    setIsProgramPlaying(true);
    playProxyVideo();
  }

  function recordDecisionMutation(
    label: string,
    beforeEvents: readonly DecisionEvent[],
    afterEvents: readonly DecisionEvent[],
  ) {
    const before = cloneDecisionEvents(beforeEvents);
    const after = cloneDecisionEvents(afterEvents);

    if (areDecisionEventListsEqual(before, after)) {
      return;
    }

    setDecisionHistory((currentHistory) => ({
      undoStack: trimDecisionHistoryStack([
        ...currentHistory.undoStack,
        {
          id: createHistoryEntryId(),
          label,
          before,
          after,
          createdAt: new Date().toISOString(),
        },
      ]),
      redoStack: [],
      lastAction: label,
    }));
  }

  function addDecision(state: ProgramState) {
    stopProgramPlayback();
    const event = createDecision(state, sourceTimeMs, note);
    const nextEvents = mergeDecisionEvents([...decisionEvents, event]);
    recordDecisionMutation(
      `Added ${PROGRAM_STATE_LABELS[state]} at ${formatSourceTime(sourceTimeMs)}`,
      decisionEvents,
      nextEvents,
    );
    setNote("");
  }

  function removeDecisionWithHistory(eventId: string) {
    const eventToRemove = decisionEvents.find((event) => event.id === eventId);

    if (!eventToRemove) {
      return;
    }

    const nextEvents = decisionEvents.filter((event) => event.id !== eventId);

    stopProgramPlayback();
    recordDecisionMutation(
      `Removed ${PROGRAM_STATE_LABELS[eventToRemove.state]} at ${formatSourceTime(
        eventToRemove.sourceTimeMs,
      )}`,
      decisionEvents,
      nextEvents,
    );
    removeDecision(eventId);
  }

  function removeCurrentOrLatestDecision() {
    const eventToRemove = currentEvent ?? sortedEvents[sortedEvents.length - 1];

    if (eventToRemove) {
      removeDecisionWithHistory(eventToRemove.id);
    }
  }

  function clearLocalDecisions() {
    if (window.confirm("Clear this browser's Studio Cut decision events?")) {
      stopProgramPlayback();
      recordDecisionMutation(
        `Cleared ${decisionEvents.length} decision${
          decisionEvents.length === 1 ? "" : "s"
        }`,
        decisionEvents,
        [],
      );
      clearDecisions();
    }
  }

  function undoDecisionChange() {
    const entry = decisionHistory.undoStack[decisionHistory.undoStack.length - 1];

    if (!entry) {
      return;
    }

    stopProgramPlayback();
    replaceDecisionEvents(entry.before);
    setDecisionHistory((currentHistory) => ({
      undoStack: currentHistory.undoStack.slice(0, -1),
      redoStack: trimDecisionHistoryStack([...currentHistory.redoStack, entry]),
      lastAction: `Undid ${entry.label}`,
    }));
  }

  function redoDecisionChange() {
    const entry = decisionHistory.redoStack[decisionHistory.redoStack.length - 1];

    if (!entry) {
      return;
    }

    stopProgramPlayback();
    replaceDecisionEvents(entry.after);
    setDecisionHistory((currentHistory) => ({
      undoStack: trimDecisionHistoryStack([...currentHistory.undoStack, entry]),
      redoStack: currentHistory.redoStack.slice(0, -1),
      lastAction: `Redid ${entry.label}`,
    }));
  }

  function downloadDecisionPayload(
    payload: ReturnType<typeof exportDecisionEvents>,
    fileName: string,
  ) {
    downloadJsonFile(payload, fileName);
  }

  function handleExportJson() {
    const payload = exportDecisionEvents();
    downloadDecisionPayload(payload, getDecisionExportFileName(episodeManifest, payload));
  }

  function handleExportCheckpoint() {
    const payload = exportDecisionEvents();
    const checkpointTimestamp = formatCheckpointTimestamp(new Date());
    downloadDecisionPayload(
      payload,
      getDecisionCheckpointFileName(episodeManifest, payload, checkpointTimestamp),
    );
    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      lastAction: `Exported checkpoint ${checkpointTimestamp}`,
    }));
  }

  function handleSaveLocalCheckpoint() {
    if (sortedEvents.length === 0) {
      setImportMessage("Add at least one decision before saving a checkpoint.");
      return;
    }

    const createdAt = new Date().toISOString();
    const label = `${episodeManifest?.id ?? config.projectId} checkpoint ${formatCheckpointTimestamp(
      new Date(createdAt),
    )}`;
    const checkpoint: LocalDecisionCheckpoint = {
      id: createLocalCheckpointId(),
      label,
      episodeId: episodeManifest?.id,
      projectId: config.projectId,
      branchId: config.branchId,
      createdAt,
      decisionEvents: cloneDecisionEvents(sortedEvents),
    };

    setLocalCheckpoints((currentCheckpoints) =>
      [checkpoint, ...currentCheckpoints].slice(0, MAX_LOCAL_CHECKPOINTS),
    );
    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      lastAction: `Saved local checkpoint ${formatCheckpointTimestamp(
        new Date(createdAt),
      )}`,
    }));
  }

  function handleRestoreLocalCheckpoint(checkpoint: LocalDecisionCheckpoint) {
    stopProgramPlayback();
    recordDecisionMutation(
      `Restored local checkpoint ${checkpoint.label}`,
      decisionEvents,
      checkpoint.decisionEvents,
    );
    replaceDecisionEvents(checkpoint.decisionEvents);
    setImportMessage(
      `Restored local checkpoint "${checkpoint.label}" with ${checkpoint.decisionEvents.length} decision${
        checkpoint.decisionEvents.length === 1 ? "" : "s"
      }.`,
    );
  }

  function handleExportLocalCheckpoint(checkpoint: LocalDecisionCheckpoint) {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      projectId: checkpoint.projectId,
      branchId: checkpoint.branchId,
      decisionEvents: cloneDecisionEvents(checkpoint.decisionEvents),
    };
    const timestamp = formatCheckpointTimestamp(new Date(checkpoint.createdAt));
    const fileName = getDecisionCheckpointFileName(
      episodeManifest,
      payload,
      timestamp,
    );

    downloadJsonFile(payload, fileName);
  }

  function handleDeleteLocalCheckpoint(checkpointId: string) {
    setLocalCheckpoints((currentCheckpoints) =>
      currentCheckpoints.filter((checkpoint) => checkpoint.id !== checkpointId),
    );
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const parsedImport = parseDecisionEventsPayload(payload);
      const normalizedImportedEvents = parsedImport.events.map((importedEvent) => ({
        ...importedEvent,
        projectId: config.projectId,
        branchId: config.branchId,
      }));
      const nextEvents = mergeDecisionEvents([
        ...decisionEvents,
        ...normalizedImportedEvents,
      ]);
      const result = importDecisionEvents(payload);
      stopProgramPlayback();
      recordDecisionMutation(
        `Imported ${normalizedImportedEvents.length} decision${
          normalizedImportedEvents.length === 1 ? "" : "s"
        }`,
        decisionEvents,
        nextEvents,
      );
      const normalizedCopy =
        result.normalizedCount > 0
          ? ` ${result.normalizedCount} event${
              result.normalizedCount === 1 ? " was" : "s were"
            } moved onto this project/branch.`
          : "";

      setImportMessage(
        `Imported ${result.importedCount} event${
          result.importedCount === 1 ? "" : "s"
        }. Rejected ${result.rejectedCount}.${normalizedCopy}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportMessage(`Import failed: ${message}`);
    } finally {
      event.target.value = "";
    }
  }

  async function handleImportManifestJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const result = parseEpisodeManifestPayload(payload);

      if (!result.ok) {
        setImportMessage(`Manifest import failed: ${result.reason}`);
        return;
      }

      setEpisodeManifest(result.manifest);
      setImportedEpisodeManifestBaseline(cloneEpisodeManifest(result.manifest));
      stopProgramPlayback();
      setSourceTimeMs((currentSourceTimeMs) =>
        clampSourceTime(currentSourceTimeMs, result.manifest.durationMs),
      );
      setImportMessage(
        `Loaded manifest ${result.manifest.id}: ${result.manifest.title}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportMessage(`Manifest import failed: ${message}`);
    } finally {
      event.target.value = "";
    }
  }

  function handleLoadLocalProxyVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!isSupportedLocalProxyVideo(file)) {
      setImportMessage(
        "Local proxy load failed: choose an MP4, MOV, or M4V video file.",
      );
      event.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    stopProgramPlayback();
    setLocalProxyVideo({
      id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}`,
      name: file.name,
      sizeBytes: file.size,
      objectUrl,
      source: "local",
    });
    setLocalProxyFile(file);
    setImportMessage(
      `Loaded local proxy video "${file.name}". The file stays in this browser tab and is not uploaded, persisted, or written to decisions.`,
    );
    event.target.value = "";
  }

  function clearLocalProxyVideo() {
    stopProgramPlayback();
    setLocalProxyVideo(null);
    setLocalProxyFile(null);
    setImportMessage("Cleared the source-monitor proxy from this browser tab.");
  }

  function handleProxyLoadedMetadata(durationSeconds: number) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return;
    }

    const durationMs = Math.round(durationSeconds * 1000);

    setLocalProxyVideo((currentLocalProxyVideo) =>
      currentLocalProxyVideo
        ? { ...currentLocalProxyVideo, durationMs }
        : currentLocalProxyVideo,
    );
  }

  function handleProxyVideoEnded() {
    stopProgramPlayback();
    setSourceTimeMs(sourceDurationMs);
  }

  function handlePaneRectChange(role: ProxyPreviewRole, nextPane: SourcePaneRect) {
    setEpisodeManifest((currentManifest) =>
      currentManifest
        ? updateManifestPaneRect(currentManifest, role, nextPane)
        : currentManifest,
    );
  }

  function handleResetPaneRectsToImported() {
    if (!importedEpisodeManifestBaseline) {
      return;
    }

    setEpisodeManifest((currentManifest) =>
      currentManifest
        ? {
            ...currentManifest,
            sourceMonitorProxy: {
              ...currentManifest.sourceMonitorProxy,
              panes: cloneEpisodeManifest(importedEpisodeManifestBaseline)
                .sourceMonitorProxy.panes,
            },
          }
        : currentManifest,
    );
  }

  function handleExportAdjustedManifest() {
    if (!episodeManifest) {
      return;
    }

    const fileName = getAdjustedManifestFileName(episodeManifest);

    downloadJsonFile(episodeManifest, fileName);
    setImportMessage(`Exported adjusted manifest ${fileName}.`);
  }

  async function handleUploadSharedRoomPackage() {
    if (!config.firebaseConfig) {
      setSharedRoomUploadState({
        status: "error",
        progressPercent: 0,
        message: "Firebase is not configured in this build; shared rooms are unavailable.",
        shareUrl: "",
      });
      return;
    }

    if (!episodeManifest) {
      setSharedRoomUploadState({
        status: "error",
        progressPercent: 0,
        message: "Import or load an Episode Manifest before creating a shared room.",
        shareUrl: "",
      });
      return;
    }

    if (!localProxyFile || localProxyVideo?.source !== "local") {
      setSharedRoomUploadState({
        status: "error",
        progressPercent: 0,
        message:
          "Load a local source-monitor proxy video before uploading the shared room package.",
        shareUrl: "",
      });
      return;
    }

    try {
      const createdAt = sharedRoomMetadata?.createdAt ?? new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const storagePath = buildSourceMonitorProxyStoragePath({
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
        fileName: localProxyFile.name,
      });
      const store = await createSharedRoomStore({
        firebaseConfig: config.firebaseConfig,
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
      });

      setSharedRoomUploadState({
        status: "uploading",
        progressPercent: 0,
        message: "Uploading lightweight source-monitor proxy to Firebase Storage.",
        shareUrl: "",
      });

      await store.uploadSourceMonitorProxy(
        localProxyFile,
        storagePath,
        (progress: SharedRoomUploadProgress) => {
          setSharedRoomUploadState((currentState) => ({
            ...currentState,
            status: "uploading",
            progressPercent: progress.percent,
            message: `Uploading proxy: ${progress.percent}% (${formatFileSize(
              progress.bytesTransferred,
            )} of ${formatFileSize(progress.totalBytes)}).`,
          }));
        },
      );

      const metadata: SharedRoomMetadata = {
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
        title: episodeManifest.title,
        manifest: cloneEpisodeManifest(episodeManifest),
        sourceMonitorProxyStoragePath: storagePath,
        sourceMonitorProxyFileName: localProxyFile.name,
        sourceMonitorProxyContentType: localProxyFile.type || "video/mp4",
        sourceMonitorProxySizeBytes: localProxyFile.size,
        packageKind: "prepared_proxy",
        packageCreatedAt: updatedAt,
        createdBy: createdBy ?? config.createdBy,
        createdAt,
        updatedAt,
        notes:
          "Shared Studio Cut browser package. Full-resolution source media remains local.",
      };

      await store.saveRoomMetadata(metadata);

      const shareUrl = buildCurrentSharedRoomUrl(roomSelection);

      setSharedRoomMetadata(metadata);
      setSharedRoomUploadState({
        status: "success",
        progressPercent: 100,
        message:
          "Shared room is ready. Send this link to approved High Ground accounts.",
        shareUrl,
      });
      updateBrowserRoomUrl(roomSelection);
      setImportMessage(
        `Created shared room ${roomSelection.projectId} / ${roomSelection.branchId}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSharedRoomUploadState({
        status: "error",
        progressPercent: 0,
        message: `Shared room upload failed: ${message}`,
        shareUrl: "",
      });
    }
  }

  async function handleSelectRescueManifest(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const result = parseEpisodeManifestPayload(payload);

      if (!result.ok) {
        updateRescueSyncPackageMessage("error", `Manifest failed: ${result.reason}`);
        return;
      }

      setRescueSyncPackage((currentPackage) => ({
        ...currentPackage,
        manifestFile: file,
        manifest: result.manifest,
        message: {
          tone: "success",
          text: `Selected manifest ${result.manifest.id}: ${result.manifest.title}.`,
        },
      }));
    } catch (error) {
      updateRescueSyncPackageMessage(
        "error",
        `Manifest failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      event.target.value = "";
    }
  }

  function handleSelectRescueProxy(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!isSupportedLocalProxyVideo(file)) {
      updateRescueSyncPackageMessage(
        "error",
        "Proxy failed: choose the generated MP4/MOV/M4V source-monitor proxy.",
      );
      event.target.value = "";
      return;
    }

    setRescueSyncPackage((currentPackage) => ({
      ...currentPackage,
      proxyFile: file,
      message: {
        tone: "success",
        text: `Selected generated proxy ${file.name}.`,
      },
    }));
    event.target.value = "";
  }

  async function handleSelectRescueSyncMap(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const result = parseSyncMapPayload(payload);

      if (!result.ok) {
        updateRescueSyncPackageMessage("error", `Sync Map failed: ${result.reason}`);
        return;
      }

      setRescueSyncPackage((currentPackage) => ({
        ...currentPackage,
        syncMapFile: file,
        syncMap: result.syncMap,
        message: {
          tone: "success",
          text: `Selected Sync Map ${result.syncMap.syncMapId}.`,
        },
      }));
    } catch (error) {
      updateRescueSyncPackageMessage(
        "error",
        `Sync Map failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      event.target.value = "";
    }
  }

  async function handleSelectRescueSyncReport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const result = parseCloudSyncReportPayload(payload);

      if (!result.ok) {
        updateRescueSyncPackageMessage(
          "error",
          `Sync report failed: ${result.reason}`,
        );
        return;
      }

      setRescueSyncPackage((currentPackage) => ({
        ...currentPackage,
        syncReportFile: file,
        syncReport: result.report,
        message: {
          tone: "success",
          text: `Selected sync report ${result.report.syncJobId}.`,
        },
      }));
    } catch (error) {
      updateRescueSyncPackageMessage(
        "error",
        `Sync report failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      event.target.value = "";
    }
  }

  async function handlePublishRescueSyncPackage() {
    if (!config.firebaseConfig) {
      updateRescueSyncPackageMessage(
        "error",
        "Firebase is not configured in this build; generated packages cannot be published.",
      );
      return;
    }

    const {
      manifest,
      manifestFile,
      proxyFile,
      syncMap,
      syncMapFile,
      syncReport,
      syncReportFile,
    } = rescueSyncPackage;

    if (!manifest || !manifestFile || !proxyFile || !syncMap || !syncMapFile) {
      updateRescueSyncPackageMessage(
        "error",
        "Select a generated manifest, source-monitor proxy, and Sync Map before publishing.",
      );
      return;
    }

    const compatibility = validateGeneratedPackageCompatibility({
      manifest,
      syncMap,
      ...(syncReport ? { syncReport } : {}),
    });

    if (!compatibility.ok) {
      updateRescueSyncPackageMessage(
        "error",
        `Package is not publishable: ${compatibility.errors.join(" ")}`,
      );
      return;
    }

    if (
      sanitizeSharedRoomPart(manifest.id) !== roomSelection.projectId ||
      sanitizeSharedRoomPart(syncMap.branchId) !== roomSelection.branchId
    ) {
      updateRescueSyncPackageMessage(
        "error",
        `Current room is ${roomSelection.projectId} / ${
          roomSelection.branchId
        }; switch to ${sanitizeSharedRoomPart(
          manifest.id,
        )} / ${sanitizeSharedRoomPart(
          syncMap.branchId,
        )} before publishing this package.`,
      );
      return;
    }

    try {
      const createdAt = sharedRoomMetadata?.createdAt ?? new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const store = await createSharedRoomStore({
        firebaseConfig: config.firebaseConfig,
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
      });
      const sourceMonitorProxyStoragePath = buildSourceMonitorProxyStoragePath({
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
        fileName: proxyFile.name,
      });
      const manifestStoragePath = buildGeneratedPackageStoragePath({
        syncJobId: syncMap.syncJobId,
        fileName: manifestFile.name,
      });
      const syncMapStoragePath = buildGeneratedPackageStoragePath({
        syncJobId: syncMap.syncJobId,
        fileName: syncMapFile.name,
      });
      const syncReportStoragePath =
        syncReportFile && syncReport
          ? buildGeneratedPackageStoragePath({
              syncJobId: syncMap.syncJobId,
              fileName: syncReportFile.name,
            })
          : undefined;

      setSharedRoomUploadState({
        status: "uploading",
        progressPercent: 0,
        message: "Uploading generated source-monitor proxy.",
        shareUrl: "",
      });
      updateRescueSyncPackageMessage(
        "info",
        "Publishing generated package to the shared room.",
      );

      await store.uploadSourceMonitorProxy(
        proxyFile,
        sourceMonitorProxyStoragePath,
        (progress) => updateSharedRoomUploadProgress("proxy", progress),
      );
      await store.uploadGeneratedPackageArtifact(
        manifestFile,
        manifestStoragePath,
        "rescue-sync-manifest",
        (progress) => updateSharedRoomUploadProgress("manifest", progress),
      );
      await store.uploadGeneratedPackageArtifact(
        syncMapFile,
        syncMapStoragePath,
        "rescue-sync-map",
        (progress) => updateSharedRoomUploadProgress("Sync Map", progress),
      );

      if (syncReportFile && syncReportStoragePath) {
        await store.uploadGeneratedPackageArtifact(
          syncReportFile,
          syncReportStoragePath,
          "rescue-sync-report",
          (progress) => updateSharedRoomUploadProgress("sync report", progress),
        );
      }

      const metadata: SharedRoomMetadata = {
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
        title: manifest.title,
        manifest: cloneEpisodeManifest(manifest),
        sourceMonitorProxyStoragePath,
        sourceMonitorProxyFileName: proxyFile.name,
        sourceMonitorProxyContentType: proxyFile.type || "video/mp4",
        sourceMonitorProxySizeBytes: proxyFile.size,
        packageKind: "rescue_sync_generated",
        syncJobId: syncMap.syncJobId,
        manifestStoragePath,
        syncMapStoragePath,
        ...(syncReportStoragePath ? { syncReportStoragePath } : {}),
        generatedByWorkerVersion: "studio-cut-cloud-sync-worker-v0",
        packageCreatedAt: updatedAt,
        createdBy: createdBy ?? config.createdBy,
        createdAt,
        updatedAt,
        notes:
          "Generated Rescue Sync package. Full-resolution source media remains outside the shared room.",
      };

      await store.saveRoomMetadata(metadata);

      const shareUrl = buildCurrentSharedRoomUrl(roomSelection);

      setSharedRoomMetadata(metadata);
      setEpisodeManifest(cloneEpisodeManifest(manifest));
      setImportedEpisodeManifestBaseline(cloneEpisodeManifest(manifest));
      setSourceTimeMs((currentSourceTimeMs) =>
        clampSourceTime(currentSourceTimeMs, manifest.durationMs),
      );
      setLocalProxyFile(null);
      setSharedRoomUploadState({
        status: "success",
        progressPercent: 100,
        message:
          "Generated Rescue Sync package is published. Send this room link to approved editors.",
        shareUrl,
      });
      updateRescueSyncPackageMessage(
        "success",
        "Published generated package. Mako can open the room link without JSON import or local media.",
      );
      updateBrowserRoomUrl(roomSelection);
      setImportMessage(
        `Published generated Rescue Sync package for ${roomSelection.projectId} / ${roomSelection.branchId}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSharedRoomUploadState({
        status: "error",
        progressPercent: 0,
        message: `Generated package publish failed: ${message}`,
        shareUrl: "",
      });
      updateRescueSyncPackageMessage(
        "error",
        `Generated package publish failed: ${message}`,
      );
    }
  }

  function updateSharedRoomUploadProgress(
    label: string,
    progress: SharedRoomUploadProgress,
  ) {
    setSharedRoomUploadState((currentState) => ({
      ...currentState,
      status: "uploading",
      progressPercent: progress.percent,
      message: `Uploading ${label}: ${progress.percent}% (${formatFileSize(
        progress.bytesTransferred,
      )} of ${formatFileSize(progress.totalBytes)}).`,
    }));
  }

  function updateRescueSyncPackageMessage(
    tone: CloudSyncIntakeMessage["tone"],
    text: string,
  ) {
    setRescueSyncPackage((currentPackage) => ({
      ...currentPackage,
      message: { tone, text },
    }));
  }

  async function handleCopySharedRoomUrl() {
    const shareUrl =
      sharedRoomUploadState.shareUrl || buildCurrentSharedRoomUrl(roomSelection);

    try {
      await navigator.clipboard.writeText(shareUrl);
      setSharedRoomUploadState((currentState) => ({
        ...currentState,
        shareUrl,
        message: "Shared room link copied.",
      }));
    } catch {
      setSharedRoomUploadState((currentState) => ({
        ...currentState,
        shareUrl,
        message: "Copy failed; select the share link manually.",
      }));
    }
  }

  function handleSelectCloudSyncFile(
    role: CloudSyncInputRole,
    files: File[] | undefined,
  ) {
    if (!files || files.length === 0) {
      return;
    }

    setCloudSyncFiles((currentFiles) => {
      const existingSelections = currentFiles[role] ?? [];
      const allowsMultiple = role === "phoneReferenceAudio" || role === "other";
      const baseOrderIndex = allowsMultiple ? existingSelections.length : 0;
      const nextSelections = files.map((file, index) => {
        const orderIndex =
          role === "phoneReferenceAudio" ? baseOrderIndex + index : undefined;

        return {
          inputId: createCloudSyncInputId({
            role,
            fileName: file.name,
            orderIndex,
          }),
          file,
          ...(orderIndex === undefined ? {} : { orderIndex }),
        };
      });

      return {
        ...currentFiles,
        [role]: allowsMultiple
          ? [...existingSelections, ...nextSelections]
          : nextSelections.slice(0, 1),
      };
    });
    setCloudSyncUploadStates((currentStates) => ({
      ...currentStates,
      [role]: {
        status: "selected",
        progressPercent: 0,
        message: `${files.length} file${files.length === 1 ? "" : "s"} selected.`,
      },
    }));
  }

  function handleClearCloudSyncFile(role: CloudSyncInputRole) {
    setCloudSyncFiles((currentFiles) => {
      const nextFiles = { ...currentFiles };
      delete nextFiles[role];
      return nextFiles;
    });
    setCloudSyncUploadStates((currentStates) => ({
      ...currentStates,
      [role]: {
        status: "idle",
        progressPercent: 0,
        message: "No file selected.",
      },
    }));
  }

  function handleCloudSyncOrderIndexChange(
    role: CloudSyncInputRole,
    inputId: string,
    orderIndex: number,
  ) {
    setCloudSyncFiles((currentFiles) => ({
      ...currentFiles,
      [role]: (currentFiles[role] ?? []).map((selection) =>
        selection.inputId === inputId
          ? { ...selection, orderIndex: Math.max(0, Math.floor(orderIndex)) }
          : selection,
      ),
    }));
  }

  async function handleUploadCloudSyncAssets() {
    if (!config.firebaseConfig) {
      setCloudSyncMessage({
        tone: "error",
        text: "Firebase is not configured in this build; raw asset intake is disabled in local-only mode.",
      });
      return;
    }

    const cloudReady =
      status.mode === "cloud_connected" || status.mode === "cloud_ready";

    if (!cloudReady) {
      setCloudSyncMessage({
        tone: "error",
        text: "Cloud Sync Intake requires an active Firebase connection.",
      });
      return;
    }

    const cloudSyncSelectedFileArrays = getCloudSyncSelectedFileArrays(cloudSyncFiles);

    if (!isRequiredCloudSyncSelectionComplete(cloudSyncSelectedFileArrays)) {
      const missingLabels = getMissingRequiredCloudSyncSelection(cloudSyncSelectedFileArrays)
        .map((role) => CLOUD_SYNC_ROLE_LABELS[role])
        .join(", ");

      setCloudSyncMessage({
        tone: "error",
        text: `Select required assets before upload: ${missingLabels}.`,
      });
      return;
    }

    const syncJobId = createCloudSyncJobId(roomSelection.projectId);
    const now = new Date().toISOString();
    const jobDraft = createCloudSyncJob({
      syncJobId,
      roomSelection,
      title:
        cloudSyncTitle ||
        episodeManifest?.title ||
        `${roomSelection.projectId} sync job`,
      createdBy: createdBy ?? config.createdBy,
      includeClip: cloudSyncIncludeClip,
      now,
    });
    const jobUploading: CloudSyncJob = {
      ...jobDraft,
      status: "uploading",
      updatedAt: now,
    };

    try {
      const store = await createCloudSyncStore({
        firebaseConfig: config.firebaseConfig,
        syncJobId: jobDraft.syncJobId,
      });

      setCloudSyncJob(jobUploading);
      setCloudSyncMessage({
        tone: "info",
        text: `Created sync job ${jobDraft.syncJobId}. Uploading selected raw assets now.`,
      });
      setCloudSyncUploadStates((currentStates) =>
        markSelectedCloudSyncRolesUploading(currentStates, cloudSyncFiles),
      );
      await store.saveSyncJob(jobUploading);

      const uploadedInputs: CloudSyncUploadedInput[] = [];

      for (const role of CLOUD_SYNC_INPUT_ROLES) {
        const selectedRoleFiles = sortCloudSyncSelectedFiles(
          cloudSyncFiles[role] ?? [],
        );

        if (selectedRoleFiles.length === 0) {
          continue;
        }

        for (const selectedFile of selectedRoleFiles) {
          const file = selectedFile.file;
          const storagePath = buildCloudSyncUploadStoragePath({
            syncJobId: jobDraft.syncJobId,
            role,
            fileName: file.name,
            inputId: selectedFile.inputId,
          });

          setCloudSyncUploadStates((currentStates) => ({
            ...currentStates,
            [role]: {
              status: "uploading",
              progressPercent: 0,
              message: `Uploading ${file.name}.`,
              storagePath,
            },
          }));

          await store.uploadInput(
            file,
            storagePath,
            (progress: CloudSyncUploadProgress) => {
              setCloudSyncUploadStates((currentStates) => ({
                ...currentStates,
                [role]: {
                  status: "uploading",
                  progressPercent: progress.percent,
                  message: `Uploading ${progress.percent}% (${formatFileSize(
                    progress.bytesTransferred,
                  )} of ${formatFileSize(progress.totalBytes)}).`,
                  storagePath,
                },
              }));
            },
          );

          const uploadedInput: CloudSyncUploadedInput = {
            inputId: selectedFile.inputId,
            role,
            storagePath,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            uploadedAt: new Date().toISOString(),
            ...(selectedFile.orderIndex === undefined
              ? {}
              : { orderIndex: selectedFile.orderIndex }),
          };

          uploadedInputs.push(uploadedInput);
          setCloudSyncUploadStates((currentStates) => ({
            ...currentStates,
            [role]: {
              status: "uploaded",
              progressPercent: 100,
              message: `${selectedRoleFiles.length} ${CLOUD_SYNC_ROLE_LABELS[
                role
              ].toLowerCase()} file${
                selectedRoleFiles.length === 1 ? "" : "s"
              } uploaded.`,
                storagePath,
              },
          }));
        }
      }

      const uploadedJob: CloudSyncJob = {
        ...jobUploading,
        status: "uploaded",
        uploadedInputs,
        updatedAt: new Date().toISOString(),
      };
      const finalJob: CloudSyncJob = {
        ...uploadedJob,
        status: isCloudSyncJobInputComplete(uploadedJob) ? "uploaded" : "draft",
      };

      await store.updateSyncJob(finalJob);
      setCloudSyncJob(finalJob);
      setCloudSyncMessage({
        tone: "success",
        text: "Raw assets are uploaded for cloud sync prep. Queue Sync Job is a placeholder until the worker is wired.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = new Date().toISOString();

      setCloudSyncJob((currentJob) =>
        currentJob
          ? {
              ...currentJob,
              status: "failed",
              updatedAt: failedAt,
              errorMessage: message,
            }
          : currentJob,
      );
      setCloudSyncMessage({
        tone: "error",
        text: `Raw asset upload failed: ${message}`,
      });
      setCloudSyncUploadStates((currentStates) =>
        markUploadingCloudSyncRolesErrored(currentStates, message),
      );
    }
  }

  async function handleQueueCloudSyncJob() {
    if (!config.firebaseConfig || !cloudSyncJob) {
      return;
    }

    try {
      const store = await createCloudSyncStore({
        firebaseConfig: config.firebaseConfig,
        syncJobId: cloudSyncJob.syncJobId,
      });
      const queuedJob: CloudSyncJob = {
        ...cloudSyncJob,
        status: "queued",
        updatedAt: new Date().toISOString(),
      };

      await store.updateSyncJob(queuedJob);
      setCloudSyncJob(queuedJob);
      setCloudSyncMessage({
        tone: "success",
        text: "Sync job marked queued. The Cloud Run worker contract is scaffolded, but no paid worker is started by the web app yet.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      setCloudSyncMessage({
        tone: "error",
        text: `Could not queue sync job: ${message}`,
      });
    }
  }

  function stopProgramPlayback() {
    setIsProgramPlaying(false);
    pauseProxyVideo();
  }

  function playProxyVideo() {
    const video = proxyVideoRef.current;

    if (!video || !localProxyVideo) {
      return;
    }

    void video.play().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setIsProgramPlaying(false);
      setImportMessage(`Local proxy playback failed: ${message}`);
    });
  }

  function pauseProxyVideo() {
    proxyVideoRef.current?.pause();
  }

  function seekProxyVideo(nextSourceTimeMs: number) {
    const video = proxyVideoRef.current;

    if (!video || !localProxyVideo) {
      return;
    }

    const nextSourceTimeSeconds = clampSourceTime(
      nextSourceTimeMs,
      sourceDurationMs,
    ) / 1000;

    if (Number.isFinite(nextSourceTimeSeconds)) {
      video.currentTime = nextSourceTimeSeconds;
    }
  }

  return (
    <main className="workspace">
      <section
        className={`monitor-grid${localProxyVideo ? " has-local-proxy" : ""}`}
        aria-label="Source and program monitors"
      >
        {localProxyVideo ? (
          <SourceProxyMonitor
            localProxyVideo={localProxyVideo}
            manifest={episodeManifest}
            sourceTimeMs={sourceTimeMs}
            videoRef={proxyVideoRef}
            onLoadedMetadata={handleProxyLoadedMetadata}
            onEnded={handleProxyVideoEnded}
          />
        ) : (
          <>
            <SourceMonitor
              role="homer"
              sourceTimeMs={sourceTimeMs}
              currentState={currentState}
            />
            <SourceMonitor
              role="charlie"
              sourceTimeMs={sourceTimeMs}
              currentState={currentState}
            />
            <SourceMonitor
              role="clip"
              sourceTimeMs={sourceTimeMs}
              currentState={currentState}
            />
          </>
        )}
        <ProgramMonitor
          sourceTimeMs={sourceTimeMs}
          currentEvent={currentEvent}
          localProxyVideo={localProxyVideo}
          manifest={episodeManifest}
          isProgramPlaying={isProgramPlaying}
        />
      </section>

      <aside className="edit-panel" aria-label="Decision controls">
        <CloudSyncIntakePanel
          status={status}
          roomSelection={roomSelection}
          title={cloudSyncTitle}
          includeClip={cloudSyncIncludeClip}
          selectedFiles={cloudSyncFiles}
          uploadStates={cloudSyncUploadStates}
          syncJob={cloudSyncJob}
          message={cloudSyncMessage}
          onTitleChange={setCloudSyncTitle}
          onIncludeClipChange={setCloudSyncIncludeClip}
          onSelectFile={handleSelectCloudSyncFile}
          onClearFile={handleClearCloudSyncFile}
          onOrderIndexChange={handleCloudSyncOrderIndexChange}
          onUpload={() => void handleUploadCloudSyncAssets()}
          onQueue={() => void handleQueueCloudSyncJob()}
        />

        <SharedRoomPackagePanel
          status={status}
          manifest={episodeManifest}
          localProxyVideo={localProxyVideo}
          hasUploadableLocalProxy={Boolean(
            localProxyFile && localProxyVideo?.source === "local",
          )}
          roomSelection={roomSelection}
          metadata={sharedRoomMetadata}
          uploadState={sharedRoomUploadState}
          onUpload={() => void handleUploadSharedRoomPackage()}
          onCopyShareUrl={() => void handleCopySharedRoomUrl()}
        />

        <PublishRescueSyncPackagePanel
          status={status}
          roomSelection={roomSelection}
          packageSelection={rescueSyncPackage}
          uploadState={sharedRoomUploadState}
          metadata={sharedRoomMetadata}
          onSelectManifest={() => rescueManifestInputRef.current?.click()}
          onSelectProxy={() => rescueProxyInputRef.current?.click()}
          onSelectSyncMap={() => rescueSyncMapInputRef.current?.click()}
          onSelectSyncReport={() => rescueSyncReportInputRef.current?.click()}
          onPublish={() => void handlePublishRescueSyncPackage()}
        />
        <input
          ref={rescueManifestInputRef}
          className="file-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleSelectRescueManifest(event)}
          aria-label="Select generated Episode Manifest JSON"
        />
        <input
          ref={rescueProxyInputRef}
          className="file-input"
          type="file"
          accept={LOCAL_PROXY_VIDEO_ACCEPT}
          onChange={handleSelectRescueProxy}
          aria-label="Select generated source-monitor proxy video"
        />
        <input
          ref={rescueSyncMapInputRef}
          className="file-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleSelectRescueSyncMap(event)}
          aria-label="Select generated Sync Map JSON"
        />
        <input
          ref={rescueSyncReportInputRef}
          className="file-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleSelectRescueSyncReport(event)}
          aria-label="Select generated sync report JSON"
        />

        <SharedRoomDiagnosticsPanel
          status={status}
          metadata={sharedRoomMetadata}
          localProxyVideo={localProxyVideo}
          uploadState={sharedRoomUploadState}
        />

        <SyncReviewPanel
          metadata={sharedRoomMetadata}
          review={syncReview}
          packageSelection={rescueSyncPackage}
        />

        <EpisodeManifestPanel
          manifest={episodeManifest}
          sourceDurationMs={sourceDurationMs}
          localProxyVideo={localProxyVideo}
          onImport={() => manifestInputRef.current?.click()}
          onLoadLocalProxy={() => proxyVideoInputRef.current?.click()}
          onClearLocalProxy={clearLocalProxyVideo}
        />
        <input
          ref={manifestInputRef}
          className="file-input"
          type="file"
          accept="application/json,.json"
          onChange={handleImportManifestJson}
          aria-label="Import episode manifest JSON"
        />
        <input
          ref={proxyVideoInputRef}
          className="file-input"
          type="file"
          accept={LOCAL_PROXY_VIDEO_ACCEPT}
          onChange={handleLoadLocalProxyVideo}
          aria-label="Load local source-monitor proxy video"
        />

        <ProxyPaneCalibrationPanel
          manifest={episodeManifest}
          importedManifestBaseline={importedEpisodeManifestBaseline}
          onPaneChange={handlePaneRectChange}
          onReset={handleResetPaneRectsToImported}
          onExportAdjustedManifest={handleExportAdjustedManifest}
        />

        <CollaborationModePanel
          status={status}
          roomSelection={roomSelection}
          roomDraft={roomDraft}
          sessionId={sessionId}
          userEmail={createdBy ?? config.createdBy}
          collaborators={collaborators}
          onDraftChange={setRoomDraft}
          onApplyRoom={applyRoomSelection}
        />

        <EpisodeReadinessPanel
          manifest={episodeManifest}
          localProxyVideo={localProxyVideo}
          decisionCount={sortedEvents.length}
          cutDecisionCount={cutDecisionCount}
          exportFileNamePreview={exportFileNamePreview}
          warnings={readinessWarnings}
        />

        <LocalRenderHandoffPanel
          manifest={episodeManifest}
          decisionCount={sortedEvents.length}
          exportFileNamePreview={exportFileNamePreview}
          syncMapAvailable={Boolean(
            syncReview.syncMap ||
              rescueSyncPackage.syncMap ||
              sharedRoomMetadata?.syncMapStoragePath,
          )}
        />

        <section className="time-panel">
          <div className="panel-heading">
            <div>
              <h2>Source Time</h2>
              <p>Scrub preserves source time; Play skips inactive spans</p>
            </div>
            <strong>{formatSourceTime(sourceTimeMs)}</strong>
          </div>
          <div className="playback-controls">
            <button type="button" onClick={toggleProgramPlayback}>
              {isProgramPlaying ? "Pause" : "Play"}
            </button>
            <div>
              <strong>{playbackModeLabel}</strong>
              <p>{playbackModeDescription}</p>
            </div>
          </div>
          <input
            className="source-slider"
            type="range"
            min={0}
            max={sourceDurationMs}
            step={1000}
            value={sourceTimeMs}
            onChange={(event) => scrubToSourceTime(Number(event.target.value))}
            aria-label="Current source time"
          />
          <div className="time-row">
            <button
              type="button"
              onClick={() => scrubToSourceTime(sourceTimeMs - 10000)}
            >
              -10s
            </button>
            <label>
              Seconds
              <input
                type="number"
                min={0}
                max={sourceDurationMs / 1000}
                value={Math.round(sourceTimeMs / 1000)}
                onChange={(event) =>
                  scrubToSourceTime(Number(event.target.value) * 1000)
                }
              />
            </label>
            <button
              type="button"
              onClick={() => scrubToSourceTime(sourceTimeMs + 10000)}
            >
              +10s
            </button>
          </div>
        </section>

        <CurrentSegmentPanel
          currentSegment={currentSegment}
          sourceTimeMs={sourceTimeMs}
          sourceDurationMs={sourceDurationMs}
        />

        <section className="state-panel">
          <div className="panel-heading">
            <div>
              <h2>State Decisions</h2>
              <p>Each state holds until the next event</p>
            </div>
          </div>
          <KeyboardShortcutLegend />
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note for next decision"
            aria-label="Optional note for next decision"
          />
          <div className="state-grid">
            {PROGRAM_STATES.map((state) => (
              <button
                key={state}
                className={`state-button${
                  currentState === state ? " is-current" : ""
                }`}
                style={{ "--accent": STATE_ACCENTS[state] } as CSSProperties}
                type="button"
                onClick={() => addDecision(state)}
              >
                <span>{PROGRAM_STATE_LABELS[state]}</span>
                <small>{formatSourceTime(sourceTimeMs)}</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="lists-panel" aria-label="Decision and segment lists">
        <div className="list-section">
          <div className="panel-heading">
            <div>
              <h2>Decision Events</h2>
              <p>
                {sortedEvents.length} event
                {sortedEvents.length === 1 ? "" : "s"} in this working set.
                Jump preserves source time; Remove Local only changes this
                browser/branch working set.
              </p>
              <p className="last-action">
                Last action: {decisionHistory.lastAction || "None yet"}
              </p>
            </div>
            <div className="toolbar-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={undoDecisionChange}
                disabled={!canUndoDecisionChange}
              >
                Undo
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={redoDecisionChange}
                disabled={!canRedoDecisionChange}
              >
                Redo
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => importInputRef.current?.click()}
              >
                Import JSON
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleExportJson}
              >
                Export Decisions
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleExportCheckpoint}
              >
                Export Checkpoint
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleSaveLocalCheckpoint}
                disabled={sortedEvents.length === 0}
              >
                Save Local Checkpoint
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={clearLocalDecisions}
                disabled={sortedEvents.length === 0}
              >
                Clear Local
              </button>
            </div>
          </div>
          <input
            ref={importInputRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            onChange={handleImportJson}
            aria-label="Import decision events JSON"
          />
          {importMessage ? <p className="import-message">{importMessage}</p> : null}
          <DecisionList
            events={sortedEvents}
            currentEventId={currentEvent?.id}
            latestEventId={latestEventId}
            onJump={scrubToSourceTime}
            onRemove={(eventId) => {
              removeDecisionWithHistory(eventId);
            }}
          />
          <LocalCheckpointList
            checkpoints={localCheckpoints}
            onRestore={handleRestoreLocalCheckpoint}
            onExport={handleExportLocalCheckpoint}
            onDelete={handleDeleteLocalCheckpoint}
          />
        </div>

        <div className="list-section">
          <div className="panel-heading">
            <div>
              <h2>Derived Segments</h2>
              <p>Program state over source time</p>
            </div>
          </div>
          <DecisionTimeline
            segments={derivedSegments}
            sourceDurationMs={sourceDurationMs}
            currentSegmentSourceEventId={currentSegment?.sourceEventId}
            onJump={scrubToSourceTime}
          />
          <SegmentList
            segments={derivedSegments}
            currentSegmentSourceEventId={currentSegment?.sourceEventId}
          />
        </div>
      </section>
    </main>
  );
}

function CurrentSegmentPanel({
  currentSegment,
  sourceTimeMs,
  sourceDurationMs,
}: {
  currentSegment?: DerivedSegment;
  sourceTimeMs: number;
  sourceDurationMs: number;
}) {
  const segmentEndSourceTimeMs =
    currentSegment?.endSourceTimeMs ?? sourceDurationMs;
  const isCutSegment = currentSegment?.state === "cut";

  return (
    <section
      className={`current-segment-panel${isCutSegment ? " is-cut" : ""}`}
      aria-label="Current segment"
    >
      <div className="panel-heading">
        <div>
          <h2>Current Segment</h2>
          <p>
            {currentSegment
              ? isCutSegment
                ? "Program Playback will skip this inactive span."
                : "Program Playback includes this active span."
              : "No state decision applies at this source time yet."}
          </p>
        </div>
        <strong>{formatSourceTime(sourceTimeMs)}</strong>
      </div>
      {currentSegment ? (
        <div className="current-segment-grid">
          <div>
            <span>State</span>
            <strong>{PROGRAM_STATE_LABELS[currentSegment.state]}</strong>
          </div>
          <div>
            <span>In</span>
            <strong>{formatSourceTime(currentSegment.startSourceTimeMs)}</strong>
          </div>
          <div>
            <span>Out</span>
            <strong>
              {currentSegment.endSourceTimeMs === undefined
                ? "Episode end"
                : formatSourceTime(segmentEndSourceTimeMs)}
            </strong>
          </div>
          <div>
            <span>Playback</span>
            <strong>{isCutSegment ? "Skipped" : "Included"}</strong>
          </div>
        </div>
      ) : (
        <p className="current-segment-empty">
          Add a state decision at or before this time to define program behavior.
        </p>
      )}
    </section>
  );
}

function KeyboardShortcutLegend() {
  return (
    <div className="shortcut-legend" aria-label="Keyboard shortcuts">
      {KEYBOARD_SHORTCUT_LEGEND.map((shortcut) => (
        <span key={`${shortcut.key}-${shortcut.label}`}>
          <kbd>{shortcut.key}</kbd>
          {shortcut.label}
        </span>
      ))}
    </div>
  );
}

function CloudSyncIntakePanel({
  status,
  roomSelection,
  title,
  includeClip,
  selectedFiles,
  uploadStates,
  syncJob,
  message,
  onTitleChange,
  onIncludeClipChange,
  onSelectFile,
  onClearFile,
  onOrderIndexChange,
  onUpload,
  onQueue,
}: {
  status: PersistenceStatus;
  roomSelection: StudioCutRoomSelection;
  title: string;
  includeClip: boolean;
  selectedFiles: CloudSyncSelectedFiles;
  uploadStates: Record<CloudSyncInputRole, CloudSyncRoleUploadState>;
  syncJob: CloudSyncJob | null;
  message: CloudSyncIntakeMessage;
  onTitleChange: (title: string) => void;
  onIncludeClipChange: (includeClip: boolean) => void;
  onSelectFile: (role: CloudSyncInputRole, files: File[] | undefined) => void;
  onClearFile: (role: CloudSyncInputRole) => void;
  onOrderIndexChange: (
    role: CloudSyncInputRole,
    inputId: string,
    orderIndex: number,
  ) => void;
  onUpload: () => void;
  onQueue: () => void;
}) {
  const cloudReady =
    status.mode === "cloud_connected" || status.mode === "cloud_ready";
  const isUploading = Object.values(uploadStates).some(
    (uploadState) => uploadState.status === "uploading",
  );
  const selectedFileArrays = getCloudSyncSelectedFileArrays(selectedFiles);
  const requiredComplete = isRequiredCloudSyncSelectionComplete(selectedFileArrays);
  const missingRequired = getMissingRequiredCloudSyncSelection(selectedFileArrays);
  const visibleRoles = CLOUD_SYNC_INPUT_ROLES.filter(
    (role) => includeClip || role !== "clipVideo",
  );
  const canUpload = cloudReady && requiredComplete && !isUploading;
  const canQueue = cloudReady && syncJob?.status === "uploaded";
  const statusLabel =
    syncJob?.status ??
    (cloudReady ? (requiredComplete ? "ready to upload" : "missing inputs") : "local only");

  return (
    <section className="cloud-sync-panel" aria-label="Cloud Sync Intake">
      <div className="panel-heading">
        <div>
          <h2>Cloud Sync Intake</h2>
          <p>
            New primary setup path: Charlie uploads raw episode assets, then the
            sync worker prepares a shared room for link-only editing.
          </p>
        </div>
        <strong>{statusLabel}</strong>
      </div>
      <div className="cloud-sync-warning">
        Uploads may be large and should be used only after rules/security and
        retention are ready. Do not upload full-res/private material for broad
        testing.
      </div>
      <div className="cloud-sync-controls">
        <label>
          Episode title
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Episode 004"
            aria-label="Cloud sync episode title"
          />
        </label>
        <ReadinessMetric
          label="Room"
          value={`${roomSelection.projectId} / ${roomSelection.branchId}`}
        />
        <label className="cloud-sync-toggle">
          <input
            type="checkbox"
            checked={includeClip}
            onChange={(event) => onIncludeClipChange(event.target.checked)}
          />
          Expect clip/screen video
        </label>
      </div>
      <div className="cloud-sync-required">
        <span>Required</span>
        <strong>
          {missingRequired.length === 0
            ? "All required assets selected"
            : missingRequired
                .map((role) => CLOUD_SYNC_ROLE_LABELS[role])
                .join(", ")}
        </strong>
      </div>
      <div className="cloud-sync-role-list">
        {visibleRoles.map((role) => (
          <CloudSyncRoleRow
            key={role}
            role={role}
            files={selectedFiles[role] ?? []}
            uploadState={uploadStates[role]}
            onSelectFile={onSelectFile}
            onClearFile={onClearFile}
            onOrderIndexChange={onOrderIndexChange}
          />
        ))}
      </div>
      <div className="cloud-sync-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onUpload}
          disabled={!canUpload}
        >
          Create Sync Job / Upload Raw Assets
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onQueue}
          disabled={!canQueue}
        >
          Queue Sync Job
        </button>
      </div>
      {syncJob ? (
        <div className="cloud-sync-job-summary">
          <span>Sync job</span>
          <strong>{syncJob.syncJobId}</strong>
          <small>
            {syncJob.status} · {syncJob.uploadedInputs.length} uploaded input
            {syncJob.uploadedInputs.length === 1 ? "" : "s"}
          </small>
        </div>
      ) : null}
      <p className={`cloud-sync-message is-${message.tone}`}>{message.text}</p>
    </section>
  );
}

function CloudSyncRoleRow({
  role,
  files,
  uploadState,
  onSelectFile,
  onClearFile,
  onOrderIndexChange,
}: {
  role: CloudSyncInputRole;
  files: CloudSyncSelectedFile[];
  uploadState: CloudSyncRoleUploadState;
  onSelectFile: (role: CloudSyncInputRole, files: File[] | undefined) => void;
  onClearFile: (role: CloudSyncInputRole) => void;
  onOrderIndexChange: (
    role: CloudSyncInputRole,
    inputId: string,
    orderIndex: number,
  ) => void;
}) {
  const isRequired = CLOUD_SYNC_REQUIRED_INPUT_ROLES.includes(role);
  const allowsMultiple = role === "phoneReferenceAudio" || role === "other";
  const sortedFiles = sortCloudSyncSelectedFiles(files);

  return (
    <article className={`cloud-sync-role-row is-${uploadState.status}`}>
      <div className="cloud-sync-role-copy">
        <strong>
          {CLOUD_SYNC_ROLE_LABELS[role]}
          {isRequired ? " *" : ""}
        </strong>
        <span>{CLOUD_SYNC_ROLE_HELP[role]}</span>
        {sortedFiles.length > 0 ? (
          <div className="cloud-sync-selected-files">
            {sortedFiles.map((selectedFile) => (
              <div key={selectedFile.inputId} className="cloud-sync-selected-file">
                <small>
                  {selectedFile.file.name} · {formatFileSize(selectedFile.file.size)}
                </small>
                {role === "phoneReferenceAudio" ? (
                  <label>
                    Order
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={selectedFile.orderIndex ?? 0}
                      onChange={(event) =>
                        onOrderIndexChange(
                          role,
                          selectedFile.inputId,
                          Number(event.target.value),
                        )
                      }
                      aria-label={`Order for ${selectedFile.file.name}`}
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <small>{uploadState.message || "No file selected."}</small>
        )}
        {uploadState.storagePath ? <code>{uploadState.storagePath}</code> : null}
      </div>
      <div className="cloud-sync-role-actions">
        <label className="secondary-button">
          {allowsMultiple ? "Add Files" : "Choose"}
          <input
            className="file-input"
            type="file"
            multiple={allowsMultiple}
            accept={CLOUD_SYNC_ROLE_ACCEPT[role]}
            onChange={(event) => {
              onSelectFile(
                role,
                event.target.files ? Array.from(event.target.files) : undefined,
              );
              event.target.value = "";
            }}
            aria-label={`Choose ${CLOUD_SYNC_ROLE_LABELS[role]}`}
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onClearFile(role)}
          disabled={files.length === 0 && uploadState.status === "idle"}
        >
          Clear
        </button>
      </div>
      {uploadState.status === "uploading" || uploadState.status === "uploaded" ? (
        <progress
          className="cloud-sync-progress"
          max={100}
          value={uploadState.progressPercent}
          aria-label={`${CLOUD_SYNC_ROLE_LABELS[role]} upload progress`}
        />
      ) : null}
    </article>
  );
}

function SharedRoomPackagePanel({
  status,
  manifest,
  localProxyVideo,
  hasUploadableLocalProxy,
  roomSelection,
  metadata,
  uploadState,
  onUpload,
  onCopyShareUrl,
}: {
  status: PersistenceStatus;
  manifest: EpisodeManifest | null;
  localProxyVideo: LocalProxyVideo | null;
  hasUploadableLocalProxy: boolean;
  roomSelection: StudioCutRoomSelection;
  metadata: SharedRoomMetadata | null;
  uploadState: SharedRoomUploadState;
  onUpload: () => void;
  onCopyShareUrl: () => void;
}) {
  const cloudReady =
    status.mode === "cloud_connected" || status.mode === "cloud_ready";
  const canUpload =
    cloudReady &&
    Boolean(manifest) &&
    hasUploadableLocalProxy &&
    uploadState.status !== "uploading";
  const shareUrl = uploadState.shareUrl || buildCurrentSharedRoomUrl(roomSelection);

  return (
    <section className="shared-room-panel" aria-label="Shared episode room">
      <div className="panel-heading">
        <div>
          <h2>Shared Episode Room</h2>
          <p>
            Primary workflow: upload one lightweight proxy package, then approved
            editors join by link.
          </p>
        </div>
        <strong>{metadata ? "Room Ready" : cloudReady ? "Cloud Ready" : "Local"}</strong>
      </div>
      <div className="shared-room-grid">
        <ReadinessMetric label="Room" value={`${roomSelection.projectId} / ${roomSelection.branchId}`} />
        <ReadinessMetric
          label="Manifest"
          value={manifest ? manifest.title : "Missing"}
        />
        <ReadinessMetric
          label="Proxy"
          value={
            localProxyVideo
              ? localProxyVideo.source === "cloud"
                ? "Shared cloud proxy"
                : "Local upload source"
              : "Missing"
          }
        />
        <ReadinessMetric
          label="Mode"
          value={cloudReady ? "Cloud connected" : "Local only"}
        />
      </div>
      {metadata ? (
        <div className="shared-room-meta">
          <span>Package</span>
          <strong>{metadata.sourceMonitorProxyFileName}</strong>
          <small>
            {formatFileSize(metadata.sourceMonitorProxySizeBytes)} ·{" "}
            {metadata.sourceMonitorProxyStoragePath}
          </small>
        </div>
      ) : null}
      <div className="shared-room-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onUpload}
          disabled={!canUpload}
        >
          Create Shared Room
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onCopyShareUrl}
          disabled={!cloudReady}
        >
          Copy Room Link
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
          disabled={!cloudReady}
        >
          Open Room
        </button>
      </div>
      {uploadState.status === "uploading" ? (
        <progress
          className="shared-room-progress"
          max={100}
          value={uploadState.progressPercent}
          aria-label="Shared room upload progress"
        />
      ) : null}
      <label className="shared-room-link">
        Share link
        <input readOnly value={shareUrl} aria-label="Shared room link" />
      </label>
      <p
        className={`shared-room-message${
          uploadState.status === "error" ? " is-error" : ""
        }`}
      >
        {uploadState.message ||
          (cloudReady
            ? "Load a manifest and local source-monitor proxy, then create the shared room. Full-res media stays local."
            : "Firebase config is absent; shared rooms are disabled in local-only mode.")}
      </p>
    </section>
  );
}

function PublishRescueSyncPackagePanel({
  status,
  roomSelection,
  packageSelection,
  uploadState,
  metadata,
  onSelectManifest,
  onSelectProxy,
  onSelectSyncMap,
  onSelectSyncReport,
  onPublish,
}: {
  status: PersistenceStatus;
  roomSelection: StudioCutRoomSelection;
  packageSelection: RescueSyncPackageSelection;
  uploadState: SharedRoomUploadState;
  metadata: SharedRoomMetadata | null;
  onSelectManifest: () => void;
  onSelectProxy: () => void;
  onSelectSyncMap: () => void;
  onSelectSyncReport: () => void;
  onPublish: () => void;
}) {
  const cloudReady =
    status.mode === "cloud_connected" || status.mode === "cloud_ready";
  const compatibility =
    packageSelection.manifest && packageSelection.syncMap
      ? validateGeneratedPackageCompatibility({
          manifest: packageSelection.manifest,
          syncMap: packageSelection.syncMap,
          ...(packageSelection.syncReport
            ? { syncReport: packageSelection.syncReport }
            : {}),
        })
      : { ok: false, errors: ["Select generated manifest and Sync Map."] };
  const roomMatchesPackage =
    (!packageSelection.manifest ||
      sanitizeSharedRoomPart(packageSelection.manifest.id) ===
        roomSelection.projectId) &&
    (!packageSelection.syncMap ||
      sanitizeSharedRoomPart(packageSelection.syncMap.branchId) ===
        roomSelection.branchId);
  const canPublish =
    cloudReady &&
    Boolean(packageSelection.manifestFile) &&
    Boolean(packageSelection.proxyFile) &&
    Boolean(packageSelection.syncMapFile) &&
    compatibility.ok &&
    roomMatchesPackage &&
    uploadState.status !== "uploading";

  return (
    <section
      className="rescue-package-panel"
      aria-label="Publish Rescue Sync Package"
    >
      <div className="panel-heading">
        <div>
          <h2>Publish Rescue Sync Package</h2>
          <p>
            Primary path after local Rescue Sync: publish generated proxy,
            manifest, Sync Map, and optional report into this shared room.
          </p>
        </div>
        <strong>
          {metadata?.packageKind === "rescue_sync_generated"
            ? "Published"
            : cloudReady
              ? "Ready"
              : "Local"}
        </strong>
      </div>

      <div className="rescue-package-grid">
        <RescuePackageFile
          label="Manifest"
          value={
            packageSelection.manifestFile
              ? `${packageSelection.manifestFile.name} · ${
                  packageSelection.manifest?.durationMs ?? "?"
                }ms`
              : "Required"
          }
          onSelect={onSelectManifest}
        />
        <RescuePackageFile
          label="Source-monitor proxy"
          value={
            packageSelection.proxyFile
              ? `${packageSelection.proxyFile.name} · ${formatFileSize(
                  packageSelection.proxyFile.size,
                )}`
              : "Required"
          }
          onSelect={onSelectProxy}
        />
        <RescuePackageFile
          label="Sync Map"
          value={
            packageSelection.syncMapFile
              ? `${packageSelection.syncMapFile.name} · ${
                  packageSelection.syncMap?.syncJobId ?? "unknown job"
                }`
              : "Required"
          }
          onSelect={onSelectSyncMap}
        />
        <RescuePackageFile
          label="Sync report"
          value={
            packageSelection.syncReportFile
              ? packageSelection.syncReportFile.name
              : "Optional"
          }
          onSelect={onSelectSyncReport}
        />
      </div>

      <div className="shared-room-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
        >
          Publish Generated Package
        </button>
      </div>

      {!roomMatchesPackage && packageSelection.manifest ? (
        <p className="shared-room-message is-error">
          Current room is {roomSelection.projectId} / {roomSelection.branchId}.
          Switch Collaboration Mode to{" "}
          {sanitizeSharedRoomPart(packageSelection.manifest.id)} /{" "}
          {packageSelection.syncMap
            ? sanitizeSharedRoomPart(packageSelection.syncMap.branchId)
            : roomSelection.branchId}{" "}
          before publishing this package.
        </p>
      ) : null}
      {!compatibility.ok && packageSelection.manifest && packageSelection.syncMap ? (
        <p className="shared-room-message is-error">
          {compatibility.errors.join(" ")}
        </p>
      ) : null}
      <p
        className={`shared-room-message${
          packageSelection.message.tone === "error" ? " is-error" : ""
        }`}
      >
        {cloudReady
          ? packageSelection.message.text
          : "Firebase config is absent; generated package publishing is disabled in local-only mode."}
      </p>
    </section>
  );
}

function RescuePackageFile({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: string;
  onSelect: () => void;
}) {
  return (
    <div className="rescue-package-file">
      <span>{label}</span>
      <strong>{value}</strong>
      <button className="secondary-button" type="button" onClick={onSelect}>
        Select
      </button>
    </div>
  );
}

function SharedRoomDiagnosticsPanel({
  status,
  metadata,
  localProxyVideo,
  uploadState,
}: {
  status: PersistenceStatus;
  metadata: SharedRoomMetadata | null;
  localProxyVideo: LocalProxyVideo | null;
  uploadState: SharedRoomUploadState;
}) {
  const cloudConnectionLabel = getCloudConnectionLabel(status.mode);
  const storageLabel =
    uploadState.status === "error"
      ? "Error"
      : uploadState.status === "uploading"
        ? `Uploading ${uploadState.progressPercent}%`
        : localProxyVideo?.source === "cloud"
          ? "Loaded"
          : "Waiting";

  return (
    <section
      className="shared-room-diagnostics-panel"
      aria-label="Shared room diagnostics"
    >
      <div className="panel-heading">
        <div>
          <h2>Shared Room Diagnostics</h2>
          <p>Compact health check for the active collaboration room.</p>
        </div>
        <strong>{status.mode === "cloud_error" ? "Check" : "Status"}</strong>
      </div>
      <div className="diagnostics-grid">
        <ReadinessMetric
          label="Room metadata"
          value={metadata ? "Loaded" : "Missing"}
        />
        <ReadinessMetric
          label="Shared proxy"
          value={localProxyVideo?.source === "cloud" ? "Loaded" : "Not loaded"}
        />
        <ReadinessMetric
          label="Manifest"
          value={metadata?.manifest ? "Loaded" : "Missing"}
        />
        <ReadinessMetric
          label="Package"
          value={getSharedRoomPackageKindLabel(metadata?.packageKind)}
        />
        <ReadinessMetric
          label="Sync Map"
          value={metadata?.syncMapStoragePath ? "Attached" : "Not attached"}
        />
        <ReadinessMetric
          label="Sync report"
          value={metadata?.syncReportStoragePath ? "Attached" : "Not attached"}
        />
        <ReadinessMetric
          label="Generated"
          value={
            metadata?.packageCreatedAt
              ? formatDateTimeLabel(metadata.packageCreatedAt)
              : "Unknown"
          }
        />
        <ReadinessMetric
          label="Decisions"
          value={cloudConnectionLabel}
        />
        <ReadinessMetric
          label="Presence"
          value={cloudConnectionLabel}
        />
        <ReadinessMetric label="Storage" value={storageLabel} />
      </div>
      {status.mode === "cloud_error" || uploadState.status === "error" ? (
        <p className="diagnostics-message is-error">
          {uploadState.status === "error" ? uploadState.message : status.detail}
        </p>
      ) : (
        <p className="diagnostics-message">
          {metadata
            ? "Room package metadata is available for approved collaborators."
            : "Create or open a shared room to load cloud metadata and proxy."}
        </p>
      )}
    </section>
  );
}

function SyncReviewPanel({
  metadata,
  review,
  packageSelection,
}: {
  metadata: SharedRoomMetadata | null;
  review: SyncReviewState;
  packageSelection: RescueSyncPackageSelection;
}) {
  const syncMap = review.syncMap ?? packageSelection.syncMap;
  const syncReport = review.syncReport ?? packageSelection.syncReport;
  const summary = syncMap ? buildSyncReviewSummary(syncMap, syncReport) : null;
  const sourceLabel = review.syncMap
    ? "Attached room"
    : packageSelection.syncMap
      ? "Selected package"
      : metadata?.syncMapStoragePath
        ? review.status === "loading"
          ? "Loading"
          : "Attached"
        : "Waiting";
  const message = summary
    ? review.reportWarning ?? review.message
    : review.message;

  return (
    <section className="sync-review-panel" aria-label="Sync review">
      <div className="panel-heading">
        <div>
          <h2>Sync Review</h2>
          <p>
            Reads Rescue Sync metadata so operators can trust the shared proxy
            room before editing.
          </p>
        </div>
        <strong>{sourceLabel}</strong>
      </div>

      {summary ? (
        <>
          <div className="sync-review-grid">
            <ReadinessMetric label="Sync job" value={syncMap?.syncJobId ?? "None"} />
            <ReadinessMetric
              label="Timeline"
              value={formatSourceTime(summary.timelineDurationMs)}
            />
            <ReadinessMetric label="Assets" value={String(summary.assetCount)} />
            <ReadinessMetric
              label="Reference pieces"
              value={String(summary.referencePieceCount)}
            />
            <ReadinessMetric
              label="Offsets"
              value={String(summary.trackOffsetCount)}
            />
            <ReadinessMetric
              label="Lowest confidence"
              value={formatConfidence(summary.lowestConfidence)}
            />
            <ReadinessMetric
              label="Warnings"
              value={String(summary.warningCount)}
            />
            <ReadinessMetric
              label="Loaded"
              value={review.loadedAt ? formatDateTimeLabel(review.loadedAt) : sourceLabel}
            />
          </div>
          <div className="sync-review-roles">
            <span>Asset roles</span>
            <strong>{summary.roleSummary}</strong>
          </div>
        </>
      ) : (
        <div className="sync-review-empty">
          <strong>No Sync Map loaded</strong>
          <span>
            Published Rescue Sync rooms attach a Sync Map. Local-only sessions
            can select generated package files here before publishing.
          </span>
        </div>
      )}

      <p
        className={`sync-review-message${
          review.status === "error" || review.reportWarning ? " is-error" : ""
        }`}
      >
        {message}
      </p>
    </section>
  );
}

function CollaborationModePanel({
  status,
  roomSelection,
  roomDraft,
  sessionId,
  userEmail,
  collaborators,
  onDraftChange,
  onApplyRoom,
}: {
  status: PersistenceStatus;
  roomSelection: StudioCutRoomSelection;
  roomDraft: StudioCutRoomSelection;
  sessionId: string;
  userEmail: string;
  collaborators: CollaboratorPresence[];
  onDraftChange: (roomSelection: StudioCutRoomSelection) => void;
  onApplyRoom: () => void;
}) {
  const isRoomDirty =
    roomDraft.projectId !== roomSelection.projectId ||
    roomDraft.branchId !== roomSelection.branchId;

  return (
    <section className="collaboration-panel" aria-label="Collaboration mode">
      <div className="panel-heading">
        <div>
          <h2>Collaboration Mode</h2>
          <p>{status.detail}</p>
        </div>
        <strong>{status.label}</strong>
      </div>
      <div className="room-controls">
        <label>
          Project ID
          <input
            value={roomDraft.projectId}
            onChange={(event) =>
              onDraftChange({ ...roomDraft, projectId: event.target.value })
            }
            aria-label="Collaboration project ID"
          />
        </label>
        <label>
          Branch ID
          <input
            value={roomDraft.branchId}
            onChange={(event) =>
              onDraftChange({ ...roomDraft, branchId: event.target.value })
            }
            aria-label="Collaboration branch ID"
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={onApplyRoom}
          disabled={!isRoomDirty}
        >
          Switch Room
        </button>
      </div>
      <div className="collaboration-meta">
        <span>Room</span>
        <strong>
          {roomSelection.projectId} / {roomSelection.branchId}
        </strong>
      </div>
      <div className="collaboration-meta">
        <span>User</span>
        <strong>{userEmail}</strong>
      </div>
      <div className="collaboration-meta">
        <span>Session</span>
        <strong>{shortId(sessionId)}</strong>
      </div>
      <p className="persistence-path">{status.path}</p>
      <CollaboratorPresenceList
        collaborators={collaborators}
        currentSessionId={sessionId}
      />
    </section>
  );
}

function CollaboratorPresenceList({
  collaborators,
  currentSessionId,
}: {
  collaborators: CollaboratorPresence[];
  currentSessionId: string;
}) {
  if (collaborators.length === 0) {
    return (
      <p className="panel-empty">
        Collaborator presence appears here when Firestore is connected.
      </p>
    );
  }

  return (
    <div className="presence-list" aria-label="Collaborator presence">
      {collaborators.map((presence) => {
        const isCurrentSession = presence.sessionId === currentSessionId;
        const isStale =
          Date.now() - new Date(presence.updatedAt).getTime() > STALE_PRESENCE_MS;

        return (
          <article
            className={`presence-row${isStale ? " is-stale" : ""}`}
            key={presence.sessionId}
          >
            <div>
              <strong>
                {presence.userEmail}
                {isCurrentSession ? " (you)" : ""}
              </strong>
              <span>
                {formatSourceTime(presence.currentSourceTimeMs)}
                {presence.currentState
                  ? ` · ${PROGRAM_STATE_LABELS[presence.currentState]}`
                  : ""}
              </span>
            </div>
            <small>{isStale ? "Stale" : "Live"}</small>
          </article>
        );
      })}
    </div>
  );
}

function EpisodeManifestPanel({
  manifest,
  sourceDurationMs,
  localProxyVideo,
  onImport,
  onLoadLocalProxy,
  onClearLocalProxy,
}: {
  manifest: EpisodeManifest | null;
  sourceDurationMs: number;
  localProxyVideo: LocalProxyVideo | null;
  onImport: () => void;
  onLoadLocalProxy: () => void;
  onClearLocalProxy: () => void;
}) {
  const proxyPath =
    manifest?.sourceMonitorProxy.url ??
    manifest?.sourceMonitorProxy.localPlaceholderPath;

  return (
    <section className="manifest-panel">
      <div className="panel-heading">
        <div>
          <h2>Episode Manifest</h2>
          <p>
            {manifest
              ? "Premiere synced source truth is loaded for this browser."
              : "Import JSON from the Premiere bootstrap workflow."}
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={onImport}>
          Import Manifest JSON
        </button>
      </div>
      <div className="manifest-summary">
        <div>
          <span>Episode</span>
          <strong>{manifest ? manifest.title : "Local fake timeline"}</strong>
          <small>{manifest ? manifest.id : "no-manifest-loaded"}</small>
        </div>
        <div>
          <span>Duration</span>
          <strong>{formatSourceTime(sourceDurationMs)}</strong>
          <small>{sourceDurationMs.toLocaleString()} ms</small>
        </div>
      </div>
      {manifest ? (
        <div className="manifest-details">
          <p>
            <strong>Proxy:</strong> {proxyPath}
          </p>
          <p>
            <strong>Panes:</strong>{" "}
            {formatPane("Homer", manifest.sourceMonitorProxy.panes.homer)};{" "}
            {formatPane("Charlie", manifest.sourceMonitorProxy.panes.charlie)}
            {manifest.sourceMonitorProxy.panes.clip
              ? `; ${formatPane("Clip", manifest.sourceMonitorProxy.panes.clip)}`
              : ""}
          </p>
          <p>
            <strong>Sources:</strong> {manifest.sources.homer.label},{" "}
            {manifest.sources.charlie.label}
            {manifest.sources.clip ? `, ${manifest.sources.clip.label}` : ""},{" "}
            {manifest.sources.program.label}
          </p>
          <p>
            <strong>Sync:</strong> {manifest.syncBootstrap.source}
            {manifest.syncBootstrap.xmlFileName
              ? ` / ${manifest.syncBootstrap.xmlFileName}`
              : ""}
          </p>
          {manifest.syncBootstrap.notes ? (
            <p>
              <strong>Notes:</strong> {manifest.syncBootstrap.notes}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="local-proxy-loader">
        <div>
          <strong>Source-monitor proxy</strong>
          <p>
            {localProxyVideo
              ? `${
                  localProxyVideo.source === "cloud"
                    ? "Shared cloud proxy"
                    : "Local browser file"
                }: ${localProxyVideo.name} · ${formatFileSize(
                  localProxyVideo.sizeBytes,
                )}${
                  localProxyVideo.durationMs
                    ? ` · ${formatSourceTime(localProxyVideo.durationMs)}`
                    : ""
                }`
              : "Choose a local MP4, MOV, or M4V from this Mac. It is not uploaded or persisted."}
          </p>
        </div>
        <div className="local-proxy-actions">
          <button className="secondary-button" type="button" onClick={onLoadLocalProxy}>
            Load Local Proxy Video
          </button>
          {localProxyVideo ? (
            <button
              className="secondary-button"
              type="button"
              onClick={onClearLocalProxy}
            >
              Clear Proxy
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProxyPaneCalibrationPanel({
  manifest,
  importedManifestBaseline,
  onPaneChange,
  onReset,
  onExportAdjustedManifest,
}: {
  manifest: EpisodeManifest | null;
  importedManifestBaseline: EpisodeManifest | null;
  onPaneChange: (role: ProxyPreviewRole, nextPane: SourcePaneRect) => void;
  onReset: () => void;
  onExportAdjustedManifest: () => void;
}) {
  const paneRoles = getCalibratablePaneRoles(manifest);
  const canReset =
    Boolean(manifest && importedManifestBaseline) &&
    !arePaneSetsEqual(
      manifest?.sourceMonitorProxy.panes,
      importedManifestBaseline?.sourceMonitorProxy.panes,
    );

  return (
    <section className="pane-calibration-panel" aria-label="Proxy pane calibration">
      <div className="panel-heading">
        <div>
          <h2>Proxy Pane Calibration</h2>
          <p>
            Adjust normalized source-monitor panes when the proxy crops are off.
          </p>
        </div>
        <div className="toolbar-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onReset}
            disabled={!canReset}
          >
            Reset Panes
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onExportAdjustedManifest}
            disabled={!manifest}
          >
            Export Adjusted Manifest
          </button>
        </div>
      </div>
      {manifest ? (
        <div className="pane-calibration-list">
          {paneRoles.map((role) => {
            const pane = getManifestPaneRect(manifest, role);

            return pane ? (
              <PaneCalibrationRow
                key={role}
                role={role}
                pane={pane}
                onChange={(nextPane) => onPaneChange(role, nextPane)}
              />
            ) : null;
          })}
        </div>
      ) : (
        <p className="panel-empty">
          Import a manifest to inspect and adjust source-monitor pane rectangles.
        </p>
      )}
    </section>
  );
}

function PaneCalibrationRow({
  role,
  pane,
  onChange,
}: {
  role: ProxyPreviewRole;
  pane: SourcePaneRect;
  onChange: (nextPane: SourcePaneRect) => void;
}) {
  function updateField(field: PaneRectField, rawValue: string) {
    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue)) {
      return;
    }

    onChange(normalizePaneRect({ ...pane, [field]: parsedValue }));
  }

  return (
    <div className="pane-calibration-row">
      <strong>{SOURCE_ROLE_LABELS[role]}</strong>
      {(["x", "y", "width", "height"] as PaneRectField[]).map((field) => (
        <label key={field}>
          {field}
          <input
            type="number"
            min={field === "width" || field === "height" ? 0.01 : 0}
            max={1}
            step={0.01}
            value={pane[field]}
            onChange={(event) => updateField(field, event.target.value)}
            aria-label={`${SOURCE_ROLE_LABELS[role]} pane ${field}`}
          />
        </label>
      ))}
    </div>
  );
}

function EpisodeReadinessPanel({
  manifest,
  localProxyVideo,
  decisionCount,
  cutDecisionCount,
  exportFileNamePreview,
  warnings,
}: {
  manifest: EpisodeManifest | null;
  localProxyVideo: LocalProxyVideo | null;
  decisionCount: number;
  cutDecisionCount: number;
  exportFileNamePreview: string;
  warnings: string[];
}) {
  return (
    <section className="readiness-panel" aria-label="Episode readiness">
      <div className="panel-heading">
        <div>
          <h2>Episode Readiness</h2>
          <p>Quick checks before export or local render handoff.</p>
        </div>
        <strong>{warnings.length === 0 ? "Ready" : "Check"}</strong>
      </div>
      <div className="readiness-grid">
        <ReadinessMetric label="Manifest" value={manifest ? "Loaded" : "Missing"} />
        <ReadinessMetric
          label="Local proxy"
          value={localProxyVideo ? "Loaded" : "Missing"}
        />
        <ReadinessMetric label="Decisions" value={String(decisionCount)} />
        <ReadinessMetric label="Cuts" value={String(cutDecisionCount)} />
      </div>
      <div className="readiness-export">
        <span>Export filename</span>
        <strong>{exportFileNamePreview}</strong>
      </div>
      {warnings.length > 0 ? (
        <ul className="readiness-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p className="readiness-ok">No readiness warnings for the current edit.</p>
      )}
    </section>
  );
}

function LocalRenderHandoffPanel({
  manifest,
  decisionCount,
  exportFileNamePreview,
  syncMapAvailable,
}: {
  manifest: EpisodeManifest | null;
  decisionCount: number;
  exportFileNamePreview: string;
  syncMapAvailable: boolean;
}) {
  const episodeId = manifest?.id ?? "episode-id";
  const episodeFolder = sanitizeFileNamePart(episodeId);
  const episodeDir = `~/Movies/StudioCut/${episodeFolder}`;
  const command = `pnpm studio-cut:local:render-rescue-sync-session -- --episode-id ${episodeFolder} --episode-dir ${episodeDir} --dry-run`;

  return (
    <section className="render-handoff-panel" aria-label="Local render handoff">
      <div className="panel-heading">
        <div>
          <h2>Local Render Handoff</h2>
          <p>Export decisions, then render from the Rescue Sync session folder.</p>
        </div>
        <strong>{syncMapAvailable ? "Sync Map ready" : "Needs Sync Map"}</strong>
      </div>

      <div className="render-handoff-grid">
        <ReadinessMetric
          label="Decision file"
          value={`edit/${exportFileNamePreview}`}
        />
        <ReadinessMetric label="Decisions" value={String(decisionCount)} />
        <ReadinessMetric
          label="Session folder"
          value={manifest ? episodeDir : "Import or join an episode"}
        />
        <ReadinessMetric
          label="Sync Map"
          value={syncMapAvailable ? "Available" : "Publish Rescue Sync package"}
        />
      </div>

      <div className="render-handoff-command">
        <span>Dry-run command</span>
        <code>{command}</code>
      </div>

      <ol className="render-handoff-steps">
        <li>Export decisions and place the JSON in the session `edit/` folder.</li>
        <li>Run the dry-run command and inspect the segment plan.</li>
        <li>Remove `--dry-run` to write the rough 16:9 MP4 into `renders/`.</li>
      </ol>
    </section>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PrototypeNotice({ authStatus }: { authStatus: StudioCutAuthStatus }) {
  const isLocalDev = authStatus.mode === "local_dev";

  return (
    <section className="prototype-notice" aria-label="Prototype safety notice">
      <strong>{isLocalDev ? "Local dev prototype" : "Protected prototype"}</strong>
      <span>
        {isLocalDev
          ? "Local dev mode, auth disabled because Firebase env vars are missing. Do not use full-res media, private paths, credentials, or personal recordings here."
          : "This internal prototype can upload shared proxies and rescue-sync intake assets only when rules/security are ready. Do not upload credentials or private local paths."}
      </span>
    </section>
  );
}

function AuthGatePanel({
  authStatus,
  onSignIn,
  onSignOut,
}: {
  authStatus: StudioCutAuthStatus;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const canSignIn =
    authStatus.mode === "signed_out" || authStatus.mode === "auth_error";
  const canSignOut = authStatus.mode === "not_authorized";

  return (
    <main className="auth-gate" aria-label="Studio Cut auth gate">
      <section className="auth-card">
        <p className="eyebrow">Studio Cut access</p>
        <h2>{authStatus.label}</h2>
        <p>{authStatus.detail}</p>
        {authStatus.userEmail ? (
          <p className="auth-email">{authStatus.userEmail}</p>
        ) : null}
        <div className="auth-actions">
          {canSignIn ? (
            <button type="button" onClick={() => void onSignIn()}>
              Sign In With Google
            </button>
          ) : null}
          {canSignOut ? (
            <button type="button" onClick={() => void onSignOut()}>
              Use A Different Account
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SourceMonitor({
  role,
  sourceTimeMs,
  currentState,
}: {
  role: Exclude<SourceRole, "program">;
  sourceTimeMs: number;
  currentState?: ProgramState;
}) {
  const isActive = isSourceActive(role, currentState);

  return (
    <article className={`monitor source-monitor${isActive ? " is-active" : ""}`}>
      <div className="monitor-header">
        <h2>{SOURCE_ROLE_LABELS[role]}</h2>
        <span>{formatSourceTime(sourceTimeMs)}</span>
      </div>
      <div className="monitor-body">
        <div className="source-frame">
          <span>{role}</span>
        </div>
        <p>{MONITOR_COPY[role]}</p>
      </div>
    </article>
  );
}

function SourceProxyMonitor({
  localProxyVideo,
  manifest,
  sourceTimeMs,
  videoRef,
  onLoadedMetadata,
  onEnded,
}: {
  localProxyVideo: LocalProxyVideo;
  manifest: EpisodeManifest | null;
  sourceTimeMs: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  onLoadedMetadata: (durationSeconds: number) => void;
  onEnded: () => void;
}) {
  const panes = manifest?.sourceMonitorProxy.panes;

  return (
    <article className="monitor source-proxy-monitor">
      <div className="monitor-header">
        <div>
          <h2>Source monitor proxy</h2>
          <p>
            {localProxyVideo.source === "cloud"
              ? "Loaded from the shared room package."
              : "Local browser file only. No persistence."}
          </p>
        </div>
        <span>{formatSourceTime(sourceTimeMs)}</span>
      </div>
      <div className="source-proxy-body">
        <div className="proxy-video-frame">
          <video
            key={localProxyVideo.id}
            ref={videoRef}
            className="proxy-video"
            src={localProxyVideo.objectUrl}
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) =>
              onLoadedMetadata(event.currentTarget.duration)
            }
            onEnded={onEnded}
            aria-label={`${localProxyVideo.source} source-monitor proxy ${localProxyVideo.name}`}
          />
          <div className="proxy-pane-labels" aria-hidden="true">
            <span>Homer</span>
            <span>Charlie</span>
            <span>Clip</span>
          </div>
        </div>
        <div className="proxy-video-details">
          <strong>{localProxyVideo.name}</strong>
          <span>
            {formatFileSize(localProxyVideo.sizeBytes)}
            {localProxyVideo.durationMs
              ? ` · ${formatSourceTime(localProxyVideo.durationMs)}`
              : ""}
          </span>
        </div>
        <div className="proxy-pane-metadata">
          {panes ? (
            <>
              <span>{formatPane("Homer", panes.homer)}</span>
              <span>{formatPane("Charlie", panes.charlie)}</span>
              {panes.clip ? <span>{formatPane("Clip", panes.clip)}</span> : null}
            </>
          ) : (
            <span>Import a manifest to show source pane rectangle metadata.</span>
          )}
        </div>
      </div>
    </article>
  );
}

function ProgramMonitor({
  sourceTimeMs,
  currentEvent,
  localProxyVideo,
  manifest,
  isProgramPlaying,
}: {
  sourceTimeMs: number;
  currentEvent?: DecisionEvent;
  localProxyVideo: LocalProxyVideo | null;
  manifest: EpisodeManifest | null;
  isProgramPlaying: boolean;
}) {
  const state = currentEvent?.state;
  const hasProxyProgramPreview = Boolean(localProxyVideo);

  return (
    <article
      className={`monitor program-monitor${state ? " has-state" : ""}${
        state === "cut" ? " is-cut" : ""
      }`}
    >
      <div className="monitor-header">
        <div>
          <h2>{SOURCE_ROLE_LABELS.program}</h2>
          <p>
            {hasProxyProgramPreview
              ? "Proxy Program Preview"
              : "Semantic Program Preview"}
          </p>
        </div>
        <span>{formatSourceTime(sourceTimeMs)}</span>
      </div>
      {localProxyVideo ? (
        <ProxyProgramPreview
          localProxyVideo={localProxyVideo}
          manifest={manifest}
          state={state}
          sourceTimeMs={sourceTimeMs}
          sourceEventId={currentEvent?.id}
          isProgramPlaying={isProgramPlaying}
        />
      ) : (
        <SemanticProgramPreview currentEvent={currentEvent} />
      )}
    </article>
  );
}

function SemanticProgramPreview({
  currentEvent,
}: {
  currentEvent?: DecisionEvent;
}) {
  const state = currentEvent?.state;

  return (
    <div className="program-state">
      {state ? (
        <>
          <strong>{PROGRAM_STATE_LABELS[state]}</strong>
          <span>
            From {formatSourceTime(currentEvent.sourceTimeMs)} via{" "}
            {shortId(currentEvent.id)}
          </span>
        </>
      ) : (
        <>
          <strong>No decision yet</strong>
          <span>Add a state event at or before this source time.</span>
        </>
      )}
    </div>
  );
}

function ProxyProgramPreview({
  localProxyVideo,
  manifest,
  state,
  sourceTimeMs,
  sourceEventId,
  isProgramPlaying,
}: {
  localProxyVideo: LocalProxyVideo;
  manifest: EpisodeManifest | null;
  state?: ProgramState;
  sourceTimeMs: number;
  sourceEventId?: string;
  isProgramPlaying: boolean;
}) {
  if (!state) {
    return (
      <ProxyProgramPlaceholder
        title="No decision yet"
        detail="Add a semantic state at or before this source time to compose the proxy Program Preview."
      />
    );
  }

  if (state === "cut") {
    return (
      <ProxyProgramPlaceholder
        title="Cut"
        detail="This source span is inactive. Program Playback skips it; source scrub still shows it."
        isCut
      />
    );
  }

  if (!manifest) {
    return (
      <ProxyProgramPlaceholder
        title={PROGRAM_STATE_LABELS[state]}
        detail="Import an Episode Manifest with source-monitor pane rectangles to crop the local proxy into Program Preview."
      />
    );
  }

  const roles = getProxyPreviewRoles(state);
  const missingRoles = roles.filter(
    (role) => !getManifestPaneRect(manifest, role),
  );

  if (missingRoles.length > 0) {
    return (
      <ProxyProgramPlaceholder
        title={PROGRAM_STATE_LABELS[state]}
        detail={`Missing manifest pane metadata for ${missingRoles
          .map((role) => SOURCE_ROLE_LABELS[role])
          .join(", ")}.`}
      />
    );
  }

  const renderPane = (role: ProxyPreviewRole) => {
    const pane = getManifestPaneRect(manifest, role);

    if (!pane) {
      return null;
    }

    return (
      <ProxyCropPane
        key={role}
        role={role}
        pane={pane}
        localProxyVideo={localProxyVideo}
        sourceTimeMs={sourceTimeMs}
        isProgramPlaying={isProgramPlaying}
      />
    );
  };

  return (
    <div className={`proxy-program-preview layout-${state}`}>
      <div className="proxy-program-preview-meta">
        <strong>{PROGRAM_STATE_LABELS[state]}</strong>
        <span>
          {sourceEventId ? `via ${shortId(sourceEventId)} · ` : ""}
          {formatSourceTime(sourceTimeMs)}
        </span>
      </div>
      {state === "both_clip" ? (
        <div className="proxy-program-layout both-clip">
          <div className="proxy-program-stack">
            {renderPane("homer")}
            {renderPane("charlie")}
          </div>
          {renderPane("clip")}
        </div>
      ) : (
        <div
          className={`proxy-program-layout pane-count-${roles.length}`}
          aria-label={`${PROGRAM_STATE_LABELS[state]} proxy layout`}
        >
          {roles.map(renderPane)}
        </div>
      )}
    </div>
  );
}

function ProxyProgramPlaceholder({
  title,
  detail,
  isCut = false,
}: {
  title: string;
  detail: string;
  isCut?: boolean;
}) {
  return (
    <div className={`proxy-program-placeholder${isCut ? " is-cut" : ""}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function ProxyCropPane({
  role,
  pane,
  localProxyVideo,
  sourceTimeMs,
  isProgramPlaying,
}: {
  role: ProxyPreviewRole;
  pane: SourcePaneRect;
  localProxyVideo: LocalProxyVideo;
  sourceTimeMs: number;
  isProgramPlaying: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cropStyle = {
    "--pane-left": `${(-pane.x / pane.width) * 100}%`,
    "--pane-top": `${(-pane.y / pane.height) * 100}%`,
    "--pane-video-width": `${100 / pane.width}%`,
    "--pane-video-height": `${100 / pane.height}%`,
    "--accent": STATE_ACCENTS[role === "clip" ? "both_clip" : role],
  } as CSSProperties;

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    syncProxyPreviewVideo(video, sourceTimeMs, isProgramPlaying);
  }, [isProgramPlaying, localProxyVideo.id, sourceTimeMs]);

  return (
    <div
      className={`proxy-crop-frame proxy-crop-${role}`}
      style={cropStyle}
      aria-label={`${SOURCE_ROLE_LABELS[role]} proxy crop`}
    >
      <video
        key={`${localProxyVideo.id}-${role}`}
        ref={videoRef}
        className="proxy-crop-video"
        src={localProxyVideo.objectUrl}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) =>
          syncProxyPreviewVideo(
            event.currentTarget,
            sourceTimeMs,
            isProgramPlaying,
          )
        }
        aria-hidden="true"
      />
      <span className="proxy-crop-label">{SOURCE_ROLE_LABELS[role]}</span>
    </div>
  );
}

function DecisionList({
  events,
  currentEventId,
  latestEventId,
  onJump,
  onRemove,
}: {
  events: DecisionEvent[];
  currentEventId?: string;
  latestEventId?: string;
  onJump: (sourceTimeMs: number) => void;
  onRemove: (eventId: string) => void;
}) {
  if (events.length === 0) {
    return <EmptyState text="No local or imported decisions yet." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>State</th>
            <th>Note</th>
            <th>Event</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const isCurrent = event.id === currentEventId;
            const isLatest = event.id === latestEventId;

            return (
              <tr
                key={event.id}
                className={[
                  isCurrent ? "is-current-row" : "",
                  isLatest ? "is-latest-row" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <td>{formatSourceTime(event.sourceTimeMs)}</td>
                <td>
                  <span
                    className="state-pill"
                    style={
                      { "--accent": STATE_ACCENTS[event.state] } as CSSProperties
                    }
                  >
                    {PROGRAM_STATE_LABELS[event.state]}
                  </span>
                </td>
                <td>{event.note || "None"}</td>
                <td title={event.id}>
                  <div className="event-cell">
                    <span>{shortId(event.id)}</span>
                    <div>
                      {isCurrent ? <small>Active</small> : null}
                      {isLatest ? <small>Newest</small> : null}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() => onJump(event.sourceTimeMs)}
                      aria-label={`Jump to ${PROGRAM_STATE_LABELS[event.state]} at ${formatSourceTime(
                        event.sourceTimeMs,
                      )}`}
                    >
                      Jump
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(event.id)}
                      aria-label={`Remove local decision ${shortId(event.id)}`}
                    >
                      Remove Local
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LocalCheckpointList({
  checkpoints,
  onRestore,
  onExport,
  onDelete,
}: {
  checkpoints: LocalDecisionCheckpoint[];
  onRestore: (checkpoint: LocalDecisionCheckpoint) => void;
  onExport: (checkpoint: LocalDecisionCheckpoint) => void;
  onDelete: (checkpointId: string) => void;
}) {
  return (
    <section className="local-checkpoints" aria-label="Local checkpoints">
      <div className="timeline-header">
        <strong>Local Checkpoints</strong>
        <span>{checkpoints.length} saved in this browser</span>
      </div>
      {checkpoints.length === 0 ? (
        <p className="panel-empty">
          Save a local checkpoint during a tagging pass to restore or export it
          later in this browser.
        </p>
      ) : (
        <div className="checkpoint-list">
          {checkpoints.map((checkpoint) => (
            <article className="checkpoint-row" key={checkpoint.id}>
              <div>
                <strong>{checkpoint.label}</strong>
                <span>
                  {checkpoint.decisionEvents.length} decision
                  {checkpoint.decisionEvents.length === 1 ? "" : "s"} ·{" "}
                  {formatCheckpointTimestamp(new Date(checkpoint.createdAt))}
                </span>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => onRestore(checkpoint)}>
                  Restore
                </button>
                <button type="button" onClick={() => onExport(checkpoint)}>
                  Export
                </button>
                <button type="button" onClick={() => onDelete(checkpoint.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SegmentList({
  segments,
  currentSegmentSourceEventId,
}: {
  segments: DerivedSegment[];
  currentSegmentSourceEventId?: string;
}) {
  if (segments.length === 0) {
    return <EmptyState text="Segments appear after the first decision." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>In</th>
            <th>Out</th>
            <th>State</th>
            <th>Source event</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => (
            <tr
              key={segment.sourceEventId}
              className={
                segment.sourceEventId === currentSegmentSourceEventId
                  ? "is-current-row"
                  : ""
              }
            >
              <td>{formatSourceTime(segment.startSourceTimeMs)}</td>
              <td>
                {segment.endSourceTimeMs === undefined
                  ? "Episode end"
                  : formatSourceTime(segment.endSourceTimeMs)}
              </td>
              <td>
                <span
                  className="state-pill"
                  style={{ "--accent": STATE_ACCENTS[segment.state] } as CSSProperties}
                >
                  {PROGRAM_STATE_LABELS[segment.state]}
                </span>
              </td>
              <td>{shortId(segment.sourceEventId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DecisionTimeline({
  segments,
  sourceDurationMs,
  currentSegmentSourceEventId,
  onJump,
}: {
  segments: DerivedSegment[];
  sourceDurationMs: number;
  currentSegmentSourceEventId?: string;
  onJump: (sourceTimeMs: number) => void;
}) {
  if (segments.length === 0) {
    return <EmptyState text="Decision Timeline appears after the first decision." />;
  }

  return (
    <section className="decision-timeline" aria-label="Decision Timeline">
      <div className="timeline-header">
        <strong>Decision Timeline</strong>
        <span>{formatSourceTime(sourceDurationMs)} source duration</span>
      </div>
      <div className="timeline-strip">
        {segments.map((segment) => {
          const endSourceTimeMs = segment.endSourceTimeMs ?? sourceDurationMs;
          const durationMs = Math.max(
            0,
            endSourceTimeMs - segment.startSourceTimeMs,
          );
          const widthPercent =
            sourceDurationMs > 0 ? (durationMs / sourceDurationMs) * 100 : 0;
          const isCurrent = segment.sourceEventId === currentSegmentSourceEventId;

          return (
            <button
              key={segment.sourceEventId}
              className={`timeline-segment${
                segment.state === "cut" ? " is-cut" : ""
              }${isCurrent ? " is-current" : ""}`}
              style={
                {
                  "--accent": STATE_ACCENTS[segment.state],
                  "--segment-width": `${Math.max(widthPercent, 1.5)}%`,
                } as CSSProperties
              }
              type="button"
              onClick={() => onJump(segment.startSourceTimeMs)}
              title={`${PROGRAM_STATE_LABELS[segment.state]} ${formatSourceTime(
                segment.startSourceTimeMs,
              )} to ${formatSourceTime(endSourceTimeMs)}`}
              aria-label={`Jump to ${PROGRAM_STATE_LABELS[
                segment.state
              ]} segment at ${formatSourceTime(segment.startSourceTimeMs)}`}
            >
              <span>{PROGRAM_STATE_LABELS[segment.state]}</span>
            </button>
          );
        })}
      </div>
      <div className="timeline-legend">
        <span>Click a block to jump to its source in-point.</span>
        <span>Cut spans are inactive in playback, not deleted.</span>
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function skipCutSourceTime(
  segments: readonly DerivedSegment[],
  sourceTimeMs: number,
  sourceDurationMs: number,
) {
  const currentSegment = getSegmentAtSourceTime(
    segments,
    sourceTimeMs,
    sourceDurationMs,
  );

  if (currentSegment?.state !== "cut") {
    return sourceTimeMs;
  }

  return segments.find(
    (segment) =>
      segment.state !== "cut" && segment.startSourceTimeMs > sourceTimeMs,
  )?.startSourceTimeMs;
}

function getSegmentAtSourceTime(
  segments: readonly DerivedSegment[],
  sourceTimeMs: number,
  sourceDurationMs: number,
) {
  return segments.find((segment) => {
    const endSourceTimeMs = segment.endSourceTimeMs ?? sourceDurationMs;
    return (
      segment.startSourceTimeMs <= sourceTimeMs &&
      sourceTimeMs < endSourceTimeMs
    );
  });
}

function clampSourceTime(sourceTimeMs: number, sourceDurationMs: number) {
  return Math.min(sourceDurationMs, Math.max(0, sourceTimeMs));
}

function getProxyVideoSourceTime(video: HTMLVideoElement) {
  const sourceTimeMs = Math.round(video.currentTime * 1000);

  return Number.isFinite(sourceTimeMs) ? sourceTimeMs : undefined;
}

function formatPane(
  label: string,
  pane: { x: number; y: number; width: number; height: number },
) {
  return `${label} x:${pane.x} y:${pane.y} w:${pane.width} h:${pane.height}`;
}

function createInitialCloudSyncUploadStates(): Record<
  CloudSyncInputRole,
  CloudSyncRoleUploadState
> {
  return CLOUD_SYNC_INPUT_ROLES.reduce(
    (states, role) => ({
      ...states,
      [role]: {
        status: "idle",
        progressPercent: 0,
        message: "No file selected.",
      },
    }),
    {} as Record<CloudSyncInputRole, CloudSyncRoleUploadState>,
  );
}

function markSelectedCloudSyncRolesUploading(
  currentStates: Record<CloudSyncInputRole, CloudSyncRoleUploadState>,
  selectedFiles: CloudSyncSelectedFiles,
) {
  return CLOUD_SYNC_INPUT_ROLES.reduce(
    (states, role) => {
      const selectedRoleFiles = selectedFiles[role] ?? [];

      if (selectedRoleFiles.length === 0) {
        return states;
      }

      return {
        ...states,
        [role]: {
          status: "uploading",
          progressPercent: 0,
          message: `Waiting to upload ${selectedRoleFiles.length} file${
            selectedRoleFiles.length === 1 ? "" : "s"
          }.`,
        },
      };
    },
    { ...currentStates },
  );
}

function getCloudSyncSelectedFileArrays(selectedFiles: CloudSyncSelectedFiles) {
  return CLOUD_SYNC_INPUT_ROLES.reduce(
    (fileArrays, role) => ({
      ...fileArrays,
      [role]: (selectedFiles[role] ?? []).map((selection) => selection.file),
    }),
    {} as Partial<Record<CloudSyncInputRole, File[]>>,
  );
}

function sortCloudSyncSelectedFiles(files: readonly CloudSyncSelectedFile[]) {
  return [...files].sort(
    (left, right) =>
      (left.orderIndex ?? 0) - (right.orderIndex ?? 0) ||
      left.file.name.localeCompare(right.file.name) ||
      left.inputId.localeCompare(right.inputId),
  );
}

function markUploadingCloudSyncRolesErrored(
  currentStates: Record<CloudSyncInputRole, CloudSyncRoleUploadState>,
  message: string,
) {
  return CLOUD_SYNC_INPUT_ROLES.reduce(
    (states, role) => {
      if (states[role].status !== "uploading") {
        return states;
      }

      return {
        ...states,
        [role]: {
          ...states[role],
          status: "error",
          message,
        },
      };
    },
    { ...currentStates },
  );
}

function loadStoredEpisodeManifest() {
  return loadStoredManifest(EPISODE_MANIFEST_STORAGE_KEY);
}

function loadStoredEpisodeManifestBaseline() {
  return loadStoredManifest(EPISODE_MANIFEST_BASELINE_STORAGE_KEY);
}

function loadStoredManifest(storageKey: string) {
  try {
    const rawValue = localStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    const result = parseEpisodeManifestPayload(parsedValue);

    return result.ok ? result.manifest : null;
  } catch {
    return null;
  }
}

function saveStoredEpisodeManifest(manifest: EpisodeManifest | null) {
  saveStoredManifest(EPISODE_MANIFEST_STORAGE_KEY, manifest);
}

function saveStoredEpisodeManifestBaseline(manifest: EpisodeManifest | null) {
  saveStoredManifest(EPISODE_MANIFEST_BASELINE_STORAGE_KEY, manifest);
}

function saveStoredManifest(storageKey: string, manifest: EpisodeManifest | null) {
  try {
    if (!manifest) {
      localStorage.removeItem(storageKey);
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(manifest));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function loadStoredDecisionHistory(): DecisionHistoryState {
  try {
    const rawValue = localStorage.getItem(DECISION_HISTORY_STORAGE_KEY);

    if (!rawValue) {
      return createEmptyDecisionHistory();
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!isStoredDecisionHistory(parsedValue)) {
      return createEmptyDecisionHistory();
    }

    return {
      undoStack: trimDecisionHistoryStack(parsedValue.undoStack),
      redoStack: trimDecisionHistoryStack(parsedValue.redoStack),
      lastAction: parsedValue.lastAction,
    };
  } catch {
    return createEmptyDecisionHistory();
  }
}

function saveStoredDecisionHistory(history: DecisionHistoryState) {
  try {
    localStorage.setItem(
      DECISION_HISTORY_STORAGE_KEY,
      JSON.stringify({
        undoStack: trimDecisionHistoryStack(history.undoStack),
        redoStack: trimDecisionHistoryStack(history.redoStack),
        lastAction: history.lastAction,
      }),
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function loadStoredRoomSelection(
  config: ReturnType<typeof getStudioCutRuntimeConfig>,
): StudioCutRoomSelection {
  try {
    const rawValue = localStorage.getItem(SELECTED_ROOM_STORAGE_KEY);

    if (!rawValue) {
      return { projectId: config.projectId, branchId: config.branchId };
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!isStoredRoomSelection(parsedValue)) {
      return { projectId: config.projectId, branchId: config.branchId };
    }

    return normalizeRoomSelection(parsedValue, config);
  } catch {
    return { projectId: config.projectId, branchId: config.branchId };
  }
}

function loadInitialRoomSelection(
  config: ReturnType<typeof getStudioCutRuntimeConfig>,
): StudioCutRoomSelection {
  const storedRoomSelection = loadStoredRoomSelection(config);

  if (typeof window === "undefined") {
    return storedRoomSelection;
  }

  return normalizeRoomSelection(
    parseSharedRoomQuery(window.location.search, storedRoomSelection),
    config,
  );
}

function saveStoredRoomSelection(roomSelection: StudioCutRoomSelection) {
  try {
    localStorage.setItem(
      SELECTED_ROOM_STORAGE_KEY,
      JSON.stringify(roomSelection),
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function isStoredRoomSelection(value: unknown): value is StudioCutRoomSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as StudioCutRoomSelection;

  return (
    typeof candidate.projectId === "string" &&
    typeof candidate.branchId === "string"
  );
}

function normalizeRoomSelection(
  roomSelection: StudioCutRoomSelection,
  config: ReturnType<typeof getStudioCutRuntimeConfig>,
): StudioCutRoomSelection {
  return {
    projectId: sanitizeRoomPart(roomSelection.projectId) || config.projectId,
    branchId: sanitizeRoomPart(roomSelection.branchId) || config.branchId,
  };
}

function sanitizeRoomPart(value: string) {
  return sanitizeSharedRoomPart(value, "");
}

function buildCurrentSharedRoomUrl(roomSelection: StudioCutRoomSelection) {
  const fallbackUrl = "https://high-ground-odyssey.web.app/";
  const baseHref =
    typeof window === "undefined" ? fallbackUrl : window.location.href;

  return buildSharedRoomUrl(baseHref, roomSelection);
}

function updateBrowserRoomUrl(roomSelection: StudioCutRoomSelection) {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(
    null,
    "",
    buildSharedRoomUrl(window.location.href, roomSelection),
  );
}

function loadStoredLocalCheckpoints(): LocalDecisionCheckpoint[] {
  try {
    const rawValue = localStorage.getItem(LOCAL_CHECKPOINTS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isLocalDecisionCheckpoint)
      .slice(0, MAX_LOCAL_CHECKPOINTS);
  } catch {
    return [];
  }
}

function saveStoredLocalCheckpoints(checkpoints: readonly LocalDecisionCheckpoint[]) {
  try {
    localStorage.setItem(
      LOCAL_CHECKPOINTS_STORAGE_KEY,
      JSON.stringify(checkpoints.slice(0, MAX_LOCAL_CHECKPOINTS)),
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function createEmptyDecisionHistory(): DecisionHistoryState {
  return {
    undoStack: [],
    redoStack: [],
    lastAction: "",
  };
}

function isStoredDecisionHistory(value: unknown): value is DecisionHistoryState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as DecisionHistoryState;

  return (
    Array.isArray(candidate.undoStack) &&
    Array.isArray(candidate.redoStack) &&
    candidate.undoStack.every(isDecisionHistoryEntry) &&
    candidate.redoStack.every(isDecisionHistoryEntry) &&
    typeof candidate.lastAction === "string"
  );
}

function isDecisionHistoryEntry(value: unknown): value is DecisionHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as DecisionHistoryEntry;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.createdAt === "string" &&
    Array.isArray(candidate.before) &&
    Array.isArray(candidate.after) &&
    candidate.before.every(isDecisionEvent) &&
    candidate.after.every(isDecisionEvent)
  );
}

function isLocalDecisionCheckpoint(
  value: unknown,
): value is LocalDecisionCheckpoint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as LocalDecisionCheckpoint;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    (candidate.episodeId === undefined ||
      typeof candidate.episodeId === "string") &&
    typeof candidate.projectId === "string" &&
    typeof candidate.branchId === "string" &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt)) &&
    Array.isArray(candidate.decisionEvents) &&
    candidate.decisionEvents.every(isDecisionEvent)
  );
}

function trimDecisionHistoryStack(entries: readonly DecisionHistoryEntry[]) {
  return entries.slice(-MAX_DECISION_HISTORY_ENTRIES);
}

function cloneDecisionEvents(events: readonly DecisionEvent[]) {
  return sortDecisionEvents(events).map((event) => ({ ...event }));
}

function areDecisionEventListsEqual(
  firstEvents: readonly DecisionEvent[],
  secondEvents: readonly DecisionEvent[],
) {
  return JSON.stringify(cloneDecisionEvents(firstEvents)) ===
    JSON.stringify(cloneDecisionEvents(secondEvents));
}

function createHistoryEntryId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createLocalCheckpointId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSessionId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shouldIgnoreKeyboardShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button"
  );
}

function isButtonTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.tagName.toLowerCase() === "button";
}

function isSupportedLocalProxyVideo(file: File) {
  return (
    file.type.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(file.name)
  );
}

function getCloudConnectionLabel(mode: PersistenceStatus["mode"]) {
  switch (mode) {
    case "cloud_connected":
      return "Connected";
    case "cloud_ready":
      return "Connecting";
    case "cloud_error":
      return "Error";
    case "local_only":
      return "Local only";
  }
}

function getProxyPreviewRoles(state: ProgramState): ProxyPreviewRole[] {
  switch (state) {
    case "charlie":
      return ["charlie"];
    case "homer":
      return ["homer"];
    case "both":
      return ["homer", "charlie"];
    case "charlie_clip":
      return ["charlie", "clip"];
    case "homer_clip":
      return ["homer", "clip"];
    case "both_clip":
      return ["homer", "charlie", "clip"];
    case "cut":
      return [];
  }
}

function getManifestPaneRect(
  manifest: EpisodeManifest,
  role: ProxyPreviewRole,
): SourcePaneRect | undefined {
  const panes = manifest.sourceMonitorProxy.panes;

  if (role === "homer") {
    return panes.homer;
  }

  if (role === "charlie") {
    return panes.charlie;
  }

  return panes.clip;
}

function getCalibratablePaneRoles(
  manifest: EpisodeManifest | null,
): ProxyPreviewRole[] {
  if (!manifest) {
    return [];
  }

  return manifest.sourceMonitorProxy.panes.clip
    ? ["homer", "charlie", "clip"]
    : ["homer", "charlie"];
}

function updateManifestPaneRect(
  manifest: EpisodeManifest,
  role: ProxyPreviewRole,
  nextPane: SourcePaneRect,
) {
  return {
    ...manifest,
    sourceMonitorProxy: {
      ...manifest.sourceMonitorProxy,
      panes: {
        ...manifest.sourceMonitorProxy.panes,
        [role]: normalizePaneRect(nextPane),
      },
    },
  };
}

function normalizePaneRect(pane: SourcePaneRect): SourcePaneRect {
  const width = clampNormalizedPaneValue(pane.width, 0.01);
  const height = clampNormalizedPaneValue(pane.height, 0.01);
  const x = clampNormalizedPaneValue(pane.x, 0, 1 - width);
  const y = clampNormalizedPaneValue(pane.y, 0, 1 - height);

  return {
    x: roundPaneValue(x),
    y: roundPaneValue(y),
    width: roundPaneValue(width),
    height: roundPaneValue(height),
  };
}

function clampNormalizedPaneValue(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function roundPaneValue(value: number) {
  return Math.round(value * 1000) / 1000;
}

function arePaneSetsEqual(
  firstPanes?: EpisodeManifest["sourceMonitorProxy"]["panes"],
  secondPanes?: EpisodeManifest["sourceMonitorProxy"]["panes"],
) {
  return JSON.stringify(firstPanes ?? null) === JSON.stringify(secondPanes ?? null);
}

function cloneEpisodeManifest(manifest: EpisodeManifest): EpisodeManifest {
  return JSON.parse(JSON.stringify(manifest)) as EpisodeManifest;
}

function buildEpisodeReadinessWarnings({
  manifest,
  events,
}: {
  manifest: EpisodeManifest | null;
  events: readonly DecisionEvent[];
}) {
  const warnings: string[] = [];
  const sortedEvents = sortDecisionEvents(events);

  if (!manifest) {
    warnings.push("No Episode Manifest loaded; source duration and pane metadata are still fake/local.");
  }

  if (sortedEvents.length === 0) {
    warnings.push("No decisions yet; export/render handoff will not produce an edit plan.");
  } else if (sortedEvents[0].sourceTimeMs > 0) {
    warnings.push(
      `First decision starts at ${formatSourceTime(
        sortedEvents[0].sourceTimeMs,
      )}; source time before that has no program state.`,
    );
  }

  if (
    sortedEvents.some((event) => stateRequiresClip(event.state)) &&
    !manifest?.sourceMonitorProxy.panes.clip
  ) {
    warnings.push("Clip states are used, but the manifest has no Clip pane.");
  }

  return warnings;
}

function stateRequiresClip(state: ProgramState) {
  return state === "charlie_clip" || state === "homer_clip" || state === "both_clip";
}

function syncProxyPreviewVideo(
  video: HTMLVideoElement,
  sourceTimeMs: number,
  shouldPlay: boolean,
) {
  const rawTargetSeconds = sourceTimeMs / 1000;
  const targetSeconds =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(rawTargetSeconds, video.duration)
      : rawTargetSeconds;
  const driftMs = Math.abs(video.currentTime * 1000 - sourceTimeMs);

  if (!shouldPlay || driftMs > VIDEO_SEEK_DRIFT_TOLERANCE_MS) {
    try {
      video.currentTime = targetSeconds;
    } catch {
      // Metadata may not be ready on every browser; the next sync will retry.
    }
  }

  if (shouldPlay) {
    void video.play().catch(() => {
      // The main source monitor owns operator playback; cropped previews can
      // fall back to tick-based seeking if autoplay is blocked.
    });
    return;
  }

  video.pause();
}

function isSourceActive(role: Exclude<SourceRole, "program">, state?: ProgramState) {
  if (!state || state === "cut") {
    return false;
  }

  if (role === "clip") {
    return state.endsWith("_clip");
  }

  if (role === "charlie") {
    return (
      state === "charlie" ||
      state === "both" ||
      state === "charlie_clip" ||
      state === "both_clip"
    );
  }

  return (
    state === "homer" ||
    state === "both" ||
    state === "homer_clip" ||
    state === "both_clip"
  );
}

function formatSourceTime(sourceTimeMs: number) {
  const totalSeconds = Math.floor(sourceTimeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes =
    hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const paddedSeconds = String(seconds).padStart(2, "0");

  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function getDecisionExportFileName(
  manifest: EpisodeManifest | null,
  payload: { projectId: string; branchId: string },
) {
  const baseName = manifest?.id
    ? `${manifest.id}-decisions`
    : `studio-cut-${payload.projectId}-${payload.branchId}`;

  return `${sanitizeFileNamePart(baseName)}.json`;
}

function getDecisionCheckpointFileName(
  manifest: EpisodeManifest | null,
  payload: { projectId: string; branchId: string },
  checkpointTimestamp: string,
) {
  const baseName = manifest?.id
    ? `${manifest.id}-checkpoint`
    : `studio-cut-${payload.projectId}-${payload.branchId}-checkpoint`;

  return `${sanitizeFileNamePart(baseName)}-${checkpointTimestamp}.json`;
}

function getAdjustedManifestFileName(manifest: EpisodeManifest) {
  return `${sanitizeFileNamePart(`${manifest.id}-adjusted-manifest`)}.json`;
}

function downloadJsonFile(payload: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatCheckpointTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}-${hours}${minutes}`;
}

function formatDateTimeLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSharedRoomPackageKindLabel(
  packageKind: SharedRoomMetadata["packageKind"] | undefined,
) {
  if (packageKind === "rescue_sync_generated") {
    return "Rescue Sync";
  }

  if (packageKind === "prepared_proxy") {
    return "Prepared proxy";
  }

  return "Unknown";
}

function buildSyncReviewSummary(
  syncMap: SyncMap,
  syncReport?: CloudSyncReport,
) {
  const confidenceValues = [
    ...syncMap.assets.map((asset) => asset.confidence),
    ...(syncReport?.trackOffsets.map((trackOffset) => trackOffset.confidence) ??
      []),
  ].filter((value) => Number.isFinite(value));
  const lowestConfidence =
    confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0;

  return {
    timelineDurationMs: syncMap.canonicalTimeline.durationMs,
    assetCount: syncMap.assets.length,
    referencePieceCount: syncMap.referenceRail.segments.length,
    trackOffsetCount: syncReport?.trackOffsets.length ?? 0,
    lowestConfidence,
    warningCount: countSyncReviewWarnings(syncMap, syncReport),
    roleSummary: buildSyncReviewRoleSummary(syncMap),
  };
}

function buildSyncReviewRoleSummary(syncMap: SyncMap) {
  const roleCounts = syncMap.assets.reduce(
    (counts, asset) => ({
      ...counts,
      [asset.role]: (counts[asset.role] ?? 0) + 1,
    }),
    {} as Partial<Record<CloudSyncInputRole, number>>,
  );

  return (
    CLOUD_SYNC_INPUT_ROLES.filter((role) => roleCounts[role])
      .map((role) => `${CLOUD_SYNC_ROLE_LABELS[role]} x${roleCounts[role]}`)
      .join(", ") || "No assets"
  );
}

function countSyncReviewWarnings(
  syncMap: SyncMap,
  syncReport?: CloudSyncReport,
) {
  const syncMapWarnings =
    syncMap.globalWarnings.length +
    syncMap.referenceRail.warnings.length +
    syncMap.referenceRail.segments.reduce(
      (count, segment) => count + segment.warnings.length,
      0,
    ) +
    syncMap.assets.reduce((count, asset) => count + asset.warnings.length, 0);
  const syncReportWarnings = syncReport
    ? syncReport.globalWarnings.length +
      syncReport.referenceRail.warnings.length +
      syncReport.trackOffsets.reduce(
        (count, offset) => count + offset.warnings.length,
        0,
      )
    : 0;

  return syncMapWarnings + syncReportWarnings;
}

function formatConfidence(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function sanitizeFileNamePart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "studio-cut-decisions"
  );
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const sizeKilobytes = sizeBytes / 1024;

  if (sizeKilobytes < 1024) {
    return `${sizeKilobytes.toFixed(1)} KB`;
  }

  return `${(sizeKilobytes / 1024).toFixed(1)} MB`;
}
