import {
  type ChangeEvent,
  type CSSProperties,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deriveSegments,
  getCurrentDecisionEvent,
  PROGRAM_STATE_LABELS,
  PROGRAM_STATES,
  sortDecisionEvents,
  SOURCE_ROLE_LABELS,
  type DecisionEvent,
  type DerivedSegment,
  type ProgramState,
  type SourceRole,
} from "@high-ground/studio-cut-schema";
import { useDecisionPersistence } from "./hooks/useDecisionPersistence";

const SOURCE_DURATION_MS = 60 * 60 * 1000;

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
  const [sourceTimeMs, setSourceTimeMs] = useState(0);
  const [note, setNote] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const {
    config,
    decisionEvents,
    status,
    createDecision,
    removeDecision,
    clearDecisions,
    importDecisionEvents,
    exportDecisionEvents,
  } = useDecisionPersistence();

  const sortedEvents = useMemo(
    () => sortDecisionEvents(decisionEvents),
    [decisionEvents],
  );
  const derivedSegments = useMemo(
    () => deriveSegments(sortedEvents),
    [sortedEvents],
  );
  const currentEvent = useMemo(
    () => getCurrentDecisionEvent(sortedEvents, sourceTimeMs),
    [sortedEvents, sourceTimeMs],
  );
  const currentState = currentEvent?.state;

  function setClampedSourceTime(nextValue: number) {
    setSourceTimeMs(Math.min(SOURCE_DURATION_MS, Math.max(0, nextValue)));
  }

  function addDecision(state: ProgramState) {
    createDecision(state, sourceTimeMs, note);
    setNote("");
  }

  function clearLocalDecisions() {
    if (window.confirm("Clear this browser's Studio Cut decision events?")) {
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal semantic multicam editor</p>
          <h1>Studio Cut</h1>
        </div>
        <div className="session-meta" aria-label="Project and persistence metadata">
          <span>{config.projectId}</span>
          <span>{config.branchId}</span>
          <span className={`persistence-badge ${status.mode}`}>
            {status.label}
          </span>
        </div>
      </header>

      <section className="prototype-notice" aria-label="Prototype public shell notice">
        <strong>Prototype / Public shell</strong>
        <span>
          This deployed editor is visible before the auth gate is added. Do not
          upload, paste, or reference real media, proxy paths, private podcast
          details, credentials, or personal recordings here yet.
        </span>
      </section>

      <main className="workspace">
        <section className="monitor-grid" aria-label="Source and program monitors">
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
          <ProgramMonitor
            sourceTimeMs={sourceTimeMs}
            currentEvent={currentEvent}
          />
        </section>

        <aside className="edit-panel" aria-label="Decision controls">
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
                <p>Fake synced timeline control</p>
              </div>
              <strong>{formatSourceTime(sourceTimeMs)}</strong>
            </div>
            <input
              className="source-slider"
              type="range"
              min={0}
              max={SOURCE_DURATION_MS}
              step={1000}
              value={sourceTimeMs}
              onChange={(event) => setClampedSourceTime(Number(event.target.value))}
              aria-label="Current source time"
            />
            <div className="time-row">
              <button
                type="button"
                onClick={() => setClampedSourceTime(sourceTimeMs - 10000)}
              >
                -10s
              </button>
              <label>
                Seconds
                <input
                  type="number"
                  min={0}
                  max={SOURCE_DURATION_MS / 1000}
                  value={Math.round(sourceTimeMs / 1000)}
                  onChange={(event) =>
                    setClampedSourceTime(Number(event.target.value) * 1000)
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => setClampedSourceTime(sourceTimeMs + 10000)}
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
              onJump={setClampedSourceTime}
              onRemove={removeDecision}
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
    </div>
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
