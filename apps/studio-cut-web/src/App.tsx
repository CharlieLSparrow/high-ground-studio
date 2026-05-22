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
  deriveSegments,
  getCurrentDecisionEvent,
  PROGRAM_STATE_LABELS,
  PROGRAM_STATES,
  parseEpisodeManifestPayload,
  sortDecisionEvents,
  SOURCE_ROLE_LABELS,
  type DecisionEvent,
  type DerivedSegment,
  type EpisodeManifest,
  type ProgramState,
  type SourceRole,
} from "@high-ground/studio-cut-schema";
import { useDecisionPersistence } from "./hooks/useDecisionPersistence";
import {
  useStudioCutAuth,
  type StudioCutAuthStatus,
} from "./hooks/useStudioCutAuth";
import { getStudioCutRuntimeConfig } from "./studioCutConfig";

const DEFAULT_SOURCE_DURATION_MS = 60 * 60 * 1000;
const EPISODE_MANIFEST_STORAGE_KEY =
  "high-ground-studio.studio-cut.episode-manifest.v1";
const LOCAL_PROXY_VIDEO_ACCEPT =
  "video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v";
const PLAYBACK_TICK_MS = 250;
const VIDEO_SEEK_DRIFT_TOLERANCE_MS = 350;

type LocalProxyVideo = {
  id: string;
  name: string;
  sizeBytes: number;
  objectUrl: string;
  durationMs?: number;
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
  const [sourceTimeMs, setSourceTimeMs] = useState(0);
  const [isProgramPlaying, setIsProgramPlaying] = useState(false);
  const [episodeManifest, setEpisodeManifest] = useState<EpisodeManifest | null>(
    loadStoredEpisodeManifest,
  );
  const [localProxyVideo, setLocalProxyVideo] =
    useState<LocalProxyVideo | null>(null);
  const [note, setNote] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);
  const proxyVideoInputRef = useRef<HTMLInputElement>(null);
  const proxyVideoRef = useRef<HTMLVideoElement>(null);
  const {
    config,
    decisionEvents,
    status,
    createDecision,
    removeDecision,
    clearDecisions,
    importDecisionEvents,
    exportDecisionEvents,
  } = useDecisionPersistence(createdBy);

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
  const currentState = currentEvent?.state;
  const playbackModeLabel = isProgramPlaying
    ? "Program Playback"
    : "Source Scrub";
  const playbackModeDescription = isProgramPlaying
    ? "Play is simulating program playback and skipping Cut spans."
    : "Scrub controls use source time and show every span, including Cut.";

  useEffect(() => {
    saveStoredEpisodeManifest(episodeManifest);
  }, [episodeManifest]);

  useEffect(() => {
    return () => {
      if (localProxyVideo) {
        URL.revokeObjectURL(localProxyVideo.objectUrl);
      }
    };
  }, [localProxyVideo?.objectUrl]);

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

  function setClampedSourceTime(nextValue: number) {
    setSourceTimeMs(clampSourceTime(nextValue, sourceDurationMs));
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

  function addDecision(state: ProgramState) {
    stopProgramPlayback();
    createDecision(state, sourceTimeMs, note);
    setNote("");
  }

  function clearLocalDecisions() {
    if (window.confirm("Clear this browser's Studio Cut decision events?")) {
      stopProgramPlayback();
      clearDecisions();
    }
  }

  function handleExportJson() {
    const payload = exportDecisionEvents();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `studio-cut-${payload.projectId}-${payload.branchId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const result = importDecisionEvents(payload);
      stopProgramPlayback();
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
    });
    setImportMessage(
      `Loaded local proxy video "${file.name}". The file stays in this browser tab and is not uploaded, persisted, or written to decisions.`,
    );
    event.target.value = "";
  }

  function clearLocalProxyVideo() {
    stopProgramPlayback();
    setLocalProxyVideo(null);
    setImportMessage("Cleared the local proxy video from this browser tab.");
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
        />
      </section>

      <aside className="edit-panel" aria-label="Decision controls">
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

        <section className="persistence-panel">
          <div className="panel-heading">
            <div>
              <h2>Persistence Mode</h2>
              <p>{status.detail}</p>
            </div>
            <strong>{status.label}</strong>
          </div>
          <p className="persistence-path">{status.path}</p>
        </section>

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

        <section className="state-panel">
          <div className="panel-heading">
            <div>
              <h2>State Decisions</h2>
              <p>Each state holds until the next event</p>
            </div>
          </div>
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
                  {sortedEvents.length === 1 ? "" : "s"} in this working set
                </p>
              </div>
              <div className="toolbar-actions">
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
                  Export JSON
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
              onJump={scrubToSourceTime}
              onRemove={(eventId) => {
                stopProgramPlayback();
                removeDecision(eventId);
              }}
            />
          </div>

          <div className="list-section">
            <div className="panel-heading">
              <div>
                <h2>Derived Segments</h2>
                <p>Program state over source time</p>
              </div>
            </div>
            <SegmentList segments={derivedSegments} />
          </div>
      </section>
    </main>
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
          <strong>Local source-monitor proxy</strong>
          <p>
            {localProxyVideo
              ? `${localProxyVideo.name} · ${formatFileSize(
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
              Clear Video
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PrototypeNotice({ authStatus }: { authStatus: StudioCutAuthStatus }) {
  const isLocalDev = authStatus.mode === "local_dev";

  return (
    <section className="prototype-notice" aria-label="Prototype safety notice">
      <strong>{isLocalDev ? "Local dev prototype" : "Protected prototype"}</strong>
      <span>
        {isLocalDev
          ? "Local dev mode, auth disabled because Firebase env vars are missing. Do not use real media, proxy paths, private podcast details, credentials, or personal recordings here."
          : "This internal shell is for semantic decision tests only. Do not upload, paste, or reference real media, proxy paths, private podcast details, credentials, or personal recordings yet."}
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
          <p>Local browser file only. No upload or persistence.</p>
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
            aria-label={`Local source-monitor proxy ${localProxyVideo.name}`}
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
}: {
  sourceTimeMs: number;
  currentEvent?: DecisionEvent;
}) {
  const state = currentEvent?.state;

  return (
    <article
      className={`monitor program-monitor${state ? " has-state" : ""}${
        state === "cut" ? " is-cut" : ""
      }`}
    >
      <div className="monitor-header">
        <h2>{SOURCE_ROLE_LABELS.program}</h2>
        <span>{formatSourceTime(sourceTimeMs)}</span>
      </div>
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
    </article>
  );
}

function DecisionList({
  events,
  currentEventId,
  onJump,
  onRemove,
}: {
  events: DecisionEvent[];
  currentEventId?: string;
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
          {events.map((event) => (
            <tr
              key={event.id}
              className={event.id === currentEventId ? "is-current-row" : ""}
            >
              <td>{formatSourceTime(event.sourceTimeMs)}</td>
              <td>
                <span
                  className="state-pill"
                  style={{ "--accent": STATE_ACCENTS[event.state] } as CSSProperties}
                >
                  {PROGRAM_STATE_LABELS[event.state]}
                </span>
              </td>
              <td>{event.note || "None"}</td>
              <td title={event.id}>{shortId(event.id)}</td>
              <td>
                <div className="row-actions">
                  <button type="button" onClick={() => onJump(event.sourceTimeMs)}>
                    Jump
                  </button>
                  <button type="button" onClick={() => onRemove(event.id)}>
                    Remove Local
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentList({ segments }: { segments: DerivedSegment[] }) {
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
            <tr key={segment.sourceEventId}>
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

function loadStoredEpisodeManifest() {
  try {
    const rawValue = localStorage.getItem(EPISODE_MANIFEST_STORAGE_KEY);

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
  try {
    if (!manifest) {
      localStorage.removeItem(EPISODE_MANIFEST_STORAGE_KEY);
      return;
    }

    localStorage.setItem(EPISODE_MANIFEST_STORAGE_KEY, JSON.stringify(manifest));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function isSupportedLocalProxyVideo(file: File) {
  return (
    file.type.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(file.name)
  );
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
