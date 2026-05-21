import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  PROGRAM_STATE_LABELS,
  PROGRAM_STATES,
  SOURCE_ROLE_LABELS,
  type DecisionEvent,
  type DerivedSegment,
  type ProgramState,
  type SourceRole,
} from "@high-ground/studio-cut-schema";

const STORAGE_KEY = "high-ground-studio.studio-cut.decisions.v1";
const LOCAL_PROJECT_ID = "studio-cut-local-project";
const LOCAL_BRANCH_ID = "local-main";
const LOCAL_CREATED_BY = "local-web-editor";
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
  const [decisionEvents, setDecisionEvents] = useState<DecisionEvent[]>(
    loadStoredDecisions,
  );

  const sortedEvents = useMemo(
    () => sortDecisionEvents(decisionEvents),
    [decisionEvents],
  );
  const derivedSegments = useMemo(
    () => deriveSegments(sortedEvents),
    [sortedEvents],
  );
  const currentEvent = useMemo(
    () => getCurrentEvent(sortedEvents, sourceTimeMs),
    [sortedEvents, sourceTimeMs],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decisionEvents));
  }, [decisionEvents]);

  const currentState = currentEvent?.state;

  function setClampedSourceTime(nextValue: number) {
    setSourceTimeMs(Math.min(SOURCE_DURATION_MS, Math.max(0, nextValue)));
  }

  function addDecision(state: ProgramState) {
    const createdAt = new Date().toISOString();
    const trimmedNote = note.trim();
    const event: DecisionEvent = {
      id: createDecisionId(),
      projectId: LOCAL_PROJECT_ID,
      branchId: LOCAL_BRANCH_ID,
      sourceTimeMs,
      state,
      createdBy: LOCAL_CREATED_BY,
      createdAt,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };

    setDecisionEvents((events) => [...events, event]);
    setNote("");
  }

  function removeDecision(eventId: string) {
    setDecisionEvents((events) => events.filter((event) => event.id !== eventId));
  }

  function clearDecisions() {
    if (window.confirm("Clear all local Studio Cut decision events?")) {
      setDecisionEvents([]);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal semantic multicam editor</p>
          <h1>Studio Cut</h1>
        </div>
        <div className="session-meta" aria-label="Local project metadata">
          <span>{LOCAL_PROJECT_ID}</span>
          <span>{LOCAL_BRANCH_ID}</span>
        </div>
      </header>

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
              <button type="button" onClick={() => setClampedSourceTime(sourceTimeMs - 10000)}>
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
              <button type="button" onClick={() => setClampedSourceTime(sourceTimeMs + 10000)}>
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
                  className={`state-button${currentState === state ? " is-current" : ""}`}
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
                <p>{sortedEvents.length} local event{sortedEvents.length === 1 ? "" : "s"}</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={clearDecisions}
                disabled={sortedEvents.length === 0}
              >
                Clear
              </button>
            </div>
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
    return <EmptyState text="No local decisions yet." />;
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
            <tr key={event.id} className={event.id === currentEventId ? "is-current-row" : ""}>
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
                    Remove
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

function deriveSegments(events: DecisionEvent[]): DerivedSegment[] {
  return events.map((event, index) => {
    const nextEvent = events[index + 1];
    return {
      startSourceTimeMs: event.sourceTimeMs,
      ...(nextEvent ? { endSourceTimeMs: nextEvent.sourceTimeMs } : {}),
      state: event.state,
      sourceEventId: event.id,
    };
  });
}

function getCurrentEvent(events: DecisionEvent[], sourceTimeMs: number) {
  let currentEvent: DecisionEvent | undefined;

  for (const event of events) {
    if (event.sourceTimeMs <= sourceTimeMs) {
      currentEvent = event;
      continue;
    }

    break;
  }

  return currentEvent;
}

function sortDecisionEvents(events: DecisionEvent[]) {
  return [...events].sort(
    (left, right) =>
      left.sourceTimeMs - right.sourceTimeMs ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
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
    return state === "charlie" || state === "both" || state === "charlie_clip" || state === "both_clip";
  }

  return state === "homer" || state === "both" || state === "homer_clip" || state === "both_clip";
}

function formatSourceTime(sourceTimeMs: number) {
  const totalSeconds = Math.floor(sourceTimeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const paddedSeconds = String(seconds).padStart(2, "0");

  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

function createDecisionId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `decision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function loadStoredDecisions() {
  const rawValue = localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(isDecisionEvent);
  } catch {
    return [];
  }
}

function isDecisionEvent(value: unknown): value is DecisionEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<DecisionEvent>;

  return (
    typeof event.id === "string" &&
    typeof event.projectId === "string" &&
    typeof event.branchId === "string" &&
    typeof event.sourceTimeMs === "number" &&
    Number.isFinite(event.sourceTimeMs) &&
    isProgramState(event.state) &&
    typeof event.createdBy === "string" &&
    typeof event.createdAt === "string" &&
    (event.note === undefined || typeof event.note === "string")
  );
}

function isProgramState(value: unknown): value is ProgramState {
  return PROGRAM_STATES.includes(value as ProgramState);
}
