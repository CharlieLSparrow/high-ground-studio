import {
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CLOUD_SYNC_INPUT_ROLES,
  CLOUD_SYNC_REQUIRED_INPUT_ROLES,
  CAPTION_STYLE_PRESETS,
  CLOUD_MEDIA_CAPTURE_SOURCE_LABELS,
  CLIP_CANDIDATE_STATUSES,
  CLIP_RENDER_PROFILES,
  deriveSegments,
  getCurrentDecisionEvent,
  isCloudSyncJobInputComplete,
  isDecisionEvent,
  mergeDecisionEvents,
  PROGRAM_STATE_LABELS,
  PROGRAM_STATES,
  parseCloudSyncReportPayload,
  parseEpisodeManifestPayload,
  parseEpisodeTranscriptPayload,
  parseDecisionEventsPayload,
  parseSyncMapPayload,
  sortDecisionEvents,
  SOURCE_ROLE_LABELS,
  STUDIO_CUT_RENDER_PROFILES,
  type CaptionStylePreset,
  type CloudSyncInputRole,
  type CloudSyncJob,
  type CloudSyncReport,
  type CloudSyncUploadedInput,
  type ClipCandidate,
  type ClipCandidateSource,
  type ClipCandidateStatus,
  type ClipRenderProfile,
  type DecisionEvent,
  type DerivedSegment,
  type EpisodeManifest,
  type EpisodeTranscript,
  type ProgramState,
  type RenderProfileDefinition,
  type SourceRole,
  type SyncMap,
  type TranscriptSegmentWord,
  type TranscriptSegment,
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
  buildAgentDecisionOpsPreview,
  type AgentDecisionOperation,
  type AgentDecisionOpsPreview,
} from "./agentDecisionOps";
import { buildAgentWorkspaceBrief } from "./agentWorkspaceBrief";
import {
  buildTranscriptSuggestedDecisionOps,
  buildTranscriptReview,
  type TranscriptReview,
} from "./transcriptReview";
import { buildSyncReviewSummary } from "./syncReview";
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
  buildPackageFingerprintSeed,
  buildGeneratedPackageStoragePath,
  buildGeneratedPackagePreflight,
  buildSharedRoomUrl,
  buildSourceMonitorProxyStoragePath,
  parseSharedRoomQuery,
  sanitizeSharedRoomPart,
  validateGeneratedPackageCompatibility,
  type GeneratedPackagePreflightCheck,
  type SharedRoomMetadata,
  type SharedRoomPackageIntegrity,
} from "./sharedRoom";
import { getStudioCutRuntimeConfig } from "./studioCutConfig";

const DEFAULT_SOURCE_DURATION_MS = 60 * 60 * 1000;
const EPISODE_MANIFEST_STORAGE_KEY =
  "high-ground-studio.studio-cut.episode-manifest.v1";
const EPISODE_MANIFEST_BASELINE_STORAGE_KEY =
  "high-ground-studio.studio-cut.episode-manifest-baseline.v1";
const EPISODE_TRANSCRIPT_STORAGE_KEY =
  "high-ground-studio.studio-cut.episode-transcript.v1";
const EPISODE_SETUP_BOARD_STORAGE_KEY =
  "high-ground-studio.studio-cut.episode-setup-board.v1";
const DECISION_HISTORY_STORAGE_KEY =
  "high-ground-studio.studio-cut.decision-history.v1";
const LOCAL_CHECKPOINTS_STORAGE_KEY =
  "high-ground-studio.studio-cut.local-checkpoints.v1";
const TIMELINE_MARKERS_STORAGE_KEY =
  "high-ground-studio.studio-cut.timeline-markers.v1";
const CLIP_CANDIDATES_STORAGE_KEY =
  "high-ground-studio.studio-cut.clip-candidates.v1";
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
const MAX_TIMELINE_MARKERS = 120;
const MAX_CLIP_CANDIDATES = 200;
const MAX_EDITOR_TIMELINE_CLIPS = 240;
const TIMELINE_EDITOR_STORAGE_KEY =
  "high-ground-studio.studio-cut.editor-timeline-clips.v1";
const TIMELINE_EDITOR_TRACKS = [
  { id: "video" as const, label: "Video" },
  { id: "audio-a" as const, label: "Audio A" },
  { id: "audio-b" as const, label: "Audio B" },
] as const;
const TIMELINE_EDITOR_ZOOM_DEFAULT = 1;
const TIMELINE_EDITOR_ZOOM_MIN = 0.75;
const TIMELINE_EDITOR_ZOOM_MAX = 4;
const TIMELINE_EDITOR_PX_PER_SECOND = 50;
const TIMELINE_EDITOR_FRAME_RATES = [24, 25, 29.97, 30, 60] as const;
const TIMELINE_EDITOR_FRAME_RATE_DEFAULT = 29.97;
const PRESENCE_UPDATE_INTERVAL_MS = 5000;
const STALE_PRESENCE_MS = 30000;
const CLOUD_MEDIA_VAULT_BUCKET = "high-ground-odyssey-media";
const CLOUD_MEDIA_VAULT_PREFIX = "media-vault/raw";
const CLOUD_MEDIA_VAULT_STATUS_ENDPOINT =
  import.meta.env.VITE_STUDIO_CUT_MEDIA_VAULT_STATUS_ENDPOINT?.trim() ||
  "/api/studio-cut/media-vault/migration-health";
const CLOUD_MEDIA_VAULT_STATUS_FALLBACK_ENDPOINT = "/media-vault/migration-health.json";
const MEDIA_VAULT_HEALTH_POLL_INTERVAL_MS = 8000;
const MEDIA_VAULT_STATUS_COLLECTION_ID = "homer-insta360";
const TRANSCRIPT_SPEAKER_COLOR_PALETTE = [
  "#7db2ff",
  "#79ddb0",
  "#f0c96a",
  "#ff7474",
  "#b38bff",
  "#ff8fb1",
  "#72d6ff",
  "#95d66b",
];
const TRANSCRIPT_WAVEFORM_PANEL_BAR_COUNT = 1200;
const TRANSCRIPT_WAVEFORM_ROW_HEIGHT_PX = 32;
const TRANSCRIPT_WAVEFORM_PANEL_HEIGHT_PX = 190;

const STATE_KEYBOARD_SHORTCUTS: Record<string, ProgramState> = {
  "1": "charlie",
  "2": "homer",
  "3": "both",
  "4": "charlie_clip",
  "5": "homer_clip",
  "6": "both_clip",
  x: "cut",
};

const CLIP_CANDIDATE_STATUS_OPTIONS = CLIP_CANDIDATE_STATUSES;

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

type DecisionHistoryMutation = {
  id: string;
  label: string;
  createdAt: string;
  beforeDecisionEvents: DecisionEvent[];
  afterDecisionEvents: DecisionEvent[];
  beforeTimelineEditorClips: EditorTimelineClip[];
  afterTimelineEditorClips: EditorTimelineClip[];
};

type DecisionHistoryNode = {
  id: string;
  label: string;
  parentId: string | null;
  childrenIds: string[];
  createdAt: string;
  operation?: DecisionHistoryMutation;
};

type DecisionHistoryRootState = {
  decisionEvents: DecisionEvent[];
  timelineEditorClips: EditorTimelineClip[];
};

type DecisionHistoryState = {
  currentNodeId: string;
  rootState: DecisionHistoryRootState;
  nodes: Record<string, DecisionHistoryNode>;
  lastAction: string;
};

type DecisionHistoryLegacyEntry = {
  id: string;
  label: string;
  before: DecisionEvent[];
  after: DecisionEvent[];
  createdAt: string;
};

type DecisionHistoryLegacyState = {
  undoStack: DecisionHistoryLegacyEntry[];
  redoStack: DecisionHistoryLegacyEntry[];
  lastAction: string;
};

type TimedTranscriptWord = {
  id: string;
  segmentId: string;
  text: string;
  speaker: string;
  speakerRole?: TranscriptSegment["speakerRole"];
  startSourceTimeMs: number;
  endSourceTimeMs: number;
};

type TranscriptSpeakerFilterState = Record<string, boolean>;

type TranscriptSpeakerProfile = {
  speaker: string;
  segmentCount: number;
  wordCount: number;
  color?: string;
};

type TranscriptWordToken = {
  id?: string;
  text: string;
  startSourceTimeMs: number;
  endSourceTimeMs: number;
};

type TranscriptWaveformState = {
  sourceId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  peaks: number[];
  durationMs: number;
  errorMessage: string | null;
};

type DecisionRefinementDraft = {
  sourceTimeMs: number;
  state: ProgramState;
  note: string;
};

type TimelineMarker = {
  id: string;
  projectId: string;
  branchId: string;
  episodeId?: string;
  sourceTimeMs: number;
  label: string;
  note?: string;
  createdBy: string;
  createdAt: string;
};

type EditorTimelineTrackId = (typeof TIMELINE_EDITOR_TRACKS)[number]["id"];

type TimelineTrackFilterState = Record<EditorTimelineTrackId, boolean>;

type EditorTimelineClipSource = "manual" | "candidate" | "selection";

type EditorTimelineClip = {
  id: string;
  projectId: string;
  branchId: string;
  episodeId?: string;
  trackId: EditorTimelineTrackId;
  sourceType: EditorTimelineClipSource;
  sourceId?: string;
  startSourceTimeMs: number;
  endSourceTimeMs: number;
  label: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type EditorTimelineDragState = {
  clipId: string;
  action: "move" | "trim-start" | "trim-end";
  pointerSourceOffsetMs: number;
  startSourceTimeMs: number;
  endSourceTimeMs: number;
  trackId: EditorTimelineTrackId;
};

type EpisodeSetupBoard = {
  episodeTitle: string;
  guests: string[];
  links: string[];
  scriptNotes: string;
  teleprompterNotes: string;
  plannedClipBeats: string[];
  assetChecklist: string[];
};

type MediaVaultMigrationStatusSource = {
  path: string;
  updatedAt: string | null;
  payload: unknown;
};

type MediaVaultMigrationHealthPayload = {
  projectId: string;
  collectionId: string;
  migrationStatus: MediaVaultMigrationStatusSource | null;
  watchStatus: MediaVaultMigrationStatusSource | null;
  updatedAt: string | null;
};

type MediaVaultMigrationHealth = {
  filesInProgress: number;
  bytesRemaining: number | null;
  stalledRounds: number | null;
  inProgress: boolean;
  retryableErrorCount: number;
  lastError: string | null;
  updatedAt: string | null;
  status: "loading" | "ready" | "unavailable" | "error";
  errorMessage: string | null;
};

type RangeSelection = {
  startSourceTimeMs?: number;
  endSourceTimeMs?: number;
};

type NormalizedRangeSelection = {
  startSourceTimeMs: number;
  endSourceTimeMs: number;
};

type TranscriptCleanupSuggestion = {
  id: string;
  priority: "high" | "medium" | "low";
  kind: string;
  message: string;
  segmentId?: string;
  speaker?: string;
  text?: string;
  startSourceTimeMs?: number;
  endSourceTimeMs?: number;
  confidence?: number;
  reason?: string;
  operations: AgentDecisionOperation[];
};

type PaneRectField = keyof SourcePaneRect;

type LocalDecisionCheckpoint = {
  schemaVersion: 1 | 2;
  id: string;
  label: string;
  episodeId?: string;
  projectId: string;
  branchId: string;
  createdAt: string;
  decisionEvents: DecisionEvent[];
  timelineEditorClips: EditorTimelineClip[];
  decisionHistory?: DecisionHistoryState;
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

type SyncJobTimelineStageStatus = "done" | "active" | "waiting" | "blocked";

type SyncJobTimelineStage = {
  id: string;
  label: string;
  status: SyncJobTimelineStageStatus;
  detail: string;
};

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

type CloudSyncJobWithCompleteOutputs = CloudSyncJob & {
  outputs: CloudSyncJob["outputs"] & {
    manifestStoragePath: string;
    sourceMonitorProxyStoragePath: string;
    syncReportStoragePath: string;
    syncMapStoragePath: string;
  };
};

type OutputDurationSummary = {
  activeDurationMs: number;
  cutDurationMs: number;
  totalDurationMs: number;
};

type EpisodeOutputPackage = {
  schemaVersion: 1;
  exportedAt: string;
  projectId: string;
  branchId: string;
  setup: {
    episodeId?: string;
    title: string;
    guests: string[];
    links: string[];
    scriptNotes: string;
    teleprompterNotes: string;
    plannedClipBeats: string[];
    assetChecklist: string[];
    updatedAt: string;
  };
  episode: {
    id?: string;
    title: string;
    durationMs: number;
    manifestLoaded: boolean;
  };
  readiness: {
    manifestLoaded: boolean;
    proxyLoaded: boolean;
    transcriptLoaded: boolean;
    syncMapAttached: boolean;
    decisionsReady: boolean;
    approvedClipsReady: boolean;
    setupBoardReady: boolean;
    renderReady: boolean;
  };
  metrics: {
    decisionCount: number;
    activeDurationMs: number;
    cutDurationMs: number;
    totalClipCount: number;
    approvedClipCount: number;
  };
  titleCandidates: string[];
  descriptionDraft: string;
  chapterDrafts: Array<{
    startSourceTimeMs: number;
    title: string;
    state: ProgramState;
  }>;
  captions: {
    status: "not_started" | "transcript_ready";
    note: string;
  };
  clips: ClipCandidate[];
  renderCommands: string[];
  checklist: string[];
  notes: string[];
};

type EpisodeSetupBoardPreflight = {
  status: "ready" | "blocked" | "waiting" | "optional";
  checks: GeneratedPackagePreflightCheck[];
};

type RenderProfilePlan = {
  schemaVersion: 1;
  exportedAt: string;
  projectId: string;
  branchId: string;
  episodeId?: string;
  profiles: RenderProfileDefinition[];
  captionPresets: CaptionStylePreset[];
  fullEpisodeOutputs: Array<{
    profileId: ClipRenderProfile;
    label: string;
    durationMs: number;
    captionPresetId?: string;
    notes: string;
  }>;
  clipOutputs: Array<{
    clipCandidateId: string;
    title: string;
    profileId: ClipRenderProfile;
    startSourceTimeMs: number;
    endSourceTimeMs: number;
    captionPresetId?: string;
    status: ClipCandidateStatus;
  }>;
  warnings: string[];
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

const EDITOR_TIMELINE_TRACK_ACCENTS: Record<EditorTimelineTrackId, string> = {
  video: "#72d6ff",
  "audio-a": "#79ddb0",
  "audio-b": "#f0c96a",
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
  const [episodeTranscript, setEpisodeTranscript] =
    useState<EpisodeTranscript | null>(loadStoredEpisodeTranscript);
  const [localProxyVideo, setLocalProxyVideo] =
    useState<LocalProxyVideo | null>(null);
  const [localProxyFile, setLocalProxyFile] = useState<File | null>(null);
  const [transcriptWaveform, setTranscriptWaveform] =
    useState<TranscriptWaveformState>({
      sourceId: null,
      status: "idle",
      peaks: [],
      durationMs: 0,
      errorMessage: null,
    });
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
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | undefined>(
    undefined,
  );
  const [decisionRefinementDraft, setDecisionRefinementDraft] =
    useState<DecisionRefinementDraft | null>(null);
  const [localCheckpoints, setLocalCheckpoints] = useState<
    LocalDecisionCheckpoint[]
  >(loadStoredLocalCheckpoints);
  const [timelineMarkers, setTimelineMarkers] = useState<TimelineMarker[]>(
    loadStoredTimelineMarkers,
  );
  const [timelineEditorClips, setTimelineEditorClips] = useState<
    EditorTimelineClip[]
  >(loadStoredEditorTimelineClips);
  const [selectedTimelineClipId, setSelectedTimelineClipId] = useState<
    string | undefined
  >(undefined);
  const [timelineZoomLevel, setTimelineZoomLevel] = useState(
    TIMELINE_EDITOR_ZOOM_DEFAULT,
  );
  const [timelineSnapToFrame, setTimelineSnapToFrame] =
    useState(true);
  const [timelineFrameRate, setTimelineFrameRate] = useState<number>(
    TIMELINE_EDITOR_FRAME_RATE_DEFAULT,
  );
  const [timelineEditorTrackId, setTimelineEditorTrackId] =
    useState<EditorTimelineTrackId>("video");
  const [timelineTrackFilters, setTimelineTrackFilters] =
    useState<TimelineTrackFilterState>({
      video: true,
      "audio-a": true,
      "audio-b": true,
    });
  const [clipCandidates, setClipCandidates] = useState<ClipCandidate[]>(
    loadStoredClipCandidates,
  );
  const [episodeSetupBoard, setEpisodeSetupBoard] = useState<EpisodeSetupBoard>(
    () => loadStoredEpisodeSetupBoard(selectedRoom),
  );
  const [clipCandidateTitleDraft, setClipCandidateTitleDraft] = useState("");
  const [clipCandidateSummaryDraft, setClipCandidateSummaryDraft] = useState("");
  const [markerDraft, setMarkerDraft] = useState("");
  const [markerNoteDraft, setMarkerNoteDraft] = useState("");
  const [rangeSelection, setRangeSelection] = useState<RangeSelection>({});
  const [rangeState, setRangeState] = useState<ProgramState>("both");
  const [transcriptLaneState, setTranscriptLaneState] =
    useState<ProgramState>("cut");
  const [transcriptSegmentDrafts, setTranscriptSegmentDrafts] = useState<
    Record<string, string>
  >({});
  const [selectedTranscriptSegmentId, setSelectedTranscriptSegmentId] =
    useState<string | undefined>(undefined);
  const [transcriptSpeakerFilters, setTranscriptSpeakerFilters] =
    useState<TranscriptSpeakerFilterState>({});
  const [selectedTranscriptWordId, setSelectedTranscriptWordId] = useState<
    string | undefined
  >(undefined);
  const [selectedTranscriptWordDraft, setSelectedTranscriptWordDraft] =
    useState("");
  const [
    selectedTranscriptCleanupSuggestionIds,
    setSelectedTranscriptCleanupSuggestionIds,
  ] = useState<Set<string>>(() => new Set());
  const [note, setNote] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [agentOpsPreview, setAgentOpsPreview] =
    useState<AgentDecisionOpsPreview | null>(null);
  const [selectedAgentOperationIndexes, setSelectedAgentOperationIndexes] =
    useState<Set<number>>(() => new Set());
  const [rejectedAgentOperationIndexes, setRejectedAgentOperationIndexes] =
    useState<Set<number>>(() => new Set());
  const [cloudMediaVaultCopyMessage, setCloudMediaVaultCopyMessage] =
    useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const agentOpsInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
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
    allDecisionEvents,
    decisionEvents,
    collaborators,
    status,
    createDecision,
    updateDecision,
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
  const selectedDecision =
    sortedEvents.find((event) => event.id === selectedDecisionId) ?? null;
  const currentState = currentEvent?.state;
  const currentHistoryNode =
    decisionHistory.nodes[decisionHistory.currentNodeId] ?? null;
  const canUndoDecisionChange = Boolean(currentHistoryNode?.parentId);
  const canRedoDecisionChange =
    (currentHistoryNode?.childrenIds.length ?? 0) > 0;
  const playbackModeLabel = isProgramPlaying
    ? "Program Playback"
    : "Source Scrub";
  const playbackModeDescription = isProgramPlaying
    ? "Play is simulating program playback and skipping Cut spans."
    : "Scrub controls use source time and show every span, including Cut.";
  const cutDecisionCount = sortedEvents.filter(
    (event) => event.state === "cut",
  ).length;
  const currentRoomMarkers = useMemo(
    () =>
      sortTimelineMarkers(
        timelineMarkers.filter(
          (marker) =>
            marker.projectId === roomSelection.projectId &&
            marker.branchId === roomSelection.branchId &&
            (!episodeManifest?.id || !marker.episodeId || marker.episodeId === episodeManifest.id),
        ),
      ),
    [
      episodeManifest?.id,
      roomSelection.branchId,
      roomSelection.projectId,
      timelineMarkers,
    ],
  );
  const currentRoomTimelineClips = useMemo(
    () =>
      sortEditorTimelineClips(
        timelineEditorClips.filter(
          (clip) =>
            clip.projectId === roomSelection.projectId &&
            clip.branchId === roomSelection.branchId &&
            (!episodeManifest?.id ||
              !clip.episodeId ||
              clip.episodeId === episodeManifest.id),
        ),
      ),
    [
      episodeManifest?.id,
      roomSelection.branchId,
      roomSelection.projectId,
      timelineEditorClips,
    ],
  );
  const visibleTimelineTrackIds = useMemo(
    () =>
      new Set(
        TIMELINE_EDITOR_TRACKS.filter(
          (track) => timelineTrackFilters[track.id],
        ).map((track) => track.id),
      ),
    [timelineTrackFilters],
  );
  const visibleTimelineTracks = useMemo(
    () => TIMELINE_EDITOR_TRACKS.filter((track) => timelineTrackFilters[track.id]),
    [timelineTrackFilters],
  );
  const visibleTimelineClips = useMemo(
    () =>
      currentRoomTimelineClips.filter((clip) =>
        visibleTimelineTrackIds.has(clip.trackId),
      ),
    [currentRoomTimelineClips, visibleTimelineTrackIds],
  );
  const selectedTimelineClip = useMemo(
    () =>
      visibleTimelineClips.find(
        (clip) => clip.id === selectedTimelineClipId,
      ) ?? null,
    [selectedTimelineClipId, visibleTimelineClips],
  );
  const currentTimelineFrameDurationMs = getTimelineFrameDurationMs(
    timelineFrameRate,
  );
  const normalizedRange = normalizeRangeSelection(
    rangeSelection,
    sourceDurationMs,
  );
  const nextMarkerAfterPlayhead = findNextTimelineMarker(
    currentRoomMarkers,
    sourceTimeMs,
  );
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
  const transcriptReview = useMemo(
    () =>
      buildTranscriptReview({
        manifest: episodeManifest,
        transcript: episodeTranscript,
        derivedSegments,
        sourceDurationMs,
      }),
    [derivedSegments, episodeManifest, episodeTranscript, sourceDurationMs],
  );
  const transcriptCleanupSuggestions = useMemo(
    () =>
      buildTranscriptCleanupSuggestions({
        review: transcriptReview,
        transcript: episodeTranscript,
      }),
    [episodeTranscript, transcriptReview],
  );
  const selectedTranscriptCleanupSuggestionCount = transcriptCleanupSuggestions.filter(
    (suggestion) => selectedTranscriptCleanupSuggestionIds.has(suggestion.id),
  ).length;
  const sortedTranscriptSegments = useMemo(
    () =>
      sortTranscriptSegments(episodeTranscript?.segments ?? []).map((segment) =>
        normalizeTranscriptSegmentSpeaker(segment),
      ),
    [episodeTranscript],
  );
  const transcriptSpeakerProfiles = useMemo(
    () => buildTranscriptSpeakerProfiles(sortedTranscriptSegments),
    [sortedTranscriptSegments],
  );
  const transcriptSpeakerColorMap = useMemo(
    () => buildTranscriptSpeakerColorMap(transcriptSpeakerProfiles),
    [transcriptSpeakerProfiles],
  );
  const currentTranscriptSegment = useMemo(
    () =>
      getTranscriptSegmentAtSourceTime(sortedTranscriptSegments, sourceTimeMs),
    [sortedTranscriptSegments, sourceTimeMs],
  );
  const visibleTranscriptSegments = useMemo(
    () =>
      sortedTranscriptSegments.filter((segment) =>
        isTranscriptSpeakerVisible(segment.speaker, transcriptSpeakerFilters),
      ),
    [sortedTranscriptSegments, transcriptSpeakerFilters],
  );
  const selectedTranscriptSegment = useMemo(() => {
    const selectedFromList = visibleTranscriptSegments.find(
      (segment) => segment.id === selectedTranscriptSegmentId,
    );

    if (selectedFromList) {
      return selectedFromList;
    }

    return currentTranscriptSegment &&
      isTranscriptSpeakerVisible(
        currentTranscriptSegment.speaker,
        transcriptSpeakerFilters,
      )
      ? currentTranscriptSegment
      : null;
  }, [visibleTranscriptSegments, currentTranscriptSegment, selectedTranscriptSegmentId, transcriptSpeakerFilters]);
  const filteredTranscriptSegments = visibleTranscriptSegments;
  const selectedTranscriptSegmentDraftText = useMemo(() => {
    if (!selectedTranscriptSegment) {
      return "";
    }

    return (
      transcriptSegmentDrafts[selectedTranscriptSegment.id] ??
      selectedTranscriptSegment.text
    );
  }, [selectedTranscriptSegment, transcriptSegmentDrafts]);
  const transcriptTimedWords = useMemo(
    () => buildTimedTranscriptWords(filteredTranscriptSegments, sourceDurationMs),
    [filteredTranscriptSegments, sourceDurationMs],
  );
  const transcriptWordById = useMemo(() => {
    const byId = new Map<string, TimedTranscriptWord>();

    for (const word of transcriptTimedWords) {
      byId.set(word.id, word);
    }

    return byId;
  }, [transcriptTimedWords]);
  const transcriptWordsBySegmentId = useMemo(() => {
    const bySegmentId = new Map<string, TimedTranscriptWord[]>();

    for (const word of transcriptTimedWords) {
      const words = bySegmentId.get(word.segmentId);

      if (words) {
        words.push(word);
        continue;
      }

      bySegmentId.set(word.segmentId, [word]);
    }

    return bySegmentId;
  }, [transcriptTimedWords]);
  const selectedTranscriptSegmentWords = useMemo(
    () =>
      selectedTranscriptSegment
        ? buildSegmentWordTokens(
            selectedTranscriptSegment,
            sourceDurationMs,
            selectedTranscriptSegmentDraftText,
          )
        : [],
    [selectedTranscriptSegment, selectedTranscriptSegmentDraftText, sourceDurationMs],
  );
  const selectedTranscriptWord = useMemo(() => {
    if (!selectedTranscriptWordId) {
      return null;
    }

    return transcriptWordById.get(selectedTranscriptWordId) ?? null;
  }, [selectedTranscriptWordId, transcriptWordById]);
  const selectedTranscriptWordIndex = useMemo(() => {
    if (!selectedTranscriptWord) {
      return null;
    }

    const segmentWords = transcriptWordsBySegmentId.get(
      selectedTranscriptWord.segmentId,
    );
    if (!segmentWords) {
      return null;
    }

    const localIndex = segmentWords.findIndex(
      (word) => word.id === selectedTranscriptWord.id,
    );

    return localIndex >= 0 ? localIndex + 1 : null;
  }, [selectedTranscriptWord, transcriptWordsBySegmentId]);
  const currentRoomClipCandidates = useMemo(
    () =>
      sortClipCandidates(
        clipCandidates.filter(
          (candidate) =>
            candidate.projectId === roomSelection.projectId &&
            candidate.branchId === roomSelection.branchId &&
            (!episodeManifest?.id ||
              !candidate.episodeId ||
              candidate.episodeId === episodeManifest.id),
        ),
      ),
    [
      clipCandidates,
      episodeManifest?.id,
      roomSelection.branchId,
      roomSelection.projectId,
    ],
  );

  useEffect(() => {
    if (!localProxyVideo) {
      setTranscriptWaveform({
        sourceId: null,
        status: "idle",
        peaks: [],
        durationMs: 0,
        errorMessage: null,
      });
      return;
    }

    const AudioContextClass =
      "AudioContext" in window
        ? window.AudioContext
        : (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

    if (!AudioContextClass) {
      setTranscriptWaveform({
        sourceId: localProxyVideo.id,
        status: "error",
        peaks: [],
        durationMs: localProxyVideo.durationMs ?? sourceDurationMs,
        errorMessage:
          "Web Audio API is unavailable in this browser. Waveform unavailable.",
      });
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;
    const audioContext = new AudioContextClass();

    setTranscriptWaveform({
      sourceId: localProxyVideo.id,
      status: "loading",
      peaks: [],
      durationMs: localProxyVideo.durationMs ?? sourceDurationMs,
      errorMessage: null,
    });

    const derive = async () => {
      try {
        const response = await fetch(localProxyVideo.objectUrl, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch proxy media (${response.status} ${response.statusText}).`,
          );
        }

        const sourceBuffer = await response.arrayBuffer();
        const decodedBuffer = await audioContext.decodeAudioData(sourceBuffer);
        const sourceChannel = chooseAudioWaveformChannel(decodedBuffer);

        if (cancelled) {
          return;
        }

        const peakCount = Math.min(
          TRANSCRIPT_WAVEFORM_PANEL_BAR_COUNT,
          Math.max(140, Math.ceil((decodedBuffer.duration * 1000) / 100)),
        );
        const peaks = downsampleWaveformPeaks(sourceChannel, peakCount);

        setTranscriptWaveform({
          sourceId: localProxyVideo.id,
          status: "ready",
          peaks,
          durationMs: Math.round(decodedBuffer.duration * 1000),
          errorMessage: null,
        });
      } catch (error) {
        if (cancelled || abortController.signal.aborted) {
          return;
        }

        setTranscriptWaveform({
          sourceId: localProxyVideo.id,
          status: "error",
          peaks: [],
          durationMs: localProxyVideo.durationMs ?? sourceDurationMs,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to build audio waveform from proxy media.",
        });
      } finally {
        await audioContext.close().catch(() => {});
      }
    };

    void derive();

    return () => {
      cancelled = true;
      abortController.abort();
      audioContext.close().catch(() => {});
    };
  }, [localProxyVideo?.id, localProxyVideo?.objectUrl, sourceDurationMs]);
  const approvedClipCandidateCount = currentRoomClipCandidates.filter(
    (candidate) => candidate.status === "approved",
  ).length;
  const episodeSetupBoardPreflight = useMemo(
    () => buildEpisodeSetupBoardPreflight(episodeSetupBoard),
    [episodeSetupBoard],
  );
  const outputDurationSummary = useMemo(
    () => summarizeDerivedSegmentDurations(derivedSegments, sourceDurationMs),
    [derivedSegments, sourceDurationMs],
  );
  const episodeOutputPackage = useMemo(
    () =>
      buildEpisodeOutputPackage({
        exportedAt: new Date().toISOString(),
        roomSelection,
        manifest: episodeManifest,
        sourceDurationMs,
        derivedSegments,
        setupBoard: episodeSetupBoard,
        decisionEvents: sortedEvents,
        clipCandidates: currentRoomClipCandidates,
        transcript: episodeTranscript,
        syncMap: syncReview.syncMap,
        localProxyVideo,
        outputDurationSummary,
      }),
    [
      currentRoomClipCandidates,
      derivedSegments,
      episodeManifest,
      episodeTranscript,
      localProxyVideo,
      outputDurationSummary,
      roomSelection,
      sortedEvents,
      sourceDurationMs,
      episodeSetupBoard,
      syncReview.syncMap,
    ],
  );
  const renderProfilePlan = useMemo(
    () =>
      buildRenderProfilePlan({
        exportedAt: new Date().toISOString(),
        roomSelection,
        manifest: episodeManifest,
        sourceDurationMs,
        clipCandidates: currentRoomClipCandidates,
      }),
    [currentRoomClipCandidates, episodeManifest, roomSelection, sourceDurationMs],
  );

  useEffect(() => {
    saveStoredEpisodeManifest(episodeManifest);
  }, [episodeManifest]);

  useEffect(() => {
    saveStoredEpisodeTranscript(episodeTranscript);
  }, [episodeTranscript]);

  useEffect(() => {
    saveStoredClipCandidates(clipCandidates);
  }, [clipCandidates]);

  useEffect(() => {
    saveStoredEditorTimelineClips(timelineEditorClips);
    if (
      !selectedTimelineClipId ||
      !timelineEditorClips.some((clip) => clip.id === selectedTimelineClipId)
    ) {
      setSelectedTimelineClipId(undefined);
    }
  }, [selectedTimelineClipId, timelineEditorClips]);

  useEffect(() => {
    if (!selectedTimelineClipId) {
      return;
    }

    const visibleClipExists = visibleTimelineClips.some(
      (clip) => clip.id === selectedTimelineClipId,
    );

    if (!visibleClipExists) {
      setSelectedTimelineClipId(undefined);
    }
  }, [selectedTimelineClipId, visibleTimelineClips]);

  useEffect(() => {
    setTimelineEditorTrackId("video");
  }, [roomSelection.branchId, roomSelection.projectId]);

  useEffect(() => {
    if (visibleTimelineTrackIds.has(timelineEditorTrackId)) {
      return;
    }

    const fallbackTrackId = [...visibleTimelineTrackIds][0];

    if (fallbackTrackId) {
      setTimelineEditorTrackId(fallbackTrackId);
    }
  }, [visibleTimelineTrackIds, timelineEditorTrackId]);

  useEffect(() => {
    setEpisodeSetupBoard(loadStoredEpisodeSetupBoard(roomSelection));
  }, [roomSelection.branchId, roomSelection.projectId]);

  useEffect(() => {
    saveStoredEpisodeSetupBoard(roomSelection, episodeSetupBoard);
  }, [episodeSetupBoard, roomSelection.branchId, roomSelection.projectId]);

  useEffect(() => {
    if (!episodeManifest?.title) {
      return;
    }

    setEpisodeSetupBoard((currentSetupBoard) => {
      if (
        currentSetupBoard.episodeTitle &&
        currentSetupBoard.episodeTitle !== episodeManifest.title
      ) {
        return currentSetupBoard;
      }

      return {
        ...currentSetupBoard,
        episodeTitle: episodeManifest.title,
      };
    });
  }, [episodeManifest?.title]);

  useEffect(() => {
    setSelectedTranscriptCleanupSuggestionIds(
      new Set(transcriptCleanupSuggestions.map((suggestion) => suggestion.id)),
    );
  }, [transcriptCleanupSuggestions]);

  useEffect(() => {
    if (transcriptSpeakerProfiles.length === 0) {
      setTranscriptSpeakerFilters({});
      return;
    }

    setTranscriptSpeakerFilters((currentFilters) => {
      const nextFilters: TranscriptSpeakerFilterState = {};
      let nextChanged = false;

      for (const profile of transcriptSpeakerProfiles) {
        const currentValue = currentFilters[profile.speaker];
        const nextValue = currentValue ?? true;

        nextFilters[profile.speaker] = nextValue;

        if (currentValue === undefined) {
          nextChanged = true;
        }
      }

      const removedKeys = Object.keys(currentFilters).filter(
        (speaker) => nextFilters[speaker] === undefined,
      );

      if (removedKeys.length > 0) {
        nextChanged = true;
      }

      return nextChanged ? nextFilters : currentFilters;
    });
  }, [transcriptSpeakerProfiles]);

  useEffect(() => {
    if (!selectedTranscriptSegmentId) {
      return;
    }

    const visibleSegmentExists = visibleTranscriptSegments.some(
      (segment) => segment.id === selectedTranscriptSegmentId,
    );

    if (!visibleSegmentExists) {
      setSelectedTranscriptSegmentId(undefined);
      setSelectedTranscriptWordId(undefined);
      setSelectedTranscriptWordDraft("");
    }
  }, [selectedTranscriptSegmentId, visibleTranscriptSegments]);

  useEffect(() => {
    if (!selectedTranscriptWordId) {
      return;
    }

    const stillExists = transcriptTimedWords.some(
      (word) => word.id === selectedTranscriptWordId,
    );

    if (!stillExists) {
      setSelectedTranscriptWordId(undefined);
      setSelectedTranscriptWordDraft("");
    }
  }, [selectedTranscriptWordId, transcriptTimedWords]);

  useEffect(() => {
    if (!selectedTranscriptSegment || selectedTranscriptWordIndex === null) {
      setSelectedTranscriptWordDraft("");
      return;
    }

    const draftWords = normalizeTranscriptSegmentText(selectedTranscriptSegmentDraftText)
      .split(/\s+/)
      .filter(Boolean);
    setSelectedTranscriptWordDraft(
      draftWords[selectedTranscriptWordIndex - 1] ?? "",
    );
  }, [
    selectedTranscriptSegment,
    selectedTranscriptSegmentDraftText,
    selectedTranscriptWordIndex,
  ]);

  useEffect(() => {
    setTranscriptSegmentDrafts((currentDrafts) => {
      const activeSegmentIds = new Set(
        sortedTranscriptSegments.map((segment) => segment.id),
      );
      const nextDrafts = { ...currentDrafts };
      let hasRemovedDraft = false;

      for (const segmentId of Object.keys(nextDrafts)) {
        if (!activeSegmentIds.has(segmentId)) {
          hasRemovedDraft = true;
          delete nextDrafts[segmentId];
        }
      }

      return hasRemovedDraft ? nextDrafts : currentDrafts;
    });
  }, [sortedTranscriptSegments]);

  useEffect(() => {
    if (!selectedTranscriptSegment) {
      return;
    }

    setTranscriptSegmentDrafts((currentDrafts) => {
      if (currentDrafts[selectedTranscriptSegment.id]) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [selectedTranscriptSegment.id]: selectedTranscriptSegment.text,
      };
    });
  }, [selectedTranscriptSegment]);

  useEffect(() => {
    if (!cloudMediaVaultCopyMessage) {
      return;
    }

    const clearMessageTimer = setTimeout(() => {
      setCloudMediaVaultCopyMessage("");
    }, 1600);

    return () => {
      clearTimeout(clearMessageTimer);
    };
  }, [cloudMediaVaultCopyMessage]);

  useEffect(() => {
    saveStoredRoomSelection(selectedRoom);
  }, [selectedRoom]);

  useEffect(() => {
    if (!config.firebaseConfig || !cloudSyncJob?.syncJobId) {
      return;
    }

    let isStale = false;
    let unsubscribe: (() => void) | undefined;

    void createCloudSyncStore({
      firebaseConfig: config.firebaseConfig,
      syncJobId: cloudSyncJob.syncJobId,
    })
      .then((store) => {
        if (isStale) {
          return;
        }

        unsubscribe = store.subscribeToSyncJob(
          (job) => {
            if (isStale || !job) {
              return;
            }

            setCloudSyncJob(job);

            if (job.status === "ready" && isCloudSyncJobOutputComplete(job)) {
              setCloudSyncMessage({
                tone: "success",
                text:
                  "Cloud sync worker outputs are ready. Publish Worker Outputs will create the shared room from the generated package.",
              });
            } else if (job.status === "failed") {
              setCloudSyncMessage({
                tone: "error",
                text: job.errorMessage
                  ? `Cloud sync job failed: ${job.errorMessage}`
                  : "Cloud sync job failed. Inspect the worker report before retrying.",
              });
            }
          },
          (error) => {
            if (isStale) {
              return;
            }

            setCloudSyncMessage({
              tone: "error",
              text: `Cloud sync job listener failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            });
          },
        );
      })
      .catch((error: unknown) => {
        if (isStale) {
          return;
        }

        setCloudSyncMessage({
          tone: "error",
          text: `Cloud sync job adapter failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      });

    return () => {
      isStale = true;
      unsubscribe?.();
    };
  }, [cloudSyncJob?.syncJobId, config.firebaseConfig]);

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
    const currentNode = getDecisionHistoryCurrentNode(decisionHistory);

    if (currentNode) {
      return;
    }

    const rootNode = createHistoryRootNode();
    setDecisionHistory({
      rootState: {
        decisionEvents: cloneDecisionEvents(decisionEvents),
        timelineEditorClips: cloneEditorTimelineClips(timelineEditorClips),
      },
      currentNodeId: rootNode.id,
      nodes: {
        [rootNode.id]: rootNode,
      },
      lastAction: "",
    });
  }, [decisionHistory.currentNodeId, decisionHistory.nodes, decisionEvents, timelineEditorClips]);

  useEffect(() => {
    if (!selectedDecisionId) {
      setDecisionRefinementDraft(null);
      return;
    }

    const selectedEvent = sortedEvents.find(
      (event) => event.id === selectedDecisionId,
    );

    if (!selectedEvent) {
      setSelectedDecisionId(undefined);
      setDecisionRefinementDraft(null);
      return;
    }

    setDecisionRefinementDraft({
      sourceTimeMs: selectedEvent.sourceTimeMs,
      state: selectedEvent.state,
      note: selectedEvent.note ?? "",
    });
  }, [selectedDecisionId, sortedEvents]);

  useEffect(() => {
    saveStoredLocalCheckpoints(localCheckpoints);
  }, [localCheckpoints]);

  useEffect(() => {
    saveStoredTimelineMarkers(timelineMarkers);
  }, [timelineMarkers]);

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

        const playbackWord = transcriptTimedWords[
          getTranscriptWordIndexAtSourceTime(transcriptTimedWords, nextSourceTimeMs)
        ];

        if (playbackWord) {
          setSelectedTranscriptSegmentId((currentId) =>
            currentId === playbackWord.segmentId ? currentId : playbackWord.segmentId,
          );
          setSelectedTranscriptWordId((currentId) =>
            currentId === playbackWord.id ? currentId : playbackWord.id,
          );
        }

        return nextSourceTimeMs;
      });
    }, PLAYBACK_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [
    derivedSegments,
    isProgramPlaying,
    localProxyVideo,
    sourceDurationMs,
    transcriptTimedWords,
  ]);

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
        if (selectedTimelineClipId) {
          removeTimelineEditorClip(selectedTimelineClipId);
        } else {
          removeCurrentOrLatestDecision();
        }
        return;
      }

      if (
        selectedTimelineClipId &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const stepMs = event.shiftKey
          ? Math.max(currentTimelineFrameDurationMs * 10, LARGE_SCRUB_STEP_MS)
          : currentTimelineFrameDurationMs;
        moveTimelineEditorClip(selectedTimelineClipId, direction * stepMs);
        return;
      }

      if (
        selectedTimelineClipId &&
        event.key === "ArrowUp" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        moveTimelineEditorClipToAdjacentTrack(selectedTimelineClipId, "up");
        return;
      }

      if (
        selectedTimelineClipId &&
        event.key === "ArrowDown" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        moveTimelineEditorClipToAdjacentTrack(selectedTimelineClipId, "down");
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
    const clampedSourceTimeMs = clampSourceTime(nextValue, sourceDurationMs);
    setSourceTimeMs(clampedSourceTimeMs);
    return clampedSourceTimeMs;
  }

  function syncTranscriptWordFromSourceTime(nextValue: number) {
    const nextWordIndex = getTranscriptWordIndexAtSourceTime(
      transcriptTimedWords,
      nextValue,
    );
    const nextWord = transcriptTimedWords[nextWordIndex] ?? null;

    if (!nextWord) {
      return;
    }

    setSelectedTranscriptSegmentId((currentId) => {
      if (currentId === nextWord.segmentId) {
        return currentId;
      }

      return nextWord.segmentId;
    });

    setSelectedTranscriptWordId((currentWordId) => {
      if (currentWordId === nextWord.id) {
        return currentWordId;
      }

      return nextWord.id;
    });
  }

  function applyNextRoomSelection(roomSelection: StudioCutRoomSelection) {
    const nextRoom = normalizeRoomSelection(roomSelection, runtimeConfig);

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

  function applyRoomSelection() {
    applyNextRoomSelection(roomDraft);
  }

  function useRescuePackageRoom() {
    if (!rescueSyncPackage.manifest || !rescueSyncPackage.syncMap) {
      updateRescueSyncPackageMessage(
        "error",
        "Select a generated manifest and Sync Map before switching rooms.",
      );
      return;
    }

    const nextRoom = {
      projectId: sanitizeSharedRoomPart(rescueSyncPackage.manifest.id),
      branchId: sanitizeSharedRoomPart(rescueSyncPackage.syncMap.branchId),
    };

    applyNextRoomSelection(nextRoom);
    updateRescueSyncPackageMessage(
      "info",
      `Switched to the generated package room ${nextRoom.projectId} / ${nextRoom.branchId}.`,
    );
  }

  function scrubToSourceTime(
    nextValue: number,
    options: { syncTranscriptWord?: boolean } = {},
  ) {
    const clampedSourceTimeMs = setClampedSourceTime(nextValue);

    stopProgramPlayback();
    if (options.syncTranscriptWord !== false) {
      syncTranscriptWordFromSourceTime(clampedSourceTimeMs);
    }
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
    syncTranscriptWordFromSourceTime(playableSourceTimeMs);
    seekProxyVideo(playableSourceTimeMs);
    setIsProgramPlaying(true);
    playProxyVideo();
  }

  function getDecisionHistoryCurrentNode(
    history: DecisionHistoryState,
  ): DecisionHistoryNode | null {
    const node = history.nodes[history.currentNodeId];
    return node ?? null;
  }

function recordEditorMutation(
    label: string,
    beforeEvents: readonly DecisionEvent[],
    afterEvents: readonly DecisionEvent[],
    beforeTimelineEditorClips: readonly EditorTimelineClip[],
    afterTimelineEditorClips: readonly EditorTimelineClip[],
  ) {
    const before = {
      decisionEvents: cloneDecisionEvents(beforeEvents),
      timelineEditorClips: cloneEditorTimelineClips(beforeTimelineEditorClips),
    };
    const after = {
      decisionEvents: cloneDecisionEvents(afterEvents),
      timelineEditorClips: cloneEditorTimelineClips(afterTimelineEditorClips),
    };

    if (
      areDecisionEventListsEqual(before.decisionEvents, after.decisionEvents) &&
      areTimelineEditorClipListsEqual(
        before.timelineEditorClips,
        after.timelineEditorClips,
      )
    ) {
      return;
    }

    setDecisionHistory((currentHistory) => {
      const currentNode = getDecisionHistoryCurrentNode(currentHistory);
      const now = new Date().toISOString();
      const nextNodeId = createHistoryEntryId();
      const nextOperation: DecisionHistoryMutation = {
        id: createHistoryEntryId(),
        label,
        createdAt: now,
        beforeDecisionEvents: before.decisionEvents,
        afterDecisionEvents: after.decisionEvents,
        beforeTimelineEditorClips: before.timelineEditorClips,
        afterTimelineEditorClips: after.timelineEditorClips,
      };
      const nextNode: DecisionHistoryNode = {
        id: nextNodeId,
        label,
        parentId: currentNode ? currentNode.id : null,
        childrenIds: [],
        createdAt: now,
        operation: {
          ...nextOperation,
          id: nextNodeId,
        },
      };

      if (!currentNode) {
        const rootNode = createHistoryRootNode();

        return {
          rootState: {
            decisionEvents: before.decisionEvents,
            timelineEditorClips: before.timelineEditorClips,
          },
          currentNodeId: nextNode.id,
          nodes: {
            [rootNode.id]: rootNode,
            [nextNode.id]: nextNode,
          },
          lastAction: label,
        };
      }

      return {
        ...currentHistory,
        currentNodeId: nextNode.id,
        nodes: {
          ...currentHistory.nodes,
          [currentNode.id]: {
            ...currentHistory.nodes[currentNode.id],
            childrenIds: addUniqueHistoryChildId(
              currentNode.childrenIds,
              nextNode.id,
            ),
          },
          [nextNode.id]: nextNode,
        },
        lastAction: label,
      };
    });
  }

  function recordDecisionMutation(
    label: string,
    beforeEvents: readonly DecisionEvent[],
    afterEvents: readonly DecisionEvent[],
  ) {
    recordEditorMutation(
      label,
      beforeEvents,
      afterEvents,
      timelineEditorClips,
      timelineEditorClips,
    );
  }

  function restoreDecisionHistoryState(state: DecisionHistoryRootState) {
    replaceDecisionEvents(state.decisionEvents);
    setTimelineEditorClips(state.timelineEditorClips);
    setSelectedTimelineClipId((currentClipId) =>
      currentClipId &&
      state.timelineEditorClips.some((clip) => clip.id === currentClipId)
        ? currentClipId
        : undefined,
    );
  }

  function getDecisionHistoryNodePathToTarget(
    history: DecisionHistoryState,
    targetNodeId: string,
  ): DecisionHistoryNode[] | null {
    const targetNode = history.nodes[targetNodeId];
    if (!targetNode) {
      return null;
    }

    const visited = new Set<string>();
    const path: DecisionHistoryNode[] = [];
    let currentNode: DecisionHistoryNode | null = targetNode;

    while (currentNode) {
      if (visited.has(currentNode.id)) {
        return null;
      }
      visited.add(currentNode.id);
      path.push(currentNode);

      if (currentNode.parentId === null) {
        break;
      }

      currentNode = history.nodes[currentNode.parentId] ?? null;
    }

    if (!currentNode || currentNode.parentId !== null) {
      return null;
    }

    return path.reverse();
  }

  function getDecisionHistoryStateAtNode(
    history: DecisionHistoryState,
    targetNodeId: string,
  ): DecisionHistoryRootState | null {
    const path = getDecisionHistoryNodePathToTarget(history, targetNodeId);
    if (!path) {
      return null;
    }

    const state: DecisionHistoryRootState = {
      decisionEvents: cloneDecisionEvents(history.rootState.decisionEvents),
      timelineEditorClips: cloneEditorTimelineClips(
        history.rootState.timelineEditorClips,
      ),
    };

    for (const node of path) {
      if (!node.operation) {
        continue;
      }

      state.decisionEvents = cloneDecisionEvents(node.operation.afterDecisionEvents);
      state.timelineEditorClips = cloneEditorTimelineClips(
        node.operation.afterTimelineEditorClips,
      );
    }

    return state;
  }

  function buildPersistableDecisionHistory(
    history: DecisionHistoryState,
  ): DecisionHistoryState {
    const nodes = Object.fromEntries(
      Object.entries(history.nodes).map(([nodeId, node]) => [
        nodeId,
        {
          ...node,
          childrenIds: [...node.childrenIds],
          operation: node.operation
            ? {
                ...node.operation,
                beforeDecisionEvents: cloneDecisionEvents(
                  node.operation.beforeDecisionEvents,
                ),
                afterDecisionEvents: cloneDecisionEvents(
                  node.operation.afterDecisionEvents,
                ),
                beforeTimelineEditorClips: cloneEditorTimelineClips(
                  node.operation.beforeTimelineEditorClips,
                ),
                afterTimelineEditorClips: cloneEditorTimelineClips(
                  node.operation.afterTimelineEditorClips,
                ),
              }
            : undefined,
        },
      ]),
    );

    return {
      rootState: {
        decisionEvents: cloneDecisionEvents(history.rootState.decisionEvents),
        timelineEditorClips: cloneEditorTimelineClips(
          history.rootState.timelineEditorClips,
        ),
      },
      nodes,
      currentNodeId: history.currentNodeId,
      lastAction: history.lastAction,
    };
  }

  function addDecision(state: ProgramState) {
    stopProgramPlayback();
    const event = createDecision(state, sourceTimeMs, note);
    const nextEvents = mergeDecisionEvents([...decisionEvents, event]);
    setSelectedDecisionId(event.id);
    recordDecisionMutation(
      `Added ${PROGRAM_STATE_LABELS[state]} at ${formatSourceTime(sourceTimeMs)}`,
      decisionEvents,
      nextEvents,
    );
    setNote("");
  }

  function selectDecisionForRefinement(eventId: string) {
    const event = sortedEvents.find((candidateEvent) => candidateEvent.id === eventId);

    if (!event) {
      return;
    }

    setSelectedDecisionId(event.id);
    setDecisionRefinementDraft({
      sourceTimeMs: event.sourceTimeMs,
      state: event.state,
      note: event.note ?? "",
    });
  }

  function selectActiveDecisionForRefinement() {
    const event = currentEvent ?? sortedEvents[sortedEvents.length - 1];

    if (event) {
      selectDecisionForRefinement(event.id);
    }
  }

  function updateDecisionRefinementDraft(
    patch: Partial<DecisionRefinementDraft>,
  ) {
    setDecisionRefinementDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            ...patch,
            sourceTimeMs: clampSourceTime(
              patch.sourceTimeMs ?? currentDraft.sourceTimeMs,
              sourceDurationMs,
            ),
          }
        : currentDraft,
    );
  }

  function setSelectedDecisionDraftToCurrentTime() {
    updateDecisionRefinementDraft({ sourceTimeMs });
  }

  function nudgeSelectedDecisionDraft(deltaMs: number) {
    if (!decisionRefinementDraft) {
      return;
    }

    updateDecisionRefinementDraft({
      sourceTimeMs: decisionRefinementDraft.sourceTimeMs + deltaMs,
    });
  }

  function saveDecisionRefinement() {
    if (!selectedDecision || !decisionRefinementDraft) {
      return;
    }

    const trimmedNote = decisionRefinementDraft.note.trim();
    const normalizedNextEvent: DecisionEvent = {
      ...selectedDecision,
      sourceTimeMs: clampSourceTime(
        decisionRefinementDraft.sourceTimeMs,
        sourceDurationMs,
      ),
      state: decisionRefinementDraft.state,
    };

    if (trimmedNote) {
      normalizedNextEvent.note = trimmedNote;
    } else {
      normalizedNextEvent.note = "";
    }

    const nextEvents = mergeDecisionEvents([
      ...decisionEvents.filter((event) => event.id !== selectedDecision.id),
      normalizedNextEvent,
    ]);

    stopProgramPlayback();
    recordDecisionMutation(
      `Refined ${PROGRAM_STATE_LABELS[selectedDecision.state]} at ${formatSourceTime(
        selectedDecision.sourceTimeMs,
      )}`,
      decisionEvents,
      nextEvents,
    );
    const updatedEvent = updateDecision(selectedDecision.id, {
      sourceTimeMs: normalizedNextEvent.sourceTimeMs,
      state: normalizedNextEvent.state,
      note: normalizedNextEvent.note ?? "",
    });

    if (updatedEvent) {
      setSelectedDecisionId(updatedEvent.id);
      scrubToSourceTime(updatedEvent.sourceTimeMs);
    }
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
    if (selectedDecisionId === eventId) {
      setSelectedDecisionId(undefined);
    }
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

  function addTimelineMarkerAtPlayhead() {
    const label = markerDraft.trim() || `Marker ${formatSourceTime(sourceTimeMs)}`;
    const note = markerNoteDraft.trim();
    const marker: TimelineMarker = {
      id: createTimelineMarkerId(),
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      ...(episodeManifest?.id ? { episodeId: episodeManifest.id } : {}),
      sourceTimeMs: clampSourceTime(sourceTimeMs, sourceDurationMs),
      label,
      ...(note ? { note } : {}),
      createdBy: createdBy ?? config.createdBy,
      createdAt: new Date().toISOString(),
    };

    setTimelineMarkers((currentMarkers) =>
      sortTimelineMarkers([marker, ...currentMarkers]).slice(0, MAX_TIMELINE_MARKERS),
    );
    setMarkerDraft("");
    setMarkerNoteDraft("");
    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      lastAction: `Added marker ${label} at ${formatSourceTime(marker.sourceTimeMs)}`,
    }));
  }

  function removeTimelineMarker(markerId: string) {
    const marker = timelineMarkers.find(
      (candidateMarker) => candidateMarker.id === markerId,
    );

    setTimelineMarkers((currentMarkers) =>
      currentMarkers.filter((currentMarker) => currentMarker.id !== markerId),
    );

    if (marker) {
      setDecisionHistory((currentHistory) => ({
        ...currentHistory,
        lastAction: `Removed marker ${marker.label}`,
      }));
    }
  }

  function jumpToTimelineMarker(marker: TimelineMarker) {
    scrubToSourceTime(marker.sourceTimeMs);
  }

  function mutateTimelineEditorClipsWithHistory(
    label: string,
    updater: (currentClips: readonly EditorTimelineClip[]) => EditorTimelineClip[],
  ) {
    let beforeClips: EditorTimelineClip[] | null = null;
    let afterClips: EditorTimelineClip[] | null = null;

    setTimelineEditorClips((currentClips) => {
      const nextClips = updater(currentClips);

      if (areTimelineEditorClipListsEqual(currentClips, nextClips)) {
        return currentClips;
      }

      beforeClips = cloneEditorTimelineClips(currentClips);
      afterClips = cloneEditorTimelineClips(sortEditorTimelineClips(nextClips));
      return afterClips;
    });

    if (!beforeClips || !afterClips) {
      return;
    }

    recordEditorMutation(
      label,
      decisionEvents,
      decisionEvents,
      beforeClips,
      afterClips,
    );
  }

  function addTimelineEditorClipFromSelection() {
    if (!normalizedRange) {
      setImportMessage("Set a source-time range before adding a timeline clip.");
      return;
    }

    const addedClipId = addTimelineEditorClip({
      startSourceTimeMs: normalizedRange.startSourceTimeMs,
      endSourceTimeMs: normalizedRange.endSourceTimeMs,
      trackId: timelineEditorTrackId,
      sourceType: "selection",
      label: `Range ${formatSourceTime(
        normalizedRange.startSourceTimeMs,
      )}–${formatSourceTime(normalizedRange.endSourceTimeMs)}`,
      note: "Added from timeline selection.",
    });
    setImportMessage(
      `Added timeline clip on ${formatTimelineTrackLabel(
        timelineEditorTrackId,
      )} from ${formatSourceTime(normalizedRange.startSourceTimeMs)} to ${formatSourceTime(
        normalizedRange.endSourceTimeMs,
      )}.`,
    );
    if (addedClipId) {
      setSelectedTimelineClipId(addedClipId);
    }
  }

  function addTimelineEditorClipFromMarkerPair(
    startMarker: TimelineMarker,
    endMarker: TimelineMarker,
    trackId: EditorTimelineTrackId = timelineEditorTrackId,
  ) {
    if (endMarker.sourceTimeMs <= startMarker.sourceTimeMs) {
      setImportMessage("Marker pair not valid for a timeline clip.");
      return;
    }

    const addedClipId = addTimelineEditorClip({
      startSourceTimeMs: startMarker.sourceTimeMs,
      endSourceTimeMs: endMarker.sourceTimeMs,
      trackId,
      sourceType: "manual",
      sourceId: `${startMarker.id}:${endMarker.id}`,
      label: `${startMarker.label} → ${endMarker.label}`,
      note: `Added from markers ${startMarker.label} to ${endMarker.label}.`,
    });
    setImportMessage(
      `Added timeline clip on ${formatTimelineTrackLabel(
        trackId,
      )} from ${formatSourceTime(startMarker.sourceTimeMs)} to ${formatSourceTime(
        endMarker.sourceTimeMs,
      )}.`,
    );
    if (addedClipId) {
      setSelectedTimelineClipId(addedClipId);
    }
  }

  function addTimelineEditorClip({
    trackId,
    sourceType,
    sourceId,
    startSourceTimeMs,
    endSourceTimeMs,
    label,
    note,
  }: {
    trackId: EditorTimelineTrackId;
    sourceType: EditorTimelineClipSource;
    sourceId?: string;
    startSourceTimeMs: number;
    endSourceTimeMs: number;
    label: string;
    note?: string;
  }): string | null {
    const start = clampSourceTime(
      snapTimelineSourceTime(
        startSourceTimeMs,
        timelineSnapToFrame,
        timelineFrameRate,
      ),
      sourceDurationMs,
    );
    const end = clampSourceTime(
      snapTimelineSourceTime(
        endSourceTimeMs,
        timelineSnapToFrame,
        timelineFrameRate,
      ),
      sourceDurationMs,
    );
    const minDurationMs = Math.max(1, currentTimelineFrameDurationMs);
    const normalizedRange = normalizeTimelineClipRange(
      start,
      end,
      sourceDurationMs,
      minDurationMs,
    );

    if (normalizedRange.endSourceTimeMs <= normalizedRange.startSourceTimeMs) {
      setImportMessage("Timeline clip end must be after start.");
      return null;
    }

    const now = new Date().toISOString();
    const clip: EditorTimelineClip = {
      id: createTimelineEditorClipId(),
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      ...(episodeManifest?.id ? { episodeId: episodeManifest.id } : {}),
      trackId,
      sourceType,
      ...(sourceId ? { sourceId } : {}),
      startSourceTimeMs: normalizedRange.startSourceTimeMs,
      endSourceTimeMs: normalizedRange.endSourceTimeMs,
      label:
        label ||
        `Clip ${formatSourceTime(normalizedRange.startSourceTimeMs)}-${formatSourceTime(
          normalizedRange.endSourceTimeMs,
        )}`,
      ...(note ? { note } : {}),
      createdBy: createdBy ?? config.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    mutateTimelineEditorClipsWithHistory(
      `Added timeline clip ${formatSourceTime(
        normalizedRange.startSourceTimeMs,
      )}-${formatSourceTime(normalizedRange.endSourceTimeMs)} on ${formatTimelineTrackLabel(
        trackId,
      )}`,
      (currentClips) =>
        sortEditorTimelineClips([clip, ...currentClips]).slice(
          0,
          MAX_EDITOR_TIMELINE_CLIPS,
        ),
    );
    return clip.id;
  }

  function updateTimelineEditorClip(
    clipId: string,
    updates: Partial<Pick<EditorTimelineClip, "startSourceTimeMs" | "endSourceTimeMs" | "trackId" | "label" | "note">>,
  ) {
    const now = new Date().toISOString();
    const normalizedStart = updates.startSourceTimeMs;
    const normalizedEnd = updates.endSourceTimeMs;
    const minDurationMs = Math.max(1, currentTimelineFrameDurationMs);

    mutateTimelineEditorClipsWithHistory(`Updated timeline clip ${clipId}`, (currentClips) =>
      currentClips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        if (
          normalizedStart === undefined &&
          normalizedEnd === undefined &&
          clip.trackId === updates.trackId &&
          clip.label === updates.label &&
          clip.note === updates.note
        ) {
          return clip;
        }

        const next = {
          ...clip,
          ...updates,
          updatedAt: now,
        } as EditorTimelineClip;
        const nextStart =
          normalizedStart === undefined
            ? next.startSourceTimeMs
            : clampSourceTime(
                snapTimelineSourceTime(
                  normalizedStart,
                  timelineSnapToFrame,
                  timelineFrameRate,
                ),
                sourceDurationMs,
              );
        const nextEnd =
          normalizedEnd === undefined
            ? next.endSourceTimeMs
            : clampSourceTime(
                snapTimelineSourceTime(
                  normalizedEnd,
                  timelineSnapToFrame,
                  timelineFrameRate,
                ),
                sourceDurationMs,
              );
        const normalizedRange = normalizeTimelineClipRange(
          nextStart,
          nextEnd,
          sourceDurationMs,
          minDurationMs,
        );

        return {
          ...next,
          startSourceTimeMs: normalizedRange.startSourceTimeMs,
          endSourceTimeMs: normalizedRange.endSourceTimeMs,
        };
      }),
    );
  }

  function moveTimelineEditorClip(
    clipId: string,
    deltaMs: number,
    trackId?: EditorTimelineTrackId,
  ) {
    const now = new Date().toISOString();

    mutateTimelineEditorClipsWithHistory(`Moved timeline clip ${clipId}`, (currentClips) =>
      currentClips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        const minDurationMs = Math.max(1, currentTimelineFrameDurationMs);
        const duration = clip.endSourceTimeMs - clip.startSourceTimeMs;
        const constrainedDuration = Math.min(
          Math.max(minDurationMs, duration),
          sourceDurationMs,
        );
        const rawStart = clip.startSourceTimeMs + deltaMs;
        const snappedStart = snapTimelineSourceTime(
          rawStart,
          timelineSnapToFrame,
          timelineFrameRate,
        );
        const startClamped = clampSourceTime(snappedStart, sourceDurationMs);
        const constrainedStart = clampSourceTime(
          Math.min(startClamped, sourceDurationMs - constrainedDuration),
          sourceDurationMs,
        );

        return {
          ...clip,
          trackId: trackId ?? clip.trackId,
          startSourceTimeMs: constrainedStart,
          endSourceTimeMs: constrainedStart + constrainedDuration,
          updatedAt: now,
        };
      }),
    );
  }

  function moveTimelineEditorClipToSourceTime(
    clipId: string,
    nextStartSourceTimeMs: number,
    trackId?: EditorTimelineTrackId,
  ) {
    const now = new Date().toISOString();

    mutateTimelineEditorClipsWithHistory(`Moved timeline clip ${clipId}`, (currentClips) =>
      currentClips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        const minDurationMs = Math.max(1, currentTimelineFrameDurationMs);
        const duration = clip.endSourceTimeMs - clip.startSourceTimeMs;
        const constrainedDuration = Math.min(
          Math.max(minDurationMs, duration),
          sourceDurationMs,
        );
        const snappedStart = snapTimelineSourceTime(
          nextStartSourceTimeMs,
          timelineSnapToFrame,
          timelineFrameRate,
        );
        const clampedStart = clampSourceTime(snappedStart, sourceDurationMs);
        const constrainedStart = clampSourceTime(
          Math.min(clampedStart, sourceDurationMs - constrainedDuration),
          sourceDurationMs,
        );

        return {
          ...clip,
          trackId: trackId ?? clip.trackId,
          startSourceTimeMs: constrainedStart,
          endSourceTimeMs: constrainedStart + constrainedDuration,
          updatedAt: now,
        };
      }),
    );
  }

  function changeTimelineEditorClipTrack(
    clipId: string,
    nextTrackId: EditorTimelineTrackId,
  ) {
    updateTimelineEditorClip(clipId, { trackId: nextTrackId });
  }

  function moveTimelineEditorClipToAdjacentTrack(
    clipId: string,
    direction: "up" | "down",
  ) {
    const trackIds = TIMELINE_EDITOR_TRACKS.map((track) => track.id);
    const clip = timelineEditorClips.find((candidate) => candidate.id === clipId);
    if (!clip) {
      return;
    }

    const currentIndex = trackIds.indexOf(clip.trackId);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex =
      direction === "up"
        ? Math.max(0, currentIndex - 1)
        : Math.min(trackIds.length - 1, currentIndex + 1);

    if (nextIndex === currentIndex) {
      return;
    }

    changeTimelineEditorClipTrack(clipId, trackIds[nextIndex]);
    setImportMessage(
      `Moved clip ${clip.label} to ${TIMELINE_EDITOR_TRACKS[nextIndex].label}.`,
    );
  }

  function trimTimelineEditorClip({
    clipId,
    edge,
    nextSourceTimeMs,
  }: {
    clipId: string;
    edge: "start" | "end";
    nextSourceTimeMs: number;
  }) {
    const now = new Date().toISOString();
    const minDurationMs = Math.max(1, currentTimelineFrameDurationMs);

    mutateTimelineEditorClipsWithHistory(`Trimmed timeline clip ${clipId}`, (currentClips) =>
      currentClips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        const snapped = clampSourceTime(
          snapTimelineSourceTime(
            nextSourceTimeMs,
            timelineSnapToFrame,
            timelineFrameRate,
          ),
          sourceDurationMs,
        );

        const clippedRange = normalizeTimelineClipRange(
          clip.startSourceTimeMs,
          clip.endSourceTimeMs,
          sourceDurationMs,
          minDurationMs,
        );

        if (edge === "start") {
          const normalizedRange = normalizeTimelineClipRange(
            snapped,
            clippedRange.endSourceTimeMs,
            sourceDurationMs,
            minDurationMs,
          );

          return {
            ...clip,
            startSourceTimeMs: normalizedRange.startSourceTimeMs,
            updatedAt: now,
          };
        }

        const normalizedRange = normalizeTimelineClipRange(
          clippedRange.startSourceTimeMs,
          snapped,
          sourceDurationMs,
          minDurationMs,
        );

        return {
          ...clip,
          startSourceTimeMs: normalizedRange.startSourceTimeMs,
          endSourceTimeMs: normalizedRange.endSourceTimeMs,
          updatedAt: now,
        };
      }),
    );
  }

  function removeTimelineEditorClip(clipId: string) {
    mutateTimelineEditorClipsWithHistory(`Deleted timeline clip ${clipId}`, (currentClips) =>
      currentClips.filter((clip) => clip.id !== clipId),
    );
    if (selectedTimelineClipId === clipId) {
      setSelectedTimelineClipId(undefined);
    }
  }

  function selectTimelineEditorClip(clipId?: string) {
    setSelectedTimelineClipId(clipId);
  }

  function setRangeStartAtPlayhead() {
    setRangeSelection((currentRange) => ({
      ...currentRange,
      startSourceTimeMs: clampSourceTime(sourceTimeMs, sourceDurationMs),
    }));
  }

  function setRangeEndAtPlayhead() {
    setRangeSelection((currentRange) => ({
      ...currentRange,
      endSourceTimeMs: clampSourceTime(sourceTimeMs, sourceDurationMs),
    }));
  }

  function setRangeHandleAtSourceTime(
    handle: "start" | "end",
    nextSourceTimeMs: number,
  ) {
    setRangeSelection((currentRange) => {
      const key = handle === "start" ? "startSourceTimeMs" : "endSourceTimeMs";

      return {
        ...currentRange,
        [key]: clampSourceTime(nextSourceTimeMs, sourceDurationMs),
      };
    });
  }

  function nudgeRangeHandle(handle: "start" | "end", deltaMs: number) {
    setRangeSelection((currentRange) => {
      const key = handle === "start" ? "startSourceTimeMs" : "endSourceTimeMs";
      const currentValue = currentRange[key] ?? sourceTimeMs;

      return {
        ...currentRange,
        [key]: clampSourceTime(currentValue + deltaMs, sourceDurationMs),
      };
    });
  }

  function dragRangeHandle(handle: "start" | "end", nextSourceTimeMs: number) {
    setRangeHandleAtSourceTime(handle, nextSourceTimeMs);
  }

  function clearRangeSelection() {
    setRangeSelection({});
  }

  function applyRangeState() {
    if (!normalizedRange) {
      setImportMessage("Set both range handles before applying a range state.");
      return;
    }

    applyStateAcrossRange({
      startSourceTimeMs: normalizedRange.startSourceTimeMs,
      endSourceTimeMs: normalizedRange.endSourceTimeMs,
      state: rangeState,
      label: `Set ${PROGRAM_STATE_LABELS[rangeState]} from ${formatSourceTime(
        normalizedRange.startSourceTimeMs,
      )} to ${formatSourceTime(normalizedRange.endSourceTimeMs)}`,
    });
  }

  function applyStateToNextMarker() {
    const endSourceTimeMs = nextMarkerAfterPlayhead?.sourceTimeMs ?? sourceDurationMs;

    if (endSourceTimeMs <= sourceTimeMs) {
      setImportMessage("No future marker or episode time remains from the playhead.");
      return;
    }

    applyStateAcrossRange({
      startSourceTimeMs: sourceTimeMs,
      endSourceTimeMs,
      state: rangeState,
      label: `Set ${PROGRAM_STATE_LABELS[rangeState]} from playhead to ${
        nextMarkerAfterPlayhead
          ? `marker ${nextMarkerAfterPlayhead.label}`
          : "episode end"
      }`,
    });
    setRangeSelection({
      startSourceTimeMs: sourceTimeMs,
      endSourceTimeMs,
    });
  }

  function applyStateAcrossRange({
    startSourceTimeMs,
    endSourceTimeMs,
    state,
    label,
  }: {
    startSourceTimeMs: number;
    endSourceTimeMs: number;
    state: ProgramState;
    label: string;
  }) {
    const start = clampSourceTime(startSourceTimeMs, sourceDurationMs);
    const end = clampSourceTime(endSourceTimeMs, sourceDurationMs);

    if (end <= start) {
      setImportMessage("Range end must be after range start.");
      return;
    }

    const restoreState = getCurrentDecisionEvent(decisionEvents, end)?.state;
    const createdAt = new Date().toISOString();
    const rangeEvents = [
      createSyntheticDecisionEvent({
        state,
        sourceTimeMs: start,
        createdAt,
        note: `Range tool: ${label}`,
      }),
      ...(end < sourceDurationMs && restoreState && restoreState !== state
        ? [
            createSyntheticDecisionEvent({
              state: restoreState,
              sourceTimeMs: end,
              createdAt,
              note: `Range tool restore after ${PROGRAM_STATE_LABELS[state]}`,
            }),
          ]
        : []),
    ];
    const nextEvents = mergeDecisionEvents([...decisionEvents, ...rangeEvents]);

    stopProgramPlayback();
    recordDecisionMutation(label, decisionEvents, nextEvents);
    importDecisionEvents({ decisionEvents: rangeEvents });
    setSelectedDecisionId(rangeEvents[0]?.id);
    scrubToSourceTime(start);
    setImportMessage(
      `${label}. Added ${rangeEvents.length} semantic decision event${
        rangeEvents.length === 1 ? "" : "s"
      }.`,
    );
  }

  function jumpToTranscriptSegment(segment: TranscriptSegment) {
    const nextTimeMs = clampSourceTime(
      segment.startSourceTimeMs,
      sourceDurationMs,
    );

    stopProgramPlayback();
    setSelectedTranscriptSegmentId(segment.id);
    setSelectedTranscriptWordId(undefined);
    scrubToSourceTime(nextTimeMs, { syncTranscriptWord: false });
    setImportMessage(
      `Jumped to transcript segment ${segment.id} at ${formatSourceTime(
        nextTimeMs,
      )}.`,
    );
  }

  function jumpToTranscriptWord(word: TimedTranscriptWord) {
    const nextTimeMs = clampSourceTime(
      word.startSourceTimeMs,
      sourceDurationMs,
    );

    stopProgramPlayback();
    setSelectedTranscriptSegmentId(word.segmentId);
    setSelectedTranscriptWordId(word.id);
    scrubToSourceTime(nextTimeMs);
    setImportMessage(`Jumped to word ${word.text} at ${formatSourceTime(nextTimeMs)}.`);
  }

  function setRangeFromTranscriptSegment(segment: TranscriptSegment) {
    const startSourceTimeMs = clampSourceTime(
      segment.startSourceTimeMs,
      sourceDurationMs,
    );
    const endSourceTimeMs = clampSourceTime(
      segment.endSourceTimeMs,
      sourceDurationMs,
    );

    if (endSourceTimeMs <= startSourceTimeMs) {
      setImportMessage("Transcript segment range is not valid.");
      return;
    }

    setSelectedTranscriptSegmentId(segment.id);
    setRangeSelection({ startSourceTimeMs, endSourceTimeMs });
    scrubToSourceTime(startSourceTimeMs);
    setImportMessage(
      `Set range from transcript segment ${segment.id}: ${formatSourceTime(
        startSourceTimeMs,
      )} to ${formatSourceTime(endSourceTimeMs)}.`,
    );
  }

  function applyTranscriptSegmentState(segment: TranscriptSegment | null) {
    if (!segment) {
      setImportMessage("Select a transcript segment before applying a state.");
      return;
    }

    const startSourceTimeMs = clampSourceTime(
      segment.startSourceTimeMs,
      sourceDurationMs,
    );
    const endSourceTimeMs = clampSourceTime(
      segment.endSourceTimeMs,
      sourceDurationMs,
    );

    if (endSourceTimeMs <= startSourceTimeMs) {
      setImportMessage("Transcript segment range is not valid.");
      return;
    }

    setSelectedTranscriptSegmentId(segment.id);
    setRangeSelection({ startSourceTimeMs, endSourceTimeMs });
    applyStateAcrossRange({
      startSourceTimeMs,
      endSourceTimeMs,
      state: transcriptLaneState,
      label: `Set ${PROGRAM_STATE_LABELS[transcriptLaneState]} across transcript segment ${segment.id}`,
    });
  }

  function setTranscriptSegmentDraft(segment: TranscriptSegment, text: string) {
    setTranscriptSegmentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [segment.id]: text,
    }));
  }

  function clearTranscriptSegmentDraft(segmentId: string) {
    setTranscriptSegmentDrafts((currentDrafts) => {
      if (!(segmentId in currentDrafts)) {
        return currentDrafts;
      }

      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[segmentId];
      return nextDrafts;
    });
  }

  function splitTranscriptTextIntoWords(text: string) {
    return normalizeTranscriptSegmentText(text)
      .split(/\s+/)
      .filter(Boolean);
  }

  function applyTranscriptWordTextEdit({
    segment,
    wordIndex,
    text,
  }: {
    segment: TranscriptSegment;
    wordIndex: number;
    text: string;
  }) {
    const segmentDraftText =
      transcriptSegmentDrafts[segment.id] ?? segment.text;
    const draftWords = splitTranscriptTextIntoWords(segmentDraftText);
    const replacementWords = splitTranscriptTextIntoWords(text);

    const replacementText = normalizeTranscriptSegmentText(replacementWords.join(" "));

    if (!replacementText) {
      setImportMessage(
        `Transcript word edit in ${segment.id} cannot be empty; keep at least one word.`,
      );
      return;
    }

    if (draftWords.length === 0) {
      setImportMessage(
        `Segment ${segment.id} has no editable words for this operation.`,
      );
      return;
    }

    const clampedIndex = clampNumberToRange(
      wordIndex,
      1,
      draftWords.length,
    );

    const nextWords = [...draftWords];
    nextWords[clampedIndex - 1] = replacementText;

    const nextText = normalizeTranscriptSegmentText(nextWords.join(" "));

    applyTranscriptSegmentTextEdit({
      segment,
      text: nextText,
      editedWordIndex: clampedIndex,
      editedWordText: replacementText,
    });
    setSelectedTranscriptWordDraft(replacementText);

    if (clampedIndex !== wordIndex) {
      setImportMessage(
        `Edited transcript word in ${segment.id} from position ${wordIndex} to ${clampedIndex} due index bounds. New text: ${replacementText}.`,
      );
    }
  }

  function applyTranscriptSegmentTextEdit({
    segment,
    text,
    editedWordIndex,
    editedWordText,
  }: {
    segment: TranscriptSegment;
    text: string;
    editedWordIndex?: number;
    editedWordText?: string;
  }) {
    const normalizedText = normalizeTranscriptSegmentText(text);

    if (!normalizedText) {
      setImportMessage(
        `Transcript segment ${segment.id} cannot be empty; keep at least one word.`,
      );
      return;
    }

    if (!episodeTranscript) {
      setImportMessage("Load a transcript before editing.");
      return;
    }

    const nextSegmentWords = normalizeTranscriptSegmentWordPayload({
      segment,
      segmentText: normalizedText,
      editedWordIndex,
      editedWordText,
    });

    const normalizedSegments = episodeTranscript.segments.map((currentSegment) =>
      currentSegment.id === segment.id
        ? {
            ...currentSegment,
            text: normalizedText,
            ...(nextSegmentWords
              ? { words: nextSegmentWords }
              : currentSegment.words !== undefined ? {} : {}),
            ...(segment.speaker !== currentSegment.speaker
              ? { speaker: segment.speaker }
              : {}),
          }
        : currentSegment,
    );

    const normalizedTranscriptSegments = normalizeTranscriptSegmentsForTimeline(
      normalizedSegments,
      sourceDurationMs,
    );
    const nextEpisodeTranscript = {
      ...episodeTranscript,
      segments: normalizedTranscriptSegments,
    };

    setEpisodeTranscript(nextEpisodeTranscript);
    clearTranscriptSegmentDraft(segment.id);
    setSelectedTranscriptSegmentId(segment.id);
    setImportMessage(
      `Updated transcript segment ${segment.id} text (${segment.speaker}: ${normalizedText.length} chars).`,
    );
  }

  function splitTranscriptSegmentPhrase({
    segment,
    fromWordIndex,
    toWordIndex,
  }: {
    segment: TranscriptSegment;
    fromWordIndex: number;
    toWordIndex: number;
  }) {
    if (!episodeTranscript) {
      setImportMessage("Load a transcript before splitting.");
      return;
    }

    const tokens = buildSegmentWordTokens(
      segment,
      sourceDurationMs,
      selectedTranscriptSegmentDraftText,
    );

    if (tokens.length < 2) {
      setImportMessage(
        `Need at least two words in segment ${segment.id} to split it into phrases.`,
      );
      return;
    }

    const clampedFromIndex = clampNumberToRange(
      fromWordIndex,
      1,
      tokens.length,
    );
    const clampedToIndex = clampNumberToRange(toWordIndex, 1, tokens.length);

    if (clampedFromIndex > clampedToIndex) {
      setImportMessage(
        `Split phrase index range is invalid in segment ${segment.id}.`,
      );
      return;
    }

    const phraseStartBoundary = clampBoundaryTimeFromTokens(
      segment.startSourceTimeMs,
      segment.endSourceTimeMs,
      tokens,
      clampedFromIndex - 1,
      sourceDurationMs,
    );
    const phraseEndBoundary = clampBoundaryTimeFromTokens(
      segment.startSourceTimeMs,
      segment.endSourceTimeMs,
      tokens,
      clampedToIndex,
      sourceDurationMs,
    );

    if (
      phraseStartBoundary < segment.startSourceTimeMs ||
      phraseEndBoundary > segment.endSourceTimeMs ||
      phraseStartBoundary >= phraseEndBoundary
    ) {
      setImportMessage(
        `Phrase split in segment ${segment.id} did not produce valid timing boundaries.`,
      );
      return;
    }

    const replacementSegments = buildTranscriptSplitPiecesFromWords({
      originalSegment: segment,
      tokens,
      sourceDurationMs,
      draftText: selectedTranscriptSegmentDraftText,
      splitPhraseStartWordIndex: clampedFromIndex,
      splitPhraseEndWordIndex: clampedToIndex,
      splitSourceWords: getUnknownObject(segment, "words"),
    });

    if (replacementSegments.length < 2) {
      setImportMessage(
        `Could not split segment ${segment.id}; no text change was made.`,
      );
      return;
    }

    const nextSegments = buildTranscriptSegmentsAfterSplit(
      episodeTranscript.segments,
      segment.id,
      replacementSegments,
    );

    if (!nextSegments) {
      setImportMessage(
        `Could not split segment ${segment.id}; it was not found in the current transcript.`,
      );
      return;
    }

    const replacedStartTime = segment.startSourceTimeMs;
    const replacedEndTime = segment.endSourceTimeMs;
    const nextEpisodeTranscript = {
      ...episodeTranscript,
      segments: normalizeTranscriptSegmentsForTimeline(
        nextSegments,
        sourceDurationMs,
      ),
    };

    setEpisodeTranscript(nextEpisodeTranscript);
    setSelectedTranscriptWordId(undefined);
    setSelectedTranscriptWordDraft("");
    setClipCandidates((currentCandidates) =>
      restoreTranscriptSegmentBasedCandidates(
        currentCandidates,
        segment,
        replacementSegments,
        replacedStartTime,
        replacedEndTime,
      ),
    );
    clearTranscriptSegmentDraft(segment.id);
    const firstReplacementSegment = replacementSegments[0];
    const firstReplacementSegmentId = firstReplacementSegment?.id;
    setTranscriptSegmentDrafts((currentDrafts) => {
      if (!firstReplacementSegmentId) {
        return currentDrafts;
      }

      const currentSegmentDraft = currentDrafts[firstReplacementSegmentId];
      return {
        ...currentDrafts,
        [firstReplacementSegmentId]:
          currentSegmentDraft ??
          normalizeTranscriptSegmentText(firstReplacementSegment.text),
      };
    });
    setSelectedTranscriptSegmentId(firstReplacementSegmentId);
    setImportMessage(
      `Split segment ${segment.id} into ${replacementSegments.length} segment${replacementSegments.length === 1 ? "" : "s"}.`,
    );

    const durationDelta =
      (nextEpisodeTranscript.segments.find(
        (candidate) => candidate.id === segment.id,
      )?.endSourceTimeMs ??
        (replacementSegments[replacementSegments.length - 1]?.endSourceTimeMs ??
          replacedEndTime)) - replacedEndTime;
    applyTranscriptTimelineRipple({
      anchorSourceTimeMs: replacedEndTime,
      durationDeltaMs: durationDelta,
    });
    if (Math.abs(durationDelta) > 0.01) {
      setClipCandidates((currentCandidates) =>
        shiftClipCandidatesAfterTranscriptDurationChange(
          currentCandidates,
          replacedEndTime,
          durationDelta,
          sourceDurationMs,
        ),
      );
    }
  }

  function applyTranscriptTimelineRipple({
    anchorSourceTimeMs,
    durationDeltaMs,
  }: {
    anchorSourceTimeMs: number;
    durationDeltaMs: number;
  }) {
    if (!durationDeltaMs || !Number.isFinite(durationDeltaMs)) {
      return;
    }

    const clampedAnchorMs = clampSourceTime(anchorSourceTimeMs, sourceDurationMs);
    if (Math.abs(durationDeltaMs) <= 0.01) {
      return;
    }

    setTimelineEditorClips((currentClips) =>
      shiftTimelineEditorClipsAfterTranscriptDurationChange(
        currentClips,
        clampedAnchorMs,
        durationDeltaMs,
        sourceDurationMs,
      ),
    );
    setTimelineMarkers((currentMarkers) =>
      shiftTimelineMarkersAfterTranscriptDurationChange(
        currentMarkers,
        clampedAnchorMs,
        durationDeltaMs,
        sourceDurationMs,
      ),
    );
    replaceDecisionEvents(
      shiftDecisionEventsAfterTranscriptDurationChange(
        decisionEvents,
        clampedAnchorMs,
        durationDeltaMs,
        sourceDurationMs,
      ),
    );
    setRangeSelection((currentRange) =>
      shiftRangeSelectionAfterTranscriptDurationChange(
        currentRange,
        clampedAnchorMs,
        durationDeltaMs,
        sourceDurationMs,
      ),
    );
  }

  function createClipCandidateFromCurrentSegment() {
    if (!currentSegment) {
      setImportMessage("Add or select a semantic segment before creating a clip candidate.");
      return;
    }

    const endSourceTimeMs = currentSegment.endSourceTimeMs ?? sourceDurationMs;

    addClipCandidate({
      source: "current_segment",
      sourceId: currentSegment.sourceEventId,
      startSourceTimeMs: currentSegment.startSourceTimeMs,
      endSourceTimeMs,
      fallbackTitle: `${PROGRAM_STATE_LABELS[currentSegment.state]} clip at ${formatSourceTime(
        currentSegment.startSourceTimeMs,
      )}`,
      fallbackSummary: `Candidate from current ${PROGRAM_STATE_LABELS[currentSegment.state]} segment.`,
      reasons: [
        `Current semantic state is ${PROGRAM_STATE_LABELS[currentSegment.state]}.`,
        "Created manually from the active segment in Studio Cut.",
      ],
    });
  }

  function createClipCandidateFromSelectedRange() {
    if (!normalizedRange) {
      setImportMessage("Set a range before creating a clip candidate from range.");
      return;
    }

    addClipCandidate({
      source: "selected_range",
      startSourceTimeMs: normalizedRange.startSourceTimeMs,
      endSourceTimeMs: normalizedRange.endSourceTimeMs,
      fallbackTitle: `Range clip ${formatSourceTime(
        normalizedRange.startSourceTimeMs,
      )}`,
      fallbackSummary: "Candidate from the selected source-time range.",
      reasons: [
        "Created manually from the selected range.",
        `Range duration ${formatSourceTime(
          normalizedRange.endSourceTimeMs - normalizedRange.startSourceTimeMs,
        )}.`,
      ],
    });
  }

  function createClipCandidateFromTranscriptSegment() {
    if (!selectedTranscriptSegment) {
      setImportMessage("Select a transcript segment before creating a clip candidate.");
      return;
    }

    addClipCandidate({
      source: "transcript_segment",
      sourceId: selectedTranscriptSegment.id,
      startSourceTimeMs: selectedTranscriptSegment.startSourceTimeMs,
      endSourceTimeMs: selectedTranscriptSegment.endSourceTimeMs,
      fallbackTitle: `Transcript clip ${formatSourceTime(
        selectedTranscriptSegment.startSourceTimeMs,
      )}`,
      fallbackSummary: `${selectedTranscriptSegment.speaker}: ${truncateText(
        selectedTranscriptSegment.text,
        120,
      )}`,
      reasons: [
        "Created manually from a timed transcript segment.",
        selectedTranscriptSegment.speakerRole
          ? `Speaker role ${selectedTranscriptSegment.speakerRole}.`
          : `Speaker ${selectedTranscriptSegment.speaker}.`,
      ],
    });
  }

  function createClipCandidateFromMarkerRange() {
    const previousMarker = [...currentRoomMarkers]
      .reverse()
      .find((marker) => marker.sourceTimeMs <= sourceTimeMs);
    const nextMarker = currentRoomMarkers.find(
      (marker) => marker.sourceTimeMs > sourceTimeMs,
    );

    if (!previousMarker || !nextMarker) {
      setImportMessage(
        "Need a marker at/before the playhead and another marker after it to create a marker-range clip.",
      );
      return;
    }

    addClipCandidate({
      source: "marker_range",
      sourceId: `${previousMarker.id}:${nextMarker.id}`,
      startSourceTimeMs: previousMarker.sourceTimeMs,
      endSourceTimeMs: nextMarker.sourceTimeMs,
      fallbackTitle: `${previousMarker.label} clip`,
      fallbackSummary: `Candidate from marker ${previousMarker.label} to ${nextMarker.label}.`,
      reasons: [
        "Created manually from marker-to-marker range.",
        `Starts at marker ${previousMarker.label}.`,
        `Ends at marker ${nextMarker.label}.`,
      ],
    });
  }

  function addClipCandidate({
    source,
    sourceId,
    startSourceTimeMs,
    endSourceTimeMs,
    fallbackTitle,
    fallbackSummary,
    reasons,
  }: {
    source: ClipCandidateSource;
    sourceId?: string;
    startSourceTimeMs: number;
    endSourceTimeMs: number;
    fallbackTitle: string;
    fallbackSummary: string;
    reasons: string[];
  }) {
    const start = clampSourceTime(startSourceTimeMs, sourceDurationMs);
    const end = clampSourceTime(endSourceTimeMs, sourceDurationMs);

    if (end <= start) {
      setImportMessage("Clip candidate end must be after start.");
      return;
    }

    const now = new Date().toISOString();
    const title = clipCandidateTitleDraft.trim() || fallbackTitle;
    const summary = clipCandidateSummaryDraft.trim() || fallbackSummary;
    const candidate: ClipCandidate = {
      id: createClipCandidateId(),
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      ...(episodeManifest?.id ? { episodeId: episodeManifest.id } : {}),
      title,
      summary,
      startSourceTimeMs: start,
      endSourceTimeMs: end,
      status: "suggested",
      targetProfiles: [...CLIP_RENDER_PROFILES],
      score: estimateClipCandidateScore(start, end, sourceDurationMs),
      reasons,
      source,
      ...(sourceId ? { sourceId } : {}),
      createdBy: createdBy ?? config.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    setClipCandidates((currentCandidates) =>
      sortClipCandidates([candidate, ...currentCandidates]).slice(
        0,
        MAX_CLIP_CANDIDATES,
      ),
    );
    setClipCandidateTitleDraft("");
    setClipCandidateSummaryDraft("");
    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      lastAction: `Created clip candidate ${title}`,
    }));
    setImportMessage(
      `Created clip candidate "${title}" from ${formatSourceTime(start)} to ${formatSourceTime(
        end,
      )}.`,
    );
  }

  function updateClipCandidateStatus(
    candidateId: string,
    status: ClipCandidateStatus,
  ) {
    const updatedAt = new Date().toISOString();
    setClipCandidates((currentCandidates) =>
      currentCandidates.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              status,
              updatedAt,
            }
          : candidate,
      ),
    );
  }

  function removeClipCandidate(candidateId: string) {
    setClipCandidates((currentCandidates) =>
      currentCandidates.filter((candidate) => candidate.id !== candidateId),
    );
  }

  function jumpToClipCandidate(candidate: ClipCandidate) {
    scrubToSourceTime(candidate.startSourceTimeMs);
  }

  function setTimelineTrackFilter(
    trackId: EditorTimelineTrackId,
    isEnabled: boolean,
  ) {
    setTimelineTrackFilters((currentFilters) => {
      if (currentFilters[trackId] === isEnabled) {
        return currentFilters;
      }

      const nextFilters = {
        ...currentFilters,
        [trackId]: isEnabled,
      };

      const nextEnabledCount = Object.values(nextFilters).filter(
        Boolean,
      ).length;

      if (nextEnabledCount === 0) {
        setImportMessage("Keep at least one timeline layer visible.");
        return currentFilters;
      }

      return nextFilters;
    });
  }

  function toggleTranscriptSpeakerFilter(speaker: string, isVisible: boolean) {
    setTranscriptSpeakerFilters((currentFilters) => {
      const nextFilters = {
        ...currentFilters,
        [speaker]: isVisible,
      };

      const enabledCount = Object.values(nextFilters).filter(Boolean).length;
      if (enabledCount === 0) {
        setImportMessage("Keep at least one speaker visible.");
        return currentFilters;
      }

      return nextFilters;
    });
  }

  function applyTranscriptSegmentSpeakerEdit({
    segment,
    speaker,
  }: {
    segment: TranscriptSegment;
    speaker: string;
  }) {
    if (!episodeTranscript) {
      setImportMessage("Load a transcript before editing speaker tags.");
      return;
    }

    const nextSpeaker = normalizeTranscriptSpeakerLabel(speaker);
    if (!nextSpeaker) {
      setImportMessage("Speaker tag cannot be empty.");
      return;
    }

    const nextSegments = episodeTranscript.segments.map((currentSegment) =>
      currentSegment.id === segment.id
        ? {
            ...currentSegment,
            speaker: nextSpeaker,
          }
        : currentSegment,
    );

    const nextEpisodeTranscript = {
      ...episodeTranscript,
      segments: nextSegments,
    };

    setEpisodeTranscript(nextEpisodeTranscript);
    setImportMessage(
      `Updated speaker tag for transcript segment ${segment.id} to ${nextSpeaker}.`,
    );
  }

  function exportClipCandidatesJson() {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      episodeId: episodeManifest?.id,
      clipCandidates: currentRoomClipCandidates,
    };

    downloadJsonFile(
      payload,
      getClipCandidatesFileName(
        episodeManifest,
        roomSelection,
        formatCheckpointTimestamp(new Date()),
      ),
    );
  }

  function exportEpisodeOutputPackageJson() {
    const exportedAt = new Date();
    const payload = buildEpisodeOutputPackage({
      exportedAt: exportedAt.toISOString(),
      roomSelection,
      manifest: episodeManifest,
      sourceDurationMs,
      derivedSegments,
      setupBoard: episodeSetupBoard,
      decisionEvents: sortedEvents,
      clipCandidates: currentRoomClipCandidates,
      transcript: episodeTranscript,
      syncMap: syncReview.syncMap,
      localProxyVideo,
      outputDurationSummary,
    });

    downloadJsonFile(
      payload,
      getEpisodeOutputPackageFileName(
        episodeManifest,
        roomSelection,
        formatCheckpointTimestamp(exportedAt),
        "json",
      ),
    );
  }

  function exportEpisodeOutputPackageMarkdown() {
    const exportedAt = new Date();
    const payload = buildEpisodeOutputPackage({
      exportedAt: exportedAt.toISOString(),
      roomSelection,
      manifest: episodeManifest,
      sourceDurationMs,
      derivedSegments,
      setupBoard: episodeSetupBoard,
      decisionEvents: sortedEvents,
      clipCandidates: currentRoomClipCandidates,
      transcript: episodeTranscript,
      syncMap: syncReview.syncMap,
      localProxyVideo,
      outputDurationSummary,
    });

    downloadTextFile(
      renderEpisodeOutputPackageMarkdown(payload),
      getEpisodeOutputPackageFileName(
        episodeManifest,
        roomSelection,
        formatCheckpointTimestamp(exportedAt),
        "md",
      ),
      "text/markdown",
    );
  }

  function exportRenderProfilePlanJson() {
    const exportedAt = new Date();
    const payload = buildRenderProfilePlan({
      exportedAt: exportedAt.toISOString(),
      roomSelection,
      manifest: episodeManifest,
      sourceDurationMs,
      clipCandidates: currentRoomClipCandidates,
    });

    downloadJsonFile(
      payload,
      getRenderProfilePlanFileName(
        episodeManifest,
        roomSelection,
        formatCheckpointTimestamp(exportedAt),
      ),
    );
  }

  function createSyntheticDecisionEvent({
    state,
    sourceTimeMs,
    createdAt,
    note,
  }: {
    state: ProgramState;
    sourceTimeMs: number;
    createdAt: string;
    note: string;
  }): DecisionEvent {
    return {
      id: createDecisionEventId(),
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      sourceTimeMs: clampSourceTime(sourceTimeMs, sourceDurationMs),
      state,
      createdBy: createdBy ?? config.createdBy,
      createdAt,
      clientId: sessionId,
      operation: "upsert",
      note,
    };
  }

  function undoDecisionChange() {
    const currentNode = getDecisionHistoryCurrentNode(decisionHistory);
    const previousNode =
      currentNode?.parentId != null
        ? decisionHistory.nodes[currentNode.parentId]
        : null;

    if (!currentNode || !previousNode) {
      return;
    }

    const previousState = getDecisionHistoryStateAtNode(decisionHistory, previousNode.id);
    if (!previousState) {
      return;
    }

    stopProgramPlayback();
    restoreDecisionHistoryState(previousState);

    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      currentNodeId: previousNode.id,
      lastAction: `Undid ${currentNode.label}`,
    }));
  }

  function redoDecisionChange() {
    const currentNode = getDecisionHistoryCurrentNode(decisionHistory);
    if (!currentNode) {
      return;
    }

    const nextNodeId =
      currentNode.childrenIds.length === 0
        ? null
        : currentNode.childrenIds[currentNode.childrenIds.length - 1];
    const nextNode =
      nextNodeId === null ? null : decisionHistory.nodes[nextNodeId] ?? null;

    if (!currentNode || !nextNode) {
      return;
    }

    const nextState = getDecisionHistoryStateAtNode(decisionHistory, nextNode.id);
    if (!nextState) {
      return;
    }

    stopProgramPlayback();
    restoreDecisionHistoryState(nextState);

    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      currentNodeId: nextNode.id,
      lastAction: `Redid ${nextNode.label}`,
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

  function handleExportAgentContext() {
    const exportedAt = new Date();
    const checkpointTimestamp = formatCheckpointTimestamp(exportedAt);
    const brief = buildAgentWorkspaceBrief({
      exportedAt: exportedAt.toISOString(),
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      roomUrl: buildCurrentSharedRoomUrl(roomSelection),
      manifest: episodeManifest,
      sourceDurationMs,
      currentSourceTimeMs: sourceTimeMs,
      currentState,
      localProxyVideo,
      persistenceStatus: status,
      sharedRoomMetadata,
      syncReview,
      transcript: episodeTranscript,
      transcriptReview,
      clipCandidates: currentRoomClipCandidates,
      allDecisionEvents,
      derivedSegments,
      warnings: readinessWarnings,
    });

    downloadJsonFile(
      brief,
      getAgentContextFileName(
        episodeManifest,
        roomSelection,
        checkpointTimestamp,
      ),
    );
    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      lastAction: `Exported agent context ${checkpointTimestamp}`,
    }));
  }

  function handleExportTranscriptSuggestedOps() {
    const payload = buildTranscriptSuggestedDecisionOps({
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      review: transcriptReview,
    });

    if (payload.operations.length === 0) {
      setImportMessage(
        "Transcript review has no suggested agent operations to export.",
      );
      return;
    }

    const exportedAt = new Date();
    const checkpointTimestamp = formatCheckpointTimestamp(exportedAt);

    downloadJsonFile(
      payload,
      getTranscriptSuggestedOpsFileName(
        episodeManifest,
        roomSelection,
        checkpointTimestamp,
      ),
    );
    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      lastAction: `Exported transcript agent ops ${checkpointTimestamp}`,
    }));
  }

  function toggleTranscriptCleanupSuggestion(suggestionId: string) {
    setSelectedTranscriptCleanupSuggestionIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(suggestionId)) {
        nextIds.delete(suggestionId);
      } else {
        nextIds.add(suggestionId);
      }

      return nextIds;
    });
  }

  function selectAllTranscriptCleanupSuggestions() {
    setSelectedTranscriptCleanupSuggestionIds(
      new Set(transcriptCleanupSuggestions.map((suggestion) => suggestion.id)),
    );
  }

  function clearTranscriptCleanupSuggestions() {
    setSelectedTranscriptCleanupSuggestionIds(new Set());
  }

  function previewSelectedTranscriptCleanupSuggestions() {
    const selectedOperations = transcriptCleanupSuggestions.flatMap((suggestion) =>
      selectedTranscriptCleanupSuggestionIds.has(suggestion.id)
        ? suggestion.operations
        : [],
    );

    if (selectedOperations.length === 0) {
      setImportMessage("Select at least one transcript cleanup suggestion first.");
      return;
    }

    const payload = {
      schemaVersion: 1 as const,
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      operations: selectedOperations,
    };
    const preview = buildAgentDecisionOpsPreview({
      payload,
      fileName: `${episodeManifest?.id ?? roomSelection.projectId}-transcript-cleanup-inline.json`,
      currentEvents: decisionEvents,
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      createdBy: createdBy ?? config.createdBy,
      sourceDurationMs,
      clientId: sessionId,
    });

    setAgentOpsPreview(preview);
    setSelectedAgentOperationIndexes(
      new Set(preview.operations.map((_, index) => index)),
    );
    setRejectedAgentOperationIndexes(new Set());
    setImportMessage(
      preview.errors.length > 0
        ? `Transcript cleanup preview blocked: ${preview.errors.length} issue${
            preview.errors.length === 1 ? "" : "s"
          } found.`
        : `Transcript cleanup preview loaded with ${preview.operations.length} operation${
            preview.operations.length === 1 ? "" : "s"
          }. Review in Agent Suggestions Inbox before applying.`,
    );
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
      schemaVersion: 2,
      id: createLocalCheckpointId(),
      label,
      episodeId: episodeManifest?.id,
      projectId: config.projectId,
      branchId: config.branchId,
      createdAt,
      decisionEvents: cloneDecisionEvents(sortedEvents),
      timelineEditorClips: cloneEditorTimelineClips(timelineEditorClips),
      decisionHistory: buildPersistableDecisionHistory(decisionHistory),
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
    const historyState = checkpoint.decisionHistory
      ? getDecisionHistoryStateAtNode(
          checkpoint.decisionHistory,
          checkpoint.decisionHistory.currentNodeId,
        )
      : null;

    if (checkpoint.decisionHistory && historyState) {
      setDecisionHistory(buildPersistableDecisionHistory(checkpoint.decisionHistory));
      restoreDecisionHistoryState(historyState);
      setImportMessage(
        `Restored local checkpoint "${checkpoint.label}" with ${checkpoint.decisionEvents.length} decision${
          checkpoint.decisionEvents.length === 1 ? "" : "s"
        } and ${checkpoint.timelineEditorClips.length} timeline clip${
          checkpoint.timelineEditorClips.length === 1 ? "" : "s"
        }.`,
      );
      return;
    }

    const restoredEvents = cloneDecisionEvents(checkpoint.decisionEvents);
    const restoredTimelineClips = cloneEditorTimelineClips(
      checkpoint.timelineEditorClips,
    );
    replaceDecisionEvents(restoredEvents);
    restoreDecisionHistoryState({
      decisionEvents: restoredEvents,
      timelineEditorClips: restoredTimelineClips,
    });
    setDecisionHistory({
      ...createEmptyDecisionHistory(),
      rootState: {
        decisionEvents: restoredEvents,
        timelineEditorClips: restoredTimelineClips,
      },
    });

    setImportMessage(
      `Restored local checkpoint "${checkpoint.label}" with ${checkpoint.decisionEvents.length} decision${
        checkpoint.decisionEvents.length === 1 ? "" : "s"
      }.`,
    );
  }

  function handleExportLocalCheckpoint(checkpoint: LocalDecisionCheckpoint) {
    const payload =
      checkpoint.schemaVersion === 2 && checkpoint.decisionHistory
        ? {
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            projectId: checkpoint.projectId,
            branchId: checkpoint.branchId,
            decisionEvents: cloneDecisionEvents(checkpoint.decisionEvents),
      timelineEditorClips: cloneEditorTimelineClips(
              checkpoint.timelineEditorClips,
            ),
            decisionHistory: buildPersistableDecisionHistory(checkpoint.decisionHistory),
          }
        : {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            projectId: checkpoint.projectId,
            branchId: checkpoint.branchId,
            decisionEvents: cloneDecisionEvents(checkpoint.decisionEvents),
            timelineEditorClips: cloneEditorTimelineClips(
              checkpoint.timelineEditorClips,
            ),
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

  async function handleImportAgentOpsJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const preview = buildAgentDecisionOpsPreview({
        payload,
        fileName: file.name,
        currentEvents: decisionEvents,
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
        createdBy: createdBy ?? config.createdBy,
        sourceDurationMs,
        clientId: sessionId,
      });

      setAgentOpsPreview(preview);
      setSelectedAgentOperationIndexes(
        new Set(preview.operations.map((_, index) => index)),
      );
      setRejectedAgentOperationIndexes(new Set());
      setImportMessage(
        preview.errors.length > 0
          ? `Agent ops preview blocked: ${preview.errors.length} issue${
              preview.errors.length === 1 ? "" : "s"
            } found.`
          : `Agent ops preview loaded from ${file.name}. Review before applying.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAgentOpsPreview({
        fileName: file.name,
        operationCount: 0,
        addCount: 0,
        rangeCount: 0,
        removeCount: 0,
        approvalRequiredCount: 0,
        activeDecisionCountAfterApply: decisionEvents.length,
        tombstonedDecisionCountAfterApply: 0,
        operations: [],
        decisionEvents,
        activeDecisionEvents: decisionEvents,
        summaries: [],
        warnings: [],
        errors: [`Agent ops import failed: ${message}`],
      });
      setSelectedAgentOperationIndexes(new Set());
      setRejectedAgentOperationIndexes(new Set());
      setImportMessage(`Agent ops import failed: ${message}`);
    } finally {
      event.target.value = "";
    }
  }

  function handleApplyAllAgentDecisionOps() {
    if (!agentOpsPreview || agentOpsPreview.errors.length > 0) {
      return;
    }

    stopProgramPlayback();
    recordDecisionMutation(
      `Applied ${agentOpsPreview.operationCount} agent operation${
        agentOpsPreview.operationCount === 1 ? "" : "s"
      } from ${agentOpsPreview.fileName}`,
      decisionEvents,
      agentOpsPreview.activeDecisionEvents,
    );
    const result = importDecisionEvents({
      schemaVersion: 1,
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      decisionEvents: agentOpsPreview.decisionEvents,
    });

    setImportMessage(
      `Applied ${agentOpsPreview.operationCount} agent operation${
        agentOpsPreview.operationCount === 1 ? "" : "s"
      }. Imported/upserted ${result.importedCount} event${
        result.importedCount === 1 ? "" : "s"
      }.`,
    );
    setAgentOpsPreview(null);
    setSelectedAgentOperationIndexes(new Set());
    setRejectedAgentOperationIndexes(new Set());
  }

  function handleToggleAgentOperation(index: number) {
    if (rejectedAgentOperationIndexes.has(index)) {
      return;
    }

    setSelectedAgentOperationIndexes((currentIndexes) => {
      const nextIndexes = new Set(currentIndexes);

      if (nextIndexes.has(index)) {
        nextIndexes.delete(index);
      } else {
        nextIndexes.add(index);
      }

      return nextIndexes;
    });
  }

  function handleSelectAllAgentOperations() {
    if (!agentOpsPreview) {
      return;
    }

    setSelectedAgentOperationIndexes(
      new Set(
        agentOpsPreview.operations
          .map((_, index) => index)
          .filter((index) => !rejectedAgentOperationIndexes.has(index)),
      ),
    );
  }

  function handleRejectSelectedAgentOperations() {
    if (!agentOpsPreview || selectedAgentOperationIndexes.size === 0) {
      return;
    }

    setRejectedAgentOperationIndexes((currentIndexes) => {
      const nextIndexes = new Set(currentIndexes);
      selectedAgentOperationIndexes.forEach((index) => nextIndexes.add(index));
      return nextIndexes;
    });
    setSelectedAgentOperationIndexes(new Set());
    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      lastAction: `Rejected ${selectedAgentOperationIndexes.size} agent suggestion${
        selectedAgentOperationIndexes.size === 1 ? "" : "s"
      }`,
    }));
  }

  function handleRestoreRejectedAgentOperations() {
    if (!agentOpsPreview) {
      return;
    }

    setRejectedAgentOperationIndexes(new Set());
    setSelectedAgentOperationIndexes(
      new Set(agentOpsPreview.operations.map((_, index) => index)),
    );
    setDecisionHistory((currentHistory) => ({
      ...currentHistory,
      lastAction: "Restored rejected agent suggestions",
    }));
  }

  function handleApplySelectedAgentDecisionOps() {
    if (!agentOpsPreview || agentOpsPreview.errors.length > 0) {
      return;
    }

    const selectedOperations = agentOpsPreview.operations.filter(
      (_, index) =>
        selectedAgentOperationIndexes.has(index) &&
        !rejectedAgentOperationIndexes.has(index),
    );

    if (selectedOperations.length === 0) {
      setImportMessage("Select at least one agent suggestion before applying.");
      return;
    }

    const selectedPreview = buildAgentDecisionOpsPreview({
      payload: {
        schemaVersion: 1,
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
        operations: selectedOperations,
      },
      fileName: `${agentOpsPreview.fileName} selected suggestions`,
      currentEvents: decisionEvents,
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      createdBy: createdBy ?? config.createdBy,
      sourceDurationMs,
      clientId: sessionId,
    });

    if (selectedPreview.errors.length > 0) {
      setAgentOpsPreview(selectedPreview);
      setSelectedAgentOperationIndexes(
        new Set(selectedPreview.operations.map((_, index) => index)),
      );
      setRejectedAgentOperationIndexes(new Set());
      setImportMessage(
        `Selected agent suggestions blocked: ${selectedPreview.errors.length} issue${
          selectedPreview.errors.length === 1 ? "" : "s"
        } found.`,
      );
      return;
    }

    stopProgramPlayback();
    recordDecisionMutation(
      `Applied ${selectedOperations.length} selected agent suggestion${
        selectedOperations.length === 1 ? "" : "s"
      } from ${agentOpsPreview.fileName}`,
      decisionEvents,
      selectedPreview.activeDecisionEvents,
    );
    const result = importDecisionEvents({
      schemaVersion: 1,
      projectId: roomSelection.projectId,
      branchId: roomSelection.branchId,
      decisionEvents: selectedPreview.decisionEvents,
    });

    setImportMessage(
      `Applied ${selectedOperations.length} selected agent suggestion${
        selectedOperations.length === 1 ? "" : "s"
      }. Imported/upserted ${result.importedCount} event${
        result.importedCount === 1 ? "" : "s"
      }.`,
    );
    setAgentOpsPreview(null);
    setSelectedAgentOperationIndexes(new Set());
    setRejectedAgentOperationIndexes(new Set());
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

  async function handleImportTranscriptJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const result = parseEpisodeTranscriptPayload(payload);

      if (!result.ok) {
        setImportMessage(`Transcript import failed: ${result.reason}`);
        return;
      }

      setEpisodeTranscript(
        normalizeEpisodeTranscriptSpeakerTags(result.transcript),
      );
      setTranscriptSegmentDrafts({});
      setSelectedTranscriptSegmentId(undefined);
      setSelectedTranscriptWordId(undefined);
      setSelectedTranscriptWordDraft("");
      setImportMessage(
        `Loaded transcript ${result.transcript.episodeId}: ${result.transcript.segments.length} segment${
          result.transcript.segments.length === 1 ? "" : "s"
        }.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportMessage(`Transcript import failed: ${message}`);
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
        message: "Computing package fingerprints before upload.",
        shareUrl: "",
      });
      updateRescueSyncPackageMessage(
        "info",
        "Computing package fingerprints for the generated room package.",
      );

      const manifestSha256 = await computeFileSha256(manifestFile);
      const sourceMonitorProxySha256 = await computeFileSha256(proxyFile);
      const syncMapSha256 = await computeFileSha256(syncMapFile);
      const syncReportSha256 =
        syncReportFile && syncReportStoragePath
          ? await computeFileSha256(syncReportFile)
          : undefined;
      const packageFingerprint = await computeTextSha256(
        buildPackageFingerprintSeed({
          manifestSha256,
          sourceMonitorProxySha256,
          syncMapSha256,
          ...(syncReportSha256 ? { syncReportSha256 } : {}),
        }),
      );
      const packageIntegrity: SharedRoomPackageIntegrity = {
        manifest: {
          fileName: manifestFile.name,
          sizeBytes: manifestFile.size,
          sha256: manifestSha256,
          storagePath: manifestStoragePath,
        },
        sourceMonitorProxy: {
          fileName: proxyFile.name,
          sizeBytes: proxyFile.size,
          sha256: sourceMonitorProxySha256,
          storagePath: sourceMonitorProxyStoragePath,
        },
        syncMap: {
          fileName: syncMapFile.name,
          sizeBytes: syncMapFile.size,
          sha256: syncMapSha256,
          storagePath: syncMapStoragePath,
        },
        ...(syncReportFile && syncReportSha256 && syncReportStoragePath
          ? {
              syncReport: {
                fileName: syncReportFile.name,
                sizeBytes: syncReportFile.size,
                sha256: syncReportSha256,
                storagePath: syncReportStoragePath,
              },
            }
          : {}),
        packageFingerprint,
      };

      updateRescueSyncPackageMessage(
        "info",
        `Package fingerprint ${formatDigest(packageFingerprint)} computed. Uploading generated package to the shared room.`,
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
        packageIntegrity,
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

  async function handlePublishCloudSyncWorkerOutputs() {
    if (!config.firebaseConfig) {
      setCloudSyncMessage({
        tone: "error",
        text: "Firebase is not configured in this build; worker outputs cannot be published.",
      });
      return;
    }

    if (!cloudSyncJob) {
      setCloudSyncMessage({
        tone: "error",
        text: "No cloud sync job is selected for worker output publishing.",
      });
      return;
    }

    if (cloudSyncJob.status !== "ready") {
      setCloudSyncMessage({
        tone: "error",
        text: `Cloud sync job is ${cloudSyncJob.status}; wait for status ready before publishing worker outputs.`,
      });
      return;
    }

    if (!isCloudSyncJobOutputComplete(cloudSyncJob)) {
      setCloudSyncMessage({
        tone: "error",
        text:
          "Cloud sync job is missing one or more output paths: manifest, source-monitor proxy, Sync Map, or sync report.",
      });
      return;
    }

    const outputs = cloudSyncJob.outputs;

    try {
      const cloudSyncStore = await createCloudSyncStore({
        firebaseConfig: config.firebaseConfig,
        syncJobId: cloudSyncJob.syncJobId,
      });
      const sharedRoomStore = await createSharedRoomStore({
        firebaseConfig: config.firebaseConfig,
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
      });

      setSharedRoomUploadState({
        status: "uploading",
        progressPercent: 0,
        message: "Reading generated worker outputs from Firebase Storage.",
        shareUrl: "",
      });
      setCloudSyncMessage({
        tone: "info",
        text: "Reading generated manifest, Sync Map, and sync report before publishing the shared room.",
      });

      const manifestText = await cloudSyncStore.getOutputArtifactText(
        outputs.manifestStoragePath,
        "manifest",
      );
      const syncMapText = await cloudSyncStore.getOutputArtifactText(
        outputs.syncMapStoragePath,
        "Sync Map",
      );
      const syncReportText = await cloudSyncStore.getOutputArtifactText(
        outputs.syncReportStoragePath,
        "sync report",
      );
      const manifestResult = parseEpisodeManifestPayload(
        JSON.parse(manifestText) as unknown,
      );
      const syncMapResult = parseSyncMapPayload(JSON.parse(syncMapText) as unknown);
      const syncReportResult = parseCloudSyncReportPayload(
        JSON.parse(syncReportText) as unknown,
      );

      if (!manifestResult.ok) {
        throw new Error(`Generated manifest is invalid: ${manifestResult.reason}`);
      }

      if (!syncMapResult.ok) {
        throw new Error(`Generated Sync Map is invalid: ${syncMapResult.reason}`);
      }

      if (!syncReportResult.ok) {
        throw new Error(
          `Generated sync report is invalid: ${syncReportResult.reason}`,
        );
      }

      const manifest = manifestResult.manifest;
      const syncMap = syncMapResult.syncMap;
      const syncReport = syncReportResult.report;
      const compatibility = validateGeneratedPackageCompatibility({
        manifest,
        syncMap,
        syncReport,
      });

      if (!compatibility.ok) {
        throw new Error(compatibility.errors.join(" "));
      }

      if (
        sanitizeSharedRoomPart(manifest.id) !== roomSelection.projectId ||
        sanitizeSharedRoomPart(syncMap.branchId) !== roomSelection.branchId ||
        sanitizeSharedRoomPart(cloudSyncJob.projectId) !== roomSelection.projectId ||
        sanitizeSharedRoomPart(cloudSyncJob.branchId) !== roomSelection.branchId
      ) {
        throw new Error(
          `Worker outputs target ${manifest.id} / ${syncMap.branchId}, but the active room is ${roomSelection.projectId} / ${roomSelection.branchId}. Switch rooms before publishing.`,
        );
      }

      const createdAt = sharedRoomMetadata?.createdAt ?? new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const proxyFileName = getStoragePathLeaf(
        outputs.sourceMonitorProxyStoragePath,
        "source-monitor-proxy.mp4",
      );
      const metadata: SharedRoomMetadata = {
        projectId: roomSelection.projectId,
        branchId: roomSelection.branchId,
        title: manifest.title,
        manifest: cloneEpisodeManifest(manifest),
        sourceMonitorProxyStoragePath: outputs.sourceMonitorProxyStoragePath,
        sourceMonitorProxyFileName: proxyFileName,
        sourceMonitorProxyContentType: "video/mp4",
        sourceMonitorProxySizeBytes: 0,
        packageKind: "rescue_sync_generated",
        syncJobId: cloudSyncJob.syncJobId,
        manifestStoragePath: outputs.manifestStoragePath,
        syncMapStoragePath: outputs.syncMapStoragePath,
        syncReportStoragePath: outputs.syncReportStoragePath,
        generatedByWorkerVersion: "studio-cut-cloud-sync-worker-output",
        packageCreatedAt: syncReport.generatedAt,
        createdBy: createdBy ?? config.createdBy,
        createdAt,
        updatedAt,
        notes:
          "Published directly from Cloud Sync worker outputs. Original full-resolution media is not part of the shared room.",
      };

      await sharedRoomStore.saveRoomMetadata(metadata);

      const shareUrl = buildCurrentSharedRoomUrl(roomSelection);

      setSharedRoomMetadata(metadata);
      setEpisodeManifest(cloneEpisodeManifest(manifest));
      setImportedEpisodeManifestBaseline(cloneEpisodeManifest(manifest));
      setLocalProxyFile(null);
      setSharedRoomUploadState({
        status: "success",
        progressPercent: 100,
        message:
          "Worker outputs are published as a shared room. Send this room link to approved editors.",
        shareUrl,
      });
      setCloudSyncMessage({
        tone: "success",
        text: "Published Cloud Sync worker outputs to the shared room. Mako can open the room link without JSON import or local media.",
      });
      updateBrowserRoomUrl(roomSelection);
      setImportMessage(
        `Published worker outputs for ${roomSelection.projectId} / ${roomSelection.branchId}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      setSharedRoomUploadState({
        status: "error",
        progressPercent: 0,
        message: `Worker output publish failed: ${message}`,
        shareUrl: "",
      });
      setCloudSyncMessage({
        tone: "error",
        text: `Worker output publish failed: ${message}`,
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
        <CloudMediaVaultPanel
          roomSelection={roomSelection}
          copyMessage={cloudMediaVaultCopyMessage}
          onCopyMessage={setCloudMediaVaultCopyMessage}
        />
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
          onPublishOutputs={() => void handlePublishCloudSyncWorkerOutputs()}
        />
        <SyncJobTimelinePanel
          status={status}
          includeClip={cloudSyncIncludeClip}
          selectedFiles={cloudSyncFiles}
          uploadStates={cloudSyncUploadStates}
          syncJob={cloudSyncJob}
          sharedRoomMetadata={sharedRoomMetadata}
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
          onUsePackageRoom={useRescuePackageRoom}
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
        <TranscriptReviewPanel
          transcript={episodeTranscript}
          review={transcriptReview}
          onImport={() => transcriptInputRef.current?.click()}
          onExportSuggestedOps={handleExportTranscriptSuggestedOps}
          onClear={() => {
            setEpisodeTranscript(null);
            setTranscriptSegmentDrafts({});
            setSelectedTranscriptSegmentId(undefined);
            setSelectedTranscriptWordId(undefined);
            setSelectedTranscriptWordDraft("");
            setImportMessage("Cleared browser-local transcript review data.");
          }}
        />
        <TranscriptWaveformPanel
          localProxyVideo={localProxyVideo}
          sourceDurationMs={sourceDurationMs}
          sourceTimeMs={sourceTimeMs}
          waveform={transcriptWaveform}
          words={transcriptTimedWords}
          transcript={episodeTranscript}
          speakerColorMap={transcriptSpeakerColorMap}
          onJump={jumpToTranscriptWord}
          onScrub={(nextSourceTimeMs) => scrubToSourceTime(nextSourceTimeMs)}
        />
        <TranscriptEditLanePanel
          transcript={episodeTranscript}
          segments={filteredTranscriptSegments}
          currentSegment={currentTranscriptSegment}
          selectedSegment={selectedTranscriptSegment}
          selectedState={transcriptLaneState}
          selectedSegmentDraftText={selectedTranscriptSegmentDraftText}
          selectedSegmentWords={selectedTranscriptSegmentWords}
          selectedWord={selectedTranscriptWord}
          selectedWordIndex={selectedTranscriptWordIndex}
          selectedWordDraftText={selectedTranscriptWordDraft}
          speakerProfiles={transcriptSpeakerProfiles}
          speakerColorMap={transcriptSpeakerColorMap}
          speakerFilters={transcriptSpeakerFilters}
          onSegmentDraftChange={(segment, text) => {
            setTranscriptSegmentDraft(segment, text);
          }}
          onSpeakerChange={toggleTranscriptSpeakerFilter}
          onSpeakerTagChange={applyTranscriptSegmentSpeakerEdit}
          onWordDraftChange={setSelectedTranscriptWordDraft}
          onApplyWordText={applyTranscriptWordTextEdit}
          onApplySegmentText={applyTranscriptSegmentTextEdit}
          onSplitSegmentPhrase={splitTranscriptSegmentPhrase}
          onStateChange={setTranscriptLaneState}
          onJump={jumpToTranscriptSegment}
          onSetRange={setRangeFromTranscriptSegment}
          onApplyState={applyTranscriptSegmentState}
        />
        <TranscriptCleanupSuggestionsPanel
          suggestions={transcriptCleanupSuggestions}
          selectedSuggestionIds={selectedTranscriptCleanupSuggestionIds}
          selectedCount={selectedTranscriptCleanupSuggestionCount}
          onToggleSuggestion={toggleTranscriptCleanupSuggestion}
          onSelectAll={selectAllTranscriptCleanupSuggestions}
          onClearSelection={clearTranscriptCleanupSuggestions}
          onPreviewSelected={previewSelectedTranscriptCleanupSuggestions}
        />
        <ClipCandidateLanePanel
          candidates={currentRoomClipCandidates}
          approvedCount={approvedClipCandidateCount}
          titleDraft={clipCandidateTitleDraft}
          summaryDraft={clipCandidateSummaryDraft}
          hasCurrentSegment={Boolean(currentSegment)}
          hasSelectedRange={Boolean(normalizedRange)}
          hasTranscriptSegment={Boolean(selectedTranscriptSegment)}
          hasMarkerRange={hasMarkerRangeAroundPlayhead(
            currentRoomMarkers,
            sourceTimeMs,
          )}
          onTitleDraftChange={setClipCandidateTitleDraft}
          onSummaryDraftChange={setClipCandidateSummaryDraft}
          onCreateFromCurrentSegment={createClipCandidateFromCurrentSegment}
          onCreateFromRange={createClipCandidateFromSelectedRange}
          onCreateFromTranscript={createClipCandidateFromTranscriptSegment}
          onCreateFromMarkers={createClipCandidateFromMarkerRange}
          onStatusChange={updateClipCandidateStatus}
          onJump={jumpToClipCandidate}
          onRemove={removeClipCandidate}
          onExport={exportClipCandidatesJson}
        />
        <DualTrackTimelineEditor
          tracks={TIMELINE_EDITOR_TRACKS}
          visibleTracks={visibleTimelineTracks}
          sourceDurationMs={sourceDurationMs}
          sourceTimeMs={sourceTimeMs}
          clips={currentRoomTimelineClips}
          visibleClips={visibleTimelineClips}
          markers={currentRoomMarkers}
          selectedClipId={selectedTimelineClip?.id}
          zoomLevel={timelineZoomLevel}
          snapToFrame={timelineSnapToFrame}
          frameRate={timelineFrameRate}
          defaultTrackId={timelineEditorTrackId}
          onTrackIdChange={setTimelineEditorTrackId}
          onZoomChange={setTimelineZoomLevel}
          onToggleSnap={() => setTimelineSnapToFrame((current) => !current)}
          onFrameRateChange={setTimelineFrameRate}
          onCreateFromRange={addTimelineEditorClipFromSelection}
          onJump={scrubToSourceTime}
          onSelectClip={selectTimelineEditorClip}
          onMoveClip={moveTimelineEditorClip}
          onMoveClipToTime={moveTimelineEditorClipToSourceTime}
          onTrimClip={trimTimelineEditorClip}
          onAssignTrack={changeTimelineEditorClipTrack}
          onMoveTrack={(clipId, direction) =>
            moveTimelineEditorClipToAdjacentTrack(
              clipId,
              direction,
            )
          }
          onClearSelection={() => setSelectedTimelineClipId(undefined)}
          onDeleteClip={removeTimelineEditorClip}
          trackFilters={timelineTrackFilters}
          onTrackFilterChange={setTimelineTrackFilter}
          markerTrackLabel="Markers"
        />
        <EpisodeSetupBoardPanel
          setupBoard={episodeSetupBoard}
          preflight={episodeSetupBoardPreflight}
          onBoardChange={setEpisodeSetupBoard}
          onClear={() => setEpisodeSetupBoard(createEmptyEpisodeSetupBoard())}
        />
        <EpisodeOutputBoardPanel
          outputPackage={episodeOutputPackage}
          onExportJson={exportEpisodeOutputPackageJson}
          onExportMarkdown={exportEpisodeOutputPackageMarkdown}
        />
        <CaptionSocialProfilePanel
          plan={renderProfilePlan}
          onExportPlan={exportRenderProfilePlanJson}
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
          ref={transcriptInputRef}
          className="file-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleImportTranscriptJson(event)}
          aria-label="Import timed transcript JSON"
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

        <EpisodeCommandCenterPanel
          status={status}
          metadata={sharedRoomMetadata}
          manifest={episodeManifest}
          localProxyVideo={localProxyVideo}
          packageSelection={rescueSyncPackage}
          syncReview={syncReview}
          decisionCount={sortedEvents.length}
          exportFileNamePreview={exportFileNamePreview}
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

        <TimelinePowerToolsPanel
          markerDraft={markerDraft}
          markerNoteDraft={markerNoteDraft}
          markers={currentRoomMarkers}
          rangeSelection={rangeSelection}
          normalizedRange={normalizedRange}
          rangeState={rangeState}
          sourceTimeMs={sourceTimeMs}
          sourceDurationMs={sourceDurationMs}
          nextMarker={nextMarkerAfterPlayhead}
          onMarkerDraftChange={setMarkerDraft}
          onMarkerNoteDraftChange={setMarkerNoteDraft}
          onAddMarker={addTimelineMarkerAtPlayhead}
          onSetRangeStart={setRangeStartAtPlayhead}
          onSetRangeEnd={setRangeEndAtPlayhead}
          onNudgeRange={nudgeRangeHandle}
          onDragRange={dragRangeHandle}
          onClearRange={clearRangeSelection}
          onRangeStateChange={setRangeState}
          onApplyRange={applyRangeState}
          onApplyToNextMarker={applyStateToNextMarker}
        />
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
                onClick={() => agentOpsInputRef.current?.click()}
              >
                Import Agent Ops
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
                onClick={handleExportAgentContext}
              >
                Export Agent Context
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
          <input
            ref={agentOpsInputRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportAgentOpsJson(event)}
            aria-label="Import agent decision operation JSON"
          />
          {importMessage ? <p className="import-message">{importMessage}</p> : null}
          <AgentDecisionOpsPanel
            preview={agentOpsPreview}
            selectedOperationIndexes={selectedAgentOperationIndexes}
            rejectedOperationIndexes={rejectedAgentOperationIndexes}
            onToggleOperation={handleToggleAgentOperation}
            onSelectAll={handleSelectAllAgentOperations}
            onRejectSelected={handleRejectSelectedAgentOperations}
            onRestoreRejected={handleRestoreRejectedAgentOperations}
            onApplySelected={handleApplySelectedAgentDecisionOps}
            onApplyAll={handleApplyAllAgentDecisionOps}
            onDismiss={() => {
              setAgentOpsPreview(null);
              setSelectedAgentOperationIndexes(new Set());
              setRejectedAgentOperationIndexes(new Set());
            }}
          />
          <DecisionRefinementPanel
            selectedEvent={selectedDecision}
            draft={decisionRefinementDraft}
            currentEvent={currentEvent}
            latestEvent={sortedEvents[sortedEvents.length - 1] ?? null}
            sourceTimeMs={sourceTimeMs}
            sourceDurationMs={sourceDurationMs}
            onSelectActive={selectActiveDecisionForRefinement}
            onDraftChange={updateDecisionRefinementDraft}
            onUseCurrentTime={setSelectedDecisionDraftToCurrentTime}
            onNudge={nudgeSelectedDecisionDraft}
            onSave={saveDecisionRefinement}
            onJump={scrubToSourceTime}
            onRemove={(eventId) => removeDecisionWithHistory(eventId)}
            onClearSelection={() => setSelectedDecisionId(undefined)}
          />
          <DecisionList
            events={sortedEvents}
            currentEventId={currentEvent?.id}
            latestEventId={latestEventId}
            selectedEventId={selectedDecisionId}
            onJump={scrubToSourceTime}
            onSelect={selectDecisionForRefinement}
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
            markers={currentRoomMarkers}
            normalizedRange={normalizedRange}
            sourceDurationMs={sourceDurationMs}
            currentSegmentSourceEventId={currentSegment?.sourceEventId}
            selectedBoundaryEventId={selectedDecisionId}
            onJump={scrubToSourceTime}
            onSelectBoundary={selectDecisionForRefinement}
          />
          <MarkerLane
            markers={currentRoomMarkers}
            sourceDurationMs={sourceDurationMs}
            onJump={jumpToTimelineMarker}
            onSetRangeStart={(marker) =>
              setRangeHandleAtSourceTime("start", marker.sourceTimeMs)
            }
            onSetRangeEnd={(marker) =>
              setRangeHandleAtSourceTime("end", marker.sourceTimeMs)
            }
            onRemove={removeTimelineMarker}
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

function CloudMediaVaultPanel({
  roomSelection,
  onCopyMessage,
  copyMessage,
}: {
  roomSelection: StudioCutRoomSelection;
  onCopyMessage: (message: string) => void;
  copyMessage: string;
}) {
  const [migrationHealth, setMigrationHealth] =
    useState<MediaVaultMigrationHealth>({
      filesInProgress: 0,
      bytesRemaining: null,
      stalledRounds: null,
      inProgress: false,
      retryableErrorCount: 0,
      lastError: null,
      updatedAt: null,
      status: "loading",
      errorMessage: null,
    });
  const collectionId = sanitizeFileNamePart(roomSelection.projectId);
  const projectId = roomSelection.projectId;
  const originalPrefix = `${CLOUD_MEDIA_VAULT_PREFIX}/${collectionId}/homer-insta360/originals/`;
  const proxyPrefix = `media-vault/derived/${collectionId}/homer-insta360/proxies/`;
  const packageDir = `~/Movies/StudioCut/${collectionId}/media-vault-package`;
  const drainSourceDir = `~/Movies/StudioCut/${collectionId}/insta360-downloads`;
  const operatorDir = `~/Movies/StudioCut/${collectionId}/insta360-operator`;
  const editorVersionDir = `~/Movies/StudioCut/${collectionId}/editor-versions`;
  const editorReviewDir = `${editorVersionDir}/review-pass-001`;
  const packageCommand = `pnpm studio-cut:media-vault -- create-insta360-package --project-id ${collectionId} --collection-id homer-insta360 --out-dir ${packageDir}`;
  const uploadCommand = `pnpm studio-cut:media-vault -- upload-manifest --manifest ${packageDir}/media-vault-manifest.json --source-dir ${packageDir}/inbox --execute`;
  const prepareSessionCommand = `pnpm studio-cut:insta360-operator prepare-session --project-id ${collectionId} --collection-id homer-insta360 --download-dir ${drainSourceDir} --operator-dir ${operatorDir}`;
  const drainCommand = `pnpm studio-cut:media-vault -- drain-folder --source-dir ${drainSourceDir} --project-id ${collectionId} --collection-id homer-insta360 --watch --execute --delete-local-after-upload`;
  const pullCommand = `pnpm studio-cut:media-vault -- pull-cloud-assets --project-id ${collectionId} --collection-id homer-insta360 --out-dir ${editorVersionDir} --version-tag review-pass-001 --capture-sources insta360 --max-files 120`;
  const pullCommandFromManifest = `pnpm studio-cut:media-vault -- pull-cloud-assets --project-id ${collectionId} --collection-id homer-insta360 --manifest ${packageDir}/media-vault-manifest.json --out-dir ${editorVersionDir} --version-tag review-pass-001 --out /tmp/${collectionId}-pull-editor-version.json --plan /tmp/${collectionId}-pull-editor-version.sh`;
  const frameCommandDryRun = `pnpm studio-cut:media-vault -- extract-frames --source-dir ${editorReviewDir} --manifest ${packageDir}/media-vault-manifest.json --max-files 12 --width 960 --frame-interval-seconds 8 --max-frames-per-file 6`;
  const frameCommandExecute = `pnpm studio-cut:media-vault -- extract-frames --source-dir ${editorReviewDir} --manifest ${packageDir}/media-vault-manifest.json --max-files 12 --width 960 --frame-interval-seconds 8 --max-frames-per-file 6 --crop "10%,10%,75%,75%" --execute`;
  const operatorDashboardCommand = `pnpm studio-cut:insta360-operator operator-dashboard --project-id ${collectionId} --collection-id homer-insta360 --download-dir ${drainSourceDir} --operator-dir ${operatorDir} --include-cloud --watch --open --continue-on-error --allow-blocked`;
  const downloadAllCommand = `pnpm studio-cut:insta360-operator download-all --download-dir ${drainSourceDir} --max-rounds 20 --max-stall-rounds 3 --watch --execute`;
  const downloadAllNoSelectShortcutCommand = `pnpm studio-cut:insta360-operator download-all --download-dir ${drainSourceDir} --max-rounds 20 --max-stall-rounds 3 --watch --execute --no-select-shortcut`;

  const commands = [
    { label: "Insta360 package command", command: packageCommand },
    { label: "Upload command", command: uploadCommand },
    {
      label: "Prepare insta360 operator session",
      command: prepareSessionCommand,
    },
    {
      label: "Run batch download loop",
      command: downloadAllCommand,
    },
    {
      label: "Run batch loop without cmd-a shortcut",
      command: downloadAllNoSelectShortcutCommand,
    },
    { label: "Low-storage drain command", command: drainCommand },
    {
      label: "Pull cloud assets into editor workspace",
      command: pullCommand,
    },
    {
      label: "Pull with manifest and write plan",
      command: pullCommandFromManifest,
    },
    {
      label: "Operator dashboard monitor",
      command: operatorDashboardCommand,
    },
    {
      label: "Frame extraction (review crop)",
      command: frameCommandDryRun,
    },
    { label: "Execute frame extraction", command: frameCommandExecute },
  ];

  async function handleCopyCommand(label: string, command: string) {
    try {
      await navigator.clipboard.writeText(command);
      onCopyMessage(`${label} copied.`);
    } catch {
      onCopyMessage("Copy failed; please select and copy manually.");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;

  async function loadMigrationStatus() {
    try {
      const statusEndpoint = `${CLOUD_MEDIA_VAULT_STATUS_ENDPOINT}?project-id=${encodeURIComponent(projectId)}&collection-id=${encodeURIComponent(MEDIA_VAULT_STATUS_COLLECTION_ID)}`;
      let response = await fetch(statusEndpoint, { signal: controller.signal });
      if (response.status === 404 && CLOUD_MEDIA_VAULT_STATUS_ENDPOINT !== CLOUD_MEDIA_VAULT_STATUS_FALLBACK_ENDPOINT) {
        response = await fetch(CLOUD_MEDIA_VAULT_STATUS_FALLBACK_ENDPOINT, {
          signal: controller.signal,
        });
      }
      if (response.status === 404) {
        setMigrationHealth({
          filesInProgress: 0,
          bytesRemaining: null,
            stalledRounds: null,
            inProgress: false,
            retryableErrorCount: 0,
            lastError: "No migration status file found",
            updatedAt: null,
            status: "unavailable",
          errorMessage: "No migration status file found.",
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Status endpoint returned ${response.status}.`);
      }

      const payload = (await response.json()) as MediaVaultMigrationHealthPayload;
      if (!payload?.migrationStatus && !payload?.watchStatus) {
        setMigrationHealth({
          filesInProgress: 0,
          bytesRemaining: null,
          stalledRounds: null,
          inProgress: false,
          retryableErrorCount: 0,
          lastError: "No migration status file found",
          updatedAt: null,
          status: "unavailable",
          errorMessage: "No migration status file found.",
        });
        return;
      }

      if (stopped) {
        return;
      }

        setMigrationHealth({
          ...readMigrationHealthFromResponse(payload),
          errorMessage: null,
        });
      } catch (error) {
        if (stopped || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        setMigrationHealth(
          buildMigrationStatusErrorState(
            error instanceof Error ? error.message : "Failed to read migration status JSON.",
          ),
        );
      }
    }

    void loadMigrationStatus();
    const interval = window.setInterval(() => {
      void loadMigrationStatus();
    }, MEDIA_VAULT_HEALTH_POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [collectionId]);

  const filesInProgressStatus =
    migrationHealth.status === "ready" && migrationHealth.filesInProgress > 0
      ? "active"
      : migrationHealth.status === "error" || migrationHealth.status === "unavailable"
        ? "blocked"
        : "done";
  const bytesRemainingStatus =
    migrationHealth.status === "ready" && (migrationHealth.bytesRemaining ?? 0) > 0
      ? "active"
      : migrationHealth.status === "error" || migrationHealth.status === "unavailable"
        ? "blocked"
        : "done";
  const stalledRoundsStatus =
    migrationHealth.status === "ready" && (migrationHealth.stalledRounds ?? 0) > 0
      ? "active"
      : migrationHealth.status === "error" || migrationHealth.status === "unavailable"
        ? "blocked"
        : "done";
  const lastErrorStatus =
    migrationHealth.lastError && migrationHealth.status !== "loading"
      ? "blocked"
      : migrationHealth.status === "error"
        ? "blocked"
        : migrationHealth.status === "unavailable"
          ? "blocked"
          : "done";

  return (
    <section className="cloud-media-vault-panel" aria-label="Cloud Media Vault">
      <div className="panel-heading">
        <div>
          <h2>Cloud Media Vault</h2>
          <p>Google Cloud home for originals, photos, generated proxies, and Sync Maps.</p>
        </div>
        <strong>GCS planned</strong>
      </div>

      <div className="cloud-media-vault-grid">
        <ReadinessMetric label="Bucket" value={CLOUD_MEDIA_VAULT_BUCKET} />
        <ReadinessMetric label="Collection" value={`${collectionId}/homer-insta360`} />
        <ReadinessMetric label="Originals prefix" value={originalPrefix} />
        <ReadinessMetric label="Proxy prefix" value={proxyPrefix} />
      </div>

      <div className="cloud-media-vault-health sync-role-health">
        <div className={`sync-role-health-card is-${filesInProgressStatus}`}>
          <span>Files in progress</span>
          <strong>
            {migrationHealth.status === "loading"
              ? "Loading..."
              : String(migrationHealth.filesInProgress)}
          </strong>
          <small>{migrationHealth.updatedAt || "No status timestamp yet"}</small>
        </div>
        <div className={`sync-role-health-card is-${bytesRemainingStatus}`}>
          <span>Bytes remaining</span>
          <strong>
            {migrationHealth.status === "loading" || migrationHealth.bytesRemaining === null
              ? "—"
              : formatFileSize(migrationHealth.bytesRemaining)}
          </strong>
          <small>
            {migrationHealth.status === "loading" ? "Waiting for report" : "Unsettled file bytes"}
          </small>
        </div>
        <div className={`sync-role-health-card is-${stalledRoundsStatus}`}>
          <span>Stalled rounds</span>
          <strong>
            {migrationHealth.status === "loading" || migrationHealth.stalledRounds === null
              ? "—"
              : String(migrationHealth.stalledRounds)}
          </strong>
          <small>Recent watch loop stall count</small>
        </div>
        <div className={`sync-role-health-card is-${lastErrorStatus}`}>
          <span>Last error</span>
          <strong>
            {migrationHealth.status === "loading"
              ? "Loading..."
              : migrationHealth.lastError || "None"}
          </strong>
          <small>
            {migrationHealth.status === "error" || migrationHealth.status === "unavailable"
              ? "Status read blocked"
              : "Latest non-blocking alert"}
          </small>
        </div>
      </div>

      {migrationHealth.status === "error" ? (
        <p className="cloud-media-vault-copy-message">
          {migrationHealth.errorMessage}
        </p>
      ) : null}
      {migrationHealth.status === "unavailable" ? (
        <p className="cloud-media-vault-copy-message">
          Migration status JSON not found locally. Start migration-status-page with --watch or
          point the status path in your local media-vault output.
        </p>
      ) : null}

      <div className="cloud-media-source-row">
        {Object.entries(CLOUD_MEDIA_CAPTURE_SOURCE_LABELS).map(([source, label]) => (
          <span key={source}>{label}</span>
        ))}
      </div>

      {commands.map((item) => (
        <div className="cloud-media-vault-command" key={item.label}>
          <div className="cloud-media-vault-command-header">
            <span>{item.label}</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleCopyCommand(item.label, item.command)}
            >
              Copy
            </button>
          </div>
          <code>{item.command}</code>
        </div>
      ))}

      {copyMessage ? <p className="cloud-media-vault-copy-message">{copyMessage}</p> : null}

      <p className="cloud-media-vault-note">
        Put exported Insta360 video/photo files in the local intake folder, create
        a manifest, or run the drain command against a download folder that the
        app fills over time. Uploads use your Google Cloud CLI session. Do not
        put third-party passwords or local media files in the repo.
      </p>
    </section>
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
  onPublishOutputs,
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
  onPublishOutputs: () => void;
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
  const canPublishOutputs =
    cloudReady && syncJob?.status === "ready" && isCloudSyncJobOutputComplete(syncJob);
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
        <button
          className="secondary-button"
          type="button"
          onClick={onPublishOutputs}
          disabled={!canPublishOutputs}
        >
          Publish Worker Outputs
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
      {syncJob ? <CloudSyncOutputHandoff job={syncJob} /> : null}
      <p className={`cloud-sync-message is-${message.tone}`}>{message.text}</p>
    </section>
  );
}

function CloudSyncOutputHandoff({ job }: { job: CloudSyncJob }) {
  const outputRows = [
    ["Manifest", job.outputs.manifestStoragePath],
    ["Source-monitor proxy", job.outputs.sourceMonitorProxyStoragePath],
    ["Sync Map", job.outputs.syncMapStoragePath],
    ["Sync report", job.outputs.syncReportStoragePath],
  ] as const;
  const complete = isCloudSyncJobOutputComplete(job);

  return (
    <div className={`cloud-sync-output-handoff${complete ? " is-ready" : ""}`}>
      <div>
        <span>Worker output handoff</span>
        <strong>
          {job.status === "ready" && complete
            ? "Ready to publish"
            : "Waiting for worker outputs"}
        </strong>
        <small>
          The future cloud worker writes generated proxy, manifest, Sync Map,
          and report artifacts here. Publishing those outputs creates the shared
          editing room without another file-selection pass.
        </small>
      </div>
      <dl>
        {outputRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "Missing"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SyncJobTimelinePanel({
  status,
  includeClip,
  selectedFiles,
  uploadStates,
  syncJob,
  sharedRoomMetadata,
}: {
  status: PersistenceStatus;
  includeClip: boolean;
  selectedFiles: CloudSyncSelectedFiles;
  uploadStates: Record<CloudSyncInputRole, CloudSyncRoleUploadState>;
  syncJob: CloudSyncJob | null;
  sharedRoomMetadata: SharedRoomMetadata | null;
}) {
  const timeline = buildSyncJobTimeline({
    status,
    selectedFiles,
    uploadStates,
    syncJob,
    sharedRoomMetadata,
  });
  const visibleRoles = CLOUD_SYNC_INPUT_ROLES.filter(
    (role) => includeClip || role !== "clipVideo",
  );
  const nextAction = getSyncJobTimelineNextAction(timeline);

  return (
    <section className="sync-job-timeline-panel" aria-label="Sync Job Timeline">
      <div className="panel-heading">
        <div>
          <h2>Sync Job Timeline</h2>
          <p>Operator-readable progress from messy assets to shared room.</p>
        </div>
        <strong>{nextAction.label}</strong>
      </div>

      <div className="sync-job-timeline">
        {timeline.map((stage) => (
          <div
            className={`sync-job-stage is-${stage.status}`}
            key={stage.id}
            aria-label={`${stage.label}: ${stage.status}`}
          >
            <span>{stage.label}</span>
            <strong>{formatTimelineStageStatus(stage.status)}</strong>
            <p>{stage.detail}</p>
          </div>
        ))}
      </div>

      <div className="sync-role-health">
        {visibleRoles.map((role) => {
          const selectedCount = selectedFiles[role]?.length ?? 0;
          const uploadState = uploadStates[role];
          const uploadedCount = syncJob?.uploadedInputs.filter(
            (input) => input.role === role,
          ).length ?? 0;
          const required = CLOUD_SYNC_REQUIRED_INPUT_ROLES.includes(role);

          return (
            <div
              className={`sync-role-health-card is-${getSyncRoleHealthStatus({
                selectedCount,
                uploadedCount,
                uploadState,
                required,
              })}`}
              key={role}
            >
              <span>{CLOUD_SYNC_ROLE_LABELS[role]}</span>
              <strong>
                {uploadedCount > 0
                  ? `${uploadedCount} uploaded`
                  : selectedCount > 0
                    ? `${selectedCount} selected`
                    : required
                      ? "Missing"
                      : "Optional"}
              </strong>
              <small>{uploadState.message || CLOUD_SYNC_ROLE_HELP[role]}</small>
            </div>
          );
        })}
      </div>

      <div className="sync-next-action">
        <span>Next action</span>
        <strong>{nextAction.detail}</strong>
      </div>
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
  onUsePackageRoom,
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
  onUsePackageRoom: () => void;
  onPublish: () => void;
}) {
  const cloudReady =
    status.mode === "cloud_connected" || status.mode === "cloud_ready";
  const preflight = buildGeneratedPackagePreflight({
    roomSelection,
    ...(packageSelection.manifest
      ? { manifest: packageSelection.manifest }
      : {}),
    ...(packageSelection.syncMap ? { syncMap: packageSelection.syncMap } : {}),
    ...(packageSelection.syncReport
      ? { syncReport: packageSelection.syncReport }
      : {}),
    ...(packageSelection.proxyFile
      ? {
          proxyFileName: packageSelection.proxyFile.name,
          proxySizeBytes: packageSelection.proxyFile.size,
        }
      : {}),
  });
  const canPublish =
    cloudReady &&
    Boolean(packageSelection.manifestFile) &&
    Boolean(packageSelection.proxyFile) &&
    Boolean(packageSelection.syncMapFile) &&
    preflight.canPublish &&
    uploadState.status !== "uploading";
  const targetRoom = preflight.targetRoom;
  const canUsePackageRoom = Boolean(
    targetRoom &&
      (targetRoom.projectId !== roomSelection.projectId ||
        targetRoom.branchId !== roomSelection.branchId),
  );

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

      <PackagePreflightSummary checks={preflight.checks} status={preflight.status} />

      <div className="shared-room-actions">
        {canUsePackageRoom ? (
          <button
            className="secondary-button"
            type="button"
            onClick={onUsePackageRoom}
            disabled={uploadState.status === "uploading"}
          >
            Use Package Room
          </button>
        ) : null}
        <button
          className="secondary-button"
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
        >
          Publish Generated Package
        </button>
      </div>

      {preflight.errors.length > 0 ? (
        <p className="shared-room-message is-error">
          {preflight.errors.join(" ")}
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

function PackagePreflightSummary({
  checks,
  status,
  title = "Package preflight",
}: {
  checks: GeneratedPackagePreflightCheck[];
  status: "ready" | "blocked" | "waiting" | "optional";
  title?: string;
}) {
  return (
    <div className="package-preflight" aria-label={title}>
      <div className="package-preflight-heading">
        <span>{title}</span>
        <strong>{getPreflightCheckLabel(status)}</strong>
      </div>
      <div className="package-preflight-checks">
        {checks.map((check) => (
          <div
            className={`package-preflight-check is-${check.status}`}
            key={check.id}
          >
            <span>{check.label}</span>
            <strong>{getPreflightCheckLabel(check.status)}</strong>
            <p>{check.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function getPreflightCheckLabel(status: GeneratedPackagePreflightCheck["status"]) {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  if (status === "optional") {
    return "Optional";
  }

  return "Waiting";
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
          label="Package fingerprint"
          value={formatDigest(metadata?.packageIntegrity?.packageFingerprint)}
        />
        <ReadinessMetric
          label="Integrity"
          value={metadata?.packageIntegrity ? "Digests attached" : "Missing"}
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

function PackageIntegritySummary({
  integrity,
}: {
  integrity: SharedRoomPackageIntegrity;
}) {
  const artifacts = [
    { label: "Manifest", artifact: integrity.manifest },
    { label: "Proxy", artifact: integrity.sourceMonitorProxy },
    { label: "Sync Map", artifact: integrity.syncMap },
    ...(integrity.syncReport
      ? [{ label: "Sync report", artifact: integrity.syncReport }]
      : []),
  ];

  return (
    <div className="sync-review-integrity" aria-label="Published package integrity">
      <div>
        <span>Package fingerprint</span>
        <strong>{formatDigest(integrity.packageFingerprint)}</strong>
      </div>
      <ul>
        {artifacts.map(({ label, artifact }) => (
          <li key={label}>
            <strong>{label}</strong>
            <span>
              {artifact.fileName} · {formatFileSize(artifact.sizeBytes)} ·{" "}
              {formatDigest(artifact.sha256)}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
          {metadata?.packageIntegrity ? (
            <PackageIntegritySummary integrity={metadata.packageIntegrity} />
          ) : null}
          <div className="sync-review-detail-grid">
            <div className="sync-review-detail-card">
              <h3>Reference Rail</h3>
              <ul>
                {summary.referenceSegments.slice(0, 5).map((segment) => (
                  <li key={`${segment.inputId}-${segment.railStartMs}`}>
                    <strong>{segment.fileName}</strong>
                    <span>
                      Starts {formatSourceTime(segment.railStartMs)} ·{" "}
                      {formatSourceTime(segment.durationMs)} ·{" "}
                      {formatConfidence(segment.confidence)}
                    </span>
                  </li>
                ))}
              </ul>
              {summary.referenceSegments.length > 5 ? (
                <p>{summary.referenceSegments.length - 5} more reference piece(s).</p>
              ) : null}
            </div>
            <div className="sync-review-detail-card">
              <h3>Track Offsets</h3>
              <ul>
                {summary.offsetDetails.slice(0, 6).map((trackOffset) => (
                  <li key={`${trackOffset.source}-${trackOffset.inputId}`}>
                    <strong>{trackOffset.roleLabel}</strong>
                    <span>
                      {trackOffset.fileName} ·{" "}
                      {formatSignedSourceTime(trackOffset.estimatedOffsetMs)} ·{" "}
                      {formatConfidence(trackOffset.confidence)}
                      {trackOffset.anchorCount
                        ? ` · ${trackOffset.anchorCount} anchor${
                            trackOffset.anchorCount === 1 ? "" : "s"
                          }`
                        : ""}
                      {trackOffset.anchorAgreementMs !== undefined
                        ? ` · ${Math.round(trackOffset.anchorAgreementMs)}ms agreement`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {summary.offsetDetails.length > 6 ? (
                <p>{summary.offsetDetails.length - 6} more offset(s).</p>
              ) : null}
            </div>
          </div>
          {summary.warningDetails.length > 0 ? (
            <div className="sync-review-warnings">
              <h3>Sync Warnings</h3>
              <ul>
                {summary.warningDetails.slice(0, 5).map((warning, index) => (
                  <li key={`${warning.source}-${index}`}>
                    <strong>{warning.source}</strong>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
              {summary.warningDetails.length > 5 ? (
                <p>{summary.warningDetails.length - 5} more warning(s).</p>
              ) : null}
            </div>
          ) : null}
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

function TranscriptReviewPanel({
  transcript,
  review,
  onImport,
  onExportSuggestedOps,
  onClear,
}: {
  transcript: EpisodeTranscript | null;
  review: TranscriptReview;
  onImport: () => void;
  onExportSuggestedOps: () => void;
  onClear: () => void;
}) {
  const statusLabel =
    review.status === "missing"
      ? "Optional"
      : review.status === "ready"
        ? "Ready"
        : "Check";
  const visibleTasks = review.tasks.slice(0, 5);
  const suggestedOperationCount = review.tasks.filter(
    (task) => task.suggestedOperation,
  ).length;

  return (
    <section className="transcript-review-panel" aria-label="Transcript review">
      <div className="panel-heading">
        <div>
          <h2>Transcript Review</h2>
          <p>
            Browser-local timed transcript diagnostics for agent-assisted edit
            review.
          </p>
        </div>
        <strong>{statusLabel}</strong>
      </div>

      <div className="transcript-actions">
        <button className="secondary-button" type="button" onClick={onImport}>
          Import Transcript JSON
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onExportSuggestedOps}
          disabled={suggestedOperationCount === 0}
        >
          Export Suggested Ops
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onClear}
          disabled={!transcript}
        >
          Clear Transcript
        </button>
      </div>

      <div className="transcript-review-grid">
        <ReadinessMetric
          label="Transcript"
          value={transcript ? "Loaded" : "Not loaded"}
        />
        <ReadinessMetric
          label="Segments"
          value={String(review.summary.segmentCount)}
        />
        <ReadinessMetric label="Words" value={String(review.summary.wordCount)} />
        <ReadinessMetric
          label="Coverage"
          value={`${Math.round(review.summary.coveragePercent * 100)}%`}
        />
        <ReadinessMetric
          label="Clip refs"
          value={String(review.summary.clipReferenceCount)}
        />
        <ReadinessMetric
          label="Filler"
          value={String(review.summary.fillerMarkerCount)}
        />
      </div>

      {transcript ? (
        <>
          <div className="transcript-meta">
            <span>Episode</span>
            <strong>{transcript.episodeId}</strong>
          </div>
          {visibleTasks.length > 0 ? (
            <ul className="transcript-task-list">
              {visibleTasks.map((task) => (
                <li
                  key={`${task.kind}-${task.segmentId ?? task.startSourceTimeMs ?? task.message}`}
                >
                  <strong>{task.kind}</strong>
                  <span>{task.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="readiness-ok">
              No transcript-aware review tasks for the current edit.
            </p>
          )}
          {review.tasks.length > visibleTasks.length ? (
            <p className="transcript-more">
              {review.tasks.length - visibleTasks.length} more task
              {review.tasks.length - visibleTasks.length === 1 ? "" : "s"} in
              exported Agent Context.
            </p>
          ) : null}
          {review.warnings.length > 0 ? (
            <ul className="readiness-warnings">
              {review.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="panel-empty">
          Import a timed transcript JSON when available. Transcript text stays in
          this browser unless you explicitly export Agent Context.
        </p>
      )}
    </section>
  );
}

function TranscriptWaveformPanel({
  localProxyVideo,
  sourceDurationMs,
  sourceTimeMs,
  transcript,
  waveform,
  words,
  speakerColorMap,
  onJump,
  onScrub,
}: {
  localProxyVideo: LocalProxyVideo | null;
  sourceDurationMs: number;
  sourceTimeMs: number;
  transcript: EpisodeTranscript | null;
  waveform: TranscriptWaveformState;
  words: readonly TimedTranscriptWord[];
  speakerColorMap: Record<string, string>;
  onJump: (word: TimedTranscriptWord) => void;
  onScrub: (sourceTimeMs: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wordListRef = useRef<HTMLDivElement>(null);
  const waveformPanelRef = useRef<HTMLDivElement>(null);
  const [wordListScrollTop, setWordListScrollTop] = useState(0);
  const [wordListHeight, setWordListHeight] = useState(
    TRANSCRIPT_WAVEFORM_PANEL_HEIGHT_PX,
  );
  const rowHeightPx = TRANSCRIPT_WAVEFORM_ROW_HEIGHT_PX;
  const hasTranscript = Boolean(transcript);
  const isWaveformReady =
    waveform.status === "ready" &&
    waveform.peaks.length > 0 &&
    sourceDurationMs > 0 &&
    localProxyVideo !== null;

  const activeWordIndex = getTranscriptWordIndexAtSourceTime(words, sourceTimeMs);
  const currentWord = words[activeWordIndex] ?? null;
  const visibleStartIndex = Math.max(
    0,
    Math.floor(wordListScrollTop / rowHeightPx) - 6,
  );
  const visibleWordCount = Math.max(
    10,
    Math.ceil(wordListHeight / rowHeightPx) + 10,
  );
  const visibleWords = useMemo(
    () =>
      words.slice(
        visibleStartIndex,
        Math.min(words.length, visibleStartIndex + visibleWordCount),
      ),
    [visibleStartIndex, visibleWordCount, words],
  );
  const totalHeightPx = words.length * rowHeightPx;
  const wordListOffsetPx = visibleStartIndex * rowHeightPx;

  function handleCanvasClick(event: MouseEvent<HTMLCanvasElement>) {
    if (!isWaveformReady || sourceDurationMs <= 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const clampedRatio = Number.isFinite(ratio)
      ? Math.min(1, Math.max(0, ratio))
      : 0;

    onScrub(clampSourceTime(clampedRatio * sourceDurationMs, sourceDurationMs));
  }

  useEffect(() => {
    const wordScroller = wordListRef.current;

    if (!wordScroller) {
      return;
    }

    const updateHeight = () => {
      setWordListHeight(
        Math.max(TRANSCRIPT_WAVEFORM_PANEL_HEIGHT_PX, wordScroller.clientHeight),
      );
    };

    const ro = new ResizeObserver(updateHeight);
    ro.observe(wordScroller);
    updateHeight();

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const panelCanvas = canvasRef.current;
    const panelWrap = waveformPanelRef.current;

    if (!panelCanvas || !panelWrap) {
      return;
    }

    const ctx = panelCanvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const width = panelWrap.clientWidth;
    const height = Math.max(74, panelWrap.clientHeight);

    if (width <= 0 || height <= 0) {
      return;
    }

    const devicePixelRatio = Math.max(1, globalThis.window.devicePixelRatio || 1);
    panelCanvas.width = Math.max(1, Math.round(width * devicePixelRatio));
    panelCanvas.height = Math.max(1, Math.round(height * devicePixelRatio));
    panelCanvas.style.width = `${width}px`;
    panelCanvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, panelCanvas.width, panelCanvas.height);
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.fillStyle = "#91de72";

    if (isWaveformReady) {
      const centerY = height / 2;
      const maxHeight = centerY - 3;
      const step = waveform.peaks.length > 0 ? width / waveform.peaks.length : 0;

      for (let index = 0; index < waveform.peaks.length; index += 1) {
        const peak = waveform.peaks[index] ?? 0;
        const heightPx = Math.max(1, peak * maxHeight);
        const barLeft = index * step;
        const barWidth = Math.max(1, step * 0.75);

        ctx.fillRect(barLeft, centerY - heightPx, barWidth, heightPx * 2);
      }
    }

    const playheadX = sourceDurationMs > 0
      ? (Math.min(sourceDurationMs, sourceTimeMs) / sourceDurationMs) * width
      : 0;
    ctx.fillStyle = "rgba(240, 201, 106, 0.9)";
    ctx.fillRect(playheadX, 0, 2, height);
  }, [isWaveformReady, waveform.peaks, sourceDurationMs, sourceTimeMs]);

  useEffect(() => {
    if (activeWordIndex < 0 || !wordListRef.current) {
      return;
    }

    const wordScroller = wordListRef.current;
    const wordTop = activeWordIndex * rowHeightPx;
    const wordBottom = wordTop + rowHeightPx;

    if (wordTop < wordScroller.scrollTop) {
      wordScroller.scrollTo({ top: wordTop, behavior: "smooth" });
      return;
    }

    if (wordBottom > wordScroller.scrollTop + wordScroller.clientHeight) {
      wordScroller.scrollTo({
        top: Math.max(0, wordBottom - wordScroller.clientHeight),
        behavior: "smooth",
      });
    }
  }, [activeWordIndex, rowHeightPx]);

  return (
    <section className="transcript-waveform-panel" aria-label="Waveform transcript">
      <div className="panel-heading">
        <div>
          <h2>Transcript Waveform</h2>
          <p>Click a word or waveform position to scrub timeline.</p>
        </div>
        <strong>
          {hasTranscript ? `${words.length} words` : "No transcript"}
        </strong>
      </div>

      <div
        className={`transcript-waveform-canvas-wrap${isWaveformReady ? "" : " is-disabled"}`}
        ref={waveformPanelRef}
      >
        {isWaveformReady ? (
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            aria-label="Transcript waveform scrub bar"
          />
        ) : (
          <div className="transcript-waveform-empty">
            {localProxyVideo
              ? waveform.status === "loading"
                ? "Building waveform from local proxy..."
                : waveform.status === "error"
                  ? waveform.errorMessage ??
                    "Waveform unavailable. Load a supported local proxy."
                  : "Load a local source-monitor proxy to enable waveform."
              : "Load local proxy video to enable waveform view."}
          </div>
        )}
      </div>

      <div className="transcript-waveform-meta">
        <span>{currentWord ? "Active word" : "Current position"}</span>
        <strong>
          {currentWord
            ? `${currentWord.text} (${currentWord.speaker}) · ${formatSourceTime(
                currentWord.startSourceTimeMs,
              )}`
            : formatSourceTime(sourceTimeMs)}
        </strong>
      </div>

      <div className="transcript-word-shell">
        <label className="transcript-word-heading">Word timeline</label>
        {words.length > 0 ? (
          <div
            ref={wordListRef}
            className="transcript-word-list"
            onScroll={(event) =>
              setWordListScrollTop(event.currentTarget.scrollTop)
            }
            aria-label="Transcript words at source time"
          >
            <div style={{ height: `${totalHeightPx}px` }}>
              <div
                style={{
                  transform: `translateY(${wordListOffsetPx}px)`,
                  display: "grid",
                  gap: "6px",
                  padding: "4px 0",
                }}
              >
                {visibleWords.map((word, index) => {
                  const globalIndex = visibleStartIndex + index;
                  const isActive = globalIndex === activeWordIndex;
                  const speakerColor = speakerColorMap[word.speaker];

                  return (
                    <button
                      type="button"
                      className={`transcript-word-row${
                        isActive ? " is-active" : ""
                      }`}
                      key={word.id}
                      onClick={() => onJump(word)}
                      aria-label={`Jump to ${word.text} at ${formatSourceTime(
                        word.startSourceTimeMs,
                      )}`}
                    >
                      <span className="transcript-word-time">
                        {formatSourceTime(word.startSourceTimeMs)}
                      </span>
                      <span
                        className="transcript-word-speaker"
                        style={
                          speakerColor
                            ? {
                                backgroundColor: `${speakerColor}2a`,
                                borderColor: `${speakerColor}66`,
                                color: speakerColor,
                              }
                            : undefined
                        }
                      >
                        {word.speaker}
                      </span>
                      <span className="transcript-word-text">{word.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <p className="panel-empty">
            {hasTranscript
              ? "No word-level transcript timings found. Word rows will appear once words are available."
              : "Import a transcript to view word-level scrub points."}
          </p>
        )}
      </div>
    </section>
  );
}

function TranscriptEditLanePanel({
  transcript,
  segments,
  currentSegment,
  selectedSegment,
  selectedState,
  selectedSegmentDraftText,
  selectedSegmentWords,
  selectedWord,
  selectedWordIndex,
  selectedWordDraftText,
  speakerProfiles,
  speakerColorMap,
  speakerFilters,
  onSegmentDraftChange,
  onSpeakerChange,
  onSpeakerTagChange,
  onWordDraftChange,
  onApplyWordText,
  onApplySegmentText,
  onSplitSegmentPhrase,
  onStateChange,
  onJump,
  onSetRange,
  onApplyState,
}: {
  transcript: EpisodeTranscript | null;
  segments: readonly TranscriptSegment[];
  currentSegment: TranscriptSegment | null;
  selectedSegment: TranscriptSegment | null;
  selectedState: ProgramState;
  selectedSegmentDraftText: string;
  selectedSegmentWords: readonly TranscriptWordToken[];
  selectedWord: TimedTranscriptWord | null;
  selectedWordIndex: number | null;
  selectedWordDraftText: string;
  speakerProfiles: readonly TranscriptSpeakerProfile[];
  speakerColorMap: Record<string, string>;
  speakerFilters: TranscriptSpeakerFilterState;
  onSegmentDraftChange: (segment: TranscriptSegment, text: string) => void;
  onSpeakerChange: (speaker: string, isVisible: boolean) => void;
  onSpeakerTagChange: (request: {
    segment: TranscriptSegment;
    speaker: string;
  }) => void;
  onWordDraftChange: (text: string) => void;
  onApplyWordText: (request: {
    segment: TranscriptSegment;
    wordIndex: number;
    text: string;
  }) => void;
  onApplySegmentText: (request: {
    segment: TranscriptSegment;
    text: string;
  }) => void;
  onSplitSegmentPhrase: (request: {
    segment: TranscriptSegment;
    fromWordIndex: number;
    toWordIndex: number;
  }) => void;
  onStateChange: (state: ProgramState) => void;
  onJump: (segment: TranscriptSegment) => void;
  onSetRange: (segment: TranscriptSegment) => void;
  onApplyState: (segment: TranscriptSegment | null) => void;
}) {
  const visibleSegments = segments.slice(0, 80);
  const [splitFromWord, setSplitFromWord] = useState("");
  const [splitToWord, setSplitToWord] = useState("");
  const [selectedSegmentSpeakerDraft, setSelectedSegmentSpeakerDraft] = useState("");
  const selectedSegmentWordCount = selectedSegmentWords.length;
  const selectedSegmentId = selectedSegment?.id;
  const totalSegments = transcript?.segments.length ?? 0;

  useEffect(() => {
    setSplitFromWord("");
    setSplitToWord("");
    setSelectedSegmentSpeakerDraft(selectedSegment?.speaker ?? "");
  }, [selectedSegmentId]);

  const hasSelectableSpeakers = speakerProfiles.length > 0;

  function renderSpeakerChip(speaker: string, isChecked: boolean) {
    const profile = speakerProfiles.find((entry) => entry.speaker === speaker);
    const color = speakerColorMap[speaker];

    return (
      <label className="transcript-speaker-filter-chip" key={speaker}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(event) => onSpeakerChange(speaker, event.target.checked)}
        />
        <span
          style={
            color
              ? {
                  borderColor: `${color}99`,
                  backgroundColor: `${color}26`,
                  color,
                }
              : undefined
          }
        >
          {speaker}
          <small>{`${profile?.segmentCount ?? 0}/${profile?.wordCount ?? 0}`}</small>
        </span>
      </label>
    );
  }

  return (
    <section className="transcript-edit-lane" aria-label="Transcript edit lane">
      <div className="panel-heading">
        <div>
          <h2>Transcript Edit Lane</h2>
          <p>Click transcript time to scrub; apply semantic states to a segment.</p>
        </div>
        <strong>{transcript ? `${totalSegments} segments` : "No transcript"}</strong>
      </div>

      {hasSelectableSpeakers ? (
        <div className="transcript-speaker-filters" role="group" aria-label="Transcript speaker filters">
          <span className="transcript-speaker-filter-label">Speakers</span>
          <div className="transcript-speaker-filter-grid">
            {speakerProfiles.map((profile) =>
              renderSpeakerChip(profile.speaker, speakerFilters[profile.speaker] ?? true),
            )}
          </div>
        </div>
      ) : null}

      <div className="transcript-lane-controls">
        <label>
          Segment state
          <select
            value={selectedState}
            onChange={(event) => onStateChange(event.target.value as ProgramState)}
            aria-label="Transcript segment state"
          >
            {PROGRAM_STATES.map((state) => (
              <option key={state} value={state}>
                {PROGRAM_STATE_LABELS[state]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onApplyState(selectedSegment)}
          disabled={!selectedSegment}
        >
          Apply To Selected Segment
        </button>
      </div>

      {selectedSegment ? (
        <div className="transcript-selected-segment">
          <span>Selected</span>
          <strong>
            {formatSourceTime(selectedSegment.startSourceTimeMs)}-
            {formatSourceTime(selectedSegment.endSourceTimeMs)}
          </strong>
          <p>
            {selectedSegment.speaker}: {selectedSegmentDraftText}
          </p>
          <label className="transcript-speaker-edit-label">
            Edit speaker tag
            <input
              value={selectedSegmentSpeakerDraft}
              onChange={(event) =>
                setSelectedSegmentSpeakerDraft(event.target.value)
              }
              aria-label="Edit transcript segment speaker"
            />
          </label>
          <label className="transcript-segment-editor-label">
            Edit segment text
            <textarea
              value={selectedSegmentDraftText}
              onChange={(event) =>
                onSegmentDraftChange(selectedSegment, event.target.value)
              }
              rows={3}
              aria-label="Edit transcript segment text"
            />
          </label>
          <div className="transcript-segment-edit-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                onApplySegmentText({
                  segment: selectedSegment,
                  text: selectedSegmentDraftText,
                })
              }
            >
              Apply Segment Text Edit
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                onApplySegmentText({
                  segment: selectedSegment,
                  text: selectedSegment.text,
                })
              }
            >
              Reset Segment
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                onSpeakerTagChange({
                  segment: selectedSegment,
                  speaker: selectedSegmentSpeakerDraft,
                })
              }
              disabled={!selectedSegmentSpeakerDraft.trim()}
            >
              Apply Speaker Tag
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setSelectedSegmentSpeakerDraft(selectedSegment.speaker)
              }
            >
              Reset Speaker
            </button>
          </div>
          {selectedWord && selectedWordIndex !== null ? (
            <label className="transcript-word-editor-label">
              Edit word {selectedWordIndex}
              <input
                value={selectedWordDraftText}
                onChange={(event) =>
                  onWordDraftChange(event.target.value)
                }
                aria-label="Edit selected transcript word"
              />
              <div className="transcript-segment-edit-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    onApplyWordText({
                      segment: selectedSegment,
                      wordIndex: selectedWordIndex,
                      text: selectedWordDraftText,
                    })
                  }
                  disabled={!selectedSegment || !selectedWord}
                >
                  Apply Word Edit
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    onWordDraftChange(selectedWord.text)
                  }
                >
                  Reset Word
                </button>
              </div>
            </label>
          ) : null}
          <label className="transcript-segment-split-range">
            Split phrase
            <div className="transcript-segment-split-controls">
              <input
                type="number"
                min={1}
                max={selectedSegmentWordCount}
                value={splitFromWord}
                onChange={(event) => setSplitFromWord(event.target.value)}
                placeholder="From word #"
              />
              <input
                type="number"
                min={1}
                max={selectedSegmentWordCount}
                value={splitToWord}
                onChange={(event) => setSplitToWord(event.target.value)}
                placeholder="To word #"
              />
              <button
                type="button"
                disabled={!selectedSegment || selectedSegmentWordCount < 2}
                onClick={() => {
                  const fromWordIndex = Number(splitFromWord || "1");
                  const toWordIndex = Number(splitToWord || "1");

                  onSplitSegmentPhrase({
                    segment: selectedSegment,
                    fromWordIndex,
                    toWordIndex,
                  });
                }}
              >
                Split
              </button>
            </div>
            <small>{`Detected ${selectedSegmentWordCount} words in selected segment.`}</small>
          </label>
        </div>
      ) : null}

      {transcript && visibleSegments.length > 0 ? (
        <div className="transcript-segment-list">
          {visibleSegments.map((segment) => {
            const isCurrent = currentSegment?.id === segment.id;
            const isSelected = selectedSegment?.id === segment.id;

            return (
              <article
                className={`transcript-segment-card${
                  isCurrent ? " is-current" : ""
                }${isSelected ? " is-selected" : ""}`}
                key={segment.id}
              >
                <button
                  type="button"
                  className="transcript-time-button"
                  onClick={() => onJump(segment)}
                  aria-label={`Jump transcript segment ${segment.id} at ${formatSourceTime(
                    segment.startSourceTimeMs,
                  )}`}
                >
                  <span>{formatSourceTime(segment.startSourceTimeMs)}</span>
                  <small>{formatSourceTime(segment.endSourceTimeMs)}</small>
                </button>
                <div className="transcript-segment-body">
                <div>
                    <strong
                      style={
                        speakerColorMap[segment.speaker]
                          ? {
                              backgroundColor: `${speakerColorMap[segment.speaker]}26`,
                              borderColor: `${speakerColorMap[segment.speaker]}99`,
                              color: speakerColorMap[segment.speaker],
                            }
                          : undefined
                      }
                    >
                      {segment.speaker}
                    </strong>
                    <span>{segment.id}</span>
                    {segment.speakerRole ? <span>{segment.speakerRole}</span> : null}
                    {isCurrent ? <em>Current</em> : null}
                    {isSelected ? <em>Selected</em> : null}
                  </div>
                  <p>{segment.text}</p>
                </div>
                <div className="transcript-segment-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onSetRange(segment)}
                  >
                    Set Range
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onApplyState(segment)}
                  >
                    Apply State
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="panel-empty">
          Import a timed transcript to use transcript text as an edit lane. The
          transcript remains browser-local unless explicitly exported.
        </p>
      )}

      {segments.length > visibleSegments.length ? (
        <p className="transcript-more">
          Showing first {visibleSegments.length} transcript segments. Use Agent
          Context export for the full transcript payload.
        </p>
      ) : null}
    </section>
  );
}

function TranscriptCleanupSuggestionsPanel({
  suggestions,
  selectedSuggestionIds,
  selectedCount,
  onToggleSuggestion,
  onSelectAll,
  onClearSelection,
  onPreviewSelected,
}: {
  suggestions: readonly TranscriptCleanupSuggestion[];
  selectedSuggestionIds: ReadonlySet<string>;
  selectedCount: number;
  onToggleSuggestion: (suggestionId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onPreviewSelected: () => void;
}) {
  return (
    <section
      className="transcript-cleanup-panel"
      aria-label="Transcript cleanup suggestions"
    >
      <div className="panel-heading">
        <div>
          <h2>Transcript Cleanup Suggestions</h2>
          <p>Review transcript-derived tightening suggestions before applying.</p>
        </div>
        <strong>
          {selectedCount}/{suggestions.length} selected
        </strong>
      </div>

      <div className="transcript-cleanup-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onSelectAll}
          disabled={suggestions.length === 0}
        >
          Select All
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onClearSelection}
          disabled={selectedCount === 0}
        >
          Clear Selection
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onPreviewSelected}
          disabled={selectedCount === 0}
        >
          Review Selected In Agent Inbox
        </button>
      </div>

      {suggestions.length > 0 ? (
        <div className="transcript-cleanup-list">
          {suggestions.slice(0, 12).map((suggestion) => (
            <article
              className={`transcript-cleanup-card priority-${suggestion.priority}`}
              key={suggestion.id}
            >
              <label>
                <input
                  type="checkbox"
                  checked={selectedSuggestionIds.has(suggestion.id)}
                  onChange={() => onToggleSuggestion(suggestion.id)}
                  aria-label={`Select transcript cleanup suggestion ${suggestion.id}`}
                />
                <span>{suggestion.kind}</span>
              </label>
              <div>
                <strong>{suggestion.message}</strong>
                <p>{suggestion.text ?? "No transcript excerpt available."}</p>
                <div className="transcript-cleanup-meta">
                  {suggestion.startSourceTimeMs !== undefined ? (
                    <span>
                      {formatSourceTime(suggestion.startSourceTimeMs)}
                      {suggestion.endSourceTimeMs !== undefined
                        ? `-${formatSourceTime(suggestion.endSourceTimeMs)}`
                        : ""}
                    </span>
                  ) : null}
                  {suggestion.confidence !== undefined ? (
                    <span>{formatConfidence(suggestion.confidence)} confidence</span>
                  ) : null}
                  {suggestion.reason ? <span>{suggestion.reason}</span> : null}
                  <span>
                    {suggestion.operations.length} op
                    {suggestion.operations.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel-empty">
          Import a timed transcript to surface cleanup suggestions. Suggestions
          remain drafts until reviewed in the Agent Suggestions Inbox.
        </p>
      )}
      {suggestions.length > 12 ? (
        <p className="transcript-more">
          Showing first 12 cleanup suggestions. Export Agent Context for the full
          transcript review payload.
        </p>
      ) : null}
    </section>
  );
}

function ClipCandidateLanePanel({
  candidates,
  approvedCount,
  titleDraft,
  summaryDraft,
  hasCurrentSegment,
  hasSelectedRange,
  hasTranscriptSegment,
  hasMarkerRange,
  onTitleDraftChange,
  onSummaryDraftChange,
  onCreateFromCurrentSegment,
  onCreateFromRange,
  onCreateFromTranscript,
  onCreateFromMarkers,
  onStatusChange,
  onJump,
  onRemove,
  onExport,
}: {
  candidates: readonly ClipCandidate[];
  approvedCount: number;
  titleDraft: string;
  summaryDraft: string;
  hasCurrentSegment: boolean;
  hasSelectedRange: boolean;
  hasTranscriptSegment: boolean;
  hasMarkerRange: boolean;
  onTitleDraftChange: (value: string) => void;
  onSummaryDraftChange: (value: string) => void;
  onCreateFromCurrentSegment: () => void;
  onCreateFromRange: () => void;
  onCreateFromTranscript: () => void;
  onCreateFromMarkers: () => void;
  onStatusChange: (candidateId: string, status: ClipCandidateStatus) => void;
  onJump: (candidate: ClipCandidate) => void;
  onRemove: (candidateId: string) => void;
  onExport: () => void;
}) {
  return (
    <section className="clip-candidate-lane" aria-label="Clip candidate lane">
      <div className="panel-heading">
        <div>
          <h2>Clip Candidate Lane</h2>
          <p>Semantic short-form ranges for later render profiles.</p>
        </div>
        <strong>
          {approvedCount}/{candidates.length} approved
        </strong>
      </div>

      <div className="clip-candidate-drafts">
        <label>
          Clip title
          <input
            value={titleDraft}
            onChange={(event) => onTitleDraftChange(event.target.value)}
            placeholder="Optional title override"
            aria-label="Clip candidate title"
          />
        </label>
        <label>
          Summary
          <textarea
            value={summaryDraft}
            onChange={(event) => onSummaryDraftChange(event.target.value)}
            placeholder="Optional clip summary"
            aria-label="Clip candidate summary"
          />
        </label>
      </div>

      <div className="clip-candidate-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onCreateFromCurrentSegment}
          disabled={!hasCurrentSegment}
        >
          From Current Segment
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onCreateFromRange}
          disabled={!hasSelectedRange}
        >
          From Selected Range
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onCreateFromTranscript}
          disabled={!hasTranscriptSegment}
        >
          From Transcript Segment
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onCreateFromMarkers}
          disabled={!hasMarkerRange}
        >
          From Marker Range
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onExport}
          disabled={candidates.length === 0}
        >
          Export Clips
        </button>
      </div>

      {candidates.length > 0 ? (
        <div className="clip-candidate-list">
          {candidates.map((candidate) => (
            <article
              className={`clip-candidate-card status-${candidate.status}`}
              key={candidate.id}
            >
              <div className="clip-candidate-card-main">
                <strong>{candidate.title}</strong>
                <span>
                  {formatSourceTime(candidate.startSourceTimeMs)}-
                  {formatSourceTime(candidate.endSourceTimeMs)} ·{" "}
                  {formatSourceTime(
                    candidate.endSourceTimeMs - candidate.startSourceTimeMs,
                  )}
                </span>
                {candidate.summary ? <p>{candidate.summary}</p> : null}
                <div className="clip-candidate-meta">
                  <span>{candidate.status}</span>
                  <span>{candidate.source}</span>
                  {typeof candidate.score === "number" ? (
                    <span>{Math.round(candidate.score * 100)} score</span>
                  ) : null}
                  {candidate.targetProfiles.map((profile) => (
                    <span key={profile}>{formatClipRenderProfile(profile)}</span>
                  ))}
                </div>
                {candidate.reasons.length > 0 ? (
                  <ul>
                    {candidate.reasons.slice(0, 3).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="clip-candidate-card-actions">
                <select
                  value={candidate.status}
                  onChange={(event) =>
                    onStatusChange(
                      candidate.id,
                      event.target.value as ClipCandidateStatus,
                    )
                  }
                  aria-label={`Clip status for ${candidate.title}`}
                >
                  {CLIP_CANDIDATE_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onJump(candidate)}
                >
                  Jump
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onRemove(candidate.id)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel-empty">
          Create clip candidates from semantic segments, ranges, transcript
          segments, or marker ranges. These are decision-layer ranges only; no
          clips are rendered or uploaded here.
        </p>
      )}
    </section>
  );
}

function EpisodeOutputBoardPanel({
  outputPackage,
  onExportJson,
  onExportMarkdown,
}: {
  outputPackage: EpisodeOutputPackage;
  onExportJson: () => void;
  onExportMarkdown: () => void;
}) {
  const readinessItems = [
    {
      label: "Manifest",
      value: outputPackage.readiness.manifestLoaded ? "Loaded" : "Missing",
    },
    {
      label: "Proxy",
      value: outputPackage.readiness.proxyLoaded ? "Loaded" : "Missing",
    },
    {
      label: "Transcript",
      value: outputPackage.readiness.transcriptLoaded ? "Loaded" : "Optional",
    },
    {
      label: "Sync Map",
      value: outputPackage.readiness.syncMapAttached ? "Attached" : "Missing",
    },
    {
      label: "Decisions",
      value: String(outputPackage.metrics.decisionCount),
    },
    {
      label: "Approved Clips",
      value: `${outputPackage.metrics.approvedClipCount}/${outputPackage.metrics.totalClipCount}`,
    },
    {
      label: "Active Program",
      value: formatSourceTime(outputPackage.metrics.activeDurationMs),
    },
    {
      label: "Cut Time",
      value: formatSourceTime(outputPackage.metrics.cutDurationMs),
    },
  ];

  return (
    <section className="episode-output-board" aria-label="Episode output board">
      <div className="panel-heading">
        <div>
          <h2>Episode Output Board</h2>
          <p>Publishing package draft for render, clips, captions, and handoff.</p>
        </div>
        <strong>{outputPackage.readiness.renderReady ? "Render ready" : "Draft"}</strong>
      </div>

      <div className="output-board-grid">
        {readinessItems.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="output-board-preview">
        <div>
          <span>Title candidates</span>
          <ol>
            {outputPackage.titleCandidates.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ol>
        </div>
        <div>
          <span>Description draft</span>
          <p>{outputPackage.descriptionDraft}</p>
        </div>
      </div>

      <div className="output-board-columns">
        <div>
          <span>Chapters</span>
          {outputPackage.chapterDrafts.length > 0 ? (
            <ol>
              {outputPackage.chapterDrafts.slice(0, 8).map((chapter) => (
                <li key={`${chapter.startSourceTimeMs}-${chapter.state}`}>
                  {formatSourceTime(chapter.startSourceTimeMs)} · {chapter.title}
                </li>
              ))}
            </ol>
          ) : (
            <p>No chapter candidates until decisions exist.</p>
          )}
        </div>
        <div>
          <span>Checklist</span>
          <ul>
            {outputPackage.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="output-board-command">
        <span>Render command seed</span>
        <code>{outputPackage.renderCommands[0]}</code>
      </div>

      <div className="output-board-actions">
        <button className="secondary-button" type="button" onClick={onExportJson}>
          Export Output JSON
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onExportMarkdown}
        >
          Export Output Markdown
        </button>
      </div>

      <p className="output-board-note">
        Output packages contain semantic decisions, clip candidates, and planning
        metadata only. They do not include local proxy object URLs or original
        media paths.
      </p>
    </section>
  );
}

function EpisodeSetupBoardPanel({
  setupBoard,
  preflight,
  onBoardChange,
  onClear,
}: {
  setupBoard: EpisodeSetupBoard;
  preflight: EpisodeSetupBoardPreflight;
  onBoardChange: (next: EpisodeSetupBoard) => void;
  onClear: () => void;
}) {
  const requiredChecks = preflight.checks.filter(
    (check) => check.status !== "optional",
  );
  const requiredReadyCount = requiredChecks.filter(
    (check) => check.status === "ready",
  ).length;
  const hasAnyData = [
    setupBoard.episodeTitle.trim(),
    setupBoard.guests.length > 0 ? setupBoard.guests.join("\n") : "",
    setupBoard.links.length > 0 ? setupBoard.links.join("\n") : "",
    setupBoard.scriptNotes.trim(),
    setupBoard.teleprompterNotes.trim(),
    setupBoard.plannedClipBeats.length > 0
      ? setupBoard.plannedClipBeats.join("\n")
      : "",
    setupBoard.assetChecklist.length > 0 ? setupBoard.assetChecklist.join("\n") : "",
  ].some(Boolean);

  return (
    <section className="episode-setup-board" aria-label="Episode setup board">
      <div className="panel-heading">
        <div>
          <h2>Episode Setup Board</h2>
          <p>
            Browser-local planning layer for title, guests, links, notes, beats,
            and assets before recording.
          </p>
        </div>
        <strong>{requiredReadyCount}/{requiredChecks.length} required complete</strong>
      </div>

      <PackagePreflightSummary
        checks={preflight.checks}
        status={preflight.status}
        title="Setup preflight"
      />

      <div className="setup-board-grid">
        <label>
          Episode title
          <input
            value={setupBoard.episodeTitle}
            onChange={(event) =>
              onBoardChange({
                ...setupBoard,
                episodeTitle: event.target.value,
              })
            }
            placeholder="Episode title"
            aria-label="Episode title"
          />
        </label>

        <label>
          Guests (one per line)
          <textarea
            value={setupBoard.guests.join("\n")}
            onChange={(event) =>
              onBoardChange({
                ...setupBoard,
                guests: splitLinesForBoard(event.target.value),
              })
            }
            placeholder="Guest name\nAnother guest"
            aria-label="Episode setup guests"
          />
        </label>

        <label>
          Link references (one per line)
          <textarea
            value={setupBoard.links.join("\n")}
            onChange={(event) =>
              onBoardChange({
                ...setupBoard,
                links: splitLinesForBoard(event.target.value),
              })
            }
            placeholder="Show notes\nProduction folder\nReference docs"
            aria-label="Episode setup links"
          />
        </label>

        <label>
          Script / teleprompter notes
          <textarea
            value={setupBoard.scriptNotes}
            onChange={(event) =>
              onBoardChange({
                ...setupBoard,
                scriptNotes: event.target.value,
              })
            }
            placeholder="Opening, transitions, and scripted moments"
            aria-label="Episode setup script notes"
          />
        </label>

        <label>
          Teleprompter cues
          <textarea
            value={setupBoard.teleprompterNotes}
            onChange={(event) =>
              onBoardChange({
                ...setupBoard,
                teleprompterNotes: event.target.value,
              })
            }
            placeholder="Cue cards and timing notes for host reads"
            aria-label="Episode setup teleprompter notes"
          />
        </label>

        <label>
          Planned clip beats (one per line)
          <textarea
            value={setupBoard.plannedClipBeats.join("\n")}
            onChange={(event) =>
              onBoardChange({
                ...setupBoard,
                plannedClipBeats: splitLinesForBoard(event.target.value),
              })
            }
            placeholder="Open with B-roll\nGuest soundbite\nCTA outro"
            aria-label="Episode setup clip beats"
          />
        </label>

        <label>
          Asset checklist (one per line)
          <textarea
            value={setupBoard.assetChecklist.join("\n")}
            onChange={(event) =>
              onBoardChange({
                ...setupBoard,
                assetChecklist: splitLinesForBoard(event.target.value),
              })
            }
            placeholder="Intro music\nB-roll clips\nSponsor asset\nAlt audio"
            aria-label="Episode setup asset checklist"
          />
        </label>
      </div>

      <div className="setup-board-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onClear}
          disabled={!hasAnyData}
        >
          Clear setup board
        </button>
      </div>
    </section>
  );
}

function CaptionSocialProfilePanel({
  plan,
  onExportPlan,
}: {
  plan: RenderProfilePlan;
  onExportPlan: () => void;
}) {
  return (
    <section className="caption-profile-panel" aria-label="Caption and social profiles">
      <div className="panel-heading">
        <div>
          <h2>Caption & Social Profiles</h2>
          <p>Data-driven output profiles for captions, shorts, squares, and audio.</p>
        </div>
        <strong>{plan.clipOutputs.length} clip outputs</strong>
      </div>

      <div className="caption-profile-grid">
        {plan.profiles.map((profile) => (
          <article className="caption-profile-card" key={profile.id}>
            <span>{profile.outputKind}</span>
            <strong>{profile.label}</strong>
            <small>
              {profile.aspectRatio}
              {profile.width && profile.height
                ? ` · ${profile.width}x${profile.height}`
                : ""}
            </small>
            <p>{profile.notes}</p>
          </article>
        ))}
      </div>

      <div className="caption-preset-list">
        {plan.captionPresets.map((preset) => (
          <div key={preset.id}>
            <span>{preset.label}</span>
            <strong>
              {preset.placement} · {preset.maxLines} line
              {preset.maxLines === 1 ? "" : "s"}
            </strong>
            <small>{preset.notes}</small>
          </div>
        ))}
      </div>

      <div className="caption-profile-summary">
        <ReadinessMetric
          label="Full episode outputs"
          value={String(plan.fullEpisodeOutputs.length)}
        />
        <ReadinessMetric
          label="Clip variants"
          value={String(plan.clipOutputs.length)}
        />
        <ReadinessMetric
          label="Warnings"
          value={String(plan.warnings.length)}
        />
      </div>

      {plan.warnings.length > 0 ? (
        <ul className="readiness-warnings">
          {plan.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="output-board-actions">
        <button className="secondary-button" type="button" onClick={onExportPlan}>
          Export Render Profile Plan
        </button>
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

type CommandCenterStep = {
  label: string;
  status: "ready" | "next" | "waiting" | "blocked";
  detail: string;
  action: string;
};

function EpisodeCommandCenterPanel({
  status,
  metadata,
  manifest,
  localProxyVideo,
  packageSelection,
  syncReview,
  decisionCount,
  exportFileNamePreview,
}: {
  status: PersistenceStatus;
  metadata: SharedRoomMetadata | null;
  manifest: EpisodeManifest | null;
  localProxyVideo: LocalProxyVideo | null;
  packageSelection: RescueSyncPackageSelection;
  syncReview: SyncReviewState;
  decisionCount: number;
  exportFileNamePreview: string;
}) {
  const selectedPackagePartCount = [
    packageSelection.manifest,
    packageSelection.proxyFile,
    packageSelection.syncMap,
  ].filter(Boolean).length;
  const packageSelected = Boolean(
    packageSelection.manifest && packageSelection.proxyFile && packageSelection.syncMap,
  );
  const packagePartiallySelected = selectedPackagePartCount > 0 && !packageSelected;
  const roomPublished = Boolean(metadata);
  const proxyVisible = Boolean(localProxyVideo || metadata?.sourceMonitorProxyStoragePath);
  const syncMapAvailable = Boolean(
    syncReview.syncMap || packageSelection.syncMap || metadata?.syncMapStoragePath,
  );
  const canUseCloudRoom = status.mode === "cloud_connected";
  const steps: CommandCenterStep[] = [
    {
      label: "Generated package",
      status: roomPublished
        ? "ready"
        : packageSelected
          ? "next"
          : packagePartiallySelected
            ? "next"
            : "waiting",
      detail: roomPublished
        ? getSharedRoomPackageKindLabel(metadata?.packageKind)
        : packageSelected
          ? "Manifest, proxy, and Sync Map selected"
          : packagePartiallySelected
            ? `${selectedPackagePartCount} of 3 generated files selected`
          : "Run Rescue Sync and select generated files",
      action: roomPublished
        ? "Review attached Sync Map."
        : packageSelected
          ? "Publish Rescue Sync package."
          : packagePartiallySelected
            ? "Select remaining generated package files."
          : "Generate package locally first.",
    },
    {
      label: "Shared room",
      status: roomPublished ? "ready" : canUseCloudRoom ? "waiting" : "blocked",
      detail: roomPublished
        ? `${metadata?.projectId}/${metadata?.branchId}`
        : canUseCloudRoom
          ? "Cloud connected"
          : status.label,
      action: roomPublished
        ? "Send the room link."
        : canUseCloudRoom
          ? "Create or publish a room."
          : "Use local backup flow until cloud is available.",
    },
    {
      label: "Browser edit",
      status: decisionCount > 0 ? "ready" : manifest && proxyVisible ? "next" : "waiting",
      detail: decisionCount > 0 ? `${decisionCount} decisions` : manifest?.title ?? "No episode loaded",
      action:
        decisionCount > 0
          ? "Continue tagging or export decisions."
          : manifest && proxyVisible
            ? "Play, scrub, and tag states."
            : "Load or join an episode room.",
    },
    {
      label: "Decision handoff",
      status: decisionCount > 0 ? "next" : "waiting",
      detail: `Save as ${exportFileNamePreview}`,
      action:
        decisionCount > 0
          ? "Export decisions into the session edit folder."
          : "Create at least one semantic decision.",
    },
    {
      label: "Local render",
      status: decisionCount > 0 && syncMapAvailable ? "next" : "waiting",
      detail: syncMapAvailable ? "Sync Map available" : "Needs Sync Map",
      action:
        decisionCount > 0 && syncMapAvailable
          ? "Run the dry-run render command below."
          : "Publish or attach a Rescue Sync package first.",
    },
  ];

  return (
    <section className="command-center-panel" aria-label="Episode command center">
      <div className="panel-heading">
        <div>
          <h2>Episode Command Center</h2>
          <p>Primary path from generated package to shared edit to local render.</p>
        </div>
        <strong>{getCommandCenterPhase(steps)}</strong>
      </div>
      <div className="command-center-steps">
        {steps.map((step) => (
          <div
            className={`command-center-step is-${step.status}`}
            key={step.label}
          >
            <span>{step.label}</span>
            <strong>{getCommandCenterStatusLabel(step.status)}</strong>
            <p>{step.detail}</p>
            <small>{step.action}</small>
          </div>
        ))}
      </div>
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

function getCommandCenterStatusLabel(status: CommandCenterStep["status"]) {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "next") {
    return "Next";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "Waiting";
}

function getCommandCenterPhase(steps: readonly CommandCenterStep[]) {
  const blockedStep = steps.find((step) => step.status === "blocked");
  if (blockedStep) {
    return `Blocked at ${blockedStep.label}`;
  }

  const nextStep = steps.find((step) => step.status === "next");
  if (nextStep) {
    return `Next: ${nextStep.label}`;
  }

  const waitingStep = steps.find((step) => step.status === "waiting");
  if (waitingStep) {
    return `Waiting on ${waitingStep.label}`;
  }

  return "Ready";
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

function AgentDecisionOpsPanel({
  preview,
  selectedOperationIndexes,
  rejectedOperationIndexes,
  onToggleOperation,
  onSelectAll,
  onRejectSelected,
  onRestoreRejected,
  onApplySelected,
  onApplyAll,
  onDismiss,
}: {
  preview: AgentDecisionOpsPreview | null;
  selectedOperationIndexes: ReadonlySet<number>;
  rejectedOperationIndexes: ReadonlySet<number>;
  onToggleOperation: (index: number) => void;
  onSelectAll: () => void;
  onRejectSelected: () => void;
  onRestoreRejected: () => void;
  onApplySelected: () => void;
  onApplyAll: () => void;
  onDismiss: () => void;
}) {
  if (!preview) {
    return null;
  }

  const canApply = preview.errors.length === 0 && preview.operationCount > 0;
  const selectedCount = preview.operations.filter(
    (_, index) =>
      selectedOperationIndexes.has(index) &&
      !rejectedOperationIndexes.has(index),
  ).length;
  const rejectedCount = preview.operations.filter((_, index) =>
    rejectedOperationIndexes.has(index),
  ).length;

  return (
    <section
      className={`agent-ops-panel${preview.errors.length > 0 ? " is-error" : ""}`}
      aria-label="Agent decision operation preview"
    >
      <div className="panel-heading">
        <div>
          <h3>Agent Suggestions Inbox</h3>
          <p>
            Review generated decision-layer suggestions before applying them to
            this room.
          </p>
        </div>
        <strong>{canApply ? "Ready" : "Check"}</strong>
      </div>

      <div className="agent-ops-grid">
        <ReadinessMetric label="File" value={preview.fileName} />
        <ReadinessMetric label="Operations" value={String(preview.operationCount)} />
        <ReadinessMetric label="Adds" value={String(preview.addCount)} />
        <ReadinessMetric label="Ranges" value={String(preview.rangeCount)} />
        <ReadinessMetric label="Removes" value={String(preview.removeCount)} />
        <ReadinessMetric
          label="Approval required"
          value={String(preview.approvalRequiredCount)}
        />
        <ReadinessMetric
          label="Active after"
          value={String(preview.activeDecisionCountAfterApply)}
        />
        <ReadinessMetric
          label="Tombstones after"
          value={String(preview.tombstonedDecisionCountAfterApply)}
        />
        <ReadinessMetric label="Selected" value={String(selectedCount)} />
        <ReadinessMetric label="Rejected" value={String(rejectedCount)} />
      </div>

      {preview.operations.length > 0 ? (
        <div className="agent-suggestion-list">
          {preview.operations.map((operation, index) => {
            const isRejected = rejectedOperationIndexes.has(index);
            const isSelected =
              selectedOperationIndexes.has(index) && !isRejected;

            return (
              <article
                className={`agent-suggestion-card${
                  isSelected ? " is-selected" : ""
                }${isRejected ? " is-rejected" : ""}`}
                key={`${operation.op}-${index}`}
              >
                <label className="agent-suggestion-select">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isRejected || !canApply}
                    onChange={() => onToggleOperation(index)}
                    aria-label={`Select agent suggestion ${index + 1}`}
                  />
                  <span>{isRejected ? "Rejected" : isSelected ? "Selected" : "Review"}</span>
                </label>
                <div className="agent-suggestion-body">
                  <strong>{formatAgentOperationTitle(operation)}</strong>
                  <p>{preview.summaries[index] ?? formatAgentOperationSummary(operation)}</p>
                  <div className="agent-suggestion-meta">
                    <span>{operation.op}</span>
                    {typeof operation.confidence === "number" ? (
                      <span>{Math.round(operation.confidence * 100)}% confidence</span>
                    ) : null}
                    {operation.approvalRequired ? <span>Approval required</span> : null}
                    {operation.reason ? <span>{operation.reason}</span> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {preview.warnings.length > 0 ? (
        <ul className="agent-ops-warnings">
          {preview.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {preview.errors.length > 0 ? (
        <ul className="agent-ops-errors">
          {preview.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <div className="toolbar-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onApplySelected}
          disabled={!canApply || selectedCount === 0}
        >
          Apply Selected
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onApplyAll}
          disabled={!canApply}
        >
          Apply All
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onSelectAll}
          disabled={!canApply || selectedCount + rejectedCount === preview.operationCount}
        >
          Select All
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onRejectSelected}
          disabled={!canApply || selectedCount === 0}
        >
          Reject Selected
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onRestoreRejected}
          disabled={rejectedCount === 0}
        >
          Restore Rejected
        </button>
        <button className="secondary-button" type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}

function formatAgentOperationTitle(operation: AgentDecisionOperation) {
  if (operation.op === "addDecision") {
    return `Add ${PROGRAM_STATE_LABELS[operation.state]} at ${formatSourceTime(
      operation.sourceTimeMs,
    )}`;
  }

  if (operation.op === "setRangeState") {
    return `Set ${PROGRAM_STATE_LABELS[operation.state]} from ${formatSourceTime(
      operation.startSourceTimeMs,
    )} to ${formatSourceTime(operation.endSourceTimeMs)}`;
  }

  return `Remove decision ${shortId(operation.id)}`;
}

function formatAgentOperationSummary(operation: AgentDecisionOperation) {
  if (operation.op === "addDecision") {
    return operation.note || operation.reason || "Add a point decision.";
  }

  if (operation.op === "setRangeState") {
    return (
      operation.note ||
      operation.reason ||
      `Apply ${PROGRAM_STATE_LABELS[operation.state]} across the selected range.`
    );
  }

  return operation.reason || "Tombstone an existing decision event.";
}

function DecisionRefinementPanel({
  selectedEvent,
  draft,
  currentEvent,
  latestEvent,
  sourceTimeMs,
  sourceDurationMs,
  onSelectActive,
  onDraftChange,
  onUseCurrentTime,
  onNudge,
  onSave,
  onJump,
  onRemove,
  onClearSelection,
}: {
  selectedEvent: DecisionEvent | null;
  draft: DecisionRefinementDraft | null;
  currentEvent?: DecisionEvent;
  latestEvent: DecisionEvent | null;
  sourceTimeMs: number;
  sourceDurationMs: number;
  onSelectActive: () => void;
  onDraftChange: (patch: Partial<DecisionRefinementDraft>) => void;
  onUseCurrentTime: () => void;
  onNudge: (deltaMs: number) => void;
  onSave: () => void;
  onJump: (sourceTimeMs: number) => void;
  onRemove: (eventId: string) => void;
  onClearSelection: () => void;
}) {
  const canSave = Boolean(
    selectedEvent &&
      draft &&
      (selectedEvent.sourceTimeMs !== draft.sourceTimeMs ||
        selectedEvent.state !== draft.state ||
        (selectedEvent.note ?? "") !== draft.note.trim()),
  );

  return (
    <section
      className="decision-refinement-panel"
      aria-label="Decision refinement"
    >
      <div className="timeline-header">
        <div>
          <strong>Decision Refinement</strong>
          <p>
            Correct a tag in place. This edits the semantic decision event; no
            source media is touched.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={onSelectActive}
          disabled={!currentEvent && !latestEvent}
        >
          Select Active
        </button>
      </div>

      {!selectedEvent || !draft ? (
        <p className="panel-empty">
          Select a decision from the list, or use Select Active while parked on a
          tagged segment.
        </p>
      ) : (
        <>
          <div className="decision-refinement-grid">
            <ReadinessMetric label="Event" value={shortId(selectedEvent.id)} />
            <ReadinessMetric
              label="Original"
              value={`${PROGRAM_STATE_LABELS[selectedEvent.state]} at ${formatSourceTime(
                selectedEvent.sourceTimeMs,
              )}`}
            />
            <ReadinessMetric
              label="Current playhead"
              value={formatSourceTime(sourceTimeMs)}
            />
            <ReadinessMetric
              label="Episode duration"
              value={formatSourceTime(sourceDurationMs)}
            />
          </div>
          <div className="decision-refinement-form">
            <label>
              State
              <select
                value={draft.state}
                onChange={(event) =>
                  onDraftChange({ state: event.target.value as ProgramState })
                }
                aria-label="Selected decision state"
              >
                {PROGRAM_STATES.map((state) => (
                  <option key={state} value={state}>
                    {PROGRAM_STATE_LABELS[state]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source time seconds
              <input
                type="number"
                min={0}
                max={Math.ceil(sourceDurationMs / 1000)}
                step={0.1}
                value={roundSeconds(draft.sourceTimeMs)}
                onChange={(event) =>
                  onDraftChange({
                    sourceTimeMs: Number(event.target.value) * 1000,
                  })
                }
                aria-label="Selected decision source time seconds"
              />
            </label>
            <label className="decision-refinement-note">
              Note
              <textarea
                value={draft.note}
                onChange={(event) => onDraftChange({ note: event.target.value })}
                aria-label="Selected decision note"
              />
            </label>
          </div>
          <div className="decision-boundary-slider">
            <label>
              Drag segment boundary
              <input
                aria-label="Selected decision boundary time"
                type="range"
                min={0}
                max={sourceDurationMs}
                step={100}
                value={draft.sourceTimeMs}
                onChange={(event) =>
                  onDraftChange({ sourceTimeMs: Number(event.target.value) })
                }
              />
            </label>
            <p>
              This moves the selected decision boundary in canonical source time.
              The source media stays whole.
            </p>
          </div>
          <div className="decision-refinement-actions">
            <button type="button" onClick={() => onNudge(-1000)}>
              -1s
            </button>
            <button type="button" onClick={() => onNudge(-100)}>
              -0.1s
            </button>
            <button type="button" onClick={onUseCurrentTime}>
              Use Current Time
            </button>
            <button type="button" onClick={() => onNudge(100)}>
              +0.1s
            </button>
            <button type="button" onClick={() => onNudge(1000)}>
              +1s
            </button>
            <button type="button" onClick={() => onJump(draft.sourceTimeMs)}>
              Jump Draft
            </button>
            <button type="button" onClick={onSave} disabled={!canSave}>
              Save Refinement
            </button>
            <button type="button" onClick={() => onRemove(selectedEvent.id)}>
              Remove
            </button>
            <button type="button" onClick={onClearSelection}>
              Deselect
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function DecisionList({
  events,
  currentEventId,
  latestEventId,
  selectedEventId,
  onJump,
  onSelect,
  onRemove,
}: {
  events: DecisionEvent[];
  currentEventId?: string;
  latestEventId?: string;
  selectedEventId?: string;
  onJump: (sourceTimeMs: number) => void;
  onSelect: (eventId: string) => void;
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
            const isSelected = event.id === selectedEventId;

            return (
              <tr
                key={event.id}
                className={[
                  isCurrent ? "is-current-row" : "",
                  isLatest ? "is-latest-row" : "",
                  isSelected ? "is-selected-row" : "",
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
                      onClick={() => onSelect(event.id)}
                      aria-label={`Edit decision ${shortId(event.id)}`}
                    >
                      Edit
                    </button>
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

function TimelinePowerToolsPanel({
  markerDraft,
  markerNoteDraft,
  markers,
  rangeSelection,
  normalizedRange,
  rangeState,
  sourceTimeMs,
  sourceDurationMs,
  nextMarker,
  onMarkerDraftChange,
  onMarkerNoteDraftChange,
  onAddMarker,
  onSetRangeStart,
  onSetRangeEnd,
  onNudgeRange,
  onDragRange,
  onClearRange,
  onRangeStateChange,
  onApplyRange,
  onApplyToNextMarker,
}: {
  markerDraft: string;
  markerNoteDraft: string;
  markers: TimelineMarker[];
  rangeSelection: RangeSelection;
  normalizedRange: NormalizedRangeSelection | null;
  rangeState: ProgramState;
  sourceTimeMs: number;
  sourceDurationMs: number;
  nextMarker?: TimelineMarker;
  onMarkerDraftChange: (value: string) => void;
  onMarkerNoteDraftChange: (value: string) => void;
  onAddMarker: () => void;
  onSetRangeStart: () => void;
  onSetRangeEnd: () => void;
  onNudgeRange: (handle: "start" | "end", deltaMs: number) => void;
  onDragRange: (handle: "start" | "end", nextSourceTimeMs: number) => void;
  onClearRange: () => void;
  onRangeStateChange: (state: ProgramState) => void;
  onApplyRange: () => void;
  onApplyToNextMarker: () => void;
}) {
  const rangeDurationMs = normalizedRange
    ? normalizedRange.endSourceTimeMs - normalizedRange.startSourceTimeMs
    : 0;

  return (
    <section className="timeline-power-tools-panel" aria-label="Timeline Power Tools">
      <div className="panel-heading">
        <div>
          <h2>Timeline Power Tools</h2>
          <p>Markers, range handles, and bulk state tagging</p>
        </div>
        <span className="panel-count-pill">
          {markers.length} marker{markers.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="marker-control-row">
        <label>
          Marker label
          <input
            aria-label="Marker label"
            type="text"
            value={markerDraft}
            onChange={(event) => onMarkerDraftChange(event.target.value)}
            placeholder={`Marker ${formatSourceTime(sourceTimeMs)}`}
          />
        </label>
        <label>
          Marker comment
          <input
            aria-label="Marker comment"
            type="text"
            value={markerNoteDraft}
            onChange={(event) => onMarkerNoteDraftChange(event.target.value)}
            placeholder="Optional note for this beat"
          />
        </label>
        <button type="button" onClick={onAddMarker}>
          Add Marker
        </button>
      </div>

      <div className="timeline-power-grid">
        <div>
          <span>Playhead</span>
          <strong>{formatSourceTime(sourceTimeMs)}</strong>
        </div>
        <div>
          <span>Range In</span>
          <strong>
            {normalizedRange
              ? formatSourceTime(normalizedRange.startSourceTimeMs)
              : "Not set"}
          </strong>
        </div>
        <div>
          <span>Range Out</span>
          <strong>
            {normalizedRange
              ? formatSourceTime(normalizedRange.endSourceTimeMs)
              : "Not set"}
          </strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>
            {normalizedRange ? formatSourceTime(rangeDurationMs) : "Not set"}
          </strong>
        </div>
        <div>
          <span>Next marker</span>
          <strong>
            {nextMarker
              ? `${nextMarker.label} · ${formatSourceTime(nextMarker.sourceTimeMs)}`
              : formatSourceTime(sourceDurationMs)}
          </strong>
        </div>
      </div>

      <div className="range-control-grid">
        <button type="button" onClick={onSetRangeStart}>
          Set In
        </button>
        <button type="button" onClick={onSetRangeEnd}>
          Set Out
        </button>
        <button type="button" onClick={() => onNudgeRange("start", -1000)}>
          In -1s
        </button>
        <button type="button" onClick={() => onNudgeRange("start", 1000)}>
          In +1s
        </button>
        <button type="button" onClick={() => onNudgeRange("end", -1000)}>
          Out -1s
        </button>
        <button type="button" onClick={() => onNudgeRange("end", 1000)}>
          Out +1s
        </button>
      </div>

      <div className="range-slider-grid">
        <label>
          Drag In
          <input
            aria-label="Drag range in"
            type="range"
            min={0}
            max={sourceDurationMs}
            step={1000}
            value={rangeSelection.startSourceTimeMs ?? sourceTimeMs}
            onChange={(event) =>
              onDragRange("start", Number(event.target.value))
            }
          />
        </label>
        <label>
          Drag Out
          <input
            aria-label="Drag range out"
            type="range"
            min={0}
            max={sourceDurationMs}
            step={1000}
            value={rangeSelection.endSourceTimeMs ?? sourceTimeMs}
            onChange={(event) => onDragRange("end", Number(event.target.value))}
          />
        </label>
      </div>

      <div className="range-apply-row">
        <label>
          Range state
          <select
            aria-label="Range state"
            value={rangeState}
            onChange={(event) => onRangeStateChange(event.target.value as ProgramState)}
          >
            {PROGRAM_STATES.map((state) => (
              <option key={state} value={state}>
                {PROGRAM_STATE_LABELS[state]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onApplyRange}
          disabled={!normalizedRange}
        >
          Apply Range State
        </button>
        <button type="button" onClick={onApplyToNextMarker}>
          Set From Here To Next Marker
        </button>
        <button type="button" onClick={onClearRange} disabled={!normalizedRange}>
          Clear Range
        </button>
      </div>
    </section>
  );
}

function DecisionTimeline({
  segments,
  markers,
  normalizedRange,
  sourceDurationMs,
  currentSegmentSourceEventId,
  selectedBoundaryEventId,
  onJump,
  onSelectBoundary,
}: {
  segments: DerivedSegment[];
  markers: TimelineMarker[];
  normalizedRange: NormalizedRangeSelection | null;
  sourceDurationMs: number;
  currentSegmentSourceEventId?: string;
  selectedBoundaryEventId?: string;
  onJump: (sourceTimeMs: number) => void;
  onSelectBoundary: (eventId: string) => void;
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
        {normalizedRange ? (
          <div
            className="timeline-range-selection"
            style={
              {
                "--range-left": `${getTimelinePercent(
                  normalizedRange.startSourceTimeMs,
                  sourceDurationMs,
                )}%`,
                "--range-width": `${Math.max(
                  getTimelinePercent(
                    normalizedRange.endSourceTimeMs -
                      normalizedRange.startSourceTimeMs,
                    sourceDurationMs,
                  ),
                  0.5,
                )}%`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <span>Selected range</span>
          </div>
        ) : null}
        {markers.map((marker) => (
          <button
            key={marker.id}
            className="timeline-marker-pin"
            style={
              {
                "--marker-left": `${getTimelinePercent(
                  marker.sourceTimeMs,
                  sourceDurationMs,
                )}%`,
              } as CSSProperties
            }
            type="button"
            onClick={() => onJump(marker.sourceTimeMs)}
            title={`${marker.label} at ${formatSourceTime(marker.sourceTimeMs)}`}
            aria-label={`Jump to marker ${marker.label} at ${formatSourceTime(
              marker.sourceTimeMs,
            )}`}
          >
            <span>{marker.label}</span>
          </button>
        ))}
        {segments.map((segment) => {
          const isSelected = segment.sourceEventId === selectedBoundaryEventId;

          return (
            <button
              key={`boundary-${segment.sourceEventId}`}
              className={`timeline-boundary-handle${
                isSelected ? " is-selected" : ""
              }`}
              style={
                {
                  "--boundary-left": `${getTimelinePercent(
                    segment.startSourceTimeMs,
                    sourceDurationMs,
                  )}%`,
                } as CSSProperties
              }
              type="button"
              onClick={() => onSelectBoundary(segment.sourceEventId)}
              title={`Edit ${PROGRAM_STATE_LABELS[
                segment.state
              ]} boundary at ${formatSourceTime(segment.startSourceTimeMs)}`}
              aria-label={`Edit boundary for ${PROGRAM_STATE_LABELS[
                segment.state
              ]} at ${formatSourceTime(segment.startSourceTimeMs)}`}
            >
              <span>{formatSourceTime(segment.startSourceTimeMs)}</span>
            </button>
          );
        })}
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
        <span>Markers and range overlays are browser-local power tools.</span>
        <span>Cut spans are inactive in playback, not deleted.</span>
      </div>
    </section>
  );
}

function MarkerLane({
  markers,
  sourceDurationMs,
  onJump,
  onSetRangeStart,
  onSetRangeEnd,
  onRemove,
}: {
  markers: TimelineMarker[];
  sourceDurationMs: number;
  onJump: (marker: TimelineMarker) => void;
  onSetRangeStart: (marker: TimelineMarker) => void;
  onSetRangeEnd: (marker: TimelineMarker) => void;
  onRemove: (markerId: string) => void;
}) {
  return (
    <section className="marker-lane" aria-label="Marker Lane">
      <div className="timeline-header">
        <strong>Marker Lane</strong>
        <span>{markers.length} local marker{markers.length === 1 ? "" : "s"}</span>
      </div>
      {markers.length === 0 ? (
        <p className="empty-state">
          Add markers at review beats, sponsor reads, clips, or cleanup targets.
        </p>
      ) : (
        <div className="marker-list">
          {markers.map((marker) => (
            <div key={marker.id} className="marker-row">
              <button
                type="button"
                onClick={() => onJump(marker)}
                aria-label={`Jump to marker ${marker.label}`}
              >
                <span>{marker.label}</span>
                <small>
                  {formatSourceTime(marker.sourceTimeMs)} /{" "}
                  {formatSourceTime(sourceDurationMs)}
                </small>
                {marker.note ? <em>{marker.note}</em> : null}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onSetRangeStart(marker)}
                aria-label={`Set range in to marker ${marker.label}`}
              >
                Set In
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onSetRangeEnd(marker)}
                aria-label={`Set range out to marker ${marker.label}`}
              >
                Set Out
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onRemove(marker.id)}
                aria-label={`Remove marker ${marker.label}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function DualTrackTimelineEditor({
  tracks,
  visibleTracks,
  sourceDurationMs,
  sourceTimeMs,
  clips,
  visibleClips,
  markers,
  selectedClipId,
  zoomLevel,
  snapToFrame,
  frameRate,
  defaultTrackId,
  onTrackIdChange,
  onZoomChange,
  onToggleSnap,
  onFrameRateChange,
  onCreateFromRange,
  onJump,
  onSelectClip,
  onMoveClip,
  onMoveClipToTime,
  onTrimClip,
  onAssignTrack,
  onMoveTrack,
  onClearSelection,
  onDeleteClip,
  markerTrackLabel,
  trackFilters,
  onTrackFilterChange,
}: {
  tracks: readonly {
    id: EditorTimelineTrackId;
    label: string;
  }[];
  visibleTracks: readonly {
    id: EditorTimelineTrackId;
    label: string;
  }[];
  sourceDurationMs: number;
  sourceTimeMs: number;
  clips: readonly EditorTimelineClip[];
  visibleClips: readonly EditorTimelineClip[];
  markers: readonly TimelineMarker[];
  selectedClipId?: string;
  zoomLevel: number;
  snapToFrame: boolean;
  frameRate: number;
  defaultTrackId: EditorTimelineTrackId;
  onTrackIdChange: (trackId: EditorTimelineTrackId) => void;
  onZoomChange: (zoom: number) => void;
  onToggleSnap: () => void;
  onFrameRateChange: (frameRate: number) => void;
  onCreateFromRange: () => void;
  onJump: (sourceTimeMs: number) => void;
  onSelectClip: (clipId?: string) => void;
  onMoveClip: (clipId: string, deltaMs: number) => void;
  onMoveClipToTime: (
    clipId: string,
    nextStartSourceTimeMs: number,
    trackId?: EditorTimelineTrackId,
  ) => void;
  onTrimClip: (details: {
    clipId: string;
    edge: "start" | "end";
    nextSourceTimeMs: number;
  }) => void;
  onAssignTrack: (clipId: string, trackId: EditorTimelineTrackId) => void;
  onMoveTrack: (
    clipId: string,
    direction: "up" | "down",
  ) => void;
  onClearSelection: () => void;
  onDeleteClip: (clipId: string) => void;
  markerTrackLabel: string;
  trackFilters: TimelineTrackFilterState;
  onTrackFilterChange: (trackId: EditorTimelineTrackId, isEnabled: boolean) => void;
}) {
  const [dragState, setDragState] = useState<EditorTimelineDragState | null>(
    null,
  );
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const timelineWidth = Math.max(
    420,
    (sourceDurationMs / 1000) * TIMELINE_EDITOR_PX_PER_SECOND * zoomLevel,
  );
  const selectedClip = visibleClips.find((clip) => clip.id === selectedClipId);
  const visibleTrackCount = Math.max(1, visibleTracks.length);
  const gridTemplateColumns = `110px repeat(${visibleTrackCount}, minmax(0, 1fr))`;

  const pxPerSecond = Math.max(1, TIMELINE_EDITOR_PX_PER_SECOND * zoomLevel);
  const rulerTickMs = getTimelineTickIntervalMs(pxPerSecond);
  const tracksWithClips = useMemo(
    () =>
      visibleTracks.map((track) => ({
        ...track,
        clips: visibleClips
          .filter((clip) => clip.trackId === track.id)
          .sort(
            (left, right) =>
              left.startSourceTimeMs - right.startSourceTimeMs ||
              left.createdAt.localeCompare(right.createdAt),
          ),
      })),
    [visibleClips, visibleTracks],
  );

  function pointerSourceTime(clientX: number) {
    const timelineRoot = timelineRef.current;

    if (!timelineRoot) {
      return sourceTimeMs;
    }

    const rect = timelineRoot.getBoundingClientRect();

    if (!rect.width) {
      return sourceTimeMs;
    }

    return clampSourceTime(
      ((clientX - rect.left) / rect.width) * sourceDurationMs,
      sourceDurationMs,
    );
  }

  function resolveTrackAtPoint(
    clientX: number,
    clientY: number,
  ): EditorTimelineTrackId | undefined {
    const trackElement = document.elementFromPoint(clientX, clientY)?.closest?.(
      "[data-track-id]",
    ) as HTMLElement | null;
    const trackId = trackElement?.getAttribute("data-track-id");

    if (!trackId) {
      return undefined;
    }

    return visibleTracks.some((track) => track.id === trackId)
      ? (trackId as EditorTimelineTrackId)
      : undefined;
  }

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const activeDragState = dragState;

    function handlePointerMove(event: globalThis.MouseEvent) {
      const pointerTime = pointerSourceTime(event.clientX);
      const activeTrackId =
        activeDragState.action === "move"
          ? resolveTrackAtPoint(event.clientX, event.clientY) ??
            activeDragState.trackId
          : activeDragState.trackId;

      if (activeDragState.action === "move") {
        onMoveClipToTime(
          activeDragState.clipId,
          pointerTime + activeDragState.pointerSourceOffsetMs,
          activeTrackId,
        );
        return;
      }

      onTrimClip({
        clipId: activeDragState.clipId,
        edge: activeDragState.action === "trim-start" ? "start" : "end",
        nextSourceTimeMs: pointerTime,
      });
    }

    function stopDrag() {
      setDragState(null);
      setIsDragging(false);
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopDrag);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, [dragState, onMoveClipToTime, onTrimClip]);

  function startDrag(
    event: MouseEvent<HTMLButtonElement>,
    clip: EditorTimelineClip,
    action: EditorTimelineDragState["action"],
  ) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pointerTime = pointerSourceTime(event.clientX);
    setDragState({
      clipId: clip.id,
      action,
      pointerSourceOffsetMs:
        action === "move" ? clip.startSourceTimeMs - pointerTime : 0,
      startSourceTimeMs: clip.startSourceTimeMs,
      endSourceTimeMs: clip.endSourceTimeMs,
      trackId: clip.trackId,
    });
    setIsDragging(true);
    onSelectClip(clip.id);
  }

  function selectOnlyClip(clipId: string) {
    onSelectClip(clipId);
  }

  return (
    <section
      className="dual-track-timeline-editor"
      aria-label="Dual Track Timeline Editor"
    >
      <div className="timeline-editor-header">
        <div>
          <strong>Dual Timeline Editor</strong>
          <p>Video + multi-audio tracks with clip trim and drag interactions.</p>
        </div>
        <div className="timeline-control-grid">
          <label>
            Track
            <select
              value={defaultTrackId}
              onChange={(event) =>
                onTrackIdChange(event.target.value as EditorTimelineTrackId)
              }
            >
              {visibleTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zoom
            <input
              type="range"
              min={TIMELINE_EDITOR_ZOOM_MIN}
              max={TIMELINE_EDITOR_ZOOM_MAX}
              step={0.25}
              value={zoomLevel}
              onChange={(event) => onZoomChange(Number(event.target.value))}
            />
          </label>
          <label>
            FPS
            <select
              value={frameRate}
              onChange={(event) =>
                onFrameRateChange(Number(event.target.value))
              }
            >
              {TIMELINE_EDITOR_FRAME_RATES.map((optionRate) => (
                <option key={optionRate} value={optionRate}>
                  {optionRate}
                </option>
              ))}
            </select>
          </label>
          <label className="timeline-checkbox">
            <input
              type="checkbox"
              checked={snapToFrame}
              onChange={onToggleSnap}
            />
            Snap to frame
          </label>
          <button type="button" onClick={onCreateFromRange}>
            Add Clip From Range
          </button>
        </div>
      </div>

      <div className="timeline-track-filters" role="group" aria-label="Timeline layer filters">
        <span>Layers</span>
        <div className="timeline-track-filter-grid">
          {tracks.map((track) => (
            <label className="timeline-track-filter-chip" key={track.id}>
              <input
                type="checkbox"
                checked={trackFilters[track.id] ?? true}
                onChange={(event) =>
                  onTrackFilterChange(track.id, event.target.checked)
                }
              />
              <span>{track.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="timeline-ruler-wrap">
        <div
          ref={timelineRef}
          className="timeline-ruler"
          style={{ width: `${timelineWidth}px` }}
          onMouseDown={() => {
            if (!isDragging) {
              onClearSelection();
            }
          }}
        >
          <div className="timeline-markers-band">
            {Array.from({ length: Math.floor(sourceDurationMs / rulerTickMs) + 1 }).map(
              (_value, index) => {
                const markerMs = index * rulerTickMs;
                const markerLabel = formatSourceTime(markerMs);

                return (
                  <div
                    key={markerMs}
                    className="timeline-ruler-mark"
                    style={
                      {
                        left: `${(markerMs / sourceDurationMs) * 100}%`,
                      } as CSSProperties
                    }
                    title={markerLabel}
                    aria-hidden="true"
                  >
                    <span>{markerLabel}</span>
                  </div>
                );
              },
            )}
          </div>

          <div
            className="timeline-playhead"
            style={
              {
                left: `${(sourceTimeMs / sourceDurationMs) * 100}%`,
              } as CSSProperties
            }
            aria-hidden="true"
          />

          <div
            className="timeline-track-header-row"
            style={{ gridTemplateColumns } as CSSProperties}
          >
            <div className="timeline-track-header-label">{markerTrackLabel}</div>
            {tracksWithClips.map((track) => (
              <div key={track.id} className="timeline-track-header-label">
                {track.label}
              </div>
            ))}
          </div>

          <div className="timeline-track-body">
            <div className="timeline-marker-row" data-track-id="marker-track">
              {markers.map((marker) => (
                <button
                  type="button"
                  key={`marker-${marker.id}`}
                  className="dual-timeline-marker"
                  style={
                    {
                      left: `${(marker.sourceTimeMs / sourceDurationMs) * 100}%`,
                    } as CSSProperties
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    onJump(marker.sourceTimeMs);
                  }}
                  title={`${marker.label} at ${formatSourceTime(marker.sourceTimeMs)}`}
                >
                  <span>{marker.label}</span>
                </button>
              ))}
            </div>

            {tracksWithClips.map((track) => (
              <div
                key={track.id}
                className="timeline-track-row"
                data-track-id={track.id}
              >
                <div className="timeline-track-strip">
                  {track.clips.map((clip) => {
                    const clipWidthPercent = Math.max(
                      0.6,
                      ((clip.endSourceTimeMs - clip.startSourceTimeMs) /
                        sourceDurationMs) *
                        100,
                    );
                    const clipLeftPercent =
                      (clip.startSourceTimeMs / sourceDurationMs) * 100;
                    const isSelected = selectedClipId === clip.id;

                    return (
                      <button
                        type="button"
                        key={clip.id}
                        className={`timeline-clip-card${
                          isSelected ? " is-selected" : ""
                        }`}
                        style={
                          {
                            left: `${clipLeftPercent}%`,
                            width: `${clipWidthPercent}%`,
                            "--track-accent":
                              EDITOR_TIMELINE_TRACK_ACCENTS[clip.trackId],
                          } as CSSProperties
                        }
                        onMouseDown={(event) => startDrag(event, clip, "move")}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectOnlyClip(clip.id);
                        }}
                        onDoubleClick={() => onJump(clip.startSourceTimeMs)}
                        title={`${clip.label} ${formatSourceTime(
                          clip.startSourceTimeMs,
                        )} to ${formatSourceTime(clip.endSourceTimeMs)}`}
                        aria-label={`Clip ${clip.label}`}
                      >
                        <div className="timeline-clip-labels">
                          <span>{clip.label}</span>
                          <small>
                            {formatSourceTime(clip.startSourceTimeMs)}–
                            {formatSourceTime(clip.endSourceTimeMs)}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="timeline-clip-handle start"
                          aria-label={`Trim in-point ${clip.label}`}
                          onMouseDown={(event) =>
                            startDrag(event, clip, "trim-start")
                          }
                        />
                        <button
                          type="button"
                          className="timeline-clip-handle end"
                          aria-label={`Trim out-point ${clip.label}`}
                          onMouseDown={(event) =>
                            startDrag(event, clip, "trim-end")
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="timeline-selected-controls">
        {selectedClip ? (
          <>
            <strong>{selectedClip.label}</strong>
            <p>
              {formatSourceTime(selectedClip.startSourceTimeMs)} to{" "}
              {formatSourceTime(selectedClip.endSourceTimeMs)} on{" "}
              {formatTimelineTrackLabel(selectedClip.trackId)}
            </p>
            <div className="timeline-selected-grid">
              <label>
                Track
                <select
                  value={selectedClip.trackId}
                  onChange={(event) =>
                    onAssignTrack(
                      selectedClip.id,
                      event.target.value as EditorTimelineTrackId,
                    )
                  }
                >
                  {visibleTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => onMoveClip(selectedClip.id, -Math.round(getTimelineFrameDurationMs(frameRate)))}
              >
                ← 1 frame
              </button>
              <button
                type="button"
                onClick={() => onMoveClip(selectedClip.id, Math.round(getTimelineFrameDurationMs(frameRate)))}
              >
                1 frame →
              </button>
              <button
                type="button"
                onClick={() => onMoveTrack(selectedClip.id, "up")}
              >
                Move Up Track
              </button>
              <button
                type="button"
                onClick={() => onMoveTrack(selectedClip.id, "down")}
              >
                Move Down Track
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onDeleteClip(selectedClip.id)}
              >
                Remove Clip
              </button>
            </div>
          </>
        ) : (
          <p className="empty-state">
            Add clips from your current timeline range, then drag for move/trim.
          </p>
        )}
      </div>
    </section>
  );
}

function getTimelineTickIntervalMs(pxPerSecond: number) {
  if (pxPerSecond >= 220) {
    return 500;
  }

  if (pxPerSecond >= 110) {
    return 1_000;
  }

  if (pxPerSecond >= 55) {
    return 2_000;
  }

  if (pxPerSecond >= 30) {
    return 5_000;
  }

  if (pxPerSecond >= 16) {
    return 10_000;
  }

  if (pxPerSecond >= 8) {
    return 30_000;
  }

  return 60_000;
}

function formatTimelineTrackLabel(trackId: EditorTimelineTrackId) {
  return (
    TIMELINE_EDITOR_TRACKS.find((track) => track.id === trackId)?.label ??
    "Track"
  );
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

function sortTranscriptSegments(segments: readonly TranscriptSegment[]) {
  return [...segments].sort(
    (left, right) =>
      left.startSourceTimeMs - right.startSourceTimeMs ||
      left.endSourceTimeMs - right.endSourceTimeMs ||
      left.id.localeCompare(right.id),
  );
}

function normalizeEpisodeTranscriptSpeakerTags(
  transcript: EpisodeTranscript,
): EpisodeTranscript {
  return {
    ...transcript,
    segments: transcript.segments.map(normalizeTranscriptSegmentSpeaker),
  };
}

function normalizeTranscriptSegmentSpeaker(segment: TranscriptSegment) {
  const nextSpeaker = normalizeTranscriptSpeakerLabel(segment.speaker);

  if (segment.speaker === nextSpeaker) {
    return segment;
  }

  return {
    ...segment,
    speaker: nextSpeaker,
  };
}

function normalizeTranscriptSpeakerLabel(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return "Unknown";
  }

  const lower = trimmed.toLowerCase();

  if (lower === "homer") {
    return "Homer";
  }

  if (lower === "charlie") {
    return "Charlie";
  }

  if (lower === "unknown") {
    return "Unknown";
  }

  return trimmed
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(
      (token) =>
        `${token[0]?.toUpperCase() ?? ""}${token.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

function buildTranscriptSpeakerProfiles(
  segments: readonly TranscriptSegment[],
): TranscriptSpeakerProfile[] {
  const profileMap = new Map<string, TranscriptSpeakerProfile>();

  for (const segment of segments) {
    const currentProfile = profileMap.get(segment.speaker);

    if (currentProfile) {
      const words = normalizeTranscriptSegmentText(segment.text)
        .split(/\s+/)
        .filter(Boolean)
        .length;

      profileMap.set(segment.speaker, {
        ...currentProfile,
        segmentCount: currentProfile.segmentCount + 1,
        wordCount: currentProfile.wordCount + words,
      });

      continue;
    }

    const words = normalizeTranscriptSegmentText(segment.text)
      .split(/\s+/)
      .filter(Boolean)
      .length;
    profileMap.set(segment.speaker, {
      speaker: segment.speaker,
      segmentCount: 1,
      wordCount: words,
    });
  }

  return [...profileMap.entries()].map(([speaker]) => ({
    ...(profileMap.get(speaker) ?? {
      speaker,
      segmentCount: 0,
      wordCount: 0,
    }),
  }));
}

function buildTranscriptSpeakerColorMap(
  profiles: readonly TranscriptSpeakerProfile[],
) {
  const colorMap: Record<string, string> = {};

  profiles.forEach((profile, profileIndex) => {
    if (!profile.speaker) {
      return;
    }

    colorMap[profile.speaker] = TRANSCRIPT_SPEAKER_COLOR_PALETTE[
      profileIndex % TRANSCRIPT_SPEAKER_COLOR_PALETTE.length
    ];
  });

  return colorMap;
}

function isTranscriptSpeakerVisible(
  speaker: string,
  filters: TranscriptSpeakerFilterState,
) {
  return filters[speaker] ?? true;
}

function getTranscriptSegmentAtSourceTime(
  segments: readonly TranscriptSegment[],
  sourceTimeMs: number,
) {
  return (
    segments.find(
      (segment) =>
        segment.startSourceTimeMs <= sourceTimeMs &&
        sourceTimeMs < segment.endSourceTimeMs,
    ) ?? null
  );
}

function normalizeTranscriptSegmentText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function clampNumberToRange(
  value: number,
  min: number,
  max: number,
) {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return Math.floor(value);
}

function buildSegmentWordTokens(
  segment: TranscriptSegment,
  sourceDurationMs: number,
  draftText?: string,
) {
  const sourceText = draftText ?? segment.text;
  const knownWords = extractSegmentWords(segment, sourceDurationMs).map((word) => ({
    id: word.id,
    text: word.text,
    startSourceTimeMs: word.startSourceTimeMs,
    endSourceTimeMs: word.endSourceTimeMs,
  }));

  if (knownWords.length > 0) {
    return knownWords;
  }

  const fallbackTokens = sourceText.split(/\s+/).filter(Boolean);
  if (fallbackTokens.length === 0) {
    return [];
  }

  const segmentStart = clampSourceTime(segment.startSourceTimeMs, sourceDurationMs);
  const segmentEnd = clampSourceTime(segment.endSourceTimeMs, sourceDurationMs);
  const segmentDuration = Math.max(1, segmentEnd - segmentStart);
  const wordDuration = segmentDuration / fallbackTokens.length;

  return fallbackTokens.map((word, index) => {
    const tokenStart = segmentStart + wordDuration * index;
    const tokenEnd = segmentStart + wordDuration * (index + 1);

    return {
      id: `${segment.id}:word:${index}`,
      text: word,
      startSourceTimeMs: clampSourceTime(tokenStart, sourceDurationMs),
      endSourceTimeMs: clampSourceTime(tokenEnd, sourceDurationMs),
    };
  });
}

function clampBoundaryTimeFromTokens(
  segmentStartMs: number,
  segmentEndMs: number,
  tokens: TranscriptWordToken[],
  boundaryAfterWordIndex: number,
  sourceDurationMs: number,
) {
  const startTime = clampSourceTime(segmentStartMs, sourceDurationMs);
  const endTime = clampSourceTime(segmentEndMs, sourceDurationMs);

  if (boundaryAfterWordIndex <= 0) {
    return startTime;
  }

  if (boundaryAfterWordIndex >= tokens.length) {
    return endTime;
  }

  const token = tokens[boundaryAfterWordIndex - 1];
  const tokenEnd = token?.endSourceTimeMs;
  const tokenStart = token?.startSourceTimeMs;

  if (
    tokenEnd !== undefined &&
    tokenStart !== undefined &&
    tokenEnd >= tokenStart
  ) {
    return clampSourceTime(tokenEnd, sourceDurationMs);
  }

  return clampSourceTime(
    segmentEndMs,
    sourceDurationMs,
  );
}

function buildTranscriptSplitPiecesFromWords({
  originalSegment,
  tokens,
  sourceDurationMs,
  splitPhraseStartWordIndex,
  splitPhraseEndWordIndex,
  draftText,
  splitSourceWords,
}: {
  originalSegment: TranscriptSegment;
  tokens: TranscriptWordToken[];
  sourceDurationMs: number;
  splitPhraseStartWordIndex: number;
  splitPhraseEndWordIndex: number;
  draftText?: string;
  splitSourceWords?: unknown;
}) {
  const textSource = normalizeTranscriptSegmentText(draftText ?? originalSegment.text);
  const sourceTextWords = textSource.split(/\s+/).filter(Boolean);
  if (sourceTextWords.length === 0) {
    return [];
  }

  const clampedStart = clampNumberToRange(
    splitPhraseStartWordIndex,
    1,
    sourceTextWords.length,
  );
  const clampedEnd = clampNumberToRange(
    splitPhraseEndWordIndex,
    clampedStart,
    sourceTextWords.length,
  );

  const beforeWords = sourceTextWords.slice(0, clampedStart - 1);
  const phraseWords = sourceTextWords.slice(clampedStart - 1, clampedEnd);
  const afterWords = sourceTextWords.slice(clampedEnd);
  const segmentStart = clampSourceTime(
    originalSegment.startSourceTimeMs,
    sourceDurationMs,
  );
  const segmentEnd = clampSourceTime(originalSegment.endSourceTimeMs, sourceDurationMs);
  const splitBoundary0 = segmentStart;
  const splitBoundary3 = segmentEnd;
  const splitBoundary1 = clampBoundaryTimeFromTokens(
    splitBoundary0,
    splitBoundary3,
    tokens,
    clampedStart - 1,
    sourceDurationMs,
  );
  const splitBoundary2 = clampBoundaryTimeFromTokens(
    splitBoundary0,
    splitBoundary3,
    tokens,
    clampedEnd,
    sourceDurationMs,
  );

  const sanitizedBoundary1 = Math.max(
    splitBoundary0,
    Math.min(splitBoundary1, splitBoundary3),
  );
  const sanitizedBoundary2 = Math.max(
    sanitizedBoundary1,
    Math.min(splitBoundary2, splitBoundary3),
  );

  const pieces = [
    {
      text: beforeWords.join(" "),
      startSourceTimeMs: splitBoundary0,
      endSourceTimeMs: sanitizedBoundary1,
      include: beforeWords.length > 0,
    },
    {
      text: phraseWords.join(" "),
      startSourceTimeMs: sanitizedBoundary1,
      endSourceTimeMs: sanitizedBoundary2,
      include: phraseWords.length > 0,
    },
    {
      text: afterWords.join(" "),
      startSourceTimeMs: sanitizedBoundary2,
      endSourceTimeMs: splitBoundary3,
      include: afterWords.length > 0,
    },
  ].filter((piece) => piece.include && piece.text.trim().length > 0);

  const sourceWords =
    splitSourceWords !== undefined &&
    Array.isArray(splitSourceWords) &&
    splitSourceWords.length >= sourceTextWords.length
      ? splitSourceWords
      : undefined;

  const generatedSegments = pieces.map((piece, pieceIndex) => {
    // Keep the original id on the first emitted segment so existing references are
    // more likely to remain helpful while still generating stable ids for new splits.
    const shouldUseOriginalId = pieceIndex === 0;

    const pieceStart = clampSourceTime(piece.startSourceTimeMs, sourceDurationMs);
    const pieceEnd = clampSourceTime(piece.endSourceTimeMs, sourceDurationMs);
    if (pieceEnd <= pieceStart) {
      return null;
    }

    return {
      ...originalSegment,
      id: shouldUseOriginalId
        ? originalSegment.id
        : createTranscriptSegmentId("split"),
      startSourceTimeMs: pieceStart,
      endSourceTimeMs: pieceEnd,
      text: normalizeTranscriptSegmentText(piece.text),
      ...(sourceWords
        ? {
            words: normalizeSplitSegmentWordPayload(
              sourceWords,
              pieceIndex === 0
                ? 0
                : pieceIndex === 1
                  ? clampedStart - 1
                  : clampedEnd,
              pieceIndex === 0
                ? clampedStart - 1
                : pieceIndex === 1
                  ? clampedEnd
                  : sourceTextWords.length,
            ),
          }
        : {}),
    };
  });

  const validSegments = generatedSegments.filter(
    (segment): segment is TranscriptSegment => Boolean(segment),
  );

  return ensureTranscriptSegmentCoverage({
    originalSegment,
    segments: validSegments,
    sourceDurationMs,
  });
}

function normalizeSplitSegmentWordPayload(
  sourceWords: readonly unknown[],
  startWordIndex: number,
  endWordIndex: number,
) {
  const clampedStart = clampNumberToRange(startWordIndex, 0, sourceWords.length);
  const clampedEnd = clampNumberToRange(endWordIndex, clampedStart, sourceWords.length);
  const nextWords = sourceWords.slice(clampedStart, clampedEnd);

  if (nextWords.length === 0) {
    return undefined;
  }

  return nextWords.map((word) =>
    isRecord(word) ? { ...word } : { text: String(word) },
  ) as TranscriptSegment["words"];
}

function normalizeTranscriptSegmentWordPayload({
  segment,
  segmentText,
  editedWordIndex,
  editedWordText,
}: {
  segment: TranscriptSegment;
  segmentText: string;
  editedWordIndex?: number;
  editedWordText?: string;
}) {
  const sourceWords = getUnknownObject(segment, "words");
  if (!Array.isArray(sourceWords) || sourceWords.length === 0) {
    return undefined;
  }

  const tokens = normalizeTranscriptSegmentText(segmentText)
    .split(/\s+/)
    .filter(Boolean);
  const sourcePayload = sourceWords.map((word) => (isRecord(word) ? { ...word } : word));
  const sourceWordsLength = sourcePayload.length;

  if (editedWordIndex !== undefined) {
    if (!editedWordText || tokens.length === 0) {
      return sourcePayload as TranscriptSegment["words"];
    }

    if (sourceWordsLength === 0) {
      return sourcePayload as TranscriptSegment["words"];
    }

    const clampedIndex = clampNumberToRange(
      editedWordIndex,
      1,
      sourceWordsLength,
    );
    if (sourceWordsLength >= clampedIndex) {
      return sourcePayload.map((word, index) =>
        index === clampedIndex - 1
          ? replaceTranscriptSegmentWordPayloadText(word, editedWordText)
          : word,
      ) as TranscriptSegment["words"];
    }

    return sourcePayload as TranscriptSegment["words"];
  }

  if (sourcePayload.length !== tokens.length) {
    return sourcePayload as TranscriptSegment["words"];
  }

  return sourcePayload.map((word, index) =>
    replaceTranscriptSegmentWordPayloadText(word, tokens[index] ?? ""),
  ) as TranscriptSegment["words"];
}

function replaceTranscriptSegmentWordPayloadText(word: unknown, text: string) {
  if (!isRecord(word)) {
    return { text };
  }

  const nextWord = { ...word };
  const normalizedText = normalizeTranscriptSegmentText(text);

  if (typeof nextWord.text === "string") {
    nextWord.text = normalizedText;
  } else if (typeof nextWord.word === "string") {
    nextWord.word = normalizedText;
  } else {
    nextWord.text = normalizedText;
  }

  return nextWord;
}

function ensureTranscriptSegmentCoverage({
  originalSegment,
  segments,
  sourceDurationMs,
}: {
  originalSegment: TranscriptSegment;
  segments: TranscriptSegment[];
  sourceDurationMs: number;
}) {
  if (segments.length === 0) {
    return [];
  }

  const sorted = [...segments].sort(
    (left, right) =>
      left.startSourceTimeMs - right.startSourceTimeMs ||
      left.endSourceTimeMs - right.endSourceTimeMs,
  );
  const normalized = sorted.map((segment) => ({
    ...segment,
    startSourceTimeMs: clampSourceTime(segment.startSourceTimeMs, sourceDurationMs),
    endSourceTimeMs: clampSourceTime(segment.endSourceTimeMs, sourceDurationMs),
  }));

  let runningStart = clampSourceTime(originalSegment.startSourceTimeMs, sourceDurationMs);
  let runningEnd = clampSourceTime(originalSegment.endSourceTimeMs, sourceDurationMs);
  if (runningStart >= runningEnd) {
    return [];
  }

  const covered = normalized
    .filter((segment) => segment.endSourceTimeMs > segment.startSourceTimeMs)
    .map((segment) => ({
      ...segment,
      startSourceTimeMs: clampSourceTime(
        Math.max(segment.startSourceTimeMs, runningStart),
        sourceDurationMs,
      ),
    }))
    .filter((segment) => segment.endSourceTimeMs > segment.startSourceTimeMs);

  if (covered.length > 1) {
    for (let index = 1; index < covered.length; index += 1) {
      const previous = covered[index - 1];
      const current = covered[index];
      if (!current) {
        continue;
      }

      if (current.startSourceTimeMs < previous.endSourceTimeMs) {
        current.startSourceTimeMs = previous.endSourceTimeMs;
      }

      if (current.startSourceTimeMs >= current.endSourceTimeMs) {
        current.startSourceTimeMs = previous.endSourceTimeMs;
      }
    }
  }

  const first = covered[0];
  const last = covered[covered.length - 1];
  if (first) {
    first.startSourceTimeMs = runningStart;
  }
  if (last) {
    last.endSourceTimeMs = runningEnd;
  }

  return covered.filter((segment) => segment.endSourceTimeMs > segment.startSourceTimeMs);
}

function buildTranscriptSegmentsAfterSplit(
  segments: readonly TranscriptSegment[],
  sourceSegmentId: string,
  replacementSegments: readonly TranscriptSegment[],
) {
  const sourceIndex = segments.findIndex(
    (segment) => segment.id === sourceSegmentId,
  );
  if (sourceIndex === -1) {
    return null;
  }

  return [
    ...segments.slice(0, sourceIndex),
    ...replacementSegments,
    ...segments.slice(sourceIndex + 1),
  ];
}

function normalizeTranscriptSegmentsForTimeline(
  segments: readonly TranscriptSegment[],
  sourceDurationMs: number,
) {
  const sorted = sortTranscriptSegments(segments);
  const normalizedSegments: TranscriptSegment[] = [];

  let nextStartTimeMs = 0;

  for (const segment of sorted) {
    const nextStart = clampSourceTime(segment.startSourceTimeMs, sourceDurationMs);
    const nextEnd = clampSourceTime(segment.endSourceTimeMs, sourceDurationMs);

    if (nextEnd <= nextStart) {
      continue;
    }

    const normalizedStart = Math.max(nextStart, nextStartTimeMs);
    if (normalizedStart >= nextEnd) {
      continue;
    }

    normalizedSegments.push({
      ...segment,
      startSourceTimeMs: normalizedStart,
      endSourceTimeMs: nextEnd,
    });
    nextStartTimeMs = nextEnd;
  }

  return normalizedSegments;
}

function restoreTranscriptSegmentBasedCandidates(
  candidates: readonly ClipCandidate[],
  sourceSegment: TranscriptSegment,
  replacementSegments: readonly TranscriptSegment[],
  splitStartTimeMs: number,
  splitEndTimeMs: number,
): ClipCandidate[] {
  const normalizedSplitStart = Math.min(splitStartTimeMs, splitEndTimeMs);
  const normalizedSplitEnd = Math.max(splitStartTimeMs, splitEndTimeMs);

  return candidates.map((candidate) => {
    if (
      candidate.source !== "transcript_segment" ||
      candidate.sourceId !== sourceSegment.id
    ) {
      return candidate;
    }

    const overlaps = replacementSegments.filter(
      (segment) =>
        segment.startSourceTimeMs < candidate.endSourceTimeMs &&
        segment.endSourceTimeMs > candidate.startSourceTimeMs,
    );

    if (overlaps.length === 0) {
      if (
        candidate.endSourceTimeMs <= normalizedSplitStart ||
        candidate.startSourceTimeMs >= normalizedSplitEnd
      ) {
        return candidate;
      }

      return {
        ...candidate,
        sourceId: `${sourceSegment.id}:split`,
      };
    }

    if (overlaps.length === 1) {
      return {
        ...candidate,
        sourceId: overlaps[0]?.id,
      };
    }

    return {
      ...candidate,
      sourceId: `${sourceSegment.id}:split:${overlaps
        .map((segment) => segment.id)
        .join(",")}`,
    };
  });
}

function shiftClipCandidatesAfterTranscriptDurationChange(
  candidates: readonly ClipCandidate[],
  anchorSourceTimeMs: number,
  durationDeltaMs: number,
  sourceDurationMs: number,
): ClipCandidate[] {
  if (!durationDeltaMs || !Number.isFinite(durationDeltaMs)) {
    return [...candidates];
  }

  const clampedAnchor = Math.max(0, anchorSourceTimeMs);
  return candidates.map((candidate) => {
    if (candidate.endSourceTimeMs <= clampedAnchor) {
      return candidate;
    }

    const originalDurationMs = candidate.endSourceTimeMs - candidate.startSourceTimeMs;
    const startSourceTimeMs = clampSourceTime(
      candidate.startSourceTimeMs + durationDeltaMs,
      sourceDurationMs,
    );
    const shiftedEndSourceTimeMs = clampSourceTime(
      candidate.endSourceTimeMs + durationDeltaMs,
      sourceDurationMs,
    );
    const endSourceTimeMs =
      shiftedEndSourceTimeMs > startSourceTimeMs
        ? shiftedEndSourceTimeMs
        : clampSourceTime(
            startSourceTimeMs + originalDurationMs,
            sourceDurationMs,
          ) || sourceDurationMs;

    return {
      ...candidate,
      startSourceTimeMs,
      endSourceTimeMs,
      updatedAt: new Date().toISOString(),
    };
  });
}

function shiftTimelineEditorClipsAfterTranscriptDurationChange(
  clips: readonly EditorTimelineClip[],
  anchorSourceTimeMs: number,
  durationDeltaMs: number,
  sourceDurationMs: number,
) {
  if (!durationDeltaMs || !Number.isFinite(durationDeltaMs)) {
    return [...clips];
  }

  const clampedAnchor = clampSourceTime(anchorSourceTimeMs, sourceDurationMs);
  return clips.map((clip) => {
    if (clip.endSourceTimeMs <= clampedAnchor) {
      return clip;
    }

    const originalDurationMs = clip.endSourceTimeMs - clip.startSourceTimeMs;
    const startSourceTimeMs = clampSourceTime(
      clip.startSourceTimeMs + durationDeltaMs,
      sourceDurationMs,
    );
    const shiftedEndSourceTimeMs = clampSourceTime(
      clip.endSourceTimeMs + durationDeltaMs,
      sourceDurationMs,
    );
    const endSourceTimeMs =
      shiftedEndSourceTimeMs > startSourceTimeMs
        ? shiftedEndSourceTimeMs
        : clampSourceTime(
            startSourceTimeMs + originalDurationMs,
            sourceDurationMs,
          ) || sourceDurationMs;

    return {
      ...clip,
      startSourceTimeMs,
      endSourceTimeMs,
      updatedAt: new Date().toISOString(),
    };
  });
}

function shiftTimelineMarkersAfterTranscriptDurationChange(
  markers: readonly TimelineMarker[],
  anchorSourceTimeMs: number,
  durationDeltaMs: number,
  sourceDurationMs: number,
) {
  if (!durationDeltaMs || !Number.isFinite(durationDeltaMs)) {
    return [...markers];
  }

  const clampedAnchor = clampSourceTime(anchorSourceTimeMs, sourceDurationMs);
  return markers.map((marker) => {
    if (marker.sourceTimeMs <= clampedAnchor) {
      return marker;
    }

    return {
      ...marker,
      sourceTimeMs: clampSourceTime(marker.sourceTimeMs + durationDeltaMs, sourceDurationMs),
    };
  });
}

function shiftDecisionEventsAfterTranscriptDurationChange(
  events: readonly DecisionEvent[],
  anchorSourceTimeMs: number,
  durationDeltaMs: number,
  sourceDurationMs: number,
) {
  if (!durationDeltaMs || !Number.isFinite(durationDeltaMs)) {
    return [...events];
  }

  const clampedAnchor = clampSourceTime(anchorSourceTimeMs, sourceDurationMs);
  return events.map((event) =>
    event.sourceTimeMs <= clampedAnchor
      ? event
      : {
          ...event,
          sourceTimeMs: clampSourceTime(
            event.sourceTimeMs + durationDeltaMs,
            sourceDurationMs,
          ),
        },
  );
}

function shiftRangeSelectionAfterTranscriptDurationChange(
  rangeSelection: RangeSelection,
  anchorSourceTimeMs: number,
  durationDeltaMs: number,
  sourceDurationMs: number,
) {
  if (!durationDeltaMs || !Number.isFinite(durationDeltaMs)) {
    return rangeSelection;
  }

  const clampedAnchor = clampSourceTime(anchorSourceTimeMs, sourceDurationMs);
  const nextStartSourceTimeMs =
    rangeSelection.startSourceTimeMs === undefined ||
    rangeSelection.startSourceTimeMs <= clampedAnchor
      ? rangeSelection.startSourceTimeMs
      : clampSourceTime(rangeSelection.startSourceTimeMs + durationDeltaMs, sourceDurationMs);

  const nextEndSourceTimeMs =
    rangeSelection.endSourceTimeMs === undefined ||
    rangeSelection.endSourceTimeMs <= clampedAnchor
      ? rangeSelection.endSourceTimeMs
      : clampSourceTime(rangeSelection.endSourceTimeMs + durationDeltaMs, sourceDurationMs);

  return {
    ...rangeSelection,
    ...(nextStartSourceTimeMs === undefined
      ? {}
      : { startSourceTimeMs: nextStartSourceTimeMs }),
    ...(nextEndSourceTimeMs === undefined
      ? {}
      : { endSourceTimeMs: nextEndSourceTimeMs }),
  };
}

function buildTimedTranscriptWords(
  segments: readonly TranscriptSegment[],
  sourceDurationMs: number,
) {
  return segments.flatMap((segment, segmentIndex) => {
    const segmentStart = clampSourceTime(
      segment.startSourceTimeMs,
      sourceDurationMs,
    );
    const segmentEnd = clampSourceTime(segment.endSourceTimeMs, sourceDurationMs);

    if (segmentEnd <= segmentStart) {
      return [];
    }

    const sourceWords = extractSegmentWords(segment, sourceDurationMs);

    if (sourceWords.length === 0) {
      const fallbackTokens = segment.text.split(/\s+/).filter(Boolean);

      if (fallbackTokens.length === 0) {
        return [];
      }

      const tokenDurationMs =
        (segmentEnd - segmentStart) / fallbackTokens.length;

      if (!Number.isFinite(tokenDurationMs) || tokenDurationMs <= 0) {
        return fallbackTokens.map((text, index) => ({
          id: `${segment.id}:word:${segmentIndex}:${index}`,
          segmentId: segment.id,
          text,
          speaker: segment.speaker,
          speakerRole: segment.speakerRole,
          startSourceTimeMs: segmentStart,
          endSourceTimeMs: segmentEnd,
        }));
      }

      return fallbackTokens.map((text, index) => {
        const fallbackStart = segmentStart + tokenDurationMs * index;
        const fallbackEnd = segmentStart + tokenDurationMs * (index + 1);

        return {
          id: `${segment.id}:word:${segmentIndex}:${index}`,
          segmentId: segment.id,
          text,
          speaker: segment.speaker,
          speakerRole: segment.speakerRole,
          startSourceTimeMs: clampSourceTime(fallbackStart, sourceDurationMs),
          endSourceTimeMs: clampSourceTime(fallbackEnd, sourceDurationMs),
        };
      });
    }

    const normalized = sourceWords.map((sourceWord) => ({
      ...sourceWord,
      startSourceTimeMs: clampSourceTime(
        sourceWord.startSourceTimeMs,
        sourceDurationMs,
      ),
      endSourceTimeMs: clampSourceTime(sourceWord.endSourceTimeMs, sourceDurationMs),
    }));

    const wordsByTime = normalized.sort((left, right) => {
      const diff = left.startSourceTimeMs - right.startSourceTimeMs;

      if (diff !== 0) {
        return diff;
      }

      return left.id.localeCompare(right.id);
    });

    return wordsByTime.map((word, index, words) => {
      const endTime =
        word.endSourceTimeMs > word.startSourceTimeMs
          ? word.endSourceTimeMs
          : clampSourceTime(
              words[index + 1]?.startSourceTimeMs ?? segmentEnd,
              sourceDurationMs,
            );

      return {
        ...word,
        speaker: segment.speaker,
        speakerRole: segment.speakerRole,
        segmentId: segment.id,
        startSourceTimeMs: clampSourceTime(
          word.startSourceTimeMs,
          sourceDurationMs,
        ),
        endSourceTimeMs: clampSourceTime(endTime, sourceDurationMs),
      };
    });
  });
}

function extractSegmentWords(
  segment: TranscriptSegment,
  sourceDurationMs: number,
) {
  const rawWords = getUnknownObject(segment, "words");
  const segmentStart = segment.startSourceTimeMs;
  const segmentEnd = segment.endSourceTimeMs;

  if (!Array.isArray(rawWords)) {
    return [];
  }

  const startKeys = ["start", "startMs", "start_ms", "startTime", "startTimeMs"];
  const endKeys = ["end", "endMs", "end_ms", "endTime", "endTimeMs"];

  const entries = rawWords
    .map((word, index): Omit<
      TimedTranscriptWord,
      "speaker" | "speakerRole" | "segmentId"
    > | null => {
      if (typeof word !== "object" || word === null) {
        return null;
      }

      const text = extractWordText(word as Record<string, unknown>);

      if (!text) {
        return null;
      }

      const rawStart = extractWordNumber(
        word as Record<string, unknown>,
        startKeys,
      );
      const rawEnd = extractWordNumber(word as Record<string, unknown>, endKeys);
      const parsedStart = normalizeTranscriptTimestamp(
        rawStart,
        segmentStart,
        segmentEnd,
        sourceDurationMs,
      );
      const parsedEnd = normalizeTranscriptTimestamp(
        rawEnd,
        segmentStart,
        segmentEnd,
        sourceDurationMs,
      );

      const startSourceTimeMs =
        parsedStart ?? segmentStart + ((segmentEnd - segmentStart) / rawWords.length) * index;

      return {
        id: `${segment.id}:word:${segmentStart}-${index}`,
        text,
        startSourceTimeMs,
        endSourceTimeMs: parsedEnd ?? startSourceTimeMs,
      };
    })
    .filter((word): word is Omit<TimedTranscriptWord, "speaker" | "speakerRole" | "segmentId"> =>
      Boolean(word),
    );

  const dedup = entries.filter((entry, index, list) => {
    if (index === 0) {
      return true;
    }

    return entry.startSourceTimeMs !== list[index - 1].startSourceTimeMs;
  });

  return dedup;
}

function extractWordText(word: Record<string, unknown>) {
  return parseTextField(word, ["text", "word", "token", "value", "w"]);
}

function extractWordNumber(
  word: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const rawValue = parseNumericField(word[key]);

    if (rawValue !== undefined) {
      return rawValue;
    }
  }

  return undefined;
}

function parseNumericField(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeTranscriptTimestamp(
  value: number | undefined,
  segmentStart: number,
  segmentEnd: number,
  sourceDurationMs: number,
) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value <= 120 ? value * 1000 : value;
  const clamped = clampSourceTime(normalized, sourceDurationMs);

  if (clamped < segmentStart || clamped > segmentEnd + 1000) {
    return undefined;
  }

  return clamped;
}

function parseTextField(
  candidate: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = candidate[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function getTranscriptWordIndexAtSourceTime(
  words: readonly TimedTranscriptWord[],
  sourceTimeMs: number,
) {
  if (words.length === 0) {
    return -1;
  }

  if (sourceTimeMs < words[0].startSourceTimeMs) {
    return 0;
  }

  if (sourceTimeMs >= words[words.length - 1].startSourceTimeMs) {
    return words.length - 1;
  }

  let low = 0;
  let high = words.length - 1;
  let bestIndex = -1;

  while (low <= high) {
    const middle = low + ((high - low) >> 1);
    const middleWord = words[middle];

    if (!middleWord) {
      break;
    }

    if (middleWord.startSourceTimeMs <= sourceTimeMs) {
      bestIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return bestIndex;
}

function chooseAudioWaveformChannel(audioBuffer: AudioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const channelLength = audioBuffer.getChannelData(0).length;

  if (channelCount === 1) {
    return audioBuffer.getChannelData(0);
  }

  const mixed = new Float32Array(channelLength);

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channelData = audioBuffer.getChannelData(
      Math.min(channelIndex, channelCount - 1),
    );

    for (let sampleIndex = 0; sampleIndex < channelLength; sampleIndex += 1) {
      mixed[sampleIndex] += Math.abs(channelData[sampleIndex] || 0);
    }
  }

  for (let sampleIndex = 0; sampleIndex < channelLength; sampleIndex += 1) {
    mixed[sampleIndex] /= channelCount;
  }

  return mixed;
}

function downsampleWaveformPeaks(
  samples: Float32Array,
  targetLength: number,
) {
  if (samples.length === 0 || targetLength <= 0) {
    return [];
  }

  const peaks = new Array<number>(targetLength);
  const sampleLength = samples.length;
  const bucketSize = sampleLength / targetLength;

  for (let index = 0; index < targetLength; index += 1) {
    const start = Math.floor(index * bucketSize);
    const end = Math.min(sampleLength, Math.floor((index + 1) * bucketSize));
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const magnitude = Math.abs(samples[sampleIndex] ?? 0);
      if (magnitude > peak) {
        peak = magnitude;
      }
    }

    peaks[index] = Math.min(1, Math.max(0, peak));
  }

  return peaks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getUnknownObject(value: unknown, key: string) {
  if (
    typeof value !== "object" ||
    value === null ||
    !(key in value) ||
    !(key in value) ||
    typeof (value as Record<string, unknown>)[key] === "undefined"
  ) {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function buildTranscriptCleanupSuggestions({
  review,
  transcript,
}: {
  review: TranscriptReview;
  transcript: EpisodeTranscript | null;
}): TranscriptCleanupSuggestion[] {
  const segmentsById = new Map(
    (transcript?.segments ?? []).map((segment) => [segment.id, segment]),
  );

  return review.tasks.flatMap((task, taskIndex) => {
    const operations = [
      ...(task.suggestedOperation ? [task.suggestedOperation] : []),
      ...(task.suggestedOperations ?? []),
    ];

    if (operations.length === 0) {
      return [];
    }

    const segment = task.segmentId
      ? segmentsById.get(task.segmentId)
      : undefined;
    const firstOperation = operations[0];
    const confidence =
      "confidence" in firstOperation ? firstOperation.confidence : undefined;
    const reason = "reason" in firstOperation ? firstOperation.reason : undefined;

    return [
      {
        id: `${task.kind}-${task.segmentId ?? task.startSourceTimeMs ?? taskIndex}`,
        priority: task.priority,
        kind: formatTranscriptCleanupKind(task.kind),
        message: task.message,
        ...(task.segmentId ? { segmentId: task.segmentId } : {}),
        ...(segment?.speaker ? { speaker: segment.speaker } : {}),
        ...(segment?.text ? { text: truncateText(segment.text, 220) } : {}),
        ...(task.startSourceTimeMs !== undefined
          ? { startSourceTimeMs: task.startSourceTimeMs }
          : {}),
        ...(task.endSourceTimeMs !== undefined
          ? { endSourceTimeMs: task.endSourceTimeMs }
          : {}),
        ...(confidence !== undefined ? { confidence } : {}),
        ...(reason ? { reason } : {}),
        operations: operations.map((operation) => ({ ...operation })),
      },
    ];
  });
}

function formatTranscriptCleanupKind(kind: string) {
  return kind
    .replace(/^transcript_/, "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clampSourceTime(sourceTimeMs: number, sourceDurationMs: number) {
  return Math.min(sourceDurationMs, Math.max(0, sourceTimeMs));
}

function normalizeTimelineClipRange(
  startSourceTimeMs: number,
  endSourceTimeMs: number,
  sourceDurationMs: number,
  minDurationMs: number,
) {
  const clampedStart = clampSourceTime(startSourceTimeMs, sourceDurationMs);
  const clampedEnd = clampSourceTime(endSourceTimeMs, sourceDurationMs);
  const effectiveMinDurationMs = Math.min(
    minDurationMs,
    Math.max(0, sourceDurationMs),
  );
  const clampedStartWithDuration = Math.min(
    clampedStart,
    clampedEnd - effectiveMinDurationMs,
  );
  const normalizedStartSourceTimeMs = clampSourceTime(
    clampedStartWithDuration,
    sourceDurationMs,
  );
  const normalizedEndSourceTimeMs = clampSourceTime(
    Math.max(normalizedStartSourceTimeMs + effectiveMinDurationMs, clampedEnd),
    sourceDurationMs,
  );

  return {
    startSourceTimeMs: normalizedStartSourceTimeMs,
    endSourceTimeMs: normalizedEndSourceTimeMs,
  };
}

function sortEditorTimelineClips(clips: readonly EditorTimelineClip[]) {
  return [...clips].sort(
    (left, right) =>
      TIMELINE_EDITOR_TRACKS.findIndex((track) => track.id === left.trackId) -
        TIMELINE_EDITOR_TRACKS.findIndex((track) => track.id === right.trackId) ||
      left.startSourceTimeMs - right.startSourceTimeMs ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function getTimelineFrameDurationMs(frameRate: number) {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    return 1000 / 29.97;
  }

  return 1000 / frameRate;
}

function snapTimelineSourceTime(
  sourceTimeMs: number,
  snapToFrame: boolean,
  frameRate: number,
) {
  if (!snapToFrame) {
    return sourceTimeMs;
  }

  const frameDurationMs = getTimelineFrameDurationMs(frameRate);
  return Math.round(sourceTimeMs / frameDurationMs) * frameDurationMs;
}

function sortTimelineMarkers(markers: readonly TimelineMarker[]) {
  return [...markers].sort(
    (left, right) =>
      left.sourceTimeMs - right.sourceTimeMs ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function normalizeRangeSelection(
  rangeSelection: RangeSelection,
  sourceDurationMs: number,
): NormalizedRangeSelection | null {
  if (
    rangeSelection.startSourceTimeMs === undefined ||
    rangeSelection.endSourceTimeMs === undefined
  ) {
    return null;
  }

  const start = clampSourceTime(
    rangeSelection.startSourceTimeMs,
    sourceDurationMs,
  );
  const end = clampSourceTime(rangeSelection.endSourceTimeMs, sourceDurationMs);

  if (start === end) {
    return null;
  }

  return {
    startSourceTimeMs: Math.min(start, end),
    endSourceTimeMs: Math.max(start, end),
  };
}

function findNextTimelineMarker(
  markers: readonly TimelineMarker[],
  sourceTimeMs: number,
) {
  return sortTimelineMarkers(markers).find(
    (marker) => marker.sourceTimeMs > sourceTimeMs,
  );
}

function hasMarkerRangeAroundPlayhead(
  markers: readonly TimelineMarker[],
  sourceTimeMs: number,
) {
  return Boolean(
    markers.some((marker) => marker.sourceTimeMs <= sourceTimeMs) &&
      markers.some((marker) => marker.sourceTimeMs > sourceTimeMs),
  );
}

function sortClipCandidates(candidates: readonly ClipCandidate[]) {
  return [...candidates].sort(
    (left, right) =>
      left.startSourceTimeMs - right.startSourceTimeMs ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function getTimelinePercent(sourceTimeMs: number, sourceDurationMs: number) {
  if (sourceDurationMs <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (sourceTimeMs / sourceDurationMs) * 100));
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

function loadStoredEpisodeTranscript() {
  try {
    const rawValue = localStorage.getItem(EPISODE_TRANSCRIPT_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    const result = parseEpisodeTranscriptPayload(parsedValue);

    return result.ok ? normalizeEpisodeTranscriptSpeakerTags(result.transcript) : null;
  } catch {
    return null;
  }
}

function saveStoredEpisodeTranscript(transcript: EpisodeTranscript | null) {
  try {
    if (!transcript) {
      localStorage.removeItem(EPISODE_TRANSCRIPT_STORAGE_KEY);
      return;
    }

    localStorage.setItem(EPISODE_TRANSCRIPT_STORAGE_KEY, JSON.stringify(transcript));
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

    if (isStoredLegacyDecisionHistory(parsedValue)) {
      return migrateLegacyDecisionHistory(parsedValue);
    }

    const normalized = parseStoredDecisionHistory(parsedValue);

    if (!normalized) {
      return createEmptyDecisionHistory();
    }

    return normalized;
  } catch {
    return createEmptyDecisionHistory();
  }
}

function saveStoredDecisionHistory(history: DecisionHistoryState) {
  try {
    localStorage.setItem(
      DECISION_HISTORY_STORAGE_KEY,
      JSON.stringify({
        rootState: {
          decisionEvents: cloneDecisionEvents(history.rootState.decisionEvents),
          timelineEditorClips: cloneEditorTimelineClips(
            history.rootState.timelineEditorClips,
          ),
        },
        currentNodeId: history.currentNodeId,
        nodes: Object.fromEntries(
          Object.entries(history.nodes).map(([nodeId, node]) => [
            nodeId,
            {
              ...node,
              childrenIds: [...node.childrenIds],
              operation: node.operation
                ? {
                    ...node.operation,
                    beforeDecisionEvents: cloneDecisionEvents(
                      node.operation.beforeDecisionEvents,
                    ),
                    afterDecisionEvents: cloneDecisionEvents(
                      node.operation.afterDecisionEvents,
                    ),
                    beforeTimelineEditorClips: cloneEditorTimelineClips(
                      node.operation.beforeTimelineEditorClips,
                    ),
                    afterTimelineEditorClips: cloneEditorTimelineClips(
                      node.operation.afterTimelineEditorClips,
                    ),
                  }
                : undefined,
            },
          ]),
        ),
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

function getEpisodeSetupBoardStorageKey(roomSelection: StudioCutRoomSelection) {
  return `${roomSelection.projectId}/${roomSelection.branchId}`;
}

function createEmptyEpisodeSetupBoard(): EpisodeSetupBoard {
  return {
    episodeTitle: "",
    guests: [],
    links: [],
    scriptNotes: "",
    teleprompterNotes: "",
    plannedClipBeats: [],
    assetChecklist: [],
  };
}

function normalizeTextLines(values: readonly string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function sanitizeEpisodeSetupBoardValues(
  board: EpisodeSetupBoard,
): EpisodeSetupBoard {
  return {
    episodeTitle: board.episodeTitle.trim(),
    guests: normalizeTextLines(board.guests),
    links: normalizeTextLines(board.links),
    scriptNotes: board.scriptNotes.trim(),
    teleprompterNotes: board.teleprompterNotes.trim(),
    plannedClipBeats: normalizeTextLines(board.plannedClipBeats),
    assetChecklist: normalizeTextLines(board.assetChecklist),
  };
}

function splitLinesForBoard(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function loadStoredEpisodeSetupBoard(
  roomSelection: StudioCutRoomSelection,
): EpisodeSetupBoard {
  try {
    const rawValue = localStorage.getItem(EPISODE_SETUP_BOARD_STORAGE_KEY);

    if (!rawValue) {
      return createEmptyEpisodeSetupBoard();
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    const key = getEpisodeSetupBoardStorageKey(roomSelection);
    const record =
      parsedValue &&
      typeof parsedValue === "object" &&
      (parsedValue as Record<string, unknown>)[key];

    if (!isStoredEpisodeSetupBoard(record)) {
      return createEmptyEpisodeSetupBoard();
    }

    return sanitizeEpisodeSetupBoardValues(record);
  } catch {
    return createEmptyEpisodeSetupBoard();
  }
}

function saveStoredEpisodeSetupBoard(
  roomSelection: StudioCutRoomSelection,
  board: EpisodeSetupBoard,
) {
  try {
    const key = getEpisodeSetupBoardStorageKey(roomSelection);
    const rawValue = localStorage.getItem(EPISODE_SETUP_BOARD_STORAGE_KEY);
    const existing = (() => {
      if (!rawValue) {
        return {} as Record<string, EpisodeSetupBoard>;
      }

      const parsedValue = JSON.parse(rawValue) as unknown;

      if (!isEpisodeSetupBoardCollection(parsedValue)) {
        return {} as Record<string, EpisodeSetupBoard>;
      }

      return parsedValue;
    })();

    localStorage.setItem(
      EPISODE_SETUP_BOARD_STORAGE_KEY,
      JSON.stringify({
        ...existing,
        [key]: sanitizeEpisodeSetupBoardValues(board),
      }),
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function isEpisodeSetupBoardCollection(
  value: unknown,
): value is Record<string, EpisodeSetupBoard> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(
    isStoredEpisodeSetupBoard,
  );
}

function isStoredEpisodeSetupBoard(
  value: unknown,
): value is EpisodeSetupBoard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as EpisodeSetupBoard;

  return (
    typeof candidate.episodeTitle === "string" &&
    Array.isArray(candidate.guests) &&
    candidate.guests.every((value) => typeof value === "string") &&
    Array.isArray(candidate.links) &&
    candidate.links.every((value) => typeof value === "string") &&
    typeof candidate.scriptNotes === "string" &&
    typeof candidate.teleprompterNotes === "string" &&
    Array.isArray(candidate.plannedClipBeats) &&
    candidate.plannedClipBeats.every((value) => typeof value === "string") &&
    Array.isArray(candidate.assetChecklist) &&
    candidate.assetChecklist.every((value) => typeof value === "string")
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
      .map((candidate) => normalizeLocalDecisionCheckpoint(candidate))
      .filter((checkpoint): checkpoint is LocalDecisionCheckpoint => checkpoint !== null)
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

function loadStoredTimelineMarkers(): TimelineMarker[] {
  try {
    const rawValue = localStorage.getItem(TIMELINE_MARKERS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return sortTimelineMarkers(parsedValue.filter(isTimelineMarker)).slice(
      0,
      MAX_TIMELINE_MARKERS,
    );
  } catch {
    return [];
  }
}

function loadStoredEditorTimelineClips(): EditorTimelineClip[] {
  try {
    const rawValue = localStorage.getItem(TIMELINE_EDITOR_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return sortEditorTimelineClips(
      parsedValue.filter(isEditorTimelineClip),
    ).slice(0, MAX_EDITOR_TIMELINE_CLIPS);
  } catch {
    return [];
  }
}

function saveStoredTimelineMarkers(markers: readonly TimelineMarker[]) {
  try {
    localStorage.setItem(
      TIMELINE_MARKERS_STORAGE_KEY,
      JSON.stringify(sortTimelineMarkers(markers).slice(0, MAX_TIMELINE_MARKERS)),
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function saveStoredEditorTimelineClips(clips: readonly EditorTimelineClip[]) {
  try {
    localStorage.setItem(
      TIMELINE_EDITOR_STORAGE_KEY,
      JSON.stringify(
        sortEditorTimelineClips(clips).slice(0, MAX_EDITOR_TIMELINE_CLIPS),
      ),
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function loadStoredClipCandidates(): ClipCandidate[] {
  try {
    const rawValue = localStorage.getItem(CLIP_CANDIDATES_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return sortClipCandidates(parsedValue.filter(isClipCandidate)).slice(
      0,
      MAX_CLIP_CANDIDATES,
    );
  } catch {
    return [];
  }
}

function saveStoredClipCandidates(candidates: readonly ClipCandidate[]) {
  try {
    localStorage.setItem(
      CLIP_CANDIDATES_STORAGE_KEY,
      JSON.stringify(
        sortClipCandidates(candidates).slice(0, MAX_CLIP_CANDIDATES),
      ),
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function createEmptyDecisionHistory(): DecisionHistoryState {
  return {
    rootState: {
      decisionEvents: [],
      timelineEditorClips: [],
    },
    currentNodeId: "",
    nodes: {},
    lastAction: "",
  };
}

function isStoredDecisionHistory(value: unknown): value is DecisionHistoryState {
  return parseStoredDecisionHistory(value) !== null;
}

function parseStoredDecisionHistory(
  value: unknown,
): DecisionHistoryState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.currentNodeId !== "string") {
    return null;
  }

  if (typeof candidate.lastAction !== "string") {
    return null;
  }

  if (!candidate.nodes || typeof candidate.nodes !== "object") {
    return null;
  }

  const nodes = normalizeStoredDecisionHistoryNodes(
    candidate.nodes as Record<string, unknown>,
  );
  if (!nodes) {
    return null;
  }

  const currentNode = nodes[candidate.currentNodeId];
  if (!currentNode) {
    return null;
  }

  const rootState =
    parseDecisionHistoryRootState(candidate.rootState) ??
    inferDecisionHistoryRootState(candidate.nodes as Record<string, unknown>, nodes);
  if (!rootState) {
    return null;
  }

  const history: DecisionHistoryState = {
    rootState,
    currentNodeId: candidate.currentNodeId,
    nodes,
    lastAction: candidate.lastAction,
  };

  if (!isDecisionHistoryPathValid(history)) {
    return null;
  }

  return history;
}

function isDecisionHistoryPathValid(history: DecisionHistoryState): boolean {
  const targetNode = history.nodes[history.currentNodeId];
  if (!targetNode) {
    return false;
  }

  const visited = new Set<string>();
  let currentNode: DecisionHistoryNode | null = targetNode;

  while (currentNode) {
    if (visited.has(currentNode.id)) {
      return false;
    }
    visited.add(currentNode.id);

    if (currentNode.parentId === null) {
      return true;
    }

    currentNode = history.nodes[currentNode.parentId] ?? null;
  }

  return false;
}

function parseDecisionHistoryRootState(
  value: unknown,
): DecisionHistoryRootState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as DecisionHistoryRootState;

  if (
    !Array.isArray(candidate.decisionEvents) ||
    !candidate.decisionEvents.every(isDecisionEvent) ||
    !Array.isArray(candidate.timelineEditorClips) ||
    !candidate.timelineEditorClips.every(isEditorTimelineClip)
  ) {
    return null;
  }

  return {
    decisionEvents: cloneDecisionEvents(candidate.decisionEvents),
    timelineEditorClips: cloneEditorTimelineClips(
      candidate.timelineEditorClips,
    ),
  };
}

function inferDecisionHistoryRootState(
  rawNodes: Record<string, unknown>,
  nodes: Record<string, DecisionHistoryNode>,
): DecisionHistoryRootState | null {
  const rootNodeEntries = Object.entries(nodes).filter(
    ([, node]) => node.parentId === null,
  );

  for (const [nodeId, node] of rootNodeEntries) {
    const rawNode = rawNodes[nodeId];
    if (rawNode && typeof rawNode === "object") {
      const rawNodeCandidate = rawNode as {
        decisionEvents?: unknown;
        timelineEditorClips?: unknown;
        operation?: unknown;
      };

      if (
        Array.isArray(rawNodeCandidate.decisionEvents) &&
        rawNodeCandidate.decisionEvents.every(isDecisionEvent) &&
        Array.isArray(rawNodeCandidate.timelineEditorClips) &&
        rawNodeCandidate.timelineEditorClips.every(isEditorTimelineClip)
      ) {
        return {
          decisionEvents: cloneDecisionEvents(
            rawNodeCandidate.decisionEvents as DecisionEvent[],
          ),
          timelineEditorClips: cloneEditorTimelineClips(
            rawNodeCandidate.timelineEditorClips as EditorTimelineClip[],
          ),
        };
      }

      if (
        node.operation &&
        Array.isArray(node.operation.beforeDecisionEvents) &&
        Array.isArray(node.operation.beforeTimelineEditorClips)
      ) {
        return {
          decisionEvents: cloneDecisionEvents(
            node.operation.beforeDecisionEvents,
          ),
          timelineEditorClips: cloneEditorTimelineClips(
            node.operation.beforeTimelineEditorClips,
          ),
        };
      }
    }

    if (node.operation) {
      return {
        decisionEvents: cloneDecisionEvents(node.operation.beforeDecisionEvents),
        timelineEditorClips: cloneEditorTimelineClips(
          node.operation.beforeTimelineEditorClips,
        ),
      };
    }
  }

  return null;
}

function normalizeStoredDecisionHistoryNodes(
  value: Record<string, unknown>,
): Record<string, DecisionHistoryNode> | null {
  const nodes: Record<string, DecisionHistoryNode> = {};

  for (const [nodeId, rawNode] of Object.entries(value)) {
    const parsedNode = normalizeStoredDecisionHistoryNode(
      rawNode,
      nodeId,
    );

    if (!parsedNode) {
      return null;
    }

    nodes[nodeId] = parsedNode;
  }

  return nodes;
}

function normalizeStoredDecisionHistoryNode(
  value: unknown,
  expectedNodeId: string,
): DecisionHistoryNode | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string") {
    return null;
  }

  const childrenIds = Array.isArray(candidate.childrenIds)
    ? candidate.childrenIds.filter((id) => typeof id === "string")
    : [];

  const nodeId = candidate.id === "" ? expectedNodeId : candidate.id;
  if (nodeId !== expectedNodeId) {
    return null;
  }

  const rawOperation = candidate.operation;
  const operation =
    parseDecisionHistoryMutation(rawOperation, {
      id: candidate.id,
      label:
        typeof candidate.label === "string" ? candidate.label : "Recovered state",
      createdAt:
        typeof candidate.createdAt === "string"
          ? candidate.createdAt
          : new Date().toISOString(),
    }) ??
    (candidate.parentId !== null &&
    Array.isArray(candidate.decisionEvents) &&
    candidate.decisionEvents.every(isDecisionEvent) &&
    Array.isArray(candidate.timelineEditorClips) &&
    candidate.timelineEditorClips.every(isEditorTimelineClip)
      ? {
          id: candidate.id,
          label:
            typeof candidate.label === "string"
              ? candidate.label
              : "Recovered state",
          createdAt:
            typeof candidate.createdAt === "string"
              ? candidate.createdAt
              : new Date().toISOString(),
          beforeDecisionEvents: cloneDecisionEvents(
            candidate.decisionEvents as DecisionEvent[],
          ),
          afterDecisionEvents: cloneDecisionEvents(
            candidate.decisionEvents as DecisionEvent[],
          ),
          beforeTimelineEditorClips: cloneEditorTimelineClips(
            candidate.timelineEditorClips as EditorTimelineClip[],
          ),
          afterTimelineEditorClips: cloneEditorTimelineClips(
            candidate.timelineEditorClips as EditorTimelineClip[],
          ),
        }
      : undefined);

  return {
    id: nodeId,
    label:
      typeof candidate.label === "string" ? candidate.label : "Recovered state",
    parentId:
      candidate.parentId === null || typeof candidate.parentId === "string"
        ? candidate.parentId
        : null,
    childrenIds,
    createdAt:
      typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : new Date().toISOString(),
    operation,
  };
}

function isDecisionHistoryNode(value: unknown): value is DecisionHistoryNode {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as DecisionHistoryNode;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.createdAt === "string" &&
    (candidate.parentId === null || typeof candidate.parentId === "string") &&
    Array.isArray(candidate.childrenIds) &&
    candidate.childrenIds.every((childId: unknown) => typeof childId === "string") &&
    (candidate.operation === undefined ||
      isDecisionHistoryMutation(candidate.operation))
  );
}

function isDecisionHistoryMutation(value: unknown): value is DecisionHistoryMutation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as DecisionHistoryMutation;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.createdAt === "string" &&
    Array.isArray(candidate.beforeDecisionEvents) &&
    candidate.beforeDecisionEvents.every(isDecisionEvent) &&
    Array.isArray(candidate.afterDecisionEvents) &&
    candidate.afterDecisionEvents.every(isDecisionEvent) &&
    Array.isArray(candidate.beforeTimelineEditorClips) &&
    candidate.beforeTimelineEditorClips.every(isEditorTimelineClip) &&
    Array.isArray(candidate.afterTimelineEditorClips) &&
    candidate.afterTimelineEditorClips.every(isEditorTimelineClip)
  );
}

function parseDecisionHistoryMutation(
  rawValue: unknown,
  fallback: { id: string; label: string; createdAt: string },
): DecisionHistoryMutation | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const candidate = rawValue as Record<string, unknown>;
  if (!isDecisionHistoryMutation(candidate)) {
    return null;
  }

  return {
    id: candidate.id,
    label: candidate.label,
    createdAt: candidate.createdAt,
    beforeDecisionEvents: cloneDecisionEvents(candidate.beforeDecisionEvents),
    afterDecisionEvents: cloneDecisionEvents(candidate.afterDecisionEvents),
    beforeTimelineEditorClips: cloneEditorTimelineClips(
      candidate.beforeTimelineEditorClips,
    ),
    afterTimelineEditorClips: cloneEditorTimelineClips(
      candidate.afterTimelineEditorClips,
    ),
  };
}

function isStoredLegacyDecisionHistoryEntry(
  value: unknown,
): value is DecisionHistoryLegacyEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as DecisionHistoryLegacyEntry;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    Array.isArray(candidate.before) &&
    candidate.before.every(isDecisionEvent) &&
    Array.isArray(candidate.after) &&
    candidate.after.every(isDecisionEvent) &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  );
}

function isStoredLegacyDecisionHistory(
  value: unknown,
): value is DecisionHistoryLegacyState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as DecisionHistoryLegacyState;

  return (
    Array.isArray(candidate.undoStack) &&
    candidate.undoStack.every(isStoredLegacyDecisionHistoryEntry) &&
    Array.isArray(candidate.redoStack) &&
    candidate.redoStack.every(isStoredLegacyDecisionHistoryEntry) &&
    typeof candidate.lastAction === "string"
  );
}

function migrateLegacyDecisionHistory(
  legacyHistory: DecisionHistoryLegacyState,
): DecisionHistoryState {
  if (legacyHistory.undoStack.length === 0 && legacyHistory.redoStack.length === 0) {
    return createEmptyDecisionHistory();
  }

  const rootEvents = cloneDecisionEvents(
    legacyHistory.undoStack[0]?.before ??
      legacyHistory.redoStack[legacyHistory.redoStack.length - 1]?.before ??
      [],
  );
  const rootNode = createHistoryRootNode();
  const rootState = {
    decisionEvents: rootEvents,
    timelineEditorClips: [],
  };
  const nodes: Record<string, DecisionHistoryNode> = {
    [rootNode.id]: rootNode,
  };

  let currentAppliedNode = rootNode;
  for (const legacyEntry of legacyHistory.undoStack) {
    const nextNodeId = createHistoryEntryId();
    const childNode: DecisionHistoryNode = {
      id: nextNodeId,
      label: legacyEntry.label,
      parentId: currentAppliedNode.id,
      childrenIds: [],
      createdAt: legacyEntry.createdAt,
      operation: {
        id: nextNodeId,
        label: legacyEntry.label,
        createdAt: legacyEntry.createdAt,
        beforeDecisionEvents: cloneDecisionEvents(legacyEntry.before),
        afterDecisionEvents: cloneDecisionEvents(legacyEntry.after),
        beforeTimelineEditorClips: [],
        afterTimelineEditorClips: [],
      },
    };

    currentAppliedNode = {
      ...currentAppliedNode,
      childrenIds: addUniqueHistoryChildId(
        currentAppliedNode.childrenIds,
        childNode.id,
      ),
    };
    nodes[currentAppliedNode.id] = currentAppliedNode;
    nodes[childNode.id] = childNode;
    currentAppliedNode = childNode;
  }

  const undoStateNodeId = currentAppliedNode.id;
  let redoBranchNode = currentAppliedNode;
  for (let index = legacyHistory.redoStack.length - 1; index >= 0; index -= 1) {
    const legacyEntry = legacyHistory.redoStack[index];
    const nextNodeId = createHistoryEntryId();
    const childNode: DecisionHistoryNode = {
      id: nextNodeId,
      label: legacyEntry.label,
      parentId: redoBranchNode.id,
      childrenIds: [],
      createdAt: legacyEntry.createdAt,
      operation: {
        id: nextNodeId,
        label: legacyEntry.label,
        createdAt: legacyEntry.createdAt,
        beforeDecisionEvents: cloneDecisionEvents(legacyEntry.before),
        afterDecisionEvents: cloneDecisionEvents(legacyEntry.after),
        beforeTimelineEditorClips: [],
        afterTimelineEditorClips: [],
      },
    };

    redoBranchNode = {
      ...redoBranchNode,
      childrenIds: addUniqueHistoryChildId(
        redoBranchNode.childrenIds,
        childNode.id,
      ),
    };

    nodes[redoBranchNode.id] = redoBranchNode;
    nodes[childNode.id] = childNode;
    redoBranchNode = childNode;
  }

  return {
    rootState,
    currentNodeId: legacyHistory.undoStack.length > 0
      ? undoStateNodeId
      : rootNode.id,
    nodes,
    lastAction: legacyHistory.lastAction,
  };
}

function isLocalDecisionCheckpoint(
  value: unknown,
): value is LocalDecisionCheckpoint {
  return normalizeLocalDecisionCheckpoint(value) !== null;
}

function normalizeLocalDecisionCheckpoint(
  value: unknown,
): LocalDecisionCheckpoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    schemaVersion?: number;
    id?: unknown;
    label?: unknown;
    episodeId?: unknown;
    projectId?: unknown;
    branchId?: unknown;
    createdAt?: unknown;
    decisionEvents?: unknown;
    timelineEditorClips?: unknown;
    decisionHistory?: unknown;
  };

  if (candidate.schemaVersion !== undefined && candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) {
    return null;
  }

  if (typeof candidate.id !== "string" || typeof candidate.label !== "string") {
    return null;
  }

  if (
    candidate.episodeId !== undefined &&
    typeof candidate.episodeId !== "string"
  ) {
    return null;
  }

  if (typeof candidate.projectId !== "string" || typeof candidate.branchId !== "string") {
    return null;
  }

  if (typeof candidate.createdAt !== "string" || Number.isNaN(Date.parse(candidate.createdAt))) {
    return null;
  }

  if (
    !Array.isArray(candidate.decisionEvents) ||
    !candidate.decisionEvents.every(isDecisionEvent)
  ) {
    return null;
  }

  const timelineEditorClips = Array.isArray(candidate.timelineEditorClips)
    ? candidate.timelineEditorClips
    : [];
  if (!timelineEditorClips.every(isEditorTimelineClip)) {
    return null;
  }

  const decisionHistory =
    candidate.decisionHistory === undefined
      ? undefined
      : parseStoredDecisionHistory(candidate.decisionHistory);
  if (candidate.decisionHistory !== undefined && !decisionHistory) {
    return null;
  }

  return {
    schemaVersion: candidate.schemaVersion ?? (decisionHistory ? 2 : 1),
    id: candidate.id,
    label: candidate.label,
    ...(candidate.episodeId === undefined ? {} : { episodeId: candidate.episodeId }),
    projectId: candidate.projectId,
    branchId: candidate.branchId,
    createdAt: candidate.createdAt,
    decisionEvents: cloneDecisionEvents(candidate.decisionEvents),
    timelineEditorClips: cloneEditorTimelineClips(
      timelineEditorClips as EditorTimelineClip[],
    ),
    ...(decisionHistory ? { decisionHistory } : {}),
  };
}

function isTimelineMarker(value: unknown): value is TimelineMarker {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as TimelineMarker;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.projectId === "string" &&
    typeof candidate.branchId === "string" &&
    (candidate.episodeId === undefined ||
      typeof candidate.episodeId === "string") &&
    typeof candidate.sourceTimeMs === "number" &&
    Number.isFinite(candidate.sourceTimeMs) &&
    candidate.sourceTimeMs >= 0 &&
    typeof candidate.label === "string" &&
    (candidate.note === undefined || typeof candidate.note === "string") &&
    typeof candidate.createdBy === "string" &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  );
}

function isClipCandidate(value: unknown): value is ClipCandidate {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as ClipCandidate;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.projectId === "string" &&
    typeof candidate.branchId === "string" &&
    (candidate.episodeId === undefined ||
      typeof candidate.episodeId === "string") &&
    typeof candidate.title === "string" &&
    (candidate.summary === undefined || typeof candidate.summary === "string") &&
    typeof candidate.startSourceTimeMs === "number" &&
    Number.isFinite(candidate.startSourceTimeMs) &&
    candidate.startSourceTimeMs >= 0 &&
    typeof candidate.endSourceTimeMs === "number" &&
    Number.isFinite(candidate.endSourceTimeMs) &&
    candidate.endSourceTimeMs > candidate.startSourceTimeMs &&
    CLIP_CANDIDATE_STATUSES.includes(candidate.status) &&
    Array.isArray(candidate.targetProfiles) &&
    candidate.targetProfiles.every((profile) =>
      CLIP_RENDER_PROFILES.includes(profile),
    ) &&
    (candidate.score === undefined ||
      (typeof candidate.score === "number" &&
        Number.isFinite(candidate.score) &&
        candidate.score >= 0 &&
        candidate.score <= 1)) &&
    Array.isArray(candidate.reasons) &&
    candidate.reasons.every((reason) => typeof reason === "string") &&
    typeof candidate.source === "string" &&
    (candidate.sourceId === undefined || typeof candidate.sourceId === "string") &&
    typeof candidate.createdBy === "string" &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt)) &&
    typeof candidate.updatedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.updatedAt))
  );
}

function isEditorTimelineClip(value: unknown): value is EditorTimelineClip {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as EditorTimelineClip;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.projectId === "string" &&
    typeof candidate.branchId === "string" &&
    (candidate.episodeId === undefined || typeof candidate.episodeId === "string") &&
    TIMELINE_EDITOR_TRACKS.some((track) => track.id === candidate.trackId) &&
    (candidate.sourceType === "manual" ||
      candidate.sourceType === "candidate" ||
      candidate.sourceType === "selection") &&
    typeof candidate.startSourceTimeMs === "number" &&
    Number.isFinite(candidate.startSourceTimeMs) &&
    candidate.startSourceTimeMs >= 0 &&
    typeof candidate.endSourceTimeMs === "number" &&
    Number.isFinite(candidate.endSourceTimeMs) &&
    candidate.endSourceTimeMs > candidate.startSourceTimeMs &&
    typeof candidate.label === "string" &&
    (candidate.note === undefined || typeof candidate.note === "string") &&
    typeof candidate.createdBy === "string" &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt)) &&
    typeof candidate.updatedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.updatedAt))
  );
}

function createHistoryRootNode(): DecisionHistoryNode {
  return {
    id: createHistoryEntryId(),
    label: "Initial state",
    parentId: null,
    childrenIds: [],
    createdAt: new Date().toISOString(),
  };
}

function addUniqueHistoryChildId(
  childrenIds: readonly string[],
  childId: string,
) {
  return childrenIds.includes(childId)
    ? [...childrenIds]
    : [...childrenIds, childId];
}

function cloneEditorTimelineClips(clips: readonly EditorTimelineClip[]) {
  return sortEditorTimelineClips(clips.map((clip) => ({ ...clip })));
}

function areTimelineEditorClipListsEqual(
  firstClips: readonly EditorTimelineClip[],
  secondClips: readonly EditorTimelineClip[],
) {
  return (
    JSON.stringify(cloneEditorTimelineClips(firstClips)) ===
    JSON.stringify(cloneEditorTimelineClips(secondClips))
  );
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

function createTimelineMarkerId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createTimelineEditorClipId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `timeline-clip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createTranscriptSegmentId(prefix = "segment") {
  if ("randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createClipCandidateId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDecisionEventId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `decision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function buildEpisodeSetupBoardPreflight(
  setupBoard: EpisodeSetupBoard,
): EpisodeSetupBoardPreflight {
  const checks: GeneratedPackagePreflightCheck[] = [
    {
      id: "setup-board-title",
      label: "Episode title",
      status: setupBoard.episodeTitle.trim() ? "ready" : "blocked",
      detail: setupBoard.episodeTitle.trim()
        ? "Episode title is set."
        : "Set the episode title before packaging.",
    },
    {
      id: "setup-board-guests",
      label: "Guests",
      status: setupBoard.guests.length > 0 ? "ready" : "blocked",
      detail: setupBoard.guests.length > 0
        ? `${setupBoard.guests.length} guest${setupBoard.guests.length === 1 ? "" : "s"} listed.`
        : "Add at least one guest before handoff.",
    },
    {
      id: "setup-board-notes",
      label: "Episode notes",
      status: setupBoard.teleprompterNotes.trim() ? "ready" : "blocked",
      detail: setupBoard.teleprompterNotes.trim()
        ? "Episode notes are captured."
        : "Add concise episode notes before handoff.",
    },
    {
      id: "setup-board-script",
      label: "Script",
      status: setupBoard.scriptNotes.trim() ? "ready" : "blocked",
      detail: setupBoard.scriptNotes.trim()
        ? "Script content is documented."
        : "Add scripted material before editor handoff.",
    },
    {
      id: "setup-board-beats",
      label: "Planned clip beats",
      status: setupBoard.plannedClipBeats.length > 0 ? "ready" : "blocked",
      detail: setupBoard.plannedClipBeats.length > 0
        ? `${setupBoard.plannedClipBeats.length} planned beats listed.`
        : "Add at least one planned clip beat.",
    },
    {
      id: "setup-board-assets",
      label: "Asset checklist",
      status: setupBoard.assetChecklist.length > 0 ? "ready" : "blocked",
      detail: setupBoard.assetChecklist.length > 0
        ? `${setupBoard.assetChecklist.length} asset items added.`
        : "Add at least one required production asset.",
    },
    {
      id: "setup-board-links",
      label: "Reference links",
      status: setupBoard.links.length > 0 ? "ready" : "optional",
      detail: setupBoard.links.length > 0
        ? `${setupBoard.links.length} reference link${setupBoard.links.length === 1 ? "" : "s"} added.`
        : "Add reference links when available.",
    },
  ];

  const isBlocked = checks.some((check) => check.status === "blocked");

  return {
    status: isBlocked ? "blocked" : "ready",
    checks,
  };
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

function summarizeDerivedSegmentDurations(
  segments: readonly DerivedSegment[],
  sourceDurationMs: number,
): OutputDurationSummary {
  return segments.reduce<OutputDurationSummary>(
    (summary, segment) => {
      const startSourceTimeMs = clampSourceTime(
        segment.startSourceTimeMs,
        sourceDurationMs,
      );
      const endSourceTimeMs = clampSourceTime(
        segment.endSourceTimeMs ?? sourceDurationMs,
        sourceDurationMs,
      );
      const durationMs = Math.max(0, endSourceTimeMs - startSourceTimeMs);

      if (segment.state === "cut") {
        return {
          ...summary,
          cutDurationMs: summary.cutDurationMs + durationMs,
        };
      }

      return {
        ...summary,
        activeDurationMs: summary.activeDurationMs + durationMs,
      };
    },
    {
      activeDurationMs: 0,
      cutDurationMs: 0,
      totalDurationMs: sourceDurationMs,
    },
  );
}

function buildEpisodeOutputPackage({
  exportedAt,
  roomSelection,
  manifest,
  sourceDurationMs,
  derivedSegments,
  setupBoard,
  decisionEvents,
  clipCandidates,
  transcript,
  syncMap,
  localProxyVideo,
  outputDurationSummary,
}: {
  exportedAt: string;
  roomSelection: StudioCutRoomSelection;
  manifest: EpisodeManifest | null;
  sourceDurationMs: number;
  derivedSegments: readonly DerivedSegment[];
  setupBoard: EpisodeSetupBoard;
  decisionEvents: readonly DecisionEvent[];
  clipCandidates: readonly ClipCandidate[];
  transcript: EpisodeTranscript | null;
  syncMap?: SyncMap;
  localProxyVideo: LocalProxyVideo | null;
  outputDurationSummary: OutputDurationSummary;
}): EpisodeOutputPackage {
  const episodeId = manifest?.id;
  const episodeTitle = setupBoard.episodeTitle.trim() || manifest?.title || roomSelection.projectId;
  const approvedClipCount = clipCandidates.filter(
    (candidate) => candidate.status === "approved",
  ).length;
  const setupPreflight = buildEpisodeSetupBoardPreflight(setupBoard);
  const visibleSegments = derivedSegments
    .filter((segment) => segment.state !== "cut")
    .slice(0, 12);
  const chapterDrafts = visibleSegments.map((segment) => ({
    startSourceTimeMs: segment.startSourceTimeMs,
    title: PROGRAM_STATE_LABELS[segment.state],
    state: segment.state,
  }));
  const renderCommandEpisodeDir = `<episode-workspace>/${sanitizeFileNamePart(
    episodeId ?? roomSelection.projectId,
  )}`;
  const decisionFileName = episodeId
    ? `${sanitizeFileNamePart(episodeId)}-decisions.json`
    : "studio-cut-decisions.json";
  const manifestFileName = episodeId
    ? `${sanitizeFileNamePart(episodeId)}-manifest.json`
    : "episode-manifest.json";

  return {
    schemaVersion: 1,
    exportedAt,
    projectId: roomSelection.projectId,
    branchId: roomSelection.branchId,
    setup: {
      ...(episodeId ? { episodeId } : {}),
      title: episodeTitle,
      guests: setupBoard.guests,
      links: setupBoard.links,
      scriptNotes: setupBoard.scriptNotes,
      teleprompterNotes: setupBoard.teleprompterNotes,
      plannedClipBeats: setupBoard.plannedClipBeats,
      assetChecklist: setupBoard.assetChecklist,
      updatedAt: exportedAt,
    },
    episode: {
      ...(episodeId ? { id: episodeId } : {}),
      title: episodeTitle,
      durationMs: sourceDurationMs,
      manifestLoaded: Boolean(manifest),
    },
    readiness: {
      manifestLoaded: Boolean(manifest),
      proxyLoaded: Boolean(localProxyVideo),
      transcriptLoaded: Boolean(transcript),
      syncMapAttached: Boolean(syncMap),
      decisionsReady: decisionEvents.length > 0,
      approvedClipsReady: approvedClipCount > 0,
      setupBoardReady: setupPreflight.status === "ready",
      renderReady: Boolean(manifest && decisionEvents.length > 0),
    },
    metrics: {
      decisionCount: decisionEvents.length,
      activeDurationMs: outputDurationSummary.activeDurationMs,
      cutDurationMs: outputDurationSummary.cutDurationMs,
      totalClipCount: clipCandidates.length,
      approvedClipCount,
    },
    titleCandidates: buildEpisodeTitleCandidates(episodeTitle),
    descriptionDraft: buildEpisodeDescriptionDraft({
      title: episodeTitle,
      activeDurationMs: outputDurationSummary.activeDurationMs,
      approvedClipCount,
    }),
    chapterDrafts,
    captions: {
      status: transcript ? "transcript_ready" : "not_started",
      note: transcript
        ? "Timed transcript is loaded for caption and description drafting."
        : "Import or generate a timed transcript before final caption export.",
    },
    clips: cloneClipCandidates(clipCandidates),
    renderCommands: [
      `pnpm studio-cut:local:render-rescue-sync-session -- --episode-id ${sanitizeFileNamePart(
        episodeId ?? roomSelection.projectId,
      )} --episode-dir ${renderCommandEpisodeDir}`,
      `python tools/studio-cut-local/studio_cut_local.py plan-render --manifest ${manifestFileName} --decisions ${decisionFileName} --profile youtube_16x9`,
    ],
    checklist: buildEpisodeOutputChecklist({
      manifestLoaded: Boolean(manifest),
      proxyLoaded: Boolean(localProxyVideo),
      syncMapAttached: Boolean(syncMap),
      decisionCount: decisionEvents.length,
      approvedClipCount,
      transcriptLoaded: Boolean(transcript),
    }),
    notes: [
      "This package is a planning handoff. It does not contain media bytes, browser object URLs, or local original paths.",
      "Semantic decisions use canonical episode/source time and remain reversible through JSON checkpoints.",
      "Run local render QA before publishing any final output.",
    ],
  };
}

function buildEpisodeTitleCandidates(title: string) {
  const normalizedTitle = title.trim() || "Studio Cut Episode";

  return [
    normalizedTitle,
    `${normalizedTitle} | High Ground Odyssey`,
    `${normalizedTitle} - Conversation Cut`,
  ];
}

function buildEpisodeDescriptionDraft({
  title,
  activeDurationMs,
  approvedClipCount,
}: {
  title: string;
  activeDurationMs: number;
  approvedClipCount: number;
}) {
  return `${title} semantic edit package. Active program runtime is ${formatSourceTime(
    activeDurationMs,
  )}; ${approvedClipCount} short-form clip candidate${
    approvedClipCount === 1 ? "" : "s"
  } approved for review.`;
}

function buildEpisodeOutputChecklist({
  manifestLoaded,
  proxyLoaded,
  syncMapAttached,
  decisionCount,
  approvedClipCount,
  transcriptLoaded,
}: {
  manifestLoaded: boolean;
  proxyLoaded: boolean;
  syncMapAttached: boolean;
  decisionCount: number;
  approvedClipCount: number;
  transcriptLoaded: boolean;
}) {
  const checklist = [
    manifestLoaded
      ? "Manifest loaded"
      : "Load or publish an Episode Manifest before handoff",
    proxyLoaded
      ? "Source-monitor proxy available for browser QA"
      : "Load or publish a source-monitor proxy for visual QA",
    decisionCount > 0
      ? "Review semantic decision timeline"
      : "Tag at least one semantic decision",
    approvedClipCount > 0
      ? "Review approved clip candidates"
      : "Approve clip candidates if short-form output is needed",
    transcriptLoaded
      ? "Review transcript-derived captions and chapters"
      : "Import transcript before caption handoff",
    syncMapAttached
      ? "Sync Map attached for original asset render planning"
      : "Attach Sync Map before final original-asset render",
    "Export decisions and checkpoint before render",
    "Run local render dry-run and inspect output",
  ];

  return checklist;
}

function cloneClipCandidates(candidates: readonly ClipCandidate[]) {
  return candidates.map((candidate) => ({
    ...candidate,
    reasons: [...candidate.reasons],
    targetProfiles: [...candidate.targetProfiles],
  }));
}

function renderEpisodeOutputPackageMarkdown(payload: EpisodeOutputPackage) {
  const lines = [
    `# ${payload.episode.title} Output Package`,
    "",
    `- Project: ${payload.projectId}`,
    `- Branch: ${payload.branchId}`,
    `- Exported: ${payload.exportedAt}`,
    `- Duration: ${formatSourceTime(payload.episode.durationMs)}`,
    `- Active runtime: ${formatSourceTime(payload.metrics.activeDurationMs)}`,
    `- Cut runtime: ${formatSourceTime(payload.metrics.cutDurationMs)}`,
    `- Decisions: ${payload.metrics.decisionCount}`,
    `- Approved clips: ${payload.metrics.approvedClipCount}/${payload.metrics.totalClipCount}`,
    "",
    "## Readiness",
    ...Object.entries(payload.readiness).map(
      ([key, value]) => `- ${formatCamelCaseLabel(key)}: ${value ? "yes" : "no"}`,
    ),
    "",
    "## Title Candidates",
    ...payload.titleCandidates.map((title) => `- ${title}`),
    "",
    "## Episode Setup",
    `- Title: ${payload.setup.title || "(not set)"}`,
    `- Guests: ${
      payload.setup.guests.length > 0
        ? payload.setup.guests.join(", ")
        : "(none)"
    }`,
    `- Links: ${
      payload.setup.links.length > 0
        ? payload.setup.links.join(", ")
        : "(none)"
    }`,
    `- Planned clip beats: ${
      payload.setup.plannedClipBeats.length > 0
        ? payload.setup.plannedClipBeats.join("; ")
        : "(none)"
    }`,
    `- Asset checklist: ${
      payload.setup.assetChecklist.length > 0
        ? payload.setup.assetChecklist.join(", ")
        : "(none)"
    }`,
    "- Script notes:",
    payload.setup.scriptNotes
      ? payload.setup.scriptNotes
      : "  (none)",
    "- Teleprompter notes:",
    payload.setup.teleprompterNotes
      ? payload.setup.teleprompterNotes
      : "  (none)",
    "",
    "## Description Draft",
    payload.descriptionDraft,
    "",
    "## Chapters",
    ...(payload.chapterDrafts.length > 0
      ? payload.chapterDrafts.map(
          (chapter) =>
            `- ${formatSourceTime(chapter.startSourceTimeMs)} ${chapter.title}`,
        )
      : ["- No chapter candidates yet."]),
    "",
    "## Clips",
    ...(payload.clips.length > 0
      ? payload.clips.map(
          (clip) =>
            `- ${clip.status}: ${clip.title} (${formatSourceTime(
              clip.startSourceTimeMs,
            )}-${formatSourceTime(clip.endSourceTimeMs)})`,
        )
      : ["- No clip candidates yet."]),
    "",
    "## Render Commands",
    ...payload.renderCommands.map((command) => `- \`${command}\``),
    "",
    "## Checklist",
    ...payload.checklist.map((item) => `- ${item}`),
    "",
    "## Notes",
    ...payload.notes.map((note) => `- ${note}`),
    "",
  ];

  return lines.join("\n");
}

function buildRenderProfilePlan({
  exportedAt,
  roomSelection,
  manifest,
  sourceDurationMs,
  clipCandidates,
}: {
  exportedAt: string;
  roomSelection: StudioCutRoomSelection;
  manifest: EpisodeManifest | null;
  sourceDurationMs: number;
  clipCandidates: readonly ClipCandidate[];
}): RenderProfilePlan {
  const profileById = new Map(
    STUDIO_CUT_RENDER_PROFILES.map((profile) => [profile.id, profile]),
  );
  const approvedCandidates = clipCandidates.filter(
    (candidate) => candidate.status === "approved",
  );
  const clipOutputs = approvedCandidates.flatMap((candidate) =>
    candidate.targetProfiles.map((profileId) => {
      const profile = profileById.get(profileId);

      return {
        clipCandidateId: candidate.id,
        title: candidate.title,
        profileId,
        startSourceTimeMs: candidate.startSourceTimeMs,
        endSourceTimeMs: candidate.endSourceTimeMs,
        ...(profile?.defaultCaptionPresetId
          ? { captionPresetId: profile.defaultCaptionPresetId }
          : {}),
        status: candidate.status,
      };
    }),
  );
  const youtubeProfile = profileById.get("youtube_16x9");
  const warnings = [
    ...(manifest ? [] : ["Import or publish a manifest before final render planning."]),
    ...(approvedCandidates.length > 0
      ? []
      : ["No approved clip candidates yet; short-form profile outputs are empty."]),
  ];

  return {
    schemaVersion: 1,
    exportedAt,
    projectId: roomSelection.projectId,
    branchId: roomSelection.branchId,
    ...(manifest?.id ? { episodeId: manifest.id } : {}),
    profiles: STUDIO_CUT_RENDER_PROFILES.map((profile) => ({ ...profile })),
    captionPresets: CAPTION_STYLE_PRESETS.map((preset) => ({ ...preset })),
    fullEpisodeOutputs: youtubeProfile
      ? [
          {
            profileId: youtubeProfile.id,
            label: youtubeProfile.label,
            durationMs: sourceDurationMs,
            ...(youtubeProfile.defaultCaptionPresetId
              ? { captionPresetId: youtubeProfile.defaultCaptionPresetId }
              : {}),
            notes:
              "Full episode render should use semantic decisions, Sync Map, and the local original media map.",
          },
        ]
      : [],
    clipOutputs,
    warnings,
  };
}

function formatCamelCaseLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
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

function getAgentContextFileName(
  manifest: EpisodeManifest | null,
  roomSelection: StudioCutRoomSelection,
  checkpointTimestamp: string,
) {
  const baseName = manifest?.id
    ? `${manifest.id}-agent-context`
    : `studio-cut-${roomSelection.projectId}-${roomSelection.branchId}-agent-context`;

  return `${sanitizeFileNamePart(baseName)}-${checkpointTimestamp}.json`;
}

function getTranscriptSuggestedOpsFileName(
  manifest: EpisodeManifest | null,
  roomSelection: StudioCutRoomSelection,
  checkpointTimestamp: string,
) {
  const baseName = manifest?.id
    ? `${manifest.id}-transcript-agent-ops`
    : `studio-cut-${roomSelection.projectId}-${roomSelection.branchId}-transcript-agent-ops`;

  return `${sanitizeFileNamePart(baseName)}-${checkpointTimestamp}.json`;
}

function getClipCandidatesFileName(
  manifest: EpisodeManifest | null,
  roomSelection: StudioCutRoomSelection,
  checkpointTimestamp: string,
) {
  const baseName = manifest?.id
    ? `${manifest.id}-clip-candidates`
    : `studio-cut-${roomSelection.projectId}-${roomSelection.branchId}-clip-candidates`;

  return `${sanitizeFileNamePart(baseName)}-${checkpointTimestamp}.json`;
}

function getEpisodeOutputPackageFileName(
  manifest: EpisodeManifest | null,
  roomSelection: StudioCutRoomSelection,
  checkpointTimestamp: string,
  extension: "json" | "md",
) {
  const baseName = manifest?.id
    ? `${manifest.id}-output-package`
    : `studio-cut-${roomSelection.projectId}-${roomSelection.branchId}-output-package`;

  return `${sanitizeFileNamePart(baseName)}-${checkpointTimestamp}.${extension}`;
}

function getRenderProfilePlanFileName(
  manifest: EpisodeManifest | null,
  roomSelection: StudioCutRoomSelection,
  checkpointTimestamp: string,
) {
  const baseName = manifest?.id
    ? `${manifest.id}-render-profile-plan`
    : `studio-cut-${roomSelection.projectId}-${roomSelection.branchId}-render-profile-plan`;

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

function downloadTextFile(text: string, fileName: string, mimeType: string) {
  const blob = new Blob([text], {
    type: mimeType,
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

async function computeFileSha256(file: File) {
  const digest = await computeSha256(await file.arrayBuffer());

  return digest;
}

async function computeTextSha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const source = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  );

  return computeSha256(source);
}

async function computeSha256(source: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 package fingerprinting requires browser crypto support.");
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", source);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatDigest(value: string | undefined) {
  if (!value) {
    return "Missing";
  }

  return `${value.slice(0, 12)}…${value.slice(-6)}`;
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

function buildSyncJobTimeline({
  status,
  selectedFiles,
  uploadStates,
  syncJob,
  sharedRoomMetadata,
}: {
  status: PersistenceStatus;
  selectedFiles: CloudSyncSelectedFiles;
  uploadStates: Record<CloudSyncInputRole, CloudSyncRoleUploadState>;
  syncJob: CloudSyncJob | null;
  sharedRoomMetadata: SharedRoomMetadata | null;
}): SyncJobTimelineStage[] {
  const cloudReady =
    status.mode === "cloud_connected" || status.mode === "cloud_ready";
  const selectedFileArrays = getCloudSyncSelectedFileArrays(selectedFiles);
  const requiredComplete = isRequiredCloudSyncSelectionComplete(selectedFileArrays);
  const missingRequired = getMissingRequiredCloudSyncSelection(selectedFileArrays);
  const isUploading = Object.values(uploadStates).some(
    (uploadState) => uploadState.status === "uploading",
  );
  const hasUploadedInputs = Boolean(syncJob?.uploadedInputs.length);
  const outputsComplete = syncJob ? isCloudSyncJobOutputComplete(syncJob) : false;
  const isPublished =
    Boolean(syncJob?.syncJobId && sharedRoomMetadata?.syncJobId === syncJob.syncJobId) ||
    Boolean(sharedRoomMetadata?.packageKind === "rescue_sync_generated");
  const jobStatus = syncJob?.status;
  const jobFailed = jobStatus === "failed";

  return [
    {
      id: "draft",
      label: "Draft",
      status: !cloudReady
        ? "blocked"
        : syncJob || requiredComplete
          ? "done"
          : "active",
      detail: !cloudReady
        ? "Firebase config is absent, so raw asset upload stays disabled."
        : requiredComplete
          ? "Required assets are selected."
          : `Missing ${missingRequired
              .map((role) => CLOUD_SYNC_ROLE_LABELS[role])
              .join(", ")}.`,
    },
    {
      id: "uploading",
      label: "Uploading",
      status: jobFailed
        ? "blocked"
        : isUploading
          ? "active"
          : hasUploadedInputs || ["uploaded", "queued", "processing", "ready"].includes(jobStatus ?? "")
            ? "done"
            : requiredComplete
              ? "waiting"
              : "blocked",
      detail: isUploading
        ? "Uploading selected raw assets to the sync job intake bucket."
        : hasUploadedInputs
          ? `${syncJob?.uploadedInputs.length ?? 0} input file${
              syncJob?.uploadedInputs.length === 1 ? "" : "s"
            } recorded on the sync job.`
          : "Create the sync job after all required assets are selected.",
    },
    {
      id: "uploaded",
      label: "Uploaded",
      status: jobFailed
        ? "blocked"
        : ["uploaded", "queued", "processing", "ready"].includes(jobStatus ?? "")
          ? "done"
          : hasUploadedInputs
            ? "active"
            : "waiting",
      detail:
        jobStatus === "uploaded"
          ? "Inputs are uploaded and ready to queue for sync."
          : hasUploadedInputs
            ? "Upload record exists; check whether every required role finished."
            : "Waiting for raw asset upload.",
    },
    {
      id: "inspected",
      label: "Inspected",
      status: jobFailed
        ? "blocked"
        : jobStatus === "processing"
          ? "active"
          : outputsComplete || jobStatus === "ready"
            ? "done"
            : jobStatus === "queued"
              ? "waiting"
              : "waiting",
      detail:
        jobStatus === "processing"
          ? "Worker is expected to inspect media, extract audio, and build the reference rail."
          : outputsComplete
            ? "Generated package metadata exists."
            : "Future worker milestone: media inspection and reference rail.",
    },
    {
      id: "syncing",
      label: "Syncing",
      status: jobFailed
        ? "blocked"
        : jobStatus === "processing"
          ? "active"
          : outputsComplete || jobStatus === "ready"
            ? "done"
            : jobStatus === "queued"
              ? "active"
              : "waiting",
      detail:
        jobStatus === "queued"
          ? "Sync job is queued for waveform correlation and proxy generation."
          : jobStatus === "processing"
            ? "Worker should estimate offsets and generate package outputs."
            : outputsComplete
              ? "Sync Map, manifest, report, and source-monitor proxy are present."
              : "Waiting for worker queue.",
    },
    {
      id: "package_ready",
      label: "Package Ready",
      status: jobFailed
        ? "blocked"
        : outputsComplete
          ? "done"
          : jobStatus === "ready"
            ? "active"
            : "waiting",
      detail: outputsComplete
        ? "Worker outputs can be published into a shared room."
        : jobStatus === "ready"
          ? "Job says ready, but one or more output artifacts are missing."
          : "Waiting for generated source-monitor proxy, manifest, Sync Map, and report.",
    },
    {
      id: "room_published",
      label: "Room Published",
      status: jobFailed
        ? "blocked"
        : isPublished
          ? "done"
          : outputsComplete
            ? "active"
            : "waiting",
      detail: isPublished
        ? "Shared room metadata points at generated worker outputs."
        : outputsComplete
          ? "Publish worker outputs to create the room link for Mako."
          : "Waiting for package readiness.",
    },
  ];
}

function getSyncJobTimelineNextAction(stages: readonly SyncJobTimelineStage[]) {
  const activeStage =
    stages.find((stage) => stage.status === "blocked") ??
    stages.find((stage) => stage.status === "active") ??
    stages.find((stage) => stage.status === "waiting") ??
    stages[stages.length - 1];

  return {
    label: formatTimelineStageStatus(activeStage.status),
    detail: activeStage.detail,
  };
}

function formatTimelineStageStatus(status: SyncJobTimelineStageStatus) {
  if (status === "done") {
    return "Done";
  }

  if (status === "active") {
    return "Active";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "Waiting";
}

function getSyncRoleHealthStatus({
  selectedCount,
  uploadedCount,
  uploadState,
  required,
}: {
  selectedCount: number;
  uploadedCount: number;
  uploadState: CloudSyncRoleUploadState;
  required: boolean;
}) {
  if (uploadState.status === "error") {
    return "blocked";
  }

  if (uploadedCount > 0 || uploadState.status === "uploaded") {
    return "done";
  }

  if (uploadState.status === "uploading") {
    return "active";
  }

  if (selectedCount > 0 || !required) {
    return "waiting";
  }

  return "blocked";
}

function isCloudSyncJobOutputComplete(
  job: CloudSyncJob,
): job is CloudSyncJobWithCompleteOutputs {
  return Boolean(
    job.outputs.manifestStoragePath &&
      job.outputs.sourceMonitorProxyStoragePath &&
      job.outputs.syncReportStoragePath &&
      job.outputs.syncMapStoragePath,
  );
}

function formatConfidence(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatSignedSourceTime(sourceTimeMs: number) {
  const sign = sourceTimeMs < 0 ? "-" : "+";
  return `${sign}${formatSourceTime(Math.abs(sourceTimeMs))}`;
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

function getStoragePathLeaf(path: string, fallback: string) {
  return path.split("/").filter(Boolean).at(-1) ?? fallback;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return null;
}

function coerceRetryableErrors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      if (typeof (entry as { message?: unknown }).message === "string") {
        const message = coerceString((entry as { message?: unknown }).message);
        return message && message.length > 0 ? message : null;
      }

      if (typeof (entry as { reason?: unknown }).reason === "string") {
        const reason = coerceString((entry as { reason?: unknown }).reason);
        return reason && reason.length > 0 ? reason : null;
      }

      return null;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function coerceString(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim();
  }
  return null;
}

function readMigrationHealthFromResponse(payload: unknown): MediaVaultMigrationHealth {
  const statusPayload = payload as MediaVaultMigrationHealthPayload;
  const migrationPayload = statusPayload?.migrationStatus?.payload;
  const watchPayload = statusPayload?.watchStatus?.payload;
  const migrationProgress = migrationPayload as
    | { progress?: Record<string, unknown>; localBuffer?: Record<string, unknown> }
    | null;
  const watchProgress = watchPayload as {
    status?: unknown;
    inProgress?: unknown;
    filesInProgress?: unknown;
    bytesRemaining?: unknown;
    stalledRounds?: unknown;
    stallRounds?: unknown;
    lastError?: unknown;
    retryableErrors?: unknown;
    message?: unknown;
    error?: unknown;
    hardStopReason?: unknown;
    hardStop?: unknown;
    rounds?: Array<Record<string, unknown>>;
    runStatus?: unknown;
    warnings?: unknown[];
  } | null;

  const progress = migrationProgress?.progress ?? {};
  const localBuffer = migrationProgress?.localBuffer ?? {};
  const files = Array.isArray(localBuffer["files"]) ? localBuffer["files"] : [];
  const waitingFromProgress = coerceNumber(progress["localWaitingFileCount"]);
  const hasFileBytesSource = Array.isArray(localBuffer["files"]);
  const filesInProgressFromProgress =
    waitingFromProgress ??
    files.filter(
      (item) => typeof item === "object" && item !== null && !(item as { settled?: boolean }).settled,
    ).length;

  const bytesRemaining = files
    .filter((item) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }

      const isSettled = Boolean((item as { settled?: boolean }).settled);
      return !isSettled;
    })
    .reduce((total, item) => {
      const size = coerceNumber((item as { sizeBytes?: unknown }).sizeBytes);
      return total + (size && size > 0 ? size : 0);
    }, 0);

  const migrationErrors = Array.isArray((migrationPayload as { errors?: unknown[] })?.errors)
    ? (migrationPayload as { errors: unknown[] }).errors
    : [];
  const migrationLastError = migrationErrors.length
    ? coerceString(migrationErrors[migrationErrors.length - 1])
    : null;

  const hasRetryableWatchErrors = coerceRetryableErrors(watchProgress?.retryableErrors);
  const roundErrors = Array.isArray(watchProgress?.rounds)
    ? watchProgress.rounds
        .map((round) => round?.error)
        .filter(Boolean)
        .map(coerceString)
        .filter((value): value is string => Boolean(value))
    : [];
  const watchLastError = roundErrors.length
    ? roundErrors[roundErrors.length - 1]
    : coerceString(watchProgress?.lastError)
      || coerceString(watchProgress?.hardStopReason)
      || (coerceBoolean(watchProgress?.hardStop) ? coerceString(watchProgress?.message) : null)
      || coerceString(watchProgress?.message)
      || coerceString(watchProgress?.error);
  const watchStatusFilesInProgress = coerceNumber(watchProgress?.filesInProgress);
  const filesInProgress =
    watchStatusFilesInProgress !== null
      ? Math.max(0, Math.trunc(watchStatusFilesInProgress))
      : filesInProgressFromProgress;
  const bytesRemainingFromWatch = coerceNumber(watchProgress?.bytesRemaining);
  const stalledRounds = coerceNumber(watchProgress?.stalledRounds);
  const fallbackStalledRounds = coerceNumber(watchProgress?.stallRounds);
  const migrationStatus = coerceString((migrationPayload as { status?: unknown })?.status);
  const normalizedWatchStatus = (
    coerceString(watchProgress?.status) ||
    coerceString(watchProgress?.runStatus) ||
    migrationStatus
  )?.toLowerCase();
  const isInProgressStatus =
    coerceBoolean(watchProgress?.inProgress) ??
    (normalizedWatchStatus === "running" ||
      normalizedWatchStatus === "watching" ||
      filesInProgress > 0);
  const isBlockedStatus =
    coerceBoolean(watchProgress?.hardStop) ||
    (normalizedWatchStatus !== null &&
      normalizedWatchStatus !== undefined &&
      !["ready", "running", "watching", "loading"].includes(normalizedWatchStatus));

  return {
    filesInProgress: Math.max(0, Math.trunc(filesInProgress ?? 0)),
    inProgress: isInProgressStatus,
    retryableErrorCount: hasRetryableWatchErrors.length,
    bytesRemaining:
      bytesRemainingFromWatch !== null
        ? Math.max(0, Math.trunc(bytesRemainingFromWatch))
        : hasFileBytesSource
          ? bytesRemaining
          : null,
    stalledRounds:
      stalledRounds !== null
        ? Math.max(0, Math.trunc(stalledRounds))
        : fallbackStalledRounds !== null
          ? Math.max(0, Math.trunc(fallbackStalledRounds))
          : null,
    lastError: watchLastError || migrationLastError,
    updatedAt:
      coerceString(
        statusPayload?.migrationStatus?.updatedAt || statusPayload?.watchStatus?.updatedAt,
      ) ||
      coerceString(statusPayload?.updatedAt) ||
      null,
    status: isBlockedStatus ? "error" : "ready",
    errorMessage: null,
  };
}

function buildMigrationStatusErrorState(message: string | null): MediaVaultMigrationHealth {
  return {
    filesInProgress: 0,
    bytesRemaining: null,
    stalledRounds: null,
    inProgress: false,
    retryableErrorCount: 0,
    lastError: message,
    updatedAt: null,
    status: "error",
    errorMessage: message,
  };
}

function roundSeconds(sourceTimeMs: number) {
  return Math.round((sourceTimeMs / 1000) * 10) / 10;
}

function estimateClipCandidateScore(
  startSourceTimeMs: number,
  endSourceTimeMs: number,
  sourceDurationMs: number,
) {
  const durationMs = endSourceTimeMs - startSourceTimeMs;
  const durationScore =
    durationMs >= 15000 && durationMs <= 90000
      ? 0.88
      : durationMs >= 8000 && durationMs <= 120000
        ? 0.72
        : 0.56;
  const timelineScore =
    sourceDurationMs > 0
      ? Math.max(0.4, 1 - Math.abs(startSourceTimeMs / sourceDurationMs - 0.45))
      : 0.65;

  return Math.round(Math.min(0.96, (durationScore * 0.7 + timelineScore * 0.3)) * 1000) / 1000;
}

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function formatClipRenderProfile(profile: ClipRenderProfile) {
  const labels: Record<ClipRenderProfile, string> = {
    youtube_16x9: "YouTube 16:9",
    shorts_9x16: "Shorts 9:16",
    square_1x1: "Square 1:1",
    vertical_4x5: "Vertical 4:5",
    audio_teaser: "Audio teaser",
  };

  return labels[profile];
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
