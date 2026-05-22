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

export const SOURCE_ROLES: readonly SourceRole[] = [
  "homer",
  "charlie",
  "clip",
  "program",
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

export function isProgramState(value: unknown): value is ProgramState {
  return PROGRAM_STATES.includes(value as ProgramState);
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

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isFiniteNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFinitePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
